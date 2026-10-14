/**
 * The map's paper: a pyramid of tiles painted from the world's own
 * definitions, shared by the disc in the corner (`minimap.ts`) and the sheet
 * behind `M` (`map.ts`), on Earth and on every other world alike.
 *
 * A tile is Miller cylindrical, 256 pixels square, a quadtree of levels: a
 * level-`z` tile is a 1/2^z by 1/2^z square of the sheet, `u` east from the
 * antimeridian and `v` south from the pole. The disc reprojects the same tiles
 * onto its orthographic paper, so the two maps cannot show different worlds.
 *
 * Nothing renders the 3D world. The ground is the land's own colour law lit by
 * a stepped hill shade, with the water, lakes and shallows from the rings
 * `countryAt` reads; from a zoom where they are a pixel wide a `MapFeatures`
 * painter draws what stands on it (roads, rails, building plans, fields,
 * woods, landmarks, strips, pads). The painter is pure and canvas-free, so the
 * same key gives the same bytes in the browser and in Node, which lets
 * `scripts/build-maps.ts` pre-paint the planet-scale levels into
 * `public/maps/`.
 *
 * Painting is a generator that yields every few rows, run by `pump` inside an
 * allowance; until a tile is painted its nearest painted ancestor stands in,
 * scaled. A finished tile is kept in memory and written to IndexedDB
 * (`tile-store.ts`) under a key carrying the data's stamp and the style's
 * version; the first `BAKED_LEVELS` levels come from `public/maps/<world>/`.
 *
 * Layout: `map-tiles/projection.ts` (the projection), `rings.ts`, `view.ts`,
 * `ground.ts` and `painter.ts` (painting), and `cache.ts`, `bake.ts`,
 * `loader.ts` and `schedule.ts` (the cache and the schedule).
 */
import { createCache } from './map-tiles/cache.ts';
import { createTilePainter } from './map-tiles/painter.ts';
import { forgetTiles, disposeTiles, pumpTiles, sourceOf, statsOf, wantTiles } from './map-tiles/schedule.ts';
import { tileAt } from './map-tiles/loader.ts';
import type { MapTiles, MapTilesOptions } from './map-tiles/types.ts';

export {
  BAKED_LEVELS,
  MAP_STYLE,
  MAX_LEVEL,
  SHEET_HEIGHT,
  TILE,
  Y_MAX,
  latOfV,
  levelFor,
  lonOfU,
  rowsAt,
  uOf,
  vOf,
} from './map-tiles/projection.ts';
export { sheetRingsOf } from './map-tiles/rings.ts';
export { createTilePainter } from './map-tiles/painter.ts';
export type {
  Affine,
  MapFeatures,
  MapTile,
  MapTiles,
  MapTilesOptions,
  MapTilesStats,
  TilePainter,
  TilePainterOptions,
  TileSource,
  TileView,
} from './map-tiles/types.ts';

/** The tile cache and its schedule over a painter. */
export function createMapTiles(options: MapTilesOptions): MapTiles {
  const painter = createTilePainter(options);
  const c = createCache(options, painter);
  return {
    painter,
    get version() {
      return c.version;
    },
    tile: (z, i, j) => tileAt(c, z, i, j),
    want: (who, list, near = false) => wantTiles(c, who, list, near),
    pump: (budgetMs, frame = false) => pumpTiles(c, budgetMs, frame),
    source: (z, i, j, out) => sourceOf(c, z, i, j, out),
    get stats() {
      return statsOf(c);
    },
    forget: () => forgetTiles(c),
    dispose: () => disposeTiles(c),
  };
}
