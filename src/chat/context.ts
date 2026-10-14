/** What the chat's parts share: its DOM, its state and the host. */
import { CHAT_MAX, freshBucket } from '../../server/src/limits.ts';
import { h, kbd } from '../ui.ts';
import type { ChatHost } from '../chat.ts';

/** A line as the panel keeps it. */
export interface Entry {
  element: HTMLElement;
  /** The sender's name, folded, for `/mute`; `''` for a line from the game. */
  from: string;
}

export interface ChatDom {
  root: HTMLElement;
  log: HTMLElement;
  count: HTMLElement;
  field: HTMLInputElement;
  typedGhost: HTMLElement;
  moreGhost: HTMLElement;
  list: HTMLElement;
  form: HTMLFormElement;
}

export interface ChatState {
  readonly entries: Entry[];
  /** Names by id, from the relay's `hi` and every `in`, for the leaving line. */
  readonly names: Map<string, string>;
  /** Lines already shown, so a reconnection's history does not show them twice. */
  readonly seen: Set<string>;
  /** Folded names whose lines are hidden. */
  readonly muted: Set<string>;
  /** Lines typed, for the arrows to walk back through. */
  readonly sent: string[];
  readonly bucket: ReturnType<typeof freshBucket>;
  showing: boolean;
  received: number;
  sentCount: number;
}

export interface ChatCtx {
  host: ChatHost;
  dom: ChatDom;
  state: ChatState;
  signal: AbortSignal;
}

export function createChatState(): ChatState {
  return {
    entries: [],
    names: new Map(),
    seen: new Set(),
    muted: new Set(),
    sent: [],
    bucket: freshBucket(),
    showing: false,
    received: 0,
    sentCount: 0,
  };
}

export function createChatDom(): ChatDom {
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
  return { root, log, count, field, typedGhost, moreGhost, list, form };
}
