/**
 * What the book holds of the rings, as data: the landmarks' rings collected,
 * and the course log, each kind's courses run with their best, laid out on
 * pages by the room each line takes. No DOM lives here.
 */
import type { CourseBest } from '../rings/store.ts';

export type RingCourseKind = 'air' | 'land' | 'sea';
export const RING_COURSE_KINDS: readonly RingCourseKind[] = ['air', 'land', 'sea'];

/** What the caller hands the book of the rings (`rings.ts`'s record, read when a page is laid). */
export interface PassportRings {
  /** Every landmark with a ring over it. */
  landmarks: readonly { id: string; name: string; iso: string }[];
  /** The ones flown through, by id. */
  collected: ReadonlySet<string>;
  /** Each course's best, by its key. */
  courses: ReadonlyMap<string, CourseBest>;
  /** How many courses of each kind the planet has. */
  totals: Readonly<Record<RingCourseKind, number>>;
}

export interface LandmarkEntry {
  id: string;
  name: string;
  iso: string;
  got: boolean;
}

/** The landmarks in the book's order: by `rank` of their country (the continents' order), then by name. */
export function landmarkEntries(rings: PassportRings, rank: (iso: string) => number): LandmarkEntry[] {
  return rings.landmarks
    .map((landmark) => ({ id: landmark.id, name: landmark.name, iso: landmark.iso, got: rings.collected.has(landmark.id), rank: rank(landmark.iso) }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map(({ id, name, iso, got }) => ({ id, name, iso, got }));
}

export interface CourseRun {
  key: string;
  title: string;
  ms: number;
  /** 1 bronze, 2 silver, 3 gold. */
  medal: number;
}

export interface CourseSection {
  kind: RingCourseKind;
  /** The courses of this kind on the planet. */
  total: number;
  /** The ones run, best medal first, then by name. */
  runs: CourseRun[];
  /** How many of each medal, by rank: `[_, bronze, silver, gold]`. */
  medals: number[];
}

/** A section a kind, in the book's order, with what has been run of each. */
export function courseSections(rings: PassportRings): CourseSection[] {
  return RING_COURSE_KINDS.map((kind) => {
    const runs: CourseRun[] = [];
    const medals = [0, 0, 0, 0];
    for (const [key, best] of rings.courses) {
      if (best.kind !== kind) continue;
      runs.push({ key, title: best.title, ms: best.ms, medal: best.medal });
      const rank = Math.min(3, Math.max(1, best.medal));
      medals[rank] = (medals[rank] ?? 0) + 1;
    }
    runs.sort((a, b) => b.medal - a.medal || a.title.localeCompare(b.title));
    return { kind, total: Math.max(rings.totals[kind] ?? 0, runs.length), runs, medals };
  });
}

/** A line of the log: a section's heading, a course run, or the word that none of a kind has been yet. */
export type LogLine =
  | { type: 'head'; section: CourseSection }
  | { type: 'run'; kind: RingCourseKind; run: CourseRun }
  | { type: 'none'; kind: RingCourseKind };

/** The room a line takes, in rows; a heading takes more than a course. */
export const LINE_ROOM: Readonly<Record<LogLine['type'], number>> = { head: 1.6, run: 1, none: 1.4 };
/** Rows on the log's first page, under its heading, and on every page after. */
export const LOG_FIRST_ROWS = 11;
export const LOG_ROWS = 14;

/**
 * The log laid on pages: every section's heading and its lines in order,
 * a page filled until the next line would overflow it, and a heading never
 * left alone at the foot of one. Always at least one page.
 */
export function logPages(sections: readonly CourseSection[], firstRows = LOG_FIRST_ROWS, rows = LOG_ROWS): LogLine[][] {
  const lines: LogLine[] = [];
  for (const section of sections) {
    lines.push({ type: 'head', section });
    if (section.runs.length === 0) lines.push({ type: 'none', kind: section.kind });
    for (const run of section.runs) lines.push({ type: 'run', kind: section.kind, run });
  }
  const pages: LogLine[][] = [[]];
  let used = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const room = pages.length === 1 ? firstRows : rows;
    // A heading takes the line after it along, so it never ends a page.
    const needs = LINE_ROOM[line.type] + (line.type === 'head' && i + 1 < lines.length ? LINE_ROOM[lines[i + 1]!.type] : 0);
    if (used > 0 && used + needs > room) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1]!.push(line);
    used += LINE_ROOM[line.type];
  }
  return pages;
}
