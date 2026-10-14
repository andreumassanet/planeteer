/** The chat's side of the relay: lines heard, arrivals and departures, and the connection's state. */
import { fold } from '../ui.ts';
import { cleanName } from '../peers.ts';
import type { RelayMessage } from '../peers.ts';
import { blip } from '../voice.ts';
import { cleanBody, cleanChat, cleanCountry } from '../../server/src/limits.ts';
import { SEEN_LINES } from './style.ts';
import type { ChatCtx } from './context.ts';
import type { ChatLog } from './log.ts';

/** Shows how many are online, or why not, in the panel's header. */
export function showCount({ host, dom }: ChatCtx): void {
  const peers = host.peers;
  const online = peers?.online ?? null;
  dom.count.textContent =
    peers === null ? 'Playing offline' : online === null ? (peers.stats.state === 'connecting' ? 'Connecting…' : 'Not connected') : online === 0 ? 'Only you online' : `${online + 1} online`;
}

/** Subscribes to the relay; returns the functions that unsubscribe. */
export function connectRelay(ctx: ChatCtx, chat: ChatLog): (() => void)[] {
  const { host, state } = ctx;
  const { system } = chat;
  const peers = host.peers;
  const unregister: (() => void)[] = [];
  if (peers === null) return unregister;

  function heard(message: RelayMessage, fresh: boolean): void {
    const m = cleanChat(message.m);
    const id = typeof message.id === 'string' ? message.id : '';
    const at = typeof message.at === 'number' ? message.at : 0;
    if (m === '' || id === '') return;
    const key = `${at}:${id}:${m}`;
    if (state.seen.has(key)) return;
    state.seen.add(key);
    // A room's history is fifty lines: remembering a few times that is plenty.
    if (state.seen.size > SEEN_LINES) state.seen.delete(state.seen.values().next().value!);
    const name = cleanName(typeof message.name === 'string' ? message.name : '') || 'Traveller';
    const self = id === host.peers?.id;
    chat.line(name, cleanCountry(message.c), m, self, cleanBody(message.w) || 'earth');
    state.received++;
    if (fresh && !self && !state.muted.has(fold(name))) {
      const out = host.sound();
      if (out !== null) blip(out.context, out.node);
    }
  }

  let wasOpen = false;
  unregister.push(peers.onMessage((message) => {
    if (message.t === 'hi') {
      state.names.clear();
      for (const row of Array.isArray(message.peers) ? (message.peers as unknown[][]) : []) {
        if (typeof row[0] === 'string' && typeof row[1] === 'string') state.names.set(row[0], row[1]);
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
      state.names.set(message.id, name);
      system(`${name} arrived`);
    } else if (message.t === 'bye' && typeof message.id === 'string') {
      const name = state.names.get(message.id);
      state.names.delete(message.id);
      if (name !== undefined) system(`${name} left`);
    }
    showCount(ctx);
  }));
  let reached = false;
  let failed = false;
  unregister.push(peers.onState((connection) => {
    if (connection === 'open') {
      wasOpen = reached = true;
    } else if (connection === 'closed' && wasOpen) {
      wasOpen = false;
      system('Lost the connection · trying again');
    } else if (connection === 'closed' && !reached && !failed) {
      // Never reached at all: the world plays on alone, and says so once.
      failed = true;
      system('Could not reach the server · playing alone until it answers', 'error');
    } else if (connection === 'connecting' && !reached && !failed) {
      system('Connecting to the server…');
    }
    showCount(ctx);
  }));
  return unregister;
}
