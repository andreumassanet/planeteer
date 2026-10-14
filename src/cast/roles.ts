import * as THREE from 'three';
import { tone } from '../monuments/contract.ts';
import { PALETTE } from '../theme.ts';
import type { Paint, WornPart } from './wardrobe.ts';

// What each surface is

/**
 * What a surface of a part is, for whoever colours it. `keep` is a detail of
 * the outfit that stays its own colour (on the palette); `-light` and `-dark`
 * are a second cloth on the same garment, drawn as a tone of the first so the
 * garment stays one garment whatever colour it is.
 */
export type Role =
  | 'skin'
  | 'stubble'
  | 'beard'
  | 'hair'
  | 'hair-dark'
  | 'eye'
  | 'top'
  | 'top-light'
  | 'top-dark'
  | 'bottom'
  | 'bottom-dark'
  | 'shoes'
  | 'shoes-light'
  | 'shoes-dark'
  | 'pack'
  | 'pack-light'
  | 'pack-dark'
  | 'keep';

/**
 * The surfaces whose names say what they are in every outfit of the pack.
 * `Brown` on a woman's head is her eyes and on her boots is leather, so a
 * colour name alone is never one of these.
 */
export const GENERIC: ReadonlyMap<string, Role> = new Map<string, Role>([
  ['Skin', 'skin'],
  ['Skin_Darker', 'stubble'],
  ['Eye', 'eye'],
  ['Eyebrows', 'hair'],
  ['Hair', 'hair'],
  ['Hair_Brown', 'hair'],
  ['Hair_Blond', 'hair'],
  ['Moustache', 'beard'],
  ['Earrings', 'keep'],
]);

/**
 * Every other surface of every part, by outfit and part, read off the pack's
 * files. `pnpm people` fails on a material this table and `GENERIC` do not
 * name, so a re-bake from a newer pack cannot quietly paint a hat in a
 * shirt's colour.
 */
export const ROLES: Readonly<Record<string, Readonly<Record<string, Role>>>> = {
  'man-adventurer/top': { Green: 'top', LightGreen: 'top-light' },
  'man-adventurer/bottom': { Brown: 'bottom', Brown2: 'bottom-dark' },
  'man-adventurer/feet': { Grey: 'shoes', Black: 'keep' },
  'man-adventurer/pack': { LightGreen: 'pack', Green: 'pack-dark', Gold: 'pack-light', Brown: 'keep' },
  'man-beach/top': { LightBrown: 'top' },
  'man-beach/bottom': { Red_Dark: 'bottom', White: 'keep' },
  'man-beach/feet': { Red_Dark: 'shoes' },
  'man-casual/top': { LightBrown: 'top' },
  'man-casual/bottom': { LightBlue: 'bottom' },
  'man-casual/feet': { Red_Dark: 'shoes', White: 'keep' },
  'man-hoodie/top': { Purple: 'top' },
  'man-hoodie/bottom': { LightBlue: 'bottom' },
  'man-hoodie/feet': { Purple: 'shoes', White: 'keep' },
  // The straw hat and its band.
  'man-farmer/head': { Beige: 'keep', Red: 'keep' },
  // The dungarees' bib is on the torso and is the trousers' cloth.
  'man-farmer/top': { Brown: 'top', LightBlue: 'bottom', Beige: 'keep' },
  'man-farmer/bottom': { LightBlue: 'bottom' },
  'man-farmer/feet': { Brown: 'shoes', Brown2: 'shoes-dark' },
  // The crest and the shaved sides under it.
  'man-punk/head': { Red: 'hair', Red_Dark: 'hair-dark' },
  // A leather waistcoat over a white shirt: the waistcoat is the top.
  'man-punk/top': { Black: 'top', White: 'keep' },
  'man-punk/bottom': { LightBlue: 'bottom' },
  'man-punk/feet': { Black: 'shoes' },
  'man-suit/top': { Suit: 'top', White: 'keep', Tie: 'keep' },
  'man-suit/bottom': { Suit: 'bottom' },
  'man-suit/feet': { Black: 'shoes' },
  'man-worker/head': { Worker_Yellow: 'keep' },
  'man-worker/top': { Worker_Vest: 'top', Worker_Yellow: 'keep', LightBrown: 'keep' },
  'man-worker/bottom': { Brown: 'bottom', Brown2: 'bottom-dark' },
  'man-worker/feet': { Grey: 'shoes', Black: 'keep' },
  'woman-adventurer/head': { Brown: 'eye' },
  'woman-adventurer/top': { LightGreen: 'top', Green: 'top-dark', White: 'keep', Brown2: 'keep', Gold: 'keep' },
  // The tunic's hem comes down over the shorts, in the tunic's cloth.
  'woman-adventurer/bottom': { Brown_02: 'bottom', Brown2: 'bottom-dark', LightGreen: 'top', White: 'keep', Gold: 'keep' },
  'woman-adventurer/feet': { Brown_02: 'shoes', Brown2: 'shoes-dark' },
  'woman-casual/head': { Brown: 'eye' },
  'woman-casual/top': { White: 'top' },
  'woman-casual/bottom': { Orange: 'bottom' },
  'woman-casual/feet': { Grey: 'shoes' },
  // Her hair is the pack's `Red`.
  'woman-formal/head': { Brown: 'eye', Red: 'hair' },
  'woman-formal/top': { LimeGreen: 'top', Gold: 'keep' },
  'woman-formal/bottom': { LimeGreen: 'bottom' },
  'woman-formal/feet': { Red: 'shoes' },
  // Grey hair (`White`) under a brown hood.
  'woman-medieval/head': { Brown: 'eye', White: 'hair', DarkBrown: 'keep', Black: 'keep' },
  'woman-medieval/top': { DarkBrown: 'top', LightBrown: 'top-light', Black: 'keep', Gold: 'keep', Metal: 'keep' },
  'woman-medieval/bottom': { Black: 'bottom' },
  'woman-medieval/feet': { DarkBrown: 'shoes', LightBrown: 'shoes-light' },
  'woman-punk/head': { Brown: 'eye', Pink: 'hair', Black: 'keep' },
  'woman-punk/top': { Pink: 'top', Black: 'keep' },
  'woman-punk/bottom': { Black: 'bottom' },
  'woman-punk/feet': { Black: 'shoes', Grey: 'keep' },
  'woman-suit/head': { Brown: 'eye' },
  'woman-suit/top': { Black: 'top', White: 'keep' },
  'woman-suit/bottom': { Black: 'bottom' },
  'woman-suit/feet': { Black: 'shoes' },
  'woman-worker/head': { Brown: 'eye', DarkBrown: 'hair', Worker_Yellow: 'keep' },
  'woman-worker/top': { Worker_Vest: 'top', White: 'keep', Worker_Yellow: 'keep' },
  'woman-worker/bottom': { Brown_02: 'bottom', Brown2: 'bottom-dark' },
  'woman-worker/feet': { Black: 'shoes' },
};

/** What a surface is, or `null` for one nobody has named; `paintWith` keeps those. */
export function roleOf(worn: WornPart, material: string): Role | null {
  return ROLES[`${worn.outfit}/${worn.part}`]?.[material] ?? GENERIC.get(material) ?? null;
}

/** The palette's own values, to tell a colour that may be toned from one that may not. */
export const PALETTE_VALUES = new Set<number>(Object.values(PALETTE));

/**
 * The entries a surface the pack coloured may be moved onto: every one but
 * `ink`, which is the pen's. A dark band of ink on a body is read as a line
 * before it is read as cloth — the lesson the tower blocks' black glazing
 * taught — so the suit's black goes to the nearest dark that is not the pen.
 */
export const SNAP: readonly number[] = Object.values(PALETTE).filter((value) => value !== PALETTE.ink);
export const snapped = new Map<number, number>();

/** The palette entry nearest the pack's own colour, compared in sRGB. */
export function paletteOf(original: THREE.Color): number {
  const hex = original.getHex();
  const known = snapped.get(hex);
  if (known !== undefined) return known;
  const channel = (value: number, shift: number) => (value >> shift) & 255;
  let best = SNAP[0]!;
  let bestD = Infinity;
  for (const candidate of SNAP) {
    const d =
      (channel(hex, 16) - channel(candidate, 16)) ** 2 +
      (channel(hex, 8) - channel(candidate, 8)) ** 2 +
      (channel(hex, 0) - channel(candidate, 0)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = candidate;
    }
  }
  snapped.set(hex, best);
  return best;
}

/**
 * Skin, as the cast wears it. `dress.ts`'s ramp is the right set of people and
 * one of its entries is the wrong colour here: `tan` goes olive on a large
 * smooth face under the blue fill light. It is swapped for a warm tone of the same weight; the others stand.
 * The crowd and the traveller's card both read it.
 */
export const castSkin = (color: number): number => (color === PALETTE.tan ? tone(PALETTE.apricot, 0.8) : color);

/** A second cloth of a garment, a tone of the first; a colour off the palette is left as it is. */
export const shade = (color: number, factor: number): number => (PALETTE_VALUES.has(color) ? tone(color, factor) : color);

/** The colours one person wears, by role. Every one a palette entry or a tone of one. */
export interface Colours {
  skin: number;
  hair: number;
  /** The eyes: `ink` for everybody, which is what the pack's own dots are drawn as. */
  eye: number;
  top: number;
  bottom: number;
  shoes: number;
  /** The rucksack, where the wardrobe has one. */
  pack: number;
  /** A child: whatever beard the head was drawn with goes the colour of the skin. */
  young?: boolean;
}

/** The paint for a set of colours: each surface by its role, and the rest on the palette. */
export function paintWith(colours: Colours): Paint {
  return (material, original, worn) => {
    switch (roleOf(worn, material) ?? 'keep') {
      case 'skin':
        return colours.skin;
      case 'stubble':
        return colours.young === true ? colours.skin : shade(colours.skin, 0.88);
      case 'beard':
        return colours.young === true ? colours.skin : colours.hair;
      case 'hair':
        return colours.hair;
      case 'hair-dark':
        return shade(colours.hair, 0.7);
      case 'eye':
        return colours.eye;
      case 'top':
        return colours.top;
      case 'top-light':
        return shade(colours.top, 1.25);
      case 'top-dark':
        return shade(colours.top, 0.72);
      case 'bottom':
        return colours.bottom;
      case 'bottom-dark':
        return shade(colours.bottom, 0.72);
      case 'shoes':
        return colours.shoes;
      case 'shoes-light':
        return shade(colours.shoes, 1.25);
      case 'shoes-dark':
        return shade(colours.shoes, 0.72);
      case 'pack':
        return colours.pack;
      case 'pack-light':
        return shade(colours.pack, 1.2);
      case 'pack-dark':
        return shade(colours.pack, 0.75);
      case 'keep':
        return paletteOf(original);
    }
  };
}
