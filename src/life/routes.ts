/**
 * Routes over the road network: a point on a road, the graph of which roads
 * meet where, and a walker's out-and-back chain of roads. A vehicle's looped
 * drive through the towns is `drive.ts`.
 */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import {
  ROAD_CLASSES,
  courseOf,
  coursePoint,
  courseTangent,
  emptyCourse,
  needsCentre,
  onBridge,
  parameterAt,
  rampOf,
  ribbonHalf,
  roadGeometryFor,
  surfaceLift,
  townOf,
} from '../roads.ts';
import type { CoursePath, Road, RoadCourse, RoadRamp } from '../roads.ts';
import { rngFrom } from '../scenery/random.ts';
import { keepsLeft } from '../traffic/regions.ts';
import { wrap } from './mover.ts';
import type { Frame } from './mover.ts';
import { MAX_HOPS, MIN_ROUTE } from './tuning.ts';

const frameHere = new THREE.Vector3();
const frameSide = new THREE.Vector3();

/**
 * A point on a road, `s` units along it from its first gate, offset `lateral`
 * from its centre line. Shared with `scripts/check-life.ts` so the check
 * asserts on the curve a vehicle drives. The position comes from the road's
 * course (the ribbon was drawn from it), and `s` is distance along the
 * course's path, so a constant speed covers ground at a constant speed.
 */
export function roadFrameOf(
  course: RoadCourse, path: CoursePath, s: number, lateral: number, out: Frame,
): Frame {
  const t = parameterAt(path, s);
  coursePoint(course, t, frameHere);
  courseTangent(course, t, out.forward);
  // Sideways is `up x forward`, the mover's left.
  frameSide.crossVectors(frameHere, out.forward).normalize();
  out.dir.copy(frameHere).addScaledVector(frameSide, lateral / PLANET_RADIUS).normalize();
  out.height = PLANET_RADIUS;
  out.roll = 0;
  out.pitch = 0;
  out.live = true;
  return out;
}

/**
 * One leg of a walker's chain: a road, which way along it, its length, and
 * how far across the town at its far end the next leg begins (the gates'
 * offsets apart in x plus z). A walker is hidden while it crosses a town.
 */
interface Hop {
  road: number;
  forward: boolean;
  length: number;
  transit: number;
}

export interface Chain {
  hops: Hop[];
  total: number;
}

/** The road network as the movers drive it. */
export interface Routes {
  roads: readonly Road[];
  /** Each road's midpoint as a unit vector, three numbers a road, and half its length. */
  roadMid: Float64Array;
  roadSpan: Float64Array;
  geometry: ReturnType<typeof roadGeometryFor>;
  /** Roads meeting at place `p`: `edgeOf[edgeStart[p]]` to `edgeOf[edgeStart[p + 1] - 1]`. */
  edgeStart: Int32Array;
  edgeOf: Int32Array;
  sideOf(index: number): number;
  lengthOf(index: number): number;
  gateAt(road: Road, town: number): number;
  chainFor(first: number, key: string): Chain;
  chainFrame(chain: Chain, distance: number, lateral: number, out: Frame, ground: boolean, back: boolean): void;
  alongAt(chain: Chain, phase: number, speed: number, clock: number): { at: number; back: boolean };
  roadFrame(index: number, s: number, lateral: number, out: Frame, ground: boolean): void;
  /** Forgets the ramps: the towns they climb into have changed. */
  clearRamps(): void;
}

export function createRoutes(world: World, places: readonly Place[], roads: readonly Road[]): Routes {
  const here = new THREE.Vector3();
  const onCentre = new THREE.Vector3();

  /** Every road's midpoint (its course at `t = 0.5`) and half its length, for the scan's flat pass. */
  const roadMid = new Float64Array(roads.length * 3);
  const roadSpan = new Float64Array(roads.length);
  {
    const course = emptyCourse();
    roads.forEach((road, i) => {
      courseOf(road, places, course);
      coursePoint(course, 0.5, here);
      roadMid[i * 3] = here.x;
      roadMid[i * 3 + 1] = here.y;
      roadMid[i * 3 + 2] = here.z;
      roadSpan[i] = course.length * 0.5;
    });
  }

  /**
   * Which side each road's traffic keeps, as the sign of a lateral offset:
   * `roadFrameOf` offsets towards the mover's left, so +1 keeps left and -1
   * keeps right. Decided by the country of the road's first town, the same
   * town that chose its vehicles (`trafficAt(road.a)`).
   */
  const keepSide = new Int8Array(roads.length);
  const sideOf = (index: number): number => {
    let side = keepSide[index]!;
    if (side === 0) {
      side = keepsLeft(places[roads[index]!.a]!.iso ?? '') ? 1 : -1;
      keepSide[index] = side;
    }
    return side;
  };

  /** Every road's course and path, cached; the same cache the ribbon and the wood read. */
  const geometry = roadGeometryFor(roads, places);
  /** Each road's ramp into its gates, kept until the prominence knob turns (a ramp only climbs into a built town). */
  const ramps = new Map<number, RoadRamp>();
  const rampFor = (index: number): RoadRamp => {
    let found = ramps.get(index);
    if (found === undefined) {
      found = rampOf(roads[index]!, geometry.course(index), places, world);
      if (ramps.size > 4096) ramps.clear();
      ramps.set(index, found);
    }
    return found;
  };

  /** Which roads meet at each place, compressed: an offset per place into one run of road indices. */
  const edgeStart = new Int32Array(places.length + 1);
  const edgeOf = new Int32Array(roads.length * 2);
  for (const road of roads) {
    edgeStart[road.a + 1]!++;
    edgeStart[road.b + 1]!++;
  }
  for (let i = 0; i < places.length; i++) edgeStart[i + 1]! += edgeStart[i]!;
  {
    const cursor = Int32Array.from(edgeStart.subarray(0, places.length));
    roads.forEach((road, i) => {
      edgeOf[cursor[road.a]!++] = i;
      edgeOf[cursor[road.b]!++] = i;
    });
  }

  const chains = new Map<string, Chain>();
  const lengthOf = (i: number): number => Math.max(1, geometry.path(i).length);
  /** The gate a road uses at one of its two towns. */
  const gateAt = (road: Road, town: number): number => (town === road.a ? road.gateA : road.gateB);
  /** How far across a town from one of its gates to another, along its streets. */
  const transitOf = (town: number, from: number, to: number): number => {
    if (from === to) return 0;
    const gates = townOf(places[town]!).gates;
    return Math.abs(gates[from]!.x - gates[to]!.x) + Math.abs(gates[from]!.z - gates[to]!.z);
  };

  /** A walker's chain of roads out of `first`, seeded by `key`, never taking the road it just came by. */
  function chainFor(first: number, key: string): Chain {
    const known = chains.get(key);
    if (known !== undefined) return known;
    const hops: Hop[] = [{ road: first, forward: true, length: lengthOf(first), transit: 0 }];
    let total = hops[0]!.length;
    let at = roads[first]!.b;
    let previous = first;
    for (let hop = 1; hop < MAX_HOPS && total < MIN_ROUTE; hop++) {
      const from = edgeStart[at]!;
      const to = edgeStart[at + 1]!;
      if (to - from < 2) break;
      const rng = rngFrom(key, 'hop', hop);
      // Retry rather than filter: with a mean degree around three, a few draws find one.
      let next = -1;
      for (let tries = 0; tries < 6 && next < 0; tries++) {
        const candidate = edgeOf[from + rng.int(to - from)]!;
        if (candidate !== previous) next = candidate;
      }
      if (next < 0) break;
      const road = roads[next]!;
      const forward = road.a === at;
      const arrived = hops.at(-1)!;
      arrived.transit = transitOf(at, gateAt(roads[previous]!, at), gateAt(road, at));
      total += arrived.transit;
      hops.push({ road: next, forward, length: lengthOf(next), transit: 0 });
      total += hops.at(-1)!.length;
      at = forward ? road.b : road.a;
      previous = next;
    }
    const made = { hops, total };
    if (chains.size > 4000) chains.clear();
    chains.set(key, made);
    return made;
  }

  /**
   * A mover on a road, `s` units along it from its first gate. The height is
   * the ribbon's own surface (`surfaceLift`): the crown under a car, the
   * shoulder under a walker on the verge, and the climb to each gate.
   */
  function roadFrame(index: number, s: number, lateral: number, out: Frame, ground: boolean): void {
    const course = geometry.course(index);
    const path = geometry.path(index);
    const ramp = rampFor(index);
    const sB = path.length - s;
    // Over a bridge's water a walker keeps to the deck, inside its railing.
    const bridged = onBridge(ramp, s);
    if (bridged) {
      const top = ribbonHalf(ramp, (ROAD_CLASSES[roads[index]!.cls] ?? ROAD_CLASSES[0]!).width * 0.5, s, sB) - 0.4;
      lateral = Math.max(-top, Math.min(top, lateral));
    }
    roadFrameOf(course, path, s, lateral, out);
    if (!ground) {
      out.height = PLANET_RADIUS + 20;
      out.live = true;
      return;
    }
    const elevation = world.elevationAt(out.dir);
    const centre = needsCentre(ramp, s, sB)
      ? world.elevationAt(coursePoint(course, parameterAt(path, s), onCentre))
      : elevation;
    const half = (ROAD_CLASSES[roads[index]!.cls] ?? ROAD_CLASSES[0]!).width * 0.5;
    // Live on land, and on a bridge's deck over the water.
    out.live = elevation > 0 || bridged;
    out.height = PLANET_RADIUS + elevation + Math.max(0, surfaceLift(ramp, half, s, sB, lateral, elevation, centre));
  }

  /**
   * Where a chain puts a walker `distance` units along it. Between two roads
   * it is in a town: parked at the gate it went in by and not live.
   */
  function chainFrame(
    chain: Chain, distance: number, lateral: number, out: Frame, ground: boolean, back: boolean,
  ): void {
    let along = distance;
    let index = 0;
    let crossing = false;
    while (index < chain.hops.length - 1 && along >= chain.hops[index]!.length) {
      const passed = chain.hops[index]!;
      if (along - passed.length < passed.transit) {
        along = passed.length;
        crossing = true;
        break;
      }
      along -= passed.length + passed.transit;
      index++;
    }
    const hop = chain.hops[index]!;
    const local = Math.max(0, Math.min(hop.length, along));
    // The heading and the side kept depend on the direction of travel; the
    // side is each road's own country's law.
    const sign = (hop.forward ? 1 : -1) * (back ? -1 : 1);
    roadFrame(hop.road, hop.forward ? local : hop.length - local, lateral * sign * sideOf(hop.road), out, ground);
    if (sign < 0) out.forward.negate();
    if (crossing) out.live = false;
  }

  /**
   * A walker's route is travelled out and back, so it never teleports from the
   * end of its chain to the start; it turns round at each end instead.
   * Returns the distance along the chain and whether it is on the way back.
   */
  function alongAt(chain: Chain, phase: number, speed: number, clock: number): { at: number; back: boolean } {
    const cycle = wrap(phase + (clock * speed) / (2 * chain.total));
    const back = cycle >= 0.5;
    return { at: (back ? 1 - cycle : cycle) * 2 * chain.total, back };
  }

  return {
    roads, roadMid, roadSpan, geometry, edgeStart, edgeOf,
    sideOf, lengthOf, gateAt, chainFor, chainFrame, alongAt, roadFrame,
    clearRamps(): void {
      ramps.clear();
    },
  };
}
