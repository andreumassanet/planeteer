import * as THREE from 'three';
import type { Measurements } from '../../monuments/contract.ts';
import type { Vehicle } from './types.ts';

/**
 * The silhouette grid, in world units (not normalised), 0.2 to a cell, over
 * z in [-12, 12] and y in [-2, 28]: every kind from a rowing boat's draft to a
 * balloon's crown. Normalising by the bounding box would delete the aspect
 * ratio, which is most of what tells vehicles apart.
 */
const CELL = 0.2;
const SIL_Z0 = -12;
const SIL_Y0 = -2;
const SIL_Z = 120;
const SIL_Y = 150;

/**
 * The side elevation as a bitmap: the shadow the model casts along its own X
 * axis, ground at y = 0. A saloon, a hatchback and an estate share a bounding
 * box but differ in where the mass sits along the length; rasterising (rather
 * than sampling heights) also sees the hole of a pickup's bed.
 */
export function silhouetteOf(group: THREE.Group): Uint8Array {
  group.updateMatrixWorld(true);
  const bits = new Uint8Array(SIL_Z * SIL_Y);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
      // Fill the triangle's own box in cell space: coarse, but enough to tell
      // a pickup from a van.
      const zi0 = Math.floor((Math.min(a.z, b.z, c.z) - SIL_Z0) / CELL);
      const zi1 = Math.floor((Math.max(a.z, b.z, c.z) - SIL_Z0) / CELL);
      const yi0 = Math.floor((Math.min(a.y, b.y, c.y) - SIL_Y0) / CELL);
      const yi1 = Math.floor((Math.max(a.y, b.y, c.y) - SIL_Y0) / CELL);
      for (let zi = Math.max(0, zi0); zi <= Math.min(SIL_Z - 1, zi1); zi++) {
        for (let yi = Math.max(0, yi0); yi <= Math.min(SIL_Y - 1, yi1); yi++) {
          bits[yi * SIL_Z + zi] = 1;
        }
      }
    }
  });
  return bits;
}

/** Intersection over union of two silhouettes. 1 is the same shape, 0 shares nothing. */
export function silhouetteOverlap(a: Uint8Array, b: Uint8Array): number {
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) either++;
    if (a[i] && b[i]) both++;
  }
  return either === 0 ? 1 : both / either;
}

/**
 * Two vehicles read as the same shape above this overlap. It sits above the
 * closest pair in the kit (the minibus and the panel van, about 0.81) and
 * below two names for one shape; `pnpm traffic` fails a pair over it.
 */
export const SAME_SHAPE = 0.9;

export interface Variety {
  /** Distinct silhouettes across the sample, clustered at `SAME_SHAPE`. */
  shapes: number;
  /** Distinct colour sets. */
  palettes: number;
  samples: number;
}

export function varietyOf(groups: readonly THREE.Group[], measurements: readonly Measurements[]): Variety {
  const signatures = groups.map(silhouetteOf);
  const kept: Uint8Array[] = [];
  for (const signature of signatures) {
    if (!kept.some((other) => silhouetteOverlap(signature, other) > SAME_SHAPE)) kept.push(signature);
  }
  const palettes = new Set<string>();
  for (const m of measurements) palettes.add([...m.colors].sort((x, y) => x - y).join(','));
  return { shapes: kept.length, palettes: palettes.size, samples: groups.length };
}

/** Whether a vehicle can pass another of itself on a carriageway this wide. */
export function passesOn(vehicle: Vehicle, carriageway: number): boolean {
  return vehicle.size[1] * 2 + 0.6 <= carriageway;
}

/** Whether one of it fits at all. */
export function fitsOn(vehicle: Vehicle, carriageway: number): boolean {
  return vehicle.size[1] + 0.4 <= carriageway;
}
