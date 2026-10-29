/**
 * Chasing an aircraft aloft in its own frame: behind and above it as its nose
 * and wings stand, the roll softened, eased so a loop or a roll swings the
 * lens round with it, the aim leading into a turn. Framed from high over the
 * map it fades back to the heading's level chase. The mouse still glances and
 * tilts, in that frame.
 */
import * as THREE from 'three';
import {
  FLIGHT_FADE_FROM,
  FLIGHT_FADE_TO,
  FLIGHT_FOLLOW_RATE,
  FLIGHT_LEAD_EASE,
  FLIGHT_LEAD_MAX,
  FLIGHT_ROLL_KEEP,
  FLIGHT_TURN_LEAD,
  MAX_ELEVATION_RIDING,
  MIN_ELEVATION_RIDING,
  PIVOT_HEIGHT,
} from './constants.ts';
import { approach, ramp } from './math.ts';
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

export function createFlightChase(core: CameraCore) {
  const { camera, desired, heading, pivot, target, view } = core;
  const s = core.fields;
  const side = new THREE.Vector3();
  const nose = new THREE.Vector3();
  const bodyUp = new THREE.Vector3();
  const level = new THREE.Vector3();
  const across = new THREE.Vector3();
  const local = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const lastForward = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const wanted = new THREE.Quaternion();
  const levelled = new THREE.Quaternion();
  /**
   * The lens's frame as it has turned so far: +Z the way it looks along, +Y
   * its up. It follows `wanted` through `midway`, two eases in a row, so a
   * turn begins and ends without a kink (critically damped, never a snap).
   */
  const frame = new THREE.Quaternion();
  const midway = new THREE.Quaternion();
  let following = false;
  /** How much of the aircraft's own frame the lens takes, eased the same way: 1 close behind, 0 the level chase high up. */
  let weightMid = 1;
  let weightNow = 1;
  /** The heading's rate of turn, radians a second, positive to the left, eased twice. */
  let turningMid = 0;
  let turning = 0;

  /** An aircraft in the air, with an attitude to follow. */
  function flying(player: CameraSubject): boolean {
    const kind = player.ride?.model.kind;
    return player.airborne && player.attitude !== undefined && (kind === 'plane' || kind === 'helicopter');
  }

  /** A vector of the body's frame, in the world: `v` in (side, up, forward). */
  function toWorld(v: THREE.Vector3, player: CameraSubject): void {
    v.set(
      side.x * v.x + player.up.x * v.y + player.forward.x * v.z,
      side.y * v.x + player.up.y * v.y + player.forward.y * v.z,
      side.z * v.x + player.up.z * v.y + player.forward.z * v.z,
    );
  }

  /** The turn the heading made since the last frame, as a rate, eased into `turning`. */
  function readTurn(player: CameraSubject, dt: number): void {
    if (!following) {
      turning = turningMid = 0;
    } else if (dt > 0) {
      cross.crossVectors(lastForward, player.forward);
      const turned = Math.atan2(cross.dot(player.up), lastForward.dot(player.forward));
      const ease = approach(2 * FLIGHT_LEAD_EASE, dt);
      turningMid += (turned / dt - turningMid) * ease;
      turning += (turningMid - turning) * ease;
    }
    lastForward.copy(player.forward);
  }

  /**
   * Where the lens wants to be: `pivot`, `desired` and `target`, in the
   * aircraft's frame as the lens has turned to it. False, and nothing written,
   * when this chase does not apply.
   */
  function place(player: CameraSubject, dt: number): boolean {
    if (!flying(player)) {
      following = false;
      return false;
    }
    const attitude = player.attitude!;
    side.crossVectors(player.up, player.forward).normalize();
    readTurn(player, dt);
    nose.set(0, 0, 1).applyQuaternion(attitude);
    toWorld(nose, player);
    bodyUp.set(0, 1, 0).applyQuaternion(attitude);
    toWorld(bodyUp, player);
    // The roll softened: the body's up leant towards the surface's, never all the way.
    level.copy(player.up).addScaledVector(nose, -nose.dot(player.up));
    bodyUp.addScaledVector(level, FLIGHT_ROLL_KEEP).normalize();
    across.crossVectors(bodyUp, nose).normalize();
    basis.makeBasis(across, bodyUp, nose);
    wanted.setFromRotationMatrix(basis);

    // High over the map, the heading's level chase; between the two modes the share eases.
    const base = Math.atan2(view.height, view.distance);
    const asked = player.aerobatic === true ? 1 : 1 - ramp(base, FLIGHT_FADE_FROM, FLIGHT_FADE_TO);
    const ease = approach(2 * FLIGHT_FOLLOW_RATE, dt);
    if (!following) weightMid = weightNow = asked;
    weightMid += (asked - weightMid) * ease;
    weightNow += (weightMid - weightNow) * ease;
    const weight = weightNow;
    if (weight < 1) {
      across.crossVectors(player.up, heading).normalize();
      basis.makeBasis(across, player.up, heading);
      levelled.setFromRotationMatrix(basis);
      wanted.copy(levelled.slerp(wanted, weight));
    }
    if (!following) {
      frame.copy(wanted);
      midway.copy(wanted);
    } else {
      midway.slerp(wanted, ease);
      frame.slerp(midway, ease);
    }
    following = true;

    s.pitch = Math.min(Math.max(s.pitch, Math.min(MIN_ELEVATION_RIDING, base) - base), MAX_ELEVATION_RIDING - base);
    // The glance is already in `heading`, which the level chase uses.
    local.set(0, view.height, -view.distance).applyAxisAngle(X, s.pitch).applyAxisAngle(Y, s.glance * weight).applyQuaternion(frame);
    pivot.copy(player.position).addScaledVector(player.up, PIVOT_HEIGHT);
    desired.copy(pivot).add(local);
    // The aim leads into the turn: a left turn is a positive rate and `side` is the left.
    // Held within its most by a smooth saturation, so a hard turn reaching it is no kink.
    const lead = FLIGHT_LEAD_MAX * Math.tanh((turning * FLIGHT_TURN_LEAD) / FLIGHT_LEAD_MAX) * weight;
    target.copy(pivot).addScaledVector(side, Math.tan(lead) * view.distance);
    return true;
  }

  /** Looks at the target, raised by what the ground raised the lens, rolled as the lens's frame is. */
  function aim(player: CameraSubject, lift: number): void {
    sample.copy(target).addScaledVector(player.up, lift);
    camera.up.set(0, 1, 0).applyQuaternion(frame);
    camera.lookAt(sample);
  }

  return { place, aim };
}

export type FlightChase = ReturnType<typeof createFlightChase>;
