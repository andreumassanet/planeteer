import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { LANDMARK_KEEP, eachLandmarkNear, planGap, planGapToBox } from '../landmark-ground.ts';
import type { PlanShape } from '../landmark-ground.ts';
import { isShown } from '../places.ts';
import type { Place } from '../places.ts';
import { GROUND_LIFT } from '../scenery/ground.ts';
import { assignGates, gateMouth, inParcel, landmarkParcel, offsetDirection } from '../scenery/grid.ts';
import type { Gate } from '../scenery/grid.ts';
import type { XYZ } from '../sphere.ts';
import { APPROACH, coursePoint } from './course.ts';
import type { RoadCourse } from './course.ts';
import { BRIDGE_LAND, RIBBON_LIFT, emptyRamp } from './crown.ts';
import type { RoadRamp } from './crown.ts';
import { gateHeight } from './gate-levels.ts';
import { WATER_PROBE_STEP } from './ground-tests.ts';
import { coursePath, parameterAt } from './path.ts';
import { bandOf, placeDirection, townOf, townOffset } from './town.ts';
import type { Town } from './town.ts';
import type { Road } from './types.ts';

/** Which gate of a town a road may use, which it is given, and how it climbs to it. */

const gateProbe = new THREE.Vector3();
const gateOffset = { x: 0, z: 0 };

/**
 * Whether a road may come in by a gate at all: the town can cut its cells
 * (`gateHeight`), no landmark takes it, and the straight approach out of it is
 * dry for its whole `APPROACH`, walked at the water test's stride. A gate
 * that fails is never offered to `assignGates`. Slope is left to the road's
 * own walk, so a road that bows off a steep face still gets in.
 */
export function gateOpen(place: Place, gate: number, world: World): boolean {
  if (gateHeight(place, gate, world) === null) return false;
  if (gateUnderLandmark(place, gate)) return false;
  const town = townOf(place);
  const which = town.gates[gate]!;
  for (let s = 0; s <= APPROACH + 1e-9; s += WATER_PROBE_STEP) {
    offsetDirection(town.up, town.across, town.north, which.x + which.outX * s, which.z + which.outZ * s, gateProbe);
    if (world.countryAtPoint(gateProbe) === 0) return false;
  }
  return true;
}

const landmarkOffset = { x: 0, z: 0 };
const landmarkUp = new THREE.Vector3();

/**
 * Whether a landmark takes a gate: one of its cells is in the landmark's
 * parcel (`landmarkParcel`, the town's own test) or its approach passes
 * within `LANDMARK_KEEP` of the plan. Only landmarks registered with
 * `setLandmarks` count, which the road bake and `pnpm check` do.
 */
export function gateUnderLandmark(place: Place, gate: number): boolean {
  const town = townOf(place);
  const which = town.gates[gate]!;
  let under = false;
  eachLandmarkNear(town.up, town.grid.half * Math.SQRT2 + APPROACH + LANDMARK_KEEP, (up, shape) => {
    if (!under && gateTaken(town, which, landmarkAt3(town, up), shape)) under = true;
  });
  return under;
}

/** A landmark's point in a town's frame, into `landmarkOffset`. */
function landmarkAt3(town: Town, up: XYZ): { x: number; z: number } {
  landmarkUp.set(up.x, up.y, up.z);
  return townOffset(town, landmarkUp, landmarkOffset);
}

/** Whether a landmark at `at` in a town's frame takes one of its gates: see `gateUnderLandmark`. */
function gateTaken(town: Town, which: Gate, at: { x: number; z: number }, shape: PlanShape): boolean {
  const parcel = landmarkParcel(town.grid, at.x, at.z, shape);
  if (parcel !== null && which.cells.some(([col, row]) => inParcel(parcel, col, row))) return true;
  for (let s = 0; s <= APPROACH + 1e-9; s += WATER_PROBE_STEP) {
    if (planGap(shape, which.x + which.outX * s - at.x, which.z + which.outZ * s - at.z) < LANDMARK_KEEP) return true;
  }
  return false;
}

/**
 * What a landmark standing at `up` would take of a town: whether it would
 * stand on the town's middle cell, and which gates `gateUnderLandmark` would
 * shut. `build-monuments.ts` asks this, so a landmark it leaves in a town
 * leaves the gates the road bake finds open.
 */
export function landmarkTakes(place: Place, up: XYZ, shape: PlanShape): { middle: boolean; gates: number[]; of: number } {
  const town = townOf(place);
  const at = { ...landmarkAt3(town, up) };
  const half = town.grid.pitch / 2;
  const middle = planGapToBox(shape, -half - at.x, half - at.x, -half - at.z, half - at.z) < LANDMARK_KEEP;
  const gates: number[] = [];
  town.gates.forEach((which, index) => {
    if (gateTaken(town, which, at, shape)) gates.push(index);
  });
  return { middle, gates, of: town.gates.length };
}

/**
 * Which gate each of a town's roads comes in by, before the ground has had
 * its say: `assignGates` over the bearings to the far towns, among the gates
 * `open` admits. An index per road, or -1 where no gate is open. The bearing
 * is the far town's direction in the town's frame, not the road's heading,
 * which depends on the gate.
 */
export function assignTownGates(
  place: Place,
  others: readonly Place[],
  open: (gate: number) => boolean,
): number[] {
  const town = townOf(place);
  const leaving = others.map((other) => {
    placeDirection(other, gateProbe);
    return [gateProbe.dot(town.across), gateProbe.dot(town.north)] as const;
  });
  // Where each is going, in world units in the town's frame, which is what
  // `assignGates` measures a gate's facing against.
  const toward = others.map((other) => {
    townOffset(town, placeDirection(other, gateProbe), gateOffset);
    return [gateOffset.x, gateOffset.z] as const;
  });
  return assignGates(town.gates, leaving, toward, (_, index) => open(index));
}

/**
 * The gates a set of pairs would use before any is tested: `assignTownGates`
 * at every town over every pair ending there, among the gates `gateOpen`
 * admits. Two entries per pair (`a`'s then `b`'s), -1 where a town has none
 * open. The bake starts from this and `pnpm check` explains every missing
 * candidate against it; deterministic in the order the pairs come in.
 */
export function candidateGates(
  places: readonly Place[],
  pairs: readonly { a: number; b: number }[],
  world: World,
): Int16Array {
  const chosen = new Int16Array(pairs.length * 2).fill(-1);
  const byTown = new Map<number, number[]>();
  pairs.forEach((pair, i) => {
    for (const [town, end] of [[pair.a, i * 2], [pair.b, i * 2 + 1]] as const) {
      const list = byTown.get(town);
      if (list === undefined) byTown.set(town, [end]);
      else list.push(end);
    }
  });
  for (const [town, ends] of byTown) {
    const place = places[town]!;
    const open = townOf(place).gates.map((_, gate) => gateOpen(place, gate, world));
    const others = ends.map((end) => {
      const pair = pairs[end >> 1]!;
      return places[end % 2 === 0 ? pair.b : pair.a]!;
    });
    const gates = assignTownGates(place, others, (gate) => open[gate]!);
    ends.forEach((end, k) => {
      chosen[end] = gates[k]!;
    });
  }
  return chosen;
}

const rampProbe = new THREE.Vector3();

/** What a road's two ends and its bridge ask of its height; see `RoadRamp`. */
export function rampOf(
  road: Road,
  course: RoadCourse,
  places: readonly Place[],
  world: World,
  into: RoadRamp = emptyRamp(),
): RoadRamp {
  for (const end of [0, 1] as const) {
    const place = places[end === 0 ? road.a : road.b]!;
    const gate = end === 0 ? road.gateA : road.gateB;
    const level = isShown(place) ? gateHeight(place, gate, world) : null;
    let rise = 0;
    let run = 0;
    let walk = 0;
    let kerb = 0;
    if (level !== null) {
      const town = townOf(place);
      kerb = PLANET_RADIUS + level + GROUND_LIFT;
      rise = level + GROUND_LIFT - (world.elevationAt(end === 0 ? course.gateA : course.gateB) + RIBBON_LIFT);
      run = course.approach;
      const mouth = gateMouth(town.grid, town.gates[gate]!, bandOf(place, town, world));
      walk = mouth.edge - mouth.carriage;
    }
    if (end === 0) {
      into.riseA = rise;
      into.levelA = run;
      into.walkA = walk;
      into.kerbA = kerb;
    } else {
      into.riseB = rise;
      into.levelB = run;
      into.walkB = walk;
      into.kerbB = kerb;
    }
  }
  into.bridgeFrom = road.bridgeFrom;
  into.bridgeTo = road.bridgeTo;
  into.deckA = 0;
  into.deckB = 0;
  if (road.bridgeTo > road.bridgeFrom) {
    // Where each ramp leaves the land's lift: the ground's elevation plus
    // `RIBBON_LIFT`. The path is walked for a bridged road only.
    const path = coursePath(course);
    coursePoint(course, parameterAt(path, road.bridgeFrom - BRIDGE_LAND), rampProbe);
    into.deckA = world.elevationAt(rampProbe) + RIBBON_LIFT;
    coursePoint(course, parameterAt(path, road.bridgeTo + BRIDGE_LAND), rampProbe);
    into.deckB = world.elevationAt(rampProbe) + RIBBON_LIFT;
  }
  return into;
}
