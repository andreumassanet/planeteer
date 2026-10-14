/**
 * The relay socket: connecting with a backoff, and reading what the relay sends.
 */
import { cleanEmote, cleanFlags } from '../../server/src/limits.ts';
import { RETRY_MS } from './constants.ts';
import type { PeersStats, RelayMessage, State } from './types.ts';
import type { PeersCore } from './core.ts';
import type { Outbound } from './outbound.ts';
import type { Roster } from './roster.ts';

export function createLink(core: PeersCore, roster: Roster, outbound: Outbound) {
  const { bodyId, flagsById, key, looks, messageListeners, names, onEarth, peers, stateListeners, stats, url } = core;
  const s = core.fields;
  const { drop, heard, peerOf, undress } = roster;
  const { send } = outbound;

  function setState(state: PeersStats['state']): void {
    if (stats.state === state) return;
    stats.state = state;
    for (const listener of stateListeners) listener(state);
  }

  /** Opens the socket, or tries again on the backoff when it drops or is refused. */
  function connect(): void {
    if (s.disposed) return;
    setState('connecting');
    let open: WebSocket;
    try {
      const address = new URL(url);
      // Earth's room is the one an address without a body reaches.
      if (!onEarth) address.searchParams.set('body', bodyId);
      if (stats.name !== '') address.searchParams.set('name', stats.name);
      if (s.look !== '') address.searchParams.set('look', s.look);
      s.lookInAddress = s.look;
      address.searchParams.set('key', key);
      open = new WebSocket(address);
    } catch (error) {
      // Refused before it began — a blocked scheme, a page the browser will
      // not let open one — and asked again on the same backoff as a drop.
      console.warn('peers: no relay at', url, error);
      setState('closed');
      s.retryTimer = window.setTimeout(connect, s.retry);
      s.retry = Math.min(RETRY_MS[1], Math.max(RETRY_MS[0], s.retry * 2));
      return;
    }
    s.socket = open;
    open.onopen = () => {
      setState('open');
      s.retry = RETRY_MS[0];
      // Changed while this socket was still connecting: its address has the old one.
      if (s.look !== s.lookInAddress) {
        s.lookSentAt = performance.now();
        open.send(JSON.stringify({ t: 'look', l: s.look }));
        stats.sent++;
      }
    };
    open.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      stats.received++;
      receive(event.data);
    };
    open.onclose = () => {
      if (s.socket !== open) return;
      s.socket = null;
      stats.id = null;
      for (const id of [...peers.keys()]) drop(id);
      names.clear();
      looks.clear();
      flagsById.clear();
      setState('closed');
      s.retryTimer = window.setTimeout(connect, s.retry);
      s.retry = Math.min(RETRY_MS[1], Math.max(RETRY_MS[0], s.retry * 2));
    };
  }

  /** Reads one message from the relay, then passes it to the listeners. */
  function receive(text: string): void {
    let message: { t?: unknown; id?: string; name?: string; s?: State; peers?: unknown[][]; looks?: unknown; look?: unknown; l?: unknown; e?: unknown; f?: unknown; flags?: unknown };
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof message !== 'object' || message === null || typeof message.t !== 'string') return;
    const now = performance.now();
    if (message.t === 'hi' && typeof message.id === 'string') {
      stats.id = message.id;
      // Where we are, before any listener answers the `hi`: a seat claimed
      // back on a new socket is judged against this socket's own position,
      // and the next state on the cadence is up to a tenth of a second off.
      if (s.lastPlayer !== null) {
        s.sentAt = performance.now();
        send(s.lastPlayer);
      }
      // Before the rows: a peer is dressed on the frame it is first drawn, and
      // the look has to be known by then.
      if (typeof message.looks === 'object' && message.looks !== null) {
        for (const [id, code] of Object.entries(message.looks as Record<string, unknown>)) {
          if (typeof code === 'string') looks.set(id, code);
        }
      }
      // A new socket is a new attachment on the relay, which holds no flags
      // for us: the next frame sends ours again if there are any.
      s.flagsSent = 0;
      if (typeof message.flags === 'object' && message.flags !== null) {
        for (const [id, raw] of Object.entries(message.flags as Record<string, unknown>)) {
          const f = cleanFlags(raw);
          if (f > 0) flagsById.set(id, f);
        }
      }
      for (const row of message.peers ?? []) {
        const [id, name, ...state] = row as [string, string, ...State];
        if (typeof name === 'string') names.set(id, name);
        heard(id, name, state, now);
      }
    } else if (message.t === 'in' && typeof message.id === 'string') {
      if (typeof message.name === 'string') names.set(message.id, message.name);
      if (typeof message.look === 'string') looks.set(message.id, message.look);
      peerOf(message.id, message.name ?? '');
    } else if (message.t === 'at' && typeof message.id === 'string' && Array.isArray(message.s)) {
      heard(message.id, null, message.s, now);
    } else if (message.t === 'look' && typeof message.id === 'string' && typeof message.l === 'string') {
      looks.set(message.id, message.l);
      // Undressed, and dressed again in the new clothes on the next frame it is drawn.
      const peer = peers.get(message.id);
      if (peer !== undefined) undress(peer);
    } else if (message.t === 'emote' && typeof message.id === 'string') {
      const gesture = cleanEmote(message.e);
      const peer = peers.get(message.id);
      if (gesture !== '' && peer !== undefined) {
        peer.gesture = gesture;
        peer.gestureAt = now;
      }
    } else if (message.t === 'flags' && typeof message.id === 'string') {
      const f = cleanFlags(message.f);
      if (f >= 0) flagsById.set(message.id, f);
    } else if (message.t === 'bye' && typeof message.id === 'string') {
      drop(message.id);
      names.delete(message.id);
      looks.delete(message.id);
      flagsById.delete(message.id);
    }
    for (const listener of messageListeners) {
      try {
        listener(message as RelayMessage);
      } catch (error) {
        console.warn('peers: a listener threw on', message.t, error);
      }
    }
  }

  return { setState, connect, receive };
}

export type Link = ReturnType<typeof createLink>;
