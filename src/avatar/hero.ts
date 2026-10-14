import { DEFAULT_APPEARANCE, WARDROBE_OUTFITS, fitAppearance, outfitsOf, storeAppearance, storedAppearance, type Appearance } from '../appearance.ts';
import { castMaterial, loadCast, type Cast } from '../cast.ts';
import { createContext } from '../monuments/contract.ts';

export const ctx = createContext();
export const palette = ctx.palette;

export let heroCast: Cast | null = null;
/** The traveller as chosen, which every hero `buildAvatar` makes without one wears. */
export let chosen: Appearance = storedAppearance();
/** Every hero built without an appearance of its own, to be dressed when it changes. */
export const heroes = new Set<(appearance: Appearance) => Promise<void>>();

/**
 * Loads the chosen outfits and the clips (and the default's, which a hero
 * wears while a choice it has not loaded yet arrives). `buildAvatar` is
 * synchronous and throws without this, which is deliberate: a player built
 * before its body has arrived would be an invisible player, and that is a
 * worse failure than a stack trace.
 */
export async function prepareAvatar(): Promise<void> {
  if (heroCast !== null) return;
  const source = ctx.toon(palette.ink);
  const ink = source.userData.outlineParameters as { thickness: number; color: [number, number, number] };
  const outfits = [...new Set([...outfitsOf(chosen), ...outfitsOf(DEFAULT_APPEARANCE)])];
  heroCast = await loadCast(castMaterial(source.gradientMap!, ink), outfits);
}

/**
 * The hero's cast with every outfit either body can wear loaded: what the
 * traveller's card dresses its preview from, so a choice made there is a
 * template the hero already has.
 */
export async function wardrobeCast(): Promise<Cast> {
  await prepareAvatar();
  await heroCast!.ensure(WARDROBE_OUTFITS);
  return heroCast!;
}

/** The traveller as chosen: what a new hero wears, and what the card opens on. */
export function heroAppearance(): Appearance {
  return { ...chosen };
}

/**
 * Dresses every hero on the page as `appearance` and keeps it on this device.
 * Resolves once they are dressed, which is at once when its outfits are loaded.
 */
export function dressHero(appearance: Appearance): Promise<void> {
  chosen = fitAppearance(appearance);
  storeAppearance(chosen);
  return Promise.all([...heroes].map((wear) => wear(chosen))).then(() => undefined);
}
