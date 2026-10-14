import type { Carry, Garment, Headwear } from '../people.ts';
import type { Weighted } from '../random.ts';
import type { RegionId } from '../regions.ts';
import { P } from './appearance.ts';

export interface DressStyle {
  id: RegionId;
  /** One line: what you would notice on the street. */
  note: string;
  /**
   * The climate this region is assumed to have when nobody says otherwise,
   * on `biome.ts`'s own scale: 0 polar, 1 equatorial.
   *
   * It is a default, not a definition. A placer that has a `BiomeSample`
   * should pass its `warmth` instead, because the honest gap in `regions.ts` —
   * Chile is the Atacama and Patagonia under one entry — is exactly a gap about
   * climate, and this is the lever that closes it without adding rows.
   */
  warmth: number;

  /** The upper garment: shirt, coat, robe. The largest area on a person. */
  cloth: readonly number[];
  /** Trousers and skirts. Darker, because it is the half that meets the ground. */
  under: readonly number[];
  /** Boots, belts, caps, a staff. The dark one, and it is the same in most rows. */
  trim: readonly number[];
  /** The one bright thing: a shawl, an apron, a basket, a hat. */
  accent: readonly number[];

  garments: readonly Weighted<Garment>[];
  headwear: readonly Weighted<Headwear>[];
  carried: readonly Weighted<Carry>[];
}

/**
 * The wardrobe, one row per region. Three rules hold across every row:
 *
 * 1. No `crimson`: it is the player's colour.
 * 2. Warm entries for anything with area. `bone` and `steel` appear once each,
 *    as a boot or a hat, never a coat.
 * 3. A garment colour is never allowed to equal the skin under it. `lookFor`
 *    re-draws rather than the tables dodging eight tones each.
 */
export const DRESS: Record<RegionId, DressStyle> = {
  nordic: {
    id: 'nordic',
    note: 'Wool and oilskin. Coats, knitted caps, and one bright thing against the grey.',
    warmth: 0.18,
    cloth: [P.red, P.cream, P.white, P.skyBlue, P.steel, P.olive],
    under: [P.steel, P.bark, P.slate, P.darkOlive],
    trim: [P.bark, P.darkOlive, P.brown],
    accent: [P.gold, P.red, P.cream, P.orange],
    garments: [
      { item: 'coat', weight: 6 },
      { item: 'shirt', weight: 5 },
      { item: 'tunic', weight: 1 },
      { item: 'dress', weight: 1 },
    ],
    headwear: [
      { item: 'beanie', weight: 5 },
      { item: 'none', weight: 4 },
      { item: 'cap', weight: 2 },
      { item: 'hood', weight: 2 },
    ],
    carried: [
      { item: 'none', weight: 7 },
      { item: 'pack', weight: 2 },
      { item: 'satchel', weight: 2 },
      { item: 'bundle', weight: 1 },
      { item: 'staff', weight: 1 },
    ],
  },

  'atlantic-europe': {
    id: 'atlantic-europe',
    note: 'Street clothes: a shirt, a jacket, a bag. The least costumed row in the table.',
    warmth: 0.45,
    cloth: [P.cream, P.tan, P.blush, P.white, P.skyBlue, P.olive, P.steel],
    under: [P.steel, P.bark, P.slate, P.brown],
    trim: [P.bark, P.darkOlive, P.brown],
    accent: [P.red, P.gold, P.orange, P.violet, P.pink],
    garments: [
      { item: 'shirt', weight: 7 },
      { item: 'coat', weight: 3 },
      { item: 'dress', weight: 2 },
      { item: 'tunic', weight: 1 },
    ],
    headwear: [
      { item: 'none', weight: 8 },
      { item: 'cap', weight: 3 },
      { item: 'brim', weight: 1 },
    ],
    carried: [
      { item: 'none', weight: 6 },
      { item: 'satchel', weight: 3 },
      { item: 'pack', weight: 2 },
      { item: 'basket', weight: 1 },
    ],
  },

  'east-europe': {
    id: 'east-europe',
    note: 'Headscarves and long coats; a basket, a bundle, and something being carried home.',
    warmth: 0.4,
    cloth: [P.tan, P.sand, P.cream, P.blush, P.gold, P.olive],
    under: [P.bark, P.brown, P.darkOlive, P.steel],
    trim: [P.bark, P.brown, P.darkOlive],
    accent: [P.red, P.orange, P.pink, P.gold],
    garments: [
      { item: 'shirt', weight: 5 },
      { item: 'coat', weight: 4 },
      { item: 'dress', weight: 2 },
      { item: 'tunic', weight: 2 },
      { item: 'apron', weight: 1 },
    ],
    headwear: [
      { item: 'none', weight: 5 },
      { item: 'scarf', weight: 3 },
      { item: 'beanie', weight: 2 },
      { item: 'cap', weight: 2 },
    ],
    carried: [
      { item: 'none', weight: 6 },
      { item: 'basket', weight: 2 },
      { item: 'bundle', weight: 2 },
      { item: 'staff', weight: 1 },
    ],
  },

  mediterranean: {
    id: 'mediterranean',
    note: 'Light shirts, straw brims, a jug or a basket. Sleeves come off here.',
    warmth: 0.68,
    cloth: [P.white, P.cream, P.sand, P.blush, P.skyBlue, P.olive],
    under: [P.tan, P.bark, P.brown, P.steel],
    trim: [P.bark, P.brown, P.darkOlive],
    accent: [P.orange, P.red, P.gold, P.apricot],
    garments: [
      { item: 'shirt', weight: 6 },
      { item: 'tunic', weight: 3 },
      { item: 'dress', weight: 2 },
      { item: 'apron', weight: 1 },
    ],
    headwear: [
      { item: 'none', weight: 6 },
      { item: 'brim', weight: 3 },
      { item: 'scarf', weight: 2 },
      { item: 'cap', weight: 1 },
    ],
    carried: [
      { item: 'none', weight: 5 },
      { item: 'basket', weight: 3 },
      { item: 'jug', weight: 2 },
      { item: 'satchel', weight: 2 },
    ],
  },

  maghreb: {
    id: 'maghreb',
    note: 'Full-length robes and covered heads: the row where the legs disappear.',
    warmth: 0.82,
    cloth: [P.sand, P.cream, P.white, P.blush, P.tan, P.skyBlue],
    under: [P.tan, P.brown, P.bark, P.sand],
    trim: [P.bark, P.brown, P.darkOlive],
    accent: [P.skyBlue, P.orange, P.gold, P.red],
    garments: [
      { item: 'robe', weight: 7 },
      { item: 'tunic', weight: 3 },
      { item: 'shirt', weight: 2 },
    ],
    headwear: [
      { item: 'scarf', weight: 5 },
      { item: 'turban', weight: 3 },
      { item: 'none', weight: 2 },
      { item: 'brim', weight: 1 },
    ],
    carried: [
      { item: 'none', weight: 4 },
      { item: 'jug', weight: 2 },
      { item: 'basket', weight: 2 },
      { item: 'staff', weight: 2 },
      { item: 'headload', weight: 1 },
      { item: 'bundle', weight: 1 },
    ],
  },

  'sub-saharan': {
    id: 'sub-saharan',
    note: 'The brightest row in the table, and the one where things ride on heads.',
    warmth: 0.88,
    cloth: [P.gold, P.orange, P.red, P.olive, P.apricot, P.white, P.skyBlue],
    under: [P.brown, P.tan, P.bark, P.darkOlive],
    trim: [P.bark, P.brown, P.darkOlive],
    accent: [P.pink, P.violet, P.skyBlue, P.gold, P.orange],
    garments: [
      { item: 'tunic', weight: 5 },
      { item: 'robe', weight: 4 },
      { item: 'dress', weight: 3 },
      { item: 'shirt', weight: 2 },
    ],
    headwear: [
      { item: 'scarf', weight: 4 },
      { item: 'none', weight: 4 },
      { item: 'turban', weight: 2 },
      { item: 'brim', weight: 1 },
    ],
    carried: [
      { item: 'none', weight: 4 },
      { item: 'headload', weight: 3 },
      { item: 'basket', weight: 3 },
      { item: 'jug', weight: 2 },
      { item: 'bundle', weight: 2 },
      { item: 'staff', weight: 1 },
    ],
  },

  'middle-east': {
    id: 'middle-east',
    note: 'Robes and wrapped heads in the colours of the ground they stand on.',
    warmth: 0.75,
    cloth: [P.sand, P.cream, P.white, P.tan, P.olive, P.skyBlue],
    under: [P.tan, P.brown, P.bark],
    trim: [P.bark, P.brown, P.darkOlive],
    accent: [P.red, P.gold, P.orange, P.violet],
    garments: [
      { item: 'robe', weight: 6 },
      { item: 'tunic', weight: 3 },
      { item: 'shirt', weight: 2 },
      { item: 'coat', weight: 1 },
    ],
    headwear: [
      { item: 'scarf', weight: 4 },
      { item: 'turban', weight: 3 },
      { item: 'none', weight: 3 },
      { item: 'cap', weight: 1 },
    ],
    carried: [
      { item: 'none', weight: 5 },
      { item: 'basket', weight: 2 },
      { item: 'jug', weight: 2 },
      { item: 'staff', weight: 2 },
      { item: 'bundle', weight: 1 },
    ],
  },

  'south-asia': {
    id: 'south-asia',
    note: 'Saturated cloth: pink, violet, gold. The one row where the accent is the garment.',
    warmth: 0.85,
    cloth: [P.orange, P.gold, P.pink, P.violet, P.white, P.cream, P.skyBlue],
    under: [P.tan, P.brown, P.bark, P.steel],
    trim: [P.bark, P.brown, P.gold],
    accent: [P.pink, P.violet, P.orange, P.red, P.gold],
    garments: [
      { item: 'robe', weight: 4 },
      { item: 'dress', weight: 4 },
      { item: 'tunic', weight: 4 },
      { item: 'shirt', weight: 2 },
    ],
    headwear: [
      { item: 'none', weight: 5 },
      { item: 'scarf', weight: 4 },
      { item: 'turban', weight: 2 },
    ],
    carried: [
      { item: 'none', weight: 4 },
      { item: 'basket', weight: 3 },
      { item: 'headload', weight: 2 },
      { item: 'jug', weight: 2 },
      { item: 'bundle', weight: 1 },
    ],
  },

  'east-asia': {
    id: 'east-asia',
    note: 'Muted and tidy, and the conical hat that no other region wears.',
    warmth: 0.55,
    cloth: [P.white, P.cream, P.skyBlue, P.slate, P.olive, P.blush, P.steel],
    under: [P.steel, P.bark, P.slate, P.brown],
    trim: [P.bark, P.darkOlive, P.steel],
    accent: [P.red, P.gold, P.orange, P.pink],
    garments: [
      { item: 'shirt', weight: 6 },
      { item: 'tunic', weight: 4 },
      { item: 'robe', weight: 2 },
      { item: 'coat', weight: 2 },
    ],
    headwear: [
      { item: 'none', weight: 6 },
      { item: 'conical', weight: 3 },
      { item: 'cap', weight: 2 },
    ],
    carried: [
      { item: 'none', weight: 6 },
      { item: 'basket', weight: 2 },
      { item: 'satchel', weight: 2 },
      { item: 'bundle', weight: 1 },
      { item: 'staff', weight: 1 },
    ],
  },

  'southeast-asia': {
    id: 'southeast-asia',
    note: 'Conical hats, bare arms, and a parasol on the ones out of the shade.',
    warmth: 0.92,
    cloth: [P.white, P.cream, P.gold, P.orange, P.olive, P.skyBlue, P.apricot],
    under: [P.tan, P.brown, P.bark],
    trim: [P.bark, P.brown, P.darkOlive],
    accent: [P.orange, P.gold, P.pink, P.red],
    garments: [
      { item: 'tunic', weight: 5 },
      { item: 'shirt', weight: 3 },
      { item: 'robe', weight: 3 },
      { item: 'dress', weight: 3 },
    ],
    headwear: [
      { item: 'conical', weight: 5 },
      { item: 'none', weight: 4 },
      { item: 'scarf', weight: 2 },
    ],
    carried: [
      { item: 'none', weight: 4 },
      { item: 'basket', weight: 3 },
      { item: 'headload', weight: 2 },
      { item: 'parasol', weight: 2 },
      { item: 'jug', weight: 1 },
      { item: 'bundle', weight: 1 },
    ],
  },

  'north-america': {
    id: 'north-america',
    note: 'Caps and packs. Denim by way of `steel`, and the widest streets to stand in.',
    warmth: 0.5,
    cloth: [P.skyBlue, P.red, P.cream, P.white, P.olive, P.tan, P.gold],
    under: [P.steel, P.slate, P.bark, P.brown],
    trim: [P.bark, P.brown, P.darkOlive],
    accent: [P.red, P.orange, P.gold, P.violet],
    garments: [
      { item: 'shirt', weight: 8 },
      { item: 'coat', weight: 3 },
      { item: 'dress', weight: 1 },
      { item: 'apron', weight: 1 },
    ],
    headwear: [
      { item: 'none', weight: 6 },
      { item: 'cap', weight: 4 },
      { item: 'brim', weight: 2 },
      { item: 'beanie', weight: 1 },
    ],
    carried: [
      { item: 'none', weight: 6 },
      { item: 'pack', weight: 3 },
      { item: 'satchel', weight: 2 },
    ],
  },

  'latin-america': {
    id: 'latin-america',
    note: 'Ponchos and wide brims. The only row that wears a blanket as a garment.',
    warmth: 0.78,
    cloth: [P.white, P.cream, P.sand, P.orange, P.gold, P.skyBlue, P.pink],
    under: [P.tan, P.brown, P.bark, P.steel],
    trim: [P.bark, P.brown, P.darkOlive],
    accent: [P.red, P.orange, P.violet, P.pink, P.gold],
    garments: [
      { item: 'shirt', weight: 5 },
      { item: 'poncho', weight: 3 },
      { item: 'tunic', weight: 3 },
      { item: 'dress', weight: 3 },
    ],
    headwear: [
      { item: 'none', weight: 5 },
      { item: 'brim', weight: 4 },
      { item: 'cap', weight: 2 },
      { item: 'scarf', weight: 1 },
    ],
    carried: [
      { item: 'none', weight: 5 },
      { item: 'basket', weight: 3 },
      { item: 'bundle', weight: 2 },
      { item: 'jug', weight: 1 },
      { item: 'staff', weight: 1 },
    ],
  },

  oceania: {
    id: 'oceania',
    note: 'Shirts, brims and bare arms. The least layered people on the planet.',
    warmth: 0.72,
    cloth: [P.cream, P.white, P.skyBlue, P.olive, P.sand, P.gold, P.green],
    under: [P.tan, P.steel, P.brown, P.bark],
    trim: [P.bark, P.brown, P.darkOlive],
    accent: [P.red, P.orange, P.gold, P.green],
    garments: [
      { item: 'shirt', weight: 8 },
      { item: 'tunic', weight: 2 },
      { item: 'dress', weight: 2 },
    ],
    headwear: [
      { item: 'none', weight: 5 },
      { item: 'brim', weight: 4 },
      { item: 'cap', weight: 3 },
    ],
    carried: [
      { item: 'none', weight: 7 },
      { item: 'pack', weight: 2 },
      { item: 'satchel', weight: 2 },
    ],
  },

  polar: {
    id: 'polar',
    note: 'Hooded coats in the one colour that can be found in snow. Nobody is bare-headed.',
    warmth: 0.05,
    cloth: [P.red, P.orange, P.gold, P.skyBlue, P.white, P.cream],
    under: [P.steel, P.bark, P.slate],
    trim: [P.bark, P.darkOlive, P.brown],
    accent: [P.gold, P.orange, P.red, P.skyBlue],
    garments: [
      { item: 'coat', weight: 9 },
      { item: 'shirt', weight: 1 },
    ],
    headwear: [
      { item: 'hood', weight: 5 },
      { item: 'beanie', weight: 4 },
      { item: 'none', weight: 1 },
    ],
    carried: [
      { item: 'none', weight: 6 },
      { item: 'bundle', weight: 2 },
      { item: 'pack', weight: 2 },
      { item: 'staff', weight: 1 },
    ],
  },
};

export const DRESS_IDS = Object.keys(DRESS) as RegionId[];

/**
 * The wardrobe at a place.
 *
 * Takes a plain string rather than a `RegionId` because `RegionStyle.id` is one,
 * and it falls back the way `regionFor` does — every region in the world
 * resolves to a wardrobe and none of them resolves to nothing.
 */
export function dressFor(region: string): DressStyle {
  return (DRESS as Record<string, DressStyle | undefined>)[region] ?? DRESS['atlantic-europe'];
}
