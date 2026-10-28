/** Putting particles into the pools, and where and when an emitter owes one. */
import * as THREE from 'three';
import { MAX_PUFFS, MAX_DISCS, MAX_DEBRIS, MAX_RIBBONS, RIBBON_POINTS, FOAM_COLOR, FOAM_RADIUS, FRAME_BURST } from './constants.ts';
import { P_POS, P_VEL, P_UP, P_AGE, P_LIFE, P_S0, P_S1, P_HOLD, P_COLOR, P_GLOW, P_DRAG, P_RISE, P_ROT, P_STRIDE, F_POS, F_VEL, F_E1, F_E2, F_AGE, F_LIFE, F_R0, F_R1, F_RING, F_DRAG, F_STRIDE, R_POS, R_VEL, R_SIDE, R_AGE, R_LIFE, R_W0, R_W1, R_DRAG, R_LINK, R_HOLLOW, R_COLOR, R_STRIDE, D_POS, D_VEL, D_UP, D_AGE, D_LIFE, D_SIZE, D_COLOR, D_AXIS, D_SPIN, D_ANGLE, D_FLOOR, D_STRIDE } from './layout.ts';
import { rand, clamp, linearOf, p3, writeRotation } from './helpers.ts';
import type { Pools } from './pools.ts';

export function createSpawners(fx: Pools) {
  const { p, f, r, ribbonHead, ribbonCount, ribbonOwned, ribbonActive, ribbonBroken, ribbonOnGround, FIRST_FREE, d, stats, delta, foamUp, foamVel, foamE1, foamE2, e1, e2, quaternion, axis } = fx;
  function spawnPuff(
    pos: THREE.Vector3, v: THREE.Vector3, up: THREE.Vector3,
    life: number, s0: number, s1: number, hold: number,
    hex: number, glowing: number, drag: number, rise: number,
  ): void {
    if (fx.puffCount >= MAX_PUFFS) {
      stats.dropped++;
      return;
    }
    const o = fx.puffCount++ * P_STRIDE;
    p3(p, o + P_POS, pos.x, pos.y, pos.z);
    p3(p, o + P_VEL, v.x, v.y, v.z);
    p3(p, o + P_UP, up.x, up.y, up.z);
    p[o + P_AGE] = 0;
    p[o + P_LIFE] = life;
    p[o + P_S0] = s0;
    p[o + P_S1] = s1;
    p[o + P_HOLD] = hold;
    const color = linearOf(hex);
    p3(p, o + P_COLOR, color.r, color.g, color.b);
    p[o + P_GLOW] = glowing;
    p[o + P_DRAG] = drag;
    p[o + P_RISE] = rise;
    // A uniformly random rotation, from a random unit quaternion, written out
    // as its matrix: a rotation, so its determinant is +1 and the scale that
    // multiplies it every frame is positive.
    const u1 = Math.random(), u2 = Math.random() * Math.PI * 2, u3 = Math.random() * Math.PI * 2;
    const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
    quaternion.set(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
    writeRotation(p, o + P_ROT, quaternion);
  }

  /**
   * A disc on the water at `pos` (projected onto the foam's sphere), moving
   * along it at `v`; `ring` is how hollow it starts — 0 a disc, near 1 a ring.
   */
  function spawnDisc(pos: THREE.Vector3, v: THREE.Vector3, life: number, r0: number, r1: number, ring: number, drag: number): void {
    if (fx.discCount >= MAX_DISCS) {
      stats.dropped++;
      return;
    }
    const o = fx.discCount++ * F_STRIDE;
    foamUp.copy(pos).normalize();
    p3(f, o + F_POS, foamUp.x * FOAM_RADIUS, foamUp.y * FOAM_RADIUS, foamUp.z * FOAM_RADIUS);
    // Along the water only.
    foamVel.copy(v).addScaledVector(foamUp, -v.dot(foamUp));
    p3(f, o + F_VEL, foamVel.x, foamVel.y, foamVel.z);
    // Two axes on the water, at a random turn so no two discs line their
    // corners up; `e2 = up x e1`, which makes `e1 x e2` up and the winding
    // counter-clockwise from above.
    foamE1.set(0, 1, 0).cross(foamUp);
    if (foamE1.lengthSq() < 1e-8) foamE1.set(1, 0, 0);
    foamE1.normalize().applyAxisAngle(foamUp, Math.random() * Math.PI * 2);
    foamE2.crossVectors(foamUp, foamE1).normalize();
    p3(f, o + F_E1, foamE1.x, foamE1.y, foamE1.z);
    p3(f, o + F_E2, foamE2.x, foamE2.y, foamE2.z);
    f[o + F_AGE] = 0;
    f[o + F_LIFE] = life;
    f[o + F_R0] = r0;
    f[o + F_R1] = r1;
    f[o + F_RING] = ring;
    f[o + F_DRAG] = drag;
  }

  /**
   * A point on ribbon `ribbon`, joined to the one before it if the ribbon's
   * emitter ran last frame or earlier this one; a full ribbon gives up its
   * oldest point. On the water it is put on the foam's sphere and is white;
   * a ribbon on the ground keeps the height it is given and takes `hex`.
   */
  function pushPoint(
    ribbon: number, pos: THREE.Vector3, v: THREE.Vector3, side: THREE.Vector3,
    life: number, w0: number, w1: number, drag: number, hollow: number, hex = FOAM_COLOR,
  ): void {
    if (ribbonCount[ribbon] === RIBBON_POINTS) {
      ribbonHead[ribbon] = (ribbonHead[ribbon]! + 1) % RIBBON_POINTS;
      ribbonCount[ribbon] = RIBBON_POINTS - 1;
      // A skid mark's oldest point giving way is the mark wearing off, not a refusal.
      if (ribbonOnGround[ribbon] === 0) stats.dropped++;
    }
    const index = (ribbonHead[ribbon]! + ribbonCount[ribbon]!) % RIBBON_POINTS;
    const o = (ribbon * RIBBON_POINTS + index) * R_STRIDE;
    const joined = ribbonBroken[ribbon] === 0 && ribbonCount[ribbon]! > 0 && ribbonActive[ribbon]! >= fx.frame - 1;
    ribbonBroken[ribbon] = 0;
    ribbonCount[ribbon] = ribbonCount[ribbon]! + 1;
    foamUp.copy(pos).normalize();
    const lay = ribbonOnGround[ribbon] === 1 ? pos.length() : FOAM_RADIUS;
    p3(r, o + R_POS, foamUp.x * lay, foamUp.y * lay, foamUp.z * lay);
    foamVel.copy(v).addScaledVector(foamUp, -v.dot(foamUp));
    p3(r, o + R_VEL, foamVel.x, foamVel.y, foamVel.z);
    foamE1.copy(side).addScaledVector(foamUp, -side.dot(foamUp)).normalize();
    p3(r, o + R_SIDE, foamE1.x, foamE1.y, foamE1.z);
    r[o + R_AGE] = 0;
    r[o + R_LIFE] = life;
    r[o + R_W0] = w0;
    r[o + R_W1] = w1;
    r[o + R_DRAG] = drag;
    r[o + R_LINK] = joined ? 1 : 0;
    r[o + R_HOLLOW] = hollow;
    r[o + R_COLOR] = hex;
    ribbonActive[ribbon] = fx.frame;
  }

  /** A ribbon nobody holds and that has drained, for a newly followed boat; -1 if every one is busy. */
  function takeRibbon(): number {
    for (let i = FIRST_FREE; i < MAX_RIBBONS; i++) {
      if (ribbonOwned[i] === 0 && ribbonCount[i] === 0) {
        ribbonOwned[i] = 1;
        ribbonBroken[i] = 1;
        return i;
      }
    }
    return -1;
  }

  function spawnDebris(pos: THREE.Vector3, v: THREE.Vector3, up: THREE.Vector3, floor: number, size: number, hex: number, life: number): void {
    if (fx.debrisCount >= MAX_DEBRIS) {
      stats.dropped++;
      return;
    }
    const o = fx.debrisCount++ * D_STRIDE;
    p3(d, o + D_POS, pos.x, pos.y, pos.z);
    p3(d, o + D_VEL, v.x, v.y, v.z);
    p3(d, o + D_UP, up.x, up.y, up.z);
    d[o + D_AGE] = 0;
    d[o + D_LIFE] = life;
    d[o + D_SIZE] = size;
    const color = linearOf(hex);
    p3(d, o + D_COLOR, color.r, color.g, color.b);
    axis.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
    if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);
    axis.normalize();
    p3(d, o + D_AXIS, axis.x, axis.y, axis.z);
    d[o + D_SPIN] = rand(6, 14) * (Math.random() < 0.5 ? -1 : 1);
    d[o + D_ANGLE] = Math.random() * Math.PI * 2;
    d[o + D_FLOOR] = floor;
  }

  /* --- where, and when --------------------------------------------------- */

  /**
   * A point in a vehicle's frame — `x` to its right, `y` up, `z` forward —
   * into `out`, as it stood at `share` of the way through the frame's move:
   * the point now, walked back along `delta` by what of the move was still to
   * come. The turn within the frame is left out; at any frame rate the loop
   * runs, it is a few degrees.
   */
  function local(
    origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3,
    x: number, y: number, z: number, out: THREE.Vector3, share = 1,
  ): THREE.Vector3 {
    out.copy(origin).addScaledVector(side, x).addScaledVector(up, y).addScaledVector(fwd, z);
    if (share < 1) out.addScaledVector(delta, share - 1);
    return out;
  }

  /** A random direction along the ground at `up`, scaled by `length`, added to `out`. */
  function addAcross(up: THREE.Vector3, length: number, out: THREE.Vector3): THREE.Vector3 {
    e1.set(0, 1, 0).cross(up);
    if (e1.lengthSq() < 1e-8) e1.set(1, 0, 0);
    e1.normalize();
    e2.crossVectors(up, e1);
    const turn = Math.random() * Math.PI * 2;
    return out.addScaledVector(e1, Math.cos(turn) * length).addScaledVector(e2, Math.sin(turn) * length);
  }

  /**
   * Time-based: puffs owed at `rate` a second over `dt`, carried in
   * `slots[slot]` as a fraction of one. The `i`-th of `n` is put at
   * `(i + 0.5) / n` of the way through the frame.
   */
  function owed(slots: Float64Array, slot: number, rate: number, dt: number): number {
    const due = slots[slot]! + rate * dt;
    const whole = Math.floor(due);
    slots[slot] = due - whole;
    return Math.min(FRAME_BURST, whole);
  }


  /**
   * Distance-based: points or balls owed for `run` more units at one every
   * `spacing`, carried in `slots[slot]` as the units run since the last. The
   * `j`-th falls `firstAt + j * spacing` units into this frame's move.
   */
  function spaced(slots: Float64Array, slot: number, run: number, spacing: number): number {
    const total = slots[slot]! + run;
    const whole = Math.floor(total / spacing);
    fx.firstAt = spacing - slots[slot]!;
    fx.spacingNow = spacing;
    fx.runNow = run;
    slots[slot] = total - whole * spacing;
    return Math.min(FRAME_BURST, whole);
  }

  /** The share of the frame's move at which the `j`-th spaced emission falls. */
  const shareOf = (j: number): number => (fx.runNow > 1e-9 ? clamp((fx.firstAt + j * fx.spacingNow) / fx.runNow, 0, 1) : 1);

  return { spawnPuff, spawnDisc, pushPoint, takeRibbon, spawnDebris, local, addAcross, owed, spaced, shareOf };
}
