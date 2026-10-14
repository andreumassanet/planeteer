import { latLonOf, toUnit } from '../../sphere.ts';
import { type Seeds, judge } from './seeds.ts';

/** Degrees a lattice cell. */
export const STEP = 0.5;
export const NX = Math.round(360 / STEP);
export const NY = Math.round(180 / STEP);
/** Cells a side of the coarse block the lattice is first judged in. */
export const BLOCK = 4;

/**
 * Every cell's nation, judged where it has to be.
 *
 * Judging all 259,200 cells costs most of a second, and nearly all of them are
 * deep inside a nation. So the truth is first sampled at the corners of
 * two-degree blocks, and a block is filled whole when every corner within one
 * block of it agrees and no seed stands in it; the rest — the blocks a
 * frontier is near, and every block a seed is in, so no enclave smaller than
 * a block can fall between the corners — are judged cell by cell.
 */
export function labelLattice(seeds: Seeds): Int16Array {
  const labels = new Int16Array(NX * NY);
  const BX = NX / BLOCK;
  const BY = NY / BLOCK;
  const corner = new Int16Array((BX + 1) * (BY + 1));
  const unit: number[] = [0, 0, 0];
  for (let b = 0; b <= BY; b++) {
    for (let a = 0; a <= BX; a++) {
      toUnit(-90 + b * BLOCK * STEP, -180 + a * BLOCK * STEP, unit);
      corner[b * (BX + 1) + a] = judge(seeds, unit[0]!, unit[1]!, unit[2]!);
    }
  }
  const seeded = new Uint8Array(BX * BY);
  for (let k = 0; k < seeds.x.length; k++) {
    const { lat, lon } = latLonOf({ x: seeds.x[k]!, y: seeds.y[k]!, z: seeds.z[k]! });
    const a = Math.min(BX - 1, Math.max(0, Math.floor((lon + 180) / (BLOCK * STEP))));
    const b = Math.min(BY - 1, Math.max(0, Math.floor((lat + 90) / (BLOCK * STEP))));
    seeded[b * BX + a] = 1;
  }
  for (let b = 0; b < BY; b++) {
    for (let a = 0; a < BX; a++) {
      let uniform = seeded[b * BX + a] === 0;
      const first = corner[b * (BX + 1) + a]!;
      for (let bb = Math.max(0, b - 1); uniform && bb <= Math.min(BY, b + 2); bb++) {
        for (let da = -1; da <= 2; da++) {
          // Longitude wraps; the corner at a = BX is the one at a = 0.
          const aa = (((a + da) % BX) + BX) % BX;
          if (corner[bb * (BX + 1) + aa] !== first) {
            uniform = false;
            break;
          }
        }
      }
      for (let j = b * BLOCK; j < (b + 1) * BLOCK; j++) {
        for (let i = a * BLOCK; i < (a + 1) * BLOCK; i++) {
          if (uniform) {
            labels[j * NX + i] = first;
          } else {
            toUnit(-90 + (j + 0.5) * STEP, -180 + (i + 0.5) * STEP, unit);
            labels[j * NX + i] = judge(seeds, unit[0]!, unit[1]!, unit[2]!);
          }
        }
      }
    }
  }
  return labels;
}

export const VX = NX + 1;
/** A lattice vertex: column `i` of `0..NX`, row `j` of `0..NY`. */
export const vertex = (i: number, j: number): number => j * VX + i;
export const lonAt = (v: number): number => -180 + (v % VX) * STEP;
export const latAt = (v: number): number => -90 + Math.floor(v / VX) * STEP;

/** Undirected lattice edges: horizontal ones first, then vertical. */
export const H_EDGES = NX * (NY + 1);
export const hEdge = (i: number, j: number): number => j * NX + i;
export const vEdge = (i: number, j: number): number => H_EDGES + j * VX + i;
