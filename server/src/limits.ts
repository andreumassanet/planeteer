/**
 * What the relay accepts as a position and a speed, how far a driven vehicle
 * may go between two poses, and what a chat line may be and how often.
 *
 * The relay is bundled on its own and cannot import the game, whose constants
 * live beside Three and the DOM, so the few it bounds are restated here — and
 * restated loosely, as bounds rather than copies: a limit a little over the
 * game's own is a relay that drops a legitimate player the day the plane is
 * tuned. `scripts/check-world.ts` imports this file beside `src/vehicles.ts`
 * and fails if the game has outgrown any of them, so tuning the plane past a
 * margin is a failed check rather than a silent one.
 *
 * No imports, so the check can load it under Node and the Worker can bundle it.
 */

/** `PLANET_RADIUS` in `src/globe.ts`. */
export const PLANET_RADIUS = 16_000;

/**
 * Under the lowest sea floor: nothing in the world stands this deep, and the
 * shore's lip and the waterline are a few units under the radius.
 */
export const MIN_RADIUS = 15_000;

/**
 * Over anything that flies. The plane's ceiling is an *altitude*,
 * `PLANET_RADIUS * 1.45` (23,200) over the sea, so a plane at it is at a
 * radius of 39,200; this is the radius plus twice that altitude (62,400),
 * room for the ceiling to be raised by half again and more. The same bound
 * holds a player and a vehicle, because a seated player is where his seat is.
 */
export const MAX_RADIUS = PLANET_RADIUS + 2 * (PLANET_RADIUS * 1.45);

/**
 * About twice the fastest thing in the world. The plane at the ceiling, its
 * cruise of 3,400 with the stick and the throttle full on (`fly` in
 * `src/player.ts`), went 7,344 a second on 2026-09-24. A state or a pose
 * faster than this is not a game's.
 */
export const MAX_SPEED = 15_000;

/**
 * How late a pose may arrive against the one before it: the client sends one
 * at most every 100 ms, and a network holds and releases them in bunches.
 */
export const JITTER_MS = 1_000;

/**
 * How far a driven vehicle may have gone in `elapsedMs` since its last known
 * pose: `MAX_SPEED` over that time and the jitter, plus `slack` (the claim's
 * reach, where the relay's pose is only as good as a claimer's word).
 *
 * A teleport on the wire is never a pose: `atlas.goTo`, the map's *join* and a
 * spawn from the menu all leave the vehicle where it was (the player's ride
 * ends, and the `up` that follows carries the pose it was left at), and the
 * player's own state is never bounded by a step, so a traveller can jump
 * anywhere and only a vehicle cannot. A pose past this is dropped rather than
 * answered; the bound grows with the time since the last one accepted, so a
 * client that lost a few catches up on its own.
 */
export function driveReach(elapsedMs: number, slack: number): number {
  return slack + (MAX_SPEED * (Math.max(0, elapsedMs) + JITTER_MS)) / 1000;
}

/**
 * How a traveller looks, as the relay passes it on: `encodeAppearance` in
 * `src/appearance.ts` writes thirteen characters, a version letter and one
 * base-36 digit a field, and this is looser than that on purpose — a short
 * run of lower-case letters and digits, with room for the fields a later
 * client appends. The relay never reads it; the game's `decodeAppearance` is
 * the one reader, and draws anything it cannot as the crowd. What this stops
 * is anything else riding along under the name: markup, a long string, a
 * number where text was expected. `pnpm people` holds every code the game can
 * write to it.
 */
export const LOOK_PATTERN = /^[0-9a-z]{1,24}$/;

/** A look as the relay keeps it, or `''` for none — whatever it was sent. */
export function cleanLook(raw: unknown): string {
  return typeof raw === 'string' && LOOK_PATTERN.test(raw) ? raw : '';
}

// ---------------------------------------------------------------------------
// The chat
// ---------------------------------------------------------------------------
//
// One definition for both ends: the game cleans and paces a line with these
// before it sends it, so what the field shows is what everybody else will
// read, and the relay cleans and paces it again, because a client is only a
// client's word. `scripts/check-chat.ts` holds both to them.

/** The longest line, in characters (code points, so an emoji is one). */
export const CHAT_MAX = 200;

/** One line refills every this many milliseconds… */
export const CHAT_INTERVAL_MS = 1_500;

/** …up to this many in hand: three quick lines, then one each interval. */
export const CHAT_BURST = 3;

/** How many lines the room keeps for whoever joins next. */
export const CHAT_HISTORY = 50;

/**
 * What nobody types: control characters, unpaired surrogates, private-use
 * code points (not the unassigned: an engine with an older table would
 * strip an emoji newer than it), the bidirectional overrides and isolates
 * that turn the rest of a line — or the next one — backwards, zero-width
 * spaces and the line and paragraph separators. The zero-width joiner stays:
 * the family and flag emoji are built with it.
 */
const UNPRINTABLE = /[\p{Cc}\p{Cs}\p{Co}\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\u2028\u2029\uFEFF]/gu;

/** A web address, with its scheme or its `www.`, which a line carries as `[link]`. */
const LINK = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/giu;

/**
 * A line as it is sent and shown, or `''` for nothing worth sending: one line,
 * printable, no link, runs of spaces made one, at most `CHAT_MAX` characters.
 * The text is never markup — the game writes it with `textContent` — so angle
 * brackets are kept: `<3` is a heart, not a tag.
 */
export function cleanChat(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw
    .replace(/[\t\n\r\v\f]+/g, ' ')
    .replace(UNPRINTABLE, '')
    .replace(LINK, '[link]')
    .replace(/\s+/gu, ' ')
    .trim();
  const points = Array.from(text);
  return points.length <= CHAT_MAX ? text : points.slice(0, CHAT_MAX).join('').trimEnd();
}

/** The outline code of the country a line was sent from (`Country.iso`), or `''` at sea. */
export const COUNTRY_PATTERN = /^[A-Z0-9]{2,3}$/;

export function cleanCountry(raw: unknown): string {
  return typeof raw === 'string' && COUNTRY_PATTERN.test(raw) ? raw : '';
}

/** The gestures a player can make where others see them, as the wire names them. */
export const EMOTES = ['wave', 'dance', 'sit'] as const;
export type Emote = (typeof EMOTES)[number];

export function cleanEmote(raw: unknown): Emote | '' {
  return typeof raw === 'string' && (EMOTES as readonly string[]).includes(raw) ? (raw as Emote) : '';
}

/** Between two gestures by one player. */
export const EMOTE_INTERVAL_MS = 1_000;

/**
 * The horns a driver can sound where others hear them, as the wire names
 * them: a car's two tones, a bus's deep one, a motorbike's beep, a bicycle's
 * bell, a tuk-tuk's rubber bulb, a boat's horn and a horse's whinny. Which
 * kind sounds which is `HORN_OF` in `src/craft/contract.ts`.
 */
export const HONKS = ['car', 'bus', 'beep', 'bell', 'squeak', 'ship', 'whinny'] as const;
export type Honk = (typeof HONKS)[number];

export function cleanHonk(raw: unknown): Honk | '' {
  return typeof raw === 'string' && (HONKS as readonly string[]).includes(raw) ? (raw as Honk) : '';
}

/**
 * Between two horns by one player: a tap and a second tap, not a stuck key.
 * A held horn's refresh (`HONK_REFRESH_MS`) is paced by the same interval,
 * and a stop is never paced.
 */
export const HONK_INTERVAL_MS = 350;

/**
 * A horn is held as long as its key is: `{ t: 'honk', k, on: true }` when
 * the key goes down, again every `HONK_REFRESH_MS` while it stays down, and
 * `{ t: 'honk', k, on: false }` when it comes up. A peer that hears nothing
 * for `HONK_HOLD_MS` lets the horn go by itself, so a stop lost on the way,
 * or a player who closes the page with the key held, never leaves one stuck.
 * `HONK_HOLD_MS` is two and a half refreshes: one late refresh is not a gap.
 */
export const HONK_REFRESH_MS = 1_000;
export const HONK_HOLD_MS = 2_500;
/**
 * How long a horn with no `on` sounds, the shape an older client sends: a
 * tap, about what the one-shot it expected lasted.
 */
export const HONK_TAP_MS = 350;

/** What `on` a honk carries: held (`true`), let go (`false`), a tap (`undefined`), or `null` for nonsense. */
export function cleanHonkOn(raw: unknown): boolean | undefined | null {
  if (raw === undefined) return undefined;
  return typeof raw === 'boolean' ? raw : null;
}

/** One player's horn as the pacing sees it: when a start last went, and whether it is held. */
export interface HonkState {
  at: number;
  on: boolean;
}

export const freshHonk = (): HonkState => ({ at: -Infinity, on: false });

/**
 * Whether a honk may go now, and the state after it. A start, a refresh or a
 * tap is paced by `HONK_INTERVAL_MS`; a stop goes whenever a start went
 * before it and nothing stopped it since, and never otherwise. The relay
 * passes on what this allows and the game sends only what it would, so the
 * two agree without a word about it.
 */
export function spendHonk(state: HonkState, on: boolean | undefined, now: number): boolean {
  if (on === false) {
    if (!state.on) return false;
    state.on = false;
    return true;
  }
  if (now - state.at < HONK_INTERVAL_MS) return false;
  state.at = now;
  state.on = on === true;
  return true;
}

/**
 * What a player is doing that the nine numbers of a state do not say, as
 * bits of one small integer, by their index here: under an open canopy after
 * jumping out of an aircraft, and sitting on a bench. Kept by the relay, so a
 * player who joins later sees them too, which a gesture (`EMOTES`) is not.
 * Anything else a peer is drawn doing is read off the state itself: a
 * rider's horse leaps when its driver's state is off the ground, and a
 * swimmer under the water's surface is diving.
 */
export const FLAGS = ['chute', 'sitting'] as const;
export type Flag = (typeof FLAGS)[number];

/** The flags as sent, or -1 for anything that is not an integer of those bits. */
export function cleanFlags(raw: unknown): number {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < 1 << FLAGS.length ? (raw as number) : -1;
}

/** Whether `flags` has `flag` set. */
export const hasFlag = (flags: number, flag: Flag): boolean => (flags & (1 << FLAGS.indexOf(flag))) !== 0;

/** Between two changes of flags by one player: a canopy opening and a landing are seconds apart. */
export const FLAGS_INTERVAL_MS = 200;

/** A sender's allowance: lines in hand, and when it was last topped up. */
export interface ChatBucket {
  tokens: number;
  at: number;
}

export const freshBucket = (): ChatBucket => ({ tokens: CHAT_BURST, at: 0 });

/**
 * Whether a line may go at `now`, spending it if so. The allowance refills
 * one line each `CHAT_INTERVAL_MS` up to `CHAT_BURST`; a clock that went
 * backwards refills nothing.
 */
export function spendChat(bucket: ChatBucket, now: number): boolean {
  const earned = bucket.at === 0 ? CHAT_BURST : Math.max(0, now - bucket.at) / CHAT_INTERVAL_MS;
  bucket.tokens = Math.min(CHAT_BURST, bucket.tokens + earned);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

/** How long until `bucket` has a line to spend, in milliseconds; 0 if it has one now. */
export function chatWait(bucket: ChatBucket, now: number): number {
  const earned = bucket.at === 0 ? CHAT_BURST : Math.max(0, now - bucket.at) / CHAT_INTERVAL_MS;
  const tokens = Math.min(CHAT_BURST, bucket.tokens + earned);
  return tokens >= 1 ? 0 : Math.ceil((1 - tokens) * CHAT_INTERVAL_MS);
}
