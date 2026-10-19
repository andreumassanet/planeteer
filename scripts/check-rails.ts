/**
 * The railway headless: `rails.bin` against the world it was baked from.
 *
 * The file stores only what decides a line (its two cities, each station's
 * orientation and platform side, the bow); `rails.ts` derives the rest. So
 * each line is re-walked with the bake's own walk (`rail-trial.ts`), in the
 * bake's order, and must give the same answer. Then: the crown never under
 * the ground's lift, the keepouts covering the track, trains running their
 * timetable without jumps and stopping at platforms, and the streamer built
 * headless.
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
import { roadCorridors, tightestTurn } from '../src/roads.ts';
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
import { callAt, timetableOf } from '../src/rails/trains.ts';
import type { Call } from '../src/rails/trains.ts';
import {
  CARRIAGE, SEATS_PER_CAR, carFrame, carMiddle, carriagesOf, emptyCarFrame, inCar, insideCarriage, passengerOn, seatRoot, toCar,
} from '../src/rails/ride.ts';
import { emptyStation, lineStation, stationPoint } from '../src/rails/stations.ts';
import { PLATFORM_FROM, PLATFORM_INNER, PLATFORM_LENGTH, PLATFORM_RISE } from '../src/rails/line.ts';
import { glassFaults, probeOfMeshes } from './cabin-contract.ts';

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
  const timetableTravel = (length: number, cars: number): number => timetableOf(length, cars).travel;
  const models = await modelsFrom(readFileSync(resolve(here, '../public/models/rail/kit.bin')));
  const kit = new Map(models.map((model) => [model.name, model]));
  const needed = new Set(Object.values(CONSISTS).flatMap((c) => [c.ends, ...c.middle]));
  check([...needed].every((id) => kit.has(id)), 'the Train Kit has every car a consist names', `${kit.size} models`);
  // The drawn land, as `main.ts` hands it over: the mesh is up to several units
  // off the relief, and the bed's feet reach down to whichever is lower.
  const { buildLand } = await import('../src/globe.ts');
  const { drawnRadius, landProbeOf } = await import('../src/land-probe.ts');
  const land = buildLand(world, roadCorridors(roads, places));
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
  // The bed's program: every function the weather chunk calls is defined,
  // every varying it reads is written, every uniform it declares is bound. A
  // program that fails to link draws nothing, and nothing headless would say so.
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
  // No section of the ballast is left open: at a terminus, at a level
  // crossing or at the end of a chunk, every edge of the bed that only one of
  // its triangles has is down in the ground, never up where the eye sees in.
  {
    const { BED_COLOURS } = await import('../src/railway.ts');
    let open = 0;
    let edges = 0;
    let termini = 0;
    const a = new Vector3();
    const b = new Vector3();
    railway.group.traverse((part) => {
      const mesh = part as InstanceType<typeof Mesh>;
      if (!mesh.isMesh || !mesh.name.startsWith('rail:')) return;
      const [, line, index] = mesh.name.split(':').map(Number) as [number, number, number];
      if (index === 0 || (index + 1) * 150 >= network.path(line).length) termini++;
      const position = mesh.geometry.getAttribute('position');
      const colour = mesh.geometry.getAttribute('color');
      const isBed = (k: number): boolean =>
        BED_COLOURS.some((c) => Math.abs(c.r - colour.getX(k)) + Math.abs(c.g - colour.getY(k)) + Math.abs(c.b - colour.getZ(k)) < 1e-4);
      const key = (k: number): string => `${position.getX(k)},${position.getY(k)},${position.getZ(k)}`;
      const count = new Map<string, { n: number; i: number; j: number }>();
      for (let t = 0; t + 2 < position.count; t += 3) {
        if (!isBed(t)) continue;
        for (const [i, j] of [[t, t + 1], [t + 1, t + 2], [t + 2, t]] as const) {
          const ki = key(i);
          const kj = key(j);
          const edge = ki < kj ? `${ki}|${kj}` : `${kj}|${ki}`;
          const known = count.get(edge);
          if (known === undefined) count.set(edge, { n: 1, i, j });
          else known.n++;
        }
      }
      for (const { n, i, j } of count.values()) {
        if (n !== 1) continue;
        edges++;
        a.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(position, j).applyMatrix4(mesh.matrixWorld);
        const above = (v: Vector3): boolean => {
          const radius = v.length();
          const ground = probe.covers(v.clone().normalize()) ? probe.radiusAt(v.clone().normalize()) : null;
          return radius > (ground ?? PLANET_RADIUS + world.elevationAt(v.clone().normalize())) + 0.05;
        };
        if (above(a) && above(b)) open++;
      }
    });
    check(edges > 0 && termini > 0 && open === 0, 'no section of the ballast is open: a terminus, a crossing and a chunk\'s end are all closed', `${open} open edges of ${edges} free ones, ${termini} chunks at a terminus`);
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

  // Riding: board a carriage standing at A, ride to B and on back, get off.
  {
    const call: Call = { standing: false, arrives: 0, departs: 0 };
    const ride = [...lines.keys()].find((i) => {
      const consist = consistOf(lines[i]!, places, network.path(i).length);
      return carriagesOf(consist.kind, consist.cars.length).length > 0 && network.path(i).length > 600;
    })!;
    const line = lines[ride]!;
    const length = network.path(ride).length;
    const consist = consistOf(line, places, length);
    const cars = consist.cars.length;
    const phase = phaseOf(line);
    // The board agrees with the timetable: a call says when the train stands at each end, and it does.
    let disagree = 0;
    for (let t = T0; t < T0 + 3000; t += 7.3) {
      const s = trainAt(length, cars, phase, t, { head: 0, direction: 1, speed: 0, standing: true });
      for (const end of [0, 1] as const) {
        callAt(length, cars, phase, t, end, call);
        const here = s.standing && (s.direction > 0 ? 0 : 1) === end;
        if (call.standing !== here) disagree++;
        if (!call.standing) {
          const then = trainAt(length, cars, phase, t + call.arrives + 0.05, { head: 0, direction: 1, speed: 0, standing: true });
          if (!then.standing || (then.direction > 0 ? 0 : 1) !== end) disagree++;
          if (trainAt(length, cars, phase, t + call.arrives - 0.05, { head: 0, direction: 1, speed: 0, standing: true }).standing) disagree++;
        } else if (!trainAt(length, cars, phase, t + call.departs - 0.05, { head: 0, direction: 1, speed: 0, standing: true }).standing) disagree++;
      }
    }
    check(disagree === 0, 'a platform\'s board says when the train stands there, and it does', `${places[line.a]!.name} - ${places[line.b]!.name}`);
    // Board at A: the next standing there, a free seat in its first carriage.
    callAt(length, cars, phase, T0, 0, call);
    const boardAt = T0 + call.arrives + 1;
    const car = carriagesOf(consist.kind, cars)[0]!;
    let seat = 0;
    while (passengerOn(ride, car, seat)) seat++;
    check(seat < SEATS_PER_CAR, 'a carriage has a free seat', `seat ${seat} of car ${car}`);
    const frame = emptyCarFrame();
    const local = new Vector3();
    const root = new Vector3();
    const last = new Vector3();
    const lastZ = new Vector3();
    const state: TrainState = { head: 0, direction: 1, speed: 0, standing: true };
    let outside = 0;
    let jumps = 0;
    let turned = 0;
    let reachedB = false;
    let leftB = false;
    let alightAt = 0;
    callAt(length, cars, phase, boardAt, 0, call);
    const tripEnd = boardAt + call.departs + 2 * timetableTravel(length, cars) + 3 * DWELL;
    for (let t = boardAt, k = 0; t < tripEnd; t += 0.1, k++) {
      trainAt(length, cars, phase, t, state);
      carFrame(network, ride, state, cars, car, frame);
      inCar(frame, seatRoot(seat, local), root);
      if (!insideCarriage(toCar(frame, root, local))) outside++;
      if (k > 0 && root.distanceTo(last) > TRAIN_SPEED * 0.1 + 0.05) jumps++;
      if (k > 0 && frame.z.dot(lastZ) < 0.9) turned++;
      last.copy(root);
      lastZ.copy(frame.z);
      const atB = state.standing && state.direction < 0;
      if (atB && !reachedB) {
        reachedB = true;
        alightAt = t;
      }
      if (reachedB && !state.standing) leftB = true;
    }
    check(reachedB && leftB, 'the ride reaches the far station and runs on back', `${(tripEnd - boardAt).toFixed(0)} s`);
    check(outside === 0, 'a rider stays in the carriage the whole way', `${outside} steps outside`);
    check(jumps === 0 && turned === 0, 'and moves with it smoothly, never turned round at a terminus', `${jumps} jumps, ${turned} turns`);
    // Get off at B: beside the carriage on the platform, which stands to be stood on.
    trainAt(length, cars, phase, alightAt, state);
    const station = lineStation(line, 1, places, emptyStation());
    const z = Math.min(PLATFORM_FROM + PLATFORM_LENGTH - 2, Math.max(PLATFORM_FROM + 2, length - carMiddle(state, cars, car)));
    const spot = stationPoint(station, PLATFORM_INNER + 0.9, z, new Vector3());
    const level = network.crown(ride).levelB;
    const eyeB = spot.clone().multiplyScalar(level + 30);
    const cameraB = new PerspectiveCamera(45, 1.6, 1, 50000);
    cameraB.position.copy(eyeB);
    cameraB.up.copy(spot);
    cameraB.lookAt(spot.clone().multiplyScalar(level));
    cameraB.updateMatrixWorld(true);
    for (let k = 0; k < 30; k++) railway.update({ dt: 0.5, seconds: alightAt + k * 0.01, camera: cameraB, player: spot.clone().multiplyScalar(level), fogFar: 1400 });
    const deck = spot.clone().multiplyScalar(level + PLATFORM_RISE);
    const hit = railway.platformAt(deck);
    check(hit !== null && hit.line === ride && hit.end === 1, 'getting off puts the rider on that station\'s platform', hit === null ? 'off it' : `line ${hit.line}, end ${hit.end}, ${hit.x.toFixed(1)} out`);
    check(Math.abs(railway.bedHeightAt(deck) - (level + PLATFORM_RISE)) < 0.01, 'and the platform is underfoot there');
    // The carriage: drawn round a rider whose eye is in it, the shell hidden, the cabin contract kept.
    railway.setRider({ line: ride, car, seat });
    // The seated eye over the seat's root: `SIT_EYE` of a body.
    const seatedEye = new Vector3();
    carFrame(network, ride, state, cars, car, frame);
    inCar(frame, local.copy(seatRoot(seat, local)).setY(CARRIAGE.floor + 2.7), seatedEye);
    cameraB.position.copy(seatedEye);
    cameraB.up.copy(frame.y);
    cameraB.lookAt(seatedEye.clone().add(frame.z));
    cameraB.updateMatrixWorld(true);
    railway.update({ dt: 0.016, seconds: alightAt + 0.3, camera: cameraB, player: seatedEye, fogFar: 1400 });
    const carriage = railway.group.getObjectByName('carriage');
    check(carriage !== undefined && railway.eyeInside && carriage.visible, 'a rider\'s carriage stands round the seated eye');
    if (carriage !== undefined) {
      const glass = carriage.getObjectByName('glass') as InstanceType<typeof Mesh>;
      const cabin = carriage.getObjectByName('cabin') as InstanceType<typeof Mesh>;
      const faults = glassFaults(glass);
      check(faults.length === 0, 'its windows are the cabin contract\'s glass', faults.join('; '));
      check(carriage.parent !== null && !(carriage.parent.children.find((c) => c !== carriage) as InstanceType<typeof Mesh>).visible, 'and the car\'s own shell is hidden while the eye is in it');
      carriage.updateMatrixWorld(true);
      const probe = probeOfMeshes([cabin, glass], carriage);
      const eyeLocal = carriage.worldToLocal(seatedEye.clone());
      let escaped = 0;
      const rays = 400;
      for (let i = 0; i < rays; i++) {
        const y = 1 - (2 * (i + 0.5)) / rays;
        const r = Math.sqrt(1 - y * y);
        const a = Math.PI * (3 - Math.sqrt(5)) * i;
        if (!Number.isFinite(probe.cast(eyeLocal.x, eyeLocal.y, eyeLocal.z, Math.cos(a) * r, y, Math.sin(a) * r))) escaped++;
      }
      check(escaped === 0, 'and it is closed: from the seat every way meets the lining or a pane', `${escaped} of ${rays} rays out`);
      let improper = 0;
      carriage.traverse((part) => {
        if (part.matrixWorld.determinant() <= 0) improper++;
      });
      check(improper === 0, 'every part of it is placed by a proper rotation');
    }
    railway.setRider(null);
    railway.update({ dt: 0.016, seconds: alightAt + 0.4, camera: cameraB, player: seatedEye, fogFar: 1400 });
    check(railway.group.getObjectByName('carriage') === undefined, 'getting off takes the carriage away');
  }
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
