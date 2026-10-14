/** The countryside's planner and tile builder, wired to the scenic kit's dwellings. */
import type { World } from '../geo.ts';
import { part } from '../scenery/index.ts';
import type { SceneryContext } from '../scenery/index.ts';
import { createCountryside } from '../countryside.ts';
import type { Countryside } from '../countryside.ts';
import { createCountryBuilder } from '../countryside-tile.ts';
import type { CountryBuilder } from '../countryside-tile.ts';
import type { Variants } from './variants.ts';
import type { VegetationOptions } from './types.ts';

export interface VegetationCountry {
  planner: Countryside;
  builder: CountryBuilder;
}

/**
 * A farm's house is the region's own dwelling out of the scenic kit, so the
 * planner is told which parts those are and how much ground each takes.
 */
export function createVegetationCountry(
  world: World,
  ctx: SceneryContext,
  options: VegetationOptions,
  variants: Variants,
): VegetationCountry | null {
  if (options.places === undefined) return null;
  const dwellingsOf = new Map<string, { item: string; weight: number; footprint: number }[]>();
  const planner = createCountryside(world, {
    places: options.places,
    monuments: options.monuments,
    roads: options.roads,
    fields: options.fields,
    dwellings(style) {
      let list = dwellingsOf.get(style.id);
      if (list === undefined) {
        list = style.buildings
          .filter((entry) => variants.kindOf.get(entry.item) === 'dwelling')
          .map((entry) => ({ item: entry.item, weight: entry.weight, footprint: part(entry.item)!.footprint }));
        if (list.length === 0) list = [{ item: 'gabled-house', weight: 1, footprint: part('gabled-house')?.footprint ?? 7.4 }];
        dwellingsOf.set(style.id, list);
      }
      return list;
    },
  });
  return { planner, builder: createCountryBuilder(world, ctx, planner, variants.variantOf) };
}
