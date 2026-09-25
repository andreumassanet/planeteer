/**
 * Headless assertions over the interiors: `src/interior-plan.ts` (which room a
 * door opens on, and how it is furnished) and `src/interior-kit.ts` (the room
 * as one merged buffer and its glass).
 *
 * **A room is wrong in ways a screenshot hides.** A counter one hand short of
 * the wall seals the keeper's side off; a sofa overlapping a table is one
 * merged mesh either way; the same door opening on another room on another
 * machine looks like nothing at all. So every door here is replayed many
 * times over, and each plan is held to the rules:
 *
 * - **Determinism**: the same identity is the same plan, number for number,
 *   and the same buffer, byte for byte.
 * - **Every room type builds**, from real buildings in real regions, within
 *   the triangle budget and within the time an interior may take on entering.
 * - **Nothing overlaps**: no two solid pieces, no person in a piece or in
 *   another person, and nothing through a wall.
 * - **The player arrives clear**, on the solids `interiors.ts` walks him
 *   against, not on a copy of them.
 * - **No floor is sealed off**: every cell a body fits on is reachable from
 *   the door (`reachable`), which is also what makes every piece reachable.
 * - **The room is what it says**: a bakery has its counter and its oven, a
 *   church its altar and its pews, a shop its keeper.
 *
 *   node scripts/check-interiors.ts
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../src/stature.ts';
import { BODY, ROOM_TYPES, footprintOf, planInterior, reachable, roomSolids, roomTypeOf } from '../src/interior-plan.ts';
import type { DoorIdentity, InteriorPlan, ItemKind, RoomType } from '../src/interior-plan.ts';
import { buildRoom } from '../src/interior-kit.ts';
import { createSceneryContext } from '../src/scenery/contract.ts';
import { REGION_IDS } from '../src/scenery/regions.ts';
import { overlaps, solidField } from '../src/scenery/solids.ts';

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};
const began = performance.now();
const k = createSceneryContext();

/** Every building a door can be on, with the kind the settlements give it. */
const BUILDINGS: readonly [string, DoorIdentity['kind']][] = [
  ['gabled-house', 'dwelling'], ['suburban-house', 'dwelling'], ['flat-roof-house', 'dwelling'], ['machiya', 'dwelling'],
  ['round-hut', 'dwelling'], ['stilt-house', 'dwelling'],
  ['city-block', 'block'], ['terrace-block', 'block'], ['tower-block', 'block'], ['skyscraper', 'block'],
  ['steeple-church', 'civic'], ['clapboard-church', 'civic'], ['minaret-mosque', 'civic'], ['pagoda', 'civic'],
  ['barn', 'country'], ['lighthouse', 'country'], ['windmill', 'country'], ['chapel', 'country'],
  ['fishing-hut', 'country'], ['ger', 'country'], ['nomad-tent', 'country'],
  ['monument', 'monument'],
];
const POPULATIONS = [300, 4000, 60000, 2_000_000] as const;

function identities(): DoorIdentity[] {
  const out: DoorIdentity[] = [];
  let n = 0;
  for (const [building, kind] of BUILDINGS) {
    for (const region of REGION_IDS) {
      for (const population of POPULATIONS) {
        for (let plot = 0; plot < 3; plot++) {
          const central = [0.1, 0.5, 0.9][plot]!;
          out.push({
            key: `check:${building}:${region}:${population}:${plot}:${n++}`,
            building,
            kind,
            region,
            population: kind === 'country' ? 0 : population,
            central,
            height: 12,
            ...(kind === 'monument' ? { monument: 'eiffel-tower', name: 'Eiffel Tower', note: 'A note.' } : {}),
          });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
console.log('which room behind which door');
const doors = identities();
const byType = new Map<RoomType, DoorIdentity[]>();
for (const door of doors) {
  const type = roomTypeOf(door);
  if (!byType.has(type)) byType.set(type, []);
  byType.get(type)!.push(door);
}
const missing = ROOM_TYPES.filter((type) => (byType.get(type)?.length ?? 0) === 0);
check(missing.length === 0, `every room type is behind some door (${ROOM_TYPES.length} types, ${doors.length} doors)`, missing.length > 0 ? `never: ${missing.join(', ')}` : '');
check(doors.every((door) => roomTypeOf(door) === roomTypeOf({ ...door })), 'the choice is a function of the door alone');
const expect: readonly [string, string, RoomType][] = [
  ['steeple-church', 'atlantic-europe', 'church'],
  ['minaret-mosque', 'maghreb', 'mosque'],
  ['pagoda', 'east-asia', 'temple'],
  ['lighthouse', 'nordic', 'lighthouse'],
  ['barn', 'nordic', 'barn'],
  ['monument', 'atlantic-europe', 'museum'],
];
for (const [building, region, type] of expect) {
  const got = roomTypeOf({ key: `x:${building}`, building, kind: building === 'monument' ? 'monument' : 'civic', region, population: 5000, central: 0.5, height: 10 });
  check(got === type, `${building} in ${region} is a ${type}`, got === type ? '' : `got ${got}`);
}

// ---------------------------------------------------------------------------
console.log('\nevery room, planned and built');
/** What each type must have in it, or it is not that room. */
const MUST: Partial<Record<RoomType, readonly ItemKind[]>> = {
  bakery: ['counter', 'oven'],
  grocery: ['counter', 'shelves'],
  cafe: ['counter', 'coffee'],
  bar: ['counter', 'bottles'],
  bookshop: ['counter', 'bookshelf'],
  clothes: ['counter', 'rack'],
  pharmacy: ['counter', 'shelves'],
  restaurant: ['counter', 'table'],
  office: ['desk'],
  lobby: ['reception', 'elevator'],
  church: ['altar', 'pew', 'cross'],
  chapel: ['altar', 'pew'],
  mosque: ['mihrab', 'minbar'],
  temple: ['buddha', 'altar'],
  barn: ['stall', 'hay'],
  mill: ['millstone'],
  lighthouse: ['lens'],
  museum: ['plinth', 'model', 'placard'],
  home: ['bed', 'kitchen'],
  flat: ['bed', 'kitchen'],
  cabin: ['bed', 'kitchen'],
  tatami: ['low-table', 'tokonoma'],
  riad: ['fountain'],
  hut: ['hearth'],
  yurt: ['hearth'],
};
const SHOPS: ReadonlySet<RoomType> = new Set(['bakery', 'grocery', 'cafe', 'bar', 'bookshop', 'clothes', 'pharmacy', 'restaurant']);
/** Triangles a room may be, glass included. The biggest rooms are a church and a mosque. */
const TRIANGLE_BUDGET = 60_000;
/** What entering may cost: planning and building one interior, in milliseconds. */
const BUILD_BUDGET_MS = 20;
/** Rooms of each type sampled for the full battery; every door is planned regardless. */
const SAMPLE = 14;

const EPS = 1e-6;
const intersects = (a: ReturnType<typeof footprintOf>, b: ReturnType<typeof footprintOf>): boolean =>
  a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;

function problemsOf(plan: InteriorPlan): string[] {
  const problems: string[] = [];
  const solids = plan.items.filter((item) => item.solid);
  const round = plan.shape === 'round';
  for (let i = 0; i < solids.length; i++) {
    const a = footprintOf(solids[i]!);
    for (let j = i + 1; j < solids.length; j++) {
      if (intersects(a, footprintOf(solids[j]!))) problems.push(`${solids[i]!.kind} overlaps ${solids[j]!.kind}`);
    }
    const corners = [[a.x0, a.z0], [a.x1, a.z0], [a.x0, a.z1], [a.x1, a.z1]] as const;
    const outside = corners.some(([x, z]) =>
      round ? Math.hypot(x, z - plan.depth / 2) > plan.width / 2 + EPS : x < -plan.width / 2 - EPS || x > plan.width / 2 + EPS || z < -EPS || z > plan.depth + EPS);
    if (outside) problems.push(`${solids[i]!.kind} goes through the wall`);
  }
  for (const [i, p] of plan.people.entries()) {
    for (const item of solids) {
      const f = footprintOf(item);
      const dx = Math.max(f.x0 - p.x, 0, p.x - f.x1);
      const dz = Math.max(f.z0 - p.z, 0, p.z - f.z1);
      if (Math.hypot(dx, dz) < BODY - EPS) problems.push(`a ${p.role} stands in a ${item.kind}`);
    }
    for (const q of plan.people.slice(i + 1)) if (Math.hypot(p.x - q.x, p.z - q.z) < 2 * BODY - EPS) problems.push('two people stand in each other');
  }
  const field = solidField(roomSolids(plan));
  if (overlaps(field, plan.spawn.x, plan.spawn.z, BODY)) problems.push('the spawn is not clear');
  const reach = reachable(plan);
  if (!reach.spawnClear) problems.push('the spawn is not on open floor');
  if (reach.reached !== reach.free) problems.push(`${reach.free - reach.reached} of ${reach.free} free cells sealed off from the door`);
  for (const kind of MUST[plan.type] ?? []) if (!plan.items.some((item) => item.kind === kind)) problems.push(`no ${kind}`);
  if (SHOPS.has(plan.type) && !plan.people.some((p) => p.role === 'keeper')) problems.push('no keeper');
  if (plan.people.length > 4) problems.push(`${plan.people.length} people`);
  if (plan.height < AVATAR_HEIGHT * 1.35) problems.push(`a ceiling at ${plan.height.toFixed(1)}`);
  return problems;
}

let planned = 0;
const bad = new Map<string, number>();
const badExample = new Map<string, string>();
for (const door of doors) {
  const plan = planInterior(door);
  planned++;
  for (const problem of problemsOf(plan)) {
    const key = `${plan.type}: ${problem.replace(/\d+ of \d+/, 'n of m')}`;
    bad.set(key, (bad.get(key) ?? 0) + 1);
    if (!badExample.has(key)) badExample.set(key, door.key);
  }
}
check(bad.size === 0, `${planned} plans keep every rule`, bad.size === 0 ? '' : '');
for (const [problem, count] of [...bad].sort((a, b) => b[1] - a[1])) console.log(`       ${count} x ${problem}   e.g. ${badExample.get(problem)}`);

const stats: string[] = [];
const times: number[] = [];
let worstTriangles = 0;
let worstType = '';
let deterministic = true;
let clearGlass = true;
for (const type of ROOM_TYPES) {
  const list = byType.get(type) ?? [];
  const sample = list.filter((_, i) => i % Math.max(1, Math.floor(list.length / SAMPLE)) === 0).slice(0, SAMPLE);
  const layouts = new Set<string>();
  let triangles = 0;
  let pieces = 0;
  let people = 0;
  for (const door of sample) {
    const t0 = performance.now();
    const plan = planInterior(door);
    const built = buildRoom(plan, k);
    times.push(performance.now() - t0);
    triangles = Math.max(triangles, built.triangles);
    pieces += plan.items.length;
    people += plan.people.length;
    layouts.add(`${plan.width.toFixed(4)}:${plan.depth.toFixed(4)}:${plan.items.map((item) => `${item.kind}${item.x.toFixed(2)}:${item.colors.join('.')}`).join(',')}`);
    const again = planInterior({ ...door });
    if (JSON.stringify(again) !== JSON.stringify(plan)) deterministic = false;
    const rebuilt = buildRoom(again, k);
    const a = built.room.getAttribute('position').array as Float32Array;
    const b = rebuilt.room.getAttribute('position').array as Float32Array;
    const ca = built.room.getAttribute('color').array as Float32Array;
    const cb = rebuilt.room.getAttribute('color').array as Float32Array;
    if (a.length !== b.length || ca.length !== cb.length || a.some((v, i) => v !== b[i]) || ca.some((v, i) => v !== cb[i])) deterministic = false;
    if (built.glass.getAttribute('position').count === 0 && plan.type !== 'yurt') clearGlass = false;
    for (const geometry of [built.room, built.glass, rebuilt.room, rebuilt.glass]) geometry.dispose();
  }
  if (triangles > worstTriangles) [worstTriangles, worstType] = [triangles, type];
  check(sample.length > 0 && triangles <= TRIANGLE_BUDGET, `${type}: builds within ${TRIANGLE_BUDGET.toLocaleString('en')} triangles`,
    `${sample.length} built, ${triangles.toLocaleString('en')} at most, ${(pieces / Math.max(1, sample.length)).toFixed(0)} pieces and ${(people / Math.max(1, sample.length)).toFixed(1)} people a room, ${layouts.size} distinct`);
  stats.push(`${type} ${layouts.size}/${sample.length}`);
}
check(deterministic, 'the same door is the same plan and the same buffer, twice');
check(clearGlass, 'every room with windows or a door has glass to show the hour through');
times.sort((a, b) => a - b);
const p50 = times[Math.floor(times.length * 0.5)]!;
const p95 = times[Math.floor(times.length * 0.95)]!;
check(p95 <= BUILD_BUDGET_MS, `planning and building an interior within ${BUILD_BUDGET_MS} ms`,
  `median ${p50.toFixed(1)}, p95 ${p95.toFixed(1)}, worst ${times[times.length - 1]!.toFixed(1)} ms over ${times.length}; the most triangles ${worstTriangles.toLocaleString('en')} (${worstType})`);

// ---------------------------------------------------------------------------
console.log('\nthe walls and the glass');
{
  // A body walking out of the room from the spawn meets a wall, never the outside.
  let escaped = 0;
  let walked = 0;
  for (const type of ROOM_TYPES) {
    const door = byType.get(type)?.[0];
    if (door === undefined) continue;
    const plan = planInterior(door);
    const field = solidField(roomSolids(plan));
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      let x = plan.spawn.x;
      let z = plan.spawn.z;
      for (let step = 0; step < 400; step++) {
        x += Math.sin(angle) * 0.25;
        z += Math.cos(angle) * 0.25;
        if (overlaps(field, x, z, BODY)) break;
      }
      walked++;
      const round = plan.shape === 'round';
      const out = round ? Math.hypot(x, z - plan.depth / 2) > plan.width / 2 : x < -plan.width / 2 || x > plan.width / 2 || z < 0 || z > plan.depth;
      if (out) escaped++;
    }
  }
  check(escaped === 0, 'a body walking out from the door in any direction meets a wall before it leaves', `${walked} walks`);

  // The glass faces into the room: every quad's normal points at the room's middle or down from the ceiling.
  let wrong = 0;
  let quads = 0;
  for (const type of ROOM_TYPES) {
    const door = byType.get(type)?.[0];
    if (door === undefined) continue;
    const plan = planInterior(door);
    const built = buildRoom(plan, k);
    const p = built.glass.getAttribute('position');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const centre = new THREE.Vector3(0, plan.height / 2, plan.depth / 2);
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      const toCentre = centre.clone().sub(a);
      quads++;
      if (normal.dot(toCentre) <= 0) wrong++;
    }
    built.room.dispose();
    built.glass.dispose();
  }
  check(wrong === 0, 'every pane of glass faces into its room', `${quads} triangles`);
}

console.log(`\n  variety (distinct layouts of those built): ${stats.join(', ')}`);
console.log(`\n${failures === 0 ? 'all ok' : `${failures} FAILED`}  (${Math.round(performance.now() - began)} ms)`);
if (failures > 0) process.exit(1);
