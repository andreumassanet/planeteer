/**
 * A city's traffic lights at its middle crossing, as pure functions of the
 * world clock and the town's index: which light each street shows, when its
 * zebras may be walked, where a vehicle stops for them, and how fast it may
 * still go. Every client reads the same clock, so every client sees the same
 * lights with nothing on the wire.
 *
 * Axis 0 is the street that runs along the town's x (traffic moving east or
 * west), axis 1 the one along z. The two take turns: green, amber, then a
 * moment of red both ways before the other street's green.
 */
import type { RegionStyle } from './scenery/contract.ts';
import type { TownGrid } from './scenery/grid.ts';
import { streetCost, streetPose } from './through.ts';
import type { StreetLeg, StreetPose } from './through.ts';
import { TOWER_URBANITY, urbanityOf } from './settlements/urbanity.ts';

export const GREEN = 0;
export const AMBER = 1;
export const RED = 2;
export type Light = typeof GREEN | typeof AMBER | typeof RED;
export type SignalAxis = 0 | 1;

/** Seconds of green, of amber, and of red both ways, for one street's turn. */
export const SIGNAL_GREEN = 14;
export const SIGNAL_AMBER = 3;
export const SIGNAL_CLEAR = 2;
/** One street's turn, and the whole cycle. */
const TURN = SIGNAL_GREEN + SIGNAL_AMBER + SIGNAL_CLEAR;
export const SIGNAL_CYCLE = 2 * TURN;
/**
 * The walk light: the first part of the cross street's green. A person who
 * has not stepped off the kerb by its end waits for the next one; whoever is
 * on the zebra has the rest of the green, the amber and the clearance to finish.
 */
export const WALK_TIME = SIGNAL_GREEN - 5;
/** How far outside the crossing cell's mouth a vehicle's front stops, in world units: just short of the zebra. */
export const STOP_BACK = 0.8;
/** How hard a vehicle brakes for a light, in route units a second squared. */
export const SIGNAL_BRAKE = 60;

/**
 * Whether a standing town has traffic lights: a kit-built city with a middle
 * crossing, past `TOWER_URBANITY`. `settlements` stands them by this, and the
 * traffic stops for them by this.
 */
export function townHasSignals(grid: TownGrid, style: RegionStyle, pop: number): boolean {
  return grid.cells % 2 === 1 && grid.cells >= 3 && style.assets !== undefined && urbanityOf(pop) >= TOWER_URBANITY;
}

/**
 * The clock the lights keep, in seconds: the real one, which every client
 * shares, not the sky's. The sky's runs faster under a scrubbed rate, and a
 * light that cycled with it would flash red and green every few frames.
 */
export function signalClock(): number {
  return Date.now() / 1000;
}

/** A town's place in the cycle, in seconds, so neighbouring cities do not change together. */
export function signalOffset(town: number): number {
  let h = (town * 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return (h / 4294967296) * SIGNAL_CYCLE;
}

/** Seconds into a town's cycle at `clock` (seconds), in [0, SIGNAL_CYCLE). */
export function cycleAt(town: number, clock: number): number {
  const t = (clock + signalOffset(town)) % SIGNAL_CYCLE;
  return t < 0 ? t + SIGNAL_CYCLE : t;
}

/** The light the traffic along `axis` sees at `clock`. */
export function signalLight(town: number, clock: number, axis: SignalAxis): Light {
  const t = cycleAt(town, clock) - axis * TURN;
  const own = t < 0 ? t + SIGNAL_CYCLE : t;
  if (own < SIGNAL_GREEN) return GREEN;
  if (own < SIGNAL_GREEN + SIGNAL_AMBER) return AMBER;
  return RED;
}

/** Seconds until the light along `axis` changes. */
export function signalLeft(town: number, clock: number, axis: SignalAxis): number {
  const t = cycleAt(town, clock) - axis * TURN;
  const own = t < 0 ? t + SIGNAL_CYCLE : t;
  if (own < SIGNAL_GREEN) return SIGNAL_GREEN - own;
  if (own < SIGNAL_GREEN + SIGNAL_AMBER) return SIGNAL_GREEN + SIGNAL_AMBER - own;
  return SIGNAL_CYCLE - own;
}

/**
 * Whether a person may step onto a zebra across the street whose traffic runs
 * along `axis`: while that traffic is held at red and the other street's
 * green is young.
 */
export function mayWalk(town: number, clock: number, axis: SignalAxis): boolean {
  const other = axis === 0 ? 1 : 0;
  const t = cycleAt(town, clock) - other * TURN;
  const own = t < 0 ? t + SIGNAL_CYCLE : t;
  return own < WALK_TIME;
}

/** How far from the crossing's middle a vehicle's front stops for a red light: the cell's mouth and `STOP_BACK`. */
export function stopLineOf(grid: TownGrid): number {
  return grid.pitch * 0.5 + STOP_BACK;
}

/** Where on a drive a vehicle stops for the lights: the route cost with its front on the line, and the street it came by. */
export interface SignalStop {
  q: number;
  axis: SignalAxis;
}

const stopPose: StreetPose = { x: 0, z: 0, fx: 0, fz: 1, mx: 0, mz: 1 };
const stopCache = new WeakMap<readonly StreetLeg[], Map<number, SignalStop | null>>();

/** Whether the front of a vehicle `halfLength` long, `q` into the drive, is inside the stop line's square. */
function frontInside(legs: readonly StreetLeg[], q: number, back: boolean, halfLength: number, line: number): boolean {
  streetPose(legs, q, back, stopPose);
  const x = stopPose.x + stopPose.mx * halfLength;
  const z = stopPose.z + stopPose.mz * halfLength;
  return Math.max(Math.abs(x), Math.abs(z)) < line;
}

/**
 * The first point of a drive (driven out, or `back` home) at which a vehicle
 * of `halfLength` has its front on the stop line `line` from the crossing's
 * middle, or null where the drive never reaches the crossing. Found once per
 * drive, direction and length: a scan and a bisection.
 */
export function signalStopOf(legs: readonly StreetLeg[], back: boolean, halfLength: number, line: number): SignalStop | null {
  const key = (back ? 1 : -1) * (1 + Math.round(halfLength * 8) + Math.round(line * 8) * 1024);
  let known = stopCache.get(legs);
  if (known === undefined) {
    known = new Map();
    stopCache.set(legs, known);
  }
  const cached = known.get(key);
  if (cached !== undefined) return cached;
  const cost = streetCost(legs);
  const steps = 96;
  let found: SignalStop | null = null;
  if (!frontInside(legs, 0, back, halfLength, line)) {
    for (let k = 1; k <= steps; k++) {
      const q = (k / steps) * cost;
      if (!frontInside(legs, q, back, halfLength, line)) continue;
      let lo = ((k - 1) / steps) * cost;
      let hi = q;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (frontInside(legs, mid, back, halfLength, line)) hi = mid;
        else lo = mid;
      }
      streetPose(legs, lo, back, stopPose);
      found = { q: lo, axis: Math.abs(stopPose.mx) >= Math.abs(stopPose.mz) ? 0 : 1 };
      break;
    }
  }
  known.set(key, found);
  return found;
}

/**
 * The most a vehicle's pace (its share of the route's speed) may be this
 * frame for a light `hold` route units ahead of its front: no limit on green,
 * nor on amber when at its present `pace` it is over the line before the red;
 * otherwise what stops it on the line, and never more than the line in one
 * step. `speed` is its route speed, `left` the seconds the light has to run.
 */
export function signalPace(hold: number, light: Light, left: number, pace: number, speed: number, step: number): number {
  if (light === GREEN || hold < 0) return Infinity;
  if (light === AMBER && hold < pace * speed * left) return Infinity;
  if (hold <= 0) return 0;
  const allowed = Math.min(Math.sqrt(2 * SIGNAL_BRAKE * hold), step > 0 ? hold / step : Infinity);
  return allowed / Math.max(1e-6, speed);
}
