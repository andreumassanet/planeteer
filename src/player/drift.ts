/**
 * The drift: a vehicle on wheels whose way and bow can part. The speed along
 * the bow (`fields.speed`) and across it (`slide`, positive to the left) are
 * one velocity; a turn of the bow leaves the velocity where it was, and the
 * tyres swing it back onto the bow at the handling's `grip`, or at its
 * `slideGrip` once the rear has broken loose. Swinging back keeps the speed,
 * less a scrub that grows with the slip, so a drift carries its momentum
 * round a corner the way an arcade car does.
 *
 * `Space` held at speed breaks the rear loose and keeps it loose; the wheel
 * picks the side, and flicked across to the other side within
 * `DRIFT_FLICK_WINDOW` it snaps the drift over to that side (a held
 * counter-steer only holds the slide). The drift charges by how long and how
 * wide it is held, and letting go of `Space` pays the charge out at once as a
 * boost (`payOut`) while the tyres catch. Pure arithmetic on the state and the
 * handling, so `pnpm ground` drives it headless.
 */
import {
  DRIFT_BOOST_SHARE,
  DRIFT_BOOST_TIME,
  DRIFT_CATCH,
  DRIFT_COUNTER,
  DRIFT_FLICK_CHARGE,
  DRIFT_FLICK_FROM,
  DRIFT_FLICK_WINDOW,
  DRIFT_FROM,
  DRIFT_HOLD,
  DRIFT_LOOSEN,
  DRIFT_SNAP_GAIN,
  DRIFT_SNAP_TIME,
  DRIFT_TIERS,
} from '../vehicles.ts';
import type { RoadHandling } from '../vehicles.ts';
import { approach, clamp, mix } from './math.ts';

export interface DriftState {
  /** Speed across the bow, units a second, positive to the left. */
  slide: number;
  /** How far the rear has broken loose, 0 gripping to 1 sliding. */
  loose: number;
  /** Which way the drift goes: +1 to the right, -1 to the left, 0 not yet chosen. */
  dir: number;
  /** The drift's charge: seconds held over `DRIFT_HOLD`, weighted by how wide the slip is, plus each flick's bonus. */
  charge: number;
  /** Seconds of a boost left, and the share of the top speed it adds. */
  boost: number;
  gain: number;
  /** Whether the handbrake was held last step, so its release is seen. */
  held: boolean;
  /** Seconds since the wheel was last over to the drift's side, for the flick. */
  since: number;
  /** Seconds left of a flick's snap onto the new side. */
  snap: number;
}

export function newDrift(): DriftState {
  return { slide: 0, loose: 0, dir: 0, charge: 0, boost: 0, gain: 0, held: false, since: 0, snap: 0 };
}

export function resetDrift(d: DriftState): void {
  d.slide = d.loose = d.dir = d.charge = d.boost = d.gain = d.since = d.snap = 0;
  d.held = false;
}

/** The slip angle, radians: how far the way it is going is off the bow, positive with the way to the left. 0 standing or reversing. */
export function slipOf(speed: number, slide: number): number {
  return speed > 1 ? Math.atan2(slide, speed) : 0;
}

/** The tier a drift's charge has earned: 0 none, 1 and 2 the boosts. */
export function tierOf(charge: number): number {
  return charge >= DRIFT_TIERS[1] ? 2 : charge >= DRIFT_TIERS[0] ? 1 : 0;
}

/**
 * The rear's grip over `dt`: loosened by the handbrake above `DRIFT_FROM` of
 * the cruise and caught again once it is let go. The drift's side is chosen
 * by the wheel the moment it is first turned, and a flick across switches
 * it. Returns whether the handbrake was just let go on a drift, which is when
 * its charge is paid out (`payOut`).
 */
export function loosen(d: DriftState, dt: number, h: RoadHandling, speed: number, steering: number, handbrake: boolean): boolean {
  if (h.maxSlip <= 0) {
    resetDrift(d);
    return false;
  }
  const slip = slipOf(speed, d.slide);
  const fast = speed > h.speed * DRIFT_FROM;
  const released = d.held && !handbrake;
  d.held = handbrake;
  const holding = handbrake && (fast || d.loose > 0.5) && speed > h.speed * DRIFT_FROM * 0.6;
  const drifting = d.loose >= 0.5 && d.dir !== 0;
  d.loose += ((holding ? 1 : 0) - d.loose) * approach(holding ? DRIFT_LOOSEN : DRIFT_CATCH, dt);
  if (!holding && d.loose < 0.02) d.loose = 0;
  d.snap = Math.max(0, d.snap - dt);
  if (d.loose > 0.3 && d.dir === 0) {
    if (Math.abs(steering) > 0.2) d.dir = Math.sign(steering);
    else if (Math.abs(slip) > DRIFT_HOLD * 0.5) d.dir = slip > 0 ? 1 : -1;
    d.since = 0;
  } else if (holding && d.dir !== 0) {
    // The wheel over to the drift's side; flicked across from there in time, the drift goes over with it.
    if (steering * d.dir > DRIFT_FLICK_FROM) d.since = 0;
    else d.since += dt;
    if (steering * d.dir < -DRIFT_FLICK_FROM && d.since < DRIFT_FLICK_WINDOW) {
      d.dir = -d.dir;
      d.since = 0;
      d.snap = DRIFT_SNAP_TIME;
      d.charge += DRIFT_FLICK_CHARGE;
    }
  }
  if (holding && d.loose > 0.5 && d.dir !== 0 && Math.abs(slip) > DRIFT_HOLD) d.charge += dt * (0.5 + clamp(Math.abs(slip) / h.maxSlip, 0, 1));
  if (!holding && d.loose < 0.5) d.dir = 0;
  if (released && drifting) return true;
  // A drift that died without a release (too slow, a knock) earns nothing.
  if (!holding && d.loose < 0.5) d.charge = 0;
  return false;
}

/**
 * A drift's charge into a boost, if it earned one; the charge is spent either
 * way. The boost's length and share grow with the charge from the first tier
 * to the second. Returns the tier paid.
 */
export function payOut(d: DriftState, h: RoadHandling): number {
  const tier = tierOf(d.charge);
  const t = clamp((d.charge - DRIFT_TIERS[0]) / (DRIFT_TIERS[1] - DRIFT_TIERS[0]), 0, 1);
  d.charge = 0;
  if (tier === 0 || h.driftBoost <= 0) return 0;
  d.boost = mix(DRIFT_BOOST_TIME[0], DRIFT_BOOST_TIME[1], t);
  d.gain = h.driftBoost * mix(DRIFT_BOOST_SHARE[0], DRIFT_BOOST_SHARE[1], t);
  return tier;
}

/**
 * The yaw rate the wheel asks for, radians a second, positive to the left:
 * gripping, the steering law of `steerWheels` (`grip` and `lock` are its
 * shares); loose, the drift's own turn into its slide with the wheel adding
 * to it or, held against it, taking it away, and no share lost to a low speed.
 */
export function yawOf(d: DriftState, h: RoadHandling, steering: number, grip: number, lock: number, reversing: boolean): number {
  const held = -steering * h.turn * grip * lock * (reversing ? -1 : 1);
  if (d.loose <= 0 || reversing) return held;
  // A flick's snap swings the bow over onto the new side harder for a moment.
  const snap = 1 + DRIFT_SNAP_GAIN * (d.snap / DRIFT_SNAP_TIME);
  // Against the slide the wheel takes only `DRIFT_COUNTER` of its share away, so a counter-steer holds a shallower slide.
  const wheel = steering * d.dir < 0 ? h.driftSteer * DRIFT_COUNTER : h.driftSteer;
  const drifting = -h.turn * lock * (d.dir * h.driftYaw * snap + steering * wheel);
  return mix(held, drifting, d.loose);
}

/**
 * The velocity after the bow has turned by `turned` radians (positive to the
 * left) and the tyres have had `dt` to swing it back: the speed along the
 * bow, written into `out[0]`, and across it, into `out[1]`. `surface` is the
 * share of the grip the ground gives (less off a made surface).
 */
export function swing(d: DriftState, dt: number, h: RoadHandling, speed: number, turned: number, surface: number, out: [number, number]): void {
  if (h.maxSlip <= 0) {
    // What cannot slide goes where its bow points.
    out[0] = speed;
    out[1] = 0;
    return;
  }
  // The velocity stays where it was while the bow turns under it.
  const c = Math.cos(turned);
  const s = Math.sin(turned);
  let along = speed * c + d.slide * s;
  let across = d.slide * c - speed * s;
  const grip = mix(h.grip, h.slideGrip, d.loose) * surface;
  if (along > 1) {
    // Forward: the way swings back onto the bow and keeps its speed, less the scrub.
    const pace = Math.hypot(along, across);
    let slip = Math.atan2(across, along) * Math.exp(-grip * dt);
    slip = clamp(slip, -h.maxSlip, h.maxSlip);
    const kept = pace * Math.exp(-h.scrub * Math.abs(Math.sin(slip)) * dt);
    along = kept * Math.cos(slip);
    across = kept * Math.sin(slip);
  } else across *= Math.exp(-Math.max(grip, h.grip) * dt);
  out[0] = along;
  out[1] = Math.abs(across) < 1e-4 ? 0 : across;
}
