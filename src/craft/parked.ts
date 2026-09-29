/**
 * What stands still somewhere until somebody takes it: a town's parked car,
 * a bicycle in a town's rack, a farm's tractor. Merged into the buffer it
 * stands in (`settlements.ts`, `countryside-tile.ts`), and the fleet's own
 * vehicle (`fleet.ts`) the moment anybody takes it.
 *
 * **The one drawn still and the one taken are the same model, built the same
 * way from the same id.** Until 2026-09-28 a town parked the traffic kit's
 * vehicle and the fleet drew the craft in its place: a saloon became the
 * hatchback, an ambulance the van, and the colour was read off the town that
 * stood, so a car taken in another session, or by somebody else, or whose
 * town was not built here, came back in the craft's own paint. What stands
 * now is the craft itself (`parkedModel`), in the variant the fleet picks
 * for that id (`fleetVariant`) and the body colour the id decides (the town's
 * `parkedPaint`): nothing is remembered and nothing is sent.
 *
 * The models are built here off the scenery kit's registry rather than taken
 * from the fleet, because a town parks its cars before the fleet has loaded:
 * the same functions of the same baked models, so the same vertices.
 */
import * as THREE from 'three';
import { rngFrom } from '../scenery/random.ts';
import { sceneryModel } from '../scenery/contract.ts';
import { mergeMeshes } from '../merge.ts';
import type { Merged } from '../merge.ts';
import type { Model } from '../models.ts';
import type { CraftModel } from './contract.ts';
import { buildCars } from './cars.ts';
import { bicycleModel } from './cycles.ts';
import { buildPartCraft } from './traffic-craft.ts';

/**
 * Where a vehicle the countryside stands (a farm's tractor) starts counting
 * in the `<place>` of an id: past every place there is (29,651), so a site's
 * id and a field's never meet, and under the relay's six digits with the
 * finest tile cell's number added (`countryVehicleId`).
 */
export const COUNTRY_VEHICLES = 300_000;

/**
 * A farm's vehicle's id: `<model>:<COUNTRY_VEHICLES + row * 1000 + column>:<n>`,
 * the finest tile cell's row (under 288) and column (under 576) and the
 * ordinal of that model among the cell's plan's pieces. Null past two digits.
 */
export function countryVehicleId(model: string, row: number, column: number, n: number): string | null {
  if (n > 99 || column >= 1000) return null;
  return `${model}:${COUNTRY_VEHICLES + row * 1000 + column}:${n}`;
}

/** Which of a model's looks the vehicle with this id wears: the fleet's rule, and the parked one's. */
export function fleetVariant(id: string, variants: number): number {
  return variants > 1 ? rngFrom('fleet-variant', id).int(variants) : 0;
}

/** A body colour off a palette, by the id alone. */
export function paintFor(id: string, palette: readonly number[]): number {
  return palette[rngFrom('parked-paint', id).int(palette.length)]!;
}

/** The kit models the road craft are built from (`cars.ts`). */
const CAR_KIT = ['hatchback-sports', 'van', 'suv', 'truck', 'tractor', 'bus'] as const;

let models: Map<string, CraftModel> | null = null;
/**
 * The craft that can stand parked, by id: the road craft off the registered
 * kit, the scooter and the tuk-tuk, and the bicycle. Null while the kit is
 * not registered, or for a craft that is never parked.
 */
export function parkedModel(craft: string): CraftModel | null {
  if (models === null) {
    const kit = new Map<string, Model>();
    try {
      for (const name of CAR_KIT) kit.set(name, sceneryModel(name));
    } catch {
      return null;
    }
    models = new Map([...buildCars(kit), ...buildPartCraft(), bicycleModel()].map((model) => [model.id, model]));
  }
  return models.get(craft) ?? null;
}

/**
 * A craft's look as one buffer, at `scale` about its base: what a town or a
 * tile merges where it stands. Every mesh's geometry is dropped once read.
 */
export function parkedArrays(model: CraftModel, variant: number, paint: number | undefined, scale = 1): Merged {
  const group = model.build(variant, paint);
  const holder = new THREE.Group();
  holder.scale.setScalar(scale);
  holder.add(group);
  const merged = mergeMeshes(holder);
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
  return merged;
}

/**
 * The mark a still vehicle's vertices carry in a buffer's light bytes, which
 * a window never has (a vertex with no light has no bedtime either): the
 * town's material paints a vertex so marked the way the craft's material
 * does, and not as a wall. See `MACHINE_GLSL`.
 */
export const MACHINE_BED = 255;
