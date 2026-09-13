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
import { decodeCountries, decodeLakes, decodePlaces, decodeRoads, encodeCountries, encodeLakes, encodePlaces, encodeRoads, inflate, packedBend } from '../src/pack.ts';
import {
  CROWN_FALL,
  MAX_ROAD_LENGTH,
  RAMP_GRADE,
  RIBBON_LIFT,
  ROAD_CLASSES,
  WATER_PROBE_STEP,
  bendFor,
  builtGraph,
  candidateGates,
  chordGap,
  classOf,
  courseOf,
  coursePath,
  coursePoint,
  courseTangent,
  createRoads,
  crossesScree,
  crownLift,
  emptyCourse,
  emptyRamp,
  gateOpen,
  layersOf,
  outranks,
  pairKey,
  parameterAt,
  pathsOverlap,
  placeDirection,
  rampOf,
  rampReach,
  ribbonHalf,
  ribbonSection,
  ribbonStations,
  roadClearance,
  roadIndexFor,
  tightestTurn,
  townOf,
  townOffset,
  waterProbeSteps,
} from '../src/roads.ts';
import type { CoursePath, RoadRamp } from '../src/roads.ts';
import { offsetDirection } from '../src/scenery/grid.ts';
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
  // whole precision claim is stated: a 3-decimal ring is one whose every
  // coordinate is already exact at 3 decimals.
  const repacked = encodeCountries(
    world.countries.map((country) => ({
      ...country,
      rings: country.rings.map((points) => ({
        // The bake's own ladder: every ring starts at 3 and the repair can raise
        // it to 4. Not 2, which the bake no longer chooses: a ring whose points
        // all happened to end in a zero would read as 2 and re-encode wrong.
        digits:
          [3, 4].find((d) =>
            points.every((p) => Number(p[0]!.toFixed(d)) === p[0]! && Number(p[1]!.toFixed(d)) === p[1]!),
          ) ?? 5,
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
  // comes back as 66.51999999999999, which reproduces no decimal string at all,
  // so asking it for one is the whole test and it needs no copy of the original
  // file. 4 is `PRECISION_FINEST` in the bake — the finest a ring is allowed to
  // be stored at, so a point that needs a fifth decimal did not come from it.
  let coarse = 0;
  for (const country of world.countries) {
    for (const ring of country.rings) {
      for (const point of ring) {
        if (Number(point[0]!.toFixed(4)) !== point[0]! || Number(point[1]!.toFixed(4)) !== point[1]!) coarse++;
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
  // Natural Earth's "Western Sahara" feature is only the Free Zone east of
  // the Moroccan berm, at every scale this project has read; the strip
  // Morocco administers is inside Morocco's own polygon. Both points below
  // are therefore correct, and the pair is what proves the smallest-ring rule
  // still resolves the overlap.
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
/**
 * How far off a wall to step before asking which side of the coast you are on.
 *
 * **It was 8 and 8 was measuring the probe, not the mesh.** Eight units is
 * ~0.03 deg, which was wider than 1:50m's outline spacing on purpose; against
 * 1:10m, where an island carries a point every 0.003 deg, it steps clean over
 * whatever it was meant to step off, and both ends land on the wrong side of
 * something. The step is the only thing that moved:
 *
 * | step | seaward | inland | ratio |
 * |------|---------|--------|-------|
 * | 1    | 360,633 |    149 | 2,420 |
 * | 2    | 349,249 |    430 |   812 |
 * | 4    | 320,113 |  2,574 |   124 |
 * | 8    | 266,624 | 11,105 |    24 |
 *
 * Two, because it is where the count of walls this can classify at all has
 * stopped climbing — 83% of them against 63% at eight — and it still clears the
 * numerical gap between a wall's centroid and the outline it was built from.
 */
const CLIFF_STEP = 2;
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
// Not all of them, and it cannot be: anywhere the land or the channel beside it
// is thinner than the probe — the Chilean fjords, the Canadian archipelago, the
// Amazon delta, the Croatian coast — both steps land on the wrong side of
// something. That is about 0.1% of the walls, and it is resolution, not
// winding. A ring wound backwards fails this by three orders of magnitude, not
// by a fraction of a percent, so the ratio is what is asserted.
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
    /**
     * The last land before the water, and 130 units back from it: the widest a
     * ramp gets, so the second sample is on the shelf whatever this shore did.
     *
     * **And the whole walk has to stay on land.** Testing only the two ends let
     * through every port on a coast narrower than 130 units: Douala walks
     * across its peninsula and arrives 40 units from the Wouri on the far side,
     * still on the ramp *down*; Stockholm walks into the archipelago. New York
     * was worse — it crossed the harbour, came ashore in New Jersey and passed,
     * which is the right answer for the wrong reason. Fifteen of the forty
     * leave the land they started on and none of them can say anything about a
     * shore; the sixteen that stay ashore all rise.
     */
    const wet = step(lat, lon, bearing, edge - 10);
    const dry = step(lat, lon, bearing, edge - 130);
    let ashore = true;
    for (let back = 0; back <= 120 && ashore; back += 10) {
      const [y, x] = step(lat, lon, bearing, edge - 10 - back);
      if (world.countryAt(y, x) === 0) ashore = false;
    }
    if (!ashore) continue;
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
  // Gate spans a strait and Easter Island is narrower than its own moai — but
  // it is the number that must not quietly grow: it did, 13 to 20, between the
  // sweep on file in `build-monuments.ts` and its re-sweep dated 2026-09-09,
  // and neither the coastline nor `SEAT_BUDGET` moved it — see that file. The
  // *drop* is an assertion, because that one can: `SHORE_CEILING` holds every
  // pad that stands over water down to the lip, and anything above it is a
  // monument hanging in the air.
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
        !Number.isFinite(road.bend) || Math.abs(road.bend) > 0.6 ||
        // A gate index names one of that town's gates, or `courseOf` refuses
        // it: a change to `gatesOf` or to the size law is a re-bake.
        !Number.isInteger(road.gateA) || !Number.isInteger(road.gateB) ||
        road.gateA < 0 || road.gateB < 0 ||
        road.gateA >= townOf(settled[road.a]!).gates.length || road.gateB >= townOf(settled[road.b]!).gates.length ||
        !Number.isInteger(road.layer) || road.layer < 0
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

    const point = new Vector3();
    const walk = emptyCourse();
    let wet = 0;
    let probes = 0;
    const wetNames: string[] = [];
    const began = Date.now();
    for (const road of roads) {
      const course = courseOf(road, settled, walk);
      const steps = waterProbeSteps(course);
      probes += steps + 1;
      for (let step = 0; step <= steps; step++) {
        coursePoint(course, step / steps, point);
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
        ? `${probes.toLocaleString()} probes along the courses, gate to gate, in ${Date.now() - began} ms`
        : `${wet} do: ${wetNames.join(', ')}`,
    );

    /**
     * Every road starts and stops on a gate its two towns can use.
     *
     * **This is the contract the square was built for** — *que la ciudad esté
     * sobre una base cuadrada y los caminos se conecten ahí* — and it is three
     * things per road end, each a way the join has gone wrong before:
     *
     * - **The gate can be used.** `gateOpen`: `gateLevel` cuts it (no corner in
     *   the sea, no cell steeper than `MAX_CUT`), and its approach is dry. A
     *   road through a gate the town cannot cut ends against a wall;
     *   `settlements.ts` paves exactly the gates `gateLevel` admits.
     * - **The ribbon's end is on the kerb.** The course's first point, read back
     *   into the town's frame, is the gate's own offset and lies on the square's
     *   edge — not four units short of it, which is what the old clip did, and
     *   not a unit inside.
     * - **It leaves square.** The course's tangent at the gate is the side's
     *   outward normal, so the end section lies along the kerb and the road
     *   continues the street rather than meeting it on a slant.
     */
    {
      const course = emptyCourse();
      const tangent = new Vector3();
      const out = new Vector3();
      const kerbLine = new Vector3();
      const offset = { x: 0, z: 0 };
      let shut = 0;
      let offGate = 0;
      let worstGate = 0;
      let slanted = 0;
      let worstSlant = 0;
      const shutNames: string[] = [];
      const gateUse = new Map<string, number>();
      for (const road of roads) {
        courseOf(road, settled, course);
        for (const end of [0, 1] as const) {
          const index = end === 0 ? road.a : road.b;
          const gateIndex = end === 0 ? road.gateA : road.gateB;
          const place = settled[index]!;
          const town = townOf(place);
          const gate = town.gates[gateIndex]!;
          gateUse.set(`${index}:${gateIndex}`, (gateUse.get(`${index}:${gateIndex}`) ?? 0) + 1);
          if (!gateOpen(place, gateIndex, world)) {
            shut++;
            if (shutNames.length < 5) shutNames.push(`${place.name} gate ${gateIndex}`);
          }
          const at = end === 0 ? course.gateA : course.gateB;
          townOffset(town, at, offset);
          const along = gate.outX !== 0 ? offset.x * gate.outX : offset.z * gate.outZ;
          const miss = Math.max(Math.hypot(offset.x - gate.x, offset.z - gate.z), Math.abs(along - town.grid.half));
          if (miss > 1e-6) offGate++;
          worstGate = Math.max(worstGate, miss);
          // Square to the kerb *line*, measured on the ground at the gate: the
          // kerb's own direction there, from two points a unit either side of
          // the gate along the side, and the course's tangent pointing out of
          // the town. The town's `out` vector is a tangent at its centre and
          // tilts by `half / R` by the time it reaches a kerb, so it is not the
          // thing to measure against.
          courseTangent(course, end === 0 ? 0 : 1, tangent);
          if (end === 1) tangent.negate();
          offsetDirection(town.up, town.across, town.north, gate.x - gate.outZ, gate.z + gate.outX, out);
          offsetDirection(town.up, town.across, town.north, gate.x + gate.outZ, gate.z - gate.outX, kerbLine);
          out.sub(kerbLine).normalize();
          const slant = Math.asin(Math.min(1, Math.abs(tangent.dot(out)))) / DEG;
          offsetDirection(town.up, town.across, town.north, gate.x + gate.outX, gate.z + gate.outZ, kerbLine);
          if (slant > 0.01 || tangent.dot(kerbLine.sub(at)) <= 0) slanted++;
          worstSlant = Math.max(worstSlant, slant);
        }
      }
      let shared = 0;
      for (const count of gateUse.values()) if (count > 1) shared += count;
      check(
        shut === 0,
        'every road end is on a gate its town can cut, with a dry approach',
        shut === 0
          ? `${(roads.length * 2).toLocaleString()} road ends on ${gateUse.size.toLocaleString()} gates, ` +
            `${shared.toLocaleString()} of the ends on a gate another road also uses`
          : `${shut} are not: ${shutNames.join(', ')}`,
      );
      check(
        offGate === 0 && slanted === 0,
        'and the ribbon starts on the kerb line, square to it',
        `worst ${worstGate.toExponential(1)} units off the gate, worst ${worstSlant.toFixed(4)} deg off square`,
      );
    }

    /**
     * And the ribbon as it is drawn: out of the squares, off the other towns,
     * over the ground, and up to each gate's own paving at no more than
     * `RAMP_GRADE`.
     *
     * **This walks the drawn ribbon rather than trusting the course**, for the
     * reason the water test walks the bow: `ribbonStations` and `ribbonSection`
     * are what `raise` lays, and a rounding between the course and the sections
     * is a ribbon over somebody's plots that nothing else would notice. So
     * every section of every road is rebuilt at the near band's own span — all
     * four points — and asked four things:
     *
     * - **No vertex inside its own two squares**, beyond a thousandth of a unit:
     *   the end section lies *on* the kerb, so the tolerance is what separates
     *   "on" from "in".
     * - **No centre-line vertex inside a third built town's disc** by more than
     *   `WATER_PROBE_STEP`: the bake refuses a course that enters one at that
     *   stride, so a vertex between two of its probes can be inside by at most
     *   the probe's own spacing and no further.
     * - **The end section is at the gate's paving**, `gateLevel + GROUND_LIFT`,
     *   at all four of its points on the crown and within a thousandth of it —
     *   the no-step join.
     * - **The two ramps fit in the road**, so neither kerb's height is disturbed
     *   by the other end's climb. How fast the crown climbs is asserted where it
     *   can be measured cleanly — under a foot, on the path, in *made ground* —
     *   and not section to section here: a section-to-section slope divides the
     *   relief's own roughness across the crown by a run that is a hundredth of
     *   a unit wherever a ramp's end falls beside an approach's, and the first
     *   version of this assertion read 0.80 off exactly that.
     */
    {
      // A grid of the built places, so a section along a road asks about a
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

      const course = emptyCourse();
      const ramp = emptyRamp();
      const stations: number[] = [];
      const near = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
      const far = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
      const unitAt = new Vector3();
      const offset = { x: 0, z: 0 };
      let vertices = 0;
      let inside = 0;
      let worstInside = 0;
      let worstInsideName = '';
      let through = 0;
      let throughWorst = 0;
      const throughNames = new Set<string>();
      let kerbs = 0;
      let kerbWrong = 0;
      let kerbWorst = 0;
      let overlapping = 0;
      let ramped = 0;
      let longestRamp = 0;
      let folded = 0;
      let tightestRatio = Infinity;
      const foldedNames: string[] = [];
      let sagRoads = 0;
      let sagSections = 0;
      let sagOver = 0;
      let sagWorst = 0;
      const roadsBegan = Date.now();
      for (const road of roads) {
        courseOf(road, settled, course);
        const path = coursePath(course);
        rampOf(road, course, settled, world, ramp);
        const half = ROAD_CLASSES[road.cls]!.width * 0.5;
        const turn = tightestTurn(path) / roadClearance(road.cls);
        if (turn < 1) {
          folded++;
          if (foldedNames.length < 4) foldedNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
        }
        tightestRatio = Math.min(tightestRatio, turn);
        if (rampReach(ramp.riseA) + rampReach(ramp.riseB) > path.length) overlapping++;
        if (Math.abs(ramp.riseA) > 1e-9 || Math.abs(ramp.riseB) > 1e-9) ramped++;
        longestRamp = Math.max(longestRamp, rampReach(ramp.riseA), rampReach(ramp.riseB));
        const towns = [townOf(settled[road.a]!), townOf(settled[road.b]!)];
        ribbonStations(path.length, course.approach, ramp, 18, stations);
        // Every third road, the sag: a section takes its height at its two ends
        // and draws a straight line between them, and the relief does not.
        // `SPANS` chose 18 units against an arithmetic estimate, and this is
        // the estimate measured on the network as drawn.
        const measureSag = sagRoads % 3 === 0;
        sagRoads++;
        for (let k = 0; k < stations.length; k++) {
          const s = stations[k]!;
          ribbonSection(world, course, path, ramp, half, s, far);
          vertices += 4;
          for (const vertex of far) {
            unitAt.copy(vertex).normalize();
            for (const town of towns) {
              townOffset(town, unitAt, offset);
              const depth = Math.min(town.grid.half - Math.abs(offset.x), town.grid.half - Math.abs(offset.z));
              if (depth > 1e-3) {
                inside++;
                if (depth > worstInside) {
                  worstInside = depth;
                  worstInsideName = `${settled[road.a]!.name}-${settled[road.b]!.name}`;
                }
              }
            }
          }
          // The kerbs: both crown points of the end section at the paving.
          if (k === 0 || k === stations.length - 1) {
            const kerb = k === 0 ? ramp.kerbA : ramp.kerbB;
            for (const vertex of [far[1]!, far[2]!]) {
              kerbs++;
              const error = Math.abs(vertex.length() - kerb);
              if (error > 1e-3) kerbWrong++;
              kerbWorst = Math.max(kerbWorst, error);
            }
          }
          if (k > 0) {
            if (measureSag) {
              const middle = world.elevationAt(unitAt.addVectors(near[1]!, far[2]!).normalize());
              const chordMiddle = (near[1]!.length() + near[2]!.length() + far[1]!.length() + far[2]!.length()) / 4;
              const sag = PLANET_RADIUS + middle - chordMiddle;
              sagSections++;
              if (sag > 0) sagOver++;
              if (sag > sagWorst) sagWorst = sag;
            }
          }
          // And a third town: the centre line against every built disc nearby.
          unitAt.addVectors(far[1]!, far[2]!).normalize();
          const { lat, lon } = toLatLon(unitAt);
          const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
          const lonSpan = Math.ceil(1 / Math.max(0.02, Math.cos(lat * DEG)));
          const col = Math.floor((lon + 180) / CELL);
          for (let r = Math.max(0, row - 1); r <= Math.min(ROWS - 1, row + 1); r++) {
            for (let c = col - lonSpan; c <= col + lonSpan; c++) {
              for (const j of grid[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
                if (j === road.a || j === road.b) continue;
                const limit = radiusFor(settled[j]!.pop);
                shownAt.copy(shownUnit[j]!);
                const gap = unitAt.angleTo(shownAt) * PLANET_RADIUS;
                if (gap >= limit) continue;
                through++;
                throughWorst = Math.max(throughWorst, limit - gap);
                throughNames.add(`${settled[road.a]!.name}-${settled[road.b]!.name} through ${settled[j]!.name}`);
              }
            }
          }
          for (let j = 0; j < 4; j++) near[j]!.copy(far[j]!);
        }
      }
      check(
        inside === 0,
        'no ribbon vertex stands inside either of its own towns’ squares',
        inside === 0
          ? `${vertices.toLocaleString()} section vertices on ${roads.length.toLocaleString()} roads ` +
            `in ${Date.now() - roadsBegan} ms`
          : `${inside} do, worst ${worstInside.toFixed(3)} units in: ${worstInsideName}`,
      );
      check(
        folded === 0,
        'no course turns tighter than its own ribbon is wide',
        folded === 0
          ? `the tightest turn on the network is ${tightestRatio.toFixed(2)} of the drawn half-width it has to carry`
          : `${folded} do, and fold their inner shoulder: ${foldedNames.join(', ')}`,
      );
      check(
        throughWorst <= WATER_PROBE_STEP,
        'no road runs through a town it does not end at',
        `${through} centre-line vertices inside a third town's disc, worst ${throughWorst.toFixed(2)} units ` +
          `against the bake's stride of ${WATER_PROBE_STEP}` +
          (throughNames.size > 0 ? `: ${[...throughNames].slice(0, 4).join(', ')}` : ''),
      );
      check(
        kerbWrong === 0,
        'the ribbon’s end section is at its gate’s paving, gateLevel + GROUND_LIFT',
        `${kerbs.toLocaleString()} crown corners at a kerb, worst ${kerbWorst.toExponential(1)} units off`,
      );
      check(
        overlapping === 0,
        'and its two ramps, one into each gate, never meet',
        `${ramped.toLocaleString()} roads ramp to a gate at RAMP_GRADE, the longest ramp ${longestRamp.toFixed(1)} units, ` +
          `${overlapping} with ramps that meet (the climb itself is asserted under a foot, in made ground)`,
      );
      check(
        sagOver < sagSections * 0.02,
        'the ground stays under the ribbon between its section ends',
        `${sagOver} of ${sagSections.toLocaleString()} sections cut through ` +
          `(${((sagOver / Math.max(1, sagSections)) * 100).toFixed(2)}%), worst ${sagWorst.toFixed(2)} units`,
      );
      console.log(`  --   ${shownCount.toLocaleString()} built places tested against the centre lines`);
    }

    /**
     * And no two roads draw one surface on one depth layer.
     *
     * Two ribbons that overlap are two surfaces at one height — two roads into
     * one gate share its approach, two out of adjacent gates of a hamlet overlap
     * at its corner — and coplanar triangles z-fight, which is the defect the
     * roofs had. Heights cannot separate them, because both ends of both have to
     * meet one paving at one kerb, so every road carries a depth layer
     * (`layersOf`, baked) and the shader pushes each layer back `LAYER_DEPTH`.
     *
     * Asserted twice. The file's layers are `layersOf` of the file. And,
     * independently of the overlap test that assigned them, every place where
     * two roads' *crowns* cover the same ground within 0.05 units of height of
     * each other — sampled every unit along the one, across its crown, against
     * the other's own crown and its own height law — is on two different layers
     * with the higher-ranking road in front. A coplanar pair on one layer is a
     * flicker; a pair with the lower road in front is the wrong road showing.
     */
    {
      const began = Date.now();
      const expected = layersOf(roads, settled);
      let misLayered = 0;
      let deepest = 0;
      let layered = 0;
      roads.forEach((road, i) => {
        if (road.layer !== expected[i]) misLayered++;
        if (road.layer > deepest) deepest = road.layer;
        if (road.layer > 0) layered++;
      });
      check(
        misLayered === 0,
        'every road’s depth layer is layersOf the network',
        `${misLayered} differ; ${layered.toLocaleString()} roads drawn behind a road they overlap, ` +
          `the deepest on layer ${deepest}`,
      );

      const scratchCourse = emptyCourse();
      const paths = new Map<number, CoursePath>();
      const pathOf = (i: number): CoursePath => {
        let found = paths.get(i);
        if (found === undefined) {
          found = coursePath(courseOf(roads[i]!, settled, scratchCourse));
          paths.set(i, found);
        }
        return found;
      };
      const rampCache = new Map<number, RoadRamp>();
      const rampFor = (i: number): RoadRamp => {
        let found = rampCache.get(i);
        if (found === undefined) {
          found = rampOf(roads[i]!, courseOf(roads[i]!, settled, scratchCourse), settled, world);
          rampCache.set(i, found);
        }
        return found;
      };
      const index = roadIndexFor(roads, settled);
      const hits: number[] = [];
      const middle = new Vector3();
      const chordA = new Vector3();
      const chordB = new Vector3();
      const across = new Vector3();
      const sample = new Vector3();
      const probe = new Vector3();
      const legStart = new Vector3();
      const leg = new Vector3();
      const foot = new Vector3();
      const nearest = { distance: 0, s: 0, pastCap: false, foot: new Vector3() };
      /** Where a path is nearest a direction: how far off, how far along, and whether past a cap. */
      const nearestOn = (path: CoursePath, direction: Vector3): typeof nearest => {
        nearest.distance = Infinity;
        for (let k = 1; k < path.count; k++) {
          legStart.set(path.xyz[k * 3 - 3]!, path.xyz[k * 3 - 2]!, path.xyz[k * 3 - 1]!);
          leg.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!).sub(legStart);
          const lengthSq = leg.lengthSq();
          const raw = lengthSq > 0 ? foot.copy(direction).sub(legStart).dot(leg) / lengthSq : 0;
          const along = raw < 0 ? 0 : raw > 1 ? 1 : raw;
          foot.copy(legStart).addScaledVector(leg, along).normalize();
          const distance = foot.distanceTo(direction) * PLANET_RADIUS;
          if (distance < nearest.distance) {
            nearest.distance = distance;
            nearest.s = path.s[k - 1]! + (path.s[k]! - path.s[k - 1]!) * along;
            nearest.pastCap = (k === 1 && raw < 0) || (k === path.count - 1 && raw > 1);
            nearest.foot.copy(foot);
          }
        }
        return nearest;
      };
      const widest = roadClearance(ROAD_CLASSES.length - 1);
      let pairs = 0;
      let samples = 0;
      let coplanar = 0;
      let sameLayer = 0;
      let wrongOrder = 0;
      const sameNames: string[] = [];
      for (let r = 0; r < roads.length; r++) {
        const pathR = pathOf(r);
        const halfR = ROAD_CLASSES[roads[r]!.cls]!.width * 0.5;
        coursePoint(courseOf(roads[r]!, settled, scratchCourse), 0.5, middle);
        for (const q of index.near(middle, pathR.length * 0.5 + roadClearance(roads[r]!.cls) + widest, hits)) {
          if (q <= r) continue;
          const pathQ = pathOf(q);
          const halfQ = ROAD_CLASSES[roads[q]!.cls]!.width * 0.5;
          const reach = halfR + halfQ + 1;
          if (!pathsOverlap(pathR, pathQ, reach)) continue;
          pairs++;
          const rampR = rampFor(r);
          const rampQ = rampFor(q);
          const lowerIsR = outranks(roads, q, r);
          for (let k = 1; k < pathR.count; k++) {
            if (chordGap(pathR, k, pathQ, reach) >= reach) continue;
            chordA.set(pathR.xyz[k * 3 - 3]!, pathR.xyz[k * 3 - 2]!, pathR.xyz[k * 3 - 1]!);
            chordB.set(pathR.xyz[k * 3]!, pathR.xyz[k * 3 + 1]!, pathR.xyz[k * 3 + 2]!);
            across.subVectors(chordB, chordA);
            across.crossVectors(chordA, across).normalize();
            const length = pathR.s[k]! - pathR.s[k - 1]!;
            const steps = Math.max(1, Math.ceil(length));
            for (let j = 0; j <= steps; j++) {
              const sR = pathR.s[k - 1]! + (length * j) / steps;
              sample.copy(chordA).lerp(chordB, j / steps).normalize();
              const crownR = ribbonHalf(rampR, halfR, sR, pathR.length - sR);
              for (const share of [-0.9, 0, 0.9]) {
                probe.copy(sample).addScaledVector(across, (share * crownR) / PLANET_RADIUS).normalize();
                const onQ = nearestOn(pathQ, probe);
                if (onQ.pastCap) continue;
                if (onQ.distance > ribbonHalf(rampQ, halfQ, onQ.s, pathQ.length - onQ.s)) continue;
                samples++;
                const ground = world.elevationAt(probe);
                const liftR = crownLift(rampR, sR, pathR.length - sR, ground, world.elevationAt(sample));
                const liftQ = crownLift(rampQ, onQ.s, pathQ.length - onQ.s, ground, world.elevationAt(onQ.foot));
                if (Math.abs(liftR - liftQ) >= 0.05) continue;
                coplanar++;
                const layerR = roads[r]!.layer;
                const layerQ = roads[q]!.layer;
                if (layerR === layerQ) {
                  sameLayer++;
                  if (sameNames.length < 4) {
                    sameNames.push(`${settled[roads[r]!.a]!.name}-${settled[roads[r]!.b]!.name} / ` +
                      `${settled[roads[q]!.a]!.name}-${settled[roads[q]!.b]!.name}`);
                  }
                } else if (lowerIsR ? layerR < layerQ : layerQ < layerR) {
                  wrongOrder++;
                }
              }
            }
          }
        }
      }
      check(
        sameLayer === 0 && wrongOrder === 0,
        'no two roads draw one surface on one depth layer',
        `${coplanar.toLocaleString()} coplanar crown samples of ${samples.toLocaleString()} where two crowns ` +
          `cover one spot, on ${pairs.toLocaleString()} pairs of roads; ${sameLayer} on one layer, ` +
          `${wrongOrder} with the lower road in front, in ${Date.now() - began} ms` +
          (sameNames.length > 0 ? `: ${sameNames.join('; ')}` : ''),
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
    const reykjavik = indexOf('Reykjavík');
    check(
      reykjavik >= 0 && degree[reykjavik]! > 0,
      'Iceland’s towns are joined to each other',
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
     *   same way the water test is: the bake tests a course and writes down a
     *   `bend` and two gates, and if the two ever drift, every road in the world
     *   would still be a road between two real towns and some of them would
     *   climb a scree face. `crossesScree` is `roads.ts`'s and asks
     *   `terrain.ts`'s one definition of how steep the ground may be.
     * - **The bake accounts for every candidate it did not keep.** The graph is
     *   a pure function of `places.bin`, so the check builds it again, gives
     *   each candidate the gates `candidateGates` gives it, and asks the file to
     *   explain each missing pair on its own seeded bow through those gates: a
     *   town with no open gate, gates too far apart in height to climb to, or a
     *   course that is wet, back through its own square, through a third town or
     *   steep. The same caveat as ever applies and is written down rather than
     *   papered over: the bake also *searches* bows and gates, so a pair dropped
     *   after a search this does not repeat reads as refused here and passes.
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
      const given = candidateGates(settled, candidates, world);

      const course = emptyCourse();
      const ramp = emptyRamp();
      const offset = { x: 0, z: 0 };
      const at = new Vector3();
      const townAt = new Vector3();
      const bowProbe = { a: 0, b: 0, cls: 0, bend: 0, gateA: 0, gateB: 0, layer: 0 };
      /** The bake's refusals, re-asked on the candidate's own gates and seeded bow. */
      const refusedOnItsOwn = (edge: { a: number; b: number }, gateA: number, gateB: number): boolean => {
        if (gateA < 0 || gateB < 0) return true;
        bowProbe.a = edge.a;
        bowProbe.b = edge.b;
        bowProbe.cls = classOf(settled[edge.a]!.pop, settled[edge.b]!.pop);
        bowProbe.bend = packedBend(bendFor(settled[edge.a]!, settled[edge.b]!));
        bowProbe.gateA = gateA;
        bowProbe.gateB = gateB;
        courseOf(bowProbe, settled, course);
        rampOf(bowProbe, course, settled, world, ramp);
        if (rampReach(ramp.riseA) + rampReach(ramp.riseB) > course.length) return true;
        if (tightestTurn(coursePath(course)) < roadClearance(bowProbe.cls)) return true;
        const towns = [townOf(settled[edge.a]!), townOf(settled[edge.b]!)];
        const margin = Math.min(roadClearance(bowProbe.cls), course.approach);
        const steps = waterProbeSteps(course);
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          coursePoint(course, t, at);
          const { lat, lon } = toLatLon(at);
          if (world.countryAt(lat, lon) === 0) return true;
          if (t > course.share && t < 1 - course.share) {
            for (const town of towns) {
              townOffset(town, at, offset);
              const reach = town.grid.half + margin;
              if (Math.abs(offset.x) < reach && Math.abs(offset.z) < reach) return true;
            }
          }
          // A third town, by the same disc the bake refuses: every built place
          // within a thousand units is few enough to ask directly here.
        }
        for (const [j, place] of settled.entries()) {
          if (j === edge.a || j === edge.b || !isShown(place)) continue;
          placeDirection(place, townAt);
          if (townAt.dot(course.gateA) < 0.998) continue;
          const limit = radiusFor(place.pop);
          for (let step = 0; step <= steps; step++) {
            coursePoint(course, step / steps, at);
            if (at.angleTo(townAt) * PLANET_RADIUS < limit) return true;
          }
        }
        return crossesScree(bowProbe, settled);
      };

      let missing = 0;
      let unexplained = 0;
      const unexplainedNames: string[] = [];
      candidates.forEach((edge, i) => {
        if (shipped.has(pairKey(settled.length, edge.a, edge.b))) return;
        missing++;
        if (refusedOnItsOwn(edge, given[i * 2]!, given[i * 2 + 1]!)) return;
        unexplained++;
        if (unexplainedNames.length < 5) unexplainedNames.push(`${settled[edge.a]!.name}-${settled[edge.b]!.name}`);
      });
      check(
        unexplained === 0,
        'every candidate the bake did not keep was refused on its own gates and bow',
        unexplained === 0
          ? `${missing.toLocaleString()} of ${candidates.length.toLocaleString()} candidates missing, all of them refused`
          : `${unexplained} were not: ${unexplainedNames.join(', ')}`,
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
       * **681 built towns of 9,734 had no road, 7.0%, when they were audited
       * one at a time** (2026-09-08, before roads ran gate to gate): 425 had a
       * mountain across every neighbour, 217 had water across every neighbour,
       * and 39 had no built town within `MAX_ROAD_LENGTH` at all. None of those
       * is a fault in this file — they are the water test, the slope rule and
       * the longest road this world will build, each doing exactly what it
       * says, and the user's own sentence covers them: *si una ciudad no se
       * puede conectar con ninguna porque está encima de una montaña no pasa
       * nada.* The gates add a fourth reason, which is the same one seen from
       * the town: a town every one of whose gates is in the sea or on ground too
       * steep to cut has nowhere for a road to come in.
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
   * `ribbonHeightAt` is asked about points on real roads — the same course the
   * bake tested for water and the streamer lays the ribbon along, the same path
   * and the same `crownLift` — so a road that was asserted clear of a town
   * cannot be a road a foot stands on inside one, and a kerb asserted at its
   * gate's paving cannot be a step for the foot that crosses it.
   */
  const roadsPath = resolve(here, '../public/data/roads.bin');
  if (!existsSync(roadsPath)) {
    check(false, 'public/data/roads.bin exists', 'run `pnpm roads`');
  } else {
    const bakedNetwork = decodeRoads(await inflate(readFileSync(roadsPath)));
    // The file, whole: it is baked over the built towns now, so every row in it
    // is a row the streamer lays and there is nothing to filter out first.
    const pruned = bakedNetwork.roads;

    const at = new Vector3();
    const tail = new Vector3();
    const side = new Vector3();
    const off = new Vector3();
    const course = emptyCourse();
    const ramp = emptyRamp();
    const chordA = new Vector3();
    const chordB = new Vector3();
    const foot = new Vector3();
    /** A point `s` along a path, on its own chord: exactly where `ribbonHeightAt` measures from. */
    const pathPointAt = (path: CoursePath, s: number, out: Vector3): Vector3 => {
      let k = 1;
      while (k < path.count - 1 && path.s[k]! < s) k++;
      const span = path.s[k]! - path.s[k - 1]!;
      const along = span > 0 ? Math.min(1, Math.max(0, (s - path.s[k - 1]!) / span)) : 0;
      chordA.set(path.xyz[k * 3 - 3]!, path.xyz[k * 3 - 2]!, path.xyz[k * 3 - 1]!);
      chordB.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!);
      return out.copy(chordA).lerp(chordB, along).normalize();
    };
    /**
     * How far a direction stands from a path, across the ground. A probe put a
     * given distance off one section of a course that bends back near itself
     * can be nearer another stretch of the same road, and that stretch's
     * surface is not this section's shoulder.
     */
    const pathDistance = (path: CoursePath, direction: Vector3): number => {
      let nearest = Infinity;
      for (let k = 1; k < path.count; k++) {
        chordA.set(path.xyz[k * 3 - 3]!, path.xyz[k * 3 - 2]!, path.xyz[k * 3 - 1]!);
        chordB.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!).sub(chordA);
        const lengthSq = chordB.lengthSq();
        const along = lengthSq > 0 ? Math.min(1, Math.max(0, foot.copy(direction).sub(chordA).dot(chordB) / lengthSq)) : 0;
        foot.copy(chordA).addScaledVector(chordB, along).normalize();
        nearest = Math.min(nearest, foot.distanceTo(direction) * PLANET_RADIUS);
      }
      return nearest;
    };
    let elsewhere = 0;

    let crownSamples = 0;
    let crownWrong = 0;
    let worstCrown = 0;
    let rampSamples = 0;
    let rampRising = 0;
    let offStrip = 0;
    let offWrong = 0;
    let inTown = 0;
    let inTownWrong = 0;
    let kerbSamples = 0;
    let kerbWrong = 0;
    let kerbWorst = 0;
    let gradeSamples = 0;
    let gradeWorst = 0;
    let tested = 0;

    /**
     * **One road at a time, and that is the whole design of this test.**
     *
     * `ribbonHeightAt` answers for the network, and a junction has two
     * carriageways in it — so a probe stepped off one road lands on another and
     * every "there is nothing here" assertion below would be measuring the road
     * map instead of the query. Worse, two roads through one gate share their
     * approach, and a probe inside the square beside that gate would be answered
     * by whichever of them it was not about. A streamer over a single road has no
     * such neighbour: what comes back is that road's own surface and nothing
     * else, so the crown, the shoulder, the kerb and the climb can each be
     * asserted exactly.
     *
     * It costs one `createRoads` per sampled road, which over every 100th of the
     * network is under two hundred of them and each is a bucket over one row.
     */
    for (let i = 0; i < pruned.length; i += 100) {
      const road = pruned[i]!;
      courseOf(road, placesRaw, course);
      const path = coursePath(course);
      rampOf(road, course, placesRaw, world, ramp);
      const alone = createRoads(world, placesRaw, { ...bakedNetwork, roads: [road] });
      tested++;
      const half = ROAD_CLASSES[road.cls]!.width * 0.5;
      // Where the drawn shoulder crosses the ground, wherever the crown has its
      // ordinary lift. `roads.ts` exports the ratio — this used to write the
      // arithmetic out longhand, which is two files answering one question.
      const fall = half * CROWN_FALL;

      // The middle, clear of both approaches and both ramps: the crown at
      // exactly `RIBBON_LIFT` over the relief, a shoulder that only falls, and
      // nothing past the drawn strip.
      const from = Math.max(course.approach, rampReach(ramp.riseA));
      const to = path.length - Math.max(course.approach, rampReach(ramp.riseB));
      if (to > from) {
        for (let k = 1; k < 6; k++) {
          const t = parameterAt(path, from + ((to - from) * k) / 6);
          coursePoint(course, t, at);
          const ground = groundRadius(world, at);
          crownSamples++;
          const error = Math.abs(alone.ribbonHeightAt(at) - (ground + RIBBON_LIFT));
          if (error > 1e-6) crownWrong++;
          if (error > worstCrown) worstCrown = error;

          courseTangent(course, t, tail);
          side.crossVectors(at, tail).normalize();
          let last = Infinity;
          for (let step = 0; step <= 10; step++) {
            const away = (fall * step) / 10;
            off.copy(at).addScaledVector(side, away / PLANET_RADIUS).normalize();
            if (pathDistance(path, off) < away - 0.1) {
              elsewhere++;
              continue;
            }
            const lift = alone.ribbonHeightAt(off);
            const value = lift === 0 ? 0 : lift - groundRadius(world, off);
            rampSamples++;
            if (value > last + 1e-6) rampRising++;
            last = value;
          }
          for (const sign of [1, -1]) {
            off.copy(at).addScaledVector(side, (sign * (fall + 0.5)) / PLANET_RADIUS).normalize();
            if (pathDistance(path, off) < fall + 0.4) {
              elsewhere++;
              continue;
            }
            offStrip++;
            if (alone.ribbonHeightAt(off) !== 0) offWrong++;
          }
        }
      }

      // The two kerbs, which is where the join the user photographed was.
      for (const end of [0, 1] as const) {
        const kerb = end === 0 ? ramp.kerbA : ramp.kerbB;
        const town = townOf(placesRaw[end === 0 ? road.a : road.b]!);
        const gate = town.gates[end === 0 ? road.gateA : road.gateB]!;
        // Half a unit inside the kerb on the street's own line is the town's
        // paving, and `madeHeightAt` answers there: the road answers nothing.
        offsetDirection(town.up, town.across, town.north, gate.x - gate.outX * 0.5, gate.z - gate.outZ * 0.5, off);
        inTown++;
        if (alone.ribbonHeightAt(off) !== 0) inTownWrong++;
        // A hundredth of a unit outside it, across the crown, the road stands
        // at the paving's own height: no step, no gap.
        const edge = end === 0 ? 0.01 : path.length - 0.01;
        const t0 = parameterAt(path, edge);
        coursePoint(course, t0, at);
        courseTangent(course, t0, tail);
        side.crossVectors(at, tail).normalize();
        const crown = ribbonHalf(ramp, half, edge, path.length - edge);
        for (let step = -2; step <= 2; step++) {
          off.copy(at).addScaledVector(side, (crown * 0.45 * step) / PLANET_RADIUS).normalize();
          kerbSamples++;
          const error = Math.abs(alone.ribbonHeightAt(off) - kerb);
          if (error > 0.02) kerbWrong++;
          if (error > kerbWorst) kerbWorst = error;
        }
        // And the climb, along the centre line from the kerb to past where its
        // ramp and its approach both end, every half a unit: how fast the lift
        // over the relief changes, which is the ramp and nothing else.
        const reach = Math.min(
          path.length * 0.5,
          Math.max(rampReach(end === 0 ? ramp.riseA : ramp.riseB), course.approach) + 2,
        );
        let previous = NaN;
        for (let s = 0.25; s <= reach; s += 0.5) {
          // On the path's own chord rather than the curve, so the query's foot
          // is the probe itself: the curve is up to `PATH_SAG` off the chord,
          // and over an approach that is enough cross-slope to read as a
          // hundredth of grade that the ramp does not have.
          pathPointAt(path, end === 0 ? s : path.length - s, at);
          const height = alone.ribbonHeightAt(at);
          if (height === 0) {
            previous = NaN;
            continue;
          }
          const lift = height - groundRadius(world, at);
          if (!Number.isNaN(previous)) {
            gradeSamples++;
            gradeWorst = Math.max(gradeWorst, Math.abs(lift - previous) / 0.5);
          }
          previous = lift;
        }
      }
    }
    check(
      crownWrong === 0,
      'the ribbon is exactly RIBBON_LIFT over the relief on its crown, between the ramps',
      `${crownSamples} samples on ${tested} roads, worst ${worstCrown.toExponential(1)}`,
    );
    check(
      rampRising === 0,
      'and the shoulder only ever falls, from the crown to the ground',
      `${rampSamples} samples across the section, ${rampRising} rising; ` +
        `${elsewhere} probes left out for standing nearer another stretch of the same road`,
    );
    check(
      offWrong === 0,
      'and there is nothing to stand on past the drawn strip',
      `${offStrip} probes half a unit outside it, ${offWrong} still on a road`,
    );
    check(
      inTownWrong === 0,
      'and nothing half a unit inside a gate, where the town’s own paving is',
      `${inTown} probes inside a square, ${inTownWrong} standing on a road that is not drawn there`,
    );
    check(
      kerbWrong === 0,
      'ribbonHeightAt meets the gate’s paving at the kerb line: gateLevel + GROUND_LIFT',
      `${kerbSamples} probes across the crown a hundredth of a unit out, worst ${kerbWorst.toFixed(4)} units off`,
    );
    check(
      gradeWorst <= RAMP_GRADE + 1e-3,
      'and a foot climbs from the road to the gate at no more than RAMP_GRADE over the relief',
      `${gradeSamples} half-unit steps along ${tested * 2} approaches, steepest ${gradeWorst.toFixed(3)} against ${RAMP_GRADE}`,
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
