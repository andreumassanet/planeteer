/**
 * Bounds the relay enforces: positions, speeds, how far a driven vehicle may
 * move between poses, and what a chat line, gesture, horn or flag may be.
 *
 * The relay is bundled on its own and cannot import the game, so the game
 * constants it bounds are restated here, loosely, as bounds rather than
 * copies. `scripts/check-world.ts` fails if the game outgrows any of them.
 * No imports: the checks load this under Node and the Worker bundles it.
 */

/** `NOMINAL_RADIUS` and `WORLD_SCALE` in `src/globe/planet.ts`. */
export const NOMINAL_RADIUS = 16_000;
export const WORLD_SCALE = 2;
/** `PLANET_RADIUS` in `src/globe.ts`. */
export const PLANET_RADIUS = NOMINAL_RADIUS * WORLD_SCALE;

/** Below the lowest sea floor. */
export const MIN_RADIUS = PLANET_RADIUS - 1_000;

/**
 * How far above a world's surface anything may be: a loose bound, many times
 * the plane's ceiling altitude, written at the nominal radius so the other
 * worlds' shells do not move with Earth's size.
 */
export const AIR_ALLOWANCE = 2 * (NOMINAL_RADIUS * 1.45);

/** Above anything that flies. Bounds players and vehicles alike. */
export const MAX_RADIUS = PLANET_RADIUS + AIR_ALLOWANCE;

// ---------------------------------------------------------------------------
// Worlds: one room per world; a state is bounded by its world's shell.
// ---------------------------------------------------------------------------

/**
 * Every world the relay keeps a room for, and its walkable radius in units
 * (`surfaceRadiusOf` in `src/system/contract.ts`, rounded; a giant's is its
 * one-bar cloud deck). `scripts/check-relay.ts` holds these to the bodies'
 * files. Players on a world missing here are refused a room.
 */
export const BODY_RADII: Readonly<Record<string, number>> = {
  earth: PLANET_RADIUS,
  mercury: 6_127,
  venus: 15_198,
  moon: 4_363,
  mars: 8_512,
  jupiter: 175_573,
  saturn: 146_243,
  uranus: 63_694,
  neptune: 61_835,
};

/** Short world names for chat lines and the player list: `'Moon'`, not `'The Moon'`. */
export const BODY_NAMES: Readonly<Record<string, string>> = {
  earth: 'Earth',
  mercury: 'Mercury',
  venus: 'Venus',
  moon: 'Moon',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
  uranus: 'Uranus',
  neptune: 'Neptune',
};

/** A world's id as the relay keeps rooms for it: `'earth'` for none, `''` for one it does not know. */
export function cleanBody(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return 'earth';
  return typeof raw === 'string' && Object.hasOwn(BODY_RADII, raw) ? raw : '';
}

/**
 * The radial shell a player or vehicle may occupy on a world. Elsewhere than
 * Earth: a tenth of the radius below the surface, and above it the larger of
 * Earth's allowance and three tenths of the radius (for a giant's sky).
 */
export function shellOf(body: string): { min: number; max: number } {
  if (body === 'earth') return { min: MIN_RADIUS, max: MAX_RADIUS };
  const radius = BODY_RADII[body] ?? PLANET_RADIUS;
  return { min: radius * 0.9, max: radius + Math.max(AIR_ALLOWANCE, radius * 0.3) };
}

/** Units per second; about twice the plane's top speed at its ceiling. */
export const MAX_SPEED = 15_000;

/**
 * How late a pose may arrive relative to the previous one: clients send at
 * most every 100 ms, but networks deliver in bunches.
 */
export const JITTER_MS = 1_000;

/**
 * How far a driven vehicle may have moved in `elapsedMs` since its last known
 * pose: `MAX_SPEED` over that time plus the jitter, plus `slack` (the claim's
 * reach). Players may teleport; vehicles may not, since a teleport always ends
 * the ride first. A pose past this is dropped, and because the bound grows
 * with time a client that lost a few poses catches up by itself.
 */
export function driveReach(elapsedMs: number, slack: number): number {
  return slack + (MAX_SPEED * (Math.max(0, elapsedMs) + JITTER_MS)) / 1000;
}

/**
 * A traveller's appearance code as the relay passes it on. `encodeAppearance`
 * in `src/appearance.ts` writes 13 base-36 characters; this is deliberately
 * looser to leave room for future fields. The relay never decodes it; the
 * pattern only keeps markup and long strings out.
 */
export const LOOK_PATTERN = /^[0-9a-z]{1,24}$/;

/** A look as the relay keeps it, or `''` if invalid. */
export function cleanLook(raw: unknown): string {
  return typeof raw === 'string' && LOOK_PATTERN.test(raw) ? raw : '';
}

// ---------------------------------------------------------------------------
// Chat: the game cleans and paces a line before sending it, and the relay
// does the same again on receipt. `scripts/check-chat.ts` tests both ends.
// ---------------------------------------------------------------------------

/** The longest line, in characters (code points, so an emoji is one). */
export const CHAT_MAX = 200;

/** One line refills every this many milliseconds… */
export const CHAT_INTERVAL_MS = 1_500;

/** …up to this many in hand: three quick lines, then one each interval. */
export const CHAT_BURST = 3;

/**
 * The most the network may compress the gap between two lines, ms. The game
 * paces itself this much slower than the relay (same burst), so lines sent
 * `gap` apart arrive at least `gap - CHAT_JITTER_MS` apart, still one full
 * `CHAT_INTERVAL_MS`, and the relay never drops a line the game let through.
 */
export const CHAT_JITTER_MS = 500;
export const CHAT_CLIENT_INTERVAL_MS = CHAT_INTERVAL_MS + CHAT_JITTER_MS;

/** How many lines the room keeps for whoever joins next. */
export const CHAT_HISTORY = 50;

/**
 * Stripped from chat: control characters, unpaired surrogates, private-use
 * code points, bidi overrides and isolates, zero-width spaces and line and
 * paragraph separators. Unassigned code points are kept (an older engine
 * would strip newer emoji), and so is the zero-width joiner, which emoji use.
 */
const UNPRINTABLE = /[\p{Cc}\p{Cs}\p{Co}\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\u2028\u2029\uFEFF]/gu;

/** A web address, with its scheme or its `www.`, which a line carries as `[link]`. */
const LINK = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/giu;

/**
 * A chat line as sent and shown, or `''` if empty: one line, printable, links
 * replaced, whitespace collapsed, at most `CHAT_MAX` code points. Angle
 * brackets are kept because the game renders with `textContent`.
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

/** A nation on another world, `'<body>:<nation>'` (`keyOf` in `src/system/geography.ts`). */
export const NATION_PATTERN = /^[a-z]+:[a-z0-9-]{1,32}$/;

export function cleanCountry(raw: unknown): string {
  return typeof raw === 'string' && (COUNTRY_PATTERN.test(raw) || NATION_PATTERN.test(raw)) ? raw : '';
}

/** The gestures a player can make where others see them, as the wire names them. */
export const EMOTES = ['wave', 'dance', 'sit'] as const;
export type Emote = (typeof EMOTES)[number];

export function cleanEmote(raw: unknown): Emote | '' {
  return typeof raw === 'string' && (EMOTES as readonly string[]).includes(raw) ? (raw as Emote) : '';
}

/** Between two gestures by one player. */
export const EMOTE_INTERVAL_MS = 1_000;

/** Horn sounds as the wire names them; which vehicle uses which is `HORN_OF` in `src/craft/contract.ts`. */
export const HONKS = ['car', 'bus', 'beep', 'bell', 'squeak', 'ship', 'whinny'] as const;
export type Honk = (typeof HONKS)[number];

export function cleanHonk(raw: unknown): Honk | '' {
  return typeof raw === 'string' && (HONKS as readonly string[]).includes(raw) ? (raw as Honk) : '';
}

/** Minimum gap between horn starts (and refreshes) by one player; stops are not paced. */
export const HONK_INTERVAL_MS = 350;

/**
 * A held horn sends `on: true` on key down, again every `HONK_REFRESH_MS`,
 * and `on: false` on key up. A peer releases it after `HONK_HOLD_MS` of
 * silence (two and a half refreshes), so a lost stop never leaves it stuck.
 */
export const HONK_REFRESH_MS = 1_000;
export const HONK_HOLD_MS = 2_500;
/** How long a honk without `on` (an older client's tap) sounds. */
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
 * Whether a honk may go now, updating `state`. Starts, refreshes and taps are
 * paced by `HONK_INTERVAL_MS`; a stop goes only if a start is outstanding.
 * Both the game and the relay use this, so they agree.
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
 * Persistent player conditions the state vector does not carry, as bits by
 * index: under an open parachute, sitting on a bench. Unlike `EMOTES`, the
 * relay keeps them so late joiners see them.
 */
export const FLAGS = ['chute', 'sitting'] as const;
export type Flag = (typeof FLAGS)[number];

/** The flags as sent, or -1 for anything that is not an integer of those bits. */
export function cleanFlags(raw: unknown): number {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < 1 << FLAGS.length ? (raw as number) : -1;
}

/** Whether `flags` has `flag` set. */
export const hasFlag = (flags: number, flag: Flag): boolean => (flags & (1 << FLAGS.indexOf(flag))) !== 0;

/** Minimum gap between flag changes by one player. */
export const FLAGS_INTERVAL_MS = 200;

/** A sender's allowance: lines in hand, and when it was last topped up. */
export interface ChatBucket {
  tokens: number;
  at: number;
}

export const freshBucket = (): ChatBucket => ({ tokens: CHAT_BURST, at: 0 });

/**
 * Whether a line may go at `now`, spending it if so. The bucket refills one
 * line per `interval` up to `CHAT_BURST`; a clock going backwards refills
 * nothing. The relay uses `CHAT_INTERVAL_MS`, the game `CHAT_CLIENT_INTERVAL_MS`.
 */
export function spendChat(bucket: ChatBucket, now: number, interval = CHAT_INTERVAL_MS): boolean {
  const earned = bucket.at === 0 ? CHAT_BURST : Math.max(0, now - bucket.at) / interval;
  bucket.tokens = Math.min(CHAT_BURST, bucket.tokens + earned);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

/** How long until `bucket` has a line to spend at `interval` a line, in milliseconds; 0 if it has one now. */
export function chatWait(bucket: ChatBucket, now: number, interval = CHAT_INTERVAL_MS): number {
  const earned = bucket.at === 0 ? CHAT_BURST : Math.max(0, now - bucket.at) / interval;
  const tokens = Math.min(CHAT_BURST, bucket.tokens + earned);
  return tokens >= 1 ? 0 : Math.ceil((1 - tokens) * interval);
}
