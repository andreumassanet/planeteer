import { castSkin } from './cast.ts';
import type { BodyKind, Colours, OutfitId, PartName, Wardrobe, WornPart } from './cast.ts';
import { SKIN_TONES } from './scenery/dress.ts';
import type { Rng } from './scenery/random.ts';
import { PALETTE } from './theme.ts';

/**
 * How the traveller looks: a body, a skin, a head of hair, a top, a bottom,
 * shoes and a rucksack, each with its colour — chosen on the traveller's card,
 * worn by the hero, kept on this device and sent to the other players.
 *
 * ## What there is to choose from is what the cast can do
 *
 * Every option is a part of one of the pack's outfits (`cast.ts`): the pack
 * cuts each of its fifteen people into a head, a top, a bottom and shoes on
 * one rig a body, so a man's head, hoodie, swim shorts and boots from four
 * outfits are one body with its seams met. The tables below are those parts,
 * named for what they are; nothing is modelled for the card. A woman's
 * wardrobe is her seven outfits' parts and a man's his eight, less the one
 * head that is another's twin. The colours are the world's palette, and the
 * skins are the crowd's own eight (`SKIN_TONES`), drawn from the same ramp.
 *
 * ## On the wire it is thirteen characters
 *
 * `encodeAppearance` writes a version letter and one base-36 digit a field,
 * which is what the relay passes on beside a name: it checks only that it is
 * a short run of lower-case letters and digits (`LOOK_PATTERN` in
 * `server/src/limits.ts`), and `decodeAppearance` is the one reader, so a
 * code from a newer client — a longer one, or an index past the end of a
 * table this build has — decodes to what this build can draw rather than to
 * nothing. **The tables are append-only for that reason**: an index is what
 * is stored and sent, so a reordered table redresses every traveller.
 */

/** A choice on the card: the outfit a part is taken from, and what it is called. */
export interface Choice {
  outfit: OutfitId;
  label: string;
}

/** The four slots every body fills; the rucksack is a switch of its own. */
export type Slot = Exclude<PartName, 'pack'>;
export const SLOTS: readonly Slot[] = ['head', 'top', 'bottom', 'feet'];

/**
 * Every part a body can wear, by slot. Named off an offline render of each
 * part (2026-09-24). Append-only: see the note at the top.
 */
export const WARDROBE: Readonly<Record<BodyKind, Readonly<Record<Slot, readonly Choice[]>>>> = {
  man: {
    head: [
      { outfit: 'man-hoodie', label: 'Swept' },
      { outfit: 'man-suit', label: 'Side parting' },
      { outfit: 'man-casual', label: 'Tousled, stubble' },
      { outfit: 'man-beach', label: 'Spiky' },
      { outfit: 'man-adventurer', label: 'Long, bearded' },
      { outfit: 'man-punk', label: 'Mohawk' },
      { outfit: 'man-farmer', label: 'Cowboy hat' },
      { outfit: 'man-worker', label: 'Hard hat' },
    ],
    top: [
      { outfit: 'man-hoodie', label: 'Hoodie' },
      { outfit: 'man-casual', label: 'T-shirt' },
      { outfit: 'man-beach', label: 'Tank top' },
      { outfit: 'man-punk', label: 'Waistcoat' },
      { outfit: 'man-adventurer', label: 'Field shirt' },
      { outfit: 'man-farmer', label: 'Shirt and bib' },
      { outfit: 'man-suit', label: 'Suit jacket' },
      { outfit: 'man-worker', label: 'Hi-vis vest' },
    ],
    bottom: [
      { outfit: 'man-casual', label: 'Jeans' },
      { outfit: 'man-hoodie', label: 'Shorts' },
      { outfit: 'man-beach', label: 'Swim shorts' },
      { outfit: 'man-punk', label: 'Ripped jeans' },
      { outfit: 'man-adventurer', label: 'Cargo trousers' },
      { outfit: 'man-farmer', label: 'Dungarees' },
      { outfit: 'man-suit', label: 'Suit trousers' },
      { outfit: 'man-worker', label: 'Work trousers' },
    ],
    feet: [
      { outfit: 'man-hoodie', label: 'Trainers' },
      { outfit: 'man-casual', label: 'High-tops' },
      { outfit: 'man-beach', label: 'Sandals' },
      { outfit: 'man-punk', label: 'Plimsolls' },
      { outfit: 'man-suit', label: 'Dress shoes' },
      { outfit: 'man-adventurer', label: 'Boots' },
      { outfit: 'man-farmer', label: 'Farm boots' },
      { outfit: 'man-worker', label: 'Work boots' },
    ],
  },
  woman: {
    head: [
      { outfit: 'woman-casual', label: 'Long' },
      { outfit: 'woman-adventurer', label: 'Cropped' },
      { outfit: 'woman-formal', label: 'Braided' },
      { outfit: 'woman-punk', label: 'Mohawk' },
      { outfit: 'woman-medieval', label: 'Hood' },
      { outfit: 'woman-worker', label: 'Hard hat' },
    ],
    top: [
      { outfit: 'woman-casual', label: 'T-shirt' },
      { outfit: 'woman-punk', label: 'Crop top' },
      { outfit: 'woman-formal', label: 'Halter top' },
      { outfit: 'woman-suit', label: 'Blazer' },
      { outfit: 'woman-adventurer', label: 'Field tunic' },
      { outfit: 'woman-medieval', label: 'Bodice' },
      { outfit: 'woman-worker', label: 'Hi-vis vest' },
    ],
    bottom: [
      { outfit: 'woman-casual', label: 'Slim trousers' },
      { outfit: 'woman-formal', label: 'Skirt' },
      { outfit: 'woman-adventurer', label: 'Shorts' },
      { outfit: 'woman-punk', label: 'Ripped leggings' },
      { outfit: 'woman-medieval', label: 'Baggy trousers' },
      { outfit: 'woman-suit', label: 'Suit trousers' },
      { outfit: 'woman-worker', label: 'Work trousers' },
    ],
    feet: [
      { outfit: 'woman-casual', label: 'Trainers' },
      { outfit: 'woman-formal', label: 'Flats' },
      { outfit: 'woman-suit', label: 'Loafers' },
      { outfit: 'woman-worker', label: 'Work shoes' },
      { outfit: 'woman-punk', label: 'Platform boots' },
      { outfit: 'woman-adventurer', label: 'Tall boots' },
      { outfit: 'woman-medieval', label: 'Riding boots' },
    ],
  },
};

/** The one outfit with a rucksack, which either body may wear. */
export const PACK: WornPart = { outfit: 'man-adventurer', part: 'pack' };

/**
 * Cloth, for a top, a bottom, shoes and the rucksack: the palette less the
 * pen's `ink` (a band of it on a body reads as a line) and the skin-only
 * `blush`. Append-only.
 */
export const CLOTH: readonly number[] = [
  PALETTE.crimson,
  PALETTE.red,
  PALETTE.orange,
  PALETTE.apricot,
  PALETTE.gold,
  PALETTE.olive,
  PALETTE.green,
  PALETTE.darkOlive,
  PALETTE.skyBlue,
  PALETTE.slate,
  PALETTE.violet,
  PALETTE.pink,
  PALETTE.salmon,
  PALETTE.clay,
  PALETTE.brown,
  PALETTE.tan,
  PALETTE.sand,
  PALETTE.bone,
  PALETTE.white,
  PALETTE.steel,
  PALETTE.bark,
];

/** Hair: the crowd's naturals first (`HAIR_FOR` and `GREY` in `dress.ts`), then the dyes. Append-only. */
export const HAIR: readonly number[] = [
  PALETTE.ink,
  PALETTE.bark,
  PALETTE.brown,
  PALETTE.clay,
  PALETTE.gold,
  PALETTE.sand,
  PALETTE.bone,
  PALETTE.slate,
  PALETTE.crimson,
  PALETTE.pink,
  PALETTE.violet,
  PALETTE.skyBlue,
];

/** Skin: the crowd's eight, lightest to deepest, as the cast wears them (`castSkin`). */
export const SKINS: readonly number[] = SKIN_TONES.map(castSkin);

const NAMES = new Map<number, string>(Object.entries(PALETTE).map(([name, value]) => [value, name]));
/** A palette colour's name, spaced for a label: `skyBlue` is "sky blue". */
export const colourName = (color: number): string =>
  (NAMES.get(color) ?? `#${color.toString(16).padStart(6, '0')}`).replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);

export interface Appearance {
  body: BodyKind;
  /** Index into `SKINS`. */
  skin: number;
  /** Indices into `WARDROBE[body]`'s slots, each with an index into its colours. */
  head: number;
  /** Index into `HAIR`: the hair, the brows and any beard. */
  hair: number;
  top: number;
  topColour: number;
  bottom: number;
  bottomColour: number;
  feet: number;
  feetColour: number;
  pack: boolean;
  packColour: number;
}

const cloth = (color: number): number => CLOTH.indexOf(color);

/**
 * The hero before anyone has chosen: the man in the crimson hoodie that
 * nobody else in the world wears, now in jeans and dark trainers where he
 * had shorts, and with the pack's own rucksack in gold where he had one
 * built in code.
 */
export const DEFAULT_APPEARANCE: Readonly<Appearance> = {
  body: 'man',
  skin: SKINS.indexOf(PALETTE.blush),
  head: 0,
  hair: HAIR.indexOf(PALETTE.bark),
  top: 0,
  topColour: cloth(PALETTE.crimson),
  bottom: 0,
  bottomColour: cloth(PALETTE.slate),
  feet: 0,
  feetColour: cloth(PALETTE.bark),
  pack: true,
  packColour: cloth(PALETTE.gold),
};

/** Every index in range for its body and its table, the rest left as they are. */
export function fitAppearance(appearance: Appearance): Appearance {
  const own = WARDROBE[appearance.body];
  const within = (value: number, length: number, fallback: number): number =>
    Number.isInteger(value) && value >= 0 && value < length ? value : fallback;
  return {
    body: appearance.body,
    skin: within(appearance.skin, SKINS.length, DEFAULT_APPEARANCE.skin),
    head: within(appearance.head, own.head.length, 0),
    hair: within(appearance.hair, HAIR.length, DEFAULT_APPEARANCE.hair),
    top: within(appearance.top, own.top.length, 0),
    topColour: within(appearance.topColour, CLOTH.length, DEFAULT_APPEARANCE.topColour),
    bottom: within(appearance.bottom, own.bottom.length, 0),
    bottomColour: within(appearance.bottomColour, CLOTH.length, DEFAULT_APPEARANCE.bottomColour),
    feet: within(appearance.feet, own.feet.length, 0),
    feetColour: within(appearance.feetColour, CLOTH.length, DEFAULT_APPEARANCE.feetColour),
    pack: appearance.pack,
    packColour: within(appearance.packColour, CLOTH.length, DEFAULT_APPEARANCE.packColour),
  };
}

/** What the appearance wears, as the cast takes it. */
export function wardrobeOf(appearance: Appearance): Wardrobe {
  const own = WARDROBE[appearance.body];
  const worn: WornPart[] = SLOTS.map((slot) => ({ outfit: own[slot][appearance[slot]]!.outfit, part: slot }));
  if (appearance.pack) worn.push(PACK);
  return worn;
}

/** Every outfit a wardrobe takes a part from: what has to be loaded to dress it. */
export function outfitsOf(appearance: Appearance): OutfitId[] {
  return [...new Set(wardrobeOf(appearance).map((worn) => worn.outfit))];
}

/** Every outfit either body can take a part from: what the card loads to show them all. */
export const WARDROBE_OUTFITS: readonly OutfitId[] = [
  ...new Set([
    ...(['man', 'woman'] as const).flatMap((body) => SLOTS.flatMap((slot) => WARDROBE[body][slot].map((choice) => choice.outfit))),
    PACK.outfit,
  ]),
];

/** The colours the appearance is painted in, by role. */
export function coloursOf(appearance: Appearance): Colours {
  return {
    skin: SKINS[appearance.skin]!,
    hair: HAIR[appearance.hair]!,
    eye: PALETTE.ink,
    top: CLOTH[appearance.topColour]!,
    bottom: CLOTH[appearance.bottomColour]!,
    shoes: CLOTH[appearance.feetColour]!,
    pack: CLOTH[appearance.packColour]!,
  };
}

/**
 * A traveller at random, and a plausible one: the skin from the crowd's
 * eight, the hair natural four times in five, and the clothes from anywhere.
 */
export function randomAppearance(rng: Rng): Appearance {
  const body: BodyKind = rng.chance(0.5) ? 'man' : 'woman';
  const own = WARDROBE[body];
  return {
    body,
    skin: rng.int(SKINS.length),
    head: rng.int(own.head.length),
    hair: rng.chance(0.8) ? rng.int(7) : rng.int(HAIR.length),
    top: rng.int(own.top.length),
    topColour: rng.int(CLOTH.length),
    bottom: rng.int(own.bottom.length),
    bottomColour: rng.int(CLOTH.length),
    feet: rng.int(own.feet.length),
    feetColour: rng.int(CLOTH.length),
    pack: rng.chance(0.5),
    packColour: rng.int(CLOTH.length),
  };
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/** The version letter; a code that does not start with it is not this format. */
const VERSION = 'a';
/** The fields after it, one base-36 digit each, in the order they are written. */
const FIELDS = ['body', 'skin', 'head', 'hair', 'top', 'topColour', 'bottom', 'bottomColour', 'feet', 'feetColour', 'pack', 'packColour'] as const;
/** The longest code this reads: room for fields a newer build appends, which it ignores. */
export const LOOK_MAX = 24;

/** Thirteen lower-case characters. */
export function encodeAppearance(appearance: Appearance): string {
  const fitted = fitAppearance(appearance);
  return (
    VERSION +
    FIELDS.map((field) => {
      const value = field === 'body' ? (fitted.body === 'woman' ? 1 : 0) : field === 'pack' ? (fitted.pack ? 1 : 0) : fitted[field];
      return value.toString(36);
    }).join('')
  );
}

/**
 * The appearance a code describes, fitted to this build's tables, or `null`
 * for anything that is not a code of this format: the wrong type, a stranger
 * character, too short or too long.
 */
export function decodeAppearance(code: unknown): Appearance | null {
  if (typeof code !== 'string' || code.length > LOOK_MAX || code.length < FIELDS.length + 1) return null;
  if (!/^[0-9a-z]+$/.test(code) || code[0] !== VERSION) return null;
  const digit = (i: number): number => parseInt(code[i + 1]!, 36);
  const value = (field: (typeof FIELDS)[number]): number => digit(FIELDS.indexOf(field));
  return fitAppearance({
    body: value('body') === 1 ? 'woman' : 'man',
    skin: value('skin'),
    head: value('head'),
    hair: value('hair'),
    top: value('top'),
    topColour: value('topColour'),
    bottom: value('bottom'),
    bottomColour: value('bottomColour'),
    feet: value('feet'),
    feetColour: value('feetColour'),
    pack: value('pack') === 1,
    packColour: value('packColour'),
  });
}

// ---------------------------------------------------------------------------
// This device
// ---------------------------------------------------------------------------

const STORED = 'atlas.traveller.v1';

/** The appearance kept on this device, or the default. Never throws. */
export function storedAppearance(): Appearance {
  try {
    const code = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORED);
    return decodeAppearance(code) ?? { ...DEFAULT_APPEARANCE };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

/** Keeps it for the next visit; private mode keeps it for this one. */
export function storeAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(STORED, encodeAppearance(appearance));
  } catch {
    // Storage refused: the appearance lasts this visit.
  }
}

