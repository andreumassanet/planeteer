/** One-off bursts: splashes, dust, crashes, a dust devil and a rocket's plume. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { H, FOAM_RADIUS, FOAM_COLOR, REACH, PLUME_REACH, FALL, FRAME_BURST } from './constants.ts';
import { rand, clamp } from './helpers.ts';
import type { Pools } from './pools.ts';
import { createSpawners } from './spawn.ts';

export function createBursts(fx: Pools) {
  const { eye, at, vel, centre, burstUp, e1, e2 } = fx;
  const { spawnPuff, spawnDisc, spawnDebris, addAcross } = createSpawners(fx);

  /** Puffs owed at `rate` a second over `dt`, carried in `carry[slot]`. */
  function owedIn(carry: Float64Array, slot: number, rate: number, dt: number): number {
    const due = carry[slot]! + rate * dt;
    const n = Math.min(FRAME_BURST, Math.floor(due));
    carry[slot] = due - Math.floor(due);
    return n;
  }

  /** A dust devil: see `Effects.whirl`. */
  function whirl(carry: Float64Array, base: THREE.Vector3, up: THREE.Vector3, height: number, hex: number, dt: number): void {
    if (base.distanceToSquared(eye) > REACH * REACH) return;
    e1.set(0, 1, 0).cross(up);
    if (e1.lengthSq() < 1e-8) e1.set(1, 0, 0);
    e1.normalize();
    e2.crossVectors(up, e1);
    for (let j = 0, n = owedIn(carry, 0, 22, dt); j < n; j++) {
      // Up the column at a share of its height, a little out from its axis,
      // and thrown round it — wider the higher it starts, as a funnel is.
      const share = Math.random();
      const turn = Math.random() * Math.PI * 2;
      const out = H * (0.25 + 1.4 * share);
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      at.copy(base).addScaledVector(up, height * share * 0.7).addScaledVector(e1, c * out).addScaledVector(e2, sn * out);
      // Round it (the tangent) and up it.
      vel.set(0, 0, 0).addScaledVector(e1, -sn * 9).addScaledVector(e2, c * 9).addScaledVector(up, rand(4, 8));
      const shade = Math.random() < 0.5 ? hex : PALETTE.bone;
      spawnPuff(at, vel, up, rand(1.2, 2), H * (0.12 + 0.2 * share), H * (0.35 + 0.5 * share), 0.5, shade, 0, 1.2, 1.5);
    }
  }

  /** A rocket's flame and smoke: see `Effects.plume`. */
  function plume(carry: Float64Array, mouth: THREE.Vector3, up: THREE.Vector3, power: number, clearance: number, dt: number): void {
    if (power <= 0.01 || mouth.distanceToSquared(eye) > PLUME_REACH * PLUME_REACH) return;
    const k = clamp(power, 0, 1);
    const low = clearance < H * 6;
    for (let j = 0, n = owedIn(carry, 0, 26 + 34 * k, dt); j < n; j++) {
      at.copy(mouth);
      addAcross(up, H * 0.08, at);
      const life = rand(0.22, 0.38);
      vel.copy(up).multiplyScalar(-(10 + 34 * k));
      addAcross(up, rand(0.5, 2), vel);
      const hex = Math.random() < 0.35 ? PALETTE.white : Math.random() < 0.5 ? PALETTE.gold : Math.random() < 0.6 ? PALETTE.apricot : PALETTE.orange;
      spawnPuff(at, vel, up, life, H * (0.12 + 0.12 * k), H * (0.28 + 0.22 * k), 0.4, hex, 1, 1.5, 0);
    }
    for (let j = 0, n = owedIn(carry, 1, (low ? 18 : 9) * (0.3 + 0.7 * k), dt); j < n; j++) {
      if (low) {
        // Down on the pad and out along the ground, every way at once.
        at.copy(mouth).addScaledVector(up, -Math.max(0, clearance - H * 0.3));
        addAcross(up, rand(0, H * 0.4), at);
        vel.set(0, 0, 0);
        addAcross(up, rand(6, 16) * (0.4 + 0.6 * k), vel);
        vel.addScaledVector(up, rand(0.5, 2.5));
      } else {
        at.copy(mouth).addScaledVector(up, -H * rand(0.3, 1.2));
        addAcross(up, H * 0.15, at);
        vel.copy(up).multiplyScalar(-rand(2, 6) * k);
        addAcross(up, rand(0.5, 2), vel);
      }
      const hex = Math.random() < 0.55 ? PALETTE.bone : PALETTE.cream;
      spawnPuff(at, vel, up, rand(2.6, 4.2), H * 0.25, H * rand(0.9, 1.5) * (0.6 + 0.4 * k), 0.4, hex, 0, 0.9, 0.6);
    }
  }

  /** A splash: spray thrown up and falling back, and a ring opening on the water. */
  function splash(point: THREE.Vector3, up: THREE.Vector3, reach: number, count: number): void {
    centre.copy(point);
    burstUp.copy(up);
    at.copy(burstUp).multiplyScalar(FOAM_RADIUS);
    vel.set(0, 0, 0);
    spawnDisc(at, vel, 1.1, reach * 0.35, reach, 0.72, 0);
    spawnDisc(at, vel, 1.6, reach * 0.15, reach * 0.6, 0, 0);
    for (let i = 0; i < count; i++) {
      at.copy(centre);
      addAcross(burstUp, rand(0, reach * 0.25), at);
      vel.copy(burstUp).multiplyScalar(rand(6, 11));
      addAcross(burstUp, rand(1.5, 4), vel);
      spawnPuff(at, vel, burstUp, rand(0.55, 0.8), H * 0.06, H * rand(0.1, 0.16), 0.45, FOAM_COLOR, 0, 1, -FALL);
    }
  }

  /** A burst of dust round `point`, low and spreading: a landing, a touchdown, a take-off. */
  function dustBurst(point: THREE.Vector3, up: THREE.Vector3, reach: number, count: number, hex: number, size: number): void {
    centre.copy(point);
    for (let i = 0; i < count; i++) {
      at.copy(centre);
      addAcross(up, rand(0, reach), at);
      vel.copy(up).multiplyScalar(rand(0.5, 2));
      addAcross(up, rand(2, 5), vel);
      spawnPuff(at, vel, up, rand(0.6, 1.0), size * 0.4, size * rand(0.8, 1.2), 0.35, hex, 0, 3, 0.5);
    }
  }

  /** A crash: chunky puffs out of the knock, and debris thrown up that tumbles, bounces and goes. */
  function crash(point: THREE.Vector3, up: THREE.Vector3, facing: THREE.Vector3, floor: number, strength: number): void {
    centre.copy(point);
    const puffsCount = Math.round(8 + 8 * strength);
    for (let i = 0; i < puffsCount; i++) {
      at.copy(centre);
      addAcross(up, rand(0, H * 0.3), at);
      vel.copy(facing).multiplyScalar(-rand(1, 4)).addScaledVector(up, rand(1, 4));
      addAcross(up, rand(3, 8) * strength, vel);
      const hex = fx.dust ?? (Math.random() < 0.5 ? PALETTE.bone : PALETTE.cream);
      spawnPuff(at, vel, up, rand(0.7, 1.1), H * 0.1, H * rand(0.25, 0.4) * (0.7 + 0.5 * strength), 0.4, hex, 0, 3, 1);
    }
    const pieces = Math.round(4 + 6 * strength);
    for (let i = 0; i < pieces; i++) {
      at.copy(centre).addScaledVector(up, H * 0.15);
      vel.copy(up).multiplyScalar(rand(6, 11) * (0.6 + 0.4 * strength)).addScaledVector(facing, -rand(2, 6));
      addAcross(up, rand(3, 9) * strength, vel);
      const hex = i % 3 === 0 ? PALETTE.steel : i % 3 === 1 ? PALETTE.bark : PALETTE.bone;
      spawnDebris(at, vel, up, floor, H * rand(0.05, 0.1), hex, rand(1.3, 1.9));
    }
  }

  /**
   * An aircraft wrecked: a flash, a fireball rolling up and out, black smoke
   * after it, the ground's dust thrown out low and chunky debris, all sized by
   * `size` (the craft's larger side) and `strength` 0 to 1.
   */
  function explosion(point: THREE.Vector3, up: THREE.Vector3, floor: number, size: number, strength: number): void {
    centre.copy(point);
    const k = 0.6 + 0.4 * clamp(strength, 0, 1);
    const big = Math.max(H, size * 0.5) * k;
    for (let i = 0; i < 4; i++) {
      at.copy(centre).addScaledVector(up, big * 0.3);
      vel.copy(up).multiplyScalar(rand(1, 3));
      spawnPuff(at, vel, up, rand(0.18, 0.3), big * 0.5, big * rand(1.3, 1.7), 0.2, PALETTE.white, 1, 4, 0);
    }
    for (let i = 0; i < 28; i++) {
      at.copy(centre).addScaledVector(up, rand(0, big * 0.4));
      addAcross(up, rand(0, big * 0.4), at);
      vel.copy(up).multiplyScalar(rand(4, 12) * k);
      addAcross(up, rand(6, 16) * k, vel);
      const pick = Math.random();
      const hex = pick < 0.2 ? PALETTE.white : pick < 0.45 ? PALETTE.gold : pick < 0.75 ? PALETTE.apricot : pick < 0.92 ? PALETTE.orange : PALETTE.red;
      spawnPuff(at, vel, up, rand(0.5, 0.95), big * 0.2, big * rand(0.55, 0.9), 0.3, hex, 1, 3.2, 2.5);
    }
    for (let i = 0; i < 22; i++) {
      at.copy(centre).addScaledVector(up, rand(big * 0.2, big * 0.8));
      addAcross(up, rand(0, big * 0.5), at);
      vel.copy(up).multiplyScalar(rand(3, 8));
      addAcross(up, rand(2, 7) * k, vel);
      const hex = Math.random() < 0.55 ? PALETTE.steel : Math.random() < 0.6 ? PALETTE.bark : PALETTE.slate;
      spawnPuff(at, vel, up, rand(2.6, 4.6), big * 0.3, big * rand(0.9, 1.5), 0.45, hex, 0, 1.3, 1.4);
    }
    dustBurst(centre, up, big * 0.9, 12, fx.dust ?? PALETTE.bone, big * 0.45);
    for (let i = 0; i < 14; i++) {
      at.copy(centre).addScaledVector(up, H * 0.3);
      vel.copy(up).multiplyScalar(rand(9, 20) * k);
      addAcross(up, rand(5, 14) * k, vel);
      const hex = i % 4 === 0 ? PALETTE.ink : i % 4 === 1 ? PALETTE.steel : i % 4 === 2 ? PALETTE.bark : PALETTE.orange;
      spawnDebris(at, vel, up, floor, H * rand(0.08, 0.18), hex, rand(1.6, 2.6));
    }
  }

  /** A wreck burning for `dt` at `power` 0 to 1: low flames licking up and a column of black smoke. `carry` is its own two counters. */
  function burn(carry: Float64Array, base: THREE.Vector3, up: THREE.Vector3, power: number, dt: number): void {
    if (power <= 0.01 || base.distanceToSquared(eye) > PLUME_REACH * PLUME_REACH) return;
    const k = clamp(power, 0, 1);
    for (let j = 0, n = owedIn(carry, 0, 9 * k, dt); j < n; j++) {
      at.copy(base).addScaledVector(up, H * 0.2);
      addAcross(up, rand(0, H * 0.5), at);
      vel.copy(up).multiplyScalar(rand(2, 5));
      addAcross(up, rand(0.2, 1), vel);
      const hex = Math.random() < 0.4 ? PALETTE.gold : Math.random() < 0.6 ? PALETTE.apricot : PALETTE.orange;
      spawnPuff(at, vel, up, rand(0.45, 0.8), H * 0.15, H * rand(0.3, 0.5) * (0.5 + 0.5 * k), 0.3, hex, 1, 2, 1.5);
    }
    for (let j = 0, n = owedIn(carry, 1, 3.5 * (0.3 + 0.7 * k), dt); j < n; j++) {
      at.copy(base).addScaledVector(up, H * rand(0.5, 1));
      addAcross(up, rand(0, H * 0.3), at);
      vel.copy(up).multiplyScalar(rand(2.5, 4.5));
      addAcross(up, rand(0.3, 1.2), vel);
      const hex = Math.random() < 0.6 ? PALETTE.steel : PALETTE.bark;
      spawnPuff(at, vel, up, rand(3.5, 5.5), H * 0.3, H * rand(1.1, 1.8) * (0.6 + 0.4 * k), 0.5, hex, 0, 0.8, 0.8);
    }
  }

  /** Into the water hard: a wide splash, a second ring and a tall column of spray. */
  function plunge(point: THREE.Vector3, up: THREE.Vector3, size: number, strength: number): void {
    const k = 0.6 + 0.4 * clamp(strength, 0, 1);
    splash(point, up, size * 1.2 * k, 30);
    splash(point, up, size * 0.6 * k, 10);
    centre.copy(point);
    for (let i = 0; i < 26; i++) {
      at.copy(centre);
      addAcross(up, rand(0, size * 0.3), at);
      vel.copy(up).multiplyScalar(rand(14, 24) * k);
      addAcross(up, rand(1, 5), vel);
      spawnPuff(at, vel, up, rand(0.9, 1.4), H * 0.12, H * rand(0.3, 0.5), 0.4, FOAM_COLOR, 0, 0.8, -FALL);
    }
  }

  return { whirl, plume, splash, dustBurst, crash, explosion, burn, plunge };
}
