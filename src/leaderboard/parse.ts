/**
 * What the boards answer, read as what can be vouched for. The rows are
 * other players' to write, so nothing in them is trusted: a name is text and
 * only ever drawn as text, a number out of its range drops its row, and an
 * answer that is not a list is an empty one.
 */
import { LEVEL_MAX, SCORE_MAX } from './boards.ts';

/** A row of a board. */
export interface BoardRow {
  /** 1 for the first; a tie shares its rank. */
  rank: number;
  name: string;
  /** The traveller's wire code, or `''`. */
  look: string;
  level: number;
  score: number;
  /** The signed-in player's own row. */
  me: boolean;
}

/** Where the signed-in player stands on a board. */
export interface Standing {
  /** Null while hidden, without a name, or with nothing scored there. */
  rank: number | null;
  /** How many are on the board. */
  total: number;
  score: number;
  /** Whether the player shows on the boards at all. */
  listed: boolean;
  /** The account's name, `''` for none. */
  name: string;
}

/** A best time round a course. */
export interface CourseRow {
  rank: number;
  name: string;
  look: string;
  ms: number;
  /** 3 gold, 2 silver, 1 bronze. */
  medal: number;
  /** The signed-in player's own time. */
  me: boolean;
}

/** The most rows an answer is read for. */
export const ROWS_MAX = 100;
/** The longest a name is shown: what an account may hold. */
const NAME_MAX = 20;
/** The longest a course time counts, ms: a day. */
export const TIME_MAX = 86_400_000;

/** Controls, zero-width marks and the bidirectional overrides: nothing a name is drawn with. */
const UNSEEN: readonly (readonly [number, number])[] = [
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200f],
  [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb],
];
const seen = (char: string): boolean => {
  const code = char.codePointAt(0) ?? 0;
  return !UNSEEN.some(([from, to]) => code >= from && code <= to);
};
const LOOK = /^[0-9a-z]{1,24}$/;

/** A name as plain text, cleaned of what cannot be seen and cut to an account's length; `''` for none. */
export function nameOf(value: unknown): string {
  if (typeof value !== 'string') return '';
  const clean = Array.from(value.slice(0, 400).replace(/\s+/g, ' ')).filter(seen).join('').replace(/ {2,}/g, ' ').trim();
  return Array.from(clean).slice(0, NAME_MAX).join('').trim();
}

export const lookOf = (value: unknown): string => (typeof value === 'string' && LOOK.test(value) ? value : '');

/** A number from JSON, or from a numeric string (Postgres' `numeric` may come as one); NaN otherwise. */
function numberOf(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^-?\d{1,16}(\.\d{1,9})?$/.test(value.trim())) return Number(value);
  return Number.NaN;
}

/** A whole number in `[min, max]`, or null. */
function whole(value: unknown, min: number, max: number): number | null {
  const n = numberOf(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.floor(n);
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const list = (body: unknown): unknown[] => (Array.isArray(body) ? body.slice(0, ROWS_MAX) : []);

/** A board's rows; `from` is the rank a row with none takes before its position. */
export function parseBoard(body: unknown, from = 0): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const [index, raw] of list(body).entries()) {
    const row = record(raw);
    if (row === null) continue;
    const name = nameOf(row.name);
    const score = whole(row.score, 0, SCORE_MAX);
    if (name === '' || score === null) continue;
    rows.push({
      rank: whole(row.rank, 1, 1e9) ?? from + index + 1,
      name,
      look: lookOf(row.look),
      level: whole(row.level, 0, LEVEL_MAX) ?? 0,
      score,
      me: false,
    });
  }
  return rows;
}

/** The player's standing, from `leaderboard_me`'s one row; null for an answer that is not one. The name is the caller's to fill. */
export function parseStanding(body: unknown, name = ''): Standing | null {
  const row = record(Array.isArray(body) ? body[0] : body);
  if (row === null) return null;
  const total = whole(row.total, 0, 1e9);
  if (total === null) return null;
  const rank = row.rank === null || row.rank === undefined ? null : whole(row.rank, 1, 1e9);
  return {
    rank: rank !== null && rank <= total ? rank : null,
    total,
    score: whole(row.score, 0, SCORE_MAX) ?? 0,
    listed: typeof row.listed === 'boolean' ? row.listed : rank !== null,
    name: nameOf(name),
  };
}

/** A course's best times. */
export function parseCourse(body: unknown): CourseRow[] {
  const rows: CourseRow[] = [];
  for (const [index, raw] of list(body).entries()) {
    const row = record(raw);
    if (row === null) continue;
    const name = nameOf(row.name);
    const ms = numberOf(row.ms);
    const medal = numberOf(row.medal);
    if (name === '' || !Number.isFinite(ms) || ms <= 0 || ms > TIME_MAX) continue;
    if (medal !== 1 && medal !== 2 && medal !== 3) continue;
    rows.push({ rank: whole(row.rank, 1, 1e9) ?? index + 1, name, look: lookOf(row.look), ms: Math.round(ms), medal, me: false });
  }
  return rows;
}
