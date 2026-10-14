import './contract.ts';
import { PALETTE, createToonRamp } from '../../src/theme.ts';
import { createSceneryContext } from '../../src/scenery/contract.ts';
import * as THREE from 'three';
import { type WorldSpec } from '../../src/worlds/contract.ts';
import { type Terrain } from '../../src/worlds/terrain.ts';
import { fail } from './setup.ts';
import { faceDir, TILE_SEGMENTS } from '../../src/worlds/cube.ts';
import { townRadii } from '../../src/system/contract.ts';
import { layoutOf, createSettlements } from '../../src/worlds/settlements.ts';
import { unitAt } from '../../src/sphere.ts';
import { createGround } from '../../src/worlds/tiles.ts';
import { createDecor } from '../../src/worlds/decor.ts';
import { createSky } from '../../src/worlds/sky.ts';

// ===========================================================================
// 3. Each world
// ===========================================================================

export const PALETTE_COLORS = new Set<number>(Object.values(PALETTE));
export const ctx = createSceneryContext();
export const gradientMap = createToonRamp(4);
export const scriptsBySpecies = new Map<string, Set<string>>();

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

export function trianglesOf(object: THREE.Object3D): number {
  let total = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const geometry = mesh.geometry;
    total += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  });
  return total;
}

export function fingerprint(geometry: THREE.BufferGeometry): string {
  const position = geometry.getAttribute('position').array as Float32Array;
  let h = 0;
  for (let i = 0; i < position.length; i++) h = (Math.imul(h, 31) + Math.round(position[i]! * 1000)) | 0;
  return `${position.length}:${h}`;
}

export function colours(spec: WorldSpec): [string, number][] {
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

export function checkGround(spec: WorldSpec, terrain: Terrain, again: Terrain): void {
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

export function checkTowns(spec: WorldSpec, terrain: Terrain): void {
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

export function checkBuilt(spec: WorldSpec, terrain: Terrain): void {
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

export function checkDrawn(spec: WorldSpec, terrain: Terrain): void {
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

export function checkSky(spec: WorldSpec, terrain: Terrain): void {
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
