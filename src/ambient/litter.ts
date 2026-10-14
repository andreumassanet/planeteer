/** The leaves lying under the crowns that shed: asked from the ground a few a frame, written when anything changes. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { hash3 } from '../weather.ts';
import { FADE_IN, K_LITTER, LITTER_FADE, LITTER_LIFT, LITTER_RANGE, LITTER_REACH, LITTER_SIZE, MAX_LITTER } from './constants.ts';
import { smooth } from './grid.ts';
import type { AmbientContext, Crown } from './types.ts';

export interface Litter {
  /** Asks the ground under the nearest crowns' litter, `LITTER_ASKS` a frame at most. */
  askLitter(want: (crown: Crown) => number): void;
  /** The litter rewritten: every asked leaf under every crown in range, nearest crowns first. */
  writeLitter(want: (crown: Crown) => number, autumn: number, high: number): void;
}

export function createLitter(
  ctx: AmbientContext,
  nearCrowns: Crown[],
  surfaceAt: (at: THREE.Vector3) => number,
  leafColourOf: (crown: Crown, pick: number, pick2: number, autumn: number, dry: number, out: THREE.Color) => THREE.Color,
): Litter {
  const { state, buffers } = ctx;
  const { point, forward, right, lift, tipA, tipB, other, axisB } = ctx.scratch;
  const { litter, litterGeometry, litterAttributes, litterPosition, litterNormal, litterColor } = buffers;
  const crownPoint = new THREE.Vector3();
  const leafColour = new THREE.Color();

  /** Asks the ground under the nearest crowns' litter, `LITTER_ASKS` a frame at most. */
  function askLitter(want: (crown: Crown) => number): void {
    for (const crown of nearCrowns) {
      if (state.litterAsks <= 0) return;
      const count = want(crown);
      while (crown.asked < count && state.litterAsks > 0) {
        const j = crown.asked++;
        state.litterAsks--;
        litterPoint(crown, j);
        const ground = surfaceAt(crownPoint.copy(point).normalize().multiplyScalar(PLANET_RADIUS));
        crown.litter[j] = ground;
        state.litterDirty = true;
      }
    }
  }

  /** Where the `j`th leaf of a crown's litter lies, across the ground, into `point` (unit length). */
  function litterPoint(crown: Crown, j: number): THREE.Vector3 {
    const k = crown.key | 0;
    const angle = hash3(k, j, K_LITTER) * Math.PI * 2;
    const reach = Math.sqrt(hash3(k, j, K_LITTER + 1)) * crown.radius * LITTER_REACH;
    return point.copy(crown.up)
      .addScaledVector(crown.east, (Math.cos(angle) * reach) / PLANET_RADIUS)
      .addScaledVector(crown.north, (Math.sin(angle) * reach) / PLANET_RADIUS)
      .normalize();
  }

  /** The litter rewritten: every asked leaf under every crown in range, nearest crowns first. */
  function writeLitter(want: (crown: Crown) => number, autumn: number, high: number): void {
    let v = 0;
    state.litterCount = 0;
    for (const crown of nearCrowns) {
      if (state.litterCount >= MAX_LITTER) break;
      // By distance, and by age, so a wood arriving is littered as it dissolves in (`fade.ts`).
      const fade = smooth((LITTER_RANGE - crown.distance) / LITTER_FADE) * smooth((state.clock - crown.born) / FADE_IN) * high;
      if (fade <= 0.02) continue;
      const count = Math.min(want(crown), crown.asked);
      const k = crown.key | 0;
      for (let j = 0; j < count && state.litterCount < MAX_LITTER; j++) {
        const ground = crown.litter[j]!;
        if (!(ground > 0)) continue;
        litterPoint(crown, j);
        right.copy(point);
        const size = LITTER_SIZE * (0.75 + 0.5 * hash3(k, j, K_LITTER + 2)) * fade;
        point.multiplyScalar(ground + LITTER_LIFT + size * 0.25 + 0.004 * (j % 5));
        const yaw = hash3(k, j, K_LITTER + 3) * Math.PI * 2;
        forward.copy(crown.east).multiplyScalar(Math.cos(yaw)).addScaledVector(crown.north, Math.sin(yaw));
        axisB.crossVectors(right, forward).normalize();
        const colour = leafColourOf(crown, hash3(k, j, K_LITTER + 4), hash3(k, j, K_LITTER + 5), autumn, 1, leafColour);
        // A leaf a little darker the deeper in the pile: a tone, not a shadow.
        colour.multiplyScalar(0.82 + 0.18 * hash3(k, j, K_LITTER + 6));
        tipA.copy(point).addScaledVector(forward, size);
        tipB.copy(point).addScaledVector(forward, -size);
        lift.copy(point).addScaledVector(axisB, size * 0.55);
        other.copy(point).addScaledVector(axisB, -size * 0.55);
        // Wound to face the sky: `axisB` is `up x forward`, so `forward x axisB` is up.
        for (const corner of [tipA, tipB, other, tipA, lift, tipB]) {
          const o = v * 3;
          litterPosition[o] = corner.x;
          litterPosition[o + 1] = corner.y;
          litterPosition[o + 2] = corner.z;
          litterNormal[o] = right.x;
          litterNormal[o + 1] = right.y;
          litterNormal[o + 2] = right.z;
          litterColor[o] = colour.r;
          litterColor[o + 1] = colour.g;
          litterColor[o + 2] = colour.b;
          v++;
        }
        state.litterCount++;
      }
    }
    litterGeometry.setDrawRange(0, v);
    litter.visible = v > 0;
    if (v > 0) {
      for (const attribute of litterAttributes) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, v * 3);
        attribute.needsUpdate = true;
      }
    }
  }


  return { askLitter, writeLitter };
}
