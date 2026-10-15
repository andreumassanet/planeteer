/**
 * `pnpm town-steps`: how long one frame of the towns' streamer runs while a
 * big city is built near, against a bound.
 *
 * A city is first stood far (the viewer out past `PEOPLED_REACH`, so it is
 * built unpeopled), then the viewer walks to `APPROACH` units off its edge,
 * inside `NEAR_BUILD`: the city is peopled and built again at near detail, a
 * step at a time under the frame's allowance, its far version drawn until the
 * new one stands. Every frame of `settlements.update` is timed, and the
 * longest is held to `MAX_FRAME_MS`. While the near version builds, the far
 * floor must still answer `madeHeightAt` and the far walls `collide` at a
 * point of the city that has both, and once it stands the near ones must.
 * Then, at the default knob, each city is flown toward from the planet's far
 * side and must end up built near, with its people.
 *
 *   node scripts/check-town-steps.ts [Paris Tokyo ...]
 */
import { Vector3 } from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { radiusOf } from '../src/places.ts';
import { unitAt } from '../src/sphere.ts';
import { loadEarthFeatures } from './map-node.ts';

/**
 * The longest frame the streamer may take. Its own slice is
 * `detailBuild(BUILD_BUDGET_MS)`, about 3 ms at the default knob, overshot by at most one
 * step; the bound is loose for a loaded machine and catches a near city built
 * whole, which is a hundred ms and more.
 */
const MAX_FRAME_MS = 25;
/** How far off the city's edge the viewer stands to bring it near. */
const APPROACH = 150;
/** Where the viewer waits first: over the city's middle, past `PEOPLED_REACH`, so it stands at far detail. */
const FAR_HEIGHT = 1600;
const MAX_FRAMES = 4000;

const { settlements, places } = await loadEarthFeatures();
const { beginFrameBuild, endFrameBuild, detail } = await import('../src/view.ts');
// The parked craft are built once a session, a craft a step (`parkedModelsSteps`), the first
// of them cold; built here so the bound is on the towns.
const { parkedModel } = await import('../src/craft/parked.ts');
parkedModel('bicycle');

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

/** The viewer `off` units north of the city's edge, `height` over sea level. */
function viewerOff(lat: number, lon: number, radius: number, off: number, height: number): Vector3 {
  const at = unitAt(lat + (radius + off) / UNITS_PER_DEGREE, lon, new Vector3());
  return at.multiplyScalar(PLANET_RADIUS + height);
}

/** Runs frames until `done` holds and nothing is pending; the longest frame, the frames run and the sum. */
function runFrames(viewer: Vector3, altitude: number, done: () => boolean, onFrame?: () => void): { worst: number; frames: number; total: number } {
  let worst = 0;
  let total = 0;
  let frames = 0;
  for (; frames < MAX_FRAMES; frames++) {
    beginFrameBuild();
    const began = performance.now();
    settlements.update(viewer, altitude);
    const spent = performance.now() - began;
    endFrameBuild();
    worst = Math.max(worst, spent);
    total += spent;
    onFrame?.();
    if (settlements.stats.pending === 0 && frames > 2 && done()) break;
  }
  return { worst, frames, total };
}

const push = new Vector3();
/** Whether a floor answers a foot at `point` and a wall stands within a body's reach of it. */
function standsAt(point: Vector3): boolean {
  return settlements.madeHeightAt(point) > 0 && settlements.collide(point, 6, push);
}

/** A point in the city's square with a floor under it and a wall beside it, or null. */
function probeIn(lat: number, lon: number, radius: number): Vector3 | null {
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const point = unitAt(lat + (i * radius) / 5 / UNITS_PER_DEGREE, lon + (j * radius) / 5 / UNITS_PER_DEGREE / Math.cos((lat * Math.PI) / 180), new Vector3());
      point.multiplyScalar(PLANET_RADIUS);
      if (standsAt(point)) return point;
    }
  }
  return null;
}

const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['Paris', 'Tokyo'];
for (const name of names) {
  const place = places.find((entry) => entry.name === name);
  if (place === undefined) {
    check(false, `${name}: no such place`);
    continue;
  }
  const town = `town:${place.name}`;
  const radius = radiusOf(place);
  console.log(`${name} (${place.iso}), radius ${radius.toFixed(0)}, the knob at ${detail()}`);
  const far = runFrames(viewerOff(place.lat, place.lon, radius, -radius, FAR_HEIGHT), FAR_HEIGHT, () => settlements.group.getObjectByName(town) !== undefined);
  const farMesh = settlements.group.getObjectByName(town);
  console.log(`  range ${settlements.stats.range}; far: ${far.frames} frames, ${far.total.toFixed(0)} ms in all, the longest ${far.worst.toFixed(1)} ms`);
  check(farMesh !== undefined, 'the far version stands');
  const probe = probeIn(place.lat, place.lon, radius);
  check(probe !== null, 'a point of the far version has a floor and a wall');

  let held = true;
  let swappedAt = -1;
  let frame = 0;
  const near = runFrames(viewerOff(place.lat, place.lon, radius, APPROACH, 2), 20, () => swappedAt >= 0, () => {
    frame++;
    if (swappedAt < 0 && settlements.group.children.some((child) => child.name === town && child !== farMesh)) swappedAt = frame;
    if (swappedAt < 0 && probe !== null && !standsAt(probe)) held = false;
  });
  console.log(`  near: ${near.frames} frames, ${near.total.toFixed(0)} ms in all, the longest ${near.worst.toFixed(1)} ms; the swap at frame ${swappedAt}`);
  check(near.worst <= MAX_FRAME_MS, `no frame of the streamer over ${MAX_FRAME_MS} ms while ${name} builds near`, `${near.worst.toFixed(1)} ms`);
  check(held, 'the far floor and walls answer until the near version stands');
  check(probe === null || standsAt(probe), 'the near floor and walls answer once it stands');
}

// Flown toward from the air at the default knob, a big city ends up built near: peopled.
const FLIGHT_FRAMES = 300;
const FLIGHT_HEIGHT = 300;
const folk: import('../src/folk.ts').FolkAnchor[] = [];
for (const name of names) {
  const place = places.find((entry) => entry.name === name);
  if (place === undefined) continue;
  const radius = radiusOf(place);
  // Everything let go of first, from the planet's far side.
  runFrames(unitAt(-place.lat, place.lon + 180, new Vector3()).multiplyScalar(PLANET_RADIUS + 2), 20, () => true);
  let worst = 0;
  for (let frame = 0; frame <= FLIGHT_FRAMES; frame++) {
    const off = 3000 + (50 - 3000) * (frame / FLIGHT_FRAMES);
    const viewer = viewerOff(place.lat, place.lon, radius, off, FLIGHT_HEIGHT);
    beginFrameBuild();
    const began = performance.now();
    settlements.update(viewer, FLIGHT_HEIGHT);
    worst = Math.max(worst, performance.now() - began);
    endFrameBuild();
  }
  const over = viewerOff(place.lat, place.lon, radius, 50, FLIGHT_HEIGHT);
  const settled = runFrames(over, FLIGHT_HEIGHT, () => true);
  folk.length = 0;
  settlements.folkNear(over, 3000, folk);
  const people = folk.filter((person) => person.key.startsWith(`${place.name}@`)).length;
  console.log(`${name} flown toward ${FLIGHT_HEIGHT} up: the longest frame ${Math.max(worst, settled.worst).toFixed(1)} ms; ${people} people`);
  check(people > 0, `${name} flown toward at the knob's default stands near, with its people`);
  check(Math.max(worst, settled.worst) <= MAX_FRAME_MS, `and no frame of the streamer over ${MAX_FRAME_MS} ms on the way`);
}

console.log(failures === 0 ? '\nall ok' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
