/**
 * The title screen: the first thing after the loading card, standing in front
 * of the planet menu (`menu.ts`, which it holds while it is up) with the solar
 * system turning behind it.
 *
 * On the left the name of the game and how to play — **online**, on the relay
 * (`peers.ts`), or **offline**, where no socket is ever opened and everything
 * runs on this machine — and, while the world is still being built behind
 * it, how far along that is. On the right the traveller themselves, large, on
 * the hero's stage (`hero-stage.ts`): idling on the bridge of a small ship
 * (`bridge.ts`), the solar system outside its window, turning a little
 * towards the pointer and by hand when dragged, their name on a plate over
 * their head with a pencil to change it, and *Customise* under them.
 *
 * The window is the menu itself: the orrery the planet menu draws keeps
 * turning behind the stage's transparent canvas, and the room covers all of
 * it but the glass. Choosing how to play flies the camera out through the
 * window (`stage.leave`), so the bridge slides away and the solar system it
 * was looking at is the menu that takes over.
 *
 * *Customise* does not open a card over this one. The creator
 * (`traveller.ts`) shares the stage: this screen steps aside (`aside`), the
 * creator's column comes in from the left, and the camera walks up to the
 * hero; when it closes the camera walks back and this screen returns.
 *
 * It owns nothing but the choice. The look is `avatar.ts`'s, the name is
 * `peers.ts`'s (kept on this device until there is a connection to send it
 * on), the creator and the settings are the caller's; the mode it hands back
 * is remembered (`PLAY_KEY`) so the next visit starts on the same button, and
 * a `?at=` link that skips this screen plays the remembered way.
 */
import { holdFocus } from './controls.ts';
import type { HeroStage } from './hero-stage.ts';
import { ensureStyle, h, icon, installUi } from './ui.ts';
import type { PlayMode } from './world-host.ts';

export type { PlayMode };

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
  /** Opens the creator, which asks this screen to step aside while it is up. */
  customise(): void;
  /** Opens the settings. Omit it and there is no button. */
  settings?(): void;
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
  /** How far the world behind is built, and what it is doing. */
  progress(fraction: number, label: string): void;
  /** The world is built: the line that said so goes. */
  ready(): void;
  /** The screen is done with for good. */
  dispose(): void;
}

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
.ti-left { display: flex; flex-direction: column; justify-content: center; gap: 26px; min-width: 0; pointer-events: auto; transition: opacity 0.35s ease, transform 0.45s var(--ui-ease); }
.atlas-title.on .ti-left > * { animation: ti-rise 0.6s var(--ui-ease) both; }
.atlas-title.on .ti-left > :nth-child(2) { animation-delay: 0.06s; }
.ti-wordmark {
  font-size: 118px;
  font-weight: 800;
  letter-spacing: -0.05em;
  line-height: 0.82;
  color: var(--ui-paper);
  -webkit-text-stroke: 9px var(--ui-ink);
  paint-order: stroke fill;
  text-shadow: 0 9px 0 var(--ui-ink);
}
.ti-tagline {
  margin-top: 18px;
  max-width: 400px;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.35;
  color: rgba(255, 242, 232, 0.92);
  text-shadow: 0 2px 0 rgba(4, 6, 14, 0.7);
}
.ti-card { padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 12px; max-width: 420px; }
.ti-play {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 13px 16px;
  text-align: left;
  white-space: normal;
}
.ti-play svg { width: 26px; height: 26px; }
.ti-play b { display: block; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
.ti-play small { display: block; margin-top: 3px; font-size: 12.5px; font-weight: 700; opacity: 0.62; }
.ti-play .ui-tag { visibility: hidden; }
.ti-play.last .ui-tag { visibility: visible; }
.ti-row { display: flex; gap: 8px; }
.ti-row .ui-btn { flex: 1; }
.ti-build { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 12px; padding-top: 10px; border-top: 1.5px dashed var(--ui-rule); }
.ti-build[hidden] { display: none; }
.ti-build span { font-size: 12px; font-weight: 700; opacity: 0.62; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ti-build b { font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; }
.ti-build i { grid-column: 1 / -1; display: block; height: 8px; border: 2px solid var(--ui-ink); border-radius: 999px; background: var(--ui-cream); overflow: hidden; }
.ti-build i::before { content: ''; display: block; height: 100%; width: var(--done, 0%); background: var(--ui-gold); transition: width 0.5s ease; }
.ti-right { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.ti-custom { position: relative; pointer-events: auto; transition: opacity 0.3s ease, transform 0.4s var(--ui-ease); }
/* Backwards, not both: a fill kept after the rise would outrank the aside rule and leave the button under the creator. */
.atlas-title.on .ti-custom { animation: ti-rise 0.6s 0.2s var(--ui-ease) backwards; }
.atlas-title.aside { background: linear-gradient(90deg, rgba(4, 6, 14, 0.5) 0%, rgba(4, 6, 14, 0) 55%); }
.atlas-title.aside .ti-left { opacity: 0; transform: translateX(-60px); pointer-events: none; }
.atlas-title.aside .ti-custom { opacity: 0; transform: translateY(24px); pointer-events: none; }
@keyframes ti-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@media (max-width: 860px) {
  .atlas-title { grid-template-columns: 1fr; grid-template-rows: 1fr auto; padding: 24px 16px; gap: 8px; overflow: auto; }
  .ti-left { order: 2; justify-content: flex-start; gap: 16px; }
  .ti-right { order: 1; min-height: 300px; }
  .ti-wordmark { font-size: 72px; -webkit-text-stroke-width: 7px; text-shadow: 0 6px 0 var(--ui-ink); }
  .ti-tagline { font-size: 16px; margin-top: 10px; }
  .atlas-title { background: linear-gradient(0deg, rgba(4, 6, 14, 0.75) 0%, rgba(4, 6, 14, 0.4) 50%, rgba(4, 6, 14, 0) 70%); }
}
@media (max-height: 640px) {
  .ti-wordmark { font-size: 80px; }
  .ti-left { gap: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-title.on .ti-left > *, .atlas-title.on .ti-custom { animation: none; }
  .ti-left, .ti-custom { transition: none; }
}
`;

export function createTitle(options: TitleOptions): Title {
  installUi();
  ensureStyle('atlas-title', STYLE);
  const stage = options.stage;

  let chosen: PlayMode | null = storedPlayMode();

  function playButton(mode: PlayMode, glyph: SVGSVGElement, label: string, note: string, primary: boolean): HTMLButtonElement {
    const button = h(
      'button',
      { class: `ui-btn ${primary ? 'primary' : ''} ti-play`, type: 'button', 'data-mode': mode },
      glyph,
      h('span', {}, h('b', { text: label }), h('small', { text: note })),
      h('span', { class: 'ui-tag', text: 'Last time' }),
    );
    button.addEventListener('click', () => choose(mode));
    button.addEventListener('pointerenter', () => {
      options.sound?.hover();
      stage.wave();
    });
    return button;
  }
  const onlineButton = playButton(
    'online',
    icon('globe'),
    'Play online',
    options.online ? 'Meet the other travellers on the same planet' : 'No server to meet anyone on in this version',
    true,
  );
  onlineButton.disabled = !options.online;
  const offlineButton = playButton('offline', icon('walk'), 'Play offline', 'Just you and the worlds, nothing sent anywhere', false);

  const settingsButton =
    options.settings === undefined ? null : h('button', { class: 'ui-btn', type: 'button' }, icon('gear', 18), 'Settings');
  settingsButton?.addEventListener('click', () => options.settings?.());

  // How far the world behind is: a quiet line at the foot of the card, in
  // place of the menu's own pill, which this screen would otherwise sit on.
  const buildLabel = h('span', { text: 'Building the world' });
  const buildPercent = h('b', { text: '0%' });
  const buildBar = h('i');
  const build = h('div', { class: 'ti-build', role: 'status' }, buildLabel, buildPercent, buildBar);

  const customButton = h('button', { class: 'ui-btn big ti-custom', type: 'button' }, icon('sparkle', 20), 'Customise');
  customButton.addEventListener('click', () => options.customise());
  customButton.addEventListener('pointerenter', () => options.sound?.hover());

  const left = h(
    'div',
    { class: 'ti-left' },
    h('div', {}, h('h1', { class: 'ti-wordmark', text: 'atlas' }), h('div', { class: 'ti-tagline', text: 'Explore the solar system — on foot, by sea and by air.' })),
    h(
      'div',
      { class: 'ti-card ui-card' },
      onlineButton,
      offlineButton,
      settingsButton === null ? null : h('div', { class: 'ti-row' }, settingsButton),
      build,
    ),
  );
  const right = h('div', { class: 'ti-right' }, customButton);
  const root = h('div', { class: 'atlas-title', role: 'dialog', 'aria-label': 'atlas' }, left, right);

  function markLast(): void {
    onlineButton.classList.toggle('last', chosen === 'online' && options.online);
    offlineButton.classList.toggle('last', chosen === 'offline');
  }

  /** Tells the stage what the column and the button cover, so the traveller stands in the rest. */
  function measure(): void {
    if (!showing || stepped) return;
    const height = innerHeight;
    if (matchMedia('(max-width: 860px)').matches) {
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
  }

  /** Goes; `out` leaves by the bridge's window, into the menu behind, rather than fading where it stands. */
  function hide(out = false): void {
    if (!showing) return;
    showing = false;
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
    progress(fraction, label) {
      const done = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
      buildLabel.textContent = `Building the world · ${label}`;
      buildPercent.textContent = `${done}%`;
      build.style.setProperty('--done', `${done}%`);
    },
    ready() {
      build.hidden = true;
    },
    dispose() {
      hide();
      root.remove();
    },
  };
}
