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
 * It takes the mouse the way the world map does: opening it releases pointer
 * lock, and closing it asks for the lock back only if it was held when the
 * panel opened, so a player who opened it from the pause card is left on the
 * pause card rather than thrown back into mouse look. **And it holds the
 * keyboard**: it registers with `controls.ts` as modal, so `Tab` walks its own
 * controls and the arrows move its sliders instead of the player.
 *
 * **Two pages.** The general one is everything above; the controls page is
 * every key in the game, which used to stand along the bottom of the screen,
 * each one a button: press it and the next key pressed is that action's
 * (`rebind` in `controls.ts`, which swaps a key another action held rather
 * than leave that action with none). `O` opens and closes the card, and says
 * so on the gear.
 */

import {
  BINDINGS,
  CONTROL_SECTIONS,
  actionOf,
  bindingsChanged,
  capOf,
  holdFocus,
  inputBlocked,
  keyBindable,
  keyLabel,
  labelOf,
  onKeyLabels,
  rebind,
  registerModal,
  resetBindings,
} from './controls.ts';
import type { Action } from './controls.ts';
import { h, icon, installUi, ensureStyle, kbd } from './ui.ts';

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
  /** How far the world is built: `view.ts`'s knob, 0.25 to 6. */
  detail: Knob;
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
  /**
   * The other players: the name they see over you, and how many of them are
   * connected, `null` while there is no connection. Omit it and the section is
   * not built, which is a world with no relay.
   */
  players?: { name: { get(): string; set(name: string): string }; online(): number | null };
  /**
   * The traveller's card: how you look. The row's button closes this card and
   * opens that one, which hands the pointer back on closing if this one would
   * have. Omit it and the row is not built.
   */
  traveller?: { show(relock: boolean): void };
  /** Where to hand the pointer back to, if it was locked when the panel opened. */
  lockTarget: HTMLElement | null;
  /** Called on open, so whatever else holds the screen — the map — can let go. */
  onOpen?(): void;
  /** Called on close. */
  onClose?(): void;
}

/** The card's two pages. */
export type SettingsPage = 'general' | 'controls';

export interface Settings {
  root: HTMLElement;
  readonly open: boolean;
  /** Opens on `page`, or on whichever page was open last. */
  show(page?: SettingsPage): void;
  hide(): void;
  toggle(): void;
}

/**
 * The detail knob in words.
 *
 * A number like 1.56x says nothing to someone choosing it. The bands are the
 * knob's own geometry — it steps by a quarter of itself, so each word is a few
 * presses of `]` — and the one the world ships at is called what it is.
 */
function detailWord(value: number): string {
  if (value < 0.4) return 'Lightest';
  if (value < 0.75) return 'Light';
  if (value < 1.5) return 'Balanced';
  if (value < 3) return 'Far';
  if (value < 4.5) return 'Very far';
  return 'Everything';
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
  width: min(600px, 100%);
  max-height: min(820px, calc(100vh - 48px));
  overflow: auto;
  padding: 22px 24px 18px;
  scrollbar-width: thin;
}
.atlas-settings-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 6px;
}
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
.atlas-settings-section {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 2.5px solid var(--ui-rule);
}
.atlas-settings-section > .ui-eyebrow { margin-bottom: 10px; }
.atlas-settings-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 6px 18px;
  padding: 8px 0;
}
.atlas-settings-row + .atlas-settings-row { border-top: 1.5px dashed var(--ui-rule); }
.atlas-settings-label { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
.atlas-settings-help { margin-top: 2px; font-size: 12px; font-weight: 600; opacity: 0.58; line-height: 1.35; }
.atlas-settings-side { display: flex; align-items: center; gap: 10px; }
.atlas-settings-value {
  min-width: 108px;
  text-align: right;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.atlas-settings-value small { display: block; font-size: 11px; font-weight: 700; opacity: 0.55; }
.atlas-settings-name {
  width: 190px;
  height: 38px;
  padding: 0 12px;
  border: 2.5px solid var(--ui-ink);
  border-radius: 10px;
  background: var(--ui-paper);
  font: 700 14px var(--ui-font);
  color: var(--ui-ink);
}
.atlas-settings-name::placeholder { color: rgba(30, 6, 3, 0.45); }
.atlas-settings-name:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.atlas-settings-slider { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; padding: 4px 0 2px; }
.atlas-settings-slider span { font-size: 11px; font-weight: 800; opacity: 0.5; white-space: nowrap; }
.atlas-settings-tabs { margin: 14px 0 0; }
.atlas-settings-tabs button[aria-selected='true'] { background: var(--ui-ink); color: var(--ui-paper); }
.atlas-settings-page[hidden] { display: none; }
.atlas-settings-binds {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 22px;
}
.atlas-settings-bind {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 38px;
  border-bottom: 1.5px dashed var(--ui-rule);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
}
.atlas-settings-bind > span:first-child { min-width: 0; padding: 5px 0; }
.atlas-settings-bind-keys { display: flex; align-items: center; gap: 6px; flex: none; }
.atlas-settings-bind-alt { font-size: 11px; font-weight: 700; color: var(--ui-muted); white-space: nowrap; }
/* A key cap that is a button: the cap, raised on a cream key, pressed to listen. */
.atlas-settings-keybtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 58px;
  height: 30px;
  padding: 0 7px;
  border: 2.5px solid var(--ui-ink);
  border-radius: 9px;
  background: var(--ui-cream);
  box-shadow: 0 3px 0 var(--ui-ink);
  font: 800 12px var(--ui-font);
  color: var(--ui-ink);
  cursor: pointer;
  transition: transform 0.09s ease, box-shadow 0.09s ease, background 0.15s ease;
}
.atlas-settings-keybtn:hover { transform: translateY(-1px); box-shadow: 0 4px 0 var(--ui-ink); }
.atlas-settings-keybtn:active { transform: translateY(3px); box-shadow: 0 0 0 var(--ui-ink); }
.atlas-settings-keybtn:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.atlas-settings-keybtn.listening { background: var(--ui-gold); animation: atlas-settings-listen 1.1s ease-in-out infinite; }
.atlas-settings-keybtn.moved { animation: ui-pop 0.35s var(--ui-spring); }
@keyframes atlas-settings-listen { 50% { background: var(--ui-cream); } }
.atlas-settings-fixed { display: inline-flex; gap: 3px; min-width: 58px; justify-content: center; }
.atlas-settings-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 16px;
}
.atlas-settings-status { min-height: 17px; font-size: 12.5px; font-weight: 700; line-height: 1.35; color: var(--ui-muted); }
.atlas-settings-status.warn { color: var(--ui-crimson); }
.atlas-settings-credit {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 2.5px solid var(--ui-rule);
  font-size: 11.5px;
  font-weight: 600;
  opacity: 0.55;
  line-height: 1.5;
}
.atlas-settings-credit a { color: inherit; }
.atlas-settings-credit p + p { margin-top: 6px; }
@media (max-width: 560px) {
  .atlas-settings-binds { grid-template-columns: 1fr; }
  .atlas-settings-row { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-settings.on .atlas-settings-panel { animation: none; }
  .atlas-settings-keybtn, .atlas-settings-keybtn.listening, .atlas-settings-keybtn.moved { animation: none; transition: none; }
}
`;

/** `HH:MM` for an hour of the day, 0 to 24. */
function hourText(hour: number): string {
  const minutes = Math.round(hour * 60) % 1440;
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function createSettings(options: SettingsOptions): Settings {
  installUi();
  ensureStyle('atlas-settings', STYLE);

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

  /* --- the two pages ---------------------------------------------------- */

  const tabGeneral = h('button', {
    type: 'button',
    role: 'tab',
    id: 'atlas-settings-tab-general',
    'aria-controls': 'atlas-settings-general',
    text: 'General',
  });
  const tabControls = h('button', {
    type: 'button',
    role: 'tab',
    id: 'atlas-settings-tab-controls',
    'aria-controls': 'atlas-settings-controls',
    text: 'Controls',
  });
  const generalPage = h('div', {
    class: 'atlas-settings-page',
    id: 'atlas-settings-general',
    role: 'tabpanel',
    'aria-labelledby': 'atlas-settings-tab-general',
  });
  const controlsPage = h('div', {
    class: 'atlas-settings-page',
    id: 'atlas-settings-controls',
    role: 'tabpanel',
    'aria-labelledby': 'atlas-settings-tab-controls',
  });
  panel.append(h('div', { class: 'ui-seg atlas-settings-tabs', role: 'tablist', 'aria-label': 'Settings pages' }, tabGeneral, tabControls));
  let page: SettingsPage = 'general';
  function turnTo(next: SettingsPage): void {
    page = next;
    const controls = next === 'controls';
    tabGeneral.setAttribute('aria-selected', String(!controls));
    tabControls.setAttribute('aria-selected', String(controls));
    // One tab stop for the pair, as a tab list has; the arrows move between them.
    tabGeneral.tabIndex = controls ? -1 : 0;
    tabControls.tabIndex = controls ? 0 : -1;
    generalPage.hidden = controls;
    controlsPage.hidden = !controls;
    panel.scrollTop = 0;
  }
  tabGeneral.addEventListener('click', () => turnTo('general'));
  tabControls.addEventListener('click', () => turnTo('controls'));
  for (const tab of [tabGeneral, tabControls]) {
    tab.addEventListener('keydown', (event) => {
      if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return;
      event.preventDefault();
      const next = page === 'general' ? tabControls : tabGeneral;
      turnTo(page === 'general' ? 'controls' : 'general');
      next.focus({ preventScroll: true });
    });
  }
  turnTo('general');

  /* --- building blocks ------------------------------------------------- */

  const row = (label: string, help: string, side: Node, below?: Node): HTMLElement =>
    h(
      'div',
      { class: 'atlas-settings-row' },
      h('div', {}, h('div', { class: 'atlas-settings-label', text: label }), h('div', { class: 'atlas-settings-help', text: help })),
      side,
      below ?? null,
    );

  function makeSwitch(toggle: Toggle, label: string): { element: HTMLButtonElement; refresh(): void } {
    const element = h('button', { class: 'ui-switch', role: 'switch', 'aria-label': label });
    const refresh = (): void => element.setAttribute('aria-checked', String(toggle.get()));
    element.addEventListener('click', () => {
      toggle.set(!toggle.get());
      refresh();
    });
    return { element, refresh };
  }

  /**
   * A logarithmic slider over a knob: equal travel is an equal *ratio*, which
   * is how the knob itself steps, so the middle of the track is the geometric
   * middle of the range and not a value nobody would choose.
   */
  function makeSlider(
    knob: Knob,
    describe: (value: number) => [string, string],
    ends: [string, string],
  ): { value: HTMLElement; slider: HTMLElement; refresh(): void } {
    const value = h('div', { class: 'atlas-settings-value' });
    const input = h('input', { class: 'ui-range', type: 'range', min: 0, max: 1000, step: 1 });
    const span = Math.log(knob.max / knob.min);
    // Clamped: a value under the knob's floor (a volume of 0 set from the
    // console) is a log of 0, and the thumb and the fill would say -Infinity.
    const toPosition = (v: number): number => (Math.log(Math.min(knob.max, Math.max(knob.min, v)) / knob.min) / span) * 1000;
    const fromPosition = (p: number): number => knob.min * Math.exp((p / 1000) * span);
    const show = (v: number): void => {
      const [main, small] = describe(v);
      value.replaceChildren(document.createTextNode(main), h('small', { text: small }));
      input.style.setProperty('--fill', `${(toPosition(v) / 10).toFixed(1)}%`);
    };
    const refresh = (): void => {
      const v = knob.get();
      input.value = String(Math.round(toPosition(v)));
      show(v);
    };
    input.addEventListener('input', () => show(knob.set(fromPosition(Number(input.value)))));
    const slider = h(
      'div',
      { class: 'atlas-settings-slider' },
      h('span', { text: ends[0] }),
      input,
      h('span', { text: ends[1] }),
    );
    return { value, slider, refresh };
  }

  /** A segmented control over a choice: one button a value, the chosen one pressed. */
  function makeChoice(choice: Choice, label: string): { element: HTMLElement; refresh(): void } {
    const buttons = choice.options.map(([value, word]) => {
      const button = h('button', { type: 'button', text: word, 'aria-pressed': 'false' });
      button.addEventListener('click', () => {
        choice.set(value);
        refresh();
      });
      return [value, button] as const;
    });
    const element = h('div', { class: 'ui-seg', role: 'group', 'aria-label': label }, ...buttons.map(([, button]) => button));
    const refresh = (): void => {
      const current = choice.get();
      for (const [value, button] of buttons) button.setAttribute('aria-pressed', String(value === current));
    };
    return { element, refresh };
  }

  /* --- the sections ----------------------------------------------------- */

  const autoDetail = options.autoDetail === undefined ? null : makeSwitch(options.autoDetail, 'Automatic render distance');
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
    (v) => [detailWord(v), `${v.toFixed(2)}×`],
    ['Near · fast', 'Far · heavy'],
  );
  const performance = makeSwitch(options.performance, 'Performance overlay');
  const effects = options.effects === undefined ? null : makeSwitch(options.effects, 'Effects');
  const shake = options.shake === undefined ? null : makeSwitch(options.shake, 'Camera shake');
  const weather = options.weather === undefined ? null : makeSwitch(options.weather, 'Weather');
  const flags = makeSwitch(options.flags, 'Flags and borders');
  const hints = makeSwitch(options.hints, 'Key hints');
  const resolution = makeChoice(options.resolution, 'Resolution');

  /**
   * The controls page: every action a button showing its key. Pressed, the
   * button listens (`listening`) and the next key is the action's; `Esc`
   * lets go without changing anything. What moved is said underneath, and a
   * swap says both halves, because the other action's key moved too.
   */
  const labels = new Map<Action, string>();
  for (const section of CONTROL_SECTIONS) for (const row of section.rows) if (row.action !== undefined) labels.set(row.action, row.label);
  const bindList = h('div');
  const bindStatus = h('div', { class: 'atlas-settings-status', role: 'status', 'aria-live': 'polite' });
  const resetButton = h('button', { class: 'ui-btn small', type: 'button' }, 'Reset to defaults');
  const keyButtons = new Map<Action, HTMLButtonElement>();
  /** The action waiting for its key, and the button that is listening for it. */
  let listening: Action | null = null;
  /**
   * Until when a click on a key button is the tail of the key that was just
   * bound — `Space` and `Enter` press a focused button — and not a new ask.
   */
  let settleUntil = 0;
  /** The key just bound, whose release must not press the button it was bound on (`Space` does). */
  let captured = '';

  /** A key's cap, named as this keyboard prints it. */
  const capFor = (code: string): HTMLElement => {
    const label = keyLabel(code);
    return kbd(label, label.length > 3);
  };

  function say(text: string, warn = false): void {
    bindStatus.textContent = text;
    bindStatus.classList.toggle('warn', warn);
  }

  function renderBinds(): void {
    keyButtons.clear();
    bindList.replaceChildren(
      ...CONTROL_SECTIONS.map((section) =>
        h(
          'section',
          { class: 'atlas-settings-section' },
          h('div', { class: 'ui-eyebrow', text: section.title }),
          h(
            'div',
            { class: 'atlas-settings-binds' },
            ...section.rows.map((row) => {
              const name = h('span', { text: row.label });
              if (row.action === undefined) {
                const cap = row.fixed === 'release' ? labelOf('release') : capOf(row.fixed ?? 'mouse');
                return h('div', { class: 'atlas-settings-bind' }, name, h('span', { class: 'atlas-settings-fixed' }, kbd(cap, cap.length > 3)));
              }
              const action = row.action;
              const codes = BINDINGS[action];
              const primary = keyLabel(codes[0]!);
              const spare = [...new Set(codes.slice(1).map(keyLabel))].filter((label) => label !== primary);
              const button = h(
                'button',
                {
                  class: listening === action ? 'atlas-settings-keybtn listening' : 'atlas-settings-keybtn',
                  type: 'button',
                  'aria-label': `${row.label}: ${primary}. Press to change`,
                },
                listening === action ? 'Press a key' : capFor(codes[0]!),
              );
              button.addEventListener('click', () => {
                if (Date.now() < settleUntil) return;
                listen(listening === action ? null : action);
              });
              // Leaving the button lets go of the question.
              button.addEventListener('blur', () => {
                if (listening === action) listen(null);
              });
              keyButtons.set(action, button);
              return h(
                'div',
                { class: 'atlas-settings-bind' },
                name,
                h(
                  'span',
                  { class: 'atlas-settings-bind-keys' },
                  spare.length === 0 ? null : h('span', { class: 'atlas-settings-bind-alt', text: `or ${spare.join(', ')}` }),
                  button,
                ),
              );
            }),
          ),
        ),
      ),
    );
    resetButton.disabled = !bindingsChanged();
  }

  /** Starts listening for `action`'s key, or stops listening with `null`. */
  function listen(action: Action | null): void {
    const was = listening;
    listening = action;
    if (was !== null) {
      const button = keyButtons.get(was);
      if (button !== undefined) {
        button.classList.remove('listening');
        button.replaceChildren(capFor(BINDINGS[was][0]!));
      }
    }
    if (action === null) return;
    const button = keyButtons.get(action);
    if (button === undefined) return;
    button.classList.add('listening');
    button.replaceChildren('Press a key');
    say(`Press the key for ${labels.get(action) ?? action}. ${labelOf('release')} to keep ${keyLabel(BINDINGS[action][0]!)}.`);
  }

  /** The key pressed while a button listens: bound, refused, or `Esc` to let go. */
  function capture(event: KeyboardEvent): void {
    const action = listening;
    if (action === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (event.code === 'Escape') {
      listen(null);
      say('');
      return;
    }
    if (!keyBindable(event.code)) {
      say(`${keyLabel(event.code)} is the browser's and cannot be bound. Try another key.`, true);
      return;
    }
    const before = BINDINGS[action][0]!;
    // Done listening before the list is drawn again, which `rebind` has
    // `onKeyLabels` do before it returns.
    listening = null;
    settleUntil = Date.now() + 400;
    captured = event.code;
    const result = rebind(action, event.code);
    const name = labels.get(action) ?? action;
    const cap = keyLabel(event.code);
    if (result.swapped !== null) {
      say(`${name} is on ${cap} now. ${labels.get(result.swapped) ?? result.swapped} had it, and takes ${keyLabel(before)} instead.`, true);
    } else if (result.took !== null) {
      say(`${name} is on ${cap} now, which was a second key for ${labels.get(result.took) ?? result.took}.`);
    } else {
      say(`${name} is on ${cap}.`);
    }
    const button = keyButtons.get(action);
    if (button !== undefined) {
      button.focus({ preventScroll: true });
      button.classList.add('moved');
    }
    if (result.swapped !== null) keyButtons.get(result.swapped)?.classList.add('moved');
  }

  resetButton.addEventListener('click', () => {
    listen(null);
    resetBindings();
    say('Every key is back where it started.');
    resetButton.focus({ preventScroll: true });
  });

  // The caps that name keys, rebuilt when `controls.ts` learns the layout or
  // a key is rebound.
  const detailKeys = h('span');
  const flagsKey = h('span');
  function relabel(): void {
    detailKeys.replaceChildren(kbd(labelOf('nearer')), ' ', kbd(labelOf('farther')));
    flagsKey.replaceChildren(kbd(labelOf('flags')));
    close.title = `Close (${labelOf('settings')} or ${labelOf('release')})`;
    close.setAttribute('aria-keyshortcuts', `${labelOf('settings')} Escape`);
    // Drawing the list again takes the focus off a key button with it, and a
    // player walking the list with `Tab` would be thrown out of it.
    const focused = [...keyButtons].find(([, button]) => button === document.activeElement)?.[0] ?? null;
    renderBinds();
    if (focused !== null) keyButtons.get(focused)?.focus({ preventScroll: true });
  }
  relabel();
  onKeyLabels(relabel);

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
    });
    timeLive.addEventListener('click', () => {
      time.setLive();
      showTime();
    });
  }
  /** The clock keeps running while the panel is open, and so does its number. */
  let clockTimer = 0;
  const sound = options.sound;
  const volume =
    sound === undefined
      ? null
      : makeSlider(sound.volume, (v) => [`${Math.round(v * 100)}%`, v > 0.75 ? 'loud' : v < 0.25 ? 'quiet' : 'default'], ['Quiet', 'Loud']);
  const soundOn = sound === undefined ? null : makeSwitch(sound.on, 'Sound');
  const voicesOn = sound?.voices === undefined ? null : makeSwitch(sound.voices, 'Voices');
  const chatSound = sound?.chat === undefined ? null : makeSwitch(sound.chat, 'Chat sound');
  const music = options.music;
  const musicVolume =
    music === undefined
      ? null
      : makeSlider(music.volume, (v) => [`${Math.round(v * 100)}%`, v > 0.75 ? 'loud' : v < 0.25 ? 'quiet' : 'default'], ['Quiet', 'Loud']);
  const musicOn = music === undefined ? null : makeSwitch(music.on, 'Music');
  /**
   * The name over you, kept as it is typed and handed over on `change` — Enter
   * or leaving the field — because every rename is a reconnection.
   */
  const players = options.players;
  const nameInput = h('input', {
    class: 'atlas-settings-name',
    type: 'text',
    maxlength: 20,
    placeholder: 'Traveller',
    autocomplete: 'nickname',
    spellcheck: 'false',
    'aria-label': 'Your name',
  });
  const onlineValue = h('div', { class: 'atlas-settings-value' });
  const showPlayers = (): void => {
    if (players === undefined) return;
    if (document.activeElement !== nameInput) nameInput.value = players.name.get();
    const online = players.online();
    onlineValue.replaceChildren(
      document.createTextNode(online === null ? '–' : String(online)),
      h('small', { text: online === null ? 'offline' : online === 1 ? 'other player' : 'other players' }),
    );
  };
  if (players !== undefined) {
    nameInput.addEventListener('change', () => {
      nameInput.value = players.name.set(nameInput.value);
    });
    nameInput.addEventListener('keydown', (event) => {
      if (event.code === 'Enter') nameInput.blur();
    });
  }
  const travellerButton = h('button', { type: 'button', class: 'ui-btn small' }, icon('walk'), 'Change');
  travellerButton.addEventListener('click', () => {
    const handBack = relock;
    // Closed without asking for the pointer: the next card asks, when it closes.
    relock = false;
    hide();
    options.traveller?.show(handBack);
  });
  const sensitivity = makeSlider(
    options.sensitivity,
    (v) => [`${Math.round(v * 100)}%`, v < 0.8 ? 'steady' : v > 1.3 ? 'quick' : 'default'],
    ['Slow', 'Fast'],
  );

  const sections: (HTMLElement | null)[] = [
    h(
      'section',
      { class: 'atlas-settings-section' },
      h('div', { class: 'ui-eyebrow', text: 'Graphics' }),
      row(
        'Render distance',
        'How far towns, trees, traffic and animals are built around you. Turn it down if the frame rate drops.',
        h('div', { class: 'atlas-settings-side' }, detail.value, detailKeys),
        detail.slider,
      ),
      autoDetail === null
        ? null
        : row(
            'Automatic distance',
            'Turns the render distance up while frames are to spare and down when they are dropped. Moving the slider takes over.',
            autoDetail.element,
          ),
      row(
        'Resolution',
        "How sharp the world is drawn. Auto is the screen's own sharpness up to twice the pixels, Balanced stops at one and a half, and Fast draws one pixel a point, the lightest of all.",
        resolution.element,
      ),
      effects === null
        ? null
        : row(
            'Effects',
            'The wake behind a boat, the smoke of an engine and a plane, the dust off wheels and feet, the splash and the debris of a crash.',
            effects.element,
          ),
      weather === null
        ? null
        : row(
            'Weather',
            'Rain, snow, storms with their thunder, and fog, where and when the climate brings them. Off is clear skies; the winter snow on the ground stays.',
            weather.element,
          ),
      shake === null
        ? null
        : row('Camera shake', 'A knock felt through the camera when you crash. Off by default if your system asks for less motion.', shake.element),
      row(
        'Performance overlay',
        'Frames per second, what a frame costs to update and to draw, its worst hitch and the triangles drawn, in the corner.',
        performance.element,
      ),
    ),
    time === undefined
      ? null
      : h(
          'section',
          { class: 'atlas-settings-section' },
          h('div', { class: 'ui-eyebrow', text: 'Sky' }),
          row(
            'Time of day',
            'Live is the real sun where you stand. Drag to put it at another hour; it runs on from there until you reload.',
            h('div', { class: 'atlas-settings-side' }, timeValue, timeLive),
            h('div', { class: 'atlas-settings-slider' }, h('span', { text: '00:00' }), timeInput, h('span', { text: '24:00' })),
          ),
          row(
            'Time-lapse',
            'The day at an hour a minute: the sun, the sky, the lights and the traffic. Until you reload.',
            timeFast!.element,
          ),
        ),
    sound === undefined
      ? null
      : h(
          'section',
          { class: 'atlas-settings-section' },
          h('div', { class: 'ui-eyebrow', text: 'Sound' }),
          row('Sound', 'The wind, the sea, the engines, footsteps, and a jingle when you find a landmark.', soundOn!.element),
          row('Volume', 'How loud all of it is.', volume!.value, volume!.slider),
          voicesOn === null
            ? null
            : row('Voices', 'The townsfolk say their lines aloud as they talk to you, each in a voice of their own.', voicesOn.element),
          chatSound === null ? null : row('Chat sound', 'A soft blip when somebody says something in the chat.', chatSound.element),
          ...(music === undefined
            ? []
            : [
                row('Music', 'A tune in the style of the country you are in, now and then, and quiet in between.', musicOn!.element),
                row('Music volume', 'How loud the music is, apart from everything else.', musicVolume!.value, musicVolume!.slider),
              ]),
        ),
    options.traveller === undefined
      ? null
      : h(
          'section',
          { class: 'atlas-settings-section' },
          h('div', { class: 'ui-eyebrow', text: 'You' }),
          row(
            'Your traveller',
            'Man or woman, skin, hair, clothes and colours, and whether you carry a rucksack. The others see you as you choose.',
            travellerButton,
          ),
        ),
    players === undefined
      ? null
      : h(
          'section',
          { class: 'atlas-settings-section' },
          h('div', { class: 'ui-eyebrow', text: 'Players' }),
          row('Your name', 'What the other players see over your head. Leave it empty for a traveller with a number.', nameInput),
          row('Online now', 'Everyone else in the world at this moment. They are pink on both maps.', onlineValue),
        ),
    h(
      'section',
      { class: 'atlas-settings-section' },
      h('div', { class: 'ui-eyebrow', text: 'Map' }),
      row(
        'Flags and borders from the air',
        "Each country's own colour, its frontiers and its name fade in as you climb in the plane.",
        h('div', { class: 'atlas-settings-side' }, flagsKey, flags.element),
      ),
    ),
    // Who made what, and it is no longer "everything else in code": the people,
    // the vehicles, the animals, the plants and most houses are CC0 models,
    // credited as their LICENSE.txt files in `public/models/` credit them.
    h('div', {
      class: 'atlas-settings-credit',
      html:
        '<p>Coastlines and lakes from <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>. ' +
        'Towns from <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a>, ' +
        '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC&nbsp;BY&nbsp;4.0</a>.</p>' +
        '<p>The people and the livestock are by <a href="https://quaternius.com" target="_blank" rel="noopener">Quaternius</a>, ' +
        'as are the bus and the bicycle; the cars, the boats, the plants, the rocks and the houses and streets of the towns are ' +
        '<a href="https://kenney.nl" target="_blank" rel="noopener">Kenney</a>’s; more trees from ' +
        '<a href="https://www.kaylousberg.com" target="_blank" rel="noopener">KayKit</a>, and the wooden church by CreativeTrio. ' +
        'The footsteps, the interface and the jingles are Kenney’s too. All of them CC0.</p>' +
        '<p>The land, the sea, the sky, the flags, the landmarks and every other building are drawn in code, ' +
        'and so are the wind, the sea and the engines you hear.</p>',
    }),
  ];
  for (const section of sections) if (section !== null) generalPage.append(section);

  controlsPage.append(
    h(
      'section',
      { class: 'atlas-settings-section' },
      h('div', { class: 'ui-eyebrow', text: 'Mouse and hints' }),
      row('Mouse sensitivity', 'How far the camera turns for a move of the mouse.', sensitivity.value, sensitivity.slider),
      row(
        'Key hints',
        "A vehicle's keys for a moment as you take it, and the climb and the descent the first time you fly.",
        hints.element,
      ),
    ),
    bindList,
    h('div', { class: 'atlas-settings-foot' }, bindStatus, resetButton),
  );
  panel.append(generalPage, controlsPage);

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
    showPlayers();
  }

  registerModal(() => showing);

  function show(next?: SettingsPage): void {
    if (next !== undefined) turnTo(next);
    if (showing) return;
    showing = true;
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
      showPlayers();
    }, 1000);
  }

  // **The panel holds the mouse while it is up.** Something closed as it
  // opened — the map, which asks for the lock back as it goes — can have that
  // request granted a moment later, behind the card, and the player is then
  // looking at a settings panel with no cursor. A lock taken while the card is
  // up is handed straight back.
  document.addEventListener('pointerlockchange', () => {
    if (showing && document.pointerLockElement !== null) document.exitPointerLock();
  });

  function hide(): void {
    if (!showing) return;
    listen(null);
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

  close.addEventListener('click', hide);
  // A click on the dimmed backdrop closes it, a click on the card does not.
  root.addEventListener('pointerdown', (event) => {
    if (event.target === root) hide();
  });
  // The world's keys are the world's only while the panel is down — `B` and
  // the brackets used to work over it and the rows followed them, but so did
  // `Tab`, the arrows and `Space`, behind a card the player was reading.
  // Everything a key did here is a control on the card.
  //
  // A key button that is listening takes the next key whatever it is, `Tab`
  // included; and the card's own key closes it, except from the name field,
  // where it is a letter.
  addEventListener('keydown', (event) => {
    if (!showing) return;
    if (listening !== null) {
      capture(event);
      return;
    }
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
  });

  addEventListener('keyup', (event) => {
    if (event.code !== captured) return;
    captured = '';
    event.preventDefault();
  });

  // And the card's key opens it, whenever the keys are the world's. Added
  // after the listener above, which has already seen this press and found the
  // card shut: the other order opened the card and closed it on one key.
  addEventListener('keydown', (event) => {
    if (showing || event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (actionOf(event.code) !== 'settings' || inputBlocked(event)) return;
    event.preventDefault();
    show();
  });

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
  };
}
