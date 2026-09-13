import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusFor } from '../places.ts';
import { MAX_CUT, TERRACE_STEP } from './ground.ts';

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
 * pure functions of a place's population, so that the town that stands on it
 * (`settlements.ts`) and the roads that arrive at it (`roads.ts`, the bake and
 * `pnpm check`) cannot disagree about where its edge is or where its gates are.
 *
 * **The square is inscribed in `radiusFor`'s disc**, half-side `r / sqrt 2`,
 * and that is a measurement rather than a taste. The bake thins every pair of
 * places to at least `radiusFor(a) + radiusFor(b)` apart, and two north-up
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

/** The square a place of this population stands on. Cached: it is asked per road end. */
export function townGrid(pop: number): TownGrid {
  const known = grids.get(pop);
  if (known !== undefined) return known;
  const half = radiusFor(pop) / Math.SQRT2;
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
  grids.set(pop, grid);
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
 * The level a cell's terrace is cut to, or null where the town cannot cut one.
 *
 * Moved here out of `settlements.ts` so that a road can ask it about the cell it
 * arrives on. The rule is unchanged: quantise the *highest* corner to a whole
 * number of `TERRACE_STEP`s about the town's own base, which keeps the paving
 * over every corner of its own cell by at least a unit, and refuse a cell whose
 * corners span more than `MAX_CUT`. `forced` skips the refusal, and it is used
 * for exactly one kind of cell: the one a road comes in on, which has to exist
 * whatever the hill does or the road ends against a wall.
 */
export function terraceLevel(high: number, low: number, base: number, forced = false): number | null {
  if (!forced && high - low > MAX_CUT) return null;
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

const gateLists = new WeakMap<TownGrid, Gate[]>();

/**
 * The level a gate's cells are cut to, forced — or null if any corner of them
 * is in the sea, which makes the gate unusable.
 *
 * `elevationAt(x, z)` is the ground's height above sea level at an offset in
 * the town's frame, 0 or less over water; `base` is the same at the town's
 * centre.
 *
 * **A gate's cells are cut to one level, and so is every usable gate that
 * shares a cell with it.** Two cells either side of a band gate are cut to the
 * higher of their levels, so the road meets one surface and not a riser down
 * its middle — and in a town two cells wide every gate shares a corner cell
 * with the next, so the answer has to be the same whichever gate asks, or the
 * town and the road would each cut the shared cell to a different level. So the
 * level is the highest over the group of usable gates connected through shared
 * cells, which in a small town is the whole of it and in a large one is just
 * the gate's own one or two cells.
 */
export function gateLevel(
  grid: TownGrid,
  gate: Gate,
  elevationAt: (x: number, z: number) => number,
  base: number,
): number | null {
  let all = gateLists.get(grid);
  if (all === undefined) {
    all = gatesOf(grid);
    gateLists.set(grid, all);
  }
  const levels = new Map<number, number | null>();
  const cellLevel = (col: number, row: number): number | null => {
    const key = col * 1024 + row;
    const known = levels.get(key);
    if (known !== undefined) return known;
    let high = -Infinity;
    let low = Infinity;
    let level: number | null = null;
    // Sea by the cell's centre, not by any one corner, which is the rule the
    // town paves by: a coastal hamlet's one cell with a corner in the water is a
    // quay, and refusing it took the road from 531 of them and from Reykjavik.
    const sea = elevationAt(cellCentre(grid, col), cellCentre(grid, row)) <= 0;
    for (const [i, j] of [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]] as const) {
      const elevation = Math.max(0, elevationAt(cornerOffset(grid, i), cornerOffset(grid, j)));
      high = Math.max(high, elevation);
      low = Math.min(low, elevation);
    }
    // The cell's own terrace, refused past `GATE_CUT` rather than `MAX_CUT`:
    // see there for what each limit cost.
    if (!sea && high - low <= GATE_CUT) level = terraceLevel(high, low, base, true);
    levels.set(key, level);
    return level;
  };
  const usable = (g: Gate): boolean => g.cells.every(([col, row]) => cellLevel(col, row) !== null);
  const shares = (a: Gate, b: Gate): boolean =>
    a.cells.some(([ca, ra]) => b.cells.some(([cb, rb]) => ca === cb && ra === rb));
  if (!usable(gate)) return null;
  let level = -Infinity;
  const seen = new Set<Gate>([gate]);
  const queue: Gate[] = [gate];
  while (queue.length > 0) {
    const g = queue.pop()!;
    for (const [col, row] of g.cells) level = Math.max(level, cellLevel(col, row)!);
    for (const other of all) {
      if (seen.has(other) || !shares(g, other) || !usable(other)) continue;
      seen.add(other);
      queue.push(other);
    }
  }
  return level === -Infinity ? null : level;
}

/**
 * Which gate each road comes in by.
 *
 * `leaving` is each road's direction out of the town, as `(x, z)` in the
 * town's frame (normalised or not); `usable` says whether a gate can be used
 * at all. The cheapest pairing by angle wins, one road to a gate while there
 * are gates to go round, and a road left over shares the gate nearest its
 * heading rather than having none. Deterministic in the order handed in.
 * Returns an index into `gates` per road, or -1 when nothing is usable.
 */
export function assignGates(
  gates: readonly Gate[],
  leaving: readonly (readonly [number, number])[],
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
  for (let road = 0; road < leaving.length; road++) {
    for (let gate = 0; gate < gates.length; gate++) {
      if (open[gate]) pairs.push({ road, gate, cost: costOf(road, gate) });
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
  // More roads than gates: the rest share the nearest by heading.
  for (let road = 0; road < leaving.length; road++) {
    if (chosen[road] !== -1) continue;
    let best = -1;
    let cost = Infinity;
    for (let gate = 0; gate < gates.length; gate++) {
      if (!open[gate]) continue;
      const c = costOf(road, gate);
      if (c < cost) {
        cost = c;
        best = gate;
      }
    }
    chosen[road] = best;
  }
  return chosen;
}
