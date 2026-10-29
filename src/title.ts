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
import { ensureStyle, h, hex, icon, installUi } from './ui.ts';
import { PALETTE } from './theme.ts';
import { levelOf } from './explorer-level.ts';
import { createFlagCanvas } from './flags.ts';
import { NEWS } from './news.ts';
import type { PlayMode } from './world-host.ts';

export type { PlayMode };

/** How often the title asks the relay how many are online, while it is up. */
const COUNT_EVERY_MS = 30_000;
/** The most players the title names. */
const ONLINE_ROWS = 3;
/**
 * How long the name stays once the title goes, ms: through the bridge's flight
 * out of its window (`LEAVE` and `LEAVE_FADE` in `hero-stage/shots.ts`), until
 * the planet menu's own name stands under it.
 */
const BRAND_HOLD_MS = 2100;
/** How long each piece of news stands before the next, ms. */
const NEWS_TURN_MS = 7000;

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
  players?(): Promise<OnlinePlayer[] | null>;
  /** Opens the creator, which asks this screen to step aside while it is up. */
  customise(): void;
  /** Opens the settings. Omit it and there is no button. */
  settings?(): void;
  /** Builds the account's chip beside the settings (`account.ts`). Omit it and there is none. */
  account?(into: HTMLElement): void;
  /** What the passport holds, for the panel of how far the traveller has come; null or absent hides it. */
  travels?(): { stamps: number; towns: number } | null;
  /** The panel of travels was pressed: the passport opens. */
  openTravels?(): void;
  /** The screen is gone for good: whatever it opened goes with it. */
  onDispose?(): void;
  /** Whether a card in front of this screen has the keyboard: its keys wait. */
  covered?(): boolean;
  /** A pointer over a control, and a choice made, for the menu's sound. */
  sound?: { hover(): void; select(): void };
  /** A mode was chosen: the menu behind can take over. */
  onChoose?(mode: PlayMode): void;
}

/** Somebody playing now, as the title lists them. */
export interface OnlinePlayer {
  name: string;
  /** The country they stand in on Earth, for its flag; null at sea or on another world. */
  iso: string | null;
  /** `Earth`, or the world they are on. */
  world: string;
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
/* The game's name, top left, set as the planet menu sets its own and at the same place, so the hand-over does not move it. */
.ti-brand {
  position: fixed;
  left: 32px;
  top: 56px;
  z-index: 12;
  padding: 0 4px 4px;
  font-family: var(--ui-font);
  font-size: clamp(34px, calc(2.4vw + 16px), 56px);
  font-weight: 900;
  letter-spacing: 0.03em;
  line-height: 1.05;
  text-transform: uppercase;
  color: ${hex(PALETTE.white)};
  -webkit-text-stroke: 8px ${hex(PALETTE.ink)};
  paint-order: stroke fill;
  text-shadow: 0 5px 0 rgba(30, 6, 3, 0.6);
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
}
.ti-brand.on { opacity: 1; visibility: visible; }
/* The choice: two buttons of the same width, the way played last in gold, the other on glass. */
.ti-menu { display: flex; flex-direction: column; gap: 10px; width: min(360px, 100%); }
.ti-play {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  width: 100%;
  padding: 13px 20px 12px;
  border-radius: 16px;
  text-align: left;
  white-space: normal;
}
.ti-play b { display: block; font-size: 19px; font-weight: 900; letter-spacing: 0.01em; line-height: 1.1; }
.ti-play small { display: block; font-size: 12.5px; font-weight: 700; line-height: 1.3; opacity: 0.62; }
.ti-play.primary small { opacity: 0.7; }
/* Every button on the title that is not the gold one is glass, as the menus behind are. */
.atlas-title .ui-btn:not(.primary) {
  color: ${hex(PALETTE.white)};
  background: rgba(30, 6, 3, 0.62);
  border: 1.5px solid rgba(255, 242, 232, 0.16);
  box-shadow: 0 10px 30px rgba(4, 6, 14, 0.35);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}
.atlas-title .ui-btn:not(.primary):hover { background: rgba(30, 6, 3, 0.78); border-color: rgba(255, 242, 232, 0.32); transform: none; }
.atlas-title .ui-btn:not(.primary)[disabled] { opacity: 0.5; }
.atlas-title .ui-btn.primary { border-color: var(--ui-gold); box-shadow: 0 10px 30px rgba(4, 6, 14, 0.35); }
.atlas-title .ui-btn.primary:hover { transform: none; filter: brightness(1.06); }
/* Settings and the account, on one line under the choice. */
.ti-links { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: min(360px, 100%); }
.ti-links > :only-child { grid-column: 1 / -1; }
.ti-links .ui-btn { width: 100%; height: 46px; justify-content: center; font-size: 14.5px; border-radius: 999px; }
.ti-links .ac-chip { display: flex; width: 100%; }
.ti-links .ui-btn > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Bottom left: who is out there, a line: a live dot, how many, the first few. */
.ti-online {
  position: absolute;
  left: 56px;
  bottom: 40px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  max-width: 420px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 242, 232, 0.8);
  text-shadow: var(--ui-space-shadow);
  pointer-events: auto;
  transition: opacity 0.35s ease;
}
.ti-online[hidden] { display: none; }
.atlas-title.aside .ti-online { opacity: 0; }
.ti-online b { font-weight: 900; color: ${hex(PALETTE.white)}; }
.ti-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: ${hex(PALETTE.green)}; box-shadow: 0 0 0 3px rgba(91, 168, 79, 0.25); animation: ti-live 1.8s ease-in-out infinite; }
.ti-dot.off { background: rgba(255, 242, 232, 0.4); box-shadow: none; animation: none; }
@keyframes ti-live { 50% { box-shadow: 0 0 0 6px rgba(91, 168, 79, 0); } }
.ti-who { display: inline-flex; align-items: center; gap: 5px; }
.ti-who canvas { border: 1.5px solid rgba(30, 6, 3, 0.9); border-radius: 3px; }
.ti-who.more { opacity: 0.6; }
/* Top right: how far you have come, a glass card that opens the passport. */
.ti-travels {
  position: absolute;
  top: 48px;
  right: 56px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 300px;
  box-sizing: border-box;
  padding: 14px 16px 15px;
  font: inherit;
  color: ${hex(PALETTE.white)};
  text-align: left;
  background: rgba(30, 6, 3, 0.62);
  border: 1.5px solid rgba(255, 242, 232, 0.16);
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(4, 6, 14, 0.35);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  pointer-events: auto;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.35s ease;
}
.ti-travels[hidden] { display: none; }
.ti-travels:hover { background: rgba(30, 6, 3, 0.8); border-color: rgba(255, 242, 232, 0.34); }
.ti-travels:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.atlas-title.on .ti-travels { animation: ti-rise 0.6s 0.1s var(--ui-ease) backwards; }
.atlas-title.aside .ti-travels { opacity: 0; pointer-events: none; }
.ti-travels-kicker { font-size: 11px; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ui-gold); }
.ti-travels-top { display: flex; align-items: center; gap: 10px; }
.ti-travels-level { flex: none; padding: 3px 9px; border-radius: 999px; background: var(--ui-gold); color: ${hex(PALETTE.ink)}; font-size: 12px; font-weight: 900; font-variant-numeric: tabular-nums; }
.ti-travels-bar { position: relative; flex: 1; height: 8px; border-radius: 999px; background: rgba(255, 242, 232, 0.14); overflow: hidden; }
.ti-travels-bar > i { position: absolute; inset: 0; transform-origin: 0 50%; background: var(--ui-gold); border-radius: inherit; }
.ti-travels-stats { display: flex; gap: 16px; font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
.ti-travels-stats span { display: inline-flex; align-items: center; gap: 6px; }
.ti-travels-stats small { font-size: 12px; font-weight: 700; opacity: 0.6; }
.ti-travels-stats svg { width: 15px; height: 15px; opacity: 0.75; }
/* Bottom right: the news, a picture card. */
.ti-aside {
  position: absolute;
  right: 56px;
  bottom: 40px;
  width: 340px;
  pointer-events: auto;
  transition: opacity 0.35s ease, transform 0.45s var(--ui-ease);
}
.atlas-title.on .ti-aside { animation: ti-rise 0.6s 0.1s var(--ui-ease) backwards; }
.atlas-title.aside .ti-aside { opacity: 0; transform: translateX(40px); pointer-events: none; }
.ti-block {
  overflow: hidden;
  color: ${hex(PALETTE.white)};
  background: rgba(30, 6, 3, 0.62);
  border: 1.5px solid rgba(255, 242, 232, 0.16);
  border-radius: 18px;
  box-shadow: 0 16px 48px rgba(4, 6, 14, 0.45);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}
.ti-feed-picture { position: relative; aspect-ratio: 16 / 9; background: rgba(4, 6, 14, 0.6); }
.ti-feed-image { display: block; width: 100%; height: 100%; object-fit: cover; }
.ti-feed-picture::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(30, 6, 3, 0) 55%, rgba(30, 6, 3, 0.85)); }
.ti-feed-tag { position: absolute; left: 14px; top: 12px; z-index: 1; padding: 4px 9px; border-radius: 999px; background: var(--ui-gold); color: ${hex(PALETTE.ink)}; font-size: 10.5px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; }
.ti-feed-text { position: relative; z-index: 1; margin-top: -26px; padding: 2px 16px 0; }
.ti-feed-text b { display: block; font-size: 19px; font-weight: 900; letter-spacing: 0.02em; text-transform: uppercase; -webkit-text-stroke: 4px ${hex(PALETTE.ink)}; paint-order: stroke fill; }
.ti-feed-text p { margin: 6px 0 0; min-height: 2.9em; font-size: 13px; font-weight: 600; line-height: 1.45; opacity: 0.75; }
.ti-feed-dots { display: flex; gap: 6px; padding: 12px 16px 14px; }
.ti-feed-dot { width: 18px; height: 5px; padding: 0; border: 0; border-radius: 999px; background: rgba(255, 242, 232, 0.22); cursor: pointer; transition: background 0.2s ease, width 0.25s var(--ui-ease); }
.ti-feed-dot.on { width: 30px; background: var(--ui-gold); }
.ti-feed-dot:focus-visible { outline: var(--ui-ring); outline-offset: 2px; }
.ti-right { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.ti-custom { position: fixed; left: var(--hero-x, 50%); bottom: 40px; translate: -50% 0; border-radius: 999px; pointer-events: auto; transition: opacity 0.3s ease, transform 0.4s var(--ui-ease); }
/* Backwards, not both: a fill kept after the rise would outrank the aside rule and leave the button under the creator. */
.atlas-title.on .ti-custom { animation: ti-rise 0.6s 0.2s var(--ui-ease) backwards; }
.atlas-title.aside { background: linear-gradient(90deg, rgba(4, 6, 14, 0.5) 0%, rgba(4, 6, 14, 0) 55%); }
.atlas-title.aside .ti-left { opacity: 0; transform: translateX(-60px); pointer-events: none; }
.atlas-title.aside .ti-custom { opacity: 0; transform: translateY(24px); pointer-events: none; }
@keyframes ti-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
/* Upright and narrow: the traveller on top, the choice under them, the corners' cards left out. */
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
  .ti-menu, .ti-links { width: 100%; }
  .ti-play { padding: 10px 14px; }
  .ti-play b { font-size: 18px; }
  .ti-aside, .ti-online, .ti-travels { display: none; }
  .ti-custom { position: relative; left: auto; bottom: auto; translate: none; }
  .ti-brand { left: 16px; top: max(16px, env(safe-area-inset-top)); font-size: 30px; -webkit-text-stroke-width: 6px; }
  .atlas-title { background: linear-gradient(0deg, rgba(4, 6, 14, 0.75) 0%, rgba(4, 6, 14, 0.4) 50%, rgba(4, 6, 14, 0) 70%); }
}
@media (max-height: 640px) {
  .ti-left { gap: 16px; }
}
/* A phone on its side: two small columns, the choice on the left and the traveller on the right. */
@media (max-height: 520px) and (orientation: landscape) {
  .atlas-title {
    grid-template-columns: minmax(280px, 360px) 1fr;
    padding: max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
    gap: 12px;
  }
  .ti-left { gap: 10px; overflow-y: auto; padding-top: 52px; }
  .ti-play { padding: 7px 12px; }
  .ti-play b { font-size: 16px; }
  .ti-play small { font-size: 11.5px; }
  .ti-links .ui-btn { height: 40px; font-size: 14px; }
  .ti-aside, .ti-online, .ti-travels { display: none; }
  .ti-custom { scale: 0.85; }
  .ti-brand { left: max(20px, env(safe-area-inset-left)); top: max(12px, env(safe-area-inset-top)); font-size: 28px; -webkit-text-stroke-width: 6px; }
}
/* Short windows keep the news card and drop its picture. */
@media (max-height: 640px) {
  .ti-feed-picture { display: none; }
  .ti-feed-text { margin-top: 0; padding-top: 14px; }
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
  const onlineNote = options.online ? 'Travel with the others, on the same planet' : 'No server to meet anyone on in this version';
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

  // The left: the choice.
  const travels = h('button', { class: 'ti-travels', type: 'button', title: 'Open your passport' });
  travels.hidden = true;
  travels.addEventListener('click', () => options.openTravels?.());
  travels.addEventListener('pointerenter', () => options.sound?.hover());
  const online = h('div', { class: 'ti-online' });
  online.hidden = !options.online;
  const left = h(
    'div',
    { class: 'ti-left' },
    h('nav', { class: 'ti-menu', 'aria-label': 'Play' }, onlineButton, offlineButton),
    settingsButton === null && accountSlot === null ? null : h('div', { class: 'ti-links' }, settingsButton, accountSlot),
  );
  const right = h('div', { class: 'ti-right' }, customButton);
  // Bottom right: what is new.
  const feed = h('div', { class: 'ti-feed' });
  const aside = h('div', { class: 'ti-aside' }, h('div', { class: 'ti-block' }, feed));
  // Top right how far you have come, bottom left who is out there, bottom right what is new.
  const root = h('div', { class: 'atlas-title', role: 'dialog', 'aria-label': 'planeteer' }, left, right, aside, travels, online);

  return { onlineNote, onlineButton, offlineButton, customButton, left, right, travels, feed, online, aside, root };
}

/** How far the traveller has come, top right: the level, its bar, and what the passport holds. */
function fillTravels(travels: HTMLElement, passport: { stamps: number; towns: number } | null): void {
  travels.hidden = passport === null;
  if (passport === null) return;
  const { level, progress } = levelOf(passport.stamps, passport.towns);
  const fill = h('i');
  fill.style.transform = `scaleX(${Math.max(0.03, Math.min(1, progress)).toFixed(3)})`;
  const stat = (name: 'passport' | 'flag', count: number, one: string, many: string): HTMLElement =>
    h('span', {}, icon(name, 15), h('b', { text: count.toLocaleString('en') }), h('small', { text: count === 1 ? one : many }));
  travels.replaceChildren(
    h('div', { class: 'ti-travels-kicker', text: 'Your travels' }),
    h('div', { class: 'ti-travels-top' }, h('span', { class: 'ti-travels-level', text: `Lv ${level}` }), h('span', { class: 'ti-travels-bar' }, fill)),
    h('div', { class: 'ti-travels-stats' }, stat('passport', passport.stamps, 'country', 'countries'), stat('flag', passport.towns, 'town', 'towns')),
  );
  travels.setAttribute('aria-label', `Level ${level}: ${passport.stamps} countries, ${passport.towns} towns. Open your passport`);
}

/** Who is playing now, as a line: a live dot, how many, and the first few by name and flag. */
function fillOnline(element: HTMLElement, players: OnlinePlayer[] | null): void {
  if (players === null) {
    element.replaceChildren(h('i', { class: 'ti-dot off' }), h('span', { text: 'The server is not answering' }));
    return;
  }
  const count = players.length;
  const names = players.slice(0, ONLINE_ROWS).map((player) =>
    h('span', { class: 'ti-who', title: player.world }, player.iso === null ? null : createFlagCanvas(player.iso, 18, 12), player.name),
  );
  element.replaceChildren(
    h('i', { class: count === 0 ? 'ti-dot off' : 'ti-dot' }),
    h('b', { text: count === 0 ? 'Nobody online right now' : `${count.toLocaleString('en')} online now` }),
    ...names,
    ...(count > ONLINE_ROWS ? [h('span', { class: 'ti-who more', text: `+${count - ONLINE_ROWS}` })] : []),
  );
}

/** What is new, a card at a time, each with its picture; the dots under it turn, and so does the clock. */
function fillNews(element: HTMLElement, signal: AbortSignal): void {
  let at = 0;
  const image = h('img', { class: 'ti-feed-image', alt: '' });
  const title = h('b');
  const text = h('p');
  const dots = NEWS.map((_, i) => {
    const dot = h('button', { class: 'ti-feed-dot', type: 'button', 'aria-label': `News ${i + 1}` });
    dot.addEventListener('click', () => show(i), { signal });
    return dot;
  });
  const show = (i: number): void => {
    at = (i + NEWS.length) % NEWS.length;
    const item = NEWS[at]!;
    image.src = item.image;
    title.textContent = item.title;
    text.textContent = item.text;
    dots.forEach((dot, k) => dot.classList.toggle('on', k === at));
  };
  element.replaceChildren(
    h('div', { class: 'ti-feed-picture' }, image, h('span', { class: 'ti-feed-tag', text: 'What\u2019s new' })),
    h('div', { class: 'ti-feed-text' }, title, text),
    h('div', { class: 'ti-feed-dots' }, ...dots),
  );
  show(0);
  const timer = window.setInterval(() => show(at + 1), NEWS_TURN_MS);
  signal.addEventListener('abort', () => window.clearInterval(timer));
}

export function createTitle(options: TitleOptions): Title {
  installUi();
  ensureStyle('atlas-title', STYLE);
  const stage = options.stage;

  let chosen: PlayMode | null = storedPlayMode();
  const { onlineButton, offlineButton, customButton, left, right, travels, feed, online, aside, root } = titleLayout(options, (mode) => choose(mode));
  const events = new AbortController();
  fillNews(feed, events.signal);
  // The game's name, where the planet menu sets its own and the same: it stays through the hand-over,
  // and goes only once the menu's stands in its place.
  const brand = h('div', { class: 'ti-brand', 'aria-hidden': 'true', text: 'Planeteer' });
  let brandTimer = 0;
  const showBrand = (on: boolean, after = 0): void => {
    window.clearTimeout(brandTimer);
    if (on) {
      if (!brand.isConnected) document.body.append(brand);
      brand.classList.add('on');
    } else if (after > 0) {
      brandTimer = window.setTimeout(() => brand.classList.remove('on'), after);
    } else {
      brand.classList.remove('on');
    }
  };

  // Who is out there, asked when the screen comes up and again while it stays.
  let counting = 0;
  function count(): void {
    window.clearTimeout(counting);
    if (!showing || !options.online || options.players === undefined) return;
    void options.players().then((players) => fillOnline(online, players));
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
      // The traveller stands between the column on the left and the one on the right, and *Customise* under their feet.
      const insetLeft = left.offsetLeft + left.offsetWidth + 24;
      const insetRight = aside.offsetWidth + 72;
      stage.insets({ left: insetLeft, right: insetRight, top: 80, bottom: customButton.offsetHeight + 64 });
      root.style.setProperty('--hero-x', `${Math.round((insetLeft + innerWidth - insetRight) / 2)}px`);
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
    fillTravels(travels, options.travels?.() ?? null);
    if (!root.isConnected) document.body.append(root);
    root.classList.add('on');
    showBrand(true);
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
    showBrand(false, BRAND_HOLD_MS);
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
      // The creator has the top left for its own title.
      showBrand(!on);
      if (!on) {
        takeStage(false);
        defaultButton().focus({ preventScroll: true });
      }
    },
    dispose() {
      hide();
      root.remove();
      brand.remove();
      window.clearTimeout(brandTimer);
      events.abort();
      options.onDispose?.();
    },
  };
}
