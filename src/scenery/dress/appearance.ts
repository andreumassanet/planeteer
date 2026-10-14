import { PALETTE } from '../../theme.ts';
import type { Hair } from '../people.ts';
import type { Weighted } from '../random.ts';

export const P = PALETTE;

// Appearance: from the seed, and from nothing else

/**
 * Skin, lightest to deepest; the draw over it is uniform everywhere.
 *
 * Eight of the palette's twenty-four entries, chosen warm: this scene's fill is
 * a blue hemisphere light, so a neutral turned away from the sun goes hueless.
 * Every entry here holds its hue in shade. Luminance, for anyone adding one:
 * sand 212, blush 206, apricot 182, salmon 172, tan 152, brown 133, clay 125,
 * bark 67. The gap between clay and bark has no palette entry inside it
 * (`darkOlive` at 78 is green).
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
 * Hair colour, weighted on the skin tone index and on nothing else: a
 * correlation between two attributes of one person, not a lookup from a place.
 * One row per band of the ramp, three bands.
 */
export const HAIR_FOR: readonly (readonly Weighted<number>[])[] = [
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
export const hairBandOf = (tone: number): number => (tone < 3 ? 0 : tone < 5 ? 1 : 2);

/**
 * Grey, and it is an *age* draw rather than a colour draw.
 *
 * `slate` and `bone` are the two cool entries anywhere near a person, and they
 * are used here and nowhere else on a body: hair is a small mass on top of a
 * head, so it is the one place in the kit that can afford a neutral without
 * turning into the hole the palette note warns about.
 */
export const GREY: readonly Weighted<number>[] = [
  { item: P.bone, weight: 4 },
  { item: P.slate, weight: 5 },
  { item: P.ink, weight: 2 },
];

/** Hair shapes, region-free like everything else in the `who` fork. */
export const HAIRSTYLES: readonly Weighted<Hair>[] = [
  { item: 'crop', weight: 10 },
  { item: 'bob', weight: 5 },
  { item: 'long', weight: 5 },
  { item: 'bun', weight: 3 },
  { item: 'braid', weight: 2 },
  { item: 'topknot', weight: 1.5 },
  { item: 'afro', weight: 3 },
  { item: 'bald', weight: 1.5 },
];
