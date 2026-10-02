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
import ts from 'typescript';
import { insideRing, loadWorld, toLatLon } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, LAND_HEIGHT, buildLand, coastEdges, groundColorAt, groundRadius, onSphere } from '../src/globe.ts';
import { bearingTo, toUnit } from '../src/cartography.ts';
import { latOf, lonOf, unitAt } from '../src/sphere.ts';
import { createOcean, oceanLimits } from '../src/ocean.ts';
import { OCEAN_COLOR } from '../src/theme.ts';
import { MAX_RELIEF, SHORE_LIP, flattenWeightAt, reliefAt, setDetailSites, setFlattenSites } from '../src/terrain.ts';
import {
  BIGGEST_SETTLEMENT,
  PROMINENCE_CAP,
  PROMINENCE_RADIUS,
  PROMINENCE_RATIO,
  SMALLEST_SETTLEMENT,
  indexPlaces,
  isShown,
  labelRadiusOf,
  prominenceField,
  radiusFor,
  radiusOf,
  terrainSiteOf,
} from '../src/places.ts';
import type { Place } from '../src/places.ts';
import { decodeCountries, decodeLakes, decodePlaces, decodeRoads, encodeCountries, encodePlaces, encodeRoads, inflate, packedBend } from '../src/pack.ts';
import {
  crownFall,
  carriageEdges,
  dashGives,
  EDGE_KEEP,
  edgeGives,
  edgeLineAcross,
  markingRuns,
  nearestOnPath,
  otherRoadsOf,
  othersRoofline,
  PAVEMENT_RUN,
  roadsideSite,
  holdGates,
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
  BRIDGE_LAND,
  BRIDGE_SPAN,
  bridgeDeck,
  courseOf,
  distanceAt,
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
  APPROACH,
  landmarkAt,
  landmarkTakes,
} from '../src/roads.ts';
import type { CoursePath, RoadRamp } from '../src/roads.ts';
import { poolAt, poolByte } from '../src/lights.ts';
import { layRoadside } from '../src/roadside.ts';
import {
  cornerOffset,
  gateGlow,
  gateMouth,
  gateLevel,
  gatesOf,
  groundOf,
  offsetDirection,
  OUTSKIRT_MIN_CELLS,
  townFrame,
  outskirtsOf,
  partnerOf,
  streetBand,
  townGrid,
  townTerraces,
} from '../src/scenery/grid.ts';
import type { TownGrid } from '../src/scenery/grid.ts';
import { biomeAt, biomeSample } from '../src/biome.ts';
// The floor's own vertical section, from the file that lays it: the check has
// to measure the mesh against the number `settlements.ts` uses and not against
// a copy of it. `scenery/ground.ts` is Node-safe; `settlements.ts` is not,
// because it reaches the kit through an `import.meta.glob` registry.
import { EDGE_RUN, GROUND_LIFT, KERB_DROP, STREET_GRADE, TERRACE_STEP, cellKey, pavementOf } from '../src/scenery/ground.ts';
import { EDGE_FOOT, STEP_RISE, buildFloor, edgeSink, flightHeight, flightRect, floorLiftAt, rampGrade } from '../src/scenery/floor.ts';
import { STEP_UP } from '../src/player.ts';
import { allZoneNames, clockAt, zoneFor } from '../src/timezone.ts';
import { createBorders } from '../src/borders.ts';
import { verifyFlagLayer } from '../src/land-flags.ts';
import { FLAGS, FLAG_ALIAS, NO_FLAG } from '../src/flag-data.ts';
import { MAX_FOOTPRINT, createContext } from '../src/monuments/contract.ts';
import type { Monument } from '../src/monuments/contract.ts';
import { ARRIVAL_CLEARANCE, LANDMARK_KEEP, clearOfPlans, planReach, planShape, plannedSite, setLandmarks, siteGap } from '../src/landmark-ground.ts';
import type { Plan, PlanShape } from '../src/landmark-ground.ts';
import { SHORE_CLEAR } from '../src/terrain.ts';
import { mergeMeshes } from '../src/merge.ts';
import { Mesh } from 'three';
import { PLANE_CEILING, PLANE_CRUISE_HIGH, isWater } from '../src/vehicles.ts';
import * as relay from '../server/src/limits.ts';
import { TIME_SCALE } from './time-scale.ts';
import { fightsIn } from './z-fight.ts';

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
  name?: string;
  iso: string;
  lat: number;
  lon: number;
  footprint?: number;
  height?: number;
  year?: number;
  snappedKm?: number;
  clearance?: number;
  plan?: Plan;
  shore?: true;
  setting?: 'plaza';
  toward?: number;
}[] = existsSync(monumentsPath)
  ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: typeof placed }).monuments
  : [];
// The mesh here has to be the mesh the game builds, and the flat pads under the
// monuments are part of the relief. They go in before the world exists.
setFlattenSites(placed);
// And the ground they take, which the road bake shut gates by and kept its
// carriageways off: the questions below about gates and roads are the bake's.
setLandmarks(placed, PLANET_RADIUS);

// The settlements ask the mesh for resolution, not for level ground; see
// `setDetailSites`. Same one-shot contract, and it has to run before the world.
const placesPath = resolve(here, '../public/data/places.bin');
const placesRaw: Place[] = existsSync(placesPath)
  ? decodePlaces(await inflate(readFileSync(placesPath)))
  : [];
setDetailSites(placesRaw.map(terrainSiteOf));

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
 * **This used to prove nothing.** It built east, north and up from `at()`
 * above — this file's own formula — so no line of `src/` was involved and it
 * would have passed on a mirrored planet: a false witness, exactly what the
 * trap forbids. It asks `src/` now, three ways, and holds each answer against
 * something that was not built from the same basis:
 *
 * - **The basis.** East, north and up from `globe.ts`'s `onSphere`, which the
 *   land mesh is built with, and from `cartography.ts`'s `toUnit`, which the
 *   maps and the chip's arrow use: east crosses north into up, and both agree
 *   with `at()`, written here from the textbook. Both are `sphere.ts` under the
 *   names their callers knew, and `sphere.ts`'s own `unitAt` is held to `at()`
 *   beside them.
 * - **The way back.** `geo.ts`'s `toLatLon` and `sphere.ts`'s `latOf` and
 *   `lonOf` return the coordinate `at()` was given, and `countryAtPoint` finds
 *   Lisbon in Portugal — mirrored, Lisbon's longitude lands in the sea south of
 *   Sardinia.
 * - **A fact about the Earth.** Standing in Madrid facing north, `bearingTo`
 *   puts Barcelona on the right and Lisbon on the left. That is the answer the
 *   minimap's wedge and the chip's arrow draw, and a mirror swaps it.
 */
{
  const onSrc = (lat: number, lon: number): Vector3 => onSphere(lon, lat, new Vector3());
  const unit = new Float32Array(3);
  const wrong: string[] = [];
  for (const [lat, lon] of [[0, 0], [40, -3], [-33, 151], [60, 120], [-20, -60], [71, -156]] as [number, number][]) {
    const up = onSrc(lat, lon);
    const east = onSrc(lat, lon + 0.01).sub(up).normalize();
    const north = onSrc(lat + 0.01, lon).sub(up).normalize();
    if (east.cross(north).dot(up) < 0.99) wrong.push(`onSphere is left-handed at ${lat},${lon}`);
    const textbook = at(lat, lon).divideScalar(PLANET_RADIUS);
    if (up.distanceTo(textbook) > 1e-9) wrong.push(`onSphere disagrees with the textbook at ${lat},${lon}`);
    toUnit(lat, lon, unit);
    if (Math.hypot(unit[0]! - textbook.x, unit[1]! - textbook.y, unit[2]! - textbook.z) > 1e-6) {
      wrong.push(`toUnit disagrees with the textbook at ${lat},${lon}`);
    }
    if (unitAt(lat, lon, new Vector3()).distanceTo(textbook) > 1e-9) {
      wrong.push(`unitAt disagrees with the textbook at ${lat},${lon}`);
    }
    const back = toLatLon(at(lat, lon));
    if (Math.abs(back.lat - lat) > 1e-9 || Math.abs(back.lon - lon) > 1e-9) {
      wrong.push(`toLatLon reads ${lat},${lon} back as ${back.lat.toFixed(2)},${back.lon.toFixed(2)}`);
    }
    const unitLat = latOf(textbook.y);
    const unitLon = lonOf(textbook.x, textbook.z);
    if (Math.abs(unitLat - lat) > 1e-9 || Math.abs(unitLon - lon) > 1e-9) {
      wrong.push(`latOf and lonOf read ${lat},${lon} back as ${unitLat.toFixed(2)},${unitLon.toFixed(2)}`);
    }
  }
  const madrid = at(40.42, -3.7);
  const north = at(40.52, -3.7).sub(madrid);
  const barcelona = bearingTo(madrid, north, 41.39, 2.17);
  const lisbon = bearingTo(madrid, north, 38.72, -9.14);
  if (!(barcelona !== null && barcelona > 0)) wrong.push('Barcelona is not to the right of Madrid facing north');
  if (!(lisbon !== null && lisbon < 0)) wrong.push('Lisbon is not to the left of Madrid facing north');
  const lisbonIn = world.countryAtPoint(at(38.72, -9.14));
  if (lisbonIn === 0 || world.countries[lisbonIn - 1]!.name !== 'Portugal') wrong.push('Lisbon is not in Portugal');
  check(wrong.length === 0, 'the planet is right-handed, like the Earth', wrong.slice(0, 4).join('; '));
}

/**
 * And nothing in `src/` converts by hand.
 *
 * The check above holds `sphere.ts` to the Earth, which is worth exactly as
 * much as the number of conversions that do not go through it: when that file
 * was made the formula was spelled out 53 times in `src/` alone, any one of
 * which could have been the fourth mirror. So every file under `src/` but
 * `sphere.ts` is read as the TypeScript parser sees it — string and template
 * literals blanked, which is where the GLSL lives, and comments with them — and
 * either of the two shapes that give a conversion away fails the check with its
 * file and line:
 *
 * - **a longitude**: `Math.atan2(…)` taken to degrees (`/ DEG`, `* R2D`,
 *   `* (180 / Math.PI)`) with an argument negated or a `z` in it — the world's
 *   `atan2(-z, x)`, or the mirror's `atan2(z, x)`. The ecliptic's
 *   `atan2(y, x)` in `system/orbits.ts` is neither, and a monument's yaw stays
 *   in radians.
 * - **a component**: anything times `Math.sin` or `Math.cos` of something
 *   named for a longitude — `cos * Math.sin(lon * DEG)`,
 *   `Math.cos(lat) * Math.cos(place.lon)`.
 *
 * It is a net, not a proof: a conversion through a variable called `theta`
 * passes it. The scripts are not read, because a check's textbook witness —
 * `at()` above — is supposed to be written out by hand. And the GLSL cannot
 * import, so it converts on its own and is checked by eye: `lights.ts`'s
 * `atlasSolarHour` reads a longitude as `atan(-upDir.z, upDir.x)`.
 */
{
  const DEGREES = String.raw`\s*(?:\/\s*(?:DEG|D2R|RAD)\b|\*\s*(?:R2D\b|\(?\s*180\s*\/\s*Math\.PI))`;
  const LONGITUDE = new RegExp(String.raw`Math\.atan2\(([^()]*)\)` + DEGREES, 'g');
  const TELLS = /(?:^|,)\s*-|\b\w*z\b/;
  const OF_LONGITUDE = String.raw`Math\.(?:sin|cos)\([^()]*(?:(?<![A-Za-z])lon|Lon\b)[^()]*\)`;
  const FACTOR = String.raw`(?:Math\.cos\([^()]*\)|(?<![\w$])[A-Za-z_$][\w$]*(?:\[[^\]]*\])?!?)`;
  const COMPONENT = new RegExp(String.raw`${FACTOR}\s*\*\s*${OF_LONGITUDE}|${OF_LONGITUDE}\s*\*\s*${FACTOR}`, 'g');
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  const blankLiterals = (file: string, text: string): string => {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const chars = text.split('');
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isRegularExpressionLiteral(node)) {
        for (let i = node.getStart(source); i < node.end; i++) if (chars[i] !== '\n') chars[i] = ' ';
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return chars.join('');
  };
  const byHand: string[] = [];
  const src = resolve(here, '../src');
  const files = (readdirSync(src, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.ts') && file !== 'sphere.ts')
    .sort();
  for (const file of files) {
    // Comments go second, and only safely then: a literal such as
    // `'./parts/*.ts'` would have opened one that swallowed the code after it.
    const code = blankLiterals(file, readFileSync(resolve(src, file), 'utf8'))
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, blank);
    const lineOf = (index: number): number => code.slice(0, index).split('\n').length;
    for (const match of code.matchAll(LONGITUDE)) {
      if (TELLS.test(match[1]!)) byHand.push(`src/${file}:${lineOf(match.index)} a longitude`);
    }
    for (const match of code.matchAll(COMPONENT)) byHand.push(`src/${file}:${lineOf(match.index)} a component`);
  }
  check(
    byHand.length === 0,
    `no lat/lon conversion written out by hand in src/ (${files.length} files read; use sphere.ts)`,
    byHand.slice(0, 6).join('; '),
  );
}

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

// Every country the chip can name draws its flag, flies another's, or is on
// the list of ground nobody flies one over. Nine admin-0 features arrived with
// 1:10m and drew the fallback plate for no reason but that nobody had said
// which of the three they were.
{
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
 * Every drawn country GeoNames has a row for has its facts baked, for the card
 * that names it as you cross in (`src/country-facts.ts`). The file records the
 * ones GeoNames has no row for, because this check runs where `countryInfo.txt`
 * is not — CI has only what is committed — and when the source *is* beside the
 * repo, that list is held to it too: a code on it that GeoNames does carry is
 * a join the bake missed.
 */
{
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
 * `globe.ts` cuts every lake out of every land ring its outline reaches into,
 * so the only land a lake may hold is an island: a ring lying wholly inside it,
 * which the mesh leaves whole. This samples each lake on a grid and asks
 * `countryAt` at every point, and the island test here is its own — every
 * vertex of the land ring inside the lake — rather than `geo.ts`'s rule read
 * back. Before the rule, 63 of 1,066 points inside Tanganyika answered
 * Burundi, whose ring is smaller than the lake and whose border is drawn across
 * the water; smallest-ring-wins had nothing to say about which of the two was
 * drawn.
 *
 * And a lake is baked once. Natural Earth carries Lake Volta twice, and the
 * second copy was a second hole cut in Ghana on top of the first, which folds
 * the ear clipper's output back over the water.
 */
{
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
const faceA = new Vector3();
const faceB = new Vector3();
const faceC = new Vector3();
/**
 * A triangle's own normal, from its corners. The mesh's normal attribute is
 * smooth — a vertex's is the mean of the faces round it — so which way a face
 * points, and whether it is a wall, is asked of its geometry.
 */
function faceNormalOf(t: number, into: Vector3): Vector3 {
  faceA.fromBufferAttribute(position, t * 3);
  faceB.fromBufferAttribute(position, t * 3 + 1).sub(faceA);
  faceC.fromBufferAttribute(position, t * 3 + 2).sub(faceA);
  return into.crossVectors(faceB, faceC).normalize();
}
for (let t = 0; t < triangles; t++) {
  v.fromBufferAttribute(position, t * 3);
  faceNormalOf(t, n);
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
  faceNormalOf(t, n);
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
// by a fraction of a percent, so the ratio is what is asserted — and it is
// asserted near where it stands rather than a hundred times under it, which let
// it fall by an order of magnitude without a word: 1,293 to one on 2026-09-21
// (281,867 seaward, 218 inland), held at a thousand.
check(
  seaward > inland * 1000,
  'the coastal cliffs face the sea',
  `${seaward.toLocaleString()} seaward, ${inland.toLocaleString()} inland, of ${walls.toLocaleString()} walls`,
);

/**
 * What the mesh draws over a lake, counted rather than trusted.
 *
 * `globe.ts` cuts a lake three ways — a hole, a splice, and for a border drawn
 * along a shore rather than across it, dropping the faces that came out on the
 * water — and its comments say this file counts what the last one leaves. It
 * counts all three: every land top whose centre `countryAt` calls lake water,
 * and how far inside the lake's outline the deepest one stands.
 *
 * **It is not zero and the residue is known.** On 2026-09-21 it was 1,778
 * triangles, the deepest 116 units into Lake Superior, because `refine` split
 * an edge at the *great-circle* midpoint while the ear clipper, the outlines and
 * `countryAt` all work in straight lon/lat lines: a long east-west edge bowed
 * poleward by about `L^2/8 * sin(lat)cos(lat)` and carried the land out over
 * the water. `refine` takes the lon/lat midpoint now, and what is left the same
 * day is 331 land tops, the deepest 24.2 units in — the width of a shore ramp,
 * not a peninsula. This is a ceiling just above that: it cannot grow without
 * failing here.
 */
{
  const lakesAt = world.rings.filter((ring) => ring.water).map((ring) => {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of ring.points) {
      minLon = Math.min(minLon, lon!); maxLon = Math.max(maxLon, lon!);
      minLat = Math.min(minLat, lat!); maxLat = Math.max(maxLat, lat!);
    }
    return { points: ring.points, box: [minLon, minLat, maxLon, maxLat] as const };
  });
  const shoreDistance = (points: number[][], lon: number, lat: number): number => {
    let best = Infinity;
    const k = Math.cos(lat * DEG);
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const ax = points[j]![0]! * k, ay = points[j]![1]!;
      const dx = points[i]![0]! * k - ax, dy = points[i]![1]! - ay;
      const length = dx * dx + dy * dy;
      const t = length > 0 ? Math.max(0, Math.min(1, ((lon * k - ax) * dx + (lat - ay) * dy) / length)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx - lon * k, ay + t * dy - lat));
    }
    return best * UNITS_PER_DEGREE;
  };
  let overWater = 0;
  let deepest = 0;
  let deepestAt = '';
  for (let t = 0; t < triangles; t++) {
    v.fromBufferAttribute(position, t * 3);
    cb.fromBufferAttribute(position, t * 3 + 1);
    cc.fromBufferAttribute(position, t * 3 + 2);
    // Tops: a wall or a shore skirt reaches down to the water on purpose.
    if (Math.min(v.length(), cb.length(), cc.length()) < PLANET_RADIUS + 1) continue;
    const { lat, lon } = toLatLon(centroid.copy(v).add(cb).add(cc));
    for (const lake of lakesAt) {
      const [minLon, minLat, maxLon, maxLat] = lake.box;
      if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
      if (!insideRing(lake.points, lon, lat) || world.countryAt(lat, lon) !== 0) continue;
      overWater++;
      const depth = shoreDistance(lake.points, lon, lat);
      if (depth > deepest) {
        deepest = depth;
        deepestAt = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      }
    }
  }
  const cut = land.userData['lakes'] as { holes: number; splices: number; unpaired: number; droppedFaces: number };
  check(
    overWater <= 400 && deepest <= 30,
    'land drawn over a lake stays within what was measured',
    `${overWater.toLocaleString()} land tops over lake water, deepest ${deepest.toFixed(1)} units in at ${deepestAt}; ` +
      `${cut.holes} holes, ${cut.splices} splices, ${cut.unpaired} unpaired dropping ${cut.droppedFaces} faces`,
  );
}

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
    faceNormalOf(t, n);
    v.fromBufferAttribute(position, t * 3);
    cb.fromBufferAttribute(position, t * 3 + 1);
    cc.fromBufferAttribute(position, t * 3 + 2);
    // Tops only: a cliff is the same colour times 0.72 and asking about a point
    // on a vertical wall is asking which side of the coast it is on.
    if (Math.abs(n.dot(centre.copy(v).normalize())) < 0.5) continue;
    // The mesh paints a colour a vertex (its biome at its own point), so the
    // question is asked at the first corner rather than the centre.
    // Outside the function's domain; see the note above.
    if (world.countryAtPoint(v) === 0) continue;
    meshColor.fromBufferAttribute(color, t * 3);
    groundColorAt(world, v, askedColor);
    const off =
      Math.abs(meshColor.r - askedColor.r) +
      Math.abs(meshColor.g - askedColor.g) +
      Math.abs(meshColor.b - askedColor.b);
    compared++;
    if (off > 0.15) apart++;
    if (off > worst) worst = off;
  }
  // 0.40% on 2026-09-21 (153 of 38,707), so the bound is half a percent: the
  // systematic failure above is thirty times over it either way, and a drift
  // of the residue should say so before it doubles.
  check(
    apart < compared * 0.005,
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
    faceNormalOf(t, n);
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
    // **Signed, because the two signs are two different pictures.** The mesh
    // standing *over* the paving is the seam — a straight line drawn across a
    // town — and the lift is what has to clear it. The mesh running *under*
    // the relief is what the edge slope's foot has to reach: the slope dives
    // `EDGE_FOOT` under `elevationAt` at its shallowest (`edgeSink`), and a
    // mesh further under than that leaves a lip of slope standing over it.
    const error = meshHeight - world.elevationAt(unit);
    if (error > GROUND_LIFT) over++;
    if (-error > EDGE_FOOT) under++;
    if (Math.abs(error) > worstError) {
      worstError = Math.abs(error);
      where = near.place.name;
    }
  }
  // 0.02% on 2026-09-21 (36 of 218,673), against the 1.9% the table above
  // was written at; bounded at 0.04% so a regression to that shows.
  check(
    over < inTown * 0.0004,
    'the mesh under a settlement meets the paving on it',
    `${over} of ${inTown.toLocaleString()} triangles over the ${GROUND_LIFT} lift ` +
      `(${((over / inTown) * 100).toFixed(2)}%), worst |error| ${worstError.toFixed(2)} at ${where}`,
  );
  /**
   * **This was `-error > GROUND_LIFT + KERB_DROP + APRON_SINK`, and it measured
   * from the wrong surface**: that sum is a depth under the *paving*, and
   * `error` is the mesh against the *relief*, three units lower, so it counted
   * meshes ten units under the paving and passed with 0 of 218,595 triangles.
   * Against the edge slope's own shallowest foot, on the same population
   * (2026-09-13): 0.89% more than 0.8 under the relief, **0.48% more than
   * 1.0**, 0.17% more than 1.5, 0.08% more than 2.0. The tolerance is 1%
   * because the bound is ten times stricter than the one it replaces, and
   * because this population is every place's disc rather than the course just
   * outside a built square where the foot actually is — 2.60% there at 1.0, and
   * a bound on the lip rather than the lip itself (see `EDGE_FOOT`).
   */
  // 0.48% again on 2026-09-21 (1,050 of 218,673): bounded at 0.6%.
  check(
    under < inTown * 0.006,
    'the edge slope’s foot reaches the mesh under a settlement',
    `${under} of ${inTown.toLocaleString()} triangles more than ${EDGE_FOOT} under the relief ` +
      `(${((under / inTown) * 100).toFixed(2)}%)`,
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
  /** How far `build-monuments.ts`'s seat pass may walk a landmark: its `SEAT_REACH`. */
  const SEAT_REACH = 160;
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
   * `monuments.json` is `monuments.source.json` after the bake, and nothing
   * said so.
   *
   * The source is the authority and the placed file is what the world reads,
   * so an edit to the source that was never re-baked — a height corrected, a
   * name respelled, a landmark added — shipped the old one silently. The two
   * must list the same landmarks in the same order with the same name, country,
   * height and year, and each placed coordinate must be explained by the bake:
   * no further from the source than its recorded snap plus the most the
   * separation can ask of it — its own footprint and the widest a neighbour
   * may declare, the bake's 12-unit clearance between them, and the 160 units
   * its seat pass may walk a landmark off the coast or off a town
   * (`CLEARANCE` and `SEAT_REACH` in `build-monuments.ts`). The furthest
   * unsnapped move is printed; the Colosseum's 41.2 km, off St Peter's, was
   * the furthest on 2026-09-21.
   */
  {
    const sourceFile = JSON.parse(readFileSync(resolve(here, 'monuments.source.json'), 'utf8')) as {
      monuments: { id: string; name: string; iso: string; lat: number; lon: number; height?: number; year?: number }[];
      notes?: Record<string, string>;
      shore?: string[];
      plazas?: string[];
    };
    const shoreList = new Set(sourceFile.shore ?? []);
    const plazaList = new Set(sourceFile.plazas ?? []);
    const sourceList = sourceFile.monuments;
    const stale: string[] = [];
    if (sourceList.length !== monuments.length) stale.push(`${sourceList.length} in the source, ${monuments.length} placed`);
    const KM_PER_UNIT = 6371 / PLANET_RADIUS;
    let furthest = 0;
    let furthestId = '';
    sourceList.forEach((want, i) => {
      const got = monuments[i];
      if (got === undefined || got.id !== want.id) {
        stale.push(`row ${i} is ${got?.id ?? 'missing'}, the source says ${want.id}`);
        return;
      }
      for (const key of ['name', 'iso', 'height', 'year'] as const) {
        if (got[key] !== want[key]) stale.push(`${want.id} ${key} ${String(got[key])} vs ${String(want[key])}`);
      }
      // The card's sentence rides the same bake: a note edited in the source
      // and never re-baked is the old sentence on the player's screen.
      if ((got.shore === true) !== shoreList.has(want.id)) stale.push(`${want.id} shore ${String(got.shore)} vs the source's list`);
      if ((got.setting === 'plaza') !== plazaList.has(want.id)) stale.push(`${want.id} setting ${String(got.setting)} vs the source's plazas`);
      const note = sourceFile.notes?.[want.id];
      if ((got as { note?: string }).note !== note) stale.push(`${want.id} note differs from the source`);
      if (note === undefined) stale.push(`${want.id} has no note in the source`);
      const km = (at(want.lat, want.lon).angleTo(at(got.lat, got.lon)) * PLANET_RADIUS) * KM_PER_UNIT;
      const spread = km - (got.snappedKm ?? 0);
      const reach = ((got.footprint ?? MAX_FOOTPRINT) + MAX_FOOTPRINT + 12 + SEAT_REACH) * KM_PER_UNIT;
      if (spread > reach) stale.push(`${want.id} is ${km.toFixed(1)} km from its source, ${(got.snappedKm ?? 0).toFixed(1)} of it snapped`);
      if (spread > furthest) {
        furthest = spread;
        furthestId = want.id;
      }
    });
    check(
      stale.length === 0,
      'monuments.json is the source, baked',
      stale.length > 0 ? stale.slice(0, 5).join('; ') : `furthest moved past its snap: ${furthestId}, ${furthest.toFixed(1)} km`,
    );
  }

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
      const need = (declared.get(a.id) ?? MAX_FOOTPRINT) + (declared.get(b.id) ?? MAX_FOOTPRINT);
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
    const want = declared.get(m.id) ?? MAX_FOOTPRINT;
    if (Math.abs((m.footprint ?? MAX_FOOTPRINT) - want) > 1e-6) {
      wrongFootprint.push(`${m.id} ${m.footprint ?? 'absent'} vs ${want}`);
    }
  }
  check(
    wrongFootprint.length === 0,
    'every placement carries its model\'s footprint',
    wrongFootprint.length > 0 ? `${wrongFootprint.slice(0, 4).join('; ')} — run \`pnpm monuments\`` : '',
  );

  /**
   * And the plan its model stands in, which is what the pad is cut to, the
   * towns leave unbuilt and the roads keep off (`landmark-ground.ts`). Built
   * here from the model files, the box of every vertex rounded out to half a
   * unit, and held to the bake's: a model that grew after the last bake is a
   * landmark reaching past the ground made for it.
   */
  /**
   * **And no two colours in one plane**, the kit's rule (`fightsIn`, which
   * `pnpm scenery` holds every scenic part to): two faces facing one way in
   * one plane, of two colours, overlapping where the camera sees them, are
   * drawn at one depth and flicker as the camera moves. The ink used to draw
   * over most of it; without it, the Sagrada Familia's cornices and roofs
   * flickered across the whole nave. A monument is asked it with a wider
   * `coplanar` than a house, because it is looked at from much further off:
   * on foot the near plane is about 1.8 units, and a 24-bit depth buffer's
   * step at 1,250 units is then about 0.05 units, `MONUMENT_COPLANAR`, so a
   * trim laid a few hundredths off its wall flickers as surely as a flush
   * one. `PROUD` in `monuments/contract.ts` is the step that clears it. A
   * monument's tapers and struts are not exactly parallel to what they meet,
   * so two faces within `MONUMENT_PARALLEL` of parallel count as one plane.
   * On 2026-09-28, 46 of the 85 models failed it at 0.02 and 9 more between
   * 0.02 and 0.05.
   */
  const MONUMENT_COPLANAR = 0.05;
  const MONUMENT_PARALLEL = 1e-4;
  {
    const ctx = createContext();
    const wrongPlan: string[] = [];
    const fighting: string[] = [];
    let measured = 0;
    for (const file of readdirSync(modelDir).sort()) {
      if (!file.endsWith('.ts') || file === 'contract.ts' || file === 'index.ts') continue;
      const module = (await import(`../src/monuments/${file}`)) as Record<string, unknown>;
      const model = Object.values(module).find(
        (value): value is Monument => typeof (value as Monument | undefined)?.build === 'function' && typeof (value as Monument).id === 'string',
      );
      if (model === undefined) continue;
      const position = mergeMeshes(model.build(ctx)).position;
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (let i = 0; i < position.length; i += 3) {
        x0 = Math.min(x0, position[i]!);
        x1 = Math.max(x1, position[i]!);
        z0 = Math.min(z0, position[i + 2]!);
        z1 = Math.max(z1, position[i + 2]!);
      }
      const want = [Math.floor(x0 * 2) / 2, Math.ceil(x1 * 2) / 2, Math.floor(z0 * 2) / 2, Math.ceil(z1 * 2) / 2];
      const got = monuments.find((m) => m.id === model.id)?.plan;
      measured++;
      if (got === undefined || got.some((v, i) => v !== want[i])) wrongPlan.push(`${model.id} ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
      const fought = fightsIn(model.build(ctx), { coplanar: MONUMENT_COPLANAR, parallel: MONUMENT_PARALLEL });
      if (fought.length > 0) {
        fought.sort((a, b) => b.exposed - a.exposed);
        const worst = fought[0]!;
        fighting.push(`${model.id} (${fought.length}: ${worst.exposed.toFixed(2)} u² at y ${worst.y.toFixed(1)}, ${worst.a} against ${worst.b})`);
      }
    }
    check(
      wrongPlan.length === 0 && measured > 0,
      `every placement carries its model's plan`,
      wrongPlan.length > 0 ? `${wrongPlan.slice(0, 3).join('; ')} — run \`pnpm monuments\`` : `${measured} models built and measured`,
    );
    check(
      fighting.length === 0 && measured > 0,
      'no monument draws two colours in one plane',
      fighting.length > 0 ? `${fighting.length} of ${measured}:\n      ${fighting.join('\n      ')}` : `${measured} models`,
    );
  }

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
  // `elevationAt` is the shelf plus the relief and will not hand back either
  // half, so the relief comes off again — normalised exactly the way `geo.ts`
  // normalises it, or the two evaluations differ in their last bits.
  const shelfAt = (lat: number, lon: number): number => {
    if (world.countryAt(lat, lon) === 0) return 0;
    const p = at(lat, lon);
    const length = Math.hypot(p.x, p.y, p.z) || 1;
    return world.elevationAt(p) - reliefAt(p.x / length, p.y / length, p.z / length);
  };
  /**
   * A step smaller than this is not a step. Chosen while a person was 6.8
   * units tall; a person is 3.77 since 2026-09-24, and a stair's riser 0.32.
   */
  const SHELF_TOLERANCE = 0.5;

  /**
   * The plan grown by `d`, shrunk for a negative `d`, as points at most
   * `SEAT_STEP` apart in the landmark's frame: the part of the box's outline
   * inside the disc and of the disc's inside the box (`PlanShape`). Written
   * again rather than imported from the bake, which is a script.
   */
  const SEAT_STEP = 4;
  const ringOf = (shape: PlanShape, d: number): [number, number][] => {
    const inside = (x: number, z: number): boolean => {
      if (Math.hypot(x, z) > shape.radius + d + 1e-6) return false;
      if (d >= 0) return Math.hypot(Math.max(Math.abs(x - shape.cx) - shape.hx, 0), Math.max(Math.abs(z - shape.cz) - shape.hz, 0)) <= d + 1e-6;
      return Math.abs(x - shape.cx) <= shape.hx + d + 1e-6 && Math.abs(z - shape.cz) <= shape.hz + d + 1e-6;
    };
    const points: [number, number][] = [];
    const around = Math.max(0, shape.radius + d);
    const n = Math.max(24, Math.ceil((2 * Math.PI * around) / SEAT_STEP));
    for (let k = 0; k < n; k++) {
      const x = Math.cos((k / n) * Math.PI * 2) * around;
      const z = Math.sin((k / n) * Math.PI * 2) * around;
      if (inside(x, z)) points.push([x, z]);
    }
    if (Number.isFinite(shape.hx)) {
      const hx = Math.max(0, shape.hx + Math.min(d, 0));
      const hz = Math.max(0, shape.hz + Math.min(d, 0));
      const bend = Math.max(0, d);
      const corners: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (const [x0, z0, x1, z1] of [
        [hx + bend, -hz, hx + bend, hz], [hx, hz + bend, -hx, hz + bend],
        [-hx - bend, hz, -hx - bend, -hz], [-hx, -hz - bend, hx, -hz - bend],
      ] as const) {
        const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / SEAT_STEP));
        for (let i = 0; i < count; i++) {
          const x = shape.cx + x0 + ((x1 - x0) * i) / count;
          const z = shape.cz + z0 + ((z1 - z0) * i) / count;
          if (inside(x, z)) points.push([x, z]);
        }
      }
      if (bend > 0) {
        const arc = Math.max(2, Math.ceil((bend * Math.PI) / 2 / SEAT_STEP));
        corners.forEach(([sx, sz], c) => {
          for (let i = 1; i < arc; i++) {
            const angle = (c * Math.PI) / 2 + ((Math.PI / 2) * i) / arc;
            const x = shape.cx + sx * hx + Math.cos(angle) * bend;
            const z = shape.cz + sz * hz + Math.sin(angle) * bend;
            if (inside(x, z)) points.push([x, z]);
          }
        });
      }
    }
    return points;
  };
  const frameUp = new Vector3();
  const frameAcross = new Vector3();
  const frameNorth = new Vector3();
  const ringPoint = new Vector3();
  /** Each point of a landmark's ring at `d`, as a direction on the unit sphere. */
  const eachOnRing = (m: { lat: number; lon: number }, shape: PlanShape, d: number, visit: (p: Vector3) => void): void => {
    unitAt(m.lat, m.lon, frameUp);
    townFrame(frameUp, frameAcross, frameNorth);
    for (const [x, z] of ringOf(shape, d)) {
      offsetDirection(frameUp, frameAcross, frameNorth, x, z, ringPoint);
      // The rings are cut along the antimeridian and the seam belongs to
      // neither side; the South Pole's rings all cross it.
      if (Math.abs(lonOf(ringPoint.x, ringPoint.z)) === 180) unitAt(latOf(ringPoint.y), 179.9999999, ringPoint);
      visit(ringPoint);
    }
  };
  const shelfAtPoint = (p: Vector3): number => {
    if (world.countryAtPoint(p) === 0) return 0;
    const length = p.length() || 1;
    return world.elevationAt(p) - reliefAt(p.x / length, p.y / length, p.z / length);
  };

  let worstTilt = 0;
  let tiltedAt = '';
  for (const m of monuments) {
    const shape = planShape(m);
    const level = world.elevationAt(at(m.lat, m.lon));
    const shelf = shelfAt(m.lat, m.lon);
    // The plan's own edge and a ring halfway in: the ground the model stands on.
    for (const d of [-Math.min(shape.hx, shape.hz, shape.radius) / 2, 0]) {
      eachOnRing(m, shape, d, (p) => {
        if (Math.abs(shelfAtPoint(p) - shelf) > SHELF_TOLERANCE) return;
        const tilt = Math.abs(world.elevationAt(p) - level);
        if (tilt > worstTilt) {
          worstTilt = tilt;
          tiltedAt = m.id;
        }
      });
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
   * every one of these stood twenty units over the sea whatever its deficit
   * was. It does not imply it any more. What decides how a model over water
   * *reads* is the height of its own ground above that water, and that is
   * printed here beside the deficit because it is the number a screenshot
   * shows — measured, over the twelve, 4.1 to **21.0** units before
   * `SHORE_CEILING` and 4.0 for every one of them after.
   */
  /** The bake's `clearance`: the last ring out from the plan's spine wholly on the centre's shelf. */
  const clearanceAt = (m: { lat: number; lon: number }, shape: PlanShape, limit: number): number => {
    const shelf = shelfAt(m.lat, m.lon);
    for (let d = -Math.floor(Math.min(shape.radius, shape.hx, shape.hz) / SEAT_STEP) * SEAT_STEP; d <= limit; d += SEAT_STEP) {
      let dry = true;
      eachOnRing(m, shape, d, (p) => {
        if (dry && Math.abs(shelfAtPoint(p) - shelf) > SHELF_TOLERANCE) dry = false;
      });
      if (!dry) return d - SEAT_STEP;
    }
    return limit;
  };
  /** Share of a plan with water under it, and its ground height. */
  const overWater = (m: { lat: number; lon: number }, shape: PlanShape): { wet: number; over: number } => {
    let wet = 0;
    let total = 0;
    for (let d = -Math.min(shape.radius, shape.hx, shape.hz); d <= 0; d += SEAT_STEP) {
      eachOnRing(m, shape, d, (p) => {
        total++;
        if (world.countryAtPoint(p) === 0) wet++;
      });
    }
    return { wet: (wet / Math.max(1, total)) * 100, over: world.elevationAt(at(m.lat, m.lon)) };
  };
  const stale: string[] = [];
  const overhanging: string[] = [];
  let worstDrop = 0;
  const ashore: string[] = [];
  for (const m of monuments) {
    const shape = planShape(m);
    const got = clearanceAt(m, shape, SHORE_CLEAR);
    if (Math.abs(got - (m.clearance ?? -Infinity)) > 1e-6) {
      stale.push(`${m.id} ${got} vs ${m.clearance ?? 'absent'}`);
    }
    if (got >= 0) continue;
    if (m.shore !== true) ashore.push(`${m.id} ${-got}u`);
    const { wet, over } = overWater(m, shape);
    worstDrop = Math.max(worstDrop, over);
    overhanging.push(`${m.id} ${-got}u ${wet.toFixed(0)}% ${over.toFixed(1)}`);
  }
  check(
    stale.length === 0,
    'every monument stands on the ground the bake seated it on',
    stale.length > 0 ? `${stale.slice(0, 4).join('; ')} — run \`pnpm monuments\`` : '',
  );
  /**
   * **No landmark stands over the water but the ones that are made of it.**
   * The Sagrada Familia stood 30 units of its 38 over the Mediterranean,
   * because a short move could not seat it and the bake left it where it was;
   * every landmark on dry land is seated now, however far it takes, and only
   * the source's `shore` list — a tidal island, a strait, a mosque built over
   * the sea — may reach past the coast. Its plan, measured from the model; not
   * the disc of its footprint, whose corners are ground the model never uses.
   */
  check(
    ashore.length === 0,
    'no landmark but a shore one has water under its plan',
    ashore.length > 0 ? `${ashore.slice(0, 5).join('; ')} — list it as shore or run \`pnpm monuments\`` : '',
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
    `  --   ${overhanging.length} of ${monuments.length} stand over water, all of them shore — id, water this far into the plan, ` +
    `share of it wet, units above the sea:\n       ${overhanging.join(' · ')}`,
  );
  check(
    worstDrop <= SHORE_LIP + 0.5,
    'nothing standing over water stands more than the shore lip above it',
    `worst ${worstDrop.toFixed(1)} against lip ${SHORE_LIP}`,
  );

  /**
   * **No landmark takes a town's roads.** A gate a landmark stands on is shut
   * (`gateUnderLandmark`), so a landmark on top of a small town left it with
   * none: Granada's, Bilbao's and Djenné's roads ended in the walls of the
   * Alhambra, the Guggenheim and the mosque. The bake moves a landmark that
   * would take more than half a town's gates off it (`landmarkTakes`), and
   * this asks every built town near every landmark again. A landmark in the
   * middle of a city with its gates free — the Forbidden City — is the town
   * wrapping round it, and passes.
   */
  {
    const takers: string[] = [];
    let asked = 0;
    let partly = 0;
    for (const m of monuments) {
      const shape = planShape(m);
      const up = at(m.lat, m.lon).normalize();
      for (const place of placesRaw) {
        if (!isShown(place)) continue;
        const reach = radiusOf(place) + planReach(shape) + APPROACH + LANDMARK_KEEP;
        if (placeDirection(place, new Vector3()).angleTo(up) * PLANET_RADIUS > reach) continue;
        asked++;
        const taken = landmarkTakes(place, up, shape);
        if (taken.gates.length > 0) partly++;
        if (taken.gates.length * 2 > taken.of) takers.push(`${m.id} takes ${taken.gates.length} of ${place.name}'s ${taken.of} gates`);
      }
    }
    check(
      takers.length === 0,
      'no landmark takes more than half a town\'s gates',
      takers.length > 0 ? `${takers.slice(0, 4).join('; ')} — run \`pnpm monuments\`` : `${asked} towns near a landmark, ${partly} with a gate under one`,
    );
  }
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
  const sourceHeight = new Map(
    (JSON.parse(readFileSync(resolve(here, 'monuments.source.json'), 'utf8')) as {
      monuments: { id: string; height?: number }[];
    }).monuments.map((m) => [m.id, m.height]),
  );
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
    // The model's `realHeight` and the source's `height` are the same metres
    // written twice — the card reads the second — so they have to agree.
    const realHeight = field(text, 'realHeight');
    const height = sourceHeight.get(id);
    if ((realHeight === null ? undefined : Number(realHeight)) !== height) {
      drifted.push(`${id} realHeight ${realHeight ?? 'none'} vs height ${height ?? 'none'}`);
    }
  }

  // **A scan that compared nothing proves nothing**, and it used to pass: a
  // change to how the model files are written would have made every one of
  // them `could not scan`, and the check above would have reported zero drift
  // over zero files. So every model file must be read, and there must be one.
  check(
    drifted.length === 0 && compared > 0 && unchecked.length === 0,
    `${compared} model files match the placement data`,
    [...drifted, ...(unchecked.length > 0 ? [`could not scan: ${unchecked.join(', ')}`] : [])].join('; '),
  );
  check(orphans.length === 0, 'every model has a placement', orphans.join('; '));
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
   * one, and the separation it uses is `radiusOf(a) + radiusOf(b)` — imported
   * from `places.ts`, so **the bake is a function of a constant that lives in
   * `src/`**. Widen `radiusFor` and nothing in the data changes and nothing in
   * the world complains: the towns simply start interpenetrating, each laying
   * its own paving over the other's, which is the failure that reads as a bug in
   * the settlement builder. This is the assertion that says *re-bake the places*
   * instead. It reads `radiusOf`, not the law, because a city the bake fitted
   * between its neighbours is only clear of them at the radius it was fitted to
   * — and the stored radius is a whole unit, floored, so the clearance the bake
   * tested survives both the wire and this arithmetic.
   *
   * The search has to go out to `radiusOf(p) + BIGGEST_SETTLEMENT` and not to
   * the nearest neighbour, because the binding conflict is not always the
   * closest one: a hamlet 60 units away clears a 30-unit town and a metropolis
   * 120 units away does not.
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
      const radius = radiusOf(p);
      const a = Math.floor((p.lat + 90) / CELL);
      const b = Math.floor((p.lon + 180) / CELL);
      const dLat = Math.ceil((radius + BIGGEST_SETTLEMENT) / (PLANET_RADIUS * DEG) / CELL);
      const span = Math.min(360, Math.ceil(dLat / Math.max(0.02, Math.cos(p.lat * DEG))));
      for (let da = -dLat; da <= dLat; da++) {
        for (let db = -span; db <= span; db++) {
          for (const j of cells.get(cellKey(a + da, b + db)) ?? []) {
            if (j <= i) continue;
            const q = places[j]!;
            const want = radius + radiusOf(q);
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
   * The two things the thinning writes beside a row rather than deriving from
   * it: a fitted radius and the names it folded in.
   *
   * A stored radius is only ever *smaller* than the law's — the bake fits a
   * city into the room its neighbours leave, or shrinks a host to give one
   * room, and grows nothing — and a whole unit, which is what lets the overlap
   * assertion above hold at the radius the bake tested. And every alias has to
   * reach a built town in its own country through `Places.aliases`, because
   * the menu offers only built towns and an alias that reached a hidden one
   * would be dropped there without a word — except where the country has no
   * built town at all, which is Bahrain (2026-09-21): Manama stands inside Al
   * Muharraq and Al Muharraq is hidden by Dammam, so the honest answer to
   * *Manama* is nothing, and the check lists it rather than failing on it.
   */
  {
    const stored = places.filter((p) => p.radius !== undefined);
    const badRadius = stored.filter(
      (p) => !Number.isInteger(p.radius) || p.radius! >= radiusFor(p.pop) || p.radius! < SMALLEST_SETTLEMENT,
    );
    check(
      badRadius.length === 0,
      'a stored radius is a whole unit under the law’s',
      badRadius.length === 0
        ? `${stored.length} places built smaller than \`radiusFor\`, ${stored.filter(isShown).length} of them shown`
        : badRadius.slice(0, 4).map((p) => `${p.name} ${p.radius} against ${radiusFor(p.pop).toFixed(1)}`).join(', '),
    );
    const aliases = index.aliases();
    const builtIn = new Set(places.filter(isShown).map((p) => p.iso));
    let written = 0;
    const wrong: string[] = [];
    const unreached: string[] = [];
    for (const host of places) {
      for (const name of host.aliases ?? []) {
        written++;
        const town = aliases.get(name);
        if (town === undefined) {
          if (builtIn.has(host.iso)) wrong.push(`${name} unreached`);
          else unreached.push(`${name} (${host.iso})`);
        } else if (!isShown(places[town]!) || places[town]!.iso !== host.iso) {
          wrong.push(`${name} -> ${places[town]!.name}`);
        }
      }
    }
    check(
      wrong.length === 0,
      'every alias finds a built town in its own country',
      `${aliases.size} of ${written} names, to ${new Set(aliases.values()).size} towns` +
        (unreached.length > 0 ? `; ${unreached.length} in a country with none built: ${unreached.join(', ')}` : '') +
        (wrong.length > 0 ? `; ${wrong.slice(0, 4).join(', ')}` : ''),
    );
  }

  /**
   * **Nobody arrives inside a landmark.** Every arrival — the menu's town, a
   * link's `?at=`, `/goto` (a built town, a name folded into one or a
   * country's seat, which are all built towns), `/home`, `/tp`, the map's
   * join — is carried out of every landmark's plan by `clearOfPlans` before
   * the body is put down (`arrivalAt` in `main.ts`), because a monument's
   * walls are measured from outside and a body inside one has no way out.
   * Replayed here for every built town's own point, with the same dry-ground
   * preference; the count of towns whose point stood within the clearance is
   * what the rule saves.
   */
  {
    const sites = placed.map(plannedSite);
    const nearestGap = (p: { x: number; y: number; z: number }): number => {
      let best = Infinity;
      for (const site of sites) {
        if (p.x * site.up.x + p.y * site.up.y + p.z * site.up.z < Math.cos((site.reach + 4 * ARRIVAL_CLEARANCE) / PLANET_RADIUS)) continue;
        best = Math.min(best, siteGap(site, p, PLANET_RADIUS));
      }
      return best;
    };
    const probe = new Vector3();
    const dry = (p: { x: number; y: number; z: number }): boolean =>
      !isWater(groundRadius(world, probe.set(p.x, p.y, p.z).multiplyScalar(PLANET_RADIUS)));
    const point = { x: 0, y: 0, z: 0 };
    const before: string[] = [];
    let insidePlan = 0;
    let wet = 0;
    const after: string[] = [];
    for (const place of places) {
      if (!isShown(place)) continue;
      unitAt(place.lat, place.lon, point);
      const was = nearestGap(point);
      if (was >= ARRIVAL_CLEARANCE) continue;
      before.push(`${place.name} ${was.toFixed(0)}`);
      if (was <= 0) insidePlan++;
      clearOfPlans(point, sites, PLANET_RADIUS, point, ARRIVAL_CLEARANCE, dry);
      const now = nearestGap(point);
      if (now < ARRIVAL_CLEARANCE - 0.01) after.push(`${place.name} ${now.toFixed(1)}`);
      if (!dry(point)) wet++;
    }
    check(
      after.length === 0,
      'no arrival at a built town is inside a landmark’s plan',
      `${before.length} town points within ${ARRIVAL_CLEARANCE} units of a plan, ${insidePlan} inside one, all carried out` +
        (wet > 0 ? `, ${wet} onto water` : '') +
        (before.length > 0 ? ` (${before.slice(0, 6).join(', ')})` : '') +
        (after.length > 0 ? `; still in: ${after.slice(0, 4).join(', ')}` : ''),
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
      && labelRadiusOf({ pop: 1 }) > radiusFor(1),
    'the settlement radius spreads, and the label band is outside it',
    `hamlet ${radiusFor(5_000).toFixed(0)}u built / ${labelRadiusOf({ pop: 5_000 }).toFixed(0)}u named, ` +
    `Shanghai ${radiusFor(24_900_000).toFixed(0)}u / ${labelRadiusOf({ pop: 24_900_000 }).toFixed(0)}u, ` +
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
   * assertions: see `PROMINENCE_RADIUS` in `places.ts` for the table these rows
   * come from. Mallorca is the island the rule was written for and the pairs
   * are the ones a pure "bigger place nearby" rule got wrong.
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
  check(nearUs < 200 * TIME_SCALE, 'nearest place under 200 us', `${nearUs.toFixed(1)} us per query`);
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
    ['Sahel', 14.0, 5.0, 'savanna'],
    ['Himalaya', 28.0, 86.9, 'ice'],
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

  /**
   * **The known misses, which this list used to assert as right.** Four of the
   * named places were pinned to what the model says rather than to what the
   * ground is — the Empty Quarter as savanna, the Atacama as steppe, the
   * Serengeti as tropical forest, the Kazakh steppe as temperate — so the check
   * passed by agreeing with the error, and fixing one would have failed it.
   * `biome.ts` writes down why each is missed; here they are what the ground
   * really is, printed rather than failed, and a line says so when one comes
   * right.
   */
  const misses: [string, number, number, string][] = [
    ['Empty Quarter', 20.0, 50.0, 'desert'],
    ['Atacama', -23.5, -69.0, 'desert'],
    ['Serengeti', -2.5, 34.8, 'savanna'],
    ['Kazakhstan', 48.0, 68.0, 'steppe'],
  ];
  const known = misses.map(([name, lat, lon, real]) => {
    const got = biomeOf(lat, lon);
    return got === real ? `${name} is ${real} now — move it up` : `${name} ${got}, is ${real}`;
  });
  console.log(`  --   known misses (biome.ts): ${known.join(' · ')}`);

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
    // The gates a town may not raise, against the whole network, as the game has them.
    holdGates(roads, settled, world);

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
      if (classOf(settled[road.a]!, settled[road.b]!) !== road.cls) misclassed++;
    }
    check(misclassed === 0, 'every road is the class its two ends earn', `${misclassed} wrong`);

    const point = new Vector3();
    const walk = emptyCourse();
    let wet = 0;
    let probes = 0;
    let bridges = 0;
    let widest = 0;
    let badBridges = 0;
    const wetNames: string[] = [];
    const bridgeNames: string[] = [];
    const began = Date.now();
    for (const road of roads) {
      const course = courseOf(road, settled, walk);
      const steps = waterProbeSteps(course);
      probes += steps + 1;
      const bridged = road.bridgeTo > road.bridgeFrom;
      const path = bridged ? coursePath(course) : null;
      let wetHere = false;
      for (let step = 0; step <= steps; step++) {
        coursePoint(course, step / steps, point);
        const { lat, lon } = toLatLon(point);
        if (world.countryAt(lat, lon) === 0) {
          // Water is allowed on its bridge's span and nowhere else.
          if (path !== null) {
            const s = distanceAt(path, step / steps);
            if (s > road.bridgeFrom && s < road.bridgeTo) {
              wetHere = true;
              continue;
            }
          }
          wet++;
          if (wetNames.length < 5) wetNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
          break;
        }
      }
      if (bridged) {
        bridges++;
        widest = Math.max(widest, road.bridgeTo - road.bridgeFrom);
        // A bridge crosses water, is no wider than the rule, and leaves room on land for its ramps.
        if (!wetHere || road.bridgeTo - road.bridgeFrom > BRIDGE_SPAN + 1e-6 || road.bridgeFrom < BRIDGE_LAND || road.bridgeTo + BRIDGE_LAND > path!.length) {
          badBridges++;
        }
        if (bridgeNames.length < 6) bridgeNames.push(`${settled[road.a]!.name}-${settled[road.b]!.name} ${(road.bridgeTo - road.bridgeFrom).toFixed(0)}`);
      }
    }
    check(
      wet === 0,
      `no road crosses water except on its bridge`,
      wet === 0
        ? `${probes.toLocaleString()} probes along the courses, gate to gate, in ${Date.now() - began} ms`
        : `${wet} do: ${wetNames.join(', ')}`,
    );
    check(
      badBridges === 0,
      `every bridge spans water, no wider than ${BRIDGE_SPAN} units, with land for its ramps`,
      `${bridges} bridges, the widest ${widest.toFixed(0)} units: ${bridgeNames.join(', ')}`,
    );
    // And a boat passes under: the deck over the middle of the water stands at `DECK_HEIGHT` or near it.
    {
      const ramp = emptyRamp();
      let lowest = Infinity;
      for (const road of roads) {
        if (road.bridgeTo <= road.bridgeFrom) continue;
        rampOf(road, courseOf(road, settled, walk), settled, world, ramp);
        lowest = Math.min(lowest, bridgeDeck(ramp, (road.bridgeFrom + road.bridgeTo) / 2));
      }
      check(bridges === 0 || lowest >= 14, 'every deck stands high over the middle of its water', `lowest ${lowest.toFixed(1)} units over the sea`);
    }

    /**
     * Every road starts and stops on a gate its two towns can use.
     *
     * **This is the contract the square was built for** — a town stands on a
     * square base and the roads connect to it there — and it is three things
     * per road end, each a way the join has gone wrong before:
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
      const near = Array.from({ length: 6 }, () => new Vector3());
      const far = Array.from({ length: 6 }, () => new Vector3());
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
          vertices += 6;
          // The top's two edges. The bank's feet are laid `SHOULDER_DROP` under
          // the relief, which inside a square is under its paving as well, and
          // since the bank was laid gentler (2026-09-25) a road that curls round
          // its own town reaches in under it by a unit or two.
          for (const vertex of [far[2]!, far[3]!]) {
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
            for (const vertex of [far[2]!, far[3]!]) {
              kerbs++;
              const error = Math.abs(vertex.length() - kerb);
              if (error > 1e-3) kerbWrong++;
              kerbWorst = Math.max(kerbWorst, error);
            }
          }
          if (k > 0) {
            if (measureSag) {
              const middle = world.elevationAt(unitAt.addVectors(near[2]!, far[3]!).normalize());
              const chordMiddle = (near[2]!.length() + near[3]!.length() + far[2]!.length() + far[3]!.length()) / 4;
              const sag = PLANET_RADIUS + middle - chordMiddle;
              sagSections++;
              if (sag > 0) sagOver++;
              if (sag > sagWorst) sagWorst = sag;
            }
          }
          // And a third town: the centre line against every built disc nearby.
          unitAt.addVectors(far[2]!, far[3]!).normalize();
          const { lat, lon } = toLatLon(unitAt);
          const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
          const lonSpan = Math.ceil(1 / Math.max(0.02, Math.cos(lat * DEG)));
          const col = Math.floor((lon + 180) / CELL);
          for (let r = Math.max(0, row - 1); r <= Math.min(ROWS - 1, row + 1); r++) {
            for (let c = col - lonSpan; c <= col + lonSpan; c++) {
              for (const j of grid[r * COLS + (((c % COLS) + COLS) % COLS)]!) {
                if (j === road.a || j === road.b) continue;
                const limit = radiusOf(settled[j]!);
                shownAt.copy(shownUnit[j]!);
                const gap = unitAt.angleTo(shownAt) * PLANET_RADIUS;
                if (gap >= limit) continue;
                through++;
                throughWorst = Math.max(throughWorst, limit - gap);
                throughNames.add(`${settled[road.a]!.name}-${settled[road.b]!.name} through ${settled[j]!.name}`);
              }
            }
          }
          for (let j = 0; j < 6; j++) near[j]!.copy(far[j]!);
        }
      }
      check(
        inside === 0,
        'no ribbon top stands inside either of its own towns’ squares',
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
      // 0.007% on 2026-09-21 (6 of 87,934 sections), bounded at 0.02%.
      check(
        sagOver < sagSections * 0.0002,
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

      /**
       * And where two ribbons overlap, one set of markings: every road's
       * edge lines and centre dash walked along its near band's own pieces,
       * through the runs the ribbon paints them in (`markingRuns`), and each
       * painted point measured against every other road's centre line on
       * its own. No edge line is further into another road's carriageway than
       * that road's own edge line (`EDGE_KEEP`), and none of it at all inside
       * one drawn in front; no dash is inside a carriageway drawn in front.
       */
      {
        const markBegan = Date.now();
        const stationsM: number[] = [];
        const nearM = Array.from({ length: 6 }, () => new Vector3());
        const farM = Array.from({ length: 6 }, () => new Vector3());
        const nL = new Vector3();
        const nR = new Vector3();
        const fL = new Vector3();
        const fR = new Vector3();
        const centreAt = new Vector3();
        const painted = new Vector3();
        const runsM: number[] = [];
        const nearestM = { distance: 0, s: 0 };
        let roadsMarked = 0;
        let pointsM = 0;
        let edgeInside = 0;
        let dashInside = 0;
        let edgeWorst = 0;
        const edgeNames: string[] = [];
        for (let r = 0; r < roads.length; r++) {
          coursePoint(courseOf(roads[r]!, settled, scratchCourse), 0.5, middle);
          const others = otherRoadsOf(roads, r, index, pathOf, rampFor, middle);
          if (others.length === 0) continue;
          roadsMarked++;
          const course = courseOf(roads[r]!, settled, emptyCourse());
          const path = pathOf(r);
          const ramp = rampFor(r);
          const half = ROAD_CLASSES[roads[r]!.cls]!.width * 0.5;
          ribbonStations(path.length, course.approach, ramp, 18, stationsM);
          for (let k = 1; k < stationsM.length; k++) {
            const s0 = stationsM[k - 1]!;
            const s1 = stationsM[k]!;
            const sm = (s0 + s1) * 0.5;
            coursePoint(course, parameterAt(path, sm), centreAt);
            let close = false;
            for (const other of others) {
              nearestOnPath(other.path, centreAt, nearestM);
              if (nearestM.distance < other.half + 30 + (s1 - s0)) close = true;
            }
            if (!close) continue;
            ribbonSection(world, course, path, ramp, half, s0, nearM);
            ribbonSection(world, course, path, ramp, half, s1, farM);
            carriageEdges(nearM, ribbonHalf(ramp, half, s0, path.length - s0), half, nL, nR);
            carriageEdges(farM, ribbonHalf(ramp, half, s1, path.length - s1), half, fL, fR);
            const length = s1 - s0;
            for (const [across, gives, dash] of [
              [0.5, dashGives, true], [edgeLineAcross(half, false), edgeGives, false], [edgeLineAcross(half, true), edgeGives, false],
            ] as const) {
              const runs = markingRuns(others, nL, nR, fL, fR, across, gives, runsM);
              for (let q = 0; q < runs.length; q += 2) {
                const a0 = runs[q]! + 0.1 / length;
                const a1 = runs[q + 1]! - 0.1 / length;
                if (a1 <= a0) continue;
                for (let j = 0; j <= 8; j++) {
                  const along = a0 + ((a1 - a0) * j) / 8;
                  painted.copy(nL).lerp(nR, across).lerp(centreAt.copy(fL).lerp(fR, across), along).normalize();
                  pointsM++;
                  for (const other of others) {
                    const on = nearestOn(other.path, painted);
                    if (on.pastCap) continue;
                    const deep = other.half - on.distance;
                    if (dash) {
                      if (other.front && deep > 0.05 + 0.02) dashInside++;
                    } else if (deep > (other.front ? 0.05 : EDGE_KEEP) + 0.02) {
                      edgeInside++;
                      edgeWorst = Math.max(edgeWorst, deep);
                      if (edgeNames.length < 3) {
                        edgeNames.push(`${settled[roads[r]!.a]!.name}-${settled[roads[r]!.b]!.name}`);
                      }
                    }
                  }
                }
              }
            }
          }
        }
        check(
          edgeInside === 0 && dashInside === 0 && pointsM > 0,
          'where two ribbons overlap one set of markings shows: no edge line or dash inside the other road’s carriageway',
          `${roadsMarked.toLocaleString()} roads beside another, ${pointsM.toLocaleString()} painted points walked; ` +
            `${edgeInside} edge-line points inside (worst ${edgeWorst.toFixed(2)}), ${dashInside} dash points inside a road in front, ` +
            `in ${Date.now() - markBegan} ms` + (edgeNames.length > 0 ? `: ${edgeNames.join('; ')}` : ''),
        );
      }
    }

    /**
     * The shape of the graph, as a line to read and one band.
     *
     * **Counted over the built towns and not over `places.bin`**, which is the
     * only vertex set the network has now: averaging a degree over every row
     * would divide by three times the towns that can carry a road and say
     * nothing about the map. A mean near two is a chain and near six is a
     * hairball; the band is unchanged at 2.8 to 4.5 and has never been widened.
     * The median is the number that matters — a town needs a few roads out of
     * it, not twenty — and it is 4.
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
     *   the assertion the whole network turns on: if it holds there are no dead
     *   ends at unbuilt villages, no junctions standing on nothing and no road
     *   that ends in a field, by construction rather than by a pass.
     * - **No road crosses ground steeper than `MAX_SLOPE`**: two towns are
     *   connected only if the road never crosses a mountain. Re-walked rather
     *   than trusted, the same way the water test is: the bake tests a course
     *   and writes down a `bend` and two gates, and if the two ever drift,
     *   every road in the world would still be a road between two real towns
     *   and some of them would climb a scree face. `crossesScree` is
     *   `roads.ts`'s and asks `terrain.ts`'s one definition of how steep the
     *   ground may be.
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
      // Nor through a landmark: the course keeps `LANDMARK_KEEP` off every
      // model's plan, so the Alhambra's roads come to Granada's free gates and
      // not through the palace.
      const throughLandmark: string[] = [];
      for (const road of roads) {
        if (landmarkAt(road, settled) < 0) continue;
        throughLandmark.push(`${settled[road.a]!.name}-${settled[road.b]!.name}`);
      }
      check(
        throughLandmark.length === 0,
        'and none of them runs through a landmark',
        throughLandmark.length > 0 ? `${throughLandmark.length} do: ${throughLandmark.slice(0, 5).join(', ')}` : '',
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
      const bowProbe = { a: 0, b: 0, cls: 0, bend: 0, gateA: 0, gateB: 0, layer: 0, bridgeFrom: 0, bridgeTo: 0 };
      /** The bake's refusals, re-asked on the candidate's own gates and seeded bow. */
      const refusedOnItsOwn = (edge: { a: number; b: number }, gateA: number, gateB: number): boolean => {
        if (gateA < 0 || gateB < 0) return true;
        bowProbe.a = edge.a;
        bowProbe.b = edge.b;
        bowProbe.cls = classOf(settled[edge.a]!, settled[edge.b]!);
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
          const limit = radiusOf(place);
          for (let step = 0; step <= steps; step++) {
            coursePoint(course, step / steps, at);
            if (at.angleTo(townAt) * PLANET_RADIUS < limit) return true;
          }
        }
        if (landmarkAt(bowProbe, settled) >= 0) return true;
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
      // 32 rescues of 20,040 candidates on 2026-09-21, 0.16%: bounded at a
      // quarter of a percent rather than two.
      check(
        extraWithoutNeed === 0 && extra < candidates.length * 0.0025,
        'and every road that is not a candidate is somebody’s only road',
        `${extra} rescues, ${extraWithoutNeed} of them joining two towns that already had one`,
      );

      let alone = 0;
      let aloneBig = 0;
      const aloneNames: string[] = [];
      for (let i = 0; i < settled.length; i++) {
        if (!isShown(settled[i]!) || degree[i]! > 0) continue;
        alone++;
        if (radiusOf(settled[i]!) < 55) continue;
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
       * says, and the rule covers them: a town that cannot be connected to any
       * other because it stands on a mountain simply has no road. The gates add
       * a fourth reason, which is the same one seen from the town: a town every
       * one of whose gates is in the sea or on ground too steep to cut has
       * nowhere for a road to come in.
       *
       * Bounded at 8% so a re-bake has room and a rule that stopped joining
       * anything does not: 748 of 9,749, 7.7%, on 2026-09-21. It was 12%,
       * which let half again as many towns lose their roads unremarked.
       */
      check(
        alone < settled.filter((p) => isShown(p)).length * 0.08,
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
  /**
   * **Read at three instants, not one.** A zone can agree with the wrong one for
   * half the year — Phoenix is Los Angeles all summer and Denver all winter —
   * so a single `now` passes a wrong answer whenever the calendar is kind to
   * it. Mid-January, mid-July and today catch every pair that differs in
   * either season.
   */
  const year = new Date().getUTCFullYear();
  const instants = [new Date(Date.UTC(year, 0, 15, 12)), new Date(Date.UTC(year, 6, 15, 12)), new Date()];
  const real = (zone: string, when: Date): string =>
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(when);
  const readAll = (
    list: readonly [string, string, number, number, string][],
    ours: (iso: string, lat: number, lon: number, when: Date) => string,
  ): string[] => {
    const wrong: string[] = [];
    for (const [name, iso, lat, lon, want] of list) {
      const when = instants.find((instant) => ours(iso, lat, lon, instant) !== real(want, instant));
      if (when !== undefined) wrong.push(`${name} ${ours(iso, lat, lon, when)} not ${real(want, when)}`);
    }
    return wrong;
  };
  const tableWrong = readAll(cities, (iso, lat, lon, when) => clockAt(when, iso, lon, lat));
  check(
    tableWrong.length === 0,
    `all ${cities.length} cities read their real local time from the meridians`,
    tableWrong.slice(0, 5).join(', '),
  );

  /**
   * **The chip reads the nearest built town's zone**, and these are the places
   * the meridians alone got wrong — each one a zone boundary that is a province
   * line rather than a longitude. It is asked the way `main.ts` asks it: the
   * country `countryAt` reports, and the town `nearest` returns.
   */
  const townIndex = indexPlaces(placesRaw, PLANET_RADIUS);
  const boundaries: [string, string, number, number, string][] = [
    ['Calgary', 'CAN', 51.05, -114.07, 'America/Edmonton'],
    ['Kazan', 'RUS', 55.79, 49.12, 'Europe/Moscow'],
    ['Nizhny Novgorod', 'RUS', 56.33, 44.0, 'Europe/Moscow'],
    ['Volgograd', 'RUS', 48.71, 44.51, 'Europe/Moscow'],
    ['Arkhangelsk', 'RUS', 64.54, 40.54, 'Europe/Moscow'],
    ['Izhevsk', 'RUS', 56.85, 53.2, 'Europe/Samara'],
    ['Yakutsk', 'RUS', 62.03, 129.73, 'Asia/Yakutsk'],
    ['Blagoveshchensk', 'RUS', 50.27, 127.53, 'Asia/Yakutsk'],
    ['Anadyr', 'RUS', 64.748, 177.477, 'Asia/Anadyr'],
    ['Bilibino', 'RUS', 68.055, 166.437, 'Asia/Anadyr'],
    ['Indianapolis', 'USA', 39.77, -86.16, 'America/Indiana/Indianapolis'],
    ['Louisville', 'USA', 38.25, -85.76, 'America/Kentucky/Louisville'],
    ['Boise', 'USA', 43.61, -116.2, 'America/Boise'],
    ['Phoenix', 'USA', 33.45, -112.07, 'America/Phoenix'],
    ['Palikir', 'FSM', 6.92, 158.16, 'Pacific/Pohnpei'],
    ['Kananga', 'COD', -5.9, 22.42, 'Africa/Lubumbashi'],
    ['Mbuji-Mayi', 'COD', -6.13, 23.6, 'Africa/Lubumbashi'],
    ['Cuiabá', 'BRA', -15.6, -56.1, 'America/Cuiaba'],
    ['Campo Grande', 'BRA', -20.44, -54.65, 'America/Campo_Grande'],
    ['Hermosillo', 'MEX', 29.07, -110.96, 'America/Hermosillo'],
    ['La Paz', 'MEX', 24.14, -110.31, 'America/Mazatlan'],
    ['Chihuahua', 'MEX', 28.63, -106.09, 'America/Chihuahua'],
  ];
  const nearestWrong: string[] = [];
  for (const [name, iso, lat, lon] of boundaries) {
    const id = world.countryAt(lat, lon);
    const ground = id > 0 ? world.countries[id - 1]!.iso : '';
    if (ground !== iso) nearestWrong.push(`${name} stands in ${ground || 'the sea'}, not ${iso}`);
  }
  nearestWrong.push(...readAll(boundaries, (iso, lat, lon, when) =>
    clockAt(when, iso, lon, lat, townIndex.nearest(at(lat, lon)).place)));
  check(
    nearestWrong.length === 0,
    `all ${boundaries.length} cities on a zone boundary read their nearest town's time`,
    nearestWrong.slice(0, 5).join(', '),
  );
  // And the meridians are the fallback across a border, so they are held to
  // the same cities and to the two ends of the antimeridian: Chukotka east of
  // it read Kaliningrad's time, and the far Aleutians west of it New York's.
  const fallbackWrong = readAll(
    [...boundaries, ['Chukotka', 'RUS', 66.0, -172.0, 'Asia/Anadyr'], ['Attu', 'USA', 52.9, 173.2, 'America/Adak']],
    (iso, lat, lon, when) => clockAt(when, iso, lon, lat),
  );
  check(
    fallbackWrong.length === 0,
    `and the meridians alone read all ${boundaries.length + 2} of them`,
    fallbackWrong.slice(0, 5).join(', '),
  );

  // Every zone the bake shipped has to be one the platform knows, or the chip
  // falls through to the meridians without anybody noticing.
  const shippedZones = [...new Set(placesRaw.map((place) => place.zone))];
  const unknown = shippedZones.filter((zone) => {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: zone });
      return false;
    } catch {
      return true;
    }
  });
  check(
    unknown.length === 0 && placesRaw.every((place) => place.zone !== ''),
    `all ${shippedZones.length} zones the places carry resolve`,
    unknown.slice(0, 5).join(', '),
  );
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
 * `roads.ts` and `scenery/floor.ts` are Node-safe, so the ribbon is checked
 * against the *shipped network* and the floor against the *shipped builder*,
 * over a synthetic town. `settlements.ts` is not — it reaches the kit through
 * an `import.meta.glob` registry — so whether a resident town's floor is where
 * the query says it is can only be asked with a town standing, and it is:
 * `atlas.settlements.survey()` samples a ring across every town it builds and
 * reports how far a foot lands under the paving and over it.
 */
console.log('\nmade ground');
{
  /**
   * The floor, which is drawn where a foot stands on it.
   *
   * It was not, until 2026-09-13: the town's edge was a vertical kerb and
   * `KERB_BLEND` an undrawn ramp a foot climbed it by, and this block asserted
   * that ramp. The edge is a drawn slope now, and a street that crosses a riser
   * a drawn flight of steps, both built by `buildFloor` and read back by
   * `floorLiftAt` out of the one field `buildGround` draws — so what is held
   * here is the field's contract, over the builder the streamer calls: level
   * paving; a slope that leaves it without a step and meets level ground
   * `EDGE_RUN` out at a gradient a body walks up; a convex corner that is a
   * hip; a quay that is still a wall; and, on a street that would otherwise be
   * a riser, a flight no step of which is taller than `STEP_RISE`.
   */
  const pitch = 12.65;
  const GROUND = 100;
  // A square three cells a side with an avenue down the middle both ways,
  // which is what `townGrid` cuts one that size into.
  const lane = (at: number): Uint8Array => {
    const flags = new Uint8Array(3);
    if (at >= 0) flags[at] = 1;
    return flags;
  };
  const grid = { pitch, shift: 1, avenue: lane(1), low: lane(-1), high: lane(-1) };
  const floorOf = (level: (c: number) => number, ground: (i: number, j: number) => number | null) => {
    const terraces = new Map<number, number>();
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) terraces.set(cellKey(c, r), level(c));
    return buildFloor({ grid, band: 3.6, terraces, cornerGround: ground });
  };
  /**
   * A nine-cell town on flat ground, and the same one cut into a hillside.
   *
   * The flat one is the case half the world is: one terrace, so the paving is
   * a plane at `GROUND_LIFT` over it and the slope round it is the whole edge.
   * The stepped one is three columns a `TERRACE_STEP` apart on a hill rising
   * under them, which is what a town on a slope is: it holds the *absolute*
   * half of the contract — on a terrace the answer must not move as the ground
   * under it does — and its avenue crosses both risers.
   */
  const flat = floorOf(() => GROUND, () => GROUND);
  const hill = (i: number): number => GROUND - 3 + TERRACE_STEP * Math.max(0, Math.min(3, i));
  const stepped = floorOf((c) => GROUND + c * TERRACE_STEP, (i) => hill(i));
  const edge = pitch * 1.5;

  let onPaving = 0;
  let wrongOnPaving = 0;
  for (let x = 0; x < edge - 1e-6; x += 0.05) {
    // The ground the query stands on, which on the paving is whatever the hill
    // happens to be doing under a level surface. Walked deliberately, so that a
    // lift measured against a *moving* ground still adds back up to one height.
    const ground = GROUND + Math.sin(x * 0.3) * 0.9;
    onPaving++;
    if (Math.abs(ground + floorLiftAt(flat, x, 0, ground) - (GROUND + GROUND_LIFT)) > 1e-9) wrongOnPaving++;
  }
  check(
    wrongOnPaving === 0,
    'the paving is level over its own cell, at GROUND_LIFT over the terrace',
    `${onPaving} samples inside the floor, ${wrongOnPaving} wrong, lift ${GROUND_LIFT}`,
  );

  /**
   * The edge slope, walked straight out from the middle of a side over level
   * ground, to the far side of its one course.
   *
   * Measured against a fixed ground, because what it has to be is monotonic in
   * the distance. It starts on the paving — the first sample past the kerb line
   * is `GROUND_LIFT` up, which is what makes it a slope and not a step — and
   * its whole course is one plane, from the paving's top down to `edgeSink`
   * under the ground, so the gradient where a foot is on it and where it is
   * buried is the same number: `GROUND_LIFT / EDGE_RUN`, 0.33, 18 degrees.
   */
  const sink = edgeSink(pitch);
  const first = floorLiftAt(flat, edge + 1e-6, 0, GROUND);
  let previous = GROUND_LIFT;
  let outOfRange = 0;
  let backwards = 0;
  let steepest = 0;
  let reaches = -1;
  for (let x = edge; x < edge + pitch - 0.05; x += 0.05) {
    const lift = floorLiftAt(flat, x, 0, GROUND);
    if (lift > GROUND_LIFT + 1e-9 || lift < -sink - 1e-9) outOfRange++;
    if (lift > previous + 1e-9) backwards++;
    steepest = Math.max(steepest, (previous - lift) / 0.05);
    if (lift <= 0 && reaches < 0) reaches = x - edge;
    previous = lift;
  }
  check(
    Math.abs(first - GROUND_LIFT) < 1e-6 && outOfRange === 0 && backwards === 0,
    'the edge slope leaves the paving without a step and only ever falls',
    `${first.toFixed(3)} just past the kerb line against ${GROUND_LIFT}, ` +
      `${outOfRange} out of [-${sink.toFixed(2)}, ${GROUND_LIFT}], ${backwards} rising`,
  );
  check(
    reaches >= 0 && Math.abs(reaches - EDGE_RUN) < 0.1 && steepest <= GROUND_LIFT / EDGE_RUN + 1e-6,
    'and it meets level ground EDGE_RUN out, at a gradient a body walks up',
    `${reaches.toFixed(2)} units out, steepest ${steepest.toFixed(3)} (${(Math.atan(steepest) / DEG).toFixed(1)} deg)`,
  );
  // The corner. Split through the one corner it touches, the cell off a convex
  // corner is two slopes meeting at a hip, so it meets the ground on the square
  // `EDGE_RUN` out — not on a circle, and not along a fold across the cell.
  let hip = -1;
  for (let d = 0; d <= pitch; d += 0.02) {
    if (floorLiftAt(flat, edge + d, edge + d, GROUND) <= 0) {
      hip = d;
      break;
    }
  }
  check(
    Math.abs(hip - EDGE_RUN) < 0.05,
    'and a convex corner is a hip, meeting the ground on the square EDGE_RUN out',
    `${hip.toFixed(2)} out on each axis along the diagonal`,
  );
  // Over a valley the slope still ends one course out and under the ground
  // there, so it steepens into an embankment down to the field rather than
  // stand a ledge over it.
  const inSquare = (i: number, j: number): boolean => i >= 0 && i <= 3 && j >= 0 && j <= 3;
  const fill = floorOf(() => GROUND, (i, j) => (inSquare(i, j) ? GROUND : GROUND - 15));
  const footOfFill = floorLiftAt(fill, edge + pitch - 0.01, 0, GROUND - 15);
  check(
    Math.abs(floorLiftAt(fill, edge, 0, GROUND) - GROUND_LIFT) < 1e-9 && footOfFill < 0,
    'and over falling ground it is an embankment that reaches the field, not a ledge',
    `${footOfFill.toFixed(2)} against the field at its foot, steepest ${fill.stats?.embankment.toFixed(2)}`,
  );
  // And a quay: where the sea is next door the edge keeps its face.
  const quay = floorOf(() => GROUND, (i) => (i > 3 ? null : GROUND));
  const offQuay = floorLiftAt(quay, edge + 2, 0, GROUND);
  check(
    offQuay === 0 && quay.stats?.quays === 3 && quay.stats.slopes === 9,
    'and where the sea is next door the edge is a quay, with no slope to stand on',
    `${quay.stats?.quays} quay edges of ${(GROUND_LIFT + KERB_DROP).toFixed(1)}, ` +
      `${quay.stats?.slopes} sloped, lift past it ${offQuay}`,
  );

  /**
   * And the stepped town, which is the terracing's own contract.
   *
   * A foot on a terrace stands at that terrace's height and not at the one next
   * door, and the height it stands at does not move with the ground under it.
   * Sampled in the rows either side of the avenue, because the avenue itself
   * climbs by flights and is the next assertion's.
   */
  let wrongTerrace = 0;
  let terraceSamples = 0;
  for (let c = 0; c < 3; c++) {
    for (let step = 0; step < 9; step++) {
      const x = (c - 1 + (step / 8 - 0.5) * 0.9) * pitch;
      const z = (step % 2 === 0 ? 1 : -1) * pitch * (0.8 + 0.1 * (step % 3));
      const ground = hill(c + 0.5) + Math.sin(x * 0.7) * 1.4;
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
   * And the streets across the risers, which is what the flights are for.
   *
   * Walked from one side of the town to the other down the middle of the
   * avenue, the tallest single rise a foot meets is one step and the whole
   * climb is still the two terraces; walked through the yards beside it, the
   * same risers are walls a `TERRACE_STEP` tall, which a foot takes in one
   * frame as it always did (`HEIGHT_SMOOTHING` in `player.ts`).
   */
  const across = (z: number): { rise: number; climb: number } => {
    let rise = 0;
    let start = 0;
    let last = 0;
    for (let x = -edge + 0.01, k = 0; x <= edge - 0.01; x += 0.02, k++) {
      const ground = hill(x / pitch + 1.5);
      const stand = ground + Math.max(0, floorLiftAt(stepped, x, z, ground));
      if (k === 0) start = stand;
      else rise = Math.max(rise, stand - last);
      last = stand;
    }
    return { rise, climb: last - start };
  };
  const street = across(0);
  const yard = across(-pitch);
  check(
    street.rise <= STEP_RISE + 1e-9 && Math.abs(street.climb - 2 * TERRACE_STEP) < 1e-9 &&
      Math.abs(yard.rise - TERRACE_STEP) < 1e-9,
    'and a street that crosses a riser climbs it by a flight, no step taller than STEP_RISE',
    `${stepped.stats?.flights} flights of ${stepped.stats?.steps} risers: tallest step on the avenue ` +
      `${street.rise.toFixed(2)} in a climb of ${street.climb.toFixed(1)}, beside it ${yard.rise.toFixed(2)}`,
  );

  /**
   * And one level a street, which is what the flights are laid on.
   *
   * Until 2026-09-13 the two cells either side of a band street each cut their
   * own terrace, so on a hill a riser ran down the middle of the street and it
   * climbed by two half-flights in two different places: invisible in a table
   * of levels, a tangle of stairs on the screen, 11,403 of them. `cellLevel`
   * cuts the cells that share a street to one level. Held here over a square of
   * every size the built world has, `townGrid`'s own, on a hill climbing both
   * ways with a ripple in it — enough to put a riser in most blocks and to
   * leave no cell refused, so every flight's twin has a cell to stand in:
   *
   * - no cell has a band on both of its sides, which is what keeps a street's
   *   group to the four cells round a crossing;
   * - the two cells either side of every band are one level;
   * - every flight on a band has its twin on the other half, at the same line
   *   and between the same two levels;
   * - and every gate's cells are cut to the level `gateLevel` gives the road.
   */
  {
    const hillside = (x: number, z: number): number => 100 + 0.34 * x + 0.21 * z + 2.5 * Math.sin(x * 0.11 + z * 0.07);
    const sizes = new Map<number, TownGrid>();
    for (let k = 0; k <= 160; k++) {
      const grid = townGrid(radiusFor(Math.round(10 ** (k / 20))));
      if (!sizes.has(grid.cells)) sizes.set(grid.cells, grid);
    }
    let doubleBanded = 0;
    let pairs = 0;
    let split = 0;
    let levelsSeen = 0;
    let bandFlights = 0;
    let orphans = 0;
    let rampSides = 0;
    let rampWalls = 0;
    let rampWallWorst = 0;
    let gateCells = 0;
    let gateWrong = 0;
    let rampsSeen = 0;
    let stairsSeen = 0;
    let rampSteepest = 0;
    let rampSlope = 0;
    let rampLongest = 0;
    let rampWrong = 0;
    let streetStep = 0;
    let inMouth = 0;
    let mouthsSeen = 0;
    let mouthsWrong = 0;
    for (const grid of sizes.values()) {
      /**
       * The gate's mouth: the road's carriageway to the kerb, which is every
       * class's, and a pavement out to where the street's own reaches, or
       * past it on a band street, never inside it.
       */
      for (const gate of gatesOf(grid)) {
        for (const street of [6, 9.75, 15]) {
          const band = streetBand(grid, street);
          const mouth = gateMouth(grid, gate, band);
          mouthsSeen++;
          const carriageOk = ROAD_CLASSES.every((entry) => Math.abs(entry.width * 0.5 - mouth.carriage) < 1e-9);
          const edgeOk = grid.cells < 2
            ? mouth.edge === mouth.carriage && mouth.flare === 0
            : gate.cells.length < 2
              ? mouth.edge <= mouth.street + 1e-9 && mouth.edge > mouth.carriage
              : mouth.edge >= Math.max(mouth.street, mouth.carriage + pavementOf(band)) - 1e-9;
          if (!carriageOk || !edgeOk || mouth.flare > grid.pitch * 0.5 + 1e-9) mouthsWrong++;
        }
      }
      for (let c = 0; c < grid.cells; c++) {
        if (grid.high[c] === 1 && grid.low[c] === 1) doubleBanded++;
        if (partnerOf(grid, partnerOf(grid, c)) !== c) doubleBanded++;
      }
      const base = hillside(0, 0);
      const levels = townTerraces(grid, groundOf(grid, hillside, base));
      const paved = new Map<number, number>();
      for (const [key, level] of levels) if (level !== null) paved.set(key, level);
      levelsSeen = Math.max(levelsSeen, new Set(paved.values()).size);
      for (let c = 0; c + 1 < grid.cells; c++) {
        if (grid.high[c] !== 1) continue;
        for (let r = 0; r < grid.cells; r++) {
          for (const [a, b] of [[cellKey(c, r), cellKey(c + 1, r)], [cellKey(r, c), cellKey(r, c + 1)]] as const) {
            const la = paved.get(a);
            const lb = paved.get(b);
            if (la === undefined || lb === undefined) continue;
            pairs++;
            if (la !== lb) split++;
          }
        }
      }
      // A road in at every gate, so the ramps keep off every mouth.
      const mouths = new Set<number>();
      for (const gate of gatesOf(grid)) for (const [col, row] of gate.cells) mouths.add(cellKey(col, row) * 4 + gate.side);
      const field = buildFloor({
        grid,
        mouths,
        band: streetBand(grid, 9.75),
        terraces: paved,
        cornerGround: (i, j) => hillside(cornerOffset(grid, i), cornerOffset(grid, j)),
      });
      // And the same town with a ragged edge (`outskirtsOf`), where the two
      // rows either side of a band street stop in different places: the twin
      // of a half is planned with it, not found by it.
      const ragged = new Map(paved);
      for (const key of outskirtsOf(grid, `ramps-${grid.cells}`, () => false)) ragged.delete(key);
      const raggedField = buildFloor({
        grid,
        mouths,
        band: streetBand(grid, 9.75),
        terraces: ragged,
        cornerGround: (i, j) => hillside(cornerOffset(grid, i), cornerOffset(grid, j)),
      });
      for (const floor of [field, raggedField]) {
        for (const list of floor.flights?.values() ?? []) {
          for (const flight of list) {
            const col = Math.floor(flight.cell / 1024) - 512;
            const row = (flight.cell % 1024) - 512;
            // The street it climbs runs along `axis`, so its band is on the cell's
            // index on the other axis; an avenue's flight is a whole cell wide.
            const across = flight.axis === 0 ? row : col;
            const twin = partnerOf(grid, across);
            const other = flight.axis === 0 ? cellKey(col, twin) : cellKey(twin, row);
            // A half whose twin row is not paved on both sides of the riser —
            // given up to the outskirts — is a street's last half, and its
            // midline is the town's edge, not a carriageway.
            const twinAbove = flight.axis === 0
              ? cellKey(col + (flight.into > 0 ? -1 : 1), twin)
              : cellKey(twin, row + (flight.into > 0 ? -1 : 1));
            const paired = twin !== across && floor.terraces.has(other) && floor.terraces.has(twinAbove);
            if (paired) {
              bandFlights++;
              const matched = (floor.flights?.get(other) ?? []).some((f) =>
                f.axis === flight.axis && Math.abs(f.at - flight.at) < 1e-9 && f.into === flight.into &&
                f.high === flight.high && f.low === flight.low && f.ramp === flight.ramp &&
                Math.abs(f.back - flight.back) < 1e-9 && Math.abs(f.run - flight.run) < 1e-9);
              if (!matched) orphans++;
            }
            // Nothing stands up out of the carriageway beside a ramp: at each
            // of its sides inside the carriageway — a band half's midline —
            // what is just beyond is the ramp's own surface all the way along,
            // so the drawing's side there has no height anywhere.
            if (!flight.ramp || !paired) continue;
            const carriage = flight.half - pavementOf(flight.half);
            for (const [t, sign] of [[flight.from, -1], [flight.to, 1]] as const) {
              if (Math.abs(t - flight.centre) >= carriage) continue;
              rampSides++;
              const probe = t + sign * 1e-3;
              for (let s = -flight.back; s <= flight.run; s += 0.25) {
                const along = flight.at + flight.into * s;
                const [x, z] = flight.axis === 0 ? [along, probe] : [probe, along];
                const drop = Math.abs(floorLiftAt(floor, x, z, 0) - flightHeight(flight, s));
                if (drop > 1e-3) {
                  rampWalls++;
                  rampWallWorst = Math.max(rampWallWorst, drop);
                }
              }
            }
          }
        }
      }
      // Every crossing walked down the middle of what it carries, from the
      // level paving before it to the level paving after it: the steepest
      // stretch of a ramp, and the tallest single rise anywhere on it.
      for (const list of field.flights?.values() ?? []) {
        for (const flight of list) {
          const t = (flight.from + flight.to) * 0.5;
          const pointAt = (s: number): [number, number] => {
            const along = flight.at + flight.into * s;
            return flight.axis === 0 ? [along, t] : [t, along];
          };
          if (flight.ramp) {
            rampsSeen++;
            rampSteepest = Math.max(rampSteepest, rampGrade(flight));
            rampLongest = Math.max(rampLongest, flight.back + flight.run);
          } else {
            stairsSeen++;
          }
          let last = NaN;
          const d = 0.02;
          for (let s = -flight.back - 0.5; s <= flight.run + 0.5; s += d) {
            const [x, z] = pointAt(s);
            const h = floorLiftAt(field, x, z, 0);
            if (!Number.isNaN(last)) {
              const rise = Math.abs(h - last);
              streetStep = Math.max(streetStep, rise);
              if (flight.ramp) rampSlope = Math.max(rampSlope, rise / d);
            }
            last = h;
          }
          // And nothing climbs in a gate's mouth, where the town's street
          // flares to the road's section on level paving.
          const [fx0, fx1, fz0, fz1] = flightRect(flight);
          for (const gate of gatesOf(grid)) {
            const mouth = gateMouth(grid, gate, streetBand(grid, 9.75));
            if (mouth.flare <= 0) continue;
            const outer = Math.max(mouth.edge, mouth.street);
            const k0 = gate.outX !== 0 ? gate.x - gate.outX * mouth.flare : gate.z - gate.outZ * mouth.flare;
            const k1 = gate.outX !== 0 ? gate.x : gate.z;
            const [mx0, mx1, mz0, mz1] = gate.outX !== 0
              ? [Math.min(k0, k1), Math.max(k0, k1), gate.z - outer, gate.z + outer]
              : [gate.x - outer, gate.x + outer, Math.min(k0, k1), Math.max(k0, k1)];
            if (fx0 < mx1 - 1e-6 && mx0 < fx1 - 1e-6 && fz0 < mz1 - 1e-6 && mz0 < fz1 - 1e-6) inMouth++;
          }
          // And the drawn surface is the one described: the field at the
          // ramp's own middle is `flightHeight` there.
          if (flight.ramp) {
            const mid = (flight.run - flight.back) * 0.5;
            const [x, z] = pointAt(mid);
            if (Math.abs(floorLiftAt(field, x, z, 0) - flightHeight(flight, mid)) > 1e-9) rampWrong++;
          }
        }
      }
      for (const gate of gatesOf(grid)) {
        const level = gateLevel(grid, gate, hillside, base);
        if (level === null) continue;
        for (const [col, row] of gate.cells) {
          gateCells++;
          if (levels.get(cellKey(col, row)) !== level) gateWrong++;
        }
      }
    }
    check(
      doubleBanded === 0,
      'no cell of a town has a band street on both of its sides, so a street is shared by at most four cells',
      `${sizes.size} sizes of square, 1 to ${Math.max(...sizes.keys())} cells a side`,
    );
    check(
      split === 0 && pairs > 0,
      'and the two cells either side of every band street are cut to one level: no riser runs down a street',
      `${pairs.toLocaleString()} cell pairs across a band on a hillside, ${split} split, up to ${levelsSeen} levels a town`,
    );
    check(
      orphans === 0 && bandFlights > 0,
      'and every flight on a band street has its twin on the other half, at the same line, ragged edge or not',
      `${bandFlights} half-flights, ${orphans} without a twin`,
    );
    check(
      rampSides > 0 && rampWalls === 0,
      'and no ramp stands a wall inside the carriageway: its side on a band’s midline meets its twin',
      `${rampSides} ramp sides inside a carriageway, ${rampWalls} quarter-unit samples off what is beside them` +
        (rampWalls > 0 ? `, worst ${rampWallWorst.toFixed(3)}` : ''),
    );
    check(
      rampsSeen > 0 && stairsSeen === 0 && rampSteepest <= STREET_GRADE + 1e-9 && rampSlope <= STREET_GRADE + 1e-6 && rampWrong === 0,
      'and every street crosses its risers by ramps, none steeper than STREET_GRADE, with no flight of steps',
      `${rampsSeen} ramps and ${stairsSeen} flights, steepest ${rampSteepest.toFixed(3)} by its ends and ` +
        `${rampSlope.toFixed(3)} walked, longest ${rampLongest.toFixed(1)} units, against ${STREET_GRADE}`,
    );
    check(
      inMouth === 0 && mouthsWrong === 0 && mouthsSeen > 0,
      'and at a gate the road keeps its carriageway to the kerb, and the town’s street flares to it on level paving',
      `${mouthsSeen} mouths over three street widths, ${mouthsWrong} wrong, ${inMouth} ramps or flights reaching into one`,
    );
    check(
      streetStep <= STEP_UP,
      'and no street that crosses a riser has a step a foot or a wheel cannot take',
      `tallest single rise ${streetStep.toFixed(3)} across every ramp and flight, against STEP_UP ${STEP_UP}`,
    );
    check(
      gateWrong === 0 && gateCells > 0,
      'and every gate’s cells are cut to the level gateLevel gives the road',
      `${gateCells} gate cells, ${gateWrong} disagreeing`,
    );

    /**
     * And where a town stops short of its square (`outskirtsOf`), over every
     * size of square and forty seeds each: never a cell the caller keeps nor
     * one of the town's middle, never a clearing inside the town — every cell given up
     * reaches the square's edge through others given up, or the edge slope
     * would go down into a pit — the same answer twice, and the town keeps
     * most of itself.
     */
    let outskirtTowns = 0;
    let outskirtCells = 0;
    let outskirtOf = 0;
    let onStreet = 0;
    let onKept = 0;
    let clearings = 0;
    let unstable = 0;
    let leastKept = 1;
    for (const grid of sizes.values()) {
      if (grid.cells < OUTSKIRT_MIN_CELLS) continue;
      const keep = (col: number, row: number): boolean => col === 1 && row === 1;
      for (let s = 0; s < 40; s++) {
        const seed = `outskirts-${s}`;
        const out = outskirtsOf(grid, seed, keep);
        const again = outskirtsOf(grid, seed, keep);
        if (out.size !== again.size || [...out].some((key) => !again.has(key))) unstable++;
        outskirtTowns++;
        outskirtCells += out.size;
        outskirtOf += grid.cells * grid.cells;
        leastKept = Math.min(leastKept, 1 - out.size / (grid.cells * grid.cells));
        const reached = new Set<number>();
        const queue: [number, number][] = [];
        for (const key of out) {
          const col = Math.floor(key / 1024) - 512;
          const row = (key % 1024) - 512;
          if (Math.max(Math.abs(col - grid.shift), Math.abs(row - grid.shift)) < 1) onStreet++;
          if (keep(col, row)) onKept++;
          if (col === 0 || row === 0 || col === grid.cells - 1 || row === grid.cells - 1) {
            reached.add(key);
            queue.push([col, row]);
          }
        }
        while (queue.length > 0) {
          const [col, row] = queue.pop()!;
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const key = cellKey(col + dc, row + dr);
            if (!out.has(key) || reached.has(key)) continue;
            reached.add(key);
            queue.push([col + dc, row + dr]);
          }
        }
        clearings += out.size - reached.size;
      }
    }
    check(
      onStreet === 0 && onKept === 0 && clearings === 0 && unstable === 0 && outskirtCells > 0,
      'a town stops short of its square only from its edge in, never at its middle or on the cells it keeps, the same way twice',
      `${outskirtTowns} towns, ${outskirtCells} of ${outskirtOf} cells given up; ${onStreet} at the middle, ${onKept} kept, ${clearings} in a clearing, ${unstable} unstable`,
    );
    check(
      leastKept >= 0.7,
      'and every town keeps most of its square',
      `the least kept ${(leastKept * 100).toFixed(0)}% of its cells`,
    );

    /**
     * And the light at a gate, which the floor and the road share at night.
     *
     * The floor takes the brightest light over each vertex and the ribbon only
     * its gates' (`gateGlow`), so the kerb shows no step only if the gate's
     * light is at the peak across the whole mouth of the street — the most any
     * light gives, which nothing else on the floor can exceed — and gone by
     * `reach`. Held over every gate of every size of square, at the widest band
     * the kit gives a street.
     */
    const peak = poolByte(1, 1);
    let mouths = 0;
    let points = 0;
    let dim = 0;
    let lingering = 0;
    for (const grid of sizes.values()) {
      const band = streetBand(grid, 15);
      for (const gate of gatesOf(grid)) {
        mouths++;
        const glow = gateGlow(grid, gate, band);
        const half = gate.cells.length < 2 ? grid.pitch * 0.5 : band;
        for (let k = -8; k <= 8; k++) {
          points++;
          if (poolAt(1, Math.abs(k / 8) * half, glow.inner, glow.reach) !== peak) dim++;
        }
        if (poolAt(1, glow.reach, glow.inner, glow.reach) !== 0) lingering++;
      }
    }
    check(
      peak > 0 && dim === 0 && lingering === 0,
      'and the light at every gate is at the peak across the whole mouth of its street, and gone at its reach',
      `${points} points across ${mouths} mouths at ${peak} of 255, the most any light gives`,
    );
  }

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
      // A network of one road holds its gates against itself: its ramp is asked after.
      const alone = createRoads(world, placesRaw, { ...bakedNetwork, roads: [road] });
      rampOf(road, course, placesRaw, world, ramp);
      tested++;
      const half = ROAD_CLASSES[road.cls]!.width * 0.5;

      // The middle, clear of both approaches and both ramps: the crown at
      // exactly `RIBBON_LIFT` over the relief, a shoulder that only falls, and
      // nothing past the drawn strip.
      const from = Math.max(course.approach, rampReach(ramp.riseA));
      const to = path.length - Math.max(course.approach, rampReach(ramp.riseB));
      if (to > from) {
        for (let k = 1; k < 6; k++) {
          const along = from + ((to - from) * k) / 6;
          // A bridge and its ramps are the deck's height, not the ground's lift: see the bridges' own checks.
          if (road.bridgeTo > road.bridgeFrom && along > road.bridgeFrom - BRIDGE_LAND - 6 && along < road.bridgeTo + BRIDGE_LAND + 6) continue;
          // Where the drawn bank crosses the ground, wherever the top has its
          // ordinary lift: past a town's pavement, or past the shoulder.
          // `roads.ts` exports the arithmetic — this used to write it out
          // longhand, which is two files answering one question.
          const fall = crownFall(ribbonHalf(ramp, half, along, path.length - along));
          const t = parameterAt(path, along);
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

      // The two kerbs, which is where the join between road and town showed.
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

    /**
     * What stands beside the roads (`roadside.ts`), laid for every twentieth
     * road of the network through the site the streamer lays it through:
     * every face wound the way its normal says, which is the merged buffer's
     * form of `determinant() > 0`; nothing further from its road than the verge
     * the wood keeps (`roadClearance`), so no tree grows through a pole; nothing
     * over the carriageway lower than a lamp's arm; every lamp down a built
     * town's approach and none anywhere else; and the same road laid twice
     * laying the same thing.
     */
    let sideRoads = 0;
    let sideTriangles = 0;
    let sideLength = 0;
    let inverted = 0;
    let beyondVerge = 0;
    let beyondWorst = 0;
    let lowOverRoad = 0;
    let lampsSeen = 0;
    let lampsAstray = 0;
    let unstable = 0;
    const faceAB = new Vector3();
    const faceAC = new Vector3();
    const faceN = new Vector3();
    const vertexAt = new Vector3();
    const gateDir = new Vector3();
    /**
     * Every fourth road of the network, where it was every twentieth: a road
     * that curls past its own gate or runs into a cutting is a few in
     * seventeen thousand. The whole network is `SIDE_STEP=1` in the
     * environment, about 70 s against 18.
     */
    const SIDE_STEP = Number(process.env.SIDE_STEP ?? 4);
    holdGates(pruned, placesRaw, world);
    const sideBegan = Date.now();
    const sideIndex = roadIndexFor(pruned, placesRaw);
    const sidePaths = new Map<number, CoursePath>();
    const sidePathOf = (q: number): CoursePath => {
      let found = sidePaths.get(q);
      if (found === undefined) {
        found = coursePath(courseOf(pruned[q]!, placesRaw, emptyCourse()));
        sidePaths.set(q, found);
      }
      return found;
    };
    const sideRamps = new Map<number, RoadRamp>();
    const sideRampOf = (q: number): RoadRamp => {
      let found = sideRamps.get(q);
      if (found === undefined) {
        found = rampOf(pruned[q]!, courseOf(pruned[q]!, placesRaw, emptyCourse()), placesRaw, world);
        sideRamps.set(q, found);
      }
      return found;
    };
    const sideMiddle = new Vector3();
    const sideNearest = { distance: 0, s: 0 };
    const ownNearest = { distance: 0, s: 0 };
    const surfaceAt = new Vector3();
    const surfaceAhead = new Vector3();
    const surfaceSide = new Vector3();
    let lowWorst = Infinity;
    const lowNames: string[] = [];
    let besideOthers = 0;
    let inOther = 0;
    for (let i = 0; i < pruned.length; i += SIDE_STEP) {
      const road = pruned[i]!;
      courseOf(road, placesRaw, course);
      const path = coursePath(course);
      rampOf(road, course, placesRaw, world, ramp);
      const others = otherRoadsOf(pruned, i, sideIndex, sidePathOf, sideRampOf, coursePoint(course, 0.5, sideMiddle));
      if (others.length > 0) besideOthers++;
      const site = roadsideSite(road, course, path, ramp, placesRaw, world, others);
      const laid = layRoadside(site);
      const again = layRoadside(roadsideSite(road, course, path, ramp, placesRaw, world, others));
      if (laid.position.length !== again.position.length || laid.position.some((value, k) => value !== again.position[k])) unstable++;
      sideRoads++;
      sideLength += path.length;
      const p = laid.position;
      const n = laid.normal;
      sideTriangles += p.length / 9;
      for (let t = 0; t + 8 < p.length; t += 9) {
        faceAB.set(p[t + 3]! - p[t]!, p[t + 4]! - p[t + 1]!, p[t + 5]! - p[t + 2]!);
        faceAC.set(p[t + 6]! - p[t]!, p[t + 7]! - p[t + 1]!, p[t + 8]! - p[t + 2]!);
        faceN.crossVectors(faceAB, faceAC);
        if (faceN.x * n[t]! + faceN.y * n[t + 1]! + faceN.z * n[t + 2]! <= 0) inverted++;
      }
      const clearance = roadClearance(road.cls);
      const half = ROAD_CLASSES[road.cls]!.width * 0.5;
      for (let v = 0; v + 2 < p.length; v += 3) {
        vertexAt.set(p[v]!, p[v + 1]!, p[v + 2]!);
        const radius = vertexAt.length();
        vertexAt.normalize();
        const away = pathDistance(path, vertexAt);
        if (away > clearance + 1e-3) {
          beyondVerge++;
          beyondWorst = Math.max(beyondWorst, away - clearance);
        }
        // Measured over the carriageway's own surface under it, which is not
        // the relief's: into a gate cut down a hillside the road runs in a
        // cutting, and a lamp's arm five units over the tarmac is under the
        // ground either side.
        if (away < half - 0.05) {
          nearestOnPath(path, vertexAt, ownNearest);
          const sOwn = ownNearest.s;
          site.surface(sOwn, 0, surfaceAt, surfaceAhead, surfaceSide);
          const lateral = vertexAt.dot(surfaceSide) * PLANET_RADIUS;
          site.surface(sOwn, lateral, surfaceAt, surfaceAhead, surfaceSide);
          const over = radius - surfaceAt.length();
          // Under the surface is under a bridge's deck: its piers, not a thing in the way.
          if (over < 4.5 && over > -0.5) {
            lowOverRoad++;
            lowWorst = Math.min(lowWorst, over);
            if (lowNames.length < 3) lowNames.push(`${placesRaw[road.a]!.name}-${placesRaw[road.b]!.name}`);
          }
        }
        // And nothing under a lamp's arm stands in another road's carriageway:
        // under 4.5 over that road's own crown there.
        if (others.length > 0) {
          for (const other of others) {
            nearestOnPath(other.path, vertexAt, sideNearest);
            const overOther = radius - othersRoofline([other], vertexAt, world);
            if (sideNearest.distance < other.half - 0.05 && overOther < 4.5 && overOther > -0.5) {
              inOther++;
              break;
            }
          }
        }
      }
      for (let h = 0; h + 2 < laid.heads.length; h += 3) {
        lampsSeen++;
        vertexAt.set(laid.heads[h]!, laid.heads[h + 1]!, laid.heads[h + 2]!).normalize();
        const kerbA = gateDir.copy(course.gateA).normalize().angleTo(vertexAt) * PLANET_RADIUS;
        const kerbB = gateDir.copy(course.gateB).normalize().angleTo(vertexAt) * PLANET_RADIUS;
        const nearA = ramp.kerbA > 0 && kerbA <= PAVEMENT_RUN + 4;
        const nearB = ramp.kerbB > 0 && kerbB <= PAVEMENT_RUN + 4;
        if (!nearA && !nearB) lampsAstray++;
      }
    }
    check(
      inverted === 0 && unstable === 0 && sideTriangles > 0,
      'what stands beside a road is wound outward on every face, and laid the same twice',
      `${sideRoads} roads, ${sideTriangles.toLocaleString()} triangles, ` +
        `${((sideTriangles / sideLength) * 1000).toFixed(0)} per 1,000 units of road; ${inverted} faces inward, ${unstable} unstable`,
    );
    check(
      beyondVerge === 0 && lowOverRoad === 0,
      'and it stands inside the verge the wood keeps, and nothing hangs low over the carriageway',
      `${sideRoads.toLocaleString()} roads in ${Date.now() - sideBegan} ms; ${beyondVerge} vertices past roadClearance (worst ${beyondWorst.toFixed(2)}), ${lowOverRoad} over the carriageway under 4.5 over its surface` +
        (lowOverRoad > 0 ? ` (lowest ${lowWorst.toFixed(2)}: ${lowNames.join('; ')})` : ''),
    );
    check(
      inOther === 0 && besideOthers > 0,
      'and none of it stands in another road’s carriageway where two roads meet, fork or share an approach',
      `${besideOthers} of ${sideRoads} roads beside another, ${inOther} vertices under 4.5 inside another’s carriageway`,
    );
    check(
      lampsSeen > 0 && lampsAstray === 0,
      'and its street lamps stand down a built town’s approach and nowhere else',
      `${lampsSeen} lamps, ${lampsAstray} further than PAVEMENT_RUN from a built kerb`,
    );
  }
}

// The relay cannot import the game, so it bounds it: a plane the game lets
// climb or run past the relay's limits is a player the relay silently drops.
console.log('\nthe relay');
{
  check(relay.PLANET_RADIUS === PLANET_RADIUS, 'the relay’s planet is the world’s', `${relay.PLANET_RADIUS} against ${PLANET_RADIUS}`);
  const highest = PLANET_RADIUS + PLANE_CEILING;
  check(
    highest * 1.25 <= relay.MAX_RADIUS,
    'MAX_RADIUS holds the plane at its ceiling, with a quarter to spare',
    `ceiling at a radius of ${highest}, relay's limit ${relay.MAX_RADIUS}`,
  );
  // Stick and throttle full on add at most 2.2 times the cruise (`fly` in
  // player.ts: 1.35 and 1.6 on 2026-09-24); the relay wants half again over that.
  const fastest = PLANE_CRUISE_HIGH * 2.2;
  check(
    fastest * 1.5 <= relay.MAX_SPEED,
    'MAX_SPEED is half again over the plane flat out at the ceiling',
    `${fastest.toFixed(0)} against ${relay.MAX_SPEED}`,
  );
  check(
    relay.driveReach(100, 60) >= fastest * 0.1 + 60 && relay.driveReach(-5, 0) > 0,
    'a pose a tenth of a second on at full boost is within a driven vehicle’s reach',
    `${relay.driveReach(100, 60).toFixed(0)} units`,
  );
}

// `elevationAt` runs once per frame, and monument placement will hammer it.
const queryStart = Date.now();
const N = 200_000;
for (let i = 0; i < N; i++) world.countryAt(((i * 7) % 180) - 90, ((i * 13) % 360) - 180);
const us = ((Date.now() - queryStart) / N) * 1000;
console.log(`\ncountryAt: ${us.toFixed(2)} us per query`);
check(us < 20 * TIME_SCALE, `query cost under ${20 * TIME_SCALE} us`);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
