/**
 * Where the animals are: what the climate supports, and whose ground it is.
 *
 * **Two tables and not a third, and the pair is the one the vegetation already
 * uses.** `BIOMES[id].plants` says what grows per climate and `NATIVE_TO` in
 * `scenery/regions.ts` is the range map that stops a saguaro growing outside the
 * Americas. A camel in the Sahara and a llama in the Andes is exactly that pair
 * run again: **`BY_BIOME` says what kind of animal a climate can carry, `RANGE`
 * says whose it is**, and there is no table of countries anywhere in this kit.
 *
 * The two **compose**, which is what makes the pair worth more than either. A
 * camel's range includes `east-europe`, because that row holds Kazakhstan and
 * Mongolia and a Bactrian is a real animal on real steppe. It also holds Serbia,
 * and there is no camel in Serbia — not because a table says so, but because
 * Serbian ground comes back `temperate` from `biomeAt` and `BY_BIOME.temperate`
 * has no camel in it. Neither table needed to know about the other.
 *
 * **Why `BY_BIOME` lives here and not in `biome.ts`.** It is the same inversion
 * `terrain.ts` refuses with the monument registry: `biome.ts` is near the
 * bottom of the stack and this kit is near the top, so a fauna list there would
 * make the ground's own classifier depend on a registry built out of
 * `import.meta.glob`. What this table *does* take from it is the id, and
 * nothing else — the climate model stays exactly where it is.
 */
import { REGIONS, REGION_IDS } from '../scenery/regions.ts';
import type { RegionId } from '../scenery/regions.ts';
import type { BiomeId } from '../biome.ts';
import type { FaunaStyle } from './contract.ts';
import type { Weighted } from '../scenery/random.ts';

export type { RegionId };

/**
 * What kind of animal a climate carries, by `BiomeId`.
 *
 * The weights are what a herd is *made of* and they are the whole regional
 * signal this kit has, exactly as the traffic table's are: six animals is a kit,
 * a mix is a place. Two things the numbers are actually saying, and both are
 * worth more than any of the geometry:
 *
 * - **Sheep and cattle are everywhere and that is not laziness, it is the
 *   answer.** Between them they are most of the world's large land animals by
 *   head, on every continent, and a world whose grazing was all charismatic
 *   would be a zoo rather than a planet. The camel, the llama and the reindeer
 *   are the ones that say *where you are*, and they say it precisely because the
 *   other two are the baseline they stand against.
 * - **`ice` is empty and stays empty.** A polar bear is not a herd animal and
 *   nothing this kit builds belongs on an ice cap.
 */
export const BY_BIOME: Record<BiomeId, readonly Weighted<string>[]> = {
  ice: [],
  tundra: [
    { item: 'reindeer', weight: 8 },
    { item: 'sheep', weight: 1 },
  ],
  boreal: [
    { item: 'reindeer', weight: 5 },
    { item: 'cattle', weight: 3 },
    { item: 'sheep', weight: 2 },
    { item: 'horse', weight: 1 },
  ],
  temperate: [
    { item: 'cattle', weight: 7 },
    { item: 'sheep', weight: 5 },
    { item: 'horse', weight: 3 },
  ],
  grassland: [
    { item: 'cattle', weight: 6 },
    { item: 'horse', weight: 4 },
    { item: 'sheep', weight: 4 },
  ],
  steppe: [
    // The steppe is where the horse comes from, and the world already says so:
    // `monuments.source.json` picked the Genghis Khan statue for *the steppe,
    // and the world's first horse*. Now there is a horse on it.
    { item: 'horse', weight: 6 },
    { item: 'sheep', weight: 5 },
    { item: 'camel', weight: 3 },
    { item: 'llama', weight: 3 },
    { item: 'cattle', weight: 2 },
  ],
  savanna: [
    { item: 'cattle', weight: 7 },
    { item: 'sheep', weight: 3 },
    { item: 'horse', weight: 2 },
    { item: 'camel', weight: 2 },
  ],
  desert: [
    { item: 'camel', weight: 8 },
    { item: 'sheep', weight: 2 },
    { item: 'llama', weight: 1 },
  ],
  tropical: [
    { item: 'cattle', weight: 8 },
    { item: 'sheep', weight: 1 },
  ],
  rock: [
    { item: 'llama', weight: 5 },
    { item: 'sheep', weight: 5 },
    { item: 'horse', weight: 1 },
  ],
};

/**
 * Which regions an animal is native to. **Anything unlisted lives anywhere**,
 * which is `nativeHere`'s convention in `scenery/regions.ts` and is the right
 * default: cattle, sheep and horses genuinely are everywhere, and a range map
 * that had to list fourteen regions for each of them would be a table saying
 * nothing three times.
 *
 * One entry is a deliberate omission and is worth writing down, because it is
 * *wrong about the world and right about the screen*. **There are about a
 * million feral dromedaries in Australia** and `oceania` is not on the camel's
 * list. The range map is here to stop a reading, not to be a range map: a camel
 * in the outback reads as a bug however true it is, and the cost of admitting it
 * is that every player who finds one has to be told it is correct. The saguaro's
 * own entry makes the same trade in the other direction — it is *botanically*
 * right and it is on the list because the wrong reading is the one that would
 * cost something.
 */
export const RANGE: Record<string, readonly RegionId[]> = {
  // The Old World camel, dromedary and Bactrian both. `east-europe` carries
  // Kazakhstan and Mongolia; the biome gate keeps it off Serbian pasture.
  camel: ['maghreb', 'middle-east', 'sub-saharan', 'south-asia', 'east-asia', 'east-europe'],
  // The Andes and nowhere else. A llama is the one animal here whose range is
  // a mountain range.
  llama: ['latin-america'],
  // Rangifer tarandus is circumpolar and is the same species as the caribou, so
  // Canada is on the list and Scotland is not.
  reindeer: ['nordic', 'polar', 'east-europe', 'north-america', 'east-asia'],
};

/** Whether an animal may stand in this region. Anything unlisted may. */
export function nativeHere(animalId: string, region: RegionId): boolean {
  const range = RANGE[animalId];
  return range === undefined || range.includes(region);
}

/**
 * What stands here, and how it has weathered.
 *
 * **Thin on purpose**, and the reason is `dress.ts`'s about people: an animal's
 * colour is a fact about the animal, not about the country. A Friesian is black
 * and white in Chile and in Denmark. So the species carries its own coats and
 * this table carries only what really varies with place.
 *
 * `dust` is a **weight and not a blend**, and that is forced rather than chosen:
 * `ctx.toon` throws on any colour that is not in `PALETTE`, so there is no way
 * to shift a coat 40% toward the ground and the regional signal has to be a
 * change in which coats are drawn at all. The traffic kit met the same wall and
 * came to the same answer — *the regional signal in `paint` is saturation and
 * not hue*.
 *
 * `stock` is a second, softer gate over `BY_BIOME`: the climate says a camel
 * could live here and the region says how much of the local livestock is
 * actually one. It multiplies, so a region that leaves an animal out of `stock`
 * still gets it if the biome insists — a Norwegian summer farm has cattle
 * whatever the table thinks.
 */
export const FAUNA_STYLES: Record<RegionId, FaunaStyle> = {
  nordic: {
    id: 'nordic',
    name: 'Nordic',
    note: 'Reindeer on the fell, a few red cattle on the home pasture, sheep everywhere between.',
    stock: [{ item: 'reindeer', weight: 6 }, { item: 'sheep', weight: 5 }, { item: 'cattle', weight: 4 }, { item: 'horse', weight: 2 }],
    dust: 0.05,
    density: 0.9,
  },
  'atlantic-europe': {
    id: 'atlantic-europe',
    name: 'Atlantic Europe',
    note: 'Dairy cattle in small wet fields, and more sheep than people west of the Severn.',
    stock: [{ item: 'cattle', weight: 7 }, { item: 'sheep', weight: 6 }, { item: 'horse', weight: 2 }],
    dust: 0.1,
    density: 1.15,
  },
  'east-europe': {
    id: 'east-europe',
    name: 'Eastern Europe and the steppe',
    note: 'The horse country. East of the Volga it is horses, sheep and Bactrian camels.',
    stock: [{ item: 'horse', weight: 6 }, { item: 'sheep', weight: 6 }, { item: 'cattle', weight: 4 }, { item: 'camel', weight: 2 }, { item: 'reindeer', weight: 2 }],
    dust: 0.4,
    density: 1.0,
  },
  mediterranean: {
    id: 'mediterranean',
    name: 'Mediterranean',
    note: 'Sheep and goats on dry hills; the cattle are down in the valley.',
    stock: [{ item: 'sheep', weight: 8 }, { item: 'cattle', weight: 3 }, { item: 'horse', weight: 2 }],
    dust: 0.5,
    density: 0.85,
  },
  maghreb: {
    id: 'maghreb',
    name: 'The Maghreb and the Sahara',
    note: 'Camels, and flocks of sheep that are the same dust colour as the ground.',
    stock: [{ item: 'camel', weight: 7 }, { item: 'sheep', weight: 6 }, { item: 'cattle', weight: 1 }],
    dust: 0.9,
    density: 0.6,
  },
  'sub-saharan': {
    id: 'sub-saharan',
    name: 'Sub-Saharan Africa',
    note: 'Long-horned zebu cattle, and camels once you are north of the Sahel.',
    stock: [{ item: 'cattle', weight: 8 }, { item: 'sheep', weight: 4 }, { item: 'camel', weight: 3 }],
    dust: 0.8,
    density: 1.05,
  },
  'middle-east': {
    id: 'middle-east',
    name: 'The Middle East',
    note: 'Camels on the open ground and sheep on everything that is not.',
    stock: [{ item: 'camel', weight: 7 }, { item: 'sheep', weight: 7 }, { item: 'cattle', weight: 2 }, { item: 'horse', weight: 2 }],
    dust: 0.85,
    density: 0.7,
  },
  'south-asia': {
    id: 'south-asia',
    name: 'South Asia',
    note: 'Cattle in the fields and in the road, camels in the Thar.',
    stock: [{ item: 'cattle', weight: 9 }, { item: 'sheep', weight: 3 }, { item: 'camel', weight: 2 }],
    dust: 0.7,
    density: 1.2,
  },
  'east-asia': {
    id: 'east-asia',
    name: 'East Asia',
    note: 'Cattle on the lowland, and yak country up on the plateau — which is sheep and horses here.',
    stock: [{ item: 'cattle', weight: 6 }, { item: 'sheep', weight: 5 }, { item: 'horse', weight: 3 }, { item: 'camel', weight: 1 }],
    dust: 0.45,
    density: 1.0,
  },
  'southeast-asia': {
    id: 'southeast-asia',
    name: 'Southeast Asia',
    note: 'Buffalo in the paddy, which this kit draws as a heavy dark cow.',
    stock: [{ item: 'cattle', weight: 9 }, { item: 'sheep', weight: 1 }],
    dust: 0.35,
    density: 1.1,
  },
  'north-america': {
    id: 'north-america',
    name: 'North America',
    note: 'Beef cattle on big fenced range, horses with them, caribou north of the treeline.',
    stock: [{ item: 'cattle', weight: 8 }, { item: 'horse', weight: 4 }, { item: 'sheep', weight: 2 }, { item: 'reindeer', weight: 2 }],
    dust: 0.4,
    density: 1.1,
  },
  'latin-america': {
    id: 'latin-america',
    name: 'Latin America',
    note: 'Cattle on the pampas and the cerrado, llamas above three thousand metres.',
    stock: [{ item: 'cattle', weight: 8 }, { item: 'horse', weight: 4 }, { item: 'llama', weight: 4 }, { item: 'sheep', weight: 3 }],
    dust: 0.45,
    density: 1.05,
  },
  oceania: {
    id: 'oceania',
    name: 'Oceania',
    note: 'The one place on the planet where the sheep genuinely outnumber everything else.',
    stock: [{ item: 'sheep', weight: 9 }, { item: 'cattle', weight: 5 }, { item: 'horse', weight: 2 }],
    dust: 0.55,
    density: 1.2,
  },
  polar: {
    id: 'polar',
    name: 'Polar',
    note: 'Reindeer, and only where something is growing under the snow.',
    stock: [{ item: 'reindeer', weight: 9 }, { item: 'sheep', weight: 1 }],
    dust: 0.05,
    density: 0.35,
  },
};

/**
 * Regions the scenery kit has and this table does not.
 *
 * Adding a region there and forgetting it here would be a continent of empty
 * fields, which is exactly the failure that is invisible until somebody flies
 * over it. `pnpm fauna` fails on a non-empty list.
 */
export const MISSING_REGIONS: RegionId[] = REGION_IDS.filter((id) => !(id in FAUNA_STYLES));

export { REGIONS };
