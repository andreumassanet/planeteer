import { hash2 } from '../map-features/noise.ts';
import { TILE } from './projection.ts';

/**
 * The paper's grain: value noise on lattices fixed to a level's pixels, so two
 * tiles of one level agree along their seam. A cell divides `TILE`.
 */
export interface Grain {
  readonly cell: number;
  readonly n: number;
  readonly values: Float32Array;
}

/** The lattice of one cell size over the tile `(i, j)`, one row and column past it. */
export function grainOf(i: number, j: number, cell: number, seed: number): Grain {
  const per = TILE / cell;
  const n = per + 2;
  const values = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) values[y * n + x] = hash2(i * per + x + seed, j * per + y - seed * 1.7);
  }
  return { cell, n, values };
}

/** The grain at a pixel of the tile, smoothed between its lattice points, 0 to 1. */
export function grainAt(grain: Grain, x: number, y: number): number {
  const gx = x / grain.cell;
  const gy = y / grain.cell;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  let fx = gx - ix;
  let fy = gy - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const v = grain.values;
  const k = iy * grain.n + ix;
  return (v[k]! + (v[k + 1]! - v[k]!) * fx) * (1 - fy) + (v[k + grain.n]! + (v[k + grain.n + 1]! - v[k + grain.n]!) * fx) * fy;
}

/**
 * The relief's contour interval at a level, in the relief's units: the level's
 * own scale at the equator over `CONTOUR_PIXELS` pixels, so lines come a few
 * pixels apart on a mountain's flank at any zoom. A function of the level alone, so
 * a line crosses a seam between two tiles of it.
 */
export function contourInterval(z: number, unitsPerPixelAtZero: number): number {
  return Math.min(CONTOUR_MAX, Math.max(CONTOUR_MIN, (unitsPerPixelAtZero / 2 ** z) * CONTOUR_PIXELS));
}
const CONTOUR_PIXELS = 1.3;
const CONTOUR_MIN = 4;
const CONTOUR_MAX = 320;
