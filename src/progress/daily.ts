/**
 * The daily commissions: three a real UTC day, the same three for every
 * traveller, as a pure function of the day's number (drawn from
 * `TEMPLATES`, no two of one kind, sized so the three take `DAY_MINUTES`
 * between them). They count from the moment the day turns, with nothing to
 * take; a day with all three done joins the history, and the history's
 * runs of consecutive days are the streaks.
 *
 * A day is counted as the jobs board counts it (`jobDay`): milliseconds
 * since the epoch over a day, floored, so both turn over at the same moment.
 *
 * The state merges like the rest: the later day's progress wins, the same
 * day's is the further of each cell; the history is a union (the newest
 * `MAX_HISTORY` kept) and the longest streak the larger.
 */
import { rngFrom } from '../scenery/random.ts';
import { DAILY_BONUS, TEMPLATES, XP_PER_MINUTE, templateById } from './commissions.ts';
import type { CommissionKind, Template } from './commissions.ts';
import type { ProgressEvent } from './events.ts';
import { CELL_CAP, DAY_CAP, cellMax, cells, dayNumber, days, floored, newest, objectOf } from './lenient.ts';

export const DAY_MS = 86_400_000;

/** The real day `ms` falls in, counted from the epoch, UTC. */
export const dayOf = (ms: number): number => Math.floor(ms / DAY_MS);

export const DAILY_COUNT = 3;
/** How many minutes a day's three may take between them. */
export const DAY_MINUTES: readonly [number, number] = [18, 40];
/** The most days with all three done the history keeps. */
export const MAX_HISTORY = 1000;
/** How many draws a day tries for three inside `DAY_MINUTES` before it keeps the nearest. */
const DRAWS = 64;

export interface Commission {
  /** `<day>:<index>`. */
  id: string;
  index: number;
  /** The template it was drawn from. */
  template: string;
  kind: CommissionKind;
  /** "Fly 50 km". */
  title: string;
  target: number;
  mode: 'sum' | 'reach';
  minutes: number;
  xp: number;
}

export interface DailyState {
  /** The day `progress` counts for; 0 before the first. */
  day: number;
  /** Each of that day's commissions' progress, in order. */
  progress: number[];
  /** Days with all three done. */
  history: Set<number>;
  /** The longest run of consecutive days in the history, kept even once the history has let them go. */
  longest: number;
}

export function emptyDaily(): DailyState {
  return { day: 0, progress: [], history: new Set(), longest: 0 };
}

const drawn = new Map<number, readonly Commission[]>();

function minutesOf(picks: readonly (readonly [Template, readonly [number, number]])[]): number {
  return picks.reduce((sum, [, size]) => sum + size[1], 0);
}

/** A day's three commissions: the same for every traveller. */
export function commissionsOf(day: number): readonly Commission[] {
  const known = drawn.get(day);
  if (known !== undefined) return known;
  const rng = rngFrom('commissions', day);
  let best: (readonly [Template, readonly [number, number]])[] = [];
  let bestMiss = Infinity;
  for (let attempt = 0; attempt < DRAWS && bestMiss > 0; attempt++) {
    const picks: (readonly [Template, readonly [number, number]])[] = [];
    const kinds = new Set<CommissionKind>();
    while (picks.length < DAILY_COUNT) {
      const pool = TEMPLATES.filter((t) => !kinds.has(t.kind));
      const template = rng.weighted(pool.map((item) => ({ item, weight: item.weight })));
      kinds.add(template.kind);
      picks.push([template, template.sizes[rng.int(template.sizes.length)]!]);
    }
    const minutes = minutesOf(picks);
    const miss = Math.max(0, DAY_MINUTES[0] - minutes, minutes - DAY_MINUTES[1]);
    if (miss < bestMiss) {
      best = picks;
      bestMiss = miss;
    }
  }
  const list = best.map(([template, [target, minutes]], index): Commission => ({
    id: `${day}:${index}`,
    index,
    template: template.id,
    kind: template.kind,
    title: template.title(target),
    target,
    mode: template.mode,
    minutes,
    xp: minutes * XP_PER_MINUTE,
  }));
  if (drawn.size > 8) drawn.clear();
  drawn.set(day, list);
  return list;
}

/** Which of the state's day's commissions are done. */
export function doneOf(state: DailyState): boolean[] {
  return commissionsOf(state.day).map((c, i) => (state.progress[i] ?? 0) >= c.target);
}

/** The state moved on to `day`, if that is later than its own; the same state otherwise. */
export function rollDaily(state: DailyState, day: number): DailyState {
  return day > state.day ? { day, progress: [], history: new Set(state.history), longest: state.longest } : state;
}

/** The run of consecutive days in `history` that ends on `day`. */
function runEnding(history: ReadonlySet<number>, day: number): number {
  let run = 0;
  while (history.has(day - run)) run++;
  return run;
}

/** The current streak (ending today, or yesterday while today is still open) and the longest. */
export function streakOf(state: DailyState, today: number): { current: number; longest: number } {
  const current = state.history.has(today) ? runEnding(state.history, today) : runEnding(state.history, today - 1);
  let longest = state.longest;
  let run = 0;
  let previous = -2;
  for (const day of [...state.history].sort((a, b) => a - b)) {
    run = day === previous + 1 ? run + 1 : 1;
    previous = day;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}

export interface DailyStep {
  state: DailyState;
  /** The commissions this event finished. */
  done: Commission[];
  /** Whether it finished the third. */
  all: boolean;
  /** The XP it earned, the bonus included. */
  xp: number;
}

/** What one event on `day` moves. Pure: the same state comes back when nothing moved. */
export function advanceDaily(state: DailyState, event: ProgressEvent, day: number): DailyStep {
  const rolled = rollDaily(state, day);
  const unmoved: DailyStep = { state: rolled, done: [], all: false, xp: 0 };
  if (rolled.day !== day) return unmoved;
  const list = commissionsOf(day);
  let progress: number[] | null = null;
  const done: Commission[] = [];
  for (const commission of list) {
    const have = rolled.progress[commission.index] ?? 0;
    if (have >= commission.target) continue;
    const amount = templateById(commission.template)?.amount(event) ?? 0;
    if (!(amount > 0)) continue;
    const now = commission.mode === 'sum' ? have + amount : Math.max(have, amount);
    if (now <= have) continue;
    progress ??= list.map((_, i) => rolled.progress[i] ?? 0);
    progress[commission.index] = Math.min(CELL_CAP, now);
    if (now >= commission.target) done.push(commission);
  }
  if (progress === null) return unmoved;
  const cellsNow: readonly number[] = progress;
  const next: DailyState = { day, progress, history: rolled.history, longest: rolled.longest };
  let xp = done.reduce((sum, c) => sum + c.xp, 0);
  const all = done.length > 0 && list.every((c, i) => (cellsNow[i] ?? 0) >= c.target);
  if (all) {
    next.history = new Set(newest([...rolled.history, day], MAX_HISTORY));
    next.longest = Math.max(rolled.longest, runEnding(next.history, day));
    xp += DAILY_BONUS;
  }
  return { state: next, done, all, xp };
}

export function mergeDaily(a: DailyState, b: DailyState): DailyState {
  const day = Math.max(a.day, b.day);
  const progress = a.day === b.day ? cellMax(a.progress, b.progress) : [...(a.day > b.day ? a.progress : b.progress)];
  return {
    day,
    progress,
    history: new Set(newest([...a.history, ...b.history], MAX_HISTORY)),
    longest: Math.max(a.longest, b.longest),
  };
}

/** A state from a stored document, whatever of it can be vouched for. */
export function dailyOf(raw: unknown): DailyState {
  const value = objectOf(raw) ?? {};
  return {
    day: dayNumber(value.day, 0) ?? 0,
    progress: cells(value.progress),
    history: new Set(newest(days(value.history), MAX_HISTORY)),
    longest: floored(value.longest, DAY_CAP) ?? 0,
  };
}

export interface DailyDocument {
  day: number;
  progress: number[];
  history: number[];
  longest: number;
}

export function dailyDocument(state: DailyState): DailyDocument {
  return {
    day: state.day,
    progress: cells(state.progress.map((cell) => floored(cell, CELL_CAP) ?? 0)),
    history: newest(state.history, MAX_HISTORY),
    longest: floored(state.longest, DAY_CAP) ?? 0,
  };
}
