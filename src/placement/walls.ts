/**
 * A standing monument's walls are its own triangles (`scenery/occupancy.ts`):
 * what occupies the band a body moves through, from knee to head, so passages
 * under an arch stay open. Measuring one is a build, done once per landmark
 * when one is near, one a frame, and kept.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { enclosed, freeSpot, pushOut, solidField, yawed } from '../scenery/solids.ts';
import { floorAt, occupancyOf } from '../scenery/occupancy.ts';
import type { Occupancy } from '../scenery/occupancy.ts';
import type { Slot, Walls } from './slots.ts';

/** How near a standing monument has to be, past its footprint, before its walls are measured. */
export const SOLID_REACH = 300;
/** Measured monuments kept after they drop; the oldest go first. */
const KEEP_MEASURED = 16;
/** Past a monument's widest rectangle, how far a query may still reach its walls. */
const SOLID_MARGIN = 10;

export interface WallSet {
  /** Measures a standing monument's walls, or takes them from the cache. */
  wall(slot: Slot): void;
  /** Forgets a slot's walls (it moved or dropped). */
  unwall(slot: Slot): void;
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  freeSpotNear(point: THREE.Vector3, radius: number, out: THREE.Vector3): boolean;
  blocksSight(point: THREE.Vector3): boolean;
  madeHeightAt(point: THREE.Vector3): number;
  stats(): { walled: number; rects: number };
}

export function createWalls(): WallSet {
  /** Each monument's measure, by id. Most recently used last. */
  const measured = new Map<string, Occupancy>();
  /** The slots with walls now: a handful at most. */
  const walled: Slot[] = [];
  const wallDir = new THREE.Vector3();
  const wallPush = { x: 0, z: 0 };

  function unwall(slot: Slot): void {
    if (slot.walls === null) return;
    slot.walls = null;
    walled.splice(walled.indexOf(slot), 1);
  }

  function wall(slot: Slot): void {
    const model = slot.object;
    if (model === null || slot.walls !== null) return;
    const id = slot.placement.id;
    let occupancy = measured.get(id);
    if (occupancy === undefined) {
      const position = model.geometry.getAttribute('position').array as Float32Array;
      occupancy = occupancyOf(position, true);
    } else measured.delete(id);
    measured.set(id, occupancy);
    if (measured.size > KEEP_MEASURED) {
      for (const key of measured.keys()) {
        if (measured.size <= KEEP_MEASURED) break;
        if (walled.some((other) => other.placement.id === key)) continue;
        measured.delete(key);
      }
    }
    const base = model.position.length();
    const rects = occupancy.rects;
    const solids = [];
    let widest = 0;
    for (let i = 0; i < rects.length; i += 5) {
      const x = rects[i]!;
      const z = rects[i + 1]!;
      solids.push(yawed(x, z, 0, rects[i + 2]!, rects[i + 3]!, base + rects[i + 4]!));
      widest = Math.max(widest, Math.hypot(Math.abs(x) + rects[i + 2]!, Math.abs(z) + rects[i + 3]!));
    }
    const floor = occupancy.floor;
    if (floor !== null) {
      widest = Math.max(widest, Math.hypot(Math.abs(floor.minX), Math.abs(floor.minZ)));
      widest = Math.max(widest, Math.hypot(floor.minX + floor.cols * floor.cell, floor.minZ + floor.rows * floor.cell));
    }
    // The model's own axes, off the rotation `raise` gave it.
    slot.walls = {
      field: solidField(solids),
      floor,
      right: new THREE.Vector3(1, 0, 0).applyQuaternion(model.quaternion),
      facing: new THREE.Vector3(0, 0, 1).applyQuaternion(model.quaternion),
      base,
      cosBound: Math.cos((widest + SOLID_MARGIN) / PLANET_RADIUS),
    };
    walled.push(slot);
  }

  /** The slot's walls if `point` may meet them. */
  function near(slot: Slot, point: THREE.Vector3): Walls | null {
    const walls = slot.walls!;
    wallDir.copy(point).normalize();
    return wallDir.dot(slot.direction) < walls.cosBound ? null : walls;
  }

  return {
    wall,
    unwall,
    collide(point, radius, push) {
      push.set(0, 0, 0);
      let hit = false;
      for (const slot of walled) {
        const walls = near(slot, point);
        if (walls === null) continue;
        if (!pushOut(walls.field, point.dot(walls.right), point.dot(walls.facing), radius, wallPush)) continue;
        push.addScaledVector(walls.right, wallPush.x).addScaledVector(walls.facing, wallPush.z);
        hit = true;
      }
      return hit;
    },
    freeSpotNear(point, radius, out) {
      for (const slot of walled) {
        const walls = near(slot, point);
        if (walls === null) continue;
        const x = point.dot(walls.right);
        const z = point.dot(walls.facing);
        if (!freeSpot(walls.field, x, z, radius, wallPush)) continue;
        out.copy(point).addScaledVector(walls.right, wallPush.x - x).addScaledVector(walls.facing, wallPush.z - z);
        out.setLength(point.length());
        return true;
      }
      return false;
    },
    blocksSight(point) {
      const height = point.length();
      for (const slot of walled) {
        const walls = near(slot, point);
        if (walls !== null && enclosed(walls.field, point.dot(walls.right), point.dot(walls.facing), height)) return true;
      }
      return false;
    },
    madeHeightAt(point) {
      let highest = 0;
      for (const slot of walled) {
        const walls = near(slot, point);
        if (walls === null || walls.floor === null) continue;
        const f = floorAt(walls.floor, point.dot(walls.right), point.dot(walls.facing));
        if (f === f) highest = Math.max(highest, walls.base + f);
      }
      return highest;
    },
    stats: () => ({ walled: walled.length, rects: walled.reduce((sum, slot) => sum + slot.walls!.field.solids.length, 0) }),
  };
}
