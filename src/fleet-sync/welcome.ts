/**
 * The room's welcome on a new socket: the vehicles it knows are moved, with what was done offline told on top.
 */
import { CLAIM_MS, FLUSH_MS } from './constants.ts';
import { isPose, isSeats, wire } from './wire.ts';
import type { SyncCore } from './core.ts';
import type { Room } from './room.ts';

export function createWelcome(core: SyncCore, room: Room) {
  const { driven, moved, outbox, parking, parks, peers, pending, sunkOffline } = core;
  const s = core.fields;
  const { emit, entryOf, flush, self, settle, tidy } = room;

  /**
   * The welcome: the vehicles the room knows are moved, and then what was done
   * offline goes on top, and to the room: each park as a driver sitting down and
   * getting up where it was left, and last of all the seat still held, because
   * every `sit` gives up the one before.
   */
  function onHi(rows: unknown): void {
    s.liveId = peers.id;
    s.live = s.liveId !== null;
    const touched = new Set(moved.keys());
    moved.clear();
    driven.clear();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!Array.isArray(row)) continue;
      const [vehicle, pose, seats] = row as [unknown, unknown, unknown];
      if (typeof vehicle !== 'string' || !isSeats(seats)) continue;
      moved.set(vehicle, { pose: isPose(pose) ? pose : [], seats: [...seats] });
      touched.add(vehicle);
    }
    // What was done offline goes on top, and to the room: each park as a
    // driver sitting down and getting up where it was left, and last of all
    // the seat still held, because every `sit` gives up the one before.
    for (const [vehicle, pose] of parks) {
      entryOf(vehicle).pose = pose;
      parking.add(vehicle);
      outbox.push({ t: 'sit', v: vehicle, seat: 0 }, { t: 'up', v: vehicle, p: wire(pose) });
    }
    parks.clear();
    for (const vehicle of sunkOffline) {
      moved.delete(vehicle);
      parking.add(vehicle);
      outbox.push({ t: 'sit', v: vehicle, seat: 0 }, { t: 'up', v: vehicle, sunk: true });
      touched.add(vehicle);
    }
    sunkOffline.clear();
    if (s.held !== null) {
      const { vehicle, seat } = s.held;
      const entry = entryOf(vehicle);
      if ((entry.seats[seat] ?? null) === null) {
        entry.seats[seat] = self();
        for (let i = 0; i < entry.seats.length; i++) entry.seats[i] ??= null;
        // Unanswered — the relay drops a `sit` on its pace without a word —
        // the seat is given up here as well, and the fleet asks for it again
        // (`keepSeat`); pending for ever, the vehicle sent no pose again.
        const timer = setTimeout(() => {
          if (pending.get(vehicle)?.resolve !== null) return;
          if (s.held?.vehicle === vehicle && s.held.seat === seat) s.held = null;
          const now = moved.get(vehicle);
          if (now !== undefined && now.seats[seat] === self()) now.seats[seat] = null;
          settle(vehicle, false);
          tidy(vehicle);
          emit(vehicle);
        }, CLAIM_MS + FLUSH_MS * (outbox.length + 1));
        pending.set(vehicle, { seat, resolve: null, timer });
        outbox.push({ t: 'sit', v: vehicle, seat, ...(entry.pose.length === 9 ? { p: wire(entry.pose) } : {}) });
      } else {
        // Somebody took it while we were away: the fleet sees its seat gone.
        s.held = null;
      }
      touched.add(vehicle);
    }
    for (const vehicle of touched) emit(vehicle);
    flush();
  }

  return { onHi };
}

export type Welcome = ReturnType<typeof createWelcome>;
