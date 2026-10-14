/**
 * The bookkeeping every part of the link shares: who we are, telling listeners, forgetting settled vehicles, and sending.
 */
import type { RelayMessage } from '../peers.ts';
import { FLUSH_MS, LOCAL_SELF } from './constants.ts';
import type { Entry } from './core.ts';
import type { SyncCore } from './core.ts';

export function createRoom(core: SyncCore) {
  const { listeners, moved, outbox, parking, peers, pending, stats } = core;
  const s = core.fields;

  const self = () => (s.live && s.liveId !== null ? s.liveId : LOCAL_SELF);

  function emit(vehicle: string): void {
    s.indexed = false;
    for (const listener of listeners) {
      try {
        listener(vehicle);
      } catch (error) {
        console.warn('fleet-sync: a listener threw on', vehicle, error);
      }
    }
  }

  /** The record of a vehicle the room has moved or occupied, made if there is none. */
  function entryOf(vehicle: string): Entry {
    let entry = moved.get(vehicle);
    if (entry === undefined) {
      entry = { pose: [], seats: [] };
      moved.set(vehicle, entry);
    }
    return entry;
  }

  /** Forgets a vehicle that is at its site with nobody in it. */
  function tidy(vehicle: string): void {
    const entry = moved.get(vehicle);
    if (entry !== undefined && entry.pose.length === 0 && !entry.seats.some((id) => id !== null)) moved.delete(vehicle);
  }

  function post(message: RelayMessage): void {
    if (peers.send(message)) stats.sent++;
  }

  /**
   * Sends the reconnection's messages one at a time, as far apart as the relay's
   * limits ask, and none of them at once: the room believes a claim only from a
   * player whose position it has, and on a fresh socket it has none until `peers.ts`
   * sends the first state on its own cadence. One `FLUSH_MS` is three of those states.
   */
  function flush(): void {
    if (s.flushing !== null || outbox.length === 0) return;
    const next = () => {
      const message = outbox.shift();
      if (message !== undefined && s.live) post(message);
      if (message?.t === 'up' && typeof message.v === 'string') parking.delete(message.v);
      if (outbox.length === 0 || !s.live) {
        if (s.flushing !== null) clearInterval(s.flushing);
        s.flushing = null;
      }
    };
    s.flushing = setInterval(next, FLUSH_MS);
  }

  /** Answers a pending claim, won or lost. */
  function settle(vehicle: string, won: boolean): void {
    const wait = pending.get(vehicle);
    if (wait === undefined) return;
    pending.delete(vehicle);
    if (wait.timer !== null) clearTimeout(wait.timer);
    wait.resolve?.(won);
  }

  return { self, emit, entryOf, tidy, post, flush, settle };
}

export type Room = ReturnType<typeof createRoom>;
