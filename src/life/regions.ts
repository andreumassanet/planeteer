/** Region and traffic style per place, cached. */
import type { World } from '../geo.ts';
import type { Place } from '../places.ts';
import type { RegionStyle } from '../scenery/contract.ts';
import { regionFor } from '../scenery/regions.ts';
import type { TrafficStyle } from '../traffic/contract.ts';
import { trafficFor } from '../traffic/regions.ts';

export interface Regions {
  /** Each country's continent, by ISO code. */
  continentOf: ReadonlyMap<string, string>;
  regionAt(index: number): RegionStyle;
  trafficAt(index: number): TrafficStyle;
  /** The traffic style already resolved for a region id, if any place in it has been asked. */
  trafficOfRegion(region: string): TrafficStyle | undefined;
}

export function createRegions(world: World, places: readonly Place[]): Regions {
  const continentOf = new Map<string, string>(
    world.countries.map((country) => [country.iso, country.continent]),
  );
  const regionCache = new Array<RegionStyle | undefined>(places.length);
  const regionAt = (index: number): RegionStyle => {
    let found = regionCache[index];
    if (found === undefined) {
      const place = places[index]!;
      found = regionFor(place.iso ?? '', continentOf.get(place.iso ?? '') ?? '', place.lat);
      regionCache[index] = found;
    }
    return found;
  };
  const trafficCache = new Map<string, TrafficStyle>();
  const trafficAt = (index: number): TrafficStyle => {
    const region = regionAt(index).id;
    let found = trafficCache.get(region);
    if (found === undefined) {
      const place = places[index]!;
      found = trafficFor(place.iso ?? '', continentOf.get(place.iso ?? '') ?? '', place.lat);
      trafficCache.set(region, found);
    }
    return found;
  };
  return { continentOf, regionAt, trafficAt, trafficOfRegion: (region) => trafficCache.get(region) };
}
