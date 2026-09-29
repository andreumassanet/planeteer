/**
 * The peers relay.
 *
 * The world is a function of the data and a seed, so nothing about it is sent:
 * a player is a position, a heading, what they are doing, how fast and whether
 * they are in the air, and this passes that on to everyone else. The one thing
 * the world cannot rebuild from its seed is where somebody left a vehicle, so
 * that — and who sits in which — is the only state the room keeps.
 *
 * One room for the whole planet. At the rates below a room of 100 is 1,000
 * messages a second in and 99,000 out, which one Durable Object carries; past
 * that the planet splits into rooms by cell, and `src/peers.ts` is the side
 * that would choose one.
 *
 * The wire is JSON, `src/peers.ts`'s and `src/fleet-sync.ts`'s too. A pose is
 * nine numbers, `[x, y, z, fx, fy, fz, ux, uy, uz]` (`WirePose` in
 * `src/craft/contract.ts`); a vehicle id is `model:site:slot`.
 *
 * - client -> server:
 *   `[x, y, z, fx, fy, fz, state, speed, airborne]`, the player, ten a second;
 *     `state` is an index into `PLAYER_STATES` (foot, swim, seated) — the slot
 *     once said foot, boat or plane, and is validated the same way;
 *   `{ t: 'sit', v, seat, p? }` asks for a seat, and gives up any other held;
 *     `p` is where the claimer sees the vehicle, kept (and announced as a
 *     `park`) only if the relay has no pose for it yet — it is at its site —
 *     and the claimer is beside it;
 *   `{ t: 'up', v, p? }` leaves it; `p`, from the driver, is where it stands;
 *   `{ t: 'vp', v, p, sp }` the driver's pose and speed, from seat 0 only,
 *     and no further from the vehicle's last pose than it could have gone
 *     (`driveReach` in `limits.ts`); a vehicle does not teleport, its driver
 *     does, and leaves it where it was;
 *   `{ t: 'look', l }` how the player now looks (`LOOK_PATTERN`);
 *   `{ t: 'chat', m, c }` a line for everyone, and the country it was sent
 *     from; cleaned by `cleanChat` and paced by `spendChat` in `limits.ts`,
 *     the same two the game sends by;
 *   `{ t: 'emote', e }` a gesture (`EMOTES`), at most one a second;
 *   `{ t: 'honk', k, on? }` a horn (`HONKS`), from a driver's seat: `on`
 *     true when the key goes down and again each `HONK_REFRESH_MS` while it
 *     is held, false when it comes up, absent for a tap (an older client);
 *     a start, a refresh or a tap at most one each `HONK_INTERVAL_MS`, a
 *     stop whenever a start is sounding (`spendHonk`). An older relay drops
 *     it, as it drops anything it does not know;
 *   `{ t: 'flags', f }` what the player is doing that a state does not say
 *     (`FLAGS`: a canopy, a bench), on each change, at most one each
 *     `FLAGS_INTERVAL_MS`; kept, unlike a gesture.
 * - server -> client:
 *   `{ t: 'hi', id, peers: [[id, name, ...state]], vehicles: [[v, pose | null, seats]], looks, chat }`
 *     once, on joining; `vehicles` is every vehicle moved off its site or
 *     with anybody in it, and `seats` is by player id, `null` for empty;
 *     `looks` is how each player who said so looks, by id; `chat` is the
 *     room's last `CHAT_HISTORY` lines, oldest first, as `chat` sends them;
 *     `flags` is each player's flags that are not 0, by id;
 *   `{ t: 'in', id, name, look? }` when someone joins;
 *   `{ t: 'look', id, l }` when someone changes how they look;
 *   `{ t: 'at', id, s: state }` whenever someone moves;
 *   `{ t: 'bye', id }` when someone leaves;
 *   `{ t: 'seat', v, seats, ask? }` on any change of who sits where. It is
 *     also the answer to a `sit`: the claimer's copy carries `ask`, the seat it
 *     asked for, and says by its `seats` whether the claim was granted — a
 *     refusal is a copy for the claimer alone, the seats unchanged;
 *   `{ t: 'vp', v, p, sp }` a driver's pose, to everyone but the driver;
 *   `{ t: 'park', v, p }` when a vehicle comes to rest at `p`, or goes back
 *     to its site with `p: null`;
 *   `{ t: 'chat', id, name, c, m, at }` a line, to everyone and its sender
 *     too, stamped with who sent it under the name the room knows them by and
 *     when; the sender's copy is how it knows the line went;
 *   `{ t: 'emote', id, e }` a gesture, to everyone but its maker;
 *   `{ t: 'honk', id, k, on? }` a horn, to everyone but its driver, with
 *     the `on` it was sent with; a peer lets a held one go by itself after
 *     `HONK_HOLD_MS` without a refresh, and at the driver's `bye`;
 *   `{ t: 'flags', id, f }` a player's new flags, to everyone but them.
 *
 * The chat is one room for the planet, like everything else here, and it is
 * kept in memory only: a room that sleeps with nobody in it wakes with no
 * history, which is the right amount of history for an empty room.
 *
 * A socket opens with `?name=`, `?look=` and `?key=`. The look is how the
 * player chose to look, which the relay checks the shape of and passes on
 * and never reads; an older client sends none, and an older relay drops it
 * and the `look` message both, so a client on either side of the change still
 * sees the other, dressed as the crowd. The key is a secret the client
 * makes once a page and keeps across its reconnections, never sent to anyone
 * else. A player who disconnects from a seat leaves it on the vehicle, and a
 * `sit` from a socket with that key is the same player coming back — granted
 * however far the vehicle has gone since, which a plane at cruise will have,
 * and before the new socket has said where it is.
 *
 * A vehicle comes to rest when its driver leaves it, disconnects or goes
 * quiet for `SILENT_MS`; passengers keep their seats, and seat 0 is then free
 * for any of them to take. Resting poses are kept in the object's storage
 * (`veh:<id>` -> `{ p, at, k? }`, `k` the keys of whoever dropped out of it), written when a vehicle parks and every
 * `SAVE_MS` while it is driven, never per pose; a vehicle left for
 * `EXPIRE_MS` goes back to its site. Who sits where is not stored: it is the
 * sockets', so each socket's attachment carries its own seat and a wake from
 * hibernation rebuilds the map from `getWebSockets()`.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  CHAT_HISTORY,
  EMOTE_INTERVAL_MS,
  FLAGS_INTERVAL_MS,
  MAX_RADIUS,
  MAX_SPEED,
  MIN_RADIUS,
  cleanChat,
  cleanCountry,
  cleanEmote,
  cleanFlags,
  cleanHonk,
  cleanHonkOn,
  cleanLook,
  driveReach,
  freshBucket,
  freshHonk,
  spendChat,
  spendHonk,
} from './limits.ts';
import type { ChatBucket, HonkState } from './limits.ts';

/** How many sockets one room accepts; the next is refused with 1013. */
const MAX_PLAYERS = 100;
/** A state closer to the last than this, in milliseconds, is dropped. The client sends every 100. */
const MIN_INTERVAL_MS = 60;
/** A driver's pose closer to the last than this is dropped; the client sends at most every 100. */
const DRIVE_INTERVAL_MS = 50;
/** Between two claims, or two leavings, by one socket. */
const SEAT_INTERVAL_MS = 250;
/**
 * Between two changes of look by one socket. Every accepted change has every
 * client near that player build a new body (a merge and a weld of the cast's
 * parts), so the rate is what one socket may cost everybody round it; the card
 * sends the first of a run of clicks at once and the last one after this.
 */
const LOOK_INTERVAL_MS = 1000;
/**
 * Longer than any valid message: a pose with a vehicle id is under 200
 * characters, and a chat line of `CHAT_MAX` code points is at most 400 UTF-16
 * units before its quotes are escaped.
 */
const MAX_MESSAGE = 1_024;
// Where a player or a vehicle can be and how fast it can go — `MIN_RADIUS`,
// `MAX_RADIUS` and `MAX_SPEED`, each a loose bound over the game's own
// numbers — and `driveReach`, how far a driven vehicle may go between two
// poses, live in `limits.ts`, which the world's check holds to the game.
const MAX_NAME = 20;

/** `model:site:slot`, as `src/fleet.ts` names what stands at a site. */
const VEHICLE_ID = /^[a-z-]{2,20}:\d{1,6}:\d{1,2}$/;
/** Seats are 0 (the driver's) to this, inclusive. */
const MAX_SEAT = 7;
/** A socket's secret, from `?key=`: long enough not to be guessed. */
const KEY = /^[A-Za-z0-9-]{16,64}$/;
/**
 * How far from a vehicle a player may claim a seat in it, in world units:
 * sixteen bodies, room for either pose being a tenth of a second stale. A
 * vehicle still at its site has no pose here, and the claim is trusted.
 */
const CLAIM_REACH = 60;
/** A driver who sends no pose for this long is taken to have stopped. */
const SILENT_MS = 5_000;
/** How often a driven vehicle's pose is written while it moves. */
const SAVE_MS = 10_000;
/** A vehicle nobody has touched for this long goes back where it stood. */
const EXPIRE_MS = 24 * 3_600_000;
/**
 * How many resting vehicles the room remembers; the oldest goes home first.
 * A row is about a hundred characters of `hi`, so 5,000 make half a megabyte,
 * under the socket's one.
 */
const MAX_STORED = 5_000;
const STORED = 'veh:';

type State = [number, number, number, number, number, number, number, number, number];
type Pose = number[];

interface Attachment {
  id: string;
  name: string;
  /** How the player looks, `''` for a client that did not say (`cleanLook`). */
  look: string;
  /** The page's secret across its reconnections, `''` for a client that sent none. */
  key: string;
  state: State | null;
  /** What the player is doing that `state` does not say (`FLAGS`), 0 for nothing. */
  flags: number;
  /** The seat this socket holds, `[vehicle, seat]`. */
  seat: [string, number] | null;
  /** The last pose it sent as a driver, so a wake knows where the vehicle is. */
  drive: { v: string; p: Pose; at: number } | null;
  /** When each kind of message was last accepted; kept here so a hibernation forgives nothing. */
  rate: { s: number; vp: number; sit: number; up: number; look: number; emote: number; flags: number };
  /** The horn's pacing and whether it is held (`spendHonk`). */
  horn: HonkState;
  /** What this socket may still say in the chat (`spendChat`). */
  chat: ChatBucket;
}

/** A chat line as the room keeps it and sends it. */
interface ChatLine {
  t: 'chat';
  id: string;
  name: string;
  c: string;
  m: string;
  at: number;
}

/** What storage keeps of a vehicle at rest. */
interface Parked {
  p: Pose;
  at: number;
  /** `Craft.keys`, if any. */
  k?: string[];
}

interface Craft {
  /** Where it is, if it has left its site. */
  pose: Pose | null;
  /** When it was last moved, for the expiry and the eviction. */
  at: number;
  /** By player id; index 0 drives. */
  seats: (string | null)[];
  /** When its driver last sent a pose, or 0 while it is at rest. */
  drivenAt: number;
  /** When its pose last went to storage. */
  savedAt: number;
  /** Whether storage has a row for it. */
  stored: boolean;
  /**
   * The keys of the players who dropped out of a seat in it — a lost socket,
   * not an `up` — newest last and at most one a seat: any of them may claim
   * a seat back from wherever it has got to.
   */
  keys: string[];
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function parseState(value: unknown): State | null {
  if (!Array.isArray(value) || value.length !== 9) return null;
  if (!value.every(finite)) return null;
  const [x, y, z, fx, fy, fz, state, speed, airborne] = value as number[] as State;
  const radius = Math.hypot(x, y, z);
  if (radius < MIN_RADIUS || radius > MAX_RADIUS) return null;
  const heading = Math.hypot(fx, fy, fz);
  if (heading < 0.5 || heading > 1.5) return null;
  if (state !== 0 && state !== 1 && state !== 2) return null;
  if (airborne !== 0 && airborne !== 1) return null;
  return [
    round(x, 2), round(y, 2), round(z, 2),
    round(fx, 3), round(fy, 3), round(fz, 3),
    // A speed is only what a peer draws the stride from, so an absurd one —
    // a passenger's first frame after the car was carried a long way — is
    // clamped rather than costing the position it came with.
    state, round(Math.min(Math.max(speed, 0), MAX_SPEED), 1), airborne,
  ];
}

/** Nine finite numbers: a point in the shell a vehicle can be in, and two unit vectors. */
function parsePose(value: unknown): Pose | null {
  if (!Array.isArray(value) || value.length !== 9 || !value.every(finite)) return null;
  const n = value as number[];
  const radius = Math.hypot(n[0]!, n[1]!, n[2]!);
  if (radius < MIN_RADIUS || radius > MAX_RADIUS) return null;
  for (const at of [3, 6]) {
    const length = Math.hypot(n[at]!, n[at + 1]!, n[at + 2]!);
    if (length < 0.8 || length > 1.2) return null;
  }
  return n.map((x, i) => round(x, i < 3 ? 2 : 3));
}

const vehicleOf = (value: unknown): string | null =>
  typeof value === 'string' && VEHICLE_ID.test(value) ? value : null;
const seatOf = (value: unknown): number | null =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_SEAT ? (value as number) : null;

const apart = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** Printable, single-line, short; a blank one becomes a traveller with a number. */
function cleanName(raw: string | null): string {
  const name = (raw ?? '').replace(/[\p{C}<>]/gu, '').trim().slice(0, MAX_NAME);
  return name === '' ? `Traveller ${Math.floor(Math.random() * 900 + 100)}` : name;
}

/** A socket's attachment, filled in if an older relay wrote it; `null` for a refused socket. */
function attachmentOf(socket: WebSocket): Attachment | null {
  const raw = socket.deserializeAttachment() as Partial<Attachment> | null;
  if (raw === null || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  return {
    id: raw.id,
    name: raw.name ?? '',
    look: raw.look ?? '',
    key: raw.key ?? '',
    state: raw.state ?? null,
    flags: raw.flags ?? 0,
    seat: raw.seat ?? null,
    drive: raw.drive ?? null,
    rate: { s: 0, vp: 0, sit: 0, up: 0, look: 0, emote: 0, flags: 0, ...raw.rate },
    horn: raw.horn ?? freshHonk(),
    chat: raw.chat ?? freshBucket(),
  };
}

/** The seat list as the wire carries it: dense, with no empty seats trailing. */
function trimmed(seats: (string | null)[]): (string | null)[] {
  let end = seats.length;
  while (end > 0 && (seats[end - 1] ?? null) === null) end--;
  seats.length = end;
  for (let i = 0; i < end; i++) seats[i] ??= null;
  return seats;
}

const occupied = (craft: Craft) => craft.seats.some((id) => id != null);

export class Room extends DurableObject<Env> {
  private readonly crafts = new Map<string, Craft>();
  /** The vehicles with a driver sending poses; the only ones the silence check walks. */
  private readonly driving = new Set<string>();
  private storedCount = 0;
  /** The last `CHAT_HISTORY` lines, oldest first, for whoever joins next. */
  private readonly history: ChatLine[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Every wake, from hibernation or an alarm, starts here: the resting
    // vehicles come back from storage and the seats from the sockets.
    void ctx.blockConcurrencyWhile(() => this.load());
  }

  private async load(): Promise<void> {
    const rows = await this.ctx.storage.list<Parked>({ prefix: STORED });
    for (const [key, row] of rows) {
      this.crafts.set(key.slice(STORED.length), {
        pose: row.p, at: row.at, seats: [], drivenAt: 0, savedAt: row.at, stored: true, keys: row.k ?? [],
      });
    }
    this.storedCount = rows.size;
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const self = attachmentOf(socket);
      if (self?.seat == null) continue;
      const [v, seat] = self.seat;
      const craft = this.craftOf(v);
      craft.seats[seat] = self.id;
      if (seat === 0 && self.drive?.v === v && self.drive.at > craft.at) {
        craft.pose = self.drive.p;
        craft.at = self.drive.at;
        if (now - self.drive.at < SILENT_MS) {
          craft.drivenAt = self.drive.at;
          this.driving.add(v);
        }
      }
    }
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const sockets = this.ctx.getWebSockets();
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    if (sockets.length >= MAX_PLAYERS) {
      server.close(1013, 'The room is full');
      return new Response(null, { status: 101, webSocket: client });
    }

    const id = crypto.randomUUID().slice(0, 8);
    const query = new URL(request.url).searchParams;
    const name = cleanName(query.get('name'));
    const look = cleanLook(query.get('look'));
    const key = query.get('key') ?? '';
    server.serializeAttachment({
      id, name, look, key: KEY.test(key) ? key : '', state: null, flags: 0, seat: null, drive: null,
      rate: { s: 0, vp: 0, sit: 0, up: 0, look: 0, emote: 0, flags: 0 },
      horn: freshHonk(),
      chat: freshBucket(),
    } satisfies Attachment);

    // The lazy half of the silence and the expiry: whatever a newcomer is
    // told has already been settled.
    const now = Date.now();
    this.settle(now);
    this.expire(now);
    const peers: unknown[] = [];
    // Beside the rows rather than in them: a row's length is what an older
    // client checks a state by, and a tenth field would drop every peer.
    const looks: Record<string, string> = {};
    const flags: Record<string, number> = {};
    for (const socket of sockets) {
      const other = attachmentOf(socket);
      if (other?.state) peers.push([other.id, other.name, ...other.state]);
      if (other !== null && other.look !== '') looks[other.id] = other.look;
      if (other !== null && other.flags !== 0) flags[other.id] = other.flags;
    }
    const vehicles: unknown[] = [];
    for (const [v, craft] of this.crafts) vehicles.push([v, craft.pose, trimmed(craft.seats)]);
    server.send(JSON.stringify({ t: 'hi', id, peers, vehicles, looks, flags, chat: this.history }));
    this.broadcast(JSON.stringify(look === '' ? { t: 'in', id, name } : { t: 'in', id, name, look }), server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE) return;
    let value: unknown;
    try {
      value = JSON.parse(message);
    } catch {
      return;
    }
    const self = attachmentOf(socket);
    if (self === null) return;
    const now = Date.now();
    this.settle(now);
    if (Array.isArray(value)) {
      this.move(socket, self, value, now);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const typed = value as { t?: unknown; v?: unknown; seat?: unknown; p?: unknown; sp?: unknown; l?: unknown; m?: unknown; c?: unknown; e?: unknown; k?: unknown; f?: unknown; on?: unknown };
    if (typed.t === 'vp') this.drive(socket, self, typed, now);
    else if (typed.t === 'sit') this.sit(socket, self, typed, now);
    else if (typed.t === 'up') this.up(socket, self, typed, now);
    else if (typed.t === 'look') this.restyle(socket, self, typed.l, now);
    else if (typed.t === 'chat') this.say(socket, self, typed.m, typed.c, now);
    else if (typed.t === 'emote') this.gesture(socket, self, typed.e, now);
    else if (typed.t === 'honk') this.honk(socket, self, typed.k, typed.on, now);
    else if (typed.t === 'flags') this.flag(socket, self, typed.f, now);
  }

  override async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    this.leave(socket);
    try {
      socket.close(code === 1005 ? 1000 : code, 'Bye');
    } catch {
      // Already closed from the other side.
    }
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    this.leave(socket);
  }

  /** Sends vehicles left alone too long back to their sites, and wakes again for the next. */
  override async alarm(): Promise<void> {
    const next = this.expire(Date.now());
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  // -------------------------------------------------------------------------
  // The players
  // -------------------------------------------------------------------------

  private move(socket: WebSocket, self: Attachment, value: unknown[], now: number): void {
    if (now - self.rate.s < MIN_INTERVAL_MS) return;
    const state = parseState(value);
    if (state === null) return;
    self.rate.s = now;
    self.state = state;
    socket.serializeAttachment(self);
    this.broadcast(JSON.stringify({ t: 'at', id: self.id, s: state }), socket);
  }

  /** A new look, kept for whoever joins next and passed on to everyone else. */
  private restyle(socket: WebSocket, self: Attachment, raw: unknown, now: number): void {
    if (now - self.rate.look < LOOK_INTERVAL_MS) return;
    const look = cleanLook(raw);
    if (look === '' || look === self.look) return;
    self.rate.look = now;
    self.look = look;
    socket.serializeAttachment(self);
    this.broadcast(JSON.stringify({ t: 'look', id: self.id, l: look }), socket);
  }

  /**
   * A line for everyone, the sender included, and kept for whoever joins
   * next. Cleaned and paced by the same two functions the game sends by, so
   * a line the relay drops is one a changed client sent.
   */
  private say(socket: WebSocket, self: Attachment, raw: unknown, country: unknown, now: number): void {
    const m = cleanChat(raw);
    if (m === '') return;
    const allowed = spendChat(self.chat, now);
    socket.serializeAttachment(self);
    if (!allowed) return;
    const line: ChatLine = { t: 'chat', id: self.id, name: self.name, c: cleanCountry(country), m, at: now };
    this.history.push(line);
    if (this.history.length > CHAT_HISTORY) this.history.shift();
    this.broadcast(JSON.stringify(line), null);
  }

  /** A wave, a dance, sitting down: passed on, never kept. */
  private gesture(socket: WebSocket, self: Attachment, raw: unknown, now: number): void {
    if (now - self.rate.emote < EMOTE_INTERVAL_MS) return;
    const e = cleanEmote(raw);
    if (e === '') return;
    self.rate.emote = now;
    socket.serializeAttachment(self);
    this.broadcast(JSON.stringify({ t: 'emote', id: self.id, e }), socket);
  }

  /** A canopy opened, a bench sat on: kept for whoever joins next, and passed on. */
  private flag(socket: WebSocket, self: Attachment, raw: unknown, now: number): void {
    if (now - self.rate.flags < FLAGS_INTERVAL_MS) return;
    const f = cleanFlags(raw);
    if (f < 0 || f === self.flags) return;
    self.rate.flags = now;
    self.flags = f;
    socket.serializeAttachment(self);
    this.broadcast(JSON.stringify({ t: 'flags', id: self.id, f }), socket);
  }

  /**
   * A horn, passed on and never kept: started, refreshed or tapped from the
   * driver's seat only, and let go from anywhere, since the seat may be left
   * before the key comes up.
   */
  private honk(socket: WebSocket, self: Attachment, raw: unknown, rawOn: unknown, now: number): void {
    const k = cleanHonk(raw);
    const on = cleanHonkOn(rawOn);
    if (k === '' || on === null) return;
    if (on !== false && (self.seat === null || self.seat[1] !== 0)) return;
    if (!spendHonk(self.horn, on, now)) return;
    socket.serializeAttachment(self);
    this.broadcast(JSON.stringify(on === undefined ? { t: 'honk', id: self.id, k } : { t: 'honk', id: self.id, k, on }), socket);
  }

  private leave(socket: WebSocket): void {
    const self = attachmentOf(socket);
    if (self === null) return;
    // A driver who goes parks where they were last seen; a passenger only frees a seat.
    if (self.seat !== null) {
      this.vacate(self, Date.now(), null, socket, true);
      socket.serializeAttachment(self);
    }
    this.broadcast(JSON.stringify({ t: 'bye', id: self.id }), socket);
  }

  // -------------------------------------------------------------------------
  // The vehicles
  // -------------------------------------------------------------------------

  private sit(socket: WebSocket, self: Attachment, message: { v?: unknown; seat?: unknown; p?: unknown }, now: number): void {
    if (now - self.rate.sit < SEAT_INTERVAL_MS) return;
    const v = vehicleOf(message.v);
    const seat = seatOf(message.seat);
    if (v === null || seat === null) return;
    self.rate.sit = now;
    socket.serializeAttachment(self);

    const known = this.crafts.get(v);
    const answer = (seats: (string | null)[]) => this.send(socket, { t: 'seat', v, seats, ask: seat });
    const holder = known?.seats[seat] ?? null;
    if (holder === self.id) return answer(trimmed(known!.seats));
    // The player who dropped out of it, back on a new socket: wherever the
    // vehicle has got to, and whether or not this socket has said where it is.
    const returning = self.key !== '' && known !== undefined && known.keys.includes(self.key);
    const tooFar = !returning && known?.pose != null && (self.state === null || apart(self.state, known.pose) > CLAIM_REACH);
    if (holder !== null || tooFar) return answer(known === undefined ? [] : trimmed(known.seats));

    if (self.seat !== null) this.vacate(self, now, null, null);
    const craft = this.craftOf(v);
    // A vehicle still at its site has no pose here; the claimer, who can see
    // it, may say where it stands, and is believed if they are beside it.
    const site = craft.pose === null && message.p != null ? parsePose(message.p) : null;
    const placed = site !== null && self.state !== null && apart(self.state, site) <= CLAIM_REACH;
    if (placed) craft.pose = site;
    if (returning) craft.keys = craft.keys.filter((key) => key !== self.key);
    craft.seats[seat] = self.id;
    self.seat = [v, seat];
    self.drive = null;
    socket.serializeAttachment(self);
    const seats = trimmed(craft.seats);
    this.broadcast(JSON.stringify({ t: 'seat', v, seats }), socket);
    answer(seats);
    // Where it stands, for everyone, as a vehicle at rest; not stored until it moves.
    if (placed) this.broadcast(JSON.stringify({ t: 'park', v, p: site }), null);
  }

  private up(socket: WebSocket, self: Attachment, message: { v?: unknown; p?: unknown }, now: number): void {
    if (now - self.rate.up < SEAT_INTERVAL_MS) return;
    const v = vehicleOf(message.v);
    if (v === null || self.seat === null || self.seat[0] !== v) return;
    self.rate.up = now;
    const pose = message.p === undefined || message.p === null ? null : parsePose(message.p);
    this.vacate(self, now, pose, null);
    socket.serializeAttachment(self);
  }

  private drive(socket: WebSocket, self: Attachment, message: { v?: unknown; p?: unknown; sp?: unknown }, now: number): void {
    if (now - self.rate.vp < DRIVE_INTERVAL_MS) return;
    const v = vehicleOf(message.v);
    if (v === null || self.seat === null || self.seat[0] !== v || self.seat[1] !== 0) return;
    const pose = parsePose(message.p);
    const speed = message.sp;
    if (pose === null || !finite(speed)) return;
    // A vehicle goes no faster than anything in the world: from its last
    // pose, or, one nobody has placed yet, from where its driver last said he
    // was. A driver with neither is believed, as a claim on a vehicle at its
    // site is.
    const craft = this.craftOf(v);
    if (craft.pose !== null) {
      if (apart(pose, craft.pose) > driveReach(now - craft.at, CLAIM_REACH)) return;
    } else if (self.state !== null && apart(pose, self.state) > driveReach(now - self.rate.s, CLAIM_REACH)) return;
    self.rate.vp = now;
    self.drive = { v, p: pose, at: now };
    socket.serializeAttachment(self);

    craft.pose = pose;
    craft.at = now;
    craft.drivenAt = now;
    this.driving.add(v);
    if (now - craft.savedAt > SAVE_MS) this.persist(v, craft, now);
    const sp = Math.min(Math.max(speed, -MAX_SPEED), MAX_SPEED);
    this.broadcast(JSON.stringify({ t: 'vp', v, p: pose, sp: round(sp, 1) }), socket);
  }

  /**
   * Gives up `self`'s seat and says so to everyone but `except`. A driver's
   * vehicle parks: at `final` if that is within reach of where it was last
   * seen, else where it was last seen.
   */
  private vacate(self: Attachment, now: number, final: Pose | null, except: WebSocket | null, dropped = false): void {
    const [v, seat] = self.seat!;
    self.seat = null;
    self.drive = null;
    const craft = this.crafts.get(v);
    if (craft === undefined) return;
    if (craft.seats[seat] === self.id) craft.seats[seat] = null;
    // Kept for the reconnection: see `sit`. Written to storage with the park.
    if (dropped && self.key !== '') {
      craft.keys = craft.keys.filter((key) => key !== self.key);
      craft.keys.push(self.key);
      if (craft.keys.length > MAX_SEAT + 1) craft.keys.shift();
    }
    this.broadcast(JSON.stringify({ t: 'seat', v, seats: trimmed(craft.seats) }), except);
    if (seat === 0 && final !== null) {
      // As far as it could have gone since its last pose, and a claim's reach besides.
      const reach = driveReach(now - craft.at, CLAIM_REACH);
      if (craft.pose === null || apart(final, craft.pose) <= reach) craft.pose = final;
    }
    if (seat === 0 && craft.pose !== null) this.park(v, craft, now);
    else if (craft.pose === null && !occupied(craft)) this.crafts.delete(v);
  }

  /** A vehicle at rest where it is: kept, and announced. */
  private park(v: string, craft: Craft, now: number): void {
    craft.drivenAt = 0;
    craft.at = now;
    this.driving.delete(v);
    this.persist(v, craft, now);
    this.broadcast(JSON.stringify({ t: 'park', v, p: craft.pose }), null);
  }

  /** A driver gone quiet is a vehicle at rest. Only the driven are walked, so this runs on every message. */
  private settle(now: number): void {
    for (const v of this.driving) {
      const craft = this.crafts.get(v);
      if (craft === undefined || craft.drivenAt === 0) this.driving.delete(v);
      else if (now - craft.drivenAt > SILENT_MS) this.park(v, craft, now);
    }
  }

  private persist(v: string, craft: Craft, now: number): void {
    if (craft.pose === null) return;
    craft.savedAt = now;
    const row: Parked = { p: craft.pose, at: craft.at };
    if (craft.keys.length > 0) row.k = craft.keys;
    void this.ctx.storage.put(STORED + v, row);
    if (!craft.stored) {
      craft.stored = true;
      this.storedCount++;
      if (this.storedCount > MAX_STORED) this.evictOldest();
    }
    // One alarm at a time: whichever fires first finds the next.
    const due = craft.at + EXPIRE_MS;
    void this.ctx.storage.getAlarm().then((alarm) => {
      if (alarm === null) return this.ctx.storage.setAlarm(due);
    });
  }

  private evictOldest(): void {
    let oldest: string | null = null;
    let at = Infinity;
    for (const [v, craft] of this.crafts) {
      if (craft.stored && !occupied(craft) && craft.drivenAt === 0 && craft.at < at) {
        oldest = v;
        at = craft.at;
      }
    }
    if (oldest !== null) this.home(oldest);
  }

  /** Back to its site: forgotten, and announced. */
  private home(v: string): void {
    const craft = this.crafts.get(v);
    if (craft === undefined) return;
    if (craft.stored) {
      this.storedCount--;
      void this.ctx.storage.delete(STORED + v);
    }
    this.crafts.delete(v);
    this.driving.delete(v);
    this.broadcast(JSON.stringify({ t: 'park', v, p: null }), null);
  }

  /** Sends home everything unattended for `EXPIRE_MS`; returns when the next is due, if any is. */
  private expire(now: number): number | null {
    let next: number | null = null;
    for (const [v, craft] of [...this.crafts]) {
      if (occupied(craft) || craft.drivenAt !== 0) continue;
      const due = craft.at + EXPIRE_MS;
      if (due <= now) this.home(v);
      else if (craft.stored) next = next === null ? due : Math.min(next, due);
    }
    return next;
  }

  private craftOf(v: string): Craft {
    let craft = this.crafts.get(v);
    if (craft === undefined) {
      craft = { pose: null, at: Date.now(), seats: [], drivenAt: 0, savedAt: 0, stored: false, keys: [] };
      this.crafts.set(v, craft);
    }
    return craft;
  }

  private send(socket: WebSocket, message: object): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // A socket that is closing; its own close event cleans it up.
    }
  }

  private broadcast(text: string, except: WebSocket | null): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      try {
        socket.send(text);
      } catch {
        // A socket that is closing; its own close event cleans it up.
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') return env.ROOM.get(env.ROOM.idFromName('earth')).fetch(request);
    return new Response('atlas peers\n', { headers: { 'content-type': 'text/plain' } });
  },
} satisfies ExportedHandler<Env>;
