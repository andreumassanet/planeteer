import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import { courseOf, coursePoint } from './course.ts';
import type { RoadCourse } from './course.ts';
import type { Road } from './types.ts';

/**
 * Longest piece of road treated as a straight chord, and how far that chord
 * may cut inside the curve, in world units. The sag bound (well under the
 * pen's width) keeps a foot from standing on road that is not drawn on a
 * short, tightly bowed lane.
 */
const PATH_STEP = 48;
export const PATH_SAG = 0.05;
/** How many times a chord may halve before its sag is taken as good enough. */
const PATH_DEPTH = 10;

/**
 * A road's course as a polyline, with its length measured along it: the one
 * walk everything that needs distance takes (movers, feet, ribbon stations,
 * keepouts). The approaches are straight; the middle is cut into chords of at
 * most `PATH_STEP`, each halved until its midpoint is within `PATH_SAG` of the
 * curve's.
 */
export interface CoursePath {
  /** `t` at each vertex, 0 at gate A and 1 at gate B. */
  t: Float64Array;
  /** Distance along the path from gate A to each vertex, in world units. */
  s: Float64Array;
  /** Each vertex on the unit sphere, as x, y, z. */
  xyz: Float64Array;
  count: number;
  length: number;
}

const pathA = new THREE.Vector3();
const pathB = new THREE.Vector3();
const pathMid = new THREE.Vector3();
const pathChord = new THREE.Vector3();

export function coursePath(course: RoadCourse): CoursePath {
  const ts: number[] = [0];
  const t0 = course.share;
  const t1 = 1 - course.share;
  if (t0 > 0) ts.push(t0);
  const refine = (ta: number, tb: number, depth: number): void => {
    coursePoint(course, ta, pathA);
    coursePoint(course, tb, pathB);
    const tm = (ta + tb) * 0.5;
    coursePoint(course, tm, pathMid);
    pathChord.addVectors(pathA, pathB).normalize();
    if (depth < PATH_DEPTH && pathMid.distanceTo(pathChord) * PLANET_RADIUS > PATH_SAG) {
      refine(ta, tm, depth + 1);
      refine(tm, tb, depth + 1);
    } else {
      ts.push(tb);
    }
  };
  const middle = Math.max(0, course.length - 2 * course.approach);
  const pieces = Math.max(2, Math.ceil(middle / PATH_STEP));
  for (let k = 0; k < pieces; k++) refine(t0 + ((t1 - t0) * k) / pieces, t0 + ((t1 - t0) * (k + 1)) / pieces, 0);
  if (t1 < 1) ts.push(1);
  const count = ts.length;
  const t = Float64Array.from(ts);
  const s = new Float64Array(count);
  const xyz = new Float64Array(count * 3);
  for (let k = 0; k < count; k++) {
    coursePoint(course, t[k]!, pathA);
    xyz[k * 3] = pathA.x;
    xyz[k * 3 + 1] = pathA.y;
    xyz[k * 3 + 2] = pathA.z;
    if (k > 0) {
      const dx = pathA.x - xyz[k * 3 - 3]!;
      const dy = pathA.y - xyz[k * 3 - 2]!;
      const dz = pathA.z - xyz[k * 3 - 1]!;
      s[k] = s[k - 1]! + Math.sqrt(dx * dx + dy * dy + dz * dz) * PLANET_RADIUS;
    }
  }
  return { t, s, xyz, count, length: s[count - 1]! };
}

/**
 * The tightest radius a course turns through, in world units: the turn
 * between consecutive chords over their mean length. A ribbon folds over
 * itself where this is under its drawn half-width, so the bake refuses such
 * a course and `pnpm check` asserts none ships.
 */
export function tightestTurn(path: CoursePath): number {
  const xyz = path.xyz;
  let tightest = Infinity;
  for (let k = 1; k + 1 < path.count; k++) {
    const ax = xyz[k * 3]! - xyz[k * 3 - 3]!;
    const ay = xyz[k * 3 + 1]! - xyz[k * 3 - 2]!;
    const az = xyz[k * 3 + 2]! - xyz[k * 3 - 1]!;
    const bx = xyz[k * 3 + 3]! - xyz[k * 3]!;
    const by = xyz[k * 3 + 4]! - xyz[k * 3 + 1]!;
    const bz = xyz[k * 3 + 5]! - xyz[k * 3 + 2]!;
    const la = Math.hypot(ax, ay, az);
    const lb = Math.hypot(bx, by, bz);
    if (la < 1e-12 || lb < 1e-12) continue;
    const turn = Math.acos(Math.min(1, Math.max(-1, (ax * bx + ay * by + az * bz) / (la * lb))));
    if (turn < 1e-9) continue;
    const radius = ((la + lb) * 0.5 * PLANET_RADIUS) / turn;
    if (radius < tightest) tightest = radius;
  }
  return tightest;
}

/** The distance along a path from gate A at `t`: `parameterAt` run backwards. */
export function distanceAt(path: CoursePath, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return path.length;
  let low = 0;
  let high = path.count - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (path.t[middle]! <= t) low = middle;
    else high = middle;
  }
  const span = path.t[high]! - path.t[low]!;
  const along = span > 0 ? (t - path.t[low]!) / span : 0;
  return path.s[low]! + (path.s[high]! - path.s[low]!) * along;
}

/** The `t` at a distance `s` along a path from gate A: 0 and 1 at the two gates, exactly. */
export function parameterAt(path: CoursePath, s: number): number {
  if (s <= 0) return 0;
  if (s >= path.length) return 1;
  let low = 0;
  let high = path.count - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (path.s[middle]! <= s) low = middle;
    else high = middle;
  }
  const span = path.s[high]! - path.s[low]!;
  const along = span > 0 ? (s - path.s[low]!) / span : 0;
  return path.t[low]! + (path.t[high]! - path.t[low]!) * along;
}

/**
 * The courses and paths of one network, cached least recently used first out,
 * for the files that walk it every frame (the foot, the movers, the wood, the
 * herds). Shared per network, like `roadIndexFor`.
 */
export interface RoadGeometry {
  course(index: number): RoadCourse;
  path(index: number): CoursePath;
}

/** Entries kept by every per-road cache of a network. */
export const GEOMETRY_CAP = 4096;
let sharedGeometry: { roads: readonly Road[]; places: readonly Place[]; geometry: RoadGeometry } | null = null;

export function roadGeometryFor(roads: readonly Road[], places: readonly Place[]): RoadGeometry {
  if (sharedGeometry !== null && sharedGeometry.roads === roads && sharedGeometry.places === places) {
    return sharedGeometry.geometry;
  }
  const cache = new Map<number, { course: RoadCourse; path: CoursePath | null }>();
  const entry = (index: number): { course: RoadCourse; path: CoursePath | null } => {
    const known = cache.get(index);
    if (known !== undefined) {
      cache.delete(index);
      cache.set(index, known);
      return known;
    }
    const made = { course: courseOf(roads[index]!, places), path: null };
    cache.set(index, made);
    if (cache.size > GEOMETRY_CAP) cache.delete(cache.keys().next().value!);
    return made;
  };
  const geometry: RoadGeometry = {
    course: (index) => entry(index).course,
    path(index) {
      const found = entry(index);
      found.path ??= coursePath(found.course);
      return found.path;
    },
  };
  sharedGeometry = { roads, places, geometry };
  return geometry;
}
