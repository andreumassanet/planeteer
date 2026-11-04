/**
 * What the device keeps of the jobs: every job finished, by id, with its best
 * time and medal, its kind, its country and its title, so the reputation and
 * the passport's page are worked out from the record alone. Every read and
 * write is wrapped; a store that refuses keeps it for the visit.
 */
import { JOB_KINDS } from './types.ts';
import type { JobDone, JobKind } from './types.ts';
import { pointsFor } from './score.ts';

export const JOBS_KEY = 'atlas.jobs.v1';

/** The most jobs a record keeps, the oldest days going first: about 120 KB of an account's 512 KB document, as `merge_progress` keeps them. */
export const MAX_JOBS = 1500;

export interface JobRecord {
  done: Map<string, JobDone>;
}

export type JobStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyJobs(): JobRecord {
  return { done: new Map() };
}

export const JOB_ID = /^[etcr]:\d{1,6}:[a-z0-9]{1,12}:\d{1,6}$/;
const ISO = /^[A-Z0-9-]{1,8}$/;
const KIND_OF: Readonly<Record<string, JobKind>> = { e: 'errand', t: 'taxi', c: 'cargo', r: 'rescue' };

/** The day a job id was offered on. */
export const dayOfId = (id: string): number => Number(id.slice(id.lastIndexOf(':') + 1));

/** One entry read leniently, or null when it cannot be vouched for. */
function entryOf(id: string, value: unknown): JobDone | null {
  if (!JOB_ID.test(id) || typeof value !== 'object' || value === null) return null;
  const { ms, medal, iso, title } = value as Record<string, unknown>;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0 || ms > 8.64e7) return null;
  if (medal !== 1 && medal !== 2 && medal !== 3) return null;
  if (typeof iso !== 'string' || !ISO.test(iso)) return null;
  const kind = KIND_OF[id[0]!]!;
  const name = typeof title === 'string' && title.trim() !== '' ? title.trim().slice(0, 80) : 'Job';
  return { kind, iso, title: name, ms: Math.round(ms), medal };
}

/** Keeps the newest `MAX_JOBS`, by the day each was offered. */
function capped(record: JobRecord): JobRecord {
  if (record.done.size <= MAX_JOBS) return record;
  const kept = [...record.done].sort((a, b) => dayOfId(b[0]) - dayOfId(a[0]) || (a[0] < b[0] ? -1 : 1)).slice(0, MAX_JOBS);
  return { done: new Map(kept) };
}

/** A record from what was stored, or from an account's document: whatever of it can be vouched for. */
export function recordOf(raw: unknown): JobRecord {
  const record = emptyJobs();
  if (typeof raw !== 'object' || raw === null) return record;
  const done = (raw as Record<string, unknown>).done;
  if (typeof done !== 'object' || done === null || Array.isArray(done)) return record;
  for (const [id, value] of Object.entries(done)) {
    const entry = entryOf(id, value);
    if (entry !== null) record.done.set(id, entry);
  }
  return capped(record);
}

export function parseJobs(stored: string | null | undefined): JobRecord {
  if (typeof stored !== 'string' || stored === '') return emptyJobs();
  try {
    return recordOf(JSON.parse(stored));
  } catch {
    return emptyJobs();
  }
}

/** The record as plain data, ids in order: what is stored and what an account's document carries. */
export function jobsDocument(record: JobRecord): { done: Record<string, { ms: number; medal: number; iso: string; title: string }> } {
  const done: Record<string, { ms: number; medal: number; iso: string; title: string }> = {};
  for (const [id, entry] of [...record.done].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    done[id] = { ms: entry.ms, medal: entry.medal, iso: entry.iso, title: entry.title };
  }
  return { done };
}

export function serialiseJobs(record: JobRecord): string {
  return JSON.stringify(jobsDocument(record));
}

/**
 * Two records as one: every job in either, and for a job in both the faster
 * time and the better medal, each kept on its own. Pure and order-free.
 */
export function mergeJobs(a: JobRecord, b: JobRecord): JobRecord {
  const done = new Map<string, JobDone>();
  for (const id of new Set([...a.done.keys(), ...b.done.keys()])) {
    const x = a.done.get(id);
    const y = b.done.get(id);
    if (x === undefined || y === undefined) {
      done.set(id, { ...(x ?? y)! });
      continue;
    }
    const fast = x.ms < y.ms || (x.ms === y.ms && x.title <= y.title) ? x : y;
    done.set(id, { ...fast, medal: Math.max(x.medal, y.medal) });
  }
  return capped({ done });
}

/** The reputation in each country, and in all of them, and how many jobs of each kind. */
export function reputationOf(record: JobRecord): {
  total: number;
  byCountry: Map<string, number>;
  byKind: Record<JobKind, number>;
  medals: [number, number, number];
} {
  const byCountry = new Map<string, number>();
  const byKind = Object.fromEntries(JOB_KINDS.map((k) => [k, 0])) as Record<JobKind, number>;
  const medals: [number, number, number] = [0, 0, 0];
  let total = 0;
  for (const entry of record.done.values()) {
    const points = pointsFor(entry.kind, entry.medal);
    total += points;
    byCountry.set(entry.iso, (byCountry.get(entry.iso) ?? 0) + points);
    byKind[entry.kind]++;
    medals[entry.medal - 1]!++;
  }
  return { total, byCountry, byKind, medals };
}

export function deviceJobStore(): JobStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readJobs(storage: JobStorage | null): JobRecord {
  try {
    return parseJobs(storage?.getItem(JOBS_KEY));
  } catch {
    return emptyJobs();
  }
}

export function writeJobs(storage: JobStorage | null, record: JobRecord): void {
  try {
    storage?.setItem(JOBS_KEY, serialiseJobs(record));
  } catch {
    // Full or blocked: the record lasts this visit.
  }
}
