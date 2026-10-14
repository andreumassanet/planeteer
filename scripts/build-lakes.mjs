/**
 * Bakes Natural Earth 1:50m lakes (public domain) into `public/data/lakes.bin`,
 * the holes cut in the land mesh. The format is the ring section of
 * `countries.bin`, written and read by `src/pack.ts`. Lakes carry no names.
 *
 * Outer rings only: an island in a lake survives only if the country outlines
 * draw it as a ring of its own, and `countryAt`'s smallest-ring rule then
 * makes it win over the lake.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { decodeLakes, encodeLakes, inflate } from '../src/pack.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.argv[2] ?? resolve(here, '../../.cache/ne50-lakes.geojson');
const OUT = resolve(here, '../public/data/lakes.bin');

/**
 * Smallest lake kept, in square degrees of true area (shoelace times the
 * cosine of the latitude). Each lake is a hole in the land mesh, and holes
 * cost far more than their size: the triangulator bridges every hole to the
 * outer contour and the refinement then splits the long slivers many times.
 * Every lake in the source would multiply the land mesh about five times;
 * this threshold keeps the largest few dozen rings (the Great Lakes, the Rift
 * Valley, Baikal, Titicaca...) for about a fifth more triangles. True area,
 * because a raw lon/lat shoelace overstates high-latitude lakes, where most
 * of the small ones are.
 */
const MIN_RING_AREA = 0.5;
/** Coordinate decimals: 2 (~1 km) for large rings, 3 under `SMALL_RING_AREA` square degrees. */
const PRECISION_LARGE = 2;
const PRECISION_SMALL = 3;
const SMALL_RING_AREA = 1;

/** Shoelace area, signed by winding. */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/**
 * The shoelace corrected for converging meridians, in square degrees. The
 * precision choice still uses the raw shoelace, since it is about coordinates.
 */
function trueArea(ring) {
  let lat = 0;
  for (const p of ring) lat += p[1];
  return Math.abs(signedArea(ring)) * Math.cos(((lat / ring.length) * Math.PI) / 180);
}

const geo = JSON.parse(readFileSync(SOURCE, 'utf8'));
const rings = [];
/**
 * The source carries Lake Volta twice; a duplicate would be cut as two
 * coincident holes and fold land over the water. Rings that round to one
 * already kept are dropped.
 */
const seen = new Set();
let duplicates = 0;
let dropped = 0;
let islandsDropped = 0;
let points = 0;
const classes = {};

for (const feature of geo.features) {
  const polygons = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates
    : feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : [];
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer) continue;
    islandsDropped += polygon.length - 1;

    const signed = signedArea(outer);
    if (trueArea(outer) < MIN_RING_AREA) {
      dropped++;
      continue;
    }

    // GeoJSON repeats the first point last; rings here are implicitly closed.
    const open = outer.slice(0, -1);

    // Keep land on the right of each edge, like a coastline: a lake has water
    // inside, so it winds the opposite way (positive shoelace, where country
    // rings are negative). Backwards, every lake's wall and surf face outward.
    if (signed < 0) open.reverse();

    const digits = Math.abs(signed) < SMALL_RING_AREA ? PRECISION_SMALL : PRECISION_LARGE;
    const round = (v) => Number(v.toFixed(digits));

    const rounded = open.map(([lon, lat]) => [round(lon), round(lat)]);
    const key = JSON.stringify(rounded);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);

    points += open.length;
    classes[feature.properties.featurecla] = (classes[feature.properties.featurecla] ?? 0) + 1;
    rings.push({ digits, points: rounded });
  }
}

// Biggest first, for a stable file; `countryAt` resolves overlaps by area itself.
rings.sort((a, b) => Math.abs(signedArea(b.points)) - Math.abs(signedArea(a.points)));

/** Decode the output and compare before writing, as the outlines' bake does. */
const plain = rings.map((ring) => ring.points);
const packed = gzipSync(encodeLakes(rings), { level: 9 });
if (JSON.stringify(decodeLakes(await inflate(packed))) !== JSON.stringify(plain)) {
  throw new Error('lakes.bin does not decode back to what was baked');
}
writeFileSync(OUT, packed);

const kb = (packed.length / 1024).toFixed(1);
console.log(
  `${rings.length} lakes, ${points} points ` +
  `(${dropped} rings dropped under ${MIN_RING_AREA} true sq deg, ${duplicates} duplicates, ` +
  `${islandsDropped} islands in lakes dropped) ` +
  `-> ${kb} KB gzipped`,
);
console.log(`  ${Object.entries(classes).map(([k, v]) => `${k} ${v}`).join(', ')}`);
