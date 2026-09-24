/**
 * The relay's `FleetLink`: who has moved which vehicle and who sits in it, as
 * the room in `server/` keeps it, over the socket `peers.ts` already holds.
 *
 * The relay is the authority on seats — a claim is a question, answered by a
 * `seat` message — and on where a vehicle rests. Everything else is drawn the
 * way `peers.ts` draws a player: a vehicle somebody else drives is sampled
 * `DELAY_MS` in the past, between the two poses either side of that instant.
 *
 * With no relay this is single-player: a claim is granted at once, and where
 * a vehicle is left is kept here until the socket opens, then told to the
 * room. What was known of other people's seats is dropped with the socket,
 * because the room releases every seat of a socket that closes.
 *
 * A vehicle the relay knows is occupied but not where — somebody sitting in
 * it at its site — is in `moved` with an empty `pose`, `[]`: the fleet draws
 * it at its site. Pass the site's pose to `claim` and the relay learns it.
 */
import * as THREE from 'three';
import type { FleetLink, MovedVehicle, WirePose } from './craft/contract.ts';
import type { Peers, PeerSeat, RelayMessage } from './peers.ts';

/** How far behind the newest pose a driven vehicle is drawn: `peers.ts`'s own delay. */
const DELAY_MS = 150;
/** A claim unanswered this long is refused. */
const CLAIM_MS = 2_000;
/** A driver's pose goes out ten times a second while it moves… */
const DRIVE_MS = 100;
/** …once a second while it stands, well inside the relay's five seconds of silence… */
const REST_MS = 1_000;
/** …and at once on a sharp turn or a change of speed, but never under the relay's 50 ms. */
const URGENT_MS = 55;
const SHARP_TURN = Math.cos(THREE.MathUtils.degToRad(10));
/** Between two messages told to the room on reconnecting: the relay takes one `sit` each 250 ms. */
const FLUSH_MS = 300;
/** Who this client is while there is no relay to name it. */
const LOCAL_SELF = 'local';

interface Entry {
  pose: WirePose;
  seats: (string | null)[];
}

interface Driven {
  /** Who was driving when these poses were taken. */
  driver: string | null;
  poses: { at: number; pose: WirePose; speed: number }[];
}

interface Pending {
  seat: number;
  /** Absent for a seat taken again after a reconnection, which nobody awaits. */
  resolve: ((won: boolean) => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
}

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

const isPose = (value: unknown): value is WirePose =>
  Array.isArray(value) && value.length === 9 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
const isSeats = (value: unknown): value is (string | null)[] =>
  Array.isArray(value) && value.every((id) => id === null || typeof id === 'string');
/** Short on the wire: centimetres of position, thousandths of a direction. */
const wire = (pose: WirePose) => pose.map((n, i) => +n.toFixed(i < 3 ? 2 : 3));

export function createFleetSync(peers: Peers): FleetSync {
  const moved = new Map<string, Entry>();
  const driven = new Map<string, Driven>();
  const pending = new Map<string, Pending>();
  const listeners = new Set<(vehicle: string) => void>();
  /** Where this client left a vehicle while offline, told to the room when the socket opens. */
  const parks = new Map<string, WirePose>();
  const outbox: RelayMessage[] = [];
  let flushing: ReturnType<typeof setInterval> | null = null;
  let live = false;
  /** Our id as the room named us, so the seats it filled can be renamed when it goes. */
  let liveId: string | null = null;
  let held: PeerSeat | null = null;
  const index = new Map<string, PeerSeat>();
  let indexed = false;
  const stats = { sent: 0, received: 0 };

  // The driver's side: what was last sent, to throttle against.
  let sentAt = 0;
  let sentPose: WirePose | null = null;
  let sentSpeed = 0;

  const self = () => (live && liveId !== null ? liveId : LOCAL_SELF);

  function emit(vehicle: string): void {
    indexed = false;
    for (const listener of listeners) {
      try {
        listener(vehicle);
      } catch (error) {
        console.warn('fleet-sync: a listener threw on', vehicle, error);
      }
    }
  }

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

  /** Sends the reconnection's messages one at a time, as far apart as the relay's limits ask. */
  function flush(): void {
    if (flushing !== null) return;
    const next = () => {
      const message = outbox.shift();
      if (message === undefined || !live) {
        if (flushing !== null) clearInterval(flushing);
        flushing = null;
        return;
      }
      post(message);
    };
    next();
    if (outbox.length > 0) flushing = setInterval(next, FLUSH_MS);
  }

  function settle(vehicle: string, won: boolean): void {
    const wait = pending.get(vehicle);
    if (wait === undefined) return;
    pending.delete(vehicle);
    if (wait.timer !== null) clearTimeout(wait.timer);
    wait.resolve?.(won);
  }

  // -------------------------------------------------------------------------
  // What the room says
  // -------------------------------------------------------------------------

  function onHi(rows: unknown): void {
    liveId = peers.id;
    live = liveId !== null;
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
      outbox.push({ t: 'sit', v: vehicle, seat: 0 }, { t: 'up', v: vehicle, p: wire(pose) });
    }
    parks.clear();
    if (held !== null) {
      const { vehicle, seat } = held;
      const entry = entryOf(vehicle);
      if ((entry.seats[seat] ?? null) === null) {
        entry.seats[seat] = self();
        for (let i = 0; i < entry.seats.length; i++) entry.seats[i] ??= null;
        pending.set(vehicle, { seat, resolve: null, timer: null });
        outbox.push({ t: 'sit', v: vehicle, seat, ...(entry.pose.length === 9 ? { p: wire(entry.pose) } : {}) });
      } else {
        // Somebody took it while we were away: the fleet sees its seat gone.
        held = null;
      }
      touched.add(vehicle);
    }
    for (const vehicle of touched) emit(vehicle);
    flush();
  }

  function onSeat(vehicle: string, seats: (string | null)[], ask: unknown): void {
    const me = self();
    const entry = entryOf(vehicle);
    entry.seats = [...seats];
    const wait = pending.get(vehicle);
    if (wait !== undefined && (ask === wait.seat || seats[wait.seat] === me)) {
      const won = seats[wait.seat] === me;
      if (won) held = { vehicle, seat: wait.seat };
      else if (held?.vehicle === vehicle && held.seat === wait.seat) held = null;
      settle(vehicle, won);
    } else if (wait === undefined && held?.vehicle === vehicle && seats[held.seat] !== me) {
      held = null;
    }
    const drive = driven.get(vehicle);
    if (drive !== undefined && drive.driver !== (seats[0] ?? null)) driven.delete(vehicle);
    tidy(vehicle);
    emit(vehicle);
  }

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

  function onPark(vehicle: string, pose: WirePose | null): void {
    driven.delete(vehicle);
    const entry = entryOf(vehicle);
    entry.pose = pose ?? [];
    tidy(vehicle);
    emit(vehicle);
  }

  peers.onMessage((message) => {
    stats.received++;
    const vehicle = typeof message.v === 'string' ? message.v : null;
    if (message.t === 'hi') onHi(message.vehicles);
    else if (vehicle === null) return;
    else if (message.t === 'seat' && isSeats(message.seats)) onSeat(vehicle, message.seats, message.ask);
    else if (message.t === 'vp' && isPose(message.p)) onPose(vehicle, message.p, typeof message.sp === 'number' ? message.sp : 0);
    else if (message.t === 'park' && (message.p === null || isPose(message.p))) onPark(vehicle, message.p as WirePose | null);
  });

  peers.onState((state) => {
    if (state !== 'closed' || !live) return;
    // Single-player from here: our seat is renamed to the local self, every
    // other seat is forgotten (the room has let ours go too), and anything
    // still being asked for is granted.
    live = false;
    const gone = liveId;
    liveId = null;
    outbox.length = 0;
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

  function grantLocally(vehicle: string, seat: number): void {
    if (held !== null && (held.vehicle !== vehicle || held.seat !== seat)) {
      const before = moved.get(held.vehicle);
      if (before !== undefined && before.seats[held.seat] === LOCAL_SELF) before.seats[held.seat] = null;
      const was = held.vehicle;
      held = null;
      tidy(was);
      emit(was);
    }
    const entry = entryOf(vehicle);
    entry.seats[seat] = LOCAL_SELF;
    for (let i = 0; i < entry.seats.length; i++) entry.seats[i] ??= null;
    held = { vehicle, seat };
    emit(vehicle);
  }

  // -------------------------------------------------------------------------
  // The link
  // -------------------------------------------------------------------------

  const out = { position: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() };
  function blend(a: WirePose, b: WirePose, t: number, into: WirePose, at: number): void {
    out.a.set(a[at]!, a[at + 1]!, a[at + 2]!);
    out.b.set(b[at]!, b[at + 1]!, b[at + 2]!);
    out.position.lerpVectors(out.a, out.b, t);
    // A direction is blended and put back on the unit sphere: at ten poses a
    // second the arc between two is a few degrees, where this is a slerp.
    if (at > 0) out.position.normalize();
    into[at] = out.position.x;
    into[at + 1] = out.position.y;
    into[at + 2] = out.position.z;
  }

  const link: FleetSync = {
    get self() {
      return self();
    },
    moved: moved as ReadonlyMap<string, MovedVehicle>,

    sample(vehicle, into) {
      const drive = driven.get(vehicle);
      const list = drive?.poses;
      const newest = list?.[list.length - 1];
      if (list === undefined || newest === undefined || drive!.driver === self()) return false;
      const at = performance.now() - DELAY_MS;
      let i = list.length - 1;
      while (i > 0 && list[i - 1]!.at > at) i--;
      const b = list[i]!;
      const a = list[i - 1];
      if (a === undefined || at >= newest.at) {
        for (let k = 0; k < 9; k++) into[k] = newest.pose[k]!;
        return true;
      }
      const t = THREE.MathUtils.clamp((at - a.at) / Math.max(1, b.at - a.at), 0, 1);
      for (const k of [0, 3, 6]) blend(a.pose, b.pose, t, into, k);
      return true;
    },

    claim(vehicle, seat, site) {
      if (moved.get(vehicle)?.seats[seat] === self() && !pending.has(vehicle)) return Promise.resolve(true);
      if (!live) {
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
    },

    release(vehicle, pose) {
      const entry = moved.get(vehicle);
      const me = self();
      const seat = entry?.seats.indexOf(me) ?? -1;
      const driving = seat === 0;
      if (entry !== undefined && seat >= 0) entry.seats[seat] = null;
      if (held?.vehicle === vehicle) held = null;
      const kept = driving && pose !== null && isPose(pose) ? [...pose] : null;
      if (kept !== null) entryOf(vehicle).pose = kept;
      sentPose = null;
      if (live) post({ t: 'up', v: vehicle, ...(kept !== null ? { p: wire(kept) } : {}) });
      else if (kept !== null) parks.set(vehicle, kept);
      tidy(vehicle);
      emit(vehicle);
    },

    drive(vehicle, pose, speed) {
      const entry = moved.get(vehicle);
      if (entry === undefined || entry.seats[0] !== self() || !isPose(pose)) return;
      const fresh = entry.pose.length !== 9;
      if (fresh) entry.pose = [...pose];
      else for (let k = 0; k < 9; k++) entry.pose[k] = pose[k]!;
      if (fresh) emit(vehicle);
      if (!live || pending.has(vehicle)) return;

      const now = performance.now();
      const since = now - sentAt;
      let due = sentPose === null;
      if (!due && sentPose !== null) {
        const turned = pose[3]! * sentPose[3]! + pose[4]! * sentPose[4]! + pose[5]! * sentPose[5]! < SHARP_TURN;
        const lurched = Math.abs(speed - sentSpeed) > Math.max(2, Math.abs(sentSpeed) * 0.25);
        const still = speed === 0 && Math.hypot(pose[0]! - sentPose[0]!, pose[1]! - sentPose[1]!, pose[2]! - sentPose[2]!) < 0.05;
        due = since >= (still ? REST_MS : DRIVE_MS) || (since >= URGENT_MS && (turned || lurched));
      }
      if (!due) return;
      sentAt = now;
      sentPose = [...pose];
      sentSpeed = speed;
      post({ t: 'vp', v: vehicle, p: wire(pose), sp: +speed.toFixed(1) });
    },

    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    seatOf(id) {
      if (!indexed) {
        index.clear();
        for (const [vehicle, entry] of moved) {
          entry.seats.forEach((holder, seat) => {
            if (holder !== null) index.set(holder, { vehicle, seat });
          });
        }
        indexed = true;
      }
      return index.get(id) ?? null;
    },

    get stats() {
      return {
        live, moved: moved.size, driven: driven.size, held, queued: parks.size, sent: stats.sent, received: stats.received,
      };
    },
  };
  return link;
}
