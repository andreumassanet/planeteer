/**
 * Everything between the towns, streamed: the wood and the countryside, the
 * grass underfoot, the effects pools, what turns and smokes in the country,
 * the small life round the camera, and the sea floor with what swims there.
 */
import type { Vegetation } from '../vegetation.ts';
import type { Grass, pressOf } from '../grass.ts';
import type { Effects, crashStrength } from '../effects.ts';
import type { CountryMotion } from '../countryside-motion.ts';
import type { Ambient } from '../ambient.ts';
import type { Sea } from '../seabed.ts';
import type { SeaLife } from '../sea-life.ts';
import type { App } from './context.ts';
import { stage } from './boot.ts';
import { EFFECTS_KEY, readSetting } from './storage.ts';

export interface Nature {
  vegetation: Vegetation;
  grass: Grass;
  /** What the player parts the grass with. */
  pressOf: typeof pressOf;
  effects: Effects;
  /** How hard a crash shakes the camera. */
  crashStrength: typeof crashStrength;
  countryMotion: CountryMotion;
  ambient: Ambient;
  sea: Sea;
  seaLife: SeaLife;
}

export async function plantCountry(app: App): Promise<Nature> {
  const { deferred, world, places, placements, baked, scene, ctx, settlements, life, land, takenGround, groundAt } = app;

  await stage('planting the country');
  const { createVegetation } = await deferred.vegetation;
  const vegetation = createVegetation(world, {
    context: ctx,
    places: places.all,
    monuments: placements,
    roads: baked.roads,
    // The drawn land and the towns' lawns, which the grass stands on.
    land,
    lawns: settlements,
    // Vehicle fields and the railway, so no tree grows through a wing or a track.
    fields: takenGround,
  });
  scene.add(vegetation.group);
  life.setCountry(vegetation.countryside);
  if (vegetation.broken.length > 0) console.warn('scenery parts that broke the contract:', vegetation.broken);
  if (vegetation.missing.length > 0) console.warn('biome tables name plants that do not exist:', vegetation.missing);
  const { createGrass, pressOf } = await deferred.grass;
  const grass = createGrass(vegetation.grass);
  scene.add(grass.group);

  const { createEffects, crashStrength } = await deferred.effects;
  const effects = createEffects();
  effects.enabled = readSetting(EFFECTS_KEY) !== '0';
  scene.add(effects.group);

  // Mill sails, a lighthouse beam and campfire smoke, fed by the vegetation tiles.
  const { createCountryMotion } = await deferred.countryMotion;
  const countryMotion = createCountryMotion(ctx);
  scene.add(countryMotion.group);
  effects.setSmokers(countryMotion.smokers);

  // Small life round the camera; the Effects switch carries it.
  const { createAmbient } = await deferred.ambient;
  const ambient = createAmbient({
    groundAt: (point) => groundAt(point),
    madeHeightAt: (point) => app.walls.madeHeightAt(point),
    meadowAt: (direction) => (vegetation.countryside?.meadowAt(direction) ?? null) !== null,
    crownsNear: (point, range, visit) => {
      vegetation.crownsNear(point, range, visit);
      settlements.crownsNear(point, range, visit);
    },
    splash: (point, reach) => effects.splashAt(point, reach),
  });
  ambient.enabled = effects.enabled;
  scene.add(ambient.group);

  // The sea floor near the player; the swimmers follow the Effects switch, the floor does not.
  const { createSea } = await deferred.sea;
  const sea = createSea(world);
  scene.add(sea.group);
  const { createSeaLife } = await deferred.seaLife;
  const seaLife = createSeaLife({ splash: (point, reach) => effects.splashAt(point, reach) });
  seaLife.enabled = effects.enabled;
  scene.add(seaLife.group);

  return { vegetation, grass, pressOf, effects, crashStrength, countryMotion, ambient, sea, seaLife };
}
