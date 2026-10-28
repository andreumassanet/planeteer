/**
 * The sense of speed, as one number from 0 to 1: how fast the ground streams
 * past the eye, which is speed over height and not speed alone. A plane at
 * its ceiling doing 4,800 units a second crosses the land slower to the eye
 * than a car on a street; the same plane low over the water is a blur. The
 * camera's lens (`CameraRig.rush`) and the speed lines (`speed-lines.ts`) read
 * it.
 */

/**
 * Units added to the height over the ground before the speed is divided by
 * it: about where the chase camera rides over a car, so that a vehicle on the
 * ground is measured from the eye and not from its wheels.
 */
export const RUSH_EYE = 18;
/** The flow, speed over height (per second), where the rush starts and where it is full. */
export const RUSH_FROM = 1.5;
export const RUSH_FULL = 6;
/** Seconds the eased rush takes to rise, and to fall. */
export const RUSH_RISE = 0.35;
export const RUSH_FALL = 0.6;

/**
 * The rush of a speed in units a second at a height over the ground in units:
 * a run is none, a car flat out a little, a plane on its take-off run or
 * skimming the sea most of it, and the same plane at cruise height none.
 */
export function rushOf(speed: number, overGround: number): number {
  if (!Number.isFinite(speed) || !Number.isFinite(overGround)) return 0;
  const flow = Math.abs(speed) / (Math.max(0, overGround) + RUSH_EYE);
  const t = Math.min(1, Math.max(0, (flow - RUSH_FROM) / (RUSH_FULL - RUSH_FROM)));
  return t * t * (3 - 2 * t);
}

/** Eases `current` towards `wanted`, quicker up than down. */
export function easeRush(current: number, wanted: number, dt: number): number {
  const time = wanted > current ? RUSH_RISE : RUSH_FALL;
  return current + (wanted - current) * (1 - Math.exp(-Math.max(0, dt) / time));
}
