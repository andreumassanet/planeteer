/** Ageing the pools and writing them into their meshes each frame. */
import { FALL } from './constants.ts';
import { P_POS, P_VEL, P_UP, P_AGE, P_LIFE, P_S0, P_S1, P_HOLD, P_COLOR, P_GLOW, P_DRAG, P_RISE, P_ROT, P_STRIDE, D_POS, D_VEL, D_UP, D_AGE, D_LIFE, D_SIZE, D_COLOR, D_AXIS, D_SPIN, D_ANGLE, D_FLOOR, D_STRIDE } from './layout.ts';
import { smooth, p3, writeRotation, markRange } from './helpers.ts';
import type { Pools } from './pools.ts';

export function createAdvance(fx: Pools) {
  const { glow, puffs, p, debris, d, anchor, at, vel, e1, upAt, quaternion, axis } = fx;
  function advancePuffs(dt: number): void {
    const matrices = puffs.instanceMatrix.array as Float32Array;
    const colors = puffs.instanceColor!.array as Float32Array;
    const glows = glow.array as Float32Array;
    for (let i = 0; i < fx.puffCount; i++) {
      let o = i * P_STRIDE;
      p[o + P_AGE] = p[o + P_AGE]! + dt;
      if (p[o + P_AGE]! >= p[o + P_LIFE]!) {
        fx.puffCount--;
        if (i !== fx.puffCount) p.copyWithin(o, fx.puffCount * P_STRIDE, (fx.puffCount + 1) * P_STRIDE);
        i--;
        continue;
      }
      o = i * P_STRIDE;
      const damp = Math.exp(-p[o + P_DRAG]! * dt);
      const rise = p[o + P_RISE]! * dt;
      for (let c = 0; c < 3; c++) {
        const v = p[o + P_VEL + c]! * damp + p[o + P_UP + c]! * rise;
        p[o + P_VEL + c] = v;
        p[o + P_POS + c] = p[o + P_POS + c]! + v * dt;
      }
      const t = p[o + P_AGE]! / p[o + P_LIFE]!;
      const grown = 1 - (1 - Math.min(1, t / 0.3)) ** 2;
      const hold = p[o + P_HOLD]!;
      let size = p[o + P_S0]! + (p[o + P_S1]! - p[o + P_S0]!) * grown;
      if (t > hold) size *= 1 - smooth((t - hold) / (1 - hold));
      size = Math.max(size, 1e-4);
      const m = i * 16;
      for (let c = 0; c < 3; c++) {
        matrices[m + c] = p[o + P_ROT + c]! * size;
        matrices[m + 4 + c] = p[o + P_ROT + 3 + c]! * size;
        matrices[m + 8 + c] = p[o + P_ROT + 6 + c]! * size;
      }
      matrices[m + 3] = 0;
      matrices[m + 7] = 0;
      matrices[m + 11] = 0;
      matrices[m + 12] = p[o + P_POS]! - anchor.x;
      matrices[m + 13] = p[o + P_POS + 1]! - anchor.y;
      matrices[m + 14] = p[o + P_POS + 2]! - anchor.z;
      matrices[m + 15] = 1;
      colors[i * 3] = p[o + P_COLOR]!;
      colors[i * 3 + 1] = p[o + P_COLOR + 1]!;
      colors[i * 3 + 2] = p[o + P_COLOR + 2]!;
      glows[i] = p[o + P_GLOW]!;
    }
    puffs.count = fx.puffCount;
    puffs.visible = fx.puffCount > 0;
    if (fx.puffCount > 0) {
      markRange(puffs.instanceMatrix, fx.puffCount * 16);
      markRange(puffs.instanceColor!, fx.puffCount * 3);
      markRange(glow, fx.puffCount);
    }
  }

  function advanceDebris(dt: number): void {
    const matrices = debris.instanceMatrix.array as Float32Array;
    const colors = debris.instanceColor!.array as Float32Array;
    for (let i = 0; i < fx.debrisCount; i++) {
      let o = i * D_STRIDE;
      d[o + D_AGE] = d[o + D_AGE]! + dt;
      if (d[o + D_AGE]! >= d[o + D_LIFE]!) {
        fx.debrisCount--;
        if (i !== fx.debrisCount) d.copyWithin(o, fx.debrisCount * D_STRIDE, (fx.debrisCount + 1) * D_STRIDE);
        i--;
        continue;
      }
      o = i * D_STRIDE;
      const size = d[o + D_SIZE]!;
      at.set(d[o + D_POS]!, d[o + D_POS + 1]!, d[o + D_POS + 2]!);
      vel.set(d[o + D_VEL]!, d[o + D_VEL + 1]!, d[o + D_VEL + 2]!);
      upAt.set(d[o + D_UP]!, d[o + D_UP + 1]!, d[o + D_UP + 2]!);
      vel.addScaledVector(upAt, -FALL * dt);
      at.addScaledVector(vel, dt);
      // The ground it was thrown over, as a sphere at its radius: a bounce
      // that keeps a third of the fall and slows the roll and the spin.
      const floor = d[o + D_FLOOR]! + size * 0.5;
      const radius = at.length();
      if (radius < floor) {
        at.multiplyScalar(floor / radius);
        e1.copy(at).normalize();
        const into = vel.dot(e1);
        if (into < 0) {
          vel.addScaledVector(e1, -into * 1.35).multiplyScalar(0.7);
          d[o + D_SPIN] = d[o + D_SPIN]! * 0.6;
        }
      }
      p3(d, o + D_POS, at.x, at.y, at.z);
      p3(d, o + D_VEL, vel.x, vel.y, vel.z);
      d[o + D_ANGLE] = d[o + D_ANGLE]! + d[o + D_SPIN]! * dt;
      const t = d[o + D_AGE]! / d[o + D_LIFE]!;
      // The last quarter of its life a piece sinks into the ground rather than
      // shrinking: it is inked, the pen is screen space, and a piece shrunk
      // to nothing left its hull behind as a black dot. The sink is drawn
      // only, so the bounce above never sees it.
      const sink = t > 0.75 ? Math.min(1, (t - 0.75) / 0.25) * size * 1.2 : 0;
      axis.set(d[o + D_AXIS]!, d[o + D_AXIS + 1]!, d[o + D_AXIS + 2]!);
      quaternion.setFromAxisAngle(axis, d[o + D_ANGLE]!);
      const m = i * 16;
      writeRotation(matrices, m, quaternion, size);
      const down = sink / at.length();
      matrices[m + 12] = at.x * (1 - down) - anchor.x;
      matrices[m + 13] = at.y * (1 - down) - anchor.y;
      matrices[m + 14] = at.z * (1 - down) - anchor.z;
      colors[i * 3] = d[o + D_COLOR]!;
      colors[i * 3 + 1] = d[o + D_COLOR + 1]!;
      colors[i * 3 + 2] = d[o + D_COLOR + 2]!;
    }
    debris.count = fx.debrisCount;
    debris.visible = fx.debrisCount > 0;
    if (fx.debrisCount > 0) {
      markRange(debris.instanceMatrix, fx.debrisCount * 16);
      markRange(debris.instanceColor!, fx.debrisCount * 3);
    }
  }

  return { advancePuffs, advanceDebris };
}
