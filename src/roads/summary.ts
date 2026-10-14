import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import { courseOf, coursePoint, emptyCourse } from './course.ts';
import type { Road } from './types.ts';

/**
 * Per road, worked out once from its course (not its two places, since a
 * gate facing away swings the road out past its end): its middle, its length,
 * how far its course reaches from the middle (nine samples plus a sixteenth
 * of its length), and the three points it is priced at for drawing (the two
 * gates and the middle, on the sea-level sphere, in world units).
 */
export interface RoadSummary {
  middles: Float64Array;
  lengths: Float64Array;
  /** Angle from the middle to the furthest point of the course, in radians. */
  reachOf: Float64Array;
  /** Nine numbers a road: gate A, gate B and the middle, x y z each. */
  samples: Float64Array;
  readMiddle(index: number, target: THREE.Vector3): THREE.Vector3;
}

export function summarizeRoads(roads: readonly Road[], places: readonly Place[]): RoadSummary {
  const middles = new Float64Array(roads.length * 3);
  const lengths = new Float64Array(roads.length);
  const reachOf = new Float64Array(roads.length);
  const samples = new Float64Array(roads.length * 9);
  const course = emptyCourse();
  const mid = new THREE.Vector3();
  const at = new THREE.Vector3();
  roads.forEach((road, i) => {
    courseOf(road, places, course);
    coursePoint(course, 0.5, mid);
    middles[i * 3] = mid.x;
    middles[i * 3 + 1] = mid.y;
    middles[i * 3 + 2] = mid.z;
    lengths[i] = course.length;
    let reach = 0;
    for (let k = 0; k <= 8; k++) reach = Math.max(reach, mid.angleTo(coursePoint(course, k / 8, at)));
    reachOf[i] = reach + course.length / 16 / PLANET_RADIUS;
    for (const [k, v] of [course.gateA, course.gateB, mid].entries()) {
      samples[i * 9 + k * 3] = v.x * PLANET_RADIUS;
      samples[i * 9 + k * 3 + 1] = v.y * PLANET_RADIUS;
      samples[i * 9 + k * 3 + 2] = v.z * PLANET_RADIUS;
    }
  });
  const readMiddle = (index: number, target: THREE.Vector3): THREE.Vector3 =>
    target.set(middles[index * 3]!, middles[index * 3 + 1]!, middles[index * 3 + 2]!);
  return { middles, lengths, reachOf, samples, readMiddle };
}
