/** What the drawn tiles offer the rest of the world: walls, crowns, vehicles that can be taken, motion. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { CROWN_STRIDE } from '../scenery/tree-forms.ts';
import { freeSpot, enclosed, pushOut, solidField } from '../scenery/solids.ts';
import type { ParkedCar } from '../settlements.ts';
import type { CountryMotionRows } from '../countryside-tile.ts';
import type { StreamState } from './streamer.ts';
import type { Standing } from './tiles.ts';
import type { Vegetation } from './types.ts';

type Queries = Pick<
  Vegetation,
  'collide' | 'freeSpotNear' | 'blocksSight' | 'crownsNear' | 'parkedNear' | 'hideParked' | 'motion'
>;

export function createQueries(state: StreamState): Queries {
  const { standing, retiring, walled, crowned, machined } = state;
  const solidDir = new THREE.Vector3();
  const solidPush = { x: 0, z: 0 };
  const machineSeen = new Set<string>();

  /** Folds a taken vehicle out of a tile's buffer and walls. */
  function foldMachine(entry: Standing, id: string): void {
    const machine = entry.machines?.find((candidate) => candidate.id === id);
    if (machine === undefined || machine.hidden) return;
    machine.hidden = true;
    // Every vertex onto the first, as a town folds a parked car: the
    // triangles draw nothing, nor do their ink hulls.
    const position = entry.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    const first = machine.start * 3;
    for (let v = machine.start + 1; v < machine.start + machine.count; v++) {
      array[v * 3] = array[first]!;
      array[v * 3 + 1] = array[first + 1]!;
      array[v * 3 + 2] = array[first + 2]!;
    }
    position.addUpdateRange(first, machine.count * 3);
    position.needsUpdate = true;
    const walls = entry.walls;
    if (walls !== null && machine.solids.length > 0) {
      const gone = new Set(machine.solids);
      walls.solids = walls.solids.filter((solid) => !gone.has(solid));
      if (walls.solids.length > 0) walls.field = solidField(walls.solids);
      else {
        entry.walls = null;
        walled.delete(entry);
      }
    }
  }

  return {
    collide(point, radius, push) {
      push.set(0, 0, 0);
      solidDir.copy(point).normalize();
      let hit = false;
      for (const entry of walled) {
        const walls = entry.walls!;
        if (solidDir.dot(walls.up) < walls.cosBound) continue;
        if (!pushOut(walls.field, point.dot(walls.across), point.dot(walls.north), radius, solidPush)) continue;
        push.addScaledVector(walls.across, solidPush.x).addScaledVector(walls.north, solidPush.z);
        hit = true;
      }
      return hit;
    },

    freeSpotNear(point, radius, out) {
      solidDir.copy(point).normalize();
      for (const entry of walled) {
        const walls = entry.walls!;
        if (solidDir.dot(walls.up) < walls.cosBound) continue;
        const x = point.dot(walls.across);
        const z = point.dot(walls.north);
        if (!freeSpot(walls.field, x, z, radius, solidPush)) continue;
        out.copy(point).addScaledVector(walls.across, solidPush.x - x).addScaledVector(walls.north, solidPush.z - z);
        out.setLength(point.length());
        return true;
      }
      return false;
    },

    blocksSight(point) {
      solidDir.copy(point).normalize();
      const height = point.length();
      for (const entry of walled) {
        const walls = entry.walls!;
        if (solidDir.dot(walls.up) < walls.cosBound) continue;
        if (enclosed(walls.field, point.dot(walls.across), point.dot(walls.north), height)) return true;
      }
      return false;
    },

    crownsNear(point, range, visit) {
      solidDir.copy(point).normalize();
      const rangeSq = range * range;
      for (const entry of crowned) {
        const list = entry.crowns!;
        // A tile's own bound first, where it has one: the walls' cone.
        if (entry.walls !== null && solidDir.dot(entry.walls.up) < entry.walls.cosBound - range / PLANET_RADIUS) continue;
        for (let o = 0; o < list.length; o += CROWN_STRIDE) {
          const dx = list[o]! - point.x;
          const dy = list[o + 1]! - point.y;
          const dz = list[o + 2]! - point.z;
          if (dx * dx + dy * dy + dz * dz < rangeSq) visit(list, o);
        }
      }
    },

    parkedNear(viewer: THREE.Vector3, radius: number, out: ParkedCar[]) {
      machineSeen.clear();
      for (const entry of machined) {
        for (const machine of entry.machines!) {
          if (machine.hidden || machineSeen.has(machine.id) || machine.position.distanceTo(viewer) > radius) continue;
          machineSeen.add(machine.id);
          out.push(machine);
        }
      }
    },

    hideParked(id) {
      for (const entry of standing.values()) foldMachine(entry, id);
      for (const entry of retiring.values()) foldMachine(entry, id);
    },

    motion(visit: (rows: CountryMotionRows) => void) {
      for (const entry of standing.values()) if (entry.shown && entry.motion !== null) visit(entry.motion);
      for (const entry of retiring.values()) if (entry.motion !== null) visit(entry.motion);
    },
  };
}
