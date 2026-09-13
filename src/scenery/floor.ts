import { EDGE_RUN, GROUND_LIFT, KERB_DROP, cellKey } from './ground.ts';
import type { TownGrid } from './grid.ts';

/**
 * A town's floor as one surface: the terraces, the slope round its outer edge,
 * and the flights of steps where a street crosses a riser.
 *
 * **This file is the one definition of that surface, and both halves of the
 * world read it**: `settlements.ts` draws the floor out of the field
 * `buildFloor` returns, and `floorLiftAt` answers the foot out of the same
 * field. Until 2026-09-13 those were two things — a drawn plinth with a
 * vertical kerb, and a collision ramp `KERB_BLEND` wide that climbed it where
 * nothing was drawn — and `ground.ts` wrote the exception down as the one place
 * in the world a foot did not stand on what it saw. There is nothing left to
 * write down: the ramp is drawn now, and the treads a foot climbs are the
 * treads on the screen.
 *
 * Node-safe on purpose, like `ground.ts`: `settlements.ts` reaches the kit
 * through `import.meta.glob` and does not load in Node, so the field is built
 * here from plain numbers and `pnpm check` builds it over a synthetic town with
 * the same function the streamer calls.
 */

/**
 * How far under the ground the edge slope's outer corners are laid, for a
 * town of cell `pitch`.
 *
 * **The slope is one course of cells wide and what it is aimed at is where it
 * meets level ground**, `EDGE_RUN` out from the kerb line — so the depth is the
 * free number and the run is not. A course is one cell, 9 to 18 units across
 * the built world (median 12.04, p10 10.29, p90 16.97 over the 9,749 built
 * towns, 2026-09-13), and a straight line from the paving's top at the kerb to
 * `sink` under the ground at the far side of the course crosses the ground at
 * `pitch * GROUND_LIFT / (GROUND_LIFT + sink)`. Solving that for `EDGE_RUN` is
 * the second term.
 *
 * **`EDGE_FOOT` is the floor under it, and it binds below a pitch of 12** —
 * half the built world, mostly the small towns. Where it binds the slope is
 * steeper than aimed for: 0.36 at the p25 pitch of 11.1, 0.39 at the p10's
 * 10.3 and 0.44 at the smallest town's 9.0, against 0.33 from the median up.
 */
export function edgeSink(pitch: number): number {
  return Math.max(EDGE_FOOT, GROUND_LIFT * (pitch / EDGE_RUN - 1));
}

/**
 * The shallowest the edge slope's foot is laid under the ground, in world units.
 *
 * **The foot has to stay under the land mesh, and the mesh is not the
 * ground.** `elevationAt` is exact; the mesh is a linear approximation of it
 * that runs under it as often as over it, and a foot laid at the relief would
 * stand a lip of slope over the field wherever the mesh sags — the ledge the
 * slope exists to delete. Measured over the 98,567 land triangles whose centre
 * falls in the course just outside a built town's square, where the foot is
 * (2026-09-13), the share where the mesh runs further under `elevationAt` than
 * a foot at that depth:
 *
 * ```
 *   depth   0.8     1.0     1.5     2.0     3.2
 *   lip     3.93%   2.60%   1.06%   0.44%   0.06%
 * ```
 *
 * And that is a bound, not the lip: a triangle's centre is somewhere across
 * the course and the slope there stands higher than its foot. **1.0**, where
 * the median town's slope is exactly the gradient it is aimed at; every unit
 * deeper takes the gentle slope off another quarter of the world's towns for a
 * point or two of lip. `APRON_SINK` laid the old apron's outer edge 3.2 under,
 * but that apron started 0.8 under the ground at the kerb's foot and was never
 * meant to be seen at all; this one starts on the paving and is.
 *
 * `KERB_DROP` is still the quay's: the one edge that keeps a vertical face.
 */
export const EDGE_FOOT = 1.0;

/**
 * How tall one step of a flight is, in world units.
 *
 * A flight divides its riser into whole steps as near this as they come: a
 * `TERRACE_STEP` of 4 is five risers of 0.8, which against the 6.8-unit avatar
 * is 22 cm a step at `AVATAR_HEIGHT`'s scale — a stair step — and a foot follows
 * each one on the frame it happens, the way it follows every rise.
 */
export const STEP_RISE = 0.8;

/** How deep a tread is at most, in world units. A shallower cell gets steeper stairs rather than a longer flight. */
export const STEP_TREAD = 1.5;

/**
 * How far into its cell a flight may run, as a share of the pitch.
 *
 * **Under a half, so two flights descending into one cell from its two ends
 * cannot meet.** A cell lower than both its neighbours along a street is a
 * valley the street dips through, and it takes a flight from each side; at 0.45
 * each leaves a landing of a tenth of a cell between them. At the median pitch
 * the four treads of a `TERRACE_STEP` flight are 1.35 deep, a gradient of 0.59
 * — 31 degrees, a stair and not a ramp.
 */
export const FLIGHT_RUN = 0.45;

/**
 * How far a flight's side stands in from the edge of its street, in world units.
 *
 * **A building's front is flush with its street** — `fitIn` puts it on the
 * street side of its rectangle, and next to an avenue that is the cell's own
 * edge — so a flight as wide as the street would stand its side face in the
 * plane of the house front, two faces of different colour in one plane of one
 * merged mesh, which is the z-fight `CLAUDE.md` names. Half a unit is a
 * doorstep between the stairs and the door, and it is well past `PROUD`.
 */
export const FLIGHT_INSET = 0.5;

/**
 * One flight of steps: where a street crosses a riser between two terraces,
 * standing in the lower cell against the higher one's edge.
 *
 * **On a band street a flight is always one of a pair.** A band is paved half
 * by the cell on each side of it, and since 2026-09-13 those two are cut to one
 * level (`cellLevel` in `grid.ts`), and so are the two they climb to — so each
 * half gets the same flight and the pair meet at the band's midline as one
 * stair the width of the street, less `FLIGHT_INSET` at each kerb. Until then
 * each half climbed its own riser, and the two halves of one street took their
 * flights in two different places.
 *
 * All positions are in the town's own plane, the frame `floorLiftAt` is asked
 * in; all heights are elevations above sea level of the *surface* — a
 * terrace's level plus `GROUND_LIFT` — so nothing reading one has to add the
 * lift back.
 */
export interface Flight {
  /** The cell it stands in, which is the lower of the two. */
  cell: number;
  /** 0 when the street, and the climb, run along x; 1 along z. */
  axis: 0 | 1;
  /** Where the flight meets the higher cell: the boundary's coordinate on `axis`. */
  at: number;
  /** Which way from `at` the flight descends, into its own cell. */
  into: 1 | -1;
  /** Its extent across the street, on the other axis. */
  from: number;
  to: number;
  /** The higher terrace's surface, which the top step meets, and the lower one's. */
  high: number;
  low: number;
  /** Risers; the treads between them are one fewer. */
  steps: number;
  tread: number;
}

/** How far a flight runs into its cell: its treads end to end. */
export function flightRun(flight: Flight): number {
  return (flight.steps - 1) * flight.tread;
}

/**
 * The flight's surface `s` units into its cell from the top, as an elevation.
 *
 * The first riser is at `s = 0`, in the plane of the higher terrace's edge, and
 * the last at `flightRun`, where the lowest tread drops to the cell's own
 * paving: `steps` risers and `steps - 1` treads, so a foot coming down steps
 * off the high terrace onto the first tread and off the last tread onto the
 * street.
 */
export function flightHeight(flight: Flight, s: number): number {
  if (s < 0) return flight.high;
  const k = Math.floor(s / flight.tread) + 1;
  if (k >= flight.steps) return flight.low;
  return flight.high - (k * (flight.high - flight.low)) / flight.steps;
}

/** How far `(x, z)` is into a flight along its climb: 0 at the top riser. */
export function flightDepth(flight: Flight, x: number, z: number): number {
  return ((flight.axis === 0 ? x : z) - flight.at) * flight.into;
}

/**
 * One cell of the edge slope.
 *
 * **Every corner of it touching the paving stands at `top`, and every other
 * corner at the foot `buildFloor` recorded for it.** `top` is the surface of
 * its *owner*: the lowest paved cell sharing an edge with it, or, for the cell
 * off a convex corner that shares none, the lowest sharing a corner. The
 * lowest, because the slope must never stand over paving it meets — a slope
 * that took the higher of two terraces at a corner between them would put a
 * bank of verge over the lower one's street. The higher one draws a face down
 * to it instead, the way it draws a riser down to a lower terrace.
 */
export interface EdgeApron {
  top: number;
  /** 0 splits the cell along its (i, j)–(i+1, j+1) diagonal, 1 along the other. */
  diagonal: 0 | 1;
}

/** What a floor put where, counted by `buildFloor` and read by `survey`. */
export interface FloorStats {
  /** Paved edges on the town's outside that end in a slope. */
  slopes: number;
  /** Paved edges on the outside that keep a vertical face: over the sea, or under a landmark. */
  quays: number;
  /** Flights of steps, and the risers in them. */
  flights: number;
  steps: number;
  /** Street crossings of a riser that got no flight, because another flight already filled the cell's corner. */
  crowded: number;
  /** The tallest vertical face the floor draws anywhere, in world units. */
  wall: number;
  /** The steepest edge slope, as the surface's own rise over run. */
  embankment: number;
}

/**
 * A town's floor, as the one thing a point query needs to know about it.
 *
 * The paved cells are the square less what the terrace and the sea refuse, and
 * the pitch is the lattice they are on. Cell `(col, row)` covers `x` in
 * `[(col - shift - 0.5) * pitch, (col - shift + 0.5) * pitch]`, which is the
 * convention `cornerAt` uses: corner `(i, j)` sits at `(i - shift - 0.5) *
 * pitch` and is shared by the four cells `(i-1..i, j-1..j)`.
 */
export interface FloorField {
  pitch: number;
  /**
   * How far the lattice is shifted, in cells: cell `c`'s centre is `(c - shift)
   * * pitch` from the town's centre. A town's square is `cells` wide with its
   * cells indexed from 0, so this is `(cells - 1) / 2` — see `townGrid` in
   * `grid.ts`. Absent means 0.
   */
  shift?: number;
  /**
   * Every paved cell, and the elevation above sea level its terrace stands at
   * *before* `GROUND_LIFT` — the level the town cut into the hill there, not
   * the surface of the paving. A flat town has one value repeated; a town on a
   * hillside has a few, a `TERRACE_STEP` apart. What a foot is given is an
   * **absolute** height, because the point of a terrace is that the ground
   * under it varies and the floor does not.
   */
  terraces: ReadonlyMap<number, number>;
  /** The edge slope, by cell. Absent is a floor with no slope round it. */
  aprons?: ReadonlyMap<number, EdgeApron>;
  /** The slope's foot at every corner of it that touches no paving, by corner key, as an elevation. */
  feet?: ReadonlyMap<number, number>;
  /** The flights, by the cell each stands in. */
  flights?: ReadonlyMap<number, readonly Flight[]>;
  stats?: FloorStats;
}

/** How far outside its paved cells a floor can answer a query: the far corner of one course of slope. */
export function floorReach(field: FloorField): number {
  return field.aprons === undefined || field.aprons.size === 0 ? 0 : field.pitch * Math.SQRT2;
}

/** Whether lattice corner `(i, j)` touches a paved cell. */
export function touchesPaving(terraces: ReadonlyMap<number, number>, i: number, j: number): boolean {
  return terraces.has(cellKey(i - 1, j - 1)) || terraces.has(cellKey(i, j - 1)) ||
    terraces.has(cellKey(i - 1, j)) || terraces.has(cellKey(i, j));
}

/** Corner `(i, j)` of an apron cell, as an elevation: its owner's top, or its own foot. */
export function apronCorner(field: FloorField, apron: EdgeApron, i: number, j: number): number {
  if (touchesPaving(field.terraces, i, j)) return apron.top;
  return field.feet?.get(cellKey(i, j)) ?? apron.top;
}

/** What `buildFloor` needs to know about one town. */
export interface FloorPlan {
  /** The square: its pitch, shift and where its streets run. */
  grid: Pick<TownGrid, 'pitch' | 'shift' | 'avenue' | 'low' | 'high'>;
  /** Half the width of a band street, `streetBand`'s answer. */
  band: number;
  /** The paved cells and their levels, as `FloorField.terraces`. */
  terraces: ReadonlyMap<number, number>;
  /** The ground's elevation at lattice corner `(i, j)`, or null where the corner is in the sea. */
  cornerGround(i: number, j: number): number | null;
  /** Whether the slope may be laid on a cell at all: false under a landmark. Absent is everywhere. */
  open?(col: number, row: number): boolean;
}

const EDGES: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAGONALS: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * The floor's field: the terraces it is handed, the edge slope round them and
 * the flights on the streets that cross a riser.
 *
 * Deterministic in the order `terraces` iterates, which is the order the town
 * paved its cells in.
 */
export function buildFloor(plan: FloorPlan): FloorField {
  const { grid, band, terraces } = plan;
  const pitch = grid.pitch;
  const shift = grid.shift;
  const sink = edgeSink(pitch);
  const aprons = new Map<number, EdgeApron>();
  const feet = new Map<number, number>();
  const flights = new Map<number, Flight[]>();
  const stats: FloorStats = { slopes: 0, quays: 0, flights: 0, steps: 0, crowded: 0, wall: 0, embankment: 0 };
  const colOf = (key: number): number => Math.floor(key / 1024) - 512;
  const rowOf = (key: number): number => (key % 1024) - 512;

  // --- the edge slope: one course of cells round the paving ---
  const course: number[] = [];
  const seen = new Set<number>();
  for (const key of terraces.keys()) {
    const col = colOf(key);
    const row = rowOf(key);
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const near = cellKey(col + dc, row + dr);
        if (terraces.has(near) || seen.has(near)) continue;
        seen.add(near);
        course.push(near);
      }
    }
  }
  const ground: (number | null)[] = [0, 0, 0, 0];
  const inner: boolean[] = [false, false, false, false];
  for (const key of course) {
    const col = colOf(key);
    const row = rowOf(key);
    if (plan.open !== undefined && !plan.open(col, row)) continue;
    // The corners in the order `pushQuad` takes them: (i, j), (i+1, j),
    // (i+1, j+1), (i, j+1). A corner in the sea is a quay's and the cell keeps
    // its vertical face, as the paving itself does.
    const corners = [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]] as const;
    let sea = false;
    for (let k = 0; k < 4; k++) {
      const [i, j] = corners[k]!;
      ground[k] = plan.cornerGround(i, j);
      inner[k] = touchesPaving(terraces, i, j);
      if (ground[k] === null) sea = true;
    }
    if (sea) continue;
    let top = Infinity;
    let byEdge = false;
    for (const [dc, dr] of EDGES) {
      const level = terraces.get(cellKey(col + dc, row + dr));
      if (level !== undefined && level + GROUND_LIFT < top) top = level + GROUND_LIFT;
    }
    if (top < Infinity) byEdge = true;
    else {
      for (const [dc, dr] of DIAGONALS) {
        const level = terraces.get(cellKey(col + dc, row + dr));
        if (level !== undefined && level + GROUND_LIFT < top) top = level + GROUND_LIFT;
      }
    }
    if (top === Infinity) continue;
    /**
     * **The diagonal is chosen, not taken, and it is what makes a corner a
     * corner.** A cell with one corner on the paving is the one off a convex
     * corner of the town; split through that corner, its two triangles are the
     * two slopes meeting at a hip. A cell with three is the inside of an L, and
     * split through the odd one out it is two slopes meeting in a valley. Split
     * the other way, either is a twisted sheet with a fold across the middle of
     * it that is neither — a ridge where a valley should be.
     */
    const count = inner.filter(Boolean).length;
    let diagonal: 0 | 1 = 0;
    if (count === 1 || count === 3) {
      const odd = inner.findIndex((flag) => flag === (count === 1));
      diagonal = odd === 0 || odd === 2 ? 0 : 1;
    } else if (count === 2 && inner[1] && inner[3]) {
      diagonal = 1;
    }
    aprons.set(key, { top, diagonal });
    for (let k = 0; k < 4; k++) {
      if (inner[k]) continue;
      const [i, j] = corners[k]!;
      const foot = ground[k]! - sink;
      feet.set(cellKey(i, j), foot);
      if (byEdge) stats.embankment = Math.max(stats.embankment, (top - foot) / pitch);
    }
  }

  // --- the faces the floor still draws vertical, and how tall they get ---
  for (const [key, level] of terraces) {
    const col = colOf(key);
    const row = rowOf(key);
    const top = level + GROUND_LIFT;
    for (const [dc, dr] of EDGES) {
      const near = cellKey(col + dc, row + dr);
      const beside = terraces.get(near);
      if (beside !== undefined) {
        if (beside < level) stats.wall = Math.max(stats.wall, level - beside);
        continue;
      }
      const apron = aprons.get(near);
      if (apron !== undefined) {
        stats.slopes++;
        stats.wall = Math.max(stats.wall, top - apron.top);
        continue;
      }
      // The quay: down to `KERB_DROP` under the ground at each end of the edge.
      stats.quays++;
      const [i0, j0, i1, j1] = dc !== 0
        ? [dc > 0 ? col + 1 : col, row, dc > 0 ? col + 1 : col, row + 1]
        : [col, dr > 0 ? row + 1 : row, col + 1, dr > 0 ? row + 1 : row];
      const low = Math.min(plan.cornerGround(i0, j0) ?? 0, plan.cornerGround(i1, j1) ?? 0);
      stats.wall = Math.max(stats.wall, top - Math.max(0, low) + KERB_DROP);
    }
  }
  // Two slope cells side by side with different owners meet in a wedge: the
  // riser between their terraces, carried on out down the bank.
  for (const [key, apron] of aprons) {
    for (const [dc, dr] of EDGES) {
      const other = aprons.get(cellKey(colOf(key) + dc, rowOf(key) + dr));
      if (other !== undefined) stats.wall = Math.max(stats.wall, Math.abs(apron.top - other.top));
    }
  }

  // --- the flights ---
  for (const [key, level] of terraces) {
    const col = colOf(key);
    const row = rowOf(key);
    const x0 = (col - shift - 0.5) * pitch;
    const z0 = (row - shift - 0.5) * pitch;
    for (const [dc, dr] of EDGES) {
      const higher = terraces.get(cellKey(col + dc, row + dr));
      if (higher === undefined || higher <= level) continue;
      const axis: 0 | 1 = dc !== 0 ? 0 : 1;
      // A street that crosses this boundary runs along `axis`, so it is a
      // feature of the cell's index on the other one: a row's avenue or band
      // for a climb along x, a column's for one along z.
      const other = axis === 0 ? row : col;
      const lo = axis === 0 ? z0 : x0;
      const hi = lo + pitch;
      let from: number;
      let to: number;
      if (grid.avenue[other] === 1) {
        from = lo + FLIGHT_INSET;
        to = hi - FLIGHT_INSET;
      } else if (grid.low[other] === 1) {
        from = lo;
        to = lo + band - FLIGHT_INSET;
      } else if (grid.high[other] === 1) {
        from = hi - band + FLIGHT_INSET;
        to = hi;
      } else {
        continue;
      }
      if (to - from < 1) continue;
      const sign = axis === 0 ? dc : dr;
      const start = axis === 0 ? x0 : z0;
      const high = higher + GROUND_LIFT;
      const low = level + GROUND_LIFT;
      const steps = Math.max(2, Math.round((high - low) / STEP_RISE));
      const flight: Flight = {
        cell: key,
        axis,
        at: sign > 0 ? start + pitch : start,
        into: sign > 0 ? -1 : 1,
        from,
        to,
        high,
        low,
        steps,
        tread: Math.min(STEP_TREAD, (FLIGHT_RUN * pitch) / (steps - 1)),
      };
      const here = flights.get(key) ?? [];
      if (here.some((known) => overlap(known, flight))) {
        stats.crowded++;
        continue;
      }
      here.push(flight);
      flights.set(key, here);
      stats.flights++;
      stats.steps += steps;
    }
  }

  return { pitch, shift, terraces, aprons, feet, flights, stats };
}

/** A flight's footprint in the plane, as `[x0, x1, z0, z1]`. */
export function flightRect(flight: Flight, margin = 0): [number, number, number, number] {
  const a = flight.at;
  const b = flight.at + flight.into * flightRun(flight);
  const along0 = Math.min(a, b) - margin;
  const along1 = Math.max(a, b) + margin;
  const across0 = flight.from - margin;
  const across1 = flight.to + margin;
  return flight.axis === 0 ? [along0, along1, across0, across1] : [across0, across1, along0, along1];
}

function overlap(a: Flight, b: Flight): boolean {
  const [ax0, ax1, az0, az1] = flightRect(a);
  const [bx0, bx1, bz0, bz1] = flightRect(b);
  return ax0 < bx1 - 1e-6 && bx0 < ax1 - 1e-6 && az0 < bz1 - 1e-6 && bz0 < az1 - 1e-6;
}

/**
 * The flight whose footprint, grown by `margin`, holds `(x, z)`, or null.
 *
 * Asked by the foot with no margin and by `buildGround`'s `spotAt` with one: a
 * parked car is nine units long, and one whose centre cleared the stairs by a
 * hair would still have its bonnet in them.
 */
export function flightAt(field: FloorField, x: number, z: number, margin = 0): Flight | null {
  if (field.flights === undefined || field.flights.size === 0) return null;
  const shift = field.shift ?? 0;
  const col = Math.round(x / field.pitch + shift);
  const row = Math.round(z / field.pitch + shift);
  const reach = margin > 0 ? Math.ceil(margin / field.pitch) : 0;
  for (let dc = -reach; dc <= reach; dc++) {
    for (let dr = -reach; dr <= reach; dr++) {
      for (const flight of field.flights.get(cellKey(col + dc, row + dr)) ?? []) {
        const [x0, x1, z0, z1] = flightRect(flight, margin);
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return flight;
      }
    }
  }
  return null;
}

/**
 * How far the floor stands over the ground at a point in the town's own frame,
 * in world units: the paving, a tread, or the edge slope, less `elevation`,
 * which is `world.elevationAt` at the same point.
 *
 * **Zero or less means there is no floor over the ground here**, and a caller
 * reads it as "stand on the ground". The slope's outer half is laid under the
 * relief on purpose — that is what buries its foot — so a negative answer is
 * the common one on the outside of a town and it is not an error: the foot is
 * on the land, and the land is what is drawn there.
 *
 * **The lift is against the ground the caller is standing on, and the floor it
 * is measured to is absolute.** A terrace is a level surface cut into a hill,
 * so what this answers on the paving is *the cell's own elevation, plus the
 * lift, minus yours* — and the caller adding its own ground back gets a height
 * that does not move as it walks across a cell.
 *
 * **Every surface here is the one `buildGround` draws, read from the same
 * field**, so there is no exception left to document: the paving is level at
 * its terrace, a flight is its treads, and the slope is the two triangles of
 * its cell with the diagonal the drawing took. Inside a town a riser without a
 * flight is still a step you take, instantly, on the frame you cross it — see
 * `HEIGHT_SMOOTHING` in `player.ts`, which smooths drops and follows rises —
 * and the flights are there so that on a street you do not have to.
 *
 * The frame is the tangent plane and the drawing is the sphere, which differ by
 * `x^3 / 2R^2` along the ground — seven thousandths of a unit at 150 — and the
 * sag of one cell's chord, a thousandth. Neither is a difference a foot can
 * find.
 */
export function floorLiftAt(floor: FloorField, x: number, z: number, elevation: number): number {
  const { pitch, terraces } = floor;
  const shift = floor.shift ?? 0;
  const col = Math.round(x / pitch + shift);
  const row = Math.round(z / pitch + shift);
  const key = cellKey(col, row);
  const here = terraces.get(key);
  if (here !== undefined) {
    for (const flight of floor.flights?.get(key) ?? []) {
      const across = flight.axis === 0 ? z : x;
      if (across < flight.from || across > flight.to) continue;
      const s = flightDepth(flight, x, z);
      if (s >= 0 && s < flightRun(flight)) return flightHeight(flight, s) - elevation;
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
