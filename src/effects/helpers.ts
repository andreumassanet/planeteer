/** Small pure helpers shared by the pools. */
import * as THREE from 'three';
import { DISC_SIDES } from './constants.ts';

export const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** A palette colour in the renderer's linear space, cached: there are only a few. */
export const linear = new Map<number, THREE.Color>();
export function linearOf(hex: number): THREE.Color {
  let color = linear.get(hex);
  if (color === undefined) linear.set(hex, (color = new THREE.Color(hex)));
  return color;
}

/**
 * The puffs' material: the world's ramp, with an instanced `fxGlow` that
 * takes a puff's colour unlit — a flame is the one thing here that is its own
 * light, and it should read at night.

/** The foam disc's corners, once. */
export const COS = Float64Array.from({ length: DISC_SIDES }, (_, k) => Math.cos((k / DISC_SIDES) * Math.PI * 2));
export const SIN = Float64Array.from({ length: DISC_SIDES }, (_, k) => Math.sin((k / DISC_SIDES) * Math.PI * 2));

export function p3(array: Float64Array, offset: number, x: number, y: number, z: number): void {
  array[offset] = x;
  array[offset + 1] = y;
  array[offset + 2] = z;
}

/**
 * A unit quaternion's rotation, times `scale`, into nine (or with `scale`, the
 * upper three columns of sixteen) column-major slots at `offset`. A rotation
 * has determinant +1 and the scale is positive, so what is written is never a
 * reflection — the one thing an instance matrix may not be (the ink draws a
 * mirrored hull as a solid blob). The check script holds every matrix the
 * pools write to that.
 */
export function writeRotation(out: Float64Array | Float32Array, offset: number, q: THREE.Quaternion, scale?: number): void {
  const { x, y, z, w } = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const s = scale ?? 1;
  // Three columns, three rows each; a 4x4 when scaled, packed nine otherwise.
  const stride = scale === undefined ? 3 : 4;
  out[offset] = (1 - (yy + zz)) * s;
  out[offset + 1] = (xy + wz) * s;
  out[offset + 2] = (xz - wy) * s;
  out[offset + stride] = (xy - wz) * s;
  out[offset + stride + 1] = (1 - (xx + zz)) * s;
  out[offset + stride + 2] = (yz + wx) * s;
  out[offset + 2 * stride] = (xz + wy) * s;
  out[offset + 2 * stride + 1] = (yz - wx) * s;
  out[offset + 2 * stride + 2] = (1 - (xx + yy)) * s;
  if (stride === 4) {
    out[offset + 3] = 0;
    out[offset + 7] = 0;
    out[offset + 11] = 0;
    out[offset + 15] = 1;
  }
}

/** Uploads only the first `count` numbers of an attribute this frame. */
export function markRange(attribute: THREE.BufferAttribute, count: number): void {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count);
  attribute.needsUpdate = true;
}
