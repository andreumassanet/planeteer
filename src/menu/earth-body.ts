/** Earth as a `MenuBody`: the one adapter that knows what a `World` or a `Place` is. */
import * as THREE from 'three';
import type { Country, World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { isShown, type Place } from '../places.ts';
import { reliefAt } from '../terrain.ts';
import type { MenuBody, MenuRegion } from './types.ts';

/**
 * Earth as a `MenuBody`. Uses `world.rings`, which carry the shelf height and a
 * lake flag (a lake gets no ribbon). `aliases` maps a name to an index into
 * `places` and is translated to the body's site numbering; an alias whose place
 * is not built is dropped.
 */
export function earthBody(world: World, places: readonly Place[], aliases?: ReadonlyMap<string, number>): MenuBody {
  const regions: MenuRegion[] = world.countries.map((country: Country) => ({
    key: country.iso,
    name: country.name,
    note: country.continent,
    lat: country.lat,
    lon: country.lon,
    rings: [],
  }));
  for (const ring of world.rings) {
    if (ring.water || ring.country === 0) continue;
    regions[ring.country - 1]?.rings.push({ points: ring.points, height: ring.height });
  }
  // Only built towns: a pin on a hidden place would spawn in an empty field.
  const built: Place[] = [];
  const siteOf = new Map<number, number>();
  places.forEach((place, i) => {
    if (!isShown(place)) return;
    siteOf.set(i, built.length);
    built.push(place);
  });
  const known = new Map<string, number>();
  for (const [alias, placeIndex] of aliases ?? []) {
    const site = siteOf.get(placeIndex);
    if (site !== undefined) known.set(alias, site);
  }
  return {
    id: 'earth',
    name: 'Earth',
    note: `${regions.length} countries · ${built.length.toLocaleString('en')} towns`,
    radius: PLANET_RADIUS,
    centre: new THREE.Vector3(0, 0, 0),
    relief: reliefAt,
    regions,
    regionAt: (lat, lon) => world.countryAt(lat, lon),
    sites: built.map((place) => ({
      name: place.name,
      key: place.iso,
      lat: place.lat,
      lon: place.lon,
      weight: place.pop,
      capital: place.capital,
    })),
    aliases: known,
  };
}
