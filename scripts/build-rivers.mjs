/**
 * Bakes Natural Earth's river centrelines (public domain, 1:50m) into the
 * binary the client lays on the relief as water.
 *
 *   node scripts/build-rivers.mjs        # write public/data/rivers.bin
 *   node scripts/build-rivers.mjs --dry  # report and write nothing
 *
 * The file is `public/data/rivers.bin` and it is `countries.bin`'s ring section
 * with three columns round it — a name, Natural Earth's `scalerank`, and a
 * width class per vertex — written and read by `src/pack.ts`, gzipped here
 * rather than by the CDN.
 *
 * **The whole of this script is one decision and the geometry falls out of it:
 * a river vertex is kept when the *outlines* say it is on land.** The source
 * draws the world's rivers on the world's real coastline and this planet draws
 * a 1:50m country polygon with 27 lakes cut out of it, and the two do not agree
 * at the metre — an estuary Natural Earth draws as coast is sea here, a river
 * that runs into Baikal ends at Baikal's ring. So the bake walks every vertex,
 * asks `countryAt`, and cuts the line wherever the answer is water. What comes
 * out is not a river drawn *near* the coast, it is a river that stops exactly
 * where this planet's coast is — which is the property `pnpm check` asserts and
 * the one a snap-to-land would have destroyed.
 *
 * **A river is not a lake and it must not become one.** `build-lakes.mjs`
 * prices what inland water costs when it is cut *out* of the land mesh — 410
 * lakes covering 0.09% of the land took the mesh from 1.45 M triangles to
 * 7.08 M — and a river is a hole 25,641 vertices long. Nothing here touches the
 * land mesh: `src/rivers.ts` lays a ribbon *on* the relief, and the only thing
 * that changes about `globe.ts` is nothing.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { dataStamp, decodeRivers, encodeRivers, inflate } from '../src/pack.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { SHORE_LIP } from '../src/terrain.ts';
import { classForRank, riverPoint } from '../src/rivers.ts';

const DEG = Math.PI / 180;

const here = dirname(fileURLToPath(import.meta.url));
const dry = process.argv.includes('--dry');
const named = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const SOURCE = named ?? resolve(here, '../../.cache/ne50-rivers.geojson');
const OUT = resolve(here, '../public/data/rivers.bin');

const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakeBytes = readFileSync(resolve(here, '../public/data/lakes.bin'));
// The same stub the other bakes install, and the same reason it has to know
// which file is being asked for: handing `decodeLakes` the outlines throws on
// the magic rather than misreading them.
globalThis.fetch = async (url) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakeBytes : outlines),
});

const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());

// ---------------------------------------------------------------------------
// The parameters
// ---------------------------------------------------------------------------

/**
 * How far a stored vertex may sit from the line it replaces, in world units.
 *
 * Douglas-Peucker, and what it is chosen against is the *spacing it produces*
 * rather than an error budget, because a chord error is not what this number
 * buys: `src/rivers.ts` subdivides a stored segment to 18 units in the near
 * band exactly as `roads.ts` does, so the ground is followed at 18 whatever is
 * on the wire. All this decides is how much of the source's own meander is
 * worth carrying. The sweep, over the 805 runs that survive the water test
 * (2026-09-06):
 *
 * ```
 *   epsilon   vertices   mean spacing   rivers.bin
 *     0 u      25,157        27 u          41.2 KB
 *     1        24,094        29             40.1
 *     2        21,973        31             38.0
 *     3        19,225        36             35.0
 *     5        14,523        48             29.6
 *     8        10,014        71             23.7
 *    16         6,080       122             18.0
 * ```
 *
 * Five is the row that lands in the 40-to-60 band the ribbon was designed for,
 * and the shape of the column says it is also the last cheap one: the first
 * five units of tolerance buy 42% of the vertices for 28% of the file, and the
 * next three buy 31% more for 20% while taking the mean segment past the point
 * where a meander stops being a meander. Five units is 2.6 km on the real
 * Earth, which is under the bend a 1:50m centreline resolves in the first
 * place.
 */
const SIMPLIFY = 5;

/**
 * The shortest run of land the bake will keep, in world units.
 *
 * A river crossing a strait or a river-mouth polygon comes back as a handful of
 * two-vertex crumbs a few units long, and a crumb is an ink-outlined blue dash
 * lying in a field. 40 units is about six avatars and one stored segment, so
 * anything kept is at least a stretch of water you could walk along.
 */
const MIN_RUN = 40;

/**
 * How many decimals a stored coordinate carries.
 *
 * **Two, which is the outlines' own coarse setting, and the argument is that
 * this line has already thrown away more shape than the rounding will.**
 * `build-countries.mjs` spends 3 decimals on a small ring because
 * `MIN_RING_AREA` is 0.003 square degrees and Ibiza would quantise into a blob;
 * a river is a *line* and its own simplification tolerance is `SIMPLIFY` = 5
 * units, so a quantisation of 0.01 degrees — **2.79 units at the equator, half
 * of it either way** — is comfortably inside an error the shape has already
 * accepted. Storing 3 would be carrying a precision the polyline does not have.
 *
 * Measured at `SIMPLIFY` 5: **29.6 KB gzipped against 45.6**, because a 48-unit
 * step is one byte of delta at 2 decimals and two at 3. That is a third of the
 * file for a displacement smaller than the pen.
 *
 * The one thing it forces is the dedupe below: two source vertices closer than
 * 0.01 degrees round to the same point, and a zero-length segment is a
 * `normalize(0)` in the ribbon's own tangent.
 */
const PRECISION = 2;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Is this coordinate water?
 *
 * **Two questions and both of them have to say land, because the two answers
 * are not quite the same answer.** `countryAt` is the polygon and `elevationAt`
 * is the ground the ribbon will actually be laid on, and CLAUDE.md already
 * writes down that the two agree to a mean of 0.49 units and a worst of 4.78 —
 * which on a coastline is the difference between a river's last vertex and the
 * sea. Measured here: **22 of 14,539 vertices** passed `countryAt` and came back
 * at elevation zero, all of them a river mouth or a delta, and each one would
 * have been a ribbon laid flat on the water.
 *
 * The floor is `SHORE_LIP` rather than zero because that is the lowest ground on
 * the planet by construction, and the histogram over these vertices has nothing
 * at all between 0 and 4 — a point is either on the shelf or it is at sea.
 */
const wetProbe = new Vector3();
const wet = (lon, lat) => {
  if (world.countryAt(lat, lon) === 0) return true;
  const cos = Math.cos(lat * DEG);
  wetProbe
    .set(cos * Math.cos(lon * DEG), Math.sin(lat * DEG), -cos * Math.sin(lon * DEG))
    .multiplyScalar(PLANET_RADIUS);
  return world.elevationAt(wetProbe) < SHORE_LIP;
};

const a = new Vector3();
const b = new Vector3();
const p = new Vector3();

/** Great-circle distance between two lon/lat pairs, in world units. */
function span(p0, p1) {
  riverPoint(p0[0], p0[1], a);
  riverPoint(p1[0], p1[1], b);
  return a.angleTo(b) * PLANET_RADIUS;
}

/**
 * How far a point stands off the great circle through two others, in units.
 *
 * The sine of the angle to the arc's own pole, which is exact on a sphere where
 * a planar cross-track formula would drift on a long reach — and rivers have
 * long reaches. Degenerate ends (a repeated vertex) fall back to the chord,
 * which is what a zero-length segment's error is.
 */
function offArc(p0, p1, at) {
  riverPoint(p0[0], p0[1], a);
  riverPoint(p1[0], p1[1], b);
  riverPoint(at[0], at[1], p);
  const pole = a.clone().cross(b);
  if (pole.lengthSq() < 1e-18) return a.angleTo(p) * PLANET_RADIUS;
  pole.normalize();
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, p.dot(pole))))) * PLANET_RADIUS;
}

/** Douglas-Peucker over a lon/lat polyline, iterative so a long river cannot blow the stack. */
function simplify(points, epsilon) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;
    let worst = -1;
    let where = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = offArc(points[lo], points[hi], points[i]);
      if (d > worst) {
        worst = d;
        where = i;
      }
    }
    if (worst > epsilon) {
      keep[where] = 1;
      stack.push([lo, where], [where, hi]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i] === 1) out.push(points[i]);
  return out;
}

// ---------------------------------------------------------------------------
// The bake
// ---------------------------------------------------------------------------

const geo = JSON.parse(readFileSync(SOURCE, 'utf8'));
const rivers = [];
let sourcePoints = 0;
let keptPoints = 0;
let sourceLines = 0;
let cutRuns = 0;
let shortRuns = 0;
let dropped = 0;
let collapsed = 0;
const byClass = [0, 0, 0];

for (const feature of geo.features) {
  const parts =
    feature.geometry.type === 'MultiLineString'
      ? feature.geometry.coordinates
      : feature.geometry.type === 'LineString'
        ? [feature.geometry.coordinates]
        : [];
  const scalerank = feature.properties.scalerank ?? 6;
  const cls = classForRank(scalerank);
  const lines = [];

  for (const part of parts) {
    sourceLines++;
    sourcePoints += part.length;

    /**
     * **Rounded first and tested second, and the other way round is a bug this
     * bake shipped for one afternoon.** `PRECISION` moves a coordinate by up to
     * 1.4 units, a river mouth sits on the coastline by construction, and
     * testing the source vertex and then storing the rounded one put 87 of them
     * in the sea — `pnpm check` named Amazonas, the Back and the Chilia branch
     * of the Danube. It is the roads' own lesson in a second costume: *the path
     * tested for water has to be the path that gets drawn.*
     *
     * The dedupe belongs here for the same reason. Two source vertices closer
     * than 0.01 degrees round to the same point, and a zero-length segment is a
     * `normalize(0)` in the ribbon's own tangent — but a *duplicate* also can
     * not be dropped after the split, because the two copies could straddle a
     * cut and only one of them be tested.
     */
    const source = [];
    for (const [lon, lat] of part) {
      const point = [Number(lon.toFixed(PRECISION)), Number(lat.toFixed(PRECISION))];
      const last = source[source.length - 1];
      if (last !== undefined && last[0] === point[0] && last[1] === point[1]) {
        collapsed++;
        continue;
      }
      source.push(point);
    }

    // Every run of consecutive vertices the outlines call land. A vertex over
    // the sea or inside one of the 27 lake rings ends the run it is in and does
    // not start the next, which is what makes a river stop at the coast rather
    // than be walked back to it.
    let run = [];
    const flush = () => {
      const raw = run;
      run = [];
      if (raw.length < 2) {
        if (raw.length > 0) shortRuns++;
        return;
      }
      const length = raw.reduce((total, point, i) => (i === 0 ? 0 : total + span(raw[i - 1], point)), 0);
      if (length < MIN_RUN) {
        shortRuns++;
        return;
      }
      // Douglas-Peucker keeps a *subset* of its input, so every vertex that
      // survives here is one of the rounded vertices `wet` was asked about.
      const points = simplify(raw, SIMPLIFY);
      keptPoints += points.length;
      lines.push({ digits: PRECISION, points, classes: points.map(() => cls) });
      cutRuns++;
    };
    for (const point of source) {
      if (wet(point[0], point[1])) flush();
      else run.push(point);
    }
    flush();
  }

  if (lines.length === 0) {
    dropped++;
    continue;
  }
  for (const line of lines) byClass[cls] += line.points.length;
  rivers.push({
    name: feature.properties.name_en ?? feature.properties.name ?? '',
    scalerank,
    lines,
  });
}

// ---------------------------------------------------------------------------
// Report and write
// ---------------------------------------------------------------------------

let totalLength = 0;
let segments = 0;
let longest = 0;
for (const river of rivers) {
  for (const line of river.lines) {
    for (let i = 1; i < line.points.length; i++) {
      const d = span(line.points[i - 1], line.points[i]);
      totalLength += d;
      segments++;
      if (d > longest) longest = d;
    }
  }
}
const lineCount = rivers.reduce((n, river) => n + river.lines.length, 0);
const stamp = dataStamp(outlines, lakeBytes);
const packed = gzipSync(encodeRivers(stamp, rivers), { level: 9 });

console.log(
  `${geo.features.length} features, ${sourceLines} polylines, ${sourcePoints.toLocaleString()} points in`,
);
console.log(
  `  ${dropped} features had nothing on land, ${shortRuns} runs under ${MIN_RUN} units dropped, ` +
    `${collapsed} vertices collapsed by the rounding`,
);
console.log(
  `${rivers.length} rivers, ${lineCount} polylines, ${keptPoints.toLocaleString()} vertices out ` +
    `(Douglas-Peucker at ${SIMPLIFY} units)`,
);
console.log(
  `  mean spacing ${(totalLength / segments).toFixed(0)} u, longest segment ${longest.toFixed(0)} u, ` +
    `${Math.round((totalLength / PLANET_RADIUS) * 6371).toLocaleString()} km of river`,
);
console.log(
  `  width classes: great ${byClass[2].toLocaleString()} · river ${byClass[1].toLocaleString()} · ` +
    `brook ${byClass[0].toLocaleString()} vertices`,
);
console.log(`  stamp ${stamp} (countries.bin + lakes.bin)`);

if (dry) {
  console.log(`\n--dry: nothing written (${(packed.length / 1024).toFixed(1)} KB gzipped)`);
} else {
  /**
   * The round trip is proved before a byte is written, exactly as the outlines'
   * and the lakes' bakes prove their own. A coordinate that came back a
   * millionth of a degree out would look identical on screen and would move a
   * river off the ground `pnpm check` walks it on.
   */
  const back = decodeRivers(await inflate(packed));
  const mine = rivers.flatMap((river, r) =>
    river.lines.map((line) => ({ river: r, points: line.points, classes: line.classes })),
  );
  const theirs = back.lines.map((line) => ({
    river: line.river,
    points: line.points,
    classes: [...line.classes],
  }));
  if (
    back.stamp !== stamp ||
    JSON.stringify(back.rivers) !== JSON.stringify(rivers.map((r) => ({ name: r.name, scalerank: r.scalerank }))) ||
    JSON.stringify(theirs) !== JSON.stringify(mine)
  ) {
    throw new Error('rivers.bin does not decode back to what was baked');
  }
  writeFileSync(OUT, packed);
  rmSync(resolve(here, '../public/data/rivers.json'), { force: true });
  console.log(`\nwrote ${OUT} (${(packed.length / 1024).toFixed(1)} KB gzipped)`);
}
