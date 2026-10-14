import * as THREE from 'three';
import { LAND_HEIGHT } from '../geo.ts';
import { RELIEF_DETAIL, flattenWeightAt, reliefAt } from '../terrain.ts';
import { angleForSag, onSphere } from './planet.ts';

// Tessellation limits for the land mesh. Edges are split until they are short
// enough and close enough to the relief; the mesh stays watertight because the
// verdict on an edge depends only on the edge.

export const DEG = Math.PI / 180;

/**
 * Longest edge allowed in the land mesh, radians. Two cells of the finest relief
 * octave: a longer triangle can span a hill without either end noticing, since
 * the error test only looks at ends.
 */
export const MAX_EDGE = Math.min(angleForSag(LAND_HEIGHT * 0.5), RELIEF_DETAIL * 2);

/** Largest gap allowed between the mesh and `reliefAt`, world units, tested at edge midpoints. */
const RELIEF_SAG = 3;

/** The tighter budget under a monument's pad, where a flat model stands on the mesh. */
const PAD_SAG = 0.6;

/** Floor on edge length: below it a smaller triangle is not more mountain. */
export const MIN_EDGE = 0.08 * DEG;

/**
 * The floor at the rim of a pad. A triangle with one corner on the pad and the
 * rest on the skirt cuts across the lip, so the rim needs finer triangles.
 */
export const PAD_MIN_EDGE = MIN_EDGE / 3;

/** Error budget for a point, given how strongly a pad claims it. */
export function sagFor(pad: number): number {
  return RELIEF_SAG - (RELIEF_SAG - PAD_SAG) * pad;
}

/** Shortest edge worth building there, by the same grading. */
export function floorFor(pad: number): number {
  return MIN_EDGE - (MIN_EDGE - PAD_MIN_EDGE) * pad;
}

/** Error budget at a point: `RELIEF_SAG`, tightening to `PAD_SAG` under a pad. */
function sagAt(point: THREE.Vector3): number {
  return sagFor(flattenWeightAt(point.x, point.y, point.z));
}

/** Relief at a point given in degrees. */
function reliefAtLonLat(lon: number, lat: number, scratch: THREE.Vector3): number {
  onSphere(lon, lat, scratch);
  return reliefAt(scratch.x, scratch.y, scratch.z);
}

/**
 * Worst gap between the relief along an edge and `steps` straight spans of it,
 * as a fraction of the budget allowed at each span's own middle. Sampled at each
 * span's middle, the same point `refine` tests, so both agree about a ring edge.
 */
function edgeReliefError(p: number[], q: number[], steps: number, scratch: THREE.Vector3): number {
  const lon = q[0]! - p[0]!;
  const lat = q[1]! - p[1]!;
  let previous = reliefAtLonLat(p[0]!, p[1]!, scratch);
  let worst = 0;
  for (let k = 0; k < steps; k++) {
    const t = (k + 1) / steps;
    const next = reliefAtLonLat(p[0]! + lon * t, p[1]! + lat * t, scratch);
    const middle = (k + 0.5) / steps;
    const centre = reliefAtLonLat(p[0]! + lon * middle, p[1]! + lat * middle, scratch);
    worst = Math.max(worst, Math.abs(centre - (previous + next) * 0.5) / sagAt(scratch));
    previous = next;
  }
  return worst;
}

/**
 * Splits ring edges until none spans more than `MAX_EDGE` nor misses the relief
 * by more than the budget.
 *
 * Done before triangulating so the coast's edges never need splitting later:
 * the surface boundary stays identical to the ring the walls are built from.
 * The count depends on the edge alone, so two countries sharing a border split
 * it in the same places.
 */
export function densify(points: number[][]): number[][] {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const out: number[][] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    out.push(p);
    const span = onSphere(p[0]!, p[1]!, a).angleTo(onSphere(q[0]!, q[1]!, b));
    let steps = Math.max(1, Math.ceil(span / MAX_EDGE));
    // Keep doubling while the relief misses the budget. The 0.98 margin makes
    // this stricter than `refine`, which measures from the chord instead of
    // lon/lat; the floor is `refine`'s finest, so a boundary edge it would
    // split here is never left for it.
    while (steps * 2 * PAD_MIN_EDGE <= span && edgeReliefError(p, q, steps, scratch) > 0.98) {
      steps *= 2;
    }
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      out.push([p[0]! + (q[0]! - p[0]!) * t, p[1]! + (q[1]! - p[1]!) * t]);
    }
  }
  return out;
}
