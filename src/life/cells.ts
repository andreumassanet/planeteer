/**
 * The lat/lon cells the sea, the pasture and the sky are seeded in. A cell's
 * row and column are its seed and its key.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { DEG } from './tuning.ts';

/**
 * Columns round the planet for a cell size: a whole number, so the ring closes
 * at the antimeridian and a cell keeps its key (and seed) across 180 degrees.
 */
function columnsOf(size: number): number {
  return Math.max(1, Math.round(360 / size));
}

/** One column index folded into `[-floor(n/2), n - floor(n/2))`, centred on Greenwich. */
function wrapColumn(col: number, count: number): number {
  const half = count >> 1;
  return ((((col + half) % count) + count) % count) - half;
}

/** Walks the lat/lon cells of a given size within a range of the viewer. */
export function forEachCell(
  viewer: THREE.Vector3, size: number, range: number,
  visit: (row: number, col: number) => void,
): void {
  const length = viewer.length() || 1;
  const lat = latOf(viewer.y / length);
  const lon = lonOf(viewer.x, viewer.z);
  const rows = Math.ceil(range / (size * DEG * PLANET_RADIUS)) + 1;
  // Longitude shrinks with the cosine, so high latitudes need more columns;
  // clamped, or a pole scans the whole planet.
  const cols = Math.min(24, Math.ceil(rows / Math.max(0.12, Math.cos(lat * DEG))));
  const row0 = Math.floor(lat / size);
  const count = columnsOf(size);
  const col0 = Math.floor(lon / (360 / count));
  for (let dr = -rows; dr <= rows; dr++) {
    const row = row0 + dr;
    if (row * size < -89 || row * size > 88) continue;
    for (let dc = -cols; dc <= cols; dc++) visit(row, wrapColumn(col0 + dc, count));
  }
}

/** A unit vector inside one lat/lon cell, at fractions `u` (row) and `v` (column). */
export function cellPoint(row: number, col: number, size: number, u: number, v: number): THREE.Vector3 {
  return unitAt((row + u) * size, (col + v) * (360 / columnsOf(size)), new THREE.Vector3());
}

/** North and east tangents at a unit vector, falling back to +x at a pole. */
export function tangentsAt(up: THREE.Vector3, north: THREE.Vector3, east: THREE.Vector3): void {
  north.set(0, 1, 0).projectOnPlane(up);
  if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(up);
  north.normalize();
  east.crossVectors(up, north).normalize();
}
