/**
 * A body knocked down by a vehicle, as a pose over time: flung a little the
 * way it was hit, over onto the ground, a moment lying there, up again and
 * dizzy for a few steps. One function for the townsfolk, the verge walkers
 * and the herds, so a person and a cow fall by the same rule. Pure.
 */
import { AVATAR_HEIGHT } from '../stature.ts';

/** Seconds in the air, lying, getting up and dizzy on the feet. */
export const KNOCK_FLY = 0.55;
export const KNOCK_LIE = 1.5;
export const KNOCK_RISE = 0.7;
export const KNOCK_DIZZY = 1.6;
export const KNOCK_TOTAL = KNOCK_FLY + KNOCK_LIE + KNOCK_RISE + KNOCK_DIZZY;
/** How high the body hops, as a share of its height. */
const HOP = 0.3;
/** How far it lies over: a little past flat, so it reads as thrown rather than laid. */
const FLAT = Math.PI / 2;
/** The dizzy sway's size, radians of yaw, and its rate. */
const SWAY = 0.35;
const SWAY_RATE = 9;

export interface KnockPose {
  /** Units along the fling, 0 to `fling`. */
  along: number;
  /** Units up off the ground. */
  lift: number;
  /** Radians from upright, towards the fling. */
  tilt: number;
  /** Radians of yaw added, the dizzy sway. */
  sway: number;
  /** Whether the body stops anything again: not while flying or lying. */
  solid: boolean;
  /** Back on its feet and walking off, which is where the pose eases out. */
  up: boolean;
  done: boolean;
}

/** How far a body is flung by a hit at `speed`, units a second. */
export function flingOf(speed: number): number {
  return AVATAR_HEIGHT * Math.min(1.6, Math.max(0.4, speed / 40));
}

const smooth = (x: number): number => x * x * (3 - 2 * x);

/** The pose `t` seconds after the knock, for a body of `height` flung `fling` units. */
export function knockPose(t: number, height: number, fling: number, out: KnockPose): KnockPose {
  out.sway = 0;
  out.solid = false;
  out.up = false;
  out.done = false;
  if (t < KNOCK_FLY) {
    const k = t / KNOCK_FLY;
    out.along = fling * (1 - (1 - k) * (1 - k));
    out.lift = height * HOP * 4 * k * (1 - k);
    out.tilt = FLAT * Math.pow(k, 0.8);
    return out;
  }
  out.along = fling;
  out.lift = 0;
  let s = t - KNOCK_FLY;
  if (s < KNOCK_LIE) {
    // Lands flat and bounces a little past it: a settle the eye reads as weight.
    out.tilt = FLAT * (1 + 0.08 * Math.exp(-6 * s) * Math.sin(20 * s));
    return out;
  }
  s -= KNOCK_LIE;
  if (s < KNOCK_RISE) {
    out.tilt = FLAT * (1 - smooth(s / KNOCK_RISE));
    return out;
  }
  s -= KNOCK_RISE;
  out.tilt = 0;
  out.solid = true;
  out.up = true;
  if (s < KNOCK_DIZZY) {
    out.sway = SWAY * Math.sin(SWAY_RATE * s) * Math.exp(-2 * s);
    return out;
  }
  out.done = true;
  return out;
}

/** Whether a body knocked `t` seconds ago stops anything: back on its feet. */
export const knockSolidAt = (t: number): boolean => t < 0 || t >= KNOCK_FLY + KNOCK_LIE + KNOCK_RISE;

export function newKnockPose(): KnockPose {
  return { along: 0, lift: 0, tilt: 0, sway: 0, solid: true, up: true, done: true };
}
