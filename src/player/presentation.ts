/**
 * How the body and its ride look this frame: placed on the surface frame, swimming, falling, or walking.
 */
import * as THREE from 'three';
import { WALK_SPEED } from '../avatar.ts';
import { CHUTE_GRIP, CHUTE_PULL, trailOf } from '../craft/parachute.ts';
import { DIVE_PITCH, SINK_RATE, SWIM_DEPTH, UNDER_FROM } from './constants.ts';
import { approach, clamp } from './math.ts';
import type { PlayerCore } from './core.ts';
import type { Splash } from './splash.ts';
import type { RidePose } from './ride-pose.ts';
import type { Chute } from './chute.ts';

export function createPresentation(core: PlayerCore, ring: Splash, ridePose: RidePose, chute: Chute) {
  const {
    avatar,
    chuteSwing,
    chuteTrail,
    craft,
    cues,
    forward,
    hang,
    object,
    options,
    position,
    seat,
    side,
    up,
  } = core;
  const s = core.fields;
  const { ripple } = ring;
  const { poseRide } = ridePose;
  const { swingChute } = chute;
  const basis = new THREE.Matrix4();
  const hangFrom = new THREE.Vector3();

  /** Places the player object on the surface frame and poses everything under it for the frame. */
  function pose(dt: number, speed_: number): void {
    // The basis is right-handed with the avatar facing +Z, which puts local +X
    // on its left. Rolling about +Z therefore leans it right, and a left turn
    // (a positive rotation about `up`) needs a negative roll.
    side.crossVectors(up, forward).normalize();
    basis.makeBasis(side, up, forward);
    if (basis.determinant() <= 0) throw new Error('player: the frame would be mirrored');
    object.quaternion.setFromRotationMatrix(basis);
    object.position.copy(position);

    ripple(dt);
    craft.position.set(0, 0, 0);
    craft.rotation.set(0, 0, 0);
    // On foot the body stands on the origin and owns its own offset: only a
    // *seat* is the vehicle's to place.
    seat.position.set(0, 0, 0);
    seat.rotation.set(0, 0, 0);

    if (s.ride !== null) {
      s.sink = 0;
      hang.position.set(0, 0, 0);
      poseRide(s.ride, dt, speed_);
      return;
    }

    if (s.state === 'swim') {
      // The group hangs chest deep, which is what the camera frames; the
      // body's own clips, a crawl and treading water, are drawn with the
      // waterline at their origin, and `swim` gives the depth back to them.
      s.sink += (SWIM_DEPTH - s.sink) * approach(SINK_RATE, dt);
      s.under += ((s.dive > UNDER_FROM ? 1 : 0) - s.under) * approach(3, dt);
      avatar.swim(dt, speed_, s.sink, s.under);
      s.swell += dt;
      // A swell at the surface; under it, nothing lifts him but his own kick.
      craft.position.y = Math.sin(s.swell * 1.7) * 0.08 * (1 - s.under);
      // Nose down going down and up coming up, from the way he is actually
      // going: the dive's rate against his speed through the water. Pitched
      // about the chest, where the body hangs, not about the surface point.
      const pitch = clamp(Math.atan2(s.diveRate, Math.max(speed_, 2)), -DIVE_PITCH, DIVE_PITCH) * s.under;
      seat.position.set(0, -s.sink * 0.5, 0);
      seat.rotation.set(pitch, 0, 0);
      hang.position.y = -s.sink * 0.5;
      craft.rotation.z = s.lean * 0.5;
      return;
    }

    if (s.chute) {
      // Out of an aircraft: the fall's pose, and the canopy's hanging from
      // the hands, which swings with a turn about them as the canopy does.
      s.sink = 0;
      hang.position.y = 0;
      swingChute(dt);
      const swung = chuteSwing;
      trailOf(swung, s.lean, s.spread, chuteTrail);
      avatar.skydive(dt, s.spread, s.steering, CHUTE_GRIP, CHUTE_PULL, chuteTrail);
      // Swung about the hands, where the lines end.
      const pivot = CHUTE_GRIP[1] * s.spread;
      craft.rotation.set(swung.pitch * s.spread, 0, s.lean + (swung.roll - s.lean) * s.spread);
      hangFrom.set(0, pivot, 0).applyEuler(craft.rotation);
      craft.position.set(-hangFrom.x, pivot - hangFrom.y, -hangFrom.z);
      return;
    }

    // Back on the feet coming out of the water, over a moment rather than a frame.
    s.sink += (0 - s.sink) * approach(SINK_RATE * 2, dt);
    if (s.sink < 1e-3) s.sink = 0;
    hang.position.y = -s.sink;
    // On foot the avatar owns its own vertical bob and lateral sway, so `craft`
    // carries only the roll of a turn.
    avatar.stride(dt, speed_, s.airborne, cues);
    // A heel strike at each half of the cycle; see `Avatar.phase`.
    const stepPhase = avatar.phase;
    if (!s.airborne && speed_ > WALK_SPEED * 0.3 && Math.floor(stepPhase * 2) !== Math.floor(s.lastStep * 2)) {
      options.onStep?.(speed_ / WALK_SPEED);
    }
    s.lastStep = stepPhase;
    craft.rotation.z = s.lean;
  }

  return { pose };
}

export type Presentation = ReturnType<typeof createPresentation>;
