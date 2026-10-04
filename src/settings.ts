/**
 * The gear: every setting a player might want to touch, on one card.
 *
 * **Everything here already existed and was reachable only by knowing it was
 * there.** The render distance was `[` and `]`, or `atlas.detail(3)` in a
 * console; the map layer was `B`; the mouse had one speed. Players who tried
 * the world did not find any of them, which is the same as there not being
 * any. So this file owns nothing: each row is a getter and a setter handed in
 * by `main.ts`, which still owns the value and still persists it where it
 * always did, and the keys keep working while the panel is down. The panel is
 * a second way in, not a second copy of the state — it re-reads every value
 * each time it opens, so a change made by a key while it was closed is what it
 * shows.
 *
 * **One line a setting.** The name on the left, its control on the right, and
 * what it is for behind a `?` beside the name, shown on hover and on keyboard
 * focus. Every row used to carry its explanation as a paragraph under the
 * name, and a card of twenty paragraphs is read by nobody.
 *
 * It takes the mouse the way the world map does: opening it releases pointer
 * lock, and closing it asks for the lock back only if it was held when the
 * panel opened, so a player who opened it from the pause card is left on the
 * pause card rather than thrown back into mouse look. **And it holds the
 * keyboard**: it registers with `controls.ts` as modal, so `Tab` walks its own
 * controls and the arrows move its sliders instead of the player.
 *
 * **Four pages, on a rail down the left**: graphics (how far and how much is
 * drawn, the map layer and the hour of the sun), sound, controls, and the
 * credits. It was one long page of everything and a
 * second of keys, and a player looking for the volume read past the render
 * distance to find it. The card keeps one size whichever page is open, so
 * the rail does not jump. The controls page is every key in the game as a
 * table, an action a line and its one or two keys as caps on the right. A cap is the button: press it and the next key is
 * that action's (`captureKey` in `controls.ts`, which swaps a key another
 * action held rather than leave that action with none), `Esc` keeps the old
 * one. `O` opens and closes the card, and says so on the gear.
 */

import {
  BINDINGS,
  CONTROL_SECTIONS,
  actionOf,
  bindingsChanged,
  capOf,
  captureKey,
  holdFocus,
  inputBlocked,
  keyBindable,
  keyLabel,
  labelOf,
  onKeyLabels,
  registerModal,
  resetBindings,
} from './controls.ts';
import type { Action, Captured } from './controls.ts';
import { h, icon, installUi, ensureStyle } from './ui.ts';

export interface Knob {
  get(): number;
  set(value: number): number;
  min: number;
  max: number;
}

export interface Toggle {
  get(): boolean;
  set(on: boolean): boolean;
}

/** One of a few named values: a segmented control. */
export interface Choice {
  get(): string;
  set(value: string): string;
  /** The values in order, each with the word its button shows. */
  options: readonly (readonly [value: string, label: string])[];
}

/**
 * The hour the sun is at, which is real unless the player picks one. Nothing
 * here is remembered: a chosen hour lasts until the page is reloaded.
 */
export interface TimeOfDay {
  /** The hour on the chip's clock, local to where you stand, 0 to 24. */
  hour(): number;
  /** Whether the sun is following the real clock. */
  live(): boolean;
  /** Puts the sun at this local hour, from where it keeps running; returns the hour. */
  setHour(hour: number): number;
  /** Back to the real clock, at the real rate. */
  setLive(): void;
  /** The day at an hour a minute. */
  fast: Toggle;
}

export interface SettingsOptions {
  /** How far the world is built: `view.ts`'s knob, `DETAIL_MIN` to `DETAIL_MAX`. */
  detail: Knob;
  /**
   * What a value of the knob lets you see, in words a player reads as a
   * distance ("1.8 km"): shown beside the slider, so a step of it is a number
   * that changes. Without it the slider says the multiple alone.
   */
  detailDistance?: (value: number) => string;
  /**
   * Whether the knob turns itself by the frame rate (`view.ts`'s automatic
   * detail). Moving the slider by hand turns it off, as the keys do.
   */
  autoDetail?: Toggle;
  /** The map layer: country colours, frontiers and names from the air. */
  flags: Toggle;
  /** Radians of look per pixel of mouse, as a multiple of the default. */
  sensitivity: Knob;
  /** The frame-rate card in the corner. */
  performance: Toggle;
  /** Wakes, smoke, dust and a crash's debris (`effects.ts`). Omit it and the row is not built. */
  effects?: Toggle;
  /** Whether a crash shakes the camera. Omit it and the row is not built. */
  shake?: Toggle;
  /** Rain, snow, storms and fog; off is clear skies. Omit it and the row is not built. */
  weather?: Toggle;
  /** A vehicle's keys, for a moment as you take it (`boardingHints`). */
  hints: Toggle;
  /** How many pixels the world is drawn at, against the screen's own. */
  resolution: Choice;
  /** The sun's hour, live or chosen. Omit it and the row is not built. */
  time?: TimeOfDay;
  /**
   * The soundscape's level and whether it is on, and optionally whether the
   * townsfolk's lines are said aloud and a chat line blips. Omit it and the
   * section is not built.
   */
  sound?: { volume: Knob; on: Toggle; voices?: Toggle; chat?: Toggle };
  /** The music, with its own level and switch, separate from the sound's. Omit it and the rows are not built. */
  music?: { volume: Knob; on: Toggle };
  /** Where to hand the pointer back to, if it was locked when the panel opened. */
  lockTarget: HTMLElement | null;
  /**
   * Whether the settings key opens this card. False for a second card made
   * before the world exists — the title screen's — so one key never opens two.
   */
  key?: boolean;
  /** Called on open, so whatever else holds the screen — the map — can let go. */
  onOpen?(): void;
  /** Called on close. */
  onClose?(): void;
}

/** The card's pages, in the rail's order. */
export type SettingsPage = 'graphics' | 'sound' | 'controls' | 'credits';

export interface Settings {
  root: HTMLElement;
  readonly open: boolean;
  /** Opens on `page`, or on whichever page was open last. */
  show(page?: SettingsPage): void;
  hide(): void;
  toggle(): void;
  /** Takes the card off the page and lets go of every key and label it registered. */
  dispose(): void;
}

/**
 * The detail knob in words.
 *
 * A number like 1.56x says nothing to someone choosing it. The bands are the
 * knob's own geometry — it steps by a quarter of itself, so each word is a few
 * presses of `]` — and the one the world ships at is called what it is.
 */
function detailWord(value: number): string {
  if (value < 0.35) return 'Lightest';
  if (value < 0.7) return 'Light';
  if (value < 1.3) return 'Balanced';
  if (value < 2.2) return 'Far';
  return 'Farthest';
}

/**
 * An action's line on the controls page, from the one table in `controls.ts`:
 * the words before the first middle dot (or colon) are its name, and the rest
 * — what the same key also does in a vehicle or in the air — goes behind the
 * row's `?`, so a line is a name and its keys and never wraps.
 */
function splitLabel(label: string): { name: string; more: string } {
  const at = label.search(/ · |: /);
  if (at < 0) return { name: label, more: '' };
  const more = label.slice(at + (label[at + 1] === ':' ? 2 : 3)).trim();
  return { name: label.slice(0, at), more: more.charAt(0).toUpperCase() + more.slice(1) };
}

const STYLE = `
.atlas-settings {
  position: fixed;
  inset: 0;
  z-index: 8;
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
.atlas-settings.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.atlas-settings.on .atlas-settings-panel { animation: ui-pop 0.32s var(--ui-spring) both; }
.atlas-settings-panel {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1040px, 100%);
  height: min(720px, calc(100vh - 48px));
  padding: 0;
  overflow: hidden;
}
.atlas-settings-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px 18px;
  border-bottom: 2.5px solid var(--ui-rule);
}
.atlas-settings-body {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
}
/* --- the rail: a page a button, its picture and its name ------------------- */
.atlas-settings-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 14px;
  border-right: 2.5px solid var(--ui-rule);
  background: var(--ui-cream);
}
.atlas-settings-rail button {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 10px 12px;
  border: 2.5px solid transparent;
  border-radius: 12px;
  background: transparent;
  font: 800 14.5px/1 var(--ui-font);
  letter-spacing: -0.01em;
  color: var(--ui-ink);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.12s ease;
}
.atlas-settings-rail button svg { flex: none; width: 20px; height: 20px; }
.atlas-settings-rail button:hover { background: rgba(30, 6, 3, 0.07); }
.atlas-settings-rail button[aria-selected='true'] {
  border-color: var(--ui-ink);
  background: var(--ui-gold);
  box-shadow: 0 3px 0 var(--ui-ink);
  transform: translateY(-1px);
}
.atlas-settings-rail button:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.atlas-settings-rail button[hidden] { display: none; }
.atlas-settings-content {
  position: relative;
  min-height: 0;
  overflow: auto;
  padding: 20px 28px 0;
  scrollbar-width: thin;
}
.atlas-settings-page-title { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
.atlas-settings-page-note { margin: 4px 0 0; font-size: 13px; font-weight: 600; line-height: 1.4; opacity: 0.6; }
.atlas-settings-badge {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border: 3px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-gold);
  box-shadow: 0 3px 0 var(--ui-ink);
}
.atlas-settings-badge svg { width: 24px; height: 24px; }
.atlas-settings-title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
.atlas-settings-sub { margin-top: 3px; font-size: 12.5px; font-weight: 600; opacity: 0.6; }
.atlas-settings-close { margin-left: auto; }
.atlas-settings-page { padding-bottom: 24px; }
/* The controls page ends on its foot, which is held to the bottom of the card. */
#atlas-settings-controls { padding-bottom: 0; }
.atlas-settings-page[hidden] { display: none; }
.atlas-settings-section {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 2.5px solid var(--ui-rule);
}
.atlas-settings-page-note + .atlas-settings-section,
.atlas-settings-page-title + .atlas-settings-section { margin-top: 14px; }
.atlas-settings-section > .ui-eyebrow { margin-bottom: 4px; }

/* --- a setting: its name, its ?, its control, on one line ----------------- */
.atlas-settings-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-height: 46px;
  padding: 4px 0;
}
.atlas-settings-row + .atlas-settings-row { border-top: 1.5px dashed var(--ui-rule); }
.atlas-settings-label {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.atlas-settings-side { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.atlas-settings-side .ui-range { width: 240px; }
.atlas-settings-value {
  min-width: 92px;
  text-align: right;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.atlas-settings-value small { display: block; font-size: 11px; font-weight: 700; opacity: 0.55; }

/* --- the ?, and what it says ------------------------------------------------ */
.atlas-settings-tip {
  display: grid;
  place-items: center;
  flex: none;
  width: 19px;
  height: 19px;
  padding: 0;
  border: 2px solid currentColor;
  border-radius: 50%;
  background: transparent;
  font: 800 11px/1 var(--ui-font);
  color: var(--ui-muted);
  cursor: help;
  transition: color 0.15s ease, background 0.15s ease;
}
.atlas-settings-tip:hover, .atlas-settings-tip:focus-visible { color: var(--ui-ink); background: var(--ui-gold); border-color: var(--ui-ink); }
.atlas-settings-tip:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.atlas-settings-bubble {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  z-index: 2;
  width: max-content;
  max-width: 290px;
  padding: 8px 11px;
  border-radius: 10px;
  background: var(--ui-ink);
  color: var(--ui-paper);
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.4;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-3px);
  transition: opacity 0.12s ease, transform 0.12s ease, visibility 0s 0.12s;
}
.atlas-settings-tip:hover + .atlas-settings-bubble,
.atlas-settings-tip:focus-visible + .atlas-settings-bubble {
  opacity: 1;
  visibility: visible;
  transform: none;
  transition-delay: 0.15s, 0.15s, 0s;
}

/* --- the controls page: an action a line, its keys on the right ------------ */
.atlas-settings-binds {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 36px;
}
/* The last line of each column ends on the section's rule, not a dash of its own. */
.atlas-settings-binds > .atlas-settings-bind:nth-last-child(-n + 2):nth-child(odd),
.atlas-settings-binds > .atlas-settings-bind:last-child { border-bottom-color: transparent; }
.atlas-settings-bind {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  border-bottom: 1.5px dashed var(--ui-rule);
  font-size: 14px;
  font-weight: 750;
}
.atlas-settings-bind .atlas-settings-label { font-size: 14px; font-weight: 750; }
.atlas-settings-bind .atlas-settings-label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-settings-keys { display: flex; align-items: center; gap: 6px; flex: none; }
/* The cap is the button: one box, raised, pressed while it listens. */
.atlas-settings-cap {
  display: inline-grid;
  place-items: center;
  min-width: 34px;
  height: 28px;
  padding: 0 9px;
  border: 2px solid var(--ui-ink);
  border-radius: 7px;
  background: var(--ui-paper);
  box-shadow: 0 3px 0 var(--ui-ink);
  font: 800 12.5px/1 var(--ui-font);
  color: var(--ui-ink);
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.09s ease;
}
.atlas-settings-cap:hover { background: var(--ui-cream); }
.atlas-settings-cap:active { box-shadow: 0 1px 0 var(--ui-ink); }
.atlas-settings-cap:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.atlas-settings-cap.spare { box-shadow: 0 2px 0 var(--ui-ink); color: var(--ui-muted); border-color: rgba(30, 6, 3, 0.55); }
.atlas-settings-cap.listening {
  min-width: 96px;
  background: var(--ui-gold);
  animation: atlas-settings-listen 1.1s ease-in-out infinite;
}
.atlas-settings-cap.moved { animation: atlas-settings-moved 0.6s ease; }
.atlas-settings-cap.fixed { cursor: default; background: transparent; box-shadow: none; border-style: dashed; color: var(--ui-muted); }
@keyframes atlas-settings-listen { 50% { background: var(--ui-cream); } }
@keyframes atlas-settings-moved { from { background: var(--ui-gold); } }

/* Held to the bottom of the card, so what a key did is said where it is seen. */
.atlas-settings-foot {
  position: sticky;
  bottom: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: 14px -28px 0;
  padding: 12px 28px 14px;
  border-top: 2.5px solid var(--ui-rule);
  background: var(--ui-paper);
}
.atlas-settings-status { min-height: 17px; font-size: 12.5px; font-weight: 700; line-height: 1.35; color: var(--ui-muted); }
.atlas-settings-status.warn { color: var(--ui-crimson); }

/* --- who made what --------------------------------------------------------- */
.atlas-settings-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.atlas-settings-links .ui-btn { text-decoration: none; }
.atlas-settings-credit {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 14px;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
}
.atlas-settings-credit dt { font-weight: 800; opacity: 0.55; }
.atlas-settings-credit dd { margin: 0; opacity: 0.75; }
.atlas-settings-credit a { color: inherit; text-underline-offset: 2px; }
.atlas-settings-credit a:focus-visible { outline: var(--ui-ring); outline-offset: 2px; border-radius: 3px; }

@media (max-width: 720px) {
  .atlas-settings { padding: 12px; }
  .atlas-settings-panel { height: calc(100vh - 24px); }
  .atlas-settings-head { padding: 14px 16px; }
  .atlas-settings-body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .atlas-settings-rail { flex-direction: row; overflow-x: auto; padding: 10px 12px; border-right: 0; border-bottom: 2.5px solid var(--ui-rule); }
  .atlas-settings-rail button { width: auto; flex: none; }
  .atlas-settings-content { padding: 16px 16px 0; }
  .atlas-settings-foot { margin: 14px -16px 0; padding: 12px 16px 14px; }
  .atlas-settings-binds { grid-template-columns: 1fr; }
  .atlas-settings-row { grid-template-columns: 1fr; gap: 6px; padding: 8px 0; }
  .atlas-settings-side { justify-content: flex-start; flex-wrap: wrap; }
  .atlas-settings-side .ui-range { width: 160px; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-settings.on .atlas-settings-panel { animation: none; }
  .atlas-settings-rail button { transition: none; }
  .atlas-settings-cap, .atlas-settings-cap.listening, .atlas-settings-cap.moved { animation: none; transition: none; }
  .atlas-settings-bubble { transition: none; }
}
`;

/** `HH:MM` for an hour of the day, 0 to 24. */
function hourText(hour: number): string {
  const minutes = Math.round(hour * 60) % 1440;
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** The first key of an action's after its own whose cap reads differently: the second cap, if any. */
function spareSlot(codes: readonly string[]): number {
  const own = keyLabel(codes[0]!);
  for (let i = 1; i < codes.length; i++) if (keyLabel(codes[i]!) !== own) return i;
  return -1;
}

export function createSettings(options: SettingsOptions): Settings {
  installUi();
  ensureStyle('atlas-settings', STYLE);
  /** Every listener the card adds goes with it on `dispose`. */
  const events = new AbortController();
  const { signal } = events;
  const unregister: (() => void)[] = [];

  const root = h('div', { class: 'atlas-settings', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' });
  const panel = h('div', { class: 'atlas-settings-panel ui-card' });
  root.append(panel);

  const close = h('button', { class: 'ui-btn icon atlas-settings-close', type: 'button', 'aria-label': 'Close' }, icon('close'));
  panel.append(
    h(
      'div',
      { class: 'atlas-settings-head' },
      h('div', { class: 'atlas-settings-badge' }, icon('gear')),
      h(
        'div',
        {},
        h('div', { class: 'atlas-settings-title', text: 'Settings' }),
        h('div', { class: 'atlas-settings-sub', text: 'Saved on this device, all but the time of day.' }),
      ),
      close,
    ),
  );

  /* --- the pages, and the rail that turns them ------------------------- */

  const PAGES: readonly { id: SettingsPage; label: string; glyph: string; note: string }[] = [
    { id: 'graphics', label: 'Graphics', glyph: 'eye', note: 'How far the world is built, how sharp, what is drawn in it, and the hour of the sun.' },
    { id: 'sound', label: 'Sound', glyph: 'sound', note: 'The world, the voices and the music, each with its own level.' },
    { id: 'controls', label: 'Controls', glyph: 'keyboard', note: 'The mouse, and every key. Press a key to change it.' },
    { id: 'credits', label: 'Credits', glyph: 'star', note: 'Who made atlas, and whose maps, models and sounds it is made of.' },
  ];
  const rail = h('div', { class: 'atlas-settings-rail', role: 'tablist', 'aria-label': 'Settings pages', 'aria-orientation': 'vertical' });
  const content = h('div', { class: 'atlas-settings-content' });
  const tabs = new Map<SettingsPage, HTMLButtonElement>();
  const pages = new Map<SettingsPage, HTMLElement>();
  for (const entry of PAGES) {
    const tab = h('button', {
      type: 'button',
      role: 'tab',
      id: `atlas-settings-tab-${entry.id}`,
      'aria-controls': `atlas-settings-${entry.id}`,
    }, icon(entry.glyph), entry.label);
    const element = h(
      'div',
      { class: 'atlas-settings-page', id: `atlas-settings-${entry.id}`, role: 'tabpanel', 'aria-labelledby': `atlas-settings-tab-${entry.id}` },
      h('div', { class: 'atlas-settings-page-title', text: entry.label }),
      h('p', { class: 'atlas-settings-page-note', text: entry.note }),
    );
    tab.addEventListener('click', () => turnTo(entry.id), { signal });
    tabs.set(entry.id, tab);
    pages.set(entry.id, element);
    rail.append(tab);
    content.append(element);
  }
  panel.append(h('div', { class: 'atlas-settings-body' }, rail, content));
  /** The pages a card without sound leaves out, in order. */
  const shown = (): SettingsPage[] => PAGES.map((entry) => entry.id).filter((id) => !tabs.get(id)!.hidden);
  let page: SettingsPage = 'graphics';
  function turnTo(next: SettingsPage): void {
    if (tabs.get(next)!.hidden) next = 'graphics';
    page = next;
    for (const [id, tab] of tabs) {
      tab.setAttribute('aria-selected', String(id === next));
      // One tab stop for the rail, as a tab list has; the arrows walk it.
      tab.tabIndex = id === next ? 0 : -1;
    }
    for (const [id, element] of pages) element.hidden = id !== next;
    content.scrollTop = 0;
    stopListening();
  }
  rail.addEventListener('keydown', (event) => {
    const step = event.code === 'ArrowDown' || event.code === 'ArrowRight' ? 1 : event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const order = shown();
    const next = order[(order.indexOf(page) + step + order.length) % order.length]!;
    turnTo(next);
    tabs.get(next)!.focus({ preventScroll: true });
  }, { signal });

  /* --- building blocks ------------------------------------------------- */

  let tips = 0;
  /**
   * A name and the `?` that says what it is for: a button, so a keyboard can
   * reach it and its focus shows the bubble as a hover does, described by the
   * bubble for a screen reader. Returns the bubble too, for a text that names
   * a key and is written again when the key moves.
   */
  function labelled(name: string, help: string): { label: HTMLElement; bubble: HTMLElement } {
    const id = `atlas-settings-tip-${++tips}`;
    const bubble = h('span', { class: 'atlas-settings-bubble', role: 'tooltip', id, text: help });
    const tip = h('button', { class: 'atlas-settings-tip', type: 'button', 'aria-label': `About ${name}`, 'aria-describedby': id, text: '?' });
    const label = h('div', { class: 'atlas-settings-label' }, h('span', { text: name }), help === '' ? null : tip, help === '' ? null : bubble);
    return { label, bubble };
  }

  const row = (name: string, help: string, ...side: (Node | null)[]): HTMLElement =>
    h('div', { class: 'atlas-settings-row' }, labelled(name, help).label, h('div', { class: 'atlas-settings-side' }, ...side));

  function makeSwitch(toggle: Toggle, label: string): { element: HTMLButtonElement; refresh(): void } {
    const element = h('button', { class: 'ui-switch', role: 'switch', 'aria-label': label });
    const refresh = (): void => element.setAttribute('aria-checked', String(toggle.get()));
    element.addEventListener('click', () => {
      toggle.set(!toggle.get());
      refresh();
    }, { signal });
    return { element, refresh };
  }

  /**
   * A logarithmic slider over a knob: equal travel is an equal *ratio*, which
   * is how the knob itself steps, so the middle of the track is the geometric
   * middle of the range and not a value nobody would choose.
   */
  function makeSlider(
    knob: Knob,
    label: string,
    describe: (value: number) => [string, string],
  ): { value: HTMLElement; input: HTMLInputElement; refresh(): void } {
    const value = h('div', { class: 'atlas-settings-value' });
    const input = h('input', { class: 'ui-range', type: 'range', min: 0, max: 1000, step: 1, 'aria-label': label });
    const span = Math.log(knob.max / knob.min);
    // Clamped: a value under the knob's floor (a volume of 0 set from the
    // console) is a log of 0, and the thumb and the fill would say -Infinity.
    const toPosition = (v: number): number => (Math.log(Math.min(knob.max, Math.max(knob.min, v)) / knob.min) / span) * 1000;
    const fromPosition = (p: number): number => knob.min * Math.exp((p / 1000) * span);
    const show = (v: number): void => {
      const [main, small] = describe(v);
      value.replaceChildren(document.createTextNode(main), h('small', { text: small }));
      input.style.setProperty('--fill', `${(toPosition(v) / 10).toFixed(1)}%`);
      input.setAttribute('aria-valuetext', `${main}, ${small}`);
    };
    const refresh = (): void => {
      const v = knob.get();
      input.value = String(Math.round(toPosition(v)));
      show(v);
    };
    input.addEventListener('input', () => show(knob.set(fromPosition(Number(input.value)))), { signal });
    return { value, input, refresh };
  }

  /** A segmented control over a choice: one button a value, the chosen one pressed. */
  function makeChoice(choice: Choice, label: string): { element: HTMLElement; refresh(): void } {
    const buttons = choice.options.map(([value, word]) => {
      const button = h('button', { type: 'button', text: word, 'aria-pressed': 'false' });
      button.addEventListener('click', () => {
        choice.set(value);
        refresh();
      }, { signal });
      return [value, button] as const;
    });
    const element = h('div', { class: 'ui-seg', role: 'group', 'aria-label': label }, ...buttons.map(([, button]) => button));
    const refresh = (): void => {
      const current = choice.get();
      for (const [value, button] of buttons) button.setAttribute('aria-pressed', String(value === current));
    };
    return { element, refresh };
  }

  /* --- the controls page -------------------------------------------------- */

  const labels = new Map<Action, string>();
  for (const section of CONTROL_SECTIONS) for (const line of section.rows) if (line.action !== undefined) labels.set(line.action, splitLabel(line.label).name);
  const nameOf = (action: Action): string => labels.get(action) ?? action;
  const bindList = h('div');
  const bindStatus = h('div', { class: 'atlas-settings-status', role: 'status', 'aria-live': 'polite' });
  const resetButton = h('button', { class: 'ui-btn small', type: 'button' }, 'Reset to defaults');
  /** Every cap that is a button, by `action:slot`. */
  const caps = new Map<string, HTMLButtonElement>();
  /** The cap waiting for its key, and how to stop it waiting. */
  let listening: { action: Action; slot: number; id: string } | null = null;
  let stopCapture: (() => void) | null = null;
  /** The cap just bound, which flashes once when the list is drawn again. */
  let moved = new Set<string>();

  function say(text: string, warn = false): void {
    bindStatus.textContent = text;
    bindStatus.classList.toggle('warn', warn);
  }

  /** A cap that rebinds `slot` of `action`'s keys. */
  function capButton(action: Action, slot: number, name: string): HTMLButtonElement {
    const id = `${action}:${slot}`;
    const code = BINDINGS[action][slot]!;
    const cap = keyLabel(code);
    const waiting = listening?.id === id;
    const button = h('button', {
      class: `atlas-settings-cap${slot > 0 ? ' spare' : ''}${waiting ? ' listening' : ''}${moved.has(id) ? ' moved' : ''}`,
      type: 'button',
      'aria-label': `${name}${slot > 0 ? ', second key' : ''}: ${cap}. Press to change`,
      text: waiting ? 'Press a key' : cap,
    });
    button.addEventListener('click', () => {
      if (listening?.id === id) stopListening();
      else startListening(action, slot);
    }, { signal });
    caps.set(id, button);
    return button;
  }

  function renderBinds(): void {
    const focused = [...caps].find(([, button]) => button === document.activeElement)?.[0] ?? null;
    caps.clear();
    bindList.replaceChildren(
      ...CONTROL_SECTIONS.map((section) =>
        h(
          'section',
          { class: 'atlas-settings-section' },
          h('div', { class: 'ui-eyebrow', text: section.title }),
          h(
            'div',
            { class: 'atlas-settings-binds' },
            ...section.rows.map((line) => {
              const { name, more } = splitLabel(line.label);
              const label = labelled(name, more).label;
              if (line.action === undefined) {
                const cap = line.fixed === 'release' ? labelOf('release') : capOf(line.fixed ?? 'mouse');
                return h(
                  'div',
                  { class: 'atlas-settings-bind' },
                  label,
                  h('span', { class: 'atlas-settings-keys' }, h('span', { class: 'atlas-settings-cap fixed', title: 'Cannot be changed', text: cap })),
                );
              }
              const spare = spareSlot(BINDINGS[line.action]);
              return h(
                'div',
                { class: 'atlas-settings-bind' },
                label,
                h(
                  'span',
                  { class: 'atlas-settings-keys' },
                  capButton(line.action, 0, name),
                  spare < 0 ? null : capButton(line.action, spare, name),
                ),
              );
            }),
          ),
        ),
      ),
    );
    moved = new Set();
    resetButton.disabled = !bindingsChanged();
    // Drawing the list again takes the focus off a cap with it, and a player
    // walking the list with `Tab` would be thrown out of it.
    if (focused !== null) caps.get(focused)?.focus({ preventScroll: true });
  }

  /** What a key pressed for a cap did, in words, with the caps redrawn. */
  function captured(action: Action, slot: number, outcome: Captured): void {
    const name = nameOf(action);
    if (outcome.kind === 'refused') {
      const holder = actionOf(outcome.code);
      say(
        !keyBindable(outcome.code)
          ? `${keyLabel(outcome.code)} belongs to the browser and cannot be used. Try another key, or ${labelOf('release')} to keep this one.`
          : `${keyLabel(outcome.code)} is the only key for ${holder === undefined ? 'another action' : nameOf(holder)}. Try another.`,
        true,
      );
      return;
    }
    listening = null;
    stopCapture = null;
    if (outcome.kind === 'cancelled') {
      say('Nothing changed.');
      renderBinds();
      caps.get(`${action}:${slot}`)?.focus({ preventScroll: true });
      return;
    }
    const cap = keyLabel(outcome.code);
    const { swapped, took } = outcome.result;
    if (swapped !== null) {
      say(`${name} is on ${cap} now. ${nameOf(swapped)} had it, and takes ${outcome.before === undefined ? 'its other key' : keyLabel(outcome.before)} instead.`, true);
    } else if (took !== null) {
      say(`${name} is on ${cap} now, which was a key for ${nameOf(took)} as well.`);
    } else {
      say(`${name} is on ${cap}.`);
    }
    // `rebind` has already had `onKeyLabels` draw the list again; once more
    // with the moved caps marked and the focus where the player was.
    moved = new Set([`${action}:${BINDINGS[action].indexOf(outcome.code)}`]);
    if (swapped !== null) moved.add(`${swapped}:0`);
    renderBinds();
    caps.get(`${action}:${BINDINGS[action].indexOf(outcome.code)}`)?.focus({ preventScroll: true });
  }

  /**
   * The cap that waits is changed where it stands rather than drawn again: a
   * button taken out from under a press never receives its click, so a click
   * on a second cap while the first was waiting would have done nothing.
   */
  function startListening(action: Action, slot: number): void {
    stopListening();
    const id = `${action}:${slot}`;
    listening = { action, slot, id };
    stopCapture = captureKey(action, slot, (outcome) => captured(action, slot, outcome));
    const button = caps.get(id);
    if (button !== undefined) {
      button.classList.add('listening');
      button.textContent = 'Press a key';
      button.focus({ preventScroll: true });
    }
    say(`Press the key for ${nameOf(action)}${slot > 0 ? ' (second key)' : ''}, or ${labelOf('release')} to keep ${keyLabel(BINDINGS[action][slot]!)}.`);
  }

  /** Stops waiting for a key, if a cap was. */
  function stopListening(): void {
    if (listening === null) return;
    const { action, slot, id } = listening;
    stopCapture?.();
    stopCapture = null;
    listening = null;
    say('');
    const button = caps.get(id);
    if (button !== undefined) {
      button.classList.remove('listening');
      button.textContent = keyLabel(BINDINGS[action][slot]!);
    }
  }

  // A press anywhere but on the cap that is waiting lets go of the question,
  // as `Esc` does.
  panel.addEventListener('pointerdown', (event) => {
    if (listening === null) return;
    const waiting = caps.get(listening.id);
    if (waiting !== undefined && event.target instanceof Node && waiting.contains(event.target)) return;
    stopListening();
  }, { signal });

  resetButton.addEventListener('click', () => {
    stopListening();
    resetBindings();
    say('Every key is back where it started.');
    resetButton.focus({ preventScroll: true });
  }, { signal });

  /* --- the general page --------------------------------------------------- */

  // The switch says what the knob is doing, and the slider beside it says it
  // too: turned on, the value reads *auto* and follows the knob as it moves.
  const autoToggle = options.autoDetail;
  const autoDetail = autoToggle === undefined ? null : makeSwitch({
    get: autoToggle.get,
    set: (on) => {
      const set = autoToggle.set(on);
      detail.refresh();
      return set;
    },
  }, 'Automatic render distance');
  const detail = makeSlider(
    {
      ...options.detail,
      // A hand on the slider is a choice, and `setDetail` turns the automatic
      // knob off for it; the switch beside it has to say so at once.
      set: (value) => {
        const set = options.detail.set(value);
        autoDetail?.refresh();
        return set;
      },
    },
    'Render distance',
    (v) => [
      options.detailDistance === undefined ? detailWord(v) : `${detailWord(v)} · ${options.detailDistance(v)}`,
      `${v.toFixed(2)}×${autoToggle?.get() === true ? ' · auto' : ''}`,
    ],
  );
  const performance = makeSwitch(options.performance, 'Performance overlay');
  const effects = options.effects === undefined ? null : makeSwitch(options.effects, 'Effects');
  const shake = options.shake === undefined ? null : makeSwitch(options.shake, 'Camera shake');
  const weather = options.weather === undefined ? null : makeSwitch(options.weather, 'Weather');
  const flags = makeSwitch(options.flags, 'Flags and borders');
  const hints = makeSwitch(options.hints, 'Key hints');
  const resolution = makeChoice(options.resolution, 'Resolution');

  /**
   * The time of day: a slider over the hour where you stand, a button back to
   * the real one, and the time-lapse. The sun is real and the night lights are
   * among the best things in this world, and until this row you saw them only
   * by playing at night.
   */
  const time = options.time;
  const timeValue = h('div', { class: 'atlas-settings-value' });
  const timeLive = h('button', { class: 'ui-btn small', type: 'button', text: 'Live' });
  const timeInput = h('input', { class: 'ui-range', type: 'range', min: 0, max: 96, step: 1, 'aria-label': 'Hour of the day' });
  const timeFast = time === undefined ? null : makeSwitch(time.fast, 'Time-lapse');
  /** `chosen` is the hour just picked, which the chip's clock shows only from the next frame. */
  const showTime = (chosen?: number): void => {
    if (time === undefined) return;
    const hour = chosen ?? time.hour();
    const live = time.live();
    timeValue.replaceChildren(document.createTextNode(hourText(hour)), h('small', { text: live ? 'live' : 'chosen' }));
    timeLive.disabled = live;
    if (document.activeElement !== timeInput) timeInput.value = String(Math.round(hour * 4) % 96);
    timeInput.style.setProperty('--fill', `${((Number(timeInput.value) / 96) * 100).toFixed(1)}%`);
    timeFast?.refresh();
  };
  if (time !== undefined) {
    timeInput.addEventListener('input', () => {
      showTime(time.setHour(Number(timeInput.value) / 4));
    }, { signal });
    timeLive.addEventListener('click', () => {
      time.setLive();
      showTime();
    }, { signal });
  }
  /** The clock keeps running while the panel is open, and so does its number. */
  let clockTimer = 0;
  const loudness = (v: number): [string, string] => [`${Math.round(v * 100)}%`, v > 0.75 ? 'loud' : v < 0.25 ? 'quiet' : 'default'];
  const sound = options.sound;
  const volume = sound === undefined ? null : makeSlider(sound.volume, 'Volume', loudness);
  const soundOn = sound === undefined ? null : makeSwitch(sound.on, 'Sound');
  const voicesOn = sound?.voices === undefined ? null : makeSwitch(sound.voices, 'Voices');
  const chatSound = sound?.chat === undefined ? null : makeSwitch(sound.chat, 'Chat sound');
  const music = options.music;
  const musicVolume = music === undefined ? null : makeSlider(music.volume, 'Music volume', loudness);
  const musicOn = music === undefined ? null : makeSwitch(music.on, 'Music');
  const sensitivity = makeSlider(options.sensitivity, 'Mouse sensitivity', (v) => [
    `${Math.round(v * 100)}%`,
    v < 0.8 ? 'steady' : v > 1.3 ? 'quick' : 'default',
  ]);

  // The two rows whose help names a key, written again when the key moves.
  const detailRow = labelled('Render distance', '…');
  const flagsRow = labelled('Flags and borders from the air', '…');

  const section = (title: string, ...rows: (HTMLElement | null)[]): HTMLElement =>
    h('section', { class: 'atlas-settings-section' }, h('div', { class: 'ui-eyebrow', text: title }), ...rows);

  const link = (href: string, text: string): string => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

  /** Puts what was built on a page, leaving out the parts this card has not got. */
  const fill = (id: SettingsPage, ...parts: (HTMLElement | null)[]): void => {
    for (const part of parts) if (part !== null) pages.get(id)!.append(part);
  };

  fill(
    'graphics',
    section(
      'Quality',
      h('div', { class: 'atlas-settings-row' }, detailRow.label, h('div', { class: 'atlas-settings-side' }, detail.value, detail.input)),
      autoDetail === null
        ? null
        : row('Automatic distance', 'Turns the render distance up while frames are to spare and down when they drop. Moving the slider, or a render distance key, takes over and turns this off.', autoDetail.element),
      row('Resolution', "Auto is the screen's own sharpness, up to twice the pixels. Balanced stops at one and a half; Fast is the lightest.", resolution.element),
    ),
    section(
      'In the world',
      effects === null ? null : row('Effects', 'Wakes, engine smoke, dust off wheels and feet, splashes and the debris of a crash.', effects.element),
      weather === null ? null : row('Weather', 'Rain, snow, storms and fog where the climate brings them. Off is clear skies; winter snow on the ground stays.', weather.element),
      shake === null ? null : row('Camera shake', 'A knock through the camera when you crash. Off by default if your system asks for less motion.', shake.element),
      h('div', { class: 'atlas-settings-row' }, flagsRow.label, h('div', { class: 'atlas-settings-side' }, flags.element)),
    ),
    time === undefined
      ? null
      : section(
          'Sky',
          row('Time of day', 'Live is the real sun where you stand. Drag to choose another hour; it runs on from there until you reload.', timeLive, timeValue, timeInput),
          row('Time-lapse', 'The day at an hour a minute: sun, sky, lights and traffic. Until you reload.', timeFast!.element),
        ),
    section('On screen', row('Performance overlay', 'Frames per second, what a frame costs and the triangles drawn, in the corner.', performance.element)),
  );

  fill(
    'sound',
    sound === undefined
      ? null
      : section(
          'The world',
          row('Sound', 'Wind, sea, engines, footsteps and the interface.', soundOn!.element),
          row('Volume', 'How loud all of it is.', volume!.value, volume!.input),
        ),
    sound === undefined || (voicesOn === null && chatSound === null)
      ? null
      : section(
          'People',
          voicesOn === null ? null : row('Voices', 'Townsfolk say their lines aloud, each in a voice of their own.', voicesOn.element),
          chatSound === null ? null : row('Chat sound', 'A soft blip when somebody writes in the chat.', chatSound.element),
        ),
    music === undefined
      ? null
      : section(
          'Music',
          row('Music', 'Now and then, a tune in the style of the country you are in.', musicOn!.element),
          row('Music volume', 'How loud the music is, apart from everything else.', musicVolume!.value, musicVolume!.input),
        ),
  );
  tabs.get('sound')!.hidden = sound === undefined && music === undefined;

  fill(
    'controls',
    section(
      'Mouse and hints',
      row('Mouse sensitivity', 'How far the camera turns for a move of the mouse.', sensitivity.value, sensitivity.input),
      row('Key hints', "A vehicle's keys for a moment as you take it, and the climb and descent the first time you fly.", hints.element),
    ),
    bindList,
    h('div', { class: 'atlas-settings-foot' }, bindStatus, resetButton),
  );

  /** A button out to a page of the people who made it, opened beside the world. */
  const out = (href: string, text: string): HTMLElement =>
    h('a', { class: 'ui-btn small', href, target: '_blank', rel: 'noopener' }, icon('link', 16), text);

  fill(
    'credits',
    section(
      'Made by',
      h(
        'div',
        { class: 'atlas-settings-links' },
        out('https://github.com/andreumassanet/planeteer', 'Source code'),
        out('https://github.com/andreumassanet', 'Andreu Massanet'),
        out('https://github.com/diegoMalagrida', 'Diego Malagrida'),
      ),
    ),
    // Who made what, as their LICENSE.txt files in `public/` credit them.
    // GeoNames is CC BY 4.0, which asks for the name and the licence, and the
    // CDS asks for the catalogue's credit; the
    // rest is CC0 and credited because it is owed, not because it is asked.
    section(
      'Made with',
      h('dl', {
        class: 'atlas-settings-credit',
        html:
          `<dt>Map data</dt><dd>${link('https://www.naturalearthdata.com/', 'Natural Earth')} · ` +
          `${link('https://www.geonames.org/', 'GeoNames')} (${link('https://creativecommons.org/licenses/by/4.0/', 'CC&nbsp;BY&nbsp;4.0')})</dd>` +
          `<dt>Stars</dt><dd>${link('https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50', 'Bright Star Catalogue')} ` +
          `(Hoffleit &amp; Warren 1991, NASA ADC), distributed by the ${link('https://cds.unistra.fr/', 'CDS')}, Strasbourg</dd>` +
          `<dt>Models</dt><dd>${link('https://quaternius.com', 'Quaternius')}, ${link('https://kenney.nl', 'Kenney')}, ` +
          `${link('https://www.kaylousberg.com', 'KayKit')}, CreativeTrio (CC0)</dd>` +
          `<dt>Sounds</dt><dd>${link('https://kenney.nl', 'Kenney')} (CC0)</dd>` +
          '<dt>The rest</dt><dd>Drawn and synthesised in code</dd>',
      }),
    ),
  );
  turnTo('graphics');

  // What names a key, written again when `controls.ts` learns the layout or a
  // key is rebound.
  function relabel(): void {
    detailRow.bubble.textContent = `How far towns, trees, traffic and animals are built around you. Turn it down if the frame rate drops. Also ${labelOf('nearer')} and ${labelOf('farther')}.`;
    flagsRow.bubble.textContent = `Each country's colour, its frontiers and its name fade in as you climb. Also ${labelOf('flags')}.`;
    close.title = `Close (${labelOf('settings')} or ${labelOf('release')})`;
    close.setAttribute('aria-keyshortcuts', `${labelOf('settings')} Escape`);
    renderBinds();
  }
  relabel();
  unregister.push(onKeyLabels(relabel));

  /* --- opening and closing ---------------------------------------------- */

  let showing = false;
  let relock = false;
  let previousFocus: HTMLElement | null = null;

  function refresh(): void {
    detail.refresh();
    autoDetail?.refresh();
    sensitivity.refresh();
    performance.refresh();
    effects?.refresh();
    shake?.refresh();
    weather?.refresh();
    flags.refresh();
    hints.refresh();
    resolution.refresh();
    volume?.refresh();
    soundOn?.refresh();
    voicesOn?.refresh();
    chatSound?.refresh();
    musicVolume?.refresh();
    musicOn?.refresh();
    showTime();
  }

  unregister.push(registerModal(() => showing));

  function show(next?: SettingsPage): void {
    if (next !== undefined) turnTo(next);
    if (showing) return;
    showing = true;
    say('');
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Asked for the mouse before `onOpen`, which may close the map — and the
    // map hands the lock back as it closes, which is the next paragraph's
    // problem and not this one's.
    relock = options.lockTarget !== null && document.pointerLockElement === options.lockTarget;
    options.onOpen?.();
    if (document.pointerLockElement) document.exitPointerLock();
    refresh();
    root.classList.add('on');
    close.focus({ preventScroll: true });
    clockTimer = window.setInterval(() => {
      showTime();
      // The automatic knob moves while the card is up; the slider follows it
      // rather than showing where it was when the card opened.
      detail.refresh();
      autoDetail?.refresh();
    }, 1000);
  }

  // **The panel holds the mouse while it is up.** Something closed as it
  // opened — the map, which asks for the lock back as it goes — can have that
  // request granted a moment later, behind the card, and the player is then
  // looking at a settings panel with no cursor. A lock taken while the card is
  // up is handed straight back.
  document.addEventListener('pointerlockchange', () => {
    if (showing && document.pointerLockElement !== null) document.exitPointerLock();
  }, { signal });

  function hide(): void {
    if (!showing) return;
    stopListening();
    showing = false;
    window.clearInterval(clockTimer);
    root.classList.remove('on');
    options.onClose?.();
    if (relock && options.lockTarget !== null && typeof options.lockTarget.requestPointerLock === 'function') {
      // Chrome refuses a lock asked for too soon after one was released; that
      // rejection is noise, the same rule `input.ts` and `map.ts` follow.
      try {
        const request: unknown = options.lockTarget.requestPointerLock();
        if (request instanceof Promise) request.catch(() => {});
      } catch {
        // Keep the panel closed if the browser refuses synchronously.
      }
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!relock && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  close.addEventListener('click', hide, { signal });
  // A click on the dimmed backdrop closes it, a click on the card does not.
  root.addEventListener('pointerdown', (event) => {
    if (event.target === root) hide();
  }, { signal });
  // The world's keys are the world's only while the panel is down — `B` and
  // the brackets used to work over it and the rows followed them, but so did
  // `Tab`, the arrows and `Space`, behind a card the player was reading.
  // Everything a key did here is a control on the card. A cap that is waiting
  // for its key never lets one through to here (`captureKey`); and the card's
  // own key closes it, except from a text field, where it is a letter.
  addEventListener('keydown', (event) => {
    if (!showing || listening !== null) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      hide();
      return;
    }
    const typing = event.target instanceof HTMLInputElement && event.target.type === 'text';
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (plain && !typing && !event.repeat && actionOf(event.code) === 'settings') {
      event.preventDefault();
      hide();
      return;
    }
    holdFocus(event, panel);
  }, { signal });

  // And the card's key opens it, whenever the keys are the world's. Added
  // after the listener above, which has already seen this press and found the
  // card shut: the other order opened the card and closed it on one key.
  addEventListener('keydown', (event) => {
    if (options.key === false || showing || event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (actionOf(event.code) !== 'settings' || inputBlocked(event)) return;
    event.preventDefault();
    show();
  }, { signal });

  return {
    root,
    get open() {
      return showing;
    },
    show,
    hide,
    toggle() {
      if (showing) hide();
      else show();
    },
    dispose() {
      hide();
      window.clearInterval(clockTimer);
      events.abort();
      for (const off of unregister.splice(0)) off();
      root.remove();
    },
  };
}
