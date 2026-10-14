/** Enumerating the quadtree's tiles: refine towards the viewer, inside the view cone. */
import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import { reliefAt } from '../terrain.ts';
import type { ViewCone } from '../view.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { LEVELS, ROOT_STEP, cellsOf, rootOf, rowsOf, stepOf } from '../tile-grid.ts';
import { DEG, refine, spanOf } from './levels.ts';
import { TILE_SLACK } from './budget.ts';
import type { Tile } from './tiles.ts';

/** The tile at `(level, row, column)`, its distance taken from `viewer`. */
export function tileAt(level: number, row: number, column: number, viewer: THREE.Vector3): Tile {
  const step = stepOf(level);
  const lat = -90 + (row + 0.5) * step;
  const cells = cellsOf(rootOf(row, level), level);
  const lonStep = 360 / cells;
  const lon = -180 + (((column % cells) + cells) % cells) * lonStep + lonStep / 2;
  const cos = Math.cos(lat * DEG);
  const direction = unitAt(lat, lon, new THREE.Vector3());
  const centre = direction
    .clone()
    .multiplyScalar(PLANET_RADIUS + reliefAt(direction.x, direction.y, direction.z));
  const halfEast = (lonStep * cos * UNITS_PER_DEGREE) / 2;
  const halfNorth = (step * UNITS_PER_DEGREE) / 2;
  return {
    key: `${level}/${row}/${((column % cells) + cells) % cells}`,
    level,
    row,
    column: ((column % cells) + cells) % cells,
    direction,
    lat,
    lon,
    halfEast,
    halfNorth,
    centre,
    radius: Math.hypot(halfEast, halfNorth) + TILE_SLACK,
    distance: centre.distanceTo(viewer),
  };
}

/** The tile containing a latitude and longitude at a level. */
export function tileOver(lat: number, lon: number, level: number, viewer: THREE.Vector3): Tile {
  const step = stepOf(level);
  const row = Math.min(rowsOf(level) - 1, Math.max(0, Math.floor((lat + 90) / step)));
  const cells = cellsOf(rootOf(row, level), level);
  const column = Math.floor((((lon + 180) % 360) / 360) * cells);
  return tileAt(level, row, column, viewer);
}

export interface Enumerator {
  /** Every tile within `range` of `viewer`, refined towards it. */
  enumerate(viewer: THREE.Vector3, range: number): Tile[];
}

export function createEnumerator(cone: ViewCone): Enumerator {
  const probe = new THREE.Vector3();

  /**
   * The quadtree descent: a tile splits into its four children when nearer than
   * its span times `refine()`, and each child is the same test one level down,
   * so a level's distance band falls out of its parent splitting and itself
   * not. The cone is tested on the way down (`keeps`, wider than `admits`) so a
   * band behind the camera is rejected once at the top level.
   */
  function descend(tile: Tile, viewer: THREE.Vector3, range: number, out: Tile[]): void {
    if (tile.distance > range + tile.radius) return;
    if (!cone.keeps(tile.centre, tile.radius)) return;
    if (tile.level > 0 && tile.distance < spanOf(tile.level) * refine()) {
      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          descend(tileAt(tile.level - 1, tile.row * 2 + dr, tile.column * 2 + dc, viewer), viewer, range, out);
        }
      }
      return;
    }
    if (tile.distance > range) return;
    out.push(tile);
  }

  function enumerate(viewer: THREE.Vector3, range: number): Tile[] {
    const found: Tile[] = [];
    const direction = probe.copy(viewer).normalize();
    const lat = latOf(direction.y);
    const lon = lonOf(direction.x, direction.z);
    const top = LEVELS - 1;
    const reach = (range + spanOf(top)) / UNITS_PER_DEGREE;
    const rows = rowsOf(top);
    const first = Math.max(0, Math.floor((lat - reach + 90) / ROOT_STEP));
    const last = Math.min(rows - 1, Math.ceil((lat + reach + 90) / ROOT_STEP));

    for (let row = first; row <= last; row++) {
      const bandLat = -90 + (row + 0.5) * ROOT_STEP;
      const cells = cellsOf(row, top);
      const lonStep = 360 / cells;
      // Degrees of longitude the range reaches at this latitude: it opens out
      // towards the poles and goes all the way round before it gets there.
      const spread = reach / Math.max(Math.cos(bandLat * DEG), 1e-3);
      if (spread >= 180) {
        for (let column = 0; column < cells; column++) {
          descend(tileAt(top, row, column, viewer), viewer, range, found);
        }
        continue;
      }
      const from = Math.floor((lon - spread + 180) / lonStep);
      const to = Math.ceil((lon + spread + 180) / lonStep);
      for (let column = from; column <= to; column++) {
        descend(tileAt(top, row, column, viewer), viewer, range, found);
      }
    }
    return found;
  }

  return { enumerate };
}
