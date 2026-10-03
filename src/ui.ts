/**
 * The card language every overlay speaks, written once.
 *
 * **Four files used to restate it** — `index.html`, `hud.ts`, `map.ts` and
 * `menu.ts` each carried their own copy of the cream card with the 3 px ink
 * rim and the hard 5 px drop, and their own `kbd`. They agreed because they
 * were copied on the same afternoon, which is not the same thing as agreeing.
 * This file is the one definition of the pieces the start menu, the HUD, the
 * settings panel and the world map are built from: the tokens, the card, the
 * button, the key cap, the switch, the slider, the segmented control, the
 * focus ring and the icons — and of the two one-liners every canvas and
 * stylesheet here needs, `hex` and `FONT`.
 *
 * The look is the world's own. The world is inked — `OutlineEffect` draws a
 * black line round every mesh and the fills are flat cel bands — so the UI is
 * inked too: flat fills from `PALETTE`, a solid ink rim, and a *hard* shadow
 * with no blur, which is what a sticker on a comic panel has and what a
 * soft-shadowed glass card would never have.
 *
 * **The icons are code, not files.** The world does ship external assets now —
 * the people, the vehicles, the animals, the plants and many of the near
 * towns' buildings are CC0 models from Kenney, Quaternius, KayKit and others,
 * baked into `public/models/` with their licences beside them — but an icon is
 * not worth a request: each is a few SVG strokes on a 24-unit grid, drawn in
 * the ink's own weight so an icon on a button reads as the same pen as the
 * button's rim, and stroked in `currentColor` so it takes its button's colour.
 * The two that are geometry rather than strokes — the gear and the star — are
 * generated rather than typed, so their teeth and points are exact.
 *
 * `index.html` restates the tokens once, for the loading screen, because it
 * paints before this module has been fetched. Nothing else may.
 */

import { PALETTE } from './theme.ts';

export const FONT = 'ui-rounded, "SF Pro Rounded", "Segoe UI", ui-sans-serif, system-ui, sans-serif';

/**
 * A palette entry as CSS, for a stylesheet or a canvas. The one copy: the maps,
 * the names and the menu all import it.
 */
export const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * The space the solar system is drawn against.
 *
 * `sun.ts` mixes the sky dome toward `vec3(0.016, 0.024, 0.055)` from orbit and
 * writes it without a colour-space conversion, so that triple *is* the
 * displayed colour. The menu's background has to be the same pixel or the
 * dome's edge shows as a disc when the camera leaves it; this is it in hex.
 */
const SPACE_CSS = '#04060e';

/* ------------------------------------------------------------------------- *
 * The stylesheet
 * ------------------------------------------------------------------------- */

const STYLE = `
:root {
  --ui-ink: ${hex(PALETTE.ink)};
  --ui-paper: ${hex(PALETTE.white)};
  --ui-cream: ${hex(PALETTE.cream)};
  --ui-gold: ${hex(PALETTE.gold)};
  --ui-apricot: ${hex(PALETTE.apricot)};
  --ui-crimson: ${hex(PALETTE.crimson)};
  --ui-violet: ${hex(PALETTE.violet)};
  --ui-sky: ${hex(PALETTE.skyBlue)};
  --ui-green: ${hex(PALETTE.green)};
  --ui-space: ${SPACE_CSS};
  --ui-muted: rgba(30, 6, 3, 0.6);
  --ui-rule: rgba(30, 6, 3, 0.14);
  --ui-font: ${FONT};
  --ui-radius: 14px;
  --ui-drop: 0 5px 0 var(--ui-ink);
  --ui-spring: cubic-bezier(0.2, 1.35, 0.4, 1);
  --ui-ease: cubic-bezier(0.2, 0.9, 0.25, 1);
  /* Where the keyboard is. Violet, which no card or button is painted in, so
     the ring reads as the keyboard and never as a state. The pieces below and
     the menu's own controls draw it; anything focusable an overlay adds should
     draw this one rather than a ring of its own. */
  --ui-ring: 3px solid var(--ui-violet);
}

.ui-card {
  background: var(--ui-paper);
  color: var(--ui-ink);
  border: 3px solid var(--ui-ink);
  border-radius: var(--ui-radius);
  box-shadow: var(--ui-drop);
  font-family: var(--ui-font);
}

.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: var(--ui-font);
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1;
  color: var(--ui-ink);
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  border-radius: 11px;
  box-shadow: 0 4px 0 var(--ui-ink);
  padding: 9px 15px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.09s ease, box-shadow 0.09s ease, background 0.15s ease, opacity 0.2s ease;
}
.ui-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 0 var(--ui-ink); }
.ui-btn:active { transform: translateY(4px); box-shadow: 0 0 0 var(--ui-ink); }
.ui-btn:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.ui-btn.primary { background: var(--ui-gold); }
.ui-btn.quiet { background: var(--ui-cream); }
.ui-btn.big { font-size: 17px; padding: 13px 22px; border-radius: 13px; }
.ui-btn.icon { width: 44px; height: 44px; padding: 0; border-radius: 12px; }
.ui-btn.small { font-size: 12.5px; padding: 6px 10px; border-radius: 9px; box-shadow: 0 3px 0 var(--ui-ink); }
.ui-btn.small:hover { box-shadow: 0 4px 0 var(--ui-ink); }
.ui-btn svg { width: 20px; height: 20px; flex: none; }
.ui-btn.small svg { width: 16px; height: 16px; }
.ui-btn[disabled] { opacity: 0.45; cursor: default; transform: none; box-shadow: 0 4px 0 var(--ui-ink); }
.ui-btn .ui-kbd { margin-left: 2px; }
.ui-btn .quiet { font-weight: 700; opacity: 0.62; }

.ui-kbd {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  font: 800 11.5px/1 var(--ui-font);
  letter-spacing: 0;
  color: var(--ui-ink);
  background: var(--ui-paper);
  border: 2px solid var(--ui-ink);
  border-radius: 6px;
  box-shadow: 0 2px 0 var(--ui-ink);
  vertical-align: middle;
  white-space: nowrap;
}
.ui-kbd.wide { min-width: 44px; }

.ui-eyebrow {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.55;
}
.ui-flag {
  display: block;
  flex: none;
  border: 2px solid var(--ui-ink);
  border-radius: 4px;
}
.ui-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px 3px 7px;
  border: 2px solid var(--ui-ink);
  border-radius: 999px;
  background: var(--ui-cream);
  white-space: nowrap;
}
.ui-tag svg { width: 12px; height: 12px; }
.ui-tag.gold { background: var(--ui-gold); }
.ui-tag.ink { background: var(--ui-ink); color: var(--ui-paper); }

/* A switch is a button with role=switch; aria-checked is the whole state. */
.ui-switch {
  position: relative;
  flex: none;
  width: 50px;
  height: 28px;
  padding: 0;
  border: 3px solid var(--ui-ink);
  border-radius: 999px;
  background: var(--ui-cream);
  box-shadow: 0 3px 0 var(--ui-ink);
  cursor: pointer;
  transition: background 0.18s ease;
}
.ui-switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--ui-ink);
  transition: transform 0.22s var(--ui-spring), background 0.18s ease;
}
.ui-switch[aria-checked='true'] { background: var(--ui-gold); }
.ui-switch[aria-checked='true']::after { transform: translateX(22px); background: var(--ui-paper); box-shadow: 0 0 0 2px var(--ui-ink); }
.ui-switch:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }

/* The slider paints its own fill: --fill is set by whoever owns the value. */
.ui-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 14px;
  margin: 0;
  border: 2.5px solid var(--ui-ink);
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ui-gold) 0 var(--fill, 50%), var(--ui-cream) var(--fill, 50%) 100%);
  cursor: pointer;
}
.ui-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  box-shadow: 0 3px 0 var(--ui-ink);
}
.ui-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  box-shadow: 0 3px 0 var(--ui-ink);
}
.ui-range:focus-visible { outline: var(--ui-ring); outline-offset: 4px; }

.ui-seg {
  display: inline-flex;
  padding: 3px;
  gap: 3px;
  border: 3px solid var(--ui-ink);
  border-radius: 12px;
  background: var(--ui-cream);
  box-shadow: 0 3px 0 var(--ui-ink);
}
.ui-seg button {
  font: 800 12.5px/1 var(--ui-font);
  color: var(--ui-ink);
  background: transparent;
  border: 0;
  border-radius: 8px;
  padding: 7px 11px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.ui-seg button:hover { background: rgba(30, 6, 3, 0.08); }
.ui-seg button[aria-pressed='true'] { background: var(--ui-ink); color: var(--ui-paper); }
.ui-seg button:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }

@keyframes ui-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.96); }
  to { opacity: 1; transform: none; }
}
@keyframes ui-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ui-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .ui-btn, .ui-switch, .ui-switch::after { transition: none; }
}
`;

/**
 * Put the stylesheet in the document once, whoever asks first.
 *
 * The menu, the HUD and the settings panel all arrive as separate dynamic
 * imports in an order `main.ts` decides, so none of them can assume another
 * has already done it. An id is the whole of the bookkeeping.
 */
export function ensureStyle(id: string, css: string): void {
  if (document.getElementById(id) !== null) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

export function installUi(): void {
  ensureStyle('atlas-ui', STYLE);
}

/* ------------------------------------------------------------------------- *
 * Building DOM without a framework
 * ------------------------------------------------------------------------- */

type Child = Node | string | number | null | undefined | false;

interface Attributes {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  [attribute: string]: string | number | boolean | undefined;
}

/**
 * `h('div', { class: 'x' }, child, child)`.
 *
 * Twelve lines instead of a framework, because every overlay here is built once
 * and then only ever has its text, its classes and its transforms written — a
 * virtual DOM would be diffing a tree that never changes shape.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') element.className = String(value);
    else if (key === 'text') element.textContent = String(value);
    else if (key === 'html') element.innerHTML = String(value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === 'number' ? String(child) : child);
  }
  return element;
}

/** A key cap. */
export const kbd = (label: string, wide = false): HTMLElement =>
  h('span', { class: wide ? 'ui-kbd wide' : 'ui-kbd', text: label });

/* ------------------------------------------------------------------------- *
 * The icons
 * ------------------------------------------------------------------------- */

/** A cog with `teeth` flat-topped teeth, as one closed path round the centre. */
function gearPath(teeth: number, inner: number, outer: number): string {
  const step = (Math.PI * 2) / teeth;
  const land = step * 0.26;
  const flank = step * 0.12;
  const point = (angle: number, radius: number): string =>
    `${(12 + Math.cos(angle) * radius).toFixed(2)} ${(12 + Math.sin(angle) * radius).toFixed(2)}`;
  const parts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step - step / 2;
    parts.push(
      `${i === 0 ? 'M' : 'L'}${point(a, inner)}`,
      `L${point(a + flank, outer)}`,
      `L${point(a + flank + land, outer)}`,
      `L${point(a + flank * 2 + land, inner)}`,
    );
  }
  return `${parts.join(' ')} Z`;
}

/** A five-pointed star, outer points on a circle of `outer`. */
function starPath(outer: number, inner: number): string {
  const parts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? outer : inner;
    parts.push(`${i === 0 ? 'M' : 'L'}${(12 + Math.cos(angle) * radius).toFixed(2)} ${(12.6 + Math.sin(angle) * radius).toFixed(2)}`);
  }
  return `${parts.join(' ')} Z`;
}

/**
 * The strokes, on a 24-unit grid. `fill` marks the ones drawn solid; the rest
 * are stroked in `currentColor`, so an icon takes its button's colour.
 */
const ICONS: Record<string, string> = {
  gear: `<path d="${gearPath(8, 7.2, 10.2)}"/><circle cx="12" cy="12" r="3"/>`,
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  star: `<path d="${starPath(9.6, 4.1)}"/>`,
  back: '<path d="M19 12H5.5"/><path d="m11 5.5-6.5 6.5 6.5 6.5"/>',
  next: '<path d="M5 12h13.5"/><path d="m13 5.5 6.5 6.5-6.5 6.5"/>',
  chevron: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.3"/><path d="m15.3 15.3 5.2 5.2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  dice:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/>' +
    '<circle cx="8.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor"/>' +
    '<circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor"/>' +
    '<circle cx="8.5" cy="15.5" r="1.1" fill="currentColor"/>',
  globe: '<circle cx="12" cy="12" r="8.8"/><path d="M3.4 12h17.2"/><path d="M12 3.2c2.6 2.4 3.9 5.3 3.9 8.8s-1.3 6.4-3.9 8.8c-2.6-2.4-3.9-5.3-3.9-8.8s1.3-6.4 3.9-8.8z"/>',
  sun:
    '<circle cx="12" cy="12" r="4.2"/>' +
    '<path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  moon: '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>',
  // The weather, for the clock: one cloud, and what falls from it.
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.4 9.1 4.7 4.7 0 0 0 7 18.5z"/>',
  rain: '<path d="M7 15.5h10.5a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 8.2 7.3 4.1 4.1 0 0 0 7 15.5z"/><path d="m8.5 18.5-1 2.5M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5"/>',
  storm: '<path d="M7 15.5h10.5a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 8.2 7.3 4.1 4.1 0 0 0 7 15.5z"/><path d="m12.8 16.5-2.3 3.2h3l-2 2.8"/>',
  snow: '<path d="M7 15.5h10.5a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 8.2 7.3 4.1 4.1 0 0 0 7 15.5z"/><path d="M8 19h.01M12 20.5h.01M16 19h.01M10 22h.01M14 22h.01"/>',
  fog: '<path d="M4 8.5h16M6.5 12.5h13M4 16.5h13M8 20.5h10"/>',
  orbit: '<circle cx="12" cy="12" r="3.3"/><ellipse cx="12" cy="12" rx="10" ry="4.3" transform="rotate(-24 12 12)"/>',
  plane:
    '<path d="M21 4.2c-.7-.7-2-.5-3 .5l-3.3 3.3-8.2-2.4-2 2 6.6 3.6-3.1 3.2-2.6-.4-1.6 1.6 3.6 1.9 1.9 3.6 1.6-1.6-.4-2.6 3.2-3.1 3.6 6.6 2-2-2.4-8.2 3.3-3.3c1-1 1.2-2.3.5-3z"/>',
  boat: '<path d="M3 15.5h18l-2.6 4.5H5.6z"/><path d="M12 3.5v12"/><path d="M12 4.5 18.5 13H12"/><path d="M12 7 7 13h5"/>',
  car: '<path d="M3.5 16.5v-4l2.2-5h12.6l2.2 5v4z"/><path d="M3.5 12.5h17"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/>',
  bike: '<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l3.6-6.5h6.2L18 16"/><path d="M9.6 9.5 12.5 16h5.5"/><path d="M8.3 6.5h3"/><path d="m14.8 6.5 1 3"/>',
  moto: '<circle cx="5.5" cy="16.5" r="3.2"/><circle cx="18.5" cy="16.5" r="3.2"/><path d="M5.5 16.5h5.5l3.2-5h3.3l1 5"/><path d="M8 11.5h5.5"/><path d="M14.8 7.5h2.6l.8 4"/>',
  horse: '<path d="M5.5 20.5v-5.5l1.8-4h6.6l3.4-5 2.6 1.3-.8 2.7 1.8 1.8v2l-2 .4-2-1.4-1.2 2.9v4.8"/><path d="M8.5 15.5v5M12.5 15.5v5"/><path d="M5.5 12.5 3.5 15"/>',
  jetski: '<path d="M3 15.5h14l4-3.2H8.2L6.3 9.4H3.8z"/><path d="m11.2 12.3 1.6-4h3.2"/><path d="M2.5 19.5c1.6 0 1.6-1.1 3.2-1.1s1.6 1.1 3.2 1.1 1.6-1.1 3.2-1.1 1.6 1.1 3.2 1.1 1.6-1.1 3.2-1.1 1.5 1.1 3 1.1"/>',
  heli: '<path d="M3 5h18"/><path d="M12 5v3.5"/><path d="M5.5 12.8a4.3 4.3 0 0 1 4.3-4.3h3.4a4.3 4.3 0 0 1 0 8.6H8.2"/><path d="M17.5 12.8h4v-2.3"/><path d="M6.5 20h10M9 17.1v2.9M14.5 17.1v2.9"/>',
  sub: '<path d="M3.5 14.5c0-2.5 3.8-4.5 8.5-4.5s8.5 2 8.5 4.5-3.8 4.5-8.5 4.5-8.5-2-8.5-4.5z"/><path d="M9.5 10.2V7h4.5l.8 3.2"/><path d="M12 7V4.5h2"/><circle cx="15.5" cy="14.5" r="1.2"/><path d="M3.5 14.5 1.8 12.5v4z"/>',
  swim: '<circle cx="16" cy="6" r="2"/><path d="M4 12.5 9 9l3.5 2.5 3-2"/><path d="M2.5 17c1.6 0 1.6-1.2 3.2-1.2s1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.5 1.2 3 1.2"/>',
  balloon: '<path d="M12 3a6.5 6.5 0 0 0-6.5 6.5c0 3.6 3.6 6.4 5 7.5h3c1.4-1.1 5-3.9 5-7.5A6.5 6.5 0 0 0 12 3z"/><path d="m10.5 17 .5 2.5h2l.5-2.5"/><rect x="10" y="19.5" width="4" height="2" rx=".5"/>',
  seat: '<path d="M7 3.5v10h9.5"/><path d="M7 13.5 5.5 20.5"/><path d="m16.5 13.5 1.5 7"/><path d="M7 9.5h7"/>',
  walk: '<circle cx="13" cy="4.6" r="2"/><path d="m10 21 2.4-6.4 2.6 2.4v4"/><path d="M7.5 11.5 10 8.5l3.5-.5 2 3 3 1"/><path d="m12.4 14.6.6-6.4"/>',
  keyboard:
    '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/>' +
    '<path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M6.5 14h.01M17 14h.01M9.5 14h5"/>',
  play: '<path d="M7.5 4.8v14.4L19 12z" fill="currentColor"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  flag: '<path d="M5.5 21V3.5"/><path d="M5.5 4.5h11.5l-2.4 4 2.4 4H5.5"/>',
  // A booklet with a globe on its cover: the passport.
  passport:
    '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10.5" r="3.4"/>' +
    '<path d="M8.6 10.5h6.8M12 7.1c1 1 1.4 2.1 1.4 3.4s-.4 2.4-1.4 3.4c-1-1-1.4-2.1-1.4-3.4s.4-2.4 1.4-3.4z"/><path d="M9 17h6"/>',
  sound: '<path d="M4 9.5h3.6L12.5 5v14l-4.9-4.5H4z"/><path d="M15.8 9a4.2 4.2 0 0 1 0 6M18.4 6.4a7.8 7.8 0 0 1 0 11.2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  gauge: '<path d="M4.2 17.5a9 9 0 1 1 15.6 0"/><path d="m12 13.2 4.2-4.7"/><circle cx="12" cy="13.5" r="1.4" fill="currentColor"/>',
  mouse: '<rect x="5.5" y="2.5" width="13" height="19" rx="6.5"/><path d="M12 2.5v7.5"/><path d="M5.5 10h13"/>',
  clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7v5l3.4 2"/>',
  layers: '<path d="m12 3.5 9 4.8-9 4.8-9-4.8z"/><path d="m3 12.3 9 4.8 9-4.8"/><path d="m3 16.2 9 4.8 9-4.8"/>',
  help: '<circle cx="12" cy="12" r="8.8"/><path d="M9.4 9.3a2.7 2.7 0 1 1 3.8 2.5c-.8.4-1.2 1-1.2 1.8v.4"/><path d="M12 17h.01"/>',
  link: '<path d="M13.5 4.5h6v6M19.5 4.5 11 13"/><path d="M17.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h5"/>',
  expand: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',
  camera: '<path d="M4 8h3.2l1.6-2.5h6.4L16.8 8H20v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>',
  talk: '<path d="M4 5.5h16v10H11l-4.5 4v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  sparkle: '<path d="M12 3.5c.8 4.4 2.6 6.4 7 7.5-4.4 1.1-6.2 3.1-7 7.5-.8-4.4-2.6-6.4-7-7.5 4.4-1.1 6.2-3.1 7-7.5z"/>',
};

/** Solid rather than stroked, because a star drawn in outline reads as unearned. */
const FILLED = new Set(['star', 'play']);

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 20): SVGSVGElement {
  const holder = document.createElement('span');
  const fill = FILLED.has(name) ? 'currentColor' : 'none';
  holder.innerHTML =
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill}" stroke="currentColor" ` +
    `stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
  return holder.firstElementChild as SVGSVGElement;
}

/* ------------------------------------------------------------------------- *
 * Numbers people read
 * ------------------------------------------------------------------------- */

/** A distance on the real Earth, to the kilometre: *5,000 km*, *20,015 km*. */
export const km = (value: number): string => `${Math.round(value).toLocaleString('en')} km`;

/** 409,661 and 3.2 million, never 3,190,000: a menu is not a census. */
export function people(count: number): string {
  if (count >= 1e6) return `${(count / 1e6).toFixed(count >= 1e7 ? 0 : 1)} million people`;
  return `${Math.round(count).toLocaleString('en')} people`;
}

/**
 * Lower-case and without accents, so *Malaga* finds Málaga and *sao paulo*
 * finds São Paulo. The one normaliser the search uses on both sides.
 */
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
