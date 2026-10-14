import type { Solid } from '../solids.ts';

/** An axis-aligned box in the town's plane, what everything is tested as. */
export interface Aabb {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export function aabbOf(s: Solid, grow: number): Aabb {
  const ex = s.round ? s.hx : Math.abs(s.cos) * s.hx + Math.abs(s.sin) * s.hz;
  const ez = s.round ? s.hx : Math.abs(s.sin) * s.hx + Math.abs(s.cos) * s.hz;
  return { x0: s.x - ex - grow, x1: s.x + ex + grow, z0: s.z - ez - grow, z1: s.z + ez + grow };
}

export const overlapping = (a: Aabb, b: Aabb): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
