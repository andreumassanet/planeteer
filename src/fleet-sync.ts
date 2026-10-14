/**
 * The relay's `FleetLink`: who has moved which vehicle and who sits in it, as
 * the room in `server/` keeps it, over the socket `peers.ts` already holds.
 *
 * The relay is the authority on seats (a claim is a question, answered by a
 * `seat` message) and on where a vehicle rests. Everything else is drawn the way
 * `peers.ts` draws a player: a vehicle somebody else drives is sampled
 * `DELAY_MS` in the past, between the two poses either side of that instant.
 *
 * With no relay this is single-player: a claim is granted at once, and where a
 * vehicle is left is kept here until the socket opens, then told to the room.
 * What was known of other people's seats is dropped with the socket, because the
 * room releases every seat of a socket that closes.
 *
 * A vehicle the relay knows is occupied but not where (somebody sitting in it at
 * its site) is in `moved` with an empty `pose`, `[]`: the fleet draws it at its
 * site. Pass the site's pose to `claim` and the relay learns it.
 *
 * The parts live in `fleet-sync/` over a shared `SyncCore`.
 */
import type { FleetLink, MovedVehicle, WirePose } from './craft/contract.ts';
import type { Peers, PeerSeat } from './peers.ts';
import { createSyncCore } from './fleet-sync/core.ts';
import { createDriving } from './fleet-sync/driving.ts';
import { createInbox } from './fleet-sync/inbox.ts';
import { createWelcome } from './fleet-sync/welcome.ts';
import { createRoom } from './fleet-sync/room.ts';
import { createSeating } from './fleet-sync/seating.ts';

export interface FleetSyncStats {
  live: boolean;
  moved: number;
  driven: number;
  held: PeerSeat | null;
  /** Parks made offline, waiting for the socket. */
  queued: number;
  sent: number;
  received: number;
}

export interface FleetSync extends FleetLink {
  /**
   * As `FleetLink.claim`; `site`, where the vehicle stands if it has never
   * moved, lets the relay place it for everyone while it is occupied there.
   */
  claim(vehicle: string, seat: number, site?: WirePose): Promise<boolean>;
  /** Which seat a player holds, for `Peers.useSeats`. */
  seatOf(id: string): PeerSeat | null;
  readonly stats: FleetSyncStats;
}

export function createFleetSync(peers: Peers): FleetSync {
  const core = createSyncCore(peers);
  const { moved, driven, listeners, parks, stats } = core;
  const s = core.fields;

  const room = createRoom(core);
  const welcome = createWelcome(core, room);
  const inbox = createInbox(core, room, welcome);
  const driving = createDriving(core, room);
  const seating = createSeating(core, room, inbox);

  return {
    get self() {
      return room.self();
    },
    moved: moved as ReadonlyMap<string, MovedVehicle>,
    sample: driving.sample,
    claim: seating.claim,
    release: seating.release,
    sink: seating.sink,
    drive: driving.drive,
    leaping: driving.leaping,
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    seatOf: seating.seatOf,
    get stats() {
      return {
        live: s.live, moved: moved.size, driven: driven.size, held: s.held, queued: parks.size, sent: stats.sent, received: stats.received,
      };
    },
  };
}
