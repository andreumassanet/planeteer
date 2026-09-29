/**
 * `pnpm ground`: the ground a body stands on, against the ground that is drawn.
 *
 * The land is a mesh of flat triangles laid between points of `reliefAt`, and
 * a foot, a wheel and the lens stand on it through `land-probe.ts`'s local
 * index (`drawnRadius`). This builds the real mesh and holds that to a witness
 * built here and nowhere else — every surface triangle bucketed by latitude
 * and longitude and asked by its own ray — and then drives the real player
 * controller over coasts, lakes' shores, hillsides and towns, before (on the
 * relief) and after (on the probe), and sets vehicles down on slopes.
 *
 * What fails:
 * - the probe disagreeing with the witness anywhere it says it covers;
 * - a player swimming where land is drawn under him, or on foot under the
 *   drawn surface, or under the sea's line on land: the coast's fall-through;
 * - a foot off the drawn surface by more than `FOOT_TOLERANCE` on a walk;
 * - a vehicle set down with a wheel in the ground, or none on it, or mirrored.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import type { LandRing } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, buildLand, coastEdges, groundRadius, onSphere } from '../src/globe.ts';
import { gradeAt, reliefAt, setDetailSites, setFlattenSites } from '../src/terrain.ts';
import type { Slope } from '../src/terrain.ts';
import { terrainSiteOf } from '../src/places.ts';
import { decodePlaces, inflate } from '../src/pack.ts';
import { latOf, lonOf } from '../src/sphere.ts';
import { isWater } from '../src/vehicles.ts';
import { createLandProbe, drawnRadius } from '../src/land-probe.ts';
import type { LandFlagData } from '../src/land-flags.ts';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * How far over the drawn land a grounded foot may be on a frame, and on what
 * share of frames: a step down steeper than the foot follows is glided, not
 * dropped (`FOLLOW_SLOPE` in `player.ts`).
 */
const FOOT_TOLERANCE = 0.5;

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// --- the world and its mesh, as check-world.ts builds them -------------------

const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;
const monumentsPath = resolve(here, '../public/data/monuments.json');
const monuments: { lat: number; lon: number; footprint?: number }[] = existsSync(monumentsPath)
  ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: typeof monuments }).monuments
  : [];
setFlattenSites(monuments as never);
const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
setDetailSites(placesRaw.map(terrainSiteOf));
const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const started = Date.now();
const land = buildLand(world);
console.log(`the land: ${(land.geometry.getAttribute('position').count / 3).toLocaleString()} triangles in ${Date.now() - started} ms`);
const position = land.geometry.getAttribute('position').array as Float32Array;
const spans = (land.userData['landFlags'] as LandFlagData).spans;
const probe = createLandProbe(land);

// --- the witness: every surface triangle, bucketed by latitude and longitude --

/** Degrees a bucket. */
const G = 0.25;
const COLS = 360 / G;
const ROWS = 180 / G;
const bucketStart = new Uint32Array(COLS * ROWS + 1);
let bucketFaces: Uint32Array;
{
  const kept: number[] = [];
  const boxes: number[] = [];
  const v = new Vector3();
  const lats = [0, 0, 0];
  const lons = [0, 0, 0];
  for (const span of spans) {
    for (let f = span.surface[0]; f < span.surface[1]; f++) {
      for (let k = 0; k < 3; k++) {
        v.set(position[f * 9 + k * 3]!, position[f * 9 + k * 3 + 1]!, position[f * 9 + k * 3 + 2]!).normalize();
        lats[k] = latOf(v.y);
        lons[k] = lonOf(v.x, v.z);
      }
      const lo0 = Math.min(...lons);
      const lo1 = Math.max(...lons);
      // Across the antimeridian: the samples keep a degree off it instead.
      if (lo1 - lo0 > 180) continue;
      const i0 = Math.max(0, Math.floor((lo0 + 180) / G - 0.01));
      const i1 = Math.min(COLS - 1, Math.floor((lo1 + 180) / G + 0.01));
      const j0 = Math.max(0, Math.floor((Math.min(...lats) + 90) / G - 0.01));
      const j1 = Math.min(ROWS - 1, Math.floor((Math.max(...lats) + 90) / G + 0.01));
      kept.push(f);
      boxes.push(i0, i1, j0, j1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) bucketStart[j * COLS + i + 1]!++;
    }
  }
  for (let b = 1; b < bucketStart.length; b++) bucketStart[b]! += bucketStart[b - 1]!;
  bucketFaces = new Uint32Array(bucketStart[bucketStart.length - 1]!);
  const cursor = bucketStart.slice(0, COLS * ROWS);
  kept.forEach((f, n) => {
    for (let j = boxes[n * 4 + 2]!; j <= boxes[n * 4 + 3]!; j++) {
      for (let i = boxes[n * 4]!; i <= boxes[n * 4 + 1]!; i++) bucketFaces[cursor[j * COLS + i]!++] = f;
    }
  });
}

/** The drawn land's radius under `point`, or the sea's where none is drawn: the witness. */
function drawnHere(point: Vector3): number {
  const length = point.length();
  const dx = point.x / length;
  const dy = point.y / length;
  const dz = point.z / length;
  const i = Math.min(COLS - 1, Math.floor((lonOf(dx, dz) + 180) / G));
  const j = Math.min(ROWS - 1, Math.floor((latOf(dy) + 90) / G));
  const b = j * COLS + i;
  let best = -Infinity;
  for (let n = bucketStart[b]!; n < bucketStart[b + 1]!; n++) {
    const o = bucketFaces[n]! * 9;
    const ax = position[o]!;
    const ay = position[o + 1]!;
    const az = position[o + 2]!;
    const e1x = position[o + 3]! - ax;
    const e1y = position[o + 4]! - ay;
    const e1z = position[o + 5]! - az;
    const e2x = position[o + 6]! - ax;
    const e2y = position[o + 7]! - ay;
    const e2z = position[o + 8]! - az;
    // Where the ray from the centre meets the face's plane, and whether that is inside it.
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const along = nx * dx + ny * dy + nz * dz;
    if (Math.abs(along) < 1e-12) continue;
    const t = (nx * ax + ny * ay + nz * az) / along;
    if (t <= 0) continue;
    const px = dx * t - ax;
    const py = dy * t - ay;
    const pz = dz * t - az;
    const d00 = e1x * e1x + e1y * e1y + e1z * e1z;
    const d01 = e1x * e2x + e1y * e2y + e1z * e2z;
    const d11 = e2x * e2x + e2y * e2y + e2z * e2z;
    const d20 = px * e1x + py * e1y + pz * e1z;
    const d21 = px * e2x + py * e2y + pz * e2z;
    const denominator = d00 * d11 - d01 * d01;
    const u = (d11 * d20 - d01 * d21) / denominator;
    const w = (d00 * d21 - d01 * d20) / denominator;
    if (u < -1e-6 || w < -1e-6 || u + w > 1 + 1e-6) continue;
    if (t > best) best = t;
  }
  return best === -Infinity ? PLANET_RADIUS : best;
}

let seed = 20260925;
const random = (): number => {
  seed = (seed * 1103515245 + 12345) >>> 0;
  return seed / 4294967296;
};
const usable = (lat: number, lon: number): boolean => Math.abs(lat) < 80 && Math.abs(lon) < 179;

interface Tally {
  errors: number[];
}
const tally = (): Tally => ({ errors: [] });
function summary(t: Tally): string {
  const a = t.errors.map(Math.abs).sort((x, y) => x - y);
  if (a.length === 0) return 'no samples';
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  const at = (p: number): string => a[Math.min(a.length - 1, Math.floor(p * a.length))]!.toFixed(2);
  return `n ${a.length}, mean ${mean.toFixed(2)}, p90 ${at(0.9)}, p99 ${at(0.99)}, max ${a[a.length - 1]!.toFixed(2)}`;
}
const worst = (t: Tally): number => t.errors.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

// --- the places to stand: coasts and lakes' shores, towns, mountains ----------

const coasts = coastEdges(world);
const coastSamples: { at: Vector3; along: Vector3; out: Vector3 }[] = [];
{
  const a = new Vector3();
  const b = new Vector3();
  const rings = world.rings as LandRing[];
  const edges: [number, number][] = [];
  rings.forEach((ring, r) => {
    for (let i = 0; i < ring.points.length; i++) if (coasts[r]![i] || ring.water) edges.push([r, i]);
  });
  const lakeEdges = edges.filter(([r]) => rings[r]!.water);
  const pick = (from: [number, number][], count: number): void => {
    let tries = 0;
    while (count > 0 && tries++ < count * 50) {
      const [r, i] = from[Math.floor(random() * from.length)]!;
      const ring = rings[r]!;
      const j = (i + 1) % ring.points.length;
      onSphere(ring.points[i]![0]!, ring.points[i]![1]!, a);
      onSphere(ring.points[j]![0]!, ring.points[j]![1]!, b);
      if (a.distanceTo(b) < 1e-4) continue;
      const at = a.clone().lerp(b, 0.2 + 0.6 * random()).normalize();
      if (!usable(latOf(at.y), lonOf(at.x, at.z))) continue;
      const along = b.clone().sub(a).normalize();
      // Land is on the right of a -> b, so outward, to the water, is up x along.
      const out = new Vector3().crossVectors(at, along).normalize();
      along.projectOnPlane(at).normalize();
      coastSamples.push({ at, along, out });
      count--;
    }
  };
  pick(edges, 200);
  pick(lakeEdges, 60);
}
const townSamples: Vector3[] = [];
while (townSamples.length < 120) {
  const place = placesRaw[Math.floor(random() * placesRaw.length)]!;
  if (!usable(place.lat, place.lon)) continue;
  const at = new Vector3();
  onSphere(place.lon + (random() - 0.5) * 0.02, place.lat + (random() - 0.5) * 0.02, at);
  if (world.elevationAt(at.clone().multiplyScalar(PLANET_RADIUS)) <= 0) continue;
  townSamples.push(at);
}
const hillSamples: Vector3[] = [];
{
  const at = new Vector3();
  let tries = 0;
  while (hillSamples.length < 120 && tries++ < 200_000) {
    const lat = Math.asin(2 * random() - 1) * (180 / Math.PI);
    const lon = random() * 360 - 180;
    if (!usable(lat, lon)) continue;
    onSphere(lon, lat, at);
    if (world.elevationAt(at.clone().multiplyScalar(PLANET_RADIUS)) <= 0) continue;
    if (reliefAt(at.x, at.y, at.z) < 120) continue;
    hillSamples.push(at.clone());
  }
}
console.log(`samples: ${coastSamples.length} shores (lakes among them), ${townSamples.length} towns, ${hillSamples.length} hillsides`);

// --- the probe against the witness, and the relief against both --------------

console.log('\nthe probe against the drawn land');
{
  const probeError = tally();
  const reliefError = tally();
  const reliefSeaOverLand = { n: 0 };
  const point = new Vector3();
  const jitter = new Vector3();
  const centres = [...coastSamples.map((s) => s.at), ...townSamples, ...hillSamples];
  let asked = 0;
  for (const centre of centres) {
    probe.prime(centre.clone().multiplyScalar(PLANET_RADIUS));
    for (let k = 0; k < 40; k++) {
      jitter.set(random() - 0.5, random() - 0.5, random() - 0.5);
      point.copy(centre).addScaledVector(jitter, (k < 20 ? 40 : 1200) / PLANET_RADIUS).normalize().multiplyScalar(PLANET_RADIUS);
      const drawn = drawnHere(point);
      const foot = drawnRadius(world, probe, point);
      const relief = groundRadius(world, point);
      asked++;
      probeError.errors.push(foot - drawn);
      if (!isWater(drawn) && !isWater(relief)) reliefError.errors.push(relief - drawn);
      if (!isWater(drawn) && isWater(relief)) reliefSeaOverLand.n++;
    }
  }
  console.log(`  the relief off the drawn land (the foot before): ${summary(reliefError)}`);
  console.log(`  the probe off the drawn land (the foot now):     ${summary(probeError)}`);
  check(worst(probeError) < 0.01, 'the probe answers the drawn land wherever it covers', `worst ${worst(probeError).toFixed(4)} over ${asked} points`);
  console.log(`  land drawn where the relief says water: ${reliefSeaOverLand.n} of ${asked}`);
}

// --- the real player, walked -------------------------------------------------

console.log('\nthe player on the drawn land');
{
  const PUBLIC = resolve(here, '../public');
  (globalThis as Record<string, unknown>).fetch = async (url: string) => {
    const bytes = readFileSync(resolve(PUBLIC, `.${String(url).replace(/^[^/]*\/\/[^/]*/, '')}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  await import('./kit-node.ts');
  const { prepareAvatar } = await import('../src/avatar.ts');
  const { createPlayer, SWIM_OUT } = await import('../src/player.ts');
  await prepareAvatar();

  const groundAt = (point: Vector3): number => drawnRadius(world, probe, point);
  const now = createPlayer(world, 0, 0, { groundAt });
  const before = createPlayer(world, 0, 0);
  const heading = new Vector3();

  /**
   * What one walk found: the foot's distance off the drawn surface on every
   * grounded frame, frames swimming over land a body climbs out onto, frames
   * on foot below the sea's line over land, and frames buried in it.
   */
  interface Walk {
    foot: Tally;
    wetOverLand: number;
    underSea: number;
    buried: number;
    frames: number;
    examples: string[];
  }
  const walkTally = (): Walk => ({ foot: tally(), wetOverLand: 0, underSea: 0, buried: 0, frames: 0, examples: [] });

  function walk(player: ReturnType<typeof createPlayer>, into: Walk, seconds: number, direction: Vector3, run: boolean): void {
    for (let t = 0; t < seconds; t += 1 / 60) {
      const up = player.position.clone().normalize();
      heading.copy(direction).projectOnPlane(up).normalize();
      player.update(1 / 60, { move: { x: 0, y: 1 }, run, jump: false, heading });
      // Direction is carried with the body: a walk along a coast bends with it.
      direction.projectOnPlane(player.position.clone().normalize()).normalize();
      const drawn = drawnHere(player.position);
      const height = player.position.length();
      into.frames++;
      const where = `${latOf(up.y).toFixed(4)},${lonOf(up.x, up.z).toFixed(4)}`;
      if (player.state === 'swim') {
        if (drawn > PLANET_RADIUS + SWIM_OUT + 0.5) {
          into.wetOverLand++;
          if (into.examples.length < 4) into.examples.push(`swimming over land ${(drawn - PLANET_RADIUS).toFixed(2)} at ${where}`);
        }
        continue;
      }
      if (player.state !== 'foot' || player.airborne) continue;
      if (!isWater(drawn) && height < PLANET_RADIUS + 0.5) {
        into.underSea++;
        if (into.examples.length < 4) into.examples.push(`under the sea's line over land at ${where}`);
      }
      if (isWater(drawn)) continue;
      into.foot.errors.push(height - drawn);
      if (height < drawn - 0.3) into.buried++;
    }
  }

  const put = (player: ReturnType<typeof createPlayer>, at: Vector3): void => {
    player.goTo(latOf(at.y), lonOf(at.x, at.z));
  };

  const shoreNow = walkTally();
  const shoreBefore = walkTally();
  for (const sample of coastSamples) {
    // Ten units in from the edge; along the shore at a run, out into the
    // water, and back up onto the land.
    const start = sample.at.clone().addScaledVector(sample.out, -10 / PLANET_RADIUS).normalize();
    probe.prime(start.clone().multiplyScalar(PLANET_RADIUS));
    for (const [player, into] of [[now, shoreNow], [before, shoreBefore]] as const) {
      put(player, start);
      walk(player, into, 2, sample.along.clone(), true);
      walk(player, into, 1, sample.along.clone().negate(), false);
      walk(player, into, 3, sample.out.clone(), false);
      walk(player, into, 4, sample.out.clone().negate(), true);
    }
  }
  console.log(`  shores, before: foot off the drawn land ${summary(shoreBefore.foot)}; swimming over land ${shoreBefore.wetOverLand}, under the sea's line ${shoreBefore.underSea}, buried ${shoreBefore.buried} of ${shoreBefore.frames} frames${shoreBefore.examples.length > 0 ? ` (${shoreBefore.examples.join('; ')})` : ''}`);
  console.log(`  shores, now:    foot off the drawn land ${summary(shoreNow.foot)}; swimming over land ${shoreNow.wetOverLand}, under the sea's line ${shoreNow.underSea}, buried ${shoreNow.buried} of ${shoreNow.frames} frames`);
  check(shoreNow.wetOverLand === 0 && shoreNow.underSea === 0, 'nobody swims over drawn land or stands under the sea on a shore', shoreNow.examples.join('; '));
  check(shoreNow.buried === 0, 'no foot is buried in a shore', `${shoreNow.buried} frames`);

  for (const [name, samples] of [['towns', townSamples], ['hillsides', hillSamples]] as const) {
    const walkNow = walkTally();
    const walkBefore = walkTally();
    for (const at of samples) {
      probe.prime(at.clone().multiplyScalar(PLANET_RADIUS));
      const direction = new Vector3(random() - 0.5, random() - 0.5, random() - 0.5).projectOnPlane(at).normalize();
      for (const [player, into] of [[now, walkNow], [before, walkBefore]] as const) {
        put(player, at);
        walk(player, into, 3, direction.clone(), true);
        walk(player, into, 3, direction.clone().negate(), false);
      }
    }
    console.log(`  ${name}, before: foot off the drawn land ${summary(walkBefore.foot)}; buried ${walkBefore.buried} of ${walkBefore.frames}`);
    console.log(`  ${name}, now:    foot off the drawn land ${summary(walkNow.foot)}; buried ${walkNow.buried} of ${walkNow.frames}`);
    const floating = walkNow.foot.errors.filter((e) => e > FOOT_TOLERANCE).length;
    check(
      walkNow.buried === 0 && floating <= walkNow.foot.errors.length * 0.01 && walkNow.wetOverLand === 0,
      `on ${name} the foot stands on the drawn land`,
      `${floating} of ${walkNow.foot.errors.length} grounded frames more than ${FOOT_TOLERANCE} over it (a step down being glided)`,
    );
  }
}

// --- vehicles set down on slopes ---------------------------------------------

console.log('\nvehicles on slopes');
{
  const { seatPose } = await import('../src/fleet.ts');
  const { modelsFrom, rigFrom } = await import('../src/kit.ts');
  const { craftFrom } = await import('../src/craft/index.ts');
  const { horseMaterial } = await import('../src/craft/horse.ts');
  const PUBLIC = resolve(here, '../public');
  const horseRig = await rigFrom(readFileSync(resolve(PUBLIC, 'models/fauna/horse.bin')), 'horse', horseMaterial());
  const craft = craftFrom(await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin'))), horseRig);
  const groundAt = (point: Vector3): number => drawnRadius(world, probe, point);
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const across = new Vector3();
  const north = new Vector3();
  const models = [...craft.values()].filter((model) => model.medium !== 'water');
  const pose = new Array<number>(9).fill(0);
  const out = new Array<number>(9).fill(0);
  const x = new Vector3();
  const y = new Vector3();
  const z = new Vector3();
  const basis = new Matrix4();
  const wheel = new Vector3();
  let seated = 0;
  let mirrored = 0;
  let buried = 0;
  let hovering = 0;
  let levelBuried = 0;
  let levelHovering = 0;
  let worstBuried = 0;
  let worstHover = 0;
  const examples: string[] = [];
  const at = new Vector3();
  let tries = 0;
  while (seated < 600 && tries++ < 400_000) {
    const lat = Math.asin(2 * random() - 1) * (180 / Math.PI);
    const lon = random() * 360 - 180;
    if (!usable(lat, lon)) continue;
    onSphere(lon, lat, at);
    const point = at.clone().multiplyScalar(PLANET_RADIUS);
    if (world.elevationAt(point) <= 0) continue;
    north.set(0, 1, 0).projectOnPlane(at).normalize();
    across.crossVectors(north, at).normalize();
    gradeAt(at, across, north, 6, slope);
    if (slope.grade < 0.08 || slope.grade > 0.55) continue;
    probe.prime(point);
    const model = models[seated % models.length]!;
    const forward = north.clone().applyAxisAngle(at, random() * Math.PI * 2);
    point.setLength(groundAt(point));
    pose.splice(0, 9, point.x, point.y, point.z, forward.x, forward.y, forward.z, at.x, at.y, at.z);
    seatPose(pose, model.size, model.kind, groundAt, out);
    seated++;
    // The basis `applyPose` builds, and the wheels in it.
    z.set(out[3]!, out[4]!, out[5]!).normalize();
    y.set(out[6]!, out[7]!, out[8]!).normalize();
    x.crossVectors(y, z).normalize();
    basis.makeBasis(x, y, z);
    if (basis.determinant() <= 0) mirrored++;
    const inLine = model.kind === 'bicycle' || model.kind === 'motorbike' || model.kind === 'horse';
    const along = (model.size[0] / 2) * 0.8;
    const side = inLine ? 0 : (model.size[1] / 2) * 0.8;
    const clearance = (origin: Vector3, fx: Vector3, fy: Vector3, fz: Vector3): number[] => {
      const found: number[] = [];
      for (const f of [1, -1]) {
        for (const r of [1, -1]) {
          // Right is -X: X = Y x Z = up x forward, which is left.
          wheel.copy(origin).addScaledVector(fz, f * along).addScaledVector(fx, -r * side);
          found.push(wheel.length() - groundAt(wheel));
        }
      }
      void fy;
      return found;
    };
    if (model.kind !== 'balloon') {
      const seatedClear = clearance(new Vector3(out[0]!, out[1]!, out[2]!), x, y, z);
      const low = Math.min(...seatedClear);
      if (low < -0.15) {
        buried++;
        worstBuried = Math.min(worstBuried, low);
        if (examples.length < 4) examples.push(`${model.id} ${low.toFixed(2)} at ${lat.toFixed(4)},${lon.toFixed(4)}`);
      }
      if (low > 0.15) {
        hovering++;
        worstHover = Math.max(worstHover, low);
      }
      // As they stood before: level, on the ground under the middle.
      const levelZ = forward.clone().projectOnPlane(at).normalize();
      const levelX = new Vector3().crossVectors(at, levelZ).normalize();
      const levelClear = clearance(point, levelX, at, levelZ);
      if (Math.min(...levelClear) < -0.3) levelBuried++;
      if (Math.min(...levelClear) > 0.3) levelHovering++;
    }
  }
  console.log(`  ${seated} vehicles on slopes of 0.08 to 0.55; before (level on the middle): ${levelBuried} with a wheel over 0.3 in the ground, ${levelHovering} with every wheel over 0.3 off it`);
  console.log(`  now: ${buried} with a wheel in the ground (worst ${worstBuried.toFixed(2)}), ${hovering} with none on it (worst ${worstHover.toFixed(2)})`);
  check(seated >= 300, 'vehicles found slopes to stand on', `${seated}`);
  check(mirrored === 0, 'no seated vehicle is mirrored', `${mirrored}`);
  check(buried === 0 && hovering === 0, 'every seated vehicle has its wheels on the ground and none in it', examples.join('; '));
}

// --- the roads on the drawn land, and wheels driven onto them -----------------

/**
 * The ribbon's section against the drawn land, and a wheeled vehicle driven
 * from the field onto the carriageway.
 *
 * **The section**: every `ROAD_EVERY`th road, laid at the near band's span
 * the way the streamer lays it (`ribbonSection`), its bank's feet held under
 * the drawn land — a foot over it is a gap under the ribbon's edge — and its
 * crown's edges over it. Until 2026-09-28 the foot was laid 1.5 under the
 * relief and stood over the drawn land on 6.56% of sections, worst 9.6.
 *
 * **The drive**: from 26 units off the road's middle, and off each ramp into
 * a built town, square to it and at 45 degrees, a car, a bicycle and a bus,
 * throttle held; each must reach the carriageway. A made surface a wheel
 * stands on is `ribbonHeightAt` over `drawnRadius`, as `main.ts` hands the
 * player both (`Roads.setGround`). Until 2026-09-28 the bank was stood on
 * only where it stood over the relief, and where the drawn land sagged under
 * the relief that was a step of the sag at the bank's toe: 262 of 2,744 such
 * drives never reached the carriageway (every 300th road, four vehicles, six
 * angles, walking and running). A drive whose vehicle stops inside a built
 * town's disc is left out and counted: the town's floor, which would be
 * there, is not built here.
 *
 * **And a wall is still a wall**: a four-unit terrace riser laid across the
 * carriageway ahead stops the car, and a kerb's 0.4 does not.
 */
console.log('\nthe roads on the drawn land');
{
  const { decodeRoads, inflate: unpack } = await import('../src/pack.ts');
  const {
    ROAD_CLASSES, courseOf, coursePath, coursePoint, courseTangent, createRoads, emptyCourse, emptyRamp, onBridge, parameterAt,
    rampOf, rampReach, ribbonSection, ribbonStations,
  } = await import('../src/roads.ts');
  const { isShown, radiusOf } = await import('../src/places.ts');
  const { createPlayer, writePose } = await import('../src/player.ts');
  const { modelsFrom } = await import('../src/kit.ts');
  const { craftFrom } = await import('../src/craft/index.ts');
  const PUBLIC = resolve(here, '../public');
  const network = decodeRoads(await unpack(readFileSync(resolve(PUBLIC, 'data/roads.bin'))));
  const roads = createRoads(world, placesRaw, network);
  const groundAt = (point: Vector3): number => drawnRadius(world, probe, point);
  roads.setGround(groundAt);
  const ROAD_EVERY = 120;

  // The section.
  {
    const course = emptyCourse();
    const ramp = emptyRamp();
    const stations: number[] = [];
    const section = Array.from({ length: 6 }, () => new Vector3());
    let feet = 0;
    let feetOver = 0;
    let feetWorst = 0;
    let edges = 0;
    let edgesUnder = 0;
    let edgesWorst = 0;
    let sampled = 0;
    const where: string[] = [];
    for (let i = 0; i < network.roads.length; i += ROAD_EVERY) {
      const road = network.roads[i]!;
      courseOf(road, placesRaw, course);
      const path = coursePath(course);
      rampOf(road, course, placesRaw, world, ramp);
      probe.prime(course.gateA.clone().lerp(course.gateB, 0.5).normalize().multiplyScalar(PLANET_RADIUS));
      ribbonStations(path.length, course.approach, ramp, 18, stations);
      sampled++;
      for (const s of stations) {
        ribbonSection(world, course, path, ramp, ROAD_CLASSES[road.cls]!.width * 0.5, s, section);
        if (!onBridge(ramp, s)) {
          for (const foot of [section[0]!, section[5]!]) {
            const drawn = probe.radiusAt(foot.clone().normalize());
            if (drawn === null) continue;
            feet++;
            const over = foot.length() - drawn;
            if (over > 0) {
              feetOver++;
              feetWorst = Math.max(feetWorst, over);
              if (where.length < 3) where.push(`${latOf(foot.y / foot.length()).toFixed(3)},${lonOf(foot.x, foot.z).toFixed(3)} ${over.toFixed(2)} over`);
            }
          }
        }
        for (const edge of [section[2]!, section[3]!]) {
          const drawn = probe.radiusAt(edge.clone().normalize());
          if (drawn === null) continue;
          edges++;
          const under = drawn - edge.length();
          if (under > 0) {
            edgesUnder++;
            edgesWorst = Math.max(edgesWorst, under);
          }
        }
      }
    }
    console.log(
      `  ${sampled} roads, ${feet} bank feet: ${feetOver} over the drawn land (worst ${feetWorst.toFixed(2)}); ` +
        `${edges} crown edges: ${edgesUnder} under it (worst ${edgesWorst.toFixed(2)})`,
    );
    check(feetOver <= feet * 0.001, 'a road’s bank reaches under the drawn land: no gap under the ribbon’s edge', `${feetOver} of ${feet}${where.length > 0 ? `: ${where.join('; ')}` : ''}`);
    check(edgesUnder <= edges * 0.005, 'and the carriageway’s edge is over it', `${edgesUnder} of ${edges} under, worst ${edgesWorst.toFixed(2)}`);
  }

  // The drive.
  const craft = craftFrom(await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin'))), null);
  /** A made surface of the test's own, over the roads: the wall below. */
  let extra: ((point: Vector3) => number) | null = null;
  const driver = createPlayer(world, 0, 0, {
    groundAt,
    madeHeightAt: (point) => Math.max(roads.ribbonHeightAt(point), extra?.(point) ?? 0),
  });
  const shownNear: { at: Vector3; radius: number }[] = placesRaw
    .filter((place) => isShown(place))
    .map((place) => ({ at: onSphere(place.lon, place.lat, new Vector3()), radius: radiusOf(place) }));
  const inTown = (point: Vector3): boolean =>
    shownNear.some((town) => town.at.angleTo(point) * PLANET_RADIUS < town.radius * 1.5 + 10);
  const course = emptyCourse();
  const ramp = emptyRamp();
  const middle = new Vector3();
  const tangent = new Vector3();
  const across = new Vector3();
  const start = new Vector3();
  const toward = new Vector3();
  let drives = 0;
  let reached = 0;
  let townLeft = 0;
  const stuck: string[] = [];
  let stuckCount = 0;
  /** Drives `kind` at `from` toward `forward` for up to `seconds`; true when `done` says so first. */
  const drive = (kind: string, from: Vector3, forward: Vector3, seconds: number, done: (at: Vector3) => boolean): { ok: boolean; at: Vector3 } => {
    const model = craft.get(kind)!;
    driver.goTo(latOf(from.y), lonOf(from.x, from.z));
    driver.board({ vehicle: `${kind}:check`, seat: 0, model, group: model.build(0) }, writePose(from.clone().multiplyScalar(groundAt(from)), forward, from, []));
    let ok = false;
    for (let t = 0; t < seconds && !ok; t += 1 / 60) {
      driver.update(1 / 60, { move: { x: 0, y: 1 }, run: false, jump: false, heading: driver.forward });
      ok = done(driver.position.clone().normalize());
    }
    const at = driver.position.clone().normalize();
    driver.leave();
    return { ok, at };
  };
  for (let i = 0; i < network.roads.length; i += ROAD_EVERY * 5) {
    const road = network.roads[i]!;
    courseOf(road, placesRaw, course);
    const path = coursePath(course);
    rampOf(road, course, placesRaw, world, ramp);
    const half = ROAD_CLASSES[road.cls]!.width * 0.5;
    const spots: { s: number; what: string }[] = [];
    const from = Math.max(course.approach, rampReach(ramp.riseA));
    const to = path.length - Math.max(course.approach, rampReach(ramp.riseB));
    if (to > from) spots.push({ s: (from + to) / 2, what: 'middle' });
    if (Math.abs(ramp.riseA) > 2) spots.push({ s: Math.max(14, rampReach(ramp.riseA) * 0.5), what: `ramp of ${ramp.riseA.toFixed(1)}` });
    if (Math.abs(ramp.riseB) > 2) spots.push({ s: path.length - Math.max(14, rampReach(ramp.riseB) * 0.5), what: `ramp of ${ramp.riseB.toFixed(1)}` });
    for (const spot of spots) {
      if (onBridge(ramp, spot.s) || spot.s < 0 || spot.s > path.length) continue;
      const t = parameterAt(path, spot.s);
      coursePoint(course, t, middle);
      courseTangent(course, t, tangent);
      across.crossVectors(middle, tangent).normalize();
      probe.prime(middle.clone().multiplyScalar(PLANET_RADIUS));
      for (const angle of [90, 45]) {
        for (const side of [1, -1]) {
          // From the side of the road's middle, never across its end: the
          // cap at a kerb is a town's floor in the game and nothing here.
          const back = (26 / Math.tan((angle * Math.PI) / 180)) * (spot.s < path.length / 2 ? 1 : -1);
          start.copy(middle).addScaledVector(across, (side * 26) / PLANET_RADIUS).addScaledVector(tangent, back / PLANET_RADIUS).normalize();
          if (isWater(groundAt(start)) || roads.ribbonHeightAt(start) > 0 || inTown(start)) continue;
          toward.copy(middle).sub(start).projectOnPlane(start).normalize();
          for (const kind of ['hatchback', 'bicycle', 'bus']) {
            drives++;
            const { ok, at } = drive(kind, start, toward, 5, (here) => {
              const made = roads.ribbonHeightAt(here);
              return made > 0 && Math.abs(here.clone().sub(middle).dot(across)) * PLANET_RADIUS < half &&
                Math.abs(driver.position.length() - made) < 0.5;
            });
            if (ok) reached++;
            else if (inTown(at)) townLeft++;
            else {
              stuckCount++;
              if (stuck.length < 4) stuck.push(`${kind} onto ${placesRaw[road.a]!.name}-${placesRaw[road.b]!.name}'s ${spot.what} at ${angle} deg, stopped at ${latOf(at.y).toFixed(4)},${lonOf(at.x, at.z).toFixed(4)}`);
            }
          }
        }
      }
    }
  }
  console.log(`  ${drives} drives from the field onto a road: ${reached} reached the carriageway, ${stuckCount} stopped short, ${townLeft} left out inside a town`);
  check(drives >= 200 && stuckCount === 0, 'a car, a bicycle and a bus drive from the field up the bank onto the road', stuck.join('; '));

  // A wall across the carriageway, and a kerb: the first stops the car, the second does not.
  {
    let road = network.roads[0]!;
    for (let i = 0; i < network.roads.length; i += 97) {
      courseOf(network.roads[i]!, placesRaw, course);
      rampOf(network.roads[i]!, course, placesRaw, world, ramp);
      if (course.length > 300 && Math.abs(ramp.riseA) < 1 && Math.abs(ramp.riseB) < 1 && network.roads[i]!.bridgeTo <= network.roads[i]!.bridgeFrom) {
        road = network.roads[i]!;
        break;
      }
    }
    courseOf(road, placesRaw, course);
    const path = coursePath(course);
    const s0 = path.length * 0.4;
    coursePoint(course, parameterAt(path, s0), start);
    courseTangent(course, parameterAt(path, s0), tangent);
    coursePoint(course, parameterAt(path, s0 + 30), middle);
    probe.prime(start.clone().multiplyScalar(PLANET_RADIUS));
    const line = middle.clone();
    const facing = tangent.clone();
    const past = (point: Vector3): boolean => point.clone().sub(line).dot(facing) > 0;
    for (const [rise, stops] of [[4, true], [0.4, false]] as const) {
      extra = (point) => {
        const up = point.clone().normalize();
        return past(up) ? roads.ribbonHeightAt(up) + rise : 0;
      };
      const { at } = drive('hatchback', start, tangent, 3, () => false);
      extra = null;
      const beyond = past(at);
      check(beyond !== stops, stops ? `a ${rise}-unit riser across the road stops a car` : `a ${rise}-unit kerb across it does not`, `${(at.clone().sub(line).dot(facing) * PLANET_RADIUS).toFixed(1)} units from the line`);
    }
  }
}

console.log(failures === 0 ? '\nall ground checks passed' : `\n${failures} ground check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
