/**
 * The vehicles you can take, headless: where every one stands by default, and
 * whether it stands somewhere a vehicle can.
 *
 * The sites are a pure function of the baked world (`fleet.ts`), which is what
 * lets every client agree on them without a word on the wire — so this builds
 * them twice and asks for the same answer, and then asks each kind the
 * question its medium poses: a car on its road and out of every town's
 * square, a launch on open water with room round it, a plane and a balloon on
 * flat land clear of the towns, the roads and the landmarks, a plane at the
 * end of an airstrip that is all of those along its length and that its
 * take-off run fits — and clear of the wood, which the real vegetation
 * streamer is built headless to answer.
 *
 *   node scripts/check-fleet.ts
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Object3D, Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundRadius } from '../src/globe.ts';
import { gradeAt, setDetailSites, setFlattenSites, shoreDistance } from '../src/terrain.ts';
import type { Slope } from '../src/terrain.ts';
import { indexPlaces, isShown, radiusOf, terrainSiteOf } from '../src/places.ts';
import { ROAD_CLASSES, courseOf, coursePath, roadClearance, townOf, townOffset } from '../src/roads.ts';
import type { CoursePath, Road } from '../src/roads.ts';
import { decodePlaces, decodeRoads, inflate } from '../src/pack.ts';
import { latOf, lonOf, unitAt } from '../src/sphere.ts';
import {
  SITE_ROOM,
  STRIP_BACK,
  STRIP_HALF,
  STRIP_LENGTH,
  applyPose,
  createLocalLink,
  createSiteIndex,
  distanceToPath,
  stripKeepouts,
  stripPoint,
  writePose,
} from '../src/fleet.ts';
import type { FleetSite } from '../src/fleet.ts';
import { isWater } from '../src/vehicles.ts';
import { MAX_FOOTPRINT } from '../src/monuments/contract.ts';

const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// --- the world, as check-life.ts loads it ------------------------------------

const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

const monumentsPath = resolve(here, '../public/data/monuments.json');
const monuments: { lat: number; lon: number; footprint?: number }[] = existsSync(monumentsPath)
  ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: typeof monuments }).monuments
  : [];
setFlattenSites(monuments as never);

const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
setDetailSites(placesRaw.map(terrainSiteOf));
const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const places = indexPlaces(placesRaw, 0).all;
const roadsRaw = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
const roads: Road[] = roadsRaw.places === places.length ? roadsRaw.roads : [];
if (roads.length === 0) {
  console.log(`  roads.bin was baked against ${roadsRaw.places} places and there are ${places.length}. Run \`pnpm roads\`.`);
  process.exit(1);
}
console.log(`world: ${places.length} places, ${roads.length} roads, ${monuments.length} landmarks\n`);

// --- the sites, twice ----------------------------------------------------------

const source = { world, places, roads, monuments };
let began = performance.now();
const sites = createSiteIndex(source).all();
const firstMs = performance.now() - began;
began = performance.now();
const again = createSiteIndex(source).all();
const secondMs = performance.now() - began;

const byKind = new Map<string, FleetSite[]>();
for (const site of sites) {
  let list = byKind.get(site.kind);
  if (list === undefined) byKind.set(site.kind, (list = []));
  list.push(site);
}
const shownCount = places.filter(isShown).length;
console.log('sites:');
for (const kind of ['car', 'van', 'boat', 'plane', 'balloon']) console.log(`  ${kind.padEnd(8)} ${byKind.get(kind)?.length ?? 0}`);
console.log(`  ${'total'.padEnd(8)} ${sites.length} over ${shownCount} built towns, ${Math.round(firstMs)} ms (again ${Math.round(secondMs)} ms)\n`);

console.log('determinism:');
const same =
  sites.length === again.length &&
  sites.every((site, i) => {
    const other = again[i]!;
    return site.id === other.id && site.at.equals(other.at) && site.forward.equals(other.forward);
  });
check(same, 'two builds give the same ids, positions and headings, bit for bit');
// And one town at a time, out of order, is the same as the whole planet in order.
const lazy = createSiteIndex(source);
const probeTowns = [...new Set(sites.map((site) => site.place))].filter((_, i) => i % 97 === 0).reverse();
const lazyOk = probeTowns.every((p) => {
  const mine = lazy.sitesOf(p);
  const theirs = sites.filter((site) => site.place === p);
  return mine.length === theirs.length && mine.every((site, i) => site.id === theirs[i]!.id && site.at.equals(theirs[i]!.at));
});
check(lazyOk, `a town's sites do not depend on which towns were asked first (${probeTowns.length} towns, backwards)`);
const ids = new Set(sites.map((site) => site.id));
check(ids.size === sites.length, 'ids are unique', `${ids.size} of ${sites.length}`);
const idForm = sites.every((site) => site.id === `${site.model}:${site.place}:${site.id.split(':')[2]}` && /^\d+$/.test(site.id.split(':')[2]!));
check(idForm, 'every id is <model>:<placeIndex>:<n>');
check(sites.every((site) => isShown(places[site.place]!)), 'every vehicle belongs to a built town');
check(sites.every((site) => lazy.byId(site.id)?.at.equals(site.at) === true), 'every id finds its own site again');

// --- an independent index of the built towns ------------------------------------

const shown = places.map((place, i) => ({ place, i, at: unitAt(place.lat, place.lon, new Vector3()) })).filter((t) => isShown(t.place));
const buckets = new Map<string, typeof shown>();
const key = (lat: number, lon: number): string => `${Math.floor(lat)}:${Math.floor(lon)}`;
for (const town of shown) {
  const k = key(town.place.lat, town.place.lon);
  let list = buckets.get(k);
  if (list === undefined) buckets.set(k, (list = []));
  list.push(town);
}
function townsAround(at: Vector3): typeof shown {
  const lat = latOf(at.y);
  const lon = lonOf(at.x, at.z);
  const out: typeof shown = [];
  const spanLon = Math.min(180, Math.ceil(2 / Math.max(0.05, Math.cos((lat * Math.PI) / 180))));
  for (let a = Math.floor(lat) - 2; a <= Math.floor(lat) + 2; a++) {
    for (let b = Math.floor(lon) - spanLon; b <= Math.floor(lon) + spanLon; b++) {
      const wrapped = ((b + 180) % 360 + 360) % 360 - 180;
      out.push(...(buckets.get(`${a}:${wrapped}`) ?? []));
    }
  }
  return out;
}
const offset = { x: 0, z: 0 };
function insideSquare(at: Vector3, margin: number): string | null {
  for (const town of townsAround(at)) {
    const frame = townOf(town.place);
    if (at.dot(frame.up) <= 0) continue;
    townOffset(frame, at, offset);
    const half = frame.grid.half + margin;
    if (Math.abs(offset.x) < half && Math.abs(offset.z) < half) return town.place.name;
  }
  return null;
}
const paths = new Map<number, CoursePath>();
const pathOf = (r: number): CoursePath => {
  let path = paths.get(r);
  if (path === undefined) paths.set(r, (path = coursePath(courseOf(roads[r]!, places))));
  return path;
};
const units = (a: Vector3, b: Vector3): number => a.angleTo(b) * PLANET_RADIUS;
const point = new Vector3();
const ground = (at: Vector3): number => groundRadius(world, point.copy(at).multiplyScalar(PLANET_RADIUS));

// --- cars ------------------------------------------------------------------------

console.log('\ncars:');
const cars = [...(byKind.get('car') ?? []), ...(byKind.get('van') ?? [])];
let offRoad = 0;
let worstRoad = 0;
const inTown: string[] = [];
let wetCars = 0;
let facing = 0;
for (const car of cars) {
  const path = pathOf(car.road);
  const d = distanceToPath(path, car.at);
  worstRoad = Math.max(worstRoad, d);
  if (d > ROAD_CLASSES[roads[car.road]!.cls]!.width / 2) offRoad++;
  const town = insideSquare(car.at, 0);
  if (town !== null) inTown.push(`${car.id} in ${town}`);
  if (isWater(ground(car.at))) wetCars++;
  // Facing out of its town: away from the centre, give or take the curve.
  const centre = unitAt(places[car.place]!.lat, places[car.place]!.lon, new Vector3());
  const out = car.at.clone().sub(centre).projectOnPlane(car.at).normalize();
  if (out.dot(car.forward) < 0.2) facing++;
}
check(offRoad === 0, 'every car stands on its own carriageway', `worst ${worstRoad.toFixed(2)} units off the centre line against a half-width of ${ROAD_CLASSES[0]!.width / 2}`);
check(inTown.length === 0, 'no car stands inside a town square', inTown.slice(0, 5).join(', '));
check(wetCars === 0, 'no car stands in the water', `${wetCars}`);
check(facing <= cars.length * 0.02, 'cars face out of their town', `${facing} of ${cars.length} do not`);
const townsWithCars = new Set(cars.map((car) => car.place)).size;
const townsWithRoads = new Set(roads.flatMap((road) => [road.a, road.b])).size;
console.log(`       ${townsWithCars} of the ${townsWithRoads} towns with a road have a car at a gate`);

// --- launches ---------------------------------------------------------------------

console.log('\nlaunches:');
const boats = byKind.get('boat') ?? [];
let dry = 0;
let cramped = 0;
let boatsInTown = 0;
let farOut = 0;
const across = new Vector3();
const north = new Vector3();
const corner = new Vector3();
for (const boat of boats) {
  const lat = latOf(boat.at.y);
  const lon = lonOf(boat.at.x, boat.at.z);
  if (!isWater(ground(boat.at)) || world.countryAt(lat, lon) !== 0) dry++;
  north.set(0, 1, 0).projectOnPlane(boat.at).normalize();
  across.crossVectors(boat.at, north).normalize();
  // Room all round at a hull's length, on sixteen bearings: twice the site's own eight.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    corner.copy(boat.at).addScaledVector(across, (Math.sin(a) * 10) / PLANET_RADIUS).addScaledVector(north, (Math.cos(a) * 10) / PLANET_RADIUS).normalize();
    if (!isWater(ground(corner))) {
      cramped++;
      break;
    }
  }
  if (insideSquare(boat.at, 0) !== null) boatsInTown++;
  const centre = unitAt(places[boat.place]!.lat, places[boat.place]!.lon, new Vector3());
  if (units(centre, boat.at) > radiusOf(places[boat.place]!) + 175) farOut++;
}
check(dry === 0, 'every launch is on water, by the ground and by `countryAt`', `${dry} of ${boats.length} are not`);
check(cramped <= boats.length * 0.01, 'launches have water round them at a hull length', `${cramped} of ${boats.length} touch land on one of sixteen bearings`);
check(boatsInTown === 0, 'no launch is inside a town square', `${boatsInTown}`);
check(farOut === 0, 'every launch is off its own town', `${farOut} further out than the search`);

// --- fields -------------------------------------------------------------------------

const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
function fieldCheck(kind: 'plane' | 'balloon', reach: number, grade: number): void {
  const list = byKind.get(kind) ?? [];
  let wet = 0;
  let steep = 0;
  let nearTown = 0;
  let nearRoad = 0;
  let nearMonument = 0;
  const roadIndexNear = (at: Vector3): number => {
    let best = Infinity;
    for (let r = 0; r < roads.length; r++) {
      const road = roads[r]!;
      const a = places[road.a]!;
      const b = places[road.b]!;
      // Cheap reject on the two ends: no course strays a thousand units off both.
      const ea = unitAt(a.lat, a.lon, point);
      if (units(ea, at) > 1400) {
        const eb = unitAt(b.lat, b.lon, point);
        if (units(eb, at) > 1400) continue;
      }
      best = Math.min(best, distanceToPath(pathOf(r), at) - roadClearance(road.cls));
    }
    return best;
  };
  for (const site of list) {
    if (isWater(ground(site.at))) wet++;
    north.set(0, 1, 0).projectOnPlane(site.at).normalize();
    across.crossVectors(site.at, north).normalize();
    if (gradeAt(site.at, across, north, reach, slope).grade > grade) steep++;
    for (const town of townsAround(site.at)) {
      if (units(town.at, site.at) < radiusOf(town.place) + reach) {
        nearTown++;
        break;
      }
    }
    if (roadIndexNear(site.at) < reach) nearRoad++;
    for (const m of monuments) {
      if (units(unitAt(m.lat, m.lon, point), site.at) < (m.footprint ?? MAX_FOOTPRINT) + reach) {
        nearMonument++;
        break;
      }
    }
  }
  check(wet === 0, `every ${kind} stands on land`, `${wet} of ${list.length} do not`);
  check(steep === 0, `every ${kind}'s field is flatter than ${((Math.atan(grade) * 180) / Math.PI).toFixed(0)} degrees`, `${steep}`);
  check(nearTown === 0, `no ${kind} stands in a town`, `${nearTown}`);
  check(nearRoad === 0, `no ${kind} stands on a road`, `${nearRoad}`);
  check(nearMonument === 0, `no ${kind} stands on a landmark`, `${nearMonument}`);
}
console.log('\nlight aircraft:');
fieldCheck('plane', SITE_ROOM.plane, Math.tan((8 * Math.PI) / 180));
const bigTowns = shown.filter((t) => t.place.pop >= 400_000 || t.place.capital === true).length;
console.log(`       ${byKind.get('plane')?.length ?? 0} of the ${bigTowns} towns over 400,000 or capitals found a field`);

// --- airstrips ----------------------------------------------------------------------
//
// Every plane stands at the near end of a strip it can take off down. This walks
// each strip at half the search's spacing, on its centre line and both edges,
// with its own town, road and landmark tests: no water, no town, no road, no
// landmark on it, and nowhere steeper than a plane may be set down on. The
// search's own law is 8 degrees over the strip's width at its own samples; in
// between, the check allows the landing grade, 12.

console.log('\nairstrips:');
{
  const planes = byKind.get('plane') ?? [];
  const STEP = 10;
  const edge = new Vector3();
  const across = new Vector3();
  const landing = Math.tan((12 * Math.PI) / 180);
  let wetStrips = 0;
  let steepStrips = 0;
  let townStrips = 0;
  let roadStrips = 0;
  let monumentStrips = 0;
  let worstGrade = 0;
  const bad: string[] = [];
  const nearRoads = (at: Vector3, clear: number): boolean => {
    for (let r = 0; r < roads.length; r++) {
      const road = roads[r]!;
      const a = places[road.a]!;
      const b = places[road.b]!;
      const ea = unitAt(a.lat, a.lon, point);
      if (units(ea, at) > 1400) {
        const eb = unitAt(b.lat, b.lon, point);
        if (units(eb, at) > 1400) continue;
      }
      if (distanceToPath(pathOf(r), at) < roadClearance(road.cls) + clear) return true;
    }
    return false;
  };
  for (const site of planes) {
    let wetHere = false;
    let steepHere = false;
    let townHere = false;
    let roadHere = false;
    let monumentHere = false;
    across.crossVectors(site.forward, site.at).normalize();
    const mid = stripPoint(site, STRIP_LENGTH / 2, 0, new Vector3());
    const towns = townsAround(mid);
    for (let along = -STRIP_BACK; along <= STRIP_LENGTH + 1e-6; along += STEP) {
      const centre = stripPoint(site, along, 0, new Vector3());
      for (const lateral of [-STRIP_HALF, 0, STRIP_HALF]) {
        if (isWater(ground(stripPoint(site, along, lateral, edge)))) wetHere = true;
      }
      const grade = gradeAt(centre, across, site.forward, STRIP_HALF, slope).grade;
      worstGrade = Math.max(worstGrade, grade);
      if (grade > landing) steepHere = true;
      for (const town of towns) if (units(town.at, centre) < radiusOf(town.place) + STRIP_HALF) townHere = true;
      if (!roadHere && nearRoads(centre, STRIP_HALF)) roadHere = true;
      for (const m of monuments) {
        if (units(unitAt(m.lat, m.lon, point), centre) < (m.footprint ?? MAX_FOOTPRINT) + STRIP_HALF) monumentHere = true;
      }
    }
    if (wetHere) wetStrips++;
    if (steepHere) steepStrips++;
    if (townHere) townStrips++;
    if (roadHere) roadStrips++;
    if (monumentHere) monumentStrips++;
    if ((wetHere || steepHere || townHere || roadHere || monumentHere) && bad.length < 5) {
      bad.push(`${site.id}${wetHere ? ' wet' : ''}${steepHere ? ' steep' : ''}${townHere ? ' town' : ''}${roadHere ? ' road' : ''}${monumentHere ? ' landmark' : ''}`);
    }
  }
  check(wetStrips === 0, 'no airstrip crosses water, edge to edge', `${wetStrips} of ${planes.length}; ${bad.join(', ')}`);
  check(townStrips === 0, 'no airstrip crosses a town', `${townStrips}`);
  check(roadStrips === 0, 'no airstrip crosses a road', `${roadStrips}`);
  check(monumentStrips === 0, 'no airstrip crosses a landmark', `${monumentStrips}`);
  check(steepStrips === 0, 'no airstrip is steeper than a landing anywhere along it', `${steepStrips}; the steepest ${((Math.atan(worstGrade) * 180) / Math.PI).toFixed(1)} degrees`);
  // The discs the wood keeps off cover the whole strip.
  let uncovered = 0;
  for (const site of planes.filter((_, i) => i % 10 === 0)) {
    const discs = stripKeepouts(site);
    for (let along = -STRIP_BACK; along <= STRIP_LENGTH + 1e-6; along += 5) {
      for (const lateral of [-STRIP_HALF, -STRIP_HALF / 2, 0, STRIP_HALF / 2, STRIP_HALF]) {
        stripPoint(site, along, lateral, edge);
        if (!discs.some((disc) => units(disc.at, edge) <= disc.radius + 1e-3)) uncovered++;
      }
    }
  }
  check(uncovered === 0, "an airstrip's keepout discs cover all of it", `${uncovered} points outside every disc`);
}

console.log('\nballoons:');
fieldCheck('balloon', SITE_ROOM.balloon, Math.tan((14 * Math.PI) / 180));

// --- the wood keeps off the fields ------------------------------------------------------
//
// The real vegetation streamer, headless, building the tiles over a few fields
// at every level and asking where every vertex of every plant landed: nothing
// may stand inside a plane's or a balloon's field. `vegetation.ts` reaches the
// scenery registry, which is an eager `import.meta.glob` — a Vite transform —
// so the one call is rewritten into the static imports Vite would have made.

console.log('\nthe wood keeps off the fields:');
{
  const scenery = resolve(here, '../src/scenery');
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (!url.endsWith('/src/scenery/index.ts')) return result;
      const files = readdirSync(resolve(scenery, 'parts')).filter((file) => file.endsWith('.ts')).sort();
      const imports = files.map((file, i) => `import * as part${i} from './parts/${file}';`).join('\n');
      const table = `{ ${files.map((file, i) => `'./parts/${file}': part${i}`).join(', ')} }`;
      const source = String(result.source);
      const glob = /import\.meta\.glob\s*(?:<.*?>)?\s*\('\.\/parts\/\*\.ts', \{ eager: true \}\)/;
      if (!glob.test(source)) throw new Error('check-fleet: the scenery registry no longer reads its parts the way this shim rewrites');
      return { ...result, source: `${imports}\n${source.replace(glob, table)}` };
    },
  });
  const { registerModelsFromDisk } = await import('./kit-node.ts');
  await registerModelsFromDisk();
  const { createVegetation } = await import('../src/vegetation.ts');
  const fields = createSiteIndex(source);
  const wood = createVegetation(world, { places, monuments: monuments as never, roads, fields });
  const planes = byKind.get('plane') ?? [];
  const balloons = byKind.get('balloon') ?? [];
  const probes = [
    sites.find((site) => site.id === 'light-plane:232:0'),
    ...planes.filter((_, i) => i % Math.max(1, Math.floor(planes.length / 8)) === 0),
    ...balloons.filter((_, i) => i % Math.max(1, Math.floor(balloons.length / 4)) === 0),
  ].filter((site): site is FleetSite => site !== undefined);
  const vertex = new Vector3();
  let tiles = 0;
  let plantsNear = 0;
  const intruded: string[] = [];
  const side = new Vector3();
  /**
   * How far inside the ground a site keeps a point is: for a balloon, its
   * field's radius less the distance from its centre; for a plane, the least
   * of the distances to the strip's four sides, in the strip's own frame.
   * Positive is inside.
   */
  const inside = (site: FleetSite, at: Vector3): number => {
    if (site.kind !== 'plane') return SITE_ROOM.balloon - units(at, site.at);
    side.crossVectors(site.forward, site.at).normalize();
    const d = at.clone().sub(site.at);
    const along = d.dot(site.forward) * PLANET_RADIUS;
    const lateral = d.dot(side) * PLANET_RADIUS;
    return Math.min(along + STRIP_BACK, STRIP_LENGTH - along, STRIP_HALF - Math.abs(lateral));
  };
  const tileAt = new Vector3();
  for (const site of probes) {
    // A strip crosses more than one tile: its stand, its middle and its far end.
    const spots = site.kind === 'plane' ? [0, STRIP_LENGTH / 2, STRIP_LENGTH] : [0];
    const seen = new Set<string>();
    for (const along of spots) {
      stripPoint(site, along, 0, tileAt);
      for (let level = 0; level < 4; level++) {
        const mesh = wood.raiseTile(latOf(tileAt.y), lonOf(tileAt.x, tileAt.z), level);
        if (mesh === null) continue;
        const key = `${level}:${mesh.position.x.toFixed(1)}:${mesh.position.z.toFixed(1)}`;
        if (seen.has(key)) {
          mesh.geometry.dispose();
          continue;
        }
        seen.add(key);
        tiles++;
        const position = mesh.geometry.getAttribute('position');
        let worst = -Infinity;
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).normalize();
          const d = inside(site, vertex);
          if (d > worst) worst = d;
        }
        if (worst > -40) plantsNear++;
        if (worst > 0) intruded.push(`${site.id} level ${level}: a plant ${worst.toFixed(1)} units inside`);
        mesh.geometry.dispose();
      }
    }
  }
  check(
    probes.some((site) => site.id === 'light-plane:232:0'),
    "Barcelona's light plane is among the fields probed",
  );
  check(
    intruded.length === 0,
    `no plant stands on an airstrip or in a balloon's field (${probes.length} fields, ${tiles} tiles, ${plantsNear} with a plant within 40 units of the edge)`,
    intruded.slice(0, 4).join('; '),
  );
}

// --- poses ---------------------------------------------------------------------------

console.log('\nposes:');
const object = new Object3D();
const pose: number[] = [];
let mirrored = 0;
for (const site of sites.filter((_, i) => i % 50 === 0)) {
  writePose(site.at.clone().multiplyScalar(PLANET_RADIUS), site.forward, site.at, pose);
  applyPose(pose, object);
  object.updateMatrix();
  if (!(object.matrix.determinant() > 0)) mirrored++;
  // The model's +Z must come out as the site's forward, and +Y as up.
  const z = new Vector3(0, 0, 1).applyQuaternion(object.quaternion);
  const y = new Vector3(0, 1, 0).applyQuaternion(object.quaternion);
  if (z.dot(site.forward) < 0.9999 || y.dot(site.at) < 0.9999) mirrored++;
}
check(mirrored === 0, 'a site pose stands a model the right way up, facing forward, with a positive determinant');

// --- the local link ---------------------------------------------------------------------

console.log('\nthe local link:');
{
  const link = createLocalLink('me');
  const id = sites[0]!.id;
  const took = await link.claim(id, 0);
  check(took && link.moved.get(id)?.seats[0] === 'me', 'a free seat is claimed');
  const where = [1, 2, 3, 0, 0, 1, 0, 1, 0];
  link.drive(id, where, 10);
  link.release(id, where);
  const left = link.moved.get(id);
  check(left !== undefined && left.seats.every((s) => s === null) && left.pose.join() === where.join(), 'released where it was driven, with nobody in it');
  const second = await link.claim(id, 1);
  link.release(id, null);
  check(second && link.moved.get(id)?.pose.join() === where.join(), 'a passenger leaving does not move it');
  check(link.sample(id, pose) === false, 'nobody else drives on a local link');
}

// --- named places ------------------------------------------------------------------------

console.log('\nnamed places:');
for (const name of ['Palma', 'Barcelona', 'Paris', 'Tokyo', 'Sydney', 'Nairobi']) {
  const index = places.findIndex((place) => place.name === name && isShown(place));
  if (index < 0) {
    console.log(`  ${name}: not built`);
    continue;
  }
  const centre = unitAt(places[index]!.lat, places[index]!.lon, new Vector3());
  const nearby = sites.filter((site) => units(site.at, centre) < radiusOf(places[index]!) + 220);
  console.log(`  ${name} (radius ${radiusOf(places[index]!).toFixed(0)}):`);
  for (const site of nearby) {
    const lat = latOf(site.at.y);
    const lon = lonOf(site.at.x, site.at.z);
    const owner = site.place === index ? '' : ` (of ${places[site.place]!.name})`;
    console.log(`    ${site.id.padEnd(22)} ${lat.toFixed(4)}, ${lon.toFixed(4)}  ${units(site.at, centre).toFixed(0)} units out${owner}`);
  }
}

// --- the ride, headless -------------------------------------------------------------------
//
// The real player on the real planet, with the real models, stepped at 60 Hz:
// into the water and out of it, and into each kind of vehicle, driven, and
// out again. No made ground (the ribbon and the towns are streamers), so a car
// drives the relief here; what is checked is the state machine, not the lawn.

console.log('\nthe ride, headless:');
{
  const g = globalThis as Record<string, unknown>;
  const PUBLIC = resolve(here, '../public');
  g.fetch = async (url: string) => {
    const bytes = readFileSync(resolve(PUBLIC, `.${String(url).replace(/^[^/]*\/\/[^/]*/, '')}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  await import('./kit-node.ts');
  const { modelsFrom } = await import('../src/kit.ts');
  const { craftFrom } = await import('../src/craft/index.ts');
  const { prepareAvatar, WALK_SPEED } = await import('../src/avatar.ts');
  const { createPlayer } = await import('../src/player.ts');
  const craft = craftFrom(await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin'))));
  await prepareAvatar();

  // The sites keep room for the models without reading them (`SITE_ROOM`), so
  // the models are held to the room here.
  const size = (id: string): readonly [number, number, number] => craft.get(id)!.size;
  const carLength = Math.max(size('hatchback')[0], size('van')[0]);
  check(SITE_ROOM.car >= carLength / 2, 'a parked car fits its room out of the square', `${SITE_ROOM.car} against half of ${carLength.toFixed(2)}`);
  check(SITE_ROOM.boat >= size('launch')[0] / 2 + 2, 'a launch fits its ring of water with room to spare', `${SITE_ROOM.boat} against half of ${size('launch')[0].toFixed(2)}`);
  check(SITE_ROOM.plane >= Math.max(size('light-plane')[0], size('light-plane')[1]) / 2, 'a plane fits its field', `${SITE_ROOM.plane} against half of ${Math.max(size('light-plane')[0], size('light-plane')[1]).toFixed(2)}`);
  check(SITE_ROOM.balloon >= size('balloon')[1] / 2, 'a balloon fits its field', `${SITE_ROOM.balloon} against half of ${size('balloon')[1].toFixed(2)}`);
  const events: string[] = [];
  const player = createPlayer(world, 41.39, 2.17, { onEvent: (event) => events.push(event) });
  const heading = new Vector3();
  const step = (seconds: number, input: { x?: number; y?: number; run?: boolean; climb?: boolean; dive?: boolean }): void => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      heading.copy(player.forward);
      player.update(1 / 60, {
        move: { x: input.x ?? 0, y: input.y ?? 0 },
        run: input.run ?? false,
        jump: false,
        heading,
        climb: input.climb ?? false,
        dive: input.dive ?? false,
      });
    }
  };
  const find = (id: string): FleetSite => sites.find((site) => site.id === id) ?? sites.find((site) => site.model === id.split(':')[0])!;
  const board = (site: FleetSite): void => {
    const model = craft.get(site.model)!;
    const r = site.kind === 'boat' ? PLANET_RADIUS + 0.5 : ground(site.at);
    player.board({ vehicle: site.id, seat: 0, model, group: model.build(0) }, writePose(site.at.clone().multiplyScalar(r), site.forward, site.at, []));
  };

  // Afloat, and out again.
  const boat = find('launch:232:0');
  player.goTo(latOf(boat.at.y), lonOf(boat.at.x, boat.at.z));
  check(player.state === 'swim' && player.sink > 0, 'put on the water, the player swims', `${player.state}, sink ${player.sink.toFixed(2)}`);
  const surface = player.position.length() - PLANET_RADIUS;
  step(1, { y: 1 });
  check(Math.abs(player.velocity - WALK_SPEED / 2) < 0.3 && Math.abs(player.position.length() - PLANET_RADIUS - surface) < 1e-6, 'swims at half a walk, on the surface', `${player.velocity.toFixed(2)} units/s`);
  // Swim back towards the town until the shore takes him.
  const town = unitAt(places[boat.place]!.lat, places[boat.place]!.lon, new Vector3());
  let seconds = 0;
  for (; seconds < 120 && player.state === 'swim'; seconds += 0.5) {
    player.forward.copy(town).sub(player.position.clone().normalize()).projectOnPlane(player.up).normalize();
    step(0.5, { y: 1, run: true });
  }
  check(player.state === 'foot' && events.includes('ashore'), 'swimming at the shore climbs out onto it', `${player.state} after ${seconds} s`);

  // A car: forward along its road, and out beside it.
  const car = find(cars[0]!.id);
  board(car);
  check(player.state === 'seated' && player.mode === 'car', 'a car is taken at the wheel', player.mode);
  const start = player.position.clone();
  step(3, { y: 1 });
  const driven = units(start.clone().normalize(), player.position.clone().normalize());
  check(driven > 30 || player.velocity === 0, 'W drives it', `${driven.toFixed(1)} units in 3 s, ${player.velocity.toFixed(1)} units/s now`);
  check(Math.abs(player.position.length() - ground(player.position.clone().normalize())) < 1.5, 'on the ground it drives over', `${(player.position.length() - ground(player.position.clone().normalize())).toFixed(2)} off it`);
  step(3, { y: -1 });
  const left = player.leave();
  check(left !== null && player.state === 'foot' && player.ride === null, 'E gets out beside it, on foot');

  // The launch, out of the harbour.
  board(boat);
  step(2, { y: 1 });
  check(player.mode === 'boat' && Math.abs(player.position.length() - PLANET_RADIUS - 0.5) < 1e-6, 'a launch sails on the waterline', `${player.velocity.toFixed(1)} units/s`);
  const ashore = player.leave();
  check(ashore !== null && (player.state === 'foot' || player.state === 'swim'), 'and is left for the shore or the water', player.state);

  // The plane: a take-off run, a climb, and down again.
  // One far inland: the flight below runs a few thousand units down the
  // strip's heading, and has to come down on land.
  const plane =
    sites.find((site) => site.kind === 'plane' && shoreDistance(latOf(site.at.y), lonOf(site.at.x, site.at.z)) > 8) ?? byKind.get('plane')![0]!;
  board(plane);
  check(player.mode === 'plane' && player.grounded && !player.airborne, 'a plane is taken on the ground', `${plane.id}, ${places[plane.place]!.name}`);
  check(player.leave() !== null, 'and can be left there');
  board(plane);
  events.length = 0;
  let liftOff = -1;
  let firstSecond = 0;
  for (let t = 0; t < 8; t += 1 / 60) {
    step(1 / 60, { climb: true });
    if (liftOff < 0 && events.includes('took-off')) {
      liftOff = player.altitude;
      // The run has to fit the strip it starts on, with room to spare.
      const run = units(plane.at, player.position.clone().normalize());
      check(run < STRIP_LENGTH - 30, 'a take-off run leaves the ground well inside its strip', `${run.toFixed(0)} units of ${STRIP_LENGTH}`);
    }
    else if (liftOff >= 0 && firstSecond < 60) firstSecond++;
    if (firstSecond === 60) {
      check(player.altitude - liftOff < 15, 'a take-off climbs gently off the ground, not to a circuit', `${(player.altitude - liftOff).toFixed(1)} units in its first second`);
      firstSecond++;
    }
  }
  check(events.includes('took-off') && player.airborne, 'holding the climb key takes off', `${player.altitude.toFixed(0)} up, ${player.velocity.toFixed(0)} units/s`);
  step(3, { run: true });
  const climbed = player.altitude;
  step(3, {});
  const held = player.altitude;
  step(2, {});
  check(Math.abs(player.altitude - held) < held * 0.01 && held >= climbed, 'the run key climbs too, and letting go levels off', `${climbed.toFixed(0)} then ${held.toFixed(0)} then ${player.altitude.toFixed(0)}`);
  check(player.leave() === null, 'nobody steps out of a plane in flight');
  for (seconds = 0; seconds < 120 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
  check(player.grounded && events.some((event) => event === 'landed'), 'holding descend lands it', `after ${seconds} s; ${events.join(', ')}`);
  step(4, { y: -1 });
  check(player.leave() !== null && player.state !== 'seated', 'and it is left on the ground');

  // The balloon: up, not out, down, out.
  const balloon = byKind.get('balloon')![0]!;
  board(balloon);
  events.length = 0;
  step(4, { climb: true });
  check(player.airborne && player.altitude - (ground(balloon.at) - PLANET_RADIUS) > 10, 'a balloon rises on the climb key', `${(player.altitude - (ground(balloon.at) - PLANET_RADIUS)).toFixed(1)} over the ground`);
  check(player.leave() === null, 'and cannot be left aloft');
  for (seconds = 0; seconds < 60 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
  check(player.grounded, 'sinks until it sets down', `after ${seconds} s`);
  check(player.leave() !== null && player.state !== 'seated', 'and is left where it landed');

  // A car into a wall: it stops at it, comes back off it, and says so.
  {
    const hits: { event: string; strength: number }[] = [];
    const up = car.at.clone();
    const wallAt = car.at.clone().addScaledVector(car.forward, 40 / PLANET_RADIUS).normalize();
    const normal = car.forward.clone().negate();
    const crashing = createPlayer(world, 41.39, 2.17, {
      onEvent: (event, strength) => hits.push({ event, strength }),
      collide: (point, radius, push) => {
        // A wall square across the road, 40 units ahead of the car's site.
        const gap = point.clone().normalize().sub(wallAt).dot(normal) * PLANET_RADIUS;
        if (gap >= radius) return false;
        push.copy(normal).multiplyScalar(radius - gap);
        return true;
      },
    });
    const model = craft.get(car.model)!;
    crashing.board({ vehicle: car.id, seat: 0, model, group: model.build(0) }, writePose(up.clone().multiplyScalar(ground(car.at)), car.forward, up, []));
    for (let t = 0; t < 4; t += 1 / 60) {
      heading.copy(crashing.forward);
      crashing.update(1 / 60, { move: { x: 0, y: 1 }, run: true, jump: false, heading });
    }
    const beyond = crashing.position.clone().normalize().sub(wallAt).dot(normal) * PLANET_RADIUS;
    const crash = hits.find((hit) => hit.event === 'crashed');
    check(crash !== undefined && crash.strength > 0, 'a car driven into a wall crashes, and says how hard', crash === undefined ? hits.map((hit) => hit.event).join(', ') : `${crash.strength.toFixed(1)} units/s lost`);
    check(beyond > 0, 'and does not pass through it', `${beyond.toFixed(2)} units short of it`);
  }

  // A vehicle standing in the world is a wall to anybody on foot.
  {
    const { createFleet } = await import('../src/fleet.ts');
    const walker = createPlayer(world, latOf(car.at.y), lonOf(car.at.x, car.at.z));
    const fleet = createFleet({ ...source, models: craft, link: createLocalLink('check'), player: walker });
    for (let i = 0; i < 20; i++) fleet.update(0.1);
    const standing = fleet.group.children.find((child) => child.name === 'vehicle:' + craft.get(car.model)!.id);
    const push = new Vector3();
    const inside = standing === undefined ? false : fleet.collide(standing.position.clone(), 1.3, push);
    const pushed = push.length();
    const away = standing === undefined ? true : fleet.collide(standing.position.clone().normalize().multiplyScalar(PLANET_RADIUS + 999), 1.3, push);
    const clear = standing === undefined ? true : fleet.collide(standing.position.clone().applyAxisAngle(new Vector3(0, 1, 0), 30 / PLANET_RADIUS), 1.3, push);
    check(standing !== undefined && inside && pushed > 1 && !away && !clear, 'a parked car pushes a body out of itself, and nothing near it or over it', `${fleet.stats.built} built, push ${pushed.toFixed(2)}`);
  }

  // A teleport out of a seat is a teleport: on foot, the vehicle let go.
  board(car);
  player.goTo(41.39, 2.17);
  check(player.ride === null && player.state !== 'seated', 'a teleport leaves the vehicle behind');
}

console.log(failures === 0 ? '\nall fleet checks passed' : `\n${failures} fleet check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
