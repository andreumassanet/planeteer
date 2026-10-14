/** The creatures: fireflies, pollen, butterflies, a jumping fish and gulls, written into the shared buffers. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { PALETTE } from '../theme.ts';
import { nightAt } from '../lights.ts';
import { hash3 } from '../weather.ts';
import {
  FISH_AIR, FISH_HALF, FISH_HEIGHT, FISH_ODDS, FISH_SLOT, FISH_TRAVEL, FIREFLY_SIZE, K_BUTTERFLY, K_FIREFLY,
  K_FISH, K_GULL, K_MOTE, MAX_BUTTERFLIES, MAX_FIREFLIES, MAX_FISH, MAX_GULLS, MAX_MOTES, MOTE_SIZE, RANGE,
  WATERSIDE, WING, WING_BODY,
} from './constants.ts';
import { fract, smooth } from './grid.ts';
import { WINGS, colourOf } from './materials.ts';
import type { AmbientContext, Cell, GullCell } from './types.ts';

export interface Creatures {
  fireflies(cell: Cell, strength: number): void;
  motes(cell: Cell, strength: number): void;
  butterflies(cell: Cell, strength: number): void;
  fish(cell: Cell, player: THREE.Vector3, afloat: boolean, calm: number): void;
  gulls(cell: GullCell, strength: number): void;
}

export function createCreatures(
  ctx: AmbientContext,
  anchorPoint: (cell: Cell, index: number, e: number, n: number, height: number, out: THREE.Vector3) => THREE.Vector3,
): Creatures {
  const { options, stats, state, writer, buffers } = ctx;
  const { point, other, forward, right, lift, tipA, tipB, axisA, axisB } = ctx.scratch;
  const { triangle, light } = writer;
  const { gull, gullVertices, MAX_VERTICES, bodyPosition, bodyNormal, bodyColor } = buffers;
  const eye = new THREE.Vector3();

  function fireflies(cell: Cell, strength: number): void {
    const night = nightAt(cell.up);
    const gate = strength * night * cell.fade;
    if (gate < 0.01) return;
    for (let i = 0; i < cell.fireflies; i++) {
      const s = hash3(cell.row, cell.column, K_FIREFLY + i);
      const t = state.clock;
      const a = s * 97.3;
      const e = 2.2 * Math.sin(t * (0.21 + s * 0.2) + a) + 0.8 * Math.sin(t * 0.63 + a * 1.7);
      const n = 2.2 * Math.cos(t * (0.17 + s * 0.23) + a * 1.3) + 0.8 * Math.sin(t * 0.71 + a * 0.3);
      const h = 0.6 + 1.6 * (0.5 + 0.5 * Math.sin(t * (0.3 + s * 0.25) + a * 2.1));
      anchorPoint(cell, i, e, n, h, point);
      // A flash, a pause, sometimes a double: a quarter of each cycle lit.
      const period = 2.4 + s * 2.6;
      const phase = fract(t / period + s * 7.1);
      const flash = phase < 0.24 ? Math.sin((phase / 0.24) * Math.PI) : 0;
      const echo = s > 0.6 && phase > 0.3 && phase < 0.42 ? 0.6 * Math.sin(((phase - 0.3) / 0.12) * Math.PI) : 0;
      const glow = (0.08 + 0.92 * Math.max(flash, echo)) * gate;
      if (glow > 0.004 && stats.fireflies < MAX_FIREFLIES) {
        light(point, glow, FIREFLY_SIZE, 0);
        stats.fireflies++;
      }
    }
  }

  function motes(cell: Cell, strength: number): void {
    const gate = strength * cell.fade;
    if (gate < 0.01) return;
    for (let i = 0; i < cell.motes && stats.motes < MAX_MOTES; i++) {
      const s = hash3(cell.row, cell.column, K_MOTE + i);
      const a = s * 61.7;
      const e = 3 * Math.sin(state.clock * 0.07 + a) + 0.4 * Math.sin(state.clock * 0.9 + a);
      const n = 3 * Math.cos(state.clock * 0.06 + a * 1.9) + 0.4 * Math.cos(state.clock * 0.8 + a);
      const h = 1.2 + 1.8 * fract(s * 13.1) + 0.5 * Math.sin(state.clock * 0.25 + a);
      anchorPoint(cell, i + 3, e, n, h, point);
      light(point, 0.55 * gate, MOTE_SIZE, 1);
      stats.motes++;
    }
  }

  /** Where a butterfly is at `t`: loops round its anchor, a quick wobble in them, and a bob. */
  function flutter(cell: Cell, i: number, a: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 3.2 * Math.sin(t * 0.43 + a) + 1.1 * Math.sin(t * 1.7 + a * 2.3);
    const n = 3.2 * Math.cos(t * 0.37 + a * 1.4) + 1.1 * Math.cos(t * 1.9 + a * 0.7);
    const h = 0.7 + 0.9 * Math.abs(Math.sin(t * 0.9 + a)) + 0.25 * Math.sin(t * 5.3 + a);
    return anchorPoint(cell, i + 1, e, n, h, out);
  }

  function butterflies(cell: Cell, strength: number): void {
    const gate = strength * cell.fade;
    if (gate < 0.05) return;
    for (let i = 0; i < cell.butterflies && stats.butterflies < MAX_BUTTERFLIES; i++) {
      const s = hash3(cell.row, cell.column, K_BUTTERFLY + i);
      const a = s * 83.9;
      flutter(cell, i, a, state.clock, point);
      flutter(cell, i, a, state.clock + 0.08, other);
      forward.subVectors(other, point);
      forward.addScaledVector(cell.up, -forward.dot(cell.up));
      if (forward.lengthSq() < 1e-8) forward.copy(cell.north);
      forward.normalize();
      right.crossVectors(cell.up, forward).normalize();
      // The wings beat fast and a little unevenly, and shut to a glide now and then.
      const beat = 0.15 + 1.15 * (0.5 + 0.5 * Math.sin(state.clock * (15 + s * 6) + a));
      const scale = gate < 1 ? 0.3 + 0.7 * gate : 1;
      const span = WING * scale;
      const body = WING_BODY * scale;
      const colour = colourOf(WINGS[Math.floor(s * WINGS.length) % WINGS.length]!);
      for (let side = -1; side <= 1; side += 2) {
        lift.copy(right).multiplyScalar(side * Math.cos(beat) * span).addScaledVector(cell.up, Math.sin(beat) * span);
        tipA.copy(point).add(lift).addScaledVector(forward, body * 1.2);
        tipB.copy(point).add(lift).addScaledVector(forward, -body * 1.1);
        axisA.copy(point).addScaledVector(forward, body);
        axisB.copy(point).addScaledVector(forward, -body);
        triangle(axisA, tipA, tipB, colour);
        triangle(axisA, tipB, axisB, colour);
      }
      stats.butterflies++;
    }
  }

  function fish(cell: Cell, player: THREE.Vector3, afloat: boolean, calm: number): void {
    if (!cell.fish || calm < 0.05) return;
    if (!afloat && cell.shore > WATERSIDE) return;
    const slot = Math.floor(state.clock / FISH_SLOT);
    const s = hash3(cell.row, cell.column, K_FISH + (slot % 4096));
    if (s >= FISH_ODDS * calm) return;
    const start = slot * FISH_SLOT + (s / FISH_ODDS) * (FISH_SLOT - FISH_AIR);
    const u = (state.clock - start) / FISH_AIR;
    if (u < 0 || u > 1.02 || stats.fish >= MAX_FISH) return;
    const a = hash3(cell.row, cell.column, K_FISH + 4096 + (slot % 4096)) * Math.PI * 2;
    const heading = forward.copy(cell.east).multiplyScalar(Math.cos(a)).addScaledVector(cell.north, Math.sin(a));
    const k = u < 0 ? 0 : u > 1 ? 1 : u;
    anchorPoint(cell, slot, (k - 0.5) * FISH_TRAVEL * Math.cos(a), (k - 0.5) * FISH_TRAVEL * Math.sin(a), 4 * k * (1 - k) * FISH_HEIGHT, point);
    const near = point.distanceTo(player) < RANGE;
    if (options.splash !== undefined && near) {
      if (u < 0.25 && cell.fishIn !== slot) {
        cell.fishIn = slot;
        options.splash(point, 0.9);
      } else if (u > 0.95 && cell.fishOut !== slot) {
        cell.fishOut = slot;
        options.splash(point, 0.7);
      }
    }
    if (u > 0.98) return;
    // Along its own flight: nose up out of the water, nose down into it.
    axisA.copy(heading).multiplyScalar(FISH_TRAVEL).addScaledVector(cell.up, 4 * FISH_HEIGHT * (1 - 2 * k)).normalize();
    right.crossVectors(cell.up, heading).normalize();
    axisB.crossVectors(right, axisA).normalize();
    const body = colourOf(PALETTE.bone);
    const back = colourOf(PALETTE.slate);
    tipA.copy(point).addScaledVector(axisA, FISH_HALF);
    tipB.copy(point).addScaledVector(axisA, -FISH_HALF * 0.8);
    lift.copy(point).addScaledVector(axisB, FISH_HALF * 0.3);
    other.copy(point).addScaledVector(axisB, -FISH_HALF * 0.26);
    triangle(tipA, lift, tipB, back);
    triangle(tipA, tipB, other, body);
    // The tail, flicking.
    const flick = Math.sin(state.clock * 30) * 0.5;
    lift.copy(tipB).addScaledVector(axisA, -FISH_HALF * 0.45).addScaledVector(axisB, FISH_HALF * 0.3).addScaledVector(right, flick * 0.1);
    other.copy(tipB).addScaledVector(axisA, -FISH_HALF * 0.45).addScaledVector(axisB, -FISH_HALF * 0.3).addScaledVector(right, flick * 0.1);
    triangle(tipB, lift, other, back);
    stats.fish++;
  }

  const gullMatrix = new THREE.Matrix4();
  const wingLeft = new THREE.Matrix4();
  const wingRight = new THREE.Matrix4();
  const gullNormal = new THREE.Matrix3();
  const leftNormal = new THREE.Matrix3();
  const rightNormal = new THREE.Matrix3();
  const bank = new THREE.Matrix4();
  const basis = new THREE.Matrix4();
  const spin = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const gullColour = new THREE.Color();

  function gulls(cell: GullCell, strength: number): void {
    const gate = strength * cell.fade;
    if (gate < 0.05) return;
    for (let i = 0; i < cell.count && stats.gulls < MAX_GULLS; i++) {
      const s = hash3(cell.row, cell.column, K_GULL + 8 + i);
      const lead = s * Math.PI * 2;
      const radius = 14 + 18 * fract(s * 11.3);
      const rate = (fract(s * 5.9) > 0.5 ? 1 : -1) * (0.18 + 0.1 * fract(s * 3.1));
      // The ring wanders over the cell, so a gull is not nailed to one point of sky.
      const ce = 20 * Math.sin(state.clock * 0.03 + lead);
      const cn = 20 * Math.cos(state.clock * 0.025 + lead * 1.3);
      const angle = lead + state.clock * rate;
      const c = Math.cos(angle);
      const si = Math.sin(angle);
      point.copy(cell.up).multiplyScalar(PLANET_RADIUS)
        .addScaledVector(cell.east, ce + c * radius)
        .addScaledVector(cell.north, cn + si * radius);
      const here = other.copy(point).normalize();
      point.copy(here).multiplyScalar(cell.altitude + 3 * Math.sin(state.clock * 0.4 + lead));
      forward.copy(cell.east).multiplyScalar(-si * rate).addScaledVector(cell.north, c * rate);
      forward.addScaledVector(here, -forward.dot(here)).normalize();
      right.crossVectors(here, forward).normalize();
      basis.makeBasis(right, here, forward);
      spin.setFromRotationMatrix(basis);
      bank.makeRotationZ(rate > 0 ? 0.3 : -0.3);
      gullMatrix.compose(point, spin, unit).multiply(bank);
      gullNormal.getNormalMatrix(gullMatrix);
      // Flap and glide: a few beats, then the wings held.
      const beat = Math.sin(state.clock * 6.5 + lead) * 0.55 * smooth(Math.sin(state.clock * 0.5 + lead * 2) * 2);
      wingLeft.makeRotationZ(beat + 0.08).premultiply(gullMatrix);
      wingRight.makeRotationZ(-beat - 0.08).premultiply(gullMatrix);
      leftNormal.getNormalMatrix(wingLeft);
      rightNormal.getNormalMatrix(wingRight);
      const shrink = gate < 1 ? gate : 1;
      if (state.vertexCursor + gullVertices > MAX_VERTICES) return;
      for (let v = 0; v < gullVertices; v++) {
        const bone = gull.bone[v]!;
        const matrix = bone === 0 ? gullMatrix : bone === 1 ? wingLeft : wingRight;
        const normals = bone === 0 ? gullNormal : bone === 1 ? leftNormal : rightNormal;
        eye.set(gull.position[v * 3]! * shrink, gull.position[v * 3 + 1]! * shrink, gull.position[v * 3 + 2]! * shrink).applyMatrix4(matrix);
        const o = state.vertexCursor * 3;
        bodyPosition[o] = eye.x;
        bodyPosition[o + 1] = eye.y;
        bodyPosition[o + 2] = eye.z;
        eye.set(gull.normal[v * 3]!, gull.normal[v * 3 + 1]!, gull.normal[v * 3 + 2]!).applyMatrix3(normals).normalize();
        bodyNormal[o] = eye.x;
        bodyNormal[o + 1] = eye.y;
        bodyNormal[o + 2] = eye.z;
        gullColour.setRGB(gull.color[v * 3]!, gull.color[v * 3 + 1]!, gull.color[v * 3 + 2]!);
        bodyColor[o] = gullColour.r;
        bodyColor[o + 1] = gullColour.g;
        bodyColor[o + 2] = gullColour.b;
        state.vertexCursor++;
      }
      stats.gulls++;
    }
  }

  return { fireflies, motes, butterflies, fish, gulls };
}
