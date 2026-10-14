/**
 * The countries: named places resolve to the right one, codes are unique,
 * every country has a flag and facts, lakes are water, and `countryAt` is cheap.
 */
import { check, here } from './harness.ts';
import type { WorldContext } from './context.ts';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { insideRing } from '../../src/geo.ts';
import { FLAGS, FLAG_ALIAS, NO_FLAG } from '../../src/flag-data.ts';
import { TIME_SCALE } from '../time-scale.ts';

/**
 * Places that must resolve correctly. Most are coastal, where a coarse or
 * misread outline shows first.
 */
export function checkPlaces(ctx: WorldContext): void {
  const { world } = ctx;

  console.log('places');
  const places: [string, number, number, string][] = [
    ['Madrid', 40.42, -3.70, 'Spain'],
    ['Mallorca', 39.62, 2.99, 'Spain'],
    ['Menorca', 39.95, 4.10, 'Spain'],
    ['Ibiza', 38.97, 1.43, 'Spain'],
    ['Tenerife', 28.29, -16.62, 'Spain'],
    ['Sicily', 37.60, 14.20, 'Italy'],
    ['Corsica', 42.15, 9.10, 'France'],
    ['Crete', 35.25, 24.80, 'Greece'],
    ['Iceland', 64.90, -18.60, 'Iceland'],
    ['Tokyo', 35.70, 139.70, 'Japan'],
    ['Lesotho', -29.60, 28.20, 'Lesotho'],
    // Natural Earth's "Western Sahara" is only the Free Zone east of the berm;
    // the strip Morocco administers is inside Morocco's polygon. The pair proves
    // the smallest-ring rule resolves the overlap.
    ['Western Sahara', 23.60, -12.90, 'Western Sahara'],
    ['W. Sahara (MAR)', 24.50, -13.50, 'Morocco'],
    ['South Pole', -89.90, 0.00, 'Antarctica'],
    ['Vostok', -78.46, 106.80, 'Antarctica'],
    ['Ross Sea', -75.00, -175.00, 'Open ocean'],
    ['mid Atlantic', 30.00, -40.00, 'Open ocean'],
    ['Mediterranean', 39.00, 4.90, 'Open ocean'],
  ];
  for (const [name, lat, lon, want] of places) {
    const id = world.countryAt(lat, lon);
    const got = id > 0 ? world.countries[id - 1]!.name : 'Open ocean';
    check(got === want, name.padEnd(16), got === want ? '' : `expected ${want}, got ${got}`);
  }

  // `iso` keys flags, monuments and facts; a duplicate resolves to whichever came first.
  const isoSeen = new Map<string, string>();
  const collisions: string[] = [];
  for (const country of world.countries) {
    const previous = isoSeen.get(country.iso);
    if (previous !== undefined) collisions.push(`${country.iso}: ${previous} / ${country.name}`);
    else isoSeen.set(country.iso, country.name);
  }
  check(collisions.length === 0, 'country codes are unique', collisions.join('; '));
}

/** Every country draws its flag, flies another's (`FLAG_ALIAS`), or is on `NO_FLAG`. */
export function checkFlags(ctx: WorldContext): void {
  const { world } = ctx;
  const flagless = world.countries.filter((country) => {
    const flown = FLAG_ALIAS[country.iso] ?? country.iso;
    return !(flown in FLAGS) && !NO_FLAG.has(country.iso);
  });
  const both = [...NO_FLAG].filter((iso) => iso in FLAGS || iso in FLAG_ALIAS);
  const dangling = Object.entries(FLAG_ALIAS).filter(([, to]) => !(to in FLAGS)).map(([from]) => from);
  check(
    flagless.length === 0 && both.length === 0 && dangling.length === 0,
    'every country has a flag, an alias or a reason not to',
    [
      ...flagless.map((country) => `${country.iso} ${country.name}`),
      ...both.map((iso) => `${iso} is on NO_FLAG and has a flag`),
      ...dangling.map((iso) => `${iso} aliases a flag with no spec`),
    ].slice(0, 6).join(', '),
  );
}

/**
 * Every drawn country GeoNames has a row for has its facts baked
 * (`src/country-facts.ts`). The file lists the ones GeoNames lacks, since CI
 * has no `countryInfo.txt`; where the source is present that list is held to
 * it too.
 */
export function checkFacts(ctx: WorldContext): void {
  const { world } = ctx;
  const infoPath = resolve(here, '../public/data/countries-info.json');
  const info = existsSync(infoPath)
    ? (JSON.parse(readFileSync(infoPath, 'utf8')) as {
        without: string[];
        countries: Record<string, { name: string; population: number; areaKm2: number; languages: string[]; continent: string }>;
      })
    : { without: [], countries: {} };
  const without = new Set(info.without);
  const unfacted = world.countries.filter((c) => !(c.iso in info.countries) && !without.has(c.iso));
  const malformed = Object.entries(info.countries)
    .filter(([, f]) => !f.name || !(f.population >= 0) || !(f.areaKm2 > 0) || !Array.isArray(f.languages) || !f.continent)
    .map(([iso]) => iso);
  const sourcePath = resolve(here, '../../.cache/countryInfo.txt');
  const missed: string[] = [];
  if (existsSync(sourcePath)) {
    const alpha3 = new Set(
      readFileSync(sourcePath, 'utf8').split('\n').filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t')[1]),
    );
    for (const iso of without) if (alpha3.has(iso)) missed.push(`${iso} is in GeoNames`);
  }
  check(
    unfacted.length === 0 && malformed.length === 0 && missed.length === 0,
    'every drawn country GeoNames knows has its facts',
    `${Object.keys(info.countries).length} with facts, ${without.size} GeoNames has no row for` +
      (existsSync(sourcePath) ? '' : ' (countryInfo.txt not here to hold that list to)') +
      [...unfacted.map((c) => ` — ${c.iso} ${c.name} has none`), ...malformed.map((iso) => ` — ${iso} malformed`), ...missed.map((m) => ` — ${m}`)]
        .slice(0, 5).join(''),
  );
}

/**
 * A lake is water to `countryAt` everywhere the mesh draws it as water.
 *
 * `globe.ts` cuts each lake out of every land ring it reaches into, so the
 * only land a lake may hold is an island lying wholly inside it. Each lake is
 * sampled on a grid, with an island test of its own rather than `geo.ts`'s.
 * And each lake is baked once: a duplicate ring cuts a second hole.
 */
export function checkLakes(ctx: WorldContext): void {
  const { world } = ctx;
  const lakeRingsIn = world.rings.filter((ring) => ring.water);
  const boxOf = (points: number[][]): [number, number, number, number] => {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of points) {
      minLon = Math.min(minLon, lon!); maxLon = Math.max(maxLon, lon!);
      minLat = Math.min(minLat, lat!); maxLat = Math.max(maxLat, lat!);
    }
    return [minLon, minLat, maxLon, maxLat];
  };
  const shapes = new Set(lakeRingsIn.map((ring) => JSON.stringify(ring.points)));
  check(
    shapes.size === lakeRingsIn.length,
    'every lake is baked once',
    `${lakeRingsIn.length} rings, ${shapes.size} distinct`,
  );

  const STEP = 0.05;
  let sampled = 0;
  let onIslands = 0;
  const dry: string[] = [];
  for (const lake of lakeRingsIn) {
    const [minLon, minLat, maxLon, maxLat] = boxOf(lake.points);
    const islands = world.rings.filter((ring) => {
      if (ring.water) return false;
      const [a, b, c, d] = boxOf(ring.points);
      if (a < minLon || c > maxLon || b < minLat || d > maxLat) return false;
      return ring.points.every(([lon, lat]) => insideRing(lake.points, lon!, lat!));
    });
    let wrong = 0;
    let where = '';
    for (let lat = minLat + STEP / 2; lat < maxLat; lat += STEP) {
      for (let lon = minLon + STEP / 2; lon < maxLon; lon += STEP) {
        if (!insideRing(lake.points, lon, lat)) continue;
        sampled++;
        if (world.countryAt(lat, lon) === 0) continue;
        if (islands.some((ring) => insideRing(ring.points, lon, lat))) {
          onIslands++;
          continue;
        }
        wrong++;
        if (where === '') where = `${lat.toFixed(2)},${lon.toFixed(2)} ${world.countries[world.countryAt(lat, lon) - 1]!.name}`;
      }
    }
    if (wrong > 0) dry.push(`${wrong} at ${where}`);
  }
  check(
    dry.length === 0,
    'every lake is water to countryAt, except on its islands',
    `${sampled.toLocaleString()} points in ${lakeRingsIn.length} lakes, ${onIslands} on islands` +
      (dry.length > 0 ? ` — ${dry.join('; ')}` : ''),
  );
}

/** `countryAt` is asked every frame and by every placement pass. */
export function checkQueryCost(ctx: WorldContext): void {
  const { world } = ctx;
  const queryStart = Date.now();
  const N = 200_000;
  for (let i = 0; i < N; i++) world.countryAt(((i * 7) % 180) - 90, ((i * 13) % 360) - 180);
  const us = ((Date.now() - queryStart) / N) * 1000;
  console.log(`\ncountryAt: ${us.toFixed(2)} us per query`);
  check(us < 20 * TIME_SCALE, `query cost under ${20 * TIME_SCALE} us`);
}
