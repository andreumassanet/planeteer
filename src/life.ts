/**
 * Ambient life: the traffic on the roads, boats on the sea, walkers on the
 * verges, flocks overhead and herds in the fields.
 *
 * Anything still is merged (a herd far off is one buffer for all its
 * animals); anything moving is its own mesh and costs two draw calls with
 * the ink, so the moving cast is near and capped (`MAX_MOVERS`). Birds are
 * the exception: one mesh rewritten every frame, affordable because a bird is
 * tiny.
 *
 * Every mover's position is a pure function of the world clock
 * (`sky.state.time`), so traffic follows `setRate`/`setTime`, a mover that
 * leaves range and returns is where it should be, and every client agrees.
 * The exceptions are giving way, which only delays a vehicle along its route,
 * and a near herd, which lives by where you walk and goes home when you leave.
 *
 * The vehicle and animal registries are handed in rather than imported
 * (their `import.meta.glob` does not load in Node), so `scripts/check-life.ts`
 * can run all of this headless.
 */
import * as THREE from 'three';
import { createFaunaContext } from './fauna/contract.ts';
import type { Animal } from './fauna/contract.ts';
import type { World } from './geo.ts';
import { mergeMeshes } from './merge.ts';
import type { Place } from './places.ts';
import { createSceneryContext } from './scenery/contract.ts';
import { createTrafficContext } from './traffic/contract.ts';
import type { Vehicle } from './traffic/contract.ts';
import { createViewCone } from './view.ts';
import { proxyOf } from './warm.ts';
import { umbrellaProxy } from './umbrella.ts';
import type { HerdProbe, Life, LifeOptions, LifeShared, LifeStats } from './life/api.ts';
import { createBirds } from './life/birds.ts';
import { createBuilders } from './life/builders.ts';
import { createMoverDrawer } from './life/draw.ts';
import { createDrives } from './life/drive.ts';
import { createGiveWay } from './life/give-way.ts';
import { createHerdAnimator } from './life/herd-animate.ts';
import { createHerdBehaviour } from './life/herd-behaviour.ts';
import { createHerdBuilder } from './life/herd-build.ts';
import { createHerdScan } from './life/herd-scan.ts';
import type { HerdSite } from './life/herd-types.ts';
import { createMadeGround } from './life/made-ground.ts';
import { moverMaterial } from './life/material.ts';
import type { Mover } from './life/mover.ts';
import { createPlaceIndex } from './life/place-index.ts';
import { createPool } from './life/pool.ts';
import { eachBoat, eachRoadVehicle, grazersOf } from './life/queries.ts';
import { createRegions } from './life/regions.ts';
import { createRoadScan } from './life/road-scan.ts';
import { createRoutes } from './life/routes.ts';
import { createScan } from './life/scan.ts';
import { createSeaScan } from './life/sea-scan.ts';
import { createServe } from './life/serve.ts';
import { CEILING, KEEP_ALL_WITHIN } from './life/tuning.ts';
import { collideMovers, createWalkers } from './life/walkers.ts';
import { knockMovers } from './life/knock.ts';
import { verifyWalk } from './life/walk-rig.ts';

export type { HerdProbe, HerdSeat, Life, LifeOptions, LifeStats } from './life/api.ts';
export type { BirdPart } from './life/bird-geometry.ts';
export { birdGeometry } from './life/bird-geometry.ts';
export type { Frame, InTheWay } from './life/mover.ts';
export { emptyFrame } from './life/mover.ts';
export { roadFrameOf } from './life/routes.ts';
export { moverReach } from './life/tuning.ts';
export type { Rig } from './life/walk-rig.ts';
export { poseAt, rigOf } from './life/walk-rig.ts';
export type { Merged } from './merge.ts';

/**
 * A built group reduced to flat arrays in its own space, its root's transform
 * included (`merge.ts`), under the name `scripts/check-life.ts` asserts on.
 */
export const mergeGroup = mergeMeshes;

export function createLife(world: World, places: readonly Place[], options: LifeOptions = {}): Life {
  const group = new THREE.Group();
  group.name = 'life';

  const ctx = createSceneryContext(options.context);
  const material = moverMaterial();
  const roads = options.roads ?? [];
  const folk = options.folk;
  const registry = new Map<string, Vehicle>((options.vehicles ?? []).map((entry) => [entry.id, entry]));
  const bestiary = new Map<string, Animal>((options.animals ?? []).map((entry) => [entry.id, entry]));
  const shared: LifeShared = { inTheWay: null, country: null, seatLog: null };

  const herds: HerdProbe = {
    frame: 0, registry: 0, altitude: 0, ceiling: CEILING.herd, range: 0,
    cells: 0, chanced: 0, inRange: 0, land: 0, stocked: 0, dense: 0,
    clearOfTown: 0, clearOfSlope: 0, clearOfMade: 0, offered: 0, admitted: 0,
  };
  const stats: LifeStats = {
    road: 0, water: 0, foot: 0, herd: 0, animals: 0, animated: 0,
    grazing: 0, wandering: 0, fleeing: 0, homing: 0, snapped: 0, inTown: 0, turning: 0,
    yielding: 0, waiting: 0, passing: 0, delayed: 0, atLights: 0, birds: 0,
    meshes: 0, triangles: 0, pooled: 0, megabytes: 0, lastBuildMs: 0, lastScanMs: 0, reach: 0,
    nearestMoving: Infinity,
  };

  const movers = new Map<string, Mover>();
  const herdSites = new Map<string, HerdSite>();
  const cone = createViewCone(KEEP_ALL_WITHIN);
  const placeIndex = createPlaceIndex(places);
  const routes = createRoutes(world, places, roads);
  const regions = createRegions(world, places);
  const drives = createDrives({ world, places, routes, regionAt: regions.regionAt, streets: options.streets });
  const pool = createPool();
  const builders = createBuilders({ ctx, traffic: createTrafficContext(ctx), registry, folk });
  const herdBuilder = createHerdBuilder({
    fauna: createFaunaContext(ctx), bestiary, rigs: options.rigs, land: options.land, shared,
  });
  const serve = createServe({ pool, builders, herdBuilder, herdSites, regions, stats });
  const clearOfMade = createMadeGround(roads, places, routes, options.fields, shared);
  const behaviour = createHerdBehaviour(world, herdBuilder, shared);
  const animator = createHerdAnimator({
    places, rigs: options.rigs, bestiary, group, stats, herdSites, placeIndex, clearOfMade, behaviour,
  });
  const birds = createBirds(world);
  group.add(birds.mesh);
  const walkers = createWalkers(folk, group, cone, stats);
  const drawer = createMoverDrawer({ group, material, stats, cone, folk, pool, drives, animator, walkers });
  const giveWay = createGiveWay(movers, stats, shared);
  const scanner = createScan({
    movers, cone, group, folk, stats, herds,
    scanRoads: createRoadScan(routes, drives, regions),
    sea: createSeaScan(world, placeIndex, regions),
    pasture: createHerdScan({
      world, places, bestiary, continentOf: regions.continentOf, placeIndex, clearOfMade,
      herdSites, herds, movers, shared,
    }),
    birds, placeIndex, refused: pool.refused, releaseHerd: animator.releaseHerd,
    townsChanged() {
      placeIndex.clearShown();
      routes.clearRamps();
      drives.clearPaved();
    },
  });

  let lastUpdate = 0;
  /** How fast the viewer is going, smoothed, and where it was last frame: what a herd reads you by. */
  let viewerPace = 0;
  const paceFrom = new THREE.Vector3();

  function resetFrameStats(): void {
    stats.road = 0;
    stats.water = 0;
    stats.foot = 0;
    stats.herd = 0;
    stats.animals = 0;
    stats.animated = 0;
    stats.inTown = 0;
    stats.turning = 0;
    stats.grazing = 0;
    stats.wandering = 0;
    stats.fleeing = 0;
    stats.homing = 0;
  }

  function update(
    viewer: THREE.Vector3, altitude: number, camera: THREE.Camera | undefined, clock: number, dt?: number,
  ): void {
    herds.frame++;
    // Before anything is placed, and before last frame's walkers and animals
    // are forgotten: they are what the traffic looks at.
    giveWay(viewer, clock, walkers.shown, drawer.herdsShown);
    walkers.beginFrame(clock);
    animator.beginFrame();
    cone.aim(camera);
    const now = performance.now();
    scanner.rescanIfDue(viewer, altitude, clock, now);
    serve();

    resetFrameStats();
    drives.beginFrame();
    behaviour.beginFrame();
    drawer.beginFrame();
    // Animated animals keep real time: a cow does not chew faster under `setRate`.
    const realDt = dt ?? (lastUpdate === 0 ? 0 : Math.min(0.1, (now - lastUpdate) / 1000));
    lastUpdate = now;
    // A jump is not a gallop.
    if (realDt > 0) {
      const moved = viewer.distanceTo(paceFrom);
      const pace = moved > 400 ? 0 : moved / realDt;
      viewerPace += (pace - viewerPace) * Math.min(1, realDt * 6);
    }
    paceFrom.copy(viewer);
    stats.meshes = 0;
    stats.triangles = 0;
    stats.nearestMoving = Infinity;

    for (const mover of movers.values()) drawer.drawMover(mover, viewer, clock, realDt, viewerPace);

    walkers.endFrame();
    stats.birds = birds.draw(clock);
    stats.meshes += stats.animated;
    if (stats.birds > 0) {
      stats.meshes++;
      stats.triangles += (stats.birds * birds.vertices) / 3;
    }
    pool.endFrame();
    stats.pooled = pool.entries.size;
    stats.megabytes = pool.megabytes();
  }

  return {
    recordSeats(into) {
      shared.seatLog = into;
    },
    group,
    stats,
    herds,
    update,
    verify: () => verifyWalk(ctx),
    // The movers, the birds, whose material has no ink normals, and the crowds' umbrellas.
    proxies: () => [proxyOf(material), proxyOf(birds.mesh.material as THREE.Material), umbrellaProxy()],
    collide: (point, radius, personRadius, push) =>
      collideMovers(point, radius, personRadius, push, walkers.shown, drawer.herdsShown),
    knock: (from, to, radius, velocity) => knockMovers(from, to, radius, velocity, walkers.shown, drawer.herdsShown),
    eachBoat: (visit) => eachBoat(movers, visit),
    eachRoadVehicle: (visit) => eachRoadVehicle(movers, visit),
    grazers: () => grazersOf(movers),
    setCountry(value) {
      shared.country = value;
      herdSites.clear();
    },
    setInTheWay(value) {
      shared.inTheWay = value;
    },
  };
}
