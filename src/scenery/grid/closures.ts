import { rngFrom } from '../random.ts';

/**
 * Where a secondary street stops: block-long stretches of it given back to
 * the blocks either side, so a street ends at a T against a building and the
 * next one carries on a block over. A pure function of the square, so it
 * changes no gate and no terrace: every stretch that reaches the edge stays
 * open, the main streets are never closed, and the levels are cut as if every
 * street ran on.
 */

/** The smallest square, in cells a side, whose secondary streets are closed in places. */
export const CLOSURE_MIN_CELLS = 6;

/** The chance each inner stretch is tried for closing, before the checks that keep the streets whole. */
const CLOSURE_CHANCE = 0.6;

/** One block-long stretch of a band street: the cells either side of it, each with the side that faces it. */
interface Stretch {
  cells: (readonly [number, number, number])[];
}

/**
 * The closed sides of every cell, as bits `1 << side` (`Gate.side`: 0 +x,
 * 1 +z, 2 -x, 3 -z) at `col * cells + row`. Empty under `CLOSURE_MIN_CELLS`.
 */
export function closuresFor(
  cells: number, avenue: Uint8Array, low: Uint8Array, high: Uint8Array, seed: number,
  keepOpen?: (col: number, row: number) => boolean,
): Uint8Array {
  const shut = new Uint8Array(cells * cells);
  if (cells < CLOSURE_MIN_CELLS) return shut;
  const main = cells % 2 === 0 ? cells / 2 - 1 : -1;
  const rng = rngFrom('closures', seed);
  for (const stretch of stretchesOf(cells, avenue, high, main)) {
    if (!rng.chance(CLOSURE_CHANCE)) continue;
    if (keepOpen !== undefined && stretch.cells.some(([col, row]) => keepOpen(col, row))) continue;
    for (const [col, row, side] of stretch.cells) shut[col * cells + row]! |= 1 << side;
    if (!fronted(cells, avenue, low, high, shut) || !connected(cells, avenue, low, high, shut, main)) {
      for (const [col, row, side] of stretch.cells) shut[col * cells + row]! &= ~(1 << side);
    }
  }
  return shut;
}

/** Whether a cell's side carries an open street band, read off the raw plan and the closures. */
export function sideOpen(
  cells: number, low: Uint8Array, high: Uint8Array, shut: Uint8Array, col: number, row: number, side: number,
): boolean {
  const flag = side === 0 ? high[col] : side === 1 ? high[row] : side === 2 ? low[col] : low[row];
  return flag === 1 && (shut[col * cells + row]! & (1 << side)) === 0;
}

/**
 * Every inner stretch of every secondary band, both ways: the rows of one
 * block along a north-south band (and the columns along an east-west one),
 * leaving out a stretch on the square's edge, where its gate is.
 */
function stretchesOf(cells: number, avenue: Uint8Array, high: Uint8Array, main: number): Stretch[] {
  const runs: number[][] = [];
  let run: number[] = [];
  for (let k = 0; k < cells; k++) {
    if (avenue[k] === 1) {
      if (run.length > 0) runs.push(run);
      run = [];
      continue;
    }
    run.push(k);
    if (high[k] === 1) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  const inner = runs.filter((r) => r[0] !== 0 && r.at(-1) !== cells - 1);
  const stretches: Stretch[] = [];
  for (let b = 0; b + 1 < cells; b++) {
    if (high[b] !== 1 || b === main) continue;
    for (const r of inner) {
      stretches.push({ cells: r.flatMap((k) => [[b, k, 0] as const, [b + 1, k, 2] as const]) });
      stretches.push({ cells: r.flatMap((k) => [[k, b, 1] as const, [k, b + 1, 3] as const]) });
    }
  }
  return stretches;
}

/** Whether every cell still fronts something: an open band, an avenue beside it, or the square's edge. */
function fronted(cells: number, avenue: Uint8Array, low: Uint8Array, high: Uint8Array, shut: Uint8Array): boolean {
  const last = cells - 1;
  for (let col = 0; col < cells; col++) {
    for (let row = 0; row < cells; row++) {
      if (avenue[col] === 1 || avenue[row] === 1) continue;
      if (col === 0 || row === 0 || col === last || row === last) continue;
      if (avenue[col - 1] === 1 || avenue[col + 1] === 1 || avenue[row - 1] === 1 || avenue[row + 1] === 1) continue;
      let any = false;
      for (let side = 0; side < 4 && !any; side++) any = sideOpen(cells, low, high, shut, col, row, side);
      if (!any) return false;
    }
  }
  return true;
}

/**
 * Whether every piece of open street still reaches the main streets: a walk
 * over the cells, from one to the next where a strip of street runs across
 * the boundary between them.
 */
function connected(
  cells: number, avenue: Uint8Array, low: Uint8Array, high: Uint8Array, shut: Uint8Array, main: number,
): boolean {
  const open = (col: number, row: number, side: number): boolean => sideOpen(cells, low, high, shut, col, row, side);
  const isAvenue = (col: number, row: number): boolean => avenue[col] === 1 || avenue[row] === 1;
  const street = (col: number, row: number): boolean =>
    isAvenue(col, row) || open(col, row, 0) || open(col, row, 1) || open(col, row, 2) || open(col, row, 3);
  // A strip running along x through a cell, and one along z.
  const alongX = (col: number, row: number): boolean => avenue[row] === 1 || open(col, row, 1) || open(col, row, 3);
  const alongZ = (col: number, row: number): boolean => avenue[col] === 1 || open(col, row, 0) || open(col, row, 2);
  const linkX = (col: number, row: number): boolean =>
    (open(col, row, 1) && open(col + 1, row, 1)) || (open(col, row, 3) && open(col + 1, row, 3)) ||
    avenue[row] === 1 || open(col, row, 0) ||
    (avenue[col] === 1 && alongX(col + 1, row)) || (avenue[col + 1] === 1 && alongX(col, row));
  const linkZ = (col: number, row: number): boolean =>
    (open(col, row, 0) && open(col, row + 1, 0)) || (open(col, row, 2) && open(col, row + 1, 2)) ||
    avenue[col] === 1 || open(col, row, 1) ||
    (avenue[row] === 1 && alongZ(col, row + 1)) || (avenue[row + 1] === 1 && alongZ(col, row));
  const seen = new Uint8Array(cells * cells);
  const queue: number[] = [];
  let streets = 0;
  for (let col = 0; col < cells; col++) {
    for (let row = 0; row < cells; row++) {
      if (!street(col, row)) continue;
      streets++;
      const root = isAvenue(col, row) || (main >= 0 && (col === main || col === main + 1 || row === main || row === main + 1) &&
        ((col === main && open(col, row, 0)) || (col === main + 1 && open(col, row, 2)) ||
          (row === main && open(col, row, 1)) || (row === main + 1 && open(col, row, 3))));
      if (root) {
        seen[col * cells + row] = 1;
        queue.push(col * cells + row);
      }
    }
  }
  let reached = queue.length;
  while (queue.length > 0) {
    const at = queue.pop()!;
    const col = Math.floor(at / cells);
    const row = at % cells;
    const next: [number, number, boolean][] = [
      [col + 1, row, col + 1 < cells && linkX(col, row)],
      [col - 1, row, col > 0 && linkX(col - 1, row)],
      [col, row + 1, row + 1 < cells && linkZ(col, row)],
      [col, row - 1, row > 0 && linkZ(col, row - 1)],
    ];
    for (const [c, r, linked] of next) {
      if (!linked || seen[c * cells + r] === 1 || !street(c, r)) continue;
      seen[c * cells + r] = 1;
      reached++;
      queue.push(c * cells + r);
    }
  }
  return reached === streets;
}
