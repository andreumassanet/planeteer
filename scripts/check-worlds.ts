/**
 * Headless assertions over the other worlds: what `src/worlds/` builds when a
 * traveller stands on the Moon, Mars or a giant's cloud deck.
 *
 * `check-system.ts` holds the bodies to the real solar system; this holds the
 * walking of them to the engine's own contract, and every section is a class
 * of error a screenshot would not show:
 *
 * 1. **The first load.** Nothing in `src/main.ts`'s static import graph may
 *    reach `src/worlds/` or `src/system/`: Earth's first load is measured and
 *    may not move. Walked from the source, imports only, `import type` left out.
 * 2. **The cube.** Every face's `u x v` is its outward axis (a face wound the
 *    other way is a face drawn inside out), and `facePoint` inverts `faceDir`.
 * 3. **Each world**, built twice from its spec:
 *    - the spec's colours are all palette entries and its crater classes fit
 *      their lattice;
 *    - the ground is deterministic, finite, inside its declared bounds, and
 *      continuous — no tear between two points a hair apart, and none across
 *      a cube face's edge;
 *    - every town stands on its own levelled pad and no two pads overlap;
 *    - the towns' buildings clear each other and the avenues, inside budget;
 *    - the ground drawn round the spawn is inside its triangle budget;
 *    - the sky's clock lands on the hour it is asked for; the seasons are
 *      the real ones (the Sun's latitude on a date, against the almanac);
 *      the Moon's Earth stays over 0 N 0 E; every moon and sky layer is
 *      where it says, finite, and the same twice;
 *    - the species' script is deterministic, its glyphs all different, and no
 *      two species share a glyph; every phrase writes;
 *    - the aliens and the craft build, deterministically, inside budget;
 *    - **every town's arrival** (`arrival.ts`), which is where the menu puts
 *      a traveller down: on the town's paving, clear of every wall, on ground
 *      under 15 degrees, with every craft that waits there at least
 *      `PARKING_CLEAR` away and standing clear of the walls itself, and the
 *      way in to the square in sight; the capital that `?world=` lands in
 *      exists; the clock the world starts on is the menu's (`localHour`), and
 *      ten in the morning is daylight wherever the sun rises at all;
 *    - the political map: every ring edge a frontier or a cut, the frontiers
 *      each drawn once by two rings (`surface.ts`), every town in its own
 *      nation's colour on the ground, and the borders built inside budget.
 * 4. **The shell**, the game around a world (`shell.ts`), built over a fake
 *    page against Mars and taken down again: every key, resize and page
 *    listener it added let go, the minimap's canvas off the page, and a
 *    second shell built after it answering alone.
 *
 * `node scripts/check-worlds.ts`, or `pnpm worlds`; `node scripts/check-worlds.ts mars`
 * checks one world.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { WORLD_IDS, loadWorldSpec } from '../src/worlds/registry.ts';
import type { WorldSpec } from '../src/worlds/contract.ts';
import { WORLD_TOWN_GAP, WORLD_TOWN_MAX, WORLD_TOWN_MIN, WORLD_TOWN_SCALE, angularDistance, surfaceRadiusOf, townRadii, worldTownLaw } from '../src/system/contract.ts';
import { createTerrain } from '../src/worlds/terrain.ts';
import type { Terrain } from '../src/worlds/terrain.ts';
import { FACES, TILE_SEGMENTS, faceDir, facePoint } from '../src/worlds/cube.ts';
import { createGround } from '../src/worlds/tiles.ts';
import { createDecor } from '../src/worlds/decor.ts';
import { createSettlements, layoutOf } from '../src/worlds/settlements.ts';
import type { Site } from '../src/worlds/settlements.ts';
import { createSky } from '../src/worlds/sky.ts';
import { createRoads, roadNetwork } from '../src/worlds/roads.ts';
import { scriptOf, svgOf, writeLine } from '../src/worlds/glyphs.ts';
import { bodyOf } from '../src/worlds/aliens.ts';
import { createCraft } from '../src/worlds/craft.ts';
import { BODY_RADIUS, EARTH_GRAVITY, JUMP_SPEED } from '../src/worlds/player.ts';
import { PARKING_CLEAR, capitalOf, parkingOf, siteAt } from '../src/worlds/arrival.ts';
import { arrivalOf } from '../src/worlds/settlements.ts';
import { frontierEdges, outlinesOf, surfaceOf } from '../src/worlds/surface.ts';
import { createFrontiers } from '../src/worlds/frontiers.ts';
import { geographyOf, localHour } from '../src/system/geography.ts';
import { BUDGETS, validateBody } from '../src/system/contract.ts';
import { createSceneryContext } from '../src/scenery/contract.ts';
import { radiusFor } from '../src/places.ts';
import { PALETTE, createToonRamp } from '../src/theme.ts';
import { latLonOf, unitAt } from '../src/sphere.ts';

let failures = 0;
const fail = (message: string): void => {
  failures++;
  console.log(`  FAIL  ${message}`);
};

const ROOT = resolve(import.meta.dirname, '..');
const only = process.argv[2];

// ===========================================================================
// 1. The first load
// ===========================================================================

console.log('=== Earth\'s first load ===\n');
{
  const seen = new Set<string>();
  const queue = [resolve(ROOT, 'src/main.ts')];
  // Static imports and re-exports, `import type` and `export type` left out:
  // they are erased. A dynamic `import()` is a separate chunk and is not followed.
  const IMPORT = /(?:^|\n)\s*import\s+(?!type\b)(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const EXPORT = /(?:^|\n)\s*export\s+(?!type\b)(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s+['"]([^'"]+)['"]/g;
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const pattern of [IMPORT, EXPORT]) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
        const spec = match[1]!;
        if (!spec.startsWith('.')) continue;
        const target = resolve(dirname(file), spec);
        if (existsSync(target)) queue.push(target);
      }
    }
  }
  const leaked = [...seen].filter((file) => file.includes('/src/worlds/') || file.includes('/src/system/'));
  console.log(`  ${seen.size} modules in main.ts's static graph`);
  for (const file of leaked) fail(`${file.slice(ROOT.length + 1)} is in Earth's first load`);
  const main = readFileSync(resolve(ROOT, 'src/main.ts'), 'utf8');
  if (!main.includes("import('./worlds/index.ts')") && !main.includes("'./worlds/index.ts'")) {
    fail('main.ts never reaches src/worlds/index.ts');
  }
}

// ===========================================================================
// 2. The cube
// ===========================================================================

console.log('\n=== the cube ===\n');
{
  FACES.forEach((face, k) => {
    const [ax, ay, az] = face.axis;
    const [ux, uy, uz] = face.u;
    const [vx, vy, vz] = face.v;
    const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    if (cross[0]! * ax + cross[1]! * ay + cross[2]! * az <= 0.99) fail(`face ${k}: u x v is not its outward axis — its tiles are inside out`);
  });
  const dir = { x: 0, y: 0, z: 0 };
  const point = { face: 0, u: 0, v: 0 };
  let worst = 0;
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const u = -0.999 + (1.998 * i) / 10;
        const v = -0.999 + (1.998 * j) / 10;
        faceDir(face, u, v, dir);
        facePoint(dir.x, dir.y, dir.z, point);
        if (point.face === face) worst = Math.max(worst, Math.abs(point.u - u), Math.abs(point.v - v));
      }
    }
  }
  console.log(`  faceDir -> facePoint round trip: worst ${worst.toExponential(2)}`);
  if (worst > 1e-9) fail(`facePoint does not invert faceDir (worst ${worst})`);
}

// ===========================================================================
// 3. Each world
// ===========================================================================

const PALETTE_COLORS = new Set<number>(Object.values(PALETTE));
const ctx = createSceneryContext();
const gradientMap = createToonRamp(4);
const scriptsBySpecies = new Map<string, Set<string>>();

function fibonacci(count: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const a = i * golden;
    out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return out;
}

function trianglesOf(object: THREE.Object3D): number {
  let total = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const geometry = mesh.geometry;
    total += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  });
  return total;
}

function fingerprint(geometry: THREE.BufferGeometry): string {
  const position = geometry.getAttribute('position').array as Float32Array;
  let h = 0;
  for (let i = 0; i < position.length; i++) h = (Math.imul(h, 31) + Math.round(position[i]! * 1000)) | 0;
  return `${position.length}:${h}`;
}

function colours(spec: WorldSpec): [string, number][] {
  const out: [string, number][] = [
    ['sky.horizon', spec.sky.horizon],
    ['sky.zenith', spec.sky.zenith],
    ['sky.light', spec.sky.light],
    ['palette.base', spec.palette.base],
    ['palette.steep', spec.palette.steep],
    ...spec.palette.bands.map((c, k): [string, number] => [`palette.bands[${k}]`, c]),
    ...Object.entries(spec.palette.biomes).map(([id, c]): [string, number] => [`palette.biomes.${id}`, c]),
    ...spec.ambient.map((a, k): [string, number] => [`ambient[${k}]`, a.color]),
    ...spec.sky.moons.map((m): [string, number] => [`sky.moons.${m.name}`, m.color]),
  ];
  const style = spec.civilisation?.architecture;
  if (style !== undefined) {
    for (const key of ['walls', 'roofs', 'accents'] as const) style[key].forEach((c, k) => out.push([`architecture.${key}[${k}]`, c]));
    out.push(['architecture.ground', style.ground]);
  }
  return out;
}

function checkGround(spec: WorldSpec, terrain: Terrain, again: Terrain): void {
  const points = fibonacci(4000);
  let low = Infinity;
  let high = -Infinity;
  let mismatched = 0;
  let worstTear = 0;
  let tearAt = '';
  const step = 0.05 / terrain.radius;
  const scratch = new THREE.Vector3();
  const began = performance.now();
  for (const p of points) {
    const h = terrain.heightAt(p.x, p.y, p.z);
    if (!Number.isFinite(h)) {
      fail(`${spec.id}: the ground is ${h} at ${p.toArray().map((v) => v.toFixed(3))}`);
      return;
    }
    if (h !== again.heightAt(p.x, p.y, p.z)) mismatched++;
    low = Math.min(low, h);
    high = Math.max(high, h);
    // A hair away, the ground may rise by its steepest slope and no more.
    scratch.set(p.x + step * 0.7, p.y - step * 0.5, p.z + step * 0.5).normalize();
    const tear = Math.abs(terrain.heightAt(scratch.x, scratch.y, scratch.z) - h);
    if (tear > worstTear) {
      worstTear = tear;
      tearAt = p.toArray().map((v) => v.toFixed(4)).join(', ');
    }
  }
  const perSample = (performance.now() - began) / (points.length * 3);
  console.log(
    `  ground: ${low.toFixed(1)} to ${high.toFixed(1)} over the radius (bounds ${terrain.low.toFixed(1)} to ${terrain.high.toFixed(1)}),` +
      ` worst rise over 0.05 units ${worstTear.toFixed(3)}, ${(perSample * 1000).toFixed(1)} us a sample`,
  );
  if (mismatched > 0) fail(`${spec.id}: ${mismatched} of ${points.length} heights differ between two builds of the same spec`);
  if (low < terrain.low || high > terrain.high) fail(`${spec.id}: the ground leaves its declared bounds (${low.toFixed(1)}..${high.toFixed(1)})`);
  // Steeper than a 60-degree wall over a twentieth of a unit is a tear, not a slope.
  if (worstTear > 0.1) fail(`${spec.id}: the ground tears by ${worstTear.toFixed(3)} over 0.05 units at (${tearAt})`);

  // Across a cube face's edge: the drawn surface on both sides of it.
  const dir = { x: 0, y: 0, z: 0 };
  let worstSeam = 0;
  for (let k = 0; k <= 40; k++) {
    const v = -0.98 + (1.96 * k) / 40;
    faceDir(0, 0.99999, v, dir);
    const a = terrain.groundAt(dir.x, dir.y, dir.z);
    faceDir(0, 1, v, dir);
    const b = terrain.groundAt(dir.x * 1.0, dir.y, dir.z + 1e-9);
    worstSeam = Math.max(worstSeam, Math.abs(a - b));
  }
  if (worstSeam > 0.5) fail(`${spec.id}: the drawn ground steps by ${worstSeam.toFixed(3)} across a cube face's edge`);

  // The drawn surface against the field, at the field's own vertices: equal.
  let worstVertex = 0;
  const grid = 2 / ((1 << terrain.levels) * TILE_SEGMENTS);
  for (let k = 0; k < 200; k++) {
    const face = k % 6;
    const i = (k * 7919) % ((1 << terrain.levels) * TILE_SEGMENTS);
    const j = (k * 104729) % ((1 << terrain.levels) * TILE_SEGMENTS);
    faceDir(face, -1 + i * grid, -1 + j * grid, dir);
    worstVertex = Math.max(worstVertex, Math.abs(terrain.groundAt(dir.x, dir.y, dir.z) - terrain.heightAt(dir.x, dir.y, dir.z)));
  }
  if (worstVertex > 1e-6) fail(`${spec.id}: the drawn ground misses the field at its own vertices by ${worstVertex}`);
}

/** The most triangles one built town may cost. */
const TOWN_TRIANGLE_CAP = 150000;

function checkTowns(spec: WorldSpec, terrain: Terrain): void {
  const body = spec.body;
  const pads = terrain.pads;
  // Pads apart.
  for (let a = 0; a < pads.length; a++) {
    for (let b = a + 1; b < pads.length; b++) {
      const A = pads[a]!;
      const B = pads[b]!;
      const d = Math.acos(Math.min(1, A.x * B.x + A.y * B.y + A.z * B.z)) * terrain.radius;
      if (d < A.reach + B.reach) fail(`${spec.id}: ${A.id} and ${B.id} are ${d.toFixed(0)} units apart and their pads overlap`);
    }
  }
  // Each town on its own plane.
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const probe = new THREE.Vector3();
  let worstFloor = 0;
  let worstAt = '';
  for (const pad of pads) {
    up.set(pad.x, pad.y, pad.z);
    side.set(up.y, -up.x, 0.4).addScaledVector(up, -up.dot(side)).normalize();
    for (let k = 0; k < 8; k++) {
      const out = pad.radius * 0.9 * (k / 7);
      probe.copy(up).multiplyScalar(terrain.radius + pad.height).addScaledVector(side.clone().applyAxisAngle(up, k * 0.8), out);
      const plane = probe.length() - terrain.radius;
      probe.normalize();
      const off = Math.abs(terrain.groundAt(probe.x, probe.y, probe.z) - plane);
      if (off > worstFloor) {
        worstFloor = off;
        worstAt = pad.id;
      }
    }
  }
  if (pads.length > 0) console.log(`  towns: ${pads.length} pads, worst ground off its town's plane ${worstFloor.toFixed(3)} (${worstAt})`);
  if (worstFloor > 0.35) fail(`${spec.id}: ${worstAt}'s ground is ${worstFloor.toFixed(2)} off its own floor`);

  // The layouts: buildings clear of each other and of the avenues.
  for (const place of body.settlements) {
    const radius = townRadii(body, spec.landmarks).get(place.id)!;
    const { plots, avenues, plaza } = layoutOf(spec, place.id, radius, false);
    const again = layoutOf(spec, place.id, radius, false);
    if (JSON.stringify(plots) !== JSON.stringify(again.plots)) fail(`${spec.id}: ${place.id}'s layout differs between two calls`);
    for (const plot of plots.slice(1)) {
      const d = Math.hypot(plot.x, plot.z);
      if (d < plaza) fail(`${spec.id}: a building of ${place.id} stands in its square`);
      for (const avenue of avenues) {
        const along = plot.x * Math.sin(avenue) + plot.z * Math.cos(avenue);
        const off = Math.abs(plot.x * Math.cos(avenue) - plot.z * Math.sin(avenue));
        if (along > 0 && off < 4) fail(`${spec.id}: a building of ${place.id} stands on an avenue`);
      }
    }
  }
}

function checkBuilt(spec: WorldSpec, terrain: Terrain): void {
  // Every town built, merged, and inside its budget; its footprints clear.
  const settlements = createSettlements(spec, terrain, ctx, gradientMap);
  let worst = 0;
  let worstName = '';
  const began = performance.now();
  for (const site of settlements.sites) {
    settlements.prime(site.origin);
    if (site.mesh === null) {
      fail(`${spec.id}: ${site.id} did not build`);
      continue;
    }
    const triangles = trianglesOf(site.mesh);
    if (triangles > worst) {
      worst = triangles;
      worstName = site.id;
    }
    for (let a = 0; a < site.footprints.length; a++) {
      for (let b = a + 1; b < site.footprints.length; b++) {
        const A = site.footprints[a]!;
        const B = site.footprints[b]!;
        if (Math.hypot(A.x - B.x, A.z - B.z) < (A.radius + B.radius) * 0.92) {
          fail(`${spec.id}: two buildings of ${site.id} stand inside each other (${A.radius.toFixed(1)} and ${B.radius.toFixed(1)} at ${Math.hypot(A.x - B.x, A.z - B.z).toFixed(1)})`);
        }
      }
      const f = site.footprints[a]!;
      if (Math.hypot(f.x, f.z) + f.radius > site.paving + 6) fail(`${spec.id}: a building of ${site.id} hangs off its paving`);
    }
  }
  if (settlements.sites.length > 0) {
    console.log(`  built ${settlements.sites.length} towns in ${(performance.now() - began).toFixed(0)} ms, the largest ${worst} triangles (${worstName})`);
  }
  // A grid town of the biggest size is a city of three hundred lots: the kit's
  // modules in its middle and the people's own forms round them
  // (`town-grid.ts`'s budget). Earth draws two million triangles in Palma;
  // two or three of these at once are a few hundred thousand.
  if (worst > TOWN_TRIANGLE_CAP) fail(`${spec.id}: ${worstName} is ${worst} triangles, over the ${TOWN_TRIANGLE_CAP.toLocaleString('en')} a town may cost`);
  settlements.dispose();
}

function checkDrawn(spec: WorldSpec, terrain: Terrain): void {
  const eye = new THREE.Vector3();
  const pad = terrain.pads[0];
  if (pad !== undefined) eye.set(pad.x, pad.y, pad.z);
  else unitAt(10, 20, eye);
  eye.setLength(terrain.radius + terrain.heightAt(eye.x, eye.y, eye.z) + 8);
  const ground = createGround(terrain, { gradientMap, decorate: createDecor(spec, terrain, ctx) });
  const began = performance.now();
  ground.prime(eye);
  const ms = performance.now() - began;
  console.log(
    `  ground from 8 units up: ${ground.stats.drawn} tiles drawn of ${ground.stats.built} built, ${ground.stats.triangles.toLocaleString('en')} triangles,` +
      ` ${ms.toFixed(0)} ms, ${ground.stats.buildMs.toFixed(1)} ms a tile`,
  );
  // Every tile over the horizon, all round: the frustum draws about a third.
  if (ground.stats.triangles > 600000) fail(`${spec.id}: the ground on foot is ${ground.stats.triangles} triangles all round, over 600,000`);
  if (ground.stats.buildMs > 60) fail(`${spec.id}: a tile takes ${ground.stats.buildMs.toFixed(1)} ms to build, over 60`);
  // From high up, the planet whole, and cheap.
  eye.setLength(terrain.radius * 2.5);
  ground.prime(eye);
  if (ground.stats.triangles > 200000) fail(`${spec.id}: the planet from orbit is ${ground.stats.triangles} triangles`);
  ground.dispose();
}

/**
 * Where the Sun stands over a body on a date, from outside this code: the
 * subsolar latitude the almanacs give, degrees, and how far off it may be.
 * Saturn's rings opened to the south after the equinox of May 2025; Mars's
 * northern spring began on 2026-09-29 (Ls 0); Uranus's north is three
 * and a half years from its 2030 solstice.
 */
const SEASONS: Readonly<Record<string, { date: string; lat: number; within: number }>> = {
  saturn: { date: '2026-10-01T00:00:00Z', lat: -7.5, within: 2 },
  mars: { date: '2026-09-29T12:00:00Z', lat: 0, within: 1.5 },
  uranus: { date: '2026-10-01T00:00:00Z', lat: 73, within: 4 },
  jupiter: { date: '2026-10-01T00:00:00Z', lat: 0, within: 3.2 },
};

function checkSky(spec: WorldSpec, terrain: Terrain): void {
  const scene = new THREE.Scene();
  const sky = createSky(spec, scene);
  const here = new THREE.Vector3();
  const date = new Date('2026-10-01T12:00:00Z');
  for (const [lat, lon] of [[0, 0], [20, -120], [-35, 70]] as const) {
    unitAt(lat, lon, here).multiplyScalar(terrain.radius);
    for (const hour of [10, 16]) {
      sky.setHour(hour, date, here);
      sky.update(date, here, here, 1);
      const off = Math.abs(((sky.state.hour - hour + 36) % 24) - 12);
      if (off > 0.05) fail(`${spec.id}: asked for ${hour}:00 at ${lat},${lon} and the sky says ${sky.state.hour.toFixed(2)}`);
      if (hour === 10 && Math.abs(lat) < 30 && Math.abs(spec.body.tiltDeg) < 30 && sky.state.day < 0.5) {
        fail(`${spec.id}: 10:00 at ${lat},${lon} is dark (day ${sky.state.day.toFixed(2)})`);
      }
    }
  }
  const notes: string[] = [];

  // The seasons: which way the pole leans, against the almanac.
  const season = SEASONS[spec.id];
  if (season !== undefined) {
    unitAt(0, 0, here).multiplyScalar(terrain.radius);
    sky.update(new Date(season.date), here, here, 1);
    const lat = (Math.asin(sky.state.sun.y) * 180) / Math.PI;
    if (Math.abs(lat - season.lat) > season.within) {
      fail(`${spec.id}: on ${season.date.slice(0, 10)} the Sun is over ${lat.toFixed(1)} and the almanac says ${season.lat}`);
    }
    notes.push(`the Sun over ${lat.toFixed(1)} on ${season.date.slice(0, 10)}`);
  }

  // A locked world: its parent hangs over the sub-parent point all month,
  // rocking only by the librations, and goes through its phases.
  if (spec.body.locked === true) {
    unitAt(0, 0, here).multiplyScalar(terrain.radius);
    const up = here.clone().normalize();
    let worst = 0;
    let least = 1;
    let most = 0;
    for (let hours = 0; hours <= 30 * 24; hours += 6) {
      sky.update(new Date(date.getTime() + hours * 3600000), here, here, 1);
      const parent = sky.moons.find((one) => one.name === 'Earth');
      if (parent === undefined) {
        fail(`${spec.id}: locked, and there is no Earth in its sky`);
        break;
      }
      worst = Math.max(worst, (Math.acos(Math.min(1, parent.direction.dot(up))) * 180) / Math.PI);
      least = Math.min(least, parent.lit);
      most = Math.max(most, parent.lit);
    }
    if (worst > 8) fail(`${spec.id}: Earth wanders ${worst.toFixed(1)} degrees from the zenith of 0 N 0 E in a month`);
    if (least > 0.05 || most < 0.95) fail(`${spec.id}: Earth's phases run only from ${least.toFixed(2)} to ${most.toFixed(2)} lit in a month`);
    notes.push(`Earth within ${worst.toFixed(1)} degrees of the zenith over a month, ${least.toFixed(2)} to ${most.toFixed(2)} lit`);
  }

  // The moons and the layers: where they say, sane, and the same in two
  // skies built apart (both on the real clock: `setHour` above moved this one's).
  const first = createSky(spec, new THREE.Scene());
  const twin = createSky(spec, new THREE.Scene());
  unitAt(24, 30, here).multiplyScalar(terrain.radius);
  for (const at of [date, new Date(date.getTime() + 5.3 * 3600000)]) {
    first.update(at, here, here, 1);
    twin.update(at, here, here, 1);
    first.moons.forEach((view, k) => {
      const other = twin.moons[k]!;
      const d = view.direction;
      if (![d.x, d.y, d.z, view.radiusDeg, view.lit].every(Number.isFinite)) fail(`${spec.id}: ${view.name} is not anywhere`);
      if (Math.abs(d.length() - 1) > 1e-6) fail(`${spec.id}: ${view.name}'s direction is not a unit vector`);
      if (!(view.radiusDeg > 0 && view.radiusDeg < 2)) fail(`${spec.id}: ${view.name} is ${(view.radiusDeg * 2).toFixed(2)} degrees across`);
      if (d.distanceTo(other.direction) > 1e-9 || view.lit !== other.lit) fail(`${spec.id}: ${view.name} is somewhere else in a second sky`);
    });
    first.layers.forEach((layer, k) => {
      const input = { observer: here, sun: first.state.sun, day: first.state.day, time: 3, light: 1, date: at, turn: 1.2 };
      const a = layer.update(input);
      const b = twin.layers[k]!.update(input);
      if (!(a >= 0 && a <= 1) || a !== b) fail(`${spec.id}: sky layer ${k} lets through ${a} and then ${b}`);
      const mesh = layer.object as THREE.Mesh;
      const material = mesh.material as THREE.ShaderMaterial;
      if ((twin.layers[k]!.object as THREE.Mesh).material === undefined || material.fragmentShader !== ((twin.layers[k]!.object as THREE.Mesh).material as THREE.ShaderMaterial).fragmentShader) {
        fail(`${spec.id}: sky layer ${k} writes a different shader twice`);
      }
    });
  }
  if (first.moons.length > 0) {
    notes.push(first.moons.map((one) => `${one.name} ${(one.radiusDeg * 2).toFixed(2)}`).join(', ') + ' degrees across from 24 N');
  }
  if (first.layers.length > 0) notes.push(`${first.layers.length} sky layer${first.layers.length === 1 ? '' : 's'}`);
  if (spec.sky.overcast) notes.push('overcast');
  first.dispose();
  twin.dispose();

  console.log(`  sky: ${sky.state.au.toFixed(2)} au from the Sun; the clock lands on the hour asked for`);
  if (notes.length > 0) console.log(`  sky: ${notes.join('; ')}`);
  sky.dispose();
}

function checkPeople(spec: WorldSpec): void {
  const civ = spec.civilisation;
  if (civ === null) return;
  const script = scriptOf(civ.script);
  const again = scriptOf(civ.script);
  if (JSON.stringify(script.glyphs) !== JSON.stringify(again.glyphs)) fail(`${spec.id}: the script differs between two builds`);
  const paths = new Set(script.glyphs.map((g) => g.d));
  if (paths.size !== script.glyphs.length) fail(`${spec.id}: two glyphs of the ${civ.species.name} script are the same`);
  if (script.glyphs.length < 12) fail(`${spec.id}: the script has only ${script.glyphs.length} glyphs`);
  const owner = civ.species.id;
  for (const [other, theirs] of scriptsBySpecies) {
    if (other === owner) continue;
    const shared = [...paths].filter((d) => theirs.has(d)).length;
    if (shared > 0) fail(`${spec.id}: the ${owner} script shares ${shared} glyphs with the ${other} script`);
  }
  scriptsBySpecies.set(owner, paths);
  let lines = 0;
  for (const part of ['greet', 'world', 'visitor', 'farewell'] as const) {
    for (const english of civ.phrases[part]) {
      const written = writeLine(script, english);
      lines++;
      if (written.words.length === 0) fail(`${spec.id}: "${english}" writes as nothing`);
      if (JSON.stringify(writeLine(script, english).words) !== JSON.stringify(written.words)) fail(`${spec.id}: "${english}" writes differently twice`);
      if (!svgOf(script, written).startsWith('<svg')) fail(`${spec.id}: "${english}" draws no svg`);
    }
  }
  // The bodies: deterministic and in budget.
  const body = bodyOf(ctx, spec, civ, 0);
  const twice = bodyOf(ctx, spec, civ, 0);
  if (fingerprint(body.geometry) !== fingerprint(twice.geometry)) fail(`${spec.id}: the same ${civ.species.name} builds differently twice`);
  const triangles = body.geometry.getAttribute('position').count / 3;
  if (triangles > BUDGETS.alien.triangles) fail(`${spec.id}: a ${civ.species.name} is ${triangles} triangles`);
  // Every vertex bound, and to a joint the skeleton has.
  const skin = body.geometry.getAttribute('skinIndex');
  const weight = body.geometry.getAttribute('skinWeight');
  let unbound = 0;
  for (let i = 0; i < skin.count; i++) {
    if (skin.getX(i) >= body.rig.bones.length || Math.abs(weight.getX(i) - 1) > 1e-6) unbound++;
  }
  if (unbound > 0) fail(`${spec.id}: ${unbound} vertices of a ${civ.species.name} are bound to no joint`);
  if (body.inverses.length !== body.rig.bones.length) fail(`${spec.id}: a ${civ.species.name}'s skeleton has ${body.inverses.length} inverses for ${body.rig.bones.length} joints`);
  console.log(
    `  people: the ${civ.species.name}, ${script.glyphs.length} glyphs, ${lines} lines, ${triangles} triangles a body on ${body.rig.bones.length} joints, ` +
      `${body.height.toFixed(1)} units tall${body.float ? ', floating' : ''}`,
  );
}

function checkCraft(spec: WorldSpec, terrain: Terrain): void {
  const here = new THREE.Vector3();
  unitAt(5, 5, here);
  for (const vehicle of spec.vehicles) {
    const kind = typeof vehicle === 'string' ? vehicle : `${vehicle.kind} (${vehicle.name})`;
    const flies = (typeof vehicle === 'string' ? vehicle : vehicle.kind) !== 'rover' && (typeof vehicle === 'string' ? vehicle : vehicle.kind) !== 'skiff';
    const craft = createCraft(vehicle, ctx, gradientMap, here.clone().multiplyScalar(terrain.radius), new THREE.Vector3(0, 1, 0).addScaledVector(here, -here.y).normalize(), spec.wind);
    const groundAt = (p: THREE.Vector3): number => {
      const n = p.clone().normalize();
      return terrain.groundAt(n.x, n.y, n.z);
    };
    for (let k = 0; k < 120; k++) craft.update(1 / 60, { throttle: 1, steer: 0.3, climb: flies && k < 60, descend: false }, groundAt, EARTH_GRAVITY, terrain.radius);
    const p = craft.position;
    if (![p.x, p.y, p.z].every(Number.isFinite)) fail(`${spec.id}: the ${kind} drove off to ${p.toArray()}`);
    const over = p.length() - terrain.radius - groundAt(p);
    if (over < -0.01) fail(`${spec.id}: the ${kind} is ${(-over).toFixed(2)} under the ground after two seconds`);
    const m = craft.object.matrixWorld.clone();
    craft.object.updateMatrixWorld(true);
    if (craft.object.matrixWorld.determinant() <= 0 && m !== null) fail(`${spec.id}: the ${kind}'s frame is mirrored`);
    const triangles = trianglesOf(craft.object);
    if (triangles > 3000) fail(`${spec.id}: the ${kind} is ${triangles} triangles`);
  }
}


/** Whether the craft of a spec flies, by kind. */
const fliesOf = (vehicle: WorldSpec['vehicles'][number]): boolean => {
  const kind = typeof vehicle === 'string' ? vehicle : vehicle.kind;
  return kind === 'lander' || kind === 'aerostat';
};

/**
 * The roads: the network a function of the towns and the ground, and every
 * built piece's top over the drawn ground across its whole width, which is
 * what the crown's floor of a lift over both edges promises.
 */
function checkRoads(spec: WorldSpec, terrain: Terrain): void {
  const settlements = createSettlements(spec, terrain, ctx, gradientMap);
  const again = roadNetwork(spec, settlements.sites, terrain);
  if (JSON.stringify(again.roads) !== JSON.stringify(settlements.network.roads)) fail(`${spec.id}: the road network differs between two calls`);
  const roads = createRoads(spec, terrain, settlements.sites, settlements.network, gradientMap);
  // Built everywhere: from every town, until nothing more is wanted.
  for (let before = -1; before !== roads.stats.chunks; ) {
    before = roads.stats.chunks;
    for (const site of settlements.sites) roads.update(site.dir.clone().multiplyScalar(terrain.radius), 100);
  }
  let sections = 0;
  let under = 0;
  let worst = Infinity;
  roads.sweep((top, ground) => {
    sections++;
    worst = Math.min(worst, top - ground);
    if (top < ground) under++;
  });
  if (under > 0) fail(`${spec.id}: ${under} of ${sections} road sections under the drawn ground, worst ${(-worst).toFixed(2)}`);
  console.log(
    `  roads: ${roads.stats.roads}, ${roads.stats.steep} pairs left apart by the slope; ${sections} sections, the top at least ${Number.isFinite(worst) ? worst.toFixed(2) : '-'} over the ground`,
  );
  roads.dispose();
  settlements.dispose();
}

function checkArrivals(spec: WorldSpec, terrain: Terrain): void {
  const R = terrain.radius;
  const settlements = createSettlements(spec, terrain, ctx, gradientMap);
  const groundAt = (point: THREE.Vector3): number => {
    const n = point.clone().normalize();
    const floor = settlements.floorAt(n.x, n.y, n.z);
    const land = terrain.groundAt(n.x, n.y, n.z);
    return floor === null ? land : Math.max(land, floor);
  };
  const towns = settlements.sites.filter((site) => !site.landmark);
  if (towns.length > 0 && capitalOf(spec, settlements.sites) === null) fail(`${spec.id}: ?world= has no capital to land in`);
  const scene = new THREE.Scene();
  const sky = createSky(spec, scene);
  // Never turned: the clock the world starts on, before anyone sets an hour.
  const clockSky = createSky(spec, new THREE.Scene());
  const date = new Date('2026-10-01T12:00:00Z');
  const at = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const up = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  let worstSlope = 0;
  let nearestCraft = Infinity;
  let polarNights = 0;
  let worstClock = 0;
  const placed = (site: Site, x: number, z: number, out: THREE.Vector3): THREE.Vector3 => {
    settlements.toWorld(site, x, 0, z, out).normalize();
    return out.multiplyScalar(R + groundAt(out));
  };
  for (const site of towns) {
    settlements.prime(site.origin);
    if (site.mesh === null) continue;
    const name = `${spec.id}: the arrival in ${site.id}`;
    const point = arrivalOf(site);
    if (Math.hypot(point.x, point.z) > site.paving) fail(`${name} is off the town's paving`);
    placed(site, point.x, point.z, at);
    // The town it says it is in, as a remembered place or `/goto` would find it.
    if (siteAt(settlements.sites, R, at) !== site) fail(`${name} is not found in its own town`);
    if (settlements.collide(at.clone(), BODY_RADIUS)) fail(`${name} stands in a wall`);
    // The slope, from the ground two units either way.
    up.copy(at).normalize();
    east.set(0, 1, 0).cross(up);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    north.crossVectors(up, east).normalize();
    let rise = 0;
    for (const side of [east, north]) {
      const a = groundAt(probe.copy(at).addScaledVector(side, 2));
      const b = groundAt(probe.copy(at).addScaledVector(side, -2));
      rise = Math.max(rise, Math.abs(a - b) / 4);
    }
    const slope = (Math.atan(rise) * 180) / Math.PI;
    worstSlope = Math.max(worstSlope, slope);
    if (slope > 15) fail(`${name} stands on ground ${slope.toFixed(1)} degrees steep`);
    // The way in to the square: no wall on the line from the arrival to the
    // square's edge, but the centrepiece the traveller is looking at.
    {
      const into = Math.hypot(point.x, point.z);
      const edge = site.plaza * 0.9;
      const ex = (point.x / Math.max(1e-6, into)) * edge;
      const ez = (point.z / Math.max(1e-6, into)) * edge;
      for (const f of site.footprints) {
        if (Math.hypot(f.x, f.z) < f.radius) continue;
        const dx = ex - point.x;
        const dz = ez - point.z;
        const t = Math.max(0, Math.min(1, ((f.x - point.x) * dx + (f.z - point.z) * dz) / Math.max(1e-9, dx * dx + dz * dz)));
        if (Math.hypot(point.x + dx * t - f.x, point.z + dz * t - f.z) < f.radius) {
          fail(`${name} cannot see the square: a building ${(t * Math.hypot(dx, dz)).toFixed(1)} units in`);
          break;
        }
      }
    }
    // The craft that wait there.
    spec.vehicles.forEach((vehicle, k) => {
      const spot = parkingOf(site, k, fliesOf(vehicle));
      const gap = Math.hypot(spot.x - point.x, spot.z - point.z);
      nearestCraft = Math.min(nearestCraft, gap);
      if (gap < PARKING_CLEAR) fail(`${name}: craft ${k} waits ${gap.toFixed(1)} units off, under ${PARKING_CLEAR}`);
      if (settlements.collide(placed(site, spot.x, spot.z, probe), 2)) fail(`${name}: craft ${k} waits inside a wall`);
    });
    // The clock: the world starts on the menu's hour, and ten is daylight
    // wherever the sun rises that day.
    const { lat, lon } = latLonOf(at);
    clockSky.update(date, at, at, 1);
    worstClock = Math.max(worstClock, Math.abs(((clockSky.state.hour - localHour(spec.body, lon, date) + 36) % 24) - 12));
    sky.setHour(12, date, at);
    sky.update(date, at, at, 1);
    if (sky.state.elevation <= 0) {
      polarNights++;
      continue;
    }
    sky.setHour(10, date, at);
    sky.update(date, at, at, 1);
    if (sky.state.elevation <= 0 && Math.abs(lat) < 60) fail(`${name}: the sun is down at ten in the morning`);
  }
  if (worstClock > 0.05) fail(`${spec.id}: the world's clock starts ${worstClock.toFixed(2)} h off the menu's`);
  if (towns.length > 0) {
    console.log(
      `  arrivals: ${towns.length} towns, steepest ${worstSlope.toFixed(1)} degrees, nearest craft ${nearestCraft.toFixed(1)} units,` +
        ` clock within ${(worstClock * 60).toFixed(1)} min of the menu's${polarNights > 0 ? `, ${polarNights} in polar night today` : ''}`,
    );
  }
  sky.dispose();
  clockSky.dispose();
  settlements.dispose();
}

function checkPolitical(spec: WorldSpec, terrain: Terrain): void {
  if (spec.body.nations.length === 0) return;
  const geography = geographyOf(spec.body);
  const world = geography.world;
  const edges = frontierEdges(world, geography);
  let frontier = 0;
  for (const flags of edges) for (const flag of flags) if (flag === 0) frontier++;
  let shared = 0;
  for (const line of geography.frontiers) shared += line.points.length - 1;
  if (frontier !== shared * 2) fail(`${spec.id}: ${frontier} ring edges are frontiers where the frontiers have ${shared}, each drawn by two rings`);
  const surface = surfaceOf(terrain, geography);
  if (surface.coastEdges(world) !== surface.coastEdges(world)) fail(`${spec.id}: the surface's edges are worked out twice`);
  // Every town stands in its own nation's colour.
  const point = new THREE.Vector3();
  for (const place of geography.places) {
    const id = world.countryAtPoint(unitAt(place.lat, place.lon, point));
    if (geography.countries[id - 1]?.iso !== place.iso) fail(`${spec.id}: ${place.name} is tinted as ${geography.countries[id - 1]?.iso ?? 'nobody'}, not ${place.iso}`);
  }
  // The outlines the minimap inks: each nation joined back along its cuts,
  // never more rings than it had, and every point still its own nation's.
  const outlines = outlinesOf(geography);
  let joined = 0;
  let kept = 0;
  outlines.countries.forEach((country, i) => {
    const before = geography.countries[i]!.rings.length;
    if (country.rings.length > before) fail(`${spec.id}: ${country.name}'s outline is ${country.rings.length} rings, from ${before}`);
    if (country === geography.countries[i] && before > 1) kept++;
    else joined += before - country.rings.length;
  });
  // The borders, built whole.
  const frontiers = createFrontiers(geography, terrain);
  const began = performance.now();
  frontiers.update(point.set(0, terrain.radius * 3, 0), 1, 1, 1, 2, Infinity);
  const ms = performance.now() - began;
  if (frontiers.stats.built !== frontiers.stats.total) fail(`${spec.id}: ${frontiers.stats.total - frontiers.stats.built} frontiers did not build`);
  if (frontiers.stats.samples > 40000) fail(`${spec.id}: the borders are ${frontiers.stats.samples} samples, over 40,000`);
  console.log(
    `  political: ${geography.countries.length} nations, ${geography.frontiers.length} frontiers, ${frontiers.stats.samples.toLocaleString('en')} border samples in ${ms.toFixed(0)} ms;` +
      ` outlines joined along ${joined} cuts${kept > 0 ? `, ${kept} nation${kept === 1 ? '' : 's'} drawn as cut` : ''}`,
  );
  frontiers.dispose();
}

console.log('\n=== the worlds ===');
const ids = only === undefined ? WORLD_IDS : WORLD_IDS.filter((id) => id === only);
if (ids.length === 0) fail(`no world '${only}' (there are ${WORLD_IDS.join(', ')})`);

// The law a town's size follows is Earth's, scaled up and clamped (`worldTownLaw`).
for (const pop of [40000, 300000]) {
  const want = Math.min(WORLD_TOWN_MAX, Math.max(WORLD_TOWN_MIN, WORLD_TOWN_SCALE * radiusFor(pop)));
  if (Math.abs(worldTownLaw(pop) - want) > 1e-9) fail(`worldTownLaw(${pop}) is ${worldTownLaw(pop)} and Earth's law scaled says ${want}`);
}

for (const id of ids) {
  const spec = await loadWorldSpec(id);
  const g = spec.body.gravity;
  const gravity = EARTH_GRAVITY * (g / 9.807);
  console.log(
    `\n${spec.body.name} (${spec.ground}, ${g} m/s2): a jump goes ${((JUMP_SPEED * JUMP_SPEED) / (2 * gravity)).toFixed(1)} units up` +
      ` and lasts ${((2 * JUMP_SPEED) / gravity).toFixed(2)} s`,
  );
  for (const problem of validateBody(spec.body)) fail(`${id}: ${problem}`);
  {
    // The towns' built discs: none inside another, and the sizes they came out at.
    const built = townRadii(spec.body, spec.landmarks);
    const perDegree = (surfaceRadiusOf(spec.body.radiusKm) * Math.PI) / 180;
    const list = spec.body.settlements;
    let tightest = Infinity;
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const A = list[a]!;
        const B = list[b]!;
        const gap = angularDistance(A.lat, A.lon, B.lat, B.lon) * perDegree - built.get(A.id)! - built.get(B.id)!;
        tightest = Math.min(tightest, gap);
        if (gap < 0) fail(`${id}: ${A.id} and ${B.id} are built inside each other (${gap.toFixed(1)})`);
      }
    }
    const sizes = [...built.values()].sort((x, y) => x - y);
    console.log(`  town sizes: ${sizes[0]!.toFixed(0)} to ${sizes[sizes.length - 1]!.toFixed(0)} units, median ${sizes[Math.floor(sizes.length / 2)]!.toFixed(0)}; tightest gap ${tightest.toFixed(0)} (wants ${WORLD_TOWN_GAP})`);
  }
  for (const [where, colour] of colours(spec)) {
    if (!PALETTE_COLORS.has(colour)) fail(`${id}: ${where} is 0x${colour.toString(16)}, not a palette colour`);
  }
  for (const [k, c] of (spec.relief.craters?.classes ?? []).entries()) {
    if (c.radius[1] > c.cell * 0.45) fail(`${id}: crater class ${k} reaches ${c.radius[1]} on a ${c.cell} lattice (at most ${c.cell * 0.45})`);
    if (c.chance < 0 || c.chance > 1) fail(`${id}: crater class ${k} has a chance of ${c.chance}`);
  }
  const terrain = createTerrain(spec);
  const again = createTerrain(spec);
  checkGround(spec, terrain, again);
  checkTowns(spec, terrain);
  checkBuilt(spec, terrain);
  checkDrawn(spec, terrain);
  checkSky(spec, terrain);
  checkPeople(spec);
  checkCraft(spec, terrain);
  checkArrivals(spec, terrain);
  checkRoads(spec, terrain);
  checkPolitical(spec, terrain);
}


// ===========================================================================
// 4. The shell
// ===========================================================================

/**
 * Just enough of a page for the shell's cards to be built and taken down
 * headless — the same shape `check-input.ts` builds its HUD and chat over:
 * elements that hold children, classes, attributes and listeners and draw
 * nothing, and a 2D context every call of which is a no-op.
 */
class FakeElement extends EventTarget {
  readonly tagName: string;
  readonly nodeName: string;
  id = '';
  className = '';
  hidden = false;
  title = '';
  lang = '';
  dir = '';
  type = '';
  value = '';
  checked = false;
  disabled = false;
  tabIndex = 0;
  width = 0;
  height = 0;
  isContentEditable = false;
  offsetWidth = 0;
  offsetHeight = 0;
  clientWidth = 0;
  clientHeight = 0;
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly childNodes: (FakeElement | string)[] = [];
  parentNode: FakeElement | null = null;
  readonly style: Record<string, unknown> = {
    setProperty: (name: string, value: string) => {
      this.style[name] = value;
    },
    removeProperty: (name: string) => {
      delete this.style[name];
    },
  };
  readonly classList = {
    held: new Set<string>(),
    add: (...names: string[]) => names.forEach((name) => this.classList.held.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classList.held.delete(name)),
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !this.classList.held.has(name);
      if (on) this.classList.held.add(name);
      else this.classList.held.delete(name);
      return on;
    },
    contains: (name: string) => this.classList.held.has(name),
  };
  constructor(tag: string) {
    super();
    this.tagName = tag.toUpperCase();
    this.nodeName = this.tagName;
  }
  get children(): FakeElement[] {
    return this.childNodes.filter((node): node is FakeElement => typeof node !== 'string');
  }
  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  get firstChild(): FakeElement | string | null {
    return this.childNodes[0] ?? null;
  }
  get parentElement(): FakeElement | null {
    return this.parentNode;
  }
  get isConnected(): boolean {
    let at: FakeElement | null = this;
    while (at.parentNode !== null) at = at.parentNode;
    return at === fakePage.root;
  }
  get textContent(): string {
    return this.childNodes.map((node) => (typeof node === 'string' ? node : node.textContent)).join('');
  }
  set textContent(text: string) {
    this.replaceChildren(text);
  }
  get innerHTML(): string {
    return '';
  }
  set innerHTML(html: string) {
    this.replaceChildren(...(html === '' ? [] : [new FakeElement(/^<(\w+)/.exec(html)?.[1] ?? 'span')]));
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  toggleAttribute(name: string, force?: boolean): boolean {
    const on = force ?? !this.attributes.has(name);
    if (on) this.attributes.set(name, '');
    else this.attributes.delete(name);
    return on;
  }
  private adopt(node: FakeElement | string): FakeElement | string {
    if (typeof node !== 'string') {
      node.remove();
      node.parentNode = this;
    }
    return node;
  }
  append(...nodes: (FakeElement | string | null)[]): void {
    for (const node of nodes) if (node !== null) this.childNodes.push(this.adopt(node));
  }
  appendChild<T extends FakeElement>(node: T): T {
    this.append(node);
    return node;
  }
  prepend(...nodes: (FakeElement | string)[]): void {
    this.childNodes.unshift(...nodes.map((node) => this.adopt(node)));
  }
  insertBefore<T extends FakeElement>(node: T, before: FakeElement | null): T {
    const at = before === null ? -1 : this.childNodes.indexOf(before);
    this.adopt(node);
    if (at < 0) this.childNodes.push(node);
    else this.childNodes.splice(at, 0, node);
    return node;
  }
  replaceChildren(...nodes: (FakeElement | string)[]): void {
    for (const node of this.childNodes) if (typeof node !== 'string') node.parentNode = null;
    this.childNodes.length = 0;
    this.append(...nodes);
  }
  removeChild<T extends FakeElement>(node: T): T {
    node.remove();
    return node;
  }
  remove(): void {
    const parent = this.parentNode;
    if (parent === null) return;
    const at = parent.childNodes.indexOf(this);
    if (at >= 0) parent.childNodes.splice(at, 1);
    this.parentNode = null;
  }
  contains(node: unknown): boolean {
    for (let at = node instanceof FakeElement ? node : null; at !== null; at = at.parentNode) if (at === this) return true;
    return false;
  }
  querySelector(): null {
    return null;
  }
  querySelectorAll(): FakeElement[] {
    return [];
  }
  closest(): null {
    return null;
  }
  matches(): boolean {
    return false;
  }
  focus(): void {
    fakePage.active = this;
  }
  blur(): void {
    if (fakePage.active === this) fakePage.active = null;
  }
  click(): void {
    this.dispatchEvent(new Event('click'));
  }
  select(): void {}
  setSelectionRange(): void {}
  scrollIntoView(): void {}
  requestPointerLock(): void {}
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  getContext(): unknown {
    return noDrawing;
  }
  animate(): { cancel(): void; onfinish: (() => void) | null } {
    return { cancel: () => {}, onfinish: null };
  }
  toDataURL(): string {
    return '';
  }
}

/** A 2D context that takes every call and every setting and draws nothing. */
const noDrawing: unknown = new Proxy({} as Record<string | symbol, unknown>, {
  get: (target, name) => (name in target ? target[name] : () => noDrawing),
  set: (target, name, value) => {
    target[name] = value;
    return true;
  },
});

const fakePage = { root: new FakeElement('html'), active: null as FakeElement | null };

/** Runs `run` over a fake page whose window delivers `keys`, counting the listeners held by type. */
async function withPage(run: (keys: EventTarget, body: FakeElement, live: () => Map<string, number>) => Promise<void>): Promise<void> {
  const keys = new EventTarget();
  const held = new Map<string, Set<unknown>>();
  const set = (type: string): Set<unknown> => held.get(type) ?? held.set(type, new Set()).get(type)!;
  const add = (type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void => {
    keys.addEventListener(type, listener, options);
    const signal = typeof options === 'object' ? options.signal : undefined;
    if (listener === null || signal?.aborted === true) return;
    set(type).add(listener);
    signal?.addEventListener('abort', () => set(type).delete(listener));
  };
  const remove = (type: string, listener: EventListenerOrEventListenerObject | null): void => {
    keys.removeEventListener(type, listener);
    set(type).delete(listener);
  };
  fakePage.root = new FakeElement('html');
  const head = new FakeElement('head');
  const body = new FakeElement('body');
  fakePage.root.append(head, body);
  const find = (id: string): FakeElement | null => {
    const walk = (at: FakeElement): FakeElement | null => {
      if (at.id === id) return at;
      for (const child of at.children) {
        const found = walk(child);
        if (found !== null) return found;
      }
      return null;
    };
    return walk(fakePage.root);
  };
  const documentTarget = Object.assign(new EventTarget(), {
    head,
    body,
    documentElement: fakePage.root,
    hidden: false,
    visibilityState: 'visible',
    pointerLockElement: null,
    get activeElement() {
      return fakePage.active;
    },
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
    createTextNode: (text: string) => text,
    getElementById: find,
    exitPointerLock: () => {},
    fonts: { ready: Promise.resolve() },
  });
  const unref = <T>(timer: T): T => {
    (timer as { unref?: () => void }).unref?.();
    return timer;
  };
  const items = new Map<string, string>();
  const globals: Record<string, unknown> = {
    addEventListener: add,
    removeEventListener: remove,
    document: documentTarget,
    window: {
      addEventListener: add,
      removeEventListener: remove,
      setTimeout: (handler: () => void, ms?: number) => unref(setTimeout(handler, ms)),
      clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
      setInterval: (handler: () => void, ms?: number) => unref(setInterval(handler, ms)),
      clearInterval: (timer: ReturnType<typeof setInterval>) => clearInterval(timer),
      devicePixelRatio: 1,
    },
    localStorage: {
      getItem: (name: string) => items.get(name) ?? null,
      setItem: (name: string, value: string) => void items.set(name, value),
      removeItem: (name: string) => void items.delete(name),
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    Node: FakeElement,
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLInputElement: FakeElement,
    HTMLButtonElement: FakeElement,
    HTMLCanvasElement: FakeElement,
    SVGElement: FakeElement,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  };
  const originals = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  try {
    await run(keys, body, () => new Map([...held].map(([type, listeners]) => [type, listeners.size])));
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

async function checkShell(): Promise<void> {
  console.log('\n=== the shell ===\n');
  const spec = await loadWorldSpec('mars');
  const terrain = createTerrain(spec);
  const geography = geographyOf(spec.body);
  const surface = surfaceOf(terrain, geography);
  await withPage(async (keys, body, live) => {
    const { createShell } = await import('../src/worlds/shell.ts');
    const { createWorldPlayer } = await import('../src/worlds/player.ts');
    const { createWorldRig } = await import('../src/worlds/camera.ts');
    const { createInput } = await import('../src/input.ts');
    const { BINDINGS, resetBindings } = await import('../src/controls.ts');
    resetBindings();
    // Welcomed already: the first-run card holds the keyboard while it is up.
    localStorage.setItem('atlas.welcomed.v1', '1');
    const lockTarget = new FakeElement('canvas');
    const baseline = live();
    const bodyChildren = body.children.length;
    const build = () => {
      const scene = new THREE.Scene();
      const avatar = {
        group: new THREE.Group(),
        stride: () => {},
        land: () => {},
        sit: () => {},
        reset: () => {},
        emote: () => true,
        emoting: null,
        phase: 0,
      } as unknown as Parameters<typeof createWorldPlayer>[1];
      const player = createWorldPlayer({ radius: terrain.radius, gravity: spec.body.gravity, groundAt: () => 0, collide: () => false }, avatar);
      const input = createInput(lockTarget as unknown as HTMLElement);
      const settlements = createSettlements(spec, terrain, ctx, gradientMap);
      const sky = createSky(spec, scene);
      const ground = createGround(terrain, { gradientMap });
      const frontiers = createFrontiers(geography, terrain);
      const crowd = {
        group: new THREE.Group(),
        walkers: [],
        update: () => {},
        nearest: () => null,
        headOf: (_walker: unknown, out: THREE.Vector3) => out,
        stats: { walkers: 0, bodies: 0, buildMs: 0, animated: 0 },
        dispose: () => {},
      } as unknown as Parameters<typeof createShell>[0]['crowd'];
      let left = 0;
      const shell = createShell({
        host: {
          renderer: { domElement: lockTarget, info: { render: { triangles: 0, calls: 0 } } } as unknown as THREE.WebGLRenderer,
          draw: () => {},
          pixelRatio: () => 1,
          sound: () => null,
          appearance: () => ({}) as never,
          cast: () => Promise.reject(new Error('no cast headless')),
          name: () => 'Tester',
          mode: 'offline',
          time: () => new Date('2026-10-01T12:00:00Z'),
          exit: () => {},
        },
        spec,
        geography,
        surface,
        terrain,
        scene,
        ctx,
        player,
        rig: createWorldRig(() => false),
        sky,
        ground,
        frontiers,
        settlements,
        crowd,
        crafts: [],
        roadLines: () => [],
        input,
        groundAt: () => 0,
        craftInReach: () => null,
        jumpTo: () => {},
        home: { lat: 0, lon: 0, name: 'Home' },
        leave: () => left++,
        rocketInReach: () => null,
        riding: () => null,
        boardRocket: () => {},
        leaveRocket: () => {},
      });
      return {
        shell,
        dispose: () => {
          shell.dispose();
          input.dispose();
          settlements.dispose();
          sky.dispose();
          ground.dispose();
          frontiers.dispose();
        },
      };
    };
    const first = build();
    const during = live();
    if ((during.get('keydown') ?? 0) <= (baseline.get('keydown') ?? 0)) fail('the shell listens for no key while it stands');
    first.dispose();
    const after = live();
    for (const type of new Set([...baseline.keys(), ...after.keys()])) {
      if ((after.get(type) ?? 0) !== (baseline.get(type) ?? 0)) fail(`the shell taken down leaves ${(after.get(type) ?? 0) - (baseline.get(type) ?? 0)} '${type}' listeners behind`);
    }
    if (body.children.length !== bodyChildren) fail(`the shell taken down leaves ${body.children.length - bodyChildren} elements on the page`);
    // A second shell after it, run for a few frames — the badge, the disc,
    // the book and the map layer asked as the loop asks them — and then one
    // key, one card.
    const second = build();
    for (let k = 0; k < 5; k++) {
      second.shell.update(0.25);
      second.shell.drawn(1, 1);
    }
    const ground = second.shell.hud.clock;
    if (!/^\d\d:\d\d$/.test(ground)) fail(`the shell's clock reads '${ground}'`);
    const press = (code: string): void => {
      keys.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code, repeat: false }));
    };
    press(BINDINGS.settings[0]!);
    const opened = body.children.filter((element) => element.classList.contains('on') || element.classList.contains('open')).length;
    if (opened === 0) fail('the second shell\'s settings did not open on its key');
    press('Escape');
    second.dispose();
    const end = live();
    for (const type of new Set([...baseline.keys(), ...end.keys()])) {
      if ((end.get(type) ?? 0) !== (baseline.get(type) ?? 0)) fail(`two shells taken down leave '${type}' listeners behind`);
    }
    console.log(`  built and taken down twice: ${[...during].map(([type, count]) => `${count - (baseline.get(type) ?? 0)} ${type}`).join(', ')} listeners, all let go`);
  });
}

if (only === undefined || only === 'mars') await checkShell();

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
