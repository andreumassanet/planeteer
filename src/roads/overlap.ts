import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import { SIDEWALK } from '../scenery/ground.ts';
import { ROAD_CLASSES, roadClearance } from './classes.ts';
import { courseOf, coursePoint, emptyCourse } from './course.ts';
import { crownLift, needsCentre } from './crown.ts';
import type { RoadRamp } from './crown.ts';
import { PATH_SAG, coursePath } from './path.ts';
import type { CoursePath } from './path.ts';
import { ribbonHalf } from './section.ts';
import { createRoadIndex } from './spatial-index.ts';
import type { RoadIndex } from './spatial-index.ts';
import type { Road } from './types.ts';

/**
 * Where two roads' drawn surfaces overlap: which is drawn in front (depth
 * layers), and the queries a road's paint and roadside use to give way to
 * the other road's top.
 */

/**
 * How far one depth layer pushes a ribbon back, in clip-space depth. Two
 * ribbons sharing an approach are coplanar at the same height, so the shader
 * moves each layer back after projection instead. 1e-6 is about eight quanta
 * of a 24-bit depth buffer at any distance: enough to resolve two coplanar
 * ribbons and less than anything genuinely in front.
 */
export const LAYER_DEPTH = 1e-6;

/**
 * Whether road `q` is drawn in front of road `r` where the two overlap: the
 * higher class, and between two of a class the lower index (the bake's order).
 */
export function outranks(roads: readonly Road[], q: number, r: number): boolean {
  const a = roads[q]!.cls;
  const b = roads[r]!.cls;
  return a > b || (a === b && q < r);
}

/** The nearest two segments come, on the unit sphere: Ericson's closest points between segments. */
function segmentGap(
  p1x: number, p1y: number, p1z: number, q1x: number, q1y: number, q1z: number,
  p2x: number, p2y: number, p2z: number, q2x: number, q2y: number, q2z: number,
): number {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const clamp = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  let s = 0;
  let t = 0;
  if (a <= 1e-24 && e <= 1e-24) {
    s = 0;
    t = 0;
  } else if (a <= 1e-24) {
    t = clamp(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-24) {
      s = clamp(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-30 ? clamp((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  return Math.hypot(rx + d1x * s - d2x * t, ry + d1y * s - d2y * t, rz + d1z * s - d2z * t);
}

/**
 * How near chord `k` of one path comes to any chord of another, in world
 * units, or `limit` if no nearer. Chord pairs whose midpoints are further
 * apart than their half-lengths and the best so far are skipped.
 */
export function chordGap(from: CoursePath, k: number, to: CoursePath, limit = Infinity): number {
  const f = from.xyz;
  const g = to.xyz;
  const px = f[k * 3 - 3]!;
  const py = f[k * 3 - 2]!;
  const pz = f[k * 3 - 1]!;
  const qx = f[k * 3]!;
  const qy = f[k * 3 + 1]!;
  const qz = f[k * 3 + 2]!;
  const mx = (px + qx) * 0.5;
  const my = (py + qy) * 0.5;
  const mz = (pz + qz) * 0.5;
  const half = Math.hypot(qx - px, qy - py, qz - pz) * 0.5;
  let best = limit / PLANET_RADIUS;
  for (let j = 1; j < to.count; j++) {
    const ux = g[j * 3 - 3]!;
    const uy = g[j * 3 - 2]!;
    const uz = g[j * 3 - 1]!;
    const vx = g[j * 3]!;
    const vy = g[j * 3 + 1]!;
    const vz = g[j * 3 + 2]!;
    const reach = half + Math.hypot(vx - ux, vy - uy, vz - uz) * 0.5;
    if (Math.hypot(mx - (ux + vx) * 0.5, my - (uy + vy) * 0.5, mz - (uz + vz) * 0.5) - reach >= best) continue;
    const gap = segmentGap(px, py, pz, qx, qy, qz, ux, uy, uz, vx, vy, vz);
    if (gap < best) best = gap;
  }
  return best * PLANET_RADIUS;
}

/** Whether any part of one path comes within `reach` world units of any part of another. */
export function pathsOverlap(a: CoursePath, b: CoursePath, reach: number): boolean {
  for (let k = 1; k < a.count; k++) if (chordGap(a, k, b, reach) < reach) return true;
  return false;
}

/**
 * Every road's depth layer: 0 where no higher-ranking road overlaps it, else
 * one behind the deepest of those that do. Overlap is the two drawn strips
 * (`roadClearance` each plus the paths' sag). Walked in `outranks` order so
 * every road a road must sit behind already has its layer. Baked by
 * `build-roads.ts` and recomputed by `pnpm check`.
 */
export function layersOf(roads: readonly Road[], places: readonly Place[]): Uint8Array {
  const layers = new Uint8Array(roads.length);
  const course = emptyCourse();
  const paths: CoursePath[] = [];
  const middles: THREE.Vector3[] = [];
  roads.forEach((road) => {
    courseOf(road, places, course);
    paths.push(coursePath(course));
    middles.push(coursePoint(course, 0.5, new THREE.Vector3()));
  });
  const index = createRoadIndex(roads, places);
  const order = roads.map((_, i) => i).sort((x, y) => roads[y]!.cls - roads[x]!.cls || x - y);
  const done = new Uint8Array(roads.length);
  const hits: number[] = [];
  const widest = roadClearance(ROAD_CLASSES.length - 1);
  const slack = 2 * PATH_SAG + 0.1;
  for (const r of order) {
    const path = paths[r]!;
    const clear = roadClearance(roads[r]!.cls);
    let layer = 0;
    for (const q of index.near(middles[r]!, path.length * 0.5 + clear + widest + slack, hits)) {
      // Only a road already walked outranks this one.
      if (done[q] === 0 || layers[q]! + 1 <= layer) continue;
      if (pathsOverlap(path, paths[q]!, clear + roadClearance(roads[q]!.cls) + slack)) layer = layers[q]! + 1;
    }
    layers[r] = Math.min(255, layer);
    done[r] = 1;
  }
  return layers;
}

/**
 * Another road whose drawn top comes near this one's: where it runs, half its
 * carriageway, its ramp (which says how wide its top is where), and whether it
 * is drawn in front where they overlap. A road's paint and roadside give way
 * to these.
 */
export interface OtherRoad {
  path: CoursePath;
  half: number;
  ramp: RoadRamp;
  front: boolean;
}

/**
 * The roads whose drawn top comes within reach of road `index`'s roadside. A
 * pure function of the network, so the ribbon, the roadside and `pnpm check`
 * find the same ones.
 */
export function otherRoadsOf(
  roads: readonly Road[],
  index: number,
  near: RoadIndex,
  pathOf: (i: number) => CoursePath,
  rampFor: (i: number) => RoadRamp,
  middle: THREE.Vector3,
): OtherRoad[] {
  const path = pathOf(index);
  const road = roads[index]!;
  const found: OtherRoad[] = [];
  const widest = (ROAD_CLASSES[ROAD_CLASSES.length - 1]!.width) * 0.5 + SIDEWALK;
  const hits: number[] = [];
  for (const q of near.near(middle, path.length * 0.5 + roadClearance(road.cls) + widest + 1, hits)) {
    if (q === index) continue;
    const other = roads[q]!;
    const half = (ROAD_CLASSES[other.cls] ?? ROAD_CLASSES[0]!).width * 0.5;
    const pathQ = pathOf(q);
    if (!pathsOverlap(path, pathQ, roadClearance(road.cls) + half + SIDEWALK + 1)) continue;
    found.push({ path: pathQ, half, ramp: rampFor(q), front: outranks(roads, q, index) });
  }
  return found;
}

const nearestStart = new THREE.Vector3();
const nearestLeg = new THREE.Vector3();
const nearestFoot = new THREE.Vector3();

/**
 * Where a path comes nearest a direction: how far off in world units and how
 * far along, into `into`. `distance` is Infinity when the nearest point is
 * past either end, because past a gate's kerb the point is in the town.
 */
export function nearestOnPath(path: CoursePath, direction: THREE.Vector3, into: { distance: number; s: number }): { distance: number; s: number } {
  let best = Infinity;
  let bestS = 0;
  let capped = false;
  for (let k = 1; k < path.count; k++) {
    nearestStart.set(path.xyz[k * 3 - 3]!, path.xyz[k * 3 - 2]!, path.xyz[k * 3 - 1]!);
    nearestLeg.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!).sub(nearestStart);
    const lengthSq = nearestLeg.lengthSq();
    const raw = lengthSq > 0 ? nearestFoot.copy(direction).sub(nearestStart).dot(nearestLeg) / lengthSq : 0;
    const along = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    nearestFoot.copy(nearestStart).addScaledVector(nearestLeg, along).normalize();
    const distance = nearestFoot.distanceTo(direction) * PLANET_RADIUS;
    if (distance < best) {
      best = distance;
      bestS = path.s[k - 1]! + (path.s[k]! - path.s[k - 1]!) * along;
      capped = (k === 1 && raw < 0) || (k === path.count - 1 && raw > 1);
    }
  }
  into.distance = capped ? Infinity : best;
  into.s = bestS;
  return into;
}

const roofDirection = new THREE.Vector3();
const roofCentre = new THREE.Vector3();
const roofNearest = { distance: 0, s: 0 };

/**
 * The highest any of `others` stands under `point`, as a radius: each one's
 * crown wherever the point is on its top, 0 where it is on none.
 */
export function othersRoofline(
  others: readonly OtherRoad[],
  point: THREE.Vector3,
  world: World,
): number {
  if (others.length === 0) return 0;
  roofDirection.copy(point).normalize();
  let highest = 0;
  let ground = NaN;
  for (const other of others) {
    nearestOnPath(other.path, roofDirection, roofNearest);
    if (roofNearest.distance === Infinity || roofNearest.distance > otherTop(other, roofNearest.s)) continue;
    if (Number.isNaN(ground)) ground = world.elevationAt(roofDirection);
    const sB = other.path.length - roofNearest.s;
    let centre = ground;
    if (needsCentre(other.ramp, roofNearest.s, sB)) {
      pathPointAt(other.path, roofNearest.s, roofCentre);
      centre = world.elevationAt(roofCentre);
    }
    highest = Math.max(highest, PLANET_RADIUS + ground + crownLift(other.ramp, roofNearest.s, sB, ground, centre));
  }
  return highest;
}

/** The point `s` along a path, on its chords, as a unit vector. */
function pathPointAt(path: CoursePath, s: number, into: THREE.Vector3): THREE.Vector3 {
  let k = 1;
  while (k < path.count - 1 && path.s[k]! < s) k++;
  const s0 = path.s[k - 1]!;
  const s1 = path.s[k]!;
  const u = s1 > s0 ? Math.min(1, Math.max(0, (s - s0) / (s1 - s0))) : 0;
  into.set(path.xyz[k * 3 - 3]!, path.xyz[k * 3 - 2]!, path.xyz[k * 3 - 1]!);
  nearestLeg.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!);
  return into.lerp(nearestLeg, u).normalize();
}

const insideDirection = new THREE.Vector3();
const insideNearest = { distance: 0, s: 0 };

/**
 * How far inside the other roads a point is, in world units: the most any
 * reaches past it, where `width(other, s)` is how far from its centre line
 * that one counts at `s` (a negative width leaves it out). Negative means
 * outside all of them. `point` may be at any radius.
 */
export function insideOthers(
  others: readonly OtherRoad[],
  point: THREE.Vector3,
  width: (other: OtherRoad, s: number) => number,
): number {
  if (others.length === 0) return -Infinity;
  insideDirection.copy(point).normalize();
  let most = -Infinity;
  for (const other of others) {
    nearestOnPath(other.path, insideDirection, insideNearest);
    if (insideNearest.distance === Infinity) continue;
    const reach = width(other, insideNearest.s);
    if (reach < 0) continue;
    most = Math.max(most, reach - insideNearest.distance);
  }
  return most;
}

/** The top of another road at `s` along it: its carriageway and its shoulder or pavement. */
export function otherTop(other: OtherRoad, s: number): number {
  return ribbonHalf(other.ramp, other.half, s, other.path.length - s);
}
