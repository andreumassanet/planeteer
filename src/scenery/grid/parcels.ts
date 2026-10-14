import { planGapToBox, planReach } from '../../landmark-ground.ts';
import type { PlanShape } from '../../landmark-ground.ts';
import { cellCentre, cellIndex } from './square.ts';
import type { TownGrid } from './square.ts';

/**
 * How near a landmark's plan a town's cell has to come to be part of its
 * parcel, in world units. `build-monuments.ts` stands a landmark in a town so
 * the cells this reaches are exactly the block it chose.
 */
export const PARCEL_KEEP = 6;

/** The cells a landmark in a town takes, inclusive on all four sides. */
export interface Parcel {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

/**
 * The parcel a landmark takes in a town's square: the rectangle of cells
 * holding every cell whose box comes within `PARCEL_KEEP` of its plan, or null.
 * `(x, z)` is the landmark's point in the town's frame. The town paves it as
 * one square, and the road bake shuts any gate whose cells it takes.
 */
export function landmarkParcel(grid: TownGrid, x: number, z: number, shape: PlanShape): Parcel | null {
  let c0 = Infinity;
  let c1 = -Infinity;
  let r0 = Infinity;
  let r1 = -Infinity;
  const half = grid.pitch * 0.5;
  // Only the cells the plan's reach can touch are asked.
  const reach = planReach(shape) + PARCEL_KEEP + grid.pitch;
  const from = Math.max(0, cellIndex(grid, x - reach));
  const to = Math.min(grid.cells - 1, cellIndex(grid, x + reach));
  const fromRow = Math.max(0, cellIndex(grid, z - reach));
  const toRow = Math.min(grid.cells - 1, cellIndex(grid, z + reach));
  for (let col = from; col <= to; col++) {
    const cx = cellCentre(grid, col) - x;
    for (let row = fromRow; row <= toRow; row++) {
      const cz = cellCentre(grid, row) - z;
      if (planGapToBox(shape, cx - half, cx + half, cz - half, cz + half) >= PARCEL_KEEP) continue;
      if (col < c0) c0 = col;
      if (col > c1) c1 = col;
      if (row < r0) r0 = row;
      if (row > r1) r1 = row;
    }
  }
  return c0 === Infinity ? null : { c0, c1, r0, r1 };
}

/** Whether a cell is in a parcel. */
export function inParcel(parcel: Parcel, col: number, row: number): boolean {
  return col >= parcel.c0 && col <= parcel.c1 && row >= parcel.r0 && row <= parcel.r1;
}
