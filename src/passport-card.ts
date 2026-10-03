/**
 * The passport, as a little book you hold: it opens already open, on spreads
 * of two pages that turn — the holder's page with a portrait, and a visa for
 * every continent: every one of its countries in a grid, the ones you have
 * come down in stamped in their own ink and the rest an empty grey outline,
 * so the book says what is missing as plainly as what is there. Under the
 * pointer a stamp says the country, its capital and when and how it was
 * stamped.
 *
 * It is the settings card's kind of object: a modal over the world, holding
 * the keyboard (`registerModal`) and the mouse while it is up, and owning
 * nothing — the book is `passport.ts`'s, which continent a country's page is
 * on is `continentOf` there, and the portrait is the traveller's own look
 * (`appearance.ts`). `J` opens and closes it (`controls.ts`), as does its
 * button on the HUD's bar; `Esc` closes it too.
 *
 * **A book, not a panel, and nothing but the book.** It opens on the spread
 * of the continent you are standing in — else the newest stamp's — inside
 * its leather cover, as large as the window allows. Every control is part of
 * the book: a bookmark a continent sticks out of its top edge, in that
 * continent's ink with its count, and opens it at its visa; the bottom
 * corner of each page lifts under the pointer, and is the only thing on a
 * page that turns it (a click anywhere else on the paper does nothing, so
 * nothing turns by accident). The arrows turn it too, and `Home` and `End` go
 * to the holder's page and the newest stamp. A leaf swings over the spine in
 * 3D with the next page on its back (`turn`), one leaf even for a jump to a
 * far bookmark. The pages are paper — a warm ground, a grain and a guilloche
 * of the kind a real passport is printed with, all CSS and inline SVG — and
 * the book is designed at one size (`SHEET_W` by `SHEET_H`) and scaled to the
 * window, so a page never reflows and the browser draws it crisp at any
 * scale. With less motion asked for, a leaf turns at once.
 *
 * **A stamp is drawn, not painted**: an SVG in one ink, the country's own
 * colour off its flag (`flagColor`, the one the map layer fills it with),
 * with a thin band of the flag's colours as the one thing in a second ink.
 * Its shape — round, a box or an oval — and its tilt come from a hash of the
 * country's code, so Spain's stamp is Spain's in every book. On its page it
 * is small and says the country's code and the day; the one that drops when
 * it is new (`stampSvg`) is large and says the country, the in-game day of
 * the first visit, the town you came in by and a mark for how you came.
 *
 * **And a new one lands**: `celebrate` drops the stamp onto the screen, big
 * and turning, with a thump when it hits (`onThud`, which the caller makes a
 * sound), holds it a moment and lets it go.
 *
 * **One book, a chapter a world.** Earth's chapter is the book as it always
 * was: the holder's page and the seven continents' visas. Every other world
 * the caller hands in (`chapters`, a `PassportChapter` each, see `planet.ts`)
 * follows it: a frontispiece with the world's disc facing one visa that lists
 * every one of its nations. A column of planet discs stands out of the
 * cover's right edge, one a chapter, and turns to it; the bookmarks along the
 * top are the current chapter's pages. A nation's stamp is a round seal in its
 * own colour with its banner in the middle (`flags.ts`'s painter for the
 * world's prefix) and, where the chapter brings the species' writing, its
 * name in that writing round the rim. With no chapters handed in the book is
 * Earth's alone and looks exactly as it did.
 */
import { flagColor, flagPalette } from './country-colors.ts';
import { actionOf, holdFocus, inputBlocked, labelOf, registerModal } from './controls.ts';
import { CLOTH, HAIR, SKINS, encodeAppearance } from './appearance.ts';
import type { Appearance } from './appearance.ts';
import { loadCountryFacts } from './country-facts.ts';
import type { CountryFacts } from './country-facts.ts';
import { createFlagCanvas } from './flags.ts';
import { PALETTE } from './theme.ts';
import { ensureStyle, h, hex, icon, installUi } from './ui.ts';
import type { IconName } from './ui.ts';
import { CONTINENTS, byContinent, continentOf, stampDateText, worldOf } from './passport.ts';
import type { Continent, Passport, Stamp, StampMode } from './passport.ts';
import type { PassportChapter } from './planet.ts';

export interface PassportCardOptions {
  passport: Passport;
  /** Every country on the planet, for the continents' pages. */
  countries: readonly { iso: string; name: string; continent: string }[];
  /** Who holds the book: the name the others see, and the look they see it on. */
  holder?(): { name: string; appearance: Appearance };
  /** The country the holder is standing in, by code, or `''`: the book opens at its visa. */
  here?(): string;
  /** Where to hand the pointer back to, if it was locked when the card opened. */
  lockTarget?: HTMLElement | null;
  onOpen?(): void;
  onClose?(): void;
  /** A leaf has been turned: `leaves` is how many it stood for (a bookmark can skip several). */
  onTurn?(leaves: number): void;
  /** A new stamp has just hit the page. */
  onThud?(): void;
  /**
   * The other worlds' chapters, in the order the book takes them after
   * Earth's: an array, or a function asked on the first opening (or the first
   * stamp) that may answer later — Earth hands a dynamic import here, so the
   * worlds' data stays out of its first load.
   */
  chapters?: readonly PassportChapter[] | (() => readonly PassportChapter[] | Promise<readonly PassportChapter[]>);
}

export interface PassportCard {
  /** The card and the stamp that drops: add it to the page once. */
  root: HTMLElement;
  readonly open: boolean;
  show(options?: { relock?: boolean }): void;
  hide(): void;
  toggle(): void;
  /** Drops a new stamp onto the screen. */
  celebrate(stamp: Stamp): void;
  /** Closes it, takes it off the page and lets go of its keys. */
  dispose(): void;
}

/** Countries a page: `COLUMNS` across and six down, which holds the largest continent in a spread. */
const COLUMNS = 5;
const PER_PAGE = COLUMNS * 6;
/** The ink each continent's visa is printed in, and its bookmark is dyed. */
const CONTINENT_INK: Record<Continent, number> = {
  Europe: PALETTE.skyBlue,
  Asia: PALETTE.crimson,
  Africa: PALETTE.orange,
  'North America': PALETTE.green,
  'South America': PALETTE.gold,
  Oceania: PALETTE.violet,
  Antarctica: PALETTE.slate,
};
/** How a stamp was come by, as the tip says it. */
const MODE_TEXT: Record<StampMode, string> = {
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
/** How long a dropped stamp stays, in milliseconds, and when in its fall it hits. */
const DROP_HOLD = 2600;
const DROP_HIT = 330;

/**
 * The book as designed, open, in CSS pixels: two pages of 420 by 560, inside
 * a cover `COVER_PAD` wider all round, under a band of `TAB_ROOM` the
 * bookmarks stand up into, over a line of `HINT_ROOM` that says the keys.
 */
const BOOK_W = 840;
const BOOK_H = 560;
const COVER_PAD = 10;
const TAB_ROOM = 40;
const HINT_ROOM = 30;
const SHEET_W = BOOK_W + 2 * COVER_PAD;
/**
 * The room the planets stand out into on the right, once the book has
 * chapters for other worlds; a book of Earth alone is `SHEET_W` wide, as it
 * always was.
 */
const SIDE_ROOM = 30;
/** A planet's disc on its tab. */
const DISC = 28;
const SHEET_H = TAB_ROOM + BOOK_H + 2 * COVER_PAD + HINT_ROOM;
/** How much of the window the sheet may take, and the most it is ever scaled up. */
const FIT_HEIGHT = 0.95;
const FIT_WIDTH = 0.96;
const MAX_SCALE = 3;
/** How long a leaf takes to cross the spine. */
const TURN_MS = 620;

const MODE_ICON: Record<StampMode, IconName> = {
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

/** A colour a quarter of the way to the pen, for print on paper. */
function inked(colour: number, towardsInk = 0.25): string {
  const ink = PALETTE.ink;
  const mix = (shift: number): number =>
    Math.round(((colour >> shift) & 255) * (1 - towardsInk) + ((ink >> shift) & 255) * towardsInk);
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

/** The cover's cloth: the crimson taken most of the way to the ink. */
const LEATHER = inked(PALETTE.crimson, 0.45);
const LEATHER_DEEP = inked(PALETTE.crimson, 0.62);

/** A grain for paper: noise whose only colour is a little of the ink, tiled. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E" +
  "%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E" +
  "%3CfeColorMatrix values='0 0 0 0 0.12  0 0 0 0 0.03  0 0 0 0 0.01  0.09 0 0 0 0'/%3E%3C/filter%3E" +
  "%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
/** The cloth's weave: the same noise, stretched, lighter. */
const WEAVE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='w'%3E" +
  "%3CfeTurbulence type='fractalNoise' baseFrequency='0.9 0.35' numOctaves='3' stitchTiles='stitch'/%3E" +
  "%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 0.9  0 0 0 0 0.85  0.14 0 0 0 0'/%3E%3C/filter%3E" +
  "%3Crect width='100%25' height='100%25' filter='url(%23w)'/%3E%3C/svg%3E\")";
/** A guilloche: two crossing waves, as a banknote's or a passport's ground is printed. */
const GUILLOCHE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='28'%3E" +
  "%3Cpath d='M0 14 C16 0 16 0 32 14 S48 28 64 14 M0 14 C16 28 16 28 32 14 S48 0 64 14' fill='none' stroke='%23c30e3a' stroke-opacity='0.09' stroke-width='1'/%3E" +
  "%3Cpath d='M0 4 C16 -10 16 18 32 4 S48 18 64 4 M0 24 C16 38 16 10 32 24 S48 10 64 24' fill='none' stroke='%233dbbe7' stroke-opacity='0.08' stroke-width='1'/%3E" +
  "%3C/svg%3E\")";

/** The underside of a page, where a corner is folded back: the paper a shade darker. */
const PAPER_BACK = '#f1dccb';

const STYLE = `
.atlas-passport {
  position: fixed;
  inset: 0;
  z-index: 12;
  display: grid;
  place-items: center;
  background: rgba(30, 6, 3, 0.58);
  backdrop-filter: blur(4px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0s 0.2s;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  user-select: none;
  -webkit-user-select: none;
}
.atlas-passport.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.p-panel { outline: none; }
.atlas-passport.on .p-panel { animation: ui-pop 0.36s var(--ui-spring) both; }
.p-fit { position: relative; }
.p-scaler { position: absolute; left: 0; top: 0; width: ${SHEET_W}px; height: ${SHEET_H}px; transform-origin: 0 0; }

/* --- the cover, and the bookmarks standing out of it ----------------------- */
.p-cover-back {
  position: absolute;
  left: 0;
  top: ${TAB_ROOM}px;
  width: ${SHEET_W}px;
  height: ${BOOK_H + 2 * COVER_PAD}px;
  box-sizing: border-box;
  border: 3px solid var(--ui-ink);
  border-radius: 18px;
  background-color: ${LEATHER};
  background-image: ${WEAVE}, linear-gradient(90deg, transparent 47%, ${LEATHER_DEEP} 50%, transparent 53%);
  box-shadow: 0 8px 0 rgba(30, 6, 3, 0.45);
  z-index: 0;
}
.p-ribbons {
  position: absolute;
  left: ${COVER_PAD + 18}px;
  right: ${COVER_PAD + 18}px;
  top: 0;
  height: ${TAB_ROOM + COVER_PAD + 18}px;
  display: flex;
  gap: 6px;
  z-index: 1;
}
.p-tab {
  position: relative;
  top: 9px;
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 6px 6px 0;
  border: 2.5px solid var(--ui-ink);
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  background: var(--tab, ${LEATHER});
  background-image: ${GRAIN};
  color: ${hex(PALETTE.white)};
  font-family: var(--ui-font);
  text-align: center;
  cursor: pointer;
  filter: saturate(0.75) brightness(0.88);
  transition: top 0.2s var(--ui-spring), filter 0.15s ease;
}
.p-tab:hover { top: 3px; filter: none; }
.p-tab[aria-current='true'] { top: 0; filter: none; }
.p-tab:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.p-tab b {
  display: block;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.01em;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 0 rgba(30, 6, 3, 0.4);
}
.p-tab em { display: block; font-style: normal; font-size: 9.5px; font-weight: 800; opacity: 0.85; font-variant-numeric: tabular-nums; }
.p-tab.holder { color: var(--ui-gold); background-color: ${LEATHER}; }
/* A world's chapter has one or two bookmarks; they keep a bookmark's width. */
.p-tab { max-width: 150px; }

/* --- the planets down the right edge, a chapter each ------------------------- */
.p-worlds {
  position: absolute;
  left: ${SHEET_W - 18}px;
  top: ${TAB_ROOM + COVER_PAD + 22}px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  z-index: 1;
}
.p-worlds[hidden] { display: none; }
.p-world {
  position: relative;
  left: 0;
  width: ${DISC + 16}px;
  height: ${DISC + 10}px;
  box-sizing: border-box;
  padding: 3px 3px 3px 10px;
  border: 2.5px solid var(--ui-ink);
  border-left: 0;
  border-radius: 0 999px 999px 0;
  background-color: ${LEATHER};
  background-image: ${GRAIN};
  cursor: pointer;
  filter: saturate(0.75) brightness(0.88);
  transition: left 0.2s var(--ui-spring), filter 0.15s ease;
}
.p-world:hover { left: 4px; filter: none; }
.p-world[aria-current='true'] { left: 8px; filter: none; }
.p-world:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.p-world svg { display: block; width: ${DISC}px; height: ${DISC}px; overflow: visible; }

/* --- a world's frontispiece -------------------------------------------------- */
.p-front { display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 30px; text-align: center; }
.p-globe { width: 150px; height: 150px; margin-bottom: 10px; }
.p-globe svg { display: block; width: 100%; height: 100%; overflow: visible; }
.p-front small { font-size: 10px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.55; }
.p-front b { font-size: 34px; font-weight: 800; letter-spacing: 0.01em; line-height: 1; }
.p-script { height: 26px; opacity: 0.8; }
.p-script svg { display: block; height: 100%; width: auto; max-width: 300px; }
.p-front p { margin: 6px 0 0; max-width: 290px; font-size: 12.5px; font-weight: 600; line-height: 1.5; opacity: 0.75; }
.p-front .p-bar { width: 240px; }
.p-tab.holder svg { width: 14px; height: 14px; vertical-align: -2px; margin-right: 3px; }
.p-hint {
  position: absolute;
  left: 0;
  width: ${SHEET_W}px;
  bottom: 0;
  height: ${HINT_ROOM}px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--ui-paper);
  opacity: 0.55;
}

/* --- the book ------------------------------------------------------------------ */
.p-book {
  position: absolute;
  left: ${COVER_PAD}px;
  top: ${TAB_ROOM + COVER_PAD}px;
  width: ${BOOK_W}px;
  height: ${BOOK_H}px;
  perspective: 2400px;
  z-index: 2;
}
.p-side, .p-leaf { position: absolute; top: 0; width: 50%; height: 100%; }
.p-side.left, .p-leaf.back { left: 0; }
.p-side.right, .p-leaf.forward { left: 50%; }
.p-leaf { transform-style: preserve-3d; z-index: 3; pointer-events: none; }
.p-leaf.forward { transform-origin: left center; }
.p-leaf.back { transform-origin: right center; }
.p-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.p-face.under { transform: rotateY(180deg); }
.p-shade { position: absolute; inset: 0; pointer-events: none; opacity: 0; border-radius: inherit; }
.p-leaf.forward .p-face:not(.under) .p-shade, .p-leaf.back .p-face.under .p-shade { background: linear-gradient(90deg, rgba(30, 6, 3, 0.5), rgba(30, 6, 3, 0.05)); }
.p-leaf.forward .p-face.under .p-shade, .p-leaf.back .p-face:not(.under) .p-shade { background: linear-gradient(270deg, rgba(30, 6, 3, 0.5), rgba(30, 6, 3, 0.05)); }

/* --- the corners that turn it -------------------------------------------------- */
.p-corner {
  position: absolute;
  bottom: 0;
  width: 84px;
  height: 84px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  z-index: 4;
  transform: scale(0.46);
  transition: transform 0.24s var(--ui-spring);
  -webkit-tap-highlight-color: transparent;
}
.p-corner.next { right: 0; transform-origin: 100% 100%; }
.p-corner.prev { left: 0; transform-origin: 0 100%; }
.p-corner[hidden] { display: none; }
.p-corner:hover, .p-corner:focus-visible { transform: scale(0.86); }
.p-corner:focus-visible { outline: none; }
.p-corner:focus-visible .p-flap { stroke: var(--ui-violet); }
.p-corner svg { display: block; width: 100%; height: 100%; overflow: visible; }
.p-corner.prev svg { transform: scaleX(-1); }
.p-flap { filter: drop-shadow(-2px -2px 2px rgba(30, 6, 3, 0.28)); }
.p-arrow { opacity: 0; transition: opacity 0.15s ease; }
.p-corner:hover .p-arrow, .p-corner:focus-visible .p-arrow { opacity: 0.75; }

/* --- paper ------------------------------------------------------------------- */
.p-page {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  padding: 30px 30px 40px;
  overflow: hidden;
  background-color: ${hex(PALETTE.white)};
  background-image: ${GRAIN}, radial-gradient(ellipse at 50% 35%, rgba(255, 250, 244, 0.9), rgba(247, 226, 210, 0.9));
  border: 3px solid var(--ui-ink);
}
.p-side.left .p-page, .p-face .p-page.verso { border-radius: 12px 3px 3px 12px; border-right-width: 1.5px; }
.p-side.right .p-page, .p-face .p-page.recto { border-radius: 3px 12px 12px 3px; border-left-width: 1.5px; }
/* The gutter: each page darkens into the spine. */
.p-page::after { content: ''; position: absolute; top: 0; bottom: 0; width: 46px; pointer-events: none; }
.p-page.verso::after { right: 0; background: linear-gradient(270deg, rgba(30, 6, 3, 0.16), transparent); }
.p-page.recto::after { left: 0; background: linear-gradient(90deg, rgba(30, 6, 3, 0.16), transparent); }
.p-page.guilloche { background-image: ${GRAIN}, ${GUILLOCHE}, radial-gradient(ellipse at 50% 35%, rgba(255, 250, 244, 0.9), rgba(247, 226, 210, 0.9)); }
.p-side.blank { visibility: hidden; }
.p-folio { position: absolute; bottom: 12px; left: 0; right: 0; text-align: center; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; opacity: 0.42; }
.p-running { position: absolute; top: 12px; left: 30px; right: 30px; display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.35; }

/* --- the inside of the cover ----------------------------------------------------- */
.p-page.endpaper {
  background-color: ${LEATHER};
  background-image: ${WEAVE}, repeating-linear-gradient(45deg, rgba(228, 169, 12, 0.1) 0 2px, transparent 2px 14px), repeating-linear-gradient(-45deg, rgba(228, 169, 12, 0.1) 0 2px, transparent 2px 14px);
  display: grid;
  place-items: center;
}
.p-page.endpaper::after { display: none; }
.p-label {
  width: 78%;
  padding: 18px 20px;
  background-color: ${hex(PALETTE.white)};
  background-image: ${GRAIN};
  border: 2.5px solid var(--ui-ink);
  border-radius: 10px;
  box-shadow: 0 4px 0 rgba(30, 6, 3, 0.4);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.5;
}
.p-label b { display: block; margin-bottom: 8px; font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: ${inked(PALETTE.crimson)}; }
.p-label p { margin: 0 0 8px; }
.p-label small { display: block; font-size: 11px; opacity: 0.6; }

/* --- the holder ---------------------------------------------------------------- */
.p-id-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.p-id-head b { font-size: 20px; font-weight: 800; letter-spacing: 0.12em; color: ${inked(PALETTE.crimson)}; }
.p-id-head span { font-size: 10.5px; font-weight: 800; letter-spacing: 0.18em; opacity: 0.55; }
.p-id { display: grid; grid-template-columns: 124px 1fr; gap: 16px; }
.p-photo { width: 124px; height: 156px; border: 2.5px solid var(--ui-ink); border-radius: 6px; overflow: hidden; background: ${hex(PALETTE.skyBlue)}; }
.p-photo svg { display: block; width: 100%; height: 100%; }
.p-fields { display: grid; gap: 7px; align-content: start; }
.p-field small { display: block; font-size: 9.5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.5; }
.p-field span { display: block; font-size: 15px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-field .code { font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 13px; letter-spacing: 0.04em; }
.p-sign { margin-top: 16px; padding-top: 4px; border-top: 1.5px solid rgba(30, 6, 3, 0.35); display: flex; justify-content: space-between; align-items: baseline; }
.p-sign span { font-family: 'Segoe Script', 'Bradley Hand', 'Brush Script MT', cursive; font-size: 24px; color: ${inked(PALETTE.slate, 0.5)}; transform: rotate(-3deg); transform-origin: left; white-space: nowrap; overflow: hidden; max-width: 70%; }
.p-sign small { font-size: 9.5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.5; }
.p-mrz {
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: 34px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 6px;
  font-family: ui-monospace, 'OCR B', 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.11em;
  line-height: 1.45;
  white-space: pre;
  overflow: hidden;
  opacity: 0.8;
}

/* --- a continent's pages ------------------------------------------------------- */
.p-cont-head { display: flex; align-items: center; gap: 12px; margin: 2px 0 6px; }
.p-cont-head svg { flex: none; width: 40px; height: 40px; }
.p-cont-head > div { flex: 1; min-width: 0; }
.p-cont-head small { display: block; font-size: 10px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.55; }
.p-cont-head b { display: block; font-size: 21px; font-weight: 800; letter-spacing: 0.01em; line-height: 1.05; }
.p-cont-count { flex: none; font-size: 21px; font-weight: 800; font-variant-numeric: tabular-nums; }
.p-cont-count small { display: inline; font-size: 12px; letter-spacing: 0; text-transform: none; opacity: 0.5; }
.p-bar { height: 6px; margin-bottom: 10px; border-radius: 3px; background: var(--ui-rule); overflow: hidden; }
.p-bar i { display: block; height: 100%; }
.p-grid { display: grid; grid-template-columns: repeat(${COLUMNS}, 1fr); grid-auto-rows: 66px; gap: 4px 2px; }
.p-cell { display: flex; flex-direction: column; align-items: center; min-width: 0; padding-top: 2px; border-radius: 8px; cursor: help; }
.p-cell:hover { background: rgba(30, 6, 3, 0.06); }
.p-mini { width: 62px; height: 47px; }
.p-mini svg { display: block; width: 100%; height: 100%; overflow: visible; }
.p-cell.got .p-mini { transform: rotate(var(--tilt, 0deg)); mix-blend-mode: multiply; }
.p-cell span { max-width: 100%; padding: 0 2px; box-sizing: border-box; font-size: 9px; font-weight: 800; line-height: 1.25; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-cell.missing span { opacity: 0.4; }

/* --- a stamp, large ------------------------------------------------------------- */
.p-stamp { transform: rotate(var(--tilt, 0deg)); }
.p-stamp svg { display: block; width: 100%; height: 100%; overflow: visible; }

/* --- what a stamp says, under the pointer ---------------------------------------- */
.p-tip {
  position: fixed;
  z-index: 1;
  display: none;
  align-items: center;
  gap: 10px;
  max-width: 300px;
  padding: 8px 13px 8px 9px;
  transform: translate(-50%, calc(-100% - 8px));
  pointer-events: none;
}
.p-tip.on { display: flex; }
.p-tip b { display: block; font-size: 14.5px; font-weight: 800; line-height: 1.15; }
.p-tip small { display: block; margin-top: 1px; font-size: 11.5px; font-weight: 600; opacity: 0.65; }
.p-tip small:empty { display: none; }

/* --- the stamp that drops --------------------------------------------------------- */
.atlas-stamp-drop {
  position: fixed;
  z-index: 11;
  left: 50%;
  top: 38%;
  width: 240px;
  height: 180px;
  margin: -90px 0 0 -120px;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
}
.atlas-stamp-drop.in { visibility: visible; animation: p-drop 0.62s cubic-bezier(0.3, 0, 0.3, 1) both; }
.atlas-stamp-drop.out { visibility: visible; animation: p-lift 0.5s ease both; }
.atlas-stamp-drop .p-stamp { width: 240px; height: 180px; filter: drop-shadow(0 3px 0 rgba(30, 6, 3, 0.25)); }
.atlas-stamp-drop .p-caption {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translate(-50%, 8px);
  white-space: nowrap;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 800;
}
@keyframes p-drop {
  0% { opacity: 0; transform: scale(2.3) rotate(-16deg); }
  53% { opacity: 1; transform: scale(0.94) rotate(0deg); }
  62% { transform: scale(1.05) translateY(-2px); }
  74% { transform: scale(0.99); }
  100% { opacity: 1; transform: none; }
}
@keyframes p-lift { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(26px) scale(0.9); } }
@media (prefers-reduced-motion: reduce) {
  .atlas-passport.on .p-panel { animation: none; }
  .p-tab, .p-corner, .p-world { transition: none; }
  .atlas-stamp-drop.in { animation: ui-fade 0.2s ease both; }
}
`;

/**
 * A page's corner, folded back: the page under it in the triangle past the
 * fold, the flap of this one over it with its underside showing, and an
 * arrow on the flap once the pointer is on it. Drawn for the right-hand
 * corner; the left one is the same, mirrored by its class.
 */
function cornerSvg(id: string): string {
  const ink = hex(PALETTE.ink);
  return (
    `<svg viewBox="0 0 84 84" aria-hidden="true"><defs><linearGradient id="${id}" x1="1" y1="1" x2="0" y2="0">` +
    `<stop offset="0" stop-color="#fffaf4"/><stop offset="1" stop-color="${PAPER_BACK}"/></linearGradient></defs>` +
    `<path d="M84 0V84H0Z" fill="${PAPER_BACK}"/>` +
    `<path d="M84 9V84H9" fill="none" stroke="${ink}" stroke-opacity="0.25" stroke-width="2"/>` +
    `<path d="M84 0V84H0" fill="none" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path class="p-flap" d="M84 0L0 84V0Z" fill="url(#${id})" stroke="${ink}" stroke-width="3.5" stroke-linejoin="round"/>` +
    `<path class="p-arrow" d="M22 17l10 11-10 11" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}

/* --- the stamp ------------------------------------------------------------ */

/** A small, stable hash of a string, 0 to 1. */
function hashOf(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return ((value >>> 0) % 100003) / 100003;
}

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A text's size to fit `width` at about 0.64 of an em a letter, bold capitals; `stretch` when even the floor does not. */
function fit(text: string, width: number, base: number, floor: number): { size: number; stretch: boolean } {
  const size = Math.min(base, width / Math.max(1, text.length * 0.64));
  return size < floor ? { size: floor, stretch: true } : { size, stretch: false };
}

function line(textValue: string, x: number, y: number, width: number, base: number, floor: number, weight = 800): string {
  const { size, stretch } = fit(textValue, width, base, floor);
  const squeeze = stretch ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x}" y="${y}" font-size="${size.toFixed(1)}" font-weight="${weight}" text-anchor="middle"${squeeze}>${escape(textValue)}</text>`;
}

/** The stamp's ink: the country's colour, pulled a quarter of the way to the pen so it reads on paper. */
function inkOf(iso: string): string {
  const rgb = flagColor(iso);
  const ink = [0x1e, 0x06, 0x03];
  const base = rgb ?? [0xc3, 0x0e, 0x3a];
  const mixed = base.map((value, i) => Math.round(value * 0.75 + ink[i]! * 0.25));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

/** The flag's colours as a band of bars, largest first, at most four. */
function flagBand(iso: string, x: number, y: number, width: number, height: number): string {
  const colours = flagPalette(iso).slice(0, 4);
  if (colours.length === 0) return '';
  const total = colours.reduce((sum, colour) => sum + Math.max(0.15, colour.share), 0);
  let at = x;
  const bars = colours.map((colour) => {
    const w = (Math.max(0.15, colour.share) / total) * width;
    const bar = `<rect x="${at.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${height}" fill="${colour.hex}"/>`;
    at += w;
    return bar;
  });
  return `<g opacity="0.85">${bars.join('')}<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-width="0.8"/></g>`;
}

/** How you came, as the UI's own icon, drawn in the stamp's ink. */
function emblem(mode: StampMode, x: number, y: number, size: number): string {
  const inner = typeof document === 'undefined' ? '' : icon(MODE_ICON[mode]).innerHTML;
  const scale = size / 24;
  return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${scale.toFixed(3)})" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
}

let stampSerial = 0;

/**
 * One stamp as SVG markup, 160 by 120, in the ink of its country. The shape
 * and the tilt are the country's own; see the file's note.
 */
export function stampSvg(stamp: Stamp): { svg: string; tilt: number } {
  const uid = `ps${++stampSerial}`;
  const h1 = hashOf(stamp.iso);
  const h2 = hashOf(`${stamp.iso}/tilt`);
  const shape = Math.floor(h1 * 3);
  const tilt = Math.round((h2 - 0.5) * 22);
  const name = stamp.name.toUpperCase();
  const date = stampDateText(stamp.date);
  const town = stamp.town === '' ? '' : stamp.town.toUpperCase();
  const seed = Math.floor(h1 * 1000);
  const parts: string[] = [];
  if (shape === 0) {
    // Round: the name over the top of the ring, the town under it.
    parts.push(
      '<circle cx="80" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="3.6"/>',
      '<circle cx="80" cy="60" r="48" fill="none" stroke="currentColor" stroke-width="1.3"/>',
      `<path id="${uid}t" d="M 43 60 A 37 37 0 0 1 117 60" fill="none"/>`,
      `<path id="${uid}b" d="M 40 60 A 40 40 0 0 0 120 60" fill="none"/>`,
    );
    const top = fit(name, 104, 11, 6.5);
    parts.push(
      `<text font-size="${top.size.toFixed(1)}" font-weight="800" letter-spacing="0.6"><textPath href="#${uid}t" startOffset="50%" text-anchor="middle"${top.stretch ? ' textLength="104" lengthAdjust="spacingAndGlyphs"' : ''}>${escape(name)}</textPath></text>`,
    );
    if (town !== '') {
      const bottom = fit(town, 92, 8.5, 5.5);
      parts.push(
        `<text font-size="${bottom.size.toFixed(1)}" font-weight="700"><textPath href="#${uid}b" startOffset="50%" text-anchor="middle" dominant-baseline="hanging"${bottom.stretch ? ' textLength="92" lengthAdjust="spacingAndGlyphs"' : ''}>${escape(town)}</textPath></text>`,
      );
    }
    parts.push(emblem(stamp.mode, 80, 45, 15), line(date, 80, 70, 64, 11.5, 8), flagBand(stamp.iso, 62, 76, 36, 4));
  } else if (shape === 1) {
    // A box: the name across the top, the date large, the town along the foot.
    parts.push(
      '<rect x="8" y="12" width="144" height="96" rx="9" fill="none" stroke="currentColor" stroke-width="3.6"/>',
      '<rect x="14" y="18" width="132" height="84" rx="5" fill="none" stroke="currentColor" stroke-width="1.3"/>',
      '<path d="M 20 44 H 140 M 20 84 H 140" stroke="currentColor" stroke-width="1"/>',
      line(name, 80, 37, 118, 14, 7),
      emblem(stamp.mode, 32, 64, 18),
      line(date, 88, 69, 92, 14, 8),
      flagBand(stamp.iso, 50, 76, 60, 3.5),
    );
    if (town !== '') parts.push(line(town, 80, 97, 116, 9.5, 6, 700));
  } else {
    // An oval: the date between two marks, the name over it, the town under.
    parts.push(
      '<ellipse cx="80" cy="60" rx="70" ry="50" fill="none" stroke="currentColor" stroke-width="3.6"/>',
      '<ellipse cx="80" cy="60" rx="63" ry="43" fill="none" stroke="currentColor" stroke-width="1.3"/>',
      line(name, 80, 44, 100, 13, 7),
      '<path d="M 36 52 H 124 M 36 76 H 124" stroke="currentColor" stroke-width="1"/>',
      line(date, 80, 69, 70, 12.5, 8),
      emblem(stamp.mode, 42, 64, 12),
      emblem(stamp.mode, 118, 64, 12),
      flagBand(stamp.iso, 64, 80, 32, 3.5),
    );
    if (town !== '') parts.push(line(town, 80, 94, 80, 8.5, 5.5, 700));
  }
  // The rubber: a noise that bites holes in the ink and roughens its edge.
  const filter =
    `<filter id="${uid}r" x="-5%" y="-5%" width="110%" height="110%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed}" result="n"/>` +
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" result="d"/>' +
    '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.55" result="m"/>' +
    '<feComposite in="d" in2="m" operator="in"/></filter>';
  const svg =
    `<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(`${stamp.name}, ${date}`)}" ` +
    `style="color:${inkOf(stamp.iso)};font-family:var(--ui-font)" fill="currentColor">` +
    `<defs>${filter}</defs><g filter="url(#${uid}r)" opacity="0.92">${parts.join('')}</g></svg>`;
  return { svg, tilt };
}

/* --- the other worlds' seals ------------------------------------------------ */

/** A nation of another world, as its seal needs it. */
interface Nation {
  iso: string;
  name: string;
  color: number;
  /** Its world's name, and the species' writing when the chapter brings it. */
  world: string;
  script?: (text: string) => SVGElement;
}

/** A colour pulled a quarter of the way to the pen, as `inkOf` pulls a flag's. */
function nationInk(colour: number): string {
  return inked(colour, 0.25);
}

/** The banner a nation flies, as a picture for an SVG: `flags.ts` paints it with the world's own painter. */
const banners = new Map<string, string>();
function bannerUrl(iso: string): string {
  const held = banners.get(iso);
  if (held !== undefined) return held;
  let url = '';
  if (typeof document !== 'undefined') {
    try {
      url = createFlagCanvas(iso, 60, 40).toDataURL();
    } catch {
      // A canvas the browser will not read back: the seal goes without its banner.
    }
  }
  banners.set(iso, url);
  return url;
}

function banner(iso: string, x: number, y: number, width: number, height: number, stroke: number): string {
  const url = bannerUrl(iso);
  if (url === '') return '';
  return (
    `<image href="${url}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"/>` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-width="${stroke}"/>`
  );
}

/**
 * A name in the species' writing, laid round a ring: the glyphs the chapter's
 * `script` draws for it, read off its SVG — each glyph is a path placed by a
 * `translate` along the line — and set end to end round the circle, tops
 * outward, the name again after a dot until the ring is full. Empty when the
 * writing cannot be read that way, and the seal keeps its plain ring.
 */
const rings = new Map<string, string>();
function glyphRing(nation: Nation, cx: number, cy: number, radius: number, glyphHeight: number): string {
  const key = `${nation.iso}/${radius}/${glyphHeight}`;
  const held = rings.get(key);
  if (held !== undefined) return held;
  let out = '';
  try {
    const written = nation.script?.(nation.name) ?? null;
    if (written !== null) out = laidRound(written, cx, cy, radius, glyphHeight);
  } catch {
    out = '';
  }
  rings.set(key, out);
  return out;
}

function laidRound(written: SVGElement, cx: number, cy: number, radius: number, glyphHeight: number): string {
  const box = (written.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const boxHeight = box.length === 4 && Number.isFinite(box[3]) && box[3]! > 0 ? box[3]! : 0;
  if (boxHeight === 0) return '';
  const glyphs: { d: string; x: number }[] = [];
  let firstRow = Infinity;
  const placed: { d: string; x: number; y: number }[] = [];
  for (const path of Array.from(written.querySelectorAll('path[transform]'))) {
    const match = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(path.getAttribute('transform') ?? '');
    const d = path.getAttribute('d');
    if (match === null || d === null) continue;
    const y = Number(match[2]);
    placed.push({ d, x: Number(match[1]), y });
    firstRow = Math.min(firstRow, y);
  }
  for (const glyph of placed) if (glyph.y === firstRow) glyphs.push({ d: glyph.d, x: glyph.x });
  if (glyphs.length === 0) return '';
  const k = glyphHeight / boxHeight;
  const last = glyphs[glyphs.length - 1]!;
  const advance = glyphs.length > 1 ? (last.x - glyphs[0]!.x) / (glyphs.length - 1) : boxHeight * 0.7;
  const width = advance * k;
  const lineLength = (last.x - glyphs[0]!.x + advance) * k;
  const circumference = 2 * Math.PI * radius;
  const gap = width * 1.4;
  const stroke = Math.max(1.4, 0.55 / k);
  const parts: string[] = [];
  // The name as many whole times as the ring holds, a dot between, spread to close the circle.
  const copies = Math.max(1, Math.floor(circumference / (lineLength + gap)));
  const spare = (circumference - copies * (lineLength + gap)) / copies;
  let s = 0;
  for (let copy = 0; copy < copies; copy++) {
    for (const glyph of glyphs) {
      const along = s + (glyph.x - glyphs[0]!.x) * k + width / 2;
      const degrees = (along / circumference) * 360;
      parts.push(
        `<path transform="rotate(${degrees.toFixed(2)} ${cx} ${cy}) translate(${(cx - width / 2).toFixed(2)} ${(cy - radius - glyphHeight / 2).toFixed(2)}) scale(${k.toFixed(4)})" d="${glyph.d}"/>`,
      );
    }
    s += lineLength + gap + spare;
    const dot = ((s - (gap + spare) / 2) / circumference) * 2 * Math.PI;
    parts.push(`<circle cx="${(cx + radius * Math.sin(dot)).toFixed(2)}" cy="${(cy - radius * Math.cos(dot)).toFixed(2)}" r="${(glyphHeight * 0.12).toFixed(2)}" fill="currentColor" stroke="none"/>`);
  }
  return `<g fill="none" stroke="currentColor" stroke-width="${stroke.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g>`;
}

/**
 * A nation's stamp, 160 by 120: a round seal in the nation's own colour, the
 * banner it flies in the middle, its name under it and the day, the town (or
 * the world) along the foot, a mark for how you came over it, and its name
 * round the rim in the species' writing — a ring of beads where there is none.
 */
export function sealSvg(stamp: Stamp, nation: Nation): { svg: string; tilt: number } {
  const uid = `ps${++stampSerial}`;
  const h1 = hashOf(stamp.iso);
  const tilt = Math.round((hashOf(`${stamp.iso}/tilt`) - 0.5) * 22);
  const name = (nation.name || stamp.name).toUpperCase();
  const date = stampDateText(stamp.date);
  const foot = (stamp.town === '' ? nation.world : stamp.town).toUpperCase();
  const ring = glyphRing(nation, 80, 60, 50.6, 6.4);
  const parts = [
    '<circle cx="80" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="3.6"/>',
    ring === ''
      ? '<circle cx="80" cy="60" r="50.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 4.2"/>'
      : ring,
    '<circle cx="80" cy="60" r="46" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    emblem(stamp.mode, 80, 26, 12),
    banner(stamp.iso, 61, 34, 38, 25, 1),
    line(name, 80, 75, 72, 11, 6.5),
    line(date, 80, 87, 60, 9.5, 7),
    line(foot, 80, 97.5, 46, 6.5, 4.5, 700),
  ];
  const filter =
    `<filter id="${uid}r" x="-5%" y="-5%" width="110%" height="110%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${Math.floor(h1 * 1000)}" result="n"/>` +
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" result="d"/>' +
    '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.55" result="m"/>' +
    '<feComposite in="d" in2="m" operator="in"/></filter>';
  const svg =
    `<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(`${nation.name}, ${nation.world}, ${date}`)}" ` +
    `style="color:${nationInk(nation.color)};font-family:var(--ui-font)" fill="currentColor">` +
    `<defs>${filter}</defs><g filter="url(#${uid}r)" opacity="0.92">${parts.join('')}</g></svg>`;
  return { svg, tilt };
}

/** A name's initials, for an empty seal: *Tharsis Union* is `TU`. */
function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter((word) => /\p{L}/u.test(word));
  const letters = words.length > 1 ? words.slice(0, 3).map((word) => word[0]) : [name.slice(0, 3)];
  return letters.join('').toUpperCase();
}

/**
 * A nation's place on its world's visa, 64 by 48: the seal small, its banner
 * and the day, the writing round the rim; or, not yet stamped, an empty grey
 * ring round its initials, as Earth's places are an empty outline round the code.
 */
function miniSeal(nation: Nation, stamp: Stamp | null): string {
  const got = stamp !== null;
  const colour = got ? nationInk(nation.color) : 'rgba(30, 6, 3, 0.32)';
  let body: string;
  if (got) {
    const ring = glyphRing(nation, 32, 24, 19.4, 3.1);
    body =
      '<circle cx="32" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="2.6"/>' +
      (ring === ''
        ? '<circle cx="32" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="0.9"/>'
        : `${ring}<circle cx="32" cy="24" r="17.1" fill="none" stroke="currentColor" stroke-width="0.7"/>`) +
      banner(nation.iso, 24, 11.5, 16, 10.6, 0.6) +
      `<text x="32" y="31.5" font-size="6.3" font-weight="800" letter-spacing="0.3" text-anchor="middle">${escape(dayText(stamp.date))}</text>`;
  } else {
    body =
      '<circle cx="32" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-dasharray="3.2 2.4"/>' +
      `<text x="32" y="28.5" font-size="12" font-weight="800" letter-spacing="0.6" text-anchor="middle">${escape(initials(nation.name))}</text>`;
  }
  return (
    `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ` +
    `style="color:${colour};font-family:var(--ui-font)" fill="currentColor"><g opacity="${got ? 0.92 : 1}">${body}</g></svg>`
  );
}

/**
 * A world as its tab and its frontispiece draw it: a disc in the body's
 * colour, lit from the upper left with the night on its right, Earth with
 * land on it and Saturn in its ring.
 */
function worldDisc(body: string, colour: number): string {
  const ink = hex(PALETTE.ink);
  const fill = hex(colour);
  const land =
    body === 'earth'
      ? `<path d="M9 13c3-4 9-5 11-2s-2 5 1 8-3 7-6 5-4-4-6-6 0-3 0-5zM24 24c3-1 7 1 7 4s-4 6-6 5-3-7-1-9z" fill="${hex(PALETTE.green)}"/>`
      : '';
  const ring =
    body === 'saturn'
      ? (back: boolean) =>
          `<ellipse cx="20" cy="20" rx="25" ry="6.5" transform="rotate(-18 20 20)" fill="none" stroke="${ink}" stroke-width="2.4"` +
          (back ? ' stroke-opacity="0.45"' : '') +
          '/>'
      : () => '';
  return (
    `<svg viewBox="0 0 40 40" aria-hidden="true" overflow="visible">` +
    ring(true) +
    `<circle cx="20" cy="20" r="17" fill="${fill}"/>` +
    land +
    `<path d="M20 3a17 17 0 0 1 0 34a10 17 0 0 0 0-34z" fill="${ink}" fill-opacity="0.2"/>` +
    '<ellipse cx="13.5" cy="12.5" rx="4.5" ry="3.2" fill="#fff" fill-opacity="0.3"/>' +
    `<circle cx="20" cy="20" r="17" fill="none" stroke="${ink}" stroke-width="2.6"/>` +
    // The near half of the ring, in front of the planet.
    (body === 'saturn' ? `<path d="M43.78 12.27A25 6.5 -18 0 1 -3.78 27.73" fill="none" stroke="${ink}" stroke-width="2.4"/>` : '') +
    '</svg>'
  );
}

/** The stamp that drops, square on its spot at its country's own tilt; a nation's seal at its own. */
function stampElement(stamp: Stamp, nation: Nation | null): HTMLElement {
  const { svg, tilt } = nation === null ? stampSvg(stamp) : sealSvg(stamp, nation);
  const element = h('div', { class: 'p-stamp', html: svg });
  element.style.setProperty('--tilt', `${tilt}deg`);
  return element;
}

/** `2026-09-25` as the small stamp says it: `25 SEP`. */
const dayText = (date: string): string => stampDateText(date).slice(0, 6);

/**
 * A country's place on its continent's page, 64 by 48: the stamp, small, in
 * its country's ink with its code, the day and the flag's band; or, not yet
 * stamped, the same shape as an empty grey outline round the code.
 */
function miniStamp(iso: string, stamp: Stamp | null): string {
  const shape = Math.floor(hashOf(iso) * 3);
  const got = stamp !== null;
  const colour = got ? inkOf(iso) : 'rgba(30, 6, 3, 0.32)';
  const dash = got ? '' : ' stroke-dasharray="3.2 2.4"';
  const ring =
    shape === 0
      ? `<circle cx="32" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="2.6"${dash}/>` +
        (got ? '<circle cx="32" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="0.9"/>' : '')
      : shape === 1
        ? `<rect x="4" y="4" width="56" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="2.6"${dash}/>` +
          (got ? '<rect x="7.5" y="7.5" width="49" height="33" rx="3.5" fill="none" stroke="currentColor" stroke-width="0.9"/>' : '')
        : `<ellipse cx="32" cy="24" rx="28" ry="21" fill="none" stroke="currentColor" stroke-width="2.6"${dash}/>` +
          (got ? '<ellipse cx="32" cy="24" rx="24.5" ry="17.5" fill="none" stroke="currentColor" stroke-width="0.9"/>' : '');
  const code = escape(iso.slice(0, 4));
  const text = got
    ? `<text x="32" y="25" font-size="12.5" font-weight="800" letter-spacing="0.6" text-anchor="middle">${code}</text>` +
      `<text x="32" y="33.5" font-size="6.6" font-weight="800" letter-spacing="0.3" text-anchor="middle">${escape(dayText(stamp.date))}</text>` +
      flagBand(iso, 23, 36.5, 18, 2.5)
    : `<text x="32" y="28.5" font-size="12.5" font-weight="800" letter-spacing="0.6" text-anchor="middle">${code}</text>`;
  return (
    `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ` +
    `style="color:${colour};font-family:var(--ui-font)" fill="currentColor"><g opacity="${got ? 0.92 : 1}">${ring}${text}</g></svg>`
  );
}

/* --- the pages ------------------------------------------------------------ */

/** One continent's seal on its visa page: a rose of the winds in its ink. */
function seal(colour: string): string {
  return (
    `<svg viewBox="0 0 48 48" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round" aria-hidden="true">` +
    '<circle cx="24" cy="24" r="21"/><circle cx="24" cy="24" r="16" stroke-width="1" stroke-dasharray="1.5 2.5"/>' +
    `<path d="M24 7 28 20 41 24 28 28 24 41 20 28 7 24 20 20z" fill="${colour}" fill-opacity="0.25"/></svg>`
  );
}

/**
 * The traveller's photograph: the shoulders in their top's colour, the head
 * and neck in their skin, the hair over it, against a studio blue. A sketch
 * of the colours they chose rather than a render, which a passport photo
 * never flattered anyone with either.
 */
function portrait(appearance: Appearance | null): string {
  const colour = (table: readonly number[], index: number, fallback: number): string => hex(table[index] ?? fallback);
  const skin = appearance === null ? hex(PALETTE.blush) : colour(SKINS, appearance.skin, PALETTE.blush);
  const hair = appearance === null ? hex(PALETTE.bark) : colour(HAIR, appearance.hair, PALETTE.bark);
  const top = appearance === null ? hex(PALETTE.crimson) : colour(CLOTH, appearance.topColour, PALETTE.crimson);
  const long = appearance?.body === 'woman';
  const ink = hex(PALETTE.ink);
  return (
    `<svg viewBox="0 0 124 156" aria-hidden="true"><rect width="124" height="156" fill="${hex(PALETTE.skyBlue)}" opacity="0.55"/>` +
    '<path d="M0 118h124" stroke="#fff" stroke-opacity="0.35" stroke-width="30"/>' +
    (long ? `<path d="M34 70c-4 26-2 44 6 56h44c8-12 10-30 6-56z" fill="${hair}" stroke="${ink}" stroke-width="2.5"/>` : '') +
    `<path d="M10 160c2-26 18-38 52-38s50 12 52 38z" fill="${top}" stroke="${ink}" stroke-width="2.5"/>` +
    `<path d="M52 104h20v20c-3 6-17 6-20 0z" fill="${skin}" stroke="${ink}" stroke-width="2.5"/>` +
    `<ellipse cx="62" cy="74" rx="24" ry="29" fill="${skin}" stroke="${ink}" stroke-width="2.5"/>` +
    `<path d="M37 72c-2-22 10-34 25-34s28 11 25 34c-5-9-12-14-25-15-12 1-20 6-25 15z" fill="${hair}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<circle cx="53" cy="77" r="2.4" fill="${ink}"/><circle cx="71" cy="77" r="2.4" fill="${ink}"/>` +
    `<path d="M55 91c4 3 10 3 14 0" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/></svg>`
  );
}

/** A name as the machine-readable zone writes it: capitals, and `<` for anything else. */
function mrzName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '<')
    .replace(/^<+|<+$/g, '');
}

const pad = (text: string, width: number): string => (text.length >= width ? text.slice(0, width) : text + '<'.repeat(width - text.length));

/** One visa: a bookmark along the top, and a grid of places on one or more pages. */
interface Visa {
  /** The continent's name on Earth, the body's id elsewhere. */
  key: string;
  /** The chapter it is in: `'earth'` or the body's id. */
  chapter: string;
  title: string;
  /** Its print, and the dye of its bookmark. */
  ink: string;
  dye: string;
  entries: readonly { iso: string; name: string }[];
}

export function createPassportCard(options: PassportCardOptions): PassportCard {
  installUi();
  ensureStyle('atlas-passport', STYLE);
  const { passport } = options;
  /** Every listener the card adds goes with it on `dispose`. */
  const events = new AbortController();
  const { signal } = events;

  const countryOf = new Map(options.countries.map((country) => [country.iso, country]));
  /** Every country on its continent's pages, by name. */
  const continents = byContinent(options.countries);
  /** Earth's visas: every continent with a country. */
  const earthVisas: Visa[] = CONTINENTS.filter((continent) => continents.get(continent)!.length > 0).map((continent) => ({
    key: continent,
    chapter: 'earth',
    title: continent,
    ink: inked(CONTINENT_INK[continent], 0.35),
    dye: inked(CONTINENT_INK[continent], 0.3),
    entries: continents.get(continent)!,
  }));
  /** The other worlds, once the caller has handed them over; their nations by code. */
  let chapters: readonly PassportChapter[] = [];
  let visas: Visa[] = earthVisas;
  const nationOf = new Map<string, Nation>();
  const stampsByIso = (): Map<string, Stamp> => new Map(passport.data.stamps.map((stamp) => [stamp.iso, stamp]));
  /** The facts for the tip's capital, once `country-facts.ts` has them. */
  let facts: Record<string, CountryFacts> | null = null;
  const continentOfIso = (iso: string): Continent | null => {
    const country = countryOf.get(iso);
    return country === undefined ? null : continentOf(country);
  };
  const visaOf = (key: string): Visa | undefined => visas.find((visa) => visa.key === key);

  const left = h('div', { class: 'p-side left', role: 'group', 'aria-roledescription': 'page' });
  const right = h('div', { class: 'p-side right', role: 'group', 'aria-roledescription': 'page' });
  // The two corners: the only things on the paper that turn it.
  const previous = h('button', { class: 'p-corner prev', type: 'button', 'aria-label': 'Previous pages', html: cornerSvg('p-corner-prev') });
  const next = h('button', { class: 'p-corner next', type: 'button', 'aria-label': 'Next pages', html: cornerSvg('p-corner-next') });
  const book = h('div', { class: 'p-book' }, left, right, previous, next);
  // A bookmark for the holder's page and one a visa, standing out of the top
  // edge; only the current chapter's stand up at once.
  const holderTab = h('button', { class: 'p-tab holder', type: 'button', 'aria-label': 'The holder' }, h('b', {}, icon('passport', 14), 'Holder'), h('em', { text: 'ATL' }));
  const tabs = new Map<string, HTMLButtonElement>();
  holderTab.addEventListener('click', () => turn(0), { signal });
  const ribbons = h('nav', { class: 'p-ribbons', 'aria-label': 'Bookmarks' }, holderTab);
  // And a planet a chapter down the right edge, once there is more than Earth.
  const worldTabs = new Map<string, HTMLButtonElement>();
  const worlds = h('nav', { class: 'p-worlds', 'aria-label': 'Worlds' });
  const hint = h('div', { class: 'p-hint' });
  const scaler = h('div', { class: 'p-scaler' }, h('div', { class: 'p-cover-back' }), ribbons, worlds, book, hint);
  const fit = h('div', { class: 'p-fit' }, scaler);
  const panel = h('div', { class: 'p-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Passport', tabindex: '-1' }, fit);
  const tipFlag = h('span');
  const tipName = h('b');
  const tipCapital = h('small');
  const tipStamp = h('small');
  const tip = h('div', { class: 'p-tip ui-card', 'aria-hidden': 'true' }, tipFlag, h('div', {}, tipName, tipCapital, tipStamp));
  const overlay = h('div', { class: 'atlas-passport' }, panel, tip);

  const dropStamp = h('div');
  const dropCaption = h('div', { class: 'p-caption ui-card' });
  const drop = h('div', { class: 'atlas-stamp-drop', 'aria-live': 'polite' }, dropStamp, dropCaption);
  const root = h('div', {}, overlay, drop);

  /** The bookmarks and the planets, for the visas and the chapters as they stand. */
  function layout(): void {
    visas = [
      ...earthVisas,
      ...chapters.map((chapter) => ({
        key: chapter.body,
        chapter: chapter.body,
        title: chapter.name,
        ink: inked(chapter.color ?? PALETTE.slate, 0.35),
        dye: inked(chapter.color ?? PALETTE.slate, 0.3),
        entries: chapter.nations,
      })),
    ];
    nationOf.clear();
    for (const chapter of chapters) {
      for (const nation of chapter.nations) {
        const entry: Nation = { iso: nation.iso, name: nation.name, color: nation.color, world: chapter.name };
        if (chapter.script !== undefined) entry.script = chapter.script;
        nationOf.set(nation.iso, entry);
      }
    }
    tabs.clear();
    for (const visa of visas) {
      const tab = h('button', { class: 'p-tab', type: 'button' });
      tab.style.setProperty('--tab', visa.dye);
      tab.addEventListener('click', () => {
        const first = firstPageOf.get(visa.key);
        if (first !== undefined) turn(spreadOfPage(first));
      }, { signal });
      tabs.set(visa.key, tab);
    }
    ribbons.replaceChildren(holderTab, ...tabs.values());
    worldTabs.clear();
    if (chapters.length > 0) {
      const all = [{ body: 'earth', name: 'Earth', color: PALETTE.skyBlue as number }, ...chapters.map((chapter) => ({ body: chapter.body, name: chapter.name, color: chapter.color ?? PALETTE.white }))];
      for (const world of all) {
        const tab = h('button', { class: 'p-world', type: 'button', html: worldDisc(world.body, world.color) });
        tab.addEventListener('click', () => {
          const start = chapterStart.get(world.body);
          if (start !== undefined) turn(world.body === 'earth' ? 0 : spreadOfPage(start));
        }, { signal });
        worldTabs.set(world.body, tab);
      }
    }
    worlds.replaceChildren(...worldTabs.values());
    worlds.hidden = worldTabs.size === 0;
  }

  /* --- what the pages say ------------------------------------------------ */

  type PageMaker = (side: 'verso' | 'recto') => HTMLElement;

  function page(side: 'verso' | 'recto', number: number | null, running: string, world: string, ...children: (HTMLElement | null)[]): HTMLElement {
    return h(
      'div',
      { class: `p-page ${side}` },
      h('div', { class: 'p-running' }, h('span', { text: side === 'verso' ? 'Atlas' : running }), h('span', { text: side === 'verso' ? running : world })),
      ...children,
      number === null ? null : h('div', { class: 'p-folio', text: String(number) }),
    );
  }

  /** The inside of the front cover, with the notice every passport prints there. */
  function endpaper(): HTMLElement {
    const stamps = passport.data.stamps;
    return h(
      'div',
      { class: 'p-page endpaper verso' },
      h(
        'div',
        { class: 'p-label' },
        h('b', { text: 'Notice to the holder' }),
        h('p', { text: 'Every country you come down in is stamped in this book: walking in, swimming ashore, driving, sailing or landing. Flying over does not count.' }),
        h('p', { text: 'Each continent has its visa, with a place for every one of its countries. The ones still in grey are the ones you have not been to.' }),
        chapters.length === 0 ? null : h('p', { text: 'Every other world has a chapter of its own, behind the planets on the right-hand edge, with a seal for each of its nations.' }),
        h('small', { text: stamps.length === 0 ? 'Not yet stamped.' : `First stamp: ${stamps[0]!.name}, ${stampDateText(stamps[0]!.date)}.` }),
      ),
    );
  }

  /** The worlds with a stamp in the book, of the worlds it has chapters for. */
  function worldsStamped(): number {
    const known = new Set(['earth', ...chapters.map((chapter) => chapter.body)]);
    return new Set(passport.data.stamps.map((stamp) => worldOf(stamp.iso)).filter((world) => known.has(world))).size;
  }

  function holderPage(side: 'verso' | 'recto', number: number): HTMLElement {
    const who = options.holder?.() ?? null;
    const name = who?.name.trim() || 'Traveller';
    const code = who === null ? '' : encodeAppearance(who.appearance);
    const stamps = passport.data.stamps;
    const earthly = stamps.filter((stamp) => worldOf(stamp.iso) === 'earth');
    const field = (label: string, value: string, mono = false): HTMLElement =>
      h('div', { class: 'p-field' }, h('small', { text: label }), h('span', { class: mono ? 'code' : '', text: value }));
    const surname = mrzName(name) || 'TRAVELLER';
    const mrz =
      `${pad(`P<ATL${surname}`, 32)}\n` +
      `${pad(`${code.toUpperCase().replace(/[^A-Z0-9]/g, '<')}<${String(stamps.length).padStart(3, '0')}<EARTH`, 32)}`;
    const holder = page(
      side,
      number,
      'Holder',
      'Earth',
      h('div', { class: 'p-id-head' }, h('b', { text: 'PASSPORT' }), h('span', { text: 'TYPE P · ATL' })),
      h(
        'div',
        { class: 'p-id' },
        h('div', { class: 'p-photo', html: portrait(who?.appearance ?? null) }),
        h(
          'div',
          { class: 'p-fields' },
          field('Name', name),
          field('Nationality', 'Of the Earth'),
          field('Countries', `${earthly.length} of ${options.countries.length}`),
          field('Continents', `${new Set(earthly.map((stamp) => continentOfIso(stamp.iso)).filter((c) => c !== null)).size} of ${earthVisas.length}`),
          chapters.length === 0 ? null : field('Worlds', `${worldsStamped()} of ${1 + chapters.length}`),
          field('Date of issue', stamps.length === 0 ? 'On the first stamp' : stampDateText(stamps[0]!.date)),
          field('Place of issue', stamps.length === 0 ? '—' : stamps[0]!.town || stamps[0]!.name),
        ),
      ),
      h('div', { class: 'p-sign' }, h('span', { text: name }), h('small', { text: 'Signature' })),
      h('div', { class: 'p-mrz', text: mrz, 'aria-hidden': 'true' }),
    );
    holder.classList.add('guilloche');
    return holder;
  }

  /** Which visa's pages begin where, and which chapter's, as `pagesOf` last laid the book out. */
  const firstPageOf = new Map<string, number>();
  const chapterStart = new Map<string, number>();

  /** How many of a visa's places are stamped. */
  function countOf(visa: Visa, stamped: Map<string, Stamp>): number {
    return visa.entries.reduce((sum, entry) => sum + (stamped.has(entry.iso) ? 1 : 0), 0);
  }

  function progressBar(got: number, all: number, ink: string): HTMLElement {
    const bar = h('div', { class: 'p-bar' }, h('i'));
    const fillBar = bar.firstElementChild as HTMLElement;
    fillBar.style.width = `${((got / Math.max(1, all)) * 100).toFixed(1)}%`;
    fillBar.style.background = ink;
    return bar;
  }

  /**
   * A page of a visa: every one of its places in a grid, by name, the ones
   * stamped in their own ink and the rest an empty outline, so the page says
   * what is missing as plainly as what is there.
   */
  function visaPage(side: 'verso' | 'recto', number: number, visa: Visa, part: number): HTMLElement {
    const all = visa.entries;
    const stamped = stampsByIso();
    const got = countOf(visa, stamped);
    const earth = visa.chapter === 'earth';
    const world = earth ? 'Earth' : visa.title;
    const grid = h('div', { class: 'p-grid' });
    for (const entry of all.slice(part * PER_PAGE, (part + 1) * PER_PAGE)) {
      const stamp = stamped.get(entry.iso) ?? null;
      const nation = earth ? undefined : nationOf.get(entry.iso);
      const cell = h(
        'div',
        {
          class: stamp === null ? 'p-cell missing' : 'p-cell got',
          'data-iso': entry.iso,
          role: 'img',
          'aria-label': stamp === null ? `${entry.name}, not visited yet` : `${entry.name}, stamped ${stampDateText(stamp.date)}`,
        },
        h('div', { class: 'p-mini', html: nation === undefined ? miniStamp(entry.iso, stamp) : miniSeal(nation, stamp) }),
        h('span', { text: entry.name }),
      );
      if (stamp !== null) cell.style.setProperty('--tilt', `${Math.round((hashOf(`${entry.iso}/tilt`) - 0.5) * 16)}deg`);
      grid.append(cell);
    }
    // The heading, the count and the bar once a visa, on its first page; a
    // page it runs on to carries the grid alone under the running head.
    const mark = earth ? seal(visa.ink) : worldDisc(visa.chapter, chapters.find((chapter) => chapter.body === visa.chapter)?.color ?? PALETTE.white);
    const result = part === 0
      ? page(
          side,
          number,
          visa.title,
          world,
          h(
            'div',
            { class: 'p-cont-head' },
            h('span', { html: mark }),
            h('div', {}, h('small', { text: 'Visa' }), h('b', { text: earth ? visa.title : `The nations of ${visa.title}` })),
            h('div', { class: 'p-cont-count' }, String(got), h('small', { text: ` / ${all.length}` })),
          ),
          progressBar(got, all.length, visa.ink),
          grid,
        )
      : page(side, number, visa.title, world, grid);
    result.classList.add('guilloche');
    return result;
  }

  /**
   * The page a world's chapter opens on, facing its visa: the planet, its
   * name, in its own people's writing where they have one, and how much of it
   * the book holds.
   */
  function frontispiece(side: 'verso' | 'recto', number: number, chapter: PassportChapter): HTMLElement {
    const visa = visaOf(chapter.body);
    const got = visa === undefined ? 0 : countOf(visa, stampsByIso());
    const all = chapter.nations.length;
    const ink = visa?.ink ?? inked(PALETTE.slate, 0.35);
    let written: Element | null = null;
    try {
      written = chapter.script?.(chapter.name) ?? null;
    } catch {
      written = null;
    }
    const writing = written === null ? null : h('div', { class: 'p-script' }, written as HTMLElement);
    if (writing !== null) writing.style.color = ink;
    const front = page(
      side,
      number,
      chapter.name,
      chapter.name,
      h(
        'div',
        { class: 'p-front' },
        h('div', { class: 'p-globe', html: worldDisc(chapter.body, chapter.color ?? PALETTE.white) }),
        h('small', { text: 'Chapter' }),
        h('b', { text: chapter.name }),
        writing,
        h('p', { text: `${got === 0 ? 'Not one' : got} of its ${all} ${all === 1 ? 'nation' : 'nations'} stamped. Every nation you come down in here is sealed on the facing page.` }),
        progressBar(got, all, ink),
      ),
    );
    front.classList.add('guilloche');
    return front;
  }

  function blankPage(side: 'verso' | 'recto', number: number, world = 'Earth'): HTMLElement {
    return page(side, number, 'Notes', world);
  }

  /**
   * The book as it stands, open from the start: the inside of the cover and
   * the holder's page on the first spread, then a visa of one or more pages a
   * continent, each of two or more pages opening on a left-hand page so that
   * it lies open as one spread; then a chapter a world, its frontispiece on a
   * left-hand page facing its visa; and a blank to close the last spread.
   * Page `2n` is spread `n`'s left, `2n + 1` its right.
   */
  function pagesOf(): PageMaker[] {
    const pages: PageMaker[] = [() => endpaper()];
    let world = 'Earth';
    const add = (make: (side: 'verso' | 'recto', number: number) => HTMLElement): void => {
      const number = pages.length;
      pages.push((side) => make(side, number));
    };
    const blank = (): void => {
      const name = world;
      add((side, number) => blankPage(side, number, name));
    };
    add(holderPage);
    firstPageOf.clear();
    chapterStart.clear();
    chapterStart.set('earth', 0);
    for (const visa of earthVisas) {
      const parts = Math.ceil(visa.entries.length / PER_PAGE);
      if (parts > 1 && pages.length % 2 === 1) blank();
      firstPageOf.set(visa.key, pages.length);
      for (let part = 0; part < parts; part++) add((side, number) => visaPage(side, number, visa, part));
    }
    for (const chapter of chapters) {
      if (pages.length % 2 === 1) blank();
      world = chapter.name;
      chapterStart.set(chapter.body, pages.length);
      add((side, number) => frontispiece(side, number, chapter));
      const visa = visaOf(chapter.body)!;
      firstPageOf.set(visa.key, pages.length);
      const parts = Math.max(1, Math.ceil(visa.entries.length / PER_PAGE));
      for (let part = 0; part < parts; part++) add((side, number) => visaPage(side, number, visa, part));
    }
    if (pages.length % 2 === 1) blank();
    return pages;
  }

  /* --- turning ------------------------------------------------------------ */

  let pages = pagesOf();
  /** The spread on show: pages `2n` and `2n + 1`. */
  let spread = 0;
  /** Whether the book has been turned since it opened, so a late chapter does not move it. */
  let turned = false;
  const spreads = (): number => pages.length / 2;
  /** The spread a page lies open on. */
  const spreadOfPage = (index: number): number => Math.floor(index / 2);

  /** The chapter a spread is in: the last to start at or before its left page. */
  function chapterAt(at: number): string {
    let found = 'earth';
    let best = -1;
    for (const [id, start] of chapterStart) {
      if (start <= 2 * at && start > best) {
        best = start;
        found = id;
      }
    }
    return found;
  }

  /** The spread a country's or a nation's place is on, or null for one with no visa. */
  function spreadOfCountry(iso: string): number | null {
    const world = worldOf(iso);
    const key = world === 'earth' ? continentOfIso(iso) : world;
    if (key === null) return null;
    const visa = visaOf(key);
    const first = firstPageOf.get(key);
    if (visa === undefined || first === undefined) return null;
    const at = visa.entries.findIndex((entry) => entry.iso === iso);
    if (world !== 'earth' && at < 0) return null;
    return spreadOfPage(first + Math.floor(Math.max(0, at) / PER_PAGE));
  }

  /** The spread with the newest stamp on it, or the holder's with none. */
  function newestSpread(): number {
    const newest = passport.data.stamps[passport.data.stamps.length - 1];
    return (newest === undefined ? null : spreadOfCountry(newest.iso)) ?? 0;
  }

  /** Where the book falls open: the visa of the country underfoot, else the newest stamp's. */
  function openingSpread(): number {
    const here = options.here?.() ?? '';
    return (here === '' ? null : spreadOfCountry(here)) ?? newestSpread();
  }

  function sideOf(index: number, side: 'verso' | 'recto'): HTMLElement | null {
    const make = pages[index];
    return index < 0 || make === undefined ? null : make(side);
  }

  function fill(slot: HTMLElement, content: HTMLElement | null, label: string): void {
    slot.replaceChildren(...(content === null ? [] : [content]));
    slot.classList.toggle('blank', content === null);
    slot.setAttribute('aria-label', label);
  }

  function labelFor(index: number): string {
    return index === 0 ? 'Inside the cover' : index < 0 || index >= pages.length ? '' : `Page ${index}`;
  }

  function showSpread(): void {
    fill(left, sideOf(2 * spread, 'verso'), labelFor(2 * spread));
    fill(right, sideOf(2 * spread + 1, 'recto'), labelFor(2 * spread + 1));
    chrome();
  }

  function chrome(): void {
    const stamped = stampsByIso();
    const chapter = chapterAt(spread);
    holderTab.setAttribute('aria-current', String(spread === 0));
    for (const [key, tab] of tabs) {
      const visa = visaOf(key)!;
      // Only the chapter you are in stands up along the top; the holder's is the book's.
      tab.hidden = visa.chapter !== chapter;
      const all = visa.entries;
      const got = countOf(visa, stamped);
      const first = firstPageOf.get(key) ?? -1;
      const parts = Math.max(1, Math.ceil(all.length / PER_PAGE));
      const from = visa.chapter === 'earth' ? spreadOfPage(first) : spreadOfPage(chapterStart.get(visa.chapter) ?? first);
      const open = !tab.hidden && first >= 0 && from <= spread && spread <= spreadOfPage(first + parts - 1);
      tab.replaceChildren(h('b', { text: visa.title }), h('em', { text: `${got}/${all.length}` }));
      tab.setAttribute('aria-label', `${visa.title}: ${got} of ${all.length} stamped`);
      tab.setAttribute('aria-current', String(open));
    }
    for (const [body, tab] of worldTabs) {
      const name = body === 'earth' ? 'Earth' : chapters.find((each) => each.body === body)?.name ?? body;
      const got = passport.data.stamps.filter((stamp) => worldOf(stamp.iso) === body).length;
      tab.setAttribute('aria-current', String(body === chapter));
      tab.setAttribute('aria-label', `${name}: ${got} stamped`);
      tab.title = `${name} · ${got} stamped`;
    }
    hideTip();
    previous.hidden = spread === 0;
    next.hidden = spread >= spreads() - 1;
  }

  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  /** The leaf in the air, and what finishes its turn. */
  let turning: { animation: Animation; shade: Animation[]; done: () => void } | null = null;

  function settle(): void {
    if (turning === null) return;
    const { animation, shade, done } = turning;
    turning = null;
    animation.cancel();
    for (const each of shade) each.cancel();
    done();
  }

  function turn(to: number): void {
    settle();
    const target = Math.max(0, Math.min(spreads() - 1, to));
    if (target === spread) return;
    turned = true;
    const step = target > spread ? 1 : -1;
    const from = spread;
    spread = target;
    options.onTurn?.(Math.abs(target - from));
    if (calm.matches) {
      showSpread();
      return;
    }
    // Forward: the leaf is the right page lifting, with the target's left
    // page on its back; the target's right page is already underneath.
    // Backward is the mirror of it over the spine. A jump of several spreads
    // is one leaf too, the pages between it riffled past unseen.
    const leaf = h('div', { class: `p-leaf ${step > 0 ? 'forward' : 'back'}` });
    const front = step > 0 ? sideOf(2 * from + 1, 'recto') : sideOf(2 * from, 'verso');
    const behind = step > 0 ? sideOf(2 * target, 'verso') : sideOf(2 * target + 1, 'recto');
    const frontShade = h('div', { class: 'p-shade' });
    const behindShade = h('div', { class: 'p-shade' });
    leaf.append(
      h('div', { class: 'p-face' }, front, frontShade),
      h('div', { class: 'p-face under' }, behind, behindShade),
    );
    if (step > 0) fill(right, sideOf(2 * target + 1, 'recto'), labelFor(2 * target + 1));
    else fill(left, sideOf(2 * target, 'verso'), labelFor(2 * target));
    book.append(leaf);
    chrome();
    const animation = leaf.animate(
      [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${step > 0 ? -180 : 180}deg)` }],
      { duration: TURN_MS, easing: 'cubic-bezier(0.35, 0.05, 0.25, 1)', fill: 'forwards' },
    );
    const shade = [
      frontShade.animate([{ opacity: 0 }, { opacity: 0.9 }], { duration: TURN_MS / 2, easing: 'ease-in', fill: 'forwards' }),
      behindShade.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: TURN_MS / 2, delay: TURN_MS / 2, easing: 'ease-out', fill: 'both' }),
    ];
    const done = (): void => {
      leaf.remove();
      if (step > 0) fill(left, sideOf(2 * target, 'verso'), labelFor(2 * target));
      else fill(right, sideOf(2 * target + 1, 'recto'), labelFor(2 * target + 1));
    };
    turning = { animation, shade, done };
    animation.onfinish = () => {
      if (turning?.animation === animation) settle();
    };
  }

  previous.addEventListener('click', () => turn(spread - 1), { signal });
  next.addEventListener('click', () => turn(spread + 1), { signal });

  /* --- what a stamp says -------------------------------------------------- */

  let tipIso = '';
  function hideTip(): void {
    tipIso = '';
    tip.classList.remove('on');
  }
  function showTip(cell: HTMLElement): void {
    const iso = cell.dataset.iso ?? '';
    const country = countryOf.get(iso);
    const nation = nationOf.get(iso);
    if (country === undefined && nation === undefined) {
      hideTip();
      return;
    }
    if (iso !== tipIso) {
      tipIso = iso;
      const flag = createFlagCanvas(iso, 34, 23);
      flag.className = 'ui-flag';
      tipFlag.replaceChildren(flag);
      tipName.textContent = country?.name ?? nation!.name;
      const capital = country === undefined ? undefined : facts?.[iso]?.capital;
      tipCapital.textContent = nation !== undefined ? `A nation of ${nation.world}` : capital === undefined ? '' : `Capital: ${capital}`;
      const stamp = stampsByIso().get(iso);
      tipStamp.textContent =
        stamp === undefined
          ? 'Not visited yet'
          : `Stamped ${stampDateText(stamp.date)}${stamp.town === '' ? '' : ` near ${stamp.town}`}, ${MODE_TEXT[stamp.mode]}`;
    }
    const box = cell.getBoundingClientRect();
    tip.style.left = `${Math.max(160, Math.min(innerWidth - 160, box.left + box.width / 2)).toFixed(1)}px`;
    tip.style.top = `${box.top.toFixed(1)}px`;
    tip.classList.add('on');
  }
  book.addEventListener('pointerover', (event) => {
    const cell = event.target instanceof Element ? event.target.closest('.p-cell') : null;
    if (cell instanceof HTMLElement) showTip(cell);
    else hideTip();
  }, { signal });
  book.addEventListener('pointerleave', hideTip, { signal });

  /** The sheet's width as designed: the book, and the planets' room on its right once there are chapters. */
  const sheetWidth = (): number => SHEET_W + (worldTabs.size > 0 ? SIDE_ROOM : 0);

  /** The book as large as the window holds it, up to `MAX_SCALE` of its design. */
  function resize(): void {
    const width = sheetWidth();
    const scale = Math.max(0.3, Math.min(MAX_SCALE, (innerWidth * FIT_WIDTH) / width, (innerHeight * FIT_HEIGHT) / SHEET_H));
    scaler.style.width = `${width}px`;
    scaler.style.transform = `scale(${scale.toFixed(4)})`;
    fit.style.width = `${Math.round(width * scale)}px`;
    fit.style.height = `${Math.round(SHEET_H * scale)}px`;
  }

  /* --- the other worlds' chapters ---------------------------------------- */

  /** Lays the chapters in, and the book out again round the spread on show. */
  function applyChapters(list: readonly PassportChapter[]): void {
    chapters = list.filter((chapter) => chapter.body !== 'earth');
    layout();
    if (!showing) return;
    settle();
    pages = pagesOf();
    spread = Math.min(spreads() - 1, turned ? spread : openingSpread());
    showSpread();
    resize();
  }

  let chaptersAsked = false;
  /** Asks for the chapters once, the first time the book is opened or stamped. */
  function askChapters(): void {
    if (chaptersAsked) return;
    chaptersAsked = true;
    const given = options.chapters;
    if (given === undefined || Array.isArray(given)) return;
    try {
      const answer = (given as () => readonly PassportChapter[] | Promise<readonly PassportChapter[]>)();
      if (answer instanceof Promise) {
        answer.then((list) => {
          if (!disposed) applyChapters(list);
        }).catch(() => undefined);
      } else applyChapters(answer);
    } catch {
      // No chapters: the book is Earth's alone, as it always was.
    }
  }
  // An array is in hand already: the book is laid out with it from the start.
  if (Array.isArray(options.chapters)) chapters = (options.chapters as readonly PassportChapter[]).filter((chapter) => chapter.body !== 'earth');
  layout();
  pages = pagesOf();

  /* --- opening and closing ---------------------------------------------- */

  let showing = false;
  let relock = false;
  let disposed = false;
  let previousFocus: HTMLElement | null = null;
  const unregisterModal = registerModal(() => showing);

  function show(opening: { relock?: boolean } = {}): void {
    if (showing || disposed) return;
    showing = true;
    turned = false;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = options.lockTarget ?? null;
    relock = opening.relock ?? (target !== null && document.pointerLockElement === target);
    options.onOpen?.();
    if (document.pointerLockElement) document.exitPointerLock();
    // The capitals for the tips; fetched once, and already in hand after the first frontier.
    if (facts === null) {
      void loadCountryFacts()
        .then((loaded) => {
          facts = loaded;
        })
        .catch(() => undefined);
    }
    askChapters();
    // Open already, where the holder is.
    pages = pagesOf();
    spread = Math.min(spreads() - 1, openingSpread());
    showSpread();
    const key = labelOf('passport');
    hint.textContent = `← → turn the page · ${key} or Esc to close`;
    resize();
    addEventListener('resize', resize, { signal });
    if (!root.isConnected) document.body.append(root);
    overlay.classList.add('on');
    panel.focus({ preventScroll: true });
  }

  // A lock granted while the card is up is handed straight back, as the settings card does.
  document.addEventListener('pointerlockchange', () => {
    if (showing && document.pointerLockElement !== null) document.exitPointerLock();
  }, { signal });

  function hide(): void {
    if (!showing) return;
    showing = false;
    settle();
    hideTip();
    removeEventListener('resize', resize);
    overlay.classList.remove('on');
    options.onClose?.();
    const target = options.lockTarget ?? null;
    if (relock && target !== null && typeof target.requestPointerLock === 'function') {
      // Chrome refuses a lock asked for too soon after one was released; that
      // rejection is noise.
      try {
        const request: unknown = target.requestPointerLock();
        if (request instanceof Promise) request.catch(() => {});
      } catch {
        // The card is closed either way.
      }
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!relock && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  // Outside the book is outside the passport; on the book, only its corners and bookmarks answer.
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) hide();
  }, { signal });
  addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (showing) {
      if (event.code === 'Escape' || actionOf(event.code) === 'passport') {
        event.preventDefault();
        // Not the menu's Escape as well, which would go back a stage behind the card.
        event.stopImmediatePropagation();
        hide();
      } else if (event.code === 'ArrowRight' || event.code === 'PageDown') {
        event.preventDefault();
        turn(spread + 1);
      } else if (event.code === 'ArrowLeft' || event.code === 'PageUp') {
        event.preventDefault();
        turn(spread - 1);
      } else if (event.code === 'Home') {
        event.preventDefault();
        turn(0);
      } else if (event.code === 'End') {
        event.preventDefault();
        turn(newestSpread());
      } else {
        holdFocus(event, panel);
      }
      return;
    }
    if (event.repeat || actionOf(event.code) !== 'passport' || inputBlocked(event)) return;
    event.preventDefault();
    show();
  }, { signal });

  /* --- the stamp that lands ------------------------------------------------ */

  let dropTimer = 0;
  let thudTimer = 0;
  function celebrate(stamp: Stamp): void {
    if (disposed) return;
    askChapters();
    clearTimeout(dropTimer);
    clearTimeout(thudTimer);
    if (!root.isConnected) document.body.append(root);
    // A nation of a world whose chapter has not arrived yet is sealed in the
    // book's own crimson; its chapter colours it once it is in.
    const nation =
      worldOf(stamp.iso) === 'earth'
        ? null
        : nationOf.get(stamp.iso) ?? { iso: stamp.iso, name: stamp.name, color: PALETTE.crimson, world: worldOf(stamp.iso).replace(/^./, (c) => c.toUpperCase()) };
    dropStamp.replaceChildren(stampElement(stamp, nation));
    dropCaption.textContent = `Passport stamped · ${stamp.name}`;
    drop.classList.remove('in', 'out');
    void drop.offsetWidth;
    drop.classList.add('in');
    thudTimer = window.setTimeout(() => options.onThud?.(), DROP_HIT);
    dropTimer = window.setTimeout(() => {
      drop.classList.remove('in');
      drop.classList.add('out');
      dropTimer = window.setTimeout(() => drop.classList.remove('out'), 520);
    }, DROP_HOLD);
    if (showing) {
      settle();
      pages = pagesOf();
      spread = Math.min(spread, spreads() - 1);
      showSpread();
    }
  }

  return {
    root,
    get open() {
      return showing;
    },
    show,
    hide,
    toggle: () => (showing ? hide() : show()),
    celebrate,
    dispose() {
      hide();
      disposed = true;
      clearTimeout(dropTimer);
      clearTimeout(thudTimer);
      events.abort();
      unregisterModal();
      root.remove();
    },
  };
}
