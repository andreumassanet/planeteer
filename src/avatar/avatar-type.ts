import * as THREE from 'three';
import type { Emote } from '../../server/src/limits.ts';
import type { Appearance } from '../appearance.ts';
import type { AstrideSeat, HandHold, Limbs, Person, SeatedPose } from '../cast.ts';
import type { MotionCues } from './motion-types.ts';

export interface Avatar {
  /** Origin between the feet, facing +Z. */
  group: THREE.Group;
  /** Walking, running, standing and airborne. Everything on foot. */
  stride(dt: number, speed: number, airborne: boolean, cues?: MotionCues): void;
  /**
   * Afloat. `sink` is how far the group hangs under the water's surface
   * (`Player.sink`), which the body gives back: the swimming clips are drawn
   * with the waterline at their origin. `under` is how far under the surface
   * the body has dived, 0 to 1.
   */
  swim(dt: number, speed: number, sink: number, under?: number): void;
  /** Back on the ground after a jump or a fall; see `Motion.land`. */
  land(hardness: number): void;
  /** At the launch's helm. `heel` is the craft's roll. */
  steer(dt: number, heel: number): void;
  /**
   * Out of an aircraft: face down and arched in the fall, hanging from the
   * hands under a canopy, blended by `open` (0 to 1). `turn` (-1 to 1, positive
   * to the right) banks the fall; `grip` is where the left hand holds its toggle
   * in the body's frame (`CHUTE_GRIP`), the right mirrored. Under the canopy a
   * turn pulls the toggle on its side down by `pull` (`CHUTE_PULL`). `lag` is
   * how far the legs trail the body's swing, as directions across (+X its left)
   * and along (+Z its face).
   */
  skydive(
    dt: number,
    open: number,
    turn: number,
    grip: readonly [number, number, number],
    pull?: number,
    lag?: readonly [number, number],
  ): void;
  /**
   * Seated, hips at `FIGURE.hipY`: on a chair or a bench, or in a car with
   * the legs to the pedals and the hands on its wheel, turned `turn` radians
   * (`SeatedPose`, `CraftMotion.steer`).
   */
  sit(dt: number, seat?: SeatedPose, turn?: number): void;
  /**
   * The head put away, for the eye inside it: in first person in a seat the
   * body is drawn — the arms on the wheel, the knees under the dash — and the
   * head, which the lens is inside, is folded to a point on its bone.
   */
  setHeadless(headless: boolean): void;

  /**
   * Astride — a saddle, a bicycle, a jet ski — hips at `FIGURE.hipY` as
   * seated, the legs to the seat's footrests or round its crank at `phase`,
   * the hands on its grip (`poseAstride` in `cast.ts`).
   */
  ride(dt: number, seat: AstrideSeat, phase: number): void;
  /** Back to a clean standing pose with the cycle at zero. For `goTo`. */
  reset(): void;
  /** A gesture, standing: see `Motion.emote`. */
  emote(name: Emote | null): boolean;
  /** The gesture being made, or null. */
  readonly emoting: Emote | null;
  /**
   * Where the gait is in its cycle, 0 to 1. The walk clip is played at this
   * phase and the run a fixed share ahead (`RUN_PHASE`), so a foot comes down
   * twice a cycle at fixed phases whichever clip shows; footsteps in `audio.ts`
   * are timed at 0 and a half.
   */
  readonly phase: number;
  /** What it is wearing. */
  readonly appearance: Appearance;
  /**
   * Changes clothes: loads whatever outfit the new appearance needs, then
   * swaps the body under `group` between two frames. A later call wins over
   * one still loading.
   */
  wear(appearance: Appearance): Promise<void>;
  /**
   * Done with: the body goes back to the cast's pool (`Cast.release`, never
   * disposed), a hero stops being dressed by `dressHero`, and a `wear` still
   * loading is dropped. A world's traveller and its drivers, on leaving it.
   */
  dispose(): void;
}

/** One dressed body. Swapped whole by `wear`; the motion carries over. */
export interface Rig {
  person: Person;
  appearance: Appearance;
  limbs: Limbs;
  /** Where the clips left the bones the seated, astride and hanging poses write by hand. */
  hold: HandHold;
}
