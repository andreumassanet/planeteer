/**
 * What the device keeps of the rings: the landmarks' rings collected, and
 * each course's best (its time, its medal, what it is called and of which
 * kind, so the passport can list it without laying it). Every read and write
 * is wrapped; a store that refuses keeps them for the visit.
 */

export const RINGS_KEY = 'atlas.rings.v1';

/** A course's best: the time, ms, the best medal (3 gold, 2 silver, 1 bronze), its title and kind. */
export interface CourseBest {
  ms: number;
  medal: number;
  title: string;
  kind: 'air' | 'sea' | 'land';
}

export interface RingRecord {
  /** Landmark ids whose ring has been flown through. */
  landmarks: Set<string>;
  /** Each course's best by its key (`a:<place>`, `l:<place>`, `s:<sea>`). */
  courses: Map<string, CourseBest>;
}

export type RingStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyRecord(): RingRecord {
  return { landmarks: new Set(), courses: new Map() };
}

const COURSE_KEY = /^[asl]:[a-z0-9-]{1,40}$/;
const KINDS = { a: 'air', s: 'sea', l: 'land' } as const;

/** A stored record, keeping whatever of it can still be vouched for. */
export function parseRecord(stored: string | null | undefined): RingRecord {
  const record = emptyRecord();
  if (typeof stored !== 'string' || stored === '') return record;
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return record;
  }
  if (typeof raw !== 'object' || raw === null) return record;
  const { landmarks, courses } = raw as Record<string, unknown>;
  if (Array.isArray(landmarks)) {
    for (const id of landmarks) if (typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id)) record.landmarks.add(id);
  }
  if (typeof courses === 'object' && courses !== null && !Array.isArray(courses)) {
    for (const [key, value] of Object.entries(courses)) {
      if (!COURSE_KEY.test(key) || typeof value !== 'object' || value === null) continue;
      const { ms, medal, title } = value as Record<string, unknown>;
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) continue;
      if (medal !== 1 && medal !== 2 && medal !== 3) continue;
      const name = typeof title === 'string' && title.trim() !== '' ? title.trim().slice(0, 80) : 'Course';
      record.courses.set(key, { ms: Math.round(ms), medal, title: name, kind: KINDS[key[0] as 'a' | 's' | 'l'] });
    }
  }
  return record;
}

export function serialiseRecord(record: RingRecord): string {
  const courses: Record<string, { ms: number; medal: number; title: string }> = {};
  for (const [key, best] of [...record.courses].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    courses[key] = { ms: best.ms, medal: best.medal, title: best.title };
  }
  return JSON.stringify({ landmarks: [...record.landmarks].sort(), courses });
}

/** The device's store, if the browser will hand it over at all. */
export function deviceStore(): RingStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readRecord(storage: RingStorage | null): RingRecord {
  try {
    return parseRecord(storage?.getItem(RINGS_KEY));
  } catch {
    return emptyRecord();
  }
}

export function writeRecord(storage: RingStorage | null, record: RingRecord): void {
  try {
    storage?.setItem(RINGS_KEY, serialiseRecord(record));
  } catch {
    // Full or blocked: the record lasts this visit.
  }
}

/** A time round a course as `m:ss.s`. */
export function lapText(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100));
  const minutes = Math.floor(tenths / 600);
  const seconds = (tenths % 600) / 10;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}
