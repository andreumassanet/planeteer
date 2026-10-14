/**
 * The chat: one line of text to everyone on the planet, with the flag of the
 * country each sender stands in, and the commands typed with a `/`.
 *
 * The relay is one room for the planet (`server/src/index.ts`), so a line goes
 * to everybody; the flag is where the sender stood when they said it, and the
 * relay keeps the last lines for whoever joins next. What a line may be (its
 * length, characters and pace) is `cleanChat` and `spendChat` in
 * `server/src/limits.ts`, which the relay applies too; the panel paces a little
 * slower than the relay so socket jitter cannot bring two lines closer than it
 * allows. A line is only ever written with `textContent`. Without a relay the
 * chat still opens and the commands still work.
 *
 * `Enter` or `T` opens the field and `/` opens it with the slash typed;
 * `Enter` sends and closes, `Esc` closes, the arrows walk back through what
 * was sent. While the field has focus every key is its own (`inputBlocked`).
 * A line starting with `/` lists what it could become (`suggest` in
 * `chat-core.ts`): commands, then the arguments they take. Closed, the last
 * few lines stand bottom left for a while and fade.
 *
 * The parts live in `chat/`: `context.ts`, `log.ts`, `relay.ts`, `say.ts`,
 * `commands.ts`, `lookups.ts`, `suggestions.ts`, `field-keys.ts`, `style.ts`.
 */
import { actionOf, inputBlocked, labelOf } from './controls.ts';
import { ensureStyle, installUi } from './ui.ts';
import { isTouch } from './touch.ts';
import type { RelayPlayer } from './relay-players.ts';
import type { Peers } from './peers.ts';
import { parseCommand, unescapeSlash } from './chat-core.ts';
import type { Gazetteer, WeatherWanted } from './chat-core.ts';
import type { Emote } from '../server/src/limits.ts';
import { createCommands } from './chat/commands.ts';
import { createChatDom, createChatState } from './chat/context.ts';
import type { ChatCtx } from './chat/context.ts';
import { attachFieldKeys } from './chat/field-keys.ts';
import { createChatLog } from './chat/log.ts';
import { createLookups } from './chat/lookups.ts';
import { connectRelay, showCount } from './chat/relay.ts';
import { createSay } from './chat/say.ts';
import { createSuggestions } from './chat/suggestions.ts';
import { KEEP_SENT, STYLE } from './chat/style.ts';

/** What the chat needs of the world, handed in by `main.ts`. */
export interface ChatHost {
  /** The relay's socket, or null for a world with none. */
  peers: Peers | null;
  /** The world this page is on, as the relay names it; Earth when left out. */
  world?: string;
  /** Everyone on every world, from the relay, for `/who`; null when it does not answer. */
  elsewhere?(): Promise<readonly RelayPlayer[] | null>;
  /** Our name as the others see it; offline, as we would be seen. */
  name(): string;
  /** Where we stand: the country's code and name (`''` at sea), the nearest built town, and the point. */
  here(): { iso: string; country: string; town: string; near: boolean; lat: number; lon: number };
  /** Where a point on the unit sphere is, for `/who`. */
  whereIs(point: { x: number; y: number; z: number }): { country: string; town: string; near: boolean };
  /** A country's name by its outline code. */
  countryName(iso: string): string;
  /** What `/goto` searches. Asked on the first `/goto`. */
  gazetteer(): Gazetteer;
  jumpTo(lat: number, lon: number): void;
  /**
   * Off to another world, at `lat`, `lon` on it: what `/goto` and `/tp` do
   * when the place or the player is not on this one. Absent where this page
   * cannot leave its world.
   */
  travel?(world: string, lat: number, lon: number, name: string): void;
  /** Where this visit began. */
  home(): { lat: number; lon: number; name: string };
  /** Beside a player, as the map's *join* puts you: false where they have gone. */
  joinPlayer(id: string): boolean;
  time: { setHour(hour: number): number; setLive(): void };
  /**
   * Sets the weather, or hands it back with `auto`: true if it took, false if
   * it was refused, null where this build cannot set the weather at all.
   */
  weather(wanted: WeatherWanted): boolean | null;
  /**
   * A gesture on the hero, and to the others at most once each
   * `EMOTE_INTERVAL_MS`; false where the hero cannot make it (`Player.emote`).
   */
  emote(name: Emote): boolean;
  /** A photo of the world on the next frame. */
  photo(): void;
  /** Where a line's blip is heard, or null while the chat's sound is off or the sound is not open. */
  sound(): { context: BaseAudioContext; node: AudioNode } | null;
  /** Where to hand the pointer back to, if it was locked when the field opened. */
  lockTarget: HTMLElement;
  onOpen?(): void;
  onClose?(): void;
}

export interface Chat {
  root: HTMLElement;
  readonly open: boolean;
  /** Opens the field, with `text` already typed. */
  show(text?: string): void;
  hide(): void;
  /** A line from the game rather than a player. */
  system(text: string): void;
  /** `atlas.chat.stats`: lines held, received and sent, and who is muted. */
  readonly stats: { lines: number; received: number; sent: number; muted: string[] };
  /** Takes the panel off the page and lets go of the keys and the relay's messages. */
  dispose(): void;
}

export function createChat(host: ChatHost): Chat {
  installUi();
  ensureStyle('atlas-chat', STYLE);
  /** Every listener the chat adds, and every relay subscription, go with it on `dispose`. */
  const events = new AbortController();
  const { signal } = events;
  const dom = createChatDom();
  const state = createChatState();
  const ctx: ChatCtx = { host, dom, state, signal };
  const { root, field, form } = dom;
  let relock = false;

  const chat = createChatLog(ctx);
  const unregister = connectRelay(ctx, chat);
  const lookups = createLookups(host);
  const talk = createSay(ctx, chat);
  const run = createCommands(ctx, chat, lookups, talk);
  const suggestions = createSuggestions(ctx, lookups, submit);
  const keys = attachFieldKeys(ctx, suggestions, hide);

  function show(text = ''): void {
    if (state.showing) return;
    state.showing = true;
    relock = document.pointerLockElement === host.lockTarget;
    host.onOpen?.();
    if (document.pointerLockElement != null && typeof document.exitPointerLock === 'function') document.exitPointerLock();
    root.classList.add('open');
    showCount(ctx);
    field.value = text;
    keys.resetRecall();
    suggestions.dismissed = false;
    field.focus({ preventScroll: true });
    field.setSelectionRange(text.length, text.length);
    suggestions.refresh();
    dom.log.scrollTop = dom.log.scrollHeight;
  }

  // A lock asked for by whatever this field opened over (a card closing as
  // it opened) arrives after `show` has let go of the lock: it is given back,
  // or the mouse would turn the camera while typing.
  document.addEventListener('pointerlockchange', () => {
    if (state.showing && document.pointerLockElement != null && typeof document.exitPointerLock === 'function') document.exitPointerLock();
  }, { signal });

  function hide(): void {
    if (!state.showing) return;
    state.showing = false;
    root.classList.remove('open');
    suggestions.clearOffered();
    field.blur();
    host.onClose?.();
    if (relock && typeof host.lockTarget.requestPointerLock === 'function') {
      // Refused after `Esc`, which is not a gesture the browser counts, and
      // for a moment after any release: the pause card is then the way back.
      try {
        const request: unknown = host.lockTarget.requestPointerLock();
        if (request instanceof Promise) request.catch(() => {});
      } catch {
        // The pause card is the way back.
      }
    }
    relock = false;
  }

  function submit(): void {
    const text = field.value;
    field.value = '';
    suggestions.refresh();
    if (text.trim() === '') {
      hide();
      return;
    }
    const { sent } = state;
    if (sent[sent.length - 1] !== text) sent.push(text);
    if (sent.length > KEEP_SENT) sent.shift();
    keys.resetRecall();
    const parsed = parseCommand(text);
    const stay = parsed === null ? (talk.say(unescapeSlash(text)), false) : run(parsed);
    if (!stay) hide();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  }, { signal });
  field.addEventListener('input', () => {
    suggestions.dismissed = false;
    suggestions.refresh();
  }, { signal });
  field.addEventListener('scroll', suggestions.showGhost, { signal });
  // A press on the panel's own lines keeps the field's focus, so the history
  // can be scrolled without closing it...
  root.addEventListener('mousedown', (event) => {
    if (event.target !== field) event.preventDefault();
  }, { signal });
  // ...and a click anywhere else is a close, as a click on the world would be.
  field.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (state.showing && !root.contains(document.activeElement)) hide();
    }, 0);
  }, { signal });

  // The keys that open it, whenever the keys are the world's: `Enter` and `T`
  // (`controls.ts`), and `/` with the slash typed. `Enter` on a button that
  // has the focus is that button's.
  addEventListener('keydown', (event) => {
    if (state.showing || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const slash = event.key === '/';
    if (!slash && actionOf(event.code) !== 'chat') return;
    if (inputBlocked(event)) return;
    const target = event.target;
    if (event.code.endsWith('Enter') && target instanceof Element && target.closest('button, a[href], [role="button"], [role="switch"], [tabindex]') !== null) return;
    // The key is typed into nothing: the field opens empty, or with its slash.
    event.preventDefault();
    show(slash ? '/' : '');
  }, { signal });

  showCount(ctx);
  document.body.append(root);
  if (host.peers === null) chat.system(`${isTouch() ? '' : `${labelOf('chat')} to chat · `}/ for commands · playing offline, only you can read this`);

  return {
    root,
    get open() {
      return state.showing;
    },
    show,
    hide,
    system: (text) => chat.system(text),
    get stats() {
      return { lines: state.entries.length, received: state.received, sent: state.sentCount, muted: [...state.muted] };
    },
    dispose() {
      if (state.showing) hide();
      events.abort();
      for (const off of unregister.splice(0)) off();
      root.remove();
    },
  };
}
