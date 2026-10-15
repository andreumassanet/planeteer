import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe/planet.ts';
import type { Place } from '../places.ts';
import { latOf, lonOf } from '../sphere.ts';
import { courseOf, coursePoint, emptyCourse } from './course.ts';
import type { Road } from './types.ts';

/**
 * The cell of the corridor lattice, degrees: about 28 units of latitude on
 * this planet, past the widest bank and its skirt either side of the centre
 * line. A point is in a road's corridor when its cell holds the road; the land
 * walks each edge more finely than a cell (`inlandAlong`), so an edge that
 * crosses a road meets the road's cells.
 */
const CORRIDOR_CELL = 0.05;
const COLS = Math.round(360 / CORRIDOR_CELL);

/**
 * Whether a point (a unit vector) is near enough a road that the land drawn
 * under it must keep to the relief the ribbon is laid on: the land mesh's
 * looser inland budget (`setTightGround` in `globe/tessellation.ts`) is not
 * spent there. Every builder of the land hands in the same network.
 */
export function roadCorridors(roads: readonly Road[], places: readonly Place[]): (direction: THREE.Vector3) => boolean {
  const cells = new Set<number>();
  const course = emptyCourse();
  const at = new THREE.Vector3();
  const key = (row: number, col: number): number => row * COLS + (((col % COLS) + COLS) % COLS);
  const step = (CORRIDOR_CELL * Math.PI * PLANET_RADIUS) / 180 / 2;
  for (const road of roads) {
    courseOf(road, places, course);
    // `t` is not arc length: the approaches take `share` of it each, so the
    // middle is sampled at the step and the approaches more finely.
    const steps = Math.max(2, Math.ceil(course.length / step / Math.max(0.2, 1 - 2 * course.share)));
    for (let k = 0; k <= steps; k++) {
      coursePoint(course, k / steps, at);
      const row = Math.floor((latOf(at.y) + 90) / CORRIDOR_CELL);
      const col = Math.floor((lonOf(at.x, at.z) + 180) / CORRIDOR_CELL);
      cells.add(key(row, col));
    }
  }
  return (direction) => {
    const length = direction.length();
    const row = Math.floor((latOf(direction.y / length) + 90) / CORRIDOR_CELL);
    const col = Math.floor((lonOf(direction.x, direction.z) + 180) / CORRIDOR_CELL);
    return cells.has(key(row, col));
  };
}
