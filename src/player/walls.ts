/**
 * The walls laid flat: the settlements' and the air's collision callbacks expressed in a tangent plane at the player, which is what `slide` works in.
 */
import * as THREE from 'three';
import { slide } from '../scenery/solids.ts';
import type { Body, Walls } from '../scenery/solids.ts';
import type { PlayerCore } from './core.ts';

export function createWalls(core: PlayerCore) {
  const {
    airPushed,
    collide,
    collideAloft,
    forward,
    freeSpotNear,
    motion,
    moved,
    position,
    pushed,
    query,
    spot,
    up,
  } = core;
  const s = core.fields;

  // `slide` works in a plane and the planet is not one, so each frame puts a
  // tangent plane at the player (`flatX` along the facing, `flatZ` beside it)
  // and these translate between the two. A frame covers 13 units at most on foot,
  // over which the plane misses the sphere by 0.005.
  const origin = new THREE.Vector3();
  const flatX = new THREE.Vector3();
  const flatZ = new THREE.Vector3();
  const body: Body = { x: 0, z: 0, vx: 0, vz: 0 };

  function onSphere(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(origin).addScaledVector(flatX, x).addScaledVector(flatZ, z).setLength(origin.length());
  }

  /** The walls for a body on the ground, or null when nothing is solid. */
  const walls: Walls | null = collide === undefined ? null : {
    collide(x, z, radius, push) {
      const hit = collide(onSphere(x, z, query), radius, pushed);
      push.x = pushed.dot(flatX);
      push.z = pushed.dot(flatZ);
      return hit;
    },
    freeSpot: freeSpotNear === undefined ? undefined : (x, z, radius, out) => {
      if (!freeSpotNear(onSphere(x, z, query), radius, spot)) return false;
      spot.setLength(origin.length()).sub(origin);
      out.x = spot.dot(flatX);
      out.z = spot.dot(flatZ);
      return true;
    },
  };

  /** Asks the walls in the air at one point, of a body of `radius`, into `push`: through `collide` while low, `collideAloft` above, and the envelope too when it has one. */
  function airHit(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean {
    push.set(0, 0, 0);
    let hit = false;
    const low = s.airLow ? collide : undefined;
    point.setLength(s.airHeight);
    if (low !== undefined) hit = low(point, radius, push);
    else if (collideAloft !== undefined) hit = collideAloft(point, radius, push);
    if (s.airEnvelope > 0 && collideAloft !== undefined) {
      point.setLength(s.airEnvelopeHeight);
      if (collideAloft(point, s.airEnvelope, airPushed)) {
        push.add(airPushed);
        hit = true;
      }
    }
    return hit;
  }

  /** The walls for a craft in the air, asked at `fields.airHeight`: the basket's floor or the plane's wheels, and the envelope. No free spot: nothing in the air was put inside a wall. */
  const airWalls: Walls | null = collide === undefined && collideAloft === undefined ? null : {
    collide(x, z, radius, push) {
      const hit = airHit(onSphere(x, z, query), radius, pushed);
      push.x = pushed.dot(flatX);
      push.z = pushed.dot(flatZ);
      return hit;
    },
  };

  /** The frame's move through whatever is standing: `moved` becomes the displacement and `motion` what the walls left of it. True if a wall was touched. */
  function throughWalls(dt: number, walls: Walls, radius: number): boolean {
    origin.copy(position);
    flatX.copy(forward);
    flatZ.crossVectors(up, flatX).normalize();
    body.x = 0;
    body.z = 0;
    body.vx = motion.dot(flatX);
    body.vz = motion.dot(flatZ);
    const outcome = slide(body, dt, radius, walls);
    moved.copy(flatX).multiplyScalar(body.x).addScaledVector(flatZ, body.z);
    motion.copy(flatX).multiplyScalar(body.vx).addScaledVector(flatZ, body.vz);
    return outcome !== 'clear';
  }

  return { walls, airWalls, airHit, throughWalls };
}

export type WallChecks = ReturnType<typeof createWalls>;
