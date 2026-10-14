/**
 * What the room says: seat grants, poses and parks; and the socket closing, which makes the link single-player.
 */
import type { WirePose } from '../craft/contract.ts';
import { LOCAL_SELF } from './constants.ts';
import { isPose, isSeats } from './wire.ts';
import type { SyncCore } from './core.ts';
import type { Room } from './room.ts';
import type { Welcome } from './welcome.ts';

export function createInbox(core: SyncCore, room: Room, welcome: Welcome) {
  const { driven, moved, outbox, parking, peers, pending, stats } = core;
  const s = core.fields;
  const { emit, entryOf, post, self, settle, tidy } = room;
  const { onHi } = welcome;

  /** A seat grant: settles the claim it answers, or gives back a seat nobody here is sitting in. */
  function onSeat(vehicle: string, seats: (string | null)[], ask: unknown): void {
    const me = self();
    const entry = entryOf(vehicle);
    entry.seats = [...seats];
    const wait = pending.get(vehicle);
    if (wait !== undefined && (ask === wait.seat || seats[wait.seat] === me)) {
      const won = seats[wait.seat] === me;
      if (won) s.held = { vehicle, seat: wait.seat };
      else if (s.held?.vehicle === vehicle && s.held.seat === wait.seat) s.held = null;
      settle(vehicle, won);
    } else if (wait === undefined && parking.has(vehicle)) {
      // An offline park's `sit`, granted: its `up` with the pose follows.
      if (seats[0] !== me) parking.delete(vehicle);
    } else if (wait === undefined) {
      if (s.held?.vehicle === vehicle && seats[s.held.seat] !== me) s.held = null;
      // A seat granted after the claim for it timed out: nobody here is
      // sitting in it, so it is given back rather than held for ever in
      // everybody else's view.
      const mine = seats.indexOf(me);
      if (s.live && mine >= 0 && !(s.held?.vehicle === vehicle && s.held.seat === mine)) {
        entry.seats[mine] = null;
        post({ t: 'up', v: vehicle });
      }
    }
    const drive = driven.get(vehicle);
    if (drive !== undefined && drive.driver !== (seats[0] ?? null)) driven.delete(vehicle);
    tidy(vehicle);
    emit(vehicle);
  }

  /** A pose from the driver of a vehicle. */
  function onPose(vehicle: string, pose: WirePose, speed: number): void {
    const entry = entryOf(vehicle);
    const driver = entry.seats[0] ?? null;
    if (driver === self()) return;
    entry.pose = pose;
    let drive = driven.get(vehicle);
    const started = drive === undefined;
    if (drive === undefined) {
      drive = { driver, poses: [] };
      driven.set(vehicle, drive);
    }
    drive.poses.push({ at: performance.now(), pose, speed });
    if (drive.poses.length > 8) drive.poses.shift();
    // A driven pose is `sample`'s to draw; only the start of the drive is news.
    if (started) emit(vehicle);
  }

  /** A vehicle parked, or sent home when it has no pose. */
  function onPark(vehicle: string, pose: WirePose | null): void {
    driven.delete(vehicle);
    const entry = entryOf(vehicle);
    entry.pose = pose ?? [];
    tidy(vehicle);
    emit(vehicle);
  }

  /** A seat granted here with no relay to ask. */
  function grantLocally(vehicle: string, seat: number): void {
    if (s.held !== null && (s.held.vehicle !== vehicle || s.held.seat !== seat)) {
      const before = moved.get(s.held.vehicle);
      if (before !== undefined && before.seats[s.held.seat] === LOCAL_SELF) before.seats[s.held.seat] = null;
      const was = s.held.vehicle;
      s.held = null;
      tidy(was);
      emit(was);
    }
    const entry = entryOf(vehicle);
    entry.seats[seat] = LOCAL_SELF;
    for (let i = 0; i < entry.seats.length; i++) entry.seats[i] ??= null;
    s.held = { vehicle, seat };
    emit(vehicle);
  }

  /** Reads the relay messages that concern vehicles. */
  peers.onMessage((message) => {
    stats.received++;
    const vehicle = typeof message.v === 'string' ? message.v : null;
    if (message.t === 'hi') onHi(message.vehicles);
    else if (vehicle === null) return;
    else if (message.t === 'seat' && isSeats(message.seats)) onSeat(vehicle, message.seats, message.ask);
    else if (message.t === 'vp' && isPose(message.p)) onPose(vehicle, message.p, typeof message.sp === 'number' ? message.sp : 0);
    else if (message.t === 'park' && (message.p === null || isPose(message.p))) onPark(vehicle, message.p as WirePose | null);
  });

  /**
   * When the socket closes the link is single-player from there: our seat is
   * renamed to the local self, every other seat is forgotten (the room has let ours
   * go too), and anything still being asked for is granted.
   */
  peers.onState((state) => {
    if (state !== 'closed' || !s.live) return;
    // Single-player from here: our seat is renamed to the local self, every
    // other seat is forgotten (the room has let ours go too), and anything
    // still being asked for is granted.
    s.live = false;
    const gone = s.liveId;
    s.liveId = null;
    outbox.length = 0;
    parking.clear();
    driven.clear();
    for (const [vehicle, entry] of moved) {
      entry.seats = entry.seats.map((id) => (id !== null && id === gone ? LOCAL_SELF : null));
      tidy(vehicle);
      emit(vehicle);
    }
    for (const [vehicle, wait] of [...pending]) {
      if (wait.resolve !== null) grantLocally(vehicle, wait.seat);
      settle(vehicle, true);
    }
  });

  return { grantLocally };
}

export type Inbox = ReturnType<typeof createInbox>;
