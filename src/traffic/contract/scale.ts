import { SCENERY_SCALE } from '../../scenery/contract.ts';
import { BODY_SCALE } from '../../stature.ts';

/**
 * Placed scale: the kit is authored at `SCENERY_SCALE` and placed at 1.35 times
 * it. A person stands at 1.7 times the scenery scale, and 1.35 is the most a
 * 7.2-unit road allows while two cars still pass.
 */
export const PLACED_SECTION = 1.35;

/**
 * Longest a placed vehicle may come out. A rigid body longer than this stops
 * following the curvature of `courseOf`, so the length is cropped rather than
 * the whole vehicle shrunk.
 */
export const PLACED_LENGTH_CAP = 20;

/**
 * The crowd's seated figure, hip at the origin: the origin is the seat surface,
 * so a saddle at `y = 1.1` places a rider at `y = 1.1`.
 *
 * Measured off the built mesh with a bounding box, not from the joint chain.
 * Restated rather than imported from `scenery/people.ts` so the traffic kit
 * does not depend on it; a proportion changed in the crowd's `BODY` must be
 * changed here too.
 */
export const SEATED = {
  /** Standing, for reference. */
  standing: 6.8 * BODY_SCALE,
  /** Crown above the seat surface, bare head. */
  crown: 3.84 * BODY_SCALE,
  /**
   * Clear height a seat must have over it, as the envelope over 400 bodies:
   * bare head, or admitting a conical hat or a headload.
   */
  headroomBare: 3.9 * BODY_SCALE,
  headroomHatted: 4.8 * BODY_SCALE,
  /** Sole below the seat. A shallower footwell puts the boot through the floor. */
  sole: 1.75 * BODY_SCALE,
  /** Knee ahead of it: the minimum seat pan depth. */
  knee: 1.34 * BODY_SCALE,
  /** Toe ahead of it. A pedal or footrest sits between the knee and here. */
  toe: 1.97 * BODY_SCALE,
  /** Back of the body behind it: what a seat back has to clear. */
  back: 0.72 * BODY_SCALE,
  /** Half-width at the hips. Not the number to size a cab with. */
  hipHalf: 0.98 * BODY_SCALE,
  /** Half-width at the shoulders. Not the number to size a cab with either. */
  shoulderHalf: 1.3 * BODY_SCALE,
  /** Clear width a seat must have across it, elbows included. */
  beam: 4.3 * BODY_SCALE,
} as const;

/** The shape of the crowd's figure record, as much of it as this kit reads. */
export interface CrowdBody {
  height: number;
  hip: number;
  shin: number;
  ankle: number;
  thigh: number;
  bootDepth: number;
  hipHalf: number;
  shoulderHalf: number;
}

/**
 * Height a rider in this kit is built at: a 1.82 m person at `SCENERY_SCALE`.
 * `buildPerson` scales its whole chain off `look.height`, so a rider is built
 * small rather than scaled small.
 */
export const RIDER_HEIGHT = 1.82 * SCENERY_SCALE;

/** `RIDER_HEIGHT` as a ratio of the seated figure's standing height. */
export const RIDER_SCALE = RIDER_HEIGHT / SEATED.standing;

/** `SEATED`, in this kit's units: what a seat has to clear. */
export const RIDER = {
  crown: SEATED.crown * RIDER_SCALE,
  headroomBare: SEATED.headroomBare * RIDER_SCALE,
  headroomHatted: SEATED.headroomHatted * RIDER_SCALE,
  sole: SEATED.sole * RIDER_SCALE,
  knee: SEATED.knee * RIDER_SCALE,
  toe: SEATED.toe * RIDER_SCALE,
  back: SEATED.back * RIDER_SCALE,
  hipHalf: SEATED.hipHalf * RIDER_SCALE,
  shoulderHalf: SEATED.shoulderHalf * RIDER_SCALE,
  beam: SEATED.beam * RIDER_SCALE,
  standing: SEATED.standing * RIDER_SCALE,
} as const;

/**
 * Smallest feature that reads at a given distance. A car is about 40 px at
 * 120 units with a 2-3 px pen round it, so its silhouette is most of what it is
 * and windows are not modelled as panes.
 */
export const LEGIBLE_AT = (distance: number): number => distance / 234;
