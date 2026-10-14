import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { floorLiftAt } from '../scenery/floor.ts';
import { enclosed, freeSpot, pushOut } from '../scenery/solids.ts';
import type { Registry } from './registry.ts';

/**
 * Point queries against the standing towns: the floor a foot stands on, and
 * the walls a body or the camera meets. Only a standing town has either, and
 * each is gated by one dot product, so a point far from any town costs little.
 * Within a town the tangent components are the town's local coordinates.
 */
export interface TownQueries {
  madeHeightAt(point: THREE.Vector3): number;
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3, over?: number): boolean;
  blocksSight(point: THREE.Vector3): boolean;
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
}

export function createTownQueries(world: World, registry: Registry): TownQueries {
  const madeDir = new THREE.Vector3();
  const wallDir = new THREE.Vector3();
  const wallPush = { x: 0, z: 0 };
  const wallFree = { x: 0, z: 0 };
  const { floors } = registry;

  return {
    /**
     * The highest floor over the ground here, absolute. The ground is asked at
     * most once, and only once a town is near. A quay's paving drawn over a
     * scrap of sea is still stood on: the answer is measured from elevation 0
     * there.
     */
    madeHeightAt(point) {
      madeDir.copy(point).normalize();
      let best = 0;
      let elevation: number | null = null;
      for (const slot of floors) {
        const floor = slot.floor;
        if (floor === null) continue;
        if (madeDir.dot(floor.up) < floor.cosBound) continue;
        if (elevation === null) elevation = world.elevationAt(madeDir);
        const lift = floorLiftAt(
          floor.field,
          madeDir.dot(floor.across) * PLANET_RADIUS,
          madeDir.dot(floor.north) * PLANET_RADIUS,
          elevation,
        );
        if (lift > best) best = lift;
      }
      if (best <= 0 || elevation === null) return 0;
      return PLANET_RADIUS + elevation + best;
    },

    /**
     * The walls, for `player.ts`: the whole displacement along the ground that
     * takes a body of `radius` out of every building it overlaps, which the
     * player reads the wall's direction off. `over` leaves out roofs below it.
     */
    collide(point, radius, push, over = -Infinity) {
      push.set(0, 0, 0);
      wallDir.copy(point).normalize();
      let hit = false;
      for (const slot of floors) {
        const floor = slot.floor;
        if (floor === null || floor.solids === null) continue;
        if (wallDir.dot(floor.up) < floor.cosBound) continue;
        const x = wallDir.dot(floor.across) * PLANET_RADIUS;
        const z = wallDir.dot(floor.north) * PLANET_RADIUS;
        if (!pushOut(floor.solids, x, z, radius, wallPush, over)) continue;
        push.addScaledVector(floor.across, wallPush.x).addScaledVector(floor.north, wallPush.z);
        hit = true;
      }
      return hit;
    },

    blocksSight(point) {
      wallDir.copy(point).normalize();
      const height = point.length();
      for (const slot of floors) {
        const floor = slot.floor;
        if (floor === null || floor.solids === null) continue;
        if (wallDir.dot(floor.up) < floor.cosBound) continue;
        const x = wallDir.dot(floor.across) * PLANET_RADIUS;
        const z = wallDir.dot(floor.north) * PLANET_RADIUS;
        if (enclosed(floor.solids, x, z, height)) return true;
      }
      return false;
    },

    /** The nearest point clear of every wall, at the same radius; false if `point` already is. */
    freeSpotNear(point, radius, out) {
      wallDir.copy(point).normalize();
      for (const slot of floors) {
        const floor = slot.floor;
        if (floor === null || floor.solids === null) continue;
        if (wallDir.dot(floor.up) < floor.cosBound) continue;
        const x = wallDir.dot(floor.across) * PLANET_RADIUS;
        const z = wallDir.dot(floor.north) * PLANET_RADIUS;
        if (!freeSpot(floor.solids, x, z, radius, wallFree)) continue;
        out
          .copy(floor.up)
          .addScaledVector(floor.across, wallFree.x / PLANET_RADIUS)
          .addScaledVector(floor.north, wallFree.z / PLANET_RADIUS)
          .normalize()
          .multiplyScalar(point.length());
        return true;
      }
      return false;
    },
  };
}
