/**
 * Sanity check for the baked world and the land mesh, with no browser.
 *
 * This exists because the errors this project has actually shipped were data
 * errors, not rendering ones: New York reporting "China", Western Sahara being
 * unreachable, Ibiza silently not existing. All of them are invisible in a
 * screenshot and obvious in a table. Run it after `pnpm data` or after touching
 * `geo.ts` or `globe.ts`.
 *
 *   node scripts/check-world.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Color, Vector3 } from 'three';
import { loadWorld, toLatLon } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, LAND_HEIGHT, buildLand, coastEdges, groundColorAt, groundRadius } from '../src/globe.ts';
import { createOcean, oceanLimits } from '../src/ocean.ts';
import { OCEAN_COLOR } from '../src/theme.ts';
import { MAX_RELIEF, SHORE_LIP, flattenWeightAt, reliefAt, setDetailSites, setFlattenSites } from '../src/terrain.ts';
import {
  BIGGEST_SETTLEMENT,
  PROMINENCE_CAP,
  PROMINENCE_RADIUS,
  PROMINENCE_RATIO,
  SMALLEST_SETTLEMENT,
  detailRadiusFor,
  indexPlaces,
  isShown,
  labelRadiusFor,
  prominenceField,
  radiusFor,
} from '../src/places.ts';
import type { Place } from '../src/places.ts';
import { decodeCountries, decodeLakes, decodePlaces, decodeRoads, encodeCountries, encodeLakes, encodePlaces, encodeRoads, inflate } from '../src/pack.ts';
import {
  CROWN_FALL,
  MAX_ROAD_LENGTH,
  RIBBON_LIFT,
  ROAD_CLASSES,
  TOWN_STANDOFF,
  bendFor,
  builtGraph,
  classOf,
  crossesScree,
  pairKey,
  placeDirection,
  roadClip,
  roadPoint,
  roadPole,
  roadSpan,
  createRoads,
} from '../src/roads.ts';
import { biomeAt, biomeSample } from '../src/biome.ts';
// The floor's own vertical section, from the file that lays it: the check has
// to measure the mesh against the number `settlements.ts` uses and not against
// a copy of it. `scenery/ground.ts` is Node-safe; `settlements.ts` is not,
// because it reaches the kit through an `import.meta.glob` registry.
import { APRON_SINK, GROUND_LIFT, KERB_BLEND, KERB_DROP, MAX_CUT, TERRACE_STEP, cellKey, floorLiftAt } from '../src/scenery/ground.ts';
import { allZoneNames, clockAt, zoneFor } from '../src/timezone.ts';
import { createBorders } from '../src/borders.ts';
import { verifyFlagLayer } from '../src/land-flags.ts';
import { Mesh } from 'three';

const here = dirname(fileURLToPath(import.meta.url));
const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
// `loadWorld` fetches; in Node it reads the baked file straight off disk. It is
// gzipped binary now — see `src/pack.ts` — and the decoder is shared, so what
// this file checks is what the browser will parse.
// The lakes are a second file and the stub has to know which one is being
// asked for. It used to answer every URL with the outlines, which was fine
// while there was one; handing `decodeLakes` the outlines throws on the magic
// rather than misreading them, which is the whole reason the format carries it.
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

const DEG = Math.PI / 180;
const at = (lat: number, lon: number): Vector3 =>
  new Vector3(
    Math.cos(lat * DEG) * Math.cos(lon * DEG),
    Math.sin(lat * DEG),
    -Math.cos(lat * DEG) * Math.sin(lon * DEG),
  ).multiplyScalar(PLANET_RADIUS);

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const monumentsPath = resolve(here, '../public/data/monuments.json');
const placed: {
  id: string;
  iso: string;
  lat: number;
  lon: number;
  footprint?: number;
  clearance?: number;
}[] = existsSync(monumentsPath)
  ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: typeof placed }).monuments
  : [];
// The mesh here has to be the mesh the game builds, and the flat pads under the
// monuments are part of the relief. They go in before the world exists.
setFlattenSites(placed);

// The settlements ask the mesh for resolution, not for level ground; see
// `setDetailSites`. Same one-shot contract, and it has to run before the world.
const placesPath = resolve(here, '../public/data/places.bin');
const placesRaw: Place[] = existsSync(placesPath)
  ? decodePlaces(await inflate(readFileSync(placesPath)))
  : [];
setDetailSites(placesRaw.map((p) => ({ lat: p.lat, lon: p.lon, radius: detailRadiusFor(p.pop) })));

const loadStart = Date.now();
const lakeRings = decodeLakes(await inflate(lakes));
const world = await loadWorld(UNITS_PER_DEGREE, lakeRings);
const loadMs = Date.now() - loadStart;
console.log(
  `world: ${world.countries.length} countries, ${world.rings.length} rings, ` +
  `${world.rings.reduce((n, r) => n + r.points.length, 0).toLocaleString()} points, ${loadMs} ms\n`,
);

/**
 * The wire format, checked three ways.
 *
 * The first load used to be 1.2 MB of JSON before a triangle was drawn and it is
 * binary now — see `src/pack.ts`. Two things could go wrong with that and
 * neither would look like anything: a coordinate could come back a fraction out,
 * which moves `countryAt` on a coastline and nowhere else, and a file could be
 * *stale*, baked by an older encoder than the one the browser will read it with.
 *
 * So: the bytes are re-encoded from what came out of them and compared, which
 * is what says the file is what this code would bake today; every number is
 * asserted to survive its own `toFixed`, which is what says nothing was
 * quantised away; and the shipped sizes are printed, because a format that
 * silently grows back is the failure this whole change exists to prevent. The
 * comparison is on the *uncompressed* encoding on purpose — gzip's output is a
 * fact about zlib's version and not about the format.
 */
console.log('the wire');
{
  const files: [string, number][] = [];
  const shipped = (name: string): Uint8Array => {
    const bytes = readFileSync(resolve(here, '../public/data', name));
    files.push([name, bytes.length]);
    return bytes;
  };

  const countryBytes = await inflate(shipped('countries.bin'));
  const placeBytes = await inflate(shipped('places.bin'));
  const roadBytes = await inflate(shipped('roads.bin'));
  // The three `.bin` files are gzipped by the bake, so their size on disk is
  // their size on the wire. `monuments.json` is not: it is 11 KB of JSON a human
  // edits, and a CDN compresses `application/json` on its own.
  files.push(['monuments.json', gzipSync(readFileSync(monumentsPath), { level: 9 }).length]);

  // The rings that come back out carry no `digits`, so the re-encode has to
  // recover the bake's own choice — and the way to recover it is the way the
  // whole precision claim is stated: a 2-decimal ring is one whose every
  // coordinate is already exact at 2 decimals.
  const repacked = encodeCountries(
    world.countries.map((country) => ({
      ...country,
      rings: country.rings.map((points) => ({
        digits: points.every((p) => Number(p[0]!.toFixed(2)) === p[0]! && Number(p[1]!.toFixed(2)) === p[1]!)
          ? 2
          : 3,
        points,
      })),
    })),
  );
  check(
    Buffer.compare(Buffer.from(repacked), countryBytes) === 0,
    'countries.bin is what this encoder bakes',
    `${repacked.length} against ${countryBytes.length} bytes`,
  );
  const placesAgain = encodePlaces(placesRaw);
  check(
    Buffer.compare(Buffer.from(placesAgain), placeBytes) === 0,
    'places.bin is what this encoder bakes',
    `${placesAgain.length} against ${placeBytes.length} bytes`,
  );
  const bakedRoads = decodeRoads(roadBytes);
  const roadsAgain = encodeRoads(bakedRoads.places, bakedRoads.graph, bakedRoads.roads);
  check(
    Buffer.compare(Buffer.from(roadsAgain), roadBytes) === 0,
    'roads.bin is what this encoder bakes',
    `${roadsAgain.length} against ${roadBytes.length} bytes`,
  );

  // Nothing was quantised away. A value that did not survive the round trip
  // comes back as 66.51999999999999, so asking it to reproduce its own decimal
  // string is the whole test and it needs no copy of the original file.
  let coarse = 0;
  for (const country of world.countries) {
    for (const ring of country.rings) {
      for (const point of ring) {
        if (Number(point[0]!.toFixed(3)) !== point[0]! || Number(point[1]!.toFixed(3)) !== point[1]!) coarse++;
      }
    }
  }
  const outlinePoints = world.rings.reduce((n, r) => n + r.points.length, 0);
  check(coarse === 0, `all ${outlinePoints.toLocaleString()} outline points are exact at their own precision`, `${coarse} moved`);

  let placeDrift = 0;
  for (const place of placesRaw) {
    if (Number(place.lat.toFixed(3)) !== place.lat || Number(place.lon.toFixed(3)) !== place.lon) placeDrift++;
    if (!Number.isInteger(place.pop)) placeDrift++;
    if (place.snappedKm !== undefined && Number(place.snappedKm.toFixed(1)) !== place.snappedKm) placeDrift++;
  }
  check(placeDrift === 0, `all ${placesRaw.length.toLocaleString()} places are exact at their own precision`, `${placeDrift} moved`);

  let bendDrift = 0;
  for (const road of bakedRoads.roads) {
    if (Number(road.bend.toFixed(4)) !== road.bend) bendDrift++;
  }
  check(bendDrift === 0, `all ${bakedRoads.roads.length.toLocaleString()} bows are exact at four decimals`, `${bendDrift} moved`);

  const total = files.reduce((n, [, bytes]) => n + bytes, 0);
  console.log(
    `  first load: ${files.map(([name, bytes]) => `${name.replace(/\..*/, '')} ${Math.round(bytes / 1000)}`).join(' · ')}` +
    ` = ${Math.round(total / 1000)} KB gzipped`,
  );

  // What the format costs to read, which is the other half of what it saves.
  // Timed warm, the same way everything else here is: the first pass is the
  // JIT and the buffers, not the decode.
  const time = async (label: string, run: () => Promise<unknown> | unknown): Promise<string> => {
    for (let k = 0; k < 2; k++) await run();
    const began = performance.now();
    for (let k = 0; k < 3; k++) await run();
    return `${label} ${((performance.now() - began) / 3).toFixed(1)}`;
  };
  const raw = [readFileSync(resolve(here, '../public/data/countries.bin')),
               readFileSync(resolve(here, '../public/data/places.bin')),
               readFileSync(resolve(here, '../public/data/roads.bin'))];
  console.log(
    `  decode: ${[
      await time('countries', async () => decodeCountries(await inflate(raw[0]!))),
      await time('places', async () => decodePlaces(await inflate(raw[1]!))),
      await time('roads', async () => decodeRoads(await inflate(raw[2]!))),
    ].join(' · ')} ms`,
  );
}

/**
 * Places that have to resolve correctly. The coastal ones are the point: at
 * 1:110m New York fell in the sea, and every monument worth placing is on a
 * coast or a river.
 */
/**
 * The planet must be right-handed, like the Earth.
 *
 * `x = cos(lat)cos(lon), y = sin(lat), z = -cos(lat)sin(lon)`. The negative z is
 * the whole point: with `+sin(lon)` the frame comes out **left-handed** and the
 * globe is a mirror image — north and south right, east and west swapped. It is
 * self-consistent, so every lookup still agrees and nothing on the ground can
 * tell; it only shows from the air, which is why it survived to 65 monuments.
 *
 * Fifteen places in this repo convert between lat/lon and xyz and none of them
 * share a helper, so this asserts the property rather than the formula: build a
 * local frame the way the world does and check that east crosses north into up.
 */
const eastAt = (lat: number, lon: number) => at(lat, lon + 0.01).sub(at(lat, lon)).normalize();
const northAt = (lat: number, lon: number) => at(lat + 0.01, lon).sub(at(lat, lon)).normalize();
let wrongHanded = 0;
for (const [lat, lon] of [[0, 0], [40, -3], [-33, 151], [60, 120], [-20, -60]] as [number, number][]) {
  const up = at(lat, lon).normalize();
  if (eastAt(lat, lon).cross(northAt(lat, lon)).dot(up) < 0.99) wrongHanded++;
}
check(wrongHanded === 0, 'the planet is right-handed, like the Earth');

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
  // At 1:50m the "Western Sahara" feature is only the Free Zone east of the
  // Moroccan berm; the strip Morocco administers is inside Morocco's own
  // polygon. Both points below are therefore correct, and the pair is what
  // proves the smallest-ring rule still resolves the overlap.
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

// `iso` is what flags, monuments and anything else keyed by country look up.
// A duplicate silently resolves to whichever came first.
const isoSeen = new Map<string, string>();
const collisions: string[] = [];
for (const country of world.countries) {
  const previous = isoSeen.get(country.iso);
  if (previous !== undefined) collisions.push(`${country.iso}: ${previous} / ${country.name}`);
  else isoSeen.set(country.iso, country.name);
}
check(collisions.length === 0, 'country codes are unique', collisions.join('; '));

console.log('\nmesh');
const buildStart = Date.now();
const land = buildLand(world);
const buildMs = Date.now() - buildStart;
const sea = createOcean(world);

const position = land.geometry.getAttribute('position');
const normal = land.geometry.getAttribute('normal');
const triangles = position.count / 3;
const bytes = position.array.byteLength + normal.array.byteLength +
  land.geometry.getAttribute('color').array.byteLength;
console.log(
  `  ${triangles.toLocaleString()} land triangles + ` +
  `${sea.stats.sphereFaces.toLocaleString()} water + ` +
  `${(sea.stats.triangles - sea.stats.sphereFaces).toLocaleString()} shallows, ` +
  // MiB, which is what `atlas.stats`, `ocean.stats` and every MB in the docs
  // mean. This line used to divide by 1e6 and read 5% high against all of them.
  `${(bytes / 1048576).toFixed(1)} MB, built in ${buildMs} ms`,
);

// Every vertex has to sit between the foot of the cliff and the highest
// plateau. Anything outside that means a projection went wrong.
let radiusMin = Infinity;
let radiusMax = -Infinity;
let notFinite = 0;
const v = new Vector3();
for (let i = 0; i < position.count; i++) {
  v.fromBufferAttribute(position, i);
  const r = v.length();
  if (!Number.isFinite(r)) notFinite++;
  else {
    radiusMin = Math.min(radiusMin, r);
    radiusMax = Math.max(radiusMax, r);
  }
}
check(notFinite === 0, 'all vertices finite', notFinite ? `${notFinite} NaN` : '');
// The ceiling is provable rather than measured: `reliefAt` clamps to
// MAX_RELIEF, so no vertex can be higher than the tallest shelf plus that.
check(
  radiusMin > PLANET_RADIUS - 60 &&
    radiusMax <= PLANET_RADIUS + LAND_HEIGHT + MAX_RELIEF + 0.5,
  'vertices within sea floor and the highest possible peak',
  `${radiusMin.toFixed(1)} .. ${radiusMax.toFixed(1)} (ceiling ${(PLANET_RADIUS + LAND_HEIGHT + MAX_RELIEF + 0.5).toFixed(1)})`,
);

// A triangle whose normal points into the planet is a ring wound the wrong way:
// its cliff faces inland and is invisible from the sea.
let inward = 0;
const n = new Vector3();
for (let t = 0; t < triangles; t++) {
  v.fromBufferAttribute(position, t * 3);
  n.fromBufferAttribute(normal, t * 3);
  if (n.dot(v.normalize()) < -0.35) inward++;
}
check(inward === 0, 'no triangle faces inward', inward ? `${inward} of ${triangles}` : '');

// The cliffs are what the test above cannot see. A vertical wall's normal is
// perpendicular to the radius whichever way it points, so its radial dot sits
// at ~0, comfortably inside the band. This asks the outlines instead: step off
// a wall along its own normal and you should end up in the water. That is
// point-in-polygon, not ring winding, so it does not agree with the mesh by
// construction — which is the whole point, since a coast wound backwards
// builds every cliff facing inland, where it is invisible.
//
// **A wall is a triangle that crosses the waterline, and it used to be a
// triangle that stood up.** Both defined the same set while the coast was a
// vertical `LAND_HEIGHT` step and nothing else in the mesh was steep. The shore
// ramp broke that: the ear clipper leaves collinear slivers along every
// coastline, a hundred units long, and once the coastal band has a gradient
// under them their middle vertex sits half a unit off the chord of the other
// two — which is a fin, invisible on screen at a fifteenth of an avatar, and
// legitimately near-vertical. 4,791 of them arrived in one change and every one
// was counted as a wall facing the wrong way. Crossing sea level is what a
// coastal skirt does and what nothing else in this mesh does: the ground never
// goes below `SHORE_LIP` and the skirt runs from there to `EMBED`.
const CLIFF_STEP = 8; // ~0.03 deg: wider than the baked outline spacing
const centroid = new Vector3();
const probe = new Vector3();
const cb = new Vector3();
const cc = new Vector3();
let walls = 0;
let seaward = 0;
let inland = 0;
for (let t = 0; t < triangles; t++) {
  n.fromBufferAttribute(normal, t * 3);
  v.fromBufferAttribute(position, t * 3);
  cb.fromBufferAttribute(position, t * 3 + 1);
  cc.fromBufferAttribute(position, t * 3 + 2);
  const high = Math.max(v.length(), cb.length(), cc.length());
  const low = Math.min(v.length(), cb.length(), cc.length());
  if (high <= PLANET_RADIUS || low >= PLANET_RADIUS) continue;
  centroid.copy(v).add(cb).add(cc).divideScalar(3);
  walls++;
  const ahead = toLatLon(probe.copy(centroid).addScaledVector(n, CLIFF_STEP));
  const behind = toLatLon(probe.copy(centroid).addScaledVector(n, -CLIFF_STEP));
  const wet = world.countryAt(ahead.lat, ahead.lon) === 0;
  const dry = world.countryAt(behind.lat, behind.lon) !== 0;
  // Land on both sides is a headland or a strait narrower than the step, and
  // water on both sides is a spit. Neither says anything either way.
  if (wet && dry) seaward++;
  else if (!wet && !dry) inland++;
}
// Not all of them, and it cannot be: the probe is 8 units long, so anywhere the
// land or the channel beside it is thinner than that — the Chilean fjords, the
// Canadian archipelago, the Amazon delta, the Croatian coast — both steps land
// on the wrong side of something. That is about 0.3% of the walls, and it is
// resolution, not winding. A ring wound backwards fails this by three orders of
// magnitude, not by a fraction of a percent, so the ratio is what is asserted.
check(
  seaward > inland * 100,
  'the coastal cliffs face the sea',
  `${seaward.toLocaleString()} seaward, ${inland.toLocaleString()} inland, of ${walls.toLocaleString()} walls`,
);

/**
 * `groundColorAt` and the mesh have to be the same law.
 *
 * They are two entry points on purpose — the mesh knows which ring it is
 * filling and cannot afford a point-in-polygon query per triangle, a caller
 * laying paving on top of it does not know and can — so this checks the thing
 * that arrangement is worth nothing without: that they agree.
 *
 * It is a ratio and not a zero, and the residue is measured and understood.
 * Sampling 14,340 triangle tops, 386 differ by more than a rounding error and
 * they are three things, none of them the law:
 *
 * - **210 have a centroid the outlines call sea.** A triangle at the coast is
 *   built from a ring but its centre of mass in three dimensions can fall
 *   outside the polygon it came from, and `groundColorAt` then has no country
 *   to tint with. They are excluded here and the fallback is documented there.
 * - **64 straddle a biome boundary**, so the centre is in one biome and the
 *   corners are in two. The mesh averages the relief of a triangle and the
 *   lookup samples a point; where those land either side of a threshold the two
 *   pick different biomes, which is resolution and not disagreement.
 * - **112 differ by 0.05 to 0.10 of 3.0**, which is the moisture noise sampled
 *   a hair apart — the mesh averages unit vectors, this averages raised ones.
 *
 * What it is really guarding is the systematic failure: drop the country tint
 * and every triangle moves by about 0.41, which fails this by thirty times over.
 */
{
  const meshColor = new Color();
  const askedColor = new Color();
  const centre = new Vector3();
  const cb = new Vector3();
  const cc = new Vector3();
  const color = (land as Mesh).geometry.getAttribute('color');
  let compared = 0;
  let apart = 0;
  let worst = 0;
  for (let t = 0; t < triangles; t += 37) {
    n.fromBufferAttribute(normal, t * 3);
    v.fromBufferAttribute(position, t * 3);
    cb.fromBufferAttribute(position, t * 3 + 1);
    cc.fromBufferAttribute(position, t * 3 + 2);
    // Tops only: a cliff is the same colour times 0.72 and asking about a point
    // on a vertical wall is asking which side of the coast it is on.
    if (Math.abs(n.dot(centre.copy(v).normalize())) < 0.5) continue;
    centre.copy(v).add(cb).add(cc).divideScalar(3);
    // Outside the function's domain; see the note above.
    if (world.countryAtPoint(centre) === 0) continue;
    meshColor.fromBufferAttribute(color, t * 3);
    groundColorAt(world, centre, askedColor);
    const off =
      Math.abs(meshColor.r - askedColor.r) +
      Math.abs(meshColor.g - askedColor.g) +
      Math.abs(meshColor.b - askedColor.b);
    compared++;
    if (off > 0.15) apart++;
    if (off > worst) worst = off;
  }
  check(
    apart < compared * 0.01,
    'groundColorAt agrees with the colour the mesh painted',
    `${apart} of ${compared.toLocaleString()} apart, worst ${worst.toFixed(3)}`,
  );
}

/**
 * The mesh under a settlement has to meet the paving laid on it.
 *
 * A settlement lays its floor from `elevationAt`, the exact relief; the land
 * around it is a triangulation of that relief carrying up to `RELIEF_SAG` of
 * error. Where the two disagree by more than the floor's own lift, a triangle
 * edge draws a straight line across the paving — and in flat country a whole
 * town fits inside one triangle, so the sign is constant and the seam is a
 * clean line rather than noise. About one town in twelve showed it.
 *
 * `setDetailSites` is the fix and this is what proves it: the error measured
 * where it matters, at the centre of every land triangle that falls inside a
 * settlement, against the `GROUND_LIFT` the floor is raised by. Measured with
 * the call removed and put back, same mesh, same sample:
 *
 * |  | triangles in towns | over the lift |
 * |---|---|---|
 * | without | 18,408 | **5,741 — 31.2%** |
 * | with | 41,830 | **777 — 1.9%** |
 *
 * The worst case does not move (9.90 units, at Vaduz) and that is the honest
 * limit: `PAD_MIN_EDGE` stops the refinement at about 7.4 units of edge, and on
 * an Alpine slope the ground moves further than the budget inside one triangle
 * however fine it gets. Seventeen times fewer seams, not none.
 */
{
  const townIndex = indexPlaces(placesRaw as never, PLANET_RADIUS);
  const centre = new Vector3();
  const tb = new Vector3();
  const tc = new Vector3();
  const unit = new Vector3();
  let inTown = 0;
  let over = 0;
  let under = 0;
  let worstError = 0;
  let where = '';
  for (let t = 0; t < triangles; t++) {
    n.fromBufferAttribute(normal, t * 3);
    v.fromBufferAttribute(position, t * 3);
    tb.fromBufferAttribute(position, t * 3 + 1);
    tc.fromBufferAttribute(position, t * 3 + 2);
    if (Math.abs(n.dot(unit.copy(v).normalize())) < 0.5) continue;
    centre.copy(v).add(tb).add(tc).divideScalar(3);
    const near = townIndex.nearest(centre);
    if (!near.inside) continue;
    // A triangle built from one ring whose centre of mass falls outside it —
    // 1.5% of them at a coast — has a shelf the lookup cannot see, and the
    // difference is then `LAND_HEIGHT` and not mesh error. Same exclusion as
    // the colour check above, same reason.
    if (world.countryAtPoint(centre) === 0) continue;
    inTown++;
    // The mesh at the centroid is the mean of its corners; the relief there is
    // what the paving follows. Their difference is the gap the floor has to
    // clear, and it is measured rather than derived from the sag budget, which
    // only ever bounded edge midpoints.
    unit.copy(centre).normalize().multiplyScalar(PLANET_RADIUS);
    const meshHeight = (v.length() + tb.length() + tc.length()) / 3 - PLANET_RADIUS;
    // **Signed, because the two signs are two different pictures now.** The
    // mesh standing *over* the paving is the seam — a straight line drawn
    // across a town — and the lift is what has to clear it. The mesh running
    // *under* it is the plinth floating, and what covers that is the kerb's own
    // face plus the apron below it, so it is measured against a different
    // number and it was invisible in the old absolute value.
    const error = meshHeight - world.elevationAt(unit);
    if (error > GROUND_LIFT) over++;
    if (-error > GROUND_LIFT + KERB_DROP + APRON_SINK) under++;
    if (Math.abs(error) > worstError) {
      worstError = Math.abs(error);
      where = near.place.name;
    }
  }
  check(
    over < inTown * 0.02,
    'the mesh under a settlement meets the paving on it',
    `${over} of ${inTown.toLocaleString()} triangles over the ${GROUND_LIFT} lift ` +
      `(${((over / inTown) * 100).toFixed(2)}%), worst |error| ${worstError.toFixed(2)} at ${where}`,
  );
  check(
    under < inTown * 0.005,
    'the kerb and the apron reach the ground under a floating floor',
    `${under} of ${inTown.toLocaleString()} triangles more than ` +
      `${(GROUND_LIFT + KERB_DROP + APRON_SINK).toFixed(1)} below the paving`,
  );
}

/**
 * The lowest ground on the planet is the shore lip, and three other numbers are
 * standing on that.
 *
 * It used to be the shallowest ring's shelf — `heightForArea` gave a small
 * island a low one and the smallest came out at 4.32 — and the ramp replaced
 * that rule with one that reaches every coast, so the lowest ground is now the
 * same number everywhere and it is worth asserting outright. Below it are
 * `OCEAN_SAG`, which is how far the inscribed ocean's faces dip under sea level
 * and therefore how deep the water can close over a shore; `SEA_LEVEL_EPSILON`
 * in `vehicles.ts` (0.5), which is what stops the boat and what puts the player
 * in it; and `RELIEF_SAG`, which is how far the mesh may sit from the ground it
 * draws. A shore that dipped under any of them is a coast the world cannot tell
 * from water.
 *
 * Measured off the mesh rather than off `terrain.ts`, and excluding the wall
 * bases at `EMBED`: a constant that disagreed with the one the ramp is built
 * against would show up here as ground under the sea, which is exactly what
 * `LAND_SHELF` being wrong in `terrain.ts` would produce.
 */
const oceanSag = sea.stats.sag;
let lowestGround = Infinity;
for (let i = 0; i < position.count; i++) {
  const radius = v.fromBufferAttribute(position, i).length() - PLANET_RADIUS;
  if (radius > -1 && radius < lowestGround) lowestGround = radius;
}
check(
  Math.abs(lowestGround - SHORE_LIP) < 0.01 && oceanSag < SHORE_LIP * 0.5,
  'the shore comes down to the lip and no further',
  `lowest ground ${lowestGround.toFixed(2)} vs lip ${SHORE_LIP}, ocean sag ${oceanSag.toFixed(2)}`,
);

/**
 * The sea, and the three things it is not allowed to do.
 *
 * `src/ocean.ts` lays a ribbon of shallows along every coastline in the world,
 * floating a little over the water sphere, and every one of these is a way that
 * ribbon could silently break something the sea is load-bearing for.
 *
 * - **It must not rise over the beach.** The shore comes down to `SHORE_LIP`,
 *   four units, and that step is what `vehicles.ts` stops the boat against; a
 *   sheet of water drawn above it would show the sea lying on land the player
 *   can walk on.
 * - **It must not sink into the sphere it is laid on.** A quad spanning the
 *   ribbon's widest band dips `bandSag` below the line between its rows, and the
 *   sphere's vertices are at exactly `PLANET_RADIUS`, so a lift under that is a
 *   ribbon with water poking through it.
 * - **It must not displace the water.** Nothing here moves the surface, up or
 *   down, so the ocean sag above is spent on nothing — see `SHALLOW_ROWS` in
 *   `ocean.ts` for the arithmetic that decided waves are unaffordable in this
 *   style rather than merely expensive. Asserting the ribbon's own floor is at
 *   or above sea level is what keeps that true.
 */
let shallowLow = Infinity;
let shallowHigh = -Infinity;
let shallowVertices = 0;
for (const object of sea.group.children) {
  if ((object as Mesh).name !== 'shallows') continue;
  const at = (object as Mesh).geometry.getAttribute('position');
  for (let i = 0; i < at.count; i++) {
    const radius = v.fromBufferAttribute(at, i).length() - PLANET_RADIUS;
    if (radius < shallowLow) shallowLow = radius;
    if (radius > shallowHigh) shallowHigh = radius;
    shallowVertices++;
  }
}
const seaLimits = oceanLimits(sea.stats.rows);
check(
  shallowLow >= 0 && shallowHigh < SHORE_LIP && seaLimits.liftShelf > seaLimits.quadSag * 1.4,
  'the shallows float over the water and under the beach',
  `${shallowLow.toFixed(2)} to ${shallowHigh.toFixed(2)} against lip ${SHORE_LIP}, ` +
  `quad sag ${seaLimits.quadSag.toFixed(2)} against outer lift ${seaLimits.liftShelf}, ` +
  `built at detail ${sea.stats.builtAt} — reach ${sea.stats.shelfReach}, ` +
  `rows [${sea.stats.rows.join(', ')}], tolerance ${sea.stats.tolerance}`,
);

/**
 * A ring boundary is not a coastline, and the surf must know the difference.
 *
 * The rings are *country* outlines: 41% of their edges are land frontiers, and
 * a surf line down the Rhine is the same bug as a trench down it. Three things
 * used to ask this question separately and each paid 366 ms of point-in-polygon
 * for it; `coastEdges` in `globe.ts` is the one answer, so this counts what it
 * found rather than re-deriving it. The sign it depends on is asserted twice
 * over by the two checks around this one — the cliffs face the sea, and the
 * ground rises as you walk in from the water.
 */
const seaFacing = coastEdges(world);
let coastalEdges = 0;
let frontierEdges = 0;
for (const flags of seaFacing) {
  for (const flag of flags) {
    if (flag === 1) coastalEdges++;
    else frontierEdges++;
  }
}
check(
  coastalEdges > frontierEdges && coastalEdges > 50000,
  'the shallows are built on the coasts and not on the frontiers',
  `${coastalEdges.toLocaleString()} coastal edges, ${frontierEdges.toLocaleString()} frontier, ` +
  `${sea.stats.spans.toLocaleString()} spans, ${sea.stats.chunks} chunks, ` +
  `${sea.stats.mb} MB, built in ${sea.stats.buildMs} ms`,
);

/**
 * And the sea on the planet is the sea on the map.
 *
 * `minimap.ts`, `map.ts` and the HUD all paint the ocean as one flat
 * `OCEAN_COLOR`, which is right for a sheet of paper and is exactly what the
 * planet stopped being. The two have to stay recognisably the same water, so
 * the mean of the sphere's own vertex colours is compared against it: the
 * colours are *derived* from `OCEAN_COLOR` rather than picked, and this is what
 * says so after somebody re-tunes them.
 */
const mean = sea.stats.meanWater;
const flat = new Color(OCEAN_COLOR);
const drift = Math.max(
  Math.abs(mean[0]! - flat.r),
  Math.abs(mean[1]! - flat.g),
  Math.abs(mean[2]! - flat.b),
);
check(
  drift < 0.06,
  'the sea on the planet is the sea on the map',
  `mean water (${mean.map((c) => c.toFixed(3)).join(', ')}) against ` +
  `OCEAN_COLOR (${[flat.r, flat.g, flat.b].map((c) => c.toFixed(3)).join(', ')}), worst channel ${drift.toFixed(3)}; ` +
  `${sea.stats.openVertices.toLocaleString()} open vertices, median ${sea.stats.medianDepth} units from land, ` +
  `furthest ${sea.stats.furthestFromLand.toLocaleString()}`,
);

/**
 * And the ramp falls the right way.
 *
 * `terrain.ts` decides which side of a ring boundary the sea is on with
 * `cross(up, b - a)` — the same sign the cliffs are built with, and the same
 * sign the mirrored planet flipped. Get it backwards and the index fills with
 * *land borders* instead of coastlines: every frontier on the planet grows a
 * trench and every coast goes back to being a wall. Nothing else would notice,
 * for the reason the mirror survived so long — the index is only ever compared
 * with itself. So this asks a third party: walk in from the water at a spread of
 * real coasts and the ground has to *rise*.
 *
 * **A coast held by a monument's pad is not a coast this can ask about**, and
 * the tolerance that used to be here was hiding it. A pad is a level disc and a
 * deliberate override of the relief; where one reaches the water the ground is
 * flat by construction, so the sample measures `setFlattenSites` and not the
 * ramp. It showed the moment `build-monuments.ts` stopped walking St Peter's
 * 22 km onto the beach at Fiumicino: back in Rome its 75-unit pad straddles the
 * Tyrrhenian shore this list names, and the walk in came back **13.4 -> 13.4**.
 * `flattenWeightAt` is the exact question — the same weight the mesh is built
 * with — so the sample is skipped and the assertion is `rose === asked` rather
 * than `asked - 1`, which is stronger than what it replaces.
 */
{
  const step = (lat: number, lon: number, bearing: number, distance: number): [number, number] => {
    const degrees = distance / UNITS_PER_DEGREE;
    return [
      lat + degrees * Math.cos(bearing),
      lon + (degrees * Math.sin(bearing)) / Math.max(0.02, Math.cos(lat * DEG)),
    ];
  };
  // Half of the first twenty were famous coastal cities, which is exactly where
  // the monuments are, so the pad test below was throwing five of ten away.
  // The second block is coasts no monument stands on.
  const coasts: [number, number][] = [
    [36.79, -2.13], [43.35, -8.40], [20.60, -16.60], [27.00, -80.40], [-33.90, 151.25],
    [1.30, 103.85], [55.70, 12.60], [-23.00, -43.20], [35.60, 139.80], [9.90, 76.20],
    [-34.00, 18.40], [21.90, 89.50], [40.60, -73.90], [-12.05, -77.05], [37.95, 23.65],
    [30.05, 31.25], [4.05, 9.70], [-6.20, 106.85], [22.30, 114.17], [41.90, 12.50],
    [59.33, 18.07], [-38.00, -57.55], [13.10, 80.30], [45.40, 12.33], [-8.65, 115.22],
    [59.91, 10.75], [38.72, -9.14], [36.72, -4.42], [43.30, 5.37], [-34.60, -58.37],
    [-12.97, -38.50], [6.45, 3.40], [33.59, -7.62], [14.58, 120.98], [-36.85, 174.76],
    [49.28, -123.12], [31.23, 121.49], [64.15, -21.94], [-23.65, -70.40], [60.17, 24.94],
  ];
  let asked = 0;
  let rose = 0;
  let paved = 0;
  const flat: string[] = [];
  for (const [lat, lon] of coasts) {
    if (world.countryAt(lat, lon) === 0) continue;
    // The bearing of the nearest water, in ten-unit steps out to a ramp and a
    // half. A coast further away than that is not a shore this can measure.
    let edge = Infinity;
    let bearing = 0;
    for (let k = 0; k < 36; k++) {
      const angle = (k / 36) * Math.PI * 2;
      for (let d = 10; d <= 200; d += 10) {
        const [y, x] = step(lat, lon, angle, d);
        if (world.countryAt(y, x) !== 0) continue;
        if (d < edge) { edge = d; bearing = angle; }
        break;
      }
    }
    if (edge === Infinity) continue;
    // The last land before the water, and 130 units back from it: the widest a
    // ramp gets, so the second sample is on the shelf whatever this shore did.
    const wet = step(lat, lon, bearing, edge - 10);
    const dry = step(lat, lon, bearing, edge - 130);
    if (world.countryAt(wet[0], wet[1]) === 0 || world.countryAt(dry[0], dry[1]) === 0) continue;
    // A pad holds this ground level on purpose; see the note above.
    const held = [wet, dry].some(([y, x]) => {
      const p = at(y, x).normalize();
      return flattenWeightAt(p.x, p.y, p.z) > 0;
    });
    if (held) { paved++; continue; }
    asked++;
    const low = world.elevationAt(at(wet[0], wet[1]));
    const high = world.elevationAt(at(dry[0], dry[1]));
    if (high > low + 1) rose++;
    else flat.push(`${lat.toFixed(1)},${lon.toFixed(1)} ${low.toFixed(1)}->${high.toFixed(1)}`);
  }
  check(
    asked >= 8 && rose === asked,
    'the ground rises as you walk in from the water',
    `${rose} of ${asked}${paved > 0 ? `, ${paved} under a monument's pad` : ''}` +
    `${flat.length > 0 ? ` — ${flat.slice(0, 3).join(', ')}` : ''}`,
  );
}

console.log('\nelevation');
for (const [name, lat, lon] of [
  ['Madrid', 40.42, -3.70], ['Mallorca', 39.62, 2.99], ['Menorca', 39.95, 4.10],
  ['mid Atlantic', 30.0, -40.0],
] as [string, number, number][]) {
  const e = groundRadius(world, at(lat, lon)) - PLANET_RADIUS;
  console.log(`  ${name.padEnd(16)} ${e.toFixed(1)} units`);
}

/**
 * Every placed monument must still be on land, in the country it declares.
 *
 * This is a regression guard, not a re-test of the bake: `build-monuments.ts`
 * already snapped them. What it catches is the outlines moving underneath them
 * later — a change to the bake, the ring filter or `countryAt` that quietly
 * drops a landmark into the sea. Monuments are the point of the project, so a
 * silent one is the worst bug available.
 */
if (placed.length > 0) {
  console.log('\nmonuments');
  const monuments = placed;
  let wrong = 0;
  const offenders: string[] = [];
  for (const m of monuments) {
    const id = world.countryAt(m.lat, m.lon);
    const iso = id > 0 ? world.countries[id - 1]!.iso : 'SEA';
    if (iso !== m.iso) {
      wrong++;
      if (offenders.length < 5) offenders.push(`${m.id} -> ${iso}, wanted ${m.iso}`);
    }
  }
  check(
    wrong === 0,
    `all ${monuments.length} monuments on land in their own country`,
    offenders.join('; '),
  );

  /**
   * Nothing may stand inside anything else.
   *
   * `build-monuments.ts` spreads overlapping pairs apart using the footprints
   * declared in the model files — so every time a new model lands with a
   * footprint the bake has not seen, the separation it computed is stale. This
   * is what says "run `pnpm monuments` again".
   */
  const declared = new Map<string, number>();
  const modelDir = resolve(here, '../src/monuments');
  for (const file of existsSync(modelDir) ? readdirSync(modelDir) : []) {
    if (!file.endsWith('.ts') || file === 'contract.ts' || file === 'index.ts') continue;
    const text = readFileSync(resolve(modelDir, file), 'utf8');
    const id = text.match(/\bid\s*:\s*'([^']+)'/)?.[1];
    const footprint = text.match(/\bfootprint\s*:\s*([\d.]+)/)?.[1];
    if (id !== undefined && footprint !== undefined) declared.set(id, Number(footprint));
  }
  const overlaps: string[] = [];
  for (let i = 0; i < monuments.length; i++) {
    for (let j = i + 1; j < monuments.length; j++) {
      const a = monuments[i]!;
      const b = monuments[j]!;
      const gap = at(a.lat, a.lon).angleTo(at(b.lat, b.lon)) * PLANET_RADIUS;
      const need = (declared.get(a.id) ?? 55) + (declared.get(b.id) ?? 55);
      if (gap < need) overlaps.push(`${a.id}/${b.id} ${gap.toFixed(0)} < ${need.toFixed(0)}`);
    }
  }
  check(
    overlaps.length === 0,
    'no two monuments stand inside each other',
    overlaps.length > 0 ? `${overlaps.slice(0, 4).join('; ')} — run \`pnpm monuments\`` : '',
  );

  /**
   * `monuments.json` must carry the footprint the model actually declares.
   *
   * It is the number `terrain.ts` cuts the pad with and the number the bake
   * separated and seated by, so a model whose footprint changed after the last
   * bake is a monument standing on a pad built for a different building.
   */
  const wrongFootprint: string[] = [];
  for (const m of monuments) {
    const want = declared.get(m.id) ?? 55;
    if (Math.abs((m.footprint ?? 55) - want) > 1e-6) {
      wrongFootprint.push(`${m.id} ${m.footprint ?? 'absent'} vs ${want}`);
    }
  }
  check(
    wrongFootprint.length === 0,
    'every placement carries its model\'s footprint',
    wrongFootprint.length > 0 ? `${wrongFootprint.slice(0, 4).join('; ')} — run \`pnpm monuments\`` : '',
  );

  /**
   * The ground under a monument has to be level, and level at its anchor.
   *
   * `placement.ts` asks `groundRadius` once, at the centre, and stands the whole
   * model on that one number, so every unit the terrain moves under the
   * footprint is a unit of the model buried or floating. `terrain.ts` answers
   * that with a flat pad — and this is what says the pad is *where the monument
   * is*. It is worth an assertion of its own because the failure is silent from
   * every direction the code can be read: `setFlattenSites` built its site
   * vectors with `z = +cos(lat)sin(lon)`, the mirror of the world's, and since
   * the pads are only ever compared with each other, all 65 landed at longitude
   * `-lon` and every check still passed. Measured over the 65 footprints, that
   * left up to 86.5 units of hillside crossing a model; it is 0.0 with the sign
   * the right way round.
   *
   * Samples over a different shelf are skipped: that is the coastline, which is
   * the assertion below and not something a pad can fix.
   */
  const stepFrom = (lat: number, lon: number, distance: number, bearing: number): [number, number] => {
    const degrees = distance / UNITS_PER_DEGREE;
    const y = Math.max(-89.99, Math.min(89.99, lat + degrees * Math.cos(bearing)));
    const x = ((lon + (degrees * Math.sin(bearing)) / Math.max(0.02, Math.cos(lat * DEG)) + 540) % 360) - 180;
    return [y, x];
  };
  // `elevationAt` is the shelf plus the relief and will not hand back either
  // half, so the relief comes off again — normalised exactly the way `geo.ts`
  // normalises it, or the two evaluations differ in their last bits.
  const shelfAt = (lat: number, lon: number): number => {
    if (world.countryAt(lat, lon) === 0) return 0;
    const p = at(lat, lon);
    const length = Math.hypot(p.x, p.y, p.z) || 1;
    return world.elevationAt(p) - reliefAt(p.x / length, p.y / length, p.z / length);
  };
  /** A step smaller than this is not a step; the avatar is 6.8 units tall. */
  const SHELF_TOLERANCE = 0.5;
  const PROBE_BEARINGS = 24;

  let worstTilt = 0;
  let tiltedAt = '';
  for (const m of monuments) {
    const footprint = m.footprint ?? 55;
    const level = world.elevationAt(at(m.lat, m.lon));
    const shelf = shelfAt(m.lat, m.lon);
    for (const radius of [footprint * 0.5, footprint]) {
      for (let k = 0; k < PROBE_BEARINGS; k++) {
        const [y, x] = stepFrom(m.lat, m.lon, radius, (k / PROBE_BEARINGS) * Math.PI * 2);
        if (Math.abs(shelfAt(y, x) - shelf) > SHELF_TOLERANCE) continue;
        const tilt = Math.abs(world.elevationAt(at(y, x)) - level);
        if (tilt > worstTilt) {
          worstTilt = tilt;
          tiltedAt = m.id;
        }
      }
    }
  }
  check(
    worstTilt < 1,
    'the ground under every monument is level',
    `worst ${worstTilt.toFixed(2)} units, at ${tiltedAt}`,
  );

  /**
   * And the coastline under the ones the pads cannot help.
   *
   * `build-monuments.ts` nudges a monument inland when a short move seats it
   * completely, and records what it managed as `clearance`. This measures the
   * outlines again and fails when the two disagree — which is what a re-baked
   * coastline, a new model, or a changed footprint looks like from here.
   *
   * The scan is written out again rather than imported because the bake is a
   * script with side effects, and because a check that shared the bake's code
   * would only be asserting that a function equals itself.
   *
   * **The table under it counts one thing and reports another, and the two were
   * the same number until the coast started ramping.** "Short by 55 units" is
   * how much of the footprint radius has water under it, and it used to imply
   * the drop as well: the land was a shelf 20 units up with a vertical edge, so
   * every one of these stood three avatars over the sea whatever its deficit
   * was. It does not imply it any more. What decides how a model over water
   * *reads* is the height of its own ground above that water, and that is
   * printed here beside the deficit because it is the number a screenshot
   * shows — measured, over the twelve, 4.1 to **21.0** units before
   * `SHORE_CEILING` and 4.0 for every one of them after.
   */
  const SEAT_STEP = 4;
  const clearanceAt = (lat: number, lon: number, limit: number): number => {
    const shelf = shelfAt(lat, lon);
    for (let radius = SEAT_STEP; radius <= limit; radius += SEAT_STEP) {
      for (let k = 0; k < PROBE_BEARINGS; k++) {
        const [y, x] = stepFrom(lat, lon, radius, (k / PROBE_BEARINGS) * Math.PI * 2);
        if (Math.abs(shelfAt(y, x) - shelf) > SHELF_TOLERANCE) return radius - SEAT_STEP;
      }
    }
    return limit;
  };
  /** Share of a footprint disc with water under it, and its ground height. */
  const overWater = (lat: number, lon: number, footprint: number): { wet: number; over: number } => {
    let wet = 0;
    let total = 0;
    for (let r = 1; r <= 8; r++) {
      for (let k = 0; k < PROBE_BEARINGS * 2; k++) {
        const [y, x] = stepFrom(lat, lon, (r / 8) * footprint, (k / (PROBE_BEARINGS * 2)) * Math.PI * 2);
        total++;
        if (world.countryAt(y, x) === 0) wet++;
      }
    }
    return { wet: (wet / total) * 100, over: world.elevationAt(at(lat, lon)) };
  };
  const stale: string[] = [];
  const overhanging: string[] = [];
  let worstDrop = 0;
  for (const m of monuments) {
    const footprint = m.footprint ?? 55;
    const got = clearanceAt(m.lat, m.lon, footprint);
    if (Math.abs(got - (m.clearance ?? -1)) > 1e-6) {
      stale.push(`${m.id} ${got} vs ${m.clearance ?? 'absent'}`);
    }
    if (got >= footprint) continue;
    const { wet, over } = overWater(m.lat, m.lon, footprint);
    worstDrop = Math.max(worstDrop, over);
    overhanging.push(`${m.id} ${(footprint - got).toFixed(0)}u ${wet.toFixed(0)}% ${over.toFixed(1)}`);
  }
  check(
    stale.length === 0,
    'every monument stands on the ground the bake seated it on',
    stale.length > 0 ? `${stale.slice(0, 4).join('; ')} — run \`pnpm monuments\`` : '',
  );
  // The count is a table, not an assertion. It cannot go to zero — the Golden
  // Gate spans a strait and at 1:50m Easter Island is narrower than its own moai
  // — but it is the number that must not quietly grow. The *drop* is an
  // assertion, because that one can: `SHORE_CEILING` holds every pad that
  // stands over water down to the lip, and anything above it is a monument
  // hanging in the air.
  console.log(
    `  --   ${overhanging.length} of ${monuments.length} stand over water — id, footprint short by, ` +
    `share of it wet, units above the sea:\n       ${overhanging.join(' · ')}`,
  );
  check(
    worstDrop <= SHORE_LIP + 0.5,
    'nothing standing over water stands more than the shore lip above it',
    `worst ${worstDrop.toFixed(1)} against lip ${SHORE_LIP}`,
  );
} else {
  console.log('\nmonuments: not built yet (run `pnpm monuments`)');
}

/**
 * The model files and the placement data must agree on where a monument is.
 *
 * A monument's coordinates live in two places by design: `monuments.source.json`
 * is the placement authority — it is what gets snapped to the coast and what the
 * world reads — while the model file carries its own copy because the contract
 * asks for one, for the info card. Two copies drift, and the symptom is a card
 * that names a place the building is not standing in.
 *
 * This reads the model files as text rather than importing them: the registry
 * uses `import.meta.glob`, which is Vite's and does not exist in Node. A field
 * it cannot find is reported as unchecked rather than treated as a match, so a
 * refactor that defeats the scan shows up instead of going quiet.
 */
const monumentDir = resolve(here, '../src/monuments');
if (existsSync(monumentDir)) {
  console.log('\nmonument models');
  const source = JSON.parse(readFileSync(resolve(here, 'monuments.source.json'), 'utf8')) as {
    monuments: { id: string; iso: string; lat: number; lon: number }[];
  };
  const byId = new Map(source.monuments.map((m) => [m.id, m]));
  const field = (text: string, name: string): string | null =>
    text.match(new RegExp(`\\b${name}\\s*:\\s*(-?[\\d.]+|'[^']*')`))?.[1] ?? null;

  const drifted: string[] = [];
  const unchecked: string[] = [];
  const orphans: string[] = [];
  let compared = 0;

  for (const file of readdirSync(monumentDir)) {
    if (!file.endsWith('.ts') || file === 'contract.ts' || file === 'index.ts') continue;
    const text = readFileSync(resolve(monumentDir, file), 'utf8');
    const id = field(text, 'id')?.replace(/'/g, '');
    if (id === undefined || id === null) {
      unchecked.push(file);
      continue;
    }
    const placement = byId.get(id);
    if (placement === undefined) {
      orphans.push(`${file} builds '${id}', which is not in monuments.source.json`);
      continue;
    }
    const lat = field(text, 'lat');
    const lon = field(text, 'lon');
    const iso = field(text, 'iso')?.replace(/'/g, '');
    if (lat === null || lon === null || iso === undefined || iso === null) {
      unchecked.push(file);
      continue;
    }
    compared++;
    if (Math.abs(Number(lat) - placement.lat) > 1e-6) drifted.push(`${id} lat ${lat} vs ${placement.lat}`);
    if (Math.abs(Number(lon) - placement.lon) > 1e-6) drifted.push(`${id} lon ${lon} vs ${placement.lon}`);
    if (iso !== placement.iso) drifted.push(`${id} iso ${iso} vs ${placement.iso}`);
  }

  check(drifted.length === 0, `${compared} model files match the placement data`, drifted.join('; '));
  check(orphans.length === 0, 'every model has a placement', orphans.join('; '));
  if (unchecked.length > 0) console.log(`  --   could not scan: ${unchecked.join(', ')}`);
}

/**
 * The settlements, checked against the coastline they were baked against.
 *
 * This is the assertion that goes stale: re-bake `countries.bin`, the coast
 * moves a little, and villages end up standing on water with nothing to say so.
 * `build-places.mjs` snapped 334 of them to land once, at bake time, precisely
 * so no client repeats that search — which means the snap is only as good as the
 * outlines it was computed against.
 */
if (existsSync(placesPath)) {
  console.log('\nsettlements');
  const places = placesRaw;
  const isoOf = new Map(world.countries.map((c, i) => [i + 1, c.iso]));
  const known = new Set(world.countries.map((c) => c.iso));

  let inSea = 0;
  let wrongCountry = 0;
  let malformed = 0;
  const seaExamples: string[] = [];
  const isoExamples: string[] = [];
  for (const place of places) {
    const id = world.countryAt(place.lat, place.lon);
    if (id === 0) {
      inSea++;
      if (seaExamples.length < 4) seaExamples.push(place.name);
    } else if (isoOf.get(id) !== place.iso) {
      wrongCountry++;
      if (isoExamples.length < 4) isoExamples.push(`${place.name} ${place.iso}/${isoOf.get(id)}`);
    }
    if (
      !place.name ||
      !(place.pop > 0) ||
      !known.has(place.iso) ||
      Math.abs(place.lat * 1000 - Math.round(place.lat * 1000)) > 1e-6 ||
      Math.abs(place.lon * 1000 - Math.round(place.lon * 1000)) > 1e-6
    ) {
      malformed++;
    }
  }

  check(inSea === 0, `all ${places.length} places are on land`, seaExamples.join(', '));
  check(wrongCountry === 0, 'every place agrees with countryAt', isoExamples.join('; '));
  check(malformed === 0, 'names, populations, codes and precision are well formed', `${malformed} bad rows`);

  // A table rather than a boolean: a re-bake that quietly loses a region shows
  // up here as a number that moved, which no assertion would have caught.
  const perContinent = new Map<string, number>();
  for (const place of places) {
    const country = world.countries.find((c) => c.iso === place.iso);
    const key = country?.continent ?? 'unknown';
    perContinent.set(key, (perContinent.get(key) ?? 0) + 1);
  }
  const spread = [...perContinent.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  --   ' + spread.map(([k, n]) => `${k} ${n}`).join(' · '));

  /**
   * The place index, which the HUD reads to name where you are.
   *
   * The assertion is the cheapest one that can exist and it is aimed at exactly
   * one thing: `places.ts` converts lat/lon to xyz itself, which makes it the
   * sixteenth place in this repo to do so and therefore the sixteenth chance to
   * write `+cos(lat) * sin(lon)` and mirror the planet again. Standing on a
   * city and being told you are near a different one is what that looks like,
   * and a mirrored index would still return a plausible city every time.
   */
  const index = indexPlaces(places, PLANET_RADIUS);
  let misnamed = 0;
  const misnamedExamples: string[] = [];
  for (const place of places) {
    if (!isShown(place)) continue;
    const found = index.nearest(at(place.lat, place.lon));
    // Ties are real: `build-places.mjs` snapped several pairs onto the same
    // point, so what is asserted is the coordinate, not the row.
    if (found.units > 0.5) {
      misnamed++;
      if (misnamedExamples.length < 4) {
        misnamedExamples.push(`${place.name} -> ${found.place.name} ${found.units.toFixed(0)}u`);
      }
    }
  }
  check(misnamed === 0, 'every built place is its own nearest place', misnamedExamples.join(', '));

  /**
   * And a hidden one is never named as itself: nothing is built there, so the
   * chip standing in Manacor has to say *near Palma* — a built place, and one
   * whose label band reaches this far. The second half is nearly always true
   * rather than always: `PROMINENCE_RADIUS` is under the label band's
   * approach, so every hidden place is inside its *hider's* name — but the
   * hider can be hidden too, and then the nearest built town may be further.
   * Measured 2026-09-05: 19,809 of 19,811 inside a built place's name, and the
   * two that are not (Kara-Kulja, 235 units from Kazarman; Fort Irwin, 246
   * from Ridgecrest) fall back to the country, which is honest. The band is
   * five, so a re-bake that moves one is not a failure and a rule that leaves
   * hundreds unnamed is.
   */
  let namedHidden = 0;
  let unnamed = 0;
  const hiddenExamples: string[] = [];
  for (const place of places) {
    if (isShown(place)) continue;
    const found = index.nearest(at(place.lat, place.lon));
    if (isShown(found.place) && found.near) continue;
    if (!isShown(found.place)) namedHidden++;
    else unnamed++;
    if (hiddenExamples.length < 4) hiddenExamples.push(`${place.name} -> ${found.place.name} ${found.units.toFixed(0)}u`);
  }
  check(
    namedHidden === 0 && unnamed <= 5,
    'standing in a hidden place, the chip says "near" a built one',
    `${places.length - places.filter(isShown).length} hidden places, ${namedHidden} name a hidden place, ` +
      `${unnamed} fall back to the country${unnamed > 0 ? `: ${hiddenExamples.join(', ')}` : ''}`,
  );

  /**
   * No two settlements are built on the same ground, which is the invariant the
   * bake's thinning exists to produce and the one that goes stale silently.
   *
   * `build-places.mjs` keeps a place only when its built disc touches no kept
   * one, and the separation it uses is `radiusFor(a) + radiusFor(b)` — imported
   * from `places.ts`, so **the bake is a function of a constant that lives in
   * `src/`**. Widen `radiusFor` and nothing in the data changes and nothing in
   * the world complains: the towns simply start interpenetrating, each laying
   * its own paving over the other's, which is the failure that reads as a bug in
   * the settlement builder. This is the assertion that says *re-bake the places*
   * instead.
   *
   * The search has to go out to `radiusFor(p) + BIGGEST_SETTLEMENT` and not to the nearest
   * neighbour, because the binding conflict is not always the closest one: a
   * hamlet 60 units away clears a 30-unit town and a metropolis 120 units away
   * does not.
   */
  {
    const CELL = 0.5;
    const cellKey = (a: number, b: number): number => a * 2000 + (((b % 720) + 720) % 720);
    const cells = new Map<number, number[]>();
    for (let i = 0; i < places.length; i++) {
      const p = places[i]!;
      const k = cellKey(Math.floor((p.lat + 90) / CELL), Math.floor((p.lon + 180) / CELL));
      let bucket = cells.get(k);
      if (bucket === undefined) cells.set(k, (bucket = []));
      bucket.push(i);
    }
    const DEG = Math.PI / 180;
    const arc = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
      const h =
        Math.sin(((b.lat - a.lat) * DEG) / 2) ** 2 +
        Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(((b.lon - a.lon) * DEG) / 2) ** 2;
      return 2 * PLANET_RADIUS * Math.asin(Math.sqrt(h));
    };
    let overlapping = 0;
    let worst = 0;
    const overlapExamples: string[] = [];
    for (let i = 0; i < places.length; i++) {
      const p = places[i]!;
      const radius = radiusFor(p.pop);
      const a = Math.floor((p.lat + 90) / CELL);
      const b = Math.floor((p.lon + 180) / CELL);
      const dLat = Math.ceil((radius + BIGGEST_SETTLEMENT) / (PLANET_RADIUS * DEG) / CELL);
      const span = Math.min(360, Math.ceil(dLat / Math.max(0.02, Math.cos(p.lat * DEG))));
      for (let da = -dLat; da <= dLat; da++) {
        for (let db = -span; db <= span; db++) {
          for (const j of cells.get(cellKey(a + da, b + db)) ?? []) {
            if (j <= i) continue;
            const q = places[j]!;
            const want = radius + radiusFor(q.pop);
            const got = arc(p, q);
            if (got >= want) continue;
            overlapping++;
            if (want - got > worst) worst = want - got;
            if (overlapExamples.length < 4) {
              overlapExamples.push(`${p.name}/${q.name} ${got.toFixed(0)}u apart, ${want.toFixed(0)} wanted`);
            }
          }
        }
      }
    }
    check(
      overlapping === 0,
      'no two settlements are built on the same ground',
      overlapping === 0
        ? `${places.length} discs, none touching`
        : `${overlapping} pairs overlap, worst by ${worst.toFixed(0)}u — re-bake with \`pnpm places\`: ${overlapExamples.join('; ')}`,
    );
  }

  /**
   * The size law has a *hierarchy* in it, which is the thing it did not have.
   *
   * The old assertion checked the two clamps and nothing else, and the law it
   * was guarding — `3.97 * pop^0.1876` — passed while turning a population range
   * of 1,258 to 1 into a size range of 3.8 to 1: every settlement on Earth the
   * same mark. So the spread across the file's own ends is asserted too, and 8
   * is a floor on it rather than the value (it is 12.3 today), because what has
   * to be caught is a law flattening again and not a law being retuned.
   */
  check(
    radiusFor(1) === SMALLEST_SETTLEMENT
      && radiusFor(4e7) === BIGGEST_SETTLEMENT
      && radiusFor(24_900_000) / radiusFor(5_000) > 8
      && labelRadiusFor(1) > radiusFor(1),
    'the settlement radius spreads, and the label band is outside it',
    `hamlet ${radiusFor(5_000).toFixed(0)}u built / ${labelRadiusFor(5_000).toFixed(0)}u named, ` +
    `Shanghai ${radiusFor(24_900_000).toFixed(0)}u / ${labelRadiusFor(24_900_000).toFixed(0)}u, ` +
    `spread ${(radiusFor(24_900_000) / radiusFor(5_000)).toFixed(1)}x`,
  );

  /**
   * The prominence field, and what it decides.
   *
   * `build-places.mjs` bakes it with `prominenceField` and this recomputes it
   * from the shipped rows with the same function — one definition, the way
   * `proximityGraph` is shared with the road bake — so a file whose field was
   * baked against a different ratio, a different rank or a different radius
   * fails here by name. The rest is the study that chose the rule, as
   * assertions: see `PROMINENCE_RADIUS` in `places.ts` for the table these
   * rows come from. Mallorca is the island the rule was asked for and the
   * pairs are the ones a pure "bigger place nearby" rule got wrong.
   */
  {
    const began = Date.now();
    const field = prominenceField(places, PLANET_RADIUS);
    const fieldMs = Date.now() - began;
    let malformedField = 0;
    let capitalsOffCap = 0;
    let drift = 0;
    const driftExamples: string[] = [];
    for (let i = 0; i < places.length; i++) {
      const place = places[i]!;
      const value = place.prominence;
      if (!Number.isInteger(value) || value < 0 || value > PROMINENCE_CAP) malformedField++;
      if (place.capital && value !== PROMINENCE_CAP) capitalsOffCap++;
      if (value !== field[i]) {
        drift++;
        if (driftExamples.length < 4) driftExamples.push(`${place.name} ${value} baked, ${field[i]} now`);
      }
    }
    check(
      malformedField === 0 && capitalsOffCap === 0,
      `prominence is whole units up to the ${PROMINENCE_CAP}u cap, and every capital is at it`,
      `${malformedField} malformed, ${capitalsOffCap} capitals below the cap`,
    );
    check(
      drift === 0,
      `the field is what \`prominenceField\` computes over these rows (ratio ${PROMINENCE_RATIO})`,
      drift === 0 ? `${places.length} rows in ${fieldMs} ms` : `${drift} differ — re-bake with \`pnpm places\`: ${driftExamples.join('; ')}`,
    );

    const shown = places.filter(isShown);
    // 9,734 on 2026-09-05: the study's 9,732 at k=2, R=150, plus the two
    // capitals the rule would have hidden. A band, because a re-bake of the
    // gazetteer moves it by a few, and a *third* of the file is the claim.
    check(
      shown.length > 9_400 && shown.length < 10_100,
      `about a third of the places are built at ${PROMINENCE_RADIUS}u`,
      `${shown.length} of ${places.length} (${((100 * shown.length) / places.length).toFixed(1)}%)`,
    );
    const hiddenCapitals = places.filter((p) => p.capital && !isShown(p));
    check(hiddenCapitals.length === 0, 'no capital is hidden', hiddenCapitals.map((p) => p.name).join(', '));

    const builtIn = (lat0: number, lat1: number, lon0: number, lon1: number): string[] =>
      shown
        .filter((p) => p.lat >= lat0 && p.lat <= lat1 && p.lon >= lon0 && p.lon <= lon1)
        .map((p) => p.name)
        .sort();
    const mallorca = builtIn(39.25, 39.98, 2.28, 3.5);
    const menorca = builtIn(39.8, 40.1, 3.75, 4.35);
    const ibiza = builtIn(38.6, 39.13, 1.2, 1.65);
    check(
      mallorca.length === 1 && mallorca[0] === 'Palma',
      'Mallorca builds Palma and nothing else',
      `${mallorca.join(', ')} of ${places.filter((p) => p.lat >= 39.25 && p.lat <= 39.98 && p.lon >= 2.28 && p.lon <= 3.5).length} places`,
    );
    check(
      menorca.length === 2 && menorca.includes('Ciutadella') && menorca.includes('Maó'),
      'Menorca keeps its twins, Ciutadella and Maó',
      menorca.join(', '),
    );
    check(ibiza.length === 1 && ibiza[0] === 'Ibiza', 'Ibiza builds Ibiza', ibiza.join(', '));

    const named = (name: string, iso: string): Place | undefined =>
      places.find((p) => p.name === name && p.iso === iso);
    const bothBuilt = (a: [string, string], b: [string, string]): boolean => {
      const p = named(...a);
      const q = named(...b);
      return p !== undefined && q !== undefined && isShown(p) && isShown(q);
    };
    check(
      bothBuilt(['Amsterdam', 'NLD'], ['Rotterdam', 'NLD']),
      'Amsterdam and Rotterdam are both built, at any radius',
      `ratio ${PROMINENCE_RATIO} keeps a pair at 1.17`,
    );
    check(
      bothBuilt(['Leeds', 'GBR'], ['Sheffield', 'GBR']) && bothBuilt(['Liverpool', 'GBR'], ['Manchester', 'GBR']),
      'peer cities stand together: Leeds and Sheffield, Liverpool and Manchester',
    );
    const manacor = named('Manacor', 'ESP');
    check(
      manacor !== undefined && !isShown(manacor) && manacor.prominence < PROMINENCE_RADIUS,
      'Manacor is hidden by Palma',
      manacor === undefined ? 'Manacor is not in places.bin' : `${manacor.prominence}u from a place at ${PROMINENCE_RATIO}x its rank`,
    );
  }

  const nearStart = Date.now();
  const M = 20_000;
  const probe = at(0, 0);
  for (let i = 0; i < M; i++) {
    probe.copy(at((((i * 7) % 180) - 90) * 0.9, ((i * 13) % 360) - 180));
    index.nearest(probe);
  }
  const nearUs = ((Date.now() - nearStart) / M) * 1000;
  // Called once a frame from `main.ts`, so the budget is a frame, not a query.
  check(nearUs < 200, 'nearest place under 200 us', `${nearUs.toFixed(1)} us per query`);
} else {
  console.log('\nsettlements: not built yet (run `pnpm places`)');
}

/**
 * The biome model, against places whose biome is not in dispute.
 *
 * `biome.ts` decides what the ground is made of from three lines of arithmetic
 * and no data file, which is a thing you can get badly wrong while every
 * internal check agrees with itself. So the check is external: 25 named
 * coordinates and what any atlas says is there. The four it is allowed to miss
 * are listed in `biome.ts` under `Known misses`, each with the term it would
 * take to fix — they are the cases a model with no mountains and no continents
 * cannot reach, not tuning that was never done.
 */
console.log('\nbiomes');
{
  const sample = biomeSample();
  const biomeOf = (lat: number, lon: number): string => {
    const p = at(lat, lon).normalize();
    biomeAt(p.x, p.y, p.z, lat, lon, reliefAt(p.x, p.y, p.z), sample);
    return sample.id;
  };
  const cases: [string, number, number, string][] = [
    ['Sahara', 25.0, 14.0, 'desert'],
    ['Australian interior', -24.0, 132.0, 'desert'],
    ['Kalahari', -23.0, 22.0, 'desert'],
    ['Amazon', -3.0, -62.0, 'tropical'],
    ['Congo', 0.5, 22.0, 'tropical'],
    ['Borneo', 1.0, 114.0, 'tropical'],
    ['central Siberia', 62.0, 95.0, 'boreal'],
    ['Canadian shield', 58.0, -100.0, 'boreal'],
    ['Finland', 63.0, 26.0, 'boreal'],
    ['northern Siberia', 73.0, 100.0, 'tundra'],
    ['Greenland', 74.0, -40.0, 'ice'],
    ['Antarctica', -80.0, 30.0, 'ice'],
    ['France', 47.0, 2.0, 'temperate'],
    ['Germany', 51.0, 10.0, 'temperate'],
    ['New Zealand', -43.0, 171.0, 'temperate'],
    ['Scotland', 57.0, -4.0, 'temperate'],
    ['Japan', 35.7, 139.7, 'temperate'],
    ['Mallorca', 39.6, 3.0, 'temperate'],
    ['Iowa', 42.0, -94.0, 'grassland'],
    ['Kazakhstan', 48.0, 68.0, 'temperate'],
    ['Sahel', 14.0, 5.0, 'savanna'],
    ['Himalaya', 28.0, 86.9, 'ice'],
    ['Empty Quarter', 20.0, 50.0, 'savanna'],
    ['Atacama', -23.5, -69.0, 'steppe'],
    ['Serengeti', -2.5, 34.8, 'tropical'],
  ];
  let wrong = 0;
  const examples: string[] = [];
  for (const [name, lat, lon, want] of cases) {
    const got = biomeOf(lat, lon);
    if (got !== want) {
      wrong++;
      if (examples.length < 5) examples.push(`${name} ${got} not ${want}`);
    }
  }
  check(wrong === 0, `all ${cases.length} named places land in their biome`, examples.join(', '));

  // A spread, not a boolean: a model that classifies the whole planet as one
  // thing passes every point test above if that thing happens to be temperate.
  const tally = new Map<string, number>();
  for (let i = 0; i < 4000; i++) {
    const lat = (((i * 37) % 1600) / 1600) * 180 - 90;
    const lon = (((i * 91) % 1600) / 1600) * 360 - 180;
    if (world.countryAt(lat, lon) === 0) continue;
    const id = biomeOf(lat, lon);
    tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  const spread = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  --   ' + spread.map(([k, n]) => `${k} ${((n / total) * 100).toFixed(0)}%`).join(' · '));
  check(spread.length >= 6, 'at least six biomes appear on land', `${spread.length} of ${10}`);
}


/**
 * The road network.
 *
 * The one assertion that has to be here rather than in the bake is that **no
 * road crosses water**, and it has to be re-walked rather than trusted: the bake
 * tests a path and writes down a `bend`, and if the two ever drift — a different
 * curve in `roadPoint`, a rounding change in the stored bow — every road in the
 * world would still be a road between two real towns and some of them would run
 * across the sea. Nothing else in the file would notice. It is 463,000
 * point-in-polygon queries and it is worth every one of them.
 */
console.log('\nroads');
{
  const roadsPath = resolve(here, '../public/data/roads.bin');
  if (!existsSync(roadsPath)) {
    check(false, 'public/data/roads.bin exists', 'run `pnpm roads`');
  } else {
    // `places` at the top of this file is a table of named test coordinates, so
    // the settlement rows are the decoded ones rather than that.
    const settled = placesRaw;
    const baked = decodeRoads(await inflate(readFileSync(roadsPath)));
    const roads = baked.roads;

    // Indices into `places.bin`, so the two files are one artefact. Re-baking
    // the places without re-baking the roads joins arbitrary pairs of towns,
    // and every one of them would look plausible.
    check(
      baked.places === settled.length,
      'the network was baked against these places',
      baked.places === settled.length ? '' : `${baked.places} then, ${settled.length} now`,
    );

    let malformed = 0;
    for (const road of roads) {
      if (
        !Number.isInteger(road.a) || !Number.isInteger(road.b) ||
        road.a < 0 || road.b < 0 || road.a >= settled.length || road.b >= settled.length ||
        road.a === road.b || !(road.cls >= 0 && road.cls < ROAD_CLASSES.length) ||
        !Number.isFinite(road.bend) || Math.abs(road.bend) > 0.6
      ) malformed++;
    }
    check(malformed === 0, `all ${roads.length.toLocaleString()} roads are well formed`, `${malformed} bad rows`);

    // Each pair once, and no road doubled back the other way round.
    const seen = new Set<number>();
    let duplicates = 0;
    for (const road of roads) {
      const key = Math.min(road.a, road.b) * 100000 + Math.max(road.a, road.b);
      if (seen.has(key)) duplicates++;
      seen.add(key);
    }
    check(duplicates === 0, 'no pair of places is joined twice', `${duplicates} duplicates`);

    // The class is `classOf` and nothing else, so a hand-edited row cannot
    // quietly promote a lane between two hamlets into a trunk road.
    let misclassed = 0;
    for (const road of roads) {
      if (classOf(settled[road.a]!.pop, settled[road.b]!.pop) !== road.cls) misclassed++;
    }
    check(misclassed === 0, 'every road is the class its two ends earn', `${misclassed} wrong`);

    const a = new Vector3();
    const b = new Vector3();
    const pole = new Vector3();
    const point = new Vector3();
    let wet = 0;
    let probes = 0;
    const wetNames: string[] = [];
    const began = Date.now();
    for (const road of roads) {
      placeDirection(settled[road.a]!, a);
      placeDirection(settled[road.b]!, b);
      roadPole(a, b, pole);
      const length = a.angleTo(b) * PLANET_RADIUS;
      const steps = Math.max(2, Math.ceil(length / 18));
      probes += steps - 1;
      for (let step = 1; step < steps; step++) {
        roadPoint(a, b, road.bend, step / steps, point, pole);
        const { lat, lon } = toLatLon(point);
        if (world.countryAt(lat, lon) === 0) {
          wet++;
          if (wetNames.length < 5) wetNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
          break;
        }
      }
    }
    check(
      wet === 0,
      `no road crosses water`,
      wet === 0
        ? `${probes.toLocaleString()} probes in ${Date.now() - began} ms`
        : `${wet} do: ${wetNames.join(', ')}`,
    );

    /**
     * And no road crosses a town.
     *
     * **This is the assertion `roadClip` exists for and it has to walk the
     * ribbon rather than trust the clip**, for the reason the water test walks
     * the bow: `roadSpan` returns a `t` and `raise` turns that into sections,
     * and a rounding or an off-by-one between the two is a ribbon laid over
     * somebody's plots that nothing in the file would notice. So this rebuilds
     * the ribbon's own centre line — the same `steps` at the same near-band
     * span — and measures every vertex of it against every *shown* place
     * standing nearby.
     *
     * The centre line and not the shoulders, because at the clip the road runs
     * radially out of the town: the section is square to it, so its corners sit
     * at `hypot(clip, shoulder)` and can only be further out than the point
     * this measures. A hidden place is not tested at all — nothing is built
     * there, the ribbon is meant to run through it, and that is the whole of
     * `roadClip`.
     *
     * It catches a third town as well as the two ends, which is the case the
     * clip does not handle and does not have to: a Gabriel edge cannot pass
     * close to a third place, because a place near the middle of one is inside
     * the circle that would have deleted the edge. That is an argument and this
     * is the measurement of it.
     *
     * **Over the network that is drawn and not over the bake**, which it used
     * to be. A lane laid across somebody's plots was a bug while lanes were
     * drawn — which, since the bake joins the built towns, is every row in the
     * file: there is no load-time pass left to run first.
     */
    {
      // A grid of the shown places, so a sample along a road asks about a
      // neighbourhood instead of about the world. Two degrees is 558 units at
      // the equator and the largest town is 150, so the 3x3 block always covers
      // the reach; the longitude span opens with the cosine for the same reason
      // `proximityGraph`'s does.
      const CELL = 2;
      const COLS = Math.round(360 / CELL);
      const ROWS = Math.round(180 / CELL);
      const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
      const shownAt = new Vector3();
      const shownUnit: Vector3[] = [];
      let shownCount = 0;
      for (let i = 0; i < settled.length; i++) {
        const place = settled[i]!;
        shownUnit.push(placeDirection(place, new Vector3()));
        if (!isShown(place)) continue;
        shownCount++;
        const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - place.lat) / CELL)));
        const col = ((Math.floor((place.lon + 180) / CELL) % COLS) + COLS) % COLS;
        grid[row * COLS + col]!.push(i);
      }

      const stretch = { t0: 0, t1: 1 };
      let inside = 0;
      let worst = 0;
      let worstName = '';
      /** The residue: a bowed road swinging through a town it does not end at. */
      let through = 0;
      let throughWorst = 0;
      const throughNames = new Set<string>();
      let clipped = 0;
      let swallowed = 0;
      let removed = 0;
      let vertices = 0;
      let sagRoads = 0;
      let sagSections = 0;
      let sagOver = 0;
      let sagWorst = 0;
      const sagPoint = new Vector3();
      const sagMid = new Vector3();
      const sagLast = new Vector3();
      const roadsBegan = Date.now();
      for (const road of roads) {
        placeDirection(settled[road.a]!, a);
        placeDirection(settled[road.b]!, b);
        roadPole(a, b, pole);
        const clipA = roadClip(settled[road.a]!);
        const clipB = roadClip(settled[road.b]!);
        const length = a.angleTo(b) * PLANET_RADIUS;
        if (clipA > 0 || clipB > 0) clipped++;
        if (!roadSpan(a, b, road.bend, pole, clipA, clipB, stretch)) {
          swallowed++;
          removed += length;
          continue;
        }
        const drawn = length * (stretch.t1 - stretch.t0);
        removed += length - drawn;
        const steps = Math.max(2, Math.ceil(drawn / 18));
        /**
         * **And how much of the ribbon the ground comes up through.**
         *
         * A section takes its height at its two ends and draws a straight line
         * between them; the relief does not. `SPANS` chose 18 units against an
         * arithmetic estimate — the finest octave is about nine units over a
         * 133-unit wavelength, so a 38-unit chord dips 0.9 and an 18-unit one
         * 0.23 — and this is that estimate measured on the network as drawn,
         * which is the same shape of check the settlement's own floor gets.
         * Every third road, because it is an `elevationAt` per section on top of
         * the walk above and the answer does not move.
         */
        const measureSag = sagRoads % 3 === 0;
        sagRoads++;
        let lastGround = 0;
        let lastPointSet = false;
        for (let step = 0; step <= steps; step++) {
          roadPoint(a, b, road.bend, stretch.t0 + ((stretch.t1 - stretch.t0) * step) / steps, point, pole);
          vertices++;
          if (measureSag) {
            const ground = world.elevationAt(sagPoint.copy(point).multiplyScalar(PLANET_RADIUS));
            if (lastPointSet) {
              sagMid.addVectors(sagLast, point).normalize().multiplyScalar(PLANET_RADIUS);
              const middle = world.elevationAt(sagMid);
              const sag = middle - ((ground + lastGround) * 0.5 + RIBBON_LIFT);
              sagSections++;
              if (sag > 0) sagOver++;
              if (sag > sagWorst) sagWorst = sag;
            }
            sagLast.copy(point);
            lastGround = ground;
            lastPointSet = true;
          }
          const { lat, lon } = toLatLon(point);
          const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
          const lonSpan = Math.ceil(1 / Math.max(0.02, Math.cos(lat * DEG)));
          const col = Math.floor((lon + 180) / CELL);
          for (let r = Math.max(0, row - 1); r <= Math.min(ROWS - 1, row + 1); r++) {
            for (let c = col - lonSpan; c <= col + lonSpan; c++) {
              for (const j of grid[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
                // `roadClip` itself, and not a copy of its arithmetic: the
                // ribbon is asserted clear of exactly the disc it was cut
                // against, so the standoff cannot move in one file and not the
                // other. The grid only holds shown places, so this is never 0.
                const limit = roadClip(settled[j]!);
                if (limit <= 0) continue;
                shownAt.copy(shownUnit[j]!);
                const gap = point.angleTo(shownAt) * PLANET_RADIUS;
                if (gap >= limit) continue;
                if (j === road.a || j === road.b) {
                  inside++;
                  if (limit - gap > worst) {
                    worst = limit - gap;
                    worstName = `${settled[road.a]!.name}-${settled[road.b]!.name} at ${settled[j]!.name}`;
                  }
                } else {
                  through++;
                  throughWorst = Math.max(throughWorst, limit - gap);
                  throughNames.add(`${settled[road.a]!.name}-${settled[road.b]!.name} through ${settled[j]!.name}`);
                }
              }
            }
          }
        }
      }
      check(
        sagOver < sagSections * 0.02,
        'the ground stays under the ribbon between its section ends',
        `${sagOver} of ${sagSections.toLocaleString()} sections cut through ` +
          `(${((sagOver / sagSections) * 100).toFixed(2)}%), worst ${sagWorst.toFixed(2)} units`,
      );
      check(
        inside === 0,
        'no ribbon vertex stands inside a town the road ends at',
        inside === 0
          ? `${vertices.toLocaleString()} vertices against ${shownCount.toLocaleString()} shown places ` +
            `in ${Date.now() - roadsBegan} ms; ${clipped.toLocaleString()} roads clipped, ` +
            `${swallowed.toLocaleString()} swallowed whole, ${Math.round(removed).toLocaleString()} units of ribbon removed`
          : `${inside} do, worst ${worst.toFixed(1)} units in: ${worstName}`,
      );
      /**
       * And no road runs through a town it does not end at.
       *
       * **This was a bounded residue for three rounds and it is an invariant
       * now** (2026-09-08): `build-roads.ts` walks each candidate's drawn bow
       * against every built place that is not one of its own ends, and a pair
       * with no bend that clears them is not joined. It was 14 vertices and 28
       * units deep into Weifang when the clip disc was `radiusFor - 8`, 34 and
       * 40 when it became `radiusFor + 4`, and 75 and **118** the moment the
       * orphan rescue started emitting roads that were never Gabriel candidates
       * — Wollongong to Tamworth straight down the middle of Sydney.
       *
       * What is left is the 4-unit band between the two rules, and it is
       * arithmetic rather than slack: the bake refuses a road inside
       * `radiusFor`, this measures against `roadClip`, which is `radiusFor +
       * TOWN_STANDOFF`. So a vertex may legitimately sit up to `TOWN_STANDOFF`
       * inside the disc this tests and no further — **5 vertices, worst 2.4
       * units**. Bounded there, not at 60: if a bow ever swings a road into a
       * town again this fails, where before it only failed if the road went
       * down the high street.
       */      check(
        throughWorst <= TOWN_STANDOFF,
        'no road runs through a town it does not end at',
        `${through} vertices, worst ${throughWorst.toFixed(1)} units: ${[...throughNames].join(', ') || 'none'}`,
      );
    }

    /**
     * The shape of the graph, as a line to read and one band.
     *
     * **Counted over the built towns and not over `places.bin`**, which is the
     * only vertex set the network has now: averaging a degree over the 29,545
     * rows would divide by three times the towns that can carry a road and say
     * nothing about the map. A mean near two is a chain and near six is a
     * hairball; the band is unchanged at 2.8 to 4.5 and has never been widened.
     * The median is the number the user's sentence is about — *no hace falta que
     * conectes una ciudad con 20* — and it is 4.
     */
    const degree = new Int32Array(settled.length);
    for (const road of roads) {
      degree[road.a]!++;
      degree[road.b]!++;
    }
    const builtDegrees = settled
      .map((place, i) => (isShown(place) ? degree[i]! : -1))
      .filter((d) => d >= 0)
      .sort((x, y) => x - y);
    const sum = builtDegrees.reduce((total, d) => total + d, 0);
    const mean = sum / builtDegrees.length;
    const isolated = builtDegrees.filter((d) => d === 0).length;
    const peak = builtDegrees[builtDegrees.length - 1]!;
    console.log(
      `  --   ${baked.graph} graph over ${builtDegrees.length.toLocaleString()} built towns · ` +
        `mean degree ${mean.toFixed(2)} · median ${builtDegrees[builtDegrees.length >> 1]} · ` +
        `p90 ${builtDegrees[Math.floor(builtDegrees.length * 0.9)]} · max ${peak} · ` +
        `${isolated} with no road · ` +
        ROAD_CLASSES.map((c, i) => `${c.name} ${roads.filter((r) => r.cls === i).length}`).join(' · '),
    );
    check(
      mean > 2.8 && mean < 4.5,
      'the graph is a network rather than a chain or a hairball',
      `mean degree ${mean.toFixed(2)} over the built towns`,
    );

    /**
     * No road leaves an island, and that is the water test working rather than
     * failing.
     *
     * **The shape of this assertion has changed twice with the point set.**
     * Under Natural Earth's cartographic file Palma was the *whole* of
     * Mallorca, so the check was `degree === 0` — a true statement about a
     * one-town island that says nothing about water. GeoNames gave the
     * Balearics twelve towns, nine of them on Mallorca, so Palma had roads and
     * the check became a flood fill: whatever it reaches must still be in the
     * archipelago.
     *
     * The network is baked over the **built** towns now, and
     * `PROMINENCE_RADIUS` leaves Palma as the only one on Mallorca — so the
     * fill reaches Palma alone and the assertion is back to being about a town
     * with no road. That is still the water test working and it is still worth
     * asserting, because the fill is what would catch a road to the mainland
     * the day the thinning admits a second Balearic town. What stops it passing
     * on an empty network is the counter-case below, which is the reason that
     * counter-case exists.
     */
    const indexOf = (name: string): number => settled.findIndex((place) => place.name === name);
    const byPlace: number[][] = settled.map(() => []);
    for (const road of roads) {
      byPlace[road.a]!.push(road.b);
      byPlace[road.b]!.push(road.a);
    }
    const palma = indexOf('Palma');
    let escaped = '';
    let reached = 0;
    if (palma >= 0) {
      const seen = new Uint8Array(settled.length);
      const queue = [palma];
      seen[palma] = 1;
      while (queue.length > 0) {
        const at = queue.pop()!;
        reached++;
        // The Balearics span roughly 38.6..40.2 N, 1.1..4.4 E; anything the fill
        // reaches outside that box got there over the sea.
        const place = settled[at]!;
        if (place.lat < 38.5 || place.lat > 40.3 || place.lon < 1 || place.lon > 4.5) {
          escaped ||= `${place.name} (${place.iso})`;
        }
        for (const next of byPlace[at]!) {
          if (seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    check(
      palma >= 0 && escaped === '',
      'no road leaves the Balearics for the mainland',
      palma < 0
        ? 'Palma is not in places.bin'
        : escaped !== ''
          ? `the network reaches ${escaped}`
          : `${reached} place${reached === 1 ? '' : 's'} reachable from Palma, all of them islands`,
    );
    // And the counter-case, or the check above would pass on a network with no
    // roads in it at all: Iceland has several towns and they are joined.
    const reykjavik = indexOf('Reykjav\u00edk');
    check(
      reykjavik >= 0 && degree[reykjavik]! > 0,
      'Iceland\u2019s towns are joined to each other',
      reykjavik < 0 ? 'Reykjavik is not in places.bin' : `degree ${degree[reykjavik]}`,
    );

    /**
     * Every endpoint is a town you can walk into, and the ground let the road be
     * built.
     *
     * **This is the whole of what the load-time passes used to assert, moved to
     * where the answer is now decided.** `roads.bin` was a Gabriel graph over
     * all 29,545 places, so two thirds of its endpoints were villages
     * `PROMINENCE_RADIUS` does not build; the file had to be pruned of dead
     * ends, chained through hidden junctions, filtered to asphalt and topped up
     * with a rescue at each orphaned city before a triangle could be laid. The
     * bake joins the **built** towns now (`builtGraph`), and all of that is
     * deleted. What is left to check is that the file really has that shape:
     *
     * - **Both ends of every road are built.** One `isShown` per row, and it is
     *   the assertion the whole round turns on: if it holds there are no dead
     *   ends at unbuilt villages, no junctions standing on nothing and no road
     *   that ends in a field, by construction rather than by a pass.
     * - **No road crosses ground steeper than `MAX_SLOPE`** — *si en ningún
     *   momento se pasa por una montaña.* Re-walked rather than trusted, the
     *   same way the water test is: the bake tests a path and writes down a
     *   `bend`, and if the two ever drift, every road in the world would still
     *   be a road between two real towns and some of them would climb a scree
     *   face. `crossesScree` is `roads.ts`'s and asks `terrain.ts`'s one
     *   definition of how steep the ground may be.
     * - **The bake accounts for every candidate it did not keep.** The graph is
     *   a pure function of `places.bin`, so the check builds it again and asks
     *   the file to explain each missing pair — it has to be wet or steep on its
     *   own seeded bow. The same caveat as ever applies and is written down
     *   rather than papered over: the bake also *searches* for a bow, so a pair
     *   dropped after a search this does not repeat reads as refused here and
     *   passes.
     * - **And the rows that are not candidates at all are the rescue.** Gabriel
     *   can leave a town isolated for a reason that has nothing to do with the
     *   ground, so the bake gives such a place one road to its nearest reachable
     *   neighbour. Every extra row therefore has to be somebody's only road.
     */
    {
      const began = Date.now();
      let unbuilt = 0;
      const unbuiltNames: string[] = [];
      for (const road of roads) {
        if (isShown(settled[road.a]!) && isShown(settled[road.b]!)) continue;
        unbuilt++;
        if (unbuiltNames.length < 5) unbuiltNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
      }
      check(
        unbuilt === 0,
        'both ends of every road are a town that is built',
        unbuilt === 0
          ? `${roads.length.toLocaleString()} roads over ${settled.filter((p) => isShown(p)).length.toLocaleString()} built places`
          : `${unbuilt} join something that is not: ${unbuiltNames.join(', ')}`,
      );

      let steep = 0;
      const steepNames: string[] = [];
      for (const road of roads) {
        if (!crossesScree(road, settled)) continue;
        steep++;
        if (steepNames.length < 5) steepNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
      }
      check(
        steep === 0,
        'and none of them crosses ground steeper than MAX_SLOPE',
        steep === 0 ? `re-walked in ${Date.now() - began} ms` : `${steep} do: ${steepNames.join(', ')}`,
      );

      const shipped = new Set<number>();
      for (const road of roads) shipped.add(pairKey(settled.length, road.a, road.b));
      const candidates = builtGraph(settled, 'gabriel', MAX_ROAD_LENGTH);
      const candidateKeys = new Set<number>();
      for (const edge of candidates) candidateKeys.add(pairKey(settled.length, edge.a, edge.b));

      const bowProbe = { a: 0, b: 0, cls: 0, bend: 0 };
      const refusedOnItsOwnBow = (ea: number, eb: number): boolean => {
        placeDirection(settled[ea]!, a);
        placeDirection(settled[eb]!, b);
        roadPole(a, b, pole);
        const bend = bendFor(settled[ea]!, settled[eb]!);
        const steps = Math.max(2, Math.ceil((a.angleTo(b) * PLANET_RADIUS) / 18));
        for (let step = 1; step < steps; step++) {
          roadPoint(a, b, bend, step / steps, point, pole);
          const { lat, lon } = toLatLon(point);
          if (world.countryAt(lat, lon) === 0) return true;
        }
        bowProbe.a = ea;
        bowProbe.b = eb;
        bowProbe.cls = classOf(settled[ea]!.pop, settled[eb]!.pop);
        bowProbe.bend = bend;
        return crossesScree(bowProbe, settled);
      };

      let missing = 0;
      let unexplained = 0;
      const unexplainedNames: string[] = [];
      for (const edge of candidates) {
        if (shipped.has(pairKey(settled.length, edge.a, edge.b))) continue;
        missing++;
        if (refusedOnItsOwnBow(edge.a, edge.b)) continue;
        unexplained++;
        if (unexplainedNames.length < 5) unexplainedNames.push(`${settled[edge.a]!.name}-${settled[edge.b]!.name}`);
      }
      check(
        unexplained === 0,
        'every candidate the bake did not keep was wet or steep',
        unexplained === 0
          ? `${missing.toLocaleString()} of ${candidates.length.toLocaleString()} candidates missing, all of them refused`
          : `${unexplained} were neither: ${unexplainedNames.join(', ')}`,
      );

      const degree = new Int32Array(settled.length);
      for (const road of roads) {
        degree[road.a]!++;
        degree[road.b]!++;
      }
      let extra = 0;
      let extraWithoutNeed = 0;
      for (const road of roads) {
        if (candidateKeys.has(pairKey(settled.length, road.a, road.b))) continue;
        extra++;
        if (degree[road.a]! > 1 && degree[road.b]! > 1) extraWithoutNeed++;
      }
      check(
        extraWithoutNeed === 0 && extra < candidates.length * 0.02,
        'and every road that is not a candidate is somebody’s only road',
        `${extra} rescues, ${extraWithoutNeed} of them joining two towns that already had one`,
      );

      let alone = 0;
      let aloneBig = 0;
      const aloneNames: string[] = [];
      for (let i = 0; i < settled.length; i++) {
        if (!isShown(settled[i]!) || degree[i]! > 0) continue;
        alone++;
        if (radiusFor(settled[i]!.pop) < 55) continue;
        aloneBig++;
        if (aloneNames.length < 6) aloneNames.push(settled[i]!.name);
      }
      /**
       * And what is left alone, bounded rather than argued away.
       *
       * **681 built towns of 9,734 have no road, 7.0%, and they were audited one
       * at a time** (2026-09-08): 425 have a mountain across every neighbour,
       * 217 have water across every neighbour, and 39 have no built town within
       * `MAX_ROAD_LENGTH` at all. None of those is a fault in this file — they
       * are the water test, the slope rule and the longest road this world will
       * build, each doing exactly what it says, and the user's own sentence
       * covers them: *si una ciudad no se puede conectar con ninguna porque
       * está encima de una montaña no pasa nada.* The Gabriel artefact — a town
       * isolated by the geometry rather than by the ground — is the 52 the
       * rescue joins.
       *
       * Bounded at 12% so a re-bake has room and a rule that stopped joining
       * anything does not.
       */
      check(
        alone < settled.filter((p) => isShown(p)).length * 0.12,
        'the towns left with no road are the ones the ground refuses',
        `${alone.toLocaleString()} of ${settled.filter((p) => isShown(p)).length.toLocaleString()} built ` +
          `(${((alone / settled.filter((p) => isShown(p)).length) * 100).toFixed(1)}%), ` +
          `${aloneBig} of them over a 55-unit radius: ${aloneNames.join(', ')}`,
      );
    }

    /**
     * The town's own track always reaches past where the ribbon stops.
     *
     * **This is the invariant `TOWN_STANDOFF` is chosen against, and it is
     * arithmetic in two files rather than one, so it is asserted rather than
     * argued.** `settlements.ts` runs its tracks to `slot.radius * 0.8 +
     * TRACK_REACH` and the ribbon now starts at `radiusFor(pop) +
     * TOWN_STANDOFF`, so the overlap is `0.8 r + 45 - (r + 4)` = `41 - 0.2 r`.
     * It is positive for every radius under 205 and the size law is clamped at
     * 150, which is eleven units of overlap at the largest town on the planet.
     *
     * The 45 is `TRACK_REACH` and it is not exported — `settlements.ts` reaches
     * the kit through an `import.meta.glob` registry and cannot be imported
     * here at all — so it is written down as a claim about that file. If it
     * moves, this fails.
     */
    {
      const TRACK_REACH = 45;
      let worst = Infinity;
      let worstAt = 0;
      for (const place of settled) {
        if (!isShown(place)) continue;
        const r = radiusFor(place.pop);
        const overlap = r * 0.8 + TRACK_REACH - roadClip(place);
        if (overlap < worst) {
          worst = overlap;
          worstAt = r;
        }
      }
      check(
        worst > 0,
        'the town’s own track always reaches past where the ribbon stops',
        `worst overlap ${worst.toFixed(1)} units, at radius ${worstAt.toFixed(0)} ` +
          `(standoff ${TOWN_STANDOFF}, track reach 0.8r + ${TRACK_REACH})`,
      );
    }
  }
}

/**
 * The clock, against the platform's own time zone data.
 *
 * `timezone.ts` ships names and no rules — `Intl` carries the offsets, the
 * daylight saving transitions and the updates to both — so the only two things
 * that can be wrong here are a name that does not resolve and a country that
 * has none. Both are silent: an unresolvable zone falls back to solar time and
 * looks merely odd, and a missing country looks like nothing at all until
 * someone stands in it.
 *
 * The city rows compare our answer to the real zone's, so a boundary meridian
 * moved by a careless edit fails rather than quietly putting Denver on Chicago
 * time.
 */
console.log('\ntime');
{
  let unresolvable = 0;
  const badZones: string[] = [];
  for (const zone of allZoneNames()) {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    } catch {
      unresolvable++;
      if (badZones.length < 5) badZones.push(zone);
    }
  }
  check(unresolvable === 0, `all ${allZoneNames().length} zone names resolve`, badZones.join(', '));

  const zoneless = world.countries.filter((c) => zoneFor(c.iso, c.lon, c.lat) === null);
  check(
    zoneless.length === 0,
    `all ${world.countries.length} countries have a zone`,
    zoneless.slice(0, 6).map((c) => `${c.iso} ${c.name}`).join(', '),
  );

  const cities: [string, string, number, number, string][] = [
    ['Palma', 'ESP', 39.57, 2.65, 'Europe/Madrid'],
    ['Las Palmas', 'ESP', 28.1, -15.4, 'Atlantic/Canary'],
    ['New York', 'USA', 40.7, -74.0, 'America/New_York'],
    ['Chicago', 'USA', 41.9, -87.6, 'America/Chicago'],
    ['Denver', 'USA', 39.7, -105.0, 'America/Denver'],
    ['Los Angeles', 'USA', 34.1, -118.2, 'America/Los_Angeles'],
    ['Anchorage', 'USA', 61.2, -149.9, 'America/Anchorage'],
    ['Honolulu', 'USA', 21.3, -157.9, 'Pacific/Honolulu'],
    ['Vancouver', 'CAN', 49.3, -123.1, 'America/Vancouver'],
    ['St Johns', 'CAN', 47.6, -52.7, 'America/St_Johns'],
    ['Moscow', 'RUS', 55.8, 37.6, 'Europe/Moscow'],
    ['Novosibirsk', 'RUS', 55.0, 82.9, 'Asia/Krasnoyarsk'],
    ['Vladivostok', 'RUS', 43.1, 131.9, 'Asia/Vladivostok'],
    ['Sao Paulo', 'BRA', -23.5, -46.6, 'America/Sao_Paulo'],
    ['Manaus', 'BRA', -3.1, -60.0, 'America/Manaus'],
    ['Sydney', 'AUS', -33.9, 151.2, 'Australia/Sydney'],
    ['Brisbane', 'AUS', -27.5, 153.0, 'Australia/Brisbane'],
    ['Perth', 'AUS', -31.9, 115.9, 'Australia/Perth'],
    ['Darwin', 'AUS', -12.5, 130.8, 'Australia/Darwin'],
    ['Mexico City', 'MEX', 19.4, -99.1, 'America/Mexico_City'],
    ['Tokyo', 'JPN', 35.7, 139.7, 'Asia/Tokyo'],
    ['Santiago', 'CHL', -33.4, -70.7, 'America/Santiago'],
  ];
  const now = new Date();
  let disagree = 0;
  const examples: string[] = [];
  for (const [name, iso, lat, lon, want] of cities) {
    const real = new Intl.DateTimeFormat('en-GB', {
      timeZone: want,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    const ours = clockAt(now, iso, lon, lat);
    if (ours !== real) {
      disagree++;
      if (examples.length < 5) examples.push(`${name} ${ours} not ${real}`);
    }
  }
  check(disagree === 0, `all ${cities.length} cities read their real local time`, examples.join(', '));
}

/**
 * The frontiers, which are not in the data and have to be found.
 *
 * Every country is one closed outline that runs along its coast *and* along its
 * land borders with nothing marking which is which, so `borders.ts` steps off
 * each edge along its own outward normal and asks `countryAt` what is there.
 * Getting that backwards would draw a band along every coastline in the world
 * and none along a single frontier, which is a mistake that looks deliberate.
 */
/**
 * The map layer: the colour table, and that the build finishes.
 *
 * **The bug this exists for looked exactly like a different bug.** The layer
 * paints 14.8 MB of vertex colours in slices under the frame budget, and the
 * first headless look at it showed `buildMs` climbing call after call with
 * nothing painted — which reads as a generator being recreated instead of
 * resumed, and is not: `requestAnimationFrame` under a capture runs at about a
 * third of a hertz, so it was simply never given the fifty calls it needs. No
 * screenshot tells those two apart. `verifyFlagLayer` does, and it is here
 * rather than in a browser because it needs no browser: it drives the layer to
 * completion against the mesh this file already has in hand and holds it to
 * three things — it finishes, it never loses ground it had made, and it ends
 * with the table the colour law claims.
 */
console.log('\nthe map layer');
{
  const flags = verifyFlagLayer(world, land);
  console.log(
    `  ${flags.countries} countries, ${flags.painted.toLocaleString()} of ` +
    `${flags.triangles.toLocaleString()} triangles painted, ${flags.moved} nudged off a ` +
    `neighbour, ${flags.switched} onto another colour of their own flag`,
  );
  check(
    flags.ready,
    'the map layer builds inside its budget',
    `${flags.calls} calls, ${flags.spentMs.toFixed(0)} ms, worst ${flags.worstCallMs.toFixed(1)} ms`,
  );
  check(
    flags.regression === 0,
    'and every call keeps what the last one did',
    flags.regression === 0 ? '' : `progress fell by ${flags.regression.toFixed(3)}`,
  );
  check(
    flags.short === 0,
    'and no two countries that touch share a colour',
    `${flags.countries} coloured, ${flags.short} frontiers short`,
  );
}

console.log('\nfrontiers');
{
  const built = createBorders(world);
  const { frontier, coast } = built.stats;
  console.log(
    `  ${frontier.toLocaleString()} frontier edges, ${coast.toLocaleString()} coastal, ` +
    `${built.stats.triangles.toLocaleString()} triangles`,
  );
  // Sea outnumbers land frontier on this planet — most of the outline of most
  // countries is coast — so a probe with the sign flipped inverts this ratio.
  check(
    coast > frontier && frontier > coast * 0.25,
    'more coastline than frontier, and plenty of both',
    `${((frontier / (frontier + coast)) * 100).toFixed(0)}% frontier`,
  );

  const attribute = built.mesh.geometry.getAttribute('position');
  let finite = true;
  let above = 0;
  const point = new Vector3();
  for (let i = 0; i < attribute.count; i += 7) {
    point.fromBufferAttribute(attribute, i);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      finite = false;
      break;
    }
    if (point.length() < PLANET_RADIUS) above++;
  }
  check(finite && above === 0, 'every frontier vertex is finite and above sea level');
}

/**
 * The ground people made, and whether a foot can find it.
 *
 * **Two lifts and one player.** A town's floor is a plinth `GROUND_LIFT` over
 * the relief and a road's carriageway a ribbon at `RIBBON_LIFT`; the player used
 * to walk at `elevationAt` and therefore waded through both, which is what
 * capped each of them. `settlements.ts` publishes `madeHeightAt` and `roads.ts`
 * `ribbonHeightAt`, and `player.ts` stands on the higher of the two and the
 * relief.
 *
 * What can be held to account here and what cannot is worth writing down.
 * `roads.ts` and `scenery/ground.ts` are Node-safe, so the ribbon is checked
 * against the *shipped network* and the kerb ramp against the *shipped rule*.
 * `settlements.ts` is not — it reaches the kit through an `import.meta.glob`
 * registry — so whether a resident town's floor is where the query says it is
 * can only be asked with a town standing, and it is:
 * `atlas.settlements.survey()` samples a ring across every town it builds and
 * reports how far a foot lands under the paving and over it.
 */
console.log('\nmade ground');
{
  /**
   * The kerb, which is the one surface in this world that a foot does not stand
   * on where it is drawn.
   *
   * A road draws its own ramp — the shoulder runs from `RIBBON_LIFT` at the
   * crown down through the relief, so `ribbonHeightAt` reads the geometry and
   * there is nothing to choose. A kerb is a vertical face by construction and a
   * rise is followed *exactly* on the frame it happens (`HEIGHT_SMOOTHING`
   * smooths drops only, deliberately), so switching the floor on at a cell
   * boundary would put the whole lift into one frame. `KERB_BLEND` is the
   * approach, and these are its terms.
   */
  const pitch = 12.65;
  /**
   * A nine-cell town on flat ground, and the same one cut into a hillside.
   *
   * The flat one is the case the whole world used to be: every terrace at the
   * same elevation, so the paving is a plane at `GROUND_LIFT` over it and the
   * ramp outside is the one this file has always asserted. The stepped one is
   * three columns of cells a `TERRACE_STEP` apart, which is what a town on a
   * slope now is, and it is here to hold the *absolute* half of the contract:
   * on a terrace the answer must not move as the ground under it does.
   */
  const flat = { pitch, terraces: new Map<number, number>() };
  const stepped = { pitch, terraces: new Map<number, number>() };
  const GROUND = 100;
  for (let c = -1; c <= 1; c++) {
    for (let r = -1; r <= 1; r++) {
      flat.terraces.set(cellKey(c, r), GROUND);
      stepped.terraces.set(cellKey(c, r), GROUND + c * TERRACE_STEP);
    }
  }
  const edge = pitch * 1.5;

  let onPaving = 0;
  let wrongOnPaving = 0;
  let outOfRange = 0;
  let backwards = 0;
  let steepest = 0;
  let previous = GROUND_LIFT;
  let reaches = -1;
  for (let x = 0; x <= edge + KERB_BLEND * 2; x += 0.05) {
    // The ground the query stands on, which off the paving is the relief and on
    // it is whatever the hill happens to be doing under a level surface. Walked
    // deliberately, so that a lift measured against a *moving* ground still adds
    // back up to one height.
    const ground = GROUND + Math.sin(x * 0.3) * 0.9;
    const lift = floorLiftAt(flat, x, 0, ground);
    if (lift > GROUND_LIFT + 1 + 1e-9 || lift < -1e-9) outOfRange++;
    if (x < edge - 1e-6) {
      onPaving++;
      if (Math.abs(ground + lift - (GROUND + GROUND_LIFT)) > 1e-9) wrongOnPaving++;
    }
    // Off the paving the ramp is measured against a fixed ground, because what
    // it has to be is monotonic in the *distance* and the wobble above would
    // read as a rise the ramp did not make.
    const level = floorLiftAt(flat, x, 0, GROUND);
    if (level > previous + 1e-9) backwards++;
    steepest = Math.max(steepest, (previous - level) / 0.05);
    if (level <= 0 && reaches < 0) reaches = x - edge;
    previous = level;
  }
  check(
    wrongOnPaving === 0,
    'the paving is level over its own cell, at GROUND_LIFT over the terrace',
    `${onPaving} samples inside the floor, ${wrongOnPaving} wrong, lift ${GROUND_LIFT}`,
  );
  check(
    outOfRange === 0 && backwards === 0,
    'the kerb ramp only ever falls, and never past either end',
    `${outOfRange} out of [0, ${GROUND_LIFT}], ${backwards} rising`,
  );
  // A ramp is a step if you can walk up it. At `KERB_BLEND` the rise per unit of
  // ground is the whole lift over the whole blend, which is a gradient rather
  // than a wall; the world's own relief is steeper than this over a tenth of the
  // land (see the vegetation slope table).
  check(
    reaches >= 0 && Math.abs(reaches - KERB_BLEND) < 0.1 && steepest <= GROUND_LIFT / KERB_BLEND + 1e-6,
    'and it lands on the ground exactly KERB_BLEND out, at a gradient a body can walk',
    `${reaches.toFixed(2)} units out, steepest ${steepest.toFixed(3)} (${(Math.atan(steepest) / DEG).toFixed(1)} deg)`,
  );

  /**
   * And the stepped town, which is the terracing's own contract.
   *
   * Three things, and each of them is a way the old constant-offset floor would
   * have been wrong: a foot on a terrace stands at that terrace's height and not
   * at the one next door; the height it stands at does not move with the ground
   * under it; and the approach from outside climbs to the terrace it is about to
   * walk onto rather than to the lowest one in sight.
   */
  let wrongTerrace = 0;
  let terraceSamples = 0;
  for (let c = -1; c <= 1; c++) {
    for (let step = 0; step < 9; step++) {
      const x = (c + (step / 8 - 0.5) * 0.9) * pitch;
      const z = ((step % 3) - 1) * pitch * 0.4;
      const ground = GROUND + Math.sin(x * 0.7) * 1.4;
      const want = GROUND + c * TERRACE_STEP + GROUND_LIFT;
      terraceSamples++;
      if (Math.abs(ground + floorLiftAt(stepped, x, z, ground) - want) > 1e-9) wrongTerrace++;
    }
  }
  check(
    wrongTerrace === 0,
    'and on a stepped town a foot stands on its own terrace, whatever the ground does',
    `${terraceSamples} samples over ${new Set(stepped.terraces.values()).size} terraces, ${wrongTerrace} wrong`,
  );
  /**
   * And the approach, which is a *kerb* and not a wall.
   *
   * **`floorLiftAt` ramps a face of one kerb and refuses a face taller than
   * one**, and the assertion that used to be here read the old rule: it put a
   * probe half a blend outside a terrace a whole `TERRACE_STEP` up and expected
   * the ramp to climb half way to it. That climb is `TERRACE_STEP +
   * GROUND_LIFT` = 7 units against a kerb of `GROUND_LIFT + KERB_DROP` = 3.8,
   * so on a terraced town most of the outside edge is a retaining wall of up to
   * `MAX_CUT + GROUND_LIFT + KERB_DROP` = 15.8, and ramping that over a 9-unit
   * blend is a body rising fifteen units in nine with nothing under his feet.
   *
   * So the rule is asserted rather than the old number, at the same probe and
   * in both directions: the flat town, whose face is exactly `GROUND_LIFT`,
   * still climbs half way at half a blend; and the stepped town's uphill face
   * offers no floor at all, which is what a caller reads as "stand on the
   * ground and walk round to the low side or up the road's own ramp".
   */
  const probe = edge + KERB_BLEND * 0.5;
  const kerbFace = floorLiftAt(flat, probe, 0, GROUND);
  const wallFace = floorLiftAt(stepped, probe, 0, GROUND);
  const climb = TERRACE_STEP + GROUND_LIFT;
  check(
    Math.abs(kerbFace - GROUND_LIFT * 0.5) < 1e-9,
    'and a face of one kerb still climbs half way at half a blend',
    `${kerbFace.toFixed(2)} of ${GROUND_LIFT.toFixed(1)}, against a kerb of ` +
      `${(GROUND_LIFT + KERB_DROP).toFixed(1)}`,
  );
  check(
    wallFace === 0 && climb > GROUND_LIFT + KERB_DROP,
    'and a face taller than one kerb is a wall with no floor to stand on',
    `${climb.toFixed(1)} units to the nearest terrace against a kerb of ` +
      `${(GROUND_LIFT + KERB_DROP).toFixed(1)}, lift ${wallFace.toFixed(2)}` +
      ` (a wall reaches ${(MAX_CUT + GROUND_LIFT + KERB_DROP).toFixed(1)})`,
  );

  /**
   * The ribbon, against the network that ships.
   *
   * `ribbonHeightAt` is asked about points on the drawn stretch of real roads —
   * the same `roadPoint` curve the bake tested for water and the streamer lays
   * the ribbon along, and the same `roadSpan` clip — so a road that was asserted
   * clear of a town cannot be a road a foot stands on inside one.
   */
  const roadsPath = resolve(here, '../public/data/roads.bin');
  if (!existsSync(roadsPath)) {
    check(false, 'public/data/roads.bin exists', 'run `pnpm roads`');
  } else {
    const bakedNetwork = decodeRoads(await inflate(readFileSync(roadsPath)));
    // The file, whole: it is baked over the built towns now, so every row in it
    // is a row the streamer lays and there is nothing to filter out first.
    const pruned = bakedNetwork.roads;

    const a = new Vector3();
    const b = new Vector3();
    const pole = new Vector3();
    const at = new Vector3();
    const ahead = new Vector3();
    const tail = new Vector3();
    const side = new Vector3();
    const off = new Vector3();
    const span = { t0: 0, t1: 1 };

    let crownSamples = 0;
    let crownWrong = 0;
    let worstCrown = 0;
    let rampSamples = 0;
    let rampRising = 0;
    let offStrip = 0;
    let offWrong = 0;
    let inTown = 0;
    let inTownWrong = 0;
    let tested = 0;

    /**
     * **One road at a time, and that is the whole design of this test.**
     *
     * `ribbonHeightAt` answers for the network, and a junction has two
     * carriageways in it — so a probe stepped off one road lands on another and
     * every "there is nothing here" assertion below would be measuring the road
     * map instead of the query. Worse, a road *through* a town along the same
     * bearing as the one being tested hides inside the clip and cannot be told
     * apart at all. A streamer over a single road has no such neighbour: what
     * comes back is that road's own surface and nothing else, so the clip, the
     * shoulder ramp and the edge of the strip can each be asserted exactly.
     *
     * It costs one `createRoads` per sampled road, which over every 100th of the
     * drawn network is 90 of them and each is a bucket over one row. It was
     * every 500th of a network four times the size, which is the same sample.
     */
    for (let i = 0; i < pruned.length; i += 100) {
      const road = pruned[i]!;
      placeDirection(placesRaw[road.a]!, a);
      placeDirection(placesRaw[road.b]!, b);
      roadPole(a, b, pole);
      const clipA = roadClip(placesRaw[road.a]!);
      const clipB = roadClip(placesRaw[road.b]!);
      if (!roadSpan(a, b, road.bend, pole, clipA, clipB, span)) continue;
      const alone = createRoads(world, placesRaw, { ...bakedNetwork, roads: [road] });
      tested++;
      const half = ROAD_CLASSES[road.cls]!.width * 0.5;
      // Where the drawn shoulder crosses the ground. `roads.ts` exports the
      // ratio — this used to write the arithmetic out longhand, which is two
      // files answering one question, and it stopped being right the moment
      // `RIBBON_LIFT` moved: the crossing was half way out at a lift of 1.5 and
      // is two thirds of the way at 3.0.
      const fall = half * CROWN_FALL;

      for (let k = 1; k < 6; k++) {
        const t = span.t0 + (span.t1 - span.t0) * (k / 6);
        roadPoint(a, b, road.bend, t, at, pole);
        // The crown: the relief plus the lift, exactly.
        const ground = groundRadius(world, at);
        crownSamples++;
        const error = Math.abs(alone.ribbonHeightAt(at) - (ground + RIBBON_LIFT));
        if (error > 1e-6) crownWrong++;
        if (error > worstCrown) worstCrown = error;

        roadPoint(a, b, road.bend, Math.min(1, t + 0.004), tail, pole);
        ahead.subVectors(tail, at).normalize();
        side.crossVectors(at, ahead).normalize();
        // Across the section: full lift on the crown, falling to nothing where
        // the drawn shoulder crosses the ground, never rising on the way.
        let last = Infinity;
        for (let step = 0; step <= 10; step++) {
          off.copy(at).addScaledVector(side, (fall * step) / 10 / PLANET_RADIUS).normalize();
          const lift = alone.ribbonHeightAt(off);
          const value = lift === 0 ? 0 : lift - groundRadius(world, off);
          rampSamples++;
          if (value > last + 1e-6) rampRising++;
          last = value;
        }
        // And nothing at all past the drawn strip, on either side.
        for (const sign of [1, -1]) {
          off.copy(at).addScaledVector(side, (sign * (fall + 0.5)) / PLANET_RADIUS).normalize();
          offStrip++;
          if (alone.ribbonHeightAt(off) !== 0) offWrong++;
        }
      }

      // And inside the disc the ribbon was clipped out of, where the town's own
      // plinth takes over: `roadClip` is where the carriageway stops and the
      // query has to stop with it.
      if (clipA > 0) {
        const length = a.angleTo(b) * PLANET_RADIUS;
        roadPoint(a, b, road.bend, Math.min(0.4, (clipA * 0.4) / Math.max(1, length)), at, pole);
        inTown++;
        if (alone.ribbonHeightAt(at) !== 0) inTownWrong++;
      }
    }
    check(
      crownWrong === 0,
      'the ribbon is exactly RIBBON_LIFT over the relief on its crown',
      `${crownSamples} samples on ${tested} roads, worst ${worstCrown.toExponential(1)}`,
    );
    check(
      rampRising === 0,
      'and the shoulder only ever falls, from the crown to the ground',
      `${rampSamples} samples across the section, ${rampRising} rising`,
    );
    check(
      offWrong === 0,
      'and there is nothing to stand on past the drawn strip',
      `${offStrip} probes half a unit outside it, ${offWrong} still on a road`,
    );
    check(
      inTownWrong === 0,
      'and nothing inside the town the ribbon was clipped out of',
      `${inTown} probes inside a built radius, ${inTownWrong} standing on a road that is not drawn`,
    );
  }
}

// `elevationAt` runs once per frame, and monument placement will hammer it.
const queryStart = Date.now();
const N = 200_000;
for (let i = 0; i < N; i++) world.countryAt(((i * 7) % 180) - 90, ((i * 13) % 360) - 180);
const us = ((Date.now() - queryStart) / N) * 1000;
console.log(`\ncountryAt: ${us.toFixed(2)} us per query`);
check(us < 20, 'query cost under 20 us');

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
