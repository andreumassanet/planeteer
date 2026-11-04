/**
 * What the device keeps of a traveller's career: the stats, the quests and
 * the daily commissions, as one record under `CAREER_KEY`, and in an
 * account's progress document as `career`. Every read and write is wrapped;
 * a store that refuses keeps the record for the visit.
 *
 * Read leniently (`careerOf`): anything that cannot be vouched for is left
 * out, every collection and string capped, every number clamped, by the
 * rules in `lenient.ts` that `merge_progress` restates. The merge is
 * monotonic, commutative and idempotent, part by part.
 */
import { emptyDaily, dailyDocument, dailyOf, mergeDaily } from './daily.ts';
import type { DailyDocument, DailyState } from './daily.ts';
import { emptyQuests, mergeQuests, questsDocument, questsOf } from './quests.ts';
import type { QuestState, QuestsDocument } from './quests.ts';
import { emptyStats, mergeStats, statsDocument, statsOf } from './stats.ts';
import type { Stats, StatsDocument } from './stats.ts';
import { objectOf } from './lenient.ts';

export const CAREER_KEY = 'atlas.career.v1';

export interface CareerRecord {
  stats: Stats;
  quests: QuestState;
  daily: DailyState;
}

export interface CareerDocument {
  version: 1;
  stats: StatsDocument;
  quests: QuestsDocument;
  daily: DailyDocument;
}

export type CareerStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyCareer(): CareerRecord {
  return { stats: emptyStats(), quests: emptyQuests(), daily: emptyDaily() };
}

/** A record from what was stored, or from an account's document. */
export function careerOf(raw: unknown): CareerRecord {
  const value = objectOf(raw);
  if (value === null) return emptyCareer();
  return { stats: statsOf(value.stats), quests: questsOf(value.quests), daily: dailyOf(value.daily) };
}

export function parseCareer(stored: string | null | undefined): CareerRecord {
  if (typeof stored !== 'string' || stored === '') return emptyCareer();
  try {
    return careerOf(JSON.parse(stored));
  } catch {
    return emptyCareer();
  }
}

/** The record as plain data, every key in order: what is stored and what an account's document carries. */
export function careerDocument(record: CareerRecord): CareerDocument {
  return { version: 1, stats: statsDocument(record.stats), quests: questsDocument(record.quests), daily: dailyDocument(record.daily) };
}

export function serialiseCareer(record: CareerRecord): string {
  return JSON.stringify(careerDocument(record));
}

export function mergeCareers(a: CareerRecord, b: CareerRecord): CareerRecord {
  return { stats: mergeStats(a.stats, b.stats), quests: mergeQuests(a.quests, b.quests), daily: mergeDaily(a.daily, b.daily) };
}

/**
 * A stored record read coarsely: the same string until something worth
 * sending has changed. Counters and progress are taken in steps that grow
 * with them (every one up to 16, then about a fifth at a time), so a walk
 * does not send the account a document every few seconds while a quest
 * taken, a commission done or a new day does at once.
 */
export function careerSignature(stored: string | null | undefined): string {
  const record = parseCareer(stored);
  const doc = careerDocument(record);
  const step = (v: number): number => (v < 16 ? v : 16 + Math.floor(Math.log2(v / 16) * 4));
  return JSON.stringify([
    Object.entries(doc.stats.counts).map(([key, v]) => `${key}:${step(v)}`),
    Object.entries(doc.stats.sets).map(([name, items]) => `${name}:${items.length}`),
    doc.stats.days.length,
    doc.stats.days.at(-1) ?? 0,
    doc.quests.done,
    Object.entries(doc.quests.active).map(([id, cells]) => `${id}:${cells.map(step).join(',')}`),
    doc.daily.day,
    doc.daily.progress.map(step),
    doc.daily.history.length,
    doc.daily.longest,
  ]);
}

export function deviceCareerStore(): CareerStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readCareer(storage: CareerStorage | null): CareerRecord {
  try {
    return parseCareer(storage?.getItem(CAREER_KEY));
  } catch {
    return emptyCareer();
  }
}

/** Writes the record; false when the store refused. */
export function writeCareer(storage: CareerStorage | null, record: CareerRecord): boolean {
  try {
    storage?.setItem(CAREER_KEY, serialiseCareer(record));
    return storage !== null;
  } catch {
    // Full or blocked: the record lasts this visit.
    return false;
  }
}
