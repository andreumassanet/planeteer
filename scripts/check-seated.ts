/**
 * `pnpm seated`: what stands on the ground, against the ground that is drawn.
 *
 * The land is a mesh of flat triangles laid between points of `reliefAt`, up
 * to seven units off it (`land-probe.ts`), and a town's floor is a surface of
 * its own (`floorLiftAt`). Nothing about a thing standing a unit in the air or
 * a trunk sunk to the knees shows in a table of what was built, and without
 * the ink it is the first thing an eye finds. So this builds what the game
 * builds headless round named places — flat farmland, a hillside, a hill
 * town, a coast, a forest — and measures every placed thing's base against
 * the drawn surface under it:
 *
 * - **the wood**: every plant of the two finest tiles round each place
 *   (`vegetation.sample`'s seats), its base against the drawn land under its
 *   middle and under a ring round it: a tree's lowest side may not float, a
 *   rock or a bush (which follows the slope) its middle may not;
 * - **the countryside's pieces** in those tiles, over their footprint;
 * - **the trees round a town's edge** (`settlements.recordSeats`) and **the
 *   herds** (`life.recordSeats`), the same way;
 * - **what dresses a near town's streets** (`scenery/street-dressing.ts`,
 *   through `settlements.recordSeats`): each piece's base against the town's
 *   floor under it (`madeHeightAt`), and each painted mark `DECAL_LIFT` over it;
 * - **what can be taken standing still** — a town's parked cars and the
 *   bicycles in its racks, against its floor, and a farm's tractor among the
 *   countryside's pieces — and that each is merged as the vehicle the fleet
 *   drives off (`craft/parked.ts`): the same colours as the fleet builds from
 *   its id, and marked for the material to paint as the craft's is;
 * - **the landmarks**, raised by `placement.ts`, over their plan;
 * - **the grass**: the fine and the coarse field baked round each place and
 *   round its nearest built town exactly as `grass.ts` bakes them, and blades
 *   laid by the shader's own rule (`grassLookup`, restated here as the
 *   witness): none on a street, a pavement or paving of a standing town, few
 *   where the grass's own rule grows none, and every root on the surface under
 *   it — a lawn's floor, an edge slope or the drawn land;
 * - **the airstrips**: the grass on each mown to `STRIP_MOWN`, none on its
 *   worn track, rooted on the drawn strip, and the field tall beside it;
 * - **the camps**: no grass over a camp's fire and short round it.
 *
 * What fails: a share of floating things of a kind over the thresholds below.
 * It prints the distribution per kind, and an `?at=` for the worst of each.
 * What it cannot fix is printed too: the land mesh has cracks, a step of a few
 * units between two faces along a line, and a blade laid across one floats.
 *
 *   node scripts/check-seated.ts        or   pnpm seated
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Color, Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, buildLand } from '../src/globe.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { indexPlaces, isShown, radiusOf, terrainSiteOf } from '../src/places.ts';
import type { Road } from '../src/roads.ts';
import { decodePlaces, decodeRoads, inflate } from '../src/pack.ts';
import { latOf, lonOf, unitAt } from '../src/sphere.ts';
import { createSiteIndex } from '../src/fleet.ts';
import type { FleetSite } from '../src/fleet.ts';
import { STRIP_BACK, STRIP_DRAWN, STRIP_LENGTH, STRIP_LIFT, STRIP_MOWN, STRIP_TRACK, stripPoint } from '../src/craft/airstrip.ts';
import { landProbeOf } from '../src/land-probe.ts';
import { planShape } from '../src/landmark-ground.ts';
import type { LandmarkSite } from '../src/landmark-ground.ts';
import { beginFrameBuild } from '../src/view.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** How far over the drawn surface a base may stand before it is floating, in units. */
const FLOAT = 0.15;
/**
 * The share of plants (and animals), of pieces (and landmarks) and of blades
 * that may float, over every place. 0 of each floated on 2026-09-28, and
 * 0.07% of the blades: the coarse field's five-unit texels across a hill
 * town's embankment, and the land's cracks. Before, 13% of the trees, 29% of
 * the rocks and bushes, 43% of the trees round a town's edge, 16% of the
 * pieces and 56% of the landmarks (seated on the relief); and laid by the
 * field's old rule (the coarse field under the fine where the fine grew none,
 * a texel's reach past a kerb, a height between a lawn and the street), 1.7%
 * of the blades, 501 of them a unit up, and 1,007 on paving.
 */
const MAX_FLOATING_PLANTS = 0.005;
const MAX_FLOATING_PIECES = 0.02;
const MAX_FLOATING_BLADES = 0.002;
/** And the blades a whole unit up, which is a tuft in the air from any distance. */
const MAX_HIGH_BLADES = 0.0002;
/** And the share of blades that may stand where the grass's own rule grows none. */
const MAX_STRAY_BLADES = 0.002;
/** None may stand on a town's street, pavement, paving or wall. */
const MAX_PAVED_BLADES = 0;

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// --- the world, as check-country.ts loads it --------------------------------

const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;
const monumentsPath = resolve(here, '../public/data/monuments.json');
const monuments: LandmarkSite[] = existsSync(monumentsPath)
  ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: typeof monuments }).monuments
  : [];
setFlattenSites(monuments as never);
const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
setDetailSites(placesRaw.map(terrainSiteOf));
const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const places = indexPlaces(placesRaw, 0).all;
const roadsRaw = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
const roads: Road[] = roadsRaw.places === places.length ? roadsRaw.roads : [];
if (roads.length === 0) {
  console.log(`  roads.bin was baked against ${roadsRaw.places} places and there are ${places.length}. Run \`pnpm roads\`.`);
  process.exit(1);
}
const fields = createSiteIndex({ world, places, roads, monuments });
const started = Date.now();
const land = buildLand(world);
console.log(`the land: ${(land.geometry.getAttribute('position').count / 3).toLocaleString()} triangles in ${Date.now() - started} ms`);
const probe = landProbeOf(land);

// The towns, the wood, the herds and the landmarks reach the registries of
// the scenery, the traffic, the fauna and the monuments, each an eager
// `import.meta.glob`, which is a Vite transform: the one call is rewritten
// into the static imports Vite would have made, as `check-country.ts` does.
{
  const registries = ['/src/scenery/index.ts', '/src/traffic/index.ts', '/src/fauna/index.ts'];
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (url.endsWith('/src/monuments/index.ts')) {
        const files = readdirSync(resolve(here, '../src/monuments')).filter((file) => file.endsWith('.ts') && file !== 'contract.ts' && file !== 'index.ts').sort();
        const imports = files.map((file, i) => `import * as monument${i} from './${file}';`).join('\n');
        const table = `{ ${files.map((file, i) => `'./${file}': monument${i}`).join(', ')} }`;
        const text = String(result.source);
        const glob = /import\.meta\.glob\s*(?:<.*?>)?\s*\(\s*\[[^\]]*\],\s*\{ eager: true \},?\s*\)/;
        if (!glob.test(text)) throw new Error('check-seated: the monument registry no longer reads its files the way this shim rewrites');
        return { ...result, source: `${imports}\n${text.replace(glob, table)}` };
      }
      const registry = registries.find((end) => url.endsWith(end));
      if (registry === undefined) return result;
      const parts = resolve(here, `..${registry.replace('/index.ts', '')}/parts`);
      const files = readdirSync(parts).filter((file) => file.endsWith('.ts')).sort();
      const imports = files.map((file, i) => `import * as part${i} from './parts/${file}';`).join('\n');
      const table = `{ ${files.map((file, i) => `'./parts/${file}': part${i}`).join(', ')} }`;
      const text = String(result.source);
      const glob = /import\.meta\.glob\s*(?:<.*?>)?\s*\('\.\/parts\/\*\.ts', \{ eager: true \}\)/;
      if (!glob.test(text)) throw new Error(`check-seated: ${registry} no longer reads its parts the way this shim rewrites`);
      return { ...result, source: `${imports}\n${text.replace(glob, table)}` };
    },
  });
}
const { registerModelsFromDisk } = await import('./kit-node.ts');
await registerModelsFromDisk();
const { createSettlements } = await import('../src/settlements.ts');
const { DECAL_LIFT } = await import('../src/scenery/street-dressing.ts');
const { createVegetation } = await import('../src/vegetation.ts');
type PlantSeat = import('../src/vegetation.ts').PlantSeat;
type GrassSite = import('../src/vegetation.ts').GrassSite;
const { GRASS_FIELDS, GRASS_SPREAD } = await import('../src/grass.ts');
// The fleet's craft off its own copy of the kit, as the world loads it: what a
// vehicle standing still is held to.
const { craftFrom } = await import('../src/craft/index.ts');
const { modelsFrom } = await import('../src/kit.ts');
const { fleetVariant, MACHINE_BED, OPAQUE_GLASS } = await import('../src/craft/parked.ts');
const { craftMaterial } = await import('../src/craft/build.ts');
const { mergeMeshes } = await import('../src/merge.ts');
const fleetCraft = craftFrom(await modelsFrom(readFileSync(resolve(here, '../public/models/traffic/kit.bin'))));
type ParkedCar = import('../src/settlements.ts').ParkedCar;
const settlements = createSettlements(world, places, { monuments: monuments as never, roads, land });
type TownSeat = import('../src/settlements.ts').TownSeat;
const townSeats: TownSeat[] = [];
settlements.recordSeats(townSeats);
const wood = createVegetation(world, { places, monuments: monuments as never, roads, fields, land, lawns: settlements });
const grass = wood.grass!;
// The herds, from the baked rigs on disk as `pnpm fauna` reads them.
const { rigFromDisk } = await import('./kit-node.ts');
const { ANIMALS } = await import('../src/fauna/index.ts');
const { createLife } = await import('../src/life.ts');
type HerdSeat = import('../src/life.ts').HerdSeat;
const { MeshBasicMaterial } = await import('three');
const RIG_IDS = ['cow', 'bull', 'horse', 'donkey', 'sheep', 'alpaca', 'stag', 'camel'];
const RIGS = new Map(await Promise.all(RIG_IDS.map(async (id) => [id, await rigFromDisk(id, new MeshBasicMaterial())] as const)));
const life = createLife(world, places, { animals: ANIMALS, rigs: { get: (id: string) => RIGS.get(id) ?? null }, roads, fields, land });
const herdSeats: HerdSeat[] = [];
life.recordSeats(herdSeats);
console.log(`world: ${places.length} places, ${roads.length} roads, ${monuments.length} landmarks\n`);

// --- the places -----------------------------------------------------------------

interface Where {
  name: string;
  lat: number;
  lon: number;
}
const WHERE: Where[] = [
  { name: 'Bavaria', lat: 48.0, lon: 11.9 },
  { name: 'Tuscany', lat: 43.35, lon: 11.2 },
  { name: 'Bernese Oberland', lat: 46.62, lon: 7.95 },
  { name: 'Mallorca', lat: 39.65, lon: 2.9 },
  { name: 'Finnish taiga', lat: 62.5, lon: 26.0 },
  { name: 'Kyoto', lat: 35.01, lon: 135.77 },
  { name: 'Granada', lat: 37.18, lon: -3.6 },
  { name: 'Iowa', lat: 42.0, lon: -93.4 },
];

const at = (v: Vector3): string => `?at=${latOf(v.y).toFixed(5)},${lonOf(v.x, v.z).toFixed(5)}`;

/** The drawn surface under `direction`: a standing town's floor where it stands over the land, else the land. */
function surfaceAt(direction: Vector3): number | null {
  const landRadius = probe.radiusAt(direction);
  const made = settlements.madeHeightAt(direction);
  if (landRadius === null) return made > 0 ? made : null;
  return Math.max(landRadius, made);
}

/** The towns round a point, standing as they would with the player there. */
function standTowns(centre: Vector3): void {
  const viewer = centre.clone().multiplyScalar(PLANET_RADIUS + 2);
  for (let frame = 0; frame < 400; frame++) {
    beginFrameBuild();
    settlements.update(viewer, 20);
    if (settlements.stats.pending === 0 && frame > 2) break;
  }
}

// --- the tallies ------------------------------------------------------------------

interface Tally {
  count: number;
  floating: number;
  /** The worst float and the worst burial, in units, and where. */
  worstFloat: number;
  worstFloatAt: string;
  worstBuried: number;
  gaps: number[];
}
const tally = (): Tally => ({ count: 0, floating: 0, worstFloat: 0, worstFloatAt: '', worstBuried: 0, gaps: [] });
const record = (t: Tally, gap: number, where: string): void => {
  t.count++;
  t.gaps.push(gap);
  if (gap > FLOAT) t.floating++;
  if (gap > t.worstFloat) {
    t.worstFloat = gap;
    t.worstFloatAt = where;
  }
  t.worstBuried = Math.min(t.worstBuried, gap);
};
const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
};
const describe = (t: Tally): string =>
  `${t.count} measured, ${t.floating} over ${FLOAT} (${((100 * t.floating) / Math.max(1, t.count)).toFixed(2)}%); ` +
  `over 0.5 ${t.gaps.filter((g) => g > 0.5).length}, over 1 ${t.gaps.filter((g) => g > 1).length}; ` +
  `gap p1 ${percentile(t.gaps, 0.01).toFixed(2)} p50 ${percentile(t.gaps, 0.5).toFixed(2)} p99 ${percentile(t.gaps, 0.99).toFixed(2)}; ` +
  `worst float ${t.worstFloat.toFixed(2)}${t.worstFloatAt ? ` ${t.worstFloatAt}` : ''}, deepest ${t.worstBuried.toFixed(2)}`;

const trees = tally();
const pieces = tally();
const dressing = tally();
const marks = tally();
const parkedStill = tally();
/** Vehicles standing still held to the fleet's, and those that were not it; and the vertices marked that were not one. */
const machines = { towns: 0, tiles: 0, kinds: new Set<string>(), wrong: [] as string[], strayMarks: 0 };
const machineSeen = new Set<string>();

/**
 * The colours the fleet draws the vehicle with this id in, as `fleet.ts`
 * builds it, less what the buffer it stands in cannot carry: a town draws a
 * closed craft's glass apart (`glazed`), and a tile leaves its cabin out and
 * paints its glass the opaque slate (`parkedArrays` in `craft/parked.ts`).
 */
function fleetColours(id: string, glazed: boolean): Float32Array | null {
  const model = fleetCraft.get(id.slice(0, id.indexOf(':')));
  if (model === undefined) return null;
  const paint = settlements.parkedPaint(id);
  const group = model.build(fleetVariant(id, model.variants), paint ?? undefined);
  const leave = glazed ? ['glass'] : ['cabin', 'steer', 'needle'];
  for (const name of leave) for (let part = group.getObjectByName(name); part !== undefined; part = group.getObjectByName(name)) part.removeFromParent();
  const glass = group.getObjectByName('glass') as import('three').Mesh | undefined;
  if (glass !== undefined) {
    const colour = glass.geometry.getAttribute('color');
    const opaque = new Color(OPAQUE_GLASS);
    for (let i = 0; i < colour.count; i++) colour.setXYZ(i, opaque.r, opaque.g, opaque.b);
    glass.material = craftMaterial();
  }
  return mergeMeshes(group).color;
}

/**
 * The towns standing round a place: every vehicle that can be taken, merged,
 * against the fleet's own; and no other vertex in a town marked as one.
 */
function measureParked(centre: Vector3): void {
  const viewer = centre.clone().multiplyScalar(PLANET_RADIUS + 2);
  const bays: ParkedCar[] = [];
  settlements.parkedNear(viewer, 4000, bays);
  const byMesh = new Map<import('three').Mesh, number>();
  for (const bay of bays as (ParkedCar & { start: number; count: number })[]) {
    if (machineSeen.has(bay.id)) continue;
    machineSeen.add(bay.id);
    const town = places[Number(bay.id.split(':')[1])]!;
    const meshes = settlements.group.children.filter((child) => child.name === `town:${town.name}`) as import('three').Mesh[];
    const expected = fleetColours(bay.id, true);
    let matched = false;
    for (const mesh of meshes) {
      const color = mesh.geometry.getAttribute('color').array as Float32Array;
      const lit = mesh.geometry.getAttribute('atlasLit').array as Uint8Array;
      if (expected === null || bay.count * 3 !== expected.length) continue;
      let ok = true;
      for (let i = 0; i < expected.length && ok; i++) ok = color[bay.start * 3 + i] === expected[i];
      for (let v = bay.start; v < bay.start + bay.count && ok; v++) ok = lit[v * 2] === 0 && lit[v * 2 + 1] === MACHINE_BED;
      if (!ok) continue;
      matched = true;
      byMesh.set(mesh, (byMesh.get(mesh) ?? 0) + bay.count);
      break;
    }
    machines.towns++;
    machines.kinds.add(bay.model);
    if (!matched && machines.wrong.length < 6) machines.wrong.push(`${bay.id} ${at(bay.position.clone().normalize())}`);
  }
  // Every marked vertex in those towns is one of theirs.
  for (const [mesh, count] of byMesh) {
    const lit = mesh.geometry.getAttribute('atlasLit').array as Uint8Array;
    let marked = 0;
    for (let v = 0; v < lit.length; v += 2) if (lit[v] === 0 && lit[v + 1] === MACHINE_BED) marked++;
    machines.strayMarks += Math.max(0, marked - count);
  }
}

/** A near tile's vehicles that can be taken, against the fleet's: its colours to a byte, and marked in the wind. */
function measureTileMachines(lat: number, lon: number): void {
  const mesh = wood.raiseTile(lat, lon, 0);
  if (mesh === null) return;
  const list = (mesh.userData.machines ?? []) as (ParkedCar & { start: number; count: number })[];
  const color = mesh.geometry.getAttribute('color').array as Uint8Array;
  const wind = mesh.geometry.getAttribute('aWind')?.array as Uint8Array | undefined;
  for (const machine of list) {
    if (machineSeen.has(machine.id)) continue;
    machineSeen.add(machine.id);
    const expected = fleetColours(machine.id, false);
    let ok = expected !== null && machine.count * 3 === expected.length && wind !== undefined;
    for (let i = 0; ok && i < expected!.length; i++) ok = Math.abs(color[machine.start * 3 + i]! - Math.round(Math.min(1, Math.max(0, expected![i]!)) * 255)) <= 1;
    for (let v = machine.start; ok && v < machine.start + machine.count; v++) ok = wind![v * 4 + 2] === MACHINE_BED;
    machines.tiles++;
    machines.kinds.add(machine.model);
    if (!ok && machines.wrong.length < 6) machines.wrong.push(`${machine.id} ${at(machine.position.clone().normalize())}`);
  }
  mesh.traverse((object) => (object as import('three').Mesh).geometry?.dispose());
}
const edges = tally();
const animals = tally();
const rocks = tally();
const blades = tally();
const fineBlades = tally();
const coarseBlades = tally();
let bladesStray = 0;
let bladesPaved = 0;
let bladesWalled = 0;
const strayAt: string[] = [];
const pavedAt: string[] = [];
let provisional = 0;
/** Plants seated on the relief with the drawn land gathered under them. */
let onRelief = 0;

// --- the wood --------------------------------------------------------------------------

const ring = new Vector3();
const seatUp = new Vector3();
const seatNorth = new Vector3();
const seatAcross = new Vector3();

/**
 * One plant's base against the drawn land. A tree stands upright but for its
 * lean, so the lowest of the ground round its trunk is what it may not float
 * over; a rock or a bush lies on the slope, so only its middle is asked.
 */
function measureSeat(seat: PlantSeat): void {
  const base = new Vector3(seat.x, seat.y, seat.z);
  seatUp.copy(base).normalize();
  if (!probe.covers(seatUp)) return;
  if (!seat.drawn) onRelief++;
  const centre = probe.radiusAt(seatUp);
  if (centre === null) return;
  let lowest = centre;
  const piece = seat.id.startsWith('country:');
  if (seat.tree) {
    seatNorth.set(0, 1, 0).projectOnPlane(seatUp).normalize();
    seatAcross.crossVectors(seatUp, seatNorth).normalize();
    // A tree's trunk, a unit round, and not the crown's reach; a piece's walls.
    const k = (piece ? seat.reach : Math.min(1, seat.reach)) / PLANET_RADIUS;
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8;
      ring.copy(seatUp).addScaledVector(seatAcross, Math.cos(angle) * k).addScaledVector(seatNorth, Math.sin(angle) * k).normalize();
      const radius = probe.radiusAt(ring);
      if (radius !== null) lowest = Math.min(lowest, radius);
    }
  }
  record(piece ? pieces : seat.id.startsWith('edge:') ? edges : seat.tree ? trees : rocks, base.length() - lowest, `${seat.id} ${at(seatUp)}`);
}

// --- the grass, as `grass.ts` bakes and lays it --------------------------------------

/** A tangent frame: `grass.ts`'s `frameAt`. */
interface Frame {
  up: Vector3;
  across: Vector3;
  north: Vector3;
}
function frameAt(direction: Vector3): Frame {
  const up = direction.clone().normalize();
  const north = new Vector3(0, 1, 0).projectOnPlane(up).normalize();
  const across = new Vector3().crossVectors(up, north).normalize();
  return { up, across, north };
}
function directionIn(frame: Frame, x: number, z: number, out: Vector3): Vector3 {
  return out.copy(frame.up).multiplyScalar(PLANET_RADIUS).addScaledVector(frame.across, x).addScaledVector(frame.north, z).normalize();
}

/** One field: the height and density a texel, over a window centred on the anchor. */
interface Field {
  texel: number;
  size: number;
  i0: number;
  height: Float64Array;
  density: Float64Array;
  /** 1 where the ground goes on, grass or none. */
  ground: Uint8Array;
}
const site: GrassSite = { radius: 0, density: 0, r: 0, g: 0, b: 0, dry: 0, height: 1 };
const texelDirection = new Vector3();
let bakeMs = 0;
let bakeTexels = 0;
const push = new Vector3();
const inside = new Vector3();
function bake(frame: Frame, texel: number, size: number): Field {
  const i0 = -size / 2;
  const field: Field = { texel, size, i0, height: new Float64Array(size * size), density: new Float64Array(size * size), ground: new Uint8Array(size * size) };
  grass.gather(frame.up, size * texel * 0.71 + texel * 2);
  const began = performance.now();
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      directionIn(frame, (i0 + i + 0.5) * texel, (i0 + j + 0.5) * texel, texelDirection);
      if (!grass.covers(texelDirection)) continue;
      const found = grass.at(texelDirection, site, texel * GRASS_SPREAD);
      if (found === null) continue;
      field.height[j * size + i] = found.radius - PLANET_RADIUS;
      field.density[j * size + i] = found.density;
      field.ground[j * size + i] = 1;
    }
  }
  bakeMs += performance.now() - began;
  bakeTexels += size * size;
  return field;
}

/**
 * The shader's `grassLookup`, restated as the witness: -1 outside the window,
 * 0 where no blade grows, else 1 with the height in `out[0]` and the density
 * in `out[1]`.
 */
function lookup(field: Field, x: number, z: number, out: number[]): number {
  const gx = x / field.texel - 0.5 - field.i0;
  const gz = z / field.texel - 0.5 - field.i0;
  if (gx < 0.5 || gz < 0.5 || gx > field.size - 2 || gz > field.size - 2) return -1;
  const bx = Math.floor(gx);
  const bz = Math.floor(gz);
  const fx = gx - bx;
  const fz = gz - bz;
  const corners: [number, number, number][] = [
    [bx, bz, (1 - fx) * (1 - fz)],
    [bx + 1, bz, fx * (1 - fz)],
    [bx, bz + 1, (1 - fx) * fz],
    [bx + 1, bz + 1, fx * fz],
  ];
  let ws = 0;
  let h = 0;
  let hw = 0;
  let d = 0;
  for (const [i, j, w] of corners) {
    const at = j * field.size + i;
    if (field.ground[at] === 1) {
      h += w * field.height[at]!;
      hw += w;
    }
    const density = field.density[at]!;
    if (density < 1e-4) continue;
    ws += w;
    d += w * density;
  }
  if (ws < 0.5) return 0;
  out[0] = h / Math.max(hw, 1e-4);
  out[1] = (d / ws) * smoothstep(0.5, 0.85, ws);
  return 1;
}
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Blades laid over the fields round `anchor`: the fine field wherever it has
 * the point, the coarse past it, as the shader chooses. `radius` is how far
 * out to lay them: a town's square and its edge, or the fine field's reach.
 */
function measureGrass(anchor: Vector3, radius: number, count: number, label: string): void {
  const frame = frameAt(anchor);
  const fine = bake(frame, GRASS_FIELDS.fine.texel, GRASS_FIELDS.fine.size);
  const coarse = radius > GRASS_FIELDS.fine.texel * GRASS_FIELDS.fine.size * 0.45 ? bake(frame, GRASS_FIELDS.coarse.texel, GRASS_FIELDS.coarse.size) : null;
  const out = [0, 0];
  const root = new Vector3();
  let seed = 12345;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let laid = 0;
  for (let n = 0; n < count; n++) {
    const x = (random() * 2 - 1) * radius;
    const z = (random() * 2 - 1) * radius;
    let found = lookup(fine, x, z, out);
    const which = found < 0 ? 'coarse' : 'fine';
    if (found < 0 && coarse !== null) found = lookup(coarse, x, z, out);
    if (found !== 1 || random() >= Math.min(1, out[1]! * 1.3)) continue;
    laid++;
    directionIn(frame, x, z, root);
    const where = `${label} ${at(root)}`;
    // On a street, a pavement or paving of a standing town. Inside a
    // building's walls is left out: the coarse field's texels are five units
    // apart and lay a blade across a cottage, where no eye can see it.
    const landRadius = probe.radiusAt(root);
    if (landRadius !== null && settlements.madeHeightAt(root) > 0 && settlements.swardAt(root, landRadius, 0) === null) {
      if (settlements.collide(inside.copy(root).multiplyScalar(PLANET_RADIUS + out[0]!), 0.01, push)) bladesWalled++;
      else {
        bladesPaved++;
        if (pavedAt.length < 6) pavedAt.push(where);
      }
    }
    // Where the grass's own rule grows none.
    grass.gather(root, 4);
    const own = grass.at(root, site, 0);
    if (own === null || own.density <= 0) {
      bladesStray++;
      if (strayAt.length < 6) strayAt.push(where);
    }
    const surface = own?.radius ?? surfaceAt(root);
    if (surface === null) continue;
    const gap = PLANET_RADIUS + out[0]! - surface;
    record(blades, gap, where);
    record(which === 'fine' ? fineBlades : coarseBlades, gap, where);
  }
  if (laid === 0) console.log(`    (no grass round ${label})`);
}

// --- round each place -----------------------------------------------------------------

for (const where of WHERE) {
  const centre = unitAt(where.lat, where.lon, new Vector3());
  probe.prime(centre);
  standTowns(centre);
  measureParked(centre);
  const before = { trees: trees.count, rocks: rocks.count, blades: blades.count, stray: bladesStray, paved: bladesPaved };
  const floatBefore = { trees: trees.floating, rocks: rocks.floating, blades: blades.floating };
  // The herds round the place, as they stand a few seconds after arriving.
  {
    const viewer = centre.clone().multiplyScalar(PLANET_RADIUS + world.elevationAt(centre) + 8);
    for (let frame = 0; frame < 60; frame++) life.update(viewer, 8, undefined, frame * 0.05, 0.05);
    for (const seat of herdSeats) {
      const direction = new Vector3(seat.x, seat.y, seat.z);
      if (!probe.covers(direction)) continue;
      seatNorth.set(0, 1, 0).projectOnPlane(direction).normalize();
      seatAcross.crossVectors(direction, seatNorth).normalize();
      // An animal stands on four hooves round its middle: the lowest ground
      // under its stance is what it may not float over.
      let lowest = probe.radiusAt(direction);
      if (lowest === null) continue;
      const k = (seat.reach * 0.7) / PLANET_RADIUS;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        ring.copy(direction).addScaledVector(seatAcross, Math.cos(angle) * k).addScaledVector(seatNorth, Math.sin(angle) * k).normalize();
        const radius = probe.radiusAt(ring);
        if (radius !== null) lowest = Math.min(lowest, radius);
      }
      record(animals, seat.radius - lowest, `herd ${at(direction)}`);
    }
    herdSeats.length = 0;
  }
  // The trees round the edges of the towns just built, and what dresses
  // their streets (`scenery/street-dressing.ts`): a piece's base against the
  // floor a foot finds under it, and a painted mark `DECAL_LIFT` over it.
  for (const seat of townSeats) {
    const direction = new Vector3(seat.x, seat.y, seat.z).normalize();
    if (seat.id.startsWith('parked:')) {
      const floor = settlements.madeHeightAt(direction);
      if (floor <= 0) continue;
      record(parkedStill, seat.radius - floor, `${seat.id} ${at(direction)}`);
      continue;
    }
    if (seat.id.startsWith('dress:')) {
      const floor = settlements.madeHeightAt(direction);
      // A town streamed out since is not asked about.
      if (floor <= 0) continue;
      const decal = seat.id === 'dress:decal';
      record(decal ? marks : dressing, seat.radius - floor - (decal ? DECAL_LIFT : 0), `${seat.id} ${at(direction)}`);
      continue;
    }
    if (!seat.drawn && probe.covers(direction)) onRelief++;
    measureSeat({ id: `edge:${seat.id}`, tree: true, drawn: true, x: direction.x * seat.radius, y: direction.y * seat.radius, z: direction.z * seat.radius, height: 0, reach: seat.reach });
  }
  townSeats.length = 0;
  // The two finest levels of the wood round the place: the tile it is in and its eight neighbours at the finest.
  for (let level = 0; level < 2; level++) {
    const step = level === 0 ? 0.625 : 1.25;
    const offsets = level === 0 ? [-1, 0, 1] : [0];
    for (const di of offsets) {
      for (const dj of offsets) {
        const lat = where.lat + di * step * 0.9;
        const lon = where.lon + (dj * step * 0.9) / Math.cos((where.lat * Math.PI) / 180);
        const result = wood.sample(lat, lon, level) as { seats: PlantSeat[]; provisional: boolean };
        if (result.provisional) provisional++;
        for (const seat of result.seats) measureSeat(seat);
        if (level === 0) measureTileMachines(lat, lon);
      }
    }
  }
  measureGrass(centre, 280, 40_000, where.name);
  // And the nearest built town, which is where the lawns are.
  let nearest: { place: (typeof places)[number]; distance: number } | null = null;
  const direction = new Vector3();
  for (const place of places) {
    if (!isShown(place)) continue;
    const distance = unitAt(place.lat, place.lon, direction).angleTo(centre) * PLANET_RADIUS;
    if (distance < 1200 && (nearest === null || distance < nearest.distance)) nearest = { place, distance };
  }
  if (nearest !== null) {
    const town = unitAt(nearest.place.lat, nearest.place.lon, new Vector3());
    probe.prime(town);
    standTowns(town);
    measureParked(town);
    measureGrass(town, Math.min(300, radiusOf(nearest.place) + 20), 60_000, `${where.name}: ${nearest.place.name}`);
  }
  console.log(
    `${where.name}: trees ${trees.count - before.trees} (${trees.floating - floatBefore.trees} floating), ` +
      `rocks and bushes ${rocks.count - before.rocks} (${rocks.floating - floatBefore.rocks}), ` +
      `blades ${blades.count - before.blades} (${blades.floating - floatBefore.blades} floating, ${bladesStray - before.stray} stray, ${bladesPaved - before.paved} on paving)` +
      `${nearest !== null ? `, town ${nearest.place.name}` : ''}`,
  );
}

// --- the landmarks ----------------------------------------------------------------------
//
// Each raised by `placement.ts` as the world raises it, with the land probe
// gathered round it, and its base held against the drawn land under its
// middle and a ring at seven tenths of its footprint.
const landmarks = tally();
{
  const { createMonuments } = await import('../src/placement.ts');
  const { MONUMENTS, buildMonument } = await import('../src/monuments/index.ts');
  const standing = createMonuments(world, monuments as never, { monuments: MONUMENTS, build: buildMonument }, undefined, undefined, undefined, land);
  for (const site of monuments as unknown as { id: string; lat: number; lon: number; footprint?: number }[]) {
    const direction = unitAt(site.lat, site.lon, new Vector3());
    probe.prime(direction);
    const viewer = direction.clone().multiplyScalar(PLANET_RADIUS + world.elevationAt(direction) + 30);
    for (let frame = 0; frame < 6; frame++) {
      beginFrameBuild();
      standing.update(viewer, 30);
    }
    const model = standing.group.getObjectByName(`monument:${site.id}`);
    if (model === undefined) continue;
    const base = model.position.length();
    const centre = probe.radiusAt(direction);
    if (centre === null) continue;
    seatNorth.set(0, 1, 0).projectOnPlane(direction).normalize();
    seatAcross.crossVectors(direction, seatNorth).normalize();
    // Under its plan, the box its model stands in, on a grid of five by five;
    // a ring at seven tenths of its footprint where it has none.
    let lowest = centre;
    const shape = planShape(site as never);
    for (let i = 0; i < 25; i++) {
      const u = (i % 5) / 2 - 1;
      const v = Math.floor(i / 5) / 2 - 1;
      const angle = (i * Math.PI) / 12.5;
      const x = Number.isFinite(shape.hx) ? shape.cx + u * shape.hx : Math.cos(angle) * shape.radius * 0.7;
      const z = Number.isFinite(shape.hz) ? shape.cz + v * shape.hz : Math.sin(angle) * shape.radius * 0.7;
      ring.copy(direction).addScaledVector(seatAcross, x / PLANET_RADIUS).addScaledVector(seatNorth, z / PLANET_RADIUS).normalize();
      const radius = probe.radiusAt(ring);
      if (radius !== null) lowest = Math.min(lowest, radius);
    }
    record(landmarks, base - lowest, `${site.id} ${at(direction)}`);
    if (base - lowest > FLOAT) console.log(`    ${site.id} ${(base - lowest).toFixed(2)} ${at(direction)}`);
  }
}

console.log('\nthe wood:');
check(trees.floating <= trees.count * MAX_FLOATING_PLANTS, `trees seated on the drawn land`, describe(trees));
check(rocks.floating <= rocks.count * MAX_FLOATING_PLANTS, `rocks and bushes seated on the drawn land`, describe(rocks));
check(pieces.floating <= pieces.count * MAX_FLOATING_PIECES, `the countryside's pieces seated on the drawn land`, describe(pieces));
check(edges.floating <= edges.count * MAX_FLOATING_PLANTS, `the trees round a town's edge seated on the drawn land`, describe(edges));
check(animals.floating <= animals.count * MAX_FLOATING_PLANTS, 'the herds seated on the drawn land', describe(animals));
check(landmarks.floating <= landmarks.count * MAX_FLOATING_PIECES, 'the landmarks seated on the drawn land', describe(landmarks));
// What stands on a town's floor is seated on the floor's own surface, so it
// may be off it by no more than the float's step: neither up nor down.
check(dressing.count > 0 && dressing.worstFloat <= 0.02 && dressing.worstBuried >= -0.02, 'the street dressing seated on the town floor', describe(dressing));
check(marks.count > 0 && marks.worstFloat <= 0.02 && marks.worstBuried >= -0.02, `the paint on the paving ${DECAL_LIFT} over it, no more and no less`, describe(marks));
check(parkedStill.count > 0 && parkedStill.worstFloat <= 0.02 && parkedStill.worstBuried >= -0.02, "a town's parked vehicles and its racks' bicycles on its floor", describe(parkedStill));
check(
  machines.towns > 0 && machines.tiles > 0 && machines.wrong.length === 0 && machines.strayMarks === 0,
  'what can be taken stands merged as the vehicle the fleet drives off, and marked so',
  `${machines.towns} in towns, ${machines.tiles} in tiles (${[...machines.kinds].sort().join(', ')}); ${machines.strayMarks} other vertices marked${machines.wrong.length > 0 ? `; not the fleet's: ${machines.wrong.join('; ')}` : ''}`,
);
check(onRelief === 0, 'no plant seated on the relief with the land gathered under it', `${onRelief}; ${provisional} tiles provisional`);
console.log('\nthe grass:');
console.log(`  the bake: ${bakeTexels.toLocaleString()} texels at ${((bakeMs * 1000) / Math.max(1, bakeTexels)).toFixed(1)} microseconds each`);
check(blades.floating <= blades.count * MAX_FLOATING_BLADES, 'blades rooted on the surface under them', describe(blades));
check(blades.gaps.filter((gap) => gap > 1).length <= blades.count * MAX_HIGH_BLADES, 'and hardly one a unit in the air');
console.log(`    fine: ${describe(fineBlades)}`);
console.log(`    coarse: ${describe(coarseBlades)}`);
check(bladesStray <= blades.count * MAX_STRAY_BLADES, 'no blade where the grass grows none', `${bladesStray} of ${blades.count}${strayAt.length > 0 ? `: ${strayAt.join('; ')}` : ''}`);
check(bladesPaved <= MAX_PAVED_BLADES, 'no blade on a street, a pavement, paving or a wall', `${bladesPaved}${pavedAt.length > 0 ? `: ${pavedAt.join('; ')}` : ''}; ${bladesWalled} inside a building's walls`);

// --- the airstrips -----------------------------------------------------------------
//
// A strip is grass mown short (`craft/airstrip.ts`'s `stripCover`, which the
// grass is baked from and the strip is drawn from): the planes nearest the
// places above, the ground probed under each, and the grass asked on a
// lattice over the strip and along two lines a few units outside its edges,
// where the field goes on as grass. On the strip no blade stands taller than
// `STRIP_MOWN` of the field's, none on the worn track down its middle, and
// every one roots on the drawn strip, `STRIP_LIFT` over the land.
console.log('\nthe airstrips:');
{
  const planes: FleetSite[] = [];
  const seen = new Set<string>();
  for (const where of WHERE) {
    const found = fields.planesNear(unitAt(where.lat, where.lon, new Vector3()), 2500, []);
    for (const site of found) {
      if (seen.has(site.id)) continue;
      seen.add(site.id);
      planes.push(site);
      break;
    }
  }
  const site: GrassSite = { radius: 0, density: 0, r: 0, g: 0, b: 0, dry: 0, height: 1 };
  const point = new Vector3();
  let onStrip = 0;
  let mown = 0;
  let tall = 0;
  let track = 0;
  let trackGrown = 0;
  let unlifted = 0;
  let beside = 0;
  let besideGrown = 0;
  const wrongAt: string[] = [];
  const wrong = (plane: FleetSite, what: string): void => {
    if (wrongAt.length < 4) wrongAt.push(`${what} ${plane.id} ?at=${latOf(point.y).toFixed(5)},${lonOf(point.x, point.z).toFixed(5)}`);
  };
  for (const plane of planes) {
    const middle = stripPoint(plane, STRIP_LENGTH / 2, 0, new Vector3());
    probe.prime(middle);
    grass.gather(middle, STRIP_LENGTH / 2 + STRIP_BACK + 40);
    for (let along = -STRIP_BACK; along <= STRIP_LENGTH; along += 8) {
      for (let across = -STRIP_DRAWN + 0.5; across <= STRIP_DRAWN - 0.5; across += (2 * STRIP_DRAWN - 1) / 8) {
        stripPoint(plane, along, across, point);
        if (!grass.covers(point)) continue;
        const found = grass.at(point, site, 0);
        if (found === null) continue;
        onStrip++;
        const land = probe.radiusAt(point);
        if (land !== null && Math.abs(found.radius - land - STRIP_LIFT) > 0.01) {
          unlifted++;
          wrong(plane, `${(found.radius - land).toFixed(2)} over the land`);
        }
        if (Math.abs(across) < STRIP_TRACK) {
          track++;
          if (found.density > 0) {
            trackGrown++;
            wrong(plane, 'on the track');
          }
          continue;
        }
        if (found.density <= 0) continue;
        mown++;
        if (found.height > STRIP_MOWN + 1e-6) {
          tall++;
          wrong(plane, `${found.height.toFixed(2)} tall`);
        }
      }
      for (const across of [-STRIP_DRAWN - 4, STRIP_DRAWN + 4]) {
        stripPoint(plane, along, across, point);
        if (!grass.covers(point)) continue;
        const found = grass.at(point, site, 0);
        if (found === null) continue;
        beside++;
        if (found.density > 0 && found.height > STRIP_MOWN) besideGrown++;
      }
    }
  }
  const detail = wrongAt.length > 0 ? `: ${wrongAt.join('; ')}` : '';
  check(planes.length > 0 && onStrip > 0 && tall === 0 && mown > 0, 'the grass on an airstrip mown', `${mown} mown of ${onStrip} points over ${planes.length} strips, ${tall} taller than ${STRIP_MOWN}${detail}`);
  check(track > 0 && trackGrown === 0, 'and none on its worn track', `${trackGrown} of ${track} points`);
  check(unlifted === 0, 'rooted on the drawn strip', `${unlifted} of ${onStrip} points off it`);
  check(besideGrown > 0, 'and the field grown tall beside it', `${besideGrown} of ${beside} points four units past its edges`);
}

// --- the camps -----------------------------------------------------------------
//
// A camp's fire is a ring of stones a unit across, and grass as tall as the
// field grows hides it: the ground a piece wears (`Countryside.trodden`)
// keeps the grass off the fire and its trampled earth and short round it.
// The nearest camp to each place, and the grass asked at its fire, on a
// ring at two units and on one at three and a half.
console.log('\nthe camps:');
{
  const planner = wood.countryside!;
  const site: GrassSite = { radius: 0, density: 0, r: 0, g: 0, b: 0, dry: 0, height: 1 };
  const fire = new Vector3();
  const point = new Vector3();
  const north = new Vector3();
  const east = new Vector3();
  let camps = 0;
  let grownIn = 0;
  let asked = 0;
  let tallRound = 0;
  let round = 0;
  const seenCamps = new Set<string>();
  for (const where of WHERE) {
    const camp = planner.find('camp', where.lat, where.lon, 4);
    if (camp === null) continue;
    const key = `${camp.lat},${camp.lon}`;
    if (seenCamps.has(key)) continue;
    seenCamps.add(key);
    unitAt(camp.lat, camp.lon, fire);
    probe.prime(fire);
    grass.gather(fire, 30);
    if (!grass.covers(fire)) continue;
    camps++;
    north.set(0, 1, 0).projectOnPlane(fire).normalize();
    east.crossVectors(fire, north).normalize();
    for (const [reach, count] of [[0, 1], [2, 12], [3.5, 12]] as const) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        point.copy(fire).addScaledVector(east, (Math.cos(angle) * reach) / PLANET_RADIUS).addScaledVector(north, (Math.sin(angle) * reach) / PLANET_RADIUS).normalize();
        const found = grass.at(point, site, 0);
        if (found === null) continue;
        if (reach < 3) {
          asked++;
          if (found.density > 0) grownIn++;
        } else if (found.density > 0) {
          round++;
          if (found.height >= 1) tallRound++;
        }
      }
    }
  }
  check(camps > 0 && asked > 0 && grownIn === 0, 'no grass over a camp\'s fire', `${grownIn} of ${asked} points within two units, over ${camps} camps`);
  check(tallRound === 0, 'and short round it', `${tallRound} of ${round} points at three and a half units as tall as the field`);
}

console.log(failures === 0 ? '\nall seated' : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
