/** The outposts standing: the walls and door lamps of those built so far, for a body to meet and the night to light. */

import * as THREE from 'three';
import type { TileKey } from '../cube.ts';
import { keyOf } from '../cube.ts';
import { LAMP_FIELD } from '../../lights.ts';
import type { OutpostKind, OutpostPlan } from './layout.ts';

export interface Wall {
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface Standing {
  readonly stats: { planned: number; built: number; walls: number };
  /** An outpost comes with its tile's decoration. */
  add(key: TileKey, plan: OutpostPlan, walls: Wall[], lamps: number[]): void;
  /** A tile let go of by the ground: its outpost's walls and lamps go with it. */
  retire(key: TileKey): void;
  lampsNear(point: THREE.Vector3, out: Float32Array, from: number, max: number): number;
  nearest(point: THREE.Vector3, kind?: OutpostKind): OutpostPlan | null;
  collide(position: THREE.Vector3, radius: number): boolean;
}

/**
 * The outposts standing, by their tile's key: the plan, its walls (world
 * positions and radii) and its door lamps (flat x, y, z). An entry goes when the
 * ground lets the tile go, so the lists are the outposts drawn and no more.
 */
export function createStanding(R: number): Standing {
  const standing = new Map<string, { plan: OutpostPlan; walls: Wall[]; lamps: number[] }>();
  const stats = { planned: 0, built: 0, walls: 0 };
  const scratchUp = new THREE.Vector3();
  const scratchPoint = new THREE.Vector3();
  return {
    stats,
    add(key, plan, walls, lamps) {
      const id = keyOf(key);
      if (!standing.has(id)) {
        stats.built++;
        stats.walls += walls.length;
      }
      standing.set(id, { plan, walls, lamps });
    },
    retire(key) {
      const id = keyOf(key);
      const gone = standing.get(id);
      if (gone === undefined) return;
      stats.walls -= gone.walls.length;
      standing.delete(id);
    },
    lampsNear(point, out, from, max) {
      let n = from;
      const length = point.length();
      for (const { plan, lamps } of standing.values()) {
        // Only the outposts whose lamps can reach the point at all.
        if (plan.at.dot(point) / length < 1 - 0.5 * ((plan.reach + LAMP_FIELD) / R) ** 2) continue;
        for (let k = 0; k < lamps.length && n < max; k += 3) {
          const d = Math.hypot(lamps[k]! - point.x, lamps[k + 1]! - point.y, lamps[k + 2]! - point.z);
          if (d >= LAMP_FIELD) continue;
          out[n * 4] = lamps[k]!;
          out[n * 4 + 1] = lamps[k + 1]!;
          out[n * 4 + 2] = lamps[k + 2]!;
          out[n * 4 + 3] = d;
          n++;
        }
      }
      return n;
    },
    nearest(point, kind) {
      let best: OutpostPlan | null = null;
      let most = -2;
      const length = point.length();
      for (const { plan } of standing.values()) {
        if (kind !== undefined && plan.kind !== kind) continue;
        const cos = plan.at.dot(point) / length;
        if (cos > most) [best, most] = [plan, cos];
      }
      return best;
    },
    collide(position, radius) {
      let moved = false;
      for (const { plan, walls } of standing.values()) {
        // Only the outposts within reach.
        const cos = plan.at.dot(position) / position.length();
        if (cos < 1 - 0.5 * ((plan.reach + radius + 4) / R) ** 2) continue;
        for (const wall of walls) {
          // Across the ground only: the wall's foot and the body's differ in height.
          const keep = position.length();
          scratchUp.copy(position).divideScalar(keep);
          scratchPoint.set(position.x - wall.x, position.y - wall.y, position.z - wall.z);
          scratchPoint.addScaledVector(scratchUp, -scratchPoint.dot(scratchUp));
          const min = wall.r + radius;
          const d2 = scratchPoint.lengthSq();
          if (d2 >= min * min) continue;
          if (d2 < 1e-8) scratchPoint.set(scratchUp.y, -scratchUp.x, 0.3).addScaledVector(scratchUp, -scratchUp.dot(scratchPoint));
          position.addScaledVector(scratchPoint.normalize(), min - Math.sqrt(d2)).setLength(keep);
          moved = true;
        }
      }
      return moved;
    },
  };
}
