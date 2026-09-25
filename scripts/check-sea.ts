/**
 * The sea floor and what lives on it, headless.
 *
 * `sea-floor.ts` is the one definition of how deep the sea is, and three
 * things stand on it that could each go wrong without a screenshot showing
 * it: the floor itself (a step, or a floor above the water), what is placed
 * on it (a coral in the Arctic, kelp on the equator, a fish on dry land), and
 * the water drawn over it by `seabed.ts` (a sheet out of place with the
 * ribbon it replaces). And the submarine's moorings, which have to be in water
 * deep enough to float it.
 *
 * - **The profile**: the floor is `COAST_DEPTH` or so at the coast, the deep
 *   far out, continuous against distance and against position, and never
 *   above the water anywhere the outlines call sea.
 * - **The tiles**: a point is in the tile it says, neighbours share their
 *   edge vertices exactly — across a face of the cube as well — and a tile's
 *   life does not depend on how its building was sliced.
 * - **Where things live**: coral only where the sea is warm, kelp only where
 *   it is cold, and every school, swimmer and pod over water deep enough for
 *   it, for the whole of its round.
 * - **The drawn sea**: built over a reef, the floor is under the sea, the
 *   water on its ribbon's heights, the decor under the surface, the window
 *   opened; the fish in the water; the camera taken under the surface.
 * - **The submarine**: its sites are in the sea, deep enough, at big towns.
 *
 *   node scripts/check-sea.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { decodeLakes, decodePlaces, decodeRoads, inflate } from '../src/pack.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { latOf, lonOf, unitAt } from '../src/sphere.ts';
import { meanTemperature } from '../src/biome.ts';
import {
  COAST_DEPTH,
  CRUISER_FLOOR,
  DOLPHIN_FLOOR,
  KELP_COLD,
  MIN_DEPTH,
  OPEN_DEPTH,
  REEF_WARM,
  SCHOOL_FLOOR,
  SEA_REACH,
  TILE_QUADS,
  WHALE_FLOOR,
  coastAt,
  coastSample,
  coastSegments,
  depthAtDistance,
  forgetTiles,
  isSeaAt,
  podIn,
  prepareSeaFloor,
  roundAt,
  seaDepthAt,
  seaZoneAt,
  tileLife,
  tileLifeJob,
  tileOf,
  tilePoint,
} from '../src/sea-floor.ts';
import type { TileLife } from '../src/sea-floor.ts';
import { surfaceLift, seaWindow } from '../src/ocean.ts';

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
const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
const { terrainSiteOf, indexPlaces } = await import('../src/places.ts');
setDetailSites(placesRaw.map(terrainSiteOf));
const world = await loadWorld(UNITS_PER_DEGREE, decodeLakes(await inflate(lakes)));
let began = performance.now();
prepareSeaFloor(world);
console.log(`the coast: ${coastSegments()} segments indexed in ${Math.round(performance.now() - began)} ms\n`);

const p = new THREE.Vector3();
const q = new THREE.Vector3();
const sample = coastSample();

/** Places a reader can check: a reef, a kelp coast, the open ocean. */
const SPOTS = {
  'Great Barrier Reef coast': [-16.9, 145.8],
  'Virgin Islands': [18.4, -64.9],
  'Red Sea, Hurghada': [27.2, 33.9],
  'Monterey': [36.6, -121.9],
  'Cape Town': [-34.0, 18.35],
  'mid Pacific': [0, -140],
} as const;

/* --- the profile ------------------------------------------------------------ */

console.log('the profile');
{
  // Against distance, at one point: no step anywhere, the coast shallow, the deep deep.
  unitAt(10, 60, p);
  let worstStep = 0;
  let last = depthAtDistance(p.x, p.y, p.z, 0);
  for (let d = 0.5; d <= SEA_REACH + 100; d += 0.5) {
    const depth = depthAtDistance(p.x, p.y, p.z, d);
    worstStep = Math.max(worstStep, Math.abs(depth - last));
    last = depth;
  }
  check(worstStep < 0.6, 'continuous against distance', `worst step ${worstStep.toFixed(3)} a half unit`);
  let shallowest = Infinity;
  let deepest = 0;
  let coastWorst = 0;
  for (let i = 0; i < 4000; i++) {
    unitAt((((i * 0.618034) % 1) * 2 - 1) * 80, ((i * 0.7548776) % 1) * 360 - 180, p);
    shallowest = Math.min(shallowest, depthAtDistance(p.x, p.y, p.z, (i % 50) * 12));
    deepest = Math.max(deepest, depthAtDistance(p.x, p.y, p.z, SEA_REACH));
    coastWorst = Math.max(coastWorst, depthAtDistance(p.x, p.y, p.z, 0));
  }
  check(shallowest >= MIN_DEPTH, 'never shallower than MIN_DEPTH', `${shallowest.toFixed(2)} against ${MIN_DEPTH}`);
  check(coastWorst < COAST_DEPTH * 2.2, 'shallow at the coast', `at most ${coastWorst.toFixed(2)} at distance 0`);
  check(deepest > OPEN_DEPTH * 0.7, 'deep far out', `${deepest.toFixed(1)} past the reach`);
}
{
  // Against position: walk out from real coasts and along them, two units a
  // step, and the floor changes by less than a steep slope's worth.
  let worst = 0;
  let where = '';
  let aboveWater = 0;
  let seaPoints = 0;
  for (const [name, [lat, lon]] of Object.entries(SPOTS)) {
    for (let a = 0; a < 8; a++) {
      unitAt(lat, lon, p);
      const north = new THREE.Vector3(0, 1, 0).projectOnPlane(p).normalize();
      const east = new THREE.Vector3().crossVectors(north, p).normalize();
      const dir = north.clone().multiplyScalar(Math.cos((a / 8) * Math.PI * 2)).addScaledVector(east, Math.sin((a / 8) * Math.PI * 2));
      let previous = seaDepthAt(p);
      for (let k = 1; k <= 300; k++) {
        q.copy(p).addScaledVector(dir, (k * 2) / PLANET_RADIUS).normalize();
        const depth = seaDepthAt(q);
        const step = Math.abs(depth - previous);
        if (step > worst) {
          worst = step;
          where = name;
        }
        previous = depth;
        if (isSeaAt(q.x, q.y, q.z)) {
          seaPoints++;
          if (PLANET_RADIUS - depth >= PLANET_RADIUS) aboveWater++;
        }
      }
    }
  }
  check(worst < 3.2, 'continuous along the ground, out from coasts', `worst ${worst.toFixed(2)} a two-unit step, off ${where}`);
  check(aboveWater === 0, 'the floor is under the water wherever the outlines say sea', `${seaPoints} sea points, ${aboveWater} with a floor over the surface`);
}
{
  const depths: string[] = [];
  for (const [name, [lat, lon]] of Object.entries(SPOTS)) {
    unitAt(lat, lon, p);
    coastAt(p.x, p.y, p.z, SEA_REACH, sample);
    depths.push(`${name} ${seaDepthAt(p).toFixed(1)} (coast ${sample.distance === Infinity ? 'far' : sample.distance.toFixed(0)})`);
  }
  unitAt(0, -140, p);
  check(seaDepthAt(p) > OPEN_DEPTH * 0.8, 'the middle of the Pacific is the deep', depths.join('; '));
}

/* --- the tiles --------------------------------------------------------------- */

console.log('\nthe tiles');
{
  let wrong = 0;
  let cracks = 0;
  let worstCrack = 0;
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 3000; i++) {
    unitAt((((i * 0.618034) % 1) * 2 - 1) * 89, ((i * 0.7548776) % 1) * 360 - 180, p);
    const key = tileOf(p.x, p.y, p.z);
    // The middle of the tile a point is in is within a tile of it.
    tilePoint(key, TILE_QUADS / 2, TILE_QUADS / 2, a);
    if (Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) * PLANET_RADIUS > 400) wrong++;
    // Each edge vertex of this tile is a vertex of the tile across that edge.
    for (const [i0, j0, di, dj] of [[TILE_QUADS, 7, 1, 0], [0, 11, -1, 0], [5, TILE_QUADS, 0, 1], [13, 0, 0, -1]] as const) {
      tilePoint(key, i0, j0, a);
      tilePoint(key, i0 + di * 0.5, j0 + dj * 0.5, b);
      const other = tileOf(b.x, b.y, b.z);
      if (other === key) continue;
      let best = Infinity;
      for (let u = 0; u <= TILE_QUADS; u++) {
        for (const v of [0, TILE_QUADS]) {
          for (const [x, y] of [[u, v], [v, u]] as const) {
            tilePoint(other, x, y, b);
            best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * PLANET_RADIUS);
          }
        }
      }
      worstCrack = Math.max(worstCrack, best);
      if (best > 1e-3) cracks++;
    }
  }
  check(wrong === 0, 'every point is in the tile it says', `${wrong} of 3000 more than a tile from their tile's middle`);
  check(cracks === 0, 'neighbouring tiles share their edge vertices, across the cube too', `worst gap ${worstCrack.toExponential(2)} units`);
}
{
  // A tile's life worked out at once and a candidate at a time are one life.
  const keys = Object.values(SPOTS).map(([lat, lon]) => tileOf(...(unitAt(lat, lon, p).toArray() as [number, number, number])));
  const whole = keys.map((key) => JSON.stringify(tileLife(key)));
  forgetTiles();
  const sliced = keys.map((key) => {
    const job = tileLifeJob(key);
    let life: TileLife | null = null;
    let steps = 0;
    while (life === null) {
      life = job.step(performance.now() - 1);
      steps++;
    }
    return { life: JSON.stringify(life), steps };
  });
  const same = sliced.every((entry, i) => entry.life === whole[i]);
  check(same, "a tile's life does not depend on how its building was sliced", `${sliced.map((s) => s.steps).join(', ')} slices`);
}

/* --- where things live ------------------------------------------------------- */

console.log('\nwhere things live');
const lives: TileLife[] = [];
{
  // Every coastal tile along a few hundred points of real coast, spread over
  // the latitudes, and the named spots.
  const keys = new Set<number>();
  for (const [lat, lon] of Object.values(SPOTS)) keys.add(tileOf(...(unitAt(lat, lon, p).toArray() as [number, number, number])));
  const rings = world.rings;
  for (let r = 0; r < rings.length; r += 7) {
    const points = rings[r]!.points;
    if (points.length < 20) continue;
    const at = points[Math.floor(points.length / 3)]!;
    unitAt(at[1]!, at[0]!, p);
    keys.add(tileOf(p.x, p.y, p.z));
    if (keys.size > 260) break;
  }
  began = performance.now();
  for (const key of keys) lives.push(tileLife(key));
  const ms = (performance.now() - began) / keys.size;
  let decor = 0;
  let coralCold = 0;
  let kelpWarm = 0;
  let coral = 0;
  let kelp = 0;
  let dry = 0;
  let above = 0;
  for (const life of lives) {
    for (const item of life.decor) {
      decor++;
      const t = meanTemperature(latOf(item.y), 0);
      if (item.kind === 'branch' || item.kind === 'brain' || item.kind === 'fan' || item.kind === 'tubes') {
        coral++;
        if (t < REEF_WARM) coralCold++;
      }
      if (item.kind === 'kelp') {
        kelp++;
        if (t > KELP_COLD) kelpWarm++;
      }
      if (!isSeaAt(item.x, item.y, item.z)) dry++;
      if (item.depth < MIN_DEPTH) above++;
    }
  }
  console.log(`  ${lives.length} coastal tiles, ${decor} pieces of decor (${coral} coral, ${kelp} kelp), ${ms.toFixed(1)} ms a tile`);
  check(coral > 0 && coralCold === 0, 'coral only where the sea is warm', `${coralCold} of ${coral} in water under ${REEF_WARM} C`);
  check(kelp > 0 && kelpWarm === 0, 'kelp only where it is cold', `${kelpWarm} of ${kelp} in water over ${KELP_COLD} C`);
  check(dry === 0 && above === 0, 'every piece stands in the water, on the floor', `${dry} on land, ${above} shallower than the floor allows`);
  const reefAt = (name: keyof typeof SPOTS): number =>
    tileLife(tileOf(...(unitAt(SPOTS[name][0], SPOTS[name][1], p).toArray() as [number, number, number]))).decor.filter((item) => ['branch', 'brain', 'fan', 'tubes'].includes(item.kind)).length;
  const kelpAt = (name: keyof typeof SPOTS): number =>
    tileLife(tileOf(...(unitAt(SPOTS[name][0], SPOTS[name][1], p).toArray() as [number, number, number]))).decor.filter((item) => item.kind === 'kelp').length;
  check(reefAt('Virgin Islands') > 20 && reefAt('Great Barrier Reef coast') > 20, 'a reef off the Virgin Islands and the Great Barrier Reef', `${reefAt('Virgin Islands')} and ${reefAt('Great Barrier Reef coast')} corals`);
  check(kelpAt('Monterey') > 10, 'a kelp forest off Monterey', `${kelpAt('Monterey')} stalks`);
}
{
  // Every school and every big swimmer, for ten minutes of its round, every
  // second: in the sea, over a floor deep enough.
  let schools = 0;
  let cruisers = 0;
  let dry = 0;
  let shallow = 0;
  const round = { e: 0, n: 0, lift: 0 };
  const north = new THREE.Vector3();
  const east = new THREE.Vector3();
  for (const life of lives) {
    for (const swimmer of [...life.schools, ...life.cruisers]) {
      const school = 'count' in swimmer;
      if (school) schools++;
      else cruisers++;
      p.set(swimmer.x, swimmer.y, swimmer.z);
      north.set(0, 1, 0).projectOnPlane(p).normalize();
      east.crossVectors(north, p).normalize();
      for (let t = 0; t < 600; t += 5) {
        roundAt(swimmer.seed, swimmer.roam, swimmer.speed, 1.7e9 + t, round);
        q.copy(p).addScaledVector(east, round.e / PLANET_RADIUS).addScaledVector(north, round.n / PLANET_RADIUS).normalize();
        if (!isSeaAt(q.x, q.y, q.z)) dry++;
        else if (seaDepthAt(q) < (school ? 1.4 : 2)) shallow++;
      }
    }
  }
  check(schools > 0 && cruisers > 0, 'schools and big swimmers live on the coastal tiles', `${schools} schools, ${cruisers} sharks, rays and turtles`);
  check(dry === 0, 'no fish, shark, ray or turtle swims onto land in ten minutes', `${dry} samples ashore`);
  check(shallow === 0, 'and none over water too shallow for it', `${shallow} samples`);
  const floors = lives.flatMap((life) => life.schools.map((s) => s.floor));
  check(floors.every((f) => f >= SCHOOL_FLOOR), 'schools live over at least SCHOOL_FLOOR', `shallowest ${Math.min(...floors).toFixed(1)}`);
  const cruiserFloors = lives.flatMap((life) => life.cruisers.map((s) => s.floor));
  check(cruiserFloors.every((f) => f >= CRUISER_FLOOR), 'big swimmers over at least CRUISER_FLOOR');
}
{
  // The pods: the whole of every pass, in open water deep enough.
  let pods = 0;
  let bad = 0;
  let dolphins = 0;
  let whales = 0;
  const axis = new THREE.Vector3();
  for (const kind of ['dolphin', 'whale'] as const) {
    for (let row = 4; row < (kind === 'dolphin' ? 68 : 0); row += 3) {
      for (let col = 0; col < 400; col += 7) {
        const pod = podIn(kind, row, col, 12345 + col);
        if (pod === null) continue;
        pods++;
        if (kind === 'dolphin') dolphins++;
        else whales++;
        p.set(pod.x, pod.y, pod.z);
        q.set(pod.hx, pod.hy, pod.hz);
        axis.crossVectors(p, q).normalize();
        for (let k = 0; k <= 20; k++) {
          const at = p.clone().applyAxisAngle(axis, (pod.speed * pod.length * (k / 20)) / PLANET_RADIUS);
          if (!isSeaAt(at.x, at.y, at.z) || seaDepthAt(at) < (kind === 'dolphin' ? DOLPHIN_FLOOR : WHALE_FLOOR) * 0.8) bad++;
        }
      }
    }
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 40; col += 3) {
        if (kind === 'whale' && podIn('whale', row, col, 777) !== null) whales++;
      }
    }
  }
  check(dolphins > 0 && whales > 0, 'dolphins and whales pass', `${dolphins} dolphin pods and ${whales} whales in the cells sampled`);
  check(bad === 0, 'every pass is over open water deep enough, start to end', `${bad} samples of ${pods} passes short`);
}

/* --- the drawn sea ------------------------------------------------------------ */

console.log('\nthe drawn sea');
{
  const { createSea } = await import('../src/seabed.ts');
  const { createSeaLife } = await import('../src/sea-life.ts');
  const sea = createSea(world);
  const fog = new THREE.Fog(0xffffff, 1, 2);
  // Swimming off a Caribbean reef, over five to ten units of water, the camera a body up.
  unitAt(18.36, -64.93, p);
  const north = new THREE.Vector3(0, 1, 0).projectOnPlane(p).normalize();
  const east = new THREE.Vector3().crossVectors(north, p).normalize();
  search: for (let ring = 0; ring < 60; ring++) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      q.copy(p).addScaledVector(north, (Math.cos(a) * ring * 8) / PLANET_RADIUS).addScaledVector(east, (Math.sin(a) * ring * 8) / PLANET_RADIUS).normalize();
      const depth = seaDepthAt(q);
      if (isSeaAt(q.x, q.y, q.z) && depth > 5 && depth < 10) break search;
    }
  }
  p.copy(q);
  const player = p.clone().multiplyScalar(PLANET_RADIUS + 0.5);
  const camera = p.clone().multiplyScalar(PLANET_RADIUS + 8);
  began = performance.now();
  let frames = 0;
  while (frames < 4000 && (sea.stats.window === 0 || sea.stats.building > 0)) {
    sea.update(1 / 60, { player, camera, daylight: 1, fog });
    frames++;
  }
  const ms = performance.now() - began;
  console.log(`  ${frames} frames to build: ${sea.stats.tiles} tiles, ${sea.stats.decor} pieces of decor, window ${sea.stats.window}, ${ms.toFixed(0)} ms, the worst frame's build ${sea.stats.buildMs} ms`);
  check(sea.stats.active && sea.stats.window > 200, 'off a reef the window opens over the floor', `radius ${sea.stats.window}`);
  check(Math.round(seaWindow.uSeaRadius.value) === sea.stats.window, "and the ocean's materials are told");
  const floor = sea.group.getObjectByName('sea-floor') as THREE.Mesh;
  const water = sea.group.getObjectByName('sea-water') as THREE.Mesh;
  const decor = sea.group.getObjectByName('sea-decor') as THREE.Mesh;
  const radii = (mesh: THREE.Mesh): [number, number, number] => {
    const position = mesh.geometry.getAttribute('position');
    let low = Infinity;
    let high = -Infinity;
    let used = 0;
    for (let i = 0; i < position.count; i++) {
      const r = Math.hypot(position.getX(i), position.getY(i), position.getZ(i));
      if (r === 0) continue;
      used++;
      low = Math.min(low, r);
      high = Math.max(high, r);
    }
    return [low - PLANET_RADIUS, high - PLANET_RADIUS, used];
  };
  const [floorLow, floorHigh, floorUsed] = radii(floor);
  const [waterLow, waterHigh] = radii(water);
  const [, decorHigh, decorUsed] = radii(decor);
  check(floorHigh < 0 && floorLow > -OPEN_DEPTH - 10, 'the floor is under the sea', `${floorUsed} vertices, ${floorLow.toFixed(1)} to ${floorHigh.toFixed(2)}`);
  check(waterLow >= surfaceLift(Infinity) - 1e-3 && waterHigh <= surfaceLift(0) + 1e-3, "the water stands on the ribbon's heights", `${waterLow.toFixed(3)} to ${waterHigh.toFixed(3)}`);
  check(decorUsed > 0 && decorHigh < 0, 'the decor is all under the surface', `${decorUsed} vertices, the highest ${decorHigh.toFixed(2)}`);
  // Every decor frame is proper: a mirrored one turns a piece inside out.
  const life = createSeaLife();
  life.update(1 / 60, { camera: player.clone().setLength(PLANET_RADIUS - 3), seconds: 1.7e9, diver: null, screw: null, screwSpeed: 0 }, (visit) => sea.eachLife(visit));
  const fish = life.group.getObjectByName('fish') as THREE.InstancedMesh;
  const m = new THREE.Matrix4();
  const at = new THREE.Vector3();
  let wet = true;
  let proper = true;
  for (let i = 0; i < fish.count; i++) {
    fish.getMatrixAt(i, m);
    if (!(m.determinant() > 0)) proper = false;
    at.setFromMatrixPosition(m);
    if (at.length() >= PLANET_RADIUS - 0.4 || at.length() <= PLANET_RADIUS - seaDepthAt(at)) wet = false;
  }
  check(life.stats.fish > 0, 'fish swim off the reef', `${life.stats.fish} fish in ${life.stats.schools} schools, ${life.stats.calls} draw calls, ${life.stats.updateMs.toFixed(2)} ms`);
  check(wet && proper, 'every fish is in the water, over the floor, and none is mirrored');
  let lifeWorst = 0;
  const lifeCamera = player.clone().setLength(PLANET_RADIUS - 3);
  for (let i = 0; i < 240; i++) {
    life.update(1 / 60, { camera: lifeCamera, seconds: 1.7e9 + i / 60, diver: lifeCamera, screw: null, screwSpeed: 0 }, (visit) => sea.eachLife(visit));
    if (i > 20) lifeWorst = Math.max(lifeWorst, life.stats.updateMs);
  }
  check(lifeWorst < 1, 'the swimmers cost little a frame', `worst ${lifeWorst.toFixed(3)} ms over four seconds, ${life.stats.bubbles} bubbles`);
  const again = createSeaLife();
  again.update(1 / 60, { camera: lifeCamera, seconds: 1.7e9 + 239 / 60, diver: null, screw: null, screwSpeed: 0 }, (visit) => sea.eachLife(visit));
  check(again.snapshot().join('|') === life.snapshot().join('|'), 'the same clock puts every swimmer in the same place, however it got there', `${life.snapshot().length} swimmers`);
  // The camera under the surface: the haze is the water's.
  sea.update(1 / 60, { player, camera: player.clone().setLength(PLANET_RADIUS - 2), daylight: 1, fog });
  check(sea.underwater && fog.far < 200, 'a camera under the surface is under the water', `the haze closes at ${fog.far}`);
  let worst = 0;
  for (let i = 0; i < 120; i++) {
    camera.applyAxisAngle(north, 0.2 / PLANET_RADIUS);
    sea.update(1 / 60, { player, camera, daylight: 1, fog });
    worst = Math.max(worst, sea.stats.updateMs);
  }
  check(worst < 4, 'a frame of it standing costs little', `worst ${worst.toFixed(2)} ms over two seconds, building ${sea.stats.building}`);
  sea.update(1 / 60, { player, camera, daylight: 1, fog });
  check(!sea.underwater, 'and one over it is not');
  // Inland, nothing.
  unitAt(23, 12, p);
  const inland = p.clone().multiplyScalar(PLANET_RADIUS + 400);
  for (let i = 0; i < 40; i++) sea.update(1 / 60, { player: inland, camera: inland, daylight: 1, fog });
  check(!sea.stats.active && sea.stats.window === 0, 'inland the sea is the opaque sea it was');
}

/* --- the submarine ------------------------------------------------------------- */

console.log('\nthe submarine');
{
  const { createSiteIndex, SUBMARINE_SITE_DEPTH } = await import('../src/fleet.ts');
  const { isShown } = await import('../src/places.ts');
  const places = indexPlaces(placesRaw, 0).all;
  const roadsRaw = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
  const roads = roadsRaw.places === places.length ? roadsRaw.roads : [];
  began = performance.now();
  const sites = createSiteIndex({ world, places, roads }).all();
  const subs = sites.filter((site) => site.kind === 'submarine');
  const ms = performance.now() - began;
  const bad = subs.filter((site) => !isSeaAt(site.at.x, site.at.y, site.at.z) || seaDepthAt(site.at) < SUBMARINE_SITE_DEPTH);
  const small = subs.filter((site) => places[site.place]!.pop < 1_000_000 || !isShown(places[site.place]!));
  const names = subs.slice(0, 8).map((site) => `${places[site.place]!.name} (${latOf(site.at.y).toFixed(2)}, ${lonOf(site.at.x, site.at.z).toFixed(2)})`);
  console.log(`  ${subs.length} submarines of ${sites.length} vehicles, ${ms.toFixed(0)} ms: ${names.join(', ')}`);
  check(subs.length >= 10, 'a few big harbours keep a submarine', `${subs.length}`);
  check(bad.length === 0, `every one is moored in the sea over at least ${SUBMARINE_SITE_DEPTH} units`, bad.map((site) => site.id).slice(0, 5).join(', '));
  check(small.length === 0, 'and every one at a built city of a million', small.map((site) => site.id).slice(0, 5).join(', '));
  const dull = subs.filter((site) => !['reef', 'kelp'].includes(seaZoneAt(latOf(site.at.y), coastAt(site.at.x, site.at.y, site.at.z, SEA_REACH, sample).lake)));
  check(dull.length === 0, 'on a sea with a reef or a kelp forest to see', dull.map((site) => site.id).slice(0, 5).join(', '));

  // --- the dive and the submarine, the real player stepped at 60 Hz ---
  const g = globalThis as Record<string, unknown>;
  const PUBLIC = resolve(here, '../public');
  g.fetch = async (url: string) => {
    const bytes = readFileSync(resolve(PUBLIC, `.${String(url).replace(/^[^/]*\/\/[^/]*/, '')}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  await import('./kit-node.ts');
  const { modelsFrom } = await import('../src/kit.ts');
  const { craftFrom } = await import('../src/craft/index.ts');
  const { prepareAvatar } = await import('../src/avatar.ts');
  const { createPlayer, SWIM_SPEED, SWIM_SPRINT } = await import('../src/player.ts');
  const { writePose } = await import('../src/player.ts');
  const { SUB_MAX_DEPTH } = await import('../src/vehicles.ts');
  const craft = craftFrom(await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin'))));
  await prepareAvatar();
  const floorAt = (point: THREE.Vector3): number => PLANET_RADIUS - seaDepthAt(point);
  const player = createPlayer(world, 0, 0, { seaFloorAt: floorAt });
  const heading = new THREE.Vector3();
  const step = (seconds: number, input: { y?: number; run?: boolean; climb?: boolean; dive?: boolean }): void => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      heading.copy(player.forward);
      player.update(1 / 60, { move: { x: 0, y: input.y ?? 0 }, run: input.run ?? false, jump: false, heading, climb: input.climb ?? false, dive: input.dive ?? false });
    }
  };
  // Off the reef, over five to ten units of water.
  unitAt(18.36, -64.93, p);
  const north = new THREE.Vector3(0, 1, 0).projectOnPlane(p).normalize();
  const east = new THREE.Vector3().crossVectors(north, p).normalize();
  search: for (let ring = 0; ring < 60; ring++) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      q.copy(p).addScaledVector(north, (Math.cos(a) * ring * 8) / PLANET_RADIUS).addScaledVector(east, (Math.sin(a) * ring * 8) / PLANET_RADIUS).normalize();
      const depth = seaDepthAt(q);
      if (isSeaAt(q.x, q.y, q.z) && depth > 6 && depth < 10) break search;
    }
  }
  player.goTo(latOf(q.y), lonOf(q.x, q.z));
  check(player.state === 'swim' && player.depth === 0, 'in the water, a swimmer is on the surface', `${player.state}, ${player.depth}`);
  step(2, { y: 1, run: true });
  check(Math.abs(player.velocity - SWIM_SPRINT) < 0.6, 'and sprints at SWIM_SPRINT', `${player.velocity.toFixed(2)} of ${SWIM_SPRINT.toFixed(2)}; swims at ${SWIM_SPEED.toFixed(2)}`);
  step(1.5, { dive: true });
  const dived = player.depth;
  check(dived > 3, 'the descend key dives', `${dived.toFixed(2)} units down in a second and a half`);
  let through = 0;
  for (let t = 0; t < 8; t += 1 / 60) {
    step(1 / 60, { dive: true, y: 1 });
    if (player.position.length() < floorAt(player.position) + 1.2 - 1e-6) through++;
  }
  check(through === 0 && player.depth > dived, 'and never through the floor', `${through} frames under it; ${player.depth.toFixed(2)} down over ${seaDepthAt(player.position).toFixed(2)}`);
  const held = player.depth;
  step(1, {});
  check(player.depth < held && player.depth > held - 1.5, 'let go, a diver drifts slowly up', `${(held - player.depth).toFixed(2)} units in a second`);
  step(4, { climb: true });
  check(player.depth === 0 && player.state === 'swim', 'the climb key brings him to the surface', `${player.depth.toFixed(2)}`);

  const sub = subs[0]!;
  const model = craft.get('submarine')!;
  player.board({ vehicle: sub.id, seat: 0, model, group: model.build(0) }, writePose(sub.at.clone().multiplyScalar(PLANET_RADIUS + 0.5), sub.forward, sub.at, []));
  check(player.mode === 'submarine' && player.depth === 0, 'a submarine is taken at the surface', `${sub.id}, ${places[sub.place]!.name}`);
  step(4, { dive: true, y: 1 });
  const subDepth = player.depth;
  const keelClear = player.position.length() - model.draft - floorAt(player.position);
  check(subDepth > 2 && keelClear > 1.4, 'it dives, its keel clear of the floor', `${subDepth.toFixed(2)} down, the keel ${keelClear.toFixed(2)} over the floor`);
  check(player.leave() === null && player.ride !== null, 'and cannot be left under the surface');
  step(40, { dive: true });
  check(player.depth <= SUB_MAX_DEPTH + 1e-6, 'and goes no deeper than SUB_MAX_DEPTH', `${player.depth.toFixed(1)}`);
  step(15, { climb: true });
  check(player.depth === 0 && player.leave() !== null, 'up to the surface, it can be left', `${player.depth.toFixed(2)}`);
}

console.log(failures === 0 ? '\nall good' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
