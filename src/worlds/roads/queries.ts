/** Asking the roads questions: where they are, how high, what runs on them. */

import * as THREE from 'three';
import { latOf, lonOf } from '../../sphere.ts';
import type { Chunk } from './chunks.ts';
import { STEP, crownOf, edgeOf, sideAt } from './ribbon.ts';
import type { Ribbon, RibbonEnv } from './ribbon.ts';

/** Points of the centre line a point of the map's line: forty units. */
const MAP_EVERY = 8;

const side = new THREE.Vector3();
const probe = new THREE.Vector3();

/** Every road as a line of `[lat, lon]` a few tens of units a point, for the map: class 1, a road, Earth's middle one. */
export function linesOf(ribbons: readonly Ribbon[]): { cls: number; points: [number, number][] }[] {
  return ribbons.map((ribbon) => {
    const points: [number, number][] = [];
    const last = ribbon.dirs.length - 1;
    for (let k = 0; k < last + MAP_EVERY; k += MAP_EVERY) {
      const d = ribbon.dirs[Math.min(k, last)]!;
      points.push([latOf(d.y), lonOf(d.x, d.z)]);
    }
    return { cls: 1, points };
  });
}

/** Every built piece's top read back between its points and across its width, against the drawn ground there. */
export function sweepRoads(env: RibbonEnv, ribbons: readonly Ribbon[], chunks: readonly Chunk[], each: (top: number, ground: number) => void): void {
  const { terrain, R } = env;
  const at = new THREE.Vector3();
  for (const chunk of chunks) {
    if (chunk.mesh === null) continue;
    const ribbon = ribbons[chunk.road]!;
    for (let k = chunk.from; k < chunk.to; k++) {
      sideAt(ribbon, k, side);
      const edge = Math.min(edgeOf(ribbon, k), edgeOf(ribbon, k + 1));
      for (const t of [0, 0.25, 0.5, 0.75]) {
        for (const offset of [-edge, -edge / 2, 0, edge / 2, edge]) {
          at.copy(ribbon.dirs[k]!).lerp(ribbon.dirs[k + 1]!, t).normalize().addScaledVector(side, offset / R).normalize();
          const crown = ribbon.crown[k]! + (ribbon.crown[k + 1]! - ribbon.crown[k]!) * t;
          const tilt = ribbon.tilt[k]! + (ribbon.tilt[k + 1]! - ribbon.tilt[k]!) * t;
          each(crown + tilt * offset, terrain.groundAt(at.x, at.y, at.z));
        }
      }
    }
  }
}

/** The worst step between a road's crown at its gate and the town street it meets, units. */
export function gateStepOf(env: RibbonEnv, ribbons: readonly Ribbon[]): number {
  let worst = 0;
  for (const ribbon of ribbons) {
    const last = ribbon.dirs.length - 1;
    crownOf(env, ribbon, 0, 0);
    crownOf(env, ribbon, last, last);
    worst = Math.max(worst, Math.abs(ribbon.crown[0]! - ribbon.gateA), Math.abs(ribbon.crown[last]! - ribbon.gateB));
  }
  return worst;
}

/** The roads with a point within `within` units of `point`, and how far along each that nearest point is. */
export function roadsNear(env: RibbonEnv, ribbons: readonly Ribbon[], point: THREE.Vector3, within: number): { road: number; s: number }[] {
  const out: { road: number; s: number }[] = [];
  probe.copy(point).normalize();
  const cos = Math.cos(within / env.R);
  ribbons.forEach((ribbon, road) => {
    let best = -1;
    let bestDot = cos;
    // A coarse pass, then the step itself round the best.
    for (let k = 0; k < ribbon.dirs.length; k += 8) {
      const dot = ribbon.dirs[k]!.dot(probe);
      if (dot > bestDot) [best, bestDot] = [k, dot];
    }
    if (best < 0) return;
    for (let k = Math.max(0, best - 8); k <= Math.min(ribbon.dirs.length - 1, best + 8); k++) {
      const dot = ribbon.dirs[k]!.dot(probe);
      if (dot >= bestDot) [best, bestDot] = [k, dot];
    }
    out.push({ road, s: best * STEP });
  });
  return out;
}

/** The point on a road's top `s` units from gate A and `lateral` units to its right, into `at`, and the way the road runs there into `along`. */
export function placeOnRoad(env: RibbonEnv, ribbon: Ribbon, s: number, lateral: number, at: THREE.Vector3, along: THREE.Vector3): void {
  const last = ribbon.dirs.length - 1;
  const u = Math.min(last - 1e-6, Math.max(0, s / STEP));
  const k = Math.min(last - 1, Math.floor(u));
  const t = u - k;
  crownOf(env, ribbon, k, k + 1);
  const crown = ribbon.crown[k]! + (ribbon.crown[k + 1]! - ribbon.crown[k]!) * t;
  const tilt = ribbon.tilt[k]! + (ribbon.tilt[k + 1]! - ribbon.tilt[k]!) * t;
  at.copy(ribbon.dirs[k]!).lerp(ribbon.dirs[k + 1]!, t).normalize();
  sideAt(ribbon, k, side);
  at.multiplyScalar(env.R + crown + tilt * lateral).addScaledVector(side, lateral);
  along.subVectors(ribbon.dirs[k + 1]!, ribbon.dirs[k]!);
  along.addScaledVector(at, -along.dot(at) / at.lengthSq()).normalize();
}

/** The nearest point on any road's crown to `point`, within `within` units, and the road's heading there; null past it. */
export function nearestOnRoads(env: RibbonEnv, ribbons: readonly Ribbon[], point: THREE.Vector3, within: number): { at: THREE.Vector3; along: THREE.Vector3 } | null {
  let best: { at: THREE.Vector3; along: THREE.Vector3 } | null = null;
  let bestD = within;
  ribbons.forEach((ribbon) => {
    for (let k = 0; k < ribbon.dirs.length - 1; k++) {
      const d = probe.copy(ribbon.dirs[k]!).multiplyScalar(env.R).distanceTo(point);
      if (d < bestD) {
        bestD = d;
        crownOf(env, ribbon, k, k);
        best = { at: ribbon.dirs[k]!.clone().multiplyScalar(env.R + ribbon.crown[k]!), along: ribbon.dirs[k + 1]!.clone().sub(ribbon.dirs[k]!).normalize() };
      }
    }
  });
  return best;
}
