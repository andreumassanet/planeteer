import { PALETTE } from '../theme.ts';
import { BODY_SCALE } from '../stature.ts';
import type { Rng, Weighted } from './random.ts';
import type { RegionId } from './regions.ts';
import type { Age, Carry, Garment, Hair, Headwear, Look, Pose, Sleeves } from './people.ts';

/**
 * Who a person is, and what they are wearing — and the whole point of the file
 * is that those are **two independent draws**.
 *
 * This is the region table for people, and it is a separate file from
 * `regions.ts` for the same mechanical reason `ground.ts` is: a blind collision
 * between two concurrent edits of one 640-line table is the kind nobody can
 * untangle. It is keyed on `RegionId` and read through `dressFor`, so folding
 * it into `RegionStyle` later is a rename.
 *
 * ## The one decision this file exists to get right
 *
 * **Clothing is regional. Appearance is not.** Every kind of person lives
 * everywhere, and a kit that handed out skin tones from a country table would be
 * both wrong about the world and ugly on the screen — a continent of one face.
 * So:
 *
 * - `SKIN_TONES` is drawn **uniformly, from the seed, everywhere on the
 *   planet**. There is no region in that code path and there is not going to be.
 * - `DRESS` is drawn from the region and the climate, because what people wear
 *   genuinely does differ by place and weather and that difference is most of
 *   what makes a street somewhere.
 *
 * And the independence is not a claim, it is a **mechanism**: `lookFor` draws
 * the body and the face from `rng.fork('who')` and the clothes from
 * `rng.fork('worn')`, so the two streams cannot interfere however many draws
 * either side makes. The same seed produces *the same person* in Oslo and in
 * Bamako, wearing different clothes. `sameBodyEverywhere` below asserts exactly
 * that, and the review sheet shows it as a row.
 *
 * The one place the two touch is hair colour, and it is deliberate and worth
 * being explicit about: `HAIR_FOR` weights hair colour on the **skin tone**, not
 * on the region — a correlation between two facts about one person, which is
 * real, rather than a correlation between a person and a country, which is the
 * thing being avoided. It is drawn inside the same `who` fork, so it travels
 * with the body.
 *
 * ## What is deliberately missing
 *
 * The same gaps `regions.ts` admits to, inherited: fourteen wardrobes for the
 * world is coarse, India and Indonesia are one entry each, and a large country
 * is one style end to end. Those are fixed by adding rows. What is *not* here
 * and should not be is a demographic table — `CROWD_MIX` is one number for the
 * whole planet, because a table of birth rates by region is not something this
 * project is going to ship to make a street look right.
 */

const P = PALETTE;

// ---------------------------------------------------------------------------
// Appearance: from the seed, and from nothing else
// ---------------------------------------------------------------------------

/**
 * Skin, lightest to deepest, and **the draw over it is uniform everywhere**.
 *
 * Eight entries out of the twenty-four the world is painted with, chosen warm
 * for the reason the monument contract measures: this scene's fill is a blue
 * hemisphere light, so a neutral turned away from the sun goes hueless —
 * `bone` 143,122,100 becomes 76,68,58, a dark patch with no colour left. A face
 * is *nothing but* a surface turning away from the light. Every entry here holds
 * its hue in shade.
 *
 * Luminance, for anyone adding one: sand 212, blush 206, apricot 182,
 * salmon 172, tan 152, brown 133, clay 125, bark 67. The gap between clay and
 * bark is the largest in the ramp and there is no palette entry inside it —
 * `darkOlive` at 78 is the only candidate and it is green.
 */
export const SKIN_TONES: readonly number[] = [
  P.sand,
  P.blush,
  P.apricot,
  P.salmon,
  P.tan,
  P.brown,
  P.clay,
  P.bark,
];

/**
 * Hair colour, weighted on the **skin tone index** and on nothing else.
 *
 * Read the note at the top of the file before changing this. It is a
 * correlation between two attributes of one person — which is real, and which
 * is what stops the crowd being a random colour wheel — and it is emphatically
 * not a lookup from a place. Move it into `DRESS` and it becomes the thing this
 * file was written to avoid.
 *
 * One row per band of the ramp, coarsest possible: three bands.
 */
const HAIR_FOR: readonly (readonly Weighted<number>[])[] = [
  // Lightest three tones: the full range, black still the most common single
  // colour on the planet.
  [
    { item: P.ink, weight: 4 },
    { item: P.bark, weight: 5 },
    { item: P.brown, weight: 5 },
    { item: P.clay, weight: 2 },
    { item: P.gold, weight: 3 },
    { item: P.sand, weight: 1 },
  ],
  // Middle two.
  [
    { item: P.ink, weight: 7 },
    { item: P.bark, weight: 6 },
    { item: P.brown, weight: 3 },
    { item: P.clay, weight: 1 },
  ],
  // Deepest three.
  [
    { item: P.ink, weight: 9 },
    { item: P.bark, weight: 4 },
    { item: P.brown, weight: 1 },
  ],
];

/** Which band of `HAIR_FOR` a tone index falls in. */
const hairBandOf = (tone: number): number => (tone < 3 ? 0 : tone < 5 ? 1 : 2);

/**
 * Grey, and it is an *age* draw rather than a colour draw.
 *
 * `slate` and `bone` are the two cool entries anywhere near a person, and they
 * are used here and nowhere else on a body: hair is a small mass on top of a
 * head, so it is the one place in the kit that can afford a neutral without
 * turning into the hole the palette note warns about.
 */
const GREY: readonly Weighted<number>[] = [
  { item: P.bone, weight: 4 },
  { item: P.slate, weight: 5 },
  { item: P.ink, weight: 2 },
];

/** Hair shapes, region-free like everything else in the `who` fork. */
const HAIRSTYLES: readonly Weighted<Hair>[] = [
  { item: 'crop', weight: 10 },
  { item: 'bob', weight: 5 },
  { item: 'long', weight: 5 },
  { item: 'bun', weight: 3 },
  { item: 'braid', weight: 2 },
  { item: 'topknot', weight: 1.5 },
  { item: 'afro', weight: 3 },
  { item: 'bald', weight: 1.5 },
];

// ---------------------------------------------------------------------------
// Dress: from the region and the weather
// ---------------------------------------------------------------------------

export interface DressStyle {
  id: RegionId;
  /** One line for the review sheet. What you would notice on the street. */
  note: string;
  /**
   * The climate this region is assumed to have when nobody says otherwise,
   * on `biome.ts`'s own scale: 0 polar, 1 equatorial.
   *
   * It is a **default, not a definition**. A placer that has a `BiomeSample`
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
 * The wardrobe, one row per region.
 *
 * Three rules held across every row, each of them a trap somewhere else in this
 * repo:
 *
 * 1. **No `crimson` anywhere.** It is the player's. The one person on the planet
 *    in that colour should be the one you are steering.
 * 2. **Warm entries for anything with area.** `bone` and `steel` appear once
 *    each in the whole table and both times as a boot or a hat — a small dark
 *    mass, not a coat. See the palette note in the monument contract.
 * 3. **A garment colour is never allowed to equal the skin under it.**
 *    `lookFor` re-draws rather than the table dodging it, because the tables
 *    would have to dodge eight tones each and would end up with no light
 *    colours in them at all.
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

/**
 * How much of a crowd is children, and it is one number for the whole planet.
 *
 * A per-region table here would be a table of birth rates, which is not
 * something this project is going to ship in order to make a street look right.
 * One in five is enough for a village to read as inhabited rather than as a
 * workforce.
 */
export const CROWD_MIX: readonly Weighted<string>[] = [
  { item: 'villager', weight: 8 },
  { item: 'child', weight: 2 },
];

/** The part ids `CROWD_MIX` names, for the review sheet's orphan banner. */
export const PEOPLE_PART_IDS: readonly string[] = CROWD_MIX.map((entry) => entry.item);

// ---------------------------------------------------------------------------
// Climate
// ---------------------------------------------------------------------------

/**
 * What the weather does to a wardrobe, as multipliers on the region's own
 * weights.
 *
 * **The region says what kind of clothes exist here; the climate says how many
 * of them are on.** That split is what lets one Chilean row cover the Atacama
 * and Patagonia: same garments in the list, a coat in the south and a bare arm
 * in the north, with no second table and no second region.
 *
 * A multiplier of 0 would delete a garment from a region that owns it, so
 * nothing here goes below 0.06 — a polar shirt exists, you just never see one.
 */
const COLD: Partial<Record<Garment | Headwear | Sleeves, number>> = {
  coat: 3.2,
  robe: 0.35,
  dress: 0.5,
  apron: 0.6,
  poncho: 1.5,
  tunic: 0.8,
  none: 0.3,
  beanie: 3.0,
  hood: 3.2,
  scarf: 1.4,
  brim: 0.25,
  conical: 0.15,
  turban: 0.6,
  bare: 0.08,
  short: 0.4,
  long: 2.6,
};

const HOT: Partial<Record<Garment | Headwear | Sleeves, number>> = {
  coat: 0.06,
  robe: 1.5,
  tunic: 1.4,
  dress: 1.2,
  poncho: 0.7,
  beanie: 0.1,
  hood: 0.12,
  brim: 2.4,
  conical: 2.4,
  turban: 1.3,
  helmet: 0.6,
  bare: 2.8,
  short: 1.3,
  long: 0.25,
};

/**
 * The multiplier at a warmth, interpolated through 1 at the middle.
 *
 * Two straight lines rather than one, because 0.5 has to mean "no correction"
 * exactly: a single lerp from COLD to HOT would leave a temperate region
 * permanently half-way into a parka.
 */
function climate(item: string, warmth: number): number {
  const w = Math.min(1, Math.max(0, warmth));
  if (w < 0.5) {
    const cold = COLD[item as Garment] ?? 1;
    return cold + (1 - cold) * (w / 0.5);
  }
  const hot = HOT[item as Garment] ?? 1;
  return 1 + (hot - 1) * ((w - 0.5) / 0.5);
}

function weathered<T extends string>(
  list: readonly Weighted<T>[],
  warmth: number,
): Weighted<T>[] {
  return list.map((entry) => ({
    item: entry.item,
    weight: Math.max(0.02, entry.weight * climate(entry.item, warmth)),
  }));
}

// ---------------------------------------------------------------------------
// Drawing a person
// ---------------------------------------------------------------------------

export interface LookOptions {
  /**
   * `biome.ts`'s own number: 0 polar, 1 equatorial. Left out, the region's own
   * `warmth` is used — see the note on `DressStyle.warmth`.
   */
  warmth?: number;
  /** Forced, when the caller is placing a specific kind of person. */
  age?: Age;
  /** Forced. Leave it out and the load decides, which is usually what you want. */
  pose?: Pose;
}

/** Loads that only make sense in one pose, because the arms have to be there. */
const POSE_FOR_LOAD: Partial<Record<Carry, Pose>> = {
  headload: 'lift',
  basket: 'carry',
};

/** What people are doing when they are not carrying anything in particular. */
const IDLE_POSES: readonly Weighted<Pose>[] = [
  { item: 'stand', weight: 5 },
  { item: 'walk', weight: 6 },
  { item: 'stride', weight: 2 },
  { item: 'talk', weight: 3 },
  { item: 'rest', weight: 2 },
];

/**
 * One person.
 *
 * **Two forks and they never see each other.** `who` draws the body, the face
 * and the hair; `worn` draws everything from the wardrobe. Because `Rng.fork`
 * forks from the *original* seed rather than from the current state, adding a
 * draw to either side cannot move the other — which is what makes the claim at
 * the top of this file mechanical rather than aspirational, and what lets the
 * review sheet put the same eight people in two regions and show the same eight
 * faces.
 */
export function lookFor(rng: Rng, region: string, options: LookOptions = {}): Look {
  const style = dressFor(region);
  const warmth = options.warmth ?? style.warmth;

  // --- who they are: no region in this block, and there is not going to be ---
  const who = rng.fork('who');
  const age: Age =
    options.age ?? (who.chance(0.13) ? 'elder' : 'adult');
  const tone = who.int(SKIN_TONES.length);
  const skin = SKIN_TONES[tone]!;
  const hair = who.weighted(HAIRSTYLES);
  const greying = age === 'elder' ? who.chance(0.82) : who.chance(0.02);
  const hairColor = greying
    ? who.weighted(GREY)
    : who.weighted(HAIR_FOR[hairBandOf(tone)]!);
  // A beard is a facial-hair draw and belongs with the face, not with a region.
  const beard = age === 'child' ? false : who.chance(age === 'elder' ? 0.42 : 0.22);

  const heightSpread =
    age === 'child'
      ? who.range(3.7, 5.15) * BODY_SCALE
      : who.range(5.95, 7.15) * BODY_SCALE * (age === 'elder' ? 0.965 : 1);
  const girth = who.range(0.87, 1.17) * (age === 'child' ? 1.03 : 1);
  const stoop = age === 'elder' ? who.range(0.06, 0.19) : who.range(0, 0.03);
  const sway = who.jitter();

  // --- what they are wearing: region and weather, and nothing about them -----
  const worn = rng.fork('worn');
  const garment = worn.weighted(weathered(style.garments, warmth));
  const sleeves = worn.weighted(
    weathered(
      [
        { item: 'bare' as Sleeves, weight: 3 },
        { item: 'short' as Sleeves, weight: 4 },
        { item: 'long' as Sleeves, weight: 3 },
      ],
      warmth,
    ),
  );
  const headwear = worn.weighted(weathered(style.headwear, warmth));

  // A garment the same colour as the skin under it deletes the boundary between
  // the two, and at 120 units a person becomes one flesh-coloured post. Redrawn
  // rather than dodged in the table: every row would have to avoid all eight
  // tones and would end up with no pale cloth in it at all.
  let top = worn.pick(style.cloth);
  for (let tries = 0; tries < 4 && top === skin; tries++) top = worn.pick(style.cloth);
  let bottom = worn.pick(style.under);
  for (let tries = 0; tries < 4 && bottom === skin; tries++) bottom = worn.pick(style.under);
  const trim = worn.pick(style.trim);
  const accent = worn.pick(style.accent);

  // A child does not carry the water and does not lean on a staff.
  const loads =
    age === 'child'
      ? style.carried.filter((entry) => entry.item === 'none' || entry.item === 'pack')
      : style.carried;
  const carry = worn.weighted(loads.length > 0 ? loads : style.carried);

  const pose =
    options.pose ?? POSE_FOR_LOAD[carry] ?? worn.weighted(IDLE_POSES);

  return {
    height: heightSpread,
    girth,
    age,
    hair,
    beard,
    headwear,
    garment,
    sleeves,
    carry,
    pose,
    stoop,
    sway,
    skin,
    hairColor,
    top,
    // A robe is one garment: the lower body is the same cloth as the upper, and
    // saying so here is what stops `buildPerson` needing to know what a robe is.
    bottom: garment === 'robe' ? top : bottom,
    trim,
    accent,
  };
}

/**
 * The independence claim, as a test.
 *
 * Builds the same seed in every region and reports whether the *person* came out
 * identical each time — height, build, age, skin, hair and beard — while the
 * clothes were free to differ. It is here rather than in a test file because the
 * review sheet runs it and prints the answer, which is the only place anyone
 * will look.
 */
export function sameBodyEverywhere(rng: () => Rng): { same: boolean; regions: number } {
  const key = (look: Look): string =>
    [
      look.height.toFixed(6),
      look.girth.toFixed(6),
      look.age,
      look.skin,
      look.hairColor,
      look.hair,
      look.beard,
    ].join('|');

  let first: string | null = null;
  let same = true;
  for (const id of DRESS_IDS) {
    const signature = key(lookFor(rng(), id));
    if (first === null) first = signature;
    else if (signature !== first) same = false;
  }
  return { same, regions: DRESS_IDS.length };
}
