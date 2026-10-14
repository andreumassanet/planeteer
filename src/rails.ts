import { DATA_URL, decodeRails, inflate } from './pack.ts';
import type { RailData } from './pack.ts';

/**
 * The railway: which cities a line joins, where each line's stations stand,
 * and the shape and height of the track between them.
 *
 * `rails.bin` (baked by `scripts/build-rails.ts`) stores only what decides a
 * line's shape: the two cities, the bearing and platform side of each
 * station, and the bow. Everything else is derived here, the same way for the
 * bake, the check, the streamer (`railway.ts`) and the trains.
 *
 * A line runs station to station, each station standing outside its city's
 * square; the middle is a road's (`joinCourse`). The crown rides `RAIL_LIFT`
 * over the ground, the road's own lift, so a level crossing is flush, and
 * never under it (`crownProfile`). `railFields` exposes the track as discs so
 * whatever keeps off a plane's field keeps off the railway too.
 */

export {
  BED_FOOT, BED_HALF, CROSSING_ANGLE, CROSSING_CLEAR, CROWN_STEP, GAUGE, GRADE_RUN, HALL_DEPTH, HALL_FROM, HALL_LENGTH,
  PLATFORM_FROM, PLATFORM_INNER, PLATFORM_LENGTH, PLATFORM_RISE, PLATFORM_WIDTH, RAIL_CLEARANCE, RAIL_GRADE, RAIL_LIFT,
  RAIL_MAX_LENGTH, RAIL_METRE, RAIL_MIN_RADIUS, RAIL_POP, SHOULDER_DROP, STATION_BEARINGS, STATION_BOX, STATION_OUT,
  STATION_RUN, STATION_TURN,
} from './rails/line.ts';
export type { RailLine } from './rails/line.ts';
export { bearingToward, emptyStation, lineStation, railCourse, stationFor, stationPoint } from './rails/stations.ts';
export type { StationFrame } from './rails/stations.ts';
export { crownAt, crownProfile, stationLevel, steepestGrade } from './rails/crown.ts';
export type { CrownProfile } from './rails/crown.ts';
export { createRailNetwork, joinFields, nearestOnPath, railFields, railPointAt } from './rails/network.ts';
export type { RailHit, RailNetwork } from './rails/network.ts';
export {
  CAR_GAP, CAR_PITCH, CAR_WIDTH, CONSISTS, DWELL, RAIL_TOP, STOP_SHORT, TRAIN_ACCELERATION, TRAIN_SPEED, consistOf, phaseOf, trainAt,
} from './rails/trains.ts';
export type { ConsistKind, TrainState } from './rails/trains.ts';

/** Fetches and decodes `rails.bin`. */
export async function loadRails(url = `${DATA_URL}rails.bin`): Promise<RailData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodeRails(await inflate(await response.arrayBuffer()));
}
