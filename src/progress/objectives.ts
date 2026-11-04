/**
 * The ways a quest's objective counts: one for each event of a type, the
 * metres of a move, or where the traveller stands (a level, a tally, a set's
 * size), which `settle` in `quests.ts` reads whenever the level is worked out.
 */
import type { MoveMode, ProgressEvent } from './events.ts';
import type { Objective, Standing } from './path.ts';
import { MAX_STEP_METRES, sizeOf } from './stats.ts';
import type { SetName } from './stats.ts';
import type { Tally } from './tally.ts';

/** One for each event of type `t` that passes `test`. */
export function each<T extends ProgressEvent['t']>(t: T, test?: (event: Extract<ProgressEvent, { t: T }>) => boolean): (event: ProgressEvent) => number {
  return (event) => (event.t === t && (test === undefined || test(event as Extract<ProgressEvent, { t: T }>)) ? 1 : 0);
}

/** The metres of a move in any of `modes`. */
export function metres(...modes: MoveMode[]): (event: ProgressEvent) => number {
  return (event) => (event.t === 'move' && modes.includes(event.mode) && event.metres > 0 && Number.isFinite(event.metres) ? Math.min(MAX_STEP_METRES, event.metres) : 0);
}

const none = (): number => 0;

/** An objective met by where the traveller stands, not by what they do while it is taken. */
export function standing(label: string, target: number, read: (at: Standing) => number): Objective {
  return { label, target, amount: none, reach: read };
}

/** A count off the tally. */
export const tallied = (key: keyof Tally) => (at: Standing): number => at.summary.tally[key];
/** The size of one of the stats' sets. */
export const setSize = (name: SetName) => (at: Standing): number => sizeOf(at.stats, name);
/** The level. */
export const levelNow = (at: Standing): number => at.summary.level;
/** Every milestone medal won, bronze, silver and gold each one. */
export const medalsNow = (at: Standing): number => at.summary.milestones.reduce((sum, m) => sum + m.tier, 0);
