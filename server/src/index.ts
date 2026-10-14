/**
 * The peers relay: a Cloudflare Worker routing each world to one Durable
 * Object room (`?body=<id>`, Earth when absent; unknown worlds are refused).
 *
 * The world is deterministic, so a player is only a position, heading, state,
 * speed and airborne flag, which the room forwards to everyone else. The one
 * thing it must keep is where vehicles were left and who sits in them; seats
 * and parking exist on Earth only, and other rooms ignore `sit`, `up`, `vp`.
 * Chat is the only thing that crosses worlds: each room forwards its lines to
 * the others over `/chat` and keeps the last `CHAT_HISTORY` in memory.
 *
 * The wire is JSON. A pose is nine numbers `[x, y, z, fx, fy, fz, ux, uy, uz]`
 * (`WirePose` in `src/craft/contract.ts`); a vehicle id is `model:site:slot`.
 *
 * Client to server:
 * - `[x, y, z, fx, fy, fz, state, speed, airborne]`, ten a second; `state`
 *   indexes `PLAYER_STATES` (foot, swim, seated).
 * - `{ t: 'sit', v, seat, p? }` claims a seat, releasing any other. `p` is
 *   where the claimer sees the vehicle, kept only if the relay has no pose
 *   yet and the claimer is within `CLAIM_REACH`.
 * - `{ t: 'up', v, p? }` leaves; `p`, from the driver, is where it stands.
 *   With `sunk: true` from the driver, every seat empties and the vehicle
 *   returns to its site.
 * - `{ t: 'vp', v, p, sp }` the driver's pose and speed (seat 0 only), no
 *   further from the last pose than `driveReach` allows.
 * - `{ t: 'look', l }` a new appearance (`LOOK_PATTERN`).
 * - `{ t: 'chat', m, c }` a line and the sender's country or nation key,
 *   cleaned by `cleanChat` and paced by `spendChat`.
 * - `{ t: 'emote', e }` a gesture (`EMOTES`), at most one a second.
 * - `{ t: 'honk', k, on? }` a horn (`HONKS`) from the driver's seat, paced by
 *   `spendHonk`; `on` is true on press and each refresh, false on release,
 *   absent for an older client's tap.
 * - `{ t: 'flags', f }` persistent conditions (`FLAGS`), on change.
 *
 * Server to client:
 * - `{ t: 'hi', id, peers, vehicles, looks, flags, chat }` once on joining:
 *   peers as `[id, name, ...state]`, every moved or occupied vehicle as
 *   `[v, pose | null, seats]` (seats by player id), and looks, non-zero flags
 *   and recent chat by id.
 * - `{ t: 'in', id, name, look? }`, `{ t: 'bye', id }` joins and leaves.
 * - `{ t: 'at', id, s }` a move; `{ t: 'look', id, l }` a new appearance.
 * - `{ t: 'seat', v, seats, ask? }` any seating change; the claimer's copy
 *   carries `ask` and its `seats` say whether the claim was granted (a
 *   refusal goes to the claimer only).
 * - `{ t: 'vp', v, p, sp }` a driver's pose, to all but the driver.
 * - `{ t: 'park', v, p }` a vehicle at rest at `p`, or home with `p: null`.
 * - `{ t: 'chat', id, name, c, m, at, w }` a line, to everyone on every world
 *   including the sender; `w` is the world it was said on.
 * - `{ t: 'emote', id, e }`, `{ t: 'honk', id, k, on? }`, `{ t: 'flags', id, f }`
 *   forwarded to all but the sender. Peers release a held horn after
 *   `HONK_HOLD_MS` without a refresh.
 *
 * A socket opens with `?name=`, `?look=`, `?key=` and, off Earth, `?body=`.
 * The key is a per-page secret kept across reconnections: a player whose
 * socket drops keeps their seat, and a `sit` with the same key reclaims it
 * wherever the vehicle has got to.
 *
 * A vehicle comes to rest when its driver leaves, disconnects or is silent
 * for `SILENT_MS`. Resting poses are stored as `veh:<id>` -> `{ p, at, k? }`
 * on parking and every `SAVE_MS` while driven. A vehicle untouched for
 * `EXPIRE_MS` returns to its site unless a player is within `WATCHED_REACH`.
 * Seats are not stored: each socket's attachment carries its own, and a wake
 * from hibernation rebuilds them from `getWebSockets()`.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  BODY_RADII,
  CHAT_HISTORY,
  EMOTE_INTERVAL_MS,
  FLAGS_INTERVAL_MS,
  MAX_SPEED,
  cleanBody,
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
  shellOf,
  spendChat,
  spendHonk,
} from './limits.ts';
import {
  KEY,
  MAX_SEAT,
  apart,
  attachmentOf,
  cleanName,
  finite,
  isChatLine,
  occupied,
  parsePose,
  parseState,
  round,
  seatOf,
  trimmed,
  vehicleOf,
} from './wire.ts';
import type { Attachment, ChatLine, Craft, Parked, Pose, State } from './wire.ts';

/** How many sockets one room accepts; the next is refused with 1013. */
const MAX_PLAYERS = 100;
/** Minimum gap between player states, ms; clients send every 100. */
const MIN_INTERVAL_MS = 60;
/** Minimum gap between driver poses, ms; clients send at most every 100. */
const DRIVE_INTERVAL_MS = 50;
/** Minimum gap between seat claims, or between leavings, by one socket. */
const SEAT_INTERVAL_MS = 250;
/**
 * Minimum gap between appearance changes by one socket. Each change makes
 * every nearby client rebuild that player's body, so this caps the cost one
 * socket can impose.
 */
const LOOK_INTERVAL_MS = 1000;
/** Longer than any valid message (a chat line is at most ~400 UTF-16 units). */
const MAX_MESSAGE = 1_024;
/**
 * How far from a vehicle a player may claim a seat, in units: room for either
 * pose being a tenth of a second stale. A vehicle with no pose is trusted.
 */
const CLAIM_REACH = 60;
/** A driver who sends no pose for this long is taken to have stopped. */
const SILENT_MS = 5_000;
/** How often a driven vehicle's pose is written while it moves. */
const SAVE_MS = 10_000;
/** A vehicle untouched for this long returns to its site. */
const EXPIRE_MS = 3 * 3_600_000;
/**
 * An expired vehicle waits while a player is within this many units, so
 * nobody sees it vanish; beyond the fleet's draw distance.
 */
const WATCHED_REACH = 2_000;
/** How long a watched vehicle waits before it is checked again. */
const WATCHED_RETRY_MS = 10 * 60_000;
/**
 * How many resting vehicles the room remembers; the oldest goes home first.
 * About 100 characters of `hi` each, so this keeps `hi` near half a megabyte.
 */
const MAX_STORED = 5_000;
const STORED = 'veh:';

export class Room extends DurableObject<Env> {
  private readonly crafts = new Map<string, Craft>();
  /** The vehicles with a driver sending poses; the only ones the silence check walks. */
  private readonly driving = new Set<string>();
  private storedCount = 0;
  /** The last `CHAT_HISTORY` lines, oldest first, for whoever joins next. */
  private readonly history: ChatLine[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Every wake (hibernation or alarm) restores parked vehicles from storage
    // and seats from the sockets.
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
    const path = new URL(request.url).pathname;
    // Who is here, for the Worker's `/count`.
    if (path === '/count') {
      const players = this.ctx.getWebSockets()
        .map((socket) => attachmentOf(socket))
        .filter((self) => self !== null)
        .map((self) => ({
          id: self.id,
          name: self.name,
          w: self.body,
          // Position, for `/tp` from another world.
          ...(self.state === null ? {} : { p: [Math.round(self.state[0]), Math.round(self.state[1]), Math.round(self.state[2])] }),
        }));
      return Response.json({ players });
    }
    // A line from another world's room.
    if (path === '/chat' && request.method === 'POST') {
      const line: unknown = await request.json().catch(() => null);
      if (!isChatLine(line)) return new Response('Not a line', { status: 400 });
      this.keep(line);
      return new Response(null, { status: 204 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const query = new URL(request.url).searchParams;
    const key = query.get('key') ?? '';
    const kept = KEY.test(key) ? key : '';
    // The same page reconnecting before its old socket closed: drop the
    // ghost as if it had disconnected, so its seat is kept for this key and
    // the new socket can reclaim it.
    if (kept !== '') {
      for (const socket of this.ctx.getWebSockets()) {
        if (attachmentOf(socket)?.key !== kept) continue;
        this.leave(socket);
        try {
          socket.close(4000, 'Replaced');
        } catch {
          // Already going.
        }
      }
    }
    const sockets = this.ctx.getWebSockets().filter((socket) => attachmentOf(socket) !== null);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    if (sockets.length >= MAX_PLAYERS) {
      server.close(1013, 'The room is full');
      return new Response(null, { status: 101, webSocket: client });
    }

    const id = crypto.randomUUID().slice(0, 8);
    const body = cleanBody(query.get('body')) || 'earth';
    const name = cleanName(query.get('name'));
    const look = cleanLook(query.get('look'));
    server.serializeAttachment({
      id, body, name, look, key: kept, state: null, flags: 0, seat: null, drive: null,
      rate: { s: 0, vp: 0, sit: 0, up: 0, look: 0, emote: 0, flags: 0 },
      horn: freshHonk(),
      chat: freshBucket(),
    } satisfies Attachment);

    // Settle silence and expiry before telling the newcomer anything.
    const now = Date.now();
    this.settle(now);
    const next = this.expire(now);
    if (next !== null) this.schedule(next);
    const peers: unknown[] = [];
    // Looks and flags go beside the peer rows: older clients validate a row
    // by its length.
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
    const typed = value as { t?: unknown; v?: unknown; seat?: unknown; p?: unknown; sp?: unknown; l?: unknown; m?: unknown; c?: unknown; e?: unknown; k?: unknown; f?: unknown; on?: unknown; sunk?: unknown };
    // Only Earth's room arbitrates seats.
    const seats = self.body === 'earth';
    if (typed.t === 'vp') {
      if (seats) this.drive(socket, self, typed, now);
    } else if (typed.t === 'sit') {
      if (seats) this.sit(socket, self, typed, now);
    } else if (typed.t === 'up') {
      if (seats) this.up(socket, self, typed, now);
    } else if (typed.t === 'look') this.restyle(socket, self, typed.l, now);
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
  // Players
  // -------------------------------------------------------------------------

  private move(socket: WebSocket, self: Attachment, value: unknown[], now: number): void {
    if (now - self.rate.s < MIN_INTERVAL_MS) return;
    const state = parseState(value, shellOf(self.body));
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

  /** A chat line to everyone including the sender, kept and forwarded to every other world. */
  private say(socket: WebSocket, self: Attachment, raw: unknown, country: unknown, now: number): void {
    const m = cleanChat(raw);
    if (m === '') return;
    const allowed = spendChat(self.chat, now);
    socket.serializeAttachment(self);
    if (!allowed) return;
    const line: ChatLine = { t: 'chat', id: self.id, name: self.name, c: cleanCountry(country), m, at: now, w: self.body };
    this.keep(line);
    const body = JSON.stringify(line);
    for (const world of Object.keys(BODY_RADII)) {
      if (world === self.body) continue;
      const room = this.env.ROOM.get(this.env.ROOM.idFromName(world));
      this.ctx.waitUntil(room.fetch('https://room/chat', { method: 'POST', body }).then(() => undefined, () => undefined));
    }
  }

  /** A line into this room's history and out to everyone in it. */
  private keep(line: ChatLine): void {
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
   * A horn, forwarded and never kept. Starts need the driver's seat; a stop
   * is accepted anywhere, since the seat may be left before the key is up.
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
    // A departing driver parks the vehicle where it was last seen.
    if (self.seat !== null) {
      this.vacate(self, Date.now(), null, socket, true);
      socket.serializeAttachment(self);
    }
    this.broadcast(JSON.stringify({ t: 'bye', id: self.id }), socket);
    // Clearing the attachment makes this idempotent: error and close both
    // land here, and a replaced ghost closes after it has already left.
    socket.serializeAttachment(null);
  }

  // -------------------------------------------------------------------------
  // Vehicles
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
    // A player whose socket dropped while seated may reclaim from any distance.
    const returning = self.key !== '' && known !== undefined && known.keys.includes(self.key);
    const tooFar = !returning && known?.pose != null && (self.state === null || apart(self.state, known.pose) > CLAIM_REACH);
    if (holder !== null || tooFar) return answer(known === undefined ? [] : trimmed(known.seats));

    if (self.seat !== null) this.vacate(self, now, null, null);
    const craft = this.craftOf(v);
    // A vehicle still at its site has no pose; take the claimer's if they are beside it.
    const site = craft.pose === null && message.p != null ? parsePose(message.p, shellOf(self.body)) : null;
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
    // Announce where it stands; it is not stored until it moves.
    if (placed) this.broadcast(JSON.stringify({ t: 'park', v, p: site }), null);
  }

  private up(socket: WebSocket, self: Attachment, message: { v?: unknown; p?: unknown; sunk?: unknown }, now: number): void {
    if (now - self.rate.up < SEAT_INTERVAL_MS) return;
    const v = vehicleOf(message.v);
    if (v === null || self.seat === null || self.seat[0] !== v) return;
    self.rate.up = now;
    if (message.sunk === true && self.seat[1] === 0) {
      self.seat = null;
      self.drive = null;
      socket.serializeAttachment(self);
      this.sink(v, socket);
      return;
    }
    const pose = message.p === undefined || message.p === null ? null : parsePose(message.p, shellOf(self.body));
    this.vacate(self, now, pose, null);
    socket.serializeAttachment(self);
  }

  private drive(socket: WebSocket, self: Attachment, message: { v?: unknown; p?: unknown; sp?: unknown }, now: number): void {
    if (now - self.rate.vp < DRIVE_INTERVAL_MS) return;
    const v = vehicleOf(message.v);
    if (v === null || self.seat === null || self.seat[0] !== v || self.seat[1] !== 0) return;
    const pose = parsePose(message.p, shellOf(self.body));
    const speed = message.sp;
    if (pose === null || !finite(speed)) return;
    // Bound the step from the vehicle's last pose, or from the driver's last
    // state if the vehicle has none; with neither, trust the driver.
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
    // Remember the key for reconnection (see `sit`); stored with the park.
    if (dropped && self.key !== '') {
      craft.keys = craft.keys.filter((key) => key !== self.key);
      craft.keys.push(self.key);
      if (craft.keys.length > MAX_SEAT + 1) craft.keys.shift();
    }
    this.broadcast(JSON.stringify({ t: 'seat', v, seats: trimmed(craft.seats) }), except);
    if (seat === 0 && final !== null) {
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

  /** Parks vehicles whose driver went silent. Cheap enough to run on every message. */
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
    this.schedule(craft.at + EXPIRE_MS);
  }

  /** Keeps one alarm, at the earliest due time; each alarm schedules the next. */
  private schedule(due: number): void {
    void this.ctx.storage.getAlarm().then((alarm) => {
      if (alarm === null || alarm > due) return this.ctx.storage.setAlarm(due);
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

  /** A vehicle that sank: empties every remaining seat and sends it home at once. */
  private sink(v: string, driver: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === driver) continue;
      const other = attachmentOf(socket);
      if (other === null || other.seat === null || other.seat[0] !== v) continue;
      other.seat = null;
      other.drive = null;
      socket.serializeAttachment(other);
    }
    const craft = this.crafts.get(v);
    if (craft !== undefined) {
      craft.seats = [];
      craft.keys = [];
    }
    this.broadcast(JSON.stringify({ t: 'seat', v, seats: [] }), null);
    this.home(v);
  }

  /** Returns a vehicle to its site: forgotten and announced. */
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

  /**
   * Sends home every vehicle unattended for `EXPIRE_MS` with nobody within
   * `WATCHED_REACH`; returns when the next one is due, if any.
   */
  private expire(now: number): number | null {
    let next: number | null = null;
    let players: State[] | null = null;
    for (const [v, craft] of [...this.crafts]) {
      if (occupied(craft) || craft.drivenAt !== 0) continue;
      let due = craft.at + EXPIRE_MS;
      if (due <= now) {
        const pose = craft.pose;
        players ??= this.ctx.getWebSockets().map((socket) => attachmentOf(socket)?.state ?? null).filter((state): state is State => state !== null);
        if (pose === null || !players.some((state) => apart(state, pose) < WATCHED_REACH)) {
          this.home(v);
          continue;
        }
        due = now + WATCHED_RETRY_MS;
      }
      if (craft.stored) next = next === null ? due : Math.min(next, due);
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
    if (url.pathname === '/ws') {
      // One room per world, by name; no `body` means Earth.
      const body = cleanBody(url.searchParams.get('body'));
      if (body === '') return new Response('No such world', { status: 404 });
      return env.ROOM.get(env.ROOM.idFromName(body)).fetch(request);
    }
    if (url.pathname === '/count') {
      // Everybody connected on every world, for the title screen and `Tab`.
      const rooms = await Promise.all(
        Object.keys(BODY_RADII).map(async (world) => {
          try {
            const answer = await env.ROOM.get(env.ROOM.idFromName(world)).fetch(new Request('https://room/count'));
            return ((await answer.json()) as { players: { id: string; name: string; w: string; p?: number[] }[] }).players;
          } catch {
            return [];
          }
        }),
      );
      const players = rooms.flat();
      return Response.json(
        { online: players.length, players },
        { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } },
      );
    }
    return new Response('atlas peers\n', { headers: { 'content-type': 'text/plain' } });
  },
} satisfies ExportedHandler<Env>;
