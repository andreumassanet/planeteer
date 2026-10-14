/** The chat's lines: game messages and players' lines, with a flag or a world's mark beside each. */
import { createFlagCanvas } from '../flags.ts';
import { fold, h, icon } from '../ui.ts';
import { worldName } from '../relay-players.ts';
import { worldDisc } from '../world-disc.ts';
import { actionOf as actionIn } from '../chat-core.ts';
import { FADE_MS, KEEP_LINES, LINE_MS } from './style.ts';
import type { ChatCtx } from './context.ts';

export interface ChatLog {
  system(text: string, kind?: 'system' | 'error'): void;
  /**
   * A player's line, from the relay or from ourselves offline. Said on Earth it
   * carries the flag of the country it was said in; said on another world, that
   * world's mark and name, because its nations' banners mean nothing there.
   */
  line(name: string, iso: string, message: string, self: boolean, world?: string): void;
}

export function createChatLog({ host, dom, state }: ChatCtx): ChatLog {
  const { log } = dom;
  /** Flags as images, one render a country. */
  const flags = new Map<string, string>();

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
    state.entries.push({ element, from });
    while (state.entries.length > KEEP_LINES) state.entries.shift()!.element.remove();
    // Open and scrolled up to read: left where it is. Otherwise the newest.
    if (!state.showing || stuck) log.scrollTop = log.scrollHeight;
    window.setTimeout(() => element.classList.add('fading'), LINE_MS);
    window.setTimeout(() => element.classList.add('gone'), LINE_MS + FADE_MS);
  }

  function system(text: string, kind: 'system' | 'error' = 'system'): void {
    add(h('div', { class: `atlas-chat-line ${kind}` }, icon(kind === 'error' ? 'help' : 'sparkle', 14), h('span', { class: 'text', text })));
  }

  function line(name: string, iso: string, message: string, self: boolean, world = 'earth'): void {
    if (!self && state.muted.has(fold(name))) return;
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

  return { system, line };
}
