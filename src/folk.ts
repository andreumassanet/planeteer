import * as THREE from 'three';
import { AVATAR_HEIGHT } from './avatar.ts';
import { OUTFITS, castMaterial, foldLegs, limbsOf, loadCast, reachArms } from './cast.ts';
import { bakeSkin } from './models.ts';
import type { Cast, ClipName, OutfitId, Paint, Person, SlotStat } from './cast.ts';
import { tone } from './monuments/contract.ts';
import type { MonumentContext } from './monuments/contract.ts';
import { PALETTE } from './theme.ts';
import { lookFor } from './scenery/dress.ts';
import { rngFrom } from './scenery/random.ts';

/**
 * The people of the world, dressed and set moving: the cast (`cast.ts`) worn
 * the way each region dresses, standing in its towns and walking its verges.
 *
 * ## Who someone is still comes from `dress.ts`
 *
 * The wardrobe tables were written for the code-built crowd and they are still
 * right: clothing is regional, appearance is not, and the two are separate draws
 * from one seed. What changed is what the colours go onto. A `Look` names a
 * skin, a hair colour, a top, a bottom, shoes and one bright thing; the cast's
 * outfits name their materials `Purple`, `Worker_Vest`, `LightBrown`. So an
 * outfit's materials are sorted into those roles by what they are *on* — the
 * one with the most surface above the waist is the top, the one with the most
 * below is the bottom, anything on a foot is a shoe — and everything smaller
 * keeps the pack's own colour, because a tie, an earring and a hard hat are the
 * details that make an outfit that outfit.
 *
 * ## Standing people are not statues any more
 *
 * Until 2026-09-16 a town's people were merged into its own buffer: one draw
 * call for fourteen of them, and fourteen people who never moved. A person here
 * is a skinned mesh playing a relaxed idle, and now and then a gesture. That
 * costs a draw call each, so they are streamed like everything else — only the
 * nearest `TOWNSFOLK_CAP`, only inside `TOWNSFOLK_RADIUS` — and a town beyond
 * that has nobody visible in it, which at the distance where that happens is a
 * person a few pixels tall.
 */

/**
 * Skin, as the cast wears it. `dress.ts`'s ramp is the right set of people and
 * one of its entries is the wrong colour here: `tan` goes olive on a large
 * smooth face under the blue fill light, where it was a few pixels of prism
 * before. It is swapped for a warm tone of the same weight; the others stand.
 */
const SKIN = new Map<number, number>([[PALETTE.tan, tone(PALETTE.apricot, 0.8)]]);

/** Whether two colours are close enough to read as one at a distance. */
function near(a: number, b: number): boolean {
  const d = (shift: number) => (((a >> shift) & 255) - ((b >> shift) & 255)) / 255;
  return Math.hypot(d(16), d(8), d(0)) < 0.2;
}

/** Below this height, in the pack's metres, a material is on the legs. */
const WAIST = 0.9;

export interface Folk {
  /** False until the cast has loaded; nobody is dressed before that. */
  readonly ready: boolean;
  /** A person of `region`, the same person for the same `key` every time. */
  dress(key: string, region: string, warmth?: number, height?: number): Person | null;
  /** Gives a person back to be dressed again; see `Cast.release`. */
  release(person: Person): void;
  /**
   * A person of `region` held seated, as a still mesh `height` tall: hips at
   * the origin, facing +Z, thighs along `thigh` and shins along `shin`, hands
   * at `grip` when there is one (a point, hips at the origin). Painted, inked
   * along its own `outlineNormal`, and ready to merge into a vehicle — a rider
   * rides still, so a rider is one frame of a cast character baked into the
   * vehicle's buffer. `null` until the cast has loaded.
   */
  seated(key: string, region: string, height: number, pose: SeatPose): THREE.Mesh | null;
}

export interface SeatPose {
  thigh: THREE.Vector3;
  shin: THREE.Vector3;
  grip?: THREE.Vector3;
}

/** Marks a mesh whose colours are its vertices' for the flatteners; it is never drawn. */
const PAINTED_MERGE = new THREE.MeshBasicMaterial();
PAINTED_MERGE.userData.atlasPainted = true;
PAINTED_MERGE.userData.atlasToon = PALETTE.white;

/** How tall an adult of the cast is drawn, either side of the hero. */
const ADULT_HEIGHT: readonly [number, number] = [AVATAR_HEIGHT * 0.9, AVATAR_HEIGHT * 1.08];

/**
 * How tall a child is, and how many of the people dressed are children.
 *
 * The cast has no children and an adult drawn smaller is not one, so a child
 * is an adult outfit at 0.62 of the hero's height with a head `YOUNG_HEAD`
 * times its own: about five and a half heads. Never a rider: a person held
 * seated is asked for at an adult's height.
 */
const YOUNG_HEIGHT = AVATAR_HEIGHT * 0.62;
const YOUNG_SHARE = 0.14;

export function createFolk(ctx: MonumentContext): Folk {
  let cast: Cast | null = null;
  const source = ctx.toon(ctx.palette.ink);
  const ink = source.userData.outlineParameters as { thickness: number; color: [number, number, number] };
  loadCast(castMaterial(source.gradientMap!, ink))
    .then((loaded) => {
      cast = loaded;
    })
    .catch((error: unknown) => console.warn('folk: the cast did not load', error));

  const roles = new Map<OutfitId, { top: string | null; bottom: string | null }>();
  const rolesOf = (outfit: OutfitId, stats: readonly SlotStat[]) => {
    let found = roles.get(outfit);
    if (found !== undefined) return found;
    const garments = stats.filter(
      (stat) => stat.vertices > 0 && !/@feet$|^Skin|^Hair|^Eyebrows|^Moustache|^Eye$/.test(stat.name),
    );
    const largest = (list: SlotStat[]) =>
      list.length === 0 ? null : list.reduce((a, b) => (b.vertices > a.vertices ? b : a)).name;
    found = {
      top: largest(garments.filter((stat) => stat.meanY >= WAIST)),
      bottom: largest(garments.filter((stat) => stat.meanY < WAIST)),
    };
    roles.set(outfit, found);
    return found;
  };

  return {
    get ready() {
      return cast !== null;
    },
    release(person) {
      cast?.release(person);
    },
    seated(key, region, height, pose) {
      const person = this.dress(key, region, undefined, height);
      if (person === null) return null;
      const frame = new THREE.Group();
      frame.add(person.root);
      const limbs = limbsOf(person);
      const idle = person.actions.get('Idle_Neutral')!;
      idle.play();
      person.mixer.setTime(0.5);
      foldLegs(limbs, frame, pose.thigh, pose.shin);
      if (pose.grip !== undefined) {
        frame.updateMatrixWorld(true);
        const hip = frame.worldToLocal(limbs.hips.getWorldPosition(new THREE.Vector3()));
        reachArms(limbs, frame, pose.grip.clone().add(hip));
      }
      frame.updateMatrixWorld(true);
      const hip = frame.worldToLocal(limbs.hips.getWorldPosition(new THREE.Vector3()));
      person.root.position.sub(hip);
      const geometry = bakeSkin(person.mesh, frame);
      frame.remove(person.root);
      this.release(person);
      const mesh = new THREE.Mesh(geometry, PAINTED_MERGE);
      mesh.name = `rider:${key}`;
      return mesh;
    },
    dress(key, region, warmth, tall) {
      if (cast === null) return null;
      const young = tall === undefined && rngFrom(key, 'age').chance(YOUNG_SHARE);
      const look = lookFor(rngFrom(key, 'folk'), region, {
        ...(warmth === undefined ? {} : { warmth }),
        ...(young ? { age: 'child' as const } : {}),
      });
      const pick = rngFrom(key, 'outfit');
      const outfit = OUTFITS[pick.int(OUTFITS.length)]!;
      const { top, bottom } = rolesOf(outfit, cast.slotsOf(outfit));
      const skin = SKIN.get(look.skin) ?? look.skin;
      // A top the colour of the skin under it reads as a bare body at forty
      // units; the wardrobe tables were written for bodies where it did not.
      const top_ = near(look.top, skin) ? look.accent : look.top;
      const bottom_ = near(look.bottom, skin) ? look.trim : look.bottom;
      const paint: Paint = (name) => {
        if (name.endsWith('@feet')) return look.trim;
        if (name.startsWith('Skin')) return skin;
        // A child has no beard to paint, and the outfit may: it goes skin.
        if (young && /^(Moustache|Beard)/.test(name)) return skin;
        if (/^(Hair|Eyebrows|Moustache)/.test(name)) return look.hairColor;
        if (name === 'Eye') return ctx.palette.ink;
        if (name === top) return top_;
        if (name === bottom) return bottom_;
        return null;
      };
      const height = young ? YOUNG_HEIGHT : THREE.MathUtils.clamp(look.height, ADULT_HEIGHT[0], ADULT_HEIGHT[1]);
      return cast.make(outfit, paint, tall ?? height, young);
    },
  };
}

// ---------------------------------------------------------------------------
// The townsfolk
// ---------------------------------------------------------------------------

/** Where somebody stands, as the settlements publish it. */
export interface FolkAnchor {
  key: string;
  region: string;
  warmth: number;
  position: THREE.Vector3;
  /** The town's frame turned by this person's yaw: +Y is up, +Z is the way they face. */
  quaternion: THREE.Quaternion;
  distance: number;
}

export interface FolkSource {
  /** Every standing person inside `radius` of `viewer`, appended to `out`. */
  folkNear(viewer: THREE.Vector3, radius: number, out: FolkAnchor[]): void;
}

/** How far from the player people are standing. Past this a person is a few pixels tall. */
const TOWNSFOLK_RADIUS = 240;
/** How many at once. Each is one skinned draw, twice with the ink. */
const TOWNSFOLK_CAP = 40;
/** How many are dressed in one frame, so walking into a square is not a hitch. */
const DRESS_PER_FRAME = 3;
/** Past this, a person's clip is advanced every few frames rather than every one. */
const NEAR_ANIMATION = 90;

interface Standing {
  anchor: FolkAnchor;
  holder: THREE.Group;
  person: Person;
  base: THREE.AnimationAction;
  gesture: THREE.AnimationAction | null;
  gestureAt: number;
  nextGesture: number;
  owed: number;
  /** Which of the far frames this person animates on, so they do not all land on one. */
  lane: number;
}

export interface Townsfolk {
  group: THREE.Group;
  update(viewer: THREE.Vector3, dt: number, clock: number, frame: number): void;
  readonly stats: { standing: number; animated: number };
}

export function createTownsfolk(folk: Folk, source: FolkSource): Townsfolk {
  const group = new THREE.Group();
  group.name = 'townsfolk';
  const standing = new Map<string, Standing>();
  const anchors: FolkAnchor[] = [];
  const stats = { standing: 0, animated: 0 };

  const hash = (key: string, salt: string) => rngFrom(key, salt).unit();

  function release(entry: Standing): void {
    group.remove(entry.holder);
    // Back to the cast's pool, not disposed: see `Cast.release`.
    folk.release(entry.person);
    standing.delete(entry.anchor.key);
  }

  function dress(anchor: FolkAnchor, clock: number): Standing | null {
    const person = folk.dress(anchor.key, anchor.region, anchor.warmth);
    if (person === null) return null;
    const holder = new THREE.Group();
    holder.add(person.root);
    group.add(holder);
    // Mostly the relaxed idle; some stand ready, the way people waiting do.
    const base = person.actions.get(hash(anchor.key, 'stance') < 0.7 ? 'Idle_Neutral' : 'Idle')!;
    base.play();
    // Out of step with each other, or a square breathes in unison.
    base.time = hash(anchor.key, 'phase') * base.getClip().duration;
    base.timeScale = 0.85 + hash(anchor.key, 'rate') * 0.3;
    return {
      anchor,
      holder,
      person,
      base,
      gesture: null,
      gestureAt: 0,
      nextGesture: clock + 3 + hash(anchor.key, 'first') * 14,
      owed: 0,
      lane: Math.floor(hash(anchor.key, 'lane') * 4),
    };
  }

  const GESTURES: readonly ClipName[] = ['Interact', 'Wave'];

  /** A gesture fades in over a quarter second and out over the last third of one. */
  function animate(entry: Standing, dt: number, clock: number): void {
    const { person, base } = entry;
    if (entry.gesture === null && clock >= entry.nextGesture) {
      const which = GESTURES[Math.floor(hash(entry.anchor.key, `g${Math.floor(clock)}`) * GESTURES.length)]!;
      entry.gesture = person.actions.get(which)!;
      entry.gesture.reset().play();
      entry.gesture.timeScale = 0;
      entry.gestureAt = clock;
    }
    if (entry.gesture !== null) {
      const duration = entry.gesture.getClip().duration;
      const t = clock - entry.gestureAt;
      if (t >= duration) {
        entry.gesture.stop();
        entry.gesture = null;
        base.setEffectiveWeight(1);
        entry.nextGesture = clock + 8 + hash(entry.anchor.key, `n${Math.floor(clock)}`) * 20;
      } else {
        const w = THREE.MathUtils.smoothstep(t, 0, 0.25) * (1 - THREE.MathUtils.smoothstep(t, duration - 0.3, duration));
        entry.gesture.time = t;
        entry.gesture.setEffectiveWeight(w);
        base.setEffectiveWeight(1 - w);
      }
    }
    person.mixer.update(dt);
  }

  return {
    group,
    stats,
    update(viewer, dt, clock, frame) {
      if (!folk.ready) return;
      anchors.length = 0;
      source.folkNear(viewer, TOWNSFOLK_RADIUS, anchors);
      anchors.sort((a, b) => a.distance - b.distance);
      const wanted = anchors.slice(0, TOWNSFOLK_CAP);
      const keep = new Set(wanted.map((anchor) => anchor.key));
      for (const entry of [...standing.values()]) if (!keep.has(entry.anchor.key)) release(entry);

      let dressed = 0;
      stats.animated = 0;
      for (const anchor of wanted) {
        let entry = standing.get(anchor.key);
        if (entry === undefined) {
          if (dressed >= DRESS_PER_FRAME) continue;
          const made = dress(anchor, clock);
          if (made === null) continue;
          entry = made;
          standing.set(anchor.key, entry);
          dressed++;
        }
        entry.anchor = anchor;
        entry.holder.position.copy(anchor.position);
        entry.holder.quaternion.copy(anchor.quaternion);
        // Near people move every frame; far ones catch up every fourth, with the
        // time they missed, so a far square is not slower, only coarser.
        entry.owed += dt;
        const stride = anchor.distance < NEAR_ANIMATION ? 1 : 4;
        if ((frame + entry.lane) % stride === 0) {
          animate(entry, entry.owed, clock);
          entry.owed = 0;
          stats.animated++;
        }
      }
      stats.standing = standing.size;
    },
  };
}
