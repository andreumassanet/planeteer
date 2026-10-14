/** A tile's regional style. */
import type * as THREE from 'three';
import type { World } from '../geo.ts';
import { regionFor } from '../scenery/index.ts';
import type { RegionStyle } from '../scenery/index.ts';
import type { Framer } from './frame.ts';
import type { Tile } from './tiles.ts';

/**
 * The style is regional and the flora is not. A tile whose centre is at sea
 * takes the country of the first land it can find, because a coastal tile is
 * mostly land and its centre is arbitrary.
 */
export function styleOf(world: World, framer: Framer, continentOf: Map<string, string>, tile: Tile, scratch: THREE.Vector3): RegionStyle {
  let iso = '';
  const index = world.countryAtPoint(tile.direction);
  if (index > 0) iso = world.countries[index - 1]!.iso;
  else {
    outer: for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        if (i === 0 && j === 0) continue;
        const found = world.countryAtPoint(
          framer.directionAt(i * tile.halfEast * 0.7, j * tile.halfNorth * 0.7, scratch),
        );
        if (found > 0) {
          iso = world.countries[found - 1]!.iso;
          break outer;
        }
      }
    }
  }
  return regionFor(iso, continentOf.get(iso) ?? '', tile.lat);
}
