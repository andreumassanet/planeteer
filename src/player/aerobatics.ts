/**
 * A plane in full control, as a small arcade flight model: the stick pitches,
 * rolls and yaws the plane at rates that ease in and grow with the airspeed;
 * the airspeed is thrust less a drag that grows with its square, and gravity
 * along the flight path, so a climb slows the plane and a dive speeds it up to
 * a terminal speed the drag sets. The wings lift with the square of the
 * airspeed and hold level flight at the cruise; a bank turns the plane; under
 * the stall the lift goes and the nose drops. The plane flies where its nose
 * points, and a frame is cut into fixed steps (`AERO_STEP`), so the frame rate
 * does not change the flight.
 *
 * The attitude is kept in the surface frame (side, up, forward) as a rotation
 * with no yaw: the yaw is handed to `forward` every step, as the nearer of the
 * nose's heading and its reverse while the plane is on its back, so the
 * heading stays put through a loop, and as the nose's own once it is upright.
 */
import * as THREE from 'three';
import type { CraftModel } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { PLANE_CEILING, PLANE_CRUISE_LOW, PLANE_THROTTLE_UP } from '../vehicles.ts';
import {
  AERO_ASSIST_BANK,
  AERO_BANK_TURN,
  AERO_CONTROL_EASE,
  AERO_GRAVITY,
  AERO_IDLE,
  AERO_KNOCK_NOSE,
  AERO_LAND_BANK,
  AERO_LAND_PITCH,
  AERO_LEVEL_ASSIST,
  AERO_LIFT_SPEED,
  AERO_MAX_ACCEL,
  AERO_MAX_SPEED,
  AERO_MIN_AUTHORITY,
  AERO_NEUTRAL,
  AERO_PATH_FLOOR,
  AERO_PATH_RATE,
  AERO_PITCH_RATE,
  AERO_PULL_DRAG,
  AERO_RECOVERED,
  AERO_RECOVER_GAIN,
  AERO_ROLL_RATE,
  AERO_STALL,
  AERO_STALL_DROP,
  AERO_STALL_LIFT,
  AERO_STEP,
  AERO_THIN,
  AERO_THROTTLE_EASE,
  AERO_THRUST,
  AERO_YAW_RATE,
  AIR_LOW,
  CRASH_QUIET,
  MAX_NOSE,
  PLANE_AIR_CLEARANCE,
  PLANE_BANK,
  PLANE_BOUNCE,
  PLANE_WALL,
} from './constants.ts';
import { approach, clamp, levers } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';
import type { WallChecks } from './walls.ts';
import type { Flight } from './flight.ts';

/** What a touchdown came to: down, or refused for the water or the slope under it. */
export type Touchdown = 'landed' | 'water' | 'steep';

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** The bank of an attitude: how far its wings are rolled off the horizon about the nose, radians, positive right. */
export function bankOf(nose: THREE.Vector3, bodyUp: THREE.Vector3, level: THREE.Vector3): number {
  // `level` is the world's up with the nose's part taken out; zero length at a vertical nose.
  const across = level.length();
  if (across < 1e-6) return 0;
  const sin = new THREE.Vector3().crossVectors(level, bodyUp).dot(nose) / across;
  const cos = bodyUp.dot(level) / across;
  return Math.atan2(sin, cos);
}

/**
 * How much lift the wings make, as a share of the plane's weight, before the
 * airspeed has its say: what holds the flight path where it is up to a bank of
 * sixty degrees, falling to nothing on a knife edge and upside down, where the
 * stick has to hold the nose up itself.
 */
export function trimLift(cosPitch: number, cosBank: number): number {
  if (cosBank >= 0.5) return cosPitch / cosBank;
  return cosBank > 0 ? cosPitch * 4 * cosBank : 0;
}

/**
 * The air at a height over the sea, as the share of the low air's speeds a
 * plane in aerobatics flies at there: a gentle rise, not travel's.
 */
export function airAt(altitude: number): number {
  const share = Math.min(1, Math.max(0, altitude / PLANE_CEILING));
  return 1 + AERO_THIN * share * share;
}

/** The share of the full thrust the throttle holds: `W` (`throttle` 1) to full, none to the cruise's, `S` (-1) to an idle. */
export function thrustShareOf(throttle: number): number {
  return throttle >= 0 ? AERO_NEUTRAL + (1 - AERO_NEUTRAL) * throttle : AERO_NEUTRAL + (AERO_NEUTRAL - AERO_IDLE) * throttle;
}

/**
 * One step of the airspeed: the thrust and gravity along the path (`climb`,
 * the sine of the path's climb), then the drag, solved implicitly so no step
 * overshoots, plus what pulling (`pull`, 0 to 1) bleeds. No step moves it by
 * more than `AERO_MAX_ACCEL`, and it never passes `AERO_MAX_SPEED`.
 */
export function airspeedStep(speed: number, share: number, climb: number, pull: number, air: number, h: number): number {
  const top = PLANE_CRUISE_LOW * (1 + PLANE_THROTTLE_UP) * air;
  const thrust = AERO_THRUST * air;
  const drag = thrust / (top * top);
  let next = speed + (thrust * share - AERO_GRAVITY * climb) * h;
  next /= 1 + (drag * Math.abs(next) + AERO_PULL_DRAG * pull) * h;
  next = clamp(next, speed - AERO_MAX_ACCEL * h, speed + AERO_MAX_ACCEL * h);
  return clamp(next, 0, AERO_MAX_SPEED);
}

export function createAerobatics(
  core: PlayerCore,
  frame: Frame,
  wallSet: WallChecks,
  flight: Flight,
  touchdown: (model: CraftModel) => Touchdown,
) {
  const { forward, landAt, options, position, probe, pushed, side, stick, up } = core;
  const s = core.fields;
  const { advance, pointAhead } = frame;
  const { airHit, airWalls } = wallSet;
  const { bounce, refuse } = flight;
  const q = s.attitude;
  const nose = new THREE.Vector3();
  const bodyUp = new THREE.Vector3();
  const level = new THREE.Vector3();
  const pull = new THREE.Vector3();
  const spin = new THREE.Vector3();
  const toward = new THREE.Vector3();
  const along = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const euler = new THREE.Euler();
  /** The share of the full thrust, eased towards what the throttle asks. */
  let thrust = AERO_NEUTRAL;

  function axes(): void {
    nose.copy(Z).applyQuaternion(q);
    bodyUp.copy(Y).applyQuaternion(q);
    level.copy(Y).addScaledVector(nose, -nose.y);
  }

  /** Into full control from the simple mode's own look: its nose off the climb, its wings off the roll, the throttle holding its speed. */
  function engage(): void {
    const pitchUp = clamp(Math.atan2(s.climbRate, Math.max(s.speed, 1)), -MAX_NOSE, MAX_NOSE);
    q.setFromEuler(euler.set(-pitchUp, 0, -s.roll * PLANE_BANK));
    const cruise = PLANE_CRUISE_LOW * airAt(s.altitude);
    thrust = clamp(AERO_NEUTRAL * (s.speed / cruise) ** 2, AERO_IDLE, 1);
    s.aerobatic = true;
    s.recovering = false;
  }

  /** Back to the simple mode, level, with the climb it has. */
  function release(): void {
    axes();
    s.climbing = s.speed * nose.y;
    s.roll = 0;
    s.aerobatic = false;
    s.recovering = false;
    q.identity();
  }

  /** Knocked off the ground or a wall: wings level, nose a little up, told once. */
  function knock(lost: number): void {
    q.setFromEuler(euler.set(-AERO_KNOCK_NOSE, 0, 0));
    if (lost <= 0) return;
    if (s.sinceCrash >= CRASH_QUIET) {
      s.sinceCrash = 0;
      options.onEvent?.('crashed', lost);
    }
  }

  /** The stick turns the plane about its own axes: pitch about +X (nose up is negative), roll about +Z, yaw about +Y. */
  function steer(h: number, pitch: number, roll: number, rudder: number, air: number): void {
    const ease = approach(AERO_CONTROL_EASE, h);
    s.elevator += (pitch - s.elevator) * ease;
    s.aileron += (roll - s.aileron) * ease;
    s.steering += (rudder - s.steering) * ease;
    const authority = clamp(s.speed / (AERO_LIFT_SPEED * air), AERO_MIN_AUTHORITY, 1);
    euler.set(
      -s.elevator * AERO_PITCH_RATE * authority * h,
      -s.steering * AERO_YAW_RATE * authority * h,
      s.aileron * AERO_ROLL_RATE * authority * h,
      'XYZ',
    );
    q.multiply(turn.setFromEuler(euler));
  }

  /**
   * What turns the flight path: the lift along the wings' up against gravity,
   * divided by the airspeed and capped (`AERO_PATH_RATE`); the bank's turn
   * about the vertical; and under the stall the nose falling to the ground.
   */
  function forces(h: number, air: number): void {
    axes();
    const cosPitch = level.length();
    const bank = bankOf(nose, bodyUp, level);
    const liftSpeed = AERO_LIFT_SPEED * air;
    const stallSpeed = liftSpeed * AERO_STALL;
    const stalled = s.speed < stallSpeed;
    const share = Math.min(1, (s.speed / liftSpeed) ** 2) * (stalled ? AERO_STALL_LIFT : 1);
    const lift = AERO_GRAVITY * share * trimLift(cosPitch, Math.cos(bank));
    pull.copy(bodyUp).multiplyScalar(lift).addScaledVector(level, -AERO_GRAVITY);
    spin.crossVectors(nose, pull).divideScalar(Math.max(s.speed, AERO_PATH_FLOOR));
    const rate = Math.min(spin.length(), AERO_PATH_RATE);
    if (rate > 1e-9) q.premultiply(turn.setFromAxisAngle(spin.normalize(), rate * h));
    // A right bank turns right, which about the surface's up is a negative angle.
    const yaw = -AERO_BANK_TURN * Math.sin(bank) * share * cosPitch;
    if (yaw !== 0) q.premultiply(turn.setFromAxisAngle(Y, yaw * h));
    if (stalled) {
      axes();
      // Towards the ground, and off a vertical nose towards the belly; nothing to do in a dive.
      toward.copy(Y).negate().addScaledVector(bodyUp, -0.3);
      spin.crossVectors(nose, toward);
      const drop = AERO_STALL_DROP * clamp(1 - s.speed / stallSpeed, 0, 1) * Math.min(1, 1 + nose.y);
      if (drop > 0 && spin.lengthSq() > 1e-12) q.premultiply(turn.setFromAxisAngle(spin.normalize(), drop * h));
    }
    q.normalize();
  }

  /**
   * The yaw handed to `forward`: the nose's heading once the plane is upright,
   * else the nearer of it and its reverse; a nose near the vertical keeps it.
   * Returns the turn it made, leaving out a turn round.
   */
  function headOn(): number {
    axes();
    const flat = Math.hypot(nose.x, nose.z);
    if (flat < 0.2) return 0;
    let yaw = Math.atan2(nose.x, nose.z);
    const reversed = nose.z < 0;
    const turnRound = reversed && bodyUp.y > 0.5 && flat > 0.5;
    if (reversed && !turnRound) yaw = yaw > 0 ? yaw - Math.PI : yaw + Math.PI;
    if (Math.abs(yaw) < 1e-9) return 0;
    forward.applyAxisAngle(up, yaw).normalize();
    q.premultiply(turn.setFromAxisAngle(Y, -yaw));
    return turnRound ? 0 : yaw;
  }

  /** The stick the frame asks for, the levelling's own when travel is asked for; null once levelled, handed back. */
  function stickOf(input: PlayerInput): { pitch: number; roll: number } | null {
    let pitch = input.attitude?.pitch ?? 0;
    let roll = input.attitude?.roll ?? 0;
    axes();
    const bank = bankOf(nose, bodyUp, level);
    if (s.recovering) {
      roll = clamp(-bank * AERO_RECOVER_GAIN, -1, 1);
      // The nose to the horizon once the wings are near level, upright.
      pitch = Math.abs(bank) < 0.6 ? clamp(-Math.asin(clamp(nose.y, -1, 1)) * AERO_RECOVER_GAIN, -1, 1) : 0;
      if (Math.abs(bank) < AERO_RECOVERED && Math.abs(nose.y) < AERO_RECOVERED && nose.z > 0) return null;
    } else if (roll === 0 && Math.abs(bank) < AERO_ASSIST_BANK && Math.abs(nose.y) < 0.8) {
      // Let go in a gentle bank, the wings come back level by themselves.
      roll = clamp(-bank * AERO_LEVEL_ASSIST, -1, 1);
    }
    return { pitch, roll };
  }

  /** One step of the plane along its nose, against the walls and the ground. True once it has landed. */
  function move(h: number, model: CraftModel): boolean {
    axes();
    const before = position.length();
    along.copy(side.crossVectors(up, forward).normalize()).multiplyScalar(nose.x).addScaledVector(forward, nose.z);
    const flat = along.length();
    const way = s.speed * h * flat;
    let radius = Math.min(PLANET_RADIUS + PLANE_CEILING, before + s.speed * h * nose.y);
    if (flat > 1e-6) {
      along.divideScalar(flat);
      const aboveGround = Math.max(0, before - landAt(position));
      if (airWalls !== null) {
        const wide = Math.max(model.size[0], model.size[1]) * PLANE_WALL;
        const steps = Math.min(6, Math.max(1, Math.ceil(way / wide)));
        s.airHeight = radius;
        s.airLow = aboveGround < AIR_LOW;
        s.airEnvelope = 0;
        let struck = 0;
        for (let step = 1; step <= steps && struck === 0; step++) {
          pointAhead(along, (way * step) / steps / before, probe);
          if (airHit(probe, wide, pushed)) struck = step;
        }
        if (struck > 0) {
          advance(along, (way * (struck - 1)) / steps / before);
          // Turned off the wall and slowed by `bounce`, which tells the crash.
          bounce(pushed);
          knock(0);
        } else advance(along, way / before);
      } else advance(along, way / before);
    }

    // The ground has the last word: a touchdown if the plane comes down on its
    // wheels the right way up and nearly level, a knock if it does not, and a
    // lift over a ridge rising under a plane flying level.
    const beneath = landAt(position);
    const floor = beneath + PLANE_AIR_CLEARANCE;
    if (radius <= floor + 0.5) {
      axes();
      if (radius < before - 1e-4) {
        const bank = bankOf(nose, bodyUp, level);
        const pitchAngle = Math.asin(clamp(nose.y, -1, 1));
        const fair = Math.abs(bank) < AERO_LAND_BANK && pitchAngle > -AERO_LAND_PITCH && pitchAngle < AERO_LAND_PITCH && nose.z > 0;
        const outcome = fair ? touchdown(model) : null;
        if (outcome === 'landed') {
          s.aerobatic = false;
          s.recovering = false;
          q.identity();
          s.elevator = s.aileron = 0;
          return true;
        }
        if (outcome !== null) refuse(outcome === 'water' ? 'water-refused' : 'steep-refused');
        const lost = outcome === null ? s.speed * (1 - PLANE_BOUNCE) : 0;
        if (outcome === null) s.speed *= PLANE_BOUNCE;
        knock(lost);
      }
      radius = Math.max(radius, floor);
    }
    position.setLength(radius);
    s.altitude = radius - PLANET_RADIUS;
    return false;
  }

  /** One frame of a plane in full control, in fixed steps of at most `AERO_STEP`. */
  function fly(dt: number, input: PlayerInput, model: CraftModel): void {
    s.sinceRefusal += dt;
    levers(input.move, stick);
    const asked = stickOf(input);
    if (asked === null) {
      release();
      return;
    }
    const wanted = clamp(thrustShareOf(stick.y), AERO_IDLE, 1);
    const steps = Math.min(30, Math.max(1, Math.ceil(dt / AERO_STEP - 1e-9)));
    const h = dt / steps;
    const before = position.length();
    let turned = 0;
    for (let i = 0; i < steps; i++) {
      const air = airAt(s.altitude);
      thrust += (wanted - thrust) * approach(AERO_THROTTLE_EASE, h);
      steer(h, asked.pitch, asked.roll, stick.x, air);
      forces(h, air);
      axes();
      const authority = clamp(s.speed / (AERO_LIFT_SPEED * air), AERO_MIN_AUTHORITY, 1);
      s.speed = airspeedStep(s.speed, thrust, nose.y, Math.abs(s.elevator) * authority, air, h);
      if (move(h, model)) return;
      turned += headOn();
    }
    s.turnRate = dt > 0 ? turned / dt : 0;
    s.climbRate = dt > 0 ? (position.length() - before) / dt : 0;
    s.velocity = s.speed;
  }

  return { engage, release, fly };
}

export type Aerobatics = ReturnType<typeof createAerobatics>;
