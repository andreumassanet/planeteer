/** Chunks of ribbon, built and dropped as one, and the cell index `surfaceAt` reads. */

import * as THREE from 'three';
import { BANK_GRADE, BANK_RUN_MAX, TOE_DEPTH } from './mesh.ts';
import { edgeOf, sideAt } from './ribbon.ts';
import type { Ribbon, RibbonEnv } from './ribbon.ts';

/** A chunk of ribbon, points: built and dropped as one. */
const CHUNK = 64;
/** The cells `surfaceAt` reads, units: wider than a piece of road and its banks reach from its first point. */
const CELL = 40;

export interface Chunk {
  road: number;
  from: number;
  to: number;
  centre: THREE.Vector3;
  mesh: THREE.Mesh | null;
  indexed: boolean;
}

export function chunksOf(ribbons: readonly Ribbon[], R: number): Chunk[] {
  const chunks: Chunk[] = [];
  ribbons.forEach((ribbon, road) => {
    for (let from = 0; from < ribbon.dirs.length - 1; from += CHUNK) {
      const to = Math.min(ribbon.dirs.length - 1, from + CHUNK);
      chunks.push({ road, from, to, centre: ribbon.dirs[Math.floor((from + to) / 2)]!.clone().multiplyScalar(R), mesh: null, indexed: false });
    }
  });
  return chunks;
}

export interface SurfaceIndex {
  /** Files a chunk's pieces in their cells; filled as chunks are first built. */
  index(chunk: Chunk): void;
  /**
   * The road's surface over the direction `x, y, z` (a unit vector) as a
   * height over the walkable radius (the top, or the bank falling from it), or
   * null off every built road.
   */
  surfaceAt(x: number, y: number, z: number): number | null;
}

/**
 * Which pieces of which road stand in a cell of space `CELL` wide (as wide as
 * a piece reaches), so `surfaceAt` reads its own cell and the 26 round it, a
 * handful of pieces and not a network.
 */
export function createSurfaceIndex(env: RibbonEnv, ribbons: readonly Ribbon[]): SurfaceIndex {
  const { R, deck } = env;
  const cells = new Map<number, { road: number; k: number }[]>();
  const cellOf = (v: number): number => Math.floor((v * R) / CELL) + 8192;
  const cellKey = (i: number, j: number, l: number): number => (i * 16384 + j) * 16384 + l;
  const segment = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const side = new THREE.Vector3();
  return {
    index(chunk) {
      if (chunk.indexed) return;
      chunk.indexed = true;
      for (let k = chunk.from; k < chunk.to; k++) {
        const d = ribbons[chunk.road]!.dirs[k]!;
        const key = cellKey(cellOf(d.x), cellOf(d.y), cellOf(d.z));
        const list = cells.get(key);
        if (list === undefined) cells.set(key, [{ road: chunk.road, k }]);
        else list.push({ road: chunk.road, k });
      }
    },
    surfaceAt(x, y, z) {
      let best: number | null = null;
      const ci = cellOf(x);
      const cj = cellOf(y);
      const cl = cellOf(z);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let l = cl - 1; l <= cl + 1; l++) {
        const list = cells.get(cellKey(i, j, l));
        if (list === undefined) continue;
        for (const { road, k } of list) {
          const ribbon = ribbons[road]!;
          const a = ribbon.dirs[k]!;
          // Along the piece and across it, on the tangent plane at `a`.
          segment.subVectors(ribbon.dirs[k + 1]!, a);
          probe.set(x - a.x, y - a.y, z - a.z);
          const t = probe.dot(segment) / segment.lengthSq();
          if (t < 0 || t > 1) continue;
          const offset = probe.dot(sideAt(ribbon, k, side)) * R;
          const edge = edgeOf(ribbon, k);
          const away = Math.abs(offset);
          if (away > edge + BANK_RUN_MAX) continue;
          const crown = ribbon.crown[k]! + (ribbon.crown[k + 1]! - ribbon.crown[k]!) * t;
          const tilt = ribbon.tilt[k]! + (ribbon.tilt[k + 1]! - ribbon.tilt[k]!) * t;
          let height: number;
          if (away <= edge) height = crown + tilt * offset;
          else if (deck) continue;
          else {
            // The bank, as `layChunk` lays it: the top's edge straight down to its toe.
            const way = offset > 0 ? 1 : -1;
            const top = crown + tilt * edge * way;
            const under = way > 0 ? ribbon.right[k]! : ribbon.left[k]!;
            const run = Math.min(BANK_RUN_MAX, Math.max(1, (top - under + TOE_DEPTH) / BANK_GRADE));
            if (away > edge + run) continue;
            height = top + ((away - edge) / run) * (under - TOE_DEPTH - top);
          }
          if (best === null || height > best) best = height;
        }
      }
      return best;
    },
  };
}
