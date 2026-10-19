import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe/planet.ts';
import { isShown, radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { townGrid } from '../scenery/grid.ts';
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

/** How far past its square a built town's ground is held tight, in its own cells: its edge slope and a little more. */
const TOWN_TIGHT_RING = 2;

/**
 * Whether a point (a unit vector) is near enough a road, or on a built town's
 * square, that the land drawn under it must keep to the relief the ribbon and
 * the town's floor are laid on: the land mesh's looser inland budget
 * (`setTightGround` in `globe/tessellation.ts`) is not spent there, or the
 * land comes up through a street. Every builder of the land hands in the same
 * network and places.
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
  // Every lattice cell a built town's square and its ring reach.
  for (const place of places) {
    if (!isShown(place)) continue;
    const grid = townGrid(radiusOf(place));
    const reach = grid.half + TOWN_TIGHT_RING * grid.pitch;
    const dLat = (reach / PLANET_RADIUS) * (180 / Math.PI);
    const dLon = dLat / Math.max(0.05, Math.cos((place.lat * Math.PI) / 180));
    const r0 = Math.floor((place.lat - dLat + 90) / CORRIDOR_CELL);
    const r1 = Math.floor((place.lat + dLat + 90) / CORRIDOR_CELL);
    const c0 = Math.floor((place.lon - dLon + 180) / CORRIDOR_CELL);
    const c1 = Math.floor((place.lon + dLon + 180) / CORRIDOR_CELL);
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) cells.add(key(row, col));
  }
  return (direction) => {
    const length = direction.length();
    const row = Math.floor((latOf(direction.y / length) + 90) / CORRIDOR_CELL);
    const col = Math.floor((lonOf(direction.x, direction.z) + 180) / CORRIDOR_CELL);
    return cells.has(key(row, col));
  };
}
