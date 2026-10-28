/** The mix: every voice's level, the recordings' names, and two small helpers. */
import type { Cue, Soundscape, Surface } from './types.ts';

/** The low-pass under the water, hertz, and above it, where it lets everything by. */
export const MUFFLED = 650;
export const OPEN_AIR = 20000;

/** The recordings, by the names `build-audio.mjs` publishes. */
export const VARIANTS: Record<Surface, number> = { grass: 4, paving: 4, snow: 4, dirt: 4 };
export const ONE_SHOTS: Cue[] = ['ui-click', 'ui-open', 'ui-close', 'ui-toggle', 'ui-error', 'ui-confirm', 'book-open', 'book-close', 'stamp'];
export const LANDINGS = 2;
/** The passport's leaves, `page-<n>`: one picked at random a turn. */
export const PAGES = 3;

/** Each cue's level against the others. */
export const GAIN: Record<Cue, number> = {
  land: 0.32,
  'ui-click': 0.18,
  'ui-open': 0.22,
  'ui-close': 0.22,
  'ui-toggle': 0.2,
  'ui-error': 0.24,
  'ui-confirm': 0.24,
  'book-open': 0.3,
  'book-close': 0.3,
  page: 0.34,
  stamp: 0.4,
};

/** A footstep's level by surface; a run is `RUN_WEIGHT` of it. */
export const STEP_LEVEL: Record<Surface, number> = { grass: 0.2, paving: 0.16, snow: 0.2, dirt: 0.18 };

/** How long every loop takes to follow a change, in seconds: long enough that a frame's jitter is inaudible. */
export const FOLLOW = 0.35;

/** A knocked-over prop's crack, clang or thud. */
export const KNOCK_LEVEL = 0.34;
export const WIND_LEVEL = 0.14;
export const SEA_LEVEL = 0.3;
export const BOAT_LEVEL = 0.14;
export const PLANE_LEVEL = 0.13;
export const CAR_LEVEL = 0.11;
export const ROTOR_LEVEL = 0.16;
/** A saucer's hum: quieter than any engine, it is meant to be heard and not noticed. */
export const SAUCER_LEVEL = 0.07;
export const TICK_LEVEL = 0.05;
export const HOOF_LEVEL = 0.22;
/**
 * Tyres sliding at full (`SKID_FULL` units a second across the bow, from
 * `SKID_FROM`), and a drift's boost paid out: a rush of air rising.
 */
export const SKID_LEVEL = 0.08;
export const SKID_FROM = 4;
export const SKID_FULL = 30;
export const BOOST_LEVEL = 0.16;
/** The gears a motor's note climbs through between idle and flat out, and how far a change drops it back. */
export const GEARS: Partial<Record<Soundscape['mode'], number>> = { car: 4, heavy: 3, motorbike: 5 };
export const GEAR_DROP = 0.55;

/**
 * The motor loop's voice for each mode that has one: its level, the putt's pitch
 * at idle and what the throttle adds to it, and the filter's likewise. The
 * launch's outboard is the loop as built; a car opens it out, a diesel closes it
 * down, a small single revs it high.
 */
export const MOTORS: Partial<Record<Soundscape['mode'], { level: number; putt: number; rise: number; filter: number; open: number }>> = {
  boat: { level: BOAT_LEVEL, putt: 30, rise: 26, filter: 220, open: 480 },
  car: { level: CAR_LEVEL, putt: 42, rise: 70, filter: 320, open: 900 },
  heavy: { level: CAR_LEVEL * 1.2, putt: 24, rise: 36, filter: 190, open: 420 },
  motorbike: { level: CAR_LEVEL * 0.9, putt: 58, rise: 130, filter: 480, open: 1700 },
  jetski: { level: BOAT_LEVEL * 0.9, putt: 52, rise: 110, filter: 400, open: 1500 },
};
export const BIRD_LEVEL = 0.05;
export const CRICKET_LEVEL = 0.025;
export const HORN_LEVEL = 0.06;
export const RAIN_LEVEL = 0.2;
export const THUNDER_LEVEL = 0.55;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const between = (a: number, b: number): number => a + Math.random() * (b - a);

/** Moves a parameter towards `value`, with time constant `constant`. */
export function follow(param: AudioParam, value: number, time: number, constant = FOLLOW): void {
  param.setTargetAtTime(value, time, constant);
}
