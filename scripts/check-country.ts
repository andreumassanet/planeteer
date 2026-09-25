/**
 * The countryside between the towns, headless: what `countryside.ts` plans
 * and what `vegetation.ts` builds of it.
 *
 * A plan is a pure function of the baked world and one cell of the tile grid,
 * so this asks it the questions a player would find the answers to by walking:
 *
 * - **Determinism.** Two planners, one asked in order and one backwards, give
 *   the same pieces, fields and fences bit for bit.
 * - **It yields to what is built.** No piece, field or fence inside a built
 *   town's country, a landmark's footprint, a carriageway or a plane's or a
 *   balloon's field; nothing but a jetty or a boat over water; no field on
 *   ground steeper than it may be ploughed, nothing on scree.
 * - **There is something to see.** Over sample boxes in named farmland,
 *   paddy, mill, desert and mountain country, the kinds a region is known for
 *   are there, and from almost any point of open country something planned
 *   stands within the distance you walk in two minutes.
 * - **The kit.** Every piece builds in every region and variant, on the
 *   palette, under its triangle cap, with no NaN and no reflected matrix.
 * - **The herds keep off it.** `occupied` answers yes on every piece and
 *   field, and no well away from them.
 * - **The tiles.** The vegetation streamer, built headless, merges the plans
 *   into its tiles the same way twice, every triangle wound the way its
 *   normals face, and holds its budgets.
 *
 * It prints where to go and look: an `?at=` for each kind in each box.
 *
 *   node scripts/check-country.ts        or   pnpm country
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import type { Mesh } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { MAX_SLOPE, gradeAt, setDetailSites, setFlattenSites } from '../src/terrain.ts';
import type { Slope } from '../src/terrain.ts';
import { indexPlaces, isShown, radiusOf, terrainSiteOf } from '../src/places.ts';
import { courseOf, coursePath, roadClearance } from '../src/roads.ts';
import type { CoursePath, Road } from '../src/roads.ts';
import { decodePlaces, decodeRoads, inflate } from '../src/pack.ts';
import { unitAt } from '../src/sphere.ts';
import { createSiteIndex } from '../src/fleet.ts';
import type { FieldKeepout } from '../src/fleet.ts';
import { countryReach } from '../src/scenery/grid.ts';
import { MONUMENT_CLEARANCE, WIDEST_FOOTPRINT, cellAt } from '../src/tile-grid.ts';
import { REGIONS, REGION_IDS } from '../src/scenery/regions.ts';
import { createSceneryContext, measure } from '../src/scenery/contract.ts';
import { COUNTRY_PARTS, COUNTRY_VARIANTS, PIECE_TRIANGLES, buildRotor, pieceRng } from '../src/countryside-kit.ts';
import type { RotorKind } from '../src/countryside-kit.ts';
import { createCountryside, FEATURE_KINDS } from '../src/countryside.ts';
import { BENCH_REACH, BENCH_SEAT, BENCH_SIT_AHEAD } from '../src/bench.ts';
import type { Bench } from '../src/bench.ts';
import type { CountryPlan, FeatureKind } from '../src/countryside.ts';

const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// --- the world, as check-fleet.ts loads it ----------------------------------

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
const places = indexPlaces(placesRaw, 0).all;
const roadsRaw = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
const roads: Road[] = roadsRaw.places === places.length ? roadsRaw.roads : [];
if (roads.length === 0) {
  console.log(`  roads.bin was baked against ${roadsRaw.places} places and there are ${places.length}. Run \`pnpm roads\`.`);
  process.exit(1);
}
const fields = createSiteIndex({ world, places, roads, monuments });
const { registerModelsFromDisk } = await import('./kit-node.ts');
await registerModelsFromDisk();
console.log(`world: ${places.length} places, ${roads.length} roads, ${monuments.length} landmarks\n`);

const source = { places, monuments, roads, fields };

// --- the boxes -----------------------------------------------------------------

interface Box {
  name: string;
  lat: number;
  lon: number;
  /** Half the box, in degrees of latitude. */
  half: number;
  /** Kinds this country is known for, which must turn up. */
  expect: FeatureKind[];
  /** Crops that must turn up. */
  crops?: string[];
}

const BOXES: Box[] = [
  { name: 'Castilla', lat: 41.3, lon: -4.2, half: 1.6, expect: ['farm'], crops: ['wheat'] },
  { name: 'La Mancha', lat: 39.4, lon: -3.1, half: 1.6, expect: ['farm', 'windmill'], crops: ['olives', 'vineyard'] },
  { name: 'Iowa', lat: 42.0, lon: -93.4, half: 1.4, expect: ['farm'], crops: ['maize'] },
  { name: 'Kansas', lat: 38.5, lon: -98.5, half: 1.2, expect: ['farm', 'turbines'] },
  { name: 'Netherlands', lat: 52.4, lon: 5.2, half: 1.2, expect: ['windmill', 'farm'] },
  { name: 'Beauce', lat: 48.3, lon: 1.6, half: 1.0, expect: ['farm'] },
  { name: 'Java', lat: -7.3, lon: 110.3, half: 1.4, expect: ['farm'], crops: ['paddy'] },
  { name: 'Mekong', lat: 15.2, lon: 102.6, half: 1.2, expect: ['farm', 'shrine'], crops: ['paddy'] },
  { name: 'Honshu', lat: 36.3, lon: 139.2, half: 1.5, expect: ['shrine'] },
  { name: 'Nepal', lat: 28.2, lon: 84.2, half: 1.0, expect: ['shrine'] },
  { name: 'Sahara', lat: 26.5, lon: 8.5, half: 2.5, expect: ['oasis'] },
  { name: 'Mongolia', lat: 47.0, lon: 104.5, half: 1.5, expect: ['camp'] },
  { name: 'Brittany', lat: 48.2, lon: -3.4, half: 1.2, expect: ['lighthouse', 'farm'] },
  { name: 'Maine', lat: 44.0, lon: -69.2, half: 1.0, expect: ['lighthouse'] },
  { name: 'Tuscany', lat: 43.3, lon: 11.3, half: 1.4, expect: ['farm'], crops: ['vineyard'] },
  { name: 'Alps', lat: 46.6, lon: 9.0, half: 1.2, expect: ['cairn'] },
  { name: 'Finland', lat: 62.5, lon: 26.0, half: 1.0, expect: [] },
  { name: 'Deccan', lat: 18.0, lon: 77.5, half: 1.4, expect: ['farm', 'shrine'] },
  { name: 'Tohoku', lat: 39.3, lon: 140.9, half: 1.2, expect: ['shrine'] },
  { name: 'Queensland', lat: -26.5, lon: 150.5, half: 1.2, expect: ['farm'] },
];

// --- a second, independent index of what is built ---------------------------------

const shownTowns = places.filter(isShown).map((place) => ({ at: unitAt(place.lat, place.lon, new Vector3()), reach: countryReach(radiusOf(place)) }));
const paths: { path: CoursePath; clearance: number; mid: Vector3; half: number }[] = roads.map((road) => {
  const path = coursePath(courseOf(road, places));
  const n = path.count;
  const mid = new Vector3(path.xyz[(n >> 1) * 3]!, path.xyz[(n >> 1) * 3 + 1]!, path.xyz[(n >> 1) * 3 + 2]!);
  let half = 0;
  const p = new Vector3();
  for (let i = 0; i < n; i++) half = Math.max(half, p.set(path.xyz[i * 3]!, path.xyz[i * 3 + 1]!, path.xyz[i * 3 + 2]!).distanceTo(mid) * PLANET_RADIUS);
  return { path, clearance: roadClearance(road.cls), mid, half };
});
const monumentUnits = monuments.map((site) => ({ at: unitAt(site.lat, site.lon, new Vector3()), radius: (site.footprint ?? WIDEST_FOOTPRINT) + MONUMENT_CLEARANCE }));

const units = (a: Vector3, b: Vector3): number => Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * PLANET_RADIUS;

/** How far a point is inside anything built, or negative when clear: the worst intrusion. */
function intrusion(at: Vector3, radius: number): { what: string; depth: number } | null {
  let worst: { what: string; depth: number } | null = null;
  const note = (what: string, depth: number): void => {
    if (depth > 0.05 && (worst === null || depth > worst.depth)) worst = { what, depth };
  };
  for (const town of shownTowns) {
    if (town.at.dot(at) < 0.99) continue;
    note('town', town.reach + radius - units(town.at, at));
  }
  for (const site of monumentUnits) note('landmark', site.radius + radius - units(site.at, at));
  const hits: FieldKeepout[] = [];
  for (const field of fields.fieldsNear(at, radius + 60, hits)) note('plane field', field.radius + radius - units(field.at, at));
  const p = new Vector3();
  const q = new Vector3();
  for (const road of paths) {
    if (units(road.mid, at) > road.half + radius + 40) continue;
    for (let i = 1; i < road.path.count; i++) {
      p.set(road.path.xyz[(i - 1) * 3]!, road.path.xyz[(i - 1) * 3 + 1]!, road.path.xyz[(i - 1) * 3 + 2]!);
      q.set(road.path.xyz[i * 3]!, road.path.xyz[i * 3 + 1]!, road.path.xyz[i * 3 + 2]!);
      // Point to chord on the sphere, near enough at these lengths.
      const d = q.clone().sub(p);
      const t = Math.min(1, Math.max(0, at.clone().sub(p).dot(d) / Math.max(d.lengthSq(), 1e-18)));
      const nearest = p.clone().addScaledVector(d, t).normalize();
      note('road', road.clearance + radius - units(nearest, at));
    }
  }
  return worst;
}

// --- sweep ---------------------------------------------------------------------

function cellsIn(box: Box): { row: number; column: number }[] {
  const out: { row: number; column: number }[] = [];
  const seen = new Set<string>();
  const step = 0.3;
  for (let lat = box.lat - box.half; lat <= box.lat + box.half; lat += step) {
    const spread = box.half / Math.cos((lat * Math.PI) / 180);
    for (let lon = box.lon - spread; lon <= box.lon + spread; lon += step / Math.cos((lat * Math.PI) / 180)) {
      const cell = cellAt(lat, lon, 0);
      const key = `${cell.row}/${cell.column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cell);
    }
  }
  return out;
}

const planner = createCountryside(world, source);
const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
const east = new Vector3();
const north = new Vector3();
const frameAt = (u: Vector3): void => {
  north.set(0, 1, 0).projectOnPlane(u).normalize();
  east.crossVectors(u, north).normalize();
};

console.log('what each box holds (cells, then features by kind, then crops):');
const allPlans: CountryPlan[] = [];
const where = new Map<string, string>();
let planMs = 0;
let planCount = 0;
for (const box of BOXES) {
  const cells = cellsIn(box);
  const kinds = new Map<string, number>();
  const crops = new Map<string, number>();
  const before = { ...planner.stats.refused };
  const began = performance.now();
  for (const { row, column } of cells) {
    const one = performance.now();
    const plan = planner.plan(row, column);
    const took = performance.now() - one;
    if (took > 20) console.log(`  (a plan took ${took.toFixed(1)} ms: ${plan.key} ${plan.kind ?? ''}, the ${planCount + cells.indexOf(cells.find((c) => c.row === row && c.column === column)!)}th asked)`);
    allPlans.push(plan);
    if (plan.kind !== null) kinds.set(plan.kind, (kinds.get(plan.kind) ?? 0) + 1);
    for (const field of plan.fields) crops.set(field.crop, (crops.get(field.crop) ?? 0) + 1);
  }
  planMs += performance.now() - began;
  planCount += cells.length;
  const list = [...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  const cropList = [...crops].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  const refusedHere = Object.entries(planner.stats.refused).map(([k, n]) => [k, n - (before[k] ?? 0)] as const).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`  ${box.name.padEnd(19)} ${String(cells.length).padStart(4)} cells  ${list || '-'}${cropList ? `  |  ${cropList}` : ''}  (refused: ${refusedHere})`);
  for (const kind of box.expect) check(kinds.has(kind), `${box.name} has a ${kind}`);
  for (const crop of box.crops ?? []) check(crops.has(crop), `${box.name} grows ${crop}`);
  for (const kind of FEATURE_KINDS) {
    const found = planner.find(kind, box.lat, box.lon, box.half);
    if (found !== null) where.set(`${box.name}|${kind}`, `?at=${found.lat},${found.lon}`);
  }
}
console.log(`\n  refused: ${JSON.stringify(planner.stats.refused)}`);
console.log(`  ${planCount} plans in ${Math.round(planMs)} ms, ${(planMs / planCount).toFixed(3)} ms a plan (slowest ${planner.stats.slowestMs} ms)`);

// --- keepouts -----------------------------------------------------------------------

console.log('\nwhat is built keeps its ground:');
{
  const bad: string[] = [];
  let pieces = 0;
  let fieldCount = 0;
  let lines = 0;
  let wet = 0;
  let steep = 0;
  for (const plan of allPlans) {
    for (const piece of plan.pieces) {
      pieces++;
      const hit = intrusion(piece.at, piece.part === 'hay-bale' ? 0 : Math.min(piece.footprint, 3));
      if (hit !== null) bad.push(`${plan.key} ${piece.part} in a ${hit.what} by ${hit.depth.toFixed(1)}`);
      const afloat = COUNTRY_PARTS[piece.part]?.afloat === true;
      if (!afloat && world.elevationAt(piece.at) <= 0) wet++;
      frameAt(piece.at);
      if (!afloat && gradeAt(piece.at, east, north, 1.5, slope).grade > MAX_SLOPE * 1.35) steep++;
    }
    for (const field of plan.fields) {
      fieldCount++;
      const hit = intrusion(field.at, Math.min(field.halfX, field.halfZ));
      if (hit !== null) bad.push(`${plan.key} a field of ${field.crop} in a ${hit.what} by ${hit.depth.toFixed(1)}`);
      if (world.elevationAt(field.at) <= 0) wet++;
      frameAt(field.at);
      if (gradeAt(field.at, east, north, Math.min(field.halfX, field.halfZ) * 0.7, slope).grade > 0.2) steep++;
    }
    for (const line of plan.lines) {
      lines++;
      for (const t of [0, 0.5, 1]) {
        const at = line.from.clone().lerp(line.to, t).normalize();
        const hit = intrusion(at, 0.5);
        if (hit !== null) bad.push(`${plan.key} a ${line.kind} in a ${hit.what} by ${hit.depth.toFixed(1)}`);
      }
    }
  }
  check(bad.length === 0, `no piece, field or fence inside a town's country, a landmark, a road or a plane's field (${pieces} pieces, ${fieldCount} fields, ${lines} fences)`, bad.slice(0, 5).join('; '));
  check(wet === 0, 'nothing but a jetty or a boat stands on water', `${wet}`);
  check(steep === 0, 'no field on a slope it could not be ploughed on, nothing on scree', `${steep}`);
}

// --- occupancy, which the herds ask ------------------------------------------------------

console.log('\nwhat a herd keeps off:');
{
  let asked = 0;
  let missed = 0;
  for (const plan of allPlans) {
    for (const piece of plan.pieces) {
      asked++;
      if (!planner.occupied(piece.at, 0.5)) missed++;
    }
    for (const field of plan.fields) {
      asked++;
      if (!planner.occupied(field.at, 0.5)) missed++;
    }
  }
  check(missed === 0, 'every piece and field answers as occupied to the herds', `${missed} of ${asked} missed`);
  // And open ground far from anything does not.
  let free = 0;
  for (const plan of allPlans.filter((p) => p.pieces.length > 0).slice(0, 50)) {
    // Straight up from a piece, a kilometre off, there is nothing of this plan.
    const at = plan.pieces[0]!.at.clone().applyAxisAngle(new Vector3(0, 1, 0), 0.07).normalize();
    if (!planner.occupied(at, 5)) free++;
  }
  check(free > 25, 'and ground well away from what is planned is mostly free for them', `${free} of 50 probes a kilometre off a piece free`);
}

// --- the benches, which a body sits on -----------------------------------------------

console.log('\nwhere a body sits:');
{
  // The seat is the sitting clip's: the plank's top at `BENCH_SEAT`, whatever the variant.
  const benchCtx = createSceneryContext();
  let seatOff = 0;
  for (const style of REGION_IDS.map((id) => REGIONS[id])) {
    for (let variant = 0; variant < COUNTRY_VARIANTS; variant++) {
      const group = COUNTRY_PARTS.bench!.build(benchCtx, pieceRng('bench', style.id, variant), style);
      let top = -Infinity;
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!;
        // The plank is the one piece wider than a frame and no taller than a hand.
        if (box.max.x - box.min.x > 1 && box.max.y - box.min.y < 0.2) top = Math.max(top, mesh.position.y + box.max.y);
      });
      seatOff = Math.max(seatOff, Math.abs(top - BENCH_SEAT));
    }
  }
  check(seatOff < 0.01, `every countryside bench's seat is the sitting clip's, ${BENCH_SEAT.toFixed(2)} units up`, `off by ${seatOff.toFixed(3)}`);

  // Every bench planned is found from beside it, a spot in front of it, facing the way it does.
  let benches = 0;
  let unfound = 0;
  let astray = 0;
  const found: Bench[] = [];
  for (const plan of allPlans) {
    for (const piece of plan.pieces) {
      if (piece.scenic || piece.part !== 'bench') continue;
      benches++;
      found.length = 0;
      planner.benchesNear(piece.at, BENCH_REACH, found);
      const mine = found.find((bench) => units(bench.position.clone().normalize(), piece.at) < BENCH_SIT_AHEAD + 0.01);
      if (mine === undefined) {
        unfound++;
        continue;
      }
      const ahead = units(mine.position.clone().normalize(), piece.at);
      const tangent = Math.abs(mine.facing.dot(piece.at));
      if (Math.abs(ahead - BENCH_SIT_AHEAD) > 0.01 || tangent > 1e-3 || Math.abs(mine.facing.length() - 1) > 1e-6) astray++;
    }
  }
  check(benches > 0, 'the countryside plans benches to sit on', `${benches}`);
  check(unfound === 0, 'every bench planned is found by `benchesNear` from beside it', `${unfound} of ${benches}`);
  check(astray === 0, "and its sitter's spot is in front of it, along the ground, facing its way", `${astray} of ${benches}`);
}

// --- determinism ------------------------------------------------------------------------

console.log('\ndeterminism:');
{
  const again = createCountryside(world, source);
  const text = (plan: CountryPlan): string => JSON.stringify({ ...plan, style: plan.style.id });
  const order = [...allPlans].reverse();
  {
    const [row, column] = allPlans[0]!.key.split('/').map(Number) as [number, number];
    const one = performance.now();
    again.plan(row, column);
    console.log(`  (the first plan again, from a fresh planner with the roads' curves already worked out: ${(performance.now() - one).toFixed(1)} ms)`);
  }
  let same = 0;
  for (const plan of order) {
    const [row, column] = plan.key.split('/').map(Number) as [number, number];
    if (text(again.plan(row, column)) === text(plan)) same++;
  }
  check(same === allPlans.length, 'a second planner, asked backwards, plans every cell the same', `${same} of ${allPlans.length}`);
}

// --- there is something to see ------------------------------------------------------

console.log('\nsomething to see:');
{
  // From random points of open country in the farmland boxes: the nearest
  // planned thing, which a walk of two minutes (6 units a second) reaches.
  const walk = 6 * 120;
  const sight = 450;
  let points = 0;
  let seen = 0;
  let near = 0;
  const pieceUnits = allPlans.flatMap((plan) => [...plan.pieces.map((p) => p.at), ...plan.fields.map((f) => f.at)]);
  let state = 12345;
  const random = (): number => ((state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 4294967296);
  for (const box of BOXES.filter((b) => b.expect.includes('farm'))) {
    for (let i = 0; i < 60; i++) {
      const lat = box.lat + (random() * 2 - 1) * box.half * 0.8;
      const lon = box.lon + ((random() * 2 - 1) * box.half * 0.8) / Math.cos((lat * Math.PI) / 180);
      const at = unitAt(lat, lon, new Vector3());
      if (world.elevationAt(at) <= 0) continue;
      if (shownTowns.some((town) => units(town.at, at) < town.reach)) continue;
      points++;
      if (pieceUnits.some((u) => units(u, at) < walk)) seen++;
      if (pieceUnits.some((u) => units(u, at) < sight)) near++;
    }
  }
  const share = seen / Math.max(1, points);
  check(share > 0.9, 'in farmland, something planned stands within two minutes\' walk of nearly every point', `${(share * 100).toFixed(1)}% of ${points}`);
  // And everywhere else, for the record: the wild is emptier on purpose.
  const shares: string[] = [];
  for (const box of BOXES.filter((b) => !b.expect.includes('farm'))) {
    let here = 0;
    let hit = 0;
    for (let i = 0; i < 40; i++) {
      const lat = box.lat + (random() * 2 - 1) * box.half * 0.8;
      const lon = box.lon + ((random() * 2 - 1) * box.half * 0.8) / Math.cos((lat * Math.PI) / 180);
      const at = unitAt(lat, lon, new Vector3());
      if (world.elevationAt(at) <= 0) continue;
      if (shownTowns.some((town) => units(town.at, at) < town.reach)) continue;
      here++;
      if (pieceUnits.some((u) => units(u, at) < walk)) hit++;
    }
    shares.push(`${box.name} ${here === 0 ? '-' : `${Math.round((hit / here) * 100)}%`}`);
  }
  console.log(`  within two minutes' walk elsewhere: ${shares.join(', ')}`);
  check(near / Math.max(1, points) > 0.7, `and within ${sight} units, which on foot is in sight, of most`, `${((near / Math.max(1, points)) * 100).toFixed(1)}%`);
}

// --- the kit ----------------------------------------------------------------------------

console.log('\nthe kit:');
{
  const ctx = createSceneryContext();
  const problems: string[] = [];
  let worst = 0;
  let worstId = '';
  let builds = 0;
  for (const part of Object.values(COUNTRY_PARTS)) {
    for (const regionId of REGION_IDS) {
      const style = REGIONS[regionId];
      for (let variant = 0; variant < COUNTRY_VARIANTS; variant++) {
        let group;
        try {
          group = part.build(ctx, pieceRng(part.id, style.id, variant), style);
        } catch (error) {
          problems.push(`${part.id} (${regionId}/${variant}) threw: ${String(error)}`);
          continue;
        }
        builds++;
        const m = measure(group);
        if (m.triangles > worst) {
          worst = m.triangles;
          worstId = part.id;
        }
        if (m.triangles > (part.cap ?? PIECE_TRIANGLES)) problems.push(`${part.id} (${regionId}/${variant}) is ${m.triangles} triangles`);
        group.updateMatrixWorld(true);
        group.traverse((object) => {
          const mesh = object as Mesh;
          if (!mesh.isMesh) return;
          if (mesh.matrixWorld.determinant() <= 0) problems.push(`${part.id}: a reflected piece`);
          const position = mesh.geometry.getAttribute('position');
          for (let i = 0; i < position.count; i++) {
            if (!Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i))) {
              problems.push(`${part.id}: NaN`);
              break;
            }
          }
        });
      }
    }
  }
  for (const kind of ['sails', 'blades', 'vanes'] as RotorKind[]) {
    const m = measure(buildRotor(ctx, kind));
    if (m.triangles > PIECE_TRIANGLES / 2) problems.push(`the ${kind} rotor is ${m.triangles} triangles`);
  }
  check(problems.length === 0, `every piece builds in every region, on the palette, under ${PIECE_TRIANGLES} triangles (${builds} builds, heaviest ${worstId} at ${worst})`, problems.slice(0, 4).join('; '));
}

// --- the tiles ---------------------------------------------------------------------------

console.log('\nthe tiles:');
{
  // `vegetation.ts` reaches the scenery registry, an eager `import.meta.glob`,
  // which is a Vite transform: the one call is rewritten into the static
  // imports Vite would have made, as `check-fleet.ts` does.
  const scenery = resolve(here, '../src/scenery');
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (!url.endsWith('/src/scenery/index.ts')) return result;
      const files = readdirSync(resolve(scenery, 'parts')).filter((file) => file.endsWith('.ts')).sort();
      const imports = files.map((file, i) => `import * as part${i} from './parts/${file}';`).join('\n');
      const table = `{ ${files.map((file, i) => `'./parts/${file}': part${i}`).join(', ')} }`;
      const text = String(result.source);
      const glob = /import\.meta\.glob\s*(?:<.*?>)?\s*\('\.\/parts\/\*\.ts', \{ eager: true \}\)/;
      if (!glob.test(text)) throw new Error('check-country: the scenery registry no longer reads its parts the way this shim rewrites');
      return { ...result, source: `${imports}\n${text.replace(glob, table)}` };
    },
  });
  const { createVegetation } = await import('../src/vegetation.ts');
  const wood = createVegetation(world, { places, monuments: monuments as never, roads, fields });
  let deterministic = 0;
  let tiles = 0;
  let heaviest = 0;
  let heaviestAt = '';
  for (const box of BOXES) {
    for (let level = 0; level < 4; level++) {
      const a = wood.raiseTile(box.lat, box.lon, level);
      const b = wood.raiseTile(box.lat, box.lon, level);
      tiles++;
      const pa = a?.geometry.getAttribute('position').array as Float32Array | undefined;
      const pb = b?.geometry.getAttribute('position').array as Float32Array | undefined;
      if ((pa === undefined && pb === undefined) || (pa !== undefined && pb !== undefined && pa.length === pb.length && pa.every((value, i) => value === pb[i]))) deterministic++;
      const triangles = (pa?.length ?? 0) / 9;
      if (triangles > heaviest) {
        heaviest = triangles;
        heaviestAt = `${box.name} level ${level}`;
      }
      a?.geometry.dispose();
      b?.geometry.dispose();
    }
  }
  check(deterministic === tiles, 'every tile over the boxes builds the same twice, countryside and all', `${deterministic} of ${tiles}`);
  // Every triangle wound the way its normals face: a field wound the wrong way
  // is invisible from above, and a wall wound the wrong way is a blob of ink.
  {
    let triangles = 0;
    let inverted = 0;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const n = new Vector3();
    const face = new Vector3();
    for (const box of BOXES) {
      const mesh = wood.raiseTile(box.lat, box.lon, 0);
      if (mesh === null) continue;
      const position = mesh.geometry.getAttribute('position');
      const normal = mesh.geometry.getAttribute('normal');
      for (let i = 0; i + 2 < position.count; i += 3) {
        a.fromBufferAttribute(position, i);
        b.fromBufferAttribute(position, i + 1);
        c.fromBufferAttribute(position, i + 2);
        face.subVectors(b, a).cross(c.clone().sub(a));
        if (face.lengthSq() < 1e-10) continue;
        n.fromBufferAttribute(normal, i).add(c.fromBufferAttribute(normal, i + 1)).add(b.fromBufferAttribute(normal, i + 2));
        triangles++;
        if (face.dot(n) < 0) inverted++;
      }
      mesh.geometry.dispose();
    }
    check(inverted <= triangles * 0.002, 'the finest tiles\' triangles are wound the way their normals face', `${inverted} of ${triangles} against`);
  }
  // And the countryside's own, alone: every piece, plate, row, bund and fence.
  {
    const { createCountryBuilder } = await import('../src/countryside-tile.ts');
    const { Matrix4 } = await import('three');
    const builder = createCountryBuilder(world, createSceneryContext(), planner, () => null);
    let triangles = 0;
    const inverted = new Map<string, number>();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const n = new Vector3();
    const face = new Vector3();
    const across = new Vector3();
    const northward = new Vector3();
    for (const box of BOXES) {
      const cell = cellAt(box.lat, box.lon, 1);
      const plans = builder.plansUnder(1, cell.row, cell.column);
      const u = unitAt(box.lat, box.lon, new Vector3());
      northward.set(0, 1, 0).projectOnPlane(u).normalize();
      across.crossVectors(u, northward).normalize();
      const built = builder.build(plans, { level: 0, across, north: northward, inverse: new Matrix4() }, 0, undefined, false);
      for (const item of built.placed) {
        const e = item.matrix;
        for (let i = 0; i + 8 < item.flat.position.length; i += 9) {
          a.fromArray(item.flat.position, i).applyMatrix4(e);
          b.fromArray(item.flat.position, i + 3).applyMatrix4(e);
          c.fromArray(item.flat.position, i + 6).applyMatrix4(e);
          face.subVectors(b, a).cross(c.clone().sub(a));
          if (face.lengthSq() < 1e-10) continue;
          n.fromArray(item.flat.normal, i).add(new Vector3().fromArray(item.flat.normal, i + 3)).add(new Vector3().fromArray(item.flat.normal, i + 6)).transformDirection(e);
          triangles++;
          if (face.dot(n) < 0) {
            const what = item.flat.height === 0 ? 'fields and fences' : `a piece ${item.flat.height.toFixed(1)} tall`;
            inverted.set(what, (inverted.get(what) ?? 0) + 1);
          }
        }
      }
    }
    const total = [...inverted.values()].reduce((sum, value) => sum + value, 0);
    check(total === 0, 'the countryside\'s triangles are wound the way their normals face', `${total} of ${triangles}: ${[...inverted].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  check(heaviest < 120_000, 'no tile is heavier than a sixth of the triangle budget', `${heaviest} at ${heaviestAt}`);
  for (const name of ['Iowa', 'Java', 'Netherlands', 'Tuscany']) {
    const box = BOXES.find((b) => b.name === name)!;
    for (let level = 0; level < 4; level++) {
      const s = wood.sample(box.lat, box.lon, level) as { tile: string; plants: number; pieces: number; fields: number; fences: number; onCountry: number; triangles: number; buildMs: number };
      console.log(`  ${name.padEnd(12)} level ${level}  ${String(s.plants).padStart(4)} plants  ${String(s.pieces).padStart(3)} pieces  ${String(s.fields).padStart(3)} fields  ${String(s.fences).padStart(3)} fences  ${String(s.onCountry).padStart(3)} plots given up  ${String(s.triangles).padStart(6)} triangles  ${s.buildMs} ms`);
    }
  }
}

// --- where to look ----------------------------------------------------------------------

console.log('\nwhere to look:');
for (const [key, at] of [...where].sort()) {
  const [box, kind] = key.split('|');
  console.log(`  ${box!.padEnd(19)} ${kind!.padEnd(11)} ${at}`);
}

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
