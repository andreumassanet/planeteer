/**
 * What stands on a walked world, painted onto its maps' tiles: Earth's pipeline
 * (`map-tiles.ts`), the same painter and the same levels, with the world's own
 * things.
 *
 * Read off the definitions the world is built from, as on Earth:
 *
 * - a town on the grid is its `GridTown` (`town-grid.ts`): the streets on their
 *   lines, a pavement each side and the carriageway between in the colours
 *   `settlements/` lays them in, every building's plan box at its yaw in its
 *   livery's roof (`liveryOf` on the very seed the town paints it with), inked;
 *   a landing pad a disc, a garden green;
 * - a town of forms (a civilisation without a colony) its paving disc, its
 *   square and its avenues a shade darker, and each plot a disc of its piece's
 *   radius in its livery (`layoutOf`, `pieceRadius`);
 * - a landmark its paved setting;
 * - the roads their ribbons' centre lines at their own half-width;
 * - the rockets' pads (`padOf`) and the saucers parked off the towns' corners
 *   (`ufoParkingOf`).
 *
 * Every position goes through the town's own frame (`Settlements.toWorld`) onto
 * the tile, so nothing here decides which way east is.
 */

import type * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import type { Settlements } from './settlements.ts';
import type { MapFeatures } from '../map-tiles.ts';
import { paintCraft, paintRoads } from './map-features/craft.ts';
import { createPen } from './map-features/pen.ts';
import { createTownPainter } from './map-features/towns.ts';

export interface WorldFeatureSources {
  spec: WorldSpec;
  settlements: Settlements;
  /** The roads, each its centre line as `[lat, lon]` and its carriageway's half-width. */
  roads: () => readonly { half: number; points: readonly (readonly [number, number])[] }[];
  /** Every rocket's pad and every parked saucer, as points on the sphere. */
  pads: () => readonly { at: THREE.Vector3 }[];
  saucers: () => readonly { at: THREE.Vector3 }[];
}

/**
 * The scale each family comes in at, world units a tile pixel: a world's levels
 * are its radius's, so a level is not the same scale on Mars and on Jupiter, and
 * the families are keyed on what a pixel covers instead.
 */
const ROADS_BELOW = 16;
const TOWNS_BELOW = 16;
const PADS_BELOW = 4.5;

export function createWorldFeatures(sources: WorldFeatureSources): MapFeatures {
  const { spec, settlements } = sources;
  const pen = createPen(settlements);
  const paintTowns = createTownPainter(spec, settlements, pen);
  return {
    stamp: `w${spec.id}:${settlements.sites.length}`,
    // Every level of a world: its towns are few and its tiles big, and the
    // families gate themselves on the pixel's size.
    fromLevel: 0,
    *paint(view, raster) {
      if (view.unitsPerPixel < ROADS_BELOW) paintRoads(sources, pen, view, raster);
      yield;
      if (view.unitsPerPixel < TOWNS_BELOW) paintTowns(view, raster);
      yield;
      if (view.unitsPerPixel < PADS_BELOW) paintCraft(sources, pen, view, raster);
    },
  };
}
