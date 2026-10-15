/**
 * What moves, and the ground it takes: townsfolk and conversation, the sites
 * where takeable vehicles stand, the railway and the rockets' pads (which
 * everything else keeps off), the traffic and herds, and the trains.
 */
import * as THREE from 'three';
import { createRailNetwork, joinFields, railFields } from '../rails.ts';
import type { RailNetwork } from '../rails.ts';
import type { FieldIndex, SiteIndex } from '../fleet.ts';
import type { Folk, Townsfolk } from '../folk.ts';
import type { Talk } from '../talk.ts';
import type { LaunchPads, PadIndex } from '../launch-pads.ts';
import type { Life } from '../life.ts';
import type { Railway } from '../railway.ts';
import type { App } from './context.ts';
import { stage } from './boot.ts';
import { seeThrough } from '../see-through.ts';

export interface Movers {
  folk: Folk;
  townsfolk: Townsfolk;
  /** Body radius of a person, for collisions and the talk prompt. */
  personRadius: number;
  isWoman(key: string): boolean;
  isYoung(key: string): boolean;
  talk: Talk;
  fleetSites: SiteIndex;
  railNetwork: RailNetwork | null;
  padIndex: PadIndex;
  /** Ground the vehicle fields, rocket pads and railway take, which the wood, the countryside and the herds keep off. */
  takenGround: FieldIndex;
  /** The ink colour's toon material, whose ramp and outline the baked models share. */
  inkSource: THREE.MeshToonMaterial;
  /** A new material for baked models, on that ramp and outline. */
  rigMaterial(): THREE.MeshToonMaterial;
  launchPads: LaunchPads;
  life: Life;
  railway: Railway | null;
}

export async function buildMovers(app: App): Promise<Movers> {
  const { deferred, world, places, placements, baked, scene, ctx, settlements, roads, land, groundAt } = app;

  await stage('setting it moving');
  const { createFolk, createTownsfolk, isWoman, isYoung, PERSON_RADIUS } = await deferred.folk;
  const folk = createFolk(ctx);
  const townsfolk = createTownsfolk(folk, settlements);
  scene.add(townsfolk.group);
  const { createTalk } = await deferred.talk;
  // Spoken aloud while the voices are on and the sound is open.
  const { audio, voices } = app.sound;
  const talk = createTalk({
    voice: () => (voices.voices && audio.output !== null && audio.bus !== null ? { context: audio.output.context, node: audio.bus } : null),
  });
  // The vehicle sites are a pure function of the world; built now so the herds and the wood can keep off them.
  const { createSiteIndex } = await deferred.fleet;
  const fleetSites = createSiteIndex({ world, places: places.all, roads: baked.roads, monuments: placements });
  // The railway only when baked against these places and roads.
  const railData = await app.railsLoad;
  const railNetwork =
    railData !== null && railData.places === places.all.length && railData.roads === baked.roads.length
      ? createRailNetwork(railData.lines, places.all, world)
      : null;
  if (railData !== null && railNetwork === null) console.warn('rails.bin was baked against other places or roads: run `pnpm rails`');
  const railGround = railNetwork === null ? null : railFields(railNetwork);
  // The pads keep off the railway (it was baked without them).
  const { createLaunchPads, createPadIndex } = await deferred.launchPads;
  const padIndex = createPadIndex({ world, sites: fleetSites, rails: railGround });
  const takenGround = joinFields(joinFields(fleetSites, padIndex), railGround);
  // Nothing beside a road stands on a track where a line crosses it.
  if (railGround !== null) {
    const taken: { at: THREE.Vector3; radius: number }[] = [];
    const takenAt = new THREE.Vector3();
    roads.setTaken((point, footprint) => {
      taken.length = 0;
      return railGround.fieldsNear(takenAt.copy(point).normalize(), footprint, taken).length > 0;
    });
  }

  const { createLife } = await deferred.life;
  const { VEHICLES } = await deferred.traffic;
  const { ANIMALS } = await deferred.fauna;
  const { createRigLibrary } = await deferred.kit;
  const { modelMaterial } = await import('../models.ts');
  const inkSource = ctx.toon(ctx.palette.ink);
  const rigMaterial = (): THREE.MeshToonMaterial =>
    seeThrough(modelMaterial(inkSource.gradientMap!, inkSource.userData.outlineParameters as { thickness: number; color: [number, number, number] }));
  const launchPads = createLaunchPads({ world, pads: padIndex, gradientMap: inkSource.gradientMap!, land });
  scene.add(launchPads.group);
  const streetPush = new THREE.Vector3();
  const life = createLife(world, places.all, {
    context: ctx,
    roads: baked.roads,
    // Handed in so `life.ts` stays Node-safe for `scripts/check-life.ts`.
    vehicles: VEHICLES,
    folk,
    animals: ANIMALS,
    rigs: createRigLibrary(rigMaterial()),
    fields: takenGround,
    land,
    // A vehicle driving through a town rides its floor and keeps out of its walls.
    streets: {
      floorAt: (direction) => settlements.madeHeightAt(direction),
      blocked: (point, radius) => settlements.collide(point, radius, streetPush),
    },
  });
  scene.add(life.group);

  // The track and stations stand at once; the trains when the Train Kit arrives.
  const { createRailway } = await deferred.railway;
  const railway = railNetwork === null
    ? null
    : createRailway({
        world,
        places: places.all,
        roads: baked.roads,
        network: railNetwork,
        material: rigMaterial(),
        drawnGround: groundAt,
      });
  if (railway !== null) {
    scene.add(railway.group);
    deferred.kit
      .then(({ loadModels }) => loadModels('rail/kit.bin'))
      .then((models) => railway.setKit(new Map(models.map((model) => [model.name, model]))))
      .catch((error: unknown) => console.warn('the trains did not load', error));
  }

  return {
    folk, townsfolk, personRadius: PERSON_RADIUS, isWoman, isYoung, talk,
    fleetSites, railNetwork, padIndex, takenGround, inkSource, rigMaterial, launchPads, life, railway,
  };
}
