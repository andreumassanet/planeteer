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
  STRIP_DRAWN,
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
import { CRAFT_KINDS } from '../src/craft/contract.ts';
import { onStrip } from '../src/craft/airstrip.ts';
import { plannedSite, siteGap } from '../src/landmark-ground.ts';
import type { LandmarkSite } from '../src/landmark-ground.ts';

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
const monuments: LandmarkSite[] = existsSync(monumentsPath)
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
const monumentPlans = monuments.map(plannedSite);
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
for (const kind of CRAFT_KINDS) console.log(`  ${kind.padEnd(10)} ${byKind.get(kind)?.length ?? 0}`);
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
// And a warm-up in pieces — one stand of one town's search a call, as a frame
// hands it out — leaves the same strips behind as asking outright: the plane
// towns round three crowded places, warmed first and then read.
{
  const warm = createSiteIndex(source);
  const around = ['Shanghai', 'Wuhan', 'Delhi'].map((name) => places.findIndex((place) => place.name === name)).filter((p) => p >= 0);
  let calls = 0;
  for (const p of around) {
    const at = unitAt(places[p]!.lat, places[p]!.lon, new Vector3());
    for (let n = 0; ; ) {
      calls++;
      if (warm.warm(at, 1200, () => n++ % 2 === 0)) break;
    }
  }
  const warmedPlanes = sites.filter((site) => site.kind === 'plane' && around.some((p) => unitAt(places[p]!.lat, places[p]!.lon, new Vector3()).angleTo(unitAt(places[site.place]!.lat, places[site.place]!.lon, new Vector3())) * PLANET_RADIUS < 1200));
  const warmOk = warmedPlanes.every((site) => {
    const mine = warm.sitesOf(site.place).find((entry) => entry.id === site.id);
    return mine !== undefined && mine.at.equals(site.at) && mine.forward.equals(site.forward);
  });
  const extra = around.flatMap((p) => warm.planesNear(unitAt(places[p]!.lat, places[p]!.lon, new Vector3()), 300, [])).filter((site) => !sites.some((other) => other.id === site.id));
  check(warmOk && extra.length === 0 && warmedPlanes.length > 0, 'a warm-up in pieces leaves the same strips as asking outright', `${warmedPlanes.length} strips round ${around.length} cities, ${calls} calls`);
}
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
function fieldCheck(kind: 'plane' | 'balloon' | 'horse' | 'tractor' | 'helicopter', reach: number, grade: number): void {
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
    // Off each landmark's plan, which is what the sites keep clear of.
    for (const m of monumentPlans) {
      if (m.up.x * site.at.x + m.up.y * site.at.y + m.up.z * site.at.z < Math.cos((m.reach + reach + 1) / PLANET_RADIUS)) continue;
      if (siteGap(m, point.copy(site.at).normalize(), PLANET_RADIUS) < reach) {
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
      for (const m of monumentPlans) {
        if (m.up.x * centre.x + m.up.y * centre.y + m.up.z * centre.z < Math.cos((m.reach + STRIP_HALF + 1) / PLANET_RADIUS)) continue;
        if (siteGap(m, point.copy(centre).normalize(), PLANET_RADIUS) < STRIP_HALF) monumentHere = true;
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
  // No two strips cross. Two drawn strips in one place are two coplanar
  // surfaces, and they fight for the depth buffer wherever they overlap. The
  // witness is the drawing's own rectangle (`onStrip`), not the search's test:
  // each strip's drawn rectangle is sampled every `GRID` units and asked
  // whether the other's, grown by `GRID`, holds it, both ways round.
  const GRID = 4;
  const sample = new Vector3();
  const crosses = (a: FleetSite, b: FleetSite): boolean => {
    for (let along = -STRIP_BACK - 4; along <= STRIP_LENGTH + 4 + 1e-6; along += GRID) {
      for (let lateral = -STRIP_DRAWN; lateral <= STRIP_DRAWN + 1e-6; lateral += GRID) {
        if (onStrip(b, stripPoint(a, along, lateral, sample), GRID)) return true;
      }
    }
    return false;
  };
  const pairs: string[] = [];
  const reach = 2 * (STRIP_LENGTH + STRIP_BACK + 8 + STRIP_HALF);
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      const a = planes[i]!;
      const b = planes[j]!;
      if (units(a.at, b.at) > reach) continue;
      if (crosses(a, b) || crosses(b, a)) pairs.push(`${places[a.place]!.name}/${places[b.place]!.name} (stands ${units(a.at, b.at).toFixed(0)} apart)`);
    }
  }
  check(pairs.length === 0, 'no two airstrips overlap, worldwide', `${pairs.length} pairs of ${planes.length} strips${pairs.length ? `: ${pairs.slice(0, 12).join(', ')}` : ''}`);
}

console.log('\nballoons:');
fieldCheck('balloon', SITE_ROOM.balloon, Math.tan((14 * Math.PI) / 180));
console.log('\nhorses, tractors and helicopters:');
fieldCheck('horse', SITE_ROOM.horse, Math.tan((20 * Math.PI) / 180));
fieldCheck('tractor', SITE_ROOM.tractor, Math.tan((14 * Math.PI) / 180));
fieldCheck('helicopter', SITE_ROOM.helicopter, Math.tan((8 * Math.PI) / 180));
{
  // A town's fields keep off each other: no horse, tractor or helicopter in
  // another field of its town, or on its airstrip.
  const fielded = sites.filter((site) => site.kind === 'horse' || site.kind === 'tractor' || site.kind === 'helicopter');
  let overlapping = 0;
  for (const site of fielded) {
    for (const other of sites) {
      if (other === site || other.place !== site.place) continue;
      if (other.kind === 'plane') {
        if (stripKeepouts(other).some((disc) => units(disc.at, site.at) < disc.radius + SITE_ROOM[site.kind])) overlapping++;
      } else if ((other.kind === 'balloon' || fielded.includes(other)) && units(other.at, site.at) < SITE_ROOM[other.kind] + SITE_ROOM[site.kind]) overlapping++;
    }
  }
  check(overlapping === 0, "no horse, tractor or helicopter stands in another of its town's fields", `${overlapping}`);
  const million = shown.filter((t) => t.place.pop >= 1_000_000).length;
  console.log(`       ${byKind.get('helicopter')?.length ?? 0} of the ${million} cities of a million found a pad`);
}

// --- at the gates, and off the shore ------------------------------------------------
//
// The rest of the fleet: a rack of bicycles and a motorbike on the verge of a
// road out of town, a tuk-tuk, a jeep and a bus on its carriageway; a jet ski
// and a sailboat on open water near the town's launch. Each asked what its
// place asks of it: on its road or beside it, never in a square or the water
// — or on the water with room round it, never in a square.

console.log('\nat the gates:');
{
  for (const kind of ['bicycle', 'motorbike', 'tuktuk', 'jeep', 'bus'] as const) {
    const list = byKind.get(kind) ?? [];
    const verge = kind === 'bicycle' || kind === 'motorbike';
    let astray = 0;
    let onIt = 0;
    let squared = 0;
    let soaked = 0;
    let worst = 0;
    for (const site of list) {
      const half = ROAD_CLASSES[roads[site.road]!.cls]!.width / 2;
      const d = site.road < 0 ? Infinity : distanceToPath(pathOf(site.road), site.at);
      worst = Math.max(worst, d);
      if (verge) {
        if (d > half + 1.6 + SITE_ROOM[kind] + 1) astray++;
        if (d < half) onIt++;
      } else if (d > half) astray++;
      if (insideSquare(site.at, 0) !== null) squared++;
      if (isWater(ground(site.at))) soaked++;
    }
    check(astray === 0, verge ? `every ${kind} stands on the verge of its road` : `every ${kind} stands on its own carriageway`, `${astray} of ${list.length}; the furthest ${worst.toFixed(1)} units off the centre line`);
    if (verge) check(onIt === 0, `no ${kind} stands on the carriageway`, `${onIt}`);
    check(squared === 0 && soaked === 0, `no ${kind} stands in a town square or in the water`, `${squared} in a square, ${soaked} wet`);
  }
  const cycling = shown.filter((t) => ['NLD', 'DNK'].includes(t.place.iso) && roads.some((road) => road.a === t.i || road.b === t.i));
  const racked = cycling.filter((t) => (byKind.get('bicycle') ?? []).some((site) => site.place === t.i)).length;
  check(racked >= cycling.length * 0.9, 'nearly every Dutch and Danish town with a road keeps bicycles at its gate', `${racked} of ${cycling.length}`);
}

console.log('\noff the shore:');
{
  for (const kind of ['jetski', 'sailboat'] as const) {
    const list = byKind.get(kind) ?? [];
    let dryHere = 0;
    let crampedHere = 0;
    let squared = 0;
    for (const site of list) {
      const lat = latOf(site.at.y);
      const lon = lonOf(site.at.x, site.at.z);
      if (!isWater(ground(site.at)) || world.countryAt(lat, lon) !== 0) dryHere++;
      north.set(0, 1, 0).projectOnPlane(site.at).normalize();
      across.crossVectors(site.at, north).normalize();
      const room = SITE_ROOM[kind] * 0.8;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        corner.copy(site.at).addScaledVector(across, (Math.sin(a) * room) / PLANET_RADIUS).addScaledVector(north, (Math.cos(a) * room) / PLANET_RADIUS).normalize();
        if (!isWater(ground(corner))) {
          crampedHere++;
          break;
        }
      }
      if (insideSquare(site.at, 0) !== null) squared++;
    }
    check(dryHere === 0, `every ${kind} is on water`, `${dryHere} of ${list.length} are not`);
    check(crampedHere <= list.length * 0.01, `a ${kind} has water round it`, `${crampedHere} of ${list.length} touch land on one of sixteen bearings`);
    check(squared === 0, `no ${kind} is inside a town square`, `${squared}`);
  }
}

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
  const every = (kind: string, count: number): FleetSite[] => {
    const list = byKind.get(kind) ?? [];
    return list.filter((_, i) => i % Math.max(1, Math.floor(list.length / count)) === 0);
  };
  const probes = [
    sites.find((site) => site.id === 'light-plane:232:0'),
    ...planes.filter((_, i) => i % Math.max(1, Math.floor(planes.length / 8)) === 0),
    ...balloons.filter((_, i) => i % Math.max(1, Math.floor(balloons.length / 4)) === 0),
    ...every('horse', 3),
    ...every('tractor', 2),
    ...every('helicopter', 3),
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
    if (site.kind !== 'plane') return SITE_ROOM[site.kind] - units(at, site.at);
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

// --- rockets beside the airstrips -------------------------------------------------------
//
// Half the towns with a strip keep a rocket on a pad beside it (`launch-pads.ts`),
// chosen by a roll of the town's index and stood at the first clear spot of a
// fixed list. This asks for the pads twice and backwards and wants the same
// answer, then holds every pad to its own witnesses — the drawn strips' ground,
// the towns' discs, the roads walked whole, the landmarks' plans, the railway,
// the outlines and the relief under it, every other pad — and builds the wood
// round a sample of them to see nothing stands on one. Then a rocket is built
// headless beside one, walked into, boarded and launched.

console.log('\nrockets beside the airstrips:');
{
  const { createPadIndex, createLaunchPads, keepsRocket, PAD_GRADE, PAD_FALL, PAD_KEEP, PAD_MARGIN, PAD_SHARE } = await import('../src/launch-pads.ts');
  const { ROCKET_HEIGHT, ROCKET_REACH, ROCKET_WALL } = await import('../src/rocket.ts');
  const { createRailNetwork, joinFields, railFields } = await import('../src/rails.ts');
  const { decodeRails } = await import('../src/pack.ts');
  const railsPath = resolve(here, '../public/data/rails.bin');
  const railData = existsSync(railsPath) ? decodeRails(await inflate(readFileSync(railsPath))) : null;
  const network = railData !== null && railData.places === places.length && railData.roads === roads.length ? createRailNetwork(railData.lines, places, world) : null;
  check(network !== null, 'rails.bin was baked against these places and roads, so the pads can keep off the line');
  const railGround = network === null ? null : railFields(network);
  const planes = byKind.get('plane') ?? [];
  const index = createSiteIndex(source);
  began = performance.now();
  const padIndex = createPadIndex({ world, sites: index, rails: railGround });
  const pads = planes.map((strip) => padIndex.padOf(strip));
  const padMs = performance.now() - began;
  const keepers = planes.filter((strip) => keepsRocket(strip.place));
  const standing = pads.filter((pad): pad is NonNullable<typeof pad> => pad !== null);
  const refusals = new Map<string, number>();
  for (const strip of keepers) for (const why of padIndex.refusals(strip) ?? []) refusals.set(why, (refusals.get(why) ?? 0) + 1);
  const spots = new Map<number, number>();
  for (const pad of standing) spots.set(pad.spot, (spots.get(pad.spot) ?? 0) + 1);
  console.log(`       ${keepers.length} of the ${planes.length} strips' towns keep a rocket (${(PAD_SHARE * 100).toFixed(0)}% by roll), ${standing.length} found a spot, ${Math.round(padMs)} ms`);
  console.log(`       spots taken: ${[...spots].sort((a, b) => a[0] - b[0]).map(([spot, n]) => `#${spot} ${n}`).join(', ')}`);
  console.log(`       spots refused, of the ${keepers.length - standing.length} towns with none: ${[...refusals].map(([why, n]) => `${why} ${n}`).join(', ') || 'none'}`);
  // A roll of a fair coin per town: within three standard deviations of half.
  const sigma = Math.sqrt(planes.length) / 2;
  check(Math.abs(keepers.length - planes.length / 2) <= 3 * sigma, 'about half the airstrips keep a rocket', `${keepers.length} of ${planes.length}, half is ${(planes.length / 2).toFixed(0)} +- ${(3 * sigma).toFixed(0)}`);
  check(standing.length >= keepers.length * 0.85, 'nearly every town that keeps one finds a spot beside its strip', `${standing.length} of ${keepers.length}`);
  check(pads.every((pad, i) => pad === null || (pad.strip === planes[i] && keepsRocket(pad.place) && pad.id === `rocket:${pad.place}`)), 'a pad is its own strip town\'s, rocket:<placeIndex>');

  // Determinism: another index, asked backwards, and the near lookup.
  const twin = createPadIndex({ world, sites: createSiteIndex(source), rails: railGround });
  const backwards = [...planes].reverse().map((strip) => twin.padOf(strip)).reverse();
  const same = pads.every((pad, i) => {
    const other = backwards[i] ?? null;
    return pad === null ? other === null : other !== null && pad.at.equals(other.at) && pad.heading.equals(other.heading) && pad.spot === other.spot;
  });
  check(same, 'two indices, one asked backwards, give the same pads bit for bit');
  let lookups = 0;
  let missed = 0;
  for (const pad of standing.filter((_, i) => i % 7 === 0)) {
    lookups++;
    const found = twin.padsNear(pad.at, 5, []);
    if (!found.some((other) => other.id === pad.id)) missed++;
    if (twin.fieldsNear(pad.at, 0, []).length === 0) missed++;
  }
  check(missed === 0, 'every pad is found by padsNear and kept by fieldsNear round its own centre', `${lookups} pads, ${missed} missed`);

  // The maps' ask (`padsWithin`), on a cold index and a few steps of work an
  // ask: never a pad `padsNear` would not give, and once it says it is done,
  // every one it would, however small the steps. And `planesNear`, which
  // works out the plane towns alone, finds every strip on a cold index too.
  {
    const cold = createPadIndex({ world, sites: createSiteIndex(source), rails: railGround });
    const coldSites = createSiteIndex(source);
    let asks = 0;
    let strays = 0;
    let unfinished = 0;
    let short = 0;
    let stripsMissed = 0;
    const centres = standing.filter((_, i) => i % 61 === 0);
    for (const pad of centres) {
      const reach = 3000;
      const all = new Set(twin.padsNear(pad.at, reach, []).map((other) => other.id));
      if (!coldSites.planesNear(pad.strip.at, 1, []).some((strip) => strip.id === pad.strip.id)) stripsMissed++;
      let done = false;
      let got = new Set<string>();
      for (let ask = 0; ask < 50_000 && !done; ask++) {
        asks++;
        let steps = 8;
        const out: typeof standing = [];
        done = cold.padsWithin(pad.at, reach, out, () => steps-- > 0);
        got = new Set(out.map((other) => other.id));
        for (const id of got) if (!all.has(id)) strays++;
      }
      if (!done) unfinished++;
      else if (got.size !== all.size) short++;
    }
    check(strays === 0 && unfinished === 0 && short === 0, 'the maps\' ask gives a subset of padsNear while it works, and all of it once done', `${centres.length} places, ${asks} asks, ${strays} strays, ${unfinished} unfinished, ${short} short`);
    check(stripsMissed === 0, 'planesNear finds each strip from a cold index', `${stripsMissed} of ${centres.length} missed`);
  }

  // The witnesses: the pad's disc, its centre and sixteen points round it at `PAD_KEEP`.
  const disc = (at: Vector3): Vector3[] => {
    const up = at.clone().normalize();
    const north = new Vector3(0, 1, 0).projectOnPlane(up).normalize();
    const east = new Vector3().crossVectors(up, north).normalize();
    const out = [up];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      out.push(up.clone().addScaledVector(east, (Math.cos(a) * PAD_KEEP) / PLANET_RADIUS).addScaledVector(north, (Math.sin(a) * PAD_KEEP) / PLANET_RADIUS).normalize());
    }
    return out;
  };
  const stripFrame = new Vector3();
  /** How far inside a strip's ground a point is, positive inside: its back end to its far end, `STRIP_HALF` either side. */
  const inStrip = (strip: FleetSite, at: Vector3): number => {
    stripFrame.crossVectors(strip.forward, strip.at).normalize();
    const d = at.clone().sub(strip.at);
    const along = d.dot(strip.forward) * PLANET_RADIUS;
    const lateral = d.dot(stripFrame) * PLANET_RADIUS;
    return Math.min(along + STRIP_BACK, STRIP_LENGTH - along, STRIP_HALF - Math.abs(lateral));
  };
  const roadNear = (at: Vector3, clear: number): boolean => {
    for (let r = 0; r < roads.length; r++) {
      const road = roads[r]!;
      if (units(unitAt(places[road.a]!.lat, places[road.a]!.lon, point), at) > 1400 && units(unitAt(places[road.b]!.lat, places[road.b]!.lon, point), at) > 1400) continue;
      if (distanceToPath(pathOf(r), at) < roadClearance(road.cls) + clear) return true;
    }
    return false;
  };
  const faults = { strip: 0, town: 0, road: 0, landmark: 0, rail: 0, water: 0, steep: 0, pads: 0 };
  const bad: string[] = [];
  let steepest = 0;
  let worstFall = 0;
  const across = new Vector3();
  const north = new Vector3();
  let name = '';
  const fault = (kind: keyof typeof faults): void => {
    faults[kind]++;
    if (bad.length < 8) bad.push(`${name} ${kind}`);
  };
  for (const pad of standing) {
    const ring = disc(pad.at);
    name = places[pad.place]!.name;
    // Every strip near it, its own too: none of the pad's ground on any.
    if (planes.some((strip) => units(strip.at, pad.at) < STRIP_LENGTH * 2 && ring.some((p) => inStrip(strip, p) > 0))) fault('strip');
    if (townsAround(pad.at).some((town) => units(town.at, pad.at) < radiusOf(town.place) + PAD_KEEP)) fault('town');
    if (ring.some((p) => roadNear(p, 0))) fault('road');
    if (monumentPlans.some((m) => m.up.x * pad.at.x + m.up.y * pad.at.y + m.up.z * pad.at.z > Math.cos((m.reach + PAD_KEEP + 1) / PLANET_RADIUS) && ring.some((p) => siteGap(m, p, PLANET_RADIUS) < 0))) fault('landmark');
    if (railGround !== null && railGround.fieldsNear(pad.at, PAD_KEEP, []).length > 0) fault('rail');
    if (ring.some((p) => isWater(ground(p)))) fault('water');
    north.set(0, 1, 0).projectOnPlane(pad.at).normalize();
    across.crossVectors(pad.at, north).normalize();
    const grade = gradeAt(pad.at, across, north, PAD_KEEP, slope);
    steepest = Math.max(steepest, grade.grade);
    // The relief under the ring, against the drum's reach less the lift.
    const heights = ring.map((p) => ground(p));
    const fall = Math.max(...heights) - Math.min(...heights);
    worstFall = Math.max(worstFall, fall);
    if (grade.grade > PAD_GRADE * 1.5 || fall > PAD_FALL * 2) fault('steep');
  }
  // No two pads meet: two towns' pads are kept apart by `PAD_RIVAL` alone.
  const sorted = [...standing].sort((a, b) => a.at.x - b.at.x);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && (sorted[j]!.at.x - sorted[i]!.at.x) * PLANET_RADIUS < 2 * PAD_KEEP; j++) {
      if (units(sorted[i]!.at, sorted[j]!.at) < 2 * PAD_KEEP) {
        name = `${places[sorted[i]!.place]!.name}/${places[sorted[j]!.place]!.name}`;
        fault('pads');
      }
    }
  }
  check(faults.strip === 0, 'no pad stands on any airstrip\'s ground, its own or another\'s (and so none on a windsock)', `${faults.strip}; ${bad.join(', ')}`);
  check(faults.town === 0, 'no pad stands in a built town\'s disc', `${faults.town}`);
  check(faults.road === 0, 'no pad stands on a road or its verge, every road walked', `${faults.road}`);
  check(faults.landmark === 0, 'no pad stands on a landmark\'s plan', `${faults.landmark}`);
  check(faults.rail === 0, 'no pad stands on the railway', `${faults.rail}`);
  check(faults.water === 0, 'no pad stands over water, rim to rim', `${faults.water}`);
  check(faults.steep === 0, 'no pad stands on ground its drum cannot reach', `${faults.steep}; the steepest ${((Math.atan(steepest) * 180) / Math.PI).toFixed(1)} degrees, the worst fall across the pad ${worstFall.toFixed(2)} (the search's law ${PAD_FALL.toFixed(2)})`);
  check(faults.pads === 0, 'no two pads meet, worldwide', `${faults.pads} pairs of ${standing.length} pads`);
  check(standing.every((pad) => index.takenAt(pad.at, PAD_KEEP + PAD_MARGIN) === null), 'every pad passes the fleet\'s own town, road and landmark test with its margin');

  // The wood and the countryside keep off a pad as they keep off a strip:
  // the vegetation built headless over the joined fields, tiles raised at a
  // sample of pads, and no vertex of a plant or a piece inside a pad's disc.
  {
    const { createVegetation } = await import('../src/vegetation.ts');
    const taken = joinFields(joinFields(createSiteIndex(source), createPadIndex({ world, sites: index, rails: railGround })), railGround);
    const wood = createVegetation(world, { places, monuments: monuments as never, roads, fields: taken });
    const probes = standing.filter((_, i) => i % Math.max(1, Math.floor(standing.length / 24)) === 0);
    const vertex = new Vector3();
    let tiles = 0;
    let nearby = 0;
    const intruded: string[] = [];
    for (const pad of probes) {
      const seen = new Set<string>();
      for (let level = 0; level < 4; level++) {
        const mesh = wood.raiseTile(latOf(pad.at.y), lonOf(pad.at.x, pad.at.z), level);
        if (mesh === null) continue;
        const key = `${level}:${mesh.position.x.toFixed(1)}:${mesh.position.z.toFixed(1)}`;
        if (seen.has(key)) {
          mesh.geometry.dispose();
          continue;
        }
        seen.add(key);
        tiles++;
        const position = mesh.geometry.getAttribute('position');
        let nearest = Infinity;
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).normalize();
          nearest = Math.min(nearest, units(vertex, pad.at));
        }
        if (nearest < PAD_KEEP + 40) nearby++;
        if (nearest < PAD_KEEP) intruded.push(`${places[pad.place]!.name} level ${level}: ${nearest.toFixed(1)} units from the pad's centre`);
        mesh.geometry.dispose();
      }
    }
    check(intruded.length === 0, `no plant, farm or piece of the country stands on a pad (${probes.length} pads, ${tiles} tiles, ${nearby} with something within 40 units of the disc)`, intruded.slice(0, 4).join('; '));
  }

  // A rocket built headless beside a pad: streamed in, a wall, boarded,
  // stepped out of, lit and launched to the curtain, and an unmanned one gone.
  {
    const { Texture, PerspectiveCamera } = await import('three');
    const pad = standing.find((one) => places[one.place]!.name === 'Barcelona') ?? standing[0]!;
    const streamer = createLaunchPads({ world, pads: padIndex, gradientMap: new Texture() });
    const body = new Object3D();
    const besides = pad.at.clone().applyAxisAngle(new Vector3(0, 1, 0).cross(pad.at).normalize(), (ROCKET_WALL + 2) / PLANET_RADIUS);
    const at = besides.clone().multiplyScalar(ground(besides));
    const frame = { dt: 1 / 30, player: at, listener: at, hold: false, effects: null, sound: null };
    for (let i = 0; i < 10; i++) streamer.update(frame);
    const rocket = streamer.standing().sort((a, b) => a.position.distanceTo(at) - b.position.distanceTo(at))[0];
    const own = rocket !== undefined && units(rocket.position.clone().normalize(), pad.at) < 0.01;
    check(own && streamer.stats.standing <= 4, `a rocket stands on ${places[pad.place]!.name}'s pad once the player is beside it, and no more than four round it`, `${streamer.stats.standing} standing of ${streamer.stats.wanted} wanted`);
    if (rocket !== undefined) {
      const push = new Vector3();
      const into = rocket.position.clone().add(new Vector3().copy(pad.heading).multiplyScalar(ROCKET_WALL * 0.5));
      const walled = streamer.collide(into, 1.3, push);
      const freed = streamer.freeSpotNear(into, 1.3, push) && !streamer.collide(push, 1.3, new Vector3());
      check(walled && freed, 'the pad and its tower are a wall, and a body inside is given the nearest spot clear of it');
      const tall = rocket.position.clone().addScaledVector(pad.at, ROCKET_HEIGHT * 0.5);
      check(streamer.collideAloft(tall, 2, push) && streamer.blocksSight(tall), 'an aircraft and the camera meet it up its height');
      const offered = streamer.offer(at);
      check(offered !== null && offered.rocket === rocket && offered.gap < ROCKET_REACH, 'beside it, `E` is offered the rocket', offered === null ? 'none' : `gap ${offered.gap.toFixed(1)}`);
      streamer.board(rocket, body);
      const out = new Vector3();
      const stepped = streamer.riding === rocket && !body.visible && streamer.leave(out) && body.visible && streamer.riding === null;
      check(stepped && out.distanceTo(rocket.position) > ROCKET_WALL, 'boarded it hides the body, and on its pad `E` steps out clear of its wall', `${out.distanceTo(rocket.position).toFixed(1)} units from its axis`);
      streamer.board(rocket, body);
      const lens = new PerspectiveCamera(45, 16 / 9, 0.5, 40000);
      let seconds = 0;
      for (; seconds < 60 && rocket.curtain < 1; seconds += frame.dt) {
        streamer.update({ ...frame, hold: true });
        streamer.frame(lens, frame.dt);
      }
      const late = streamer.leave(out);
      // The lens watches from the strip's side, which is open ground.
      const lensOver = lens.position.clone().normalize();
      const overStrip = inStrip(pad.strip, lensOver) > -STRIP_HALF;
      check(rocket.curtain >= 1 && rocket.state === 'flying' && !late, 'held, it lights, lifts and climbs to the curtain, and cannot be left once it has', `${seconds.toFixed(1)} s to the curtain, ${rocket.height.toFixed(0)} units up`);
      check(overStrip, 'the lens watches the launch from over its airstrip, which is open ground', `${inStrip(pad.strip, lensOver).toFixed(1)} units inside the strip's ground`);
      rocket.reset();
      // Nobody in it: it goes and is gone, and its pad stands empty until it is back.
      const far = { ...frame, player: rocket.position.clone().applyAxisAngle(new Vector3(0, 1, 0).cross(pad.at).normalize(), 300 / PLANET_RADIUS) };
      const lit = rocket.autolaunch();
      let gone = false;
      for (let t = 0; t < 40 && !gone; t += frame.dt) {
        streamer.update(far);
        gone = rocket.state === 'gone';
      }
      check(lit && gone, 'an unmanned launch goes up and is gone, nobody aboard');
    }
  }
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
  // Sunk: back at its site, with nobody in it.
  await link.claim(id, 0);
  link.drive(id, where, 0);
  link.sink(id);
  check(!link.moved.has(id), 'a vehicle that sank is back at its site');
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
  const { modelsFrom, rigFrom } = await import('../src/kit.ts');
  const { craftFrom } = await import('../src/craft/index.ts');
  const { horseMaterial } = await import('../src/craft/horse.ts');
  const { prepareAvatar } = await import('../src/avatar.ts');
  const { createPlayer, SWIM_SPEED } = await import('../src/player.ts');
  const { ROAD_HANDLING, WATER_HANDLING, HELI_SPEED, HELI_SPOOL } = await import('../src/vehicles.ts');
  const horseRig = await rigFrom(readFileSync(resolve(PUBLIC, 'models/fauna/horse.bin')), 'horse', horseMaterial());
  const craft = craftFrom(await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin'))), horseRig);
  await prepareAvatar();

  // The sites keep room for the models without reading them (`SITE_ROOM`), so
  // the models are held to the room here.
  const size = (id: string): readonly [number, number, number] => craft.get(id)!.size;
  const carLength = Math.max(size('hatchback')[0], size('van')[0]);
  check(SITE_ROOM.car >= carLength / 2, 'a parked car fits its room out of the square', `${SITE_ROOM.car} against half of ${carLength.toFixed(2)}`);
  check(SITE_ROOM.boat >= size('launch')[0] / 2 + 2, 'a launch fits its ring of water with room to spare', `${SITE_ROOM.boat} against half of ${size('launch')[0].toFixed(2)}`);
  check(SITE_ROOM.plane >= Math.max(size('light-plane')[0], size('light-plane')[1]) / 2, 'a plane fits its field', `${SITE_ROOM.plane} against half of ${Math.max(size('light-plane')[0], size('light-plane')[1]).toFixed(2)}`);
  check(SITE_ROOM.balloon >= size('balloon')[1] / 2, 'a balloon fits its field', `${SITE_ROOM.balloon} against half of ${size('balloon')[1].toFixed(2)}`);
  {
    // Every other model against its kind's room: the longer of its length and
    // width for a field or a mooring, and half its length along a road.
    const short: string[] = [];
    for (const model of craft.values()) {
      if (['hatchback', 'van', 'launch', 'light-plane', 'balloon'].includes(model.id)) continue;
      const along = model.kind === 'bicycle' ? model.size[1] / 2 : model.size[0] / 2;
      const need = model.medium === 'water' || model.kind === 'horse' || model.kind === 'tractor' || model.kind === 'helicopter' ? Math.max(model.size[0], model.size[1]) / 2 : along;
      if (SITE_ROOM[model.kind] < need) short.push(`${model.id} ${SITE_ROOM[model.kind]} < ${need.toFixed(2)}`);
    }
    check(short.length === 0, 'every other model fits the room its kind keeps', short.join(', '));
  }
  const events: string[] = [];
  const player = createPlayer(world, 41.39, 2.17, { onEvent: (event) => events.push(event) });
  const heading = new Vector3();
  const step = (seconds: number, input: { x?: number; y?: number; run?: boolean; climb?: boolean; dive?: boolean; jump?: boolean }): void => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      heading.copy(player.forward);
      player.update(1 / 60, {
        move: { x: input.x ?? 0, y: input.y ?? 0 },
        run: input.run ?? false,
        // An edge: the first frame only.
        jump: (input.jump ?? false) && t === 0,
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
  step(2, { y: 1 });
  check(Math.abs(player.velocity - SWIM_SPEED) < 0.3 && Math.abs(player.position.length() - PLANET_RADIUS - surface) < 1e-6, 'swims at SWIM_SPEED, on the surface', `${player.velocity.toFixed(2)} units/s against ${SWIM_SPEED.toFixed(2)}`);
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
  // Out of it under way: over the side, going, and down in a roll.
  board(car);
  step(3, { y: 1 });
  const way = player.speed;
  player.leave();
  const thrown = player.velocity;
  check(player.state === 'foot' && player.airborne && thrown > 3, 'out of a car under way is a jump, with some of its speed', `${thrown.toFixed(1)} units/s off ${way.toFixed(1)}`);
  step(3, {});
  check(!player.airborne && player.state !== 'seated', 'and down again on foot', `${player.velocity.toFixed(1)} units/s`);

  // A car in the water: it floats a moment, goes down nose first, and once
  // it has gone (`FOUNDER_TIME`) the fleet puts the driver out swimming.
  {
    const { FOUNDER_TIME, founderDepth } = await import('../src/vehicles.ts');
    const hatchback = craft.get('hatchback')!;
    const afloat = boat.at.clone().multiplyScalar(PLANET_RADIUS + 0.5);
    player.board({ vehicle: car.id, seat: 0, model: hatchback, group: hatchback.build(0) }, writePose(afloat, boat.forward, boat.at, []));
    events.length = 0;
    step(1 / 60, {});
    const floating = player.position.length() - PLANET_RADIUS;
    step(FOUNDER_TIME * 0.5, { y: 1 });
    const half = player.position.length() - PLANET_RADIUS;
    check(events.includes('foundered') && !player.sunk && half < floating - 0.5, 'a car in the water founders: it splashes and goes down', `${floating.toFixed(2)} to ${half.toFixed(2)} over the waterline`);
    step(FOUNDER_TIME * 0.5 + 0.1, { y: 1 });
    check(player.sunk && player.ride !== null, 'and at FOUNDER_TIME it has sunk', `${(player.position.length() - PLANET_RADIUS).toFixed(2)}, ${founderDepth(FOUNDER_TIME).toFixed(2)} down`);
    player.leave();
    check(player.state === 'swim' && player.ride === null && !player.sunk, 'the driver is put out swimming at the surface', player.state);
    player.goTo(41.39, 2.17);
  }

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
  step(3, { climb: true });
  const climbed = player.altitude;
  step(3, {});
  const held = player.altitude;
  step(2, {});
  check(Math.abs(player.altitude - held) < held * 0.01 && held >= climbed, 'letting go of the climb levels off', `${climbed.toFixed(0)} then ${held.toFixed(0)} then ${player.altitude.toFixed(0)}`);
  step(1, { run: true });
  check(player.altitude < held - 3, 'the run key descends in the air', `${held.toFixed(0)} then ${player.altitude.toFixed(0)}`);
  // Down with the throttle held open all the way, as a hand on `W` does.
  for (seconds = 0; seconds < 120 && !player.grounded; seconds += 1 / 60) step(1 / 60, { run: true, y: 1 });
  check(player.grounded && events.some((event) => event === 'landed'), 'holding the run key lands it', `after ${seconds.toFixed(1)} s; ${events.join(', ')}`);
  // Landed with the throttle still open: it rolls out, it does not take off again.
  events.length = 0;
  step(4, { y: 1 });
  check(player.grounded && !events.includes('took-off'), 'a landing with the throttle held rolls out rather than taking off again', `${player.velocity.toFixed(0)} units/s`);
  step(4, { y: -1 });
  check(player.leave() !== null && player.state !== 'seated', 'and it is left on the ground');

  // The take-off on the throttle alone: held, it runs and lifts off by itself, inside its strip, and climbs out.
  board(plane);
  events.length = 0;
  let throttleRun = -1;
  for (let t = 0; t < 8 && throttleRun < 0; t += 1 / 60) {
    step(1 / 60, { y: 1 });
    if (events.includes('took-off')) throttleRun = units(plane.at, player.position.clone().normalize());
  }
  const lifted = player.altitude;
  step(3, { y: 1 });
  check(throttleRun > 0 && throttleRun < STRIP_LENGTH - 30 && player.altitude > lifted + 15,
    'holding the throttle alone takes off inside its strip and climbs out', `${throttleRun.toFixed(0)} units of ${STRIP_LENGTH}, ${(player.altitude - lifted).toFixed(0)} up in 3 s`);
  for (seconds = 0; seconds < 120 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
  check(player.grounded, 'and the descend key lands it too', `after ${seconds} s`);
  check(player.leave() !== null, 'and it is left there');

  // Out of a plane in flight: a fall, a canopy near the ground, and down.
  board(plane);
  step(24, { climb: true });
  const bailedAt = player.altitude - (ground(player.position.clone().normalize()) - PLANET_RADIUS);
  check(player.leave() !== null && player.state === 'foot' && player.parachute && player.airborne && player.ride === null && bailedAt > 150,
    'out of a plane in flight is a jump, with a parachute', `${bailedAt.toFixed(0)} units over the ground`);
  check(!player.canopy, 'the fall starts with the canopy packed');
  step(0.5, { jump: true });
  const opened = player.canopy;
  step(0.5, { jump: true });
  check(opened && !player.canopy && player.parachute, 'the jump key opens the canopy, and stows it again high up');
  let underCanopy = 0;
  let forced = false;
  let stowedLow = false;
  for (seconds = 0; seconds < 120 && player.parachute; seconds += 1 / 60) {
    const over = player.position.length() - ground(player.position.clone().normalize());
    if (!forced && player.canopy && over < 120) {
      // Opened by itself near the ground, and the jump key cannot take it away.
      forced = true;
      step(1 / 60, { jump: true });
      stowedLow = !player.canopy;
    }
    step(1 / 60, { y: 1 });
    const left = player.position.length() - ground(player.position.clone().normalize());
    if (player.parachute && left < 40) underCanopy = Math.max(underCanopy, -player.climb);
  }
  check(forced && !stowedLow, 'near the ground the canopy opens by itself, and stays open', `${forced} ${stowedLow}`);
  check(!player.parachute && !player.airborne && (player.state === 'foot' || player.state === 'swim') && underCanopy < 10,
    'and comes down under its canopy, slowly, on the ground or in the water', `after ${seconds.toFixed(1)} s, ${player.state}, sinking ${underCanopy.toFixed(1)} units/s at the end`);

  // The balloon: up, not out, down, out.
  const balloon = byKind.get('balloon')![0]!;
  board(balloon);
  events.length = 0;
  step(4, { climb: true });
  check(player.airborne && player.altitude - (ground(balloon.at) - PLANET_RADIUS) > 10, 'a balloon rises on the climb key', `${(player.altitude - (ground(balloon.at) - PLANET_RADIUS)).toFixed(1)} over the ground`);
  for (seconds = 0; seconds < 60 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
  check(player.grounded, 'sinks until it sets down', `after ${seconds} s`);
  check(player.leave() !== null && player.state !== 'seated', 'and is left where it landed');

  // The rest: each taken where the fleet stands it, driven on `W` a few
  // seconds, and left. The speeds are on the relief with no made ground, so a
  // kind that keeps less of its pace off a road keeps all of it here.
  const faster = (id: string, want: number, run = false, settle = 1.3): void => {
    const site = sites.find((entry) => entry.model === id && !isWater(ground(entry.at)));
    if (site === undefined) {
      check(false, `a ${id} stands somewhere`);
      return;
    }
    board(site);
    const start = player.position.clone();
    // Long enough for the throttle's ease to all but close: three of its time constants.
    const seconds = Math.max(4, 3 * settle);
    step(seconds, { y: 1, run });
    const went = units(start.clone().normalize(), player.position.clone().normalize());
    const off = Math.abs(player.position.length() - ground(player.position.clone().normalize()));
    check(player.state === 'seated' && (Math.abs(player.velocity - want) < want * 0.12 || went < 20), `a ${id} is driven at its own pace`, `${player.velocity.toFixed(1)} units/s against ${want}, ${went.toFixed(0)} units in ${seconds.toFixed(1)} s, ${off.toFixed(2)} off the ground`);
    step(4, { y: -1 });
    check(player.leave() !== null && player.state !== 'seated', `and the ${id} is left`, player.mode);
  };
  faster('bicycle', ROAD_HANDLING.bicycle!.speed);
  check(player.mode === 'foot', 'off the bicycle, on foot again', player.mode);
  faster('bicycle', ROAD_HANDLING.bicycle!.boost, true);
  faster('motorbike', ROAD_HANDLING.motorbike!.speed);
  faster('scooter', ROAD_HANDLING.motorbike!.speed);
  faster('tuk-tuk', ROAD_HANDLING.tuktuk!.speed);
  faster('bus', ROAD_HANDLING.bus!.speed, false, ROAD_HANDLING.bus!.accelerationTime);
  faster('jeep', ROAD_HANDLING.jeep!.speed);
  faster('tractor', ROAD_HANDLING.tractor!.speed);
  faster('horse', ROAD_HANDLING.horse!.speed);
  faster('horse', ROAD_HANDLING.horse!.boost, true);
  {
    // A horse turns on the spot, which nothing on wheels does.
    const horse = sites.find((entry) => entry.model === 'horse')!;
    board(horse);
    const facing = player.forward.clone();
    step(1, { x: 1 });
    check(facing.angleTo(player.forward) > 0.3, 'a horse turns standing still', `${facing.angleTo(player.forward).toFixed(2)} rad in a second`);
    player.leave();
  }
  for (const id of ['jet-ski', 'sailboat']) {
    const hull = sites.find((entry) => entry.model === id)!;
    board(hull);
    step(3, { y: 1 });
    const want = WATER_HANDLING[craft.get(id)!.kind]!;
    check(player.mode === (id === 'jet-ski' ? 'jetski' : 'sailboat') && Math.abs(player.position.length() - PLANET_RADIUS - 0.5) < 1e-6 && player.velocity > 0,
      `a ${id} sails on the waterline`, `${player.velocity.toFixed(1)} units/s of ${want.speed}`);
    const off = player.leave();
    check(off !== null && player.state !== 'seated', `and the ${id} is left for the shore or the water`, player.state);
  }
  {
    // The helicopter: straight up once the rotor has wound up, a hover, a
    // run forward, not out in the air, and down again.
    // One far inland, so the flight comes down on land.
    const pad =
      sites.find((site) => site.kind === 'helicopter' && shoreDistance(latOf(site.at.y), lonOf(site.at.x, site.at.z)) > 4) ?? byKind.get('helicopter')![0]!;
    board(pad);
    check(player.mode === 'helicopter' && player.grounded, 'a helicopter is taken on its pad', `${pad.id}, ${places[pad.place]!.name}`);
    events.length = 0;
    const floor = player.altitude;
    step(HELI_SPOOL * 0.5, { climb: true });
    check(player.grounded, 'it does not lift before its rotor has wound up');
    step(HELI_SPOOL + 2, { climb: true });
    const lifted = player.altitude - floor;
    check(events.includes('took-off') && player.airborne && lifted > 10, 'holding the climb key lifts it straight up', `${lifted.toFixed(1)} units up`);
    check(units(pad.at, player.position.clone().normalize()) < 3, 'and straight up means where it stood', `${units(pad.at, player.position.clone().normalize()).toFixed(2)} units off its pad`);
    step(2, {});
    const hovering = player.altitude;
    step(2, {});
    check(Math.abs(player.altitude - hovering) < 1 && player.velocity < 1, 'let go, it hovers', `${(player.altitude - hovering).toFixed(2)} units and ${player.velocity.toFixed(2)} units/s`);
    step(4, { y: 1 });
    check(Math.abs(player.velocity - HELI_SPEED) < HELI_SPEED * 0.1, 'W flies it forward at its cruise', `${player.velocity.toFixed(1)} units/s`);
    step(3, { y: -1 });
    let seconds = 0;
    for (; seconds < 60 && !player.grounded; seconds += 0.5) step(0.5, { dive: true });
    const wet = isWater(ground(player.position.clone().normalize()));
    check(player.grounded || wet, 'holding descend sets it down', `after ${seconds} s${wet ? ', over water' : ''}; ${events.join(', ')}`);
    if (player.grounded) check(player.leave() !== null && player.state !== 'seated', 'and it is left on the ground');
    else player.goTo(latOf(pad.at.y), lonOf(pad.at.x, pad.at.z));
  }

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

  // A craft in the air against a building: a wall square across its way, and
  // behind it everything under a roof `roof` over the ground. Near the ground
  // `collide` answers for it, higher `collideAloft`, which a roof passes under.
  {
    type Push = (point: Vector3, radius: number, push: Vector3) => boolean;
    const wallOf = (site: FleetSite, ahead: number, roof: number): { collide: Push; collideAloft: Push; gap: (point: Vector3) => number } => {
      const wallAt = site.at.clone().addScaledVector(site.forward, ahead / PLANET_RADIUS).normalize();
      const normal = site.forward.clone().negate();
      const gap = (point: Vector3): number => point.clone().normalize().sub(wallAt).dot(normal) * PLANET_RADIUS;
      const collide: Push = (point, radius, push) => {
        const g = gap(point);
        if (g >= radius) return false;
        push.copy(normal).multiplyScalar(radius - g);
        return true;
      };
      return {
        collide,
        collideAloft: (point, radius, push) => {
          if (point.length() >= roof) {
            push.set(0, 0, 0);
            return false;
          }
          return collide(point, radius, push);
        },
        gap,
      };
    };
    const fly = (who: ReturnType<typeof createPlayer>, seconds: number, input: { y?: number; climb?: boolean; dive?: boolean }, each?: () => void): void => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        heading.copy(who.forward);
        who.update(1 / 60, { move: { x: 0, y: input.y ?? 0 }, run: false, jump: false, heading, climb: input.climb ?? false, dive: input.dive ?? false });
        each?.();
      }
    };
    const balloonModel = craft.get(balloon.model)!;
    const basket = balloonModel.size[1] / 9;
    const floor = ground(balloon.at);

    // Low, into the wall: it stops at it and never enters it.
    {
      const roof = floor + 60;
      const wall = wallOf(balloon, 30, roof);
      const drifting = createPlayer(world, 41.39, 2.17, { collide: wall.collide, collideAloft: wall.collideAloft });
      drifting.board({ vehicle: balloon.id, seat: 0, model: balloonModel, group: balloonModel.build(0) }, writePose(balloon.at.clone().multiplyScalar(floor), balloon.forward, balloon.at, []));
      fly(drifting, 2.5, { climb: true });
      let nearest = Infinity;
      fly(drifting, 12, { y: 1 }, () => { nearest = Math.min(nearest, wall.gap(drifting.position)); });
      check(drifting.airborne && nearest >= basket - 0.05, 'a balloon drifted into a wall stops at it and never enters it',
        `${nearest.toFixed(2)} units off it at the nearest, a basket ${basket.toFixed(2)} across the half; ${(drifting.position.length() - floor).toFixed(1)} up`);
    }

    // High, over the roof, then down onto it: it passes over, and the roof
    // holds it up rather than letting it be set down inside the building.
    {
      const roof = floor + 18;
      const wall = wallOf(balloon, 30, roof);
      const events: string[] = [];
      const over = createPlayer(world, 41.39, 2.17, { collide: wall.collide, collideAloft: wall.collideAloft, onEvent: (event) => events.push(event) });
      over.board({ vehicle: balloon.id, seat: 0, model: balloonModel, group: balloonModel.build(0) }, writePose(balloon.at.clone().multiplyScalar(floor), balloon.forward, balloon.at, []));
      for (let t = 0; t < 30 && over.position.length() < roof + 25; t += 0.5) fly(over, 0.5, { climb: true });
      fly(over, 1.5, {});
      let seconds = 0;
      for (; seconds < 20 && wall.gap(over.position) > -40; seconds += 0.5) fly(over, 0.5, { y: 1 });
      const across = wall.gap(over.position);
      let lowest = Infinity;
      fly(over, 25, { dive: true }, () => { lowest = Math.min(lowest, over.position.length()); });
      check(across < -basket && lowest >= roof - 0.05 && !over.grounded && !events.includes('landed'),
        'a balloon passes over a roof it clears, and sinking onto it is held up by it, never set down inside',
        `${(-across).toFixed(1)} units past the wall, lowest ${(lowest - roof).toFixed(2)} over the roof, ${over.grounded ? 'landed' : 'aloft'}`);
    }

    // A plane flown low into a tower knocks off it, says so, and is not through it.
    {
      const planeModel = craft.get(plane.model)!;
      const floorAt = ground(plane.at);
      const wall = wallOf(plane, 1400, floorAt + 5000);
      const hits: { event: string; strength: number }[] = [];
      const pilot = createPlayer(world, 41.39, 2.17, {
        collide: wall.collide, collideAloft: wall.collideAloft,
        onEvent: (event, strength) => hits.push({ event, strength }),
      });
      pilot.board({ vehicle: plane.id, seat: 0, model: planeModel, group: planeModel.build(0) }, writePose(plane.at.clone().multiplyScalar(floorAt), plane.forward, plane.at, []));
      fly(pilot, 8, { climb: true });
      let nearest = Infinity;
      fly(pilot, 25, {}, () => { nearest = Math.min(nearest, wall.gap(pilot.position)); });
      const crash = hits.find((hit) => hit.event === 'crashed');
      check(crash !== undefined && crash.strength > 0 && nearest > 0 && pilot.airborne,
        'a plane flown into a tower knocks off it, still flying, and never through it',
        crash === undefined ? `${hits.map((hit) => hit.event).join(', ')}; ${nearest.toFixed(1)} off it` : `${crash.strength.toFixed(0)} units/s lost, ${nearest.toFixed(2)} off it at the nearest`);
    }
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

  // What stands still until it is taken — a farm's tractor, a town's car, a
  // rack's bicycle — taken with the use key: the fleet's vehicle where it
  // stood and on its ground, in the look and the paint its id decides, which
  // is what the town or the tile merged (`craft/parked.ts`), and folded out
  // of what drew it. A car parked in a colour of its own came out of its bay
  // in its variant's until 2026-09-28.
  {
    const { createFleet } = await import('../src/fleet.ts');
    const { countryVehicleId, fleetVariant, parkedArrays, parkedModel } = await import('../src/craft/parked.ts');
    const { mergeMeshes } = await import('../src/merge.ts');
    const { PALETTE } = await import('../src/theme.ts');
    const side = new Vector3().crossVectors(car.at, car.forward).normalize();
    const at = car.at.clone().addScaledVector(side, 25 / PLANET_RADIUS).normalize();
    const cases = [
      { id: countryVehicleId('tractor', 131, 290, 0)!, model: 'tractor', paint: null },
      { id: `hatchback:${car.place}:12`, model: 'hatchback', paint: PALETTE.crimson },
      { id: `bicycle:${car.place}:17`, model: 'bicycle', paint: null },
    ];
    const wrong: string[] = [];
    for (const still of cases) {
      const walker = createPlayer(world, latOf(at.y), lonOf(at.x, at.z));
      const hidden: string[] = [];
      const bay = { id: still.id, model: still.model, position: at.clone().multiplyScalar(ground(at)), forward: car.forward.clone(), paint: still.paint };
      const fleet = createFleet({
        ...source,
        models: craft,
        link: createLocalLink(`still-${still.model}`),
        player: walker,
        parked: {
          near: (_viewer, _radius, out) => {
            if (!hidden.includes(bay.id)) out.push(bay);
          },
          hide: (id) => hidden.push(id),
          paintOf: (id) => (id === bay.id ? still.paint : null),
        },
      });
      for (let i = 0; i < 5; i++) fleet.update(0.1);
      fleet.use();
      // The one of its model nearest the spot: the fleet stands its own sites round the town too.
      const taken = fleet.group.children
        .filter((child) => child.name === `vehicle:${still.model}`)
        .sort((a, b) => a.position.distanceTo(bay.position) - b.position.distanceTo(bay.position))[0];
      const model = parkedModel(still.model)!;
      // Glazed, its glass apart, as a town stands it: the craft whole, its
      // cabin and glass included (a farm's tile paints the same glass opaque
      // and leaves the cabin out, which is `pnpm craft`'s to hold).
      const stood = parkedArrays(model, fleetVariant(still.id, model.variants), still.paint ?? undefined, 1, true);
      const expected = new Float32Array([...stood.color, ...(stood.glass?.color ?? [])]);
      const colours = taken === undefined ? null : mergeMeshes(taken).color;
      // As a multiset of the vertices' colours: the motion hangs the body
      // and the wheels on springs of its own (`craft/motion.ts`), which
      // changes the order a merge walks them in and nothing else.
      const sorted = (array: Float32Array): string[] => {
        const out: string[] = [];
        for (let i = 0; i < array.length; i += 3) out.push(`${array[i]},${array[i + 1]},${array[i + 2]}`);
        return out.sort();
      };
      const same = colours !== null && sorted(colours).join('|') === sorted(expected).join('|');
      const off = taken === undefined ? Infinity : taken.position.distanceTo(bay.position);
      const lift = taken === undefined ? Infinity : taken.position.length() - ground(at);
      if (!same || !hidden.includes(still.id) || off > 0.5 || Math.abs(lift) > 0.5) {
        wrong.push(`${still.id}: ${taken === undefined ? 'not taken' : `${same ? 'same' : 'other'} colours, ${off.toFixed(2)} off its spot, ${lift.toFixed(2)} over the ground`}${hidden.includes(still.id) ? '' : ', not folded away'}`);
      }
    }
    check(wrong.length === 0, "a tractor, a town's car and a rack's bicycle taken are the ones that stood there, where they stood", wrong.join('; ') || cases.map((c) => c.id).join(', '));
  }

  // A car jumped out of goes on without anybody, slows, and is parked where it stops.
  {
    const { createFleet } = await import('../src/fleet.ts');
    const driver = createPlayer(world, latOf(car.at.y), lonOf(car.at.x, car.at.z));
    const coastLink = createLocalLink('coast');
    const fleet = createFleet({ ...source, models: craft, link: coastLink, player: driver });
    const tick = (seconds: number, y: number): void => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        driver.update(1 / 60, { move: { x: 0, y }, run: false, jump: false, heading: driver.forward.clone() });
        fleet.update(1 / 60);
      }
    };
    const took = await fleet.board(car.id);
    tick(3, 1);
    const going = driver.speed;
    const from = driver.position.clone();
    fleet.use();
    const out = fleet.current() === null && driver.state !== 'seated';
    const pose: number[] = [];
    let seconds = 0;
    for (; seconds < 30 && (coastLink.moved.get(car.id)?.seats[0] ?? null) !== null; seconds += 0.5) tick(0.5, 0);
    fleet.poseOf(car.id, pose);
    const ran = units(from.clone().normalize(), new Vector3(pose[0], pose[1], pose[2]).normalize());
    check(took && out && going > 10 && ran > 5 && (coastLink.moved.get(car.id)?.seats[0] ?? null) === null,
      'a car jumped out of runs on alone, slows, and is parked where it stops', `${ran.toFixed(0)} units on from ${going.toFixed(0)} units/s, parked after ${seconds} s`);
  }

  // And one jumped out of is the jumper's to take again while it still rolls,
  // going as it was.
  {
    const { createFleet } = await import('../src/fleet.ts');
    const driver = createPlayer(world, latOf(car.at.y), lonOf(car.at.x, car.at.z));
    const rollLink = createLocalLink('roll');
    const fleet = createFleet({ ...source, models: craft, link: rollLink, player: driver });
    const tick = (seconds: number, y: number): void => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        driver.update(1 / 60, { move: { x: 0, y }, run: false, jump: false, heading: driver.forward.clone() });
        fleet.update(1 / 60);
      }
    };
    await fleet.board(car.id);
    tick(3, 1);
    fleet.use();
    tick(0.05, 0);
    const offered = fleet.prompt?.vehicle === car.id && fleet.prompt.seat === 0;
    // `E` is acted on once in `USE_INTERVAL_MS`, by the clock.
    await new Promise((resolve) => setTimeout(resolve, 320));
    fleet.use();
    await Promise.resolve();
    const back = fleet.current()?.vehicle === car.id && driver.state === 'seated';
    const going = driver.speed;
    check(offered && back && going > 5, 'a car jumped out of can be taken again while it still rolls, going as it was',
      `offered ${offered}, back ${back}, ${going.toFixed(1)} units/s`);
  }

  // Every vehicle stands, drawn and solid, well before anybody reaches it, and
  // nothing comes into being in front of anybody. The real fleet, a player
  // run straight at a site from well outside its reach at a run and at a
  // motorbike's boost, with a lens behind him looking the way he goes, round
  // the most crowded regions the sites have: the streamer caps what stands,
  // and until 2026-09-29 the cap was a wall, so a car at a gate in Utrecht
  // stood 11 units off a motorbike's nose, or never stood at all. Stepped at
  // 30 Hz, which the fleet's scans and builds do not notice.
  {
    const { createFleet } = await import('../src/fleet.ts');
    const { PerspectiveCamera } = await import('three');
    /** How near a vehicle may still be unbuilt: 1.5 s at a motorbike's boost, 3.3 s at a car's. */
    const STANDS_BY = 120;
    /** How near anything may come into being once the player is under way: a body's reach, many times over. */
    const ARRIVES_BEYOND = 60;
    const index = createSiteIndex(source);
    const crowded: [string, number, number][] = [['Utrecht', 52.09, 5.12], ['the Ruhr', 51.45, 7.0], ['Zhengzhou', 34.75, 113.62], ['Kolkata', 22.57, 88.36], ['Milan', 45.46, 9.19], ['Iowa', 41.6, -93.6]];
    const DT = 1 / 30;
    const late: string[] = [];
    const sudden: string[] = [];
    let runs = 0;
    let nearestStand = Infinity;
    let nearestArrival = Infinity;
    for (const [name, lat, lon] of crowded) {
      const centre = unitAt(lat, lon, new Vector3());
      const around = index.near(centre, 600, []).filter((site) => units(site.at, centre) < 600).sort((a, b) => (a.id < b.id ? -1 : 1));
      const targets = around.filter((_, i) => i % Math.max(1, Math.floor(around.length / 4)) === 0).slice(0, 4);
      for (const speed of [20, 82]) {
        for (const [k, target] of targets.entries()) {
          runs++;
          const up = target.at.clone();
          const east = new Vector3(0, 1, 0).cross(up).normalize();
          const north = up.clone().cross(east).normalize();
          const bearing = (k * 2.4 + speed) % (Math.PI * 2);
          const axis = up.clone().cross(east.multiplyScalar(Math.cos(bearing)).addScaledVector(north, Math.sin(bearing))).normalize();
          const walker = { position: new Vector3(), state: 'walking', ride: null, airborne: false, velocity: new Vector3(), speed: 0 };
          const fleet = createFleet({ ...source, sites: index, models: craft, link: createLocalLink(`approach-${runs}`), player: walker as never });
          const lens = new PerspectiveCamera(45, 16 / 9, 0.5, 20000);
          const pose: number[] = [];
          const push = new Vector3();
          const ahead = new Vector3();
          let standing = -1;
          let before = new Set<Object3D>();
          let frame = 0;
          for (let angle = 1200 / PLANET_RADIUS; angle > -20 / PLANET_RADIUS; angle -= (speed * DT) / PLANET_RADIUS) {
            const at = up.clone().applyAxisAngle(axis, angle);
            walker.position.copy(at).multiplyScalar(ground(at));
            ahead.copy(up).applyAxisAngle(axis, angle - 30 / PLANET_RADIUS);
            lens.position.copy(walker.position).addScaledVector(at, 5).addScaledVector(ahead.clone().sub(at).normalize(), -12);
            lens.up.copy(at);
            lens.lookAt(ahead.multiplyScalar(ground(ahead)));
            fleet.update(DT, lens);
            // What came into being this frame, once the first second of arriving is over.
            const now = new Set(fleet.group.children.filter((child) => child.name.startsWith('vehicle:')));
            if (frame++ > 30) {
              for (const child of now) {
                if (before.has(child)) continue;
                const gap = child.position.distanceTo(walker.position);
                nearestArrival = Math.min(nearestArrival, gap);
                if (gap < ARRIVES_BEYOND) sudden.push(`${child.name} ${gap.toFixed(0)} units off at ${speed} near ${name}`);
              }
            }
            before = now;
            if (standing < 0 && fleet.poseOf(target.id, pose)) {
              const spot = new Vector3(pose[0], pose[1], pose[2]);
              if (fleet.collide(spot, 0.05, push)) standing = spot.distanceTo(walker.position);
            }
          }
          if (standing >= 0) nearestStand = Math.min(nearestStand, standing);
          if (standing < STANDS_BY) late.push(`${target.id} near ${name} at ${speed}: ${standing < 0 ? 'never stood' : `stood ${standing.toFixed(0)} units off`}`);
        }
      }
    }
    check(late.length === 0, `every vehicle run at stands, drawn and solid, before it is ${STANDS_BY} units off`, late.join('; ') || `${runs} runs round ${crowded.length} regions, the nearest ${nearestStand.toFixed(0)} units off`);
    check(sudden.length === 0, `nothing comes into being within ${ARRIVES_BEYOND} units of a player under way`, sudden.slice(0, 5).join('; ') || `the nearest ${nearestArrival.toFixed(0)} units off`);
  }

  // A body put down on a vehicle — a jump, a spawn, a car arriving round
  // somebody standing still — is given the nearest spot clear of it.
  {
    const { createFleet } = await import('../src/fleet.ts');
    const walker = createPlayer(world, latOf(car.at.y), lonOf(car.at.x, car.at.z));
    const fleet = createFleet({ ...source, models: craft, link: createLocalLink('free'), player: walker });
    for (let i = 0; i < 5; i++) fleet.update(0.1);
    const standing = fleet.group.children.find((child) => child.name.startsWith('vehicle:'));
    const spot = new Vector3();
    const push = new Vector3();
    const freed = standing !== undefined && fleet.freeSpotNear(standing.position.clone(), 1.3, spot);
    const clear = freed && !fleet.collide(spot, 1.3, push);
    const gap = freed ? spot.distanceTo(standing!.position) : 0;
    const already = standing !== undefined && !fleet.freeSpotNear(standing.position.clone().applyAxisAngle(new Vector3(0, 1, 0), 40 / PLANET_RADIUS), 1.3, spot);
    check(freed && clear && already && gap < 12, 'a body inside a vehicle is given the nearest clear spot, and one clear of it is left where it is', `${standing?.name} ${gap.toFixed(2)} units out${clear ? '' : ', and still inside'}${already ? '' : ', and one clear of it moved'}`);
  }

  // A teleport out of a seat is a teleport: on foot, the vehicle let go.
  board(car);
  player.goTo(41.39, 2.17);
  check(player.ride === null && player.state !== 'seated', 'a teleport leaves the vehicle behind');
}

console.log(failures === 0 ? '\nall fleet checks passed' : `\n${failures} fleet check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
