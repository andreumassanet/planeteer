/**
 * The relay's wire types and validation: player states, vehicle poses, seats
 * and the per-socket attachment that survives hibernation.
 */
import { cleanBody, freshBucket, freshHonk, MAX_SPEED } from './limits.ts';
import type { ChatBucket, HonkState } from './limits.ts';

/** Longest player name, in code points. */
const MAX_NAME = 20;

/** `model:site:slot`, as `src/fleet.ts` names what stands at a site. */
const VEHICLE_ID = /^[a-z-]{2,20}:\d{1,6}:\d{1,2}$/;
/** Seats are 0 (the driver's) to this, inclusive. */
export const MAX_SEAT = 7;
/** A socket's secret, from `?key=`: long enough not to be guessed. */
export const KEY = /^[A-Za-z0-9-]{16,64}$/;

export type State = [number, number, number, number, number, number, number, number, number];
export type Pose = number[];

export interface Attachment {
  id: string;
  /** The world whose room this is (`BODY_RADII`). */
  body: string;
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
  /** When each kind of message was last accepted; in the attachment so hibernation does not reset it. */
  rate: { s: number; vp: number; sit: number; up: number; look: number; emote: number; flags: number };
  /** The horn's pacing and whether it is held (`spendHonk`). */
  horn: HonkState;
  /** What this socket may still say in the chat (`spendChat`). */
  chat: ChatBucket;
}

/** A chat line as the room keeps it and sends it: `w` is the world it was said on. */
export interface ChatLine {
  t: 'chat';
  id: string;
  name: string;
  c: string;
  m: string;
  at: number;
  w: string;
}

/** Whether a request body is a well-formed chat line passed on by another world's room. */
export function isChatLine(raw: unknown): raw is ChatLine {
  if (typeof raw !== 'object' || raw === null) return false;
  const line = raw as Partial<ChatLine>;
  return line.t === 'chat' && typeof line.id === 'string' && typeof line.name === 'string' && typeof line.c === 'string'
    && typeof line.m === 'string' && typeof line.at === 'number' && typeof line.w === 'string' && cleanBody(line.w) === line.w;
}

/** What storage keeps of a vehicle at rest. */
export interface Parked {
  p: Pose;
  at: number;
  /** `Craft.keys`, if any. */
  k?: string[];
}

export interface Craft {
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
   * Keys of players whose socket dropped while seated, newest last, at most
   * one per seat; any of them may reclaim a seat wherever the vehicle is.
   */
  keys: string[];
}

export const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Where a state or a pose may be on a world: `shellOf` in `limits.ts`. */
export type Shell = { min: number; max: number };

export function parseState(value: unknown, shell: Shell): State | null {
  if (!Array.isArray(value) || value.length !== 9) return null;
  if (!value.every(finite)) return null;
  const [x, y, z, fx, fy, fz, state, speed, airborne] = value as number[] as State;
  const radius = Math.hypot(x, y, z);
  if (radius < shell.min || radius > shell.max) return null;
  const heading = Math.hypot(fx, fy, fz);
  if (heading < 0.5 || heading > 1.5) return null;
  if (state !== 0 && state !== 1 && state !== 2) return null;
  if (airborne !== 0 && airborne !== 1) return null;
  return [
    round(x, 2), round(y, 2), round(z, 2),
    round(fx, 3), round(fy, 3), round(fz, 3),
    // Speed only drives the peer's stride animation, so clamp it rather than
    // dropping the state.
    state, round(Math.min(Math.max(speed, 0), MAX_SPEED), 1), airborne,
  ];
}

/** Nine finite numbers: a point inside the shell and two unit vectors. */
export function parsePose(value: unknown, shell: Shell): Pose | null {
  if (!Array.isArray(value) || value.length !== 9 || !value.every(finite)) return null;
  const n = value as number[];
  const radius = Math.hypot(n[0]!, n[1]!, n[2]!);
  if (radius < shell.min || radius > shell.max) return null;
  for (const at of [3, 6]) {
    const length = Math.hypot(n[at]!, n[at + 1]!, n[at + 2]!);
    if (length < 0.8 || length > 1.2) return null;
  }
  return n.map((x, i) => round(x, i < 3 ? 2 : 3));
}

export const vehicleOf = (value: unknown): string | null =>
  typeof value === 'string' && VEHICLE_ID.test(value) ? value : null;
export const seatOf = (value: unknown): number | null =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_SEAT ? (value as number) : null;

export const apart = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** Printable, single-line, short; a blank name becomes `Traveller NNN`. */
export function cleanName(raw: string | null): string {
  // Cut by code point, as `peers.ts` does, so an emoji is never split.
  const name = Array.from((raw ?? '').replace(/[\p{C}<>]/gu, '').trim()).slice(0, MAX_NAME).join('').trim();
  return name === '' ? `Traveller ${Math.floor(Math.random() * 900 + 100)}` : name;
}

/** A socket's attachment with defaults for fields an older relay did not write; `null` once it has left. */
export function attachmentOf(socket: WebSocket): Attachment | null {
  const raw = socket.deserializeAttachment() as Partial<Attachment> | null;
  if (raw === null || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  return {
    id: raw.id,
    body: raw.body ?? 'earth',
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
export function trimmed(seats: (string | null)[]): (string | null)[] {
  let end = seats.length;
  while (end > 0 && (seats[end - 1] ?? null) === null) end--;
  seats.length = end;
  for (let i = 0; i < end; i++) seats[i] ??= null;
  return seats;
}

export const occupied = (craft: Craft) => craft.seats.some((id) => id != null);
