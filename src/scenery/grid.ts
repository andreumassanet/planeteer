import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { MAX_CUT, TERRACE_STEP, cellKey } from './ground.ts';

/**
 * A town's square: how big it is, the cells it is cut into, where its streets
 * run and where a road may come into it.
 *
 * **A town used to be a jittered disc of plots with a ragged floor grown out of
 * whatever landed, and the user's verdict on it was a heap of houses.** Sixty
 * per cent of buildings stood inside a neighbour, a quarter of the drawn street
 * was under a wall, the floor was a patchwork of three tones, and a road ended
 * four units short of a kerb and handed over to a narrow track of the town's
 * own. What they asked for instead was one line: *que la ciudad esté sobre una
 * base cuadrada y los caminos se conecten ahí.* This file is that square, as
 * pure functions of a place's built radius (`radiusOf`), so that the town that
 * stands on it (`settlements.ts`) and the roads that arrive at it (`roads.ts`,
 * the bake and `pnpm check`) cannot disagree about where its edge is or where
 * its gates are.
 *
 * **The square is inscribed in `radiusOf`'s disc**, half-side `r / sqrt 2`,
 * and that is a measurement rather than a taste. The bake thins every pair of
 * places to at least `radiusOf(a) + radiusOf(b)` apart, and two north-up
 * squares inscribed in discs that do not overlap cannot overlap either: over
 * the 9,749 built towns (2026-09-13), a half-side of `0.707 r` leaves **0**
 * pairs of squares touching, `0.8 r` leaves 10, `0.9 r` 71 and `r` 194. Every
 * system that keeps off a town by its disc — the wood, the herds, the road
 * bake's "through a third town" — therefore keeps off its square with no change
 * at all. What it costs is that the smallest places are one cell: a hamlet of
 * 17 units across is one house and its yard, which is what it is.
 *
 * **Everything is north-up**, the frame `placement.ts` squares monuments to,
 * so the square is a function of the place alone and not of which road
 * happened to arrive first.
 */

/**
 * The cell the square is cut into, nominally, in world units.
 *
 * **One number for the planet, not one per region**, and that is what lets a
 * road find a gate without the kit: `roads.ts` and the bake load in Node and
 * cannot reach the parts' footprints that sized the old per-region lattice. The
 * cell a town actually gets is the square's side divided into a whole number of
 * these, so it lands between 8 and 18 — a house and its doorstep, or a house
 * and its yard — and the parts that do not fit a cell fall back to a smaller
 * one rather than standing in the street. 12 is the middle of the old lattice's
 * range, 11.0 in east Asia to 20.9 at the poles, weighted to Atlantic Europe's
 * 12.65, which is where this world has been looked at most.
 */
export const TOWN_PITCH = 12;

/**
 * How deep a gate's cell may be cut, in world units — deeper than any other
 * cell's `MAX_CUT`, by two terrace steps.
 *
 * **A gate refused is a road lost, and the two limits price that differently.**
 * Forcing every gate whatever the hill did put a 44.7-unit retaining wall at La
 * Troncal under one paved cell; refusing a gate exactly as any cell is refused
 * (`MAX_CUT`, 12) left 253 built towns with every gate too steep to cut and no
 * road at all (2026-09-13). Twenty is a wall of about 24 units at the one cell a
 * road climbs onto, which is a hill town's gate.
 *
 * **That is the cut on the cell's own corners and not the wall it shows.** A
 * gate's cells take their group's level (`cellLevel`), which is the highest of
 * the cells sharing their street, so a gate cell stands taller than its own cut
 * wherever a partner is higher: the tallest wall a gate cell shows is 43.96, at
 * Sahāranpur, and 1,510 of them show more than 19 (2026-09-13). All but 85 of
 * those were already there under the gate-by-gate closure the groups replaced.
 */
export const GATE_CUT = MAX_CUT + 2 * TERRACE_STEP;

/**
 * How wide the street band is on each side of a street boundary, in world
 * units: half the region's carriageway (`GroundStyle.street`), capped at 0.3
 * of a cell so a street can never eat more of a plot than the plot has to
 * give. Here rather than in `settlements.ts` because a road arriving at a gate
 * narrows to exactly the street it enters.
 */
export function streetBand(grid: TownGrid, street: number): number {
  return Math.min(0.3 * grid.pitch, street * 0.5);
}

export interface TownGrid {
  /** Half the side of the square, in world units. */
  half: number;
  /** Cells along each side. */
  cells: number;
  /** The side of one cell, in world units: `2 * half / cells`. */
  pitch: number;
  /** `(cells - 1) / 2`. Cell `c`'s centre is `(c - shift) * pitch` from the town's centre. */
  shift: number;
  /**
   * The streets, per cell index along either axis — the square is symmetric,
   * so one set of three arrays says it for both.
   *
   * `avenue[c]` makes the whole cell street: the main street of a town with an
   * odd number of cells runs down the middle one. `low[c]` and `high[c]` put a
   * band of street along that edge of the cell, which is how every other street
   * is drawn: two cells either side of a boundary each pave their own half of
   * it. See `streetsFor` for the rule that places them.
   */
  avenue: Uint8Array;
  low: Uint8Array;
  high: Uint8Array;
  /**
   * Where a street meets the edge of the square, as offsets along any side
   * from its midpoint. The main street's end is always 0; a town of six or more
   * cells a side has secondary streets and more. This is where roads come in.
   */
  slots: readonly number[];
}

const grids = new Map<number, TownGrid>();

/**
 * The square a place built at this radius stands on — `radiusOf(place)`, never
 * the law's answer for its population, which a fitted city is smaller than.
 * Cached: it is asked per road end.
 */
export function townGrid(radius: number): TownGrid {
  const known = grids.get(radius);
  if (known !== undefined) return known;
  const half = radius / Math.SQRT2;
  const cells = Math.max(1, Math.round((2 * half) / TOWN_PITCH));
  const pitch = (2 * half) / cells;
  const shift = (cells - 1) / 2;
  const { avenue, low, high } = streetsFor(cells);
  const slots = [0];
  for (let c = 0; c + 1 < cells; c++) {
    // A secondary band on the positive side of the centre, mirrored: the main
    // street is the one at 0 and it is already in the list.
    if (high[c] === 1 && (c + 0.5 - shift) * pitch > pitch * 0.75) {
      const at = (c + 0.5 - shift) * pitch;
      slots.push(at, -at);
    }
  }
  slots.sort((a, b) => a - b);
  const grid: TownGrid = { half, cells, pitch, shift, avenue, low, high, slots };
  grids.set(radius, grid);
  return grid;
}

/**
 * Where the streets run, along one axis of a square `cells` wide.
 *
 * **The rule is that every cell touches a street or the edge of the square**,
 * because a cell that touches neither is a building nobody can walk up to and a
 * yard nobody can reach — which, with walls you collide with, is the heap of
 * houses this replaced. So:
 *
 * - **A main street through the centre**, which is where the roads come in:
 *   the middle cell made street when the count is odd, the middle boundary
 *   when it is even.
 * - **Then blocks two cells deep, outwards from it**: a band on the boundary
 *   between the second and the third cell out, the fourth and the fifth, and
 *   so on. Two deep is a pair of houses back to back, each facing its own
 *   street, which is what a town block is at the smallest scale that has a
 *   back to it.
 *
 * The same rule on both axes makes blocks of two by two, and the square's edge
 * is the fourth side of the outermost ones.
 */
function streetsFor(cells: number): { avenue: Uint8Array; low: Uint8Array; high: Uint8Array } {
  const avenue = new Uint8Array(cells);
  const low = new Uint8Array(cells);
  const high = new Uint8Array(cells);
  if (cells === 1) return { avenue, low, high };
  let first: number;
  let last: number;
  if (cells % 2 === 1) {
    const middle = (cells - 1) / 2;
    avenue[middle] = 1;
    first = middle + 1;
    last = middle - 1;
  } else {
    const middle = cells / 2;
    high[middle - 1] = 1;
    low[middle] = 1;
    first = middle;
    last = middle - 1;
  }
  const quarter = Math.floor(cells / 2);
  for (let j = 1; j + 1 < quarter; j += 2) {
    high[first + j] = 1;
    low[first + j + 1] = 1;
    low[last - j] = 1;
    high[last - j - 1] = 1;
  }
  return { avenue, low, high };
}

/** A cell's centre, as an offset from the town's centre along either axis. */
export function cellCentre(grid: TownGrid, c: number): number {
  return (c - grid.shift) * grid.pitch;
}

/** Corner `i` of the lattice, shared by cells `i - 1` and `i`, as an offset. */
export function cornerOffset(grid: TownGrid, i: number): number {
  return (i - 0.5 - grid.shift) * grid.pitch;
}

/** The cell an offset falls in. May be outside `[0, cells)`: that is off the square. */
export function cellIndex(grid: TownGrid, offset: number): number {
  return Math.round(offset / grid.pitch + grid.shift);
}

export function inGrid(grid: TownGrid, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < grid.cells && row < grid.cells;
}

/** Whether a cell is street from edge to edge: on an avenue in either direction. */
export function isAvenue(grid: TownGrid, col: number, row: number): boolean {
  return grid.avenue[col] === 1 || grid.avenue[row] === 1;
}

/**
 * The level a cell's highest corner quantises to: a whole number of
 * `TERRACE_STEP`s about the town's own base.
 *
 * **The quantiser is what makes a hillside town a staircase instead of a
 * ramp**, and it is taken about the town's *own centre*, so half the built
 * world — which varies by under four units across its whole footprint
 * (2026-09-07) — comes out on one level everywhere. It quantises the *highest*
 * of the four corners rather than their mean, and that is what keeps the paving
 * over the ground it was cut into: rounding puts the terrace within half a
 * step, 2 units, of that corner, and `GROUND_LIFT` is 3, so the floor clears
 * every corner of its own cell by at least a unit. Which cells are refused, and
 * which are cut to a level higher than their own, is `cellLevel`'s.
 */
export function terraceLevel(high: number, base: number): number {
  return base + TERRACE_STEP * Math.round((high - base) / TERRACE_STEP);
}

/**
 * The town's tangent frame: +Z along the ground towards the pole, `across` the
 * other way. Written into the two vectors handed in.
 *
 * One definition, shared by the town and the roads, because a gate is a point
 * in this frame and a road that computed it in another would miss the kerb.
 * `makeBasis(across, up, north)` has a positive determinant with `across = up x
 * north`; the other way round is the reflection CLAUDE.md warns about.
 */
export function townFrame(up: THREE.Vector3, across: THREE.Vector3, north: THREE.Vector3): void {
  north.set(0, 1, 0).projectOnPlane(up);
  if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
  north.normalize();
  across.crossVectors(up, north).normalize();
}

/** Where an offset `(x, z)` in a town's frame lands on the unit sphere. */
export function offsetDirection(
  up: THREE.Vector3, across: THREE.Vector3, north: THREE.Vector3,
  x: number, z: number, target: THREE.Vector3,
): THREE.Vector3 {
  return target
    .copy(up)
    .addScaledVector(across, x / PLANET_RADIUS)
    .addScaledVector(north, z / PLANET_RADIUS)
    .normalize();
}

/**
 * One place a road may come into a town.
 *
 * `(x, z)` is where a street's centreline meets the square's edge, in the
 * town's frame; `out` is the edge's outward normal; `cells` are the edge cells
 * the street opens onto — one when the gate is on an avenue, two when it is on
 * a boundary band — and it is those cells' level the road has to climb to.
 */
export interface Gate {
  /** 0 east (+x), 1 north (+z), 2 west (-x), 3 south (-z). */
  side: number;
  x: number;
  z: number;
  outX: number;
  outZ: number;
  cells: readonly (readonly [number, number])[];
}

const SIDES: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Every gate the square has: its street ends on all four sides. */
export function gatesOf(grid: TownGrid): Gate[] {
  const gates: Gate[] = [];
  const edge = grid.cells - 1;
  for (let side = 0; side < 4; side++) {
    const [outX, outZ] = SIDES[side]!;
    for (const along of grid.slots) {
      // The cells along the side the street opens onto: one if `along` is a
      // cell centre, the two either side if it is a boundary.
      const u = along / grid.pitch + grid.shift;
      const onCentre = Math.abs(u - Math.round(u)) < 1e-6;
      const lanes = onCentre ? [Math.round(u)] : [Math.floor(u), Math.ceil(u)];
      const cells = lanes
        .filter((c) => c >= 0 && c < grid.cells)
        .map((c): readonly [number, number] => {
          if (outX > 0) return [edge, c];
          if (outX < 0) return [0, c];
          if (outZ > 0) return [c, edge];
          return [c, 0];
        });
      gates.push({
        side,
        x: outX !== 0 ? outX * grid.half : along,
        z: outZ !== 0 ? outZ * grid.half : along,
        outX,
        outZ,
        cells,
      });
    }
  }
  return gates;
}

// ---------------------------------------------------------------------------
// The terraces: which level each cell of the square is cut to
// ---------------------------------------------------------------------------

/**
 * What a town's cells stand on, as the terrace rule asks it.
 *
 * An interface rather than an `elevationAt` because the two callers pay for
 * the ground differently: `settlements.ts` has every corner of the town it is
 * raising cached already, and `roads.ts` asks about the one to four cells of a
 * single gate. Both answer the same three questions about the same points —
 * `groundOf` is the second of them — and everything below reads only these.
 */
export interface TownGround {
  /** The ground's elevation above sea level at lattice corner `(i, j)`, floored at 0. */
  corner(i: number, j: number): number;
  /**
   * Whether cell `(col, row)` is in the sea: by its centre, not by any one
   * corner. A square on a coast loses the cells that stand in the water and
   * keeps the quays, and a coastal hamlet's one cell with a corner in the water
   * is a quay — refusing it took the road from 531 of them and from Reykjavik.
   */
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
 * The cell `c` shares a band street with along one axis, or `c` itself.
 *
 * A band is paved half by the cell on each side of it (`streetBand`), and no
 * cell has a band on both of its sides — the blocks are two cells deep — so a
 * cell has one partner on an axis or none. `pnpm check` asserts it over every
 * size of square the built world has.
 */
export function partnerOf(grid: TownGrid, c: number): number {
  if (grid.high[c] === 1) return c + 1;
  if (grid.low[c] === 1) return c - 1;
  return c;
}

/**
 * Every cell that shares a street with `(col, row)`, itself first: one cell,
 * the two either side of a band, or the four round a crossing of two bands.
 */
export function groupOf(grid: TownGrid, col: number, row: number): (readonly [number, number])[] {
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

/**
 * Whether a road can come in by a gate at all: every cell it opens onto is out
 * of the sea and can be cut, to `GATE_CUT` rather than `MAX_CUT` — see there
 * for what each limit cost.
 */
function usable(ground: TownGround, gate: Gate): boolean {
  return gate.cells.length > 0 && gate.cells.every(([col, row]) => {
    const span = spanOf(ground, col, row);
    return span !== null && span.high - span.low <= GATE_CUT;
  });
}

/**
 * The level a cell's own ground asks for, before its street has had its say:
 * the quantised highest corner, or null where the cell is in the sea or steeper
 * than it may be cut. **Every gate's cells are cut whatever `MAX_CUT` would have
 * said**, to `GATE_CUT`, because a gate refused is a road lost; any other cell
 * is refused past `MAX_CUT`.
 */
function ownLevel(grid: TownGrid, ground: TownGround, col: number, row: number): number | null {
  const span = spanOf(ground, col, row);
  if (span === null) return null;
  const gate = gatesAt(grid).get(cellKey(col, row))?.some((g) => usable(ground, g)) ?? false;
  if (span.high - span.low > (gate ? GATE_CUT : MAX_CUT)) return null;
  return terraceLevel(span.high, ground.base);
}

/**
 * The level a cell's terrace is cut to, or null where the town does not pave
 * it. **The one definition**: `settlements.ts` paves by it, `gateLevel` is it
 * at a gate, and the road climbs to what it says.
 *
 * **A street is one level across its width, so the cells that share one share
 * a level.** A band street is paved half by the cell on each side of it, and
 * until 2026-09-13 each of the two cut its own terrace off its own corners.
 * Where the hill put them a step apart, a riser ran down the middle of the
 * street lengthways, and the street climbed it by two half-flights of steps, each
 * wherever its own half happened to meet its own riser — which the user found
 * all over Madrid: *a veces las escaleras suben a diferentes sitios y queda un
 * lío de escaleras. No debería haber elevaciones enmedio de las aceras, pero
 * claro, si lo haces en mitad de una parcela también quedará raro porque el
 * edificio estará flotando.*
 *
 * So a riser goes on the one line in a town that is neither a street nor a
 * plot: **the back of the lot**, where the two cells of a block meet with no
 * street between them — and a building standing across that line already asks
 * for one level under it (`planTown`'s `level`). The cells either side of a
 * band, and the four round a crossing of two bands (`groupOf`), are cut to one
 * level, which puts every street and the two rows of houses facing it on one
 * terrace with the retaining walls behind them; a street crosses a riser only at
 * the back of a block, where the flight spans its whole width. An avenue is a
 * whole cell of street and a group of its own along its length, so where it
 * stands on a different level from the houses beside it the riser is at its
 * kerb, under a house front, and where it meets a band street on another level
 * the flight spans the band.
 *
 * **The group takes the highest of its cells' own levels, never a lower one.**
 * Each own level keeps its paving over every corner of its own cell (see
 * `terraceLevel`), and a cell cut below its own level would have the hill
 * through its pavement; one cut above it only stands taller over the ground on
 * its low side. That is the whole cost of the rule, and it is fill rather than
 * a new kind of face. A cell its own ground refuses stays refused, and does not
 * lower or raise its partners.
 *
 * Measured over the 9,749 built towns (2026-09-13): it deletes **11,403
 * lengthwise risers in 1,259 towns**, and the 13,272 band crossings whose two
 * halves stepped in different places, which was the tangle of stairs. It
 * raises 10,253 of 134,353 paved cells — 9,206 by one step, 907 by two, 140
 * by more — so the tallest wall shown by a cell that is not a gate's goes from
 * 16.95 (Cúcuta) to 29.96 (Guayaquil, raised four steps), and 509 such cells
 * show more than 19. Refusing those instead was measured and not taken: it
 * costs 147 towns cells, and a cell refused is half a street missing.
 *
 * **A gate's cells are always one group**: a gate on an avenue opens onto one
 * cell, and one on a band onto the two cells either side of it, which are
 * partners. Two gates that share a cell — every gate of a square two cells wide,
 * or the pair at a corner of a large one — share its group. So the road and the
 * town ask this one question about the same cells and cannot get two answers,
 * which is what the old gate-by-gate closure in `gateLevel` was for.
 */
export function cellLevel(grid: TownGrid, ground: TownGround, col: number, row: number): number | null {
  let level = ownLevel(grid, ground, col, row);
  if (level === null) return null;
  for (const [c, r] of groupOf(grid, col, row)) {
    if (c === col && r === row) continue;
    const other = ownLevel(grid, ground, c, r);
    if (other !== null && other > level) level = other;
  }
  return level;
}

/**
 * Every cell of the square and the level it is cut to, null where it is not
 * paved, by `cellKey`: `cellLevel` for the whole town, each cell's own level
 * worked out once rather than once per member of each group.
 */
export function townTerraces(grid: TownGrid, ground: TownGround): Map<number, number | null> {
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
  return levels;
}

/**
 * The level a gate's cells are cut to — or null where the gate cannot be used:
 * a cell of it in the sea, or steeper than `GATE_CUT`.
 *
 * `elevationAt(x, z)` is the ground's height above sea level at an offset in
 * the town's frame, 0 or less over water; `base` is the same at the town's
 * centre. It is `cellLevel` at the gate, and all of a gate's cells are one
 * group, so it does not matter which of them is asked.
 */
export function gateLevel(
  grid: TownGrid,
  gate: Gate,
  elevationAt: (x: number, z: number) => number,
  base: number,
): number | null {
  const ground = groundOf(grid, elevationAt, base);
  if (!usable(ground, gate)) return null;
  const [col, row] = gate.cells[0]!;
  return cellLevel(grid, ground, col, row);
}

/**
 * How far past the mouth of a gate its light runs, in world units: out along
 * the road, and in along the street.
 *
 * Longer than a street lamp's pool (`LAMP_POOL`, 14, in `settlements.ts`)
 * because it is the only light a road has, and what it is for is to carry the
 * town's floor out onto the carriageway and let it go, rather than to light a
 * spot: 24 units is a little over two carriageway widths, the length of a
 * town's approach, over which the square falloff takes the road from the
 * floor's brightest to dark.
 */
export const GATE_GLOW_RUN = 24;

/**
 * The light at a gate a road comes in by: its centre in the town's frame, the
 * radius it is at full out to, and where it ends. Strength 1, and it burns till
 * dawn like a street lamp.
 *
 * **Full across the whole mouth of the street**, `inner` being the street's
 * half-width — half the cell on an avenue, the band on a boundary — and a unit
 * over it. That is what makes the kerb invisible at night. The town's floor
 * takes the brightest light over each vertex and the road's ribbon takes only
 * this one, and a pool's peak is the most any light can be: so where the two
 * meet, both are at the peak, and nothing else on the floor can outshine it
 * there. `poolAt` in `lights.ts` is the law both apply.
 *
 * `band` is `streetBand` for the town's region; an avenue's gate does not read
 * it.
 */
export function gateGlow(grid: TownGrid, gate: Gate, band: number): { x: number; z: number; inner: number; reach: number } {
  const inner = (gate.cells.length < 2 ? grid.pitch * 0.5 : band) + 1;
  return { x: gate.x, z: gate.z, inner, reach: inner + GATE_GLOW_RUN };
}

/**
 * How far a gate may face from where its road is going and still be given to
 * that road for its own, in radians: ninety degrees, seen from the gate itself
 * to the far town.
 *
 * **One road to a gate was a rule with no limit on which way the gate faced,
 * and it sent a road out of the back of a town whenever the gate it wanted was
 * taken.** Almost every built town is a square of four gates, one a side, and
 * a town with two roads leaving the same way gave the second a side gate or the
 * back one. Over the first gated network (2026-09-13), 1,538 of 34,290 road
 * ends left by a gate more than ninety degrees off their way, 1,515 of them at
 * towns of four gates, and for 833 a gate facing the right way was open and
 * taken; with the curve's handle then carrying the road out of the wrong side
 * for up to three quarters of its length (`HANDLE_MAX` in `roads.ts`), that
 * came to 520 roads turning through more than a half circle and 227 running
 * more than 50 units behind the town they had just left — 194 at Kindu. The
 * user: *carreteras que dan una vuelta y vuelven a la misma ciudad.*
 *
 * So a gate facing further off than this is never handed to a road while a
 * gate within it is open: the road shares the best-facing gate instead, which
 * roads already did at a third of all ends and which `layersOf` in `roads.ts`
 * draws. A road whose every open gate faces away — a town on a coast or a
 * slope — still gets the best of them.
 */
export const GATE_FACING = Math.PI / 2;

/**
 * Which gate each road comes in by.
 *
 * `leaving` is each road's direction out of the town, as `(x, z)` in the
 * town's frame (normalised or not), and `toward` is where it is going, as an
 * offset in the town's frame in world units; `usable` says whether a gate can
 * be used at all. The cheapest pairing by angle wins among the gates that face
 * the road's way within `GATE_FACING`, one road to a gate while there are gates
 * to go round, and a road left over shares the open gate that faces its way
 * best rather than having none. Deterministic in the order handed in. Returns
 * an index into `gates` per road, or -1 when nothing is usable.
 */
export function assignGates(
  gates: readonly Gate[],
  leaving: readonly (readonly [number, number])[],
  toward: readonly (readonly [number, number])[],
  usable: (gate: Gate, index: number) => boolean,
): number[] {
  const open = gates.map((gate, index) => usable(gate, index));
  const pairs: { road: number; gate: number; cost: number }[] = [];
  const costOf = (road: number, gate: number): number => {
    const [x, z] = leaving[road]!;
    const g = gates[gate]!;
    const along = Math.atan2(z, x);
    const toward = Math.atan2(g.z, g.x);
    let delta = Math.abs(along - toward) % (Math.PI * 2);
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    return delta;
  };
  /**
   * The turn a road makes out of a gate: the angle between the side's outward
   * normal and the far town as seen from the gate — `gatesToward`'s measure in
   * the bake, and not the bearing from the centre, which for a gate near the
   * corner of a city is off by forty degrees.
   */
  const facingOf = (road: number, gate: number): number => {
    const [x, z] = toward[road]!;
    const g = gates[gate]!;
    const dx = x - g.x;
    const dz = z - g.z;
    return Math.acos(Math.max(-1, Math.min(1, (dx * g.outX + dz * g.outZ) / (Math.hypot(dx, dz) || 1))));
  };
  for (let road = 0; road < leaving.length; road++) {
    for (let gate = 0; gate < gates.length; gate++) {
      if (open[gate] && facingOf(road, gate) <= GATE_FACING) pairs.push({ road, gate, cost: costOf(road, gate) });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost || a.road - b.road || a.gate - b.gate);
  const chosen = new Array<number>(leaving.length).fill(-1);
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (chosen[pair.road] !== -1 || taken.has(pair.gate)) continue;
    chosen[pair.road] = pair.gate;
    taken.add(pair.gate);
  }
  // The rest — more roads than gates facing their way — share the open gate
  // that faces their way best.
  for (let road = 0; road < leaving.length; road++) {
    if (chosen[road] !== -1) continue;
    let best = -1;
    let facing = Infinity;
    for (let gate = 0; gate < gates.length; gate++) {
      if (!open[gate]) continue;
      const f = facingOf(road, gate);
      if (f < facing) {
        facing = f;
        best = gate;
      }
    }
    chosen[road] = best;
  }
  return chosen;
}
