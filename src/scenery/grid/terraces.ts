import { MAX_CUT, TERRACE_STEP, cellKey } from '../ground.ts';
import { GATE_CUT, cellCentre, cornerOffset, gatesOf } from './square.ts';
import type { Gate, TownGrid } from './square.ts';

/**
 * The terraces: which level each cell of a town's square is cut to. The one
 * definition, read by the town (`townTerraces`) and by the roads at a gate
 * (`gateLevel`).
 */

/**
 * The level a cell's highest corner quantises to: a whole number of
 * `TERRACE_STEP`s about the town's own base. Quantising the highest corner,
 * within half a step, keeps the paving (`GROUND_LIFT` up) over every corner of
 * its cell.
 */
function terraceLevel(high: number, base: number): number {
  return base + TERRACE_STEP * Math.round((high - base) / TERRACE_STEP);
}

/**
 * What a town's cells stand on, as the terrace rule asks it. An interface
 * because the town has every corner cached and the roads ask about one gate.
 */
export interface TownGround {
  /** The ground's elevation above sea level at lattice corner `(i, j)`, floored at 0. */
  corner(i: number, j: number): number;
  /** Whether cell `(col, row)` is in the sea, by its centre: a cell with one corner in the water is a quay. */
  sea(col: number, row: number): boolean;
  /** The elevation every terrace is a whole number of steps from: the town centre's, floored at 0. */
  base: number;
}

/**
 * A town's ground out of `elevationAt`, the ground's height above sea level at
 * an offset in the town's frame (0 or less over water), each corner asked once.
 */
export function groundOf(grid: TownGrid, elevationAt: (x: number, z: number) => number, base: number): TownGround {
  const corners = new Map<number, number>();
  return {
    corner(i, j) {
      const key = cellKey(i, j);
      let elevation = corners.get(key);
      if (elevation === undefined) {
        elevation = Math.max(0, elevationAt(cornerOffset(grid, i), cornerOffset(grid, j)));
        corners.set(key, elevation);
      }
      return elevation;
    },
    sea: (col, row) => elevationAt(cellCentre(grid, col), cellCentre(grid, row)) <= 0,
    base,
  };
}

/**
 * The cell `c` shares a band street with along one axis, or `c` itself. No
 * cell has a band on both sides (blocks are two deep), so there is one partner
 * or none; `pnpm check` asserts it.
 */
export function partnerOf(grid: TownGrid, c: number): number {
  if (grid.high[c] === 1) return c + 1;
  if (grid.low[c] === 1) return c - 1;
  return c;
}

/** Every cell that shares a street with `(col, row)`, itself first: one, two either side of a band, or four round a crossing. */
function groupOf(grid: TownGrid, col: number, row: number): (readonly [number, number])[] {
  const c = partnerOf(grid, col);
  const r = partnerOf(grid, row);
  const group: (readonly [number, number])[] = [[col, row]];
  if (c !== col) group.push([c, row]);
  if (r !== row) group.push([col, r]);
  if (c !== col && r !== row) group.push([c, r]);
  return group;
}

const gateLists = new WeakMap<TownGrid, Gate[]>();
const gatesByCell = new WeakMap<TownGrid, Map<number, Gate[]>>();

/** Every gate of a square, cached: it is asked per road end. */
function gatesFor(grid: TownGrid): Gate[] {
  let all = gateLists.get(grid);
  if (all === undefined) {
    all = gatesOf(grid);
    gateLists.set(grid, all);
  }
  return all;
}

/** The gates each cell of a square opens onto, by `cellKey`. Most cells open onto none. */
function gatesAt(grid: TownGrid): Map<number, Gate[]> {
  let byCell = gatesByCell.get(grid);
  if (byCell === undefined) {
    byCell = new Map();
    for (const gate of gatesFor(grid)) {
      for (const [col, row] of gate.cells) {
        const key = cellKey(col, row);
        const list = byCell.get(key) ?? [];
        list.push(gate);
        byCell.set(key, list);
      }
    }
    gatesByCell.set(grid, byCell);
  }
  return byCell;
}

/** The highest and lowest of a cell's four corners, or null where the cell is in the sea. */
function spanOf(ground: TownGround, col: number, row: number): { high: number; low: number } | null {
  if (ground.sea(col, row)) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const [i, j] of [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]] as const) {
    const elevation = ground.corner(i, j);
    high = Math.max(high, elevation);
    low = Math.min(low, elevation);
  }
  return { high, low };
}

/** Whether a road can come in by a gate at all: every cell it opens onto is out of the sea and within `GATE_CUT`. */
export function gateUsable(ground: TownGround, gate: Gate): boolean {
  return usable(ground, gate);
}

function usable(ground: TownGround, gate: Gate): boolean {
  return gate.cells.length > 0 && gate.cells.every(([col, row]) => {
    const span = spanOf(ground, col, row);
    return span !== null && span.high - span.low <= GATE_CUT;
  });
}

/**
 * The level a cell's own ground asks for, before its street has its say: the
 * quantised highest corner, or null in the sea or past the cut. A usable
 * gate's cells may be cut to `GATE_CUT`; any other cell to `MAX_CUT`.
 */
function ownLevel(grid: TownGrid, ground: TownGround, col: number, row: number): number | null {
  const span = spanOf(ground, col, row);
  if (span === null) return null;
  const gate = gatesAt(grid).get(cellKey(col, row))?.some((g) => usable(ground, g)) ?? false;
  if (span.high - span.low > (gate ? GATE_CUT : MAX_CUT)) return null;
  return terraceLevel(span.high, ground.base);
}

/**
 * Every cell of the square and the level it is cut to, null where it is not
 * paved, by `cellKey`: each street's group at the highest of its members' own
 * levels, then every street made climbable (`climbable`). The one definition
 * of a terrace.
 */
export function townTerraces(grid: TownGrid, ground: TownGround, held?: ReadonlyMap<number, number>): Map<number, number | null> {
  const own = new Map<number, number | null>();
  for (let col = 0; col < grid.cells; col++) {
    for (let row = 0; row < grid.cells; row++) own.set(cellKey(col, row), ownLevel(grid, ground, col, row));
  }
  const levels = new Map<number, number | null>();
  for (let col = 0; col < grid.cells; col++) {
    for (let row = 0; row < grid.cells; row++) {
      let level = own.get(cellKey(col, row)) ?? null;
      if (level !== null) {
        for (const [c, r] of groupOf(grid, col, row)) {
          const other = own.get(cellKey(c, r)) ?? null;
          if (other !== null && other > level) level = other;
        }
      }
      levels.set(cellKey(col, row), level);
    }
  }
  climbable(grid, levels, held);
  return levels;
}

/**
 * Raises cells until every riser a street crosses is at most one
 * `TERRACE_STEP` (which `buildFloor` ramps) and a street entering an avenue is
 * level with it. Only ever raises, a whole group at a time: a cell cut below
 * its own level would have the hill through its paving.
 *
 * `held` caps a gate's cells and their groups (`heldGates` in `roads.ts`): a
 * raised gate lengthens the road's baked climb to its kerb. A riser against a
 * held gate can stay taller than a terrace.
 */
function climbable(grid: TownGrid, levels: Map<number, number | null>, held?: ReadonlyMap<number, number>): void {
  const carries = (index: number): boolean => grid.avenue[index] === 1 || grid.low[index] === 1 || grid.high[index] === 1;
  const raise = (col: number, row: number, wanted: number): boolean => {
    const group = groupOf(grid, col, row);
    // A held cell's group goes no higher than the cell may.
    let to = wanted;
    for (const [c, r] of group) to = Math.min(to, held?.get(cellKey(c, r)) ?? Infinity);
    const now = levels.get(cellKey(col, row));
    if (now === null || now === undefined || to <= now + 1e-9) return false;
    for (const [c, r] of group) {
      const key = cellKey(c, r);
      const level = levels.get(key);
      if (level !== null && level !== undefined && level < to) levels.set(key, to);
    }
    return true;
  };
  for (let pass = 0; pass < 4 * grid.cells; pass++) {
    let changed = false;
    for (let col = 0; col < grid.cells; col++) {
      for (let row = 0; row < grid.cells; row++) {
        const here = levels.get(cellKey(col, row));
        if (here === null || here === undefined) continue;
        for (const [dc, dr] of [[1, 0], [0, 1]] as const) {
          if (!carries(dc !== 0 ? row : col)) continue;
          const c = col + dc;
          const r = row + dr;
          const there = levels.get(cellKey(c, r));
          if (there === null || there === undefined) continue;
          // A cell that is an avenue the other way has no room for a ramp
          // along this one, so it and the street entering it are one level.
          const flat = dc !== 0
            ? grid.avenue[col] === 1 || grid.avenue[c] === 1
            : grid.avenue[row] === 1 || grid.avenue[r] === 1;
          const most = flat ? 0 : TERRACE_STEP;
          if (there - here > most + 1e-9) changed = raise(col, row, there - most) || changed;
          else if (here - there > most + 1e-9) changed = raise(c, r, here - most) || changed;
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * The level a gate's cells are cut to, or null where the gate cannot be used.
 * `elevationAt(x, z)` is the ground's height above sea level at an offset in
 * the town's frame, `base` the same at its centre. It is `townTerraces` for the
 * whole town, since making streets climbable can raise a gate.
 */
export function gateLevel(
  grid: TownGrid,
  gate: Gate,
  elevationAt: (x: number, z: number) => number,
  base: number,
  held?: ReadonlyMap<number, number>,
): number | null {
  const ground = groundOf(grid, elevationAt, base);
  if (!usable(ground, gate)) return null;
  const [col, row] = gate.cells[0]!;
  return townTerraces(grid, ground, held).get(cellKey(col, row)) ?? null;
}
