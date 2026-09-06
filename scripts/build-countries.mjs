/**
 * Bakes the Natural Earth outlines (public domain, 1:50m) into the compact
 * binary the client turns into both the country index and the land mesh.
 *
 * The file is `public/data/countries.bin`: delta-coded integers at the precision
 * chosen per ring below, gzipped here rather than by the CDN, and read back by
 * `src/pack.ts`, which also writes it. It was 456 KB of JSON and it is 170.
 *
 * It used to read 1:110m. That dataset has Spain as a *single* polygon: no
 * Balearics, no Canaries, and the same for every other archipelago. No filter
 * tuning recovers an island that is not in the file. 1:50m has 12 polygons for
 * Spain and 1,620 rings overall, which is what makes islands possible at all.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { decodeCountries, encodeCountries, inflate } from '../src/pack.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.argv[2] ?? resolve(here, '../../.cache/ne50.geojson');
const OUT = resolve(here, '../public/data/countries.bin');

/**
 * Square degrees. This was 0.35 for the 1:110m data, and carrying that number
 * over would have thrown away most of what the new dataset is for: Menorca is
 * 0.067, Ibiza 0.060, and the largest Canary island 0.185. At 0.003 the
 * smallest ring kept is about 5 units across on a 4000-unit planet, roughly the
 * height of the player, which is the point where an island stops being a place
 * you can stand on.
 */
const MIN_RING_AREA = 0.003;
/**
 * Coordinate precision, chosen per ring. 2 decimals is ~1 km, fine for a
 * coastline thousands of km long and far too coarse for a 20 km island, where
 * it would quantise the outline into a blob. Small rings get 3 (~110 m); large
 * ones stay at 2, which is where nearly all the points are.
 */
const PRECISION_LARGE = 2;
const PRECISION_SMALL = 3;
const SMALL_RING_AREA = 1;

/** Shoelace. Signed: the sign tells us the winding. */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

const geo = JSON.parse(readFileSync(SOURCE, 'utf8'));
const countries = [];
let ringsKept = 0;
let ringsDropped = 0;
let pointsKept = 0;

for (const feature of geo.features) {
  const p = feature.properties;
  const rings = [];

  for (const polygon of polygonsOf(feature.geometry)) {
    // Outer ring only: holes (lakes, enclaves) do not register at this scale,
    // and `countryAt` resolves the resulting overlaps by taking the smallest
    // containing ring instead.
    const outer = polygon[0];
    if (!outer) continue;

    const signed = signedArea(outer);
    if (Math.abs(signed) < MIN_RING_AREA) {
      ringsDropped++;
      continue;
    }

    // The last point repeats the first in GeoJSON. Drop it: every consumer here
    // treats rings as implicitly closed, and a duplicate point becomes a
    // zero-length edge that the triangulator has to special-case.
    const open = outer.slice(0, -1);

    // Normalise the winding so the mesh can build its coastal walls without
    // testing orientation per ring. Natural Earth is consistent today, but one
    // inverted ring would come out with its cliff facing inwards and be
    // invisible, which is a miserable bug to chase.
    if (signed > 0) open.reverse();

    const digits = Math.abs(signed) < SMALL_RING_AREA ? PRECISION_SMALL : PRECISION_LARGE;
    const round = (v) => Number(v.toFixed(digits));

    ringsKept++;
    pointsKept += open.length;
    // `digits` travels with the ring because the wire format needs it and it
    // cannot be recovered from the numbers: 2 decimals is a coordinate that
    // happens to end in a zero. See `src/pack.ts`.
    rings.push({ digits, points: open.map(([lon, lat]) => [round(lon), round(lat)]) });
  }

  if (rings.length === 0) continue;

  // Centroid of the largest ring: used for labels and for locating a country
  // without walking its geometry.
  const biggest = rings.reduce((a, b) =>
    Math.abs(signedArea(a.points)) > Math.abs(signedArea(b.points)) ? a : b,
  ).points;
  let lon = 0;
  let lat = 0;
  for (const [x, y] of biggest) {
    lon += x;
    lat += y;
  }

  countries.push({
    // Falling back to the first three letters of the name used to collide:
    // Northern Cyprus took Norway's NOR, Somaliland took Somalia's SOM, and the
    // Indian Ocean Territories took India's IND. Anything keyed on `iso` — a
    // flag, a monument's declared country — then resolved to the wrong one of
    // the pair. `ADM0_A3` is Natural Earth's own admin-0 key: present on all 242
    // features, never -99, and unique. Real ISO codes still win where they
    // exist, so `ESP` stays `ESP`.
    iso: p.ISO_A3 && p.ISO_A3 !== '-99' ? p.ISO_A3 : p.ADM0_A3,
    // NAME_LONG avoids NAME's abbreviations ("W. Sahara", "Bosnia and Herz.").
    name: p.NAME_LONG || p.NAME,
    continent: p.CONTINENT,
    lon: Number((lon / biggest.length).toFixed(2)),
    lat: Number((lat / biggest.length).toFixed(2)),
    rings,
  });
}

countries.sort((a, b) => a.name.localeCompare(b.name, 'en'));

/**
 * The file is binary and gzipped, and the bake proves its own round trip before
 * writing a byte of it.
 *
 * 97,280 `[lon, lat]` pairs as JSON text were 456 KB on the wire for about nine
 * bits of coastline each; delta-coded at the precision chosen a few lines up
 * they are a byte a step. What makes that safe is the assertion below rather
 * than the arithmetic: a coordinate that came back a millionth of a degree out
 * would look identical on screen and would move `countryAt` on a coastline,
 * which is exactly where the cities and the monuments are.
 */
const plain = countries.map(({ iso, name, continent, lon, lat, rings }) => ({
  iso,
  name,
  continent,
  lon,
  lat,
  rings: rings.map((ring) => ring.points),
}));
const packed = gzipSync(encodeCountries(countries), { level: 9 });
if (JSON.stringify(decodeCountries(await inflate(packed))) !== JSON.stringify(plain)) {
  throw new Error('countries.bin does not decode back to what was baked');
}
writeFileSync(OUT, packed);
// The JSON it replaces, so a stale copy cannot ship in `dist` beside it.
rmSync(resolve(here, '../public/data/countries.json'), { force: true });

const kb = (readFileSync(OUT).length / 1024).toFixed(0);
console.log(
  `${countries.length} countries, ${ringsKept} rings, ${pointsKept} points ` +
  `(${ringsDropped} rings dropped under ${MIN_RING_AREA} sq deg) -> ${kb} KB gzipped`,
);
