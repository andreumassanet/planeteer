/**
 * How the guild's people are dressed: one look a role, in the guild's crimson
 * and gold, so a newcomer can tell the six apart from across the square and
 * from the townsfolk round them. The body, the skin and the hair are each
 * person's own, drawn from their key; the clothes are the role's.
 */
import { CLOTH, DEFAULT_APPEARANCE, HAIR, SKINS, WARDROBE, fitAppearance } from '../appearance.ts';
import type { Appearance, Slot } from '../appearance.ts';
import type { BodyKind } from '../cast.ts';
import { rngFrom } from '../scenery/random.ts';
import { PALETTE } from '../theme.ts';
import type { GuildRole } from './roles.ts';

interface Uniform {
  /** Labels of the wardrobe's parts, a man's and a woman's, by slot. */
  man: Partial<Record<Slot, string>>;
  woman: Partial<Record<Slot, string>>;
  top: number;
  bottom: number;
  feet: number;
  pack: number | null;
}

const UNIFORMS: Readonly<Record<GuildRole, Uniform>> = {
  guide: {
    man: { top: 'Field shirt', bottom: 'Cargo trousers', feet: 'Boots' },
    woman: { top: 'Field tunic', bottom: 'Shorts', feet: 'Tall boots' },
    top: PALETTE.crimson,
    bottom: PALETTE.sand,
    feet: PALETTE.brown,
    pack: PALETTE.gold,
  },
  dispatcher: {
    man: { top: 'Hi-vis vest', bottom: 'Work trousers', feet: 'Work boots' },
    woman: { top: 'Hi-vis vest', bottom: 'Work trousers', feet: 'Work shoes' },
    top: PALETTE.orange,
    bottom: PALETTE.slate,
    feet: PALETTE.bark,
    pack: null,
  },
  marshal: {
    man: { top: 'Waistcoat', bottom: 'Jeans', feet: 'High-tops' },
    woman: { top: 'Crop top', bottom: 'Slim trousers', feet: 'Trainers' },
    top: PALETTE.crimson,
    bottom: PALETTE.white,
    feet: PALETTE.white,
    pack: null,
  },
  outfitter: {
    man: { top: 'Suit jacket', bottom: 'Suit trousers', feet: 'Dress shoes' },
    woman: { top: 'Halter top', bottom: 'Skirt', feet: 'Flats' },
    top: PALETTE.violet,
    bottom: PALETTE.gold,
    feet: PALETTE.bark,
    pack: null,
  },
  archivist: {
    man: { top: 'Suit jacket', bottom: 'Suit trousers', feet: 'Dress shoes' },
    woman: { top: 'Blazer', bottom: 'Suit trousers', feet: 'Loafers' },
    top: PALETTE.slate,
    bottom: PALETTE.bark,
    feet: PALETTE.brown,
    pack: null,
  },
  cartographer: {
    man: { top: 'Shirt and bib', bottom: 'Cargo trousers', feet: 'Boots' },
    woman: { top: 'Bodice', bottom: 'Baggy trousers', feet: 'Riding boots' },
    top: PALETTE.olive,
    bottom: PALETTE.tan,
    feet: PALETTE.brown,
    pack: PALETTE.clay,
  },
};

/** The heads a role's person may have: none with a hat or a hood of its own. */
const BARE_HEADS: Readonly<Record<BodyKind, readonly string[]>> = {
  man: ['Swept', 'Side parting', 'Tousled, stubble', 'Spiky', 'Long, bearded'],
  woman: ['Long', 'Cropped', 'Braided'],
};

function indexOf(body: BodyKind, slot: Slot, label: string | undefined): number {
  if (label === undefined) return 0;
  const at = WARDROBE[body][slot].findIndex((choice) => choice.label === label);
  return at < 0 ? 0 : at;
}

function cloth(color: number): number {
  const at = CLOTH.indexOf(color);
  return at < 0 ? 0 : at;
}

/** The look of the guild's `role` whose key is `key`: the same every time for the same key. */
export function uniformOf(role: GuildRole, key: string): Appearance {
  const rng = rngFrom('guild', key);
  const body: BodyKind = rng.chance(0.5) ? 'woman' : 'man';
  const uniform = UNIFORMS[role];
  const parts = uniform[body];
  const heads = BARE_HEADS[body];
  const head = indexOf(body, 'head', heads[rng.int(heads.length)]);
  return fitAppearance({
    ...DEFAULT_APPEARANCE,
    body,
    skin: rng.int(SKINS.length),
    head,
    hair: rng.int(Math.min(7, HAIR.length)),
    top: indexOf(body, 'top', parts.top),
    topColour: cloth(uniform.top),
    bottom: indexOf(body, 'bottom', parts.bottom),
    bottomColour: cloth(uniform.bottom),
    feet: indexOf(body, 'feet', parts.feet),
    feetColour: cloth(uniform.feet),
    pack: uniform.pack !== null,
    packColour: cloth(uniform.pack ?? PALETTE.gold),
  });
}
