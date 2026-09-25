/**
 * The passport, as a little book you hold: a closed cover first, then
 * spreads of two pages that turn — the holder's page with a portrait, what
 * the traveller has done, the landmarks found, a visa page for every
 * continent, and the stamps, pressed on at whatever angle the hand left them.
 *
 * It is the settings card's kind of object: a modal over the world, holding
 * the keyboard (`registerModal`) and the mouse while it is up, and owning
 * nothing — the book is `passport.ts`'s, the landmarks are the placements'
 * and the portrait is the traveller's own look (`appearance.ts`). `J` opens
 * and closes it (`controls.ts`), as do its button on the HUD's bar and on
 * the pause card.
 *
 * **A book, not a panel.** It opens closed, on a cloth cover with its title
 * pressed in gold; the arrows, a click on either half or the buttons under it
 * turn a leaf, which swings over the spine in 3D with the next page on its
 * back (`turn`), and `Home` and `End` go to the cover and the newest stamps.
 * The pages are paper — a warm ground, a grain and a guilloche of the kind a
 * real passport is printed with, all CSS and inline SVG — and the book is
 * designed at one size (`BOOK_W` by `BOOK_H`) and scaled to the window, so a
 * page never reflows. With less motion asked for, a leaf turns at once.
 *
 * **A stamp is drawn, not painted**: an SVG in one ink, the country's own
 * colour off its flag (`flagColor`, the one the map layer fills it with),
 * with a thin band of the flag's colours as the one thing in a second ink.
 * Its shape — round, a box or an oval — and its tilt come from a hash of the
 * country's code, so Spain's stamp is Spain's in every book; where it lands
 * on its page and how hard it was pressed come from the same hash and its
 * place in the book. What it says is the country, the in-game day of the
 * first visit, the town you came in by and a mark for how you came.
 *
 * **And a new one lands**: `celebrate` drops the stamp onto the screen, big
 * and turning, with a thump when it hits (`onThud`, which the caller makes a
 * sound), holds it a moment and lets it go.
 */
import { flagColor, flagPalette } from './country-colors.ts';
import { actionOf, holdFocus, inputBlocked, registerModal } from './controls.ts';
import { CLOTH, HAIR, SKINS, encodeAppearance } from './appearance.ts';
import type { Appearance } from './appearance.ts';
import { createFlagCanvas } from './flags.ts';
import { PALETTE } from './theme.ts';
import { ensureStyle, h, hex, icon, installUi } from './ui.ts';
import type { IconName } from './ui.ts';
import { stampDateText } from './passport.ts';
import type { Passport, Stamp, StampMode } from './passport.ts';

export interface PassportCardOptions {
  passport: Passport;
  /** Every country on the planet, for the counts and the continents. */
  countries: readonly { iso: string; name: string; continent: string }[];
  /** The landmarks found, and how many there are. */
  landmarks(): { found: readonly { name: string; iso: string }[]; total: number };
  /** Who holds the book: the name the others see, and the look they see it on. */
  holder?(): { name: string; appearance: Appearance };
  /** Where to hand the pointer back to, if it was locked when the card opened. */
  lockTarget?: HTMLElement | null;
  onOpen?(): void;
  onClose?(): void;
  /** A leaf has been turned, or the cover opened or closed. */
  onTurn?(): void;
  /** A new stamp has just hit the page. */
  onThud?(): void;
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
}

/** Stamps a page. */
const PER_PAGE = 6;
/** Natural Earth's continent for the open ocean's islands, which is not one anybody counts. */
const OPEN_OCEAN = 'Seven seas (open ocean)';
/** The continents in the order the visa pages take them, and the ink each is printed in. */
const CONTINENTS: readonly (readonly [string, number])[] = [
  ['Europe', PALETTE.skyBlue],
  ['Asia', PALETTE.crimson],
  ['Africa', PALETTE.orange],
  ['North America', PALETTE.green],
  ['South America', PALETTE.gold],
  ['Oceania', PALETTE.violet],
  ['Antarctica', PALETTE.slate],
];
/** How long a dropped stamp stays, in milliseconds, and when in its fall it hits. */
const DROP_HOLD = 2600;
const DROP_HIT = 330;
/** The book as designed, open, in CSS pixels: two pages of 420 by 560. */
const BOOK_W = 840;
const BOOK_H = 560;
/** Room round the book for the buttons under it and the window's edge. */
const BOOK_MARGIN_X = 32;
const BOOK_MARGIN_Y = 130;
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

const STYLE = `
.atlas-passport {
  position: fixed;
  inset: 0;
  z-index: 12;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(30, 6, 3, 0.58);
  backdrop-filter: blur(4px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0s 0.2s;
  font-family: var(--ui-font);
  color: var(--ui-ink);
}
.atlas-passport.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.p-panel { display: flex; flex-direction: column; align-items: center; gap: 14px; outline: none; }
.atlas-passport.on .p-panel { animation: ui-pop 0.36s var(--ui-spring) both; }
.p-fit { position: relative; }
.p-scaler { position: absolute; left: 0; top: 0; width: ${BOOK_W}px; height: ${BOOK_H}px; transform-origin: 0 0; }
.p-book {
  position: relative;
  width: 100%;
  height: 100%;
  perspective: 2400px;
  transition: transform 0.55s var(--ui-ease);
  cursor: pointer;
}
.p-book.closed { transform: translateX(-25%); }
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
.p-h { margin: 6px 0 12px; font-size: 12px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.58; }
.p-rule { height: 0; border-top: 1.5px dashed var(--ui-rule); margin: 12px 0; }

/* --- the cover ----------------------------------------------------------------- */
.p-page.cover {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 44px 30px 40px;
  color: var(--ui-gold);
  background-color: ${LEATHER};
  background-image: ${WEAVE}, radial-gradient(ellipse at 40% 30%, rgba(255, 255, 255, 0.1), transparent 60%), linear-gradient(90deg, ${LEATHER_DEEP}, transparent 14%);
  border-radius: 4px 16px 16px 4px;
  box-shadow: inset 0 0 0 9px ${LEATHER}, inset 0 0 0 10.5px rgba(228, 169, 12, 0.45), 6px 8px 0 rgba(30, 6, 3, 0.35);
}
.p-page.cover::after { display: none; }
.p-emboss { text-shadow: 0 1.5px 0 rgba(30, 6, 3, 0.55), 0 -1px 0 rgba(255, 235, 180, 0.25); }
.p-cover-top { font-size: 15px; font-weight: 800; letter-spacing: 0.5em; margin-right: -0.5em; }
.p-cover-emblem { width: 168px; height: 168px; filter: drop-shadow(0 1.5px 0 rgba(30, 6, 3, 0.55)); }
.p-cover-title { font-size: 44px; font-weight: 800; letter-spacing: 0.2em; margin-right: -0.2em; line-height: 1; }
.p-cover-sub { margin-top: 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.24em; opacity: 0.8; text-align: center; }
.p-cover-chip { width: 44px; height: 30px; }
.p-page.endpaper {
  background-color: ${LEATHER};
  background-image: ${WEAVE}, repeating-linear-gradient(45deg, rgba(228, 169, 12, 0.1) 0 2px, transparent 2px 14px), repeating-linear-gradient(-45deg, rgba(228, 169, 12, 0.1) 0 2px, transparent 2px 14px);
  display: grid;
  place-items: center;
}
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

/* --- the record ---------------------------------------------------------------- */
.p-counts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.p-count { padding: 10px 12px; border: 2px solid rgba(30, 6, 3, 0.7); border-radius: 10px; background: rgba(255, 255, 255, 0.5); }
.p-count b { display: block; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.p-count b small { font-size: 13px; opacity: 0.5; }
.p-count span { font-size: 11.5px; font-weight: 700; opacity: 0.62; }
.p-bar { height: 6px; margin-top: 6px; border-radius: 3px; background: var(--ui-rule); overflow: hidden; }
.p-bar i { display: block; height: 100%; background: var(--ui-gold); }
.p-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 5px; font-size: 13px; font-weight: 700; }
.p-list li { display: flex; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-list li canvas { flex: none; width: 21px; height: 14px; border: 1.5px solid var(--ui-ink); border-radius: 3px; }
.p-list li em { margin-left: auto; font-style: normal; font-size: 11px; font-weight: 700; opacity: 0.5; }
.p-found { display: flex; flex-wrap: wrap; gap: 6px; }
.p-found span { padding: 3px 9px; border: 2px solid var(--ui-ink); border-radius: 999px; background: rgba(255, 255, 255, 0.6); font-size: 12px; font-weight: 700; }
.p-none { font-size: 12.5px; font-weight: 600; opacity: 0.55; }

/* --- a visa -------------------------------------------------------------------- */
.p-visa-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.p-visa-head svg { flex: none; width: 46px; height: 46px; }
.p-visa-head b { display: block; font-size: 22px; font-weight: 800; letter-spacing: 0.02em; line-height: 1.05; }
.p-visa-head small { display: block; font-size: 10px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.55; }
.p-visa-grant {
  position: absolute;
  right: 30px;
  bottom: 50px;
  padding: 8px 14px;
  border: 3px double currentColor;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-align: center;
  line-height: 1.3;
  transform: rotate(-8deg);
  opacity: 0.85;
  mix-blend-mode: multiply;
}
.p-visa-grant small { display: block; font-size: 10px; letter-spacing: 0.08em; }
.p-visa-empty {
  position: absolute;
  right: 30px;
  bottom: 50px;
  width: 150px;
  height: 78px;
  display: grid;
  place-items: center;
  border: 2px dashed var(--ui-rule);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.6;
}

/* --- the stamps ---------------------------------------------------------------- */
.p-stamps { position: relative; display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(3, 1fr); height: 100%; }
.p-slot { display: grid; place-items: center; }
.p-stamp { width: 150px; height: 112px; transform: translate(var(--dx, 0px), var(--dy, 0px)) rotate(var(--tilt, 0deg)) scale(var(--press, 1)); }
.p-stamp svg { display: block; width: 100%; height: 100%; overflow: visible; }
.p-slots-empty { position: absolute; inset: 40% 10% auto; text-align: center; font-size: 12.5px; font-weight: 700; opacity: 0.45; }

/* --- under the book ---------------------------------------------------------------- */
.p-nav { display: flex; align-items: center; gap: 10px; }
.p-nav output { min-width: 150px; text-align: center; font-size: 13px; font-weight: 800; color: var(--ui-paper); opacity: 0.85; font-variant-numeric: tabular-nums; }
.p-close { margin-left: 14px; }

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
  .p-book { transition: none; }
  .atlas-stamp-drop.in { animation: ui-fade 0.2s ease both; }
}
`;

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

/**
 * A stamp as it sits in the book: its country's own tilt, and where on its
 * spot it landed, how much further it turned and how hard it was pressed,
 * from its place in the book — the same every time the page is turned to.
 * `place` below zero is the stamp that drops, square on its spot.
 */
function stampElement(stamp: Stamp, place: number): HTMLElement {
  const { svg, tilt } = stampSvg(stamp);
  const element = h('div', { class: 'p-stamp', html: svg });
  let turn = tilt;
  if (place >= 0) {
    const a = hashOf(`${stamp.iso}#${place}`);
    const b = hashOf(`${place}@${stamp.iso}`);
    const c = hashOf(`${stamp.date}/${place}`);
    element.style.setProperty('--dx', `${((a - 0.5) * 26).toFixed(1)}px`);
    element.style.setProperty('--dy', `${((b - 0.5) * 20).toFixed(1)}px`);
    element.style.setProperty('--press', (0.92 + c * 0.12).toFixed(3));
    element.style.opacity = (0.8 + a * 0.2).toFixed(2);
    turn += Math.round((c - 0.5) * 12);
  }
  element.style.setProperty('--tilt', `${turn}deg`);
  element.title = `${stamp.name} · ${stampDateText(stamp.date)}${stamp.town === '' ? '' : ` · entered near ${stamp.town}`}`;
  return element;
}

/* --- the pages ------------------------------------------------------------ */

/** The globe on the cover, stroked: the same globe as the UI's, drawn large. */
const EMBLEM =
  '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">' +
  '<circle cx="60" cy="60" r="44" stroke-width="3.2"/>' +
  '<circle cx="60" cy="60" r="52" stroke-width="1.2" stroke-dasharray="2 5"/>' +
  '<ellipse cx="60" cy="60" rx="19" ry="44" stroke-width="2.2"/>' +
  '<path d="M16 60h88M22 38h76M22 82h76" stroke-width="2.2"/>' +
  '<path d="M60 4v8M60 108v8M4 60h8M108 60h8" stroke-width="2.4"/></svg>';
/** The chip mark every e-passport's cover carries. */
const CHIP =
  '<svg viewBox="0 0 44 30" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
  '<rect x="1.5" y="1.5" width="41" height="27" rx="4"/><circle cx="22" cy="15" r="6"/>' +
  '<path d="M1.5 15h14M28 15h14.5"/></svg>';

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

export function createPassportCard(options: PassportCardOptions): PassportCard {
  installUi();
  ensureStyle('atlas-passport', STYLE);
  const { passport } = options;

  const countryOf = new Map(options.countries.map((country) => [country.iso, country]));
  const perContinent = new Map<string, number>();
  for (const country of options.countries) perContinent.set(country.continent, (perContinent.get(country.continent) ?? 0) + 1);
  const continentOrder = [
    ...CONTINENTS.filter(([name]) => perContinent.has(name)),
    ...[...perContinent.keys()]
      .filter((name) => name !== OPEN_OCEAN && !CONTINENTS.some(([known]) => known === name))
      .map((name) => [name, PALETTE.brown] as const),
  ];

  const close = h('button', { class: 'ui-btn small p-close', type: 'button', 'aria-label': 'Close the passport' }, icon('close', 16), 'Close');
  const back = h('button', { class: 'ui-btn small', type: 'button', 'aria-label': 'Previous pages' }, icon('back', 16), 'Back');
  const forward = h('button', { class: 'ui-btn small', type: 'button', 'aria-label': 'Next pages' }, 'Next', icon('next', 16));
  const folio = h('output', { 'aria-live': 'polite' });
  const left = h('div', { class: 'p-side left', role: 'group', 'aria-roledescription': 'page' });
  const right = h('div', { class: 'p-side right', role: 'group', 'aria-roledescription': 'page' });
  const book = h('div', { class: 'p-book closed' }, left, right);
  const scaler = h('div', { class: 'p-scaler' }, book);
  const fit = h('div', { class: 'p-fit' }, scaler);
  const panel = h(
    'div',
    { class: 'p-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Passport', tabindex: '-1' },
    fit,
    h('div', { class: 'p-nav' }, back, folio, forward, close),
  );
  const overlay = h('div', { class: 'atlas-passport' }, panel);

  const dropStamp = h('div');
  const dropCaption = h('div', { class: 'p-caption ui-card' });
  const drop = h('div', { class: 'atlas-stamp-drop', 'aria-live': 'polite' }, dropStamp, dropCaption);
  const root = h('div', {}, overlay, drop);

  /* --- what the pages say ------------------------------------------------ */

  type PageMaker = (side: 'verso' | 'recto') => HTMLElement;

  function page(side: 'verso' | 'recto', number: number | null, running: string, ...children: (HTMLElement | null)[]): HTMLElement {
    return h(
      'div',
      { class: `p-page ${side}` },
      h('div', { class: 'p-running' }, h('span', { text: side === 'verso' ? 'Atlas' : running }), h('span', { text: side === 'verso' ? running : 'Earth' })),
      ...children,
      number === null ? null : h('div', { class: 'p-folio', text: String(number) }),
    );
  }

  function cover(): HTMLElement {
    return h(
      'div',
      { class: 'p-page cover recto' },
      h('div', { class: 'p-cover-top p-emboss', text: 'ATLAS' }),
      h('div', { class: 'p-cover-emblem', html: EMBLEM }),
      h('div', {}, h('div', { class: 'p-cover-title p-emboss', text: 'PASSPORT' }), h('div', { class: 'p-cover-sub p-emboss', text: 'PASSEPORT · PASAPORTE · REISEPASS' })),
      h('div', { class: 'p-cover-chip', html: CHIP }),
    );
  }

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
        h('p', { text: 'Each continent has its visa page, and every landmark you find is written in.' }),
        h('small', { text: stamps.length === 0 ? 'Not yet stamped.' : `First stamp: ${stamps[0]!.name}, ${stampDateText(stamps[0]!.date)}.` }),
      ),
    );
  }

  function holderPage(side: 'verso' | 'recto', number: number): HTMLElement {
    const who = options.holder?.() ?? null;
    const name = who?.name.trim() || 'Traveller';
    const code = who === null ? '' : encodeAppearance(who.appearance);
    const stamps = passport.data.stamps;
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
          field('Look', code === '' ? '—' : code, true),
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

  function count(value: number, total: number | null, label: string): HTMLElement {
    const figure = h('b', {}, String(value), total === null ? null : h('small', { text: ` / ${total}` }));
    const bar = total === null || total === 0 ? null : h('div', { class: 'p-bar' }, h('i'));
    if (bar !== null) (bar.firstElementChild as HTMLElement).style.width = `${Math.min(100, (value / total!) * 100).toFixed(1)}%`;
    return h('div', { class: 'p-count' }, figure, h('span', { text: label }), bar);
  }

  function flagOf(iso: string): HTMLCanvasElement | null {
    try {
      return createFlagCanvas(iso, 42, 28);
    } catch {
      return null;
    }
  }

  function recordPage(side: 'verso' | 'recto', number: number): HTMLElement {
    const stamps = passport.data.stamps;
    const continents = new Set<string>();
    for (const stamp of stamps) {
      const continent = countryOf.get(stamp.iso)?.continent;
      if (continent !== undefined && continent !== OPEN_OCEAN) continents.add(continent);
    }
    const { found, total } = options.landmarks();
    const towns = passport.data.towns;
    const recent = h('ul', { class: 'p-list' });
    for (const key of towns.slice(-7).reverse()) {
      const colon = key.indexOf(':');
      const iso = key.slice(0, colon);
      recent.append(h('li', {}, flagOf(iso), key.slice(colon + 1), h('em', { text: countryOf.get(iso)?.name ?? '' })));
    }
    return page(
      side,
      number,
      'Record',
      h('div', { class: 'p-h', text: 'The holder has visited' }),
      h(
        'div',
        { class: 'p-counts' },
        count(stamps.length, options.countries.length, 'countries'),
        count(continents.size, continentOrder.length, 'continents'),
        count(found.length, total, 'landmarks found'),
        count(towns.length, null, 'towns walked into'),
      ),
      h('div', { class: 'p-rule' }),
      h('div', { class: 'p-h', text: 'Towns walked into, lately' }),
      towns.length === 0 ? h('div', { class: 'p-none', text: 'Walk into a town and it is written here.' }) : recent,
    );
  }

  function landmarksPage(side: 'verso' | 'recto', number: number): HTMLElement {
    const { found, total } = options.landmarks();
    const list = h('div', { class: 'p-found' });
    const shown = found.slice(0, 30);
    for (const landmark of shown) list.append(h('span', { text: landmark.name }));
    if (found.length > shown.length) list.append(h('span', { class: 'p-none', text: `and ${found.length - shown.length} more` }));
    return page(
      side,
      number,
      'Landmarks',
      h('div', { class: 'p-h', text: `Landmarks found · ${found.length} of ${total}` }),
      found.length === 0 ? h('div', { class: 'p-none', text: 'None yet. The minimap’s wedge points at the nearest.' }) : list,
    );
  }

  function visaPage(side: 'verso' | 'recto', number: number, continent: string, tint: number): HTMLElement {
    const ink = inked(tint, 0.35);
    const stamps = passport.data.stamps.filter((stamp) => countryOf.get(stamp.iso)?.continent === continent);
    const of = perContinent.get(continent) ?? 0;
    const list = h('ul', { class: 'p-list' });
    const shown = stamps.slice(0, 10);
    for (const stamp of shown) list.append(h('li', {}, flagOf(stamp.iso), stamp.name, h('em', { text: stampDateText(stamp.date) })));
    if (stamps.length > shown.length) list.append(h('li', { class: 'p-none', text: `and ${stamps.length - shown.length} more` }));
    const first = stamps[0];
    const mark =
      first === undefined
        ? h('div', { class: 'p-visa-empty', text: 'No entry yet' })
        : h('div', { class: 'p-visa-grant' }, 'ENTRY GRANTED', h('small', { text: `${stampDateText(first.date)}${first.town === '' ? '' : ` · ${first.town.toUpperCase()}`}` }));
    if (first !== undefined) mark.style.color = ink;
    const visa = page(
      side,
      number,
      'Visas',
      h(
        'div',
        { class: 'p-visa-head' },
        h('span', { html: seal(ink) }),
        h('div', {}, h('small', { text: 'Visa' }), h('b', { text: continent })),
      ),
      h('div', { class: 'p-h', text: `${stamps.length} of ${of} ${of === 1 ? 'country' : 'countries'}` }),
      stamps.length === 0 ? h('div', { class: 'p-none', text: `Set foot anywhere in ${continent} and the visa is granted.` }) : list,
      mark,
    );
    visa.classList.add('guilloche');
    return visa;
  }

  function stampsPage(side: 'verso' | 'recto', number: number, from: number): HTMLElement {
    const stamps = passport.data.stamps.slice(from, from + PER_PAGE);
    const grid = h('div', { class: 'p-stamps' });
    stamps.forEach((stamp, i) => grid.append(h('div', { class: 'p-slot' }, stampElement(stamp, from + i))));
    if (from === 0 && stamps.length === 0) grid.append(h('div', { class: 'p-slots-empty', text: 'Your stamps go here.' }));
    return page(side, number, 'Stamps', grid);
  }

  function blankPage(side: 'verso' | 'recto', number: number): HTMLElement {
    return page(side, number, 'Notes');
  }

  /**
   * The book as it stands: the cover, the endpaper, the holder, the record,
   * the landmarks, a visa a continent, and the stamps — at least two pages,
   * and enough to hold every stamp — with a blank to close the last spread.
   */
  function pagesOf(): PageMaker[] {
    const pages: PageMaker[] = [() => cover(), () => endpaper()];
    const add = (make: (side: 'verso' | 'recto', number: number) => HTMLElement): void => {
      const number = pages.length;
      pages.push((side) => make(side, number));
    };
    add(holderPage);
    add(recordPage);
    add(landmarksPage);
    for (const [continent, tint] of continentOrder) add((side, number) => visaPage(side, number, continent, tint));
    firstStampPage = pages.length;
    const stampPages = Math.max(2, Math.ceil(passport.data.stamps.length / PER_PAGE));
    for (let i = 0; i < stampPages; i++) add((side, number) => stampsPage(side, number, i * PER_PAGE));
    // Every spread two pages: page 0 is the cover, alone on the right.
    if (pages.length % 2 === 0) add(blankPage);
    return pages;
  }

  /* --- turning ------------------------------------------------------------ */

  /** Where the stamps begin, as `pagesOf` last laid the book out. */
  let firstStampPage = 0;
  let pages = pagesOf();
  /** The spread on show: 0 is the closed cover, `n` shows pages `2n - 1` and `2n`. */
  let spread = 0;
  const spreads = (): number => Math.floor(pages.length / 2) + 1;
  /** The first spread with the newest stamp on it. */
  function newestSpread(): number {
    const at = firstStampPage + Math.max(0, Math.ceil(passport.data.stamps.length / PER_PAGE) - 1);
    return Math.min(spreads() - 1, Math.floor((at + 1) / 2));
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
    return index === 0 ? 'Cover' : index < 0 || index >= pages.length ? '' : `Page ${index}`;
  }

  function showSpread(): void {
    fill(left, sideOf(2 * spread - 1, 'verso'), labelFor(2 * spread - 1));
    fill(right, sideOf(2 * spread, 'recto'), labelFor(2 * spread));
    book.classList.toggle('closed', spread === 0);
    chrome();
  }

  function chrome(): void {
    const last = spreads() - 1;
    folio.textContent = spread === 0 ? 'Cover' : `Pages ${2 * spread - 1}–${Math.min(2 * spread, pages.length - 1)} of ${pages.length - 1}`;
    back.disabled = spread === 0;
    forward.disabled = spread >= last;
    forward.replaceChildren(spread === 0 ? 'Open' : 'Next', icon('next', 16));
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
    const step = target > spread ? 1 : -1;
    const from = spread;
    spread = target;
    options.onTurn?.();
    if (calm.matches || Math.abs(target - from) > 1) {
      // A jump of several spreads, or less motion asked for: straight there.
      showSpread();
      return;
    }
    // Forward: the leaf is the right page lifting, with the next left page on
    // its back; the next right page is already underneath. Backward is the
    // mirror of it over the spine.
    const leaf = h('div', { class: `p-leaf ${step > 0 ? 'forward' : 'back'}` });
    const front = step > 0 ? sideOf(2 * from, 'recto') : sideOf(2 * from - 1, 'verso');
    const behind = step > 0 ? sideOf(2 * target - 1, 'verso') : sideOf(2 * target, 'recto');
    const frontShade = h('div', { class: 'p-shade' });
    const behindShade = h('div', { class: 'p-shade' });
    leaf.append(
      h('div', { class: 'p-face' }, front, frontShade),
      h('div', { class: 'p-face under' }, behind, behindShade),
    );
    if (step > 0) fill(right, sideOf(2 * target, 'recto'), labelFor(2 * target));
    else fill(left, sideOf(2 * target - 1, 'verso'), labelFor(2 * target - 1));
    book.append(leaf);
    book.classList.toggle('closed', target === 0);
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
      if (step > 0) fill(left, sideOf(2 * target - 1, 'verso'), labelFor(2 * target - 1));
      else fill(right, sideOf(2 * target, 'recto'), labelFor(2 * target));
    };
    turning = { animation, shade, done };
    animation.onfinish = () => {
      if (turning?.animation === animation) settle();
    };
  }

  back.addEventListener('click', () => turn(spread - 1));
  forward.addEventListener('click', () => turn(spread + 1));
  // A click on a half of the book turns that half's way, as a hand would;
  // on the closed cover it opens it.
  book.addEventListener('click', (event) => {
    const box = book.getBoundingClientRect();
    const middle = spread === 0 ? box.left + box.width * 0.5 : box.left + box.width / 2;
    turn(spread === 0 || event.clientX >= middle ? spread + 1 : spread - 1);
  });

  /** The book at the largest size up to its own that the window holds. */
  function resize(): void {
    const scale = Math.max(0.3, Math.min(1, (innerWidth - BOOK_MARGIN_X) / BOOK_W, (innerHeight - BOOK_MARGIN_Y) / BOOK_H));
    scaler.style.transform = `scale(${scale.toFixed(4)})`;
    fit.style.width = `${Math.round(BOOK_W * scale)}px`;
    fit.style.height = `${Math.round(BOOK_H * scale)}px`;
  }

  /* --- opening and closing ---------------------------------------------- */

  let showing = false;
  let relock = false;
  let previousFocus: HTMLElement | null = null;
  registerModal(() => showing);

  function show(opening: { relock?: boolean } = {}): void {
    if (showing) return;
    showing = true;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = options.lockTarget ?? null;
    relock = opening.relock ?? (target !== null && document.pointerLockElement === target);
    options.onOpen?.();
    if (document.pointerLockElement) document.exitPointerLock();
    // Closed, on its cover: the book is opened by the one who holds it.
    pages = pagesOf();
    spread = 0;
    showSpread();
    resize();
    addEventListener('resize', resize);
    if (!root.isConnected) document.body.append(root);
    overlay.classList.add('on');
    forward.focus({ preventScroll: true });
  }

  // A lock granted while the card is up is handed straight back, as the settings card does.
  document.addEventListener('pointerlockchange', () => {
    if (showing && document.pointerLockElement !== null) document.exitPointerLock();
  });

  function hide(): void {
    if (!showing) return;
    showing = false;
    settle();
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

  close.addEventListener('click', () => hide());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) hide();
  });
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
  });

  /* --- the stamp that lands ------------------------------------------------ */

  let dropTimer = 0;
  let thudTimer = 0;
  function celebrate(stamp: Stamp): void {
    clearTimeout(dropTimer);
    clearTimeout(thudTimer);
    if (!root.isConnected) document.body.append(root);
    dropStamp.replaceChildren(stampElement(stamp, -1));
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
  };
}
