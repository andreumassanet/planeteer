import { latAt, lonAt } from './lattice.ts';

/** Douglas–Peucker's tolerance on a frontier, degrees. */
export const SIMPLIFY = 0.15;
/** Rounds of Chaikin's corner cutting after it. */
export const CHAIKIN = 2;

/** Perpendicular distance of `p` from the segment `a`-`b`, degrees of lon/lat. */
function offSegment(p: number[], a: number[], b: number[]): number {
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return Math.hypot(p[0]! - a[0]!, p[1]! - a[1]!);
  const t = Math.max(0, Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / length2));
  return Math.hypot(p[0]! - a[0]! - t * dx, p[1]! - a[1]! - t * dy);
}

/** Douglas–Peucker over an open line, its two ends kept. */
export function simplify(points: number[][], tolerance: number): number[][] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = offSegment(points[i]!, points[a]!, points[b]!);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Chaikin's corner cutting; an open line keeps its two ends, a closed one has none. */
export function chaikin(points: number[][], closed: boolean): number[][] {
  const n = points.length;
  if (n < 3) return points;
  const out: number[][] = closed ? [] : [points[0]!];
  const segments = closed ? n : n - 1;
  for (let s = 0; s < segments; s++) {
    const a = points[s]!;
    const b = points[(s + 1) % n]!;
    out.push([0.75 * a[0]! + 0.25 * b[0]!, 0.75 * a[1]! + 0.25 * b[1]!]);
    out.push([0.25 * a[0]! + 0.75 * b[0]!, 0.25 * a[1]! + 0.75 * b[1]!]);
  }
  if (!closed) {
    // The first and last cuts sit a quarter of the way along the end
    // segments; the ends themselves are junctions and must not move.
    out.splice(1, 1);
    out.splice(out.length - 1, 1);
    out.push(points[n - 1]!);
  }
  return out;
}

/** A staircase's corners cut: its steps' midpoints, between its two ends. */
export function midpoints(vertices: readonly number[], closed: boolean): number[][] {
  const out: number[][] = [];
  if (!closed) out.push([lonAt(vertices[0]!), latAt(vertices[0]!)]);
  const n = vertices.length;
  const segments = closed ? n : n - 1;
  for (let s = 0; s < segments; s++) {
    const a = vertices[s]!;
    const b = vertices[(s + 1) % n]!;
    out.push([(lonAt(a) + lonAt(b)) / 2, (latAt(a) + latAt(b)) / 2]);
  }
  if (!closed) out.push([lonAt(vertices[n - 1]!), latAt(vertices[n - 1]!)]);
  return out;
}

/** A straight run's corners only: the points where it turns. */
export function corners(vertices: readonly number[], closed: boolean): number[][] {
  const n = vertices.length;
  const out: number[][] = [];
  for (let s = 0; s < n; s++) {
    const v = vertices[s]!;
    if ((s === 0 || s === n - 1) && !closed) {
      out.push([lonAt(v), latAt(v)]);
      continue;
    }
    const before = vertices[(s - 1 + n) % n]!;
    const after = vertices[(s + 1) % n]!;
    const turns = (lonAt(v) - lonAt(before)) * (latAt(after) - latAt(v)) - (latAt(v) - latAt(before)) * (lonAt(after) - lonAt(v));
    if (turns !== 0) out.push([lonAt(v), latAt(v)]);
  }
  return out;
}

/** A closed line's smoothing, split at two far points so Douglas–Peucker has ends to hold. */
export function smoothClosed(points: number[][]): number[][] {
  let far = 0;
  let worst = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i]![0]! - points[0]![0]!, points[i]![1]! - points[0]![1]!);
    if (d > worst) {
      worst = d;
      far = i;
    }
  }
  const one = simplify(points.slice(0, far + 1), SIMPLIFY);
  const two = simplify([...points.slice(far), points[0]!], SIMPLIFY);
  let line = [...one, ...two.slice(1, -1)];
  for (let round = 0; round < CHAIKIN; round++) line = chaikin(line, true);
  return line;
}
