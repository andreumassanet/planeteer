/** How many people a town has, how tall they stand and what they wear. */

import { rngFrom } from '../../scenery/random.ts';
import type { Civilisation } from '../contract.ts';
import { AVATAR_HEIGHT } from '../../stature.ts';
import type { Coat } from '../kit.ts';

/** At most this many in one town. */
export const CROWD_CAP = 14;

/**
 * How tall a world's people stand, against the traveller: a species' own
 * height (`Morph.height`) kept within `STATURE` of a person's, or a town's
 * crowd is a herd of giants walking through each other.
 */
const STATURE: readonly [number, number] = [0.82, 1.08];
export const statureOf = (height: number): number => Math.min(AVATAR_HEIGHT * STATURE[1], Math.max(AVATAR_HEIGHT * STATURE[0], height));
/** A blob stands this share of its species' height, a flyer this; and nobody is wider than `WIDEST`. */
export const BLOB_SHARE = 0.55;
export const FLYER_SHARE = 0.85;
export const WIDEST = AVATAR_HEIGHT * 1.15;

/** How many people walk a town: by its size, not its census, and never a crowd. */
export function crowdOf(civ: Civilisation, population: number): number {
  return Math.max(2, Math.min(CROWD_CAP, Math.round((civ.crowd * Math.sqrt(Math.max(1, population))) / 45)));
}

/** One member's coat, drawn from the species' hides, trims and accents. */
export function coatOf(civ: Civilisation, key: string): Coat {
  const rng = rngFrom('worlds', 'coat', civ.species.id, key);
  return { hide: rng.pick(civ.species.hides), trim: rng.pick(civ.species.trims), accent: rng.pick(civ.species.accents) };
}
