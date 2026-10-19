/**
 * How a ridden vehicle sits and moves: the lean of a turn, the swell under a hull, the nose of a climb.
 */
import * as THREE from 'three';
import { AT_REST } from '../craft/motion.ts';
import type { MotionInput } from '../craft/motion.ts';
import { HELI_BANK, HELI_NOSE, HELI_SPEED, HELI_SPOOL, HELI_TURN, SUB_UNDER } from '../vehicles.ts';
import {
  AERO_PIVOT,
  BALLOON_PIVOT,
  BALLOON_SWING,
  BALLOON_SWING_MAX,
  BANK_SMOOTHING,
  BOW_LIFT,
  BOW_RISE,
  BOW_SETTLE,
  BOW_SMOOTHING,
  CHOP,
  HEEL_OUT,
  HELI_ATTITUDE_EASE,
  LEAN_EASE,
  LEAN_PULL,
  MAX_NOSE,
  PLANE_BANK,
  REAR_AXLE,
  SUB_PITCH,
  WHEELIE_MAX,
  isAir,
  roadOf,
  waterOf,
} from './constants.ts';
import type { Held } from './core.ts';
import { approach, clamp } from './math.ts';
import type { PlayerCore } from './core.ts';
import type { BodyRig } from './body.ts';

export function createRidePose(core: PlayerCore, body: BodyRig) {
  const { avatar, craft, seat, stick } = core;
  const s = core.fields;
  const { seatOf, seatOn } = body;

  /** What the held vehicle's motion is handed each frame, rewritten rather than made. */
  const motionInput: MotionInput = { ...AT_REST };
  const hangFrom = new THREE.Vector3();

  /**
   * The launch's heel, eased after its rudder. A left turn is a positive
   * `turnRate`, and a positive roll leans the hull right. Slow, the launch is a
   * displacement hull and heels a little out of the turn; on the plane (`pace` 1) it
   * banks into it the whole `limit`, as a planing hull does.
   */
  function bank(dt: number, limit: number, rate: number, pace: number): void {
    const wanted = clamp(s.turnRate / rate, -1, 1) * limit * (HEEL_OUT - (1 + HEEL_OUT) * pace);
    s.lean += (wanted - s.lean) * approach(BANK_SMOOTHING, dt);
  }

  /**
   * The vehicle's own moving parts (springs, wheels, propeller) at what it is
   * doing: `craft/motion.ts`. A passenger does not drive, so his vehicle is handed
   * the speed it carried him at and nothing about a wheel.
   */
  function spin(held: Held, dt: number, speed_: number): void {
    const kind = held.model.kind;
    const driving = held.seat === 0;
    motionInput.speed = driving ? s.speed : speed_;
    motionInput.turnRate = driving ? s.turnRate : 0;
    motionInput.steering = driving ? s.steering : 0;
    // A helicopter's rotor winds up to its flying speed while it spools.
    motionInput.grounded = kind === 'helicopter' ? s.grounded && s.spool < HELI_SPOOL * 0.25 : isAir(kind) ? s.grounded : !s.airborne;
    motionInput.engine = true;
    motionInput.moored = false;
    motionInput.throttle = driving ? stick.y : speed_ > 0.5 ? 1 : 0;
    // The stick as the control surfaces show it: the plane's own, held by whoever flies it.
    const flown = driving && kind === 'plane' && !s.grounded;
    motionInput.elevator = flown ? s.elevator : 0;
    motionInput.aileron = flown ? s.aileron : 0;
    held.motion.update(dt, motionInput);
  }

  /** Poses the body in its seat and the ride on its springs, swell, bank or nose. */
  function poseRide(held: Held, dt: number, speed_: number): void {
    const where = seatOf(held);
    const kind = held.model.kind;
    s.swell += dt;
    spin(held, dt, speed_);
    // Seated, the legs as the seat folds them and, at a wheel, the hands
    // round it at the turn the motion has just given it.
    if (where.pose === 'sit') avatar.sit(dt, where, held.motion.steer);
    else if (where.pose === 'ride') avatar.ride(dt, held.motion.turned(where), held.motion.phase);
    else if (held.model.medium === 'water') avatar.steer(dt, s.lean);
    else avatar.stride(dt, 0, false);
    seatOn(where);
    // A horse's back rises and falls under the saddle, and the rider with it.
    seat.position.y += held.motion.lift;

    if (held.model.medium === 'water') {
      const handling = waterOf(kind);
      // How far onto the plane the hull is: 0 standing, 1 at its cruise.
      const pace = clamp(Math.abs(speed_) / handling.speed, 0, 1);
      bank(dt, handling.heel, handling.turn, pace);
      // The bow comes up as the hull climbs onto the plane and settles a
      // little once it is over the hump, eased like the hull's own weight.
      const wanted = handling.bow * pace - BOW_SETTLE * (handling.bow / BOW_LIFT) * clamp((speed_ - handling.speed) / (handling.boost - handling.speed), 0, 1);
      s.bowLift += (wanted - s.bowLift) * approach(BOW_SMOOTHING, dt);
      // A swell, so a moored boat is not a parked box: two frequencies that
      // do not divide, or the roll and the pitch beat together and it reads
      // as a loop. Under way the long swell gives way to a quick chop, and
      // the hull rides higher on the plane; a jet ski skips off the chop, and
      // a sail heels the hull over as it gathers way.
      const calm = 1 - 0.5 * pace;
      const heel = s.lean + Math.sin(s.swell * 0.9) * 0.05 * calm + handling.list * pace;
      const skip = handling.hop * pace * pace * Math.max(0, Math.sin(s.swell * 5.3) * Math.sin(s.swell * 2.1 + 1));
      craft.position.y = Math.sin(s.swell * 1.3) * 0.18 * calm + BOW_RISE * pace + skip;
      craft.rotation.set(Math.sin(s.swell * 0.7) * 0.035 * calm + Math.sin(s.swell * 3.1) * CHOP * pace - s.bowLift - skip * 0.1, 0, heel);
      if (kind === 'submarine') {
        // Under the surface the swell lets go of it, and the bow goes down
        // into a dive and up out of one: the attitude is the path.
        const submerged = clamp(s.dive / SUB_UNDER, 0, 1);
        craft.position.y *= 1 - submerged;
        const trim = clamp(Math.atan2(s.diveRate, Math.max(Math.abs(speed_), 3)), -SUB_PITCH, SUB_PITCH);
        craft.rotation.set(craft.rotation.x * (1 - submerged) + trim, 0, craft.rotation.z * (1 - 0.7 * submerged));
      }
      return;
    }
    if (kind === 'helicopter') {
      // Nose down into its speed and banked into its turn, both eased like
      // the machine's own weight; square on its skids.
      const flying = s.grounded ? 0 : 1;
      s.nose += (HELI_NOSE * clamp(speed_ / HELI_SPEED, -0.5, 1) * flying - s.nose) * approach(HELI_ATTITUDE_EASE, dt);
      s.lean += (-clamp(s.turnRate / HELI_TURN, -1, 1) * HELI_BANK * flying - s.lean) * approach(HELI_ATTITUDE_EASE, dt);
      craft.rotation.set(s.nose, 0, s.lean);
      return;
    }
    if (kind === 'plane' && !s.grounded && s.aerobatic) {
      // Full control: the attitude as it stands, turned about the middle of
      // the plane rather than its wheels, so a roll does not swing it round them.
      craft.quaternion.copy(s.attitude);
      const pivot = held.model.size[2] * AERO_PIVOT;
      hangFrom.set(0, pivot, 0).applyQuaternion(s.attitude);
      craft.position.set(-hangFrom.x, pivot - hangFrom.y, -hangFrom.z);
      s.lean = 0;
      return;
    }
    if (kind === 'plane' && !s.grounded) {
      // The bank *is* the turn — `fly` reads the turn off `roll` — so it is
      // taken as it stands rather than eased a second time, and it goes into
      // the turn: a left roll is a positive `roll` and, per the basis, a
      // negative lean.
      s.lean = -s.roll * PLANE_BANK;
      // Nose follows the actual climb rate, so the attitude is the flight path
      // rather than a decoration: negative pitches it up.
      const pitchUp = -clamp(Math.atan2(s.climbRate, Math.max(speed_, 1)), -MAX_NOSE, MAX_NOSE);
      craft.rotation.set(pitchUp, 0, s.lean);
      return;
    }
    if (kind === 'balloon') {
      // A basket hangs from its envelope: a slow pendulum about the middle of
      // the envelope, swung out of a turn, and still once it is standing on
      // its skids. Out of a turn is to the right of a left one, which about a
      // pivot overhead is a negative roll.
      s.aloft += ((s.grounded ? 0 : 1) - s.aloft) * approach(1, dt);
      const out = -clamp(s.turnRate * speed_ * BALLOON_SWING, -BALLOON_SWING_MAX, BALLOON_SWING_MAX);
      s.swing += (out - s.swing) * approach(0.8, dt);
      craft.rotation.set(Math.sin(s.swell * 0.6) * 0.02 * s.aloft, 0, (Math.sin(s.swell * 0.45) * 0.03 + s.swing) * s.aloft);
      const pivot = held.model.size[2] * BALLOON_PIVOT;
      hangFrom.set(0, pivot, 0).applyEuler(craft.rotation);
      craft.position.set(-hangFrom.x, pivot - hangFrom.y, -hangFrom.z);
      return;
    }
    // On wheels: the nose on the ground's slope. How the body sits on its
    // springs — the roll out of a turn, the squat and the dive — is the
    // model's own motion (`spin`), under the pose rather than in it. A
    // two-wheeler and a horse lean into the turn instead, rider and all, and
    // a motorbike's front wheel comes up under a hard throttle, about the
    // rear axle.
    const handling = roadOf(kind);
    const pull = held.seat === 0 ? s.speed * s.turnRate : 0;
    s.lean += (-clamp(pull / LEAN_PULL, -1, 1) * (handling?.lean ?? 0) - s.lean) * approach(LEAN_EASE, dt);
    const lifting = handling === undefined || s.airborne ? 0 : clamp(s.surge * handling.wheelie, 0, WHEELIE_MAX);
    s.wheelie += (lifting - s.wheelie) * approach(LEAN_EASE, dt);
    craft.rotation.set(s.tilt - s.wheelie, 0, s.lean);
    craft.position.y = Math.sin(s.wheelie) * held.model.size[0] * REAR_AXLE;
  }

  return { poseRide };
}

export type RidePose = ReturnType<typeof createRidePose>;
