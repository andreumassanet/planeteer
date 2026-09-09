/**
 * Headless assertions over `src/life.ts` — everything that moves.
 *
 * **A movement bug is a number, not a picture.** Whether a car stays on its own
 * road, whether a boat's whole lap is wet, whether a walker's feet track the
 * ground across a coastal ramp, whether the same seed and the same clock produce
 * the same world twice: every one of those is invisible in a screenshot and
 * exact in a table. This is the file that says so, and it is why `src/life.ts`
 * deliberately imports no registry — `import.meta.glob` is a Vite transform, and
 * a module that reaches for one cannot be run in Node at all.
 *
 * The vehicle registry is read off disk here, the same trick `check-traffic.ts`
 * and `build-monuments.ts` use, and handed in.
 *
 *   node scripts/check-life.ts     (or `pnpm life`)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PerspectiveCamera, Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { detailRadiusFor, indexPlaces, radiusFor } from '../src/places.ts';
import { ROAD_CLASSES, placeDirection, roadPoint, roadPole } from '../src/roads.ts';
import type { Road } from '../src/roads.ts';
import { decodePlaces, decodeRoads, inflate } from '../src/pack.ts';
import { createLife, emptyFrame, mergeGroup, poseAt, rigOf, roadFrameOf } from '../src/life.ts';
import { setDetail } from '../src/view.ts';
import { PLACED_LENGTH_CAP, PLACED_SECTION, placedSize } from '../src/traffic/contract.ts';
import type { Vehicle } from '../src/traffic/contract.ts';

const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const DEG = Math.PI / 180;
const dirAt = (lat: number, lon: number): Vector3 =>
  new Vector3(
    Math.cos(lat * DEG) * Math.cos(lon * DEG),
    Math.sin(lat * DEG),
    -Math.cos(lat * DEG) * Math.sin(lon * DEG),
  );

// --- the world ------------------------------------------------------------

const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
// The lakes are a second file and the stub has to know which one is being
// asked for. It used to answer every URL with the outlines, which was fine
// while there was one; handing `decodeLakes` the outlines throws on the magic
// rather than misreading them, which is the whole reason the format carries it.
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

const monumentsPath = resolve(here, '../public/data/monuments.json');
const monuments: { lat: number; lon: number; footprint?: number; clearance?: number }[] = existsSync(monumentsPath)
  ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: typeof monuments }).monuments
  : [];
setFlattenSites(monuments as never);

const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
setDetailSites(placesRaw.map((p) => ({ lat: p.lat, lon: p.lon, radius: detailRadiusFor(p.pop) })));

const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const places = indexPlaces(placesRaw, 0).all;

const roadsRaw = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
const roads: Road[] = roadsRaw.places === places.length ? roadsRaw.roads : [];
if (roads.length === 0 && roadsRaw.roads.length > 0) {
  // The runtime refuses outright — a road baked against a different list of
  // places joins two arbitrary towns. Here it is a skipped section rather than
  // a crash, so the rest of the file still says something.
  console.log(`  roads.json was baked against ${roadsRaw.places} places and there are ${places.length}. Run \`pnpm roads\`.`);
  failures++;
}
console.log(`world: ${places.length} places, ${roads.length} roads\n`);

// --- the vehicle registry, off disk ---------------------------------------

const PARTS = resolve(here, '../src/traffic/parts');
const vehicles: Vehicle[] = [];
for (const file of readdirSync(PARTS).filter((name) => name.endsWith('.ts')).sort()) {
  const module = (await import(pathToFileURL(resolve(PARTS, file)).href)) as Record<string, unknown>;
  for (const value of Object.values(module)) {
    if (typeof value === 'object' && value !== null && typeof (value as Vehicle).build === 'function') {
      vehicles.push(value as Vehicle);
    }
  }
}

// --- placed scale ---------------------------------------------------------
//
// The kit is authored at `SCENERY_SCALE` and placed at twice it, cropped in
// length past `PLACED_LENGTH_CAP`. Both halves of that are checked here rather
// than in `check-traffic.ts`, which is about the kit as authored.

console.log('placed scale:');
// `air` is exempt from the placed scale — a balloon's size is not decided by
// the person in the basket — so the cap is a road-and-water rule.
const grounded = vehicles.filter((entry) => entry.kind !== 'air');
const byLength = [...grounded].sort((a, b) => placedSize(a)[0] - placedSize(b)[0]);
let cropped = 0;
for (const entry of byLength) {
  const size = placedSize(entry);
  if (size[0] > PLACED_LENGTH_CAP + 1e-6) failures++;
  if (entry.size[0] * PLACED_SECTION > PLACED_LENGTH_CAP + 1e-6) cropped++;
}
console.log(
  `  ${grounded.length} vehicles, longest placed ${placedSize(byLength.at(-1)!)[0].toFixed(1)}, ` +
  `${cropped} cropped by the ${PLACED_LENGTH_CAP}-unit cap`,
);
check(
  byLength.every((entry) => placedSize(entry)[0] <= PLACED_LENGTH_CAP + 1e-6),
  'no placed vehicle is longer than the cap',
);
// A car roof at the avatar's chest is the whole reason the section doubled.
const hatchback = vehicles.find((entry) => entry.id === 'hatchback');
check(
  hatchback !== undefined && Math.abs(placedSize(hatchback)[2] - 4.26) < 0.02,
  'a placed hatchback is 4.26 tall, which is the avatar\'s chest (4.44)',
  hatchback ? placedSize(hatchback).map((n) => n.toFixed(2)).join(' x ') : '',
);
// And the roads were widened to take it: two of them give way on a lane and
// pass on a road, which is the difference those classes exist to draw.
if (hatchback !== undefined) {
  const width = placedSize(hatchback)[1];
  check(width + 0.4 <= ROAD_CLASSES[0]!.width, 'a placed car fits a lane', `${width.toFixed(2)} in ${ROAD_CLASSES[0]!.width}`);
  check(width * 2 + 0.6 > ROAD_CLASSES[0]!.width, 'two do not pass on a lane', `${(width * 2 + 0.6).toFixed(2)} in ${ROAD_CLASSES[0]!.width}`);
  check(width * 2 + 0.6 <= ROAD_CLASSES[1]!.width, 'two pass on a road', `${(width * 2 + 0.6).toFixed(2)} in ${ROAD_CLASSES[1]!.width}`);
}
console.log('');

// --- the walk -------------------------------------------------------------
//
// `life.ts` copies one line out of `avatar.ts` — the knee's driver — because
// `avatar.ts` does not export it. This is what pays for that: the failure a
// wrong driver produces is a foot through the floor, and it is one number.

const life = createLife(world, places, { roads, vehicles });
const walk = life.verify();
console.log('the walk cycle:');
console.log(`  ${walk.bodies} bodies x ${walk.phases} phases, worst dip below the floor ${walk.worstDip.toFixed(4)}`);
check(walk.worstDip > -0.01, 'no foot ever leaves the floor by more than a hundredth of a unit');
console.log('');

// --- streaming, at real places --------------------------------------------

interface Spot { name: string; lat: number; lon: number; altitude: number }
const spots: Spot[] = [
  { name: 'Ulm, the densest neighbourhood', lat: 48.4, lon: 9.99, altitude: 3 },
  { name: 'Palma, a coast', lat: 39.57, lon: 2.65, altitude: 3 },
  { name: 'Tokyo', lat: 35.69, lon: 139.69, altitude: 3 },
  { name: 'Bamako', lat: 12.65, lon: -8, altitude: 3 },
  { name: 'the Atlantic, 400 km out', lat: 43, lon: -14, altitude: 3 },
  { name: 'the Sahara, nothing near', lat: 23, lon: 12, altitude: 3 },
  { name: 'Ulm at 900 up', lat: 48.4, lon: 9.99, altitude: 900 },
  { name: 'Ulm at 3,000 up', lat: 48.4, lon: 9.99, altitude: 3000 },
];

/** A camera looking along the ground from a standpoint, as the game builds one. */
function cameraAt(dir: Vector3, altitude: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(55, 16 / 9, 1, 1e6);
  const up = dir.clone().normalize();
  const north = new Vector3(0, 1, 0).projectOnPlane(up).normalize();
  camera.position.copy(up).multiplyScalar(PLANET_RADIUS + altitude + 15);
  camera.lookAt(camera.position.clone().addScaledVector(north, 400).addScaledVector(up, -60));
  camera.updateMatrixWorld(true);
  return camera;
}

function run(spot: Spot, detail: number, clock: number, frames = 4): ReturnType<typeof createLife>['stats'] {
  setDetail(detail);
  const dir = dirAt(spot.lat, spot.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + spot.altitude);
  const camera = cameraAt(dir, spot.altitude);
  for (let i = 0; i < frames; i++) life.update(viewer, spot.altitude, camera, clock + i * 0.016);
  return life.stats;
}

console.log('what is standing, at detail 1:');
console.log('  place                              road  foot  water  birds   meshes   tris     pool MB');
for (const spot of spots) {
  const stats = run(spot, 1, 1_000_000);
  console.log(
    `  ${spot.name.padEnd(33)}${String(stats.road).padStart(4)}` +
    `${String(stats.foot).padStart(6)}${String(stats.water).padStart(7)}${String(stats.birds).padStart(7)}` +
    `${String(stats.meshes).padStart(9)}${stats.triangles.toLocaleString().padStart(8)}` +
    `${stats.megabytes.toFixed(1).padStart(9)}`,
  );
}
console.log('');

// The pool fills over frames under a build budget, so a settled count needs a
// few more of them than a single update gives.
console.log('the same three places at 0.5, 1 and 3, settled:');
console.log('  place                     detail   road  foot  water  birds   meshes    tris');
for (const spot of spots.slice(0, 3)) {
  for (const detail of [0.5, 1, 3]) {
    const stats = run(spot, detail, 1_000_000, 40);
    console.log(
      `  ${spot.name.padEnd(26)}${String(detail).padStart(5)}${String(stats.road).padStart(7)}` +
      `${String(stats.foot).padStart(6)}${String(stats.water).padStart(7)}${String(stats.birds).padStart(7)}` +
      `${String(stats.meshes).padStart(9)}${stats.triangles.toLocaleString().padStart(8)}`,
    );
  }
}
console.log('');

// --- what a scan costs ----------------------------------------------------
//
// **A mover moves, so the cast has to be re-derived on a timer as well as on
// movement** — see `RESCAN_MS` — and a timed cost is a cost you pay for ever.
// This is the number that decides whether the timer is affordable.

console.log('re-deriving the cast:');
{
  setDetail(1);
  const worst: [string, number][] = [];
  for (const at of spots.slice(0, 6)) {
    const dir = dirAt(at.lat, at.lon);
    const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + at.altitude);
    const camera = cameraAt(dir, at.altitude);
    // Warm the caches the way standing there for a second does.
    for (let i = 0; i < 30; i++) life.update(viewer, at.altitude, camera, 1_000_000 + i);
    // And then force the scan, which is the thing being measured: stepping the
    // viewer past `RESCAN_MOVE` is what the timer does every 700 ms anyway.
    // **The median and not the worst**, and that is not a softer test. This
    // machine runs several agents and two dev servers at once, and a process
    // descheduled mid-scan reads as a 10 ms scan: measured over three runs, the
    // *Sahara* — where the scan admits nothing at all and does about 0.2 ms of
    // real work — came back at 2.3, 3.4 and 4.4 ms. A worst-of-twelve on a
    // loaded machine measures the machine. The median is what the frame will
    // actually see and is stable across runs.
    const times: number[] = [];
    let scan = 0;
    let build = 0;
    const north = new Vector3(0, 1, 0).projectOnPlane(dir).normalize();
    for (let i = 0; i < 21; i++) {
      const moved = viewer.clone().addScaledVector(north, (i % 2 === 0 ? 1 : -1) * 120);
      const began = performance.now();
      life.update(moved, at.altitude, camera, 1_000_000 + i * 4);
      times.push(performance.now() - began);
      scan = Math.max(scan, life.stats.lastScanMs);
      build = Math.max(build, life.stats.lastBuildMs);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)]!;
    const slowest = times.at(-1)!;
    worst.push([at.name, median]);
    console.log(
      `  ${at.name.padEnd(33)} median update ${median.toFixed(2)} ms, worst ${slowest.toFixed(2)} ` +
      `(worst scan ${scan.toFixed(2)}, worst build ${build.toFixed(2)})`,
    );
  }
  const over = worst.filter(([, ms]) => ms > 4);
  check(over.length === 0, 'the median update costs under 4 ms, scan and all', over.map(([n, ms]) => `${n} ${ms.toFixed(1)}`).join(', '));
}
console.log('');

// --- the routes -----------------------------------------------------------
//
// Everything below reads the route mathematics directly rather than the
// streamer, because what has to be true is a property of the curve: a car on
// its own road, a boat on water, a walker on the ground.

console.log('the routes:');

const endA = new Vector3();
const endB = new Vector3();
const pole = new Vector3();
const onCurve = new Vector3();
const probe = emptyFrame();

/**
 * How far a lateral offset actually lands from the road's own centreline.
 *
 * A car is placed by stepping `lateral / PLANET_RADIUS` along `up x forward`
 * from the curve and re-normalising, which is a chord and not an arc — so the
 * question is whether the error is anything at the widths a road uses. It is
 * `r(1 - cos(theta))` and theta is 9 units of 16,000.
 */
let worstLateral = 0;
let worstWet = 0;
let sampled = 0;
for (let i = 0; i < roads.length; i += 137) {
  const road = roads[i]!;
  placeDirection(places[road.a]!, endA);
  placeDirection(places[road.b]!, endB);
  roadPole(endA, endB, pole);
  const width = ROAD_CLASSES[road.cls]!.width;
  const lateral = width * 0.26;
  for (let s = 0; s <= 10; s++) {
    const t = s / 10;
    roadPoint(endA, endB, road.bend, t, onCurve, pole);
    // The real function, not a copy of it: `roadFrameOf` is what a vehicle
    // drives on, and a check written against a second copy of the curve would
    // agree with itself the way every mirrored basis in this project has.
    roadFrameOf(endA, endB, road.bend, t, lateral, probe);
    const measured = probe.dir.angleTo(onCurve) * PLANET_RADIUS;
    worstLateral = Math.max(worstLateral, Math.abs(measured - lateral));
    if (world.elevationAt(probe.dir) <= 0) worstWet++;
    sampled++;
  }
}
check(worstLateral < 0.01, 'a lane offset lands where it was asked to', `worst error ${worstLateral.toFixed(5)} units over ${sampled} samples`);
console.log(`  ${worstWet} of ${sampled} sampled road positions are over water (${((worstWet / sampled) * 100).toFixed(2)}%)`);
// A road is baked never to cross the sea, but a vehicle sits a quarter of a
// carriageway off the centreline and the check is what says that still holds.
check(worstWet / sampled < 0.01, 'a vehicle on the verge is on land, over the whole network');

/**
 * The ground under a walker, sampled along a coastal road at the rate the clock
 * actually moves him.
 *
 * The shore is a ramp now and `reliefAt` goes to -16, so the question is not
 * whether the ground moves but whether it moves smoothly enough that a figure
 * placed on it does not visibly step. `STEP_DOWN` in `player.ts` is
 * `LAND_HEIGHT * 0.5` = 10, which is the line the *player* is held to.
 */
let worstStep = 0;
let steps = 0;
for (let i = 0; i < roads.length; i += 613) {
  const road = roads[i]!;
  placeDirection(places[road.a]!, endA);
  placeDirection(places[road.b]!, endB);
  roadPole(endA, endB, pole);
  const length = endA.angleTo(endB) * PLANET_RADIUS;
  if (length < 40) continue;
  // 45 units a second at 60 fps is 0.75 units a frame.
  const dt = 0.75 / length;
  let previous: number | null = null;
  for (let t = 0; t <= 1; t += dt) {
    roadPoint(endA, endB, road.bend, t, onCurve, pole);
    const elevation = world.elevationAt(onCurve);
    if (elevation <= 0) { previous = null; continue; }
    if (previous !== null) {
      worstStep = Math.max(worstStep, Math.abs(elevation - previous));
      steps++;
    }
    previous = elevation;
  }
}
check(worstStep < 3, 'the ground under a walker never steps more than three units in a frame', `worst ${worstStep.toFixed(2)} over ${steps.toLocaleString()} frames`);

console.log('');

// --- one second of the clock ----------------------------------------------
//
// **The one thing a still frame cannot show, as a table.** Everything here is a
// pure function of the clock, so a second of it is a displacement, and each
// family has a speed it is supposed to have. The walker also has to swap the
// geometry it is drawn from — a rigid body sliding along the ground is the
// moonwalk `people.ts` warned about, and this is the assertion that it is not
// happening.

console.log('what one second of the clock moves:');
{
  setDetail(1);
  const at = spots[1]!;
  const dir = dirAt(at.lat, at.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + at.altitude);
  const camera = cameraAt(dir, at.altitude);
  for (let i = 0; i < 60; i++) life.update(viewer, at.altitude, camera, 3_000_000);
  const snap = (): Map<string, { p: Vector3; g: string }> => {
    const map = new Map<string, { p: Vector3; g: string }>();
    for (const child of life.group.children) {
      if (!child.visible || child.name === 'birds') continue;
      map.set(child.name, { p: child.position.clone(), g: (child as { geometry: { uuid: string } }).geometry.uuid });
    }
    return map;
  };
  /**
   * **The median of five short steps, and one displacement over a tenth of a
   * second is what it replaces.** A route is out and back, so at each end the
   * mover reverses *and crosses to the other side of the carriageway* — see
   * `chainFrame` — which is a real jump of twice its lateral offset, up to
   * about ten units on a lane. Divide that by a tenth of a second and it reads
   * as ninety units a second for a walker whose speed is forty. It is a
   * sampling artefact of the window, and the window alone decides whether it is
   * seen:
   *
   * ```
   *   window    foot movers
   *   0.5 s     5.4 to 40.4    the turn averaged away again
   *   0.1 s    31.4 to 74.2    one mover happened to turn inside it
   *   0.02 s   31.4 to 43.3
   *   0.004 s  31.4 to 43.3    the speed, with nothing else in it
   * ```
   *
   * So this is not a threshold that wants widening. Five steps of 0.02 s and
   * the median of each mover's five: a mover turns at most once in a tenth of a
   * second, so at most one of its five samples carries the jump and the median
   * cannot be it. What the bands then assert is the speed the tables set, which
   * is what they say.
   */
  const SPEED_STEP = 0.02;
  const SPEED_STEPS = 5;
  const moved = new Map<string, number[]>();
  {
    life.update(viewer, at.altitude, camera, 3_000_000);
    let previous = snap();
    const track = new Map<string, number[]>();
    for (let step = 1; step <= SPEED_STEPS; step++) {
      life.update(viewer, at.altitude, camera, 3_000_000 + step * SPEED_STEP);
      const now = snap();
      for (const [name, was] of previous) {
        const there = now.get(name);
        if (there === undefined) continue;
        const list = track.get(name) ?? [];
        list.push(was.p.distanceTo(there.p) / SPEED_STEP);
        track.set(name, list);
      }
      previous = now;
    }
    for (const [name, list] of track) {
      if (list.length < SPEED_STEPS) continue;
      list.sort((x, y) => x - y);
      const family = name.split(':')[0]!;
      if (!moved.has(family)) moved.set(family, []);
      moved.get(family)!.push(list[list.length >> 1]!);
    }
  }

  // A tenth of a second, not a whole one: a walker at 45 units a second covers
  // two full stride cycles in a second and can land back in the pose he
  // started from, which is an artefact of the sample rate and not a still
  // walker.
  life.update(viewer, at.altitude, camera, 3_000_000.2);
  const before = snap();
  life.update(viewer, at.altitude, camera, 3_000_000.3);
  const after = snap();
  let swapped = 0;
  let walkers = 0;
  for (const [name, was] of before) {
    const now = after.get(name);
    if (now === undefined) continue;
    if (name.split(':')[0] === 'foot') {
      walkers++;
      if (was.g !== now.g) swapped++;
    }
  }
  // The bands are the speed tables with the short-route cap under them: a chain
  // that cannot reach `MIN_ROUTE` is travelled in `MIN_SECONDS` instead, so the
  // floor is not the class speed. The ceiling is the class speed plus what is
  // left of the bow's ripple, which `arcParameter` took from 15% to 3%.
  const wanted: Record<string, [number, number]> = {
    road: [10, 260], foot: [4, 70], water: [22, 46],
  };
  for (const [family, list] of moved) {
    list.sort((a, b) => a - b);
    const low = list[0] ?? 0;
    const high = list.at(-1) ?? 0;
    const band = wanted[family];
    console.log(`  ${family.padEnd(6)} ${String(list.length).padStart(3)} movers, ${low.toFixed(1)} to ${high.toFixed(1)} units a second`);
    if (band !== undefined) {
      check(list.length > 0 && low >= band[0] && high <= band[1], `a ${family} mover travels ${band[0]} to ${band[1]} units a second`);
    }
  }
  console.log(`  ${swapped} of ${walkers} walkers took a new pose in a tenth of a second`);
  check(walkers === 0 || swapped >= walkers - 1, 'a walker takes a new pose within a tenth of a second, so nothing moonwalks');
}
console.log('');

// --- a whole day at 600x --------------------------------------------------
//
// `atlas.sky.setRate(600)` runs ten minutes a second, and every mover here is a
// pure function of that clock. A day is 86,400 seconds of it, and the thing
// worth asserting is that nothing in the arithmetic drifts, wraps wrong or goes
// to NaN when the number gets large.

console.log('a day of movement, run at 600x:');
const dayStart = Date.now();
const spot = spots[0]!;
setDetail(1);
const dayDir = dirAt(spot.lat, spot.lon);
const dayViewer = dayDir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dayDir)) + 3);
const dayCamera = cameraAt(dayDir, 3);
let finite = true;
let seenPositions = 0;
const seenKeys = new Set<string>();
for (let second = 0; second < 86_400; second += 60) {
  life.update(dayViewer, 3, dayCamera, 1_000_000 + second);
  for (const child of life.group.children) {
    if (!child.visible) continue;
    // The flock is one mesh for the whole sky and its vertices carry the
    // positions, so the object itself sits at the origin. It is checked below.
    if (child.name === 'birds') continue;
    seenPositions++;
    if (!Number.isFinite(child.position.x + child.position.y + child.position.z)) finite = false;
    if (Math.abs(child.position.length() - PLANET_RADIUS) > 900) finite = false;
    seenKeys.add(child.name);
  }
}
check(finite, 'every mover stays finite and on the planet over a whole day', `${seenPositions.toLocaleString()} placements, ${seenKeys.size} distinct movers`);
console.log(`  ${((Date.now() - dayStart) / 1000).toFixed(1)} s for 1,440 updates`);
console.log('');

// --- determinism ----------------------------------------------------------
//
// Two worlds, same seed, same clock. The same shape of check `pnpm people` and
// the traffic sheet already make, one level up: not "does one body rebuild the
// same" but "does the whole cast".

console.log('determinism:');
function census(instance: ReturnType<typeof createLife>, at: Spot, clock: number): string {
  setDetail(1);
  const dir = dirAt(at.lat, at.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + at.altitude);
  const camera = cameraAt(dir, at.altitude);
  for (let i = 0; i < 40; i++) instance.update(viewer, at.altitude, camera, clock);
  const rows: string[] = [];
  for (const child of instance.group.children) {
    if (!child.visible) continue;
    if (child.name === 'birds') {
      // One mesh for the whole sky, so its identity is its buffer.
      const mesh = child as unknown as { geometry: { drawRange: { count: number }; attributes: { position: { array: Float32Array } } } };
      const count = mesh.geometry.drawRange.count * 3;
      let sum = 0;
      for (let i = 0; i < count; i++) sum = (sum * 31 + Math.round(mesh.geometry.attributes.position.array[i]! * 64)) % 1e12;
      rows.push(`birds@${count}:${sum}`);
      continue;
    }
    rows.push(
      `${child.name}@${child.position.x.toFixed(3)},${child.position.y.toFixed(3)},${child.position.z.toFixed(3)}` +
      `/${child.quaternion.x.toFixed(4)},${child.quaternion.y.toFixed(4)},${child.quaternion.z.toFixed(4)},${child.quaternion.w.toFixed(4)}`,
    );
  }
  rows.sort();
  return rows.join('|');
}
const first = createLife(world, places, { roads, vehicles });
const second = createLife(world, places, { roads, vehicles });
let same = 0;
let differ = 0;
for (const at of spots.slice(0, 4)) {
  const a = census(first, at, 1_234_567);
  const b = census(second, at, 1_234_567);
  if (a === b && a.length > 0) same++;
  else differ++;
  if (a !== b) console.log(`  differs at ${at.name}`);
}
check(differ === 0 && same === 4, 'two worlds at the same instant are the same world', `${same} of 4 places identical`);

// And the same instant reached two different ways: jumped straight to, or
// arrived at after a day of updates. Nothing integrates, so **every mover the
// two have in common has to be in exactly the same place.**
//
// The two casts are *not* the same set and that is correct rather than a
// failure: admission depends on where a mover was when the scan ran, and one
// world scanned a day earlier. What would be a bug is a shared mover in two
// different places, which is what integrating state instead of evaluating it
// looks like.
const jumped = new Map(census(createLife(world, places, { roads, vehicles }), spots[0]!, 2_000_000).split('|').map((row) => [row.split('@')[0]!, row]));
const walked = (() => {
  const instance = createLife(world, places, { roads, vehicles });
  const dir = dirAt(spots[0]!.lat, spots[0]!.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + 3);
  const camera = cameraAt(dir, 3);
  for (let s = 0; s < 86_400; s += 900) instance.update(viewer, 3, camera, 2_000_000 - 86_400 + s);
  return new Map(census(instance, spots[0]!, 2_000_000).split('|').map((row) => [row.split('@')[0]!, row]));
})();
let shared = 0;
let apart = 0;
for (const [key, row] of jumped) {
  const other = walked.get(key);
  if (other === undefined) continue;
  shared++;
  if (other !== row) apart++;
}
check(shared > 4 && apart === 0, 'a mover arrived at by a day of frames is where a cold start puts it', `${shared} shared, ${apart} apart`);
console.log('');

// --- the merge ------------------------------------------------------------
//
// `mergeGroup` bakes the placed scale into the vertices, and the reason it is
// the inverse transpose and not the rotation is a bus scaled 2 x 2 x 1.35.

console.log('the merge:');
const bus = vehicles.find((entry) => entry.id === 'city-bus');
if (bus !== undefined) {
  const { createTrafficContext } = await import('../src/traffic/contract.ts');
  const { rngFrom } = await import('../src/scenery/random.ts');
  const ctx = createTrafficContext();
  const built = bus.build(ctx, rngFrom(bus.id, 'check', 0), (await import('../src/traffic/regions.ts')).TRAFFIC_STYLES['atlantic-europe']!);
  const plain = mergeGroup(built);
  built.scale.set(PLACED_SECTION, PLACED_SECTION, PLACED_LENGTH_CAP / bus.size[0]);
  const scaled = mergeGroup(built);
  let worstNormal = 0;
  for (let i = 0; i < scaled.normal.length; i += 3) {
    const length = Math.hypot(scaled.normal[i]!, scaled.normal[i + 1]!, scaled.normal[i + 2]!);
    worstNormal = Math.max(worstNormal, Math.abs(length - 1));
  }
  check(worstNormal < 1e-5, 'every normal of a non-uniformly scaled merge is still unit', `worst ${worstNormal.toExponential(1)}`);
  check(plain.triangles === scaled.triangles, 'scaling changes no triangle count', `${scaled.triangles}`);
  // The bounding box has to be the declared placed size, which is the whole
  // contract a placer reads.
  let minZ = Infinity, maxZ = -Infinity, minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < scaled.position.length; i += 3) {
    minZ = Math.min(minZ, scaled.position[i + 2]!);
    maxZ = Math.max(maxZ, scaled.position[i + 2]!);
    minX = Math.min(minX, scaled.position[i]!);
    maxX = Math.max(maxX, scaled.position[i]!);
    maxY = Math.max(maxY, scaled.position[i + 1]!);
  }
  const size = placedSize(bus);
  check(Math.abs(maxZ - minZ - size[0]) < 0.4, 'a placed bus is as long as it says', `${(maxZ - minZ).toFixed(2)} against ${size[0].toFixed(2)}`);
  check(Math.abs(maxX - minX - size[1]) < 0.4, 'and as wide', `${(maxX - minX).toFixed(2)} against ${size[1].toFixed(2)}`);
  check(Math.abs(maxY - size[2]) < 0.4, 'and as tall', `${maxY.toFixed(2)} against ${size[2].toFixed(2)}`);
}
console.log('');

// --- the rig --------------------------------------------------------------
//
// `rigOf` finds the joints of a body `people.ts` built and never named. It
// throws when the structure moves, which is the point, but a check that only
// says "it did not throw" would pass on a rig where the elbow and the hip had
// swapped. So the joints are moved and the effect is measured.

console.log('the rig:');
{
  const { createSceneryContext } = await import('../src/scenery/contract.ts');
  const { buildPerson } = await import('../src/scenery/people.ts');
  const { lookFor } = await import('../src/scenery/dress.ts');
  const { rngFrom } = await import('../src/scenery/random.ts');
  const ctx = createSceneryContext();
  const person = buildPerson(ctx, lookFor(rngFrom('rig', 'check'), 'atlantic-europe', { pose: 'walk' }));
  const rig = rigOf(person);
  const before = mergeGroup(person);
  // Swing one hip by a radian. Only the leg on that side may move, and it has
  // to move by about a leg length.
  rig.hips[0]!.rotation.x = 1;
  person.updateMatrixWorld(true);
  const after = mergeGroup(person);
  let moved = 0;
  let worst = 0;
  for (let i = 0; i < before.position.length; i += 3) {
    const d = Math.hypot(
      after.position[i]! - before.position[i]!,
      after.position[i + 1]! - before.position[i + 1]!,
      after.position[i + 2]! - before.position[i + 2]!,
    );
    if (d > 0.01) moved++;
    worst = Math.max(worst, d);
  }
  const share = moved / (before.position.length / 3);
  check(share > 0.08 && share < 0.35, 'swinging one hip moves one leg and nothing else', `${(share * 100).toFixed(1)}% of vertices`);
  check(worst > 1.5 && worst < 4, 'and moves it about a leg length', `${worst.toFixed(2)} units`);

  // The bob is the re-seat, and it has to be there: a walk with a flat head is
  // a person on rails.
  let low = Infinity;
  let high = -Infinity;
  for (let phase = 0; phase < 64; phase++) {
    poseAt(rig, (phase / 64) * Math.PI * 2, 0);
    person.updateMatrixWorld(true);
    const merged = mergeGroup(person);
    let crown = -Infinity;
    for (let i = 1; i < merged.position.length; i += 3) crown = Math.max(crown, merged.position[i]!);
    low = Math.min(low, crown);
    high = Math.max(high, crown);
  }
  check(high - low > 0.05 && high - low < 0.6, 'the head bobs over a cycle', `${(high - low).toFixed(3)} units`);
}
console.log('');

console.log(failures === 0 ? 'all good' : `${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures === 0 ? 0 : 1);
