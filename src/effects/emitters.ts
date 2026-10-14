/** What each kind of vehicle, and each event, leaves behind it. */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { PLANE_CRUISE_LOW, BOAT_BOOST, CAR_BOOST } from '../vehicles.ts';
import type { SmokeVisitor } from './types.ts';
import { H, FOAM_COLOR, REACH, FALL, WASH_REACH, SMOKE_RATE } from './constants.ts';
import { E_EXHAUST, E_SPRAY, E_TRAIL, E_CONTRAIL, E_FLAME, E_ROOSTER, E_WASH } from './layout.ts';
import { rand, clamp } from './helpers.ts';
import type { Pools } from './pools.ts';
import { createSpawners } from './spawn.ts';

export function createEmitters(fx: Pools) {
  const { ribbonActive, eye, at, vel, delta } = fx;
  const { spawnPuff, spawnDisc, pushPoint, local, addAcross, owed, spaced, shareOf } = createSpawners(fx);
  /* --- what each kind leaves ------------------------------------------- */

  /**
   * A fire's smoke: a thin grey column, a puff every half second or so, that
   * drifts and swells as it climbs. Only inside `REACH` of the camera, like
   * anybody else's exhaust; the rate is a chance a frame rather than a slot,
   * because a fire has no row of its own to carry what it owes.
   */
  const smoke: SmokeVisitor = (mouth, up) => {
    if (mouth.distanceToSquared(eye) > REACH * REACH) return;
    if (Math.random() > SMOKE_RATE * fx.frameDt) return;
    at.copy(mouth);
    addAcross(up, rand(0, H * 0.04), at);
    vel.copy(up).multiplyScalar(rand(1.2, 2));
    addAcross(up, rand(0.2, 0.7), vel);
    spawnPuff(at, vel, up, rand(3, 4), H * 0.05, H * rand(0.26, 0.36), 0.45, Math.random() < 0.6 ? PALETTE.bone : PALETTE.cream, 0, 0.35, 0.5);
  };

  /**
   * A boat's wake: a ribbon off the stern that widens and hollows behind it,
   * and one from each of the bow's shoulders whose points are pushed outward,
   * so the two angle away — the V; and at speed, spray thrown up off the bow
   * and falling back. `ribbons` are the stern's and the shoulders'.
   */
  function wake(
    slots: Float64Array, ribbons: Int32Array, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3,
    speed: number, run: number, length: number, width: number, dt: number,
  ): void {
    if (speed < 1.5) return;
    const k = clamp(speed / BOAT_BOOST, 0, 1);
    const spacing = Math.max(width * 0.5, speed * 0.03);
    const trailLife = 2.5 + 2.5 * k;
    const veeLife = 1.8 + 1.8 * k;
    for (let j = 0, n = spaced(slots, E_TRAIL, run, spacing); j < n; j++) {
      const share = shareOf(j);
      if (ribbons[0]! >= 0) {
        local(origin, fwd, up, side, 0, 0, -length * 0.45, at, share);
        vel.copy(fwd).multiplyScalar(speed * 0.1);
        pushPoint(ribbons[0]!, at, vel, side, trailLife, width * 0.3, width * (0.55 + 0.45 * k), 1.2, 1);
      }
      for (let hand = -1; hand <= 1; hand += 2) {
        const ribbon = ribbons[hand < 0 ? 1 : 2]!;
        if (ribbon < 0) continue;
        local(origin, fwd, up, side, hand * width * 0.5, 0, length * 0.2, at, share);
        vel.copy(side).multiplyScalar(hand * speed * 0.2);
        pushPoint(ribbon, at, vel, side, veeLife, width * 0.07, width * (0.14 + 0.08 * k), 0.6, 0);
      }
    }
    // The emitter ran this frame, whether or not it owed a point: the next
    // point joins the last one.
    for (let i = 0; i < 3; i++) if (ribbons[i]! >= 0) ribbonActive[ribbons[i]!] = fx.frame;
    if (k > 0.4) {
      for (let j = 0, n = owed(slots, E_SPRAY, 16 * k, dt); j < n; j++) {
        const hand = Math.random() < 0.5 ? -1 : 1;
        local(origin, fwd, up, side, hand * width * 0.45, 0.2, length * 0.35, at, (j + 0.5) / n);
        vel.copy(fwd).multiplyScalar(speed * 0.7).addScaledVector(side, hand * rand(3, 7) * k).addScaledVector(up, rand(4, 7));
        spawnPuff(at, vel, up, rand(0.45, 0.65), H * 0.05, H * 0.11, 0.4, FOAM_COLOR, 0, 1.5, -FALL);
      }
    }
  }

  /** A plane's trail: balls of smoke off the tail, larger the faster it goes, so the trail still reads from the framing a fast plane is seen at. */
  function contrail(
    slots: Float64Array, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3,
    speed: number, run: number, length: number, height: number, throttle: number,
  ): void {
    const grow = clamp(1 + (speed / PLANE_CRUISE_LOW - 1) * 0.35, 1, 8);
    const spacing = Math.max(length * 0.22, speed * 0.045) * (throttle > 0 ? 0.65 : 1);
    for (let j = 0, n = spaced(slots, E_CONTRAIL, run, spacing); j < n; j++) {
      local(origin, fwd, up, side, rand(-0.05, 0.05) * length, height * 0.35, -length * 0.55, at, shareOf(j));
      vel.set(0, 0, 0);
      spawnPuff(at, vel, up, 2.4, length * 0.07 * grow, length * 0.13 * grow, 0.15, FOAM_COLOR, 0, 0, 0.6);
    }
  }

  /** A car's exhaust: a puff or two a second idling, a stream under the throttle. */
  function exhaust(
    slots: Float64Array, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3,
    speed: number, push: number, v: THREE.Vector3, length: number, width: number, height: number, dt: number,
  ): void {
    const rate = 2.5 + 12 * clamp(push / 20, 0, 1) + (Math.abs(speed) / CAR_BOOST) * 3;
    const hard = push > 12;
    for (let j = 0, n = owed(slots, E_EXHAUST, rate, dt); j < n; j++) {
      local(origin, fwd, up, side, width * 0.28, height * 0.16, -length * 0.5, at, (j + 0.5) / n);
      vel.copy(v).multiplyScalar(0.25).addScaledVector(fwd, -rand(1.5, 3)).addScaledVector(up, rand(0.5, 1.5));
      spawnPuff(at, vel, up, rand(0.7, 1.0), H * 0.05, H * (hard ? 0.2 : 0.14), 0.35, hard ? PALETTE.bone : PALETTE.cream, 0, 2, 2.5);
    }
  }

  /** Dust off both rear wheels, or tyre smoke in a hard turn: `hex` is its colour, `rate` how much a second. */
  function wheels(
    slots: Float64Array, slot: number, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3,
    v: THREE.Vector3, length: number, width: number, rate: number, hex: number, size: number, dt: number,
  ): void {
    for (let j = 0, n = owed(slots, slot, rate, dt); j < n; j++) {
      const hand = Math.random() < 0.5 ? -1 : 1;
      local(origin, fwd, up, side, hand * width * 0.45, 0.15, -length * 0.35, at, (j + 0.5) / n);
      vel.copy(v).multiplyScalar(0.12).addScaledVector(up, rand(1, 3));
      addAcross(up, rand(0.5, 2), vel);
      spawnPuff(at, vel, up, rand(0.9, 1.3), size * 0.4, size, 0.4, hex, 0, 1.6, 0.6);
    }
  }

  /** The burner, climbing: flame licking up from the coil into the envelope's mouth, lit by itself. */
  function flame(slots: Float64Array, origin: THREE.Vector3, up: THREE.Vector3, burner: readonly [number, number], dt: number): void {
    const [from, to] = burner;
    for (let j = 0, n = owed(slots, E_FLAME, 40, dt); j < n; j++) {
      at.copy(origin).addScaledVector(up, from).addScaledVector(delta, (j + 0.5) / n - 1);
      addAcross(up, H * 0.02, at);
      const life = rand(0.18, 0.28);
      vel.copy(up).multiplyScalar((to - from) / life);
      const hex = Math.random() < 0.4 ? PALETTE.gold : Math.random() < 0.6 ? PALETTE.apricot : PALETTE.orange;
      spawnPuff(at, vel, up, life, H * 0.07, H * 0.12, 0.3, hex, 1, 0, 0);
    }
  }

  /**
   * A jet ski's rooster tail: the jet's water thrown up and back off the
   * stern, a plume taller and thicker the faster it goes, falling back as
   * spray; and a skid of foam at the waterline under it.
   */
  function rooster(slots: Float64Array, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3, speed: number, length: number, dt: number): void {
    const k = clamp(speed / 40, 0, 1.6);
    if (k < 0.15) return;
    for (let j = 0, n = owed(slots, E_ROOSTER, 40 * k, dt); j < n; j++) {
      local(origin, fwd, up, side, rand(-0.1, 0.1), 0.15, -length * 0.5, at, (j + 0.5) / n);
      vel.copy(fwd).multiplyScalar(speed * 0.35).addScaledVector(fwd, -rand(4, 8) * k).addScaledVector(up, rand(6, 10) * k);
      addAcross(up, rand(0.3, 1.2), vel);
      spawnPuff(at, vel, up, rand(0.6, 0.9), H * 0.05, H * (0.1 + 0.08 * k), 0.4, FOAM_COLOR, 0, 1.2, -FALL);
    }
  }

  /**
   * A helicopter's downwash, low over the ground: rings racing out over water
   * and spray blown off it, or dust and grass blown out along the ground,
   * stronger the lower it is.
   */
  function downwash(slots: Float64Array, origin: THREE.Vector3, up: THREE.Vector3, over: number, water: boolean, reach: number, dt: number): void {
    const k = clamp(1 - over / WASH_REACH, 0, 1);
    if (k <= 0) return;
    const ground = at;
    for (let j = 0, n = owed(slots, E_WASH, (water ? 10 : 16) * k, dt); j < n; j++) {
      ground.copy(origin).addScaledVector(up, -over);
      if (water) {
        vel.set(0, 0, 0);
        spawnDisc(ground, vel, 0.9, reach * 0.3, reach * (0.8 + 0.4 * k), 0.8, 0);
        addAcross(up, rand(reach * 0.4, reach * 0.8), ground);
        vel.copy(up).multiplyScalar(rand(2, 4));
        addAcross(up, rand(6, 12) * k, vel);
        spawnPuff(ground, vel, up, rand(0.4, 0.6), H * 0.05, H * 0.1, 0.4, FOAM_COLOR, 0, 1.5, -FALL);
      } else {
        const hex = fx.paved ? PALETTE.bone : fx.dust ?? PALETTE.bone;
        addAcross(up, rand(reach * 0.3, reach * 0.7), ground);
        vel.copy(up).multiplyScalar(rand(0.5, 1.5));
        addAcross(up, rand(5, 10) * k, vel);
        spawnPuff(ground, vel, up, rand(0.6, 1), H * 0.08, H * rand(0.25, 0.4), 0.35, hex, 0, 2.5, 0.4);
      }
    }
  }

  return { smoke, wake, contrail, exhaust, wheels, flame, rooster, downwash };
}
