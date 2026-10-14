/** Which countries touch, from the rings' shared vertices. */
import type { World } from '../geo.ts';
import { insideRing } from '../geo.ts';

/**
 * How near two outlines have to come to count as touching, in degrees: two
 * countries touch when they put a ring vertex in the same cell of this size or
 * one of its eight neighbours. A frontier is one run of points carried by
 * both polygons, but `pack.ts` quantises each ring on its own, so shared
 * vertices can differ by a rounding and exact equality misses Andorra's
 * neighbours. The enclave pass in `walkNeighbours` covers rings that share no
 * vertices.
 */
const TOUCH = 0.01;

/** Longitude cells in the snap grid, plus a margin so the 3 by 3 read cannot wrap into the row above. */
const TOUCH_COLS = Math.ceil(360 / TOUCH) + 4;
const TOUCH_ORIGIN = 20000;

/**
 * Ring vertices between two chances to stop: a step is the granularity of the
 * overrun, since the caller's budget is checked after each one.
 */
export const STEP_POINTS = 8000;

/**
 * Finds every pair of touching countries, in steps a caller can spread over
 * frames (it yields progress 0 to 1 after about `STEP_POINTS` vertices).
 * Returns each country's neighbours by country index.
 */
export function* walkNeighbours(world: World): Generator<number, Map<number, number[]>> {
  const rings = world.rings.filter((ring) => !ring.water && ring.country > 0);
  let since = 0;
  // What the three passes below will get through, in the units each of them
  // counts: every vertex twice for the two grid passes, every vertex again for
  // the boxes, and one unit per ring per ring for the enclave test.
  let vertices = 0;
  for (const ring of rings) vertices += ring.points.length;
  const expected = Math.max(1, vertices * 3 + rings.length * rings.length);
  let walked = 0;

  const pairs = new Set<number>();
  const pack = (a: number, b: number): number => (a < b ? a * 512 + b : b * 512 + a);

  // Which country claimed a cell, and the rare cell that more than one did.
  const owner = new Map<number, number>();
  const shared = new Map<number, number[]>();
  for (const ring of rings) {
    for (const point of ring.points) {
      const key =
        (Math.round(point[1]! / TOUCH) + TOUCH_ORIGIN) * TOUCH_COLS + Math.round(point[0]! / TOUCH) + TOUCH_ORIGIN;
      const held = owner.get(key);
      if (held === undefined) owner.set(key, ring.country);
      else if (held !== ring.country) {
        const list = shared.get(key);
        if (list === undefined) shared.set(key, [ring.country]);
        else if (!list.includes(ring.country)) list.push(ring.country);
      }
    }
    since += ring.points.length;
    walked += ring.points.length;
    if (since >= STEP_POINTS) {
      since = 0;
      yield walked / expected;
    }
  }

  for (const ring of rings) {
    const country = ring.country;
    for (const point of ring.points) {
      const cx = Math.round(point[0]! / TOUCH) + TOUCH_ORIGIN;
      const cy = Math.round(point[1]! / TOUCH) + TOUCH_ORIGIN;
      for (let dy = -1; dy <= 1; dy++) {
        const base = (cy + dy) * TOUCH_COLS + cx;
        for (let dx = -1; dx <= 1; dx++) {
          const held = owner.get(base + dx);
          if (held === undefined) continue;
          if (held !== country) pairs.add(pack(country, held));
          const list = shared.get(base + dx);
          if (list !== undefined) for (const other of list) if (other !== country) pairs.add(pack(country, other));
        }
      }
    }
    since += ring.points.length;
    walked += ring.points.length;
    if (since >= STEP_POINTS) {
      since = 0;
      yield walked / expected;
    }
  }

  // The enclaves: each ring's first point against every other country's rings,
  // rejected on the bounding box before the polygon test.
  const boxes = new Float64Array(rings.length * 4);
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i]!;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const p of ring.points) {
      if (p[0]! < west) west = p[0]!;
      if (p[0]! > east) east = p[0]!;
      if (p[1]! < south) south = p[1]!;
      if (p[1]! > north) north = p[1]!;
    }
    boxes[i * 4] = west;
    boxes[i * 4 + 1] = south;
    boxes[i * 4 + 2] = east;
    boxes[i * 4 + 3] = north;
    since += ring.points.length;
    walked += ring.points.length;
    if (since >= STEP_POINTS) {
      since = 0;
      yield walked / expected;
    }
  }
  for (let i = 0; i < rings.length; i++) {
    const point = rings[i]!.points[0]!;
    const x = point[0]!;
    const y = point[1]!;
    for (let j = 0; j < rings.length; j++) {
      if (rings[j]!.country === rings[i]!.country) continue;
      const b = j * 4;
      if (x < boxes[b]! || x > boxes[b + 2]! || y < boxes[b + 1]! || y > boxes[b + 3]!) continue;
      if (insideRing(rings[j]!.points, x, y)) pairs.add(pack(rings[i]!.country, rings[j]!.country));
    }
    since += rings.length;
    walked += rings.length;
    if (since >= STEP_POINTS) {
      since = 0;
      yield walked / expected;
    }
  }

  const out = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    const held = out.get(a);
    if (held === undefined) out.set(a, [b]);
    else held.push(b);
  };
  for (const key of pairs) {
    const a = Math.floor(key / 512);
    const b = key - a * 512;
    link(a, b);
    link(b, a);
  }
  return out;
}

