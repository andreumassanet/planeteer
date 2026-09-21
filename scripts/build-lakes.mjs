/**
 * Bakes Natural Earth's inland water (public domain, 1:50m) into the binary the
 * client turns into holes in the land.
 *
 * The file is `public/data/lakes.bin` and it is `countries.bin`'s ring section
 * and nothing else: delta-coded integers at the precision chosen per ring,
 * gzipped here rather than by the CDN, written and read by `src/pack.ts`.
 *
 * **A lake carries no name and that is a saving, not an omission.** The
 * outlines ship `iso`, `name` and `continent` because the HUD names the country
 * you are standing in and `sheets/flags.html` draws 234 flags from them; nothing in
 * this world can be *in* a lake — `countryAt` returns open water there, exactly
 * as it does at sea — so a name would be 412 strings nobody reads. `pnpm check`
 * reads them by their own outlines instead: it samples every lake on a grid
 * against `countryAt`, and counts the land the mesh draws over the water.
 *
 * **Outer rings only, the same rule the outlines follow**, so an island in a
 * lake is drowned unless the *country* data draws it as a ring of its own —
 * which it does for Manitoulin and the others that matter, because a lake island
 * is a separate polygon of somebody's coastline. `countryAt` picks the smallest
 * containing ring, so that island wins over the lake around it with no rule
 * anywhere saying so.
 *
 * The one thing that is *not* the outlines' rule is the winding, and it is the
 * same law read from the other side. See below.
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
 * Square degrees of *true* area — the shoelace times the cosine of the ring's
 * own latitude — and it is **not** `build-countries.mjs`'s number, which is the
 * one thing about this file that had to be measured rather than copied.
 *
 * It was 0.003 and the argument was symmetry: that is the floor deciding
 * whether an island is a place you can stand on, so a lake is the same question
 * about a place you can float on. The symmetry is false and the measurement is
 * what says so. **An island is land added to a mesh and a lake is a hole cut in
 * one**, and a hole is not paid for by its own size:
 * `ShapeUtils.triangulateShape` bridges every hole to the outer contour, the
 * ear clipper then works on a polygon with that many slits in it, and
 * `globe.ts`'s refinement squares whatever the slivers cost — an edge `n` times
 * `MAX_EDGE` long is split about `3^log2(n)` times before it settles. Measured
 * on Canada's own ring, same terrain, holes off and on: **3,385 ear-clipper
 * faces refining to 63,157 triangles against 8,139 refining to 2,994,260** —
 * 2.4 times the faces and 47 times the mesh, because the longest edge coming
 * out of earcut went from 22.5 degrees to 41.9 and there were far more of them.
 *
 * So the whole planet's land mesh went 1.45 M triangles to **7.08 M and 729
 * MB**, built in 29.3 s against 4.8 — for 410 lakes covering 131 square degrees
 * of a 148,000 square degree world, **0.09% of the land for 5.6 M triangles**.
 *
 * The sweep is against how many lakes are kept rather than against the
 * threshold, because that is the causal variable — the cost is per hole and
 * superlinear in how many one ring has — and because the eight counts below
 * came from sweeping the threshold both ways, raw shoelace and true area, on
 * the way to deciding which it should be. Same code, nothing else moved. **The
 * MB are the `Float32` figures they were measured with**, before the buffers
 * were quantised to bytes; the triangle counts are untouched by that and the
 * megabytes are now half of what this column says.
 *
 * ```
 *   lakes kept   triangles     MB    build
 *        0        1.450 M     149    4.8 s
 *       20        1.556 M     160    5.2 s
 *       27        1.639 M     169    6.5 s
 *       46        1.784 M     184    6.0 s
 *       57        1.840 M     190    7.3 s
 *       88        2.087 M     215    7.3 s
 *      182        3.089 M     318   11.3 s
 *      410        7.082 M     729   29.3 s
 * ```
 *
 * The build column is one run each and is noisy at the top — 46 lakes read
 * faster than 27 — so read the triangles.
 *
 * 0.5 true square degrees is 27 rings — 26 lakes, since the source carries
 * Lake Volta twice (see `seen` below) — the largest set inside the budget the
 * lakes are worth (the no-lake mesh plus a fifth) with room left for the world
 * to grow into. It is a ring about **223 world units across, 33 avatars**, and
 * the shape argument agrees with the budget rather than fighting it:
 * `COAST_CELL` is half a degree, 140 units, and `buildCoastField` has to clear
 * a whole cell for any lake at all, so a lake smaller than that is one whose
 * shore is wider than the lake. What is lost is Geneva, Constance and every
 * reservoir — none of them 60 units across at 1:400, which is nine avatars, a
 * pond you step over rather than a lake you take the boat onto. What is kept is
 * the Great Lakes, the Rift Valley, Baikal, Ladoga, Balkhash, Titicaca,
 * Nicaragua and Eyre.
 *
 * **True area and not the shoelace**, because a lon/lat shoelace overstates by
 * `1/cos(lat)` — a factor of two at 60N — and the cost is concentrated exactly
 * there: Canada, Finland and Russia carry 163 of the 410 rings between them and
 * the three worst amplifications in the world. A raw threshold keeps small
 * Arctic lakes and drops larger tropical ones, which is the wrong way round on
 * both counts.
 */
const MIN_RING_AREA = 0.5;
/** As the outlines: 2 decimals is ~1 km, too coarse for anything small. */
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

/**
 * The shoelace corrected for the meridians converging, in square degrees.
 *
 * The precision split below still uses the raw shoelace, because that one is
 * asking how many decimals a ring needs and a ring's *coordinates* are in
 * degrees. This one is asking how big the lake is, and that is a fact about the
 * world; see `MIN_RING_AREA`.
 */
function trueArea(ring) {
  let lat = 0;
  for (const p of ring) lat += p[1];
  return Math.abs(signedArea(ring)) * Math.cos(((lat / ring.length) * Math.PI) / 180);
}

const geo = JSON.parse(readFileSync(SOURCE, 'utf8'));
const rings = [];
/**
 * **The source carries Lake Volta twice**, as two features with the same
 * outline and different `scalerank`s, and a lake baked twice is not the same
 * lake: `globe.ts` cut it out of Ghana as two coincident holes, and
 * `ShapeUtils.triangulateShape` handed back 1,048 faces covering 25.2 square
 * degrees of a ring whose true fill is 671 faces and 18.9 — land folded over
 * the water, 76 triangles of it standing in the lake. So a ring that rounds to
 * one already kept is dropped here, where there is one copy to compare against.
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

    // The last point repeats the first in GeoJSON, and every consumer here
    // treats a ring as implicitly closed.
    const open = outer.slice(0, -1);

    // **Wound the other way round from a coastline, and it is the same law.**
    // `build-countries.mjs` winds a country so the land is on the *right* of
    // `a -> b`, which is what lets `globe.ts` build its cliffs, `terrain.ts`
    // index its shores and `ocean.ts` lay its surf all from one sign —
    // `cross(up, b - a)` points at the water. A lake has its water on the
    // inside, so keeping land on the right means walking the other way round
    // it: the outlines are normalised to a negative shoelace and these to a
    // positive one. Get it backwards and every lake grows its wall facing out
    // into the country, where it is invisible, and the surf runs round the
    // outside of the shore — which is exactly the failure the coastal version
    // of this already has written down, and `pnpm check` catches it the same
    // way, by stepping off each wall and asking what is there.
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

// Biggest first, so a lake that overlaps another resolves the way `countryAt`
// resolves an enclave: the smallest containing ring wins, and `geo.ts` sorts its
// grid cells by area anyway. This is only so the file reads the same way twice.
rings.sort((a, b) => Math.abs(signedArea(b.points)) - Math.abs(signedArea(a.points)));

/**
 * The round trip is proved before a byte is written, exactly as the outlines'
 * bake proves its own. A coordinate that came back a millionth of a degree out
 * would look identical on screen and would move `countryAt` on a shoreline,
 * which is the one place it matters.
 */
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
