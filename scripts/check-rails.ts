/**
 * The railway, headless: `rails.bin` against the world it was baked from, every
 * line walked again, and the trains run through a day.
 *
 * The file stores the least that decides a line — its two cities, which way
 * each station stands, the platform's side, how far out and the bow — and
 * `rails.ts` works the rest out; so this re-walks what the bake walked, with
 * the same walk (`rail-trial.ts`), in the bake's own order, and asks for the
 * same answer. Then what the lines promise the rest of the world: the crown
 * never under the ground's lift, the keepouts covering the track, and a
 * train that runs its timetable without a jump and stops at its platforms.
 *
 *   node scripts/check-rails.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { decodePlaces, decodeRails, decodeRoads, encodeRails, inflate } from '../src/pack.ts';
import { indexPlaces, isShown, terrainSiteOf } from '../src/places.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { tightestTurn } from '../src/roads.ts';
import { createSiteIndex } from '../src/fleet.ts';
import {
  CAR_PITCH,
  CONSISTS,
  DWELL,
  RAIL_GRADE,
  RAIL_LIFT,
  RAIL_MIN_RADIUS,
  RAIL_POP,
  STOP_SHORT,
  TRAIN_SPEED,
  consistOf,
  createRailNetwork,
  crownAt,
  phaseOf,
  railFields,
  railPointAt,
  steepestGrade,
  trainAt,
} from '../src/rails.ts';
import type { TrainState } from '../src/rails.ts';
import { unitAt } from '../src/sphere.ts';
import { createRailTrial } from './rail-trial.ts';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;
const monumentsPath = resolve(here, '../public/data/monuments.json');
const monuments: { id: string; iso: string; lat: number; lon: number; footprint?: number }[] = existsSync(monumentsPath)
  ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: typeof monuments }).monuments
  : [];
setFlattenSites(monuments);
const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
setDetailSites(placesRaw.map(terrainSiteOf));
const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const places = indexPlaces(placesRaw, 0).all;
const roads = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin')))).roads;
const bytes = await inflate(readFileSync(resolve(here, '../public/data/rails.bin')));
const data = decodeRails(bytes);

console.log('the file:');
check(data.places === places.length && data.roads === roads.length, 'rails.bin was baked against this places.bin and this roads.bin', `${data.places}/${places.length} places, ${data.roads}/${roads.length} roads`);
if (data.places !== places.length || data.roads !== roads.length) {
  console.log('  run `pnpm rails`');
  process.exit(1);
}
const again = decodeRails(encodeRails(data.places, data.roads, data.lines));
check(JSON.stringify(again.lines) === JSON.stringify(data.lines), 'the format round-trips', `${data.lines.length} lines`);
const lines = data.lines;
check(lines.every((line) => isShown(places[line.a]!) && isShown(places[line.b]!) && places[line.a]!.pop >= RAIL_POP && places[line.b]!.pop >= RAIL_POP), 'every line joins two built cities with a station');
const pairs = new Set(lines.map((line) => `${line.a}:${line.b}`));
check(pairs.size === lines.length && lines.every((line) => line.a < line.b), 'no pair is joined twice, and each is written low index first');

// --- every line walked again, in the bake's own order ---------------------------------

console.log('\nthe walk:');
const fields = createSiteIndex({ world, places, roads, monuments });
const trial = createRailTrial({ world, places, roads, fields });
const at = places.map((place) => unitAt(place.lat, place.lon, new Vector3()));
const order = [...lines].sort((x, y) => at[x.a]!.angleTo(at[x.b]!) - at[y.a]!.angleTo(at[y.b]!) || x.a - y.a || x.b - y.b);
let began = performance.now();
const refused: string[] = [];
let crossings = 0;
for (const line of order) {
  const verdict = trial.line(line);
  if (verdict.refusal !== null) refused.push(`${places[line.a]!.name}-${places[line.b]!.name}: ${verdict.refusal} at ${verdict.at.toFixed(0)}`);
  else crossings += verdict.crossings.length;
  trial.accept(trial.lay(line));
}
check(refused.length === 0, 'every line passes the walk it was baked by', refused.slice(0, 4).join('; ') || `${crossings} level crossings, ${Math.round(performance.now() - began)} ms`);

const network = createRailNetwork(lines, places, world);
let length = 0;
let tightest = Infinity;
let steepest = 0;
let buried = 0;
let lowestLift = Infinity;
for (let i = 0; i < lines.length; i++) {
  const path = network.path(i);
  length += path.length;
  tightest = Math.min(tightest, tightestTurn(path));
  const crown = network.crown(i);
  steepest = Math.max(steepest, steepestGrade(crown));
  const p = new Vector3();
  for (let s = 0; s <= path.length; s += 5) {
    railPointAt(network, i, s, p);
    const lift = crownAt(crown, s) - (PLANET_RADIUS + world.elevationAt(p));
    lowestLift = Math.min(lowestLift, lift);
    if (lift < RAIL_LIFT - 0.3) buried++;
  }
}
check(tightest >= RAIL_MIN_RADIUS, `no line turns tighter than ${RAIL_MIN_RADIUS}`, `tightest ${tightest.toFixed(0)}`);
check(steepest <= RAIL_GRADE + 1e-9, `no crown climbs steeper than ${RAIL_GRADE}`, `steepest ${steepest.toFixed(3)}`);
check(buried === 0, 'the crown is never under the ground\'s lift: a train rides over a dip, never into a hill', `lowest lift ${lowestLift.toFixed(2)} (${buried} samples under)`);

// --- what keeps off it ------------------------------------------------------------------------

console.log('\nthe keepouts:');
{
  const keep = railFields(network);
  const p = new Vector3();
  let uncovered = 0;
  let samples = 0;
  for (let i = 0; i < lines.length; i += 3) {
    const path = network.path(i);
    for (let s = 0; s <= path.length; s += 11) {
      railPointAt(network, i, s, p);
      samples++;
      if (keep.fieldsNear(p, 0, []).length === 0) uncovered++;
    }
  }
  check(uncovered === 0, 'every point of every line is inside the ground the wood, the farms and the herds keep off', `${samples} samples`);
}

// --- the trains -------------------------------------------------------------------------------

console.log('\nthe trains:');
{
  const T0 = Date.UTC(2026, 8, 25, 6, 0, 0) / 1000;
  const state: TrainState = { head: 0, direction: 1, speed: 0, standing: true };
  const before: TrainState = { head: 0, direction: 1, speed: 0, standing: true };
  let jumps = 0;
  let outside = 0;
  let stops = 0;
  let wrongStop = 0;
  let fastest = 0;
  const kinds = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const path = network.path(i);
    const consist = consistOf(line, places, path.length);
    kinds.set(consist.kind, (kinds.get(consist.kind) ?? 0) + 1);
    const cars = consist.cars.length;
    const trainLength = cars * CAR_PITCH;
    const phase = phaseOf(line);
    trainAt(path.length, cars, phase, T0, before);
    for (let t = T0 + 0.25; t < T0 + 1200; t += 0.25) {
      trainAt(path.length, cars, phase, t, state);
      const tail = state.head - state.direction * trainLength;
      if (Math.min(state.head, tail) < STOP_SHORT - 1e-6 || Math.max(state.head, tail) > path.length - STOP_SHORT + 1e-6) outside++;
      // The occupied stretch moves smoothly, whichever end leads.
      const lo = Math.min(state.head, tail);
      const loBefore = Math.min(before.head, before.head - before.direction * trainLength);
      if (Math.abs(lo - loBefore) > TRAIN_SPEED * 0.25 + 1e-6) jumps++;
      fastest = Math.max(fastest, state.speed);
      if (state.standing && !before.standing) {
        stops++;
        const atA = Math.abs(lo - STOP_SHORT) < 1e-6;
        const atB = Math.abs(lo + trainLength - (path.length - STOP_SHORT)) < 1e-6;
        if (!atA && !atB) wrongStop++;
      }
      before.head = state.head;
      before.direction = state.direction;
      before.standing = state.standing;
    }
  }
  check(jumps === 0 && outside === 0, 'every train keeps to its line and moves without a jump, through twenty minutes', `fastest ${fastest.toFixed(1)} units/s`);
  check(stops > lines.length && wrongStop === 0, 'every stop is at a platform, the nose at the buffer stop', `${stops} stops of ${DWELL} s`);
  check(fastest <= TRAIN_SPEED + 1e-6, 'no train runs faster than the line speed');
  console.log(`  trains: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  // The same at any time, asked in any order.
  const a = trainAt(1000, 4, 0.3, T0 + 777, { head: 0, direction: 1, speed: 0, standing: true });
  trainAt(1000, 4, 0.3, T0 + 12, state);
  const b = trainAt(1000, 4, 0.3, T0 + 777, { head: 0, direction: 1, speed: 0, standing: true });
  check(a.head === b.head && a.direction === b.direction && a.speed === b.speed, 'the timetable is a pure function of the clock');
}

// --- drawn: the streamer built headless, the way the browser builds it -----------------------

console.log('\ndrawn:');
{
  const g = globalThis as Record<string, unknown>;
  g.ProgressEvent ??= class extends Event {
    constructor(type: string) {
      super(type);
    }
  };
  g.self ??= globalThis;
  const { modelsFrom } = await import('../src/kit.ts');
  const { createRailway } = await import('../src/railway.ts');
  const { MeshToonMaterial, PerspectiveCamera, Matrix4, Mesh } = await import('three');
  const models = await modelsFrom(readFileSync(resolve(here, '../public/models/rail/kit.bin')));
  const kit = new Map(models.map((model) => [model.name, model]));
  const needed = new Set(Object.values(CONSISTS).flatMap((c) => [c.ends, ...c.middle]));
  check([...needed].every((id) => kit.has(id)), 'the Train Kit has every car a consist names', `${kit.size} models`);
  const railway = createRailway({ world, places, roads, network, kit, material: new MeshToonMaterial() });
  // Stand at the busiest line's first station, a little up, looking along the line.
  const busiest = [...lines.keys()].sort((x, y) => network.path(y).length - network.path(x).length)[Math.floor(lines.length / 2)]!;
  const eye = new Vector3();
  railPointAt(network, busiest, 30, eye);
  const ground = PLANET_RADIUS + world.elevationAt(eye);
  const camera = new PerspectiveCamera(45, 1.6, 1, 50000);
  const look = railPointAt(network, busiest, 200, new Vector3()).multiplyScalar(ground);
  camera.position.copy(eye).multiplyScalar(ground + 25);
  camera.up.copy(eye);
  camera.lookAt(look);
  camera.updateMatrixWorld(true);
  const player = eye.clone().multiplyScalar(ground);
  const T0 = Date.UTC(2026, 8, 25, 9, 0, 0) / 1000;
  let began = performance.now();
  for (let k = 0; k < 40; k++) railway.update({ dt: 0.1, seconds: T0 + k * 0.1, camera, player, fogFar: 1400 });
  const firstMs = performance.now() - began;
  check(railway.stats.chunks > 0 && railway.stats.stations > 0, 'the track and the stations stand round the eye', `${railway.stats.chunks} chunks, ${railway.stats.stations} stations, ${firstMs.toFixed(0)} ms for 40 frames`);
  // Wait for a train on this line.
  let seen = 0;
  for (let k = 0; k < 600 && seen === 0; k++) {
    railway.update({ dt: 0.5, seconds: T0 + 4 + k * 0.5, camera, player, fogFar: 1400 });
    seen = railway.stats.cars;
  }
  check(seen > 0, 'a train comes', `${railway.stats.trains} trains, ${seen} cars`);
  // Every matrix proper, and the bed's crown faces up.
  railway.group.updateMatrixWorld(true);
  let reflected = 0;
  let down = 0;
  let faces = 0;
  const n = new Vector3();
  const at = new Vector3();
  railway.group.traverse((part) => {
    if (part.matrixWorld.determinant() <= 0) reflected++;
    const mesh = part as InstanceType<typeof Mesh>;
    if (!mesh.isMesh || !mesh.name.startsWith('rail:')) return;
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    for (let v = 0; v < position.count; v += 3) {
      n.fromBufferAttribute(normal, v);
      at.fromBufferAttribute(position, v).applyMatrix4(mesh.matrixWorld).normalize();
      faces++;
      if (n.dot(at) < -0.5) down++;
    }
  });
  check(reflected === 0, 'no part of the railway is drawn mirrored');
  check(down === 0, 'the ballast, the sleepers and the rails all face out, none into the ground', `${faces} faces`);
  // The crown is what a foot stands on.
  const on = railPointAt(network, busiest, 300, new Vector3());
  const crown = crownAt(network.crown(busiest), 300);
  const standing = railway.bedHeightAt(on.clone().multiplyScalar(crown));
  check(Math.abs(standing - crown) < 0.01, 'a foot on the track stands on the crown', `${(standing - crown).toFixed(3)}`);
  // A car is a wall.
  let walled = false;
  railway.eachCar((point) => {
    if (walled) return;
    const push = new Vector3();
    walled = railway.collide(point.clone(), 1, push) && push.length() > 0;
  });
  check(walled, 'a train\'s car pushes a body out of it');
  void Matrix4;
  began = performance.now();
  for (let k = 0; k < 100; k++) railway.update({ dt: 1 / 60, seconds: T0 + 400 + k / 60, camera, player, fogFar: 1400 });
  console.log(`  ${((performance.now() - began) / 100).toFixed(2)} ms a frame, steady`);
}

// --- the network, in numbers --------------------------------------------------------------------

console.log('\nthe network:');
{
  const served = new Set(lines.flatMap((line) => [line.a, line.b]));
  const stations = places.filter((place) => isShown(place) && place.pop >= RAIL_POP).length;
  const biggest = [...served].sort((x, y) => places[y]!.pop - places[x]!.pop).slice(0, 8).map((i) => places[i]!.name);
  console.log(`  ${lines.length} lines, ${Math.round(length).toLocaleString()} units of track, ${served.size} of ${stations} cities with a station`);
  console.log(`  the largest served: ${biggest.join(', ')}`);
  const longest = [...lines.keys()].sort((x, y) => network.path(y).length - network.path(x).length)[0];
  if (longest !== undefined) {
    const line = lines[longest]!;
    console.log(`  the longest: ${places[line.a]!.name} - ${places[line.b]!.name}, ${network.path(longest).length.toFixed(0)} units`);
  }
  check(served.size > 100, 'the railway reaches a hundred cities', `${served.size}`);
}

console.log(failures === 0 ? '\nall rail checks passed' : `\n${failures} rail check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
