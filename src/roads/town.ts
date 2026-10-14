import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { groundStyleFor } from '../scenery/ground.ts';
import { gatesOf, streetBand, townFrame, townGrid } from '../scenery/grid.ts';
import type { Gate, TownGrid } from '../scenery/grid.ts';
import { regionFor } from '../scenery/regions.ts';
import { unitAt } from '../sphere.ts';

/**
 * One end of a road: the town's frame, its square and its gates.
 *
 * `scenery/grid.ts` defines all three and `settlements.ts` raises the town
 * from the same calls (`townFrame` about the place's direction, `townGrid` of
 * its built radius), so the gate a road reaches and the paving the town cuts
 * there are the same point. Cached per place.
 */
export interface Town {
  up: THREE.Vector3;
  across: THREE.Vector3;
  north: THREE.Vector3;
  grid: TownGrid;
  gates: readonly Gate[];
}

const towns = new WeakMap<Place, Town>();
const gateLists = new Map<number, Gate[]>();

export function townOf(place: Place): Town {
  const known = towns.get(place);
  if (known !== undefined) return known;
  const up = placeDirection(place, new THREE.Vector3());
  const across = new THREE.Vector3();
  const north = new THREE.Vector3();
  townFrame(up, across, north);
  const radius = radiusOf(place);
  const grid = townGrid(radius);
  let gates = gateLists.get(radius);
  if (gates === undefined) {
    gates = gatesOf(grid);
    gateLists.set(radius, gates);
  }
  const town: Town = { up, across, north, grid, gates };
  towns.set(place, town);
  return town;
}

/**
 * Where a unit direction lands in a town's frame: the exact inverse of
 * `offsetDirection` for any point on the town's hemisphere.
 */
export function townOffset(
  town: Town,
  direction: THREE.Vector3,
  out: { x: number; z: number },
): { x: number; z: number } {
  const up = direction.dot(town.up);
  out.x = (PLANET_RADIUS * direction.dot(town.across)) / up;
  out.z = (PLANET_RADIUS * direction.dot(town.north)) / up;
  return out;
}

/** Unit vector at a place, in the planet's handedness (`sphere.ts`). */
export function placeDirection(place: Place, target: THREE.Vector3): THREE.Vector3 {
  return unitAt(place.lat, place.lon, target);
}

const continents = new WeakMap<World, Map<string, string>>();

/**
 * The street band of a town's region (`streetBand` of `GroundStyle.street`):
 * what the town paves beside a boundary street and what its gate's mouth is
 * worked out from. The region is found the way `settlements.ts` finds it.
 */
export function bandOf(place: Place, town: Town, world: World): number {
  let continent = continents.get(world);
  if (continent === undefined) {
    continent = new Map(world.countries.map((country) => [country.iso, country.continent]));
    continents.set(world, continent);
  }
  const region = regionFor(place.iso, continent.get(place.iso) ?? '', place.lat);
  return streetBand(town.grid, groundStyleFor(region.id).street);
}
