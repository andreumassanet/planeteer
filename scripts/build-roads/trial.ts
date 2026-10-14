import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { packedBend, packedSpan } from '../../src/pack.ts';
import { radiusOf } from '../../src/places.ts';
import { roadClearance } from '../../src/roads/classes.ts';
import { APPROACH, courseOf, coursePoint, emptyCourse } from '../../src/roads/course.ts';
import { BRIDGE_LAND, BRIDGE_SPAN, emptyRamp, rampReach } from '../../src/roads/crown.ts';
import { gateOpen, rampOf } from '../../src/roads/gates.ts';
import { landmarkAt, screeAt, waterProbeSteps } from '../../src/roads/ground-tests.ts';
import { coursePath, distanceAt, tightestTurn } from '../../src/roads/path.ts';
import { placeDirection, townOf, townOffset } from '../../src/roads/town.ts';
import type { Road } from '../../src/roads/types.ts';
import { latOf, lonOf } from '../../src/sphere.ts';
import type { BakeContext } from './context.ts';

/**
 * The ground tests a road must pass, on the course that will be drawn, and the
 * search for a bow and a pair of gates that passes them.
 */

const DEG = Math.PI / 180;

export type Refusal = 'ramp' | 'fold' | 'wet' | 'own' | 'through' | 'landmark' | 'steep';

export interface Verdict {
  refusal: Refusal | null;
  /** How far from the nearer of its two gates the road was refused, in world units. */
  near: number;
}

/**
 * The bows the search tries: outward from the seeded bend in `BEND_STEP`s,
 * alternating sign so the road stays as straight as it can.
 */
export const BEND_STEP = 0.045;
export const BEND_TRIES = 11;

/** Dry road a bridge's ramp keeps between itself and a gate's approach and ramp. */
const BRIDGE_CLEAR = 10;

/**
 * How far from a gate a refusal must be for another gate to be worth trying:
 * a different gate changes only the road's first stretch, so a road refused
 * in the middle of a bay tries no other gates.
 */
const GATE_REACH = APPROACH * 5;
/** And how many gates of each town it tries, the given one first. */
const GATE_TRIES = 3;
/**
 * And how many trials the gate search may spend on one road: three pairs of
 * gates' worth of bows. Bounded because an unbounded search over every gate
 * pair and bow does not finish; `searchesCut` counts how often it runs out.
 */
const SEARCH_BUDGET = 3 * (2 * BEND_TRIES + 1);

/**
 * A grid of the built towns, so a road can be asked what it runs through: two
 * degrees is 558 units at the equator against a largest built radius of 150,
 * so a 3x3 block covers the reach.
 */
const TOWN_CELL = 2;
const TOWN_COLS = Math.round(360 / TOWN_CELL);
const TOWN_ROWS = Math.round(180 / TOWN_CELL);

export interface RoadTrials {
  /** Which of a town's gates a road may use at all: `gateOpen`, cached per place. */
  openGates(place: number): boolean[];
  /** A town's open gates, the gentlest turn toward `other` first. */
  gatesToward(place: number, other: number): number[];
  trial(road: Road): Verdict;
  /** A bow that gets the road through on the gates it has, or null. Writes it into `road.bend`. */
  bendThatWorks(road: Road, length: number, natural: number): number | null;
  /** A working bow and pair of gates, trying the given gates first; null when nothing works. Writes into `road`. */
  settle(road: Road, length: number, natural: number): { bend: number; moved: boolean } | null;
  readonly trials: number;
  readonly probes: number;
  readonly searchesCut: number;
}

export function createRoadTrials(ctx: BakeContext): RoadTrials {
  const { places, world, unit } = ctx;
  const scratch = new Vector3();

  const openCache = new Map<number, boolean[]>();
  function openGates(place: number): boolean[] {
    let found = openCache.get(place);
    if (found === undefined) {
      const row = places[place]!;
      found = townOf(row).gates.map((_, gate) => gateOpen(row, gate, world));
      openCache.set(place, found);
    }
    return found;
  }

  /**
   * The cost is the turn a road makes out of the gate: the angle between the
   * side's outward normal and the far town as seen from the gate itself, in
   * the town's frame (not the bearing from the town's centre, which misjudges
   * corner gates of a big city).
   */
  const toward = { x: 0, z: 0 };
  function gatesToward(place: number, other: number): number[] {
    const town = townOf(places[place]!);
    placeDirection(places[other]!, scratch);
    townOffset(town, scratch, toward);
    const open = openGates(place);
    return town.gates
      .map((gate, index) => {
        const dx = toward.x - gate.x;
        const dz = toward.z - gate.z;
        const delta = Math.acos(Math.max(-1, Math.min(1, (dx * gate.outX + dz * gate.outZ) / (Math.hypot(dx, dz) || 1))));
        return { index, delta };
      })
      .filter(({ index }) => open[index])
      .sort((x, y) => x.delta - y.delta || x.index - y.index)
      .map(({ index }) => index);
  }

  const builtCells: number[][] = Array.from({ length: TOWN_COLS * TOWN_ROWS }, () => []);
  for (const i of ctx.built) {
    const place = places[i]!;
    const row = Math.min(TOWN_ROWS - 1, Math.max(0, Math.floor((90 - place.lat) / TOWN_CELL)));
    const col = ((Math.floor((place.lon + 180) / TOWN_CELL) % TOWN_COLS) + TOWN_COLS) % TOWN_COLS;
    builtCells[row * TOWN_COLS + col]!.push(i);
  }

  const trialCourse = emptyCourse();
  const trialRamp = emptyRamp();
  const point = new Vector3();
  const townAt = new Vector3();
  const offset = { x: 0, z: 0 };
  let probes = 0;
  let trials = 0;
  let searchesCut = 0;

  /** Whether the walk's current `point`, at `lat`/`lon`, is inside a built town other than the road's own two. */
  function throughTown(road: Road, lat: number, lon: number): boolean {
    const row = Math.min(TOWN_ROWS - 1, Math.max(0, Math.floor((90 - lat) / TOWN_CELL)));
    const span = Math.ceil(1 / Math.max(0.02, Math.cos(lat * DEG)));
    const col = Math.floor((lon + 180) / TOWN_CELL);
    for (let r = Math.max(0, row - 1); r <= Math.min(TOWN_ROWS - 1, row + 1); r++) {
      for (let c = col - span; c <= col + span; c++) {
        for (const j of builtCells[r * TOWN_COLS + (((c % TOWN_COLS) + TOWN_COLS) % TOWN_COLS)]!) {
          if (j === road.a || j === road.b) continue;
          townAt.set(unit[j * 3]!, unit[j * 3 + 1]!, unit[j * 3 + 2]!);
          if (point.angleTo(townAt) * PLANET_RADIUS < radiusOf(places[j]!)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Every test a road must pass on the course it names (bow and gates), the
   * cheapest first; the first that fails is the answer:
   *
   * - the ramps to both gates fit in the road's length (`rampOf`);
   * - the course nowhere turns tighter than its ribbon is wide (`tightestTurn`);
   * - it stays dry at `waterProbeSteps`' stride, except for one bridge;
   * - beyond its approaches it stays out of its own two squares, by the drawn
   *   half-width or the approach where that is shorter;
   * - it stays out of every other built town's disc;
   * - it keeps off every landmark (`landmarkAt`) and crosses no scree (`screeAt`).
   */
  function trial(road: Road): Verdict {
    trials++;
    // Whatever bridge an earlier trial of this road found is its own: this one looks again.
    road.bridgeFrom = 0;
    road.bridgeTo = 0;
    const course = courseOf(road, places, trialCourse);
    const ramp = rampOf(road, course, places, world, trialRamp);
    if (rampReach(ramp.riseA) + rampReach(ramp.riseB) > course.length) return { refusal: 'ramp', near: 0 };
    const path = coursePath(course);
    if (tightestTurn(path) < roadClearance(road.cls)) return { refusal: 'fold', near: 0 };
    const townA = townOf(places[road.a]!);
    const townB = townOf(places[road.b]!);
    const margin = Math.min(roadClearance(road.cls), course.approach);
    const reachA = townA.grid.half + margin;
    const reachB = townB.grid.half + margin;
    const steps = waterProbeSteps(course);
    probes += steps + 1;
    // The water it crosses, as probe indices: one run of it, at most.
    let wetFirst = -1;
    let wetLast = -1;
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const near = Math.min(t, 1 - t) * course.length;
      coursePoint(course, t, point);
      const lat = latOf(point.y);
      const lon = lonOf(point.x, point.z);
      // Water is a bridge's, once; the squares are tested over it all the
      // same, because a town's square reaches out over its own quay.
      if (world.countryAt(lat, lon) === 0) {
        if (wetFirst >= 0 && wetLast < step - 1) return { refusal: 'wet', near };
        if (wetFirst < 0) wetFirst = step;
        wetLast = step;
      }
      if (t > course.share && t < 1 - course.share) {
        townOffset(townA, point, offset);
        if (Math.abs(offset.x) < reachA && Math.abs(offset.z) < reachA) return { refusal: 'own', near: 0 };
        townOffset(townB, point, offset);
        if (Math.abs(offset.x) < reachB && Math.abs(offset.z) < reachB) return { refusal: 'own', near: 0 };
      }
      if (throughTown(road, lat, lon)) return { refusal: 'through', near };
    }
    if (wetFirst >= 0) {
      // A bridge from the last dry probe before the water to the first after:
      // no wider than `BRIDGE_SPAN`, with `BRIDGE_LAND` of dry road before each
      // shore clear of its gate's approach and ramp.
      const from = packedSpan(distanceAt(path, Math.max(0, wetFirst - 1) / steps));
      const to = packedSpan(distanceAt(path, Math.min(steps, wetLast + 1) / steps));
      const near = Math.min(from, path.length - to);
      if (wetFirst === 0 || wetLast === steps || to - from > BRIDGE_SPAN) return { refusal: 'wet', near };
      const clearA = course.approach + rampReach(ramp.riseA) + BRIDGE_CLEAR;
      const clearB = course.approach + rampReach(ramp.riseB) + BRIDGE_CLEAR;
      if (from - BRIDGE_LAND < clearA || to + BRIDGE_LAND > path.length - clearB) return { refusal: 'wet', near };
      road.bridgeFrom = from;
      road.bridgeTo = to;
    }
    const landmark = landmarkAt(road, places);
    if (landmark >= 0) {
      road.bridgeFrom = road.bridgeTo = 0;
      return { refusal: 'landmark', near: Math.min(landmark, 1 - landmark) * course.length };
    }
    const steep = screeAt(road, places);
    if (steep >= 0) {
      road.bridgeFrom = road.bridgeTo = 0;
      return { refusal: 'steep', near: Math.min(steep, 1 - steep) * course.length };
    }
    return { refusal: null, near: Infinity };
  }

  /**
   * Searches for a bow that avoids water, a mountain or a town in the way,
   * outward from the seeded bend. A short road may bow up to 0.3 of its
   * length; a long one is capped at 110 units of bow so it cannot wander into
   * the interior to save itself. The path drawn is the path tested.
   */
  function bendThatWorks(road: Road, length: number, natural: number): number | null {
    road.bend = natural;
    if (trial(road).refusal === null) return natural;
    const limit = Math.min(0.3, Math.max(0.15, 110 / length));
    for (let k = 1; k <= BEND_TRIES; k++) {
      for (const sign of [1, -1]) {
        const bend = packedBend(sign * k * BEND_STEP);
        if (Math.abs(bend) > limit) continue;
        road.bend = bend;
        if (trial(road).refusal === null) return bend;
      }
    }
    return null;
  }

  function settle(road: Road, length: number, natural: number): { bend: number; moved: boolean } | null {
    const givenA = road.gateA;
    const givenB = road.gateB;
    const first = trial({ ...road, bend: natural });
    const bend = bendThatWorks(road, length, natural);
    if (bend !== null) return { bend, moved: false };
    if (first.near > GATE_REACH) return null;
    const optionsA = [givenA, ...gatesToward(road.a, road.b).filter((g) => g !== givenA)].slice(0, GATE_TRIES);
    const optionsB = [givenB, ...gatesToward(road.b, road.a).filter((g) => g !== givenB)].slice(0, GATE_TRIES);
    const pairs: [number, number, number][] = [];
    optionsA.forEach((ga, i) => optionsB.forEach((gb, j) => {
      if (i + j > 0) pairs.push([ga, gb, i + j]);
    }));
    pairs.sort((x, y) => x[2] - y[2]);
    const started = trials;
    for (const [ga, gb] of pairs) {
      if (trials - started >= SEARCH_BUDGET) {
        searchesCut++;
        break;
      }
      road.gateA = ga;
      road.gateB = gb;
      const found = bendThatWorks(road, length, natural);
      if (found !== null) return { bend: found, moved: true };
    }
    road.gateA = givenA;
    road.gateB = givenB;
    return null;
  }

  return {
    openGates,
    gatesToward,
    trial,
    bendThatWorks,
    settle,
    get trials() {
      return trials;
    },
    get probes() {
      return probes;
    },
    get searchesCut() {
      return searchesCut;
    },
  };
}
