import * as THREE from 'three';
import { fadeTwin } from './fade.ts';
import { leafMaterial } from './foliage.ts';
import type { World } from './geo.ts';
import { groundRadius } from './globe.ts';
import { landProbeOf } from './land-probe.ts';
import { LANDMARK_KEEP, planShape } from './landmark-ground.ts';
import { radiusOf } from './places.ts';
import type { Place } from './places.ts';
import { holdGates } from './roads.ts';
import type { Road } from './roads.ts';
import { groundStyleFor } from './scenery/ground.ts';
import { createSceneryContext, regionFor } from './scenery/index.ts';
import type { Placed } from './scenery/index.ts';
import { unitAt } from './sphere.ts';
import { proxyOf } from './warm.ts';
import { countrysideSteps } from './settlements/country.ts';
import { createTownFrame } from './settlements/frame.ts';
import { createGroundBuilder } from './settlements/ground/build.ts';
import { createLifecycle } from './settlements/lifecycle.ts';
import type { Lifecycle } from './settlements/lifecycle.ts';
import { createMapPlans } from './settlements/map-plans.ts';
import { townMaterial } from './settlements/material.ts';
import { createNearTowns } from './settlements/near.ts';
import { createPlanner } from './settlements/plan.ts';
import { createTownQueries } from './settlements/queries.ts';
import { createRaiseScratch } from './settlements/raise/job.ts';
import type { RaiseKit } from './settlements/raise/job.ts';
import { raiseSteps } from './settlements/raise/raise.ts';
import { createRegistry } from './settlements/registry.ts';
import { createStyleFor } from './settlements/rules.ts';
import { squareSteps } from './settlements/square.ts';
import { createStreamer } from './settlements/streamer.ts';
import { compareTown, surveyTowns } from './settlements/survey.ts';
import { createSward } from './settlements/sward.ts';
import type { SettlementOptions, Settlements, Slot } from './settlements/types.ts';
import { createVariants } from './settlements/variants.ts';

export { reachFor } from './settlements/budget.ts';
export type {
  BikeSlot,
  ParkedCar,
  SettlementOptions,
  SettlementStats,
  Settlements,
  TownPlan,
  TownSeat,
} from './settlements/types.ts';

/**
 * The towns: every populated place joined to the scenery kit, streamed in and
 * out round the viewer, each one built as a single merged mesh on its square.
 *
 * A town is chosen against a triangle budget and a count and built a few ms a
 * frame (`settlements/streamer.ts`); its square, terraces and plots are pure
 * functions of the place (`scenery/grid.ts`, `settlements/plan.ts`); its floor
 * is drawn from the field `buildFloor` makes (`settlements/ground/`), which is
 * also what `madeHeightAt` answers a foot from; and its buildings are walls
 * (`settlements/queries.ts`). Towns do not touch the terrain: they take the
 * ground as it is, cutting terraces and refusing cells too steep to cut.
 */
export function createSettlements(
  world: World,
  places: readonly Place[],
  options: SettlementOptions = {},
): Settlements {
  const registry = createRegistry();
  // The gates a town may not raise to make its streets climbable, because a road's ramps would meet.
  holdGates(options.roads ?? [], places, world);
  const roadGates = gatesByPlace(options.roads ?? [], places);
  const ctx = createSceneryContext(options.context);
  const landProbe = options.land === undefined ? null : landProbeOf(options.land);
  const material = townMaterial();
  // A near town draws its trees' leaf cards in a second merged mesh (`foliage.ts`).
  const leaves = leafMaterial();
  const missing: string[] = [];
  const broken: string[] = [];
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const slots = places.map((place, index) => slotOf(world, place, index, continentOf));
  const anchors = anchorsOf(slots);
  const monumentSites = (options.monuments ?? []).map((placement) => ({
    direction: unitAt(placement.lat, placement.lon, new THREE.Vector3()),
    shape: planShape(placement),
    radius: LANDMARK_KEEP,
  }));

  const styleFor = createStyleFor();
  const variants = createVariants(ctx, slots, continentOf, styleFor, missing, broken);
  const frame = createTownFrame(world, monumentSites);
  const inTheCountry = new WeakSet<Placed>();
  const squareOf = (slot: Slot) => squareSteps(frame, world, slot, roadGates, broken);
  const planner = createPlanner(frame, roadGates, styleFor, variants.variantOf, (slot, grid, style) =>
    countrysideSteps(frame, slots, roadGates, inTheCountry, slot, grid, style));
  // Bound once the lifecycle exists: a plan built now makes way for the town under way.
  let lifecycle: Lifecycle | null = null;
  const plans = createMapPlans(world, frame, slots, variants, squareOf, planner.planTownSteps, inTheCountry, () => lifecycle!.endJob());
  const kit: RaiseKit = {
    world,
    frame,
    variants,
    styleFor,
    registry,
    landProbe,
    continentOf,
    material,
    leaves,
    inTheCountry,
    buildGroundSteps: createGroundBuilder(world, frame, landProbe, roadGates),
    squareSteps: squareOf,
    planTownSteps: planner.planTownSteps,
    plans,
    scratch: createRaiseScratch(),
  };
  const life = createLifecycle(registry, (slot) => raiseSteps(kit, slot), variants.warmSteps, planner.planTownSteps, plans.endPlanJob);
  lifecycle = life;
  const queries = createTownQueries(world, registry);
  const near = createNearTowns(registry, slots);
  const streamer = createStreamer(slots, anchors, registry, life, plans, landProbe);

  return {
    group: registry.group,
    stats: streamer.stats,
    anchors,
    missing,
    broken,
    crownsNear: near.crownsNear,
    folkNear: near.folkNear,
    lampsNear: near.lampsNear,
    parkedNear: near.parkedNear,
    parkedPaint: (id) => variants.parkedPaintOf(id),
    benchesNear: near.benchesNear,
    bikeSlotsNear: near.bikeSlotsNear,
    signalsNear: near.signalsNear,
    hideParked: near.hideParked,
    showParked(id) {
      const index = Number(id.split(':')[1]);
      const slot = slots[index];
      if (slot === undefined || slot.mesh === null || slot.stale) return;
      if (slot.parked.find((entry) => entry.id === id)?.hidden !== true) return;
      slot.stale = true;
      streamer.requeue(index);
    },
    setParkedTaken(test) {
      registry.parkedTaken = test;
    },
    update: streamer.update,
    madeHeightAt: queries.madeHeightAt,
    swardAt: createSward(registry),
    recordSeats(into) {
      registry.seatLog = into;
    },
    proxies: () => [proxyOf(material), proxyOf(fadeTwin(material))],
    townPlan: plans.townPlan,
    townPlanNow: plans.townPlanNow,
    floorChanges: registry.floorChanges,
    collide: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => queries.collide(point, radius, push),
    collideAloft: (point: THREE.Vector3, radius: number, push: THREE.Vector3) => queries.collide(point, radius, push, point.length()),
    blocksSight: queries.blocksSight,
    freeSpotNear: queries.freeSpotNear,
    compare: (name = 'Paris') => compareTown(slots, life, variants.variantOf, name),
    survey: (step = 29, nearTowns = false) => surveyTowns(world, slots, life, queries.madeHeightAt, step, nearTowns),
  };
}

/** The gates each town's roads come in by, as indices into `gatesOf` for its square. */
function gatesByPlace(roads: readonly Road[], places: readonly Place[]): Map<Place, number[]> {
  const roadGates = new Map<Place, number[]>();
  for (const road of roads) {
    for (const [end, gate] of [[road.a, road.gateA], [road.b, road.gateB]] as const) {
      const place = places[end];
      if (place === undefined) continue;
      const list = roadGates.get(place) ?? [];
      if (!list.includes(gate)) list.push(gate);
      roadGates.set(place, list);
    }
  }
  return roadGates;
}

/** A place's slot, before anything is built: its region, ground, radius, seed and the ground point under it. */
function slotOf(world: World, place: Place, index: number, continentOf: ReadonlyMap<string, string>): Slot {
  const direction = unitAt(place.lat, place.lon, new THREE.Vector3());
  const style = regionFor(place.iso, continentOf.get(place.iso) ?? '', place.lat);
  return {
    place,
    index,
    style,
    ground: groundStyleFor(style.id),
    radius: radiusOf(place),
    // Identity, not order: two places can share a name, so the coordinates are in it.
    seed: `${place.name}@${place.lat},${place.lon}`,
    direction,
    // Asked once: the relief does not move, and this is a point-in-polygon query.
    anchor: direction.clone().multiplyScalar(groundRadius(world, direction)),
    mesh: null,
    triangles: 0,
    parts: 0,
    bytes: 0,
    planned: 0,
    drowned: 0,
    buried: 0,
    buildings: 0,
    paved: 0,
    floor: null,
    failed: false,
    peopled: false,
    builtPeopled: false,
    overhead: null,
    dressing: null,
    stale: false,
    onRelief: false,
    folk: [],
    lampHeads: null,
    signalHeads: null,
    parked: [],
    benches: [],
    bikeSlots: [],
  };
}

/** Every slot's ground point as three floats, so the scan is a typed-array pass. */
function anchorsOf(slots: readonly Slot[]): Float32Array {
  const anchors = new Float32Array(slots.length * 3);
  slots.forEach((slot, i) => {
    anchors[i * 3] = slot.anchor.x;
    anchors[i * 3 + 1] = slot.anchor.y;
    anchors[i * 3 + 2] = slot.anchor.z;
  });
  return anchors;
}
