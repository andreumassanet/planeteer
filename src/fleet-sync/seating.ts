/**
 * Taking, giving up and sinking a vehicle, and which seat each player holds.
 */
import type { WirePose } from '../craft/contract.ts';
import type { PeerSeat } from '../peers.ts';
import { CLAIM_MS } from './constants.ts';
import { isPose, wire } from './wire.ts';
import type { SyncCore } from './core.ts';
import type { Room } from './room.ts';
import type { Inbox } from './inbox.ts';

export function createSeating(core: SyncCore, room: Room, inbox: Inbox) {
  const { driven, index, moved, outbox, parks, pending, sunkOffline } = core;
  const s = core.fields;
  const { emit, entryOf, post, self, settle, tidy } = room;
  const { grantLocally } = inbox;

  /** As `FleetLink.claim`; `site`, where the vehicle stands if it has never moved, lets the relay place it for everyone while it is occupied there. */
  function claim(vehicle: string, seat: number, site?: WirePose): Promise<boolean> {
    if (moved.get(vehicle)?.seats[seat] === self() && !pending.has(vehicle)) return Promise.resolve(true);
    if (!s.live) {
      // Taken again before the room heard it went under: it is back at its
      // site here, and it is what is done with it now that the room hears.
      sunkOffline.delete(vehicle);
      if (site !== undefined && isPose(site) && entryOf(vehicle).pose.length === 0) entryOf(vehicle).pose = [...site];
      grantLocally(vehicle, seat);
      return Promise.resolve(true);
    }
    settle(vehicle, false);
    if (site !== undefined && isPose(site) && moved.get(vehicle)?.pose.length === 0) moved.get(vehicle)!.pose = [...site];
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => settle(vehicle, false), CLAIM_MS);
      pending.set(vehicle, { seat, resolve, timer });
      post({ t: 'sit', v: vehicle, seat, ...(site !== undefined && isPose(site) ? { p: wire(site) } : {}) });
    });
  }

  /** Gets out of a seat, leaving the vehicle at `pose` when the driver gets out. */
  function release(vehicle: string, pose: WirePose | null): void {
    // Left before the seat taken again on reconnecting was answered: the
    // `sit` still waiting in the outbox is not sent, and one already sent
    // is given back when it is granted (`onSeat`, a win nobody awaits).
    const again = pending.get(vehicle);
    if (again !== undefined && again.resolve === null) {
      settle(vehicle, false);
      for (let i = outbox.length - 1; i >= 0; i--) {
        const queued = outbox[i]!;
        if (queued.t === 'sit' && queued.v === vehicle) outbox.splice(i, 1);
      }
    }
    const entry = moved.get(vehicle);
    const me = self();
    const seat = entry?.seats.indexOf(me) ?? -1;
    const driving = seat === 0;
    if (entry !== undefined && seat >= 0) entry.seats[seat] = null;
    if (s.held?.vehicle === vehicle) s.held = null;
    const kept = driving && pose !== null && isPose(pose) ? [...pose] : null;
    if (kept !== null) entryOf(vehicle).pose = kept;
    s.sentPose = null;
    if (s.live) post({ t: 'up', v: vehicle, ...(kept !== null ? { p: wire(kept) } : {}) });
    else if (kept !== null) parks.set(vehicle, kept);
    tidy(vehicle);
    emit(vehicle);
  }

  /** A vehicle that went under: back at its site with nobody in it, here at once; the room says the same to everyone else. */
  function sink(vehicle: string): void {
    const entry = moved.get(vehicle);
    if (entry === undefined || entry.seats[0] !== self()) return;
    if (s.held?.vehicle === vehicle) s.held = null;
    s.sentPose = null;
    driven.delete(vehicle);
    parks.delete(vehicle);
    // Back at its site with nobody in it, here at once; the room says the
    // same to everyone else (`park` with no pose). A relay older than the
    // message takes it as an `up` and parks it where it went under.
    moved.delete(vehicle);
    if (s.live) post({ t: 'up', v: vehicle, sunk: true });
    else sunkOffline.add(vehicle);
    emit(vehicle);
  }

  /** Which seat a player holds, for `Peers.useSeats`. */
  function seatOf(id: string): PeerSeat | null {
    if (!s.indexed) {
      index.clear();
      for (const [vehicle, entry] of moved) {
        entry.seats.forEach((holder, seat) => {
          if (holder !== null) index.set(holder, { vehicle, seat });
        });
      }
      s.indexed = true;
    }
    return index.get(id) ?? null;
  }

  return { claim, release, sink, seatOf };
}

export type Seating = ReturnType<typeof createSeating>;
