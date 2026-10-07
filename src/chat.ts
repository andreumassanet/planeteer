/**
 * The chat: one line of text to everyone on the planet, with the flag of the
 * country each sender stands in, and the commands typed with a `/`.
 *
 * ## One room, like everything else
 *
 * The relay is one room for the planet (`server/src/index.ts`), so the chat is
 * too: a line goes to everybody, however far, which is what a world this big
 * and this empty needs — the player in Lima is worth hearing from in Palma.
 * The flag is where the sender was standing when they said it, as a postcard
 * is stamped where it was posted, and the sea's plate at sea. The relay
 * stamps the name it knows the sender by, and keeps the last lines for
 * whoever joins next.
 *
 * ## What a line is, once
 *
 * How long, which characters, how often: `cleanChat` and `spendChat` in
 * `server/src/limits.ts`, which the relay reads too, so a line this panel
 * lets through is a line the relay passes on, and one it would drop is
 * refused here with a reason. The panel paces at `CHAT_CLIENT_INTERVAL_MS`,
 * a little slower than the relay, so a socket's jitter cannot bring two
 * lines in closer than the relay allows. A line is only ever written with `textContent`
 * — nothing a player types is markup, however it looks.
 *
 * ## Without a relay
 *
 * The chat still opens, the commands still work and a line is shown to the
 * one person who can read it; with a relay that has dropped, the panel says
 * so beside the line.
 *
 * ## The keyboard
 *
 * `Enter` or `T` opens the field, and `/` opens it with the slash typed;
 * `Enter` sends and closes, `Esc` closes, and the arrows walk back through
 * what was sent. While the
 * field has the focus every key is its own (`inputBlocked` in `controls.ts`),
 * and the mouse is let go, the way the settings let it go.
 *
 * ## Suggestions
 *
 * A line that starts with `/` lists what it could become over the field, as
 * a game's console does (`suggest` in `chat-core.ts`): the commands that begin
 * with what is typed, each with its usage and its help, then the arguments
 * the command takes — the players online, the towns and countries `/goto`
 * would find, the words `/time` and `/weather` know. The rest of the chosen
 * row and of the usage stand greyed after the text. The arrows choose a row
 * while there are rows, `Tab` writes it in, `Enter` writes it in and sends
 * it once nothing is left to type, and `Esc` puts the list away first.
 *
 * Closed, the last few lines stand over the bottom left for a while and fade;
 * open, the whole history is there to scroll.
 */
import { actionOf, inputBlocked, labelOf } from './controls.ts';
import { createFlagCanvas } from './flags.ts';
import { ensureStyle, fold, h, icon, installUi, kbd } from './ui.ts';
import type { Suggestion } from './chat-core.ts';
import { cleanName } from './peers.ts';
import { worldName } from './relay-players.ts';
import { worldDisc } from './world-disc.ts';
import { latLonOf } from './sphere.ts';
import type { RelayPlayer } from './relay-players.ts';
import type { Peers, RelayMessage } from './peers.ts';
import { blip } from './voice.ts';
import {
  CHAT_CLIENT_INTERVAL_MS,
  CHAT_MAX,
  chatWait,
  cleanBody,
  cleanChat,
  cleanCountry,
  freshBucket,
  spendChat,
} from '../server/src/limits.ts';
import type { Emote } from '../server/src/limits.ts';
import {
  COMMANDS,
  actionOf as actionIn,
  findPlace,
  matchPlayer,
  parseClock,
  parseCommand,
  parseLatLon,
  parseWeather,
  suggest,
  suggestPlaces,
  worldOfKey,
  unescapeSlash,
} from './chat-core.ts';
import type { Gazetteer, ParsedCommand, WeatherWanted } from './chat-core.ts';

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

/** How long a line stands on the screen with the field closed, and how long it takes to go. */
const LINE_MS = 12_000;
const FADE_MS = 900;
/** How many lines the panel keeps; the oldest go first. */
const KEEP_LINES = 120;
/** How many lines typed, for the arrows to walk back through. */
const KEEP_SENT = 30;
/** How many lines' keys are remembered against a reconnection's history showing them twice. */
const SEEN_LINES = 500;
/** The most players `/who` lists by name. */
const WHO_LIST = 12;

const STYLE = `
.atlas-chat {
  position: fixed;
  left: 24px;
  bottom: 24px;
  z-index: 6;
  width: min(380px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  pointer-events: none;
}
/* Over the prompt and a vehicle's keys, which are centred along the bottom,
   once the window is too narrow for the two to stand side by side. */
@media (max-width: 1180px) {
  .atlas-chat { bottom: 140px; }
}
.atlas-chat-log {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: min(34vh, 260px);
  overflow: hidden;
  scrollbar-width: thin;
}
.atlas-chat-line {
  display: flex;
  align-items: baseline;
  gap: 7px;
  align-self: flex-start;
  max-width: 100%;
  box-sizing: border-box;
  padding: 5px 10px 5px 7px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  background: var(--ui-paper);
  border: 2px solid var(--ui-ink);
  border-radius: 10px;
  box-shadow: 0 3px 0 var(--ui-ink);
  transition: opacity ${FADE_MS}ms ease;
  animation: ui-pop 0.25s var(--ui-spring) both;
}
.atlas-chat-line .who { flex: none; font-weight: 800; white-space: nowrap; }
.atlas-chat-line .flag { flex: none; align-self: center; display: block; width: 18px; height: 12px; border: 1.5px solid var(--ui-ink); border-radius: 3px; }
.atlas-chat-line .flag.sea { background: var(--ui-sky); }
.atlas-chat-line .world-disc { align-self: center; margin: 0 3px; }
.atlas-chat-line .where { flex: none; align-self: center; font-size: 10.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.6; }
.atlas-chat-line.self .who { color: var(--ui-violet); }
.atlas-chat-line.me .text { font-style: italic; }
.atlas-chat-line.system { background: var(--ui-cream); font-weight: 700; color: var(--ui-muted); }
.atlas-chat-line.system svg { flex: none; align-self: center; width: 14px; height: 14px; }
.atlas-chat-line.error { background: var(--ui-apricot); color: var(--ui-ink); }
.atlas-chat-line.fading { opacity: 0; }
.atlas-chat:not(.open) .atlas-chat-line.gone { display: none; }
.atlas-chat.open { pointer-events: auto; }
.atlas-chat.open .atlas-chat-log {
  max-height: min(46vh, 380px);
  overflow-y: auto;
  padding: 8px;
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  border-radius: var(--ui-radius);
  box-shadow: var(--ui-drop);
}
.atlas-chat.open .atlas-chat-line { opacity: 1; border-color: transparent; box-shadow: none; padding: 2px 4px; background: transparent; animation: none; }
.atlas-chat.open .atlas-chat-line.system { color: var(--ui-muted); }
.atlas-chat.open .atlas-chat-line.error { background: var(--ui-apricot); border-radius: 8px; padding: 2px 6px; }
.atlas-chat-form {
  display: none;
  align-items: center;
  gap: 8px;
  padding: 5px 6px 5px 12px;
}
.atlas-chat.open .atlas-chat-form { display: flex; }
.atlas-chat-form input {
  flex: 1;
  min-width: 0;
  height: 32px;
  border: 0;
  background: transparent;
  font: 700 14px var(--ui-font);
  color: var(--ui-ink);
  outline: none;
}
.atlas-chat-form input::placeholder { color: rgba(30, 6, 3, 0.45); }
.atlas-chat-form:focus-within { outline: var(--ui-ring); outline-offset: 3px; }
.atlas-chat-head { display: none; align-items: center; justify-content: space-between; gap: 10px; padding: 0 4px; }
.atlas-chat.open .atlas-chat-head { display: flex; }
.atlas-chat-head .ui-eyebrow { opacity: 0.8; }
.atlas-chat-count { font-size: 11px; font-weight: 800; color: var(--ui-muted); }
.atlas-chat-entry { position: relative; }
.atlas-chat-field { position: relative; flex: 1; min-width: 0; display: flex; }
.atlas-chat-ghost {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: pre;
  font: 700 14px var(--ui-font);
  pointer-events: none;
}
.atlas-chat-ghost .typed { color: transparent; }
.atlas-chat-ghost .more { color: rgba(30, 6, 3, 0.38); }
.atlas-chat-suggest {
  display: none;
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  max-height: min(40vh, 318px);
  overflow-y: auto;
  margin: 0;
  padding: 5px;
  list-style: none;
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  border-radius: var(--ui-radius);
  box-shadow: var(--ui-drop);
  scrollbar-width: thin;
}
.atlas-chat.open .atlas-chat-suggest.shown { display: block; }
.atlas-chat-suggest li {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 8px;
  align-items: baseline;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.3;
}
.atlas-chat-suggest li .name { font-weight: 800; white-space: nowrap; }
.atlas-chat-suggest li .usage { font-weight: 700; color: var(--ui-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-chat-suggest li .detail { grid-column: 1 / -1; font-size: 11.5px; font-weight: 600; color: var(--ui-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.atlas-chat-suggest li[aria-selected='true'] { background: var(--ui-cream); box-shadow: inset 0 0 0 2px var(--ui-ink); }
.atlas-chat-suggest-keys { padding: 4px 8px 1px; font-size: 10.5px; font-weight: 800; color: var(--ui-muted); letter-spacing: 0.02em; }
@media (prefers-reduced-motion: reduce) {
  .atlas-chat-line { animation: none; transition: none; }
}
`;

/** A line as the panel keeps it. */
interface Entry {
  element: HTMLElement;
  /** The sender's name, folded, for `/mute`; `''` for a line from the game. */
  from: string;
}

export function createChat(host: ChatHost): Chat {
  installUi();
  ensureStyle('atlas-chat', STYLE);
  /** Every listener the chat adds, and every relay subscription, go with it on `dispose`. */
  const events = new AbortController();
  const { signal } = events;
  const unregister: (() => void)[] = [];

  const log = h('div', { class: 'atlas-chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Chat' });
  const count = h('span', { class: 'atlas-chat-count' });
  const head = h('div', { class: 'atlas-chat-head' }, h('span', { class: 'ui-eyebrow', text: 'Chat' }), count);
  const field = h('input', {
    type: 'text',
    maxlength: CHAT_MAX * 2,
    placeholder: 'Say something, or / for commands',
    autocomplete: 'off',
    enterkeyhint: 'send',
    spellcheck: 'true',
    'aria-label': 'Chat message',
    'aria-autocomplete': 'list',
    'aria-controls': 'atlas-chat-suggest',
    'aria-expanded': 'false',
  });
  const typedGhost = h('span', { class: 'typed' });
  const moreGhost = h('span', { class: 'more' });
  const ghost = h('div', { class: 'atlas-chat-ghost', 'aria-hidden': 'true' }, typedGhost, moreGhost);
  const form = h('form', { class: 'atlas-chat-form ui-card' }, h('div', { class: 'atlas-chat-field' }, ghost, field), kbd('Enter', true));
  const list = h('ul', { class: 'atlas-chat-suggest', id: 'atlas-chat-suggest', role: 'listbox', 'aria-label': 'Suggestions' });
  const root = h('div', { class: 'atlas-chat' }, head, log, h('div', { class: 'atlas-chat-entry' }, list, form));

  const entries: Entry[] = [];
  /** Names by id, from the relay's `hi` and every `in`, for the leaving line. */
  const names = new Map<string, string>();
  /** Lines already shown, so a reconnection's history does not show them twice. */
  const seen = new Set<string>();
  /** Folded names whose lines are hidden. */
  const muted = new Set<string>();
  const sent: string[] = [];
  let recall = -1;
  let draft = '';
  const bucket = freshBucket();
  let showing = false;
  let relock = false;
  let received = 0;
  let sentCount = 0;
  /** Flags as images, one render a country. */
  const flags = new Map<string, string>();

  /* --- lines -------------------------------------------------------------- */

  function flagOf(iso: string): HTMLElement {
    if (iso === '') return h('span', { class: 'flag sea', title: 'At sea' });
    let url = flags.get(iso);
    if (url === undefined) {
      try {
        url = createFlagCanvas(iso, 18, 12).toDataURL();
      } catch {
        url = '';
      }
      flags.set(iso, url);
    }
    const image = h('img', { class: 'flag', alt: host.countryName(iso), title: host.countryName(iso) });
    if (url !== '') image.src = url;
    return image;
  }

  /** Another world's ball, as the menu's dock paints it, where a flag would be. */
  function discOf(world: string): HTMLElement {
    const disc = worldDisc(world, 12);
    disc.classList.add('world');
    disc.title = worldName(world);
    return disc;
  }

    function add(element: HTMLElement, from = ''): void {
    const stuck = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    log.append(element);
    entries.push({ element, from });
    while (entries.length > KEEP_LINES) entries.shift()!.element.remove();
    // Open and scrolled up to read: left where it is. Otherwise the newest.
    if (!showing || stuck) log.scrollTop = log.scrollHeight;
    window.setTimeout(() => element.classList.add('fading'), LINE_MS);
    window.setTimeout(() => element.classList.add('gone'), LINE_MS + FADE_MS);
  }

  function system(text: string, kind: 'system' | 'error' = 'system'): void {
    add(h('div', { class: `atlas-chat-line ${kind}` }, icon(kind === 'error' ? 'help' : 'sparkle', 14), h('span', { class: 'text', text })));
  }

  /**
   * A player's line, from the relay or from ourselves offline. Said on Earth it
   * carries the flag of the country it was said in; said on another world, that
   * world's mark and name, because its nations' banners mean nothing to anyone.
   */
  function line(name: string, iso: string, message: string, self: boolean, world = 'earth'): void {
    if (!self && muted.has(fold(name))) return;
    const action = actionIn(message);
    const away = world !== 'earth';
    const element = h(
      'div',
      { class: `atlas-chat-line${self ? ' self' : ''}${action !== null ? ' me' : ''}` },
      away ? discOf(world) : flagOf(iso),
      away ? h('span', { class: 'where', text: worldName(world) }) : null,
      h('span', { class: 'who', text: action !== null ? name : `${name}:` }),
      h('span', { class: 'text', text: action ?? message }),
    );
    add(element, fold(name));
  }

  /* --- the relay ------------------------------------------------------------ */

  function heard(message: RelayMessage, fresh: boolean): void {
    const m = cleanChat(message.m);
    const id = typeof message.id === 'string' ? message.id : '';
    const at = typeof message.at === 'number' ? message.at : 0;
    if (m === '' || id === '') return;
    const key = `${at}:${id}:${m}`;
    if (seen.has(key)) return;
    seen.add(key);
    // A room's history is fifty lines: remembering a few times that is plenty.
    if (seen.size > SEEN_LINES) seen.delete(seen.values().next().value!);
    const name = cleanName(typeof message.name === 'string' ? message.name : '') || 'Traveller';
    const self = id === host.peers?.id;
    line(name, cleanCountry(message.c), m, self, cleanBody(message.w) || 'earth');
    received++;
    if (fresh && !self && !muted.has(fold(name))) {
      const out = host.sound();
      if (out !== null) blip(out.context, out.node);
    }
  }

  /**
   * A country's or another world's nation's name, from the gazetteer `/goto`
   * searches — which knows every world's — and the world it is on after it
   * when that is not this one: `Tharsis · Mars`.
   */
  const placeNames = new WeakMap<Gazetteer, Map<string, string>>();
  function placeName(iso: string): string {
    const gazetteer = host.gazetteer();
    let names = placeNames.get(gazetteer);
    if (names === undefined) {
      names = new Map(gazetteer.countries.map((country) => [country.iso, country.name]));
      placeNames.set(gazetteer, names);
    }
    const name = names.get(iso) ?? host.countryName(iso);
    const world = worldOfKey(iso);
    return world === (host.world ?? 'earth') ? name : `${name} · ${worldName(world)}`;
  }

  const peers = host.peers;
  let wasOpen = false;
  if (peers !== null) {
    unregister.push(peers.onMessage((message) => {
      if (message.t === 'hi') {
        names.clear();
        for (const row of Array.isArray(message.peers) ? (message.peers as unknown[][]) : []) {
          if (typeof row[0] === 'string' && typeof row[1] === 'string') names.set(row[0], row[1]);
        }
        for (const old of Array.isArray(message.chat) ? (message.chat as RelayMessage[]) : []) {
          if (typeof old === 'object' && old !== null) heard(old, false);
        }
        const others = peers.online ?? 0;
        system(others === 0 ? 'Online · nobody else is here right now' : `Online · ${others} other ${others === 1 ? 'traveller' : 'travellers'} here`);
      } else if (message.t === 'chat') {
        heard(message, true);
      } else if (message.t === 'in' && typeof message.id === 'string') {
        const name = cleanName(typeof message.name === 'string' ? message.name : '') || 'A traveller';
        names.set(message.id, name);
        system(`${name} arrived`);
      } else if (message.t === 'bye' && typeof message.id === 'string') {
        const name = names.get(message.id);
        names.delete(message.id);
        if (name !== undefined) system(`${name} left`);
      }
      showCount();
    }));
    let reached = false;
    let failed = false;
    unregister.push(peers.onState((state) => {
      if (state === 'open') {
        wasOpen = reached = true;
      } else if (state === 'closed' && wasOpen) {
        wasOpen = false;
        system('Lost the connection · trying again');
      } else if (state === 'closed' && !reached && !failed) {
        // Never reached at all: the world plays on alone, and says so once.
        failed = true;
        system('Could not reach the server · playing alone until it answers', 'error');
      } else if (state === 'connecting' && !reached && !failed) {
        system('Connecting to the server…');
      }
      showCount();
    }));
  }

  function showCount(): void {
    const online = peers?.online ?? null;
    count.textContent =
      peers === null ? 'Playing offline' : online === null ? (peers.stats.state === 'connecting' ? 'Connecting…' : 'Not connected') : online === 0 ? 'Only you online' : `${online + 1} online`;
  }

  /* --- saying -------------------------------------------------------------- */

  function say(text: string): void {
    const m = cleanChat(text);
    if (m === '') return;
    const now = Date.now();
    // At the game's own interval, slower than the relay's by the jitter a
    // socket may add (`CHAT_JITTER_MS`): refused here, never dropped there.
    const wait = chatWait(bucket, now, CHAT_CLIENT_INTERVAL_MS);
    if (wait > 0 || !spendChat(bucket, now, CHAT_CLIENT_INTERVAL_MS)) {
      system(`Not so fast · you can say something again in ${Math.max(1, Math.ceil(wait / 1000))} s`, 'error');
      return;
    }
    const iso = host.here().iso;
    sentCount++;
    // The relay's copy comes back to us too, and that is the line shown.
    if (peers !== null && peers.send({ t: 'chat', m, c: iso })) return;
    line(host.name() || 'You', iso, m, true, host.world);
    if (peers !== null) system('Not connected · only you can see that', 'error');
  }

  function gesture(name: Emote): void {
    if (!host.emote(name)) system('Only standing on the ground', 'error');
  }

  /* --- commands ------------------------------------------------------------ */

  const usage = (name: string): string => {
    const spec = COMMANDS.find((command) => command.name === name)!;
    return `/${spec.name}${spec.usage === '' ? '' : ` ${spec.usage}`}`;
  };

  /** Everyone online but us, as the minimap marks them. */
  const players = (): { id: string; name: string; x: number; y: number; z: number }[] =>
    peers === null ? [] : peers.marks.filter((mark) => mark.id !== peers.id).map((mark) => ({ ...mark }));

  /** Runs a command; true to leave the field open, for an answer worth reading or a line to fix. */
  function run(parsed: ParsedCommand): boolean {
    const { command, args } = parsed;
    if (command === null) {
      system(`There is no /${parsed.typed} · /help lists what there is`, 'error');
      return true;
    }
    switch (command.name) {
      case 'help': {
        system('Type / and a list follows what you type · Tab fills it in · // sends a line that starts with /');
        for (const spec of COMMANDS) system(`/${spec.name}${spec.usage === '' ? '' : ` ${spec.usage}`} · ${spec.help}`);
        return true;
      }
      case 'goto': {
        if (args === '') {
          system(`Where to? ${usage('goto')}`, 'error');
          return true;
        }
        const point = parseLatLon(args);
        if (point !== null) {
          host.jumpTo(point.lat, point.lon);
          system(`Off to ${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}`);
          return false;
        }
        const found = findPlace(args, host.gazetteer(), host.here().iso || undefined);
        if (found === null) {
          system(`Nothing called “${args}” is built · try a bigger town nearby`, 'error');
          return true;
        }
        const away = found.world !== (host.world ?? 'earth');
        if (away && host.travel === undefined) {
          system(`${found.name} is on ${worldName(found.world)}, and there is no getting there from here`, 'error');
          return true;
        }
        if (away) host.travel!(found.world, found.lat, found.lon, found.name);
        else host.jumpTo(found.lat, found.lon);
        system(`Off to ${found.name}, ${placeName(found.iso)}${found.via === undefined ? '' : ` · for ${found.via}`}`);
        if (found.others.length > 0) {
          const also = found.others.slice(0, 3).map((iso) => `${found.via ?? found.name}, ${placeName(iso)}`);
          system(`Also: ${also.join(' · ')}`);
        }
        return false;
      }
      case 'home': {
        const home = host.home();
        host.jumpTo(home.lat, home.lon);
        system(`Back to ${home.name}`);
        return false;
      }
      case 'where': {
        const here = host.here();
        const place = here.country === '' ? `At sea off ${here.town}` : `${here.near ? 'In' : 'Near'} ${here.town}, ${here.country}`;
        system(`${place} · ${here.lat.toFixed(4)}, ${here.lon.toFixed(4)}`);
        return true;
      }
      case 'time': {
        const wanted = parseClock(args);
        if (wanted === null) {
          system(`Which time? ${usage('time')}`, 'error');
          return true;
        }
        if (wanted === 'real') {
          host.time.setLive();
          system('The sun is the real one again');
        } else {
          host.time.setHour(wanted.hour);
          const minutes = Math.round(wanted.hour * 60) % 1440;
          system(`The sun is at ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} here`);
        }
        return false;
      }
      case 'weather': {
        const wanted = parseWeather(args);
        if (wanted === null) {
          system(`Which weather? ${usage('weather')}`, 'error');
          return true;
        }
        const done = host.weather(wanted);
        if (done === null) system('The weather cannot be set in this world yet', 'error');
        else if (!done) system(`The ${wanted} would not come`, 'error');
        else system(wanted === 'auto' ? 'The weather is the world’s again' : `Weather · ${wanted}`);
        return done !== true;
      }
      case 'who': {
        if (peers === null) system('You are playing offline · choose Play online on the title screen to meet others');
        else if (peers.online === null) system('Not connected right now', 'error');
        else {
          // Here first, where a town can be named; then the other worlds, from the relay.
          const here = players().map((other) => {
            const where = host.whereIs(other);
            return `${other.name} · ${where.country === '' ? `at sea off ${where.town}` : `${where.near ? 'in' : 'near'} ${where.town}, ${where.country}`}`;
          });
          const world = host.world ?? 'earth';
          void (host.elsewhere?.() ?? Promise.resolve(null)).then((all) => {
            const away = (all ?? []).filter((one) => one.world !== world).map((one) => `${one.name} · on ${worldName(one.world)}`);
            const lines = [...here, ...away];
            if (lines.length === 0) {
              system('Nobody else is online right now');
              return;
            }
            system(`${lines.length} other ${lines.length === 1 ? 'traveller' : 'travellers'} online`);
            for (const text of lines.slice(0, WHO_LIST)) system(text);
            if (lines.length > WHO_LIST) system(`and ${lines.length - WHO_LIST} more`);
          });
        }
        return true;
      }
      case 'tp': {
        const others = players();
        const found = matchPlayer(args, others);
        if (found === null && args !== '' && host.elsewhere !== undefined && host.travel !== undefined) {
          // Not on this world: perhaps on another, where the relay says they stand.
          const world = host.world ?? 'earth';
          void host.elsewhere().then((all) => {
            const away = matchPlayer(args, (all ?? []).filter((one) => one.world !== world && one.at !== undefined));
            if (away === null || away.at === undefined) {
              system(`No one online is called “${args}” · /who lists them`, 'error');
              return;
            }
            const { lat, lon } = latLonOf(away.at);
            system(`Off to ${away.name}, on ${worldName(away.world)}`);
            host.travel!(away.world, lat, lon, away.name);
          });
          return true;
        }
        if (found === null) {
          system(args === '' ? `Who? ${usage('tp')}` : `No one online is called “${args}” · /who lists them`, 'error');
          return true;
        }
        if (!host.joinPlayer(found.id)) {
          system(`${found.name} has gone`, 'error');
          return true;
        }
        system(`Off to ${found.name}`);
        return false;
      }
      case 'me': {
        if (args === '') {
          system(`Doing what? ${usage('me')}`, 'error');
          return true;
        }
        say(`/me ${args}`);
        return false;
      }
      case 'wave':
      case 'dance':
        gesture(command.name);
        return false;
      case 'photo':
        host.photo();
        return false;
      case 'mute':
      case 'unmute': {
        const known = [...new Set([...players().map((player) => player.name), ...names.values(), ...muted])].map((name) => ({ name }));
        const found = matchPlayer(args, known);
        if (found === null) {
          system(args === '' ? `Who? ${usage(command.name)}` : `No one called “${args}”`, 'error');
          return true;
        }
        const folded = fold(found.name);
        if (command.name === 'mute') {
          muted.add(folded);
          // What they said already goes as well.
          for (const entry of entries) if (entry.from === folded) entry.element.remove();
          system(`${found.name} is muted until you reload`);
        } else {
          muted.delete(folded);
          system(`${found.name} is heard again`);
        }
        return true;
      }
      case 'clear':
        entries.length = 0;
        log.replaceChildren();
        return true;
      default:
        return true;
    }
  }

  /* --- the field ------------------------------------------------------------- */

  function show(text = ''): void {
    if (showing) return;
    showing = true;
    relock = document.pointerLockElement === host.lockTarget;
    host.onOpen?.();
    if (document.pointerLockElement !== null) document.exitPointerLock();
    root.classList.add('open');
    showCount();
    field.value = text;
    recall = -1;
    dismissed = false;
    field.focus({ preventScroll: true });
    field.setSelectionRange(text.length, text.length);
    refresh();
    log.scrollTop = log.scrollHeight;
  }

  // A lock asked for by whatever this field opened over — a card closing as
  // it opened — arrives after `show` has let go of the lock: given back, or
  // the field is typed in with the mouse turning the camera.
  document.addEventListener('pointerlockchange', () => {
    if (showing && document.pointerLockElement !== null) document.exitPointerLock();
  }, { signal: events.signal });

  function hide(): void {
    if (!showing) return;
    showing = false;
    root.classList.remove('open');
    offered = [];
    list.classList.remove('shown');
    field.blur();
    host.onClose?.();
    if (relock && typeof host.lockTarget.requestPointerLock === 'function') {
      // Refused after `Esc`, which is not a gesture the browser counts, and
      // for a moment after any release: the pause card is then the way back.
      try {
        const request: unknown = host.lockTarget.requestPointerLock();
        if (request instanceof Promise) request.catch(() => {});
      } catch {
        // As above.
      }
    }
    relock = false;
  }

  function submit(): void {
    const text = field.value;
    field.value = '';
    refresh();
    if (text.trim() === '') {
      hide();
      return;
    }
    if (sent[sent.length - 1] !== text) sent.push(text);
    if (sent.length > KEEP_SENT) sent.shift();
    recall = -1;
    const parsed = parseCommand(text);
    const stay = parsed === null ? (say(unescapeSlash(text)), false) : run(parsed);
    if (!stay) hide();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  }, { signal });
  /* --- suggestions ------------------------------------------------------------ */

  /** The rows over the field, the one chosen, and whether `Esc` put them away until the next key. */
  let offered: Suggestion[] = [];
  let chosen = 0;
  let dismissed = false;
  const sources = {
    players: [] as readonly string[],
    places: (query: string, limit: number) => suggestPlaces(query, host.gazetteer(), placeName, limit, host.here().iso || undefined),
  };

  function showGhost(): void {
    const value = field.value;
    const more = offered.length > 0 ? offered[chosen]!.ghost : dismissed ? '' : suggest(value, sources).ghost;
    typedGhost.textContent = value;
    // A line wider than the field has scrolled under its ghost.
    moreGhost.textContent = more === '' || field.scrollWidth > field.clientWidth ? '' : more;
  }

  function choose(index: number): void {
    const rows = list.querySelectorAll('li');
    rows[chosen]?.setAttribute('aria-selected', 'false');
    chosen = index;
    const row = rows[chosen];
    row?.setAttribute('aria-selected', 'true');
    row?.scrollIntoView({ block: 'nearest' });
    if (row !== undefined) field.setAttribute('aria-activedescendant', row.id);
    showGhost();
  }

  /** Reads the line again, as it is typed. */
  function refresh(): void {
    sources.players = players().map((player) => player.name);
    offered = dismissed || !showing ? [] : suggest(field.value, sources).items;
    list.replaceChildren(
      ...offered.map((item, i) => {
        const row = h(
          'li',
          { id: `atlas-chat-suggest-${i}`, role: 'option', 'aria-selected': 'false' },
          h('span', { class: 'name', text: item.label }),
          h('span', { class: 'usage', text: item.usage }),
          h('span', { class: 'detail', text: item.detail }),
        );
        row.addEventListener('mousemove', () => {
          if (chosen !== i) choose(i);
        }, { signal });
        row.addEventListener('click', () => accept(i, false), { signal });
        return row;
      }),
    );
    if (offered.length > 0) list.append(h('li', { class: 'atlas-chat-suggest-keys', role: 'presentation', text: '↑ ↓ to choose · Tab to fill in · Esc to close' }));
    list.classList.toggle('shown', offered.length > 0);
    field.setAttribute('aria-expanded', String(offered.length > 0));
    field.removeAttribute('aria-activedescendant');
    chosen = 0;
    if (offered.length > 0) choose(0);
    else showGhost();
  }

  /** Writes row `index` into the field; with `send`, a row that finishes the line is sent. */
  function accept(index: number, send: boolean): void {
    const item = offered[index];
    if (item === undefined) return;
    const same = item.line.trimEnd() === field.value.trimEnd();
    field.value = item.line;
    field.setSelectionRange(item.line.length, item.line.length);
    field.focus({ preventScroll: true });
    if (send && item.done) {
      submit();
      return;
    }
    // Accepting what is already written is a request to see the next word's rows.
    if (same) dismissed = false;
    refresh();
  }

  field.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      if (offered.length > 0) {
        dismissed = true;
        refresh();
      } else hide();
    } else if (event.code === 'Tab') {
      // The focus stays in the field whatever `Tab` finds.
      event.preventDefault();
      if (offered.length > 0) accept(chosen, false);
    } else if ((event.code === 'Enter' || event.code === 'NumpadEnter') && offered.length > 0) {
      const item = offered[chosen]!;
      // A line already written as the row says is simply sent.
      if (item.line.trimEnd() === field.value.trimEnd()) return;
      event.preventDefault();
      accept(chosen, true);
    } else if ((event.code === 'ArrowUp' || event.code === 'ArrowDown') && offered.length > 0) {
      event.preventDefault();
      const step = event.code === 'ArrowUp' ? -1 : 1;
      choose((chosen + step + offered.length) % offered.length);
    } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      if (sent.length === 0) return;
      event.preventDefault();
      if (recall < 0) draft = field.value;
      recall = event.code === 'ArrowUp' ? (recall < 0 ? sent.length - 1 : Math.max(0, recall - 1)) : recall < 0 ? -1 : recall + 1;
      if (recall >= sent.length) recall = -1;
      field.value = recall < 0 ? draft : sent[recall]!;
      // A line walked back to is not asked about until it is typed into.
      dismissed = true;
      refresh();
    }
  }, { signal });
  field.addEventListener('input', () => {
    dismissed = false;
    refresh();
  }, { signal });
  field.addEventListener('scroll', showGhost, { signal });
  // A press on the panel's own lines keeps the field's focus, so the history
  // can be scrolled without closing it…
  root.addEventListener('mousedown', (event) => {
    if (event.target !== field) event.preventDefault();
  }, { signal });
  // …and a click anywhere else is a close, as a click on the world would be.
  field.addEventListener('blur', () => {
    window.setTimeout(() => {
      if (showing && !root.contains(document.activeElement)) hide();
    }, 0);
  }, { signal });

  /**
   * The keys that open it, whenever the keys are the world's: `Enter` and
   * `T` (`controls.ts`), and `/` with the slash typed. `Enter` on a button
   * that has the focus is that button's.
   */
  addEventListener('keydown', (event) => {
    if (showing || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const slash = event.key === '/';
    if (!slash && actionOf(event.code) !== 'chat') return;
    if (inputBlocked(event)) return;
    const target = event.target;
    if (event.code.endsWith('Enter') && target instanceof Element && target.closest('button, a[href], [role="button"], [role="switch"], [tabindex]') !== null) return;
    // The key is typed into nothing: the field opens empty, or with its slash.
    event.preventDefault();
    show(slash ? '/' : '');
  }, { signal });

  showCount();
  document.body.append(root);
  if (peers === null) system(`${labelOf('chat')} to chat · / for commands · playing offline, only you can read this`);

  return {
    root,
    get open() {
      return showing;
    },
    show,
    hide,
    system: (text) => system(text),
    get stats() {
      return { lines: entries.length, received, sent: sentCount, muted: [...muted] };
    },
    dispose() {
      if (showing) hide();
      events.abort();
      for (const off of unregister.splice(0)) off();
      root.remove();
    },
  };
}
