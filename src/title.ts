/**
 * The title screen, in front of the planet menu (which it holds while up).
 *
 * On the left, the game's name and the choice of how to play: online on the
 * relay (`peers.ts`) or offline, where no socket is opened. On the right, the
 * traveller on the hero stage (`hero-stage.ts`): the bridge of a small ship
 * whose window shows the menu's orrery behind the transparent canvas, the
 * name plate, and *Customise*. Choosing flies the camera out through the
 * window into the menu. *Customise* shares the stage rather than opening a
 * card: this screen steps aside (`aside`) while the creator is open.
 *
 * It owns only the choice, remembered under `PLAY_KEY` so the next visit (and
 * a `?at=` link that skips this screen) plays the same way.
 */
import { holdFocus } from './controls.ts';
import type { HeroStage } from './hero-stage.ts';
import { ensureStyle, h, icon, installUi } from './ui.ts';
import type { PlayMode } from './world-host.ts';

export type { PlayMode };

/** How often the title asks the relay how many are online, while it is up. */
const COUNT_EVERY_MS = 30_000;

/** Where the last choice is kept. */
export const PLAY_KEY = 'atlas.play.v1';

/** The mode chosen last time on this device, or null if none ever was. */
export function storedPlayMode(): PlayMode | null {
  try {
    const kept = localStorage.getItem(PLAY_KEY);
    return kept === 'online' || kept === 'offline' ? kept : null;
  } catch {
    return null;
  }
}

function rememberPlayMode(mode: PlayMode): void {
  try {
    localStorage.setItem(PLAY_KEY, mode);
  } catch {
    // Private mode: the choice lasts this visit.
  }
}

export interface TitleOptions {
  /** The stage the traveller stands on, shared with the creator. */
  stage: HeroStage;
  /** Whether there is a relay to play online on. Without one, the button says so and is off. */
  online: boolean;
  /** How many travellers are online now, on every world; null when the relay does not answer. */
  players?(): Promise<number | null>;
  /** Opens the creator, which asks this screen to step aside while it is up. */
  customise(): void;
  /** Opens the settings. Omit it and there is no button. */
  settings?(): void;
  /** Builds the account's chip beside the settings (`account.ts`). Omit it and there is none. */
  account?(into: HTMLElement): void;
  /** Whether a card in front of this screen has the keyboard: its keys wait. */
  covered?(): boolean;
  /** A pointer over a control, and a choice made, for the menu's sound. */
  sound?: { hover(): void; select(): void };
  /** A mode was chosen: the menu behind can take over. */
  onChoose?(mode: PlayMode): void;
}

export interface Title {
  root: HTMLElement;
  readonly open: boolean;
  /** The mode chosen last, here or on an earlier visit; null if neither. */
  readonly mode: PlayMode | null;
  show(): void;
  hide(): void;
  /** Steps aside for the creator, which has the stage while it is up, and comes back. */
  aside(on: boolean): void;
  /** The screen is done with for good. */
  dispose(): void;
}

/** When the title is one column, the traveller over the choice: a narrow screen held upright. */
const STACKED = '(max-width: 860px) and (orientation: portrait)';

const STYLE = `
.atlas-title {
  position: fixed;
  inset: 0;
  z-index: 11;
  display: grid;
  grid-template-columns: minmax(340px, 480px) 1fr;
  gap: 24px;
  padding: 48px 56px 40px;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  background:
    linear-gradient(90deg, rgba(4, 6, 14, 0.82) 0%, rgba(4, 6, 14, 0.55) 32%, rgba(4, 6, 14, 0) 62%);
  opacity: 0;
  visibility: hidden;
  /* The stage under it takes the drag; only the controls take the pointer. */
  pointer-events: none;
  transition: opacity 0.45s ease, visibility 0s 0.45s, background 0.45s ease;
  user-select: none;
  -webkit-user-select: none;
}
.atlas-title.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.ti-left { display: flex; flex-direction: column; justify-content: center; gap: 32px; min-width: 0; pointer-events: auto; transition: opacity 0.35s ease, transform 0.45s var(--ui-ease); }
.atlas-title.on .ti-left > * { animation: ti-rise 0.6s var(--ui-ease) both; }
.atlas-title.on .ti-left > :nth-child(2) { animation-delay: 0.06s; }
.ti-wordmark {
  font-size: 96px;
  font-weight: 800;
  letter-spacing: -0.05em;
  line-height: 0.85;
  color: var(--ui-paper);
  -webkit-text-stroke: 8px var(--ui-ink);
  paint-order: stroke fill;
  text-shadow: 0 7px 0 var(--ui-ink);
  overflow-wrap: break-word;
  min-width: 0;
}
.ti-tagline {
  margin-top: 18px;
  max-width: 24ch;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--ui-paper-dim);
  text-shadow: var(--ui-space-shadow);
  text-wrap: balance;
}
/* The choice: two ways to play, one of them the way you played last, and the settings under them. */
.ti-card { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; max-width: 360px; }
.ti-play {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  width: 100%;
  padding: 12px 18px 11px;
  text-align: left;
  white-space: normal;
}
.ti-play b { display: block; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
.ti-play small { display: block; font-size: 12.5px; font-weight: 700; line-height: 1.3; color: var(--ui-muted); }
.ti-play.primary small { color: var(--ui-ink); opacity: 0.7; }
.ti-row { display: grid; grid-template-columns: 1fr 1fr; align-items: start; gap: 10px; width: 100%; margin-top: 2px; }
.ti-row > :only-child { grid-column: 1 / -1; }
.ti-row .ui-btn { width: 100%; height: 48px; justify-content: center; font-size: 15px; }
.ti-row .ac-chip { display: flex; width: 100%; }
.ti-row .ui-btn > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ti-right { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.ti-custom { position: relative; pointer-events: auto; transition: opacity 0.3s ease, transform 0.4s var(--ui-ease); }
/* Backwards, not both: a fill kept after the rise would outrank the aside rule and leave the button under the creator. */
.atlas-title.on .ti-custom { animation: ti-rise 0.6s 0.2s var(--ui-ease) backwards; }
.atlas-title.aside { background: linear-gradient(90deg, rgba(4, 6, 14, 0.5) 0%, rgba(4, 6, 14, 0) 55%); }
.atlas-title.aside .ti-left { opacity: 0; transform: translateX(-60px); pointer-events: none; }
.atlas-title.aside .ti-custom { opacity: 0; transform: translateY(24px); pointer-events: none; }
@keyframes ti-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
/* Upright and narrow: the traveller on top, the choice under them. */
@media ${STACKED} {
  .atlas-title {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
    padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
    gap: 8px;
    overflow: auto;
  }
  .ti-left { order: 2; justify-content: flex-start; gap: 14px; }
  .ti-right { order: 1; min-height: 240px; }
  .ti-wordmark { font-size: 60px; -webkit-text-stroke-width: 6px; text-shadow: 0 5px 0 var(--ui-ink); }
  .ti-tagline { font-size: 15px; margin-top: 8px; }
  .ti-card { padding: 12px; gap: 9px; max-width: none; }
  .ti-play { padding: 10px 14px; }
  .ti-play b { font-size: 18px; }
  .atlas-title { background: linear-gradient(0deg, rgba(4, 6, 14, 0.75) 0%, rgba(4, 6, 14, 0.4) 50%, rgba(4, 6, 14, 0) 70%); }
}
@media (max-height: 640px) {
  .ti-wordmark { font-size: 80px; }
  .ti-left { gap: 16px; }
}
/* A phone on its side: two small columns, the choice on the left and the traveller on the right. */
@media (max-height: 520px) and (orientation: landscape) {
  .atlas-title {
    grid-template-columns: minmax(280px, 360px) 1fr;
    padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
    gap: 12px;
  }
  .ti-left { gap: 10px; overflow-y: auto; }
  .ti-wordmark { font-size: 46px; -webkit-text-stroke-width: 5px; text-shadow: 0 4px 0 var(--ui-ink); }
  .ti-tagline { display: none; }
  .ti-card { padding: 10px; gap: 7px; }
  .ti-play { padding: 7px 12px; gap: 10px; }
  .ti-play svg { width: 22px; height: 22px; }
  .ti-play b { font-size: 16px; }
  .ti-play small { font-size: 11.5px; margin-top: 1px; }
  .ti-row .ui-btn { height: 40px; padding-top: 0; padding-bottom: 0; font-size: 14px; }
  .ti-custom { transform: scale(0.85); transform-origin: 50% 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-title.on .ti-left > *, .atlas-title.on .ti-custom { animation: none; }
  .ti-left, .ti-custom { transition: none; }
}
`;

/** The title's two columns: the play buttons and settings on the left, *Customise* on the right. */
function titleLayout(options: TitleOptions, choose: (mode: PlayMode) => void) {
  const stage = options.stage;
  // The way played last is the gold one; `markLast` keeps that up to date.
  function playButton(mode: PlayMode, label: string, note: string): HTMLButtonElement {
    const button = h('button', { class: 'ui-btn ti-play', type: 'button', 'data-mode': mode }, h('b', { text: label }), h('small', { text: note }));
    button.addEventListener('click', () => choose(mode));
    button.addEventListener('pointerenter', () => {
      options.sound?.hover();
      stage.wave();
    });
    return button;
  }
  const onlineNote = options.online ? 'The other travellers are on the same planet' : 'No server to meet anyone on in this version';
  const onlineButton = playButton('online', 'Play online', onlineNote);
  onlineButton.disabled = !options.online;
  const offlineButton = playButton('offline', 'Play offline', 'Nothing is sent anywhere');

  const settingsButton =
    options.settings === undefined ? null : h('button', { class: 'ui-btn quiet', type: 'button' }, icon('gear', 18), h('span', { text: 'Settings' }));
  settingsButton?.addEventListener('click', () => options.settings?.());

  const accountSlot = options.account === undefined ? null : h('div', { class: 'ti-account' });
  if (accountSlot !== null) options.account!(accountSlot);

  const customButton = h('button', { class: 'ui-btn big ti-custom', type: 'button' }, icon('sparkle', 20), 'Customise');
  customButton.addEventListener('click', () => options.customise());
  customButton.addEventListener('pointerenter', () => options.sound?.hover());

  const left = h(
    'div',
    { class: 'ti-left' },
    h('div', {}, h('h1', { class: 'ti-wordmark', text: 'planeteer' }), h('div', { class: 'ti-tagline', text: 'Explore the solar system on foot, by sea and by air.' })),
    h(
      'div',
      { class: 'ti-card' },
      onlineButton,
      offlineButton,
      settingsButton === null && accountSlot === null ? null : h('div', { class: 'ti-row' }, settingsButton, accountSlot),
    ),
  );
  const right = h('div', { class: 'ti-right' }, customButton);
  const root = h('div', { class: 'atlas-title', role: 'dialog', 'aria-label': 'planeteer' }, left, right);

  return { onlineNote, onlineButton, offlineButton, customButton, left, right, root };
}

export function createTitle(options: TitleOptions): Title {
  installUi();
  ensureStyle('atlas-title', STYLE);
  const stage = options.stage;

  let chosen: PlayMode | null = storedPlayMode();
  const { onlineNote, onlineButton, offlineButton, customButton, left, right, root } = titleLayout(options, (mode) => choose(mode));

  // Who is out there, asked when the screen comes up and again while it stays.
  const onlineSmall = onlineButton.querySelector('small')!;
  let counting = 0;
  function count(): void {
    window.clearTimeout(counting);
    if (!showing || !options.online || options.players === undefined) return;
    void options.players().then((n) => {
      if (n === null) onlineSmall.textContent = onlineNote;
      else if (n === 0) onlineSmall.textContent = 'Nobody online right now: be the first';
      else onlineSmall.textContent = `${n.toLocaleString('en')} ${n === 1 ? 'traveller' : 'travellers'} online now`;
    });
    counting = window.setTimeout(count, COUNT_EVERY_MS);
  }
  function markLast(): void {
    const offline = chosen === 'offline' || !options.online;
    onlineButton.classList.toggle('primary', !offline);
    offlineButton.classList.toggle('primary', offline);
  }

  /** Tells the stage what the column and the button cover, so the traveller stands in the rest. */
  function measure(): void {
    if (!showing || stepped) return;
    const height = innerHeight;
    if (matchMedia(STACKED).matches) {
      const below = Math.max(0, height - (right.offsetTop + right.offsetHeight)) + customButton.offsetHeight + 24;
      stage.insets({ left: 0, right: 0, top: 70, bottom: below });
    } else {
      stage.insets({ left: left.offsetLeft + left.offsetWidth + 24, right: 24, top: 80, bottom: customButton.offsetHeight + 64 });
    }
  }
  addEventListener('resize', measure);

  /** Gives the stage back its title framing, the plate and the pointer-following. */
  function takeStage(instant: boolean): void {
    stage.mode('title');
    stage.shot('title', { instant });
    stage.adoptPlate(root);
    measure();
  }

  /* --- choosing ------------------------------------------------------------- */

  let showing = false;
  let stepped = false;

  function choose(mode: PlayMode): void {
    if (!showing || stepped) return;
    if (mode === 'online' && !options.online) return;
    chosen = mode;
    rememberPlayMode(mode);
    options.sound?.select();
    hide(true);
    options.onChoose?.(mode);
  }

  /** The button `Enter` presses when nothing else has the focus. */
  const defaultButton = (): HTMLButtonElement => (chosen === 'offline' || !options.online ? offlineButton : onlineButton);

  addEventListener('keydown', (event) => {
    if (!showing || stepped || options.covered?.() === true) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement || focused instanceof HTMLInputElement) return;
      event.preventDefault();
      defaultButton().click();
    } else {
      holdFocus(event, root);
    }
  });

  function show(): void {
    if (showing) return;
    showing = true;
    stepped = false;
    root.classList.remove('aside');
    markLast();
    if (!root.isConnected) document.body.append(root);
    root.classList.add('on');
    // Framed before the stage comes up, so a stage made now starts where it should be.
    takeStage(!stage.open);
    stage.show('bridge');
    // Again once the column has its size.
    requestAnimationFrame(measure);
    defaultButton().focus({ preventScroll: true });
    count();
  }

  /** Goes; `out` leaves by the bridge's window, into the menu behind, rather than fading where it stands. */
  function hide(out = false): void {
    if (!showing) return;
    showing = false;
    window.clearTimeout(counting);
    stepped = false;
    root.classList.remove('on', 'aside');
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (out) stage.leave();
    else stage.hide();
  }

  return {
    root,
    get open() {
      return showing;
    },
    get mode() {
      return chosen;
    },
    show,
    hide: () => hide(),
    aside(on) {
      if (!showing || stepped === on) return;
      stepped = on;
      root.classList.toggle('aside', on);
      if (!on) {
        takeStage(false);
        defaultButton().focus({ preventScroll: true });
      }
    },
    dispose() {
      hide();
      root.remove();
    },
  };
}
