/**
 * Every vehicle model that can be taken, by id.
 *
 * Five are placed by the fleet — `hatchback`, `van`, `launch`, `light-plane`
 * and `balloon` — and each is its own file here: the two road craft are the
 * traffic kit's baked Kenney cars at a person's size (`cars.ts`), and the
 * launch, the plane and the balloon are built in code round the hero's own
 * seated and standing body (`body.ts`), because no CC0 pack has a boat, a
 * plane or a basket with room in it for four of him.
 *
 * `loadCraft` fetches the traffic kit's file for the cars, which the world
 * has usually fetched already, so the browser's cache answers it; `craftFrom`
 * is the same thing handed the models, which is how the headless check builds
 * them from disk.
 */
import type { CraftModel } from './contract.ts';
import type { Model } from '../models.ts';
// Static, and not a dynamic import inside `loadCraft`: this file is itself
// reached only through a deferred import (`main.ts`), so the kit's reader
// adds nothing to the world's first load — while a review sheet that awaits
// `loadCraft` at its top level, with the reader in a chunk that imports back
// from the sheet's own, waits on itself for ever.
import { loadModels } from '../kit.ts';
import { buildCars } from './cars.ts';
import { launchModel } from './launch.ts';
import { lightPlaneModel } from './light-plane.ts';
import { balloonModel } from './balloon.ts';

/** The ids the fleet places, which must always exist. */
export const CRAFT_IDS = ['hatchback', 'van', 'launch', 'light-plane', 'balloon'] as const;

/** Every craft, from the traffic kit's baked models. */
export function craftFrom(kit: Iterable<Model>): ReadonlyMap<string, CraftModel> {
  const models = new Map<string, Model>();
  for (const model of kit) models.set(model.name, model);
  const list = [...buildCars(models), launchModel(), lightPlaneModel(), balloonModel()];
  return new Map(list.map((model) => [model.id, model]));
}

let loading: Promise<ReadonlyMap<string, CraftModel>> | null = null;

/** Every craft, loaded once and shared; a failed load is tried again the next time it is asked for. */
export async function loadCraft(): Promise<ReadonlyMap<string, CraftModel>> {
  if (loading === null) {
    loading = loadModels('traffic/kit.bin').then(craftFrom);
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}
