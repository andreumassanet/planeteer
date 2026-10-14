/** Where the people of a built town may walk: lanes down the avenues, the walk round the square, and pockets beside the buildings. */

import { rngFrom } from '../../scenery/random.ts';
import type { WorldSpec } from '../contract.ts';
import type { Site } from '../settlements.ts';
import type { KeepClear, Lane, Plan, Pocket } from './types.ts';

export const TAU = Math.PI * 2;

/** Whether a segment from (ax, az) to (bx, bz) passes clear of every footprint by `margin`. */
export function segmentClear(site: Site, ax: number, az: number, bx: number, bz: number, margin: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const length2 = dx * dx + dz * dz || 1e-9;
  for (const f of site.footprints) {
    const t = Math.min(1, Math.max(0, ((f.x - ax) * dx + (f.z - az) * dz) / length2));
    if (Math.hypot(ax + dx * t - f.x, az + dz * t - f.z) < f.radius + margin) return false;
  }
  return true;
}

/** A point on an avenue: `along` out from the middle, `offset` across it. */
export function lanePoint(lane: Lane, along: number, offset: number): { x: number; z: number } {
  return {
    x: Math.sin(lane.angle) * along + Math.cos(lane.angle) * offset,
    z: Math.cos(lane.angle) * along - Math.sin(lane.angle) * offset,
  };
}

/**
 * Where the people of a built town may walk: a lane down each avenue, cut
 * short where a keep-clear disc sits on it; the walk round the square if the
 * landmark leaves room; and pockets beside the buildings.
 */
export function planOf(spec: WorldSpec, site: Site, keep: readonly KeepClear[]): Plan {
  const half = site.avenueHalf;
  const landmark = site.footprints.find((f) => Math.hypot(f.x, f.z) < 0.5)?.radius ?? 0;
  // The walk round the square keeps a body's width off the landmark inside
  // it and off the nearest wall outside it, or there is none.
  let edge = Infinity;
  for (const f of site.footprints) if (Math.hypot(f.x, f.z) >= 0.5) edge = Math.min(edge, Math.hypot(f.x, f.z) - f.radius);
  const ringR = Math.min(site.plaza - 3, edge - 1.8);
  const ring = ringR >= landmark + 2.5 && ringR > 2 ? ringR : null;
  const lanes: Lane[] = [];
  for (const angle of site.avenues) {
    let from = (ring ?? landmark + 1.5) + 1.5;
    let to = site.paving - 6;
    let reaches = ring !== null;
    for (const disc of keep) {
      const along = disc.x * Math.sin(angle) + disc.z * Math.cos(angle);
      const off = Math.abs(disc.x * Math.cos(angle) - disc.z * Math.sin(angle));
      if (along < 0 || off > half + disc.r) continue;
      if (along < (from + to) / 2) {
        from = Math.max(from, along + disc.r);
        reaches = false;
      } else to = Math.min(to, along - disc.r);
    }
    if (to - from >= 4) lanes.push({ angle, from, to, ring: reaches });
  }
  const pockets: Pocket[] = [];
  const rng = rngFrom('worlds', spec.id, 'pockets', site.id);
  const buildings = site.footprints.filter((f) => Math.hypot(f.x, f.z) >= 0.5 && f.radius > 2.5);
  for (let attempt = 0; attempt < 70 && pockets.length < 10 && buildings.length > 0 && lanes.length > 0; attempt++) {
    const f = buildings[rng.int(buildings.length)]!;
    const a = rng.range(0, TAU);
    const x = f.x + Math.sin(a) * (f.radius + 3.2);
    const z = f.z + Math.cos(a) * (f.radius + 3.2);
    const d = Math.hypot(x, z);
    if (d > site.paving - 2.5 || d < site.plaza + 1) continue;
    if (site.footprints.some((g) => Math.hypot(g.x - x, g.z - z) < g.radius + 2.2)) continue;
    if (keep.some((disc) => Math.hypot(disc.x - x, disc.z - z) < disc.r + 2)) continue;
    if (pockets.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
    // The lane it opens off: the nearest whose avenue it can be walked to straight.
    let best = -1;
    let bestOff = Infinity;
    let bestAlong = 0;
    lanes.forEach((lane, k) => {
      const along = x * Math.sin(lane.angle) + z * Math.cos(lane.angle);
      const off = Math.abs(x * Math.cos(lane.angle) - z * Math.sin(lane.angle));
      if (along < lane.from + 1 || along > lane.to - 1 || off >= bestOff) return;
      const q = lanePoint(lane, along, 0);
      if (!segmentClear(site, x, z, q.x, q.z, 1.1)) return;
      best = k;
      bestOff = off;
      bestAlong = along;
    });
    if (best >= 0 && bestOff < 30) pockets.push({ lane: best, along: bestAlong, x, z });
  }
  return { lanes, pockets, ring, half };
}

/** The shortest turn from `a` to `b`, radians. */
export const turnTo = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));
