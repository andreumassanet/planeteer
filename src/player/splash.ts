/**
 * The ring left on the water or the ground by a swimmer going in, a take-off or a landing.
 */
import * as THREE from 'three';
import {
  CRAFT_SPLASH,
  SPLASH_FLAT,
  SPLASH_RISE,
  SPLASH_START,
  SPLASH_TIME,
  SWIM_SPLASH,
} from './constants.ts';
import { mix } from './math.ts';
import type { PlayerCore } from './core.ts';

export function createSplash(core: PlayerCore) {
  const { object, position, splash } = core;
  const s = core.fields;

  /** Where a splash goes, and the up it lies across. */
  const wakeUp = new THREE.Vector3();
  const LOCAL_UP = new THREE.Vector3(0, 1, 0);

  /**
   * Starts the ring left behind, at `radius` under `at` (the sea's surface for a
   * swimmer, the ground for a plane), opening to `reach` units. It lies in the
   * world, not on the player, so a take-off climbs away from it.
   */
  function spray(radius: number, reach: number, at: THREE.Vector3 = position): void {
    const parent = object.parent;
    if (parent === null) return;
    if (splash.parent !== parent) parent.add(splash);
    wakeUp.copy(at).normalize();
    // A hair over the surface so the ring's foot is not coplanar with it.
    splash.position.copy(wakeUp).multiplyScalar(radius + 0.15);
    splash.quaternion.setFromUnitVectors(LOCAL_UP, wakeUp);
    s.splashReach = reach;
    splash.scale.set(reach * SPLASH_START, reach * SPLASH_RISE, reach * SPLASH_START);
    // A scale and a rotation, so this cannot be a reflection — and a
    // reflection is exactly the one thing the ink would draw as a solid blob.
    splash.updateMatrix();
    if (splash.matrix.determinant() <= 0) throw new Error('player: the splash ring would be mirrored');
    splash.visible = true;
    s.splashAge = 0;
  }

  /** How wide the ring a craft leaves opens: past its wingtips, or its hull. */
  function craftSplash(): number {
    return s.ride === null ? SWIM_SPLASH : Math.max(s.ride.model.size[0], s.ride.model.size[1]) * CRAFT_SPLASH;
  }

  /** Opens and fades the ring. */
  function ripple(dt: number): void {
    if (s.splashAge >= SPLASH_TIME) return;
    s.splashAge += dt;
    if (s.splashAge >= SPLASH_TIME) {
      splash.visible = false;
      return;
    }
    const t = s.splashAge / SPLASH_TIME;
    const out = 1 - (1 - t) * (1 - t);
    const radius = mix(s.splashReach * SPLASH_START, s.splashReach, out);
    splash.scale.set(radius, mix(s.splashReach * SPLASH_RISE, SPLASH_FLAT, t), radius);
  }

  return { spray, craftSplash, ripple };
}

export type Splash = ReturnType<typeof createSplash>;
