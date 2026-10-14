/** Colours in linear light, and the smoothstep the ground's blends use. */

import * as THREE from 'three';

const linear = new Map<number, [number, number, number]>();
const scratchColor = new THREE.Color();
/** A palette hex as linear RGB, which is what a vertex colour is. */
export function linearOf(hex: number): [number, number, number] {
  let found = linear.get(hex);
  if (found === undefined) {
    scratchColor.setHex(hex);
    found = [scratchColor.r, scratchColor.g, scratchColor.b];
    linear.set(hex, found);
  }
  return found;
}

export const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * A colour taken toward its own grey by `chroma` (1 keeps it, 0 is grey) and
 * multiplied by `value`, in linear light. The grey is the colour's luminance,
 * so a greyed palette keeps its lights and darks: bone stays pale and slate
 * stays dark, which is all a Moon's ground is.
 */
export function grade(c: readonly [number, number, number], chroma: number, value: number): [number, number, number] {
  const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return [
    Math.max(0, (luma + (c[0] - luma) * chroma) * value),
    Math.max(0, (luma + (c[1] - luma) * chroma) * value),
    Math.max(0, (luma + (c[2] - luma) * chroma) * value),
  ];
}
