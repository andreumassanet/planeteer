/**
 * The traveller's career in numbers: counters that only grow (metres by how
 * they moved, jumps, conversations, boardings, medals, jobs by kind...),
 * maxima (the deepest dive, the highest climb, the top speed), small sets
 * (the kinds of vehicle taken, the worlds stood on, the people talked to,
 * the guild's people met, the topics read) and the real days played.
 *
 * Every part merges by a law that loses nothing and is order-free: a counter
 * or a maximum by the larger, a set by the union (the first `MAX_SET_ITEMS`
 * in code-unit order kept), the days by the union (the newest `MAX_DAYS`
 * kept). Two devices that both walked count the longer walk, not the sum.
 */
import { MOVE_MODES } from './events.ts';
import type { ProgressEvent } from './events.ts';
import {
  COUNT_CAP, ITEM, KEY, byCode, days as dayList, floored, newest, objectOf, smallest, strings,
} from './lenient.ts';
import { seedOf } from '../scenery/random.ts';

export interface Stats {
  /** Counters and maxima by key; metres may carry a fraction until stored. */
  counts: Map<string, number>;
  /** Small sets by name. */
  sets: Map<string, Set<string>>;
  /** The real UTC days played, as day numbers (`dayOf`). */
  days: Set<number>;
}

/** The most counters, sets, items in one set and days a record keeps. */
export const MAX_COUNTS = 128;
export const MAX_SETS = 16;
export const MAX_SET_ITEMS = 400;
export const MAX_DAYS = 1000;

/** The most one `move` event counts, metres: a teleport is not a walk. */
export const MAX_STEP_METRES = 50_000;
/** The most a maximum may claim: deeper than any sea, higher than a rocket's arc, faster than one. */
export const MAXIMUM_CAPS = { depth: 11_000, altitude: 1e7, speed: 1e6 } as const;
/** The most reputation one job may add to the counter. */
const MAX_JOB_POINTS = 100;

/** The counters' keys besides the nine `MoveMode`s, which count metres. */
export type CountKey =
  | 'jumps' | 'talks' | 'boardings' | 'rings' | 'courses' | 'course-gold' | 'course-silver' | 'course-bronze'
  | 'job-errand' | 'job-taxi' | 'job-cargo' | 'job-rescue' | 'job-points' | 'stamps' | 'towns' | 'visits'
  | 'rockets' | 'world-visits' | 'photos' | 'emotes' | 'honks' | 'sits' | 'chats' | 'maps' | 'parachutes'
  | 'guild-visits' | 'npc-talks' | 'topic-reads' | 'looks' | 'destinations' | 'arrivals'
  | 'commissions' | 'daily-xp' | 'depth' | 'altitude' | 'speed';

/** The sets' names. */
export type SetName = 'people' | 'kinds' | 'worlds' | 'emotes' | 'roles' | 'topics' | 'guilds' | 'postcards';

export function emptyStats(): Stats {
  return { counts: new Map(), sets: new Map(), days: new Set() };
}

export const countOf = (stats: Stats, key: string): number => stats.counts.get(key) ?? 0;
export const sizeOf = (stats: Stats, name: SetName): number => stats.sets.get(name)?.size ?? 0;
export const hasIn = (stats: Stats, name: SetName, item: string): boolean => stats.sets.get(name)?.has(item) === true;

/** Adds to a counter. */
export function bump(stats: Stats, key: string, by = 1): void {
  if (!(by > 0) || !Number.isFinite(by)) return;
  stats.counts.set(key, Math.min(COUNT_CAP, countOf(stats, key) + by));
}

/** Raises a maximum. */
export function raise(stats: Stats, key: 'depth' | 'altitude' | 'speed', value: number): void {
  if (!(value > 0) || !Number.isFinite(value)) return;
  const kept = Math.min(MAXIMUM_CAPS[key], value);
  if (kept > countOf(stats, key)) stats.counts.set(key, kept);
}

/** Adds to a set, keeping its cap. */
export function addTo(stats: Stats, name: SetName, item: string): void {
  if (typeof item !== 'string' || !ITEM.test(item)) return;
  let set = stats.sets.get(name);
  if (set === undefined) stats.sets.set(name, (set = new Set()));
  if (set.has(item)) return;
  set.add(item);
  if (set.size > MAX_SET_ITEMS) stats.sets.set(name, new Set(smallest(set, MAX_SET_ITEMS)));
}

/** Adds a day played, keeping the newest. */
export function addDay(stats: Stats, day: number): void {
  if (!Number.isInteger(day) || day < 1 || stats.days.has(day)) return;
  stats.days.add(day);
  if (stats.days.size > MAX_DAYS) stats.days = new Set(newest(stats.days, MAX_DAYS));
}

/** A free-form key as a short token a set may hold: a person's key, a guild's place. */
export const tokenOf = (kind: string, key: string): string => (seedOf(kind, key) >>> 0).toString(36);

const MEDAL_KEY = ['', 'course-bronze', 'course-silver', 'course-gold'] as const;

/**
 * What one event adds to the stats, in place; `day`, when given, is marked
 * played. Anything implausible (a negative distance, an unknown mode, an
 * id no set may hold) adds nothing.
 */
export function applyEvent(stats: Stats, event: ProgressEvent, day?: number): Stats {
  if (day !== undefined) addDay(stats, day);
  switch (event.t) {
    case 'move':
      if (MOVE_MODES.includes(event.mode) && Number.isFinite(event.metres)) bump(stats, event.mode, Math.min(MAX_STEP_METRES, event.metres));
      break;
    case 'jump': bump(stats, 'jumps'); break;
    case 'talk':
      bump(stats, 'talks');
      if (typeof event.key === 'string' && event.key !== '') addTo(stats, 'people', tokenOf('person', event.key));
      break;
    case 'board':
      bump(stats, 'boardings');
      addTo(stats, 'kinds', event.kind);
      break;
    case 'ring': bump(stats, 'rings'); break;
    case 'course':
      bump(stats, 'courses');
      if (event.medal === 1 || event.medal === 2 || event.medal === 3) bump(stats, MEDAL_KEY[event.medal]);
      break;
    case 'job':
      if (event.kind === 'errand' || event.kind === 'taxi' || event.kind === 'cargo' || event.kind === 'rescue') {
        bump(stats, `job-${event.kind}`);
        bump(stats, 'job-points', Math.min(MAX_JOB_POINTS, event.points));
      }
      break;
    case 'stamp': bump(stats, 'stamps'); break;
    case 'town': bump(stats, 'towns'); break;
    case 'visit': bump(stats, 'visits'); break;
    case 'depth': raise(stats, 'depth', event.metres); break;
    case 'altitude': raise(stats, 'altitude', event.metres); break;
    case 'speed': raise(stats, 'speed', event.kmh); break;
    case 'rocket': bump(stats, 'rockets'); break;
    case 'world':
      if (typeof event.id === 'string' && event.id !== 'earth' && ITEM.test(event.id)) {
        bump(stats, 'world-visits');
        addTo(stats, 'worlds', event.id);
      }
      break;
    case 'photo': bump(stats, 'photos'); break;
    case 'postcard':
      if (typeof event.landmark === 'string' && /^[a-z0-9-]{1,40}$/.test(event.landmark)) addTo(stats, 'postcards', event.landmark);
      break;
    case 'emote':
      bump(stats, 'emotes');
      addTo(stats, 'emotes', event.e);
      break;
    case 'honk': bump(stats, 'honks'); break;
    case 'sit': bump(stats, 'sits'); break;
    case 'chat': bump(stats, 'chats'); break;
    case 'map': bump(stats, 'maps'); break;
    case 'parachute': bump(stats, 'parachutes'); break;
    case 'guild':
      bump(stats, 'guild-visits');
      if (typeof event.place === 'string' && event.place !== '') addTo(stats, 'guilds', tokenOf('guild', event.place));
      break;
    case 'npc':
      bump(stats, 'npc-talks');
      addTo(stats, 'roles', event.role);
      break;
    case 'topic':
      bump(stats, 'topic-reads');
      addTo(stats, 'topics', event.id);
      break;
    case 'look': bump(stats, 'looks'); break;
    case 'destination': bump(stats, 'destinations'); break;
    case 'arrive': bump(stats, 'arrivals'); break;
  }
  return stats;
}

/** The counters, the first `MAX_COUNTS` keys kept. */
function cappedCounts(counts: Map<string, number>): Map<string, number> {
  if (counts.size <= MAX_COUNTS) return counts;
  return new Map([...counts].sort((a, b) => byCode(a[0], b[0])).slice(0, MAX_COUNTS));
}

/** The sets with at least one item, each and their number capped. */
function cappedSets(sets: Map<string, Set<string>>): Map<string, Set<string>> {
  const kept = new Map<string, Set<string>>();
  for (const name of [...sets.keys()].filter((n) => (sets.get(n)?.size ?? 0) > 0).sort(byCode).slice(0, MAX_SETS)) {
    const set = sets.get(name)!;
    kept.set(name, set.size > MAX_SET_ITEMS ? new Set(smallest(set, MAX_SET_ITEMS)) : new Set(set));
  }
  return kept;
}

/** Two stats as one: each counter and maximum the larger, each set and the days the union. */
export function mergeStats(a: Stats, b: Stats): Stats {
  const counts = new Map(a.counts);
  for (const [key, value] of b.counts) counts.set(key, Math.max(value, counts.get(key) ?? 0));
  const sets = new Map<string, Set<string>>();
  for (const name of new Set([...a.sets.keys(), ...b.sets.keys()])) {
    sets.set(name, new Set([...(a.sets.get(name) ?? []), ...(b.sets.get(name) ?? [])]));
  }
  return { counts: cappedCounts(counts), sets: cappedSets(sets), days: new Set(newest([...a.days, ...b.days], MAX_DAYS)) };
}

/** Stats from a stored document, whatever of it can be vouched for. */
export function statsOf(raw: unknown): Stats {
  const stats = emptyStats();
  const value = objectOf(raw);
  if (value === null) return stats;
  for (const [key, count] of Object.entries(objectOf(value.counts) ?? {})) {
    const n = floored(count, COUNT_CAP);
    if (KEY.test(key) && n !== null) stats.counts.set(key, n);
  }
  stats.counts = cappedCounts(stats.counts);
  for (const [name, items] of Object.entries(objectOf(value.sets) ?? {})) {
    if (KEY.test(name)) stats.sets.set(name, new Set(strings(items, ITEM)));
  }
  stats.sets = cappedSets(stats.sets);
  stats.days = new Set(newest(dayList(value.days), MAX_DAYS));
  return stats;
}

export interface StatsDocument {
  counts: Record<string, number>;
  sets: Record<string, string[]>;
  days: number[];
}

/** The stats as plain data, every key in order and every count whole: what is stored. */
export function statsDocument(stats: Stats): StatsDocument {
  const counts: Record<string, number> = {};
  for (const [key, value] of [...cappedCounts(stats.counts)].sort((x, y) => byCode(x[0], y[0]))) {
    counts[key] = floored(value, COUNT_CAP) ?? 0;
  }
  const sets: Record<string, string[]> = {};
  for (const [name, set] of cappedSets(stats.sets)) sets[name] = smallest(set, MAX_SET_ITEMS);
  return { counts, sets, days: newest(stats.days, MAX_DAYS) };
}
