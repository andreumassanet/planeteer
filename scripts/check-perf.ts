/**
 * The hottest pure questions the world asks, timed, with bounds generous
 * enough for a slower machine and tight enough to catch the kind of change
 * that multiplies one of them.
 *
 * Every frame asks where it is (`countryAtPoint`), how high the ground is
 * (`elevationAt`, `reliefAt`), which town is nearest and what time it is
 * there; every streamed town, tile, herd, road and countryside plan asks the
 * same things thousands of times; and the world's load asks the coast of every
 * ring once. A regression in any of them is invisible in a screenshot and
 * shows as a frame rate somebody else measures.
 *
 * Two kinds of assertion:
 *
 * - **Agreement.** `geo.ts` answers point-in-polygon from each ring's edges
 *   bucketed by latitude (`bandIndex`); `insideRing`, the walk over the whole
 *   ring, is the definition, and the two are held to the same bit at every
 *   vertex, beside every vertex, at every edge's midpoint and at random points
 *   in every banded ring's box.
 * - **Cost.** The median of several runs of each question, against a bound
 *   set several times over what it measured on 2026-09-25, and one ratio that
 *   does not depend on the machine: the banded test against the walk.
 *
 * `pnpm perf`. Headless, a few seconds, and no mesh is built.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { bandIndex, insideBands, insideRing, loadLakes, loadWorld, toLatLon } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, coastEdges } from '../src/globe.ts';
import { reliefAt, setDetailSites, setFlattenSites, shoreDistance } from '../src/terrain.ts';
import { indexPlaces, terrainSiteOf } from '../src/places.ts';
import { decodePlaces, inflate } from '../src/pack.ts';
import { unitAt } from '../src/sphere.ts';
import { clockAt } from '../src/timezone.ts';
import { weatherAt, weatherSample } from '../src/weather.ts';
import { biomeAt, biomeSample } from '../src/biome.ts';
import { prepareSeaFloor } from '../src/sea-floor.ts';
import { TIME_SCALE } from './time-scale.ts';

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

const monumentsPath = resolve(here, '../public/data/monuments.json');
setFlattenSites((existsSync(monumentsPath) ? JSON.parse(readFileSync(monumentsPath, 'utf8')).monuments : []) as never);
const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
setDetailSites(placesRaw.map(terrainSiteOf));

/** Milliseconds of one run of `work`, the median of `runs`. */
function timed(runs: number, work: () => void): number {
  const spent: number[] = [];
  for (let r = 0; r < runs; r++) {
    const began = performance.now();
    work();
    spent.push(performance.now() - began);
  }
  spent.sort((a, b) => a - b);
  return spent[Math.floor(runs / 2)]!;
}

console.log('the load:');
let world!: Awaited<ReturnType<typeof loadWorld>>;
{
  const began = performance.now();
  world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
  const ms = performance.now() - began;
  // 234 ms on 2026-09-25, from 1,343 before the rings were banded; most of
  // it is `prepareTerrain`'s shore index asking `isLand` of every edge.
  check(ms < 1000, 'the world loads, terrain fields and all, in under a second', `${ms.toFixed(0)} ms`);
}
{
  const ms = timed(1, () => coastEdges(world));
  // 81 ms on 2026-09-25, from 1,154: one `countryAt` either side of every edge.
  check(ms < 500, 'which edges face the sea, in under half a second', `${ms.toFixed(0)} ms`);
}
{
  const ms = timed(1, () => prepareSeaFloor(world));
  // 46 ms on 2026-09-25. Built while the world loads (`createSea`), never in a frame.
  check(ms < 300, 'the sea floor\'s coast index, in under 300 ms', `${ms.toFixed(0)} ms`);
}

console.log('\nthe banded point-in-polygon test is insideRing:');
{
  let seed = 7;
  const random = (): number => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  let tested = 0;
  let differ = 0;
  let banded = 0;
  let walkMs = 0;
  let bandMs = 0;
  for (const ring of world.rings) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    for (const [lon, lat] of ring.points) {
      minLat = Math.min(minLat, lat!);
      maxLat = Math.max(maxLat, lat!);
      minLon = Math.min(minLon, lon!);
      maxLon = Math.max(maxLon, lon!);
    }
    const band = bandIndex(ring.points, minLat, maxLat);
    if (band === null) continue;
    banded++;
    const asked: number[] = [];
    const points = ring.points;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      asked.push(a[0]!, a[1]!, a[0]! + 1e-9, a[1]!, a[0]!, a[1]! + 1e-9, (a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2);
    }
    for (let i = 0; i < 400; i++) asked.push(minLon + random() * (maxLon - minLon), minLat + random() * (maxLat - minLat));
    for (let k = 0; k < asked.length; k += 2) {
      const x = asked[k]!;
      const y = asked[k + 1]!;
      if (y < minLat || y > maxLat) continue;
      let began = performance.now();
      const walked = insideRing(points, x, y);
      walkMs += performance.now() - began;
      began = performance.now();
      const bucketed = insideBands(band, x, y);
      bandMs += performance.now() - began;
      tested++;
      if (walked !== bucketed) differ++;
    }
  }
  check(differ === 0, 'the same answer at every point asked', `${differ} of ${tested.toLocaleString()} points differ, over ${banded} banded rings`);
  // 15x on 2026-09-25 (5,204 ms against 333, the timer's own cost in both).
  check(walkMs > bandMs * 4, 'and at least four times faster than the walk', `${(walkMs / bandMs).toFixed(1)}x`);
}

console.log('\nthe questions a frame asks, microseconds a call (median of 5):');
const spots: [number, number][] = [[48.86, 2.29], [35.7, 139.7], [40.4, -3.7], [-33.9, 151.2], [19.4, -99.1], [55.7, 37.6], [39.57, 2.65], [30, 31.2], [64, 100], [-10, -60]];
const points = spots.map(([lat, lon]) => {
  const u = { x: 0, y: 0, z: 0 };
  unitAt(lat, lon, u);
  return new Vector3(u.x, u.y, u.z).multiplyScalar(PLANET_RADIUS + 5);
});
const units = points.map((p) => p.clone().normalize());
const places = indexPlaces(placesRaw, 150);
const now = new Date(Date.UTC(2026, 8, 25, 12));
const weather = weatherSample();
const biome = biomeSample();
let sink = 0;
/** Microseconds a call of `ask`, the median of five runs of `calls`. */
function perCall(calls: number, ask: (i: number) => number): number {
  for (let i = 0; i < Math.min(calls, 500); i++) sink += ask(i);
  return (timed(5, () => {
    for (let i = 0; i < calls; i++) sink += ask(i);
  }) * 1000) / calls;
}
// Bounds several times what was measured on 2026-09-25 (in brackets), on a
// machine running other work.
const bounds: [string, number, number, (i: number) => number][] = [
  // 3.4 us before the rings were banded.
  ['countryAtPoint', 1.5, 20_000, (i) => world.countryAtPoint(points[i % 10]!)],
  // 4.2 us before; the relief is most of what is left.
  ['elevationAt', 6, 20_000, (i) => world.elevationAt(points[i % 10]!)],
  ['reliefAt', 4, 20_000, (i) => reliefAt(units[i % 10]!.x, units[i % 10]!.y, units[i % 10]!.z)],
  ['shoreDistance', 0.5, 50_000, (i) => shoreDistance(spots[i % 10]![0], spots[i % 10]![1])],
  ['biomeAt', 2, 20_000, (i) => biomeAt(units[i % 10]!.x, units[i % 10]!.y, units[i % 10]!.z, spots[i % 10]![0], spots[i % 10]![1], 10, biome).warmth],
  ['weatherAt', 10, 20_000, (i) => weatherAt(spots[i % 10]![0], spots[i % 10]![1], 10, now.getTime() + i * 1000, weather).cover],
  // A scan of every built town, once a frame.
  ['places.nearest', 80, 5_000, (i) => places.nearest(points[i % 10]!).index],
  ['clockAt', 60, 5_000, (i) => {
    const near = places.nearest(points[i % 10]!);
    const at = toLatLon(points[i % 10]!);
    return clockAt(now, near.place.iso, at.lon, at.lat, near.place).length;
  }],
];
const measured: Record<string, number> = {
  countryAtPoint: 0.2, elevationAt: 1.1, reliefAt: 0.75, shoreDistance: 0.03, biomeAt: 0.25, weatherAt: 1.8, 'places.nearest': 15, clockAt: 12,
};
for (const [name, bound, calls, ask] of bounds) {
  const us = perCall(calls, ask);
  check(us < bound * TIME_SCALE, `${name} under ${bound * TIME_SCALE} us`, `${us.toFixed(2)} us [${measured[name]}]`);
}
if (!Number.isFinite(sink)) console.log('  (the sink is not finite, which only keeps the calls from being optimised away)');

console.log(failures === 0 ? '\nall perf checks passed' : `\n${failures} perf check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
