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
  BED_FOOT,
  BED_HALF,
  CAR_PITCH,
  CONSISTS,
  DWELL,
  RAIL_GRADE,
  RAIL_LIFT,
  RAIL_MIN_RADIUS,
  RAIL_POP,
  RAIL_TOP,
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
  // The drawn land, as `main.ts` hands it over: the mesh is up to several units
  // off the relief, and the bed's feet reach down to whichever is lower.
  const { buildLand } = await import('../src/globe.ts');
  const { drawnRadius, landProbeOf } = await import('../src/land-probe.ts');
  const land = buildLand(world);
  const probe = landProbeOf(land);
  const drawnGround = (point: Vector3): number => drawnRadius(world, probe, point);
  const trainMaterial = new MeshToonMaterial();
  const railway = createRailway({ world, places, roads, network, kit, material: trainMaterial, drawnGround });
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
  probe.prime(player);
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
  // In the scene graph, shown, and inside their own bounds, so nothing culls them.
  {
    const beds: InstanceType<typeof Mesh>[] = [];
    railway.group.traverse((part) => {
      const mesh = part as InstanceType<typeof Mesh>;
      if (mesh.isMesh && mesh.name.startsWith('rail:')) beds.push(mesh);
    });
    let hidden = 0;
    let unbounded = 0;
    const v = new Vector3();
    for (const bed of beds) {
      let shown = true;
      for (let o: { visible: boolean; parent: unknown } | null = bed; o !== null; o = o.parent as typeof o) shown &&= o.visible;
      if (!shown || !(bed.material as InstanceType<typeof MeshToonMaterial>).visible) hidden++;
      const sphere = bed.geometry.boundingSphere!;
      const position = bed.geometry.getAttribute('position');
      for (let k = 0; k < position.count; k++) {
        if (v.fromBufferAttribute(position, k).distanceTo(sphere.center) > sphere.radius + 1e-3) {
          unbounded++;
          break;
        }
      }
    }
    const { Frustum } = await import('three');
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const onScreen = beds.filter((bed) => frustum.intersectsObject(bed)).length;
    check(beds.length > 0 && hidden === 0 && unbounded === 0 && onScreen > 0, 'the track\'s chunks hang under the railway\'s group, shown, bounded, and in view', `${beds.length} chunks, ${onScreen} in the frustum`);
  }
  // The program the browser compiles for the bed: every function the weather
  // chunk calls is defined in it, every varying it reads is written, every
  // uniform it declares is bound. A program that fails to link draws nothing,
  // and nothing headless would say so.
  {
    const { ShaderChunk, ShaderLib } = await import('three');
    let bed: InstanceType<typeof Mesh> | null = null;
    railway.group.traverse((part) => {
      const mesh = part as InstanceType<typeof Mesh>;
      if (bed === null && mesh.isMesh && mesh.name.startsWith('rail:')) bed = mesh;
    });
    const material = (bed as InstanceType<typeof Mesh> | null)?.material as InstanceType<typeof MeshToonMaterial> | undefined;
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: ShaderLib.toon!.vertexShader, fragmentShader: ShaderLib.toon!.fragmentShader };
    material?.onBeforeCompile(shader as never, null as never);
    const expand = (source: string): string =>
      source.replace(/#include <(\w+)>/g, (_, name: string) => expand((ShaderChunk as unknown as Record<string, string>)[name] ?? ''));
    const vertex = expand(shader.vertexShader);
    const fragment = expand(shader.fragmentShader);
    const defined = (source: string, name: string): boolean => new RegExp(`\\b(?:float|vec2|vec3|vec4|void)\\s+${name}\\s*\\(`).test(source);
    const called = [...new Set([...fragment.matchAll(/\b(atlas\w+)\s*\(/g)].map((m) => m[1]!))];
    const undefinedCalls = called.filter((name) => !defined(fragment, name));
    const varyings = [...fragment.matchAll(/varying\s+\w+\s+(v\w+)\s*;/g)].map((m) => m[1]!).filter((name) => name.startsWith('vRail'));
    const unwritten = varyings.filter((name) => !new RegExp(`\\b${name}\\s*=`).test(vertex));
    const uniforms = [...fragment.matchAll(/uniform\s+\w+\s+(atlas\w+)\s*;/g)].map((m) => m[1]!);
    const unbound = uniforms.filter((name) => !(name in shader.uniforms));
    check(
      material !== undefined && fragment.includes('atlasWeathered(diffuseColor') && undefinedCalls.length === 0 && unwritten.length === 0 && unbound.length === 0,
      'the bed\'s program defines what it calls, writes what it reads and binds what it declares',
      [undefinedCalls.length > 0 ? `undefined: ${undefinedCalls.join(', ')}` : '', unwritten.length > 0 ? `unwritten: ${unwritten.join(', ')}` : '', unbound.length > 0 ? `unbound: ${unbound.join(', ')}` : ''].filter(Boolean).join('; ') || `${called.length} functions`,
    );
  }
  // On the drawn land: the rail heads never under it, the crown on it or over
  // it by no more than an embankment, and the shoulders' feet never over it.
  {
    const path = network.path(busiest);
    const crownOf = network.crown(busiest);
    const point = new Vector3();
    const tangent = new Vector3();
    const side = new Vector3();
    const q = new Vector3();
    let railUnder = 0;
    let lowest = Infinity;
    let highest = -Infinity;
    let samples = 0;
    for (let s = 0; s <= Math.min(path.length, 1200); s += 3) {
      railPointAt(network, busiest, s, point, tangent);
      side.crossVectors(tangent, point).normalize();
      const crown = crownAt(crownOf, s);
      for (const x of [-BED_HALF, 0, BED_HALF]) {
        q.copy(point).addScaledVector(side, x / PLANET_RADIUS).normalize();
        if (!probe.covers(q)) continue;
        const drawn = probe.radiusAt(q);
        if (drawn === null) continue;
        samples++;
        lowest = Math.min(lowest, crown - drawn);
        highest = Math.max(highest, crown - drawn);
        if (crown + RAIL_TOP < drawn) railUnder++;
      }
    }
    check(samples > 100 && railUnder === 0 && lowest > -0.6 && highest < 16, 'the track lies on the drawn land: rail heads over it, the crown within an embankment of it', `crown over the drawn land ${lowest.toFixed(2)} to ${highest.toFixed(2)}, ${samples} samples`);
    // The shoulders' feet, which reach down past the drawn land wherever it is under the relief.
    let hanging = 0;
    let feet = 0;
    const v = new Vector3();
    railway.group.traverse((part) => {
      const mesh = part as InstanceType<typeof Mesh>;
      if (!mesh.isMesh || !mesh.name.startsWith(`rail:${busiest}:`)) return;
      const position = mesh.geometry.getAttribute('position');
      for (let k = 0; k < position.count; k++) {
        v.fromBufferAttribute(position, k).applyMatrix4(mesh.matrixWorld);
        const radius = v.length();
        v.normalize();
        const hit = network.nearest(v, BED_FOOT + 1, { line: 0, s: 0, off: 0 });
        if (hit === null || hit.off < BED_FOOT - 0.3 || !probe.covers(v)) continue;
        const drawn = probe.radiusAt(v);
        if (drawn === null) continue;
        feet++;
        if (radius > drawn + 0.05) hanging++;
      }
    });
    check(feet > 0 && hanging === 0, 'the bed\'s shoulders reach into the drawn land, never hang over it', `${hanging} of ${feet} feet over it`);
  }
  // A train's wheels stand on the rail head: each car's model starts at its holder's floor, and the holder rides the rail head.
  {
    let worstFloor = 0;
    let worstHead = 0;
    let cars = 0;
    const box = new Vector3();
    railway.group.traverse((part) => {
      const mesh = part as InstanceType<typeof Mesh>;
      if (!mesh.isMesh || mesh.material !== trainMaterial || mesh.parent === null || !mesh.parent.visible) return;
      cars++;
      const position = mesh.geometry.getAttribute('position');
      let floor = Infinity;
      for (let k = 0; k < position.count; k++) floor = Math.min(floor, box.fromBufferAttribute(position, k).applyMatrix4(mesh.matrix).y);
      worstFloor = Math.max(worstFloor, Math.abs(floor));
      const at = mesh.parent.position;
      const hit = network.nearest(at.clone().normalize(), 2, { line: 0, s: 0, off: 0 });
      worstHead = Math.max(worstHead, hit === null ? Infinity : Math.abs(at.length() - (crownAt(network.crown(hit.line), hit.s) + RAIL_TOP)));
    });
    check(cars > 0 && worstFloor < 0.02 && worstHead < 0.1, 'every car\'s wheels touch the rail head', `${cars} cars, floor off by ${worstFloor.toFixed(3)}, rail head by ${worstHead.toFixed(3)}`);
  }
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
