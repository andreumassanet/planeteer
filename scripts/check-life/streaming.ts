import { Vector3, PerspectiveCamera } from 'three';
import { PLANET_RADIUS } from '../../src/globe.ts';
import { createLife } from '../../src/life.ts';
import { setDetail } from '../../src/view.ts';
import { dirAt, world, check } from './setup.ts';
import { life } from './scale.ts';
import { TIME_SCALE } from '../time-scale.ts';

// --- streaming, at real places --------------------------------------------

export interface Spot { name: string; lat: number; lon: number; altitude: number }
export const spots: Spot[] = [
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
export function cameraAt(dir: Vector3, altitude: number): PerspectiveCamera {
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
    // The median and not the worst, and that is not a softer test. On a
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
  const over = worst.filter(([, ms]) => ms > 4 * TIME_SCALE);
  check(over.length === 0, `the median update costs under ${4 * TIME_SCALE} ms, scan and all`, over.map(([n, ms]) => `${n} ${ms.toFixed(1)}`).join(', '));
}
console.log('');
