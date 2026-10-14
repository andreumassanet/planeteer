/** Handling of each kind of space vehicle, and the constants of its motion. */

import type { Handling, VehicleKind } from '../contract.ts';
import { BALLOON_CEILING, BALLOON_CLIMB, BALLOON_SPEED, BALLOON_TURN, PLANE_VERTICAL_TIME } from '../../vehicles.ts';


/** Handling, units and seconds. */
export const HANDLING: Record<VehicleKind, Handling> = {
  rover: { top: 24, reverse: 8, accel: 9, turn: 1.3, climb: 0, sink: 0 },
  lander: { top: 90, reverse: 15, accel: 14, turn: 0.9, climb: 16, sink: 13 },
  // Brisk: to its top speed in about two seconds and round in three and a
  // half, against the lander's ease over `PLANE_ACCELERATION_TIME` and seven.
  ufo: { top: 75, reverse: 22, accel: 38, turn: 1.8, climb: 22, sink: 18 },
  aerostat: { top: BALLOON_SPEED, reverse: 3, accel: 2.2, turn: BALLOON_TURN, climb: BALLOON_CLIMB, sink: BALLOON_CLIMB * 0.8 },
};
/** How much faster a ship goes on its afterburner, and how long its flame is then, units. */
export const TURBO = 3.6;
export const FLAME_LENGTH = 9;
/** How high an aerostat may climb over the ground: Earth's balloon's, units. */
export const AEROSTAT_CEILING = BALLOON_CEILING;
/** A saucer's bank into a full turn and the nod into full throttle, as tilts of its up; and its wobble's. */
export const SAUCER_BANK = 0.3;
export const SAUCER_NOD = 0.08;
export const SAUCER_WOBBLE = 0.03;
/**
 * How fast a saucer's lift answers its keys, s: a third of the plane's
 * `PLANE_VERTICAL_TIME`, so let go of mid-climb it stops within a few of its
 * own heights rather than coasting up a dozen, which is what hovering is.
 */
export const SAUCER_VERTICAL_TIME = PLANE_VERTICAL_TIME / 3;
