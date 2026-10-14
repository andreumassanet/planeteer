/**
 * A road vehicle's route: a loop out along a chain of roads and the drives
 * through the towns between them (`through.ts`), a turn at the far end, the
 * same way back on the other lane, and a turn at the start. Every piece is
 * drawn, so nothing in the loop is a jump.
 */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import { townOf } from '../roads.ts';
import type { RegionStyle } from '../scenery/contract.ts';
import { mainStreetHalf } from '../scenery/grid.ts';
import { groundStyleFor } from '../scenery/ground.ts';
import { rngFrom } from '../scenery/random.ts';
import { driveThrough, streetCost, turnInTown } from '../through.ts';
import type { StreetLeg } from '../through.ts';
import type { LifeOptions } from './api.ts';
import { emptyFrame, wrap } from './mover.ts';
import type { Frame } from './mover.ts';
import type { Routes } from './routes.ts';
import { createTownDrive } from './town-drive.ts';
import { MAX_HOPS, MIN_ROUTE } from './tuning.ts';

/** One road of a drive, and the drive through the town at its far end onto the next (or none at the route's end). */
interface DriveHop {
  road: number;
  forward: boolean;
  /** The stretch of the road driven, as distances from its `a` gate, and its length. */
  from: number;
  to: number;
  length: number;
  /** How much of it, at its start and end the way the run goes, is spent slowing into or out of a turn; and its cost with them. */
  rampFrom: number;
  rampTo: number;
  cost: number;
  /** The drive through the town at this road's far end, onto the next hop. */
  through: StreetLeg[] | null;
  throughCost: number;
  /** That town, by place index, and a key for what `paved` found there. */
  town: number;
  key: string;
}

/**
 * Where a drive turns round: along the town's main streets (`turnInTown`),
 * or, where it has none or the gate is off them, on the road's own
 * carriageway short of the gate, on a half circle between its two lanes.
 */
interface DriveTurn {
  legs: StreetLeg[] | null;
  town: number;
  key: string;
  road: number;
  /** Which end of `road` the turn is at: its `b` end, or its `a`. */
  atB: boolean;
  cost: number;
}

export interface Drive {
  hops: DriveHop[];
  /** The outward run's cost, roads and towns. */
  run: number;
  end: DriveTurn;
  start: DriveTurn;
  /** The whole loop: out, round, back, round. */
  total: number;
}

/**
 * How much slower than its road a car turns on the carriageway, as route per
 * unit of half circle, and the length of road it slows over.
 */
const RIBBON_SLOW = 6;
const RIBBON_RAMP = 12;
/** How far short of a town, in route, a vehicle asks `paved` about it. */
const PAVED_AHEAD = 160;

/** A hop's cost of route: its length, less what its ramps save at a speed between the road's and the turn's. */
function hopCost(hop: DriveHop): number {
  const k = 1 / RIBBON_SLOW;
  return hop.length - hop.rampFrom - hop.rampTo + ((hop.rampFrom + hop.rampTo) * 2) / (1 + k);
}

/**
 * How far along a hop, the way the run goes, `q` of its cost has taken the
 * vehicle: steadily, and through a ramp at a steady change of speed (as
 * `through.ts` eases).
 */
function hopGround(hop: DriveHop, q: number): number {
  const k = 1 / RIBBON_SLOW;
  const rampCost = (ramp: number): number => (ramp * 2) / (1 + k);
  const first = rampCost(hop.rampFrom);
  if (q < first) {
    const t = q / first;
    return (hop.rampFrom * (2 * k * t + (1 - k) * t * t)) / (1 + k);
  }
  const middle = hop.length - hop.rampFrom - hop.rampTo;
  if (q < first + middle) return hop.rampFrom + (q - first);
  const last = rampCost(hop.rampTo);
  const t = last > 0 ? Math.min(1, (q - first - middle) / last) : 1;
  return hop.rampFrom + middle + (hop.rampTo * (2 * t + (k - 1) * t * t)) / (1 + k);
}

/** Where on its loop a vehicle is: phase plus the clock, wrapped. */
export const driveAt = (drive: Drive, phase: number, speed: number, clock: number): number =>
  wrap(phase + (clock * speed) / drive.total) * drive.total;

export interface Drives {
  driveFor(first: number, key: string, lane: number): Drive;
  /** Where a drive puts a vehicle at `at` units of its loop. */
  driveFrame(drive: Drive, at: number, lane: number, out: Frame, ground: boolean): void;
  /** What the last `driveFrame` put the vehicle on: 0 a road, 1 a town street, 2 a turn in a town, 3 a turn on the carriageway. */
  readonly part: number;
  resetPart(): void;
  /** Lets `paved` check one more drive this frame. */
  beginFrame(): void;
  /** Forgets which drives are paved: the towns standing have changed. */
  clearPaved(): void;
}

interface DriveDeps {
  world: World;
  places: readonly Place[];
  routes: Routes;
  regionAt(index: number): RegionStyle;
  streets: LifeOptions['streets'];
}

export function createDrives({ world, places, routes, regionAt, streets }: DriveDeps): Drives {
  const { roads, edgeStart, edgeOf, sideOf, lengthOf, gateAt, roadFrame } = routes;
  const { streetFrame, paved, ...towns } = createTownDrive(world, places, streets);
  const drives = new Map<string, Drive>();
  let drivePart = 0;
  const turnFrame = emptyFrame();
  const turnLeft = new THREE.Vector3();

  /** A town's main street half-width, which depends on its region. */
  const mainHalfOf = (town: number): number =>
    mainStreetHalf(townOf(places[town]!).grid, groundStyleFor(regionAt(town).id).street);

  function turnAt(town: number, gate: number, road: number, atB: boolean, lane: number): DriveTurn {
    const square = townOf(places[town]!);
    const legs = turnInTown(square.grid, square.gates, gate, mainHalfOf(town), lane, sideOf(road));
    return {
      legs, town, key: `${town}|${gate}|turn`, road, atB,
      cost: legs !== null ? streetCost(legs) : Math.PI * lane * RIBBON_SLOW,
    };
  }

  function driveFor(first: number, key: string, lane: number): Drive {
    const known = drives.get(key);
    if (known !== undefined) return known;
    const hops: DriveHop[] = [{
      road: first, forward: true, from: 0, to: lengthOf(first), length: lengthOf(first),
      rampFrom: 0, rampTo: 0, cost: lengthOf(first),
      through: null, throughCost: 0, town: roads[first]!.b, key: '',
    }];
    let run = hops[0]!.length;
    let at = roads[first]!.b;
    let previous = first;
    for (let hop = 1; hop < MAX_HOPS && run < MIN_ROUTE; hop++) {
      const from = edgeStart[at]!;
      const to = edgeStart[at + 1]!;
      if (to - from < 2) break;
      const rng = rngFrom(key, 'hop', hop);
      const square = townOf(places[at]!);
      const gateIn = gateAt(roads[previous]!, at);
      // The walkers' draw, also refusing a road no drive through the town reaches.
      let next = -1;
      let legs: StreetLeg[] | null = null;
      for (let tries = 0; tries < 6 && next < 0; tries++) {
        const candidate = edgeOf[from + rng.int(to - from)]!;
        if (candidate === previous) continue;
        legs = driveThrough(square.grid, square.gates, gateIn, gateAt(roads[candidate]!, at), mainHalfOf(at), lane, sideOf(previous));
        if (legs !== null) next = candidate;
      }
      if (next < 0 || legs === null) break;
      const arrived = hops.at(-1)!;
      arrived.through = legs;
      arrived.throughCost = streetCost(legs);
      arrived.key = `${at}|${gateIn}|${gateAt(roads[next]!, at)}`;
      run += arrived.throughCost;
      const road = roads[next]!;
      const forward = road.a === at;
      at = forward ? road.b : road.a;
      hops.push({
        road: next, forward, from: 0, to: lengthOf(next), length: lengthOf(next),
        rampFrom: 0, rampTo: 0, cost: lengthOf(next),
        through: null, throughCost: 0, town: at, key: '',
      });
      run += hops.at(-1)!.length;
      previous = next;
    }
    const last = hops.at(-1)!;
    const end = turnAt(at, gateAt(roads[last.road]!, at), last.road, last.forward, lane);
    const start = turnAt(roads[first]!.a, roads[first]!.gateA, first, false, lane);
    // A turn on the carriageway is a half circle short of the gate, so its
    // road is driven only that far, slowing into it over the last stretch.
    const trim = (hop: DriveHop, atB: boolean, atEnd: boolean): void => {
      const cut = Math.min(lane, lengthOf(hop.road) / 4);
      if (atB) hop.to -= cut;
      else hop.from += cut;
      hop.length -= cut;
      const ramp = Math.min(RIBBON_RAMP, hop.length / 3);
      if (atEnd) hop.rampTo = ramp;
      else hop.rampFrom = ramp;
    };
    if (end.legs === null) trim(last, last.forward, true);
    if (start.legs === null) trim(hops[0]!, false, false);
    run = 0;
    for (const hop of hops) {
      hop.cost = hopCost(hop);
      run += hop.cost + hop.throughCost;
    }
    const made: Drive = { hops, run, end, start, total: 2 * run + end.cost + start.cost };
    if (drives.size > 4000) drives.clear();
    drives.set(key, made);
    return made;
  }

  function driveFrame(drive: Drive, at: number, lane: number, out: Frame, ground: boolean): void {
    let q = at;
    if (q < drive.run) return runFrame(drive, q, false, lane, out, ground);
    q -= drive.run;
    if (q < drive.end.cost) return turnRound(drive.end, q, lane, out, ground);
    q -= drive.end.cost;
    if (q < drive.run) return runFrame(drive, drive.run - q, true, lane, out, ground);
    q -= drive.run;
    turnRound(drive.start, Math.min(q, drive.start.cost), lane, out, ground);
  }

  /** The outward run at `q`, driven out or, `back`, home. */
  function runFrame(drive: Drive, q: number, back: boolean, lane: number, out: Frame, ground: boolean): void {
    drivePart = 0;
    let along = q;
    for (let index = 0; index < drive.hops.length; index++) {
      const hop = drive.hops[index]!;
      if (along <= hop.cost || index === drive.hops.length - 1) {
        const local = hopGround(hop, Math.max(0, Math.min(hop.cost, along)));
        const sign = (hop.forward ? 1 : -1) * (back ? -1 : 1);
        roadFrame(hop.road, hop.forward ? hop.from + local : hop.to - local, lane * sign * sideOf(hop.road), out, ground);
        if (sign < 0) out.forward.negate();
        // Ask about the town ahead before reaching it, so the answer is ready at the gate.
        if (ground && out.live) {
          const ahead = back ? along : hop.cost - along;
          if (ahead < PAVED_AHEAD) {
            if (!back && hop.through !== null) paved(hop.town, hop.through, hop.key);
            else if (!back && index === drive.hops.length - 1 && drive.end.legs !== null) paved(drive.end.town, drive.end.legs, drive.end.key);
            else if (back && index > 0) {
              const behind = drive.hops[index - 1]!;
              if (behind.through !== null) paved(behind.town, behind.through, behind.key);
            } else if (back && drive.start.legs !== null) paved(drive.start.town, drive.start.legs, drive.start.key);
          }
        }
        return;
      }
      along -= hop.cost;
      if (hop.through !== null && along < hop.throughCost) {
        drivePart = 1;
        // Driven home, the drive through the town starts from its other end.
        streetFrame(hop.town, hop.through, back ? hop.throughCost - along : along, back, hop.key, out, ground);
        return;
      }
      along -= hop.throughCost;
    }
  }

  /** A turn at one end of the loop, `q` units into it. */
  function turnRound(turn: DriveTurn, q: number, lane: number, out: Frame, ground: boolean): void {
    drivePart = turn.legs !== null ? 2 : 3;
    if (turn.legs !== null) {
      streetFrame(turn.town, turn.legs, q, false, turn.key, out, ground);
      return;
    }
    // On the carriageway: the half circle between the two lanes, its far
    // point on the gate's kerb line (`trim`'s cut in `driveFor`).
    const length = lengthOf(turn.road);
    const radius = Math.min(lane, length / 4);
    const s = turn.atB ? length - radius : radius;
    roadFrame(turn.road, s, 0, turnFrame, ground);
    const motion = turnFrame.forward;
    if (!turn.atB) motion.negate();
    turnLeft.crossVectors(turnFrame.dir, motion).normalize();
    const angle = (Math.PI * q) / Math.max(1e-6, turn.cost);
    const offset = lane * sideOf(turn.road);
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    out.dir
      .copy(turnFrame.dir)
      .addScaledVector(motion, (radius * sin) / PLANET_RADIUS)
      .addScaledVector(turnLeft, (offset * cos) / PLANET_RADIUS)
      .normalize();
    out.forward.copy(motion).multiplyScalar(radius * cos).addScaledVector(turnLeft, -offset * sin).normalize();
    out.height = turnFrame.height;
    out.roll = 0;
    out.pitch = 0;
    out.live = turnFrame.live;
  }

  return {
    driveFor,
    driveFrame,
    get part(): number {
      return drivePart;
    },
    resetPart(): void {
      drivePart = 0;
    },
    beginFrame: towns.beginFrame,
    clearPaved: towns.clearPaved,
  };
}
