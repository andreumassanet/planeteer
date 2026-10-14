/**
 * The flag specs, one table by country code. `flags.ts` explains the coordinate
 * system and paints them; the specs themselves are split by region under
 * `flag-data/`.
 *
 * Flags use their true colours, not the palette's: a flag is a quotation of a
 * real object, and a red that is not Spain's red reads as a mistake. What ties
 * them to the rest of the drawing is the shared ink frame `flags.ts` puts
 * around every one.
 *
 * Where a flag carries a coat of arms it is reduced to a mark, and where a flag
 * is a picture the vocabulary cannot honestly reach it is left out and falls
 * through to the plate in `flags.ts`.
 */
import type { FlagSpec } from './flags.ts';
import { AFRICA } from './flag-data/africa.ts';
import { AMERICAS } from './flag-data/americas.ts';
import { ASIA } from './flag-data/asia.ts';
import { EUROPE } from './flag-data/europe.ts';
import { ANTARCTIC, OCEANIA } from './flag-data/oceania.ts';

export const FLAGS: Record<string, FlagSpec> = {
  ...EUROPE,
  ...ASIA,
  ...AFRICA,
  ...AMERICAS,
  ...OCEANIA,
  ...ANTARCTIC,
};

/**
 * Territories that officially fly someone else's flag. Drawing a local
 * unofficial flag instead would be a nicer picture and a worse fact.
 */
export const FLAG_ALIAS: Record<string, string> = {
  MAF: 'FRA', // Saint-Martin: the collectivity flies the French tricolour.
  SPM: 'FRA', // Saint Pierre and Miquelon: likewise.
  WLF: 'FRA', // Wallis and Futuna: likewise.
  HMD: 'AUS', // Heard and McDonald: an external territory of Australia.
  // Christmas Island and the Cocos, which Natural Earth draws as one feature,
  // the Indian Ocean Territories. Two external territories of Australia; the
  // islands' own flags are unofficial. Not the British Indian Ocean Territory,
  // which is `IOT` below and is too small for the outlines to draw.
  IOA: 'AUS',
  WSB: 'GBR', // Akrotiri: a Sovereign Base Area, which flies the Union flag.
  ESB: 'GBR', // Dhekelia: likewise.
  USG: 'USA', // Guantanamo Bay: a US naval base on land leased from Cuba.
  KAB: 'KAZ', // Baikonur: Kazakh ground under a Russian lease.
};

/**
 * Admin-0 features that are nobody's to fly a flag over, drawn as the plate on
 * purpose: an alias would be a claim this project is in no position to make,
 * and a spec would be a flag that does not exist.
 *
 * - `CNM`, the UN buffer zone across Cyprus.
 * - `BRT`, Bir Tawil: land claimed by nobody.
 * - `KAS`, the Siachen Glacier: held by India, claimed by Pakistan.
 * - `SPI`, the Southern Patagonian Ice Field: no agreed line between Chile and Argentina.
 *
 * `pnpm check` asserts every country has a spec, an alias or a place here.
 */
export const NO_FLAG = new Set(['CNM', 'BRT', 'KAS', 'SPI']);

