import { THROUGH_TURN, hasThroughStreets, isMainGate, throughLane } from './scenery/grid.ts';
import type { Gate, TownGrid } from './scenery/grid.ts';

/**
 * A drive through a town: the way a vehicle on the road network gets from the
 * gate it came in by to the gate it leaves by, and the turn it makes where its
 * route ends — in the town's own plane, as pure functions of the square.
 *
 * **A car used to vanish at a gate and appear at the next one**, because this
 * world's roads stop at a town's kerb and nothing drove the streets between
 * them. What replaced it is the smallest honest thing: the two main streets
 * are the town's through road (`throughClear` in `scenery/grid.ts`, which the
 * town keeps clear of parked cars and of people standing), and every drive is
 * along them, turning at the middle crossing. That is a road end in nine of
 * ten (`isMainGate`); the rest, and a square of one cell, which has no street,
 * are not driven through at all, and a route that would need one turns back
 * instead.
 *
 * **Nothing here knows how high anything is.** A town on a hill is a
 * staircase of terraces that only `settlements.ts` can see, its streets
 * climbing them by ramps, so the heights are the standing town's own floor,
 * asked by `life.ts` where it draws the car and pitches it up a ramp; a drive
 * whose street keeps a flight of steps is not driven (`paved` there). This
 * file is the plan, which is also what `scripts/check-life.ts` holds to the
 * paving.
 */

/**
 * One piece of a drive: a straight, a quarter turn, or a wait standing still.
 *
 * `cost` is how much of the route's parameter the leg takes, which is distance
 * at the road's own speed: a leg that costs more than its length is driven
 * slower than the road, and a wait costs time and covers no ground.
 */
export interface StreetLeg {
  kind: 'line' | 'arc' | 'wait';
  /** A line's start, an arc's centre, a wait's spot; the town's frame, +x across and +z north. */
  x: number;
  z: number;
  /** A line's direction of motion, a wait's facing. Unit. */
  dx: number;
  dz: number;
  /** An arc's radius, its starting angle about its centre, and the angle it sweeps, signed. */
  radius: number;
  start: number;
  sweep: number;
  /** Along the ground. */
  length: number;
  cost: number;
  /**
   * How the leg is driven through its cost: 0 steadily, 1 away from a stop,
   * 2 into one, 3 both, 4 slowing from the road's speed to the town's, 5
   * speeding up from the town's to the road's. A car does not reverse at
   * speed, and does not drive a street at a trunk road's.
   */
  ease: 0 | 1 | 2 | 3 | 4 | 5;
  /** Facing against the motion: reversing. */
  reverse: boolean;
  /**
   * The lane: signed offsets from the centre line, positive to the left of
   * the motion, at the leg's start, through its middle and at its end, each
   * end blended over `blend` of the ground.
   */
  lanes: readonly [number, number, number];
  blend: number;
}

/** Where a drive puts a vehicle: position with its lane, facing, and the motion itself. */
export interface StreetPose {
  x: number;
  z: number;
  /** Which way the vehicle faces. */
  fx: number;
  fz: number;
  /** Which way it is moving; opposite the facing when it reverses, and the facing when it waits. */
  mx: number;
  mz: number;
}

/**
 * A town drive is slower than its road: this many units of the route a unit
 * of street, so a car at a road's 39 units a second drives the streets at 13.
 */
export const TOWN_SLOW = 3;
/** And slower again reversing out of a turn. */
const REVERSE_SLOW = 5;
/**
 * A stop, in units of the route: at the road speeds `life.ts` drives (28 to 50
 * a second) about half a second.
 */
const WAIT_COST = 20;
/** How far a lane change into and out of a town is blended, in world units. */
const LANE_BLEND = 6;
/** How far into the crossing street a turn pulls before it backs out, as a share of the turn's radius. */
const PULL_IN = 0.6;

const line = (
  x: number, z: number, dx: number, dz: number, length: number, slow: number,
  ease: StreetLeg['ease'], reverse: boolean, lanes: readonly [number, number, number], blend = LANE_BLEND,
): StreetLeg => ({
  kind: 'line', x, z, dx, dz, radius: 0, start: 0, sweep: 0, length,
  cost: length * slow * easeCost(ease, slow), ease, reverse, lanes, blend,
});

/**
 * A quarter turn from `(ax, az)` moving `(ux, uz)` to a point moving
 * `(vx, vz)`, about `(cx, cz)`.
 */
const arc = (
  cx: number, cz: number, ax: number, az: number, ux: number, uz: number, radius: number,
  slow: number, ease: StreetLeg['ease'], reverse: boolean, lanes: readonly [number, number, number],
): StreetLeg => {
  const start = Math.atan2(az - cz, ax - cx);
  // The sweep's sign is the one whose tangent at the start is the motion.
  const sign = -Math.sin(start) * ux + Math.cos(start) * uz >= 0 ? 1 : -1;
  const length = (Math.PI / 2) * radius;
  return {
    kind: 'arc', x: cx, z: cz, dx: 0, dz: 0, radius, start, sweep: (sign * Math.PI) / 2, length,
    cost: length * slow * easeCost(ease, slow), ease, reverse, lanes, blend: length / 2,
  };
};

const wait = (x: number, z: number, fx: number, fz: number, lane: number): StreetLeg => ({
  kind: 'wait', x, z, dx: fx, dz: fz, radius: 0, start: 0, sweep: 0, length: 0,
  cost: WAIT_COST, ease: 0, reverse: false, lanes: [lane, lane, lane], blend: 0,
});

/**
 * How much longer an eased leg takes than a steady one at `slow`, so that
 * where it meets a steady leg the two run at the same speed: a leg that
 * starts or ends at rest peaks at twice its mean, and one that does both at
 * one and a half. One that changes speed between the road's and `slow` of it
 * averages the two.
 */
function easeCost(ease: StreetLeg['ease'], slow: number): number {
  if (ease === 4 || ease === 5) return 2 / (1 + slow);
  return ease === 0 ? 1 : ease === 3 ? 1.5 : 2;
}

/**
 * The share of a leg's ground covered at `t` of its cost. A change of speed
 * is a steady one, from a rate of 1 to `k` of it or back: the distance is
 * then quadratic in the time, `(2 v0 t + (v1 - v0) t^2) / (v0 + v1)`.
 */
function eased(ease: StreetLeg['ease'], t: number, slow: number): number {
  if (ease === 1) return t * t;
  if (ease === 2) return 1 - (1 - t) * (1 - t);
  if (ease === 3) return t * t * (3 - 2 * t);
  if (ease === 4 || ease === 5) {
    const k = 1 / slow;
    const v0 = ease === 4 ? 1 : k;
    const v1 = ease === 4 ? k : 1;
    return (2 * v0 * t + (v1 - v0) * t * t) / (v0 + v1);
  }
  return t;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

function laneAt(leg: StreetLeg, s: number): number {
  const [a, m, b] = leg.lanes;
  const blend = Math.min(leg.blend, leg.length / 2);
  if (blend <= 1e-6) return m;
  if (s < blend) return a + (m - a) * smooth(s / blend);
  if (s > leg.length - blend) return m + (b - m) * smooth((s - (leg.length - blend)) / blend);
  return m;
}

/** The inward direction of a gate, and its point on the kerb line. */
function gateWay(gate: Gate): { x: number; z: number; ux: number; uz: number } {
  return { x: gate.x, z: gate.z, ux: -gate.outX, uz: -gate.outZ };
}

/**
 * Whether a town can be driven through between two of its gates, or turned in
 * at one when they are the same gate: it has main streets, and both gates are
 * on them.
 */
export function canDrive(grid: TownGrid, gates: readonly Gate[], from: number, to: number): boolean {
  const a = gates[from];
  const b = gates[to];
  return hasThroughStreets(grid) && a !== undefined && b !== undefined && isMainGate(a) && isMainGate(b);
}

/**
 * The drive from gate `from` to gate `to` along the main streets, or null where
 * `canDrive` says no. `half` is the main street's half-width
 * (`mainStreetHalf`), `roadLane` the lane offset of the roads either end and
 * `side` +1 where traffic keeps left and -1 where it keeps right. The same gate
 * twice is a turn (`turnInTown`).
 *
 * Opposite gates are one straight line across the square. Gates on two
 * adjacent sides turn at the middle crossing on a quarter circle of
 * `THROUGH_TURN`, or of the street's own half-width where that is less.
 */
export function driveThrough(
  grid: TownGrid, gates: readonly Gate[], from: number, to: number, half: number, roadLane: number, side: number,
): StreetLeg[] | null {
  if (!canDrive(grid, gates, from, to)) return null;
  if (from === to) return turnInTown(grid, gates, from, half, roadLane, side);
  const a = gateWay(gates[from]!);
  const b = gateWay(gates[to]!);
  // Leaving by `b` is moving out of it: the reverse of its inward way.
  const vx = -b.ux;
  const vz = -b.uz;
  const lane = throughLane(half) * side;
  const road = roadLane * side;
  if (Math.abs(a.ux - vx) < 1e-6 && Math.abs(a.uz - vz) < 1e-6) {
    return [
      line(a.x, a.z, a.ux, a.uz, grid.half, TOWN_SLOW, 4, false, [road, lane, lane]),
      line(0, 0, vx, vz, grid.half, TOWN_SLOW, 5, false, [lane, lane, road]),
    ];
  }
  const r = Math.min(half, THROUGH_TURN);
  const run = Math.max(0, grid.half - r);
  return [
    line(a.x, a.z, a.ux, a.uz, run, TOWN_SLOW, 4, false, [road, lane, lane]),
    arc(-a.ux * r + vx * r, -a.uz * r + vz * r, -a.ux * r, -a.uz * r, a.ux, a.uz, r, TOWN_SLOW, 0, false, [lane, lane, lane]),
    line(vx * r, vz * r, vx, vz, run, TOWN_SLOW, 5, false, [lane, lane, road]),
  ];
}

/**
 * The turn a route ends with at one of a town's gates: in along its main
 * street to the middle crossing, a quarter turn into the crossing street on
 * the side the traffic keeps, a stop, a reverse out of it turning the other
 * way, a stop, and out by the gate it came in by on the other lane — the
 * three-point turn a real car makes where there is no room for a U. Null where
 * `canDrive` says no.
 *
 * Every piece of it stays on the two main streets: the crossing street's
 * centre line `r * (1 + PULL_IN)` out at most, and the quarter circles inside
 * the crossing itself.
 */
export function turnInTown(
  grid: TownGrid, gates: readonly Gate[], gate: number, half: number, roadLane: number, side: number,
): StreetLeg[] | null {
  if (!canDrive(grid, gates, gate, gate)) return null;
  const g = gateWay(gates[gate]!);
  const { ux, uz } = g;
  // The crossing street on the kept side: left of the motion is (uz, -ux).
  const vx = uz * side;
  const vz = -ux * side;
  const lane = throughLane(half) * side;
  const road = roadLane * side;
  const r = Math.min(half, THROUGH_TURN);
  const pull = r * PULL_IN;
  const run = Math.max(0, grid.half - r);
  return [
    line(g.x, g.z, ux, uz, run, TOWN_SLOW, 4, false, [road, lane, lane]),
    arc(-ux * r + vx * r, -uz * r + vz * r, -ux * r, -uz * r, ux, uz, r, TOWN_SLOW, 0, false, [lane, lane * 0.5, 0]),
    line(vx * r, vz * r, vx, vz, pull, TOWN_SLOW, 2, false, [0, 0, 0]),
    wait(vx * (r + pull), vz * (r + pull), vx, vz, 0),
    line(vx * (r + pull), vz * (r + pull), -vx, -vz, pull, REVERSE_SLOW, 1, true, [0, 0, 0]),
    arc(ux * r + vx * r, uz * r + vz * r, vx * r, vz * r, -vx, -vz, r, REVERSE_SLOW, 2, true, [0, 0, 0]),
    wait(ux * r, uz * r, -ux, -uz, 0),
    line(ux * r, uz * r, -ux, -uz, r, TOWN_SLOW, 1, false, [0, 0, 0]),
    line(0, 0, -ux, -uz, grid.half, TOWN_SLOW, 5, false, [0, lane, road]),
  ];
}

/** What a drive costs of its route's parameter, end to end. */
export function streetCost(legs: readonly StreetLeg[]): number {
  let cost = 0;
  for (const leg of legs) cost += leg.cost;
  return cost;
}

/**
 * Where a drive puts a vehicle `at` units of cost into it, written into `out`.
 * `back` drives it the other way, from its end to its start, on the other
 * lane — the way a route's return runs its outward drive.
 */
export function streetPose(legs: readonly StreetLeg[], at: number, back: boolean, out: StreetPose): StreetPose {
  let q = back ? streetCost(legs) - at : at;
  let leg = legs[legs.length - 1]!;
  let t = 1;
  for (const each of legs) {
    if (q <= each.cost) {
      leg = each;
      t = each.cost > 0 ? Math.max(0, q / each.cost) : 1;
      break;
    }
    q -= each.cost;
  }
  const s = eased(leg.ease, t, TOWN_SLOW) * leg.length;
  let x: number;
  let z: number;
  let mx: number;
  let mz: number;
  if (leg.kind === 'arc') {
    const angle = leg.start + (leg.sweep * s) / Math.max(1e-6, leg.length);
    x = leg.x + leg.radius * Math.cos(angle);
    z = leg.z + leg.radius * Math.sin(angle);
    const sign = leg.sweep >= 0 ? 1 : -1;
    mx = -Math.sin(angle) * sign;
    mz = Math.cos(angle) * sign;
  } else {
    x = leg.x + leg.dx * s;
    z = leg.z + leg.dz * s;
    mx = leg.dx;
    mz = leg.dz;
  }
  let fx = leg.reverse ? -mx : mx;
  let fz = leg.reverse ? -mz : mz;
  if (back) {
    mx = -mx;
    mz = -mz;
    fx = -fx;
    fz = -fz;
  }
  // The lane is to the left of the motion as the leg was laid out; driven
  // back, that is the other side of the centre line, which is the other lane.
  const lane = laneAt(leg, s) * (back ? -1 : 1);
  const lx = leg.kind === 'wait' ? leg.dz : back ? -mz : mz;
  const lz = leg.kind === 'wait' ? -leg.dx : back ? mx : -mx;
  out.x = x + lx * lane;
  out.z = z + lz * lane;
  out.fx = fx;
  out.fz = fz;
  out.mx = leg.kind === 'wait' ? fx : mx;
  out.mz = leg.kind === 'wait' ? fz : mz;
  return out;
}
