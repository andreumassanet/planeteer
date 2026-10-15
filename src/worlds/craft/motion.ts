/**
 * How a space vehicle moves: the throttle into a speed, the keys into a climb,
 * the ground into a lean.
 *
 * A rover holds to the ground and falls off crests at the world's gravity. A
 * lander and a saucer fly by Earth's plane laws (`vehicles.ts`): speed rides
 * the height, the climb keys ask for a vertical speed that eases into the
 * ceiling, and coming down flares to a touchdown. A saucer gathers and sheds
 * speed at once and banks into turns; an aerostat floats on its own height
 * and drifts on the wind.
 */

import * as THREE from 'three';
import type { Handling, WindSpec } from '../contract.ts';
import { PLANE_ACCELERATION_TIME, PLANE_CEILING, PLANE_CLIMB_MIN, PLANE_CLIMB_RATE, PLANE_CRUISE_LOW, PLANE_CRUISE_NOMINAL, PLANE_FLARE, PLANE_TOUCHDOWN, PLANE_VERTICAL_TIME } from '../../vehicles.ts';
import { NEEDLE_REST, NEEDLE_SWEEP, WHEEL_LOCK } from '../../craft/cabin.ts';
import type { Controls, Craft, Model } from './types.ts';
import { AEROSTAT_CEILING, FLAME_LENGTH, SAUCER_BANK, SAUCER_NOD, SAUCER_VERTICAL_TIME, SAUCER_WOBBLE, TURBO } from './handling.ts';

const scratchUp = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchForward = new THREE.Vector3();
const scratchPoint = new THREE.Vector3();
const basis = new THREE.Matrix4();
const turn = new THREE.Quaternion();
const scratchNorth = new THREE.Vector3();
const scratchEast = new THREE.Vector3();
const scratchDrift = new THREE.Vector3();

/** What fixes a craft's motion: which family it is and how it handles. */
interface MotionConfig {
  flies: boolean;
  floats: boolean;
  /** A saucer takes its speed at once and wobbles; the lander eases into it. */
  saucer: boolean;
  handling: Handling;
  wind: WindSpec | null;
}

/** The motion's own state, between frames. */
interface MotionState {
  tilt: THREE.Vector3;
  /** How hard the afterburner is burning, 0 to 1, eased. */
  burn: number;
  /** The flames' clock, and the saucer's wobble's. */
  flicker: number;
  wobble: number;
}

type GroundAt = (point: THREE.Vector3) => number;

/**
 * Returns the craft's `update`. `model` is asked each step because the kit's
 * model may replace a code-built one while the craft lives.
 */
export function createMotion(craft: Craft, object: THREE.Object3D, model: () => Model, config: MotionConfig): Craft['update'] {
  const { flies, floats, saucer, handling } = config;
  const state: MotionState = { tilt: new THREE.Vector3(), burn: 0, flicker: 0, wobble: 0 };
  return (dt, controls, groundAt, gravity, R) => {
    const current = model();
    const up = scratchUp.copy(craft.position).normalize();
    // Carry the heading across the sphere: keep it tangent.
    craft.heading.addScaledVector(up, -craft.heading.dot(up)).normalize();
    const throttle = controls?.throttle ?? 0;
    const steer = controls?.steer ?? 0;
    const top = accelerate(craft, config, state, dt, controls, groundAt, R);
    const steering = flies || floats ? 1 : Math.min(1, Math.abs(craft.speed) / 4) * Math.sign(craft.speed || 1);
    if (steer !== 0) {
      turn.setFromAxisAngle(up, -steer * handling.turn * dt * steering);
      craft.heading.applyQuaternion(turn);
    }
    craft.position.addScaledVector(craft.heading, craft.speed * dt);
    turnParts(craft, current, handling, steer, dt);

    const ground = R + groundAt(craft.position);
    let radial = craft.position.length();
    if (floats) radial = floatRadial(craft, config, up, controls, dt, ground, radial, throttle);
    else if (flies) radial = flyRadial(craft, config, state, controls, dt, ground, radial, R);
    else radial = rollRadial(craft, gravity, dt, ground, radial);
    craft.position.setLength(radial);
    animateParts(craft, current, state, dt, radial - ground, top);

    // Lean with the ground: the normal from four samples round the craft.
    const forward = scratchForward.copy(craft.heading);
    const right = scratchRight.crossVectors(forward, up).normalize();
    let normal = up.clone();
    if (!flies && !floats && !craft.airborne) {
      const span = current.radius * 0.6;
      const h = (dx: number, dz: number): number => groundAt(scratchPoint.copy(craft.position).addScaledVector(right, dx).addScaledVector(forward, dz));
      const slopeX = (h(span, 0) - h(-span, 0)) / (2 * span);
      const slopeZ = (h(0, span) - h(0, -span)) / (2 * span);
      normal = up.clone().addScaledVector(right, -slopeX).addScaledVector(forward, -slopeZ).normalize();
    } else if (saucer && craft.airborne) {
      // Banked into the turn and nodding into the throttle, over a slow
      // wobble that never quite settles.
      state.wobble += dt;
      normal
        .addScaledVector(right, steer * SAUCER_BANK + SAUCER_WOBBLE * Math.sin(state.wobble * 1.7))
        .addScaledVector(forward, throttle * SAUCER_NOD + SAUCER_WOBBLE * Math.cos(state.wobble * 1.3))
        .normalize();
    } else if ((flies || floats) && craft.airborne) {
      normal.addScaledVector(right, steer * (floats ? 0.05 : 0.25)).normalize();
    }
    state.tilt = state.tilt.lengthSq() === 0 ? normal : state.tilt.lerp(normal, Math.min(1, dt * 6)).normalize();
    const z = forward.addScaledVector(state.tilt, -forward.dot(state.tilt)).normalize();
    const x = scratchRight.crossVectors(state.tilt, z).normalize();
    basis.makeBasis(x, state.tilt, z);
    object.position.copy(craft.position);
    object.quaternion.setFromRotationMatrix(basis);
  };
}

/**
 * Eases the speed toward what the throttle asks for. The afterburner makes a
 * ship in the air go `TURBO` times as fast and climb twice as hard while it
 * burns; a ship aloft rides the height, from its own top low down to
 * `PLANE_CRUISE_NOMINAL`'s share of it at `PLANE_CEILING`. Returns that top.
 */
function accelerate(craft: Craft, config: MotionConfig, state: MotionState, dt: number, controls: Controls | null, groundAt: GroundAt, R: number): number {
  const { flies, saucer, handling } = config;
  const throttle = controls?.throttle ?? 0;
  const burning = flies && craft.airborne && controls?.boost === true;
  state.burn += ((burning ? 1 : 0) - state.burn) * Math.min(1, dt * 3);
  const over = craft.position.length() - (R + groundAt(craft.position));
  const high = flies && craft.airborne ? Math.min(1, Math.max(0, over / PLANE_CEILING)) : 0;
  const top = handling.top * (1 + (PLANE_CRUISE_NOMINAL / PLANE_CRUISE_LOW - 1) * high) * (1 + (TURBO - 1) * state.burn);
  const target = throttle > 0 ? Math.max(throttle, state.burn) * top : throttle * handling.reverse;
  if (flies && craft.airborne && !saucer) craft.speed += (target - craft.speed) * (1 - Math.exp(-dt / PLANE_ACCELERATION_TIME)) * (1 + 2 * state.burn);
  else if (saucer && craft.airborne) {
    // Its own accel, scaled with the height's top speed so a climb to the
    // ceiling does not take a minute to reach its pace.
    const accel = handling.accel * (top / handling.top);
    craft.speed += Math.max(-accel * dt, Math.min(accel * dt, target - craft.speed));
  } else {
    const grip = craft.airborne && !flies && !config.floats ? 0.1 : 1;
    const accel = handling.accel * (1 + 2 * state.burn);
    craft.speed += Math.max(-accel * dt, Math.min(accel * dt, target - craft.speed)) * grip;
  }
  if (controls === null && !craft.airborne) craft.speed *= Math.exp(-3 * dt);
  return top;
}

/**
 * The wheel turns with the steering and comes back to the middle, eased as
 * Earth's does (`craft/motion.ts`); the needle reads the pace. Grips that do
 * not turn (the saucer's sticks, the T-handle) hold still.
 */
function turnParts(craft: Craft, model: Model, handling: Handling, steer: number, dt: number): void {
  if ((model.steers?.length ?? 0) > 0) craft.turn += (steer * WHEEL_LOCK - craft.turn) * (1 - Math.exp(-12 * dt));
  else craft.turn = 0;
  for (const part of model.steers ?? []) part.rotation.z = craft.turn;
  for (const needle of model.needles ?? []) {
    const read = NEEDLE_REST + NEEDLE_SWEEP * Math.min(1, Math.abs(craft.speed) / Math.max(1, handling.top));
    needle.rotation.z += (read - needle.rotation.z) * (1 - Math.exp(-6 * dt));
  }
}

/**
 * Buoyant: the keys ask for a slow climb or sink, and with neither it holds
 * its height. Parked, it settles to the ground. Aloft, the wind carries it,
 * all of it with the throttle let go and some of it under way.
 */
function floatRadial(craft: Craft, config: MotionConfig, up: THREE.Vector3, controls: Controls | null, dt: number, ground: number, from: number, throttle: number): number {
  const { handling, wind } = config;
  let radial = from;
  const wanted = controls === null ? -handling.sink * 0.6 : controls.climb ? handling.climb : controls.descend ? -handling.sink : 0;
  if (!craft.airborne && wanted > 0) craft.airborne = true;
  if (craft.airborne) {
    craft.vertical += (wanted - craft.vertical) * Math.min(1, dt * 0.9);
    radial += craft.vertical * dt;
    if (wind !== null && wind.speed > 0) {
      const north = scratchNorth.set(0, 1, 0).addScaledVector(up, -up.y);
      if (north.lengthSq() < 1e-8) north.set(1, 0, 0).addScaledVector(up, -up.x);
      north.normalize();
      // East is north x up in this project's frame (`sphere.ts`).
      const east = scratchEast.crossVectors(north, up).normalize();
      const b = (wind.toward * Math.PI) / 180;
      const drift = scratchDrift.copy(east).multiplyScalar(Math.sin(b)).addScaledVector(north, Math.cos(b));
      craft.position.addScaledVector(drift, wind.speed * 0.35 * (throttle === 0 ? 1 : 0.4) * dt);
      radial = Math.max(radial, ground);
    }
    radial = Math.min(radial, ground + AEROSTAT_CEILING);
    if (radial <= ground) {
      radial = ground;
      if (craft.vertical <= 0) {
        craft.airborne = false;
        craft.vertical = 0;
      }
    }
  } else {
    craft.vertical = 0;
    radial = ground;
    craft.speed *= Math.exp(-3 * dt);
  }
  return radial;
}

/**
 * Earth's plane's climb (`PLANE_CLIMB_MIN`): the keys ask for a vertical speed
 * that grows with the height and eases into `PLANE_CEILING`, and coming down
 * it flares to `PLANE_TOUCHDOWN`. Let go of in the air, a ship comes down by
 * the same law and parks.
 */
function flyRadial(craft: Craft, config: MotionConfig, state: MotionState, controls: Controls | null, dt: number, ground: number, from: number, R: number): number {
  const { handling, saucer } = config;
  let radial = from;
  const clearance = Math.max(0, radial - ground);
  const authority = Math.max(PLANE_CLIMB_MIN, handling.climb, clearance * PLANE_CLIMB_RATE);
  const headroom = Math.max(0, R + PLANE_CEILING - radial) * PLANE_CLIMB_RATE;
  const down = -Math.min(authority, Math.max(PLANE_TOUCHDOWN, clearance * PLANE_FLARE));
  const wanted = controls === null ? down : controls.climb ? Math.min(authority * (1 + state.burn), headroom) : controls.descend ? down : 0;
  if (craft.airborne) {
    // The thrusters chase the asked-for climb, as the plane's stick does.
    craft.vertical += (wanted - craft.vertical) * (1 - Math.exp(-dt / (saucer ? SAUCER_VERTICAL_TIME : PLANE_VERTICAL_TIME)));
  } else if (wanted > 0) {
    craft.vertical = wanted * 0.5;
    craft.airborne = true;
  } else craft.vertical = 0;
  radial = Math.min(Math.max(R + PLANE_CEILING, radial), radial + craft.vertical * dt);
  if (radial <= ground) {
    radial = ground;
    if (craft.airborne && craft.vertical <= 0) {
      craft.airborne = false;
      craft.vertical = 0;
    }
  }
  if (!craft.airborne) craft.speed *= Math.exp(-2.5 * dt);
  return radial;
}

/** On the ground: hold to it, leave it over a crest and fall at the world's own gravity, land again. */
function rollRadial(craft: Craft, gravity: number, dt: number, ground: number, from: number): number {
  let radial = from;
  if (craft.airborne) {
    craft.vertical -= gravity * dt;
    radial += craft.vertical * dt;
    if (radial <= ground) {
      radial = ground;
      craft.airborne = false;
      craft.vertical = 0;
    }
  } else if (radial - ground > 0.6 && Math.abs(craft.speed) > 8) {
    craft.airborne = true;
    craft.vertical = 0;
  } else radial = ground;
  return radial;
}

/**
 * The flames (a pilot light idling in the air, the whole length on the
 * afterburner, flickering, and out on the ground), a ship's legs (folded away
 * once well clear of the ground), and the model's own animation.
 */
function animateParts(craft: Craft, model: Model, state: MotionState, dt: number, clearance: number, top: number): void {
  if (model.flames.length > 0) {
    state.flicker += dt;
    const lit = craft.airborne ? 0.18 + 0.82 * state.burn : 0;
    for (const [k, flame] of model.flames.entries()) {
      flame.visible = lit > 0.02;
      const wobble = 1 + 0.12 * Math.sin(state.flicker * 47 + k * 2.1) + 0.06 * Math.sin(state.flicker * 83 + k);
      flame.scale.set(0.75 + 0.35 * lit, 0.75 + 0.35 * lit, FLAME_LENGTH * lit * wobble);
    }
  }
  if (model.gear !== null) model.gear.visible = !craft.airborne || clearance < 6;
  model.animate?.(dt, { airborne: craft.airborne, over: clearance, pace: Math.min(1, Math.abs(craft.speed) / Math.max(1, top)), burn: state.burn });
}
