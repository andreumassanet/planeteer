/**
 * The fields the rest of the game reads off the player, written after anything that changes them.
 */
import * as THREE from 'three';
import type { TravelMode } from '../controls.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { FOUNDER_TIME, ROAD_HANDLING } from '../vehicles.ts';
import { MAX_NOSE, MODE_OF, PLANE_BANK, isAir } from './constants.ts';
import { clamp } from './math.ts';
import { tierOf } from './drift.ts';
import type { PlayerCore } from './core.ts';

const nose = new THREE.Vector3();
/** The nose's pitch off the heading in an attitude with no yaw, continuous through a loop. */
function nosePitchOf(attitude: THREE.Quaternion): number {
  nose.set(0, 0, 1).applyQuaternion(attitude);
  return Math.atan2(nose.y, nose.z);
}

export function createPublish(core: PlayerCore) {
  const { position } = core;
  const s = core.fields;
  const euler = new THREE.Euler();

  /** The body's rotation in its bow's frame, as `ride-pose.ts` draws it: a plane's and a helicopter's aloft, else none. */
  function attitudeOf(kind: string | null, into: THREE.Quaternion): void {
    if (s.ride === null || s.grounded || (kind !== 'plane' && kind !== 'helicopter')) {
      into.identity();
      return;
    }
    if (kind === 'helicopter') into.setFromEuler(euler.set(s.nose, 0, s.lean));
    else if (s.aerobatic) into.copy(s.attitude);
    else {
      const nose = clamp(Math.atan2(s.climbRate, Math.max(Math.abs(s.speed), 1)), -MAX_NOSE, MAX_NOSE);
      into.setFromEuler(euler.set(-nose, 0, -s.roll * PLANE_BANK));
    }
  }

  /** The mode the keys and the HUD read: on foot, swimming, passenger, or the kind of vehicle driven. */
  function modeOf(): TravelMode {
    if (s.ride === null) return s.state === 'swim' ? 'swim' : 'foot';
    if (s.ride.seat !== 0) return 'passenger';
    return MODE_OF[s.ride.model.kind];
  }

  /** Copies the controller's fields to the `Player` object. */
  function publish(): void {
    const player = core.player;
    const kind = s.ride?.model.kind ?? null;
    player.velocity = s.velocity;
    player.speed = s.ride !== null && s.ride.seat === 0 ? s.speed : s.velocity;
    player.climb = s.climb;
    const wheels = s.ride !== null && s.ride.seat === 0 && ROAD_HANDLING[s.ride.model.kind] !== undefined;
    player.slip = wheels ? s.drift.slide : 0;
    player.driftTier = wheels && s.drift.loose >= 0.5 ? tierOf(s.drift.charge) : -1;
    player.boost = wheels ? s.drift.boost : 0;
    player.parachute = s.chute;
    player.canopy = s.chute && s.canopy > 0;
    player.airborne = kind !== null && isAir(kind) ? !s.grounded : s.airborne;
    player.sunk = s.ride !== null && s.founder >= FOUNDER_TIME;
    player.foundering = s.ride !== null ? s.founder : -1;
    player.state = s.state;
    player.mode = modeOf();
    player.ride = s.ride;
    player.grounded = s.grounded;
    player.sink = s.sink;
    player.depth = s.state === 'swim' || s.ride?.model.kind === 'submarine' ? s.dive : 0;
    player.altitude = position.length() - PLANET_RADIUS;
    player.clearance = s.ride !== null && s.ride.model.kind === 'helicopter' && !s.grounded ? s.clearance : Infinity;
    player.overWater = s.overWater;
    player.aerobatic = s.aerobatic && s.ride !== null;
    player.nosePitch = player.aerobatic ? nosePitchOf(s.attitude) : 0;
    attitudeOf(kind, player.attitude);
  }

  return { modeOf, publish };
}

export type Publish = ReturnType<typeof createPublish>;
