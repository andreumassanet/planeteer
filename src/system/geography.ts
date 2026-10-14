/**
 * The political map of every walked world but Earth: its nations as outlines,
 * its towns as places, and the `World` that answers `countryAt` over them.
 *
 * A `Nation` is a centre and an angular radius (`contract.ts`), enough to say
 * whose ground a point is but not to draw: caps overlap and leave ground
 * between them nobody's. What the shared map, minimap, HUD and menu need is
 * what Earth hands them (`Country` rings and `Place` rows, read by `geo.ts`'s
 * smallest-ring `countryAt`), so this turns the caps into exactly that.
 *
 * `truthAt` is the one definition of whose ground a point is: every nation's
 * cap centre and towns are seeds weighted by the cap's radius, and a point
 * belongs to the seed nearest it in angle divided by weight (a
 * multiplicatively weighted Voronoi diagram on the sphere), after a
 * domain warp that bends the frontiers (`geography/seeds.ts`). It tiles the
 * sphere, so the answer is never 0, and a seed always wins at itself, so a
 * small cap inside a big one is an enclave.
 *
 * The truth is sampled on a half-degree lattice (`lattice.ts`), the boundaries
 * between labels are chained into polylines between junctions (`outlines.ts`)
 * and smoothed once (`smoothing.ts`); both neighbours of a frontier share the
 * same array, one reversed, so frontiers meet exactly. Rings are wound with
 * the land on the right, `geo.ts`'s convention, and every ring stays inside
 * one tile (a quarter of the longitudes, one hemisphere); a tile that would
 * hold a hole is cut by another meridian until none is left. `frontiers`
 * lists only the polylines between two nations.
 *
 * Pure, deterministic and memoised.
 */
import { Vector3 } from 'three';
import type { Country, World } from '../geo.ts';
import { worldFromCountries } from '../geo.ts';
import type { Place } from '../places.ts';
import { PROMINENCE_CAP } from '../places.ts';
import { latLonOf, toUnit } from '../sphere.ts';
import type { Body } from './contract.ts';
import { surfaceRadiusOf, townRadii } from './contract.ts';
import { MERCURY } from './bodies/mercury.ts';
import { VENUS } from './bodies/venus.ts';
import { MOON } from './bodies/moon.ts';
import { MARS } from './bodies/mars.ts';
import { JUPITER } from './bodies/jupiter.ts';
import { SATURN } from './bodies/saturn.ts';
import { URANUS } from './bodies/uranus.ts';
import { NEPTUNE } from './bodies/neptune.ts';
import { politicalColors } from './geography/colours.ts';
import { labelLattice } from './geography/lattice.ts';
import { outlinesOf } from './geography/outlines.ts';
import { judge, seedsOf } from './geography/seeds.ts';
import type { Geography, PassportChapter } from './geography/types.ts';

export type { Frontier, Geography, PassportChapter } from './geography/types.ts';
export { POLITICAL_CONTRAST, oklabOf, politicalColors } from './geography/colours.ts';
export { localHour, solarDayHours } from './geography/clock.ts';

/**
 * Every world that can be walked besides Earth, in the order the passport's
 * chapters and any list of them run: out from the Sun, the Moon after Venus
 * because its orbit is Earth's. `worlds/registry.ts` has one row for each.
 */
export const WALKABLE: readonly Body[] = [MERCURY, VENUS, MOON, MARS, JUPITER, SATURN, URANUS, NEPTUNE];

/** A walkable body by id, or undefined for Earth, the Sun and anything else. */
export const walkableBody = (id: string): Body | undefined => WALKABLE.find((one) => one.id === id);

/** Every walked world's chapter, in `WALKABLE`'s order. Cheap: no outline is computed. */
export function chaptersOf(): PassportChapter[] {
  return WALKABLE.map((body) => ({
    body: body.id,
    name: body.name,
    color: body.look.surface,
    nations: body.nations.map((nation) => ({ iso: keyFor(body.id, nation.id), name: nation.name, color: nation.color })),
  }));
}

const keyFor = (bodyId: string, nationId: string): string => `${bodyId}:${nationId}`;

const cache = new Map<string, Geography>();

/** The political map of a walkable body, computed once. Earth has its own and is refused. */
export function geographyOf(body: Body): Geography {
  const known = cache.get(body.id);
  if (known !== undefined) return known;
  const geography = buildGeography(body);
  cache.set(body.id, geography);
  return geography;
}

/**
 * `geographyOf` without the memo: the whole computation, every call. For the
 * check, which builds a body twice to hold it to determinism and times it.
 */
export function buildGeography(body: Body): Geography {
  if (body.id === 'earth' || body.nations.length === 0) throw new Error(`geography: '${body.id}' has no invented map`);

  const seeds = seedsOf(body);
  const labels = labelLattice(seeds);
  const { rings, frontiers } = outlinesOf(labels, body.nations.length);

  const keyOf = (nationId: string): string => keyFor(body.id, nationId);
  const biggest = new Map<string, number>();
  for (const place of body.settlements) {
    biggest.set(place.nation, Math.max(biggest.get(place.nation) ?? 0, place.population));
  }
  const unit: number[] = [0, 0, 0];
  const truthAt = (lat: number, lon: number): number => {
    toUnit(lat, lon, unit);
    return judge(seeds, unit[0]!, unit[1]!, unit[2]!) + 1;
  };
  const countries: Country[] = body.nations.map((nation, i) => {
    // The label point is the cap's centre, unless an enclave stands on it —
    // the Hexagon's centre is the Rose's pole — and then its biggest town.
    let { lat, lon } = nation;
    if (truthAt(lat, lon) !== i + 1) {
      const capital = body.settlements.find((place) => place.nation === nation.id && place.population === biggest.get(nation.id));
      if (capital !== undefined) ({ lat, lon } = capital);
    }
    return { iso: keyOf(nation.id), name: nation.name, continent: body.name, lat, lon, rings: rings[i]!, color: nation.color };
  });
  // The map's colour, not the banner's: see `politicalColors`.
  const political = politicalColors(body, frontiers);
  countries.forEach((country, i) => (country.color = political[i]!));

  const places: Place[] = body.settlements.map((place) => ({
    name: place.name,
    iso: keyOf(place.nation),
    lat: place.lat,
    lon: place.lon,
    pop: place.population,
    capital: biggest.get(place.nation) === place.population,
    // Built at the radius the walking engine builds it at (`townRadii`).
    radius: townRadii(body).get(place.id)!,
    // Every town is built: none is hidden by a bigger neighbour.
    prominence: PROMINENCE_CAP,
    zone: '',
  }));

  const surface = surfaceRadiusOf(body.radiusKm);
  const ground = body.ground;
  const built = worldFromCountries(countries, [], (surface * Math.PI) / 180, {
    elevationAt(point: Vector3): number {
      if (ground === null) return 0;
      const { lat, lon } = latLonOf(point);
      return ground.relief(lat, lon);
    },
  });

  // Longitude 180 is the east edge of the rings that end there and the west
  // edge of none — the other side of the seam is written -180 — so a point
  // exactly on it would be in no ring. Read the seam as -180.
  const countryAt = (lat: number, lon: number): number => built.countryAt(lat, lon >= 180 ? lon - 360 : lon);
  const world: World = {
    ...built,
    countryAt,
    countryAtPoint(point) {
      const { lat, lon } = latLonOf(point);
      return countryAt(lat, lon);
    },
  };

  const byIso = new Map(body.nations.map((nation) => [keyOf(nation.id), nation]));
  return {
    body,
    countries,
    places,
    world,
    frontiers,
    keyOf,
    nationOf: (iso) => byIso.get(iso),
    truthAt,
  };
}
