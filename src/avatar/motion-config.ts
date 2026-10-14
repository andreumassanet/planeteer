import { AVATAR_HEIGHT } from '../stature.ts';

/**
 * Where the run clip's cycle is when the walk's is at `phase`, as a share of a
 * cycle ahead.
 *
 * The pack's walk and run are not authored from the same foot: the walk puts
 * its left foot down 3% into its cycle and the run 45% into its own. At 0.36
 * the left foot's fore-and-aft path through the run best matches its path
 * through the walk, so a blend between them does not slide both feet;
 * `pnpm people` fails if the best offset moves off this one.
 */
export const RUN_PHASE = 0.36;

/**
 * How far one stroke cycle — both arms — carries a swimmer at an easy pace: a
 * body's length. The hands of the library's crawl pull 3.1 units back through
 * the water a cycle between them, and a swimmer glides a little past his
 * pull, so at a slow pace the stroke is driven by distance as the walk is and
 * the arms keep pace with the sea going by.
 */
export const SWIM_STROKE = AVATAR_HEIGHT;
/**
 * The most stroke cycles a second the arms ever make. Past an easy pace the
 * cadence eases towards this and the rest of the speed is glide, or a fast
 * crawl drawn by distance would windmill: 1.3 cycles a second at the swim, 1.5
 * at the sprint.
 */
export const SWIM_CADENCE = 1.55;
/**
 * How far the body rolls with the stroke, radians; rides up on each pull,
 * units; and how much higher than the clip's own waterline a crawl is carried
 * at the surface — the library's crawl has the head's root a tenth of a unit
 * out, which from the chase camera is a swimmer with his face in the sea and
 * nothing else showing.
 */
export const SWIM_ROLL = 0.22;
export const SWIM_RIDE = AVATAR_HEIGHT * 0.025;
export const SWIM_LIFT = AVATAR_HEIGHT * 0.04;
/** Under the surface, the stroke is a long, slow pull and a glide: this share of the cadence. */
export const UNDER_CADENCE = 0.6;

/** Stroke cycles a second at `speed`: by distance when slow, easing to `SWIM_CADENCE`. */
export function swimCadence(speed: number): number {
  return SWIM_CADENCE * Math.tanh(Math.max(0, speed) / SWIM_STROKE / SWIM_CADENCE);
}

/** How quickly the clip weights follow the speed, per second, on foot and afloat. */
export const BLEND_RATE = 10;
export const SWIM_BLEND_RATE = 4;

/**
 * Turning on the spot is a shuffle: the walk mixed in under the idle, its
 * cycle turned over at `TURN_CADENCE` rather than by any distance, as far as
 * `TURN_STEP_SHARE` of the pose when the body turns at `TURN_STEP_RATE`
 * radians a second or faster. A body that rotated with its feet planted read
 * as a figure on a turntable.
 */
export const TURN_STEP_RATE = 2.5;
export const TURN_CADENCE = 1.3;
export const TURN_STEP_SHARE = 0.7;

/**
 * Standing, the head and chest turn towards where the camera looks: at most
 * `LOOK_LIMIT` radians between them, the chest `LOOK_CHEST` of it and the
 * head the rest. Past `LOOK_FADE[0]` off the body's facing the camera is
 * coming round to the front, and the look fades out by `LOOK_FADE[1]` rather
 * than wringing the neck over the shoulder.
 */
export const LOOK_LIMIT = 1.0;
export const LOOK_CHEST = 0.35;
export const LOOK_FADE: readonly [number, number] = [1.7, 2.4];
export const LOOK_RATE = 5;

/**
 * After `IDLE_WAIT` seconds standing still, something every `IDLE_EVERY`: the
 * weight shifted onto one leg (held for `SHIFT_HOLD`), then a look round, the
 * head sweeping `SWEEP_REACH` either side over `SWEEP_TIME`, in turn.
 */
export const IDLE_WAIT = 6;
export const IDLE_EVERY = 8;
export const SHIFT_HOLD = 5;
export const SHIFT_RATE = 1.5;
export const SWEEP_TIME = 4;
export const SWEEP_REACH = 0.8;

/**
 * Longer in the air than this is a fall, not a jump — a jump is 0.68 s of
 * air (`JUMP_RISE` twice, in `player.ts`) — and the arms go up and flail,
 * `FALL_RAISE` radians over the jump's own and `FALL_FLAIL` either side of
 * that at `FALL_RATE` cycles a second.
 */
export const FALL_AFTER = 0.8;
export const FALL_RAISE = 0.7;
export const FALL_FLAIL = 0.18;
export const FALL_RATE = 1.6;

/**
 * Out of an aircraft (`skydive`). Falling, the body is pitched `FREEFALL_PITCH`
 * face down about its hips and banked up to `FREEFALL_BANK` into a turn. The
 * limbs are directions in the body's frame for its left side (+X its left, +Y
 * its head, +Z its face; the right side mirrored): the upper arm out to the
 * side and a little back, the forearm up past the head, the thigh down and back
 * with the arch, the shin raised. Under the canopy the arms are solved to the
 * toggles and the legs hang together, the thighs a little forward.
 */
export const FREEFALL_PITCH = 1.3;
export const FREEFALL_BANK = 0.45;
export const FALL_ARM: readonly [number, number, number] = [0.92, 0.3, -0.25];
export const FALL_FOREARM: readonly [number, number, number] = [0.3, 0.9, -0.3];
export const FALL_THIGH: readonly [number, number, number] = [0.22, -0.95, -0.28];
export const FALL_SHIN: readonly [number, number, number] = [0.15, -0.5, -0.85];
export const HANG_THIGH: readonly [number, number, number] = [0.04, -1, 0.14];
export const HANG_SHIN: readonly [number, number, number] = [0.02, -1, -0.04];
/**
 * Life for the hanging and falling body. Under the canopy each leg swings on
 * its own beat (`DANGLE_RATE` Hz, `DANGLE` of a direction, the legs out of
 * step), the shin a beat behind its thigh, both trailing the body's swing
 * (`lag` in `skydive`). In the fall the wind shakes the limbs (`FLUTTER` at
 * `FLUTTER_RATE` Hz, each on its own phase).
 */
export const DANGLE = 0.07;
export const DANGLE_RATE = 0.33;
export const FLUTTER = 0.05;
export const FLUTTER_RATE = 3.1;

/**
 * The body tips into a change of speed: forward as it sets off, back as it
 * pulls up, `PITCH_GAIN` radians for each unit a second squared, up to
 * `MAX_PITCH`. Setting off to a run is about 80 units a second squared at
 * the controller's ramp (`ACCELERATION_TIME` in `player.ts`), so about a
 * tenth of a radian for the quarter second it lasts.
 */
export const PITCH_GAIN = 0.0012;
export const MAX_PITCH = 0.1;

/**
 * A landing is the library's `Jump_Land` laid over whatever else is playing:
 * a knee-bend `LAND_SOFT` deep after an ordinary jump and all of the clip's
 * crouch after a hard fall, played faster the softer it is, and a third as
 * deep for a body already moving off.
 */
export const LAND_SOFT = 0.35;
