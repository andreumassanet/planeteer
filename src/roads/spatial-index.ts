import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import type { Place } from '../places.ts';
import { latOf, lonOf } from '../sphere.ts';
import { courseOf, coursePoint, emptyCourse } from './course.ts';
import type { Road } from './types.ts';

const DEG = Math.PI / 180;

/** Which roads pass near a patch of ground; see `createRoadIndex`. */
export interface RoadIndex {
  /**
   * Indices into the road list, of every road whose curve could come within
   * `radius` world units of `direction`. Appended to `out`, which is cleared.
   */
  near(direction: THREE.Vector3, radius: number, out: number[]): number[];
  /**
   * Whether road `road` is one `near` would return for this `direction` and
   * `radius`: the same bound, for a caller that asks `near` once over a wide
   * patch and then many points inside it.
   */
  reaches(road: number, direction: THREE.Vector3, radius: number): boolean;
}

let sharedIndex: { roads: readonly Road[]; places: readonly Place[]; index: RoadIndex } | null = null;

/**
 * The one index over a network, built once and shared by every caller that
 * hands in the same arrays (the wood, the herds, the foot). A different
 * network gets its own.
 */
export function roadIndexFor(roads: readonly Road[], places: readonly Place[]): RoadIndex {
  if (sharedIndex !== null && sharedIndex.roads === roads && sharedIndex.places === places) {
    return sharedIndex.index;
  }
  const index = createRoadIndex(roads, places);
  sharedIndex = { roads, places, index };
  return index;
}

/**
 * A lat/lon grid over the network, each road bucketed on its own middle. The
 * bound per road is the angle from its middle to the furthest of nine points
 * along its course plus a sixteenth of its length, because a course through a
 * gate facing away from the far town swings out past its own end.
 */
export function createRoadIndex(roads: readonly Road[], places: readonly Place[]): RoadIndex {
  const CELL = 4;
  const COLS = Math.round(360 / CELL);
  const ROWS = Math.round(180 / CELL);
  const middle = new Float64Array(roads.length * 3);
  /** Angle from the middle to the far end, in radians. */
  const half = new Float64Array(roads.length);
  const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  const course = emptyCourse();
  const mid = new THREE.Vector3();
  const at = new THREE.Vector3();
  let widest = 0;

  roads.forEach((road, i) => {
    courseOf(road, places, course);
    coursePoint(course, 0.5, mid);
    middle[i * 3] = mid.x;
    middle[i * 3 + 1] = mid.y;
    middle[i * 3 + 2] = mid.z;
    let reach = 0;
    for (let k = 0; k <= 8; k++) reach = Math.max(reach, mid.angleTo(coursePoint(course, k / 8, at)));
    reach += course.length / 16 / PLANET_RADIUS;
    half[i] = reach;
    if (reach > widest) widest = reach;
    const lat = latOf(mid.y);
    const lon = lonOf(mid.x, mid.z);
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
    const col = ((Math.floor((lon + 180) / CELL) % COLS) + COLS) % COLS;
    grid[row * COLS + col]!.push(i);
  });

  const widestUnits = widest * PLANET_RADIUS;
  const reaches = (i: number, direction: THREE.Vector3, angle: number): boolean => {
    const dot = direction.x * middle[i * 3]! + direction.y * middle[i * 3 + 1]! + direction.z * middle[i * 3 + 2]!;
    return Math.acos(Math.min(1, Math.max(-1, dot))) - half[i]! <= angle;
  };

  return {
    reaches: (road, direction, radius) => reaches(road, direction, radius / PLANET_RADIUS),
    near(direction, radius, out) {
      out.length = 0;
      const lat = latOf(direction.y);
      const lon = lonOf(direction.x, direction.z);
      const span = (radius + widestUnits) / UNITS_PER_DEGREE;
      const rowSpan = Math.ceil(span / CELL);
      // The longitude span opens with the cosine, as in `proximityGraph`.
      const colSpan = Math.ceil(span / Math.max(0.02, Math.cos(lat * DEG)) / CELL);
      const row0 = Math.max(0, Math.floor((90 - lat) / CELL) - rowSpan);
      const row1 = Math.min(ROWS - 1, Math.floor((90 - lat) / CELL) + rowSpan);
      const col = Math.floor((lon + 180) / CELL);
      const angle = radius / PLANET_RADIUS;
      for (let r = row0; r <= row1; r++) {
        for (let c = col - colSpan; c <= col + colSpan; c++) {
          if (colSpan * 2 + 1 >= COLS && c > col - colSpan + COLS - 1) break;
          for (const i of grid[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
            if (reaches(i, direction, angle)) out.push(i);
          }
        }
      }
      return out;
    },
  };
}
