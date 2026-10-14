/**
 * Bakes the Natural Earth 1:10m admin-0 outlines (public domain) into
 * `public/data/countries.bin`, which the client turns into both the country
 * index and the land mesh. The format is delta-coded integers, gzipped here,
 * written and read by `src/pack.ts`.
 *
 * 1:10m is needed for islands and bays at walking scale, but is too many
 * points to ship as is, so every ring is simplified with one tolerance and one
 * precision for the whole planet (see `SIMPLIFY_SAG`).
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
 * Smallest ring kept, in square degrees: about the point where an island is
 * too small to stand on.
 */
const MIN_RING_AREA = 0.003;
/**
 * Coordinate precision: 3 decimals (~110 m) for every ring, ten times finer
 * than the simplification tolerance so rounding never shapes a coast.
 *
 * A ring the repair below cannot untangle at its precision gets another
 * decimal, up to `PRECISION_FINEST`. `check-world.ts` asserts the file at the
 * same ceiling, so raising it is a change in two places.
 */
const PRECISION = 3;
const PRECISION_FINEST = 4;
/**
 * How far, in degrees, a simplified ring may stray from the source outline:
 * the same for every ring, so islands and continents are drawn at one level
 * of detail. 0.01 degrees is about 1.1 km. Douglas-Peucker bounds the worst
 * deviation at this by construction. It is a flat distance, not a fraction of
 * the ring's size: how finely a coast is drawn is a property of the coast.
 */
const SIMPLIFY_SAG = 0.01;

/** Shoelace area, signed by winding. */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/**
 * Douglas-Peucker, iterative so a 90,000-point ring cannot overflow the stack.
 * Distance is to the segment, not its line, since the ends of a span on a
 * closed ring can coincide. Degrees are treated as a flat plane. Returns the
 * kept indices, which the repair below needs.
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
 * Segments are bucketed by half a degree first; adjacent segments are skipped.
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
 * The ring as it will ship: opened, rounded and deduplicated, from the kept
 * indices. The crossing test must see rounded points, since rounding can make
 * the two shores of a narrow strait swap sides.
 *
 * `from` maps each surviving point to its index in `outer`, for the repair.
 * Winding is applied once at the end, since reversing would scramble `from`.
 */
function ringAt(outer, kept, digits) {
  const round = (v) => Number(v.toFixed(digits));
  const points = [];
  const from = [];
  for (const index of kept) {
    // A GeoJSON ring repeats its first point last; rings here are implicitly
    // closed, and a duplicate would be a zero-length edge.
    if (index === outer.length - 1) continue;
    const point = [round(outer[index][0]), round(outer[index][1])];
    const previous = points[points.length - 1];
    // Rounding can merge neighbours into one coordinate; drop the duplicate.
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
 * Restores points until a simplified ring no longer crosses itself.
 * Douglas-Peucker does not preserve topology: where two parts of one coast run
 * within the tolerance (fjords, archipelagos), a cut lands on the far shore,
 * and a crossed ring triangulates inside out and breaks `countryAt`.
 *
 * Each round restores the midpoint of each offending span, so crossings clear
 * in a few rounds at a cost of a few hundred points. Returns null when a
 * crossing is already a single source segment: then the rounding is at fault
 * and the caller raises the precision.
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
    // Every offending segment is a single source segment: rounding is at fault.
    if (restore.size === 0) return null;
    const grown = [...new Set([...current, ...restore])].sort((x, y) => x - y);
    // Restored points that rounding merged away change nothing; stop rather than loop.
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
 * Every ring, gathered before any is decided. A shared border is the same
 * coordinates in both neighbours' rings; simplified separately they would
 * diverge and open a sliver that `countryAt` reads as sea. So a point kept by
 * any ring is kept by every ring that has it.
 */
const work = [];
let ringsDropped = 0;
for (const feature of geo.features) {
  for (const polygon of polygonsOf(feature.geometry)) {
    // Outer rings only: `countryAt` resolves enclaves by taking the smallest
    // containing ring.
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

/** A source coordinate exactly as written; rings sharing one share a border. */
const mark = (point) => `${point[0]},${point[1]}`;

/**
 * Landmasses: union-find over rings that share a source coordinate. Precision
 * is chosen per landmass, not per ring, since two sides of a border rounded
 * differently would open the same sliver.
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
// Each landmass takes the coarsest precision any of its rings has.
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
 * Agree on kept points, untangle, and repeat until nothing changes: a point
 * restored in one ring and not its neighbour would reopen a sliver. The cap
 * fails loudly rather than spin.
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

  // A ring that will not untangle takes its whole landmass to the next decimal.
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

/** Asserts that every shared point is rounded to the same precision on both sides. */
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

    // Normalise the winding so the mesh can build coastal walls without
    // testing orientation; an inverted ring would face its cliffs inwards.
    if (item.signed > 0) points.reverse();

    // A ring over MIN_RING_AREA should never degenerate; if it does the
    // tolerances have drifted, so stop.
    if (points.length < 3) {
      throw new Error(`${p.NAME}: a ring of ${item.size.toFixed(4)} sq deg collapsed to ${points.length} points`);
    }

    ringsKept++;
    pointsKept += points.length;
    // The wire format needs each ring's precision; it cannot be inferred from the numbers.
    rings.push({ digits: item.digits, points });
  }

  if (rings.length === 0) continue;

  // Centroid of the largest ring, for labels and locating a country.
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
    // The real ISO code where there is one, else Natural Earth's `ADM0_A3`,
    // which is present on every feature and unique.
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
 * The bake decodes its own output and compares before writing: a coordinate
 * slightly off would be invisible on screen but move `countryAt` on a coast.
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
// Remove the legacy JSON so a stale copy cannot ship.
rmSync(resolve(here, '../public/data/countries.json'), { force: true });

const kb = (readFileSync(OUT).length / 1024).toFixed(0);
console.log(
  `${countries.length} countries, ${ringsKept} rings, ${pointsKept} points ` +
  `(${ringsDropped} dropped under ${MIN_RING_AREA} sq deg, ${repaired} rings needed a decimal place) ` +
  `-> ${kb} KB gzipped`,
);
