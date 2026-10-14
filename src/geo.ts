import type { Vector3 } from 'three';
import { DATA_URL, decodeCountries, decodeLakes, inflate } from './pack.ts';
import { prepareTerrain, reliefAt } from './terrain.ts';
import { latLonOf } from './sphere.ts';
import { ringArea } from './geo/rings.ts';
import type { Bounds } from './geo/world-index.ts';
import { boundsOf, buildGrid, createInside, createResolver, findBitten } from './geo/world-index.ts';

export { bandIndex, insideBands, insideRing } from './geo/rings.ts';
export type { RingBands } from './geo/rings.ts';

export interface Country {
  iso: string;
  name: string;
  continent: string;
  lon: number;
  lat: number;
  rings: number[][][];
  /** The flat colour this country is painted in on the maps, for another world's nations (`Nation.color`, a `PALETTE` entry); Earth's leave it out. */
  color?: number;
}

/**
 * One outer ring of one country, indexed for lookup and shared with the mesh
 * builder: the land you see and the land `countryAt` reports are built from the
 * same array.
 */
export interface LandRing {
  /** 1-based index into `countries`, or 0 for a lake, which belongs to nobody. */
  country: number;
  /**
   * `[lon, lat]` pairs, implicitly closed. Wound by the bake so that the land is
   * always on the right of `a -> b` (clockwise for a country, the other way for a
   * lake). That one sign is what the land mesh builds its walls from, what
   * `terrain.ts` indexes its shores by and what `ocean.ts` lays its surf along.
   */
  points: number[][];
  /** Shoelace area in square degrees. Used to break overlaps; see `countryAt`. */
  area: number;
  /** How far this ring's land stands above sea level, in world units. */
  height: number;
  /**
   * True for a lake: a ring the world reads as water. `countryAt` and
   * `elevationAt` answer 0 inside one, as over the sea, so walking into a lake
   * puts you in the boat with no special case. Every lake is at sea level.
   */
  water: boolean;
}

/**
 * The shelf every ring stands on, in world units. `terrain.ts`'s shore ramp gives
 * all but `SHORE_LIP` of it back over the last hundred units before the water,
 * so this is how high the shelf stands inland, not how far the coast drops.
 * `terrain/constants.ts` carries the same number as `LAND_SHELF` (it cannot
 * import this file) and `pnpm check` asserts the two agree.
 */
export const LAND_HEIGHT = 20;

export interface World {
  countries: Country[];
  /** Every outer ring, shared with the mesh builder. */
  rings: LandRing[];
  /** Country index (1-based) at some coordinates. 0 means ocean. */
  countryAt(lat: number, lon: number): number;
  /** Country index under a world-space point, relative to the planet centre. */
  countryAtPoint(point: Vector3): number;
  /** Height of the land above sea level under a point; 0 over water. The mesh is built from the same two terms (shelf plus relief). */
  elevationAt(point: Vector3): number;
}

/** Latitude and longitude of a point of any length: `sphere.ts`'s `latLonOf`. */
export function toLatLon(point: { x: number; y: number; z: number }): { lat: number; lon: number } {
  return latLonOf(point);
}

/** The outlines, off the wire. Separate from `loadWorld` so a caller may want the country list without the planet. */
export async function loadCountries(url = `${DATA_URL}countries.bin`): Promise<Country[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodeCountries(await inflate(await response.arrayBuffer()));
}

/**
 * The inland water, off the wire. Handed in to `loadWorld` rather than fetched
 * inside it, so the two fetches can run together; the parameter is required so a
 * caller cannot quietly get a planet with no lakes.
 */
export async function loadLakes(url = `${DATA_URL}lakes.bin`): Promise<number[][][]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodeLakes(await inflate(await response.arrayBuffer()));
}

/** Loads the outlines and builds a spatial index. Point-in-polygon is exact; there is no raster to antialias a coast into the wrong country. */
export async function loadWorld(
  unitsPerDegree: number,
  lakes: readonly number[][][],
  url = `${DATA_URL}countries.bin`,
): Promise<World> {
  return worldFromCountries(await loadCountries(url), lakes, unitsPerDegree);
}

/**
 * What a world other than Earth hands in instead of Earth's ground.
 * `worldFromCountries` otherwise prepares `terrain.ts`'s coast fields and
 * answers `elevationAt` with the shelf plus `reliefAt`; both are Earth's module
 * state, so another body's outlines must not touch them.
 */
export interface WorldGround {
  /** Height of the ground over the datum under a point, as `World.elevationAt` answers it. */
  elevationAt(point: Vector3): number;
}

/**
 * The index half of `loadWorld`: rings, the lookup grid, the banded
 * point-in-polygon, the lakes' bites. Factored out so a body whose outlines are
 * computed (`src/system/geography.ts`) answers `countryAt` with the same code.
 * With no `ground` it prepares the terrain, as `loadWorld` does.
 */
export function worldFromCountries(
  countries: Country[],
  lakes: readonly number[][][],
  unitsPerDegree: number,
  ground: WorldGround | null = null,
): World {
  const rings: LandRing[] = [];
  const bounds: Bounds[] = [];
  const add = (points: number[][], country: number, water: boolean): void => {
    rings.push({ country, points, area: ringArea(points), height: LAND_HEIGHT, water });
    bounds.push(boundsOf(points));
  };
  countries.forEach((country, index) => {
    for (const points of country.rings) add(points, index + 1, false);
  });
  // The lakes go into the same list, so the grid, the smallest-ring rule, the
  // shore index and the coast field all reach them without being told they exist.
  for (const points of lakes) add(points, 0, true);

  const grid = buildGrid(rings, bounds);
  const inside = createInside(rings, bounds);
  const bitten = findBitten(rings, bounds, inside);
  const resolve = createResolver(rings, bounds, grid, bitten, inside);

  // Is there land here at all? The shore index has to tell a coastline from an
  // international border, which is which side of a ring boundary the sea is on.
  // A lake is a smaller ring that means water, so this is `resolve`, not "any ring".
  const isLand = (lat: number, lon: number): boolean => {
    const ring = resolve(lat, lon);
    return ring !== null && !ring.water;
  };

  // The relief is a function of position and the mesh evaluates it too, so the
  // fields it needs are built once here. Only Earth's: another body brings its
  // own ground and leaves these alone.
  if (ground === null) prepareTerrain(rings, unitsPerDegree, isLand);

  // A water ring resolves to nothing, the answer the open sea gives, which is
  // the whole of the boat mechanic on a lake.
  const countryOf = (ring: LandRing | null): number =>
    ring === null || ring.water ? 0 : ring.country;

  return {
    countries,
    rings,
    countryAt: (lat, lon) => countryOf(resolve(lat, lon)),
    countryAtPoint(point) {
      const { lat, lon } = toLatLon(point);
      return countryOf(resolve(lat, lon));
    },
    elevationAt(point) {
      if (ground !== null) return ground.elevationAt(point);
      const { lat, lon } = toLatLon(point);
      const ring = resolve(lat, lon);
      if (ring === null || ring.water) return 0;
      // Shelf plus relief; the land mesh raises every vertex by exactly this sum.
      const length = Math.hypot(point.x, point.y, point.z) || 1;
      return ring.height + reliefAt(point.x / length, point.y / length, point.z / length);
    },
  };
}
