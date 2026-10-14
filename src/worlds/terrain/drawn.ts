/** The drawn ground: the finest grid's triangle under a point, and the bare spots kept free of decoration. */

import { latOf, lonOf } from '../../sphere.ts';
import { TILE_SEGMENTS, faceDir, facePoint } from '../cube.ts';
import type { FacePoint } from '../cube.ts';
import type { Pad } from './types.ts';

/**
 * What the foot stands on is what is drawn. The mesh is a grid of triangles
 * and the field between its vertices is not flat, so `groundAt` does not answer
 * the field: it answers the finest tile's triangle under the point,
 * interpolated between three of the field's own vertices exactly as the mesh is.
 * Near the player the finest tile is the one drawn, so the foot and the drawing
 * agree to the float.
 */
export function createGroundAt(levels: number, heightAt: (x: number, y: number, z: number) => number): (x: number, y: number, z: number) => number {
  const step = 2 / ((1 << levels) * TILE_SEGMENTS);
  const point: FacePoint = { face: 0, u: 0, v: 0 };
  const corner = { x: 0, y: 0, z: 0 };
  const cornerHeight = (face: number, i: number, j: number): number => {
    faceDir(face, -1 + i * step, -1 + j * step, corner);
    return heightAt(corner.x, corner.y, corner.z);
  };

  return (x, y, z) => {
    facePoint(x, y, z, point);
    const gu = (point.u + 1) / step;
    const gv = (point.v + 1) / step;
    const last = (1 << levels) * TILE_SEGMENTS - 1;
    const i = Math.min(last, Math.max(0, Math.floor(gu)));
    const j = Math.min(last, Math.max(0, Math.floor(gv)));
    const fu = gu - i;
    const fv = gv - j;
    const a = cornerHeight(point.face, i, j);
    const c = cornerHeight(point.face, i + 1, j + 1);
    // The diagonal runs from (i, j) to (i+1, j+1), as the tiles wind it.
    if (fu >= fv) {
      const b = cornerHeight(point.face, i + 1, j);
      return a + fu * (b - a) + fv * (c - b);
    }
    const d = cornerHeight(point.face, i, j + 1);
    return a + fv * (d - a) + fu * (c - d);
  };
}

export interface BareSpots {
  keepBare(x: number, y: number, z: number, radius: number): void;
  /** Whether a direction is on bare ground: a town's pad or a kept clearing. */
  bareAt(x: number, y: number, z: number): boolean;
}

/**
 * The bare spots, hashed by a coarse lattice of latitude and longitude so a
 * road's tens of thousands of them cost a lookup and not a scan. A spot is kept
 * in every cell its disc reaches.
 */
export function createBareSpots(radius: number, padAt: (x: number, y: number, z: number) => Pad | null): BareSpots {
  const BARE_CELL = 0.5;
  const bare = new Map<number, { x: number; y: number; z: number; cos: number }[]>();
  const cellOf = (lat: number, lon: number): number => Math.floor((lat + 90) / BARE_CELL) * 4096 + Math.floor((((lon % 360) + 540) % 360) / BARE_CELL);
  function keepBare(x: number, y: number, z: number, reach: number): void {
    const length = Math.hypot(x, y, z) || 1;
    const spot = { x: x / length, y: y / length, z: z / length, cos: Math.cos(reach / radius) };
    const lat = latOf(spot.y);
    const lon = lonOf(spot.x, spot.z);
    const span = ((reach / radius) * 180) / Math.PI;
    const widen = 1 / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    for (let dLat = -span; dLat <= span + BARE_CELL; dLat += BARE_CELL) {
      for (let dLon = -span * widen; dLon <= span * widen + BARE_CELL; dLon += BARE_CELL) {
        const key = cellOf(Math.max(-90, Math.min(89.999, lat + dLat)), lon + dLon);
        const list = bare.get(key);
        if (list === undefined) bare.set(key, [spot]);
        else if (list[list.length - 1] !== spot) list.push(spot);
      }
    }
  }
  function bareAt(x: number, y: number, z: number): boolean {
    if (padAt(x, y, z) !== null) return true;
    const length = Math.hypot(x, y, z) || 1;
    const list = bare.get(cellOf(latOf(y / length), lonOf(x, z)));
    if (list === undefined) return false;
    for (const spot of list) if ((x * spot.x + y * spot.y + z * spot.z) / length > spot.cos) return true;
    return false;
  }
  return { keepBare, bareAt };
}
