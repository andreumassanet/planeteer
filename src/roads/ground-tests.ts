import * as THREE from 'three';
import { LANDMARK_KEEP, landmarkGap } from '../landmark-ground.ts';
import type { Place } from '../places.ts';
import { MAX_SLOPE, gradeAt } from '../terrain.ts';
import type { Slope } from '../terrain.ts';
import { roadClearance } from './classes.ts';
import { courseOf, coursePoint, courseTangent, emptyCourse } from './course.ts';
import type { RoadCourse } from './course.ts';
import { coursePath, distanceAt } from './path.ts';
import type { Road } from './types.ts';

/**
 * The walks along a course that decide whether a road can exist. The bake
 * runs them to choose roads and `pnpm check` re-runs them over the shipped
 * file, so both must use these exact strides and counts.
 */

/**
 * How often the water test probes the ground, in world units: fine enough to
 * catch the narrowest straits the 1:10m outlines draw.
 */
export const WATER_PROBE_STEP = 2;

/** How many steps the water walk takes over a course: `steps + 1` probes, both gates included. */
export function waterProbeSteps(course: RoadCourse): number {
  return Math.max(2, Math.ceil(course.length / WATER_PROBE_STEP));
}

/** How often the slope test probes, in world units; each probe spans the road's half-width. */
const SLOPE_STEP = 18;

const slopeAt = new THREE.Vector3();
const slopeAhead = new THREE.Vector3();
const slopeSide = new THREE.Vector3();
const slopeNorth = new THREE.Vector3();
const slopeCourse = emptyCourse();
const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };

/**
 * Whether a road crosses ground steeper than `MAX_SLOPE` anywhere in its
 * interior. All or nothing: two towns are joined only if the road between
 * them never crosses a mountain. The two ends are gates, whose ground is the
 * town's own cut and is tested by `gateOpen` instead.
 */
export function crossesScree(road: Road, places: readonly Place[]): boolean {
  return screeAt(road, places) >= 0;
}

/**
 * Where `crossesScree` first finds a road too steep, as the course's `t`, or
 * -1. The bake reads where: a mountain beside a gate can be avoided by
 * another gate, one in the middle cannot.
 */
export function screeAt(road: Road, places: readonly Place[]): number {
  const course = courseOf(road, places, slopeCourse);
  const steps = Math.max(2, Math.ceil(course.length / SLOPE_STEP));
  const reach = roadClearance(road.cls);
  // A bridge's water and its shores are the deck's: nothing stands on the ground there.
  const bridged = road.bridgeTo > road.bridgeFrom;
  const path = bridged ? coursePath(course) : null;
  for (let step = 1; step < steps; step++) {
    const t = step / steps;
    if (path !== null) {
      const s = distanceAt(path, t);
      if (s > road.bridgeFrom - SLOPE_STEP && s < road.bridgeTo + SLOPE_STEP) continue;
    }
    coursePoint(course, t, slopeAt);
    // The road's own frame, so `gradeAt`'s four probes straddle the carriageway.
    courseTangent(course, t, slopeAhead);
    slopeSide.crossVectors(slopeAt, slopeAhead).normalize();
    slopeNorth.crossVectors(slopeSide, slopeAt).normalize();
    if (gradeAt(slopeAt, slopeSide, slopeNorth, reach, slope).grade > MAX_SLOPE) return t;
  }
  return -1;
}

const landmarkCourse = emptyCourse();
const landmarkProbe = new THREE.Vector3();

/**
 * Where a road's course first comes within `LANDMARK_KEEP` of a registered
 * landmark's plan, as the course's `t`, or -1. Walked at the water test's
 * stride over the whole course, gates included.
 */
export function landmarkAt(road: Road, places: readonly Place[]): number {
  const course = courseOf(road, places, landmarkCourse);
  const steps = waterProbeSteps(course);
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    coursePoint(course, t, landmarkProbe);
    landmarkProbe.normalize();
    if (landmarkGap(landmarkProbe) < LANDMARK_KEEP) return t;
  }
  return -1;
}
