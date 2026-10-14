/** The streets of a grid town: the avenues, the bands on boundaries, and the runs of cells between them. */

import { cellCentre, cornerOffset } from '../../scenery/grid.ts';
import type { TownGrid } from '../../scenery/grid.ts';
import { PIECES } from '../kit.ts';
import type { Street } from './types.ts';

/** A street's half-width on a cell boundary, units: Earth's band for a 7.2 carriageway, at most 0.3 of a cell. */
export const BAND = 3.6;
/** A pavement's width, as a share of a street's half and at most this, units: room for a body walking with one passing. */
const WALK_SHARE = 0.36;
const WALK_MAX = 2.4;

/** The street bands a cell gives up on each side along one axis: `[low, high]`, units. */
export function bandsOf(grid: TownGrid, c: number): [number, number] {
  return [grid.low[c] === 1 ? Math.min(BAND, grid.pitch * 0.3) : 0, grid.high[c] === 1 ? Math.min(BAND, grid.pitch * 0.3) : 0];
}

const walkOf = (half: number): number => Math.min(WALK_MAX, half * WALK_SHARE);

/** The streets of a square: the avenues (whole cells) and the bands on boundaries, both ways. */
export function streetsOf(grid: TownGrid): Street[] {
  const out: Street[] = [];
  const band = Math.min(BAND, grid.pitch * 0.3);
  for (const axis of ['x', 'z'] as const) {
    for (let c = 0; c < grid.cells; c++) {
      if (grid.avenue[c] === 1) {
        const half = grid.pitch / 2;
        out.push({ axis, at: cellCentre(grid, c), half, walk: walkOf(half), main: Math.abs(cellCentre(grid, c)) < 1e-6 });
      }
      if (grid.high[c] === 1 && c + 1 < grid.cells) {
        const at = cornerOffset(grid, c + 1);
        out.push({ axis, at, half: band, walk: walkOf(band), main: Math.abs(at) < 1e-6 });
      }
    }
  }
  return out;
}

/** A cell's span along one axis, its street bands taken off: `[from, to]`. */
export function spanOf(grid: TownGrid, c: number): [number, number] {
  const centre = cellCentre(grid, c);
  const [low, high] = bandsOf(grid, c);
  return [centre - grid.pitch / 2 + low, centre + grid.pitch / 2 - high];
}

/**
 * The blocks along one axis: runs of cells with no street between them, at
 * most two long (the rule makes them two, or one at an edge or by an avenue).
 */
export function runsOf(grid: TownGrid): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  for (let c = 0; c < grid.cells; c++) {
    if (grid.avenue[c] === 1) {
      if (run.length > 0) runs.push(run);
      run = [];
      continue;
    }
    run.push(c);
    if (grid.high[c] === 1 || c === grid.cells - 1) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** The plan box of a kit building at a scale, units: `[across, deep]` before its yaw. */
export function planOf(form: string, scale: number): [number, number] {
  const info = PIECES[form];
  if (info === undefined) return [8 * scale, 8 * scale];
  return [info.size[0] * info.scale * scale, info.size[2] * info.scale * scale];
}
