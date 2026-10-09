import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { MAX_CUT, SIDEWALK, TERRACE_STEP, cellKey, pavementOf } from './ground.ts';
import { planGapToBox, planReach } from '../landmark-ground.ts';
import type { PlanShape } from '../landmark-ground.ts';

/**
 * A town's square: how big it is, the cells it is cut into, where its streets
 * run and where a road may come into it.
 *
 * **A town used to be a jittered disc of plots with a ragged floor grown out of
 * whatever landed, and it read as a heap of houses.** Sixty per cent of
 * buildings stood inside a neighbour, a quarter of the drawn street was under a
 * wall, the floor was a patchwork of three tones, and a road ended four units
 * short of a kerb and handed over to a narrow track of the town's own. What
 * replaced it is one line: a town stands on a square base, and the roads
 * connect to it there. This file is that square, as pure functions of a place's
 * built radius (`radiusOf`), so that the town that stands on it
 * (`settlements.ts`) and the roads that arrive at it (`roads.ts`, the bake and
 * `pnpm check`) cannot disagree about where its edge is or where its gates are.
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
 * gate's cells take their group's level (`townTerraces`), which is the highest of
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

/**
 * How far into a gate's cells its mouth runs, in world units: the stretch of a
 * street that a road comes in by over which the town's own section widens or
 * narrows to the road's (`gateMouth`). Two units, a quick flare of the kerb
 * rather than a funnel, and short because a ramp (`floor.ts`) keeps off it: in
 * a town three cells a side the whole of an avenue's arm between its middle
 * crossing and its gate is what a riser there has to ramp in, and at Tarbes'
 * pitch of 10.9 a flare of three left it 7.9 units for a terrace of 4, steeper
 * than `STREET_GRADE`. Never more than half a cell.
 */
export function gateFlare(pitch: number): number {
  return Math.min(pitch * 0.5, 2);
}

/**
 * Half the carriageway of every road between the towns, in world units:
 * `ROAD_CLASSES` in `roads.ts` are all twice this wide. Here because a town's
 * gate is where the road's section and the street's meet, and both sides of
 * that seam read it.
 */
export const CARRIAGEWAY_HALF = 3.6;

/**
 * Where a road meets a town's street: the street's own section at the gate, and
 * the road's, which the mouth flares between.
 */
export interface GateMouth {
  /** The street's half-width at the gate — half the cell on an avenue, the band on a boundary — and its pavement. */
  street: number;
  walk: number;
  /** The road's carriageway half-width, which it keeps to the kerb. */
  carriage: number;
  /** Where the road's pavement ends, from the street's centre line, at the kerb. */
  edge: number;
  /** How far in from the kerb the town's street takes to become its own again. 0 where there is no street. */
  flare: number;
}

/**
 * The mouth of a gate: **the road keeps its width to the kerb, and the town's
 * street meets it there** (2026-09-25).
 *
 * Until then a road narrowed over its last `APPROACH` to the street it entered
 * — a band street of a small town is 5.4 across, and a 7.2 road lost a quarter
 * of its width in eighteen units, which read as a funnel at every village. Now
 * the road arrives whole with a pavement either side, the town's own, and the
 * town widens its street to take it: over `gateFlare` of the gate's cells its
 * carriageway runs from the road's `CARRIAGEWAY_HALF` at the kerb to its own,
 * and its pavement's outer edge from `edge` to the street's. On a band that
 * widens the street into the plots either side, which give up that much
 * (`rectOf` in `settlements.ts`); an avenue is a whole cell of street already,
 * and its mouth narrows the carriageway and widens the pavement instead.
 *
 * `band` is `streetBand` for the town's region. A square of one cell has no
 * street, and its mouth is the road's carriageway and nothing else.
 */
export function gateMouth(grid: TownGrid, gate: Gate, band: number): GateMouth {
  if (grid.cells < 2) {
    return { street: 0, walk: 0, carriage: CARRIAGEWAY_HALF, edge: CARRIAGEWAY_HALF, flare: 0 };
  }
  const avenue = gate.cells.length < 2;
  const street = avenue ? grid.pitch * 0.5 : band;
  const walk = pavementOf(street);
  const edge = avenue
    ? Math.min(street, CARRIAGEWAY_HALF + SIDEWALK)
    : Math.max(street, CARRIAGEWAY_HALF + walk);
  return { street, walk, carriage: CARRIAGEWAY_HALF, edge, flare: gateFlare(grid.pitch) };
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

/** How many cells past the square's edge the country round a town reaches, at most (the disc stops it first). */
export const COUNTRY_RING = 2;

/**
 * How far from its centre a town's own country reaches: its disc, or for a
 * town too small to have room inside it, `COUNTRY_RING` cells past its square.
 * `settlements.ts` plants its orchards out to here and the countryside between
 * the towns (`countryside.ts`) starts past it.
 */
export function countryReach(radius: number): number {
  const grid = townGrid(radius);
  return Math.max(radius, grid.half + COUNTRY_RING * grid.pitch);
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
 * How near a landmark's plan a town's cell has to come to be part of the
 * landmark's parcel, in world units. `build-monuments.ts` stands a landmark it
 * puts in a town in the middle of a whole number of cells with at least this
 * much ground between its plan and their edge on every side, and with less
 * than half a cell more, so the cells this reaches are exactly those.
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
 * The parcel a landmark takes in a town's square: every cell whose box comes
 * within `PARCEL_KEEP` of its plan, and then the rectangle of cells that holds
 * them all, so the ground a landmark stands in is a block of the town's own
 * cells and never a disc cut out of streets and yards. Null where its plan
 * comes near no cell. `(x, z)` is the landmark's point in the town's frame.
 *
 * **One answer for every reader**: the town paves it as one square with no
 * building and no street through it (`settlements.ts`), the road bake shuts a
 * gate whose cells it takes (`roads.ts`), and the monuments' bake stands a
 * landmark so that this rectangle is the one it chose.
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
 * which are cut to a level higher than their own, is `townTerraces`'s.
 */
function terraceLevel(high: number, base: number): number {
  return base + TERRACE_STEP * Math.round((high - base) / TERRACE_STEP);
}

/**
 * The town's tangent frame: +Z along the ground towards the pole, `across` the
 * other way. Written into the two vectors handed in.
 *
 * One definition, shared by the town and the roads, because a gate is a point
 * in this frame and a road that computed it in another would miss the kerb.
 * `makeBasis(across, up, north)` has a positive determinant with
 * `across = up x north`; the other way round is a reflection, and a reflected
 * basis flips the winding of everything built in it.
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
// Through traffic: the carriageway a town keeps down its main streets
// ---------------------------------------------------------------------------

/**
 * Half the width of the widest vehicle that drives through a town, in world
 * units: a placed city bus is 4.46 across, a hatchback 3.00 (2026-09-24,
 * `pnpm life`).
 */
export const THROUGH_HALF_WIDTH = 2.25;

/**
 * The radius a vehicle turns on at a town's middle crossing where the street
 * allows it, in world units. A real car's turning circle is about ten metres
 * across, 6.3 units of radius at the scenery's scale; a town's main street is
 * 5 to 12 units wide, and this is what its paving has room for.
 */
export const THROUGH_TURN = 4;

/** What a town keeps between a through lane's outer side and its kerb, for a person on the pavement. */
const KERB_ROOM = 2;

/**
 * Whether a town has the two main streets a vehicle can drive through it by:
 * a square of one cell is one house and its yard, and has no street at all.
 */
export function hasThroughStreets(grid: TownGrid): boolean {
  return grid.cells >= 2;
}

/**
 * Whether a gate is where a main street meets the edge — a street through the
 * middle of the square. Nine road ends in ten are (31,973 of 34,808,
 * 2026-09-24).
 */
export function isMainGate(gate: Gate): boolean {
  return Math.abs(gate.outX !== 0 ? gate.z : gate.x) < 1e-6;
}

/**
 * Half the width of a main street, from its centre line to its building line:
 * the whole middle cell of a square an odd number of cells wide, which is an
 * avenue, and one band either side of the middle boundary of an even one.
 */
export function mainStreetHalf(grid: TownGrid, street: number): number {
  return grid.cells % 2 === 1 ? grid.pitch * 0.5 : streetBand(grid, street);
}

/**
 * How far off a main street's centre line through traffic drives, one lane
 * each way — or 0, one lane down the middle, where the street is too narrow
 * for two and a pavement, which a band street 7.2 across is: an avenue of a
 * 12-unit cell drives 1.75 off it. Never more than
 * 0.6 of the turn, so the inside lane on the middle crossing's curve stays a
 * curve.
 */
export function throughLane(half: number): number {
  return Math.max(0, Math.min(half - THROUGH_HALF_WIDTH - KERB_ROOM, 0.4 * half, THROUGH_TURN * 0.6));
}

/**
 * How far either side of a main street's centre line through traffic sweeps:
 * what the town keeps clear of parked cars and of people standing, and what
 * `scripts/check-life.ts` holds a drive through a town to.
 */
export function throughClear(half: number): number {
  return throughLane(half) + THROUGH_HALF_WIDTH;
}

/**
 * Whether `(x, z)` in a town's frame is on the through road, `margin` wider
 * all round: either main street's carriageway, and the whole of their
 * crossing, which a vehicle turning cuts the corners of. `half` is the main
 * street's (`mainStreetHalf`).
 */
export function onThroughRoad(x: number, z: number, half: number, margin: number): boolean {
  const clear = throughClear(half) + margin;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return ax < clear || az < clear || (ax < half + margin && az < half + margin);
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

/**
 * Whether a road can come in by a gate at all: every cell it opens onto is out
 * of the sea and can be cut, to `GATE_CUT` rather than `MAX_CUT` — see there
 * for what each limit cost.
 */
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
 * Every cell of the square and the level it is cut to, null where it is not
 * paved, by `cellKey`: each street's group at one level for the whole town,
 * each cell's own level worked out once rather than once per member of each
 * group, and then every street made climbable (`climbable`). **The one definition** of a terrace.
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
 * **Every riser a street crosses is one a ramp can climb** (2026-09-25).
 *
 * The terraces are cut cell by cell off the hill, and a street crossing from
 * one to the next met whatever the hill left: two or three terraces at once,
 * or a riser into the side of an avenue, where a ramp along the street would
 * cut across the through road. Those kept flights of steps — 2,102 over the
 * built world, 659 of them on the main streets — and a street a road comes up
 * ending in a staircase was the thing that looked wrong. So after the groups
 * have their levels, along every street two neighbouring cells stand at most
 * one `TERRACE_STEP` apart, and a street entering an avenue stands level with
 * it: the lower side is raised, with the rest of its group, until both hold.
 *
 * **Only ever raised**, for the groups' reason: a cell cut below its own
 * level has the hill through its paving, one raised above it is fill. With no
 * gate held it raises 10,274 of the built world's paved cells, the tallest
 * face a floor shows goes from 44 to 48 units, and every street riser left is
 * one terrace, which `buildFloor` ramps.
 *
 * **`held` caps a gate's cells**, and their groups with them: a gate is where
 * a road arrives, and raising one lengthens the road's climb to its kerb, which
 * a road baked against the old level may not have room for (`heldGates` in
 * `roads.ts`). A riser against a held gate can stay taller than a terrace.
 * With the shipped network's 22 towns held (2026-09-25, measured with a 9.75
 * street and the four main gates as mouths): 19,467 ramps and 11 flights of
 * steps, one of them on a main street, at Nagano.
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
 * The level a gate's cells are cut to — or null where the gate cannot be used:
 * a cell of it in the sea, or steeper than `GATE_CUT`.
 *
 * `elevationAt(x, z)` is the ground's height above sea level at an offset in
 * the town's frame, 0 or less over water; `base` is the same at the town's
 * centre. It is `townTerraces` at the gate — the whole town's, because
 * making the streets climbable can raise a gate's cells — and all of a gate's
 * cells are one group, so it does not matter which of them is asked.
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
const GATE_GLOW_RUN = 24;

/**
 * The light at a gate a road comes in by: its centre in the town's frame, the
 * radius it is at full out to, and where it ends. Strength 1, and it burns till
 * dawn like a street lamp.
 *
 * **Full across the whole mouth of the street**, `inner` being the street's
 * half-width — half the cell on an avenue, the band on a boundary, or the
 * road's pavement where that reaches further (`gateMouth`) — and a unit over
 * it. That is what makes the kerb invisible at night. The town's floor
 * takes the brightest light over each vertex and the road's ribbon takes only
 * this one, and a pool's peak is the most any light can be: so where the two
 * meet, both are at the peak, and nothing else on the floor can outshine it
 * there. `poolAt` in `lights.ts` is the law both apply.
 *
 * `band` is `streetBand` for the town's region; an avenue's gate does not read
 * it.
 */
export function gateGlow(grid: TownGrid, gate: Gate, band: number): { x: number; z: number; inner: number; reach: number } {
  const mouth = gateMouth(grid, gate, band);
  const inner = Math.max(gate.cells.length < 2 ? grid.pitch * 0.5 : band, mouth.edge) + 1;
  return { x: gate.x, z: gate.z, inner, reach: inner + GATE_GLOW_RUN };
}

/**
 * How far a gate may face from where its road is going and still be given to
 * that road for its own, in radians: ninety degrees, seen from the gate itself
 * to the far town.
 *
 * **One road to a gate was a rule with no limit on which way the gate faced,
 * and it sent a road out of the back of a town whenever the gate it wanted was
 * taken.** Almost every built town is a square of four gates, one a side, and a
 * town with two roads leaving the same way gave the second a side gate or the
 * back one. Over the first gated network (2026-09-13), 1,538 of 34,290 road
 * ends left by a gate more than ninety degrees off their way, 1,515 of them at
 * towns of four gates, and for 833 a gate facing the right way was open and
 * taken; with the curve's handle then carrying the road out of the wrong side
 * for up to three quarters of its length (`HANDLE_MAX` in `roads.ts`), that
 * came to 520 roads turning through more than a half circle and 227 running
 * more than 50 units behind the town they had just left — 194 at Kindu: roads
 * that turn round and come back to the town they left.
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

// ---------------------------------------------------------------------------
// The outskirts: where a town stops before its square does
// ---------------------------------------------------------------------------

/**
 * The smallest square, in cells a side, that gives any of its cells up to the
 * outskirts. Below it a town is a few houses round a crossroads, and every
 * cell it loses is a quarter of it.
 */
export const OUTSKIRT_MIN_CELLS = 5;

/**
 * How far out a cell is, past which the town may stop, where `outskirtScore`
 * of 1 is the square's edge at the middle of a side. Its corners score 1.41,
 * so a town keeps about a disc a little wider than its square is tall, and the
 * wobble decides how far in the edge comes on each side. Measured over every
 * size of square from 5 to 18 cells and forty seeds each (2026-09-23), a town
 * gives up 14 to 18% of its cells, and 27% at the most.
 */
export const OUTSKIRT_CUT = 1.05;

/**
 * Past this score a cell is the town's edge rather than its middle: houses in
 * yards of the land's own ground, rather than blocks on paving.
 */
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
 * How far out cell `(col, row)` stands, with the town's own wobble on it: its
 * centre's distance from the town's as a share of the square's half-side, plus
 * or minus `OUTSKIRT_WOBBLE / 2`. A pure function of the square and the seed,
 * so the town's outline and the mix of what stands at its edge are the same
 * answer.
 */
export function outskirtScore(grid: TownGrid, seed: string, col: number, row: number): number {
  const distance = Math.hypot(cellCentre(grid, col), cellCentre(grid, row)) / grid.half;
  const h = seedHash(seed);
  return distance + (wobbleAt(h, col / OUTSKIRT_SWELL, row / OUTSKIRT_SWELL) - 0.5) * OUTSKIRT_WOBBLE;
}

/**
 * The cells of the square a town does not build, by `cellKey`.
 *
 * **A square read from the air is a square whatever stands on it**, because the
 * outline is what the eye takes first, and every town on the planet had the
 * same one. So a town past `OUTSKIRT_MIN_CELLS` stops short of its square
 * where `outskirtScore` passes `OUTSKIRT_CUT` — the corners always, a side
 * where the wobble brings the edge in — and the square stays what the roads,
 * the vegetation and the neighbours keep off.
 *
 * Three rules keep that from being holes in a town:
 *
 * - **Only from the outside in.** A cell goes only if the cells it goes with
 *   reach the square's edge, so a town has an outline and no clearings: an
 *   unbuilt cell inside the paving would take the edge slope down into a pit.
 * - **`keep` is never given up**: every street a road comes in by, and
 *   whatever the caller must stand on — a landmark's cells. A main street no
 *   road comes in by is given up like any other cell: kept whole, it ran out
 *   of the town as a pier with the fields either side of it.
 * - **No cell left as a spur**: a cell with three of its four sides on the
 *   outskirts is one house on a promontory of slope, and it goes too.
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
