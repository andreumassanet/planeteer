/** Where each thing belongs: how much a biome farms, what a region grows, which faith's shrine, and the ground each thing may stand on. */
import { MAX_RELIEF, MAX_SLOPE } from '../terrain.ts';
import type { BiomeId } from '../biome.ts';
import type { RegionId } from '../scenery/regions.ts';
import type { Rng, Weighted } from '../scenery/random.ts';
import type { CropId } from './types.ts';

/** How much a biome farms, 0 to 1. The desert has oases instead, the ice nothing. */
export const FARMING: Record<BiomeId, number> = {
  ice: 0,
  tundra: 0,
  rock: 0,
  boreal: 0.35,
  temperate: 1,
  grassland: 1,
  steppe: 0.55,
  savanna: 0.7,
  tropical: 0.75,
  desert: 0,
};

/** What a region's fields grow, by weight. Paddies only where it is wet enough; see `cropsFor`. */
const CROPS: Record<RegionId, readonly Weighted<CropId>[]> = {
  nordic: [{ item: 'barley', weight: 3 }, { item: 'ploughed', weight: 2 }, { item: 'rapeseed', weight: 1 }, { item: 'greens', weight: 1 }],
  'atlantic-europe': [
    { item: 'wheat', weight: 3 }, { item: 'barley', weight: 2 }, { item: 'rapeseed', weight: 2 },
    { item: 'ploughed', weight: 1.5 }, { item: 'greens', weight: 1 }, { item: 'maize', weight: 1 },
  ],
  'east-europe': [
    { item: 'wheat', weight: 4 }, { item: 'ploughed', weight: 2 }, { item: 'maize', weight: 1.5 },
    { item: 'rapeseed', weight: 1 }, { item: 'greens', weight: 1 },
  ],
  mediterranean: [
    { item: 'wheat', weight: 3 }, { item: 'vineyard', weight: 2.5 }, { item: 'olives', weight: 2.5 },
    { item: 'ploughed', weight: 1.5 }, { item: 'greens', weight: 1 },
  ],
  maghreb: [{ item: 'olives', weight: 3 }, { item: 'wheat', weight: 2 }, { item: 'ploughed', weight: 1.5 }, { item: 'greens', weight: 1 }],
  'sub-saharan': [{ item: 'millet', weight: 3 }, { item: 'maize', weight: 2 }, { item: 'greens', weight: 1.5 }, { item: 'ploughed', weight: 1 }],
  'middle-east': [{ item: 'wheat', weight: 3 }, { item: 'ploughed', weight: 2 }, { item: 'olives', weight: 1 }, { item: 'greens', weight: 1 }],
  'south-asia': [{ item: 'paddy', weight: 3 }, { item: 'wheat', weight: 2 }, { item: 'greens', weight: 2 }, { item: 'millet', weight: 1 }],
  'east-asia': [{ item: 'paddy', weight: 4 }, { item: 'greens', weight: 2 }, { item: 'wheat', weight: 1.5 }, { item: 'maize', weight: 1 }],
  'southeast-asia': [{ item: 'paddy', weight: 5 }, { item: 'greens', weight: 1 }, { item: 'maize', weight: 1 }],
  'north-america': [{ item: 'maize', weight: 4 }, { item: 'wheat', weight: 3 }, { item: 'ploughed', weight: 1.5 }, { item: 'greens', weight: 1 }],
  'latin-america': [{ item: 'maize', weight: 3 }, { item: 'greens', weight: 2 }, { item: 'wheat', weight: 1 }, { item: 'vineyard', weight: 0.6 }],
  oceania: [{ item: 'wheat', weight: 3 }, { item: 'ploughed', weight: 2 }, { item: 'vineyard', weight: 1 }, { item: 'greens', weight: 1 }],
  polar: [{ item: 'ploughed', weight: 1 }],
};

/** Paddies want water: not in the dry north of China or on the Deccan's driest. */
export function cropsFor(region: RegionId, biome: BiomeId, lat: number, iso: string): readonly Weighted<CropId>[] {
  const table = CROPS[region];
  const wet = (biome === 'tropical' || biome === 'temperate') && Math.abs(lat) < 38;
  const lavender = iso === 'FRA' && lat < 46;
  if (wet && !lavender) return table;
  const out = table.filter((entry) => wet || entry.item !== 'paddy');
  if (lavender) out.push({ item: 'lavender', weight: 1.5 });
  return out.length > 0 ? out : [{ item: 'greens', weight: 1 }];
}

/** Which regions keep a silo by the barn, which have no barns, and which a windpump on the range. */
export const SILOS = new Set<RegionId>(['north-america', 'atlantic-europe', 'east-europe', 'oceania', 'latin-america', 'nordic']);
export const BARNLESS = new Set<RegionId>(['sub-saharan', 'south-asia', 'southeast-asia']);
export const WINDPUMPS = new Set<RegionId>(['oceania', 'north-america', 'latin-america']);
export const WINDPUMP_ISO = new Set(['ZAF', 'NAM', 'BWA']);
/** Dry-stone walls round the fields rather than fences. */
export const WALLED_ISO = new Set(['GBR', 'IRL', 'IMN']);

const HIMALAYA = new Set(['NPL', 'BTN']);
export const HIGH_ASIA = new Set(['CHN', 'IND', 'PAK', 'NPL', 'BTN']);
const SPIRIT_HOUSES = new Set(['THA', 'LAO', 'KHM', 'MMR', 'VNM']);
export const STEPPE_NOMADS = new Set(['MNG', 'KAZ', 'KGZ']);
/**
 * Muslim countries of regions whose shrine table would otherwise give a cross
 * or a shikhara: a region is a way of building, and belief does not follow it.
 */
const MUSLIM = new Set(['TUR', 'CYN', 'AZE', 'KAZ', 'KGZ', 'UZB', 'TKM', 'TJK', 'AFG', 'PAK', 'BGD', 'MDV', 'KOS', 'ALB']);

/** Mills, where mills still stand. The Low Countries have rows of them. */
export function windmillWeight(iso: string, region: RegionId): number {
  if (STEPPE_NOMADS.has(iso)) return 0;
  if (iso === 'NLD') return 6;
  if (iso === 'BEL' || iso === 'DNK') return 1.2;
  if (iso === 'ESP' || iso === 'PRT' || iso === 'GRC') return 1.6;
  if (region === 'atlantic-europe' || region === 'east-europe') return 0.35;
  if (region === 'mediterranean') return 0.3;
  return 0;
}

/** Turbines, where wind farms are: the open plains and the windy coasts. */
export function turbineWeight(iso: string, region: RegionId): number {
  if (iso === 'DEU' || iso === 'DNK' || iso === 'ESP' || iso === 'NLD') return 1.4;
  if (iso === 'CHN' || iso === 'USA' || iso === 'GBR') return 1.3;
  switch (region) {
    case 'atlantic-europe':
    case 'nordic':
    case 'north-america':
    case 'oceania':
      return 0.7;
    case 'east-europe':
    case 'latin-america':
    case 'mediterranean':
      return 0.4;
    default:
      return 0;
  }
}

/** Which shrine keeps the way here, if any. */
export function shrineFor(iso: string, region: RegionId, elevation: number, rng: Rng): { parts: string[]; weight: number } | null {
  const high = elevation > MAX_RELIEF * 0.28;
  if (HIMALAYA.has(iso) || (HIGH_ASIA.has(iso) && high)) return { parts: ['chorten', 'prayer-flags'], weight: 1.6 };
  if (iso === 'JPN') return { parts: ['torii'], weight: 1.4 };
  // An ovoo: the cairn of the steppe, hung with flags.
  if (iso === 'MNG') return { parts: ['cairn', 'prayer-flags'], weight: 1.2 };
  if (MUSLIM.has(iso)) return { parts: ['marabout'], weight: 0.6 };
  if (iso === 'LKA') return { parts: ['chorten'], weight: 1 };
  switch (region) {
    case 'east-asia':
      return { parts: ['road-shrine'], weight: 0.8 };
    case 'southeast-asia':
      return SPIRIT_HOUSES.has(iso) ? { parts: ['spirit-house'], weight: 1.2 } : { parts: ['marabout'], weight: 0.4 };
    case 'south-asia':
      return { parts: ['hindu-shrine'], weight: 0.9 };
    case 'maghreb':
    case 'middle-east':
      return { parts: ['marabout'], weight: 0.6 };
    case 'mediterranean':
    case 'latin-america':
    case 'east-europe':
      return { parts: [rng.chance(0.45) ? 'chapel' : 'wayside-cross'], weight: 0.9 };
    case 'atlantic-europe':
    case 'nordic':
      return { parts: [rng.chance(0.2) ? 'chapel' : 'wayside-cross'], weight: 0.8 };
    default:
      return null;
  }
}

/** The steepest ground under each: a field, a building, a small thing. */
export const FIELD_GRADE = 0.14;
export const BUILDING_GRADE = 0.3;
export const PROP_GRADE = MAX_SLOPE;
/**
 * The steepest ground each crop is grown on, where it is not `FIELD_GRADE`:
 * vines and olives climb the hills a plough cannot, and a paddy is a level
 * pool or nothing.
 */
export const CROP_GRADE: Partial<Record<CropId, number>> = { vineyard: 0.3, olives: 0.3, paddy: 0.08, pond: 0.1 };
