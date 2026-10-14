/** The tangent frame of the cell being planned, in local units east and north of its centre. */
import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import type { CellBounds } from '../tile-grid.ts';

export const DEG = Math.PI / 180;

/** How far inside its own cell everything a plan holds stays, world units. */
export const CELL_MARGIN = 3;

export interface CellFrame {
  up: THREE.Vector3;
  north: THREE.Vector3;
  east: THREE.Vector3;
  bounds: CellBounds;
  /**
   * Whether the whole cell is further from any water than it is wide: then
   * every point in it is land and the point-in-polygon under each is skipped.
   */
  inland: boolean;
  scratch: THREE.Vector3;
}

export function createCellFrame(): CellFrame {
  return {
    up: new THREE.Vector3(),
    north: new THREE.Vector3(),
    east: new THREE.Vector3(),
    bounds: { south: 0, west: 0, dLat: 0, dLon: 0 },
    inland: false,
    scratch: new THREE.Vector3(),
  };
}

/** Orients the frame on the cell's centre. */
export function orient(f: CellFrame, centreLat: number, centreLon: number): void {
  unitAt(centreLat, centreLon, f.up);
  f.north.set(0, 1, 0).projectOnPlane(f.up);
  if (f.north.lengthSq() < 1e-8) f.north.set(1, 0, 0).projectOnPlane(f.up);
  f.north.normalize();
  f.east.crossVectors(f.up, f.north).normalize();
}

/** A local offset (east, north) from the cell's centre as a unit vector. */
export function dirAt(f: CellFrame, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(f.up).addScaledVector(f.east, x / PLANET_RADIUS).addScaledVector(f.north, z / PLANET_RADIUS).normalize();
}

export const localX = (f: CellFrame, u: THREE.Vector3): number => u.dot(f.east) * PLANET_RADIUS;
export const localZ = (f: CellFrame, u: THREE.Vector3): number => u.dot(f.north) * PLANET_RADIUS;

/** Whether a point is inside the plan's own cell, `margin` units in from its edge. */
export function inCell(f: CellFrame, x: number, z: number, margin: number): boolean {
  const u = dirAt(f, x, z, f.scratch);
  const lat = latOf(u.y);
  const lon = lonOf(u.x, u.z);
  const inset = (margin + CELL_MARGIN) / UNITS_PER_DEGREE;
  if (lat < f.bounds.south + inset || lat > f.bounds.south + f.bounds.dLat - inset) return false;
  let dLon = lon - f.bounds.west;
  dLon = ((dLon % 360) + 360) % 360;
  const insetLon = inset / Math.max(Math.cos(lat * DEG), 0.05);
  return dLon >= insetLon && dLon <= f.bounds.dLon - insetLon;
}
