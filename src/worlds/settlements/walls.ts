/** The towns' buildings as walls: circles in each town's frame that push a body out and block the camera. */

import * as THREE from 'three';
import type { Site } from './types.ts';

export interface TownWalls {
  /** Pushes a body of `radius` at `position` out of every wall sideways; true if it moved. */
  collide(position: THREE.Vector3, radius: number): boolean;
  /** Whether a point is inside a building. */
  blocks(point: THREE.Vector3): boolean;
}

export function createTownWalls(sites: readonly Site[]): TownWalls {
  const local = new THREE.Vector3();
  const inverse = new THREE.Quaternion();

  function toLocal(site: Site, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(point).sub(site.origin).applyQuaternion(inverse.copy(site.quaternion).invert());
  }

  return {
    collide(position, radius) {
      let moved = false;
      for (const site of sites) {
        if (site.mesh === null || position.distanceTo(site.origin) > site.radius + 60) continue;
        toLocal(site, position, local);
        let changed = false;
        for (const f of site.footprints) {
          if (local.y > site.floor + f.height) continue;
          const dx = local.x - f.x;
          const dz = local.z - f.z;
          const d = Math.hypot(dx, dz);
          const min = f.radius + radius;
          if (d >= min) continue;
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;
          local.x = f.x + nx * min;
          local.z = f.z + nz * min;
          changed = true;
        }
        if (changed) {
          local.applyQuaternion(site.quaternion).add(site.origin);
          // Keep the radial distance: the push is sideways only.
          const keep = position.length();
          position.copy(local).setLength(keep);
          moved = true;
        }
      }
      return moved;
    },
    blocks(point) {
      for (const site of sites) {
        if (site.mesh === null || point.distanceTo(site.origin) > site.radius + 40) continue;
        toLocal(site, point, local);
        for (const f of site.footprints) {
          if (local.y < site.floor + f.height && Math.hypot(local.x - f.x, local.z - f.z) < f.radius) return true;
        }
      }
      return false;
    },
  };
}
