/**
 * Every vehicle model that can be taken, by id.
 *
 * The road craft off the traffic kit's baked models — the hatchback, the van,
 * the jeep, the pickup, the tractor and the bus — are the traffic's Kenney and
 * Quaternius vehicles at a person's size (`cars.ts`); the scooter and the
 * tuk-tuk are the traffic's own code-built parts, likewise (`traffic-craft.ts`);
 * the bicycle, the motorbike, the launch, the jet ski, the sailboat, the
 * submarine, the plane, the helicopter and the balloon are built in code round the hero's own
 * seated, standing and astride body (`body.ts`), because no CC0 pack has one
 * with room in it for him; and the horse is the herds' own rig, saddled
 * (`horse.ts`).
 *
 * `loadCraft` fetches the traffic kit's file and the horse's rig, which the
 * world has usually fetched already, so the browser's cache answers them;
 * `craftFrom` is the same thing handed the models, which is how the headless
 * check builds them from disk.
 */
import type { CraftModel } from './contract.ts';
import type { Model, Rig } from '../models.ts';
// Static, and not a dynamic import inside `loadCraft`: this file is itself
// reached only through a deferred import (`main.ts`), so the kit's reader
// adds nothing to the world's first load — while a page that awaits
// `loadCraft` at its top level, with the reader in a chunk that imports back
// from the page's own, waits on itself for ever.
import { loadModels, loadRig } from '../kit.ts';
import { buildCars } from './cars.ts';
import { buildPartCraft } from './traffic-craft.ts';
import { bicycleModel, motorbikeModel } from './cycles.ts';
import { launchModel } from './launch.ts';
import { jetSkiModel } from './jet-ski.ts';
import { sailboatModel } from './sailboat.ts';
import { lightPlaneModel } from './light-plane.ts';
import { helicopterModel } from './helicopter.ts';
import { balloonModel } from './balloon.ts';
import { horseMaterial, horseModel } from './horse.ts';
import { submarineModel } from './submarine.ts';

/** The ids the fleet places, which must always exist. */
export const CRAFT_IDS = [
  'hatchback', 'van', 'launch', 'light-plane', 'balloon',
  'bicycle', 'scooter', 'motorbike', 'tuk-tuk', 'bus', 'tractor', 'jeep', 'pickup',
  'jet-ski', 'sailboat', 'helicopter', 'horse', 'submarine',
] as const;

/** Every craft, from the traffic kit's baked models and, if it came, the horse's rig. */
export function craftFrom(kit: Iterable<Model>, horse: Rig | null = null): ReadonlyMap<string, CraftModel> {
  const models = new Map<string, Model>();
  for (const model of kit) models.set(model.name, model);
  const list = [
    ...buildCars(models),
    ...buildPartCraft(),
    bicycleModel(),
    motorbikeModel(),
    launchModel(),
    jetSkiModel(),
    sailboatModel(),
    lightPlaneModel(),
    helicopterModel(),
    balloonModel(),
    submarineModel(),
  ];
  const ridden = horseModel(horse);
  if (ridden !== null) list.push(ridden);
  return new Map(list.map((model) => [model.id, model]));
}

let loading: Promise<ReadonlyMap<string, CraftModel>> | null = null;

/**
 * Every craft, loaded once and shared; a failed load is tried again the next
 * time it is asked for. A horse whose rig does not come leaves the rest.
 */
export async function loadCraft(): Promise<ReadonlyMap<string, CraftModel>> {
  if (loading === null) {
    loading = Promise.all([loadModels('traffic/kit.bin'), loadRig('horse', horseMaterial()).catch(() => null)]).then(([kit, horse]) =>
      craftFrom(kit, horse),
    );
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}
