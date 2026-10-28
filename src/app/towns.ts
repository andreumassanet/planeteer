/**
 * The landmarks, the towns, their lights and the roads between them. None of
 * them builds geometry here; they stream round the viewer from the loop.
 */
import { createContext } from '../monuments/contract.ts';
import { createMonuments } from '../placement.ts';
import type { Monuments } from '../placement.ts';
import { createRoads } from '../roads.ts';
import type { Roads } from '../roads.ts';
import { createCityLights, fireGlows } from '../lights.ts';
import type { CityLights } from '../lights.ts';
import type { MonumentContext } from '../monuments/contract.ts';
import type { Settlements } from '../settlements.ts';
import { createBreakables } from '../breakables.ts';
import type { Breakables } from '../breakables.ts';
import type { App } from './context.ts';
import { stage } from './boot.ts';

export interface Towns {
  /** One material cache, toon ramp and pen shared by monuments and towns. */
  ctx: MonumentContext;
  monuments: Monuments;
  settlements: Settlements;
  /** Every place as a point lit at night, for the far field the streamed towns do not reach. */
  cityLights: CityLights;
  roads: Roads;
  /** The small things a vehicle knocks over, which the towns and the wood register with. */
  breakables: Breakables;
}

export async function buildTowns(app: App): Promise<Towns> {
  const { deferred, world, placements, places, baked, land, scene, groundAt } = app;

  await stage('raising the monuments');
  const ctx = createContext();
  const { MONUMENTS, buildMonument } = await deferred.monuments;
  // A landmark inside a town stands on its raised floor, so it asks the
  // settlements for the made ground; they are created below, before either is called.
  const monuments = createMonuments(
    world,
    placements,
    { monuments: MONUMENTS, build: buildMonument },
    ctx,
    (point) => settlements.madeHeightAt(point),
    // Re-seats a landmark when its town's floor arrives or goes.
    (since, into) => settlements.floorChanges(since, into),
    land,
  );
  scene.add(monuments.group);
  scene.add(monuments.night.beacons);
  if (monuments.broken.length > 0) console.warn('monuments that broke the contract:', monuments.broken);
  console.log(`${monuments.missing.length} placed landmarks have no model yet`);

  await stage('settling the country');
  // Created before the towns, which register their props with it; what a
  // knocked-over prop lands on asks the land and the towns' floors.
  const breakables = createBreakables({
    floorAt: (point) => Math.max(groundAt(point), settlements.madeHeightAt(point)),
    onBreak: (knock) => app.onBreak?.(knock),
    onLand: (point, kind, weight) => app.onLand?.(point, kind, weight),
  });
  scene.add(breakables.group);
  const { createSettlements } = await deferred.settlements;
  // The kit is registered before any part is built, or a part would be cached as refused.
  const [{ registerSceneryModels }, vehicleModels] = await Promise.all([deferred.scenery, app.vehicleKit]);
  registerSceneryModels(vehicleModels);
  const settlements = createSettlements(world, places.all, {
    context: ctx,
    monuments: placements,
    roads: baked.roads,
    land,
    breakables,
  });
  scene.add(settlements.group);
  const cityLights = createCityLights(places.all, settlements.anchors);
  scene.add(fireGlows);
  scene.add(cityLights.points);
  if (settlements.broken.length > 0) console.warn('scenery parts that broke the contract:', settlements.broken);
  if (settlements.missing.length > 0) console.warn('region tables name parts that do not exist:', settlements.missing);

  await stage('laying the roads');
  const roads = createRoads(world, places.all, baked);
  roads.setGround(groundAt);
  scene.add(roads.group);

  return { ctx, monuments, settlements, cityLights, roads, breakables };
}
