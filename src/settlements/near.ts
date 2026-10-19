import * as THREE from 'three';
import type { Bench } from '../bench.ts';
import type { FolkAnchor } from '../folk.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { BUILT_CEILING } from '../places.ts';
import { CROWN_STRIDE } from '../scenery/tree-forms.ts';
import { solidField } from '../scenery/solids.ts';
import type { Registry } from './registry.ts';
import type { Bay, BikeSlot, ParkedCar, Slot } from './types.ts';

/**
 * What the standing towns publish to the world round the viewer: people,
 * lamps, takeable vehicles, benches, rack slots and tree crowns, each walked
 * over only the towns that have them. Plus folding a taken vehicle out of its
 * town's buffer.
 */
export interface NearTowns {
  crownsNear(point: THREE.Vector3, range: number, visit: (list: Float32Array, offset: number) => void): void;
  folkNear(viewer: THREE.Vector3, radius: number, out: FolkAnchor[]): void;
  lampsNear(viewer: THREE.Vector3, radius: number, out: Float32Array): number;
  parkedNear(viewer: THREE.Vector3, radius: number, out: ParkedCar[]): void;
  benchesNear(viewer: THREE.Vector3, radius: number, out: Bench[]): void;
  bikeSlotsNear(viewer: THREE.Vector3, radius: number, out: BikeSlot[]): void;
  signalsNear(viewer: THREE.Vector3, radius: number, visit: (town: number, heads: Float32Array) => void): void;
  hideParked(id: string): void;
}

export function createNearTowns(registry: Registry, slots: readonly Slot[]): NearTowns {
  const folkDirection = new THREE.Vector3();
  /** A town's anchor is within `BUILT_CEILING` and ten units of anything it publishes. */
  const cosOf = (radius: number): number => Math.cos((radius + BUILT_CEILING + 10) / PLANET_RADIUS);

  return {
    crownsNear(point, range, visit) {
      const rangeSq = range * range;
      for (const mesh of registry.crowned) {
        // A town reaches no further than `BUILT_CEILING` from its middle, its trees 70 more.
        const reach = range + BUILT_CEILING + 70;
        if (mesh.position.distanceToSquared(point) > reach * reach) continue;
        const list = mesh.userData.crowns as Float32Array;
        for (let o = 0; o < list.length; o += CROWN_STRIDE) {
          const dx = list[o]! - point.x;
          const dy = list[o + 1]! - point.y;
          const dz = list[o + 2]! - point.z;
          if (dx * dx + dy * dy + dz * dz < rangeSq) visit(list, o);
        }
      }
    },

    folkNear(viewer, radius, out) {
      const cosReach = cosOf(radius);
      const direction = folkDirection.copy(viewer).normalize();
      for (const slot of registry.inhabited) {
        // A town built near and seen far again keeps its buffer and stops publishing its people.
        if (!slot.peopled) continue;
        if (slot.direction.dot(direction) < cosReach) continue;
        for (const person of slot.folk) {
          const distance = person.position.distanceTo(viewer);
          if (distance > radius) continue;
          person.distance = distance;
          out.push(person);
        }
      }
    },

    lampsNear(viewer, radius, out) {
      const max = Math.floor(out.length / 4);
      if (max === 0) return 0;
      const cosReach = cosOf(radius);
      const direction = folkDirection.copy(viewer).normalize();
      const r2 = radius * radius;
      let count = 0;
      for (const slot of registry.lit) {
        const heads = slot.lampHeads;
        if (heads === null || slot.direction.dot(direction) < cosReach) continue;
        for (let i = 0; i + 2 < heads.length; i += 3) {
          const dx = heads[i]! - viewer.x;
          const dy = heads[i + 1]! - viewer.y;
          const dz = heads[i + 2]! - viewer.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          // An insertion into a list kept sorted by distance and capped, with no allocation.
          let at = count < max ? count : max - 1;
          if (count === max && d2 >= out[at * 4 + 3]!) continue;
          while (at > 0 && out[(at - 1) * 4 + 3]! > d2) {
            out.copyWithin(at * 4, (at - 1) * 4, at * 4);
            at--;
          }
          out[at * 4] = heads[i]!;
          out[at * 4 + 1] = heads[i + 1]!;
          out[at * 4 + 2] = heads[i + 2]!;
          out[at * 4 + 3] = d2;
          if (count < max) count++;
        }
      }
      for (let k = 0; k < count; k++) out[k * 4 + 3] = Math.sqrt(out[k * 4 + 3]!);
      return count;
    },

    parkedNear(viewer, radius, out) {
      const cosReach = cosOf(radius);
      const direction = folkDirection.copy(viewer).normalize();
      for (const slot of registry.parkedTowns) {
        if (slot.direction.dot(direction) < cosReach) continue;
        for (const bay of slot.parked) {
          if (!bay.hidden && bay.position.distanceTo(viewer) <= radius) out.push(bay);
        }
      }
    },

    benchesNear(viewer, radius, out) {
      const cosReach = cosOf(radius);
      const direction = folkDirection.copy(viewer).normalize();
      for (const slot of registry.benchTowns) {
        if (slot.direction.dot(direction) < cosReach) continue;
        for (const bench of slot.benches) {
          if (bench.position.distanceTo(viewer) <= radius) out.push(bench);
        }
      }
    },

    bikeSlotsNear(viewer, radius, out) {
      const cosReach = cosOf(radius);
      const direction = folkDirection.copy(viewer).normalize();
      for (const slot of registry.rackTowns) {
        if (slot.direction.dot(direction) < cosReach) continue;
        for (const rack of slot.bikeSlots) {
          if (rack.position.distanceTo(viewer) <= radius) out.push(rack);
        }
      }
    },

    signalsNear(viewer, radius, visit) {
      const cosReach = cosOf(radius);
      const direction = folkDirection.copy(viewer).normalize();
      for (const slot of registry.signalTowns) {
        if (slot.signalHeads !== null && slot.direction.dot(direction) >= cosReach) visit(slot.index, slot.signalHeads);
      }
    },

    /** A taken vehicle folded out of its town (`foldBay`). */
    hideParked(id) {
      const parts = id.split(':');
      const slot = slots[Number(parts[1])];
      if (slot === undefined || slot.mesh === null) return;
      const bay = slot.parked.find((entry) => entry.id === id);
      if (bay === undefined || bay.hidden) return;
      foldBay(slot, bay);
    },
  };
}

/**
 * Folds a taken vehicle's vertices onto its first, in the town's buffer and
 * its glass mesh, so it and its ink hull draw nothing; and takes its wall
 * down. Cheaper than building the town again.
 */
export function foldBay(slot: Slot, bay: Bay): void {
  const mesh = slot.mesh;
  if (mesh === null) return;
  bay.hidden = true;
  const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const array = position.array as Float32Array;
  const first = bay.start * 3;
  for (let v = bay.start + 1; v < bay.start + bay.count; v++) {
    array[v * 3] = array[first]!;
    array[v * 3 + 1] = array[first + 1]!;
    array[v * 3 + 2] = array[first + 2]!;
  }
  position.addUpdateRange(first, bay.count * 3);
  position.needsUpdate = true;
  const glassMesh = mesh.userData.glass as THREE.Mesh | undefined;
  if (glassMesh !== undefined && bay.glassCount > 0) {
    const panes = glassMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const glass = panes.array as Float32Array;
    const head = bay.glassStart * 3;
    for (let v = bay.glassStart + 1; v < bay.glassStart + bay.glassCount; v++) {
      glass[v * 3] = glass[head]!;
      glass[v * 3 + 1] = glass[head + 1]!;
      glass[v * 3 + 2] = glass[head + 2]!;
    }
    panes.addUpdateRange(head, bay.glassCount * 3);
    panes.needsUpdate = true;
  }
  const floor = slot.floor;
  if (floor !== null && floor.solids !== null) {
    const rest = floor.solids.solids.filter((solid) => solid !== bay.solid);
    floor.solids = rest.length > 0 ? solidField(rest) : null;
  }
}
