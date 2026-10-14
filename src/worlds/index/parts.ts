/** The world's own subsystems, built in the order the scene needs them. */

import * as THREE from 'three';
import type { WorldSpec } from '../contract.ts';
import { createTerrain } from '../terrain.ts';
import { createGround } from '../tiles.ts';
import { createDecor } from '../decor.ts';
import { createOutposts } from '../outposts.ts';
import { createSky } from '../sky.ts';
import { createSettlements } from '../settlements.ts';
import { createCrowd } from '../aliens.ts';
import type { KeepClear } from '../aliens.ts';
import { createAmbient } from '../ambient.ts';
import { createFrontiers } from '../frontiers.ts';
import { surfaceOf } from '../surface.ts';
import { createSkyships } from '../skyships.ts';
import { createRoads } from '../roads.ts';
import { swardOf } from '../sward.ts';
import { createTraffic } from '../traffic.ts';
import { litAtNight } from '../night.ts';
import { geographyOf } from '../../system/geography.ts';
import { createSceneryContext } from '../../scenery/contract.ts';
import { buildAvatar } from '../../avatar.ts';
import { randomAppearance } from '../../appearance.ts';
import { rngFrom } from '../../scenery/random.ts';
import { DAY_MOOD, PALETTE, createToonRamp, setToonMood } from '../../theme.ts';
import { createEffects } from '../../effects.ts';
import { createGrass } from '../../grass.ts';

/** Grass pressed down by the body or craft on it. */
export interface SwardPress {
  forward: THREE.Vector3;
  length: number;
  width: number;
}

export type Parts = ReturnType<typeof createParts>;

export function createParts(spec: WorldSpec) {
  const body = spec.body;
  setToonMood(DAY_MOOD);
  const gradientMap = createToonRamp(4);
  const ctx = createSceneryContext();

  const terrain = createTerrain(spec);
  const R = terrain.radius;
  const geography = geographyOf(body);
  const surface = surfaceOf(terrain, geography);
  const scene = new THREE.Scene();
  scene.name = `world:${spec.id}`;
  const fog = new THREE.Fog(0xffffff, 1, 2);
  scene.fog = spec.sky.air > 0 ? fog : null;

  const sky = createSky(spec, scene);
  scene.add(sky.group);
  const political = geography.world;
  const nationPoint = new THREE.Vector3();
  // What stands between the towns, merged into the ground's tiles and a wall.
  const outposts = createOutposts(spec, terrain);
  const ground = createGround(terrain, {
    gradientMap,
    decorate: createDecor(spec, terrain, ctx, outposts),
    retire: (key) => outposts.retire(key),
    nations: {
      at: (x, y, z) => political.countryAtPoint(nationPoint.set(x, y, z)),
      colors: geography.countries.map((country) => country.color ?? 0x808080),
    },
  });
  // The lamps and the headlights light the ground after dark (`night.ts`).
  litAtNight(ground.material);
  scene.add(ground.group);
  const frontiers = createFrontiers(geography, terrain);
  scene.add(frontiers.group);
  const settlements = createSettlements(spec, terrain, ctx, gradientMap);
  scene.add(settlements.group);
  const roads = createRoads(spec, terrain, settlements.sites, settlements.network, gradientMap);
  scene.add(roads.group);
  // Earth's grass, grown from this world's ground (`sward.ts`).
  const swardGround = swardOf(spec, terrain);
  const sward = swardGround === null ? null : createGrass(swardGround, { radius: R, earth: false });
  if (sward !== null) scene.add(sward.group);
  const swardPress: SwardPress = { forward: new THREE.Vector3(), length: 0, width: 0 };
  // The rovers that drive the roads, their drivers dressed by the rover's own seed.
  const traffic = createTraffic(spec, roads, ctx, gradientMap, (look) => buildAvatar(randomAppearance(rngFrom('worlds', spec.id, 'driver', look))));
  scene.add(traffic.group);
  // The arrival and the parked craft are kept clear of people; filled in
  // once both are placed, and read only when a town is peopled.
  const keepClear = new Map<string, KeepClear[]>();
  const crowd = createCrowd(spec, settlements, ctx, gradientMap, (site) => keepClear.get(site.id) ?? []);
  scene.add(crowd.group);
  const ambient = createAmbient(spec.ambient, spec.id, spec.wind);
  scene.add(ambient.group);
  const effects = createEffects();
  scene.add(effects.group);
  // Where somebody lives, their craft cross the sky.
  const skyships = spec.civilisation === null ? null : createSkyships(ctx, gradientMap, PALETTE.white, PALETTE.violet);
  if (skyships !== null) scene.add(skyships.group);
  return {
    spec,
    body,
    R,
    gradientMap,
    ctx,
    terrain,
    geography,
    surface,
    scene,
    fog,
    sky,
    outposts,
    ground,
    frontiers,
    settlements,
    roads,
    sward,
    swardPress,
    traffic,
    keepClear,
    crowd,
    ambient,
    effects,
    skyships,
  };
}
