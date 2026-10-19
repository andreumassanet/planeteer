import { GROUND_LIFT, STREET_GRADE, STREET_STEEPEST, cellKey } from '../ground.ts';
import { gateFlare, streetSide } from '../grid/square.ts';
import type { FloorPlan, FloorStats } from '../floor.ts';
import { EDGES, colOf, rowOf } from './edge-slope.ts';
import { FLIGHT_INSET, FLIGHT_RUN, RAMP_GENTLEST, RAMP_LANDING, STEP_RISE, STEP_TREAD, overlap, rampGrade } from './flight.ts';
import type { Flight } from './flight.ts';

/**
 * Where a town street crosses a riser: every crossing found, the level street
 * either side shared out between them by need, and each one stood as a ramp
 * or a flight of steps.
 */

/** A street crossing a riser, before it is planned. */
interface Crossing {
  lower: number;
  higher: number;
  col: number;
  row: number;
  axis: 0 | 1;
  /** From the lower cell towards the higher one, along `axis`. */
  sign: 1 | -1;
  from: number;
  to: number;
  centre: number;
  half: number;
  low: number;
  high: number;
}

/**
 * The level run of street a ramp can lie along from a cell, heading one way:
 * cell after cell on the same terrace until a crossing street, a gate's mouth,
 * another riser, the end of the paving or an avenue the other way stops it.
 * `far` is the run's far end as `cellKey * 4 + side`; `cells` every cell it passes.
 */
interface Run {
  length: number;
  far: number;
  cells: number[];
}

interface Plan {
  crossing: Crossing;
  ramp: boolean;
  run: number;
  back: number;
  lower: Run;
  upper: Run;
  twin: Plan | null;
}

/** A cell's side as `Gate.side` counts it: 0 +x, 1 +z, 2 -x, 3 -z. */
const sideOf = (axis: 0 | 1, sign: number): number => (axis === 0 ? (sign > 0 ? 0 : 2) : sign > 0 ? 1 : 3);

/** Every street crossing a riser, in the order the paving iterates. */
function findCrossings(plan: FloorPlan): Crossing[] {
  const { grid, band, terraces } = plan;
  const pitch = grid.pitch;
  const shift = grid.shift;
  const crossings: Crossing[] = [];
  for (const [key, level] of terraces) {
    const col = colOf(key);
    const row = rowOf(key);
    const x0 = (col - shift - 0.5) * pitch;
    const z0 = (row - shift - 0.5) * pitch;
    for (const [dc, dr] of EDGES) {
      const near = cellKey(col + dc, row + dr);
      const higher = terraces.get(near);
      if (higher === undefined || higher <= level) continue;
      const axis: 0 | 1 = dc !== 0 ? 0 : 1;
      // A street crossing this boundary runs along `axis`, so it belongs to
      // the cell's index on the other axis.
      const other = axis === 0 ? row : col;
      const lo = axis === 0 ? z0 : x0;
      const hi = lo + pitch;
      let from: number;
      let to: number;
      let centre: number;
      let half: number;
      if (grid.avenue[other] === 1) {
        from = lo + FLIGHT_INSET;
        to = hi - FLIGHT_INSET;
        centre = lo + pitch * 0.5;
        half = pitch * 0.5;
      } else if (streetSide(grid, col, row, axis === 0 ? 3 : 2)) {
        from = lo;
        to = lo + band - FLIGHT_INSET;
        centre = lo;
        half = band;
      } else if (streetSide(grid, col, row, axis === 0 ? 1 : 0)) {
        from = hi - band + FLIGHT_INSET;
        to = hi;
        centre = hi;
        half = band;
      } else {
        continue;
      }
      if (to - from < 1) continue;
      const sign = (axis === 0 ? dc : dr) as 1 | -1;
      crossings.push({
        lower: key, higher: near, col, row, axis, sign, from, to, centre, half,
        low: level + GROUND_LIFT, high: higher + GROUND_LIFT,
      });
    }
  }
  return crossings;
}

function runOf(plan: FloorPlan, col: number, row: number, axis: 0 | 1, dir: number): Run {
  const { grid, band, terraces } = plan;
  const pitch = grid.pitch;
  const level = terraces.get(cellKey(col, row));
  const cells: number[] = [];
  let length = 0;
  let c = col;
  let r = row;
  const side = sideOf(axis, dir);
  for (let guard = 0; guard < 64; guard++) {
    const index = axis === 0 ? c : r;
    const key = cellKey(c, r);
    if (grid.avenue[index] === 1) break;
    cells.push(key);
    if (dir > 0 ? grid.high[index] === 1 : grid.low[index] === 1) {
      return { length: length + pitch - band, far: key * 4 + side, cells };
    }
    if (plan.mouths?.has(key * 4 + side) === true) {
      return { length: length + pitch - gateFlare(pitch), far: key * 4 + side, cells };
    }
    const nc = axis === 0 ? c + dir : c;
    const nr = axis === 0 ? r : r + dir;
    const next = terraces.get(cellKey(nc, nr));
    if (next === undefined || next !== level) {
      return { length: length + pitch - RAMP_LANDING, far: key * 4 + side, cells };
    }
    length += pitch;
    c = nc;
    r = nr;
  }
  // Stopped short of an avenue: its kerb is the far end, its level paving the landing.
  const last = cells.at(-1);
  return { length, far: last === undefined ? -1 : last * 4 + side, cells };
}

/**
 * The two halves of a band street, paired: on the same line, climbing the same
 * way between the same levels, one either side of the midline. A pair is
 * planned as one, so the halves never step against each other.
 */
function twinsOf(crossings: readonly Crossing[]): Map<Crossing, Crossing> {
  const twinKey = (crossing: Crossing): string => {
    const line = crossing.axis === 0 ? crossing.col : crossing.row;
    return `${crossing.axis}:${crossing.sign}:${line}:${Math.round(crossing.centre * 1000)}:${crossing.low}:${crossing.high}`;
  };
  const byLine = new Map<string, Crossing[]>();
  for (const crossing of crossings) {
    if (crossing.centre === crossing.from || crossing.centre === crossing.to) {
      const key = twinKey(crossing);
      const list = byLine.get(key) ?? [];
      list.push(crossing);
      byLine.set(key, list);
    }
  }
  const twinOf = new Map<Crossing, Crossing>();
  for (const list of byLine.values()) {
    if (list.length !== 2) continue;
    const [m, n] = list as [Crossing, Crossing];
    if ((m.from < m.centre) === (n.from < n.centre)) continue;
    twinOf.set(m, n);
    twinOf.set(n, m);
  }
  return twinOf;
}

/**
 * Shares the level runs between the crossings, smallest need first: each takes
 * the room its rise needs at `STREET_GRADE` (or, short of that, a steep ramp up
 * to `STREET_STEEPEST`) from the runs either side, split in proportion; one
 * that cannot keeps a flight of steps in its lower cell. `used` records how far
 * into each run something already reaches, by the end it starts from.
 */
function planCrossings(
  plan: FloorPlan, crossings: readonly Crossing[], twinOf: ReadonlyMap<Crossing, Crossing>, used: Map<number, number>,
): Plan[] {
  const pitch = plan.grid.pitch;
  const usedAt = (end: number): number => used.get(end) ?? 0;
  const order = crossings.map((crossing, index) => ({ crossing, index, need: (crossing.high - crossing.low) / STREET_GRADE }));
  order.sort((m, n) => m.need - n.need || m.index - n.index);
  const plans: Plan[] = [];
  const planned = new Set<Crossing>();
  for (const { crossing, need } of order) {
    if (planned.has(crossing)) continue;
    const twin = twinOf.get(crossing);
    const group = twin === undefined ? [crossing] : [crossing, twin];
    const members = group.map((member) => {
      const { axis, sign, col, row } = member;
      const lower = runOf(plan, col, row, axis, -sign);
      const upper = runOf(plan, axis === 0 ? col + sign : col, axis === 0 ? row : row + sign, axis, sign);
      return {
        member,
        lower,
        upper,
        nearLow: member.lower * 4 + sideOf(axis, sign),
        nearHigh: member.higher * 4 + sideOf(axis, -sign),
      };
    });
    let low = Infinity;
    let high = Infinity;
    let room = Infinity;
    for (const { lower, upper } of members) {
      low = Math.min(low, Math.max(0, lower.length - usedAt(lower.far)));
      high = Math.min(high, Math.max(0, upper.length - usedAt(upper.far)));
      // Stairs stand in the lower cell, in what the far end leaves.
      const cell = lower.cells.length !== 1 ? pitch : lower.length + RAMP_LANDING;
      room = Math.min(room, cell - RAMP_LANDING - usedAt(lower.far));
    }
    const rise = crossing.high - crossing.low;
    const take = low + high >= need - 1e-9 ? need : low + high >= rise / STREET_STEEPEST - 1e-9 ? low + high : NaN;
    const ramp = !Number.isNaN(take) && low + high > 0;
    const run = ramp ? (take * low) / (low + high) : Math.max(0, Math.min(FLIGHT_RUN * pitch, room));
    const back = ramp ? take - run : 0;
    const made: Plan[] = [];
    for (const { member, lower, upper, nearLow, nearHigh } of members) {
      used.set(nearLow, run);
      if (ramp) used.set(nearHigh, back);
      made.push({ crossing: member, ramp, run, back, lower, upper, twin: null });
      planned.add(member);
    }
    if (made.length === 2) {
      made[0]!.twin = made[1]!;
      made[1]!.twin = made[0]!;
    }
    plans.push(...made);
  }
  return plans;
}

/**
 * How much further each ramp spreads into the free run below and above it,
 * down to `RAMP_GENTLEST`: half the free room where another crossing starts
 * from the far end, and a twin pair the less of what either has. Worked out
 * from the room before any spreading, so two ramps sharing a run take equal
 * halves.
 */
function spreadsOf(plans: readonly Plan[], used: ReadonlyMap<number, number>): Map<Plan, readonly [number, number]> {
  const usedAt = (end: number): number => used.get(end) ?? 0;
  const spreadOf = (plan: Plan): readonly [number, number] => {
    if (!plan.ramp) return [0, 0] as const;
    const { axis, sign } = plan.crossing;
    const free = (run: Run, near: number): number => {
      const room = run.length - usedAt(near) - usedAt(run.far);
      return room <= 0 ? 0 : usedAt(run.far) > 0 ? room * 0.5 : room;
    };
    const lowFree = free(plan.lower, plan.crossing.lower * 4 + sideOf(axis, sign));
    const highFree = free(plan.upper, plan.crossing.higher * 4 + sideOf(axis, -sign));
    const rise = plan.crossing.high - plan.crossing.low;
    const most = Math.max(0, rise / RAMP_GENTLEST - plan.run - plan.back);
    const share = lowFree + highFree > most ? most / (lowFree + highFree) : 1;
    return [lowFree * share, highFree * share] as const;
  };
  const own = new Map<Plan, readonly [number, number]>();
  for (const plan of plans) own.set(plan, spreadOf(plan));
  const spread = new Map<Plan, readonly [number, number]>();
  for (const plan of plans) {
    const mine = own.get(plan)!;
    if (plan.twin === null) {
      spread.set(plan, mine);
      continue;
    }
    const theirs = own.get(plan.twin)!;
    spread.set(plan, [Math.min(mine[0], theirs[0]), Math.min(mine[1], theirs[1])] as const);
  }
  return spread;
}

/** A plan as the flight it stands, and every cell its footprint reaches along each run. */
function flightOf(plan: FloorPlan, made: Plan, extra: readonly [number, number]): { flight: Flight; covers: number[] } {
  const pitch = plan.grid.pitch;
  const shift = plan.grid.shift;
  const { crossing, ramp } = made;
  const { axis, sign, col, row } = crossing;
  const x0 = (col - shift - 0.5) * pitch;
  const z0 = (row - shift - 0.5) * pitch;
  const start = axis === 0 ? x0 : z0;
  const rise = crossing.high - crossing.low;
  const steps = ramp ? 0 : Math.max(2, Math.round(rise / STEP_RISE));
  const tread = ramp ? 0 : Math.min(STEP_TREAD, made.run / (steps - 1));
  const back = ramp ? made.back + extra[1] : 0;
  const flight: Flight = {
    cell: crossing.lower,
    above: crossing.higher,
    axis,
    at: sign > 0 ? start + pitch : start,
    into: sign > 0 ? -1 : 1,
    from: crossing.from,
    to: crossing.to,
    centre: crossing.centre,
    half: crossing.half,
    high: crossing.high,
    low: crossing.low,
    ramp,
    back,
    run: ramp ? made.run + extra[0] : (steps - 1) * tread,
    steps,
    tread,
  };
  const covers = [crossing.lower];
  if (ramp) {
    const reach = (run: Run, length: number): void => {
      for (let k = 1; k < run.cells.length && k * pitch < length - 1e-6; k++) covers.push(run.cells[k]!);
    };
    reach(made.lower, flight.run);
    if (back > 0) {
      covers.push(crossing.higher);
      reach(made.upper, back);
    }
  }
  return { flight, covers };
}

/**
 * The ramps and flights where streets cross risers, by the lower cell each
 * stands in and by every cell each covers. A pair that would overlap a flight
 * already placed is crowded out and counted. Deterministic in the order the
 * paving iterates.
 */
export function streetFlights(plan: FloorPlan, stats: FloorStats): { flights: Map<number, Flight[]>; touching: Map<number, Flight[]> } {
  const crossings = findCrossings(plan);
  const used = new Map<number, number>();
  const plans = planCrossings(plan, crossings, twinsOf(crossings), used);
  const spread = spreadsOf(plans, used);
  const flights = new Map<number, Flight[]>();
  const touching = new Map<number, Flight[]>();
  const touches = (key: number): Flight[] => {
    let list = touching.get(key);
    if (list === undefined) {
      list = [];
      touching.set(key, list);
    }
    return list;
  };
  // Back in the order the crossings were found, so a cell's flights do not depend on the plan.
  plans.sort((m, n) => crossings.indexOf(m.crossing) - crossings.indexOf(n.crossing));
  const settled = new Set<Plan>();
  for (const made of plans) {
    if (settled.has(made)) continue;
    const group = made.twin === null ? [made] : [made, made.twin];
    const stood = group.map((member) => flightOf(plan, member, spread.get(member)!));
    for (const member of group) settled.add(member);
    const fits = stood.every(({ flight, covers }) =>
      flight.run + flight.back >= 1e-6 &&
      !covers.some((key) => (touching.get(key) ?? []).some((known) => overlap(known, flight))));
    if (!fits) {
      stats.crowded += stood.length;
      continue;
    }
    for (const { flight, covers } of stood) {
      for (const key of covers) touches(key).push(flight);
      const here = flights.get(flight.cell) ?? [];
      here.push(flight);
      flights.set(flight.cell, here);
      if (flight.ramp) {
        stats.ramps++;
        stats.steepest = Math.max(stats.steepest, rampGrade(flight));
      } else {
        stats.flights++;
        stats.steps += flight.steps;
      }
    }
  }
  return { flights, touching };
}
