import type { Aabb } from './aabb.ts';
import { Sink } from './sink.ts';

/** Lays a point of the town's plane on the paving under a mark, lifted `DECAL_LIFT`: see `mark` in `dressTown`. */
export type Put = (x: number, z: number) => [number, number, number];

/** How many a street's cell gets: a manhole in about one in eight, a gully at about one kerb in five. */
export const MANHOLE_SHARE = 0.12;
export const DRAIN_SHARE = 0.2;
/** Their triangles at most, which a town out of allowance does not start. */
export const MANHOLE_COST = 132;
export const GULLY_COST = 26;

/**
 * A colour's channels times `factor`, any colour: the road's own asphalt
 * darkened for its ironwork. Not `tone`, which holds a part to the palette
 * for its colour count; a mark is floor, and the floor is drawn in its
 * region's road colour times its own grain already.
 */
export function shade(color: number, factor: number): number {
  const channel = (at: number): number => Math.max(0, Math.min(255, Math.round(((color >> at) & 255) * factor)));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** A flat rectangle of the plane. */
export function flat(sink: Sink, put: Put, x0: number, x1: number, z0: number, z1: number): void {
  sink.quad([...put(x0, z1), ...put(x1, z1), ...put(x1, z0), ...put(x0, z0)], 0, 1, 0);
}

/** A flat ring of the plane from radius `r0` to `r1` round `(x, z)`, from angle `a0` to `a1`, in `sides` steps; `r0` 0 is a disc. */
export function ring(sink: Sink, put: Put, x: number, z: number, r0: number, r1: number, sides: number, a0 = 0, a1 = Math.PI * 2): void {
  for (let i = 0; i < sides; i++) {
    const a = a0 + ((a1 - a0) * i) / sides;
    const b = a0 + ((a1 - a0) * (i + 1)) / sides;
    const inA = put(x + Math.cos(a) * r0, z + Math.sin(a) * r0);
    const inB = put(x + Math.cos(b) * r0, z + Math.sin(b) * r0);
    const outA = put(x + Math.cos(a) * r1, z + Math.sin(a) * r1);
    const outB = put(x + Math.cos(b) * r1, z + Math.sin(b) * r1);
    if (r0 <= 0) sink.tri(...inA, ...outA, ...outB, 0, 1, 0);
    else sink.quad([...inA, ...outA, ...outB, ...inB], 0, 1, 0);
  }
}

/**
 * A manhole cover: a rim ring in the road's own tone darkened a little, a
 * darker seat inside it, and the cover's pattern — concentric rings, or
 * spokes round a boss — in two tones between. Subtle on purpose: a cover is
 * the street's ironwork, not a hole in it. 84 to 132 triangles.
 */
export function manhole(sink: Sink, put: Put, x: number, z: number, r: number, radial: boolean, iron: (factor: number) => number): void {
  const sides = 12;
  sink.paint(iron(0.8));
  ring(sink, put, x, z, r * 0.86, r, sides);
  sink.paint(iron(0.6));
  ring(sink, put, x, z, r * 0.74, r * 0.86, sides);
  if (radial) {
    for (let i = 0; i < sides; i++) {
      sink.paint(iron(i % 2 === 0 ? 0.7 : 0.62));
      ring(sink, put, x, z, r * 0.3, r * 0.74, 1, (i / sides) * Math.PI * 2, ((i + 1) / sides) * Math.PI * 2);
    }
  } else {
    const bands = [0.74, 0.6, 0.46, 0.3];
    for (let k = 0; k + 1 < bands.length; k++) {
      sink.paint(iron(k % 2 === 0 ? 0.7 : 0.62));
      ring(sink, put, x, z, r * bands[k + 1]!, r * bands[k]!, sides);
    }
  }
  sink.paint(iron(0.66));
  ring(sink, put, x, z, 0, r * 0.3, sides);
}

/**
 * A gully at the kerb: a frame in the road's tone darkened and, inside it,
 * slots across the flow with the bars between them, darker than the frame
 * and lighter than the slots. 26 triangles.
 */
export function gully(sink: Sink, put: Put, box: Aabb, alongZ: boolean, iron: (factor: number) => number): void {
  const frame = Math.min(box.x1 - box.x0, box.z1 - box.z0) * 0.14;
  const x0 = box.x0 + frame, x1 = box.x1 - frame, z0 = box.z0 + frame, z1 = box.z1 - frame;
  sink.paint(iron(0.78));
  flat(sink, put, box.x0, box.x1, box.z0, z0);
  flat(sink, put, box.x0, box.x1, z1, box.z1);
  flat(sink, put, box.x0, x0, z0, z1);
  flat(sink, put, x1, box.x1, z0, z1);
  // Nine strips along the kerb, slot and bar in turn, each across the flow.
  const strips = 9;
  for (let i = 0; i < strips; i++) {
    sink.paint(iron(i % 2 === 0 ? 0.5 : 0.68));
    if (alongZ) flat(sink, put, x0, x1, z0 + ((z1 - z0) * i) / strips, z0 + ((z1 - z0) * (i + 1)) / strips);
    else flat(sink, put, x0 + ((x1 - x0) * i) / strips, x0 + ((x1 - x0) * (i + 1)) / strips, z0, z1);
  }
}
