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
 */

import { KEY_LIST, capOf, holdFocus, labelOf, onKeyLabels, registerModal } from './controls.ts';
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
  /** The key hints along the bottom of the screen. */
  hints: Toggle;
  /** How many pixels the world is drawn at, against the screen's own. */
  resolution: Choice;
  /** The sun's hour, live or chosen. Omit it and the row is not built. */
  time?: TimeOfDay;
  /** The soundscape's level and whether it is on. Omit it and the section is not built. */
  sound?: { volume: Knob; on: Toggle };
  /**
   * The other players: the name they see over you, and how many of them are
   * connected, `null` while there is no connection. Omit it and the section is
   * not built, which is a world with no relay.
   */
  players?: { name: { get(): string; set(name: string): string }; online(): number | null };
  /** Where to hand the pointer back to, if it was locked when the panel opened. */
  lockTarget: HTMLElement | null;
  /** Called on open, so whatever else holds the screen — the map — can let go. */
  onOpen?(): void;
  /** Called on close. */
  onClose?(): void;
}

export interface Settings {
  root: HTMLElement;
  readonly open: boolean;
  show(): void;
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
.atlas-settings-keys {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 22px;
  margin-top: 4px;
}
.atlas-settings-key { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; }
.atlas-settings-key > span:first-child { display: flex; gap: 4px; min-width: 122px; flex-shrink: 0; }
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
  .atlas-settings-keys { grid-template-columns: 1fr; }
  .atlas-settings-row { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-settings.on .atlas-settings-panel { animation: none; }
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

  const close = h('button', { class: 'ui-btn icon atlas-settings-close', title: 'Close (Esc)' }, icon('close'));
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
  const flags = makeSwitch(options.flags, 'Flags and borders');
  const hints = makeSwitch(options.hints, 'Key hints');
  const resolution = makeChoice(options.resolution, 'Resolution');

  // The caps that name keys, rebuilt when `controls.ts` learns the layout.
  const detailKeys = h('span');
  const flagsKey = h('span');
  const hintsKey = h('span');
  const keyList = h('div', { class: 'atlas-settings-keys' });
  function relabel(): void {
    detailKeys.replaceChildren(kbd(labelOf('nearer')), ' ', kbd(labelOf('farther')));
    flagsKey.replaceChildren(kbd(labelOf('flags')));
    hintsKey.replaceChildren(kbd(labelOf('hints')));
    keyList.replaceChildren(
      ...KEY_LIST.map((hint) =>
        h(
          'div',
          { class: 'atlas-settings-key' },
          h('span', {}, ...hint.keys.map((key) => {
            const cap = capOf(key);
            return kbd(cap, cap.length > 3);
          })),
          h('span', { text: hint.label }),
        ),
      ),
    );
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
    h(
      'section',
      { class: 'atlas-settings-section' },
      h('div', { class: 'ui-eyebrow', text: 'Controls' }),
      row('Mouse sensitivity', 'How far the camera turns for a move of the mouse.', sensitivity.value, sensitivity.slider),
      row(
        'Key hints',
        'The strip of keys along the bottom of the screen, for the way you are travelling.',
        h('div', { class: 'atlas-settings-side' }, hintsKey, hints.element),
      ),
      keyList,
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
  for (const section of sections) if (section !== null) panel.append(section);

  /* --- opening and closing ---------------------------------------------- */

  let showing = false;
  let relock = false;
  let previousFocus: HTMLElement | null = null;

  function refresh(): void {
    detail.refresh();
    autoDetail?.refresh();
    sensitivity.refresh();
    performance.refresh();
    flags.refresh();
    hints.refresh();
    resolution.refresh();
    volume?.refresh();
    soundOn?.refresh();
    showTime();
    showPlayers();
  }

  registerModal(() => showing);

  function show(): void {
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
  addEventListener('keydown', (event) => {
    if (!showing) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      hide();
    } else {
      holdFocus(event, panel);
    }
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
