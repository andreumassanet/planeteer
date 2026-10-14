/** Layout, colour and timing constants for the passport book. */
import { PALETTE } from '../theme.ts';
import type { IconName } from '../ui.ts';
import type { Continent, StampMode } from '../passport.ts';

/** Countries a page: `COLUMNS` across and six down. */
export const COLUMNS = 5;
export const PER_PAGE = COLUMNS * 6;
/** The ink each continent's visa is printed in and its bookmark dyed. */
export const CONTINENT_INK: Record<Continent, number> = {
  Europe: PALETTE.skyBlue,
  Asia: PALETTE.crimson,
  Africa: PALETTE.orange,
  'North America': PALETTE.green,
  'South America': PALETTE.gold,
  Oceania: PALETTE.violet,
  Antarctica: PALETTE.slate,
};
/** How a stamp was earned, as the tooltip words it. */
export const MODE_TEXT: Record<StampMode, string> = {
  foot: 'on foot',
  swim: 'swimming ashore',
  car: 'by car',
  boat: 'by boat',
  plane: 'by plane',
  balloon: 'by balloon',
  passenger: 'as a passenger',
  bicycle: 'by bicycle',
  motorbike: 'by motorbike',
  horse: 'on horseback',
  jetski: 'by jet ski',
  sailboat: 'under sail',
  helicopter: 'by helicopter',
  submarine: 'by submarine',
};
/** How long a dropped stamp stays, and when in its fall it lands, ms. */
export const DROP_HOLD = 2600;
export const DROP_HIT = 330;

/**
 * The open book as designed, in CSS pixels: two pages of 420 by 560 inside a
 * cover `COVER_PAD` wider all round, under a band of `TAB_ROOM` the bookmarks
 * stand up into, over a line of `HINT_ROOM` that names the keys.
 */
export const BOOK_W = 840;
export const BOOK_H = 560;
export const COVER_PAD = 10;
export const TAB_ROOM = 40;
export const HINT_ROOM = 30;
export const SHEET_W = BOOK_W + 2 * COVER_PAD;
/** Room on the right for the planet tabs, used only when the book has other worlds' chapters. */
export const SIDE_ROOM = 30;
/** Diameter of a planet's disc on its tab. */
export const DISC = 28;
export const SHEET_H = TAB_ROOM + BOOK_H + 2 * COVER_PAD + HINT_ROOM;
/** The share of the window the sheet may take, and the largest scale-up. */
export const FIT_HEIGHT = 0.95;
export const FIT_WIDTH = 0.96;
export const MAX_SCALE = 3;
/** Duration of a page turn, ms. */
export const TURN_MS = 620;

export const MODE_ICON: Record<StampMode, IconName> = {
  foot: 'walk',
  swim: 'swim',
  car: 'car',
  boat: 'boat',
  plane: 'plane',
  balloon: 'balloon',
  passenger: 'seat',
  bicycle: 'bike',
  motorbike: 'moto',
  horse: 'horse',
  jetski: 'jetski',
  sailboat: 'boat',
  helicopter: 'heli',
  submarine: 'sub',
};

/** A colour mixed `towardsInk` of the way to the pen colour, for print on paper. */
export function inked(colour: number, towardsInk = 0.25): string {
  const ink = PALETTE.ink;
  const mix = (shift: number): number =>
    Math.round(((colour >> shift) & 255) * (1 - towardsInk) + ((ink >> shift) & 255) * towardsInk);
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

/** The cover's cloth: crimson mixed most of the way to the ink. */
export const LEATHER = inked(PALETTE.crimson, 0.45);
export const LEATHER_DEEP = inked(PALETTE.crimson, 0.62);

/** Paper grain: tiled noise tinted with a little ink. */
export const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E" +
  "%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E" +
  "%3CfeColorMatrix values='0 0 0 0 0.12  0 0 0 0 0.03  0 0 0 0 0.01  0.09 0 0 0 0'/%3E%3C/filter%3E" +
  "%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
/** The cloth's weave: the same noise, stretched and lighter. */
export const WEAVE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='w'%3E" +
  "%3CfeTurbulence type='fractalNoise' baseFrequency='0.9 0.35' numOctaves='3' stitchTiles='stitch'/%3E" +
  "%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 0.9  0 0 0 0 0.85  0.14 0 0 0 0'/%3E%3C/filter%3E" +
  "%3Crect width='100%25' height='100%25' filter='url(%23w)'/%3E%3C/svg%3E\")";
/** Guilloche: two crossing waves, the ground a banknote or passport is printed on. */
export const GUILLOCHE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='28'%3E" +
  "%3Cpath d='M0 14 C16 0 16 0 32 14 S48 28 64 14 M0 14 C16 28 16 28 32 14 S48 0 64 14' fill='none' stroke='%23c30e3a' stroke-opacity='0.09' stroke-width='1'/%3E" +
  "%3Cpath d='M0 4 C16 -10 16 18 32 4 S48 18 64 4 M0 24 C16 38 16 10 32 24 S48 10 64 24' fill='none' stroke='%233dbbe7' stroke-opacity='0.08' stroke-width='1'/%3E" +
  "%3C/svg%3E\")";

/** The underside of a folded page corner: the paper a shade darker. */
export const PAPER_BACK = '#f1dccb';
