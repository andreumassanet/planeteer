import * as THREE from 'three';
import type { FieldIndex } from '../fleet.ts';
import type { World } from '../geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import type { Place } from '../places.ts';
import { coursePoint, courseTangent } from '../roads/course.ts';
import type { RoadCourse } from '../roads/course.ts';
import { coursePath, parameterAt } from '../roads/path.ts';
import type { CoursePath } from '../roads/path.ts';
import { latOf, lonOf } from '../sphere.ts';
import { crownProfile } from './crown.ts';
import type { CrownProfile } from './crown.ts';
import { RAIL_CLEARANCE, STATION_BOX } from './line.ts';
import type { RailLine } from './line.ts';
import { emptyStation, lineStation, railCourse, stationPoint } from './stations.ts';

const DEG = Math.PI / 180;

/** The rail network: each line's geometry, cached, and a grid to ask what is near. */
export interface RailNetwork {
  readonly lines: readonly RailLine[];
  readonly places: readonly Place[];
  course(line: number): RoadCourse;
  path(line: number): CoursePath;
  crown(line: number): CrownProfile;
  /** Every line whose track could come within `radius` of `direction`, into `out`, which is cleared. */
  near(direction: THREE.Vector3, radius: number, out: number[]): number[];
  /** Where a line is nearest a point: the line, `s` along it, and how far off its centre, or null past `radius`. */
  nearest(direction: THREE.Vector3, radius: number, out: RailHit): RailHit | null;
}

export interface RailHit {
  line: number;
  s: number;
  /** Units off the centre line, along the ground. */
  off: number;
}

/** Degrees of latitude and longitude in one cell of the line index. */
const INDEX_CELL = 4;

export function createRailNetwork(lines: readonly RailLine[], places: readonly Place[], world: World): RailNetwork {
  const courses: (RoadCourse | undefined)[] = new Array(lines.length);
  const paths: (CoursePath | undefined)[] = new Array(lines.length);
  const crowns: (CrownProfile | undefined)[] = new Array(lines.length);
  const COLS = Math.round(360 / INDEX_CELL);
  const ROWS = Math.round(180 / INDEX_CELL);
  const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const middle = new Float64Array(lines.length * 3);
  const half = new Float64Array(lines.length);
  let widest = 0;
  const mid = new THREE.Vector3();
  const at = new THREE.Vector3();

  const network: RailNetwork = {
    lines,
    places,
    course(i) {
      return (courses[i] ??= railCourse(lines[i]!, places));
    },
    path(i) {
      return (paths[i] ??= coursePath(network.course(i)));
    },
    crown(i) {
      return (crowns[i] ??= crownProfile(lines[i]!, places, world, network.course(i), network.path(i)));
    },
    near(direction, radius, out) {
      out.length = 0;
      const lat = latOf(direction.y);
      const lon = lonOf(direction.x, direction.z);
      const span = (radius + widest * PLANET_RADIUS) / UNITS_PER_DEGREE;
      const rowSpan = Math.ceil(span / INDEX_CELL);
      const colSpan = Math.min(COLS >> 1, Math.ceil(span / Math.max(0.02, Math.cos(lat * DEG)) / INDEX_CELL));
      const row = Math.floor((90 - lat) / INDEX_CELL);
      const col = Math.floor((lon + 180) / INDEX_CELL);
      const angle = radius / PLANET_RADIUS;
      for (let r = Math.max(0, row - rowSpan); r <= Math.min(ROWS - 1, row + rowSpan); r++) {
        for (let c = col - colSpan; c <= col + colSpan; c++) {
          if (colSpan * 2 + 1 >= COLS && c > col - colSpan + COLS - 1) break;
          for (const i of grid[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
            const dot = direction.x * middle[i * 3]! + direction.y * middle[i * 3 + 1]! + direction.z * middle[i * 3 + 2]!;
            if (Math.acos(Math.min(1, Math.max(-1, dot))) - half[i]! <= angle) out.push(i);
          }
        }
      }
      return out;
    },
    nearest(direction, radius, out) {
      let best: RailHit | null = null;
      for (const i of network.near(direction, radius, nearList)) {
        const path = network.path(i);
        const hit = nearestOnPath(path, direction);
        if (hit.off <= radius && (best === null || hit.off < best.off)) {
          out.line = i;
          out.s = hit.s;
          out.off = hit.off;
          best = out;
        }
      }
      return best;
    },
  };
  const nearList: number[] = [];

  lines.forEach((line, i) => {
    const course = railCourse(line, places);
    coursePoint(course, 0.5, mid);
    middle[i * 3] = mid.x;
    middle[i * 3 + 1] = mid.y;
    middle[i * 3 + 2] = mid.z;
    let reach = 0;
    for (let k = 0; k <= 8; k++) reach = Math.max(reach, mid.angleTo(coursePoint(course, k / 8, at)));
    // The bow and the stations stand off the chord a little further than eight samples see.
    reach += (course.length / 16 + STATION_BOX.x1 + STATION_BOX.z1) / PLANET_RADIUS;
    half[i] = reach;
    widest = Math.max(widest, reach);
    const lat = latOf(mid.y);
    const lon = lonOf(mid.x, mid.z);
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / INDEX_CELL)));
    const col = ((Math.floor((lon + 180) / INDEX_CELL) % COLS) + COLS) % COLS;
    grid[row * COLS + col]!.push(i);
  });
  return network;
}

const pathHere = new THREE.Vector3();
const pathLast = new THREE.Vector3();
const pathLeg = new THREE.Vector3();
const pathFoot = new THREE.Vector3();
const pathHit = { s: 0, off: Infinity };

/** The nearest point of a path to a direction: `s` along it and how far off, in units. Shared result object. */
export function nearestOnPath(path: CoursePath, direction: THREE.Vector3): { s: number; off: number } {
  pathHit.off = Infinity;
  pathHit.s = 0;
  const xyz = path.xyz;
  for (let k = 0; k < path.count; k++) {
    pathHere.set(xyz[k * 3]!, xyz[k * 3 + 1]!, xyz[k * 3 + 2]!);
    if (k > 0) {
      pathLeg.subVectors(pathHere, pathLast);
      const lengthSq = pathLeg.lengthSq();
      let t = lengthSq > 1e-18 ? pathFoot.subVectors(direction, pathLast).dot(pathLeg) / lengthSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      pathFoot.copy(pathLast).addScaledVector(pathLeg, t);
      const off = pathFoot.distanceTo(direction) * PLANET_RADIUS;
      if (off < pathHit.off) {
        pathHit.off = off;
        pathHit.s = path.s[k - 1]! + (path.s[k]! - path.s[k - 1]!) * t;
      }
    }
    pathLast.copy(pathHere);
  }
  return pathHit;
}

/** The point, and optionally the tangent, `s` units along a line from terminus A. */
export function railPointAt(network: RailNetwork, line: number, s: number, point: THREE.Vector3, tangent?: THREE.Vector3): THREE.Vector3 {
  const course = network.course(line);
  const t = parameterAt(network.path(line), s);
  coursePoint(course, t, point);
  if (tangent !== undefined) courseTangent(course, t, tangent);
  return point;
}

/** Keepout discs along a line: their spacing, and a radius whose union is `RAIL_CLEARANCE` wide each side. */
const DISC_STEP = 6;
const DISC_RADIUS = Math.hypot(RAIL_CLEARANCE, DISC_STEP / 2);
/** Spacing of the discs down a station's middle. */
const STATION_DISC_STEP = 10;

/**
 * The railway as a `FieldIndex`: every line's track and station as discs, so
 * whatever keeps off a plane's field (the wood, the countryside, the herds)
 * keeps off the ballast by the same test.
 */
export function railFields(network: RailNetwork): Pick<FieldIndex, 'fieldsNear'> {
  const hits: number[] = [];
  const point = new THREE.Vector3();
  const station = emptyStation();
  /** Each line's discs, strung once and kept. */
  const strung = new Map<number, { at: THREE.Vector3; radius: number }[]>();
  const stationWidth = (STATION_BOX.x1 - STATION_BOX.x0) / 2;
  const stationMiddle = (STATION_BOX.x1 + STATION_BOX.x0) / 2;
  const stationRadius = Math.hypot(stationWidth, STATION_DISC_STEP / 2);
  const discsOf = (i: number): { at: THREE.Vector3; radius: number }[] => {
    let discs = strung.get(i);
    if (discs !== undefined) return discs;
    discs = [];
    const path = network.path(i);
    const count = Math.max(1, Math.ceil(path.length / DISC_STEP));
    for (let k = 0; k <= count; k++) {
      railPointAt(network, i, (path.length * k) / count, point);
      discs.push({ at: point.clone(), radius: DISC_RADIUS });
    }
    for (const end of [0, 1] as const) {
      lineStation(network.lines[i]!, end, network.places, station);
      for (let z = STATION_BOX.z0; z <= STATION_BOX.z1 + 1e-6; z += STATION_DISC_STEP) {
        discs.push({ at: stationPoint(station, stationMiddle, z, new THREE.Vector3()), radius: stationRadius });
      }
    }
    if (strung.size > 256) strung.delete(strung.keys().next().value!);
    strung.set(i, discs);
    return discs;
  };
  return {
    fieldsNear(direction, radius, out) {
      for (const i of network.near(direction, radius + stationRadius, hits)) {
        for (const disc of discsOf(i)) {
          if (disc.at.angleTo(direction) * PLANET_RADIUS < radius + disc.radius) out.push(disc);
        }
      }
      return out;
    },
  };
}

/** The fleet's fields and the railway's as one `FieldIndex`; `planesNear` is the fleet's alone. */
export function joinFields(fleet: FieldIndex, rails: Pick<FieldIndex, 'fieldsNear'> | null): FieldIndex {
  if (rails === null) return fleet;
  return {
    fieldsNear(direction, radius, out) {
      fleet.fieldsNear(direction, radius, out);
      return rails.fieldsNear(direction, radius, out);
    },
    planesNear: (direction, radius, out) => fleet.planesNear(direction, radius, out),
  };
}
