/**
 * What grows between the towns.
 *
 * A settlement is an object that is built or not; vegetation is a field that
 * covers everything, so its cost is an area that grows with the square of the
 * view distance. The field is tiled as a quadtree whose tile size and plot
 * pitch both double with the level, which keeps the tile count and the
 * triangle count nearly flat as the reach grows. `biome.ts` says what grows
 * and how much, `terrain.ts` where the ground is, `places.ts` how big a
 * settlement is; this module joins them and decides nothing they decide.
 *
 * The parts live in `vegetation/`: the levels and budgets, the planting of one
 * tile, its keepouts, the quadtree streamer and swaps, collision queries, and
 * the grass's ground.
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import { proxyOf } from './warm.ts';
import { fadeTwin } from './fade.ts';
import { createViewCone } from './view.ts';
import { leafDepthMaterial, leafMaterial, woodDepthMaterial, woodMaterial } from './foliage.ts';
import { createSceneryContext } from './scenery/index.ts';
import type { SceneryContext } from './scenery/index.ts';
import { keepAllWithin } from './vegetation/budget.ts';
import { createVegetationCountry } from './vegetation/country.ts';
import { createDebug } from './vegetation/debug.ts';
import { createEnumerator } from './vegetation/enumerate.ts';
import { createFramer } from './vegetation/frame.ts';
import { createGrassGround } from './vegetation/grass-ground.ts';
import { createKeepouts } from './vegetation/keepouts.ts';
import { createLandAccess } from './vegetation/land.ts';
import { createQueries } from './vegetation/collision.ts';
import { foliageMaterial, machineWood } from './vegetation/materials.ts';
import { emptyStats } from './vegetation/stats.ts';
import { createStreamer } from './vegetation/streamer.ts';
import { createTileBuilder } from './vegetation/tile-builder.ts';
import { createVariants } from './vegetation/variants.ts';
import type { GrassGround, PlantSeat, Vegetation, VegetationOptions } from './vegetation/types.ts';

export { budgetCapped } from './vegetation/budget.ts';
export { reachFor } from './vegetation/levels.ts';
export type { GrassGround, GrassSite, PlantSeat, Vegetation, VegetationOptions, VegetationStats } from './vegetation/types.ts';

export function createVegetation(world: World, options: VegetationOptions = {}): Vegetation {
  const group = new THREE.Group();
  group.name = 'vegetation';

  const ctx: SceneryContext = createSceneryContext(options.context);
  const material = foliageMaterial();
  // A near tile's wood, in the wind, and its leaf cards.
  const windMaterial = machineWood(woodMaterial(material));
  const leafCards = leafMaterial();

  const variants = createVariants(ctx);
  const keepouts = createKeepouts(options);
  const country = createVegetationCountry(world, ctx, options, variants);
  const landAccess = createLandAccess(world, options.land);
  const framer = createFramer(world, variants.broken);
  const seatLog: { current: PlantSeat[] | null } = { current: null };
  const continentOf = new Map<string, string>(world.countries.map((entry) => [entry.iso, entry.continent]));

  const builder = createTileBuilder({
    world,
    framer,
    keepouts,
    variants,
    country,
    land: landAccess.land,
    landReady: landAccess.ready,
    continentOf,
    material,
    windMaterial,
    leafCards,
    broken: variants.broken,
    seatLog,
  });

  const stats = emptyStats();
  const cone = createViewCone(keepAllWithin);
  const streamer = createStreamer({
    group,
    stats,
    cone,
    enumerator: createEnumerator(cone),
    builder,
    country,
    landAccess,
    rebuildKeepouts: keepouts.rebuild,
  });
  streamer.state.breakables = options.breakables ?? null;

  const grass: GrassGround | null =
    landAccess.land === undefined
      ? null
      : createGrassGround({ world, options, ctx, land: landAccess.land, keepouts, country });

  return {
    group,
    stats,
    missing: variants.missing,
    broken: variants.broken,
    proxies: () => {
      const proxies = [proxyOf(material), proxyOf(fadeTwin(material)), proxyOf(windMaterial), proxyOf(fadeTwin(windMaterial)), proxyOf(leafCards), proxyOf(fadeTwin(leafCards))];
      proxies[2]!.customDepthMaterial = proxies[3]!.customDepthMaterial = woodDepthMaterial();
      proxies[4]!.customDepthMaterial = proxies[5]!.customDepthMaterial = leafDepthMaterial();
      return proxies;
    },
    grass,
    countryside: country?.planner ?? null,
    update: streamer.update,
    setParkedTaken(test) {
      country?.builder.setTaken(test);
    },
    ...createQueries(streamer.state),
    ...createDebug(builder, seatLog),
  };
}
