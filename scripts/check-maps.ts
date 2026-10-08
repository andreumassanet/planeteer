/**
 * The maps' paper, headless (`src/map-tiles.ts`, `src/map-features.ts`,
 * `src/worlds/map-features.ts`): what a tile is, against the world it is
 * painted from.
 *
 * - **Determinism.** A tile is a pure function of its key: two painters
 *   built apart paint the same bytes, at a ground level and at a street
 *   level with every building on it. A stored tile and a baked level are
 *   only worth keeping because this holds.
 * - **A third party says where the sea is.** Pixels of coastal tiles are
 *   classed land or water by colour and held to `countryAt` at each pixel's
 *   own latitude and longitude — the outlines' point-in-polygon, which never
 *   saw the painter — and the Atlantic is on Lisbon's west, by longitude.
 * - **A building is where its town says it is.** Buildings off a town's
 *   centre are found on the street-level tile at the point its own frame puts
 *   them (`normalize(up + across x + north z)`, through `sphere.ts` and the
 *   projection, not through the painter's affine), in their roof's colour —
 *   and not at their mirror image across the town, which is what a reflected
 *   affine would paint.
 * - **No frame waits on the paper.** A simulated walk across Paris paints the
 *   disc's tiles in `pump`'s slices, and no slice runs past its allowance by
 *   more than one step, measured.
 * - **The store is optional.** Without IndexedDB, or with one that throws,
 *   the store is nothing and every read resolves empty.
 * - **The bake is current and small.** Every world's `public/maps/` stamp is
 *   its painter's, and the whole bake is under `BAKE_LIMIT`.
 * - **A world is drawn by the same pipeline.** Mars: a grid town's building
 *   in its livery's roof where its frame puts it.
 *
 * `pnpm maps-check`.
 */
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { TIME_SCALE } from './time-scale.ts';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { BAKED_LEVELS, MAX_LEVEL, TILE, createTilePainter, uOf, vOf } from '../src/map-tiles.ts';
import type { MapFeatures } from '../src/map-tiles.ts';
import { Raster } from '../src/raster.ts';
import { latLonOf, unitAt } from '../src/sphere.ts';
import { openTileStore } from '../src/tile-store.ts';
import { PLANET_RADIUS } from '../src/globe.ts';
import { OCEAN_COLOR } from '../src/theme.ts';
import { loadEarthFeatures } from './map-node.ts';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

/** The whole bake's ceiling: every world's levels, bytes. */
const BAKE_LIMIT = 4 * 1024 * 1024;
/**
 * How far a slice of `pump` may run past its allowance: the dearest single
 * step a tile takes, ms, with room for a loaded machine — and three times
 * that on CI (`TIME_SCALE`), where a shared runner's pause landed on the
 * worst of 900 slices at 30 to 48 ms (2026-10-07) and failed the job.
 */
const STEP_LIMIT_MS = 25 * TIME_SCALE;

const earth = await loadEarthFeatures();
const { world, places, settlements } = earth;

// --- determinism ----------------------------------------------------------------

console.log('determinism:');
const tileAt = (z: number, lat: number, lon: number): [number, number] => [Math.floor(uOf(lon) * 2 ** z), Math.floor(vOf(lat) * 2 ** z)];
const sameBytes = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  let differ = 0;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) differ++;
  return differ;
};
{
  const one = createTilePainter({ world, features: earth.features });
  const two = createTilePainter({ world, features: earth.features });
  for (const [z, lat, lon, what] of [[3, 46, 8, 'the Alps at level 3'], [6, 48.86, 2.35, 'the Paris basin at level 6'], [8, 48.86, 2.35, 'Paris at level 8, every building on it']] as const) {
    const [i, j] = tileAt(z, lat, lon);
    const a = one.paintNow(z, i, j).raster.data;
    const b = two.paintNow(z, i, j).raster.data;
    check(sameBytes(a, b) === 0, `${what}: two painters, the same bytes`, `${sameBytes(a, b)} bytes differ`);
  }
}

// --- the sea, by a third party ----------------------------------------------------

console.log('the coast against countryAt:');
const ocean = new THREE.Color(OCEAN_COLOR);
const oceanBytes = [ocean.r, ocean.g, ocean.b].map((c) => Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255));
const painter = createTilePainter({ world });
/** Water by colour: the ocean or its shallows, blue over everything, where the land never is. */
const watery = (data: Uint8ClampedArray, x: number, y: number): boolean => {
  const o = (y * TILE + x) * 4;
  const r = data[o]!;
  const g = data[o + 1]!;
  const b = data[o + 2]!;
  return b > r + 40 && b > g + 10;
};
const point = new THREE.Vector3();
for (const [name, lat, lon, z] of [['Lisbon', 38.72, -9.14, 6], ['the Gulf of Finland', 60.1, 24.9, 6], ['Mallorca', 39.6, 2.9, 7], ['Tokyo Bay', 35.5, 139.8, 6]] as const) {
  const [i, j] = tileAt(z, lat, lon);
  const { raster } = painter.paintNow(z, i, j, false);
  let agree = 0;
  let total = 0;
  for (let y = 4; y < TILE; y += 8) {
    for (let x = 4; x < TILE; x += 8) {
      const u = (i + x / TILE) / 2 ** z;
      const v = (j + y / TILE) / 2 ** z;
      const lonAt = u * 360 - 180;
      const latAt = (2.5 * Math.atan(Math.exp(0.8 * (1.25 * Math.log(Math.tan(Math.PI / 4 + 0.2 * Math.PI)) - v * 2 * Math.PI))) - 0.625 * Math.PI) * (180 / Math.PI);
      const land = world.countryAtPoint(unitAt(latAt, lonAt, point)) > 0;
      // A pixel a step from the coast either way is the anti-aliasing's: left out.
      let mixed = false;
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]] as const) {
        const near = world.countryAtPoint(unitAt(latAt - (dy * 360) / (TILE * 2 ** z) * 0.5, lonAt + (dx * 360) / (TILE * 2 ** z), point)) > 0;
        if (near !== land) mixed = true;
      }
      if (mixed) continue;
      total++;
      if (watery(raster.data, x, y) !== land) agree++;
    }
  }
  check(total > 100 && agree / total > 0.97, `${name}: the painted water is countryAt's`, `${agree}/${total}`);
}
{
  // Lisbon: the Atlantic is to its west, by longitude alone.
  const z = 7;
  const [i, j] = tileAt(z, 38.72, -9.14);
  const { raster } = painter.paintNow(z, i, j, false);
  const west = { x: 0, y: 0 };
  const eastward = { x: 0, y: 0 };
  const px = (lat: number, lon: number, out: { x: number; y: number }): void => {
    out.x = Math.round((uOf(lon) * 2 ** z - i) * TILE);
    out.y = Math.round((vOf(lat) * 2 ** z - j) * TILE);
  };
  px(38.72, -9.75, west);
  px(38.72, -8.7, eastward);
  const inside = (p: { x: number; y: number }): boolean => p.x >= 0 && p.y >= 0 && p.x < TILE && p.y < TILE;
  check(inside(west) && inside(eastward) && watery(raster.data, west.x, west.y) && !watery(raster.data, eastward.x, eastward.y), "the Atlantic is on Lisbon's west, and Portugal on its east");
  void oceanBytes;
}

// --- buildings where their towns put them ---------------------------------------------

console.log('a town as it stands:');
{
  const z = MAX_LEVEL;
  const streetPainter = createTilePainter({ world, features: earth.features });
  for (const name of ['Paris', 'Toulouse', 'Kyoto', 'Nairobi']) {
    const index = places.findIndex((place) => place.name === name);
    const plan = index < 0 ? null : settlements.townPlanNow(index);
    if (plan === null || plan.buildings.length === 0) {
      check(false, `${name} has a plan with buildings`);
      continue;
    }
    // Every building with its centre in the plan's outer half, where a mirror would move it far.
    let found = 0;
    let mirrored = 0;
    let tried = 0;
    const tiles = new Map<string, Uint8ClampedArray>();
    const pixelAt = (lat: number, lon: number): [number, number, number] | null => {
      const fu = uOf(lon) * 2 ** z;
      const fv = vOf(lat) * 2 ** z;
      const i = Math.floor(fu);
      const j = Math.floor(fv);
      const key = `${i}:${j}`;
      let data = tiles.get(key);
      if (data === undefined) {
        data = streetPainter.paintNow(z, i, j).raster.data;
        tiles.set(key, data);
      }
      const x = Math.floor((fu - i) * TILE);
      const y = Math.floor((fv - j) * TILE);
      const o = (y * TILE + x) * 4;
      return [data[o]!, data[o + 1]!, data[o + 2]!];
    };
    const ll = { lat: 0, lon: 0 };
    const at = new THREE.Vector3();
    const where = (x: number, zz: number): { lat: number; lon: number } => {
      at.copy(plan.up).addScaledVector(plan.across, x / PLANET_RADIUS).addScaledVector(plan.north, zz / PLANET_RADIUS).normalize();
      return { ...latLonOf(at, ll) };
    };
    const reach = plan.grid.half * 0.35;
    for (let k = 0; k < plan.buildings.length / 6 && tried < 24; k++) {
      const x = plan.buildings[k * 6]!;
      const zz = plan.buildings[k * 6 + 1]!;
      if (Math.abs(x) < reach || Math.min(plan.buildings[k * 6 + 4]!, plan.buildings[k * 6 + 5]!) < 2) continue;
      tried++;
      const roof = plan.roofs[k]!;
      const want = [(roof >> 16) & 0xff, (roof >> 8) & 0xff, roof & 0xff];
      const close = (rgb: [number, number, number] | null): boolean => rgb !== null && Math.abs(rgb[0] - want[0]!) + Math.abs(rgb[1] - want[1]!) + Math.abs(rgb[2] - want[2]!) < 12;
      const p = where(x, zz);
      if (close(pixelAt(p.lat, p.lon))) found++;
      // Across the town's own north-south line, where a reflected affine would have put it.
      const m = where(-x, zz);
      if (close(pixelAt(m.lat, m.lon))) mirrored++;
    }
    check(tried >= 4 && found >= tried * 0.85, `${name}: its buildings stand in their roofs' colours where its frame puts them`, `${found}/${tried}`);
    check(mirrored < Math.max(2, tried * 0.3), `${name}: and not at their mirror images`, `${mirrored}/${tried}`);
  }
}

// --- the frame's allowance ------------------------------------------------------------

console.log('a walk across Paris, the paper painted in slices:');
{
  // The browser's arrangement: a plan is asked and answered later (here,
  // between two frames), the disc's tiles painted `budget` ms a frame.
  const asked = new Set<number>();
  const known = new Map<number, ReturnType<typeof settlements.townPlanNow>>();
  const { createEarthFeatures } = await import('../src/map-features.ts');
  const features: MapFeatures = createEarthFeatures({
    world,
    places,
    roads: earth.roads,
    rails: earth.rails,
    landmarks: earth.landmarks,
    planesNear: (d, r, o) => earth.sites.planesNear(d, r, o as never),
    stripsReady: (d, r, more) => earth.sites.warm(d, r, more),
    pads: (d, r, o) => {
      const until = performance.now() + 1;
      return earth.pads.padsWithin(d, r, o as never, () => performance.now() < until);
    },
    countryside: () => earth.countryside,
    plans: (i) => {
      if (known.has(i)) return known.get(i)!;
      asked.add(i);
      return undefined;
    },
  });
  const walker = createTilePainter({ world, features });
  const budget = 4;
  const jobs = new Map<string, Generator<'wait' | undefined, void, void>>();
  const done = new Set<string>();
  const slices: number[] = [];
  let painted = 0;
  for (let frame = 0; frame < 900; frame++) {
    // East along the Seine at a run, 20 units a second, sixty frames a second.
    const lon = 2.25 + (frame * 20) / 60 / (PLANET_RADIUS * (Math.PI / 180) * Math.cos(48.86 * (Math.PI / 180)));
    const z = 8;
    const [ci, cj] = tileAt(z, 48.86, lon);
    const began = performance.now();
    outer: for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = `${ci + di}:${cj + dj}`;
      if (done.has(key)) continue;
      let job = jobs.get(key);
      if (job === undefined) {
        job = walker.paint(z, ci + di, cj + dj, new Raster(TILE, TILE), { hurry: false, incomplete: false });
        jobs.set(key, job);
      }
      for (;;) {
        const step = job.next();
        if (step.done === true) {
          done.add(key);
          painted++;
          break;
        }
        if (step.value === 'wait') break;
        if (performance.now() - began >= budget) break outer;
      }
    }
    slices.push(performance.now() - began);
    // Between frames, the plans asked for are worked out (the settlements' own far job).
    for (const index of asked) known.set(index, settlements.townPlanNow(index));
    asked.clear();
  }
  slices.sort((a, b) => a - b);
  const p95 = slices[Math.floor(slices.length * 0.95)]!;
  const worst = slices[slices.length - 1]!;
  check(painted >= 8, 'the disc keeps up with a runner', `${painted} tiles painted in 15 s`);
  check(worst <= budget + STEP_LIMIT_MS, `no slice runs past its ${budget} ms by more than one step`, `p95 ${p95.toFixed(1)} ms, worst ${worst.toFixed(1)} ms`);
}

// --- the store ----------------------------------------------------------------------

console.log('the store:');
{
  check(openTileStore('x') === null, 'without IndexedDB there is no store, and nothing else changes');
  const saved = (globalThis as { indexedDB?: unknown }).indexedDB;
  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open() {
      throw new Error('blocked');
    },
  };
  const store = openTileStore('x');
  const read = store === null ? null : await store.get('x/0/0/0');
  store?.put('x/0/0/0', new Blob([]));
  check(store !== null && read === null, 'with an IndexedDB that throws, every read is empty and a write is dropped');
  (globalThis as { indexedDB?: unknown }).indexedDB = saved;
}

// --- the bake -----------------------------------------------------------------------

console.log('the bake:');
{
  const root = resolve(here, '../public/maps');
  let bytes = 0;
  const stampOk = (id: string, stamp: string): boolean => {
    const file = resolve(root, id, 'stamp.txt');
    return existsSync(file) && readFileSync(file, 'utf8').trim() === stamp;
  };
  check(stampOk('earth', painter.groundStamp), "Earth's bake is its painter's", painter.groundStamp);
  const { WORLD_IDS, loadWorldSpec } = await import('../src/worlds/registry.ts');
  const { createTerrain } = await import('../src/worlds/terrain.ts');
  const { surfaceOf } = await import('../src/worlds/surface.ts');
  const { geographyOf } = await import('../src/system/geography.ts');
  const stale: string[] = [];
  for (const id of WORLD_IDS) {
    const spec = await loadWorldSpec(id);
    const geography = geographyOf(spec.body);
    const stamp = createTilePainter({ world: geography.world, surface: surfaceOf(createTerrain(spec), geography) }).groundStamp;
    if (!stampOk(id, stamp)) stale.push(id);
  }
  check(stale.length === 0, "every world's bake is its painter's", stale.length > 0 ? `stale: ${stale.join(', ')} — run \`pnpm maps\`` : '');
  for (const id of existsSync(root) ? readdirSync(root) : []) {
    for (let z = 0; z < BAKED_LEVELS; z++) {
      const file = resolve(root, id, `z${z}.png`);
      if (existsSync(file)) bytes += statSync(file).size;
    }
  }
  check(bytes > 0 && bytes < BAKE_LIMIT, `the bake is under ${BAKE_LIMIT / 1048576} MB`, `${(bytes / 1024).toFixed(0)} KB`);
}

// --- a world ---------------------------------------------------------------------------

console.log('Mars, by the same pipeline:');
{
  const { loadWorldSpec } = await import('../src/worlds/registry.ts');
  const { createTerrain } = await import('../src/worlds/terrain.ts');
  const { surfaceOf } = await import('../src/worlds/surface.ts');
  const { geographyOf } = await import('../src/system/geography.ts');
  const { createSettlements } = await import('../src/worlds/settlements.ts');
  const { createWorldFeatures } = await import('../src/worlds/map-features.ts');
  const { createSceneryContext } = await import('../src/scenery/contract.ts');
  const { createToonRamp } = await import('../src/theme.ts');
  const { planOf } = await import('../src/worlds/town-grid.ts');
  const { liveryOf } = await import('../src/worlds/kit.ts');
  const { rngFrom } = await import('../src/scenery/random.ts');
  const { DEFAULT_ARCHITECTURE } = await import('../src/worlds/contract.ts');
  const spec = await loadWorldSpec('mars');
  const terrain = createTerrain(spec);
  const geography = geographyOf(spec.body);
  const surface = surfaceOf(terrain, geography);
  const towns = createSettlements(spec, terrain, createSceneryContext(), createToonRamp(4));
  const features = createWorldFeatures({ spec, settlements: towns, roads: () => [], pads: () => [], saucers: () => [] });
  const marsPainter = createTilePainter({ world: geography.world, surface, features });
  const site = towns.sites.find((one) => one.town !== null && one.town.plots.some((plot) => plot.kind === 'module'));
  if (site === undefined) check(false, 'Mars has a grid town');
  else {
    const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
    const z = MAX_LEVEL;
    let found = 0;
    let tried = 0;
    const ll = { lat: 0, lon: 0 };
    const at = new THREE.Vector3();
    for (const plot of site.town!.plots) {
      if (plot.kind !== 'module' || tried >= 12) continue;
      const [across, deep] = planOf(plot.form, plot.scale);
      if (Math.min(across, deep) < 3) continue;
      tried++;
      towns.toWorld(site, plot.x, 0, plot.z, at);
      latLonOf(at, ll);
      const fu = uOf(ll.lon) * 2 ** z;
      const fv = vOf(ll.lat) * 2 ** z;
      const i = Math.floor(fu);
      const j = Math.floor(fv);
      const data = marsPainter.paintNow(z, i, j).raster.data;
      const o = (Math.floor((fv - j) * TILE) * TILE + Math.floor((fu - i) * TILE)) * 4;
      const roof = liveryOf(style, rngFrom('worlds', spec.id, 'building', plot.seed)).roof;
      const d = Math.abs(data[o]! - ((roof >> 16) & 0xff)) + Math.abs(data[o + 1]! - ((roof >> 8) & 0xff)) + Math.abs(data[o + 2]! - (roof & 0xff));
      if (d < 12) found++;
    }
    check(tried >= 3 && found >= tried * 0.8, `${site.name}: its buildings in their liveries' roofs where its frame puts them`, `${found}/${tried}`);
  }
}

console.log(failures === 0 ? '\nall maps checks pass' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
