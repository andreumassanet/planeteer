import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import { coursePoint } from '../roads/course.ts';
import type { RoadCourse } from '../roads/course.ts';
import { parameterAt } from '../roads/path.ts';
import type { CoursePath } from '../roads/path.ts';
import { CROWN_SMOOTH, CROWN_STEP, GRADE_RUN, RAIL_LIFT, STATION_BOX, STATION_RAMP, STATION_RUN } from './line.ts';
import type { RailLine } from './line.ts';
import { emptyStation, lineStation, stationPoint } from './stations.ts';
import type { StationFrame } from './stations.ts';

/**
 * The height of a line's ballast crown, over the planet's centre, every
 * `CROWN_STEP` units from terminus A: the ground plus `RAIL_LIFT`, or its
 * moving average where that is higher (a train rides over a dip), and along
 * each platform the station's own level, ramped back over `STATION_RAMP`.
 */
export interface CrownProfile {
  /** Radius of the crown at `s = k * CROWN_STEP`. */
  radius: Float64Array;
  /** Each station's floor, as a radius. */
  levelA: number;
  levelB: number;
  length: number;
}

const crownPoint = new THREE.Vector3();
const stationA = emptyStation();
const stationB = emptyStation();

/** The radius a station stands at: the ground's lift at its highest under the station's footprint. */
export function stationLevel(world: World, station: StationFrame): number {
  let top = -Infinity;
  for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += (STATION_BOX.z1 - STATION_BOX.z0) / 6) {
    for (let x = STATION_BOX.x0; x <= STATION_BOX.x1 + 1e-6; x += (STATION_BOX.x1 - STATION_BOX.x0) / 4) {
      top = Math.max(top, world.elevationAt(stationPoint(station, x, z, crownPoint)));
    }
  }
  return PLANET_RADIUS + top + RAIL_LIFT;
}

export function crownProfile(line: RailLine, places: readonly Place[], world: World, course: RoadCourse, path: CoursePath): CrownProfile {
  const count = Math.max(2, Math.ceil(path.length / CROWN_STEP) + 1);
  const ground = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    coursePoint(course, parameterAt(path, Math.min(path.length, k * CROWN_STEP)), crownPoint);
    ground[k] = PLANET_RADIUS + world.elevationAt(crownPoint) + RAIL_LIFT;
  }
  const radius = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, k - CROWN_SMOOTH); j <= Math.min(count - 1, k + CROWN_SMOOTH); j++) {
      sum += ground[j]!;
      n++;
    }
    radius[k] = Math.max(ground[k]!, sum / n);
  }
  const levelA = stationLevel(world, lineStation(line, 0, places, stationA));
  const levelB = stationLevel(world, lineStation(line, 1, places, stationB));
  for (let k = 0; k < count; k++) {
    const s = Math.min(path.length, k * CROWN_STEP);
    for (const [level, from] of [[levelA, s], [levelB, path.length - s]] as const) {
      if (from > STATION_RUN + STATION_RAMP) continue;
      const hold = from <= STATION_RUN ? 1 : 1 - smoothstep((from - STATION_RUN) / STATION_RAMP);
      radius[k] = Math.max(radius[k]!, radius[k]! + (level - radius[k]!) * hold);
    }
  }
  return { radius, levelA, levelB, length: path.length };
}

const smoothstep = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

/** The crown's radius `s` units from terminus A. */
export function crownAt(profile: CrownProfile, s: number): number {
  const u = Math.min(profile.radius.length - 1, Math.max(0, s / CROWN_STEP));
  const k = Math.min(profile.radius.length - 2, Math.floor(u));
  const f = u - k;
  return profile.radius[k]! * (1 - f) + profile.radius[k + 1]! * f;
}

/** The steepest the crown climbs anywhere, rise over run, over `GRADE_RUN`. */
export function steepestGrade(profile: CrownProfile): number {
  const span = Math.max(1, Math.round(GRADE_RUN / CROWN_STEP));
  let worst = 0;
  for (let k = 0; k + span < profile.radius.length; k++) {
    worst = Math.max(worst, Math.abs(profile.radius[k + span]! - profile.radius[k]!) / (span * CROWN_STEP));
  }
  return worst;
}
