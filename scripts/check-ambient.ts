/**
 * The small life round the camera, headless: where it lives, when, and that
 * where it is does not depend on how you got there.
 *
 * `ambient.ts` places every firefly, butterfly, leaf, fish and gull from a
 * fixed grid on the sphere and a clock, so the one promise worth a check is
 * that two runs ending at the same place and the same clock draw exactly the
 * same creatures — one that walked in from three hundred units off and one
 * that stood there all along. (Nothing is culled by the view, so turning
 * round cannot change them.) Around it, the habitat
 * and the weather: fireflies on a July night in France and none in the
 * Sahara, in the rain or on the ice; butterflies by day; leaves off the
 * crowns, a few in July and many in October, lying on the ground and never
 * under it, and litter under the trees that goes under lying snow; gulls over
 * a coast; a fish off the shore with its splash; and never more than the
 * three draw calls.
 *
 *   node scripts/check-ambient.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import type { Mesh } from 'three';
import { loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, groundRadius } from '../src/globe.ts';
import { decodeLakes, inflate } from '../src/pack.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { latOf, lonOf, unitAt } from '../src/sphere.ts';
import { sunDirection, solarPosition } from '../src/sun.ts';
import { setSunDirection } from '../src/lights.ts';
import { CELL, GULL_CELL, autumnAt, cellKey, columnLon, columnOf, columnsIn, createAmbient, rowLat, rowOf } from '../src/ambient.ts';
import type { Ambient, AmbientFrame, AmbientWeather } from '../src/ambient.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

setFlattenSites([]);
setDetailSites([]);
const world = await loadWorld(UNITS_PER_DEGREE, decodeLakes(await inflate(lakes)));

/* --- the grid ------------------------------------------------------------- */

console.log('the grid');
{
  let worst = 0;
  let wrongKey = 0;
  const point = new Vector3();
  const middle = new Vector3();
  for (const size of [CELL, GULL_CELL]) {
    for (let i = 0; i < 20000; i++) {
      const lat = (((i * 0.618034) % 1) * 2 - 1) * 77;
      const lon = ((i * 0.7548776) % 1) * 360 - 180;
      const row = rowOf(lat, size);
      const columns = columnsIn(row, size);
      const column = columnOf(lon, columns);
      unitAt(lat, lon, point);
      unitAt(rowLat(row, size), columnLon(column, columns), middle);
      const off = point.distanceTo(middle) * PLANET_RADIUS;
      if (off / size > worst) worst = off / size;
      // The key is the cell's and nobody else's: its row and column come back out of it.
      const key = cellKey(row, column);
      if (Math.floor(key / 1048576) - 8192 !== row || key % 1048576 !== column) wrongKey++;
    }
  }
  check(worst < 0.75, 'every point is within its own cell', `worst ${worst.toFixed(3)} of a side from the middle`);
  check(wrongKey === 0, 'a cell key is its row and column and nothing else', `${wrongKey} wrong`);
}

/* --- a run ------------------------------------------------------------------ */

const clear: AmbientWeather = { precipitation: 0, snow: 0, storm: 0, fog: 0, temperatureC: 21, lying: 0, wind: { speed: 3, from: 250 } };
const rain: AmbientWeather = { ...clear, precipitation: 0.7, wind: { speed: 6, from: 250 } };
const snow: AmbientWeather = { ...clear, precipitation: 0.5, snow: 1, temperatureC: -3, lying: 0.8 };

interface Run {
  ambient: Ambient;
  splashes: number;
  worst: { fireflies: number; butterflies: number; leaves: number; lying: number; litter: number; fish: number; gulls: number; motes: number; calls: number };
  meanMs: number;
  /** The dearest frame of the second half. */
  worstMs: number;
}

/**
 * A wood of the check's own, as `vegetation.crownsNear` hands one over: a
 * crown every `WOOD_STEP` degrees on dry land short of the polar circles,
 * `CROWN_OVER` over the ground, a broadleaf's green, every fourth a bush that
 * sheds a third as much. A pure function of where it is asked, as the wood's
 * tiles are.
 */
const WOOD_STEP = 0.08;
const CROWN_OVER = 8;
const CROWN_RADIUS = 3.5;
const CROWN_HALF = 3;
const woodPoint = new Vector3();
function woodNear(point: Vector3, range: number, visit: (list: Float32Array, offset: number) => void): void {
  woodPoint.copy(point).normalize();
  const lat = latOf(woodPoint.y);
  const lon = lonOf(woodPoint.x, woodPoint.z);
  const reach = range / UNITS_PER_DEGREE;
  const across = reach / Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  for (let i = Math.floor((lat - reach) / WOOD_STEP); i <= Math.ceil((lat + reach) / WOOD_STEP); i++) {
    for (let j = Math.floor((lon - across) / WOOD_STEP); j <= Math.ceil((lon + across) / WOOD_STEP); j++) {
      const at = unitAt(i * WOOD_STEP, j * WOOD_STEP, new Vector3());
      if (Math.abs(i * WOOD_STEP) > 60) continue;
      const ground = groundRadius(world, at.clone().multiplyScalar(PLANET_RADIUS));
      if (ground <= PLANET_RADIUS + 0.5) continue;
      const middle = at.multiplyScalar(ground + CROWN_OVER);
      if (middle.distanceTo(point) > range) continue;
      const bush = (((i * 7 + j * 3) % 4) + 4) % 4 === 0;
      visit(Float32Array.of(middle.x, middle.y, middle.z, CROWN_RADIUS, CROWN_HALF, 0.18, 0.4, 0.1, bush ? 0.35 : 1), 0);
    }
  }
}

function make(trees = true): { ambient: Ambient; splashes: { count: number } } {
  const splashes = { count: 0 };
  const ambient = createAmbient({
    groundAt: (point) => groundRadius(world, point),
    madeHeightAt: () => 0,
    meadowAt: () => false,
    crownsNear: trees ? woodNear : undefined,
    splash: () => splashes.count++,
    admitPerFrame: 100000,
  });
  return { ambient, splashes };
}

const sun = new Vector3();
/** Points the lights' terminator at the real sun of `when`. */
function setSun(when: Date): void {
  sunDirection(when, sun);
  setSunDirection(sun, solarPosition(when).subsolarLon);
}

/** Stands at a place, or walks in to it, and runs `frames` frames of `dt`. */
function run(
  lat: number,
  lon: number,
  when: Date,
  weather: AmbientWeather,
  options: { daylight: number; frames?: number; dt?: number; afloat?: boolean; approach?: number; trees?: boolean },
): Run {
  const { ambient, splashes } = make(options.trees ?? true);
  setSun(when);
  const player = new Vector3();
  const frame: AmbientFrame = { player, cameraHeight: 6, time: when, daylight: options.daylight, afloat: options.afloat ?? false };
  const frames = options.frames ?? 80;
  const dt = options.dt ?? 0.05;
  const worst = { fireflies: 0, butterflies: 0, leaves: 0, lying: 0, litter: 0, fish: 0, gulls: 0, motes: 0, calls: 0 };
  let spent = 0;
  let dearest = 0;
  for (let i = 0; i < frames; i++) {
    // The first half of an approach walks in from `approach` units east.
    const east = options.approach === undefined ? 0 : Math.max(0, options.approach * (1 - i / (frames / 2)));
    unitAt(lat, lon + east / (UNITS_PER_DEGREE * Math.cos((lat * Math.PI) / 180)), player);
    player.multiplyScalar(groundRadius(world, player.multiplyScalar(PLANET_RADIUS)) / PLANET_RADIUS);
    ambient.update(dt, frame, () => weather);
    const s = ambient.stats;
    if (i >= frames / 2) {
      spent += s.updateMs;
      dearest = Math.max(dearest, s.updateMs);
      for (const key of Object.keys(worst) as (keyof typeof worst)[]) worst[key] = Math.max(worst[key], s[key]);
    }
  }
  return { ambient, splashes: splashes.count, worst, meanMs: spent / (frames / 2), worstMs: dearest };
}

const julyNight = new Date(Date.UTC(2026, 6, 10, 22, 30));
const julyNoon = new Date(Date.UTC(2026, 6, 10, 12, 0));
const octoberNoon = new Date(Date.UTC(2026, 9, 18, 12, 0));
const FRANCE: [number, number] = [46.6, 1.9];
const SAHARA: [number, number] = [24, 12];
const ANTARCTICA: [number, number] = [-72, 40];
const SINGAPORE: [number, number] = [1.35, 103.8];
const PALMA_BAY: [number, number] = [39.53, 2.62];

console.log('\nwho lives where');
{
  const night = run(...FRANCE, julyNight, clear, { daylight: 0 });
  check(night.worst.fireflies > 0, 'fireflies over the French grass on a July night', `${night.worst.fireflies}`);
  check(night.worst.butterflies === 0, 'and no butterflies with them', `${night.worst.butterflies}`);
  check(night.worst.calls <= 3, 'in at most three draw calls', `${night.worst.calls}`);
  console.log(`       ${night.meanMs.toFixed(3)} ms a frame in node, cells ${night.ambient.stats.cells}, admitted ${night.ambient.stats.admitted}`);

  const wet = run(...FRANCE, julyNight, rain, { daylight: 0 });
  check(wet.worst.fireflies === 0 && wet.ambient.stats.quiet === 'rain', 'none in the rain', `${wet.worst.fireflies}, quiet '${wet.ambient.stats.quiet}'`);
  const white = run(...FRANCE, julyNight, snow, { daylight: 0 });
  check(white.worst.fireflies === 0, 'none in the snow', `${white.worst.fireflies}`);

  const sahara = run(...SAHARA, new Date(Date.UTC(2026, 6, 10, 23, 0)), clear, { daylight: 0 });
  check(sahara.worst.fireflies + sahara.worst.butterflies + sahara.worst.motes === 0, 'no insects in the Sahara', JSON.stringify(sahara.worst));
  const ice = run(...ANTARCTICA, julyNoon, { ...clear, temperatureC: -20 }, { daylight: 1 });
  check(ice.worst.fireflies + ice.worst.butterflies + ice.worst.leaves + ice.worst.lying + ice.worst.litter + ice.worst.motes === 0, 'nothing on the Antarctic ice', JSON.stringify(ice.worst));

  const day = run(...FRANCE, julyNoon, clear, { daylight: 1 });
  check(day.worst.butterflies > 0, 'butterflies over France by day', `${day.worst.butterflies}`);
  check(day.worst.fireflies === 0, 'and no fireflies by day', `${day.worst.fireflies}`);

  const autumn = run(...FRANCE, octoberNoon, { ...clear, temperatureC: 14 }, { daylight: 1, frames: 200 });
  const july = run(...FRANCE, julyNoon, clear, { daylight: 1, frames: 200 });
  check(autumn.worst.leaves > 0 && autumn.worst.lying > 0, 'leaves falling off the French trees in October, and lying where they fell', `${autumn.worst.leaves} in the air, ${autumn.worst.lying} lying, under ${autumn.ambient.stats.crowns} crowns`);
  check(july.worst.leaves > 0 && july.worst.leaves * 4 < autumn.worst.leaves, 'a few in July, and many times more in October', `${july.worst.leaves} against ${autumn.worst.leaves}`);
  check(autumn.worst.litter > 0 && july.worst.litter * 2 < autumn.worst.litter, 'litter under the trees all year, and more in October', `${july.worst.litter} against ${autumn.worst.litter}`);
  check(autumn.worst.calls <= 3, 'in at most three draw calls', `${autumn.worst.calls}`);
  console.log(`       ${autumn.meanMs.toFixed(3)} ms a frame in node, the dearest ${autumn.worstMs.toFixed(3)}, ${autumn.ambient.stats.crowns} crowns, ${autumn.ambient.stats.groundAsks} ground heights asked`);
  const bare = run(...FRANCE, octoberNoon, { ...clear, temperatureC: 14 }, { daylight: 1, trees: false });
  check(bare.worst.leaves + bare.worst.lying + bare.worst.litter === 0, 'and none where no tree stands', `${bare.worst.leaves}, ${bare.worst.litter}`);
  const buried = run(...FRANCE, octoberNoon, { ...snow, precipitation: 0 }, { daylight: 1 });
  check(buried.worst.litter === 0, 'no litter under lying snow', `${buried.worst.litter}`);
  const tropics = run(...SINGAPORE, octoberNoon, clear, { daylight: 1, frames: 200 });
  check(tropics.ambient.stats.autumn === 0 && tropics.worst.leaves * 4 < autumn.worst.leaves, 'no autumn in Singapore: a trickle, not a fall', `${tropics.worst.leaves}`);
  check(autumnAt(octoberNoon.getTime(), -40) === 0 && autumnAt(Date.UTC(2026, 3, 20), -40) > 0.5, 'the south has its autumn in April');
}

console.log('\nwhere the leaves are');
{
  // Cold enough that nothing else is out, so every body is a leaf.
  const cold = run(...FRANCE, octoberNoon, { ...clear, temperatureC: 6 }, { daylight: 1, frames: 200 });
  const bodies = cold.ambient.group.getObjectByName('ambient-bodies') as Mesh;
  const litter = cold.ambient.group.getObjectByName('ambient-litter') as Mesh;
  const probe = new Vector3();
  const measure = (mesh: Mesh): { count: number; under: number; low: number; high: number } => {
    const position = mesh.geometry.getAttribute('position');
    const count = mesh.geometry.drawRange.count;
    let under = 0;
    let low = 0;
    let high = -Infinity;
    for (let v = 0; v < count; v++) {
      probe.fromBufferAttribute(position, v);
      const over = probe.length() - groundRadius(world, probe);
      if (over < -0.3) under++;
      if (over < 0.6) low++;
      high = Math.max(high, over);
    }
    return { count, under, low, high };
  };
  const air = measure(bodies);
  check(air.count > 0 && air.under === 0, 'no leaf under the ground', `${air.under} of ${air.count} vertices`);
  check(air.low > 0, 'some of them lying on it', `${air.low} vertices within 0.6`);
  check(air.high <= CROWN_OVER + CROWN_HALF + 1, 'none higher than the crowns they came off', `${air.high.toFixed(2)} over the ground`);
  const lying = measure(litter);
  check(lying.count > 0 && lying.under === 0 && lying.high < 0.6, 'the litter flat on the ground, neither under it nor floating', `${lying.count / 6} leaves, ${lying.under} vertices under, the highest ${lying.high.toFixed(2)} over`);
  const normal = litter.geometry.getAttribute('normal');
  const position = litter.geometry.getAttribute('position');
  let down = 0;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let v = 0; v + 2 < lying.count; v += 3) {
    a.fromBufferAttribute(position, v);
    b.fromBufferAttribute(position, v + 1);
    c.fromBufferAttribute(position, v + 2);
    const face = b.sub(a).cross(c.sub(a));
    probe.fromBufferAttribute(normal, v);
    if (face.dot(a) <= 0 || probe.dot(a) <= 0) down++;
  }
  check(down === 0, 'every leaf of litter faces the sky', `${down} face down`);

  const bay = run(...PALMA_BAY, julyNoon, clear, { daylight: 1, frames: 400, dt: 0.1, afloat: true });
  check(bay.worst.gulls > 0, 'gulls over the bay of Palma', `${bay.worst.gulls}`);
  check(bay.worst.fish > 0 && bay.splashes > 0, 'a fish jumps off a boat, with a splash', `${bay.worst.fish} fish, ${bay.splashes} splashes`);
  const storm = run(...PALMA_BAY, julyNoon, { ...clear, storm: 1, precipitation: 1, wind: { speed: 20, from: 0 } }, { daylight: 1, frames: 200, dt: 0.1, afloat: true });
  check(storm.worst.gulls === 0 && storm.worst.fish === 0, 'and neither in a storm', JSON.stringify(storm.worst));
}

console.log('\ndeterminism');
{
  // Two runs that end at the same place at the same clock: one walks in from
  // 300 units east, one stands there the whole time. The creatures they draw at the end are the same, to the thousandth.
  for (const [label, when, daylight] of [
    ['a July night', julyNight, 0],
    ['an October noon', octoberNoon, 1],
    ['a cold October noon, leaves alone', octoberNoon, 1],
  ] as const) {
    const weather = label.startsWith('a cold') ? { ...clear, temperatureC: 6 } : clear;
    const walked = run(...FRANCE, when, weather, { daylight, frames: 120, approach: 300 });
    const stood = run(...FRANCE, when, weather, { daylight, frames: 120 });
    const a = walked.ambient.snapshot();
    const b = stood.ambient.snapshot();
    let differ = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) differ++;
    check(a.length > 0 && differ === 0, `${label}: the same creatures in the same places, however you arrived`, `${a.length} against ${b.length}, ${differ} differ`);
  }
}

console.log(failures === 0 ? '\nall ambient checks pass' : `\n${failures} ambient check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
