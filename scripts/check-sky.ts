/**
 * The sky's traffic, headless: the airliners, the circuits at the airstrips,
 * the helicopters, the balloons and the airships, as the timetable that
 * `air-traffic.ts` reads them off.
 *
 * Every flight is a pure function of the clock and the baked world, so this
 * builds the timetable twice and asks for the same answer, then flies each
 * kind and asks what its medium asks: an airliner between two hubs at a sane
 * height and speed, a circuit that touches down on its own strip and nowhere
 * else, clears the parked plane and the land, a helicopter over its city's
 * roofs, a balloon that lands on land and out of every town, and nothing, at
 * any instant, under the ground or moving in jumps.
 *
 *   node scripts/check-sky.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundRadius } from '../src/globe.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { indexPlaces, isShown, radiusOf, terrainSiteOf } from '../src/places.ts';
import type { Road } from '../src/roads.ts';
import { decodePlaces, decodeRoads, inflate } from '../src/pack.ts';
import { unitAt } from '../src/sphere.ts';
import { STRIP_BACK, STRIP_LENGTH, createSiteIndex, keepsBalloon, stripPoint } from '../src/fleet.ts';
import type { FleetSite } from '../src/fleet.ts';
import {
  CRUISE,
  DEPART,
  FLYER_KINDS,
  HOP_MAX,
  HOP_MIN,
  REACH,
  createAirSchedule,
  flyerPose,
} from '../src/air-traffic.ts';
import type { AirSource, Flight, FlyerKind } from '../src/air-traffic.ts';
import { buildAirliner, buildAirship } from '../src/craft/airliner.ts';

const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// --- the world, as check-fleet.ts loads it -------------------------------------

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

const probe = new Vector3();
const ground = (direction: Vector3): number => groundRadius(world, probe.copy(direction).multiplyScalar(PLANET_RADIUS));
const fields = createSiteIndex({ world, places, roads, monuments });
const source: AirSource = { places, ground, strips: fields, keepsBalloon };
const schedule = createAirSchedule(source);
const twin = createAirSchedule({ places, ground, strips: createSiteIndex({ world, places, roads, monuments }), keepsBalloon });

const T0 = Date.UTC(2026, 8, 25, 14, 0, 0) / 1000;
const pose = flyerPose();
const other = flyerPose();
const units = (a: Vector3, b: Vector3): number => a.clone().normalize().angleTo(b.clone().normalize()) * PLANET_RADIUS;

// --- the models ---------------------------------------------------------------------

console.log('models:');
{
  const basis = new Matrix4();
  for (const [name, build, variants] of [
    ['airliner', buildAirliner, 6],
    ['airship', buildAirship, 3],
  ] as const) {
    let proper = true;
    let triangles = 0;
    let meshes = 0;
    for (let v = 0; v < variants; v++) {
      const group = build(v);
      group.updateMatrixWorld(true);
      group.traverse((part) => {
        if (part.matrixWorld.determinant() <= 0) proper = false;
        const geometry = (part as { geometry?: { getAttribute(n: string): { count: number } | undefined } }).geometry;
        if (geometry !== undefined) {
          meshes++;
          triangles += (geometry.getAttribute('position')?.count ?? 0) / 3;
          if (geometry.getAttribute('outlineNormal') === undefined) proper = false;
        }
      });
      basis.identity();
    }
    check(proper, `${name}: every matrix proper and every mesh inked along outlineNormal`, `${Math.round(triangles / variants)} triangles, ${meshes / variants} meshes a copy`);
  }
}

// --- the airliners ---------------------------------------------------------------------

console.log('\nairliners:');
const hubs = schedule.hubs;
check(hubs.length >= 100, 'enough hubs to fill the sky', `${hubs.length}`);
check(hubs.every((h) => isShown(places[h]!)), 'every hub is a built town');
{
  let hops = 0;
  let badHop = 0;
  let none = 0;
  for (const h of hubs) {
    for (let n = 0; n < 12; n++) {
      const d = schedule.destinationOf(h, n);
      if (d < 0) {
        none++;
        continue;
      }
      hops++;
      const km = units(unitAt(places[h]!.lat, places[h]!.lon, new Vector3()), unitAt(places[d]!.lat, places[d]!.lon, new Vector3()));
      if (km < HOP_MIN - 1 || km > HOP_MAX + 1 || d === h || !hubs.includes(d)) badHop++;
    }
  }
  check(badHop === 0, `every hop is between two hubs ${HOP_MIN} to ${HOP_MAX} units apart`, `${hops} hops, ${none} departures with nowhere to go`);

  // Fly every flight up at one instant from every hub.
  const flights: Flight[] = [];
  for (const h of hubs) schedule.airlinersFrom(h, T0, flights);
  let low = 0;
  let high = 0;
  let jumps = 0;
  let speed = 0;
  let square = 0;
  for (const flight of flights) {
    for (let t = flight.from; t < flight.to; t += (flight.to - flight.from) / 60) {
      flight.pose(t, pose);
      const altitude = pose.position.length() - PLANET_RADIUS;
      if (altitude < DEPART - 1) low++;
      if (altitude > CRUISE + 1) high++;
      if (Math.abs(pose.forward.length() - 1) > 1e-6 || Math.abs(pose.up.dot(pose.forward)) > 1e-6) square++;
      flight.pose(t + 0.1, other);
      const step = pose.position.distanceTo(other.position);
      if (step > 0.1 * 80) jumps++;
      speed = Math.max(speed, pose.speed);
    }
  }
  check(flights.length > hubs.length / 2, 'flights in the air at any instant', `${flights.length}`);
  check(low === 0 && high === 0, `every airliner between ${DEPART} and ${CRUISE} units up the whole way`, `${low} low, ${high} high`);
  check(jumps === 0, 'no airliner moves in a jump', `top speed ${speed.toFixed(1)} units/s`);
  check(square === 0, 'every pose has a unit forward and an up square to it');
}

// --- determinism --------------------------------------------------------------------------

console.log('\ndeterminism:');
{
  const spots: [string, number, number][] = [
    ['London', 51.5, -0.12],
    ['Tokyo', 35.68, 139.7],
    ['Sao Paulo', -23.55, -46.63],
    ['Cairo', 30.04, 31.24],
    ['New York', 40.71, -74.0],
    ['Mumbai', 19.07, 72.87],
  ];
  let same = true;
  let seen = 0;
  const kinds: Record<FlyerKind, number> = { airliner: 0, plane: 0, helicopter: 0, balloon: 0, airship: 0 };
  for (const [, lat, lon] of spots) {
    const at = unitAt(lat, lon, new Vector3());
    for (const t of [T0, T0 + 3600 * 5.5, T0 - 777]) {
      const a = schedule.flightsNear(at, t, []);
      // Asked out of order, and of another timetable built from nothing.
      twin.flightsNear(at, t + 9000, []);
      const b = twin.flightsNear(at, t, []);
      const ids = (list: Flight[]): string => list.map((f) => f.id).sort().join(',');
      if (ids(a) !== ids(b)) same = false;
      for (const flight of a) {
        const match = b.find((f) => f.id === flight.id)!;
        flight.pose(t, pose);
        match.pose(t, other);
        if (!pose.position.equals(other.position) || !pose.forward.equals(other.forward)) same = false;
        seen++;
        kinds[flight.kind]++;
      }
    }
  }
  check(same, 'two timetables agree on every flight near six cities at three times, bit for bit', `${seen} flights`);
  check(FLYER_KINDS.every((kind) => kinds[kind] > 0), 'every kind flies somewhere near them', FLYER_KINDS.map((k) => `${k} ${kinds[k]}`).join(', '));
}

// --- circuits ------------------------------------------------------------------------------

console.log('\ncircuits:');
{
  // The strips of a spread of the big cities.
  const strips: FleetSite[] = [];
  const cities = places.map((p, i) => ({ p, i })).filter(({ p }) => isShown(p) && (p.pop >= 400_000 || p.capital === true));
  for (let k = 0; k < cities.length; k += Math.max(1, Math.floor(cities.length / 70))) {
    const { p } = cities[k]!;
    for (const site of fields.planesNear(unitAt(p.lat, p.lon, new Vector3()), 1, [])) if (!strips.some((s) => s.id === site.id)) strips.push(site);
  }
  let flown = 0;
  let wrongGround = 0;
  let under = 0;
  let parked = 0;
  let jumps = 0;
  let lowest = Infinity;
  let steepest = 0;
  const stand = new Vector3();
  for (const site of strips) {
    const circuit = schedule.circuitOf(site);
    if (circuit === null) continue;
    flown++;
    const period = 200;
    for (let t = T0; t < T0 + period; t += 0.25) {
      circuit.pose(t, pose);
      const dir = pose.position.clone().normalize();
      const over = pose.position.length() - ground(dir);
      lowest = Math.min(lowest, over);
      if (over < -0.05) under++;
      // On the ground only on its own strip, between touchdown and lift-off.
      const along = units(site.at, dir) * Math.sign(dir.clone().sub(site.at).dot(site.forward));
      const offLine = units(stripPoint(site, along, 0, stand), dir);
      if (pose.grounded && (along < 0 || along > STRIP_LENGTH || offLine > 2)) wrongGround++;
      // Over the parked plane and the strip's back end, it is well up.
      if (!pose.grounded && offLine < 20 && along > -STRIP_BACK - 20 && along < 10 && over < 10) parked++;
      circuit.pose(t + 0.1, other);
      const step = pose.position.distanceTo(other.position);
      steepest = Math.max(steepest, Math.abs(other.position.length() - pose.position.length()) / 0.1);
      if (step > 0.1 * 120) jumps++;
    }
  }
  check(flown > 10, 'a share of the strips fly a circuit', `${flown} of ${strips.length}`);
  check(wrongGround === 0, 'a circuit is on its wheels only on its own strip', `${wrongGround}`);
  check(under === 0, 'nothing of a circuit is under the ground', `lowest ${lowest.toFixed(2)} over it`);
  check(parked === 0, 'the final clears the parked plane by ten units', `${parked}`);
  check(jumps === 0, 'no circuit moves in a jump', `steepest climb over the hills ${steepest.toFixed(0)} units/s`);
}

// --- helicopters, balloons, airships -------------------------------------------------------

console.log('\nthe rest:');
{
  const clear: Record<FlyerKind, number> = { airliner: Infinity, plane: Infinity, helicopter: Infinity, balloon: Infinity, airship: Infinity };
  let jumps = 0;
  let count = 0;
  const cities = places.filter((p) => isShown(p) && p.pop >= 1_000_000);
  for (let k = 0; k < cities.length; k += 7) {
    const at = unitAt(cities[k]!.lat, cities[k]!.lon, new Vector3());
    for (const t of [T0, T0 + 5000]) {
      for (const flight of schedule.flightsNear(at, t, [])) {
        if (flight.kind === 'airliner' || flight.kind === 'plane') continue;
        count++;
        for (let s = Math.max(flight.from, t - 300); s < Math.min(flight.to, t + 300); s += 2) {
          flight.pose(s, pose);
          const over = pose.position.length() - ground(pose.position.clone().normalize());
          if (!pose.grounded) clear[flight.kind] = Math.min(clear[flight.kind], over);
          else clear[flight.kind] = Math.min(clear[flight.kind], over + 1000);
          flight.pose(s + 0.1, other);
          if (pose.position.distanceTo(other.position) > 0.1 * 120) jumps++;
        }
      }
    }
  }
  check(count > 20, 'helicopters, balloons and airships fly near the big cities', `${count}`);
  check(clear.helicopter >= 109, 'a helicopter keeps over a hundred units over the ground', `${clear.helicopter.toFixed(1)}`);
  check(clear.airship >= 179, 'an airship keeps its clearance', `${clear.airship.toFixed(1)}`);
  check(clear.balloon >= -0.05, 'a balloon is never under the ground', `${clear.balloon.toFixed(2)}`);
  check(jumps === 0, 'none of them moves in a jump');

  // Every balloon that flies lands on land and out of every town.
  let flights = 0;
  let wet = 0;
  let inTown = 0;
  const towns = places.map((p, i) => ({ p, i })).filter(({ p, i }) => isShown(p) && keepsBalloon(i));
  for (const { i } of towns.slice(0, 120)) {
    for (let slot = Math.floor(T0 / 1500); slot < Math.floor(T0 / 1500) + 6; slot++) {
      const flight = schedule.balloonOf(i, slot);
      if (flight === null) continue;
      flights++;
      flight.pose(flight.to - 0.01, pose);
      const dir = pose.position.clone().normalize();
      if (ground(dir) <= PLANET_RADIUS + 0.5) wet++;
      if (places.some((p) => isShown(p) && units(unitAt(p.lat, p.lon, new Vector3()), dir) < radiusOf(p))) inTown++;
    }
  }
  check(flights > 50, 'balloons go up', `${flights} flights from ${Math.min(120, towns.length)} towns in six slots`);
  check(wet === 0 && inTown === 0, 'every balloon lands on land, out of every town', `${wet} wet, ${inTown} in a town`);
}

// --- density ---------------------------------------------------------------------------------

console.log('\nwhat a player sees:');
{
  const total: Record<FlyerKind, number> = { airliner: 0, plane: 0, helicopter: 0, balloon: 0, airship: 0 };
  const sample = places.filter((p) => isShown(p) && p.pop >= 200_000);
  let spots = 0;
  let empty = 0;
  for (let k = 0; k < sample.length; k += 11) {
    const at = unitAt(sample[k]!.lat, sample[k]!.lon, new Vector3());
    const list = schedule.flightsNear(at, T0 + k * 37, []);
    spots++;
    if (list.length === 0) empty++;
    for (const flight of list) {
      flight.pose(T0 + k * 37, pose);
      if (units(pose.position, at) < REACH[flight.kind]) total[flight.kind]++;
    }
  }
  console.log(`  over ${spots} towns of 200k: ${FLYER_KINDS.map((k) => `${k} ${(total[k] / spots).toFixed(2)}`).join(', ')} within reach on average; ${empty} with an empty sky`);
  check(empty < spots * 0.5, 'most big towns have something in the sky');
}

console.log(failures === 0 ? '\nall sky checks passed' : `\n${failures} sky check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
