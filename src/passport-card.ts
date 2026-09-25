/**
 * The passport, as a book: the holder's page with what the traveller has
 * done — countries, continents, landmarks, towns — and then the stamps, six a
 * page, two pages a spread, turned with the arrows or the keys.
 *
 * It is the settings card's kind of object: a modal over the world, holding
 * the keyboard (`registerModal`) and the mouse while it is up, and owning
 * nothing — the book is `passport.ts`'s and the landmarks are the
 * placements'. `J` opens and closes it (`controls.ts`), as does its button on
 * the pause card.
 *
 * **A stamp is drawn, not painted**: an SVG in one ink, the country's own
 * colour off its flag (`flagColor`, the one the map layer fills it with),
 * with a thin band of the flag's colours as the one thing in a second ink.
 * Its shape — round, a box or an oval — and its tilt come from a hash of the
 * country's code, so Spain's stamp is Spain's in every book; what it says is
 * the country, the in-game day of the first visit, the town you came in by
 * and a mark for how you came.
 *
 * **And a new one lands**: `celebrate` drops the stamp onto the screen, big
 * and turning, with a thump when it hits (`onThud`, which the caller makes a
 * sound), holds it a moment and lets it go.
 */
import { flagColor, flagPalette } from './country-colors.ts';
import { actionOf, holdFocus, inputBlocked, registerModal } from './controls.ts';
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
  /** Where to hand the pointer back to, if it was locked when the card opened. */
  lockTarget?: HTMLElement | null;
  onOpen?(): void;
  onClose?(): void;
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

/** Stamps a page, and the page a spread shows first on its left. */
const PER_PAGE = 6;
/** Natural Earth's continent for the open ocean's islands, which is not one anybody counts. */
const OPEN_OCEAN = 'Seven seas (open ocean)';
/** How long a dropped stamp stays, in milliseconds, and when in its fall it hits. */
const DROP_HOLD = 2600;
const DROP_HIT = 330;

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
};

const STYLE = `
.atlas-passport {
  position: fixed;
  inset: 0;
  z-index: 12;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(30, 6, 3, 0.52);
  backdrop-filter: blur(4px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0s 0.2s;
  font-family: var(--ui-font);
  color: var(--ui-ink);
}
.atlas-passport.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.atlas-passport.on .p-panel { animation: ui-pop 0.32s var(--ui-spring) both; }
.p-panel {
  width: min(900px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  overflow: auto;
  padding: 20px 22px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: thin;
}
.p-head { display: flex; align-items: center; gap: 14px; }
.p-badge {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border: 3px solid var(--ui-ink);
  border-radius: 12px;
  background: ${hex(PALETTE.crimson)};
  color: var(--ui-gold);
  box-shadow: 0 3px 0 var(--ui-ink);
}
.p-badge svg { width: 24px; height: 24px; }
.p-title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
.p-sub { margin-top: 3px; font-size: 12.5px; font-weight: 600; opacity: 0.6; }
.p-close { margin-left: auto; }
.p-book {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 3px solid var(--ui-ink);
  border-radius: 12px;
  overflow: hidden;
  background: ${hex(PALETTE.cream)};
  box-shadow: inset 0 0 0 5px ${hex(PALETTE.white)};
  perspective: 1400px;
}
.p-page {
  position: relative;
  min-height: 390px;
  padding: 18px 18px 30px;
  background:
    repeating-linear-gradient(0deg, transparent 0 23px, rgba(30, 6, 3, 0.045) 23px 24px),
    radial-gradient(circle at 50% 40%, rgba(255, 242, 232, 0.9), rgba(253, 230, 225, 0.6));
  transform-origin: left center;
}
.p-page + .p-page { border-left: 2px dashed var(--ui-rule); transform-origin: right center; }
.p-book.next .p-page { animation: p-turn-next 0.42s var(--ui-ease) both; }
.p-book.prev .p-page { animation: p-turn-prev 0.42s var(--ui-ease) both; }
@keyframes p-turn-next { from { transform: rotateY(-24deg); opacity: 0.2; } to { transform: none; opacity: 1; } }
@keyframes p-turn-prev { from { transform: rotateY(24deg); opacity: 0.2; } to { transform: none; opacity: 1; } }
.p-folio {
  position: absolute;
  bottom: 8px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  opacity: 0.4;
}
.p-stamps { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 8px; }
.p-slot { display: grid; place-items: center; height: 116px; }
.p-slot.empty::before {
  content: '';
  width: 88px;
  height: 88px;
  border: 2px dashed var(--ui-rule);
  border-radius: 50%;
}
.p-stamp { width: 150px; height: 112px; transform: rotate(var(--tilt, 0deg)); }
.p-stamp svg { display: block; width: 100%; height: 100%; overflow: visible; }
.p-holder h3 {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.55;
}
.p-counts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 16px; }
.p-count {
  padding: 10px 12px;
  border: 2.5px solid var(--ui-ink);
  border-radius: 11px;
  background: var(--ui-paper);
  box-shadow: 0 3px 0 var(--ui-ink);
}
.p-count b { display: block; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.p-count b small { font-size: 13px; opacity: 0.5; }
.p-count span { font-size: 12px; font-weight: 700; opacity: 0.6; }
.p-bar { height: 6px; margin-top: 6px; border-radius: 3px; background: var(--ui-rule); overflow: hidden; }
.p-bar i { display: block; height: 100%; background: var(--ui-gold); }
.p-found { display: flex; flex-wrap: wrap; gap: 6px; }
.p-found span {
  padding: 3px 9px;
  border: 2px solid var(--ui-ink);
  border-radius: 999px;
  background: var(--ui-paper);
  font-size: 12px;
  font-weight: 700;
}
.p-found em { font-style: normal; font-size: 12.5px; font-weight: 600; opacity: 0.55; }
.p-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.p-nav output { font-size: 13px; font-weight: 800; opacity: 0.6; font-variant-numeric: tabular-nums; }
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
@media (max-width: 760px) {
  .p-book { grid-template-columns: 1fr; }
  .p-page + .p-page { border-left: 0; border-top: 2px dashed var(--ui-rule); }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-passport.on .p-panel, .p-book.next .p-page, .p-book.prev .p-page { animation: none; }
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

function stampElement(stamp: Stamp): HTMLElement {
  const { svg, tilt } = stampSvg(stamp);
  const element = h('div', { class: 'p-stamp', html: svg });
  element.style.setProperty('--tilt', `${tilt}deg`);
  element.title = `${stamp.name} · ${stampDateText(stamp.date)}${stamp.town === '' ? '' : ` · entered near ${stamp.town}`}`;
  return element;
}

/* --- the card ------------------------------------------------------------ */

const PASSPORT_ICON =
  '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10.5" r="3.4"/>' +
  '<path d="M8.6 10.5h6.8M12 7.1c1 1 1.4 2.1 1.4 3.4s-.4 2.4-1.4 3.4c-1-1-1.4-2.1-1.4-3.4s.4-2.4 1.4-3.4z"/><path d="M9 17h6"/>';

function passportIcon(): SVGSVGElement {
  const holder = document.createElement('span');
  holder.innerHTML =
    `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PASSPORT_ICON}</svg>`;
  return holder.firstElementChild as SVGSVGElement;
}

export function createPassportCard(options: PassportCardOptions): PassportCard {
  installUi();
  ensureStyle('atlas-passport', STYLE);
  const { passport } = options;

  const continents = new Set(options.countries.map((country) => country.continent).filter((name) => name !== OPEN_OCEAN));
  const continentOf = new Map(options.countries.map((country) => [country.iso, country.continent]));

  const close = h('button', { class: 'ui-btn icon p-close', title: 'Close', 'aria-label': 'Close' }, icon('close'));
  const sub = h('div', { class: 'p-sub' });
  const book = h('div', { class: 'p-book' });
  const back = h('button', { class: 'ui-btn small quiet', 'aria-label': 'Previous pages' }, icon('back', 16), 'Back');
  const forward = h('button', { class: 'ui-btn small quiet', 'aria-label': 'Next pages' }, 'Next', icon('next', 16));
  const folio = h('output');
  const panel = h(
    'div',
    { class: 'p-panel ui-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Passport' },
    h(
      'div',
      { class: 'p-head' },
      h('span', { class: 'p-badge' }, passportIcon()),
      h('div', {}, h('div', { class: 'p-title', text: 'Passport' }), sub),
      close,
    ),
    book,
    h('div', { class: 'p-nav' }, back, folio, forward),
  );
  const overlay = h('div', { class: 'atlas-passport' }, panel);

  const dropStamp = h('div');
  const dropCaption = h('div', { class: 'p-caption ui-card' });
  const drop = h('div', { class: 'atlas-stamp-drop', 'aria-live': 'polite' }, dropStamp, dropCaption);
  const root = h('div', {}, overlay, drop);

  /** The first page of the spread on show: 0 is the holder's page and the first stamps. */
  let spread = 0;

  const pageCount = (): number => {
    const stampPages = Math.max(1, Math.ceil(passport.data.stamps.length / PER_PAGE));
    const pages = 1 + stampPages;
    return pages + (pages % 2);
  };

  function count(value: number, total: number | null, label: string): HTMLElement {
    const figure = h('b', {}, String(value), total === null ? null : h('small', { text: ` / ${total}` }));
    const bar = total === null || total === 0 ? null : h('div', { class: 'p-bar' }, h('i'));
    if (bar !== null) (bar.firstElementChild as HTMLElement).style.width = `${Math.min(100, (value / total!) * 100).toFixed(1)}%`;
    return h('div', { class: 'p-count' }, figure, h('span', { text: label }), bar);
  }

  function holderPage(): HTMLElement {
    const stamps = passport.data.stamps;
    const visited = new Set<string>();
    for (const stamp of stamps) {
      const continent = continentOf.get(stamp.iso);
      if (continent !== undefined && continent !== OPEN_OCEAN) visited.add(continent);
    }
    const { found, total } = options.landmarks();
    const list = h('div', { class: 'p-found' });
    if (found.length === 0) list.append(h('em', { text: 'None yet. Tab points you at the nearest.' }));
    const shown = found.slice(0, 18);
    for (const landmark of shown) list.append(h('span', { text: landmark.name }));
    if (found.length > shown.length) list.append(h('em', { text: `and ${found.length - shown.length} more` }));
    return h(
      'div',
      { class: 'p-holder' },
      h('h3', { text: 'The holder has visited' }),
      h(
        'div',
        { class: 'p-counts' },
        count(stamps.length, options.countries.length, 'countries'),
        count(visited.size, continents.size, 'continents'),
        count(found.length, total, 'landmarks found'),
        count(passport.data.towns.length, null, 'towns walked into'),
      ),
      h('h3', { text: 'Landmarks found' }),
      list,
    );
  }

  function stampPage(index: number): HTMLElement {
    const stamps = passport.data.stamps.slice((index - 1) * PER_PAGE, index * PER_PAGE);
    const grid = h('div', { class: 'p-stamps' });
    for (let i = 0; i < PER_PAGE; i++) {
      const stamp = stamps[i];
      grid.append(stamp === undefined ? h('div', { class: 'p-slot empty' }) : h('div', { class: 'p-slot' }, stampElement(stamp)));
    }
    return grid;
  }

  function page(index: number): HTMLElement {
    return h('div', { class: 'p-page' }, index === 0 ? holderPage() : stampPage(index), h('div', { class: 'p-folio', text: String(index + 1) }));
  }

  function render(turn: 'next' | 'prev' | null): void {
    const pages = pageCount();
    spread = Math.max(0, Math.min(spread, pages - 2));
    book.replaceChildren(page(spread), page(spread + 1));
    book.classList.remove('next', 'prev');
    if (turn !== null) {
      void book.offsetWidth;
      book.classList.add(turn);
    }
    folio.textContent = `Pages ${spread + 1}–${spread + 2} of ${pages}`;
    back.disabled = spread === 0;
    forward.disabled = spread + 2 >= pages;
    const stamped = passport.data.stamps.length;
    sub.textContent =
      stamped === 0
        ? 'Walk, sail or drive into a country and it is stamped here. Flying over does not count.'
        : `${stamped} ${stamped === 1 ? 'country' : 'countries'} stamped, the first on ${stampDateText(passport.data.stamps[0]!.date)}.`;
  }

  function turn(step: number): void {
    const before = spread;
    spread = Math.max(0, Math.min(spread + step * 2, pageCount() - 2));
    if (spread !== before) render(step > 0 ? 'next' : 'prev');
  }
  back.addEventListener('click', () => turn(-1));
  forward.addEventListener('click', () => turn(1));

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
    // Open on the newest stamp's spread, where the last arrival is.
    spread = Math.floor(Math.ceil(passport.data.stamps.length / PER_PAGE) / 2) * 2;
    render(null);
    if (!root.isConnected) document.body.append(root);
    overlay.classList.add('on');
    close.focus({ preventScroll: true });
  }

  // A lock granted while the card is up is handed straight back, as the settings card does.
  document.addEventListener('pointerlockchange', () => {
    if (showing && document.pointerLockElement !== null) document.exitPointerLock();
  });

  function hide(): void {
    if (!showing) return;
    showing = false;
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
        turn(1);
      } else if (event.code === 'ArrowLeft' || event.code === 'PageUp') {
        event.preventDefault();
        turn(-1);
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
    dropStamp.replaceChildren(stampElement(stamp));
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
    if (showing) render(null);
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
