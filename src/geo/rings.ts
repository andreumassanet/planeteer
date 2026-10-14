// Point-in-polygon over rings: the plain even-odd walk, and the same test over a
// ring's edges bucketed by latitude.

/** Shoelace area of a ring, in square degrees. Sign discarded. */
export function ringArea(points: number[][]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    sum += (b[0]! - a[0]!) * (b[1]! + a[1]!);
  }
  return Math.abs(sum / 2);
}

/**
 * Even-odd ray casting. `x` is longitude and `y` latitude, and the caller clamps
 * latitude the way `resolve` does. Exported because `map.ts` asks the same
 * question of one ring at a time.
 */
export function insideRing(points: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    const yi = a[1]!;
    const yj = b[1]!;
    if (yi > y !== yj > y && x < ((b[0]! - a[0]!) * (y - yi)) / (yj - yi) + a[0]!) {
      inside = !inside;
    }
  }
  return inside;
}

/** A ring's edges bucketed by latitude, for `loadWorld`'s point-in-polygon test. */
export interface RingBands {
  /** The ring's points, longitude and latitude, as flat arrays. */
  xs: Float64Array;
  ys: Float64Array;
  /** Where band `k`'s edges start in `edges`; one longer than the bands. */
  start: Uint32Array;
  /** Per band, the edges whose latitude span reaches it, by their first point's index. */
  edges: Uint32Array;
  low: number;
  step: number;
}

/** Rings shorter than this are walked whole: the index would cost more than it saves. */
const BANDED_POINTS = 48;
/** About how many edges a band holds, on average, of a ring's whole length. */
const EDGES_PER_BAND = 6;

/**
 * Buckets a ring's edges by the latitude bands their span reaches. Edge `a` runs
 * from point `a` to the point before it, the pairing `insideRing` walks. An edge
 * that can toggle the ray at `y` has `min <= y < max`, and
 * `floor((y - low) / step)` is monotone in `y`, so its band is between the bands
 * of its two ends, which is where it is filed.
 */
export function bandIndex(points: number[][], minLat: number, maxLat: number): RingBands | null {
  const n = points.length;
  if (n < BANDED_POINTS) return null;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i]![0]!;
    ys[i] = points[i]![1]!;
  }
  const count = Math.max(1, Math.ceil(n / EDGES_PER_BAND));
  const low = minLat;
  const step = Math.max(1e-9, (maxLat - minLat) / count);
  const bandOf = (y: number): number => Math.min(count - 1, Math.max(0, Math.floor((y - low) / step)));
  const start = new Uint32Array(count + 1);
  for (let a = 0; a < n; a++) {
    const b = a === 0 ? n - 1 : a - 1;
    const k0 = bandOf(Math.min(ys[a]!, ys[b]!));
    const k1 = bandOf(Math.max(ys[a]!, ys[b]!));
    for (let k = k0; k <= k1; k++) start[k + 1]!++;
  }
  for (let k = 0; k < count; k++) start[k + 1]! += start[k]!;
  const edges = new Uint32Array(start[count]!);
  const cursor = start.slice(0, count);
  for (let a = 0; a < n; a++) {
    const b = a === 0 ? n - 1 : a - 1;
    const k0 = bandOf(Math.min(ys[a]!, ys[b]!));
    const k1 = bandOf(Math.max(ys[a]!, ys[b]!));
    for (let k = k0; k <= k1; k++) edges[cursor[k]!++] = a;
  }
  return { xs, ys, start, edges, low, step };
}

/** `insideRing` over a ring's `bandIndex`: the same answer, from the point's band alone. */
export function insideBands(band: RingBands, lon: number, y: number): boolean {
  const { xs, ys, start, edges, low, step } = band;
  const last = start.length - 2;
  const k = Math.min(last, Math.max(0, Math.floor((y - low) / step)));
  const n = xs.length;
  let result = false;
  for (let e = start[k]!; e < start[k + 1]!; e++) {
    const a = edges[e]!;
    const b = a === 0 ? n - 1 : a - 1;
    const yi = ys[a]!;
    const yj = ys[b]!;
    if (yi > y !== yj > y && lon < ((xs[b]! - xs[a]!) * (y - yi)) / (yj - yi) + xs[a]!) result = !result;
  }
  return result;
}
