import * as THREE from 'three';
import { AVATAR_HEIGHT, FIGURE, WALK_SPEED, WALK_STRIDE } from './avatar.ts';
import { OUTFITS, castMaterial, castSkin, foldLegs, limbsOf, loadCast, paintWith, reachArms } from './cast.ts';
import { bakeSkin } from './models.ts';
import type { Cast, ClipName, Person } from './cast.ts';
import type { MonumentContext } from './monuments/contract.ts';
import { coloursOf, wardrobeOf } from './appearance.ts';
import type { Appearance } from './appearance.ts';
import { PALETTE } from './theme.ts';
import { lookFor } from './scenery/dress.ts';
import { rngFrom } from './scenery/random.ts';
import { frameOpenFor } from './view.ts';

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
 * outfits name their materials `Purple`, `Worker_Vest`, `LightBrown`. So every
 * surface of every outfit has a role (`roleOf` in `cast.ts`, a table read off
 * the pack) — the hoodie is the top, the jeans the bottom, the trainers the
 * shoes — and the look's colours go onto the roles, while a tie, an earring
 * and a hard hat keep their own colour moved onto the palette, because those
 * are the details that make an outfit that outfit. The traveller's card dresses
 * the hero with the same roles (`paintWith`), and `wear` dresses another player
 * as they chose to look.
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
 *
 * ## And not all of them stand
 *
 * The town publishes, with each spot, the stretch of its own street a person
 * there may walk (`Ground.folk` in `settlements.ts`): one terrace level, off
 * the steps, clear of the car parked on it. Most who have one stroll it end to
 * end and back, easing off and pulling up and pausing at each end, on the
 * hero's own stride (`WALK_STRIDE`: the cycle is driven by the distance
 * walked, as the verge walkers' is); some stand in pairs turned to each
 * other, talking by turns — the library's talking idle for the one speaking,
 * a gesture now and then from the one listening; the rest stand, in one of
 * three idles, and glance at the player as he passes. Everything that decides
 * who does which is seeded by the person's key. They are solid (`collide`, a
 * body `PERSON_RADIUS` wide), and one of them at a time can be held in
 * conversation (`engage`), which stops them, turns them to face the player,
 * and has them wave and then talk; `talk.ts` says the words.
 */

/** Whether two colours are close enough to read as one at a distance. */
function near(a: number, b: number): boolean {
  const d = (shift: number) => (((a >> shift) & 255) - ((b >> shift) & 255)) / 255;
  return Math.hypot(d(16), d(8), d(0)) < 0.2;
}

export interface Folk {
  /** False until the cast has loaded; nobody is dressed before that. */
  readonly ready: boolean;
  /** A person of `region`, the same person for the same `key` every time. */
  dress(key: string, region: string, warmth?: number, height?: number): Person | null;
  /**
   * A traveller as they chose to look (`appearance.ts`): another player, at
   * `height`. `null` until the cast has loaded.
   */
  wear(appearance: Appearance, height: number): Person | null;
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

/**
 * Whether the townsperson `key` is dressed as a child: the one draw `dress`
 * makes, so a conversation (`talk.ts`) knows a child from the same key.
 */
export const isYoung = (key: string): boolean => rngFrom(key, 'age').chance(YOUNG_SHARE);

/** The outfit `dress` puts the person `key` in: one draw, shared with `isWoman`. */
const outfitOf = (key: string): (typeof OUTFITS)[number] => OUTFITS[rngFrom(key, 'outfit').int(OUTFITS.length)]!;

/** Whether the townsperson `key` is dressed as a woman, which is the range their voice is drawn from. */
export const isWoman = (key: string): boolean => outfitOf(key).startsWith('woman');

export function createFolk(ctx: MonumentContext): Folk {
  let cast: Cast | null = null;
  const source = ctx.toon(ctx.palette.ink);
  const ink = source.userData.outlineParameters as { thickness: number; color: [number, number, number] };
  loadCast(castMaterial(source.gradientMap!, ink))
    .then((loaded) => {
      cast = loaded;
    })
    .catch((error: unknown) => console.warn('folk: the cast did not load', error));

  return {
    get ready() {
      return cast !== null;
    },
    release(person) {
      cast?.release(person);
    },
    wear(appearance, height) {
      if (cast === null) return null;
      return cast.make(wardrobeOf(appearance), paintWith(coloursOf(appearance)), height);
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
      const young = tall === undefined && isYoung(key);
      const look = lookFor(rngFrom(key, 'folk'), region, {
        ...(warmth === undefined ? {} : { warmth }),
        ...(young ? { age: 'child' as const } : {}),
      });
      const outfit = outfitOf(key);
      const skin = castSkin(look.skin);
      // A top the colour of the skin under it reads as a bare body at forty
      // units; the wardrobe tables were written for bodies where it did not.
      // Every surface of the outfit is coloured by what it is (`roleOf` in
      // `cast.ts`): the garments by the look, a tie or a hard hat on the palette.
      const paint = paintWith({
        skin,
        hair: look.hairColor,
        eye: ctx.palette.ink,
        top: near(look.top, skin) ? look.accent : look.top,
        bottom: near(look.bottom, skin) ? look.trim : look.bottom,
        shoes: look.trim,
        pack: look.accent,
        young,
      });
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
  /**
   * The two ends of the stretch of their own street this person may stroll
   * along, in world space: level, off the steps, clear of the parked car. Both
   * are `position` where there is no room to walk.
   */
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** One of a pair standing talking, `quaternion` turned to face the other. */
  chatting: boolean;
  /** The town's own frame, with no yaw: what a person is turned in. */
  town: THREE.Quaternion;
  distance: number;
}

export interface FolkSource {
  /** Every standing person inside `radius` of `viewer`, appended to `out`. */
  folkNear(viewer: THREE.Vector3, radius: number, out: FolkAnchor[]): void;
}

/** Somebody the player could talk to: `Townsfolk.nearest`'s answer, one reused object. */
export interface Talker {
  key: string;
  /** Where their feet are now, in world space. Live while they stand. */
  position: THREE.Vector3;
  /** How tall they were dressed. */
  height: number;
  /** From the point asked about, along the ground. */
  distance: number;
}

/** How far from the player people are standing. Past this a person is a few pixels tall. */
const TOWNSFOLK_RADIUS = 110;
/** How many at once. Each is one skinned draw, twice with the ink. */
const TOWNSFOLK_CAP = 40;
/** How many are dressed in one frame, so walking into a square is not a hitch. */
const DRESS_PER_FRAME = 3;
/** Past this, a person's clip is advanced every few frames rather than every one. */
const NEAR_ANIMATION = 40;

/**
 * How wide a standing person is to a body that walks into them: the hero's
 * own shoulders, `FIGURE.shoulderHalf`, which is also the clearance the town
 * keeps them off its steps by.
 */
export const PERSON_RADIUS = FIGURE.shoulderHalf;
/** How many of the people who have a stretch of street to walk actually walk it. */
const STROLL_SHARE = 0.6;
/** A stroll is slower than the hero's walk, and on the same stride: see `WALK_STRIDE`. */
const STROLL_PACE: readonly [number, number] = [0.6, 0.85];
/** Seconds a stroller stands at each end before turning back. */
const STROLL_PAUSE: readonly [number, number] = [2, 9];
/** Radians a second a person turns: a quarter turn in about a third of a second. */
const TURN_RATE = 4.5;
/** Seconds a walk and a stand take to cross-fade. */
const BLEND_TIME = 0.25;
/**
 * A stroller sets off and pulls up rather than starting and stopping dead:
 * the pace follows what is wanted at `STROLL_EASE` a second, and slows over
 * the last `STROLL_SLOWING` units of the stretch to `STROLL_ARRIVE` of itself.
 * The walk's weight follows the pace, and its cycle the distance, so the feet
 * keep time with the ground all the way down to a stop.
 */
const STROLL_EASE = 3;
const STROLL_SLOWING = AVATAR_HEIGHT * 0.8;
const STROLL_ARRIVE = 0.35;
/**
 * Which idle a standing person breathes to: mostly the relaxed one, some the
 * ready stance, some with their weight on one leg (the library's second idle),
 * by these shares.
 */
const STANCES: readonly [ClipName, number][] = [
  ['Idle_Neutral', 0.6],
  ['Idle', 0.2],
  ['Idle_Shift', 0.2],
];
/**
 * Talking is the library's talking idle, hands and all, faded in over
 * `TALK_BLEND` seconds: all the while somebody is held in conversation by the
 * player, and by turns in a pair talking to each other, each of the two
 * speaking for `TALK_TURN` seconds and listening for as long.
 */
const TALK_BLEND = 0.6;
const TALK_TURN: readonly [number, number] = [3, 7];
/**
 * Inside this a person not otherwise busy turns their head to the player,
 * as far as `GLANCE_LIMIT` either side of where their body faces.
 */
const GLANCE_REACH = AVATAR_HEIGHT * 3;
const GLANCE_LIMIT = 1.1;

const AXIS_UP = new THREE.Vector3(0, 1, 0);

type Mode = 'stand' | 'stroll' | 'chat';

interface Standing {
  anchor: FolkAnchor;
  holder: THREE.Group;
  person: Person;
  mode: Mode;
  base: THREE.AnimationAction;
  walk: THREE.AnimationAction;
  talk: THREE.AnimationAction;
  /** How much of the standing pose is the talking one, 0 to 1. */
  talking: number;
  gesture: THREE.AnimationAction | null;
  gestureAt: number;
  nextGesture: number;
  owed: number;
  /** Which of the far frames this person animates on, so they do not all land on one. */
  lane: number;
  /** Where the feet are now, in world space. */
  position: THREE.Vector3;
  /** The yaw the body has and the one it is turning to, in the town's frame. */
  yaw: number;
  targetYaw: number;
  /** The yaw a standing or talking person turns back to when nothing else asks. */
  restYaw: number;
  /** A stroll: how far along `from -> to` (0 to 1), which way, and the length. */
  along: number;
  heading: 1 | -1;
  length: number;
  speed: number;
  /** The pace now, eased towards `speed` setting off and away from it pulling up. */
  pace: number;
  /** The yaw of `from -> to` in the town's frame. */
  strollYaw: number;
  /** Seconds left standing at the end of a stretch. */
  pause: number;
  /** A pair's turn at speaking, in seconds, and where in the turns this one starts; drawn once. */
  turnLength: number;
  speaksAt: number;
  /** How far into the walk cycle, 0 to 1, driven by the distance walked. */
  phase: number;
  /** How much of the walk is showing, 0 to 1. */
  walking: number;
  /** The head, for a glance, and its pose before the glance was put on it. */
  head: THREE.Bone | null;
  headRest: THREE.Quaternion;
  glance: number;
  /** Held in conversation by the player: stands, and faces them. */
  held: boolean;
  turns: number;
}

export interface Townsfolk {
  group: THREE.Group;
  update(viewer: THREE.Vector3, dt: number, clock: number, frame: number): void;
  /**
   * Adds to `push` the displacement along the ground that takes a body of
   * `radius` at `point` out of every standing person it overlaps, and says
   * whether it touched anybody. Only the dressed are solid: nobody further
   * than `TOWNSFOLK_RADIUS` is standing at all.
   */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** The nearest standing person within `reach` of `point`, or null. One reused object. */
  nearest(point: THREE.Vector3, reach: number): Talker | null;
  /**
   * Holds `key` in conversation — they stop, wave, and turn to face `towards`
   * each frame — or lets whoever was held go, with null. False when `key` is
   * not standing.
   */
  engage(key: string | null, towards?: THREE.Vector3): boolean;
  /** Where a standing person's crown is, written into `out`; false if they are not standing. */
  crownOf(key: string, out: THREE.Vector3): boolean;
  /**
   * `nearestMoving` is how far from the viewer the nearest person in the
   * middle of a gesture, a stroll or a sentence stands, or Infinity: `main.ts` redraws
   * the shadow map every frame while it is inside the box. An idle stance is
   * not counted — breathing moves a shadow by less than one of the map's
   * 0.29-unit texels.
   */
  readonly stats: { standing: number; animated: number; strolling: number; nearestMoving: number };
}

/** The shortest signed turn from `from` to `to`, in (-PI, PI]. */
function turnBetween(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function createTownsfolk(folk: Folk, source: FolkSource): Townsfolk {
  const group = new THREE.Group();
  group.name = 'townsfolk';
  const standing = new Map<string, Standing>();
  const anchors: FolkAnchor[] = [];
  const keep = new Set<string>();
  const byDistance = (a: FolkAnchor, b: FolkAnchor): number => a.distance - b.distance;
  const stats = { standing: 0, animated: 0, strolling: 0, nearestMoving: Infinity };
  let heldKey: string | null = null;
  const holdTowards = new THREE.Vector3();
  let viewerAt = new THREE.Vector3();
  /** The clock of the last update, for a gesture started between two. */
  let now = 0;

  const hash = (key: string, salt: string) => rngFrom(key, salt).unit();

  // Scratch, so nothing in the frame allocates.
  const inverse = new THREE.Quaternion();
  const local = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const upAxis = new THREE.Vector3();
  const parentTurn = new THREE.Quaternion();
  const ahead = new THREE.Vector3();
  const gap = new THREE.Vector3();
  const talker: Talker = { key: '', position: new THREE.Vector3(), height: 0, distance: 0 };

  /** The yaw, in the person's town frame, that faces a world point. */
  function yawTowards(entry: Standing, point: THREE.Vector3): number {
    inverse.copy(entry.anchor.town).invert();
    local.copy(point).sub(entry.position).applyQuaternion(inverse);
    return Math.atan2(local.x, local.z);
  }

  function release(entry: Standing): void {
    group.remove(entry.holder);
    if (entry.head !== null) entry.head.quaternion.copy(entry.headRest);
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
    // Mostly the relaxed idle; some stand ready, the way people waiting do,
    // and some with their weight on one leg.
    let pick = hash(anchor.key, 'stance');
    let stance: ClipName = STANCES[0]![0];
    for (const [clip, share] of STANCES) {
      stance = clip;
      if ((pick -= share) < 0) break;
    }
    const base = person.actions.get(stance)!;
    base.play();
    // Every action a pooled person comes back with is at a time scale of one
    // and full weight (`Cast.release`): each is set here before it plays.
    base.setEffectiveWeight(1);
    // Out of step with each other, or a square breathes in unison.
    base.time = hash(anchor.key, 'phase') * base.getClip().duration;
    base.timeScale = 0.85 + hash(anchor.key, 'rate') * 0.3;
    // The walk is driven by distance, as the hero's and the verge walkers'
    // are, so it is played held and its time is written each frame.
    const walk = person.actions.get('Walk')!;
    walk.play();
    walk.timeScale = 0;
    walk.setEffectiveWeight(0);
    const talk = person.actions.get('Talk')!;
    talk.play();
    talk.setEffectiveWeight(0);
    talk.time = hash(anchor.key, 'talk') * talk.getClip().duration;
    talk.timeScale = 0.9 + hash(anchor.key, 'talk-rate') * 0.2;
    const length = anchor.from.distanceTo(anchor.to);
    const mode: Mode = anchor.chatting
      ? 'chat'
      : length > 1 && hash(anchor.key, 'strolls') < STROLL_SHARE
        ? 'stroll'
        : 'stand';
    // The anchor's yaw, read back out of its quaternion in the town's frame.
    local.set(0, 0, 1).applyQuaternion(anchor.quaternion).applyQuaternion(inverse.copy(anchor.town).invert());
    const yaw = Math.atan2(local.x, local.z);
    local.copy(anchor.to).sub(anchor.from).applyQuaternion(inverse);
    const strollYaw = Math.atan2(local.x, local.z);
    const head = person.bones.get('Head') ?? null;
    const entry: Standing = {
      anchor,
      holder,
      person,
      mode,
      base,
      walk,
      talk,
      talking: 0,
      gesture: null,
      gestureAt: 0,
      nextGesture: clock + (mode === 'chat' ? 1 : 3) + hash(anchor.key, 'first') * (mode === 'chat' ? 5 : 14),
      owed: 0,
      lane: Math.floor(hash(anchor.key, 'lane') * 4),
      position: anchor.position.clone(),
      yaw,
      targetYaw: yaw,
      restYaw: yaw,
      along: length > 1e-6 ? THREE.MathUtils.clamp(anchor.from.distanceTo(anchor.position) / length, 0, 1) : 0,
      heading: hash(anchor.key, 'heading') < 0.5 ? 1 : -1,
      length,
      speed: WALK_SPEED * THREE.MathUtils.lerp(STROLL_PACE[0], STROLL_PACE[1], hash(anchor.key, 'pace')),
      pace: 0,
      strollYaw,
      pause: hash(anchor.key, 'pause') * STROLL_PAUSE[1],
      turnLength: THREE.MathUtils.lerp(TALK_TURN[0], TALK_TURN[1], hash(anchor.key, 'turn')),
      speaksAt: hash(anchor.key, 'speaks') * 2,
      phase: hash(anchor.key, 'stride'),
      walking: 0,
      head,
      headRest: head === null ? new THREE.Quaternion() : head.quaternion.clone(),
      glance: 0,
      held: false,
      turns: 0,
    };
    place(entry);
    return entry;
  }

  /** The holder where the entry says: its position, and its yaw in its town's frame. */
  function place(entry: Standing): void {
    entry.holder.position.copy(entry.position);
    turn.setFromAxisAngle(AXIS_UP, entry.yaw);
    entry.holder.quaternion.copy(entry.anchor.town).multiply(turn);
  }

  /**
   * One step of a stroll: walk the stretch, stand at its end, turn, walk back.
   * Anybody in the way — the player — is waited for rather than walked through.
   */
  function stroll(entry: Standing, dt: number): boolean {
    const { anchor } = entry;
    if (entry.held) {
      entry.pace = 0;
      return false;
    }
    if (entry.pause > 0) {
      entry.pace = 0;
      entry.pause -= dt;
      if (entry.pause <= 0) {
        entry.heading = entry.heading === 1 ? -1 : 1;
        entry.turns++;
      }
      entry.targetYaw = entry.heading === 1 ? entry.strollYaw : entry.strollYaw + Math.PI;
      return false;
    }
    entry.targetYaw = entry.heading === 1 ? entry.strollYaw : entry.strollYaw + Math.PI;
    // Not yet facing the way: turn on the spot first.
    if (Math.abs(turnBetween(entry.yaw, entry.targetYaw)) > 0.5) {
      entry.pace = 0;
      return false;
    }
    // Setting off, and pulling up over the last few steps of the stretch.
    const left = (entry.heading === 1 ? 1 - entry.along : entry.along) * entry.length;
    const wanted = entry.speed * THREE.MathUtils.clamp(left / STROLL_SLOWING, STROLL_ARRIVE, 1);
    entry.pace += (wanted - entry.pace) * (1 - Math.exp(-STROLL_EASE * dt));
    const step = (entry.pace * dt) / entry.length;
    let next = entry.along + step * entry.heading;
    // Somebody standing just ahead is waited for.
    ahead.lerpVectors(anchor.from, anchor.to, THREE.MathUtils.clamp(next, 0, 1));
    gap.copy(viewerAt).sub(ahead);
    if (gap.lengthSq() < (PERSON_RADIUS * 3) ** 2) {
      local.copy(anchor.to).sub(anchor.from).multiplyScalar(entry.heading);
      if (gap.dot(local) > 0) {
        entry.pace = 0;
        return false;
      }
    }
    if (next >= 1 || next <= 0) {
      next = THREE.MathUtils.clamp(next, 0, 1);
      entry.pause = THREE.MathUtils.lerp(STROLL_PAUSE[0], STROLL_PAUSE[1], hash(anchor.key, `p${entry.turns}`));
    }
    const moved = Math.abs(next - entry.along) * entry.length;
    entry.along = next;
    entry.position.lerpVectors(anchor.from, anchor.to, next);
    entry.phase = (entry.phase + moved / WALK_STRIDE) % 1;
    return moved > 0;
  }

  const GESTURES: readonly ClipName[] = ['Interact', 'Wave'];
  /** A pair talking gestures as they talk. */
  const TALKING: readonly ClipName[] = ['Interact', 'Interact', 'Wave'];

  function startGesture(entry: Standing, which: ClipName, clock: number): void {
    entry.gesture?.stop();
    entry.gesture = entry.person.actions.get(which)!;
    entry.gesture.reset().play();
    entry.gesture.timeScale = 0;
    entry.gestureAt = clock;
  }

  /** A gesture fades in over a quarter second and out over the last third of one. */
  function animate(entry: Standing, dt: number, clock: number, near: boolean): void {
    const { person, base, walk, talk } = entry;
    const moving = entry.mode === 'stroll' && stroll(entry, dt);
    // The walk shows as much as the pace is of a stroll, so a body easing to
    // a stop has its legs slowing with it rather than walking on the spot.
    const stepping = moving ? THREE.MathUtils.clamp(entry.pace / (entry.speed * 0.6), 0, 1) : 0;
    const d0 = stepping - entry.walking;
    entry.walking = THREE.MathUtils.clamp(entry.walking + Math.sign(d0) * Math.min(Math.abs(d0), dt / BLEND_TIME), 0, 1);
    // Talking: to the player while held, by turns in a pair.
    let speaking = entry.held;
    if (!speaking && entry.mode === 'chat') {
      speaking = Math.floor(clock / entry.turnLength + entry.speaksAt) % 2 === 0;
    }
    const t0 = (speaking ? 1 : 0) - entry.talking;
    entry.talking += Math.sign(t0) * Math.min(Math.abs(t0), dt / TALK_BLEND);
    // Turning, whoever is asking: the stroll's way, the partner, the player.
    if (entry.held) entry.targetYaw = yawTowards(entry, holdTowards);
    else if (entry.mode !== 'stroll') entry.targetYaw = entry.restYaw;
    const d = turnBetween(entry.yaw, entry.targetYaw);
    entry.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN_RATE * dt);
    place(entry);

    // A gesture is for a listener: a speaker's hands are already talking.
    if (entry.gesture === null && entry.walking === 0 && entry.talking < 0.5 && clock >= entry.nextGesture) {
      const list = entry.mode === 'chat' ? TALKING : GESTURES;
      startGesture(entry, list[Math.floor(hash(entry.anchor.key, `g${Math.floor(clock)}`) * list.length)]!, clock);
    }
    let g = 0;
    if (entry.gesture !== null) {
      const duration = entry.gesture.getClip().duration;
      const t = clock - entry.gestureAt;
      if (t >= duration || moving) {
        entry.gesture.stop();
        entry.gesture = null;
        const [rest, spread] = entry.mode === 'chat' ? [2, 6] : [8, 20];
        entry.nextGesture = clock + rest + hash(entry.anchor.key, `n${Math.floor(clock)}`) * spread;
      } else {
        g = THREE.MathUtils.smoothstep(t, 0, 0.25) * (1 - THREE.MathUtils.smoothstep(t, duration - 0.3, duration));
        entry.gesture.time = t;
        entry.gesture.setEffectiveWeight(g * (1 - entry.walking));
      }
    }
    walk.time = entry.phase * walk.getClip().duration;
    walk.setEffectiveWeight(entry.walking);
    base.setEffectiveWeight((1 - entry.walking) * (1 - g) * (1 - entry.talking));
    talk.setEffectiveWeight((1 - entry.walking) * (1 - g) * entry.talking);
    if (entry.head !== null) entry.head.quaternion.copy(entry.headRest);
    person.mixer.update(dt);
    if (entry.head === null) return;
    entry.headRest.copy(entry.head.quaternion);
    // A glance at the player, near and not otherwise busy: the head alone,
    // turned about the town's up, so the body keeps the way it was facing.
    let want = 0;
    if (near && !entry.held && entry.walking === 0 && entry.position.distanceToSquared(viewerAt) < GLANCE_REACH ** 2) {
      want = THREE.MathUtils.clamp(turnBetween(entry.yaw, yawTowards(entry, viewerAt)), -GLANCE_LIMIT, GLANCE_LIMIT);
    }
    const e = want - entry.glance;
    entry.glance += Math.sign(e) * Math.min(Math.abs(e), TURN_RATE * 0.5 * dt);
    if (Math.abs(entry.glance) < 1e-3) return;
    // The turn about the world's up, carried into the head's parent frame.
    const parent = entry.head.parent!;
    upAxis.set(0, 1, 0).applyQuaternion(entry.anchor.town);
    parent.getWorldQuaternion(parentTurn);
    turn.setFromAxisAngle(upAxis, entry.glance);
    // parent^-1 * turn * parent * rest
    entry.head.quaternion.copy(parentTurn).invert().multiply(turn).multiply(parentTurn).multiply(entry.headRest);
  }

  return {
    group,
    stats,
    update(viewer, dt, clock, frame) {
      if (!folk.ready) return;
      viewerAt = viewer;
      now = clock;
      // Every frame on foot, so nothing here allocates: the anchors are the
      // settlements' own objects, the list and the set are reused, and a map
      // may drop the entry it is visiting.
      anchors.length = 0;
      source.folkNear(viewer, TOWNSFOLK_RADIUS, anchors);
      anchors.sort(byDistance);
      if (anchors.length > TOWNSFOLK_CAP) anchors.length = TOWNSFOLK_CAP;
      const wanted = anchors;
      keep.clear();
      for (const anchor of wanted) keep.add(anchor.key);
      // Whoever is being talked to is kept, whatever the ranking says.
      if (heldKey !== null && standing.has(heldKey)) keep.add(heldKey);
      for (const [key, entry] of standing) if (!keep.has(key)) release(entry);

      let dressed = 0;
      stats.animated = 0;
      stats.strolling = 0;
      stats.nearestMoving = Infinity;
      for (const anchor of wanted) {
        let entry = standing.get(anchor.key);
        if (entry === undefined) {
          // A few a frame, and only while the frame has room (`view.ts`).
          if (dressed >= DRESS_PER_FRAME || !frameOpenFor(dressed, true)) continue;
          const made = dress(anchor, clock);
          if (made === null) continue;
          entry = made;
          standing.set(anchor.key, entry);
          dressed++;
        }
        // The settlements hand out the same anchor objects while a town
        // stands; a rebuilt town hands out new ones for the same key, and
        // the person moves onto it.
        if (entry.anchor !== anchor) {
          entry.anchor = anchor;
          entry.length = anchor.from.distanceTo(anchor.to);
          // Its facing and its stretch read again, off the new anchor.
          local.set(0, 0, 1).applyQuaternion(anchor.quaternion).applyQuaternion(inverse.copy(anchor.town).invert());
          entry.restYaw = Math.atan2(local.x, local.z);
          local.copy(anchor.to).sub(anchor.from).applyQuaternion(inverse);
          entry.strollYaw = Math.atan2(local.x, local.z);
          if (entry.mode === 'stroll' && entry.length <= 1) entry.mode = 'stand';
          if (entry.mode === 'stroll') entry.position.lerpVectors(anchor.from, anchor.to, entry.along);
          else entry.position.copy(anchor.position);
          place(entry);
        }
        // Near people move every frame; far ones catch up every fourth, with the
        // time they missed, so a far square is not slower, only coarser.
        entry.owed += dt;
        const near = anchor.distance < NEAR_ANIMATION;
        const stride = near || entry.held ? 1 : 4;
        if ((frame + entry.lane) % stride === 0) {
          animate(entry, entry.owed, clock, near);
          entry.owed = 0;
          stats.animated++;
        }
        if (entry.walking > 0) stats.strolling++;
        if (entry.gesture !== null || entry.walking > 0 || entry.talking > 0) {
          stats.nearestMoving = Math.min(stats.nearestMoving, entry.position.distanceTo(viewer));
        }
      }
      stats.standing = standing.size;
    },
    collide(point, radius, push) {
      let hit = false;
      const reach = radius + PERSON_RADIUS;
      const r = point.length();
      for (const entry of standing.values()) {
        gap.copy(point).sub(entry.position);
        // Along the ground: the part of the gap that is not up.
        const up = gap.dot(point) / r;
        // Over their heads, or under their feet on a terrace below: no touch.
        if (up > entry.person.height || up < -AVATAR_HEIGHT) continue;
        gap.addScaledVector(point, -up / r);
        const d2 = gap.lengthSq();
        if (d2 >= reach * reach) continue;
        const d = Math.sqrt(d2);
        // Dead centre: out along any direction on the ground.
        if (d < 1e-6) {
          gap.set(1, 0, 0).addScaledVector(point, -point.x / (r * r));
          if (gap.lengthSq() < 1e-6) gap.set(0, 0, 1).addScaledVector(point, -point.z / (r * r));
          gap.normalize();
        }
        else gap.divideScalar(d);
        push.addScaledVector(gap, reach - d);
        hit = true;
      }
      return hit;
    },
    nearest(point, reach) {
      let best: Standing | null = null;
      let bestD = reach;
      for (const entry of standing.values()) {
        const d = entry.position.distanceTo(point);
        if (d < bestD) {
          bestD = d;
          best = entry;
        }
      }
      if (best === null) return null;
      talker.key = best.anchor.key;
      talker.position.copy(best.position);
      talker.height = best.person.height;
      talker.distance = bestD;
      return talker;
    },
    engage(key, towards) {
      if (heldKey !== null && heldKey !== key) {
        const was = standing.get(heldKey);
        if (was !== undefined) was.held = false;
      }
      heldKey = key;
      if (key === null) return true;
      const entry = standing.get(key);
      if (entry === undefined) {
        heldKey = null;
        return false;
      }
      if (towards !== undefined) holdTowards.copy(towards);
      if (!entry.held) {
        entry.held = true;
        // A wave hello, on the townsfolk's own clock.
        startGesture(entry, 'Wave', now);
      }
      return true;
    },
    crownOf(key, out) {
      const entry = standing.get(key);
      if (entry === undefined) return false;
      upAxis.set(0, 1, 0).applyQuaternion(entry.anchor.town);
      out.copy(entry.position).addScaledVector(upAxis, entry.person.height);
      return true;
    },
  };
}
