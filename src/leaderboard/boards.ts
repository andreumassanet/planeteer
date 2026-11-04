/**
 * The boards the Hall of Fame keeps, and how their numbers are read out:
 * the score's unit, a rank as an ordinal, a standing as a share of the board.
 * Pure: the check reads it headless, and `supabase/schema.sql` lists the
 * same ids (`board_known`).
 */
import type { IconName } from '../ui.ts';

export type BoardId = 'xp' | 'countries' | 'landmarks' | 'golds' | 'reputation' | 'towns';

export interface BoardInfo {
  id: BoardId;
  /** The tab's word. */
  tab: string;
  /** The score's unit, one and many. */
  unit: readonly [string, string];
  icon: IconName;
  /** One line under the tabs: what the board counts. */
  blurb: string;
}

export const BOARDS: readonly BoardInfo[] = [
  { id: 'xp', tab: 'Explorers', unit: ['XP', 'XP'], icon: 'star', blurb: 'The most experience, from every road, ring, job and stamp.' },
  { id: 'countries', tab: 'Countries', unit: ['country', 'countries'], icon: 'flag', blurb: 'The most countries stamped in the passport.' },
  { id: 'landmarks', tab: 'Landmarks', unit: ['landmark', 'landmarks'], icon: 'pin', blurb: 'The most landmarks reached.' },
  { id: 'golds', tab: 'Racers', unit: ['gold', 'golds'], icon: 'trophy', blurb: 'The most gold medals won on the courses.' },
  { id: 'reputation', tab: 'Reputation', unit: ['rep', 'rep'], icon: 'hand', blurb: 'The best name for work done: errands, fares, loads and rescues.' },
  { id: 'towns', tab: 'Towns', unit: ['town', 'towns'], icon: 'walk', blurb: 'The most towns walked into.' },
];

const IDS = new Set<string>(BOARDS.map((board) => board.id));

export const isBoard = (value: unknown): value is BoardId => typeof value === 'string' && IDS.has(value);

export const boardInfo = (id: BoardId): BoardInfo => BOARDS.find((board) => board.id === id)!;

/** A course's key as the rings keep it (`src/rings/store.ts`) and `course_board` accepts. */
export const COURSE_ID = /^[asl]:[a-z0-9-]{1,40}$/;

/** The largest score a board holds (`board_score` in `supabase/schema.sql`). */
export const SCORE_MAX = 1e12;

/** The highest level shown. */
export const LEVEL_MAX = 9999;

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const whole = Math.max(0, Math.floor(n));
  const tens = whole % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][whole % 10] ?? 'th');
  return `${whole.toLocaleString('en')}${suffix}`;
}

/**
 * The share of a board at or above a rank, as a whole percent rounded up and
 * never under 1: the 4th of 100 is in the top 4%, the 1st of 1,000 in the
 * top 1%. Null for a rank or a total that is not one.
 */
export function topPercent(rank: number, total: number): number | null {
  if (!Number.isFinite(rank) || !Number.isFinite(total) || rank < 1 || total < 1) return null;
  return Math.min(100, Math.max(1, Math.ceil((100 * Math.min(rank, total)) / total)));
}

/** A board too small for a share to mean much. */
const FEW = 10;

/**
 * Where a rank stands, in words: *Top 4%* in the top half of a board of ten
 * or more, else *7th of 9*.
 */
export function standingText(rank: number, total: number): string {
  const top = topPercent(rank, total);
  if (top === null) return '';
  if (total >= FEW && top <= 50) return `Top ${top}%`;
  return `${ordinal(rank)} of ${Math.max(rank, total).toLocaleString('en')}`;
}

/** A score as read: 9,800, then 1.2M, 34B, 1T. */
export function scoreText(score: number): string {
  const n = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  if (n < 1e6) return n.toLocaleString('en');
  const [step, mark] = n >= 1e12 ? [1e12, 'T'] : n >= 1e9 ? [1e9, 'B'] : [1e6, 'M'];
  const value = n / step;
  return `${value >= 100 ? Math.floor(value) : Math.floor(value * 10) / 10}${mark}`;
}

/** A score with its unit: *1 country*, *12 countries*, *9,800 XP*. */
export function scoreWithUnit(id: BoardId, score: number): string {
  const [one, many] = boardInfo(id).unit;
  return `${scoreText(score)} ${Math.floor(score) === 1 ? one : many}`;
}
