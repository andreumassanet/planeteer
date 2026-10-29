/** How far a landmark is built from the viewer, and which are worth building at all. */
import { HAZE_RADIUS } from '../globe.ts';
import { detailReach, fogFar, horizonAt, sightAt, slantRange } from '../view.ts';

/**
 * How far along the ground a monument is built, in world units: tied to the
 * horizon, capped at 24,000, and opened with the far haze near the ground
 * (`sightAt`), since a landmark is what a far view is looked at for. A size
 * test (`MIN_APPARENT_PIXELS`) keeps the small ones from being built that far out.
 */
export function reachFor(altitude: number): number {
  return Math.min(
    fogFar(altitude, HAZE_RADIUS) * 1.1,
    detailReach(Math.min(24000, Math.max(1500, horizonAt(altitude, HAZE_RADIUS) * 2)) * sightAt(altitude)),
  );
}

/** `reachFor` along the slant, because a monument is on the ground and the viewer may not be. */
export function rangeFor(altitude: number): number {
  return slantRange(altitude, reachFor(altitude));
}

/**
 * Pixels across a monument has to be worth before it is built: the same test
 * as `settlements.ts`, on the model's declared footprint. Six rather than a
 * town's twelve, since a landmark is a silhouette and a town is a texture.
 */
export const MIN_APPARENT_PIXELS = 6;
export const PIXELS_PER_RADIAN = 937;
/** The widest footprint the monument contract allows, used when a placement declares none. */
export const WIDEST_FOOTPRINT = 55;

/** The disc dressed whatever the camera points at, so a monument cannot be missing from the frame you turn to. */
const KEEP_ALL_WITHIN = 1200;
/** Fixed, not scaled with the detail knob. */
export const keepAllWithin = (): number => KEEP_ALL_WITHIN;

/**
 * How close you have to get for a monument's card to come up: roughly standing
 * in it (the largest footprint is 55 and its pad 20 wider). Not "can see it".
 */
export const LANDMARK_RANGE = 140;

/** Monuments raised in one frame, in the list's order and only while the frame has room. */
export const RAISES_PER_FRAME = 1;
