/**
 * The rules a stored career is read by, shared by its parts. Each is mirrored
 * one for one by `merge_progress` in `supabase/schema.sql`, so the server's
 * merge and the client's are the same function: the same patterns, the same
 * caps, the same clamps, the same order (code units, as SQL's `collate "C"`).
 * Only a record written by hand can pass a cap; past one, which of its taken
 * quests a merge keeps may differ between the two.
 */

/** A counter's, a set's or a quest's key. */
export const KEY = /^[a-z][a-z0-9-]{0,31}$/;
/** An item of a set. */
export const ITEM = /^[A-Za-z0-9_:.-]{1,40}$/;

/** The largest a counter, a cell of progress and a day number may be. */
export const COUNT_CAP = 1e12;
export const CELL_CAP = 1e9;
export const DAY_CAP = 1e6;
/** The most cells a list of progress keeps. */
export const MAX_CELLS = 8;

/** Code-unit order: what `collate "C"` sorts by. */
export const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A plain object, or null for anything else (an array included). */
export function objectOf(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/** A number floored into [0, cap] (an overflowing one to the cap, as SQL's numeric holds it), or null when it is not one. */
export function floored(raw: unknown, cap: number): number | null {
  return typeof raw === 'number' && !Number.isNaN(raw) ? Math.floor(Math.min(cap, Math.max(0, raw))) : null;
}

/** A whole day number in [min, `DAY_CAP`], or null. */
export function dayNumber(raw: unknown, min: number): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= DAY_CAP ? raw : null;
}

/** The first `cap` of some strings, deduplicated, in code-unit order. */
export function smallest(items: Iterable<string>, cap: number): string[] {
  return [...new Set(items)].sort(byCode).slice(0, cap);
}

/** The newest `cap` of some day numbers, ascending. */
export function newest(days: Iterable<number>, cap: number): number[] {
  return [...new Set(days)].sort((a, b) => b - a).slice(0, cap).reverse();
}

/** Valid strings of an array, the rest dropped. */
export function strings(raw: unknown, pattern: RegExp): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string' && pattern.test(item));
}

/** Valid day numbers of an array, the rest dropped. */
export function days(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const item of raw) {
    const day = dayNumber(item, 1);
    if (day !== null) out.push(day);
  }
  return out;
}

/** A list of progress: its first `MAX_CELLS` entries, each a floored number or 0. */
export function cells(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_CELLS).map((cell) => floored(cell, CELL_CAP) ?? 0);
}

/** Two lists of progress as one: the longer length, the larger of each cell. */
export function cellMax(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(Math.max(a[i] ?? 0, b[i] ?? 0));
  return out;
}
