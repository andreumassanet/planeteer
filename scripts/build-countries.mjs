/**
 * Bakes the Natural Earth outlines (public domain, 1:10m) into the compact
 * binary the client turns into both the country index and the land mesh.
 *
 * The file is `public/data/countries.bin`: delta-coded integers at the precision
 * chosen per ring below, gzipped here rather than by the CDN, and read back by
 * `src/pack.ts`, which also writes it.
 *
 * It used to read 1:110m, then 1:50m. 110m has Spain as a *single* polygon: no
 * Balearics, no Canaries, and the same for every other archipelago. 50m has the
 * islands but not their shape — Mallorca arrived as 33 points, which is one
 * point every 17 km of a coast you are meant to walk, so the Badia de Palma,
 * the Badia d'Alcudia and Cap de Formentor were all a straight line. 10m,
 * simplified as below, gives it 48 placed where the coast turns, and the bays
 * come back.
 *
 * **10m is 5.4x the points**: the whole dataset over `MIN_RING_AREA` is 528 k
 * against 50m's 97 k, and shipping that would undo what `src/pack.ts` exists to
 * do. So every ring is simplified, and **every ring is simplified the same
 * way** — one tolerance and one precision for the whole planet. `SIMPLIFY_SAG`
 * says why the first version, which gave the islands every point and the
 * continents 50m's density, was the wrong trade.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { decodeCountries, encodeCountries, inflate } from '../src/pack.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.argv[2] ?? resolve(here, '../../.cache/ne10.geojson');
const OUT = resolve(here, '../public/data/countries.bin');

/**
 * Square degrees. This was 0.35 for the 1:110m data, and carrying that number
 * over would have thrown away most of what the newer datasets are for: Menorca
 * is 0.073, Ibiza 0.064, Cabrera 0.0033 and the largest Canary island 0.185. At
 * 0.003 the smallest ring kept is about 5 units across on a 4000-unit planet,
 * roughly the height of the player, which is the point where an island stops
 * being a place you can stand on.
 */
const MIN_RING_AREA = 0.003;
/**
 * Coordinate precision: 3 decimals, ~110 m, for every ring.
 *
 * It used to be chosen per ring — 2 (~1 km) over a square degree, 3 below — and
 * that was the same two-tier mistake as the simplification: a 1 km grid is as
 * coarse as the whole tolerance below, so a continent's coast was rounded by as
 * much again as it was simplified and an island's was not. One precision, ten
 * times finer than the tolerance, keeps the rounding out of the shape
 * everywhere. It costs bytes rather than points: 420 KB gzipped against 412 for
 * the two-tier file, which had 12% more points (2026-09-13).
 *
 * A ring the repair below cannot untangle at its own precision is given the
 * next decimal place, and `PRECISION_FINEST` is where that stops. At the
 * shipped tolerance no ring asks (2026-09-13). `check-world.ts` asserts the
 * whole file back at this same ceiling, so raising it is a change in two places
 * on purpose.
 */
const PRECISION = 3;
const PRECISION_FINEST = 4;
/**
 * How far, in degrees, a simplified ring may pull away from the outline the
 * dataset drew — **the same number for every ring on the planet**.
 *
 * **The first version of this gave the islands everything and the continents
 * 0.02, and the world came out in two styles.** Every ring under a square
 * degree kept all its points and every ring over it was thinned, so the median
 * coast segment was 3.9 units on an island and 21.5 on everything else — the
 * 21.3 that 1:50m had. Mallorca was drawn four times finer than the Spanish
 * coast facing it and Corsica four times finer than Sardinia 12 km away, and
 * the line between them was a cliff: 0.99 square degrees got every point and
 * 1.01 got 1:50m's. Sicily came out *coarser* than 1:50m had drawn it, 89
 * points to 73.
 *
 * One tolerance is one level of detail, and Douglas-Peucker then spends the
 * points where a coast turns, whichever coast it is. Swept 2026-09-13; the land
 * mesh measured headless with the game's own detail and flatten sites, and the
 * median segment in world units, islands / the rest, against the 6.8-unit body
 * of the time (a person is 3.77 units since 2026-09-24):
 *
 * | tolerance | points | median segment | land triangles |    MB | build  |
 * |-----------|--------|----------------|----------------|-------|--------|
 * | 1:50m     |   97 k | 15.7 / 21.3    | 1.65 M         |  85.0 |  9.9 s |
 * | two-tier  |  205 k |  3.9 / 21.5    | 2.15 M         | 110.9 | 12.9 s |
 * | 0.01      |  183 k | 11.5 / 13.6    | 2.18 M         | 112.1 | 12.9 s |
 * | 0.007     |  227 k |  9.4 / 11.0    | 2.37 M         | 122.1 | 14.4 s |
 * | 0.005     |  272 k |  7.8 /  9.1    | 2.52 M         | 129.8 | 15.7 s |
 *
 * 0.01 is 1.1 km, three units, under half that body (a person and a third
 * now), and it costs what the
 * two-tier file cost. It was looked at rather than assumed: from 450 and from
 * 200 units up over Mallorca and Formentor it is close to indistinguishable from
 * keeping every point, and everything bigger than an island gains — Iberia goes
 * from 437 points to 691, Great Britain from 689 to 1,181. 0.02 cannot be used
 * uniformly at all: the smallest rings collapse, and a 0.0033-square-degree one
 * in Tajikistan comes out as two points.
 *
 * **The point count is not the measure of loss.** Most of a landlocked
 * country's outline is a surveyed border drawn as a run of collinear points,
 * and dropping those moves nothing. Douglas-Peucker bounds the worst deviation
 * at the tolerance by construction, so the guarantee is the same for a country
 * nobody checks as for one that got measured — and against that, 1:50m strayed
 * 0.504 degrees from 1:10m in Norway, 0.313 in Chile and 0.133 in Spain.
 *
 * It is a flat distance and not a fraction of the ring, which an earlier
 * attempt had. A tolerance scaled by `sqrt(area)` is 0.4 deg on Antarctica:
 * Russia came out at 413 points against 1:50m's 4,573 and the Arctic coast was
 * a straight line. How finely a coast is drawn is a property of the coast, not
 * of how much land is behind it.
 */
const SIMPLIFY_SAG = 0.01;

/** Shoelace. Signed: the sign tells us the winding. */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/**
 * Douglas-Peucker, iterative because a 90,000-point ring would blow a recursive
 * one's stack. Distance is to the *segment*, not its infinite line: on a closed
 * ring the two ends of a span can sit on top of each other, and the line through
 * them is then undefined while the segment is still perfectly well behaved.
 *
 * Returns the indices it kept rather than the points, because the repair below
 * puts points back and has to know where they came from.
 *
 * Degrees are treated as a flat plane here. Over a span this short that is the
 * same approximation the rest of the bake makes, and the tolerance is a budget
 * rather than a measurement.
 */
function simplify(points, tolerance) {
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  if (points.length > 2) {
    const limit = tolerance * tolerance;
    const spans = [[0, points.length - 1]];
    while (spans.length > 0) {
      const [from, to] = spans.pop();
      if (to - from < 2) continue;
      const [ax, ay] = points[from];
      const [bx, by] = points[to];
      const dx = bx - ax;
      const dy = by - ay;
      const span = dx * dx + dy * dy;

      let worst = -1;
      let worstAt = -1;
      for (let i = from + 1; i < to; i++) {
        const [px, py] = points[i];
        let ex;
        let ey;
        if (span === 0) {
          ex = px - ax;
          ey = py - ay;
        } else {
          let t = ((px - ax) * dx + (py - ay) * dy) / span;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          ex = px - (ax + t * dx);
          ey = py - (ay + t * dy);
        }
        const away = ex * ex + ey * ey;
        if (away > worst) {
          worst = away;
          worstAt = i;
        }
      }

      if (worst > limit) {
        keep[worstAt] = 1;
        spans.push([from, worstAt], [worstAt, to]);
      }
    }
  }
  const kept = [];
  for (let i = 0; i < points.length; i++) if (keep[i] === 1) kept.push(i);
  return kept;
}

/**
 * Every place a closed ring crosses itself, as pairs of segment indices.
 *
 * Buckets the segments by half a degree first, because the rings that need
 * asking are the ones with four thousand points in them and every-pair is
 * sixteen million tests. Segments that share an end are skipped: they touch by
 * definition and that is not a crossing.
 */
function crossings(points) {
  const n = points.length;
  const cells = new Map();
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const x0 = Math.floor(Math.min(a[0], b[0]) * 2);
    const x1 = Math.floor(Math.max(a[0], b[0]) * 2);
    const y0 = Math.floor(Math.min(a[1], b[1]) * 2);
    const y1 = Math.floor(Math.max(a[1], b[1]) * 2);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`;
        const bucket = cells.get(key);
        if (bucket) bucket.push(i);
        else cells.set(key, [i]);
      }
    }
  }

  const side = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const found = new Map();
  for (const bucket of cells.values()) {
    for (let u = 0; u < bucket.length; u++) {
      for (let v = u + 1; v < bucket.length; v++) {
        const i = bucket[u];
        const j = bucket[v];
        if ((i + 1) % n === j || (j + 1) % n === i) continue;
        const [p1, p2] = [points[i], points[(i + 1) % n]];
        const [p3, p4] = [points[j], points[(j + 1) % n]];
        const d1 = side(p3, p4, p1);
        const d2 = side(p3, p4, p2);
        const d3 = side(p1, p2, p3);
        const d4 = side(p1, p2, p4);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
          // A bucketed scan sees a pair once per cell they share.
          found.set(`${i},${j}`, [i, j]);
        }
      }
    }
  }
  return [...found.values()];
}

/**
 * The ring as it will ship: opened, wound, rounded and deduplicated, from the
 * indices the simplifier kept.
 *
 * All of it in one place because **the crossing test has to see the rounded
 * points, not the simplified ones**. Rounding a coast moves every vertex by up
 * to half a step, and on a strait narrower than that the two shores land on the
 * same coordinate and swap sides. Checking before the rounding said 53 rings
 * were clean that were not.
 *
 * `from` is the index in `outer` each surviving point came from, so the repair
 * can ask what was dropped between two of them. The winding is left alone here
 * and applied once at the end: reversing scrambles that mapping and a ring
 * crosses itself in either direction.
 */
function ringAt(outer, kept, digits) {
  const round = (v) => Number(v.toFixed(digits));
  const points = [];
  const from = [];
  for (const index of kept) {
    // The last point of a GeoJSON ring repeats the first. Drop it: every
    // consumer here treats rings as implicitly closed, and a duplicate point
    // becomes a zero-length edge that the triangulator has to special-case.
    if (index === outer.length - 1) continue;
    const point = [round(outer[index][0]), round(outer[index][1])];
    const previous = points[points.length - 1];
    // Rounding can put two neighbours on the same coordinate, and does: 3
    // decimals is 110 m and the dataset draws finer than that around a
    // headland. Same zero-length edge, same treatment.
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
    points.push(point);
    from.push(index);
  }
  while (
    points.length > 1 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1]
  ) {
    points.pop();
    from.pop();
  }
  return { points, from };
}

/**
 * Put back whatever it takes to stop a simplified ring crossing itself.
 *
 * **Douglas-Peucker does not preserve topology and that is not a corner case.**
 * At 0.02 deg over the large rings (2026-09-09) it put crossings into 53 of the
 * 2,849 rings — the Norwegian
 * fjords, the Canadian archipelago, the Alaskan panhandle — every one a place
 * where two parts of the same coast run within a tolerance of each other, so
 * the cut across a peninsula lands on the far shore. A crossed ring is not
 * cosmetic: the ear clipper triangulates it inside out, the cliffs there build
 * facing inland, and `countryAt` answers for the wrong side of its own coast.
 *
 * **The repair is local, and the first version of it was not.** Halving the
 * tolerance for the whole ring also works and it cost 130,000 points across the
 * file — Greenland and Canada carry most of the points and were also the rings
 * that needed the fewest of them put back. Restoring the midpoint of each
 * offending segment instead costs a few hundred: it bisects the span, so a
 * crossing clears in a handful of rounds, and it stops when there is nothing
 * left to restore because the span is already a single source segment.
 *
 * That last case is real — two source segments genuinely on top of each other
 * after rounding — and there the simplification is not what is wrong. `digits`
 * is, and the caller raises it. Takes and returns the kept indices, because the
 * caller has a second thing to say about which points survive.
 */
function untangle(outer, kept, digits) {
  let current = kept;
  for (;;) {
    const built = ringAt(outer, current, digits);
    const bad = crossings(built.points);
    if (bad.length === 0) return current;

    const restore = new Set();
    for (const pair of bad) {
      for (const segment of pair) {
        const a = built.from[segment];
        // The last segment closes the ring, and it ends where the source does.
        const b = segment + 1 < built.from.length ? built.from[segment + 1] : outer.length - 1;
        const middle = (a + b) >> 1;
        if (middle > a && middle < b) restore.add(middle);
      }
    }
    // Nothing left to put back: every offending segment is already one source
    // segment, so this is the rounding and not the simplification.
    if (restore.size === 0) return null;
    const grown = [...new Set([...current, ...restore])].sort((x, y) => x - y);
    // A restored point that rounding then merges into its neighbour leaves the
    // ring exactly as it was, and asking again would ask forever. That is the
    // same dead end as having nothing to restore, and it ends the same way.
    if (grown.length === current.length) return null;
    current = grown;
  }
}

function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

const geo = JSON.parse(readFileSync(SOURCE, 'utf8'));

/**
 * Every ring the file will hold, gathered before any of them is decided.
 *
 * **A shared border is one line drawn twice and it has to stay one line.**
 * Natural Earth draws Niger's side of the Nigeria border from exactly the same
 * coordinates as Nigeria's side — all 1,041 of Niger's points are a point in
 * some neighbour's ring, and so is every point of Chad, Mali, Switzerland and
 * Austria. Simplify the two rings separately and they no longer agree: each
 * keeps the subset its own coastline argued for, the border opens into a
 * lens-shaped sliver belonging to no country, and every part of the engine that
 * asks `countryAt` reads that sliver as **sea**. It is not a rendering
 * artefact. The first bake of this put 45 water samples in a two-degree box in
 * the middle of the Sahel, which dropped its distance-to-ocean from nine
 * degrees to 0.42 and turned the whole climate model there temperate.
 *
 * So the decision is not per ring. A point kept by any ring is kept by every
 * ring that has it, which is one pass over a set of coordinates and restores
 * the shared line exactly, because it was exact in the source.
 */
const work = [];
let ringsDropped = 0;
for (const feature of geo.features) {
  for (const polygon of polygonsOf(feature.geometry)) {
    // Outer ring only: holes (lakes, enclaves) do not register at this scale,
    // and `countryAt` resolves the resulting overlaps by taking the smallest
    // containing ring instead.
    const outer = polygon[0];
    if (!outer) continue;

    const signed = signedArea(outer);
    const size = Math.abs(signed);
    if (size < MIN_RING_AREA) {
      ringsDropped++;
      continue;
    }

    work.push({
      feature,
      outer,
      signed,
      size,
      digits: PRECISION,
      kept: simplify(outer, SIMPLIFY_SAG),
      points: null,
    });
  }
}

/** A source coordinate, exactly as the dataset wrote it. Two rings share a
 * border when they share these. */
const mark = (point) => `${point[0]},${point[1]}`;

/**
 * Which rings are joined to which, so that a precision raised for one of them
 * is raised for all of them.
 *
 * Every ring starts at `PRECISION`, but the repair below can give one another
 * decimal, and the two sides of a border rounded differently open the same
 * sliver the kept-point agreement closes — the first version of this had
 * Andorra at 3 decimals against France at 2. So a ring cannot choose its own
 * precision: a *landmass* does.
 *
 * Union-find over "these two rings share a source coordinate" gives the
 * landmasses. Eurasia-with-Africa is one of them and holds most of the file;
 * Mallorca is one on its own.
 */
const parent = work.map((_, i) => i);
const find = (i) => {
  let root = i;
  while (parent[root] !== root) root = parent[root];
  for (let at = i; parent[at] !== root; ) {
    const next = parent[at];
    parent[at] = root;
    at = next;
  }
  return root;
};
{
  const owner = new Map();
  work.forEach((item, i) => {
    for (const point of item.outer) {
      const key = mark(point);
      const first = owner.get(key);
      if (first === undefined) owner.set(key, i);
      else parent[find(i)] = find(first);
    }
  });
}
// The coarsest precision anyone in the landmass asked for, which is the only
// one all of them can share.
{
  const coarsest = new Map();
  work.forEach((item, i) => {
    const root = find(i);
    coarsest.set(root, Math.min(coarsest.get(root) ?? Infinity, item.digits));
  });
  work.forEach((item, i) => {
    item.digits = coarsest.get(find(i));
  });
}

/**
 * Agree on the kept points, then untangle, then agree again.
 *
 * Untangling restores points too, and a point restored in one ring and not its
 * neighbour reopens the sliver the agreement just closed — so the two steps
 * take turns until a round changes nothing. The cap is there to fail loudly
 * rather than spin if a future dataset finds a cycle.
 */
let repaired = 0;
for (let round = 0; ; round++) {
  if (round > 12) throw new Error('the shared-border agreement did not settle');

  const wanted = new Set();
  for (const item of work) for (const index of item.kept) wanted.add(mark(item.outer[index]));

  let changed = false;
  for (const item of work) {
    const before = item.kept.length;
    const own = new Set(item.kept);
    const grown = [];
    for (let i = 0; i < item.outer.length; i++) {
      if (own.has(i) || wanted.has(mark(item.outer[i]))) grown.push(i);
    }
    item.kept = grown;
    if (grown.length !== before) changed = true;
  }

  // A ring that will not untangle at its landmass's precision takes the whole
  // landmass to the next decimal with it — the alternative is the two sides of
  // a border rounding differently, which is the sliver this all exists to
  // close. None asks at the shipped tolerance (2026-09-13); the two-tier file
  // had eight.
  for (const item of work) {
    while (untangle(item.outer, item.kept, item.digits) === null) {
      if (item.digits >= PRECISION_FINEST) {
        throw new Error(
          `${item.feature.properties.NAME}: a ring of ${item.size.toFixed(4)} sq deg ` +
          `crosses itself at ${PRECISION_FINEST} decimals`,
        );
      }
      const root = find(work.indexOf(item));
      for (const other of work) if (find(work.indexOf(other)) === root) other.digits++;
      repaired++;
      changed = true;
    }
  }

  for (const item of work) item.kept = untangle(item.outer, item.kept, item.digits);
  if (!changed) break;
}

/**
 * And the rounding agrees, ring by ring rather than by construction.
 *
 * The union-find above is the reason this holds; this is what says it does, and
 * would have caught the first version of it, where Andorra rounded to 3 decimals
 * against France's 2.
 */
{
  const precision = new Map();
  for (const item of work) {
    for (const index of item.kept) {
      const key = mark(item.outer[index]);
      const seen = precision.get(key);
      if (seen !== undefined && seen !== item.digits) {
        throw new Error(
          `${item.feature.properties.NAME}: a shared point is rounded to ${item.digits} decimals ` +
          `here and ${seen} in its neighbour`,
        );
      }
      precision.set(key, item.digits);
    }
  }
}

const countries = [];
let ringsKept = 0;
let pointsKept = 0;

for (const feature of geo.features) {
  const p = feature.properties;
  const rings = [];

  for (const item of work) {
    if (item.feature !== feature) continue;
    const points = ringAt(item.outer, item.kept, item.digits).points;

    // Normalise the winding so the mesh can build its coastal walls without
    // testing orientation per ring. Natural Earth is consistent today, but one
    // inverted ring would come out with its cliff facing inwards and be
    // invisible, which is a miserable bug to chase.
    if (item.signed > 0) points.reverse();

    // A ring over MIN_RING_AREA cannot round down to a degenerate one, so this
    // is not a case to handle quietly — it is the tolerances having drifted
    // into each other, and it should stop the bake rather than ship a sliver.
    if (points.length < 3) {
      throw new Error(`${p.NAME}: a ring of ${item.size.toFixed(4)} sq deg collapsed to ${points.length} points`);
    }

    ringsKept++;
    pointsKept += points.length;
    // `digits` travels with the ring because the wire format needs it and it
    // cannot be recovered from the numbers: 2 decimals is a coordinate that
    // happens to end in a zero. See `src/pack.ts`.
    rings.push({ digits: item.digits, points });
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
  `(${ringsDropped} dropped under ${MIN_RING_AREA} sq deg, ${repaired} rings needed a decimal place) ` +
  `-> ${kb} KB gzipped`,
);
