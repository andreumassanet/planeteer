import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { isShown } from '../places.ts';
import { flightAt, flightDepth, flightHeight } from '../scenery/floor.ts';
import { townGrid } from '../scenery/grid.ts';
import { GROUND_LIFT, cellKey } from '../scenery/ground.ts';
import type { RegionStyle } from '../scenery/index.ts';
import type { Lifecycle } from './lifecycle.ts';
import type { FlatVariant, Slot } from './types.ts';

/** Measurements taken by building towns: merged against instanced, and the distribution over the planet. */

/**
 * Builds a named settlement merged, then prices the instanced version of the
 * same plan (one `InstancedMesh` per part, variant and piece), and drops the
 * town again unless it was standing.
 */
export function compareTown(
  slots: readonly Slot[],
  lifecycle: Lifecycle,
  variantOf: (partId: string, style: RegionStyle, index: number) => FlatVariant | null,
  name: string,
): unknown {
  const slot = slots.find((entry) => entry.place.name === name);
  if (slot === undefined) return { error: `no place called ${name}` };

  const wasResident = slot.mesh !== null;
  lifecycle.drop(slot, true);
  // A town that built nothing is marked failed; a measurement has to be able to ask again.
  slot.failed = false;
  const mergeBegan = performance.now();
  lifecycle.raise(slot);
  const mergeMs = performance.now() - mergeBegan;
  const merged = {
    drawCalls: slot.mesh === null ? 0 : 1,
    meshes: slot.mesh === null ? 0 : 1,
    triangles: slot.triangles,
    parts: slot.parts,
    planned: slot.planned,
    inTheSea: slot.drowned,
    tooSteep: slot.buried,
    megabytes: Number((slot.bytes / 1048576).toFixed(2)),
    buildMs: Number(mergeMs.toFixed(2)),
  };

  const instanceBegan = performance.now();
  const plan = lifecycle.planTown(slot, townGrid(slot.radius)).placed;
  const buckets = new Map<string, number>();
  let instancedTriangles = 0;
  let instancedBytes = 0;
  const seen = new Set<string>();
  for (const entry of plan) {
    const flat = variantOf(entry.partId, slot.style, entry.variant);
    if (flat === null) continue;
    for (let piece = 0; piece < flat.pieceVertices.length; piece++) {
      const key = `${entry.partId}:${entry.variant}:${piece}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
      const count = flat.pieceVertices[piece]!;
      instancedTriangles += count / 3;
      // One matrix per instance, and the geometry once per bucket.
      instancedBytes += 16 * 4;
      if (!seen.has(key)) {
        seen.add(key);
        instancedBytes += count * 3 * 4 * 2;
      }
    }
  }
  const instanceMs = performance.now() - instanceBegan;

  if (!wasResident) lifecycle.drop(slot, true);

  return {
    place: `${slot.place.name} (${slot.place.iso}), pop ${slot.place.pop.toLocaleString('en')}`,
    style: slot.style.id,
    radius: Number(slot.radius.toFixed(1)),
    merged,
    instanced: {
      drawCalls: buckets.size,
      meshes: buckets.size,
      triangles: Math.round(instancedTriangles),
      parts: plan.length,
      megabytes: Number((instancedBytes / 1048576).toFixed(2)),
      buildMs: Number(instanceMs.toFixed(2)),
    },
  };
}

/** Where a foot lands on the floor of every surveyed town; see `sampleStanding`. */
interface Stood {
  sampled: number;
  onFloor: number;
  onFlight: number;
  onSlope: number;
  overTheEdge: number;
  worstBelow: number;
  worstAbove: number;
}

/** What the terracing did: towns on one level or several, the most levels, and the tallest face. */
interface Cut {
  flat: number;
  stepped: number;
  mostSteps: number;
  mostStepsAt: string;
  wall: number;
  wallAt: string;
}

/** What ends the floor and what climbs it, from `FloorStats`. */
interface Edges {
  slopes: number;
  quays: number;
  ramps: number;
  rampSteepest: number;
  flights: number;
  steps: number;
  crowded: number;
  steepest: number;
  steepestAt: string;
}

/** A town's terracing and edges, from its floor's own counts. */
function countFloor(slot: Slot, cut: Cut, edges: Edges): void {
  const floor = slot.floor!;
  const steps = new Set(floor.field.terraces.values()).size;
  if (steps > 1) cut.stepped++;
  else cut.flat++;
  if (steps > cut.mostSteps) {
    cut.mostSteps = steps;
    cut.mostStepsAt = slot.place.name;
  }
  const built = floor.field.stats;
  if (built === undefined) return;
  if (built.wall > cut.wall) {
    cut.wall = built.wall;
    cut.wallAt = slot.place.name;
  }
  edges.slopes += built.slopes;
  edges.quays += built.quays;
  edges.ramps += built.ramps;
  edges.rampSteepest = Math.max(edges.rampSteepest, built.steepest);
  edges.flights += built.flights;
  edges.steps += built.steps;
  edges.crowded += built.crowded;
  if (built.embankment > edges.steepest) {
    edges.steepest = built.embankment;
    edges.steepestAt = slot.place.name;
  }
}

/**
 * Where a foot lands on a standing town, over a spiral of 64 points across its
 * built radius: on the paving, on a flight, on the edge slope, or off the
 * town; and how far under or over its own cell's paving. The yardstick is the
 * cell's terrace, not the relief under it. A foot on the hill above a
 * platform is right, so "over" is only asked where the platform is stood on.
 */
function sampleStanding(world: World, madeHeightAt: (point: THREE.Vector3) => number, slot: Slot, stood: Stood, standDir: THREE.Vector3): void {
  const floor = slot.floor!;
  for (let k = 0; k < 64; k++) {
    const angle = k * 2.399963;
    const reach = slot.radius * Math.sqrt((k + 0.5) / 64);
    standDir
      .copy(floor.up)
      .addScaledVector(floor.across, (Math.cos(angle) * reach) / PLANET_RADIUS)
      .addScaledVector(floor.north, (Math.sin(angle) * reach) / PLANET_RADIUS)
      .normalize();
    const elevation = world.elevationAt(standDir);
    if (elevation <= 0) continue;
    const relief = PLANET_RADIUS + elevation;
    const made = madeHeightAt(standDir);
    const stand = Math.max(relief, made);
    stood.sampled++;
    const cell = floor.field.terraces.get(cellKey(
      Math.round(standDir.dot(floor.across) * PLANET_RADIUS / floor.field.pitch + (floor.field.shift ?? 0)),
      Math.round(standDir.dot(floor.north) * PLANET_RADIUS / floor.field.pitch + (floor.field.shift ?? 0)),
    ));
    // The paving, or the tread of the flight standing on it here.
    const planeX = standDir.dot(floor.across) * PLANET_RADIUS;
    const planeZ = standDir.dot(floor.north) * PLANET_RADIUS;
    const flight = cell === undefined ? null : flightAt(floor.field, planeX, planeZ);
    const paving = cell === undefined ? 0
      : PLANET_RADIUS + (flight === null ? cell + GROUND_LIFT : flightHeight(flight, flightDepth(flight, planeX, planeZ)));
    const lift = made > 0 ? made - relief : 0;
    const onFloor = paving > 0 && Math.abs(stand - paving) < 1e-6;
    if (onFloor && flight !== null) stood.onFlight++;
    else if (onFloor) stood.onFloor++;
    else if (lift > 0) stood.onSlope++;
    if (onFloor && paving - stand > stood.worstBelow) {
      stood.worstBelow = paving - stand;
    }
    if (paving > 0 && made > relief && stand - paving > stood.worstAbove) {
      stood.worstAbove = stand - paving;
    }
    if (paving > 0 && relief > paving) stood.overTheEdge++;
  }
}

/**
 * Builds every `step`th shown settlement (as a near town when `near`) and
 * reports the distribution of what it built and where a foot lands on it. A
 * town not already standing is dropped again afterwards.
 */
export function surveyTowns(
  world: World,
  slots: readonly Slot[],
  lifecycle: Lifecycle,
  madeHeightAt: (point: THREE.Vector3) => number,
  step: number,
  near: boolean,
): unknown {
  const parts: number[] = [];
  const buildings: number[] = [];
  const paved: number[] = [];
  const triangles: number[] = [];
  const empty: string[] = [];
  const noBuilding: string[] = [];
  let planned = 0;
  let drowned = 0;
  let buried = 0;
  const stood: Stood = { sampled: 0, onFloor: 0, onFlight: 0, onSlope: 0, overTheEdge: 0, worstBelow: 0, worstAbove: 0 };
  const cut: Cut = { flat: 0, stepped: 0, mostSteps: 0, mostStepsAt: '', wall: 0, wallAt: '' };
  const edges: Edges = { slopes: 0, quays: 0, ramps: 0, rampSteepest: 0, flights: 0, steps: 0, crowded: 0, steepest: 0, steepestAt: '' };
  const standDir = new THREE.Vector3();
  const began = performance.now();
  for (let i = 0; i < slots.length; i += step) {
    const slot = slots[i]!;
    // Only what the world builds.
    if (!isShown(slot.place)) continue;
    const wasResident = slot.mesh !== null;
    const wasFailed = slot.failed;
    const wasPeopled = slot.peopled;
    if (!wasResident) {
      slot.failed = false;
      if (near) slot.peopled = true;
      lifecycle.raise(slot);
    }
    parts.push(slot.parts);
    buildings.push(slot.buildings);
    paved.push(slot.paved);
    triangles.push(slot.triangles);
    planned += slot.planned;
    drowned += slot.drowned;
    buried += slot.buried;
    if (slot.parts === 0) empty.push(slot.place.name);
    else if (slot.buildings === 0) noBuilding.push(slot.place.name);
    if (slot.floor !== null) {
      countFloor(slot, cut, edges);
      sampleStanding(world, madeHeightAt, slot, stood, standDir);
    }
    if (!wasResident) {
      lifecycle.drop(slot, true);
      slot.failed = wasFailed;
      slot.peopled = wasPeopled;
    }
  }
  const at = (list: number[], q: number): number => {
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  };
  const spread = (list: number[]) => ({
    p10: at(list, 0.1),
    p25: at(list, 0.25),
    median: at(list, 0.5),
    p75: at(list, 0.75),
    p90: at(list, 0.9),
    mean: Number((list.reduce((a, b) => a + b, 0) / Math.max(1, list.length)).toFixed(1)),
  });
  return {
    sampled: parts.length,
    parts: spread(parts),
    buildings: spread(buildings),
    // Cells of floor, and how many each standing building pays for.
    paved: spread(paved),
    pavedPerBuilding: Number(
      (paved.reduce((a, b) => a + b, 0) / Math.max(1, buildings.reduce((a, b) => a + b, 0))).toFixed(2),
    ),
    triangles: spread(triangles),
    plannedPlots: planned,
    lostToTheSea: drowned,
    lostToTheSlope: buried,
    townsOnOneLevel: cut.flat,
    townsTerraced: cut.stepped,
    mostTerraces: `${cut.mostSteps} at ${cut.mostStepsAt}`,
    tallestWall: `${cut.wall.toFixed(1)} at ${cut.wallAt}`,
    edgesSloped: edges.slopes,
    edgesQuay: edges.quays,
    ramps: edges.ramps,
    steepestRamp: Number(edges.rampSteepest.toFixed(3)),
    flights: edges.flights,
    flightSteps: edges.steps,
    flightsCrowdedOut: edges.crowded,
    steepestEdge: `${edges.steepest.toFixed(2)} at ${edges.steepestAt}`,
    builtNothing: empty.length,
    builtNoBuilding: noBuilding.length,
    emptyNames: empty.slice(0, 40),
    noBuildingNames: noBuilding.slice(0, 40),
    standing: stood,
    surveyMs: Math.round(performance.now() - began),
  };
}
