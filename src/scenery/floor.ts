import { GROUND_LIFT, cellKey } from './ground.ts';
import type { TownGrid } from './grid.ts';
import { apronCorner, edgeSlope, wallStats } from './floor/edge-slope.ts';
import type { EdgeApron } from './floor/edge-slope.ts';
import { streetFlights } from './floor/crossings.ts';
import { flightDepth, flightHeight, flightRect, flightRun } from './floor/flight.ts';
import type { Flight } from './floor/flight.ts';

export { EDGE_FOOT, MOUTH_GRADE, apronCorner, edgeSink, touchesPaving } from './floor/edge-slope.ts';
export type { EdgeApron } from './floor/edge-slope.ts';
export {
  FLIGHT_INSET,
  RAMP_GENTLEST,
  RAMP_LANDING,
  STEP_RISE,
  STEP_TREAD,
  flightDepth,
  flightHeight,
  flightRect,
  flightRun,
  rampGrade,
} from './floor/flight.ts';
export type { Flight } from './floor/flight.ts';

/**
 * A town's floor as one surface: the terraces, the slope round its outer edge,
 * and the ramps or flights of steps where a street crosses a riser.
 *
 * The one definition of that surface: `settlements.ts` draws the floor out of
 * the field `buildFloor` returns, and `floorLiftAt` answers the foot from the
 * same field, so a foot stands on what is drawn. Node-safe, so `pnpm check`
 * builds it over a synthetic town with the function the streamer calls.
 */

/** What a floor put where, counted by `buildFloor` and read by `survey`. */
export interface FloorStats {
  /** Paved edges on the town's outside that end in a slope. */
  slopes: number;
  /** Paved edges on the outside that keep a vertical face: over the sea, or under a landmark. */
  quays: number;
  /** Ramps, and the steepest of them as rise over run. */
  ramps: number;
  steepest: number;
  /** Flights of steps — the risers a ramp could not take — and the risers in them. */
  flights: number;
  steps: number;
  /** Street crossings of a riser that got neither, because another already filled the cell's corner. */
  crowded: number;
  /** The tallest vertical face the floor draws anywhere, in world units. */
  wall: number;
  /** The steepest edge slope, as the surface's own rise over run. */
  embankment: number;
}

/**
 * A town's floor, as a point query needs it. Cell `(col, row)` covers `x` in
 * `[(col - shift - 0.5) * pitch, (col - shift + 0.5) * pitch]`; corner `(i, j)`
 * sits at `(i - shift - 0.5) * pitch`, shared by cells `(i-1..i, j-1..j)`.
 */
/** A straight run of coast: land where `nx * x + nz * z >= d`, with `(nx, nz)` a unit normal. */
export interface ShoreLine {
  nx: number;
  nz: number;
  d: number;
}

/**
 * Where the coast crosses a paved cell, in the town's plane: a straight line,
 * or two that bend at a point found on the coast between them. A cell with a
 * corner in the water is paved only up to it, with a sea wall along it,
 * rather than standing out over the shore as a quay.
 */
export interface Shore {
  /** One line, or the two halves of a bent one, each with the land on its positive side. */
  lines: readonly ShoreLine[];
  /** Whether the land is on either half's side (a bay, bent towards the land) rather than on both's (a headland). */
  union: boolean;
  /** The coast through the cell in order: its two ends on the cell's edges, and the bend between them when there is one. */
  points: readonly (readonly [number, number])[];
}

/** How far a point of the town's plane is inside the land of a shore: negative in the sea. */
export function shoreSide(shore: Shore, x: number, z: number): number {
  let side = shore.union ? -Infinity : Infinity;
  for (const line of shore.lines) {
    const s = line.nx * x + line.nz * z - line.d;
    side = shore.union ? Math.max(side, s) : Math.min(side, s);
  }
  return side;
}

/** Whether a point of the town's plane is on the dry side of a shore. */
export const shoreDry = (shore: Shore, x: number, z: number): boolean => shoreSide(shore, x, z) >= 0;

export interface FloorField {
  pitch: number;
  /** How far the lattice is shifted, in cells: `(cells - 1) / 2` for a town's square (`townGrid`). Absent means 0. */
  shift?: number;
  /** Every paved cell and its terrace's elevation above sea level, before `GROUND_LIFT`. */
  terraces: ReadonlyMap<number, number>;
  /** The edge slope, by cell. Absent is a floor with no slope round it. */
  aprons?: ReadonlyMap<number, EdgeApron>;
  /** The slope's foot at every corner of it that touches no paving, by corner key, as an elevation. */
  feet?: ReadonlyMap<number, number>;
  /** The coast across the paved cells it crosses, by cell. Absent is a floor with no shore. */
  shores?: ReadonlyMap<number, Shore>;
  /** The ramps and flights, by the cell each stands in: the lower of its two. */
  flights?: ReadonlyMap<number, readonly Flight[]>;
  /** The same, by every cell each covers: a ramp's higher cell as well as its lower one. */
  touching?: ReadonlyMap<number, readonly Flight[]>;
  stats?: FloorStats;
}

/** How far outside its paved cells a floor can answer a query: the far corner of one course of slope. */
export function floorReach(field: FloorField): number {
  return field.aprons === undefined || field.aprons.size === 0 ? 0 : field.pitch * Math.SQRT2;
}

/** What `buildFloor` needs to know about one town. */
export interface FloorPlan {
  /** The square: its pitch, shift and where its streets run. */
  grid: Pick<TownGrid, 'pitch' | 'shift' | 'cells' | 'avenue' | 'low' | 'high' | 'shut'>;
  /** Half the width of a band street, `streetBand`'s answer. */
  band: number;
  /** The paved cells and their levels, as `FloorField.terraces`. */
  terraces: ReadonlyMap<number, number>;
  /** The ground's elevation at lattice corner `(i, j)`, or null where the corner is in the sea. */
  cornerGround(i: number, j: number): number | null;
  /** Whether the slope may be laid on a cell at all: false under a landmark. Absent is everywhere. */
  open?(col: number, row: number): boolean;
  /**
   * The mouths of the streets a road comes in by, as `cellKey * 4 + side` of
   * each gate cell's side on the square's edge, sides counted as `Gate.side`
   * counts them: a ramp keeps `gateFlare` off each. Absent is none.
   */
  mouths?: ReadonlySet<number>;
}

/**
 * The floor's field: the terraces it is handed, the edge slope round them and
 * the flights on the streets that cross a riser. Deterministic in the order
 * `terraces` iterates, which is the order the town paved its cells in.
 */
export function buildFloor(plan: FloorPlan): FloorField {
  const { grid, terraces } = plan;
  const stats: FloorStats = { slopes: 0, quays: 0, ramps: 0, steepest: 0, flights: 0, steps: 0, crowded: 0, wall: 0, embankment: 0 };
  const { aprons, feet } = edgeSlope(plan, stats);
  wallStats(plan, aprons, stats);
  const { flights, touching } = streetFlights(plan, stats);
  return { pitch: grid.pitch, shift: grid.shift, terraces, aprons, feet, flights, touching, stats };
}

/**
 * The flight whose footprint, grown by `margin`, holds `(x, z)`, or null. The
 * foot asks with no margin; placing a parked car asks with its half-length.
 */
export function flightAt(field: FloorField, x: number, z: number, margin = 0): Flight | null {
  const byCell = field.touching ?? field.flights;
  if (byCell === undefined || byCell.size === 0) return null;
  const shift = field.shift ?? 0;
  const col = Math.round(x / field.pitch + shift);
  const row = Math.round(z / field.pitch + shift);
  const reach = margin > 0 ? Math.ceil(margin / field.pitch) : 0;
  for (let dc = -reach; dc <= reach; dc++) {
    for (let dr = -reach; dr <= reach; dr++) {
      for (const flight of byCell.get(cellKey(col + dc, row + dr)) ?? []) {
        const [x0, x1, z0, z1] = flightRect(flight, margin);
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return flight;
      }
    }
  }
  return null;
}

/**
 * How far the floor stands over the ground at a point in the town's frame, in
 * world units: the paving, a tread or the edge slope, less `elevation`
 * (`world.elevationAt` at the same point).
 *
 * Zero or less means no floor over the ground here: the slope's outer half is
 * laid under the relief on purpose. The floor itself is absolute (a terrace is
 * level), so the caller adding its own ground back gets a height that does not
 * move across a cell. Every surface here is the one `buildGround` draws.
 */
export function floorLiftAt(floor: FloorField, x: number, z: number, elevation: number): number {
  const { pitch, terraces } = floor;
  const shift = floor.shift ?? 0;
  const col = Math.round(x / pitch + shift);
  const row = Math.round(z / pitch + shift);
  const key = cellKey(col, row);
  const here = terraces.get(key);
  if (here !== undefined) {
    const shore = floor.shores?.get(key);
    if (shore !== undefined && !shoreDry(shore, x, z)) return 0;
    for (const flight of (floor.touching ?? floor.flights)?.get(key) ?? []) {
      const across = flight.axis === 0 ? z : x;
      if (across < flight.from || across > flight.to) continue;
      const s = flightDepth(flight, x, z);
      if (s >= -flight.back && s < flightRun(flight)) return flightHeight(flight, s) - elevation;
    }
    return here + GROUND_LIFT - elevation;
  }
  const apron = floor.aprons?.get(key);
  if (apron === undefined) return 0;
  const u = Math.min(1, Math.max(0, x / pitch + shift - (col - 0.5)));
  const v = Math.min(1, Math.max(0, z / pitch + shift - (row - 0.5)));
  const ha = apronCorner(floor, apron, col, row);
  const hb = apronCorner(floor, apron, col + 1, row);
  const hc = apronCorner(floor, apron, col + 1, row + 1);
  const hd = apronCorner(floor, apron, col, row + 1);
  let h: number;
  if (apron.diagonal === 0) {
    // Triangles (a, b, c) under the diagonal and (a, c, d) over it.
    h = u >= v ? ha + (hb - ha) * u + (hc - hb) * v : ha + (hc - hd) * u + (hd - ha) * v;
  } else {
    // Triangles (a, b, d) and (b, c, d), split along b-d.
    h = u + v <= 1 ? ha + (hb - ha) * u + (hd - ha) * v : hc + (hc - hd) * (u - 1) + (hc - hb) * (v - 1);
  }
  return h - elevation;
}
