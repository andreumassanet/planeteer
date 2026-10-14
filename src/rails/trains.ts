import type { Place } from '../places.ts';
import { PLATFORM_FROM, RAIL_METRE } from './line.ts';
import type { RailLine } from './line.ts';

/**
 * One train a line, shuttling on single track: it waits `DWELL` seconds at a
 * platform, accelerates at `TRAIN_ACCELERATION` to `TRAIN_SPEED`, brakes into
 * the far platform, waits and comes back. Its position is a pure function of
 * the sky's clock and the line's phase, so every client sees the same train.
 *
 * `TRAIN_SPEED` is 25 m/s at the traffic's scale (90 km/h).
 */
export const TRAIN_SPEED = 42;
export const TRAIN_ACCELERATION = 3;
export const DWELL = 24;
/** A car's pitch along the train, coupler to coupler, and the gap between two bodies. */
export const CAR_PITCH = 14.5;
export const CAR_GAP = 0.9;
/** A car's width over its body: the traffic's section. */
export const CAR_WIDTH = 3 * RAIL_METRE;
/** Where the train's nose stops short of the buffer stop. */
export const STOP_SHORT = PLATFORM_FROM + 1;
/** The rail head over the crown, where the wheels stand. */
export const RAIL_TOP = 0.55;

/**
 * The trains a line may run, by kit model id: cab cars at both ends (nose
 * outward, so a reversing train always has a cab leading) and the middles.
 */
export const CONSISTS = {
  highSpeed: { ends: 'bullet-front', middle: ['bullet-car'] },
  electric: { ends: 'city-front', middle: ['city-car'] },
  regional: { ends: 'diesel', middle: ['coach', 'coach-b'] },
  heritage: { ends: 'steam', middle: ['coach-b'] },
  freight: { ends: 'diesel-hood', middle: ['wagon-box', 'wagon-container-red', 'wagon-container-blue', 'wagon-container-green', 'wagon-tank', 'wagon-lumber', 'wagon-coal'] },
} as const;
export type ConsistKind = keyof typeof CONSISTS;

/** A small integer hash in [0, 1), for the choices a line makes once. */
function lineHash(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Which train a line runs and its cars, front to back, by kit id: pure in the line. */
export function consistOf(line: RailLine, places: readonly Place[], length: number): { kind: ConsistKind; cars: string[] } {
  const big = Math.min(places[line.a]!.pop, places[line.b]!.pop);
  const roll = lineHash(line.a, line.b, 1);
  const kind: ConsistKind =
    big >= 500_000 && length > 400 && roll < 0.5 ? 'highSpeed'
      : roll < 0.12 ? 'heritage'
        : roll < 0.4 ? 'freight'
          : big >= 400_000 && roll < 0.7 ? 'electric'
            : 'regional';
  const consist = CONSISTS[kind];
  const count = kind === 'freight' ? 6 : kind === 'heritage' ? 3 : 4;
  const cars: string[] = [consist.ends];
  for (let k = 1; k < count - 1; k++) cars.push(consist.middle[Math.floor(lineHash(line.a, line.b, 10 + k) * consist.middle.length)]!);
  cars.push(consist.ends);
  return { kind, cars };
}

/** Where a line's train is. */
export interface TrainState {
  /** The leading end's `s`, in units from terminus A. */
  head: number;
  /** +1 running toward B, -1 toward A. */
  direction: 1 | -1;
  /** Units a second, never negative. */
  speed: number;
  /** Standing at a platform. */
  standing: boolean;
}

/**
 * The train of a line `length` units long, `cars` long, at `seconds` of the
 * sky's clock; `phase` spreads the lines' timetables apart.
 */
export function trainAt(length: number, cars: number, phase: number, seconds: number, out: TrainState): TrainState {
  const trainLength = cars * CAR_PITCH;
  const run = Math.max(0, length - 2 * STOP_SHORT - trainLength);
  // Braking as hard as it accelerates: a short line never reaches full speed.
  const reach = (TRAIN_SPEED * TRAIN_SPEED) / TRAIN_ACCELERATION;
  const peak = run >= reach ? TRAIN_SPEED : Math.sqrt(run * TRAIN_ACCELERATION);
  const ramp = peak / TRAIN_ACCELERATION;
  const cruise = run >= reach ? (run - reach) / TRAIN_SPEED : 0;
  const travel = 2 * ramp + cruise;
  const period = 2 * (DWELL + travel);
  let t = (seconds + phase * period) % period;
  if (t < 0) t += period;
  const leg = t < DWELL + travel ? 0 : 1;
  const within = leg === 0 ? t : t - DWELL - travel;
  let u = 0;
  let speed = 0;
  if (within >= DWELL) {
    const m = within - DWELL;
    if (m < ramp) {
      u = 0.5 * TRAIN_ACCELERATION * m * m;
      speed = TRAIN_ACCELERATION * m;
    } else if (m < ramp + cruise) {
      u = 0.5 * TRAIN_ACCELERATION * ramp * ramp + peak * (m - ramp);
      speed = peak;
    } else {
      const left = Math.max(0, travel - m);
      u = run - 0.5 * TRAIN_ACCELERATION * left * left;
      speed = TRAIN_ACCELERATION * left;
    }
  }
  if (leg === 0) {
    out.direction = 1;
    out.head = STOP_SHORT + trainLength + u;
  } else {
    out.direction = -1;
    out.head = length - STOP_SHORT - trainLength - u;
  }
  out.speed = speed;
  out.standing = within < DWELL;
  return out;
}

/** A line's timetable phase, 0 to 1: pure in the line. */
export const phaseOf = (line: RailLine): number => lineHash(line.a, line.b, 2);
