import * as THREE from 'three';
import { coloursOf, wardrobeOf, type Appearance } from '../appearance.ts';
import { AVATAR_HEIGHT } from '../avatar.ts';
import { OUTFITS, castMaterial, castSkin, foldLegs, holdWheel, closeHand, limbsOf, loadCast, paintWith, reachArms, type Cast, type Person, type WheelGrip } from '../cast.ts';
import { bakeSkin } from '../models.ts';
import type { MonumentContext } from '../monuments/contract.ts';
import { lookFor } from '../scenery/dress.ts';
import { rngFrom } from '../scenery/random.ts';
import { PALETTE } from '../theme.ts';

/** Whether two colours are close enough to read as one at a distance. */
export function near(a: number, b: number): boolean {
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
   * at `grip` when there is one (a point, hips at the origin) or on the rim of
   * `wheel` (`holdWheel`, the elbows bent: a traffic driver's). Painted, inked
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
  /** A wheel about the hip, at this body's size, held as the hero holds his (`holdWheel`). */
  wheel?: WheelGrip;
}

/** Marks a mesh whose colours are its vertices' for the flatteners; it is never drawn. */
export const PAINTED_MERGE = new THREE.MeshBasicMaterial();
PAINTED_MERGE.userData.atlasPainted = true;
PAINTED_MERGE.userData.atlasToon = PALETTE.white;

/** How tall an adult of the cast is drawn, either side of the hero. */
export const ADULT_HEIGHT: readonly [number, number] = [AVATAR_HEIGHT * 0.9, AVATAR_HEIGHT * 1.08];

/**
 * How tall a child is, and how many of the people dressed are children.
 *
 * The cast has no children and an adult drawn smaller is not one, so a child
 * is an adult outfit at 0.62 of the hero's height with a head `YOUNG_HEAD`
 * times its own: about five and a half heads. Never a rider: a person held
 * seated is asked for at an adult's height.
 */
export const YOUNG_HEIGHT = AVATAR_HEIGHT * 0.62;
export const YOUNG_SHARE = 0.14;

/**
 * Whether the townsperson `key` is dressed as a child: the one draw `dress`
 * makes, so a conversation (`talk.ts`) knows a child from the same key.
 */
export const isYoung = (key: string): boolean => rngFrom(key, 'age').chance(YOUNG_SHARE);

/** The outfit `dress` puts the person `key` in: one draw, shared with `isWoman`. */
export const outfitOf = (key: string): (typeof OUTFITS)[number] => OUTFITS[rngFrom(key, 'outfit').int(OUTFITS.length)]!;

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
      if (pose.wheel !== undefined) {
        frame.updateMatrixWorld(true);
        const hip = frame.worldToLocal(limbs.hips.getWorldPosition(new THREE.Vector3()));
        holdWheel(limbs, frame, hip, pose.wheel, 0);
      } else if (pose.grip !== undefined) {
        frame.updateMatrixWorld(true);
        const hip = frame.worldToLocal(limbs.hips.getWorldPosition(new THREE.Vector3()));
        reachArms(limbs, frame, pose.grip.clone().add(hip));
        for (const hand of limbs.hands) closeHand(hand);
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
