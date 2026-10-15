import * as THREE from 'three';
import { LAND_HEIGHT } from '../geo.ts';
import { RELIEF_DETAIL, flattenWeightAt, reliefAt, shoreAt, shoreSample } from '../terrain.ts';
import { PLANET_RADIUS, WORLD_SCALE, angleForSag, onSphere } from './planet.ts';

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

/**
 * Largest gap allowed between the mesh and `reliefAt`, world units, tested at
 * edge midpoints: on the shore ramp and on tight ground (`inlandAt`).
 */
const RELIEF_SAG = 3;
/**
 * The same, inland: off the shore ramp and off tight ground (`setTightGround`).
 * The ramp keeps `RELIEF_SAG`, which `SHORE_LIP` is floored by; inland the
 * drawn land is what everything stands on (`drawnRadius`), so the gap is a
 * matter of shape: a sixth of the downs' height, which keeps the hills and
 * takes the land mesh from about 2.27 M triangles to 1.62 M.
 */
const RELIEF_SAG_INLAND = 7.5;

/** The tighter budget under a monument's pad, where a flat model stands on the mesh. */
const PAD_SAG = 0.6;

/**
 * Floor on edge length, radians: below it a smaller triangle is not more
 * mountain. 0.08 degrees of the nominal planet, about 22 units, held in units so
 * a town's floor and a pad keep the resolution they were built against.
 */
export const MIN_EDGE = (0.08 * DEG) / WORLD_SCALE;

/**
 * The floor at the rim of a pad. A triangle with one corner on the pad and the
 * rest on the skirt cuts across the lip, so the rim needs finer triangles.
 */
export const PAD_MIN_EDGE = MIN_EDGE / 3;

/** Error budget for a point, given how strongly a pad claims it and how far inland it is (`inlandAt`). */
export function sagFor(pad: number, inland: number): number {
  const open = RELIEF_SAG + (RELIEF_SAG_INLAND - RELIEF_SAG) * inland;
  return open - (open - PAD_SAG) * pad;
}

/**
 * Where the drawn land must keep to the relief whatever its distance from the
 * sea: a road's corridor (`roadCorridors`), whose ribbon is laid on the relief.
 * Set by `buildLand` for the length of one build.
 */
let tightGround: ((point: THREE.Vector3) => boolean) | null = null;

export function setTightGround(tight: ((point: THREE.Vector3) => boolean) | null): void {
  tightGround = tight;
}

/** How finely an edge is walked for tight ground, units: well under a corridor's width and the shore ramp's. */
const TIGHT_STEP = 20;
const tightProbe = new THREE.Vector3();
const tightWalk = new THREE.Vector3();
const tightShore = shoreSample();

/** Whether the drawn land must keep `RELIEF_SAG` at a point: on the shore ramp, or on `tightGround`. */
function tightAt(point: THREE.Vector3): boolean {
  if (tightGround !== null && tightGround(point)) return true;
  tightProbe.copy(point).normalize();
  return shoreAt(tightProbe.x, tightProbe.y, tightProbe.z, tightShore).fall > 0;
}

/**
 * How much of `RELIEF_SAG_INLAND` an edge from `a` to `b` may use, judged at
 * its midpoint `mid`: none if any of it crosses tight ground, since the error
 * is measured at the middle while a road or the shore may be under any part.
 */
export function inlandAlong(a: THREE.Vector3, b: THREE.Vector3, mid: THREE.Vector3): number {
  const steps = Math.max(1, Math.ceil((a.angleTo(b) * PLANET_RADIUS) / TIGHT_STEP));
  for (let k = 0; k <= steps; k++) {
    if (tightAt(tightWalk.copy(a).lerp(b, k / steps))) return 0;
  }
  return inlandAt(mid);
}

/** 0 on the shore ramp or on tight ground, else 1: how much of `RELIEF_SAG_INLAND` a point may use. */
export function inlandAt(point: THREE.Vector3): number {
  return tightAt(point) ? 0 : 1;
}

/** Shortest edge worth building there, by the same grading. */
export function floorFor(pad: number): number {
  return MIN_EDGE - (MIN_EDGE - PAD_MIN_EDGE) * pad;
}

/** Error budget at a point: `RELIEF_SAG`, looser inland, tightening to `PAD_SAG` under a pad. */
function sagAt(point: THREE.Vector3): number {
  return sagFor(flattenWeightAt(point.x, point.y, point.z), inlandAt(point));
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
