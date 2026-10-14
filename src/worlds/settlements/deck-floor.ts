/** The platforms of a cloud-deck world: which one a point stands on, and how high its floor is. */

import { latOf, lonOf } from '../../sphere.ts';
import type { Site } from './types.ts';

const FLOOR_CELL = 1;
const NO_SITES: Site[] = [];

/**
 * Returns `floorAt(x, y, z)`: the height over the walkable radius of the
 * platform under a direction, or null. Sites are indexed by a one-degree
 * lattice of latitude and longitude (built on first use), so a query asks the
 * platforms near a point rather than all of them.
 */
export function createDeckFloor(sites: readonly Site[], R: number): (x: number, y: number, z: number) => number | null {
  /** The platform last found a point on. */
  let lastFloor: Site | null = null;
  let floorCells: Map<number, Site[]> | null = null;
  const floorKey = (lat: number, lon: number): number => Math.floor((lat + 90) / FLOOR_CELL) * 4096 + Math.floor((((lon % 360) + 540) % 360) / FLOOR_CELL);
  function floorCellOf(x: number, y: number, z: number): Site[] {
    if (floorCells === null) {
      floorCells = new Map();
      for (const site of sites) {
        const lat = latOf(site.dir.y);
        const lon = lonOf(site.dir.x, site.dir.z);
        const span = (((site.paving + 4) / R) * 180) / Math.PI;
        const widen = 1 / Math.max(0.05, Math.cos((Math.min(89.9, Math.abs(lat) + span) * Math.PI) / 180));
        for (let dLat = -span; dLat <= span + FLOOR_CELL; dLat += FLOOR_CELL) {
          for (let dLon = -span * widen; dLon <= span * widen + FLOOR_CELL; dLon += FLOOR_CELL) {
            const key = floorKey(Math.max(-90, Math.min(89.999, lat + dLat)), lon + dLon);
            const list = floorCells.get(key);
            if (list === undefined) floorCells.set(key, [site]);
            else if (!list.includes(site)) list.push(site);
          }
        }
      }
    }
    const lat = latOf(y);
    const lon = lonOf(x, z);
    return floorCells.get(floorKey(Math.max(-90, Math.min(89.999, lat)), lon)) ?? NO_SITES;
  }
  return (x, y, z) => {
    const length = Math.hypot(x, y, z) || 1;
    const on = (site: Site): number | null => {
      const dot = (x * site.dir.x + y * site.dir.y + z * site.dir.z) / length;
      if (dot < 0.9) return null;
      const angle = Math.acos(Math.min(1, dot));
      // The plane's own distance from the centre, along it.
      const across = Math.tan(angle) * site.origin.length();
      if (across > site.paving + 2) return null;
      return site.origin.length() / dot - R + site.floor;
    };
    // The platform last stood on first: almost every question is about it.
    if (lastFloor !== null) {
      const here = on(lastFloor);
      if (here !== null) return here;
    }
    for (const site of floorCellOf(x / length, y / length, z / length)) {
      const here = on(site);
      if (here === null) continue;
      lastFloor = site;
      return here;
    }
    return null;
  };
}
