import { cellKey } from '../ground.ts';
import { SIDES, cellCentre, inGrid } from './square.ts';
import type { TownGrid } from './square.ts';

/** The outskirts: where a town stops before its square does, so its outline is not a square. */

/** The smallest square, in cells a side, that gives any cells up to the outskirts. */
export const OUTSKIRT_MIN_CELLS = 5;

/**
 * The `outskirtScore` past which the town may stop, where 1 is the square's
 * edge at the middle of a side (its corners score 1.41). A town gives up
 * roughly a sixth of its cells.
 */
export const OUTSKIRT_CUT = 1.05;

/** Past this score a cell is the town's edge: houses in yards of the land's ground rather than blocks on paving. */
export const OUTSKIRT_RING = 0.7;

/** How much the outline wanders, as a share of the score: plus or minus half of it. */
const OUTSKIRT_WOBBLE = 0.4;

/** How many cells one swell of the wobble spans. */
const OUTSKIRT_SWELL = 2.4;

/** FNV-1a over a string: the town's seed as a number, for the wobble. */
function seedHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A value in [0, 1) at a lattice point, for a seed. */
function latticeValue(seed: number, i: number, j: number): number {
  let h = Math.imul(seed ^ Math.imul(i, 0x27d4eb2d), 0x165667b1) ^ Math.imul(j, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1), so neighbouring cells wobble together. */
function wobbleAt(seed: number, x: number, y: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = latticeValue(seed, i, j);
  const b = latticeValue(seed, i + 1, j);
  const c = latticeValue(seed, i, j + 1);
  const d = latticeValue(seed, i + 1, j + 1);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

/**
 * How far out cell `(col, row)` stands: its centre's distance from the town's
 * as a share of the half-side, plus the town's own wobble. A pure function of
 * the square and the seed.
 */
export function outskirtScore(grid: TownGrid, seed: string, col: number, row: number): number {
  const distance = Math.hypot(cellCentre(grid, col), cellCentre(grid, row)) / grid.half;
  const h = seedHash(seed);
  return distance + (wobbleAt(h, col / OUTSKIRT_SWELL, row / OUTSKIRT_SWELL) - 0.5) * OUTSKIRT_WOBBLE;
}

/**
 * The cells of the square a town does not build, by `cellKey`: where
 * `outskirtScore` passes `OUTSKIRT_CUT`, flooded in from the edge only (no
 * clearings), never a cell `keep` names (the streets roads come in by, a
 * landmark's cells), and then any cell left as a spur with three sides gone.
 */
export function outskirtsOf(
  grid: TownGrid,
  seed: string,
  keep: (col: number, row: number) => boolean,
): Set<number> {
  const out = new Set<number>();
  const cells = grid.cells;
  if (cells < OUTSKIRT_MIN_CELLS) return out;
  const may = (col: number, row: number): boolean => !keep(col, row) && outskirtScore(grid, seed, col, row) > OUTSKIRT_CUT;
  const gone = (col: number, row: number): boolean => !inGrid(grid, col, row) || out.has(cellKey(col, row));
  // Flood in from the edge through the cells that may go.
  const queue: [number, number][] = [];
  for (let c = 0; c < cells; c++) {
    for (const [col, row] of [[c, 0], [c, cells - 1], [0, c], [cells - 1, c]] as const) {
      const key = cellKey(col, row);
      if (!out.has(key) && may(col, row)) {
        out.add(key);
        queue.push([col, row]);
      }
    }
  }
  while (queue.length > 0) {
    const [col, row] = queue.pop()!;
    for (const [dc, dr] of SIDES) {
      const c = col + dc;
      const r = row + dr;
      if (!inGrid(grid, c, r) || out.has(cellKey(c, r)) || !may(c, r)) continue;
      out.add(cellKey(c, r));
      queue.push([c, r]);
    }
  }
  // Spurs: a cell standing out into the outskirts on three sides.
  for (let pass = 0; pass < 2; pass++) {
    for (let col = 0; col < cells; col++) {
      for (let row = 0; row < cells; row++) {
        const key = cellKey(col, row);
        if (out.has(key) || keep(col, row)) continue;
        let open = 0;
        for (const [dc, dr] of SIDES) if (gone(col + dc, row + dr)) open++;
        if (open >= 3) out.add(key);
      }
    }
  }
  return out;
}
