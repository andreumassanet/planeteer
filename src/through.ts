import { THROUGH_TURN, hasThroughStreets, isMainGate, throughLane } from './scenery/grid.ts';
import type { Gate, TownGrid } from './scenery/grid.ts';

/**
 * A drive through a town: from the gate a vehicle enters by to the gate it
 * leaves by, and the turn it makes where its route ends, in the town's own
 * plane, as pure functions of the square.
 *
 * Drives run along the two main streets (kept clear by `throughClear` in
 * `scenery/grid.ts`) and turn at the middle crossing. A gate off the main
 * streets, or a one-cell square, is not driven through; a route that would
 * need it turns back instead. Heights are not known here: `life.ts` asks the
 * standing town's floor where it draws the vehicle.
 */

/**
 * One piece of a drive: a straight, a quarter turn, or a wait.
 *
 * `cost` is how much of the route's parameter the leg takes (distance at the
 * road's speed): a leg costing more than its length is driven slower, and a
 * wait costs time and covers no ground.
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
  /** Ground distance. */
  length: number;
  cost: number;
  /**
   * Speed profile over the leg: 0 steady, 1 away from a stop, 2 into one,
   * 3 both, 4 slowing from road speed to town speed, 5 the reverse.
   */
  ease: 0 | 1 | 2 | 3 | 4 | 5;
  /** Facing against the motion: reversing. */
  reverse: boolean;
  /**
   * Lane offsets from the centre line (positive left of the motion) at the
   * start, middle and end, each end blended over `blend` units.
   */
  lanes: readonly [number, number, number];
  blend: number;
}

/** Where a drive puts a vehicle: position in its lane, facing, and direction of motion. */
export interface StreetPose {
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** Direction of motion: opposite the facing when reversing, the facing when waiting. */
  mx: number;
  mz: number;
}

/** Route units per unit of street: a car at 39 u/s on the road drives the streets at 13. */
export const TOWN_SLOW = 3;
/** Route units per unit of street when reversing out of a turn. */
const REVERSE_SLOW = 5;
/** A stop, in route units: about half a second at road speeds of 28 to 50 u/s. */
const WAIT_COST = 20;
/** Distance a lane change into and out of a town is blended over, units. */
const LANE_BLEND = 6;
/** How far into the crossing street a turn pulls before backing out, as a share of its radius. */
const PULL_IN = 0.6;

const line = (
  x: number, z: number, dx: number, dz: number, length: number, slow: number,
  ease: StreetLeg['ease'], reverse: boolean, lanes: readonly [number, number, number], blend = LANE_BLEND,
): StreetLeg => ({
  kind: 'line', x, z, dx, dz, radius: 0, start: 0, sweep: 0, length,
  cost: length * slow * easeCost(ease, slow), ease, reverse, lanes, blend,
});

/** A quarter turn about `(cx, cz)` starting at `(ax, az)` moving `(ux, uz)`. */
const arc = (
  cx: number, cz: number, ax: number, az: number, ux: number, uz: number, radius: number,
  slow: number, ease: StreetLeg['ease'], reverse: boolean, lanes: readonly [number, number, number],
): StreetLeg => {
  const start = Math.atan2(az - cz, ax - cx);
  // The sweep's sign makes the start tangent match the motion.
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
 * How much longer an eased leg takes than a steady one, so speeds match where
 * it meets a steady leg: easing from or to rest peaks at twice the mean, both
 * at 1.5; a change between road and town speed averages the two.
 */
function easeCost(ease: StreetLeg['ease'], slow: number): number {
  if (ease === 4 || ease === 5) return 2 / (1 + slow);
  return ease === 0 ? 1 : ease === 3 ? 1.5 : 2;
}

/**
 * The share of a leg's ground covered at `t` of its cost. A speed change is a
 * constant acceleration, so distance is `(2 v0 t + (v1 - v0) t^2) / (v0 + v1)`.
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

/** Whether a town can be driven between two gates (or turned in at one): it has main streets and both gates are on them. */
export function canDrive(grid: TownGrid, gates: readonly Gate[], from: number, to: number): boolean {
  const a = gates[from];
  const b = gates[to];
  return hasThroughStreets(grid) && a !== undefined && b !== undefined && isMainGate(a) && isMainGate(b);
}

/**
 * The drive from gate `from` to gate `to` along the main streets, or null where
 * `canDrive` says no. `half` is the main street's half-width
 * (`mainStreetHalf`), `roadLane` the roads' lane offset and `side` +1 where
 * traffic keeps left, -1 where it keeps right. The same gate twice is a turn
 * (`turnInTown`). Opposite gates are a straight line; adjacent sides turn at
 * the middle crossing on a quarter circle of `THROUGH_TURN` or the street's
 * half-width, whichever is less.
 */
export function driveThrough(
  grid: TownGrid, gates: readonly Gate[], from: number, to: number, half: number, roadLane: number, side: number,
): StreetLeg[] | null {
  if (!canDrive(grid, gates, from, to)) return null;
  if (from === to) return turnInTown(grid, gates, from, half, roadLane, side);
  const a = gateWay(gates[from]!);
  const b = gateWay(gates[to]!);
  // Leaving by `b` is the reverse of its inward way.
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
 * The three-point turn a route ends with at a gate: in to the middle crossing,
 * a quarter turn into the crossing street on the kept side, stop, reverse out
 * turning the other way, stop, and back out the same gate in the other lane.
 * Every leg stays on the main streets. Null where `canDrive` says no.
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

/** A drive's total cost in route units. */
export function streetCost(legs: readonly StreetLeg[]): number {
  let cost = 0;
  for (const leg of legs) cost += leg.cost;
  return cost;
}

/**
 * Where a drive puts a vehicle `at` units of cost into it. `back` drives it
 * from end to start in the other lane, as a route's return leg does.
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
  // The lane is left of the motion as laid out; driven back, that is the other lane.
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
