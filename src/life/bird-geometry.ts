/**
 * One bird as hand-written triangles: a spindle body with a tail fan and two
 * wings bent at the wrist. The flock is one mesh rewritten every frame, so
 * each vertex carries which rigid piece (`bone`) it belongs to.
 */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { BIRD_LENGTH, BIRD_SPAN } from './tuning.ts';

/**
 * Thirty triangles. Wings and tail are a pair of coincident triangles facing
 * opposite ways, so they show from below. Exported with its back and belly
 * colours because `ambient.ts` draws gulls with it.
 */
export interface BirdPart {
  position: Float32Array;
  normal: Float32Array;
  /** 0 body, 1 left wing, 2 right wing. */
  bone: Uint8Array;
  color: Float32Array;
}

/** Builds one bird, facing +Z, in the given back and belly colours. */
export function birdGeometry(back: number = PALETTE.bark, belly: number = PALETTE.bone): BirdPart {
  const position: number[] = [];
  const normal: number[] = [];
  const bone: number[] = [];
  const color: number[] = [];
  const dark = new THREE.Color(back);
  const pale = new THREE.Color(belly);
  type P = [number, number, number];

  const tri = (a: P, b: P, c: P, id: number, tint: THREE.Color): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    for (const p of [a, b, c]) {
      position.push(p[0], p[1], p[2]);
      normal.push(nx, ny, nz);
      bone.push(id);
      color.push(tint.r, tint.g, tint.b);
    }
  };

  // Body: four faces round, widest a third of the way back from a pointed
  // head, tapering to the tail; dark back, pale belly.
  const hl = BIRD_LENGTH / 2;
  const hw = 0.2;
  const hh = 0.22;
  const nose: P = [0, 0.04, hl];
  const tail: P = [0, 0.05, -hl * 0.62];
  const ring = (z: number, w: number, h: number): P[] => [[0, h, z], [w, 0, z], [0, -h * 0.8, z], [-w, 0, z]];
  const fore = ring(hl * 0.45, hw * 0.75, hh * 0.8);
  const waist = ring(-hl * 0.05, hw, hh);
  // A face of the body, turned to face away from the body's own axis.
  const outward = (a: P, b: P, c: P, tint: THREE.Color): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const out = nx * (a[0] + b[0] + c[0]) + ny * (a[1] + b[1] + c[1] - 0.12);
    if (out >= 0) tri(a, b, c, 0, tint);
    else tri(a, c, b, 0, tint);
  };
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    // Top to right and left to top are the back, the other two the belly.
    const tint = k === 0 || k === 3 ? dark : pale;
    outward(nose, fore[k]!, fore[n]!, tint);
    outward(fore[k]!, fore[n]!, waist[n]!, tint);
    outward(fore[k]!, waist[n]!, waist[k]!, tint);
    outward(waist[k]!, waist[n]!, tail, tint);
  }
  // The tail: a fan behind the body, drawn from both sides.
  const fanRoot: P = [0, 0.06, -hl * 0.4];
  const fanL: P = [-0.36, 0.05, -hl];
  const fanR: P = [0.36, 0.05, -hl];
  tri(fanRoot, fanR, fanL, 0, dark);
  tri(fanRoot, fanL, fanR, 0, pale);

  // Wings: a root along the flank, a wrist out and forward of it and a
  // pointed hand swept back from the wrist, drawn from both sides.
  const span = BIRD_SPAN / 2;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const rootFore: P = [s * hw * 0.8, 0.08, hl * 0.32];
    const rootAft: P = [s * hw * 0.8, 0.08, -hl * 0.3];
    const wrist: P = [s * span * 0.48, 0.14, hl * 0.22];
    const tip: P = [s * span, 0.06, -hl * 0.55];
    const trail: P = [s * span * 0.42, 0.1, -hl * 0.32];
    const up = (a: P, b: P, c: P): void => (s > 0 ? tri(a, b, c, i + 1, dark) : tri(a, c, b, i + 1, dark));
    const down = (a: P, b: P, c: P): void => (s > 0 ? tri(a, c, b, i + 1, pale) : tri(a, b, c, i + 1, pale));
    for (const [a, b, c] of [[rootFore, wrist, trail], [rootFore, trail, rootAft], [wrist, tip, trail]] as [P, P, P][]) {
      up(a, b, c);
      down(a, b, c);
    }
  }

  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    bone: new Uint8Array(bone),
    color: new Float32Array(color),
  };
}
