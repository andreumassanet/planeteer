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
import { BODY_SCALE } from '../src/stature.ts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PerspectiveCamera, Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { indexPlaces, radiusOf, terrainSiteOf } from '../src/places.ts';
import { ROAD_CLASSES, courseOf, coursePath, coursePoint, emptyCourse, parameterAt } from '../src/roads.ts';
import type { Road } from '../src/roads.ts';
import { decodePlaces, decodeRoads, inflate } from '../src/pack.ts';
import { createLife, emptyFrame, mergeGroup, poseAt, rigOf, roadFrameOf } from '../src/life.ts';
import { setDetail } from '../src/view.ts';
import { unitAt } from '../src/sphere.ts';
import { THROUGH_HALF_WIDTH, gatesOf, mainStreetHalf, onThroughRoad, townGrid } from '../src/scenery/grid.ts';
import { driveThrough, streetCost, streetPose } from '../src/through.ts';
import type { StreetPose } from '../src/through.ts';
import { PLACED_LENGTH_CAP, PLACED_SECTION, placedScale, placedSize } from '../src/traffic/contract.ts';
import { FIGURE } from '../src/avatar.ts';
import type { Vehicle } from '../src/traffic/contract.ts';
import { registerModelsFromDisk } from './kit-node.ts';

// The vehicles are baked CC0 models now (scripts/build-kit.ts): register them as main.ts does.
await registerModelsFromDisk();

const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const dirAt = (lat: number, lon: number): Vector3 => unitAt(lat, lon, new Vector3());

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
setDetailSites(placesRaw.map(terrainSiteOf));

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
// The kit is authored at `SCENERY_SCALE` and placed at `PLACED_SECTION` times
// it, cropped in length past `PLACED_LENGTH_CAP`. Both halves of that are checked here rather
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
// A car roof at a person's shoulder: 1.5 m against 1.75, which is where it is
// in life. Since 2026-09-24 a person is drawn at 1.7 times the world's scale
// and the kit placed at 1.35 times it (`PLACED_SECTION`), so the Kenney
// hatchback's roof is 2.57 against a chest at about 2.46 and a crown at 3.77:
// just over the chest, lower than life by the ratio of the two scales.
const hatchback = vehicles.find((entry) => entry.id === 'hatchback');
check(
  hatchback !== undefined && placedSize(hatchback)[2] > FIGURE.chestY && placedSize(hatchback)[2] < FIGURE.height,
  'a placed hatchback\'s roof is between a person\'s chest and crown',
  hatchback ? placedSize(hatchback).map((n) => n.toFixed(2)).join(' x ') : '',
);
// And every class is a two-lane road: two cars pass on the narrowest of them.
if (hatchback !== undefined) {
  const width = placedSize(hatchback)[1];
  const narrowest = Math.min(...ROAD_CLASSES.map((entry) => entry.width));
  check(width * 2 + 0.6 <= narrowest, 'two placed cars pass on every class of road', `${(width * 2 + 0.6).toFixed(2)} in ${narrowest}`);
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
    // **The median and not the worst**, and that is not a softer test. On a
    // loaded machine a process descheduled mid-scan reads as a 10 ms scan:
    // measured over three runs, the *Sahara* — where the scan admits nothing at
    // all and does about 0.2 ms of real work — came back at 2.3, 3.4 and 4.4
    // ms. A worst-of-twelve on a loaded machine measures the machine. The
    // median is what the frame will actually see and is stable across runs.
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

const onCurve = new Vector3();
const probe = emptyFrame();
const probeCourse = emptyCourse();

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
  const course = courseOf(road, places, probeCourse);
  const path = coursePath(course);
  const width = ROAD_CLASSES[road.cls]!.width;
  const lateral = width * 0.26;
  for (let s = 0; s <= 10; s++) {
    const along = (path.length * s) / 10;
    coursePoint(course, parameterAt(path, along), onCurve);
    // The real function, not a copy of it: `roadFrameOf` is what a vehicle
    // drives on, and a check written against a second copy of the curve would
    // agree with itself the way every mirrored basis in this project has.
    roadFrameOf(course, path, along, lateral, probe);
    const measured = probe.dir.angleTo(onCurve) * PLANET_RADIUS;
    worstLateral = Math.max(worstLateral, Math.abs(measured - lateral));
    // Over water only on its bridge, where it drives the deck.
    if (world.elevationAt(probe.dir) <= 0 && !(along > road.bridgeFrom && along < road.bridgeTo)) worstWet++;
    sampled++;
  }
}
check(worstLateral < 0.01, 'a lane offset lands where it was asked to', `worst error ${worstLateral.toFixed(5)} units over ${sampled} samples`);
console.log(`  ${worstWet} of ${sampled} sampled road positions are over water (${((worstWet / sampled) * 100).toFixed(2)}%)`);
// A road is baked never to cross the sea, but a vehicle sits a quarter of a
// carriageway off the centreline and the check is what says that still holds.
check(worstWet / sampled < 0.01, 'a vehicle on the verge is on land or a bridge, over the whole network');

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
  const course = courseOf(road, places, probeCourse);
  const path = coursePath(course);
  const length = path.length;
  if (length < 40) continue;
  // 0.75 units a step, measured along the path a mover actually reads: a frame
  // at 45 units a second and 60 fps, the walk's speed when this was written.
  // Since 2026-09-24 a mover goes from a walker's pace (`WALK_SPEED`, 6.5,
// spread down to about 4.5) to 50, 0.08 to 0.83 units a frame.
  let previous: number | null = null;
  for (let along = 0; along <= length; along += 0.75) {
    coursePoint(course, parameterAt(path, along), onCurve);
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

// --- through a town -------------------------------------------------------
//
// A car used to vanish at one gate of a town and appear at the next. Now it
// drives the main streets between them, and turns round in one where its
// route ends (`through.ts`) — so the plan of every drive is asserted against
// the square it is laid in: the car's whole width on the street paving, clear
// of every building plot, which a street band never is; inside the through
// carriageway the town keeps clear of parked cars and people once the lane
// change at the gate is done; and no jump anywhere along it. The heights are
// the standing town's floor, which only the browser has.

console.log('through a town:');
{
  const pose: StreetPose = { x: 0, z: 0, fx: 0, fz: 1, mx: 0, mz: 1 };
  const before: StreetPose = { x: 0, z: 0, fx: 0, fz: 1, mx: 0, mz: 1 };
  const LANE = 7.2 * 0.26;
  let drives = 0;
  let turns = 0;
  let samples = 0;
  let offPaving = 0;
  let offCarriage = 0;
  let worstJump = 0;
  let worstTurn = 0;
  let worstOut = 0;
  const regions = new Map<string, number>([['atlantic-europe', 9.75], ['mediterranean', 7.5], ['polar', 12]]);
  const seen = new Set<number>();
  for (let i = 0; i < roads.length && seen.size < 120; i += 41) {
    for (const town of [roads[i]!.a, roads[i]!.b]) {
      const radius = radiusOf(places[town]!);
      if (seen.has(radius)) continue;
      seen.add(radius);
      const grid = townGrid(radius);
      const gates = gatesOf(grid);
      for (const street of regions.values()) {
        const half = mainStreetHalf(grid, street);
        for (const side of [1, -1]) {
          for (let from = 0; from < gates.length; from++) {
            for (let to = 0; to < gates.length; to++) {
              const legs = driveThrough(grid, gates, from, to, half, LANE, side);
              if (legs === null) continue;
              if (from === to) turns++;
              else drives++;
              const cost = streetCost(legs);
              const steps = Math.ceil(cost / 0.25);
              for (const back of from === to ? [false] : [false, true]) {
                for (let k = 0; k <= steps; k++) {
                  streetPose(legs, (k / steps) * cost, back, pose);
                  if (k > 0) {
                    worstJump = Math.max(worstJump, Math.hypot(pose.x - before.x, pose.z - before.z));
                    worstTurn = Math.max(worstTurn, Math.acos(Math.max(-1, Math.min(1, pose.fx * before.fx + pose.fz * before.fz))));
                  }
                  Object.assign(before, pose);
                  samples++;
                  // The car's width, across the way it faces.
                  const blend = Math.abs(pose.x) > grid.half - 6.5 || Math.abs(pose.z) > grid.half - 6.5;
                  for (const across of [-THROUGH_HALF_WIDTH, 0, THROUGH_HALF_WIDTH]) {
                    const x = pose.x + pose.fz * across;
                    const z = pose.z - pose.fx * across;
                    worstOut = Math.max(worstOut, Math.max(Math.abs(x), Math.abs(z)) - grid.half);
                    // At the gate the lane changes from the road's to the
                    // street's, over `LANE_BLEND`: the centre line is what has
                    // to be on the paving there, and the car's width beyond it.
                    if (blend && across !== 0) continue;
                    const paving = Math.min(Math.abs(x), Math.abs(z)) <= half + 1e-6;
                    if (!paving) offPaving++;
                    else if (!blend && !onThroughRoad(x, z, half, 1e-6)) offCarriage++;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  console.log(
    `  ${seen.size} squares, ${drives} drives and ${turns} turns laid out, ${samples.toLocaleString()} samples; ` +
    `worst step ${worstJump.toFixed(2)} units in 0.25 of route, worst turn ${(worstTurn * 180 / Math.PI).toFixed(1)} degrees`,
  );
  check(drives > 0 && turns > 0, 'towns are driven through and turned round in');
  check(offPaving === 0, 'a vehicle in a town is on its street paving, never on a plot', `${offPaving} of ${samples} samples off it`);
  check(offCarriage === 0, 'and past the gate inside the carriageway the town keeps clear', `${offCarriage} outside it`);
  check(worstOut <= 1e-6, 'and never past the edge of the square', `worst ${worstOut.toFixed(3)} past it`);
  check(worstJump < 0.5 && worstTurn < 0.35, 'and never jumps or snaps round on the way',
    `${worstJump.toFixed(2)} units and ${(worstTurn * 180 / Math.PI).toFixed(1)} degrees in the worst quarter-unit of route`);

  // And driven: a world whose towns all stand, on a stand-in floor three
  // units over the ground, and a quarter of an hour of the clock at twenty
  // frames a second. Every vehicle drawn in two frames running has moved
  // along the ground no faster than a road allows and turned no faster than a
  // car can, in town or out of it. How high it rides in a town is the real
  // floor's, which the browser has and this does not.
  const floored = createLife(world, places, {
    roads, vehicles,
    streets: {
      floorAt: (direction) => PLANET_RADIUS + Math.max(0, world.elevationAt(direction)) + 3,
      blocked: () => false,
    },
  });
  setDetail(3);
  const spot = spots[0]!;
  const dir = dirAt(spot.lat, spot.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + spot.altitude);
  const was = new Map<string, { p: Vector3; q: Vector3 }>();
  const up = new Vector3();
  // The fastest a vehicle is asked to go: a trunk's 50 and its seeded spread
  // of 16% (`ROAD_SPEED` in `life.ts`).
  const ROAD_TOP = 50 * 1.16;
  let inTown = 0;
  let turning = 0;
  let driven = 0;
  let fastest = 0;
  let sharpest = 0;
  const STEP = 0.05;
  for (let frame = 0; frame < 900 * 20; frame += 1) {
    floored.update(viewer, spot.altitude, undefined, 4_000_000 + frame * STEP, STEP);
    inTown += floored.stats.inTown;
    driven += floored.stats.road;
    turning += floored.stats.turning;
    for (const child of floored.group.children) {
      if (!child.visible || !child.name.startsWith('road:')) continue;
      const facing = new Vector3(0, 0, 1).applyQuaternion(child.quaternion);
      const last = was.get(child.name);
      if (last !== undefined) {
        // Along the ground: the height in a town here is the stand-in floor,
        // and the ribbon climbs to the real one at the gate.
        const moved = child.position.clone().sub(last.p);
        moved.addScaledVector(up, -moved.dot(up.copy(last.p).normalize()));
        fastest = Math.max(fastest, moved.length() / STEP);
        sharpest = Math.max(sharpest, last.q.angleTo(facing) / STEP);
      }
      was.set(child.name, { p: child.position.clone(), q: facing });
    }
    for (const name of [...was.keys()]) {
      if (!floored.group.children.some((child) => child.name === name && child.visible)) was.delete(name);
    }
  }
  setDetail(1);
  console.log(
    `  driven at Ulm: ${driven.toLocaleString()} vehicle-frames, ${inTown.toLocaleString()} on a town's streets, ` +
    `${turning.toLocaleString()} turning round; ` +
    `fastest ${fastest.toFixed(1)} units a second, sharpest turn ${(sharpest * 180 / Math.PI).toFixed(0)} degrees a second`,
  );
  check(inTown > 0 && turning > 0, 'vehicles drive into the towns and turn round in them, drawn');
  check(fastest < ROAD_TOP * 1.25, 'and no vehicle jumps, on a road, in a town or turning', `${fastest.toFixed(1)} against ${ROAD_TOP}`);
  check(sharpest < 540 * Math.PI / 180, 'and none snaps round', `${(sharpest * 180 / Math.PI).toFixed(0)} degrees a second`);
}
console.log('');

// --- giving way -----------------------------------------------------------
//
// A vehicle that finds something standing in its lane stops short of it,
// sounds its horn if it is the player, and drives on once it is gone. The
// obstacle is put where the vehicle will be: a second world, the same world by
// determinism, run a second and a half ahead, says where that is.

console.log('giving way:');
{
  const streets = {
    floorAt: (direction: Vector3) => PLANET_RADIUS + Math.max(0, world.elevationAt(direction)) + 3,
    blocked: () => false,
  };
  const held = createLife(world, places, { roads, vehicles, streets });
  const twin = createLife(world, places, { roads, vehicles, streets });
  setDetail(3);
  const spot = spots[0]!;
  const dir = dirAt(spot.lat, spot.lon);
  const viewer = dir.clone().multiplyScalar(PLANET_RADIUS + Math.max(0, world.elevationAt(dir)) + spot.altitude);
  const STEP = 0.05;
  const START = 5_000_000;
  const AHEAD = 30;
  for (let frame = 0; frame < 40; frame++) held.update(viewer, spot.altitude, undefined, START + frame * STEP, STEP);
  for (let frame = 0; frame < 40 + AHEAD; frame++) twin.update(viewer, spot.altitude, undefined, START + frame * STEP, STEP);
  type Drawn = { name: string; position: Vector3; visible: boolean; geometry?: { boundingBox: { min: Vector3; max: Vector3 } | null; computeBoundingBox(): void }; matrixWorld: import('three').Matrix4; updateMatrixWorld(force?: boolean): void };
  const drawnIn = (instance: ReturnType<typeof createLife>, name: string): Drawn | undefined =>
    instance.group.children.find((child) => child.name === name && child.visible) as unknown as Drawn | undefined;
  // A vehicle on the road near the viewer, drawn now and a second and a half on.
  let chosen: string | null = null;
  const obstacleAt = new Vector3();
  for (const child of held.group.children) {
    if (!child.visible || !child.name.startsWith('road:') || child.position.distanceTo(viewer) > 350) continue;
    const later = drawnIn(twin, child.name);
    if (later === undefined) continue;
    const moved = later.position.distanceTo(child.position);
    if (moved < 25) continue;
    chosen = child.name;
    obstacleAt.copy(later.position);
    break;
  }
  check(chosen !== null, 'a vehicle near the viewer to stand something in front of', chosen ?? 'none drawn');
  if (chosen !== null) {
    const RADIUS = 1.3;
    let standing = true;
    let horns = 0;
    held.setInTheWay({
      each(visit) {
        if (standing) visit(obstacleAt, RADIUS, true);
      },
      horn: () => horns++,
    });
    // How far the obstacle is outside the vehicle's box, in the box's own frame.
    const local = new Vector3();
    const inverse = new (await import('three')).Matrix4();
    const outside = (car: Drawn, at = obstacleAt, radius = RADIUS): number => {
      car.updateMatrixWorld(true);
      const geometry = car.geometry!;
      if (geometry.boundingBox === null) geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      local.copy(at).applyMatrix4(inverse.copy(car.matrixWorld).invert());
      const dx = Math.max(box.min.x - local.x, 0, local.x - box.max.x);
      const dz = Math.max(box.min.z - local.z, 0, local.z - box.max.z);
      return Math.hypot(dx, dz) - radius;
    };
    /**
     * What it stopped short of: the obstacle, or a vehicle that stopped for it
     * first and stands between — then it is queued, and the gap that counts is
     * the one to the vehicle in front, whose half-width is `QUEUED`.
     */
    const QUEUED = 1.2;
    const stoppedShort = (car: Drawn): number => {
      let gap = outside(car);
      for (const other of held.group.children) {
        if (!other.visible || other.name === chosen || !other.name.startsWith('road:')) continue;
        if (other.position.distanceTo(obstacleAt) > other.position.distanceTo(car.position) + 1) continue;
        if (other.position.distanceTo(car.position) > 15) continue;
        gap = Math.min(gap, outside(car, other.position, QUEUED));
      }
      return gap;
    };
    let closest = Infinity;
    let clock = START + 40 * STEP;
    let last = drawnIn(held, chosen)!.position.clone();
    let restingSpeed = Infinity;
    let restingGap = Infinity;
    let hornsBy = 0;
    let passed = false;
    for (let frame = 0; frame < 200; frame++) {
      held.update(viewer, spot.altitude, undefined, clock, STEP);
      clock += STEP;
      const car = drawnIn(held, chosen);
      if (car === undefined) continue;
      closest = Math.min(closest, outside(car));
      const speed = car.position.distanceTo(last) / STEP;
      last = car.position.clone();
      // Stopped, before it has waited long enough to think of passing.
      if (frame === 55) {
        restingSpeed = speed;
        restingGap = stoppedShort(car);
      }
      if (frame > 60 && speed > 1 && local.z < -1) passed = true;
    }
    hornsBy = horns;
    check(closest > 0, 'a vehicle never runs into something standing in its lane', `${closest.toFixed(2)} units clear at the closest`);
    check(restingSpeed < 0.2 && restingGap < 4, 'it stops, within its stopping distance of it',
      `${restingSpeed.toFixed(2)} units a second, ${restingGap.toFixed(2)} units short of it`);
    check(hornsBy >= 1, 'and sounds its horn at the player it waits behind', `${hornsBy} in 10 s`);
    console.log(`  ${passed ? 'it pulled out and went past it after waiting' : 'it waited: the other lane was not free'}; ${held.stats.delayed.toFixed(1)} s behind its route`);
    standing = false;
    const from = last.clone();
    for (let frame = 0; frame < 60; frame++) {
      held.update(viewer, spot.altitude, undefined, clock, STEP);
      clock += STEP;
    }
    const after = drawnIn(held, chosen);
    const onward = after === undefined ? Infinity : after.position.distanceTo(from);
    check(onward > 15, 'and drives on once it is clear', `${onward.toFixed(1)} units in 3 s`);
  }
  setDetail(1);
}
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
      map.set(child.name, { p: child.position.clone(), g: (child as unknown as { geometry: { uuid: string } }).geometry.uuid });
    }
    return map;
  };
  /**
   * **The median of five short steps, and one displacement over a tenth of a
   * second is what it replaces.** A route is out and back, so at each end the
   * mover reverses *and crosses to the other side of the carriageway* — see
   * `chainFrame` — which is a real jump of twice its lateral offset, up to
   * about ten units on a lane. Divide that by a tenth of a second and it reads
   * as ninety units a second for a walker whose speed is forty (the numbers of
   * before 2026-09-24, when a lane was 8.25 wide and the walk 45). It is a
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

  // A tenth of a second, not a whole one: a walker covers about a whole stride
  // cycle in a second (`WALK_STRIDE`; two at the 45 units a second of before
  // 2026-09-24) and can land back in the pose he started from, which is an artefact of the sample rate and not a still
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
  // floor is not the class speed. The ceiling is the class speed with room to
  // spare: a mover reads a measured `coursePath` now, so there is no bow ripple
  // left in it (`arcParameter` had taken it from 15% to 3%), and a walker's
  // crossing of a town between two gates is hidden for exactly the time its
  // streets take, so the jump from one gate to the next is never faster than
  // the walk. A vehicle drives it (see *through a town*); here, with no floor
  // handed in, a vehicle in a town is hidden, and a road mover's median can be
  // a car stopped in a turn, which that section measures instead.
  const wanted: Record<string, [number, number]> = {
    road: [0, 130], foot: [1.5, 10], water: [10, 25],
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
// `pnpm traffic` already make, one level up: not "does one body rebuild the
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
// At least three in common: the reaches came down with the people (2026-09-24)
// and the census round one spot holds four or five movers now, not a dozen.
check(shared >= 3 && apart === 0, 'a mover arrived at by a day of frames is where a cold start puts it', `${shared} shared, ${apart} apart`);
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
  // Not the placed scale: since the bus is a baked model short enough that the
  // length cap does not bind (2026-09-17), its placed scale is uniform, and a
  // uniform scale cannot test the normal matrix. The ratio is the one the code
  // bus used to be cropped by.
  built.scale.set(PLACED_SECTION, PLACED_SECTION, PLACED_SECTION * 0.675);
  const skewed = mergeGroup(built);
  built.scale.set(...placedScale(bus));
  const scaled = mergeGroup(built);
  let worstNormal = 0;
  for (let i = 0; i < skewed.normal.length; i += 3) {
    const length = Math.hypot(skewed.normal[i]!, skewed.normal[i + 1]!, skewed.normal[i + 2]!);
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
  check(worst > 1.5 * BODY_SCALE && worst < 4 * BODY_SCALE, 'and moves it about a leg length', `${worst.toFixed(2)} units`);

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
  check(high - low > 0.05 * BODY_SCALE && high - low < 0.6 * BODY_SCALE, 'the head bobs over a cycle', `${(high - low).toFixed(3)} units`);
}
console.log('');

console.log(failures === 0 ? 'all good' : `${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures === 0 ? 0 : 1);
