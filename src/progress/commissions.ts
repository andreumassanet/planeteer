/**
 * The daily commissions' pool: what a day may ask, each of a kind (no two
 * of one kind in a day), weighted, in one or two sizes with the minutes each
 * takes a traveller who sets out to do it, from finding the vehicle to the
 * last metre. A commission is worth `XP_PER_MINUTE` a minute of it.
 *
 * Everything here is repeatable on any day by anybody: nothing asks for a
 * new ring, a new stamp or a landmark never seen, which a long career runs
 * out of. Towns are the exception the planet affords: there are thousands.
 */
import type { MoveMode, ProgressEvent } from './events.ts';
import { MAX_STEP_METRES } from './stats.ts';

export type CommissionKind = 'foot' | 'road' | 'air' | 'water' | 'course' | 'job' | 'people' | 'explore' | 'camera' | 'vehicles';

export interface Template {
  id: string;
  kind: CommissionKind;
  weight: number;
  /** Each size: the target (metres for a distance, metres or km/h for a height or a speed), and the minutes it takes. */
  sizes: readonly (readonly [number, number])[];
  title(target: number): string;
  /** `sum` adds every event's amount; `reach` keeps the largest. */
  mode: 'sum' | 'reach';
  amount(event: ProgressEvent): number;
}

export const XP_PER_MINUTE = 8;
/** What doing all three in a day adds. */
export const DAILY_BONUS = 150;

/** A distance as a commission says it. */
export const distance = (metres: number): string => (metres >= 1000 ? `${metres / 1000} km` : `${metres} m`);

const each = (test: (event: ProgressEvent) => boolean) => (event: ProgressEvent): number => (test(event) ? 1 : 0);

function metresIn(...modes: MoveMode[]): (event: ProgressEvent) => number {
  return (event) => (event.t === 'move' && modes.includes(event.mode) && event.metres > 0 && Number.isFinite(event.metres) ? Math.min(MAX_STEP_METRES, event.metres) : 0);
}

const job = (kind: string) => each((e) => e.t === 'job' && e.kind === kind);

export const TEMPLATES: readonly Template[] = [
  { id: 'foot', kind: 'foot', weight: 3, sizes: [[2000, 7], [3000, 10]], title: (n) => `Cover ${distance(n)} on foot`, mode: 'sum', amount: metresIn('walk', 'run') },
  { id: 'jumps', kind: 'foot', weight: 1, sizes: [[15, 2], [25, 3]], title: (n) => `Jump ${n} times`, mode: 'sum', amount: each((e) => e.t === 'jump') },
  { id: 'drive', kind: 'road', weight: 3, sizes: [[10000, 8], [15000, 10]], title: (n) => `Drive or ride ${distance(n)}`, mode: 'sum', amount: metresIn('drive', 'ride') },
  { id: 'speed', kind: 'road', weight: 1, sizes: [[150, 6], [220, 9]], title: (n) => `Go faster than ${n} km/h`, mode: 'reach', amount: (e) => (e.t === 'speed' && Number.isFinite(e.kmh) ? e.kmh : 0) },
  { id: 'fly', kind: 'air', weight: 2, sizes: [[50000, 10], [100000, 12]], title: (n) => `Fly ${distance(n)}`, mode: 'sum', amount: metresIn('fly') },
  { id: 'altitude', kind: 'air', weight: 1, sizes: [[1500, 10], [2000, 12]], title: (n) => `Climb above ${n} m`, mode: 'reach', amount: (e) => (e.t === 'altitude' && Number.isFinite(e.metres) ? e.metres : 0) },
  { id: 'parachute', kind: 'air', weight: 1, sizes: [[1, 10]], title: () => 'Come down under a parachute', mode: 'sum', amount: each((e) => e.t === 'parachute') },
  { id: 'rocket', kind: 'air', weight: 0.5, sizes: [[1, 15]], title: () => 'Launch a rocket', mode: 'sum', amount: each((e) => e.t === 'rocket') },
  { id: 'sail', kind: 'water', weight: 2, sizes: [[5000, 8], [8000, 10]], title: (n) => `Sail ${distance(n)}`, mode: 'sum', amount: metresIn('sail') },
  { id: 'swim', kind: 'water', weight: 2, sizes: [[500, 5], [800, 7]], title: (n) => `Swim ${distance(n)}`, mode: 'sum', amount: metresIn('swim', 'dive') },
  { id: 'dive', kind: 'water', weight: 1, sizes: [[10, 5], [20, 8]], title: (n) => `Dive ${n} m deep`, mode: 'reach', amount: (e) => (e.t === 'depth' && Number.isFinite(e.metres) ? e.metres : 0) },
  { id: 'course', kind: 'course', weight: 2, sizes: [[1, 12]], title: () => 'Finish a ring course', mode: 'sum', amount: each((e) => e.t === 'course') },
  { id: 'jobs', kind: 'job', weight: 2, sizes: [[2, 14], [3, 20]], title: (n) => `Finish ${n} jobs`, mode: 'sum', amount: each((e) => e.t === 'job') },
  { id: 'errand', kind: 'job', weight: 1, sizes: [[1, 8]], title: () => 'Run an errand', mode: 'sum', amount: job('errand') },
  { id: 'fare', kind: 'job', weight: 1, sizes: [[1, 10]], title: () => 'Drive a fare', mode: 'sum', amount: job('taxi') },
  { id: 'cargo', kind: 'job', weight: 1, sizes: [[1, 15]], title: () => 'Fly a load of cargo', mode: 'sum', amount: job('cargo') },
  { id: 'rescue', kind: 'job', weight: 1, sizes: [[1, 12]], title: () => 'Bring somebody home', mode: 'sum', amount: job('rescue') },
  { id: 'talk', kind: 'people', weight: 2, sizes: [[3, 4], [5, 6]], title: (n) => `Talk to ${n} people`, mode: 'sum', amount: each((e) => e.t === 'talk') },
  { id: 'wave', kind: 'people', weight: 1, sizes: [[1, 2]], title: () => 'Wave at somebody', mode: 'sum', amount: each((e) => e.t === 'emote' && e.e === 'wave') },
  { id: 'towns', kind: 'explore', weight: 2, sizes: [[2, 8], [3, 12]], title: (n) => `Walk into ${n} new towns`, mode: 'sum', amount: each((e) => e.t === 'town') },
  { id: 'landmark', kind: 'explore', weight: 1, sizes: [[1, 12]], title: () => 'Visit a landmark', mode: 'sum', amount: each((e) => e.t === 'visit' || e.t === 'arrive') },
  { id: 'guild', kind: 'explore', weight: 1, sizes: [[1, 10]], title: () => 'Drop in at an Explorers’ Guild', mode: 'sum', amount: each((e) => e.t === 'guild') },
  { id: 'photo', kind: 'camera', weight: 1, sizes: [[2, 3], [3, 4]], title: (n) => `Take ${n} photos`, mode: 'sum', amount: each((e) => e.t === 'photo') },
  { id: 'board', kind: 'vehicles', weight: 1.5, sizes: [[2, 5], [3, 7]], title: (n) => `Get into ${n} vehicles`, mode: 'sum', amount: each((e) => e.t === 'board') },
];

export const templateById = (id: string): Template | undefined => TEMPLATES.find((t) => t.id === id);
