/**
 * The jobs headless: the board is a pure function of the world and the day,
 * every errand, fare, load and rescue it offers can be done (the town it goes
 * to is built, a fare waits on its own road's verge, a swimmer is in open
 * water and set down at a shore, a walker is up on dry ground), the par and
 * the medals are monotonic, and the record survives a damaged store and
 * merges as a set.
 *
 *   node scripts/check-jobs.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { indexPlaces, isShown, radiusOf, terrainSiteOf } from '../src/places.ts';
import { courseOf } from '../src/roads.ts';
import type { Road } from '../src/roads.ts';
import { decodePlaces, decodeRoads, inflate } from '../src/pack.ts';
import { createSiteIndex } from '../src/fleet.ts';
import type { FleetSite } from '../src/fleet.ts';
import type { LandmarkSite } from '../src/landmark-ground.ts';
import { unitAt } from '../src/sphere.ts';
import { isWater } from '../src/vehicles.ts';
import { CARGO_RANGE, ERRAND_RANGE, ERRAND_ROADS, ERRAND_SHARE, FARE_OUT, FARE_VERGE, HILL_RISE, createBoard, jobDay } from '../src/jobs/board.ts';
import type { Job } from '../src/jobs/types.ts';
import { GOLD_PAR, SILVER_PAR, medalFor, parFor, pointsFor, standingOf } from '../src/jobs/score.ts';
import {
  JOBS_KEY, MAX_JOBS, emptyJobs, mergeJobs, parseJobs, readJobs, recordOf, reputationOf, serialiseJobs, writeJobs,
} from '../src/jobs/store.ts';
import type { JobRecord } from '../src/jobs/store.ts';

const here = dirname(fileURLToPath(import.meta.url));
const R = PLANET_RADIUS;

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// --- the world, as check-country.ts loads it --------------------------------

const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;
const monuments = (JSON.parse(readFileSync(resolve(here, '../public/data/monuments.json'), 'utf8')) as { monuments: LandmarkSite[] }).monuments;
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
const sites = createSiteIndex({ world, places, roads, monuments });

const groundAt = (direction: THREE.Vector3): number => R + world.elevationAt(direction);
const taken = (direction: THREE.Vector3, reach: number): boolean =>
  sites.near(direction, reach, []).some((site) => site.at.angleTo(direction) * R < reach);
const source = { places, roads, shown: (i: number) => isShown(places[i]!), groundAt, isWater, radius: R, taken };
const board = createBoard(source);
const day = jobDay(Date.UTC(2026, 10, 3, 12));
const along = (a: THREE.Vector3, b: THREE.Vector3): number => a.angleTo(b) * R;
const centre = (i: number): THREE.Vector3 => unitAt(places[i]!.lat, places[i]!.lon, new THREE.Vector3());
const shownIndices = places.map((_, i) => i).filter((i) => isShown(places[i]!));
/** Every 7th built town, so the sweep covers every continent in seconds. */
const sample = shownIndices.filter((_, k) => k % 7 === 0);
console.log(`world: ${places.length} places, ${shownIndices.length} built, ${roads.length} roads; sweeping ${sample.length} towns on day ${day}\n`);

/** Whether `to` is within `hops` roads of `from`, by a search of the check's own. */
const neighbours = new Map<number, number[]>();
for (const road of roads) {
  for (const [x, y] of [[road.a, road.b], [road.b, road.a]] as const) (neighbours.get(x) ?? neighbours.set(x, []).get(x)!).push(y);
}
function withinRoads(from: number, to: number, hops: number): boolean {
  let ring = [from];
  const seen = new Set([from]);
  for (let hop = 0; hop < hops; hop++) {
    const next: number[] = [];
    for (const x of ring) for (const y of neighbours.get(x) ?? []) if (!seen.has(y)) (seen.add(y), next.push(y));
    if (next.includes(to)) return true;
    ring = next;
  }
  return false;
}

const ids = new Set<string>();
const idOnce = (job: Job): boolean => {
  if (ids.has(job.id)) return false;
  ids.add(job.id);
  return true;
};

// --- errands -----------------------------------------------------------------

console.log('errands:');
{
  let offered = 0;
  let asked = 0;
  const problems: string[] = [];
  for (const from of sample) {
    for (let n = 0; n < 12; n++) {
      const giver = `${from}|folk|${n}`;
      asked++;
      const job = board.errand(giver, from, day);
      if (job === null) continue;
      offered++;
      const again = board.errand(giver, from, day);
      if (JSON.stringify(again) !== JSON.stringify(job)) problems.push(`${job.id}: not the same twice`);
      if (!idOnce(job)) problems.push(`${job.id}: the id twice`);
      if (!isShown(places[job.to]!)) problems.push(`${job.id}: to a town that is not built`);
      if (!withinRoads(from, job.to, ERRAND_ROADS)) problems.push(`${job.id}: no way there in ${ERRAND_ROADS} roads`);
      const gap = along(centre(from), job.drop) - radiusOf(places[from]!);
      if (gap < ERRAND_RANGE[0] - 1 || gap > ERRAND_RANGE[1] + 1) problems.push(`${job.id}: ${gap.toFixed(0)} units past the edge`);
      if (!(job.parMs > 0)) problems.push(`${job.id}: no par`);
    }
  }
  check(problems.length === 0, 'every errand is the same twice and goes to a built town in range, a few roads away', problems.slice(0, 3).join('; '));
  check(offered > asked * ERRAND_SHARE * 0.7 && offered < asked * ERRAND_SHARE * 1.3, 'about one townsperson in seven has one', `${offered} of ${asked}`);
  const tomorrow = sample.slice(0, 200).flatMap((from) => [0, 1, 2, 3].map((n) => board.errand(`${from}|folk|${n}`, from, day + 1)?.id ?? ''));
  const today = sample.slice(0, 200).flatMap((from) => [0, 1, 2, 3].map((n) => board.errand(`${from}|folk|${n}`, from, day)?.id ?? ''));
  check(tomorrow.join() !== today.join(), 'the board turns over with the day');
}

// --- fares --------------------------------------------------------------------

console.log('\nfares:');
{
  const problems: string[] = [];
  let count = 0;
  let twoLegs = 0;
  const course = courseOf(roads[0]!, places);
  for (const from of sample) {
    const jobs = board.fares(from, day, []);
    for (const job of jobs) {
      count++;
      if (!idOnce(job)) problems.push(`${job.id}: the id twice`);
      if (!isShown(places[job.to]!) || job.to === from) problems.push(`${job.id}: to ${places[job.to]!.name}`);
      const index = Number(job.id.split(':')[2]!.slice(1));
      const road = roads[index]!;
      if (road.a !== from && road.b !== from) problems.push(`${job.id}: its road does not reach the town`);
      courseOf(road, places, course);
      const gate = road.a === from ? course.gateA : course.gateB;
      const off = along(gate, job.pickup);
      // Along a curve, so never further than the straight line; a third of a short road, or further where that is taken.
      const most = Math.hypot(Math.min(FARE_OUT, course.length * 0.34) + 32, FARE_VERGE) + 3;
      if (off > most) problems.push(`${job.id}: waits ${off.toFixed(1)} from its gate`);
      if (off < FARE_VERGE * 0.6) problems.push(`${job.id}: waits on the carriageway`);
      const parked = sites.near(job.pickup, 7, []).filter((site) => along(site.at, job.pickup) < 7);
      if (parked.length > 0) problems.push(`${job.id}: waits on a parked ${parked[0]!.model}`);
      const other = road.a === from ? road.b : road.a;
      if (job.to !== other) twoLegs++;
      if (job.distance < course.length * 0.5) problems.push(`${job.id}: ${job.distance.toFixed(0)} units for a road of ${course.length.toFixed(0)}`);
    }
  }
  check(problems.length === 0, 'every fare waits on the verge outside its gate and goes down its road to a built town', problems.slice(0, 3).join('; '));
  check(count > sample.length * 0.2, 'fares are waiting', `${count} in ${sample.length} towns, ${twoLegs} over two roads`);
  check(twoLegs > 0 && twoLegs < count, 'some go one road further');
}

// --- loads --------------------------------------------------------------------

console.log('\nloads:');
{
  const problems: string[] = [];
  const strips: FleetSite[] = [];
  const seen = new Set<string>();
  for (const from of shownIndices.filter((_, k) => k % 3 === 0)) {
    for (const site of sites.planesNear(centre(from), 10, [])) if (!seen.has(site.id)) (seen.add(site.id), strips.push(site));
  }
  let count = 0;
  for (const strip of strips) {
    const near = sites.planesNear(strip.at, CARGO_RANGE[1], []).filter((s, i, all) => all.findIndex((t) => t.id === s.id) === i);
    const job = board.cargo(strip, near, day);
    if (job === null) continue;
    count++;
    if (!idOnce(job)) problems.push(`${job.id}: the id twice`);
    const d = along(strip.at, job.drop);
    if (d < CARGO_RANGE[0] - 1 || d > CARGO_RANGE[1] + 1) problems.push(`${job.id}: flown ${d.toFixed(0)}`);
    if (along(strip.at, job.pickup) > 40) problems.push(`${job.id}: the crates stand ${along(strip.at, job.pickup).toFixed(0)} off the plane`);
    if (!near.some((s) => s.at.distanceTo(job.drop) < 1e-9)) problems.push(`${job.id}: not left at a strip`);
    const again = board.cargo(strip, [...near].reverse(), day);
    if (again?.id !== job.id || again.to !== job.to) problems.push(`${job.id}: depends on the order of the strips`);
  }
  check(problems.length === 0, 'every load is stacked by its plane and flown in range to another strip, whatever order the strips come in', problems.slice(0, 3).join('; '));
  check(count > strips.length * 0.2, 'loads are waiting', `${count} at ${strips.length} strips`);
}

// --- rescues ------------------------------------------------------------------

console.log('\nrescues:');
{
  const problems: string[] = [];
  let sea = 0;
  let hill = 0;
  for (const from of sample) {
    const job = board.rescue(from, day);
    if (job === null) continue;
    if (!idOnce(job)) problems.push(`${job.id}: the id twice`);
    if (job.site === 'sea') {
      sea++;
      if (!isWater(groundAt(job.pickup))) problems.push(`${job.id}: the swimmer is on land`);
      if (!isWater(groundAt(job.drop))) problems.push(`${job.id}: set down on land, not at the shore`);
      // The board walks in by 20 units; the next of its steps is dry.
      const step = job.drop.clone().lerp(centre(from), 21 / Math.max(21, along(job.drop, centre(from)))).normalize();
      if (isWater(groundAt(step))) problems.push(`${job.id}: the shore is further in`);
    } else {
      hill++;
      const rise = groundAt(job.pickup) - groundAt(centre(from));
      if (isWater(groundAt(job.pickup)) || rise < HILL_RISE) problems.push(`${job.id}: the walker is ${rise.toFixed(0)} over the town`);
    }
    if (JSON.stringify(board.rescue(from, day)) !== JSON.stringify(job)) problems.push(`${job.id}: not the same twice`);
  }
  check(problems.length === 0, 'a swimmer is in open water and set down at the shore; a walker is up on dry ground', problems.slice(0, 3).join('; '));
  check(sea > 0 && hill > 0, 'both kinds are offered', `${sea} at sea, ${hill} on a hill`);
}

// --- the score ----------------------------------------------------------------

console.log('\nthe score:');
{
  check(parFor('taxi', 2000) > parFor('taxi', 1000) && parFor('cargo', 20000) > 0, 'the par grows with the distance');
  const par = 60000;
  check(
    medalFor(par * GOLD_PAR, par) === 3 && medalFor(par * GOLD_PAR + 1, par) === 2 && medalFor(par * SILVER_PAR + 1, par) === 1 && medalFor(1e9, par) === 1,
    'gold within the par, silver within 1.4 of it, bronze for anything finished',
  );
  check(pointsFor('rescue', 3) > pointsFor('rescue', 1) && pointsFor('rescue', 1) > pointsFor('errand', 1), 'a medal and a rescue are worth more');
  check(standingOf(0).rank === 0 && standingOf(1).rank === 1 && standingOf(1e6).next === null, 'the standings rise from the first job to the last');
}

// --- the record ---------------------------------------------------------------

console.log('\nthe record:');
{
  const memory = new Map<string, string>();
  const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
  const a: JobRecord = emptyJobs();
  a.done.set(`t:12:r40:${day}`, { kind: 'taxi', iso: 'ESP', title: 'Fare to Sóller', ms: 90000, medal: 2 });
  a.done.set(`r:7:h:${day}`, { kind: 'rescue', iso: 'NOR', title: 'Rescue above Bergen', ms: 200000, medal: 1 });
  writeJobs(storage, a);
  const back = readJobs(storage);
  check(serialiseJobs(back) === serialiseJobs(a), 'a record round trips through the store', memory.get(JOBS_KEY)?.slice(0, 60));
  for (const damaged of ['{', 'null', '[]', '{"done":7}', '{"done":{"x:1":{}}}', JSON.stringify({ done: { [`e:1:abc:${day}`]: { ms: -1, medal: 9, iso: 'ESP' } } })]) {
    if (parseJobs(damaged).done.size !== 0) check(false, `a damaged store reads as empty: ${damaged}`);
  }
  check(true, 'a damaged store reads as empty');
  const hostile = recordOf({ done: { [`e:1:abc:${day}`]: { ms: 5, medal: 3, iso: '<script>', title: 'x' }, [`c:2:s1:${day}`]: { ms: 5, medal: 3, iso: 'FRA', title: 'y'.repeat(500) } } });
  check(hostile.done.size === 1 && hostile.done.get(`c:2:s1:${day}`)!.title.length === 80, 'a hostile row keeps only what can be vouched for, its title cut');
  const b: JobRecord = emptyJobs();
  b.done.set(`t:12:r40:${day}`, { kind: 'taxi', iso: 'ESP', title: 'Fare to Sóller', ms: 120000, medal: 3 });
  b.done.set(`c:3:s2:${day}`, { kind: 'cargo', iso: 'FRA', title: 'Cargo to Lyon', ms: 300000, medal: 1 });
  const ab = mergeJobs(a, b);
  const ba = mergeJobs(b, a);
  check(serialiseJobs(ab) === serialiseJobs(ba), 'the merge does not care about order');
  check(serialiseJobs(mergeJobs(ab, ab)) === serialiseJobs(ab), 'a record merged with itself is itself');
  const fare = ab.done.get(`t:12:r40:${day}`)!;
  check(ab.done.size === 3 && fare.ms === 90000 && fare.medal === 3, 'a job in both keeps the faster time and the better medal');
  const many = emptyJobs();
  for (let i = 0; i < MAX_JOBS + 50; i++) many.done.set(`e:${i}:abc:${10000 + i}`, { kind: 'errand', iso: 'ESP', title: 'x', ms: 1000, medal: 1 });
  const kept = mergeJobs(many, emptyJobs());
  check(kept.done.size === MAX_JOBS && !kept.done.has('e:0:abc:10000'), 'past the cap the oldest days go first');
  const rep = reputationOf(ab);
  check(rep.byCountry.get('ESP') === pointsFor('taxi', 3) && rep.total === [...rep.byCountry.values()].reduce((s, v) => s + v, 0), 'the reputation is the record summed by country');
}

// --- a fare, end to end -------------------------------------------------------

console.log('\na fare, end to end:');
{
  const { createJobs, STOPPED } = await import('../src/jobs.ts');
  const memory = new Map<string, string>();
  const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
  const folk = { ready: false, dress: () => null, wear: () => null, release: () => {}, seated: () => null };
  const said: string[] = [];
  const madrid = places.findIndex((p) => p.name === 'Madrid' && p.iso === 'ESP');
  let clock = Date.UTC(2026, 10, 3, 12);
  const jobs = createJobs({
    source,
    folk: folk as never,
    standAt: groundAt,
    regionOf: () => 'atlantic-europe',
    stripsNear: (direction, reach, out) => sites.planesNear(direction, reach, out as FleetSite[]),
    seatFrame: () => null,
    panel: null,
    storage,
    announce: (text) => void said.push(text),
    clock: () => clock,
  });
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 1e6);
  const ride = { vehicle: 'hatchback:1:0', kind: 'hatchback' as never, medium: 'road' as const, seats: 4, driving: true };
  const frame = {
    now: 0, dt: 1 / 30, position: centre(madrid).multiplyScalar(R + 20), ride: null as typeof ride | null, speed: 0, airborne: false,
    height: 0, givers: [] as { key: string; crown: THREE.Vector3 }[], camera, width: 1600, height2d: 900,
  };
  // Reads the board a slice a frame until it has read it all.
  for (let i = 0; i < 400; i++) jobs.frame(frame);
  const fare = jobs.nearby.find((job) => job.kind === 'taxi' && job.from === madrid) ?? jobs.nearby.find((job) => job.kind === 'taxi');
  check(fare !== undefined, 'fares are offered round Madrid', `${jobs.nearby.length} jobs near`);
  if (fare !== undefined) {
    const at = (direction: THREE.Vector3): THREE.Vector3 => frame.position.copy(direction).multiplyScalar(groundAt(direction) + 1);
    at(fare.pickup);
    frame.ride = null;
    jobs.frame(frame);
    check(jobs.offer === null, 'on foot a fare is not collected');
    frame.ride = ride;
    frame.speed = STOPPED * 3;
    jobs.frame(frame);
    check(jobs.offer === null, 'nor driving past');
    frame.speed = 0;
    jobs.frame(frame);
    check(jobs.offer?.job.id === fare.id, 'stopped beside them, E takes them', jobs.offer?.label ?? 'nothing');
    jobs.use();
    check(jobs.active?.job.id === fare.id && jobs.target !== null, 'the job is under way and the guide leads to the drop');
    frame.now = fare.parMs * 0.5;
    at(fare.drop);
    frame.speed = 20;
    jobs.frame(frame);
    check(jobs.active !== null, 'not done while still moving');
    frame.speed = 0;
    jobs.frame(frame);
    const done = jobs.record.done.get(fare.id);
    check(jobs.active === null && done?.medal === 3, 'stopped in the drop well inside the par: gold', JSON.stringify(done));
    check(parseJobs(memory.get(JOBS_KEY)).done.has(fare.id), 'and the record is kept');
    at(fare.pickup);
    for (let i = 0; i < 3; i++) jobs.frame(frame);
    check(jobs.offer?.job.id !== fare.id, 'a job done today is not offered again');
    clock += 86_400_000;
    for (let i = 0; i < 400; i++) jobs.frame(frame);
    check(jobs.nearby.every((job) => !job.id.endsWith(`:${day}`)), 'the next day the board turns over');
  }
  jobs.dispose();
}

console.log(failures === 0 ? '\njobs: all good' : `\njobs: ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
