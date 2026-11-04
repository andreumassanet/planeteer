/**
 * `pnpm guild`: the Explorers' Guild's squares headless (`src/guild/sites.ts`,
 * `src/guild/square.ts`, `src/settlements/guild.ts`).
 *
 * - Which towns: every built capital, every built town of half a million,
 *   and each country's biggest built town where it has none of those, whose
 *   square holds one; the same list twice.
 * - Every one of them, as the town's own square is cut (`squareSteps`): a
 *   parcel found, dry, on one terrace, by the middle crossing, off the edge
 *   (so off every gate), clear of every landmark's cells and keepout, its
 *   streets left whole round it, the gates its roads use cut where the roads
 *   expect them (`gateHeight`), the same twice; and its layout: all six of the
 *   guild's people with a spot inside it, clear of every wall it draws and of
 *   each other, the strolls clear of both.
 * - A sample of them raised near through the streamer: the published square
 *   (`settlements.guilds`), its people on the floor a foot finds and clear of
 *   every wall in the town, its boards over the floor and upright, its hall a
 *   wall, its door on the floor; the town's triangles with it and without.
 * - The drawn square has no two faces of different colours in one plane
 *   (`scripts/z-fight.ts`), and the map's plan carries it.
 *
 *   node scripts/check-guild.ts
 */
import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import type { GuildLayout } from '../src/guild/square.ts';
import type { Place } from '../src/places.ts';
import type { Sink } from '../src/scenery/street-dressing/sink.ts';
import type { Slot } from '../src/settlements/types.ts';
import { unitAt } from '../src/sphere.ts';
import { AVATAR_HEIGHT } from '../src/stature.ts';
import { loadEarthFeatures } from './map-node.ts';
import { TIME_SCALE } from './time-scale.ts';
import { fightsIn } from './z-fight.ts';

// The kit's registries are shimmed by `loadEarthFeatures`; everything that reads them comes after.
const earth = await loadEarthFeatures();
const { world, places, roads, landmarks, settlements } = earth;
const { GUILD_MIN_CELLS, GUILD_POPULATION, guildPlaces, guildSquares, hasGuild } = await import('../src/guild/sites.ts');
const { GUILD_ROLES } = await import('../src/guild/roles.ts');
const { SPOT_APART, SPOT_CLEAR, STROLL_CLEAR, guildSolids } = await import('../src/guild/square.ts');
const { drawGuild } = await import('../src/guild/square-build.ts');
const { HALL_COLOURS } = await import('../src/guild/square-hall.ts');
const { LANDMARK_KEEP, planShape } = await import('../src/landmark-ground.ts');
const { isShown, radiusOf } = await import('../src/places.ts');
const { gateHeight } = await import('../src/roads/gate-levels.ts');
const { cellCentre, gatesOf, townGrid } = await import('../src/scenery/grid.ts');
const { PARCEL_OPEN } = await import('../src/scenery/grid/square.ts');
const { groundStyleFor } = await import('../src/scenery/ground.ts');
const { regionFor } = await import('../src/scenery/index.ts');
const { createTownFrame } = await import('../src/settlements/frame.ts');
const { keepoutReaches } = await import('../src/settlements/rules.ts');
const { squareSteps } = await import('../src/settlements/square.ts');

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

/** The player's body, as `player.ts` has it (`BODY_RADIUS`: `FIGURE.shoulderHalf`). */
const BODY = 1.3 * (AVATAR_HEIGHT / 6.8);
/** The most guild towns whose ground refuses every block, as a share: hills and coasts. */
const MAX_REFUSED = 0.03;
/** How far a guild's parcel may stand from the middle crossing, in cells: against it, or a block or two out. */
const MOST_OUT = 5;
/** The longest frame the streamer may take while a guild town builds near (`pnpm town-steps`' bound). */
const MAX_FRAME_MS = 25 * TIME_SCALE;

// --- which towns ------------------------------------------------------------------

console.log('which towns:');
const list = guildPlaces(places);
const again = guildPlaces(places.slice() as Place[]);
check(list.length === again.length && list.every((index, k) => again[k] === index), 'the same list from a copy of the places', `${list.length} towns`);
const guildTowns = new Set(list.map((index) => places[index]!));
const shown = places.filter((place) => isShown(place));
const roomy = (place: Place): boolean => townGrid(radiusOf(place)).cells >= GUILD_MIN_CELLS;
const capitals = shown.filter((place) => place.capital === true && roomy(place));
const big = shown.filter((place) => place.pop >= GUILD_POPULATION && roomy(place));
check(capitals.every((place) => guildTowns.has(place)), `every built capital of ${GUILD_MIN_CELLS}+ cells`, `${capitals.length}`);
check(big.every((place) => guildTowns.has(place)), `every built town of ${GUILD_POPULATION.toLocaleString('en')}+`, `${big.length}`);
const countries = new Set(shown.filter(roomy).map((place) => place.iso));
const served = new Set([...guildTowns].map((place) => place.iso));
check([...countries].every((iso) => served.has(iso)), 'every country with a big enough built town has one', `${served.size} countries`);
check([...guildTowns].every((place) => isShown(place) && roomy(place) && hasGuild(place, places)), 'every one built, big enough, and `hasGuild`');
const unroomy = shown.filter((place) => place.capital === true && !roomy(place)).length;
console.log(`  ${list.length} towns in ${served.size} countries; ${unroomy} built capitals under ${GUILD_MIN_CELLS} cells have none`);

// --- every parcel ---------------------------------------------------------------

console.log('every parcel, as the town cuts its square:');
const sites = (landmarks as readonly { lat: number; lon: number }[]).map((placement) => ({
  direction: unitAt(placement.lat, placement.lon, new THREE.Vector3()),
  shape: planShape(placement as never),
  radius: LANDMARK_KEEP,
}));
const frame = createTownFrame(world, sites);
const roadGates = new Map<Place, number[]>();
for (const road of roads) {
  for (const [end, gate] of [[road.a, road.gateA], [road.b, road.gateB]] as const) {
    const place = places[end];
    if (place === undefined) continue;
    const gates = roadGates.get(place) ?? [];
    if (!gates.includes(gate)) gates.push(gate);
    roadGates.set(place, gates);
  }
}
const continentOf = new Map(world.countries.map((country) => [country.iso, country.continent]));
const slotOf = (index: number): Slot => {
  const place = places[index]!;
  const style = regionFor(place.iso, continentOf.get(place.iso) ?? '', place.lat);
  return {
    place, index, style, ground: groundStyleFor(style.id), radius: radiusOf(place), seed: `${place.name}@${place.lat},${place.lon}`,
    direction: unitAt(place.lat, place.lon, new THREE.Vector3()), failed: false,
  } as Slot;
};
/** Cuts a town's square as the settlements do, and the longest of its steps. */
function cut(index: number): { layout: GuildLayout | null; worst: number } {
  const steps = squareSteps(frame, world, slotOf(index), roadGates, [], (place) => hasGuild(place, places));
  let worst = 0;
  for (;;) {
    const began = performance.now();
    const step = steps.next();
    worst = Math.max(worst, performance.now() - began);
    if (step.done === true) break;
  }
  return { layout: frame.guild, worst };
}

const refused: string[] = [];
const faults = new Map<string, string[]>();
const fault = (what: string, where: string): void => {
  const list = faults.get(what) ?? [];
  if (list.length < 6) list.push(where);
  faults.set(what, list);
};
const counts = { found: 0, sizes: new Map<string, number>(), worstStep: 0, worstAt: '', spots: 0 };
const roleSet = new Set(GUILD_ROLES);
for (const index of list) {
  const place = places[index]!;
  const { layout, worst } = cut(index);
  if (worst > counts.worstStep) {
    counts.worstStep = worst;
    counts.worstAt = place.name;
  }
  const where = `${place.name} (${place.iso})`;
  if (layout === null) {
    refused.push(where);
    continue;
  }
  counts.found++;
  const { parcel } = layout;
  const shape = `${parcel.c1 - parcel.c0 + 1}x${parcel.r1 - parcel.r0 + 1}`;
  counts.sizes.set(shape, (counts.sizes.get(shape) ?? 0) + 1);
  const grid = frame.grid;
  const n = grid.cells;
  // Dry, one terrace, off the edge, clear of the landmarks.
  let dry = true;
  let level = true;
  for (let col = parcel.c0; col <= parcel.c1; col++) {
    for (let row = parcel.r0; row <= parcel.r1; row++) {
      if (frame.shoreAt(col, row) !== null || frame.ground.sea(col, row)) dry = false;
      if (frame.terraceAt(col, row) !== parcel.level) level = false;
    }
  }
  for (let i = parcel.c0; i <= parcel.c1 + 1; i++) for (let j = parcel.r0; j <= parcel.r1 + 1; j++) if (frame.cornerAt(i, j).sea) dry = false;
  if (!dry) fault('dry', where);
  if (!level) fault('one terrace', where);
  if (parcel.c0 < 1 || parcel.r0 < 1 || parcel.c1 > n - 2 || parcel.r1 > n - 2) fault('off the edge', where);
  const inParcel = (col: number, row: number): boolean => col >= parcel.c0 && col <= parcel.c1 && row >= parcel.r0 && row <= parcel.r1;
  if (gatesOf(grid).some((gate) => gate.cells.some(([col, row]) => inParcel(col, row)))) fault('on no gate', where);
  const half = grid.pitch / 2;
  for (let col = parcel.c0 - 1; col <= parcel.c1 + 1; col++) {
    for (let row = parcel.r0 - 1; row <= parcel.r1 + 1; row++) {
      const landmark = frame.parcels.some((p) => col >= p.c0 && col <= p.c1 && row >= p.r0 && row <= p.r1);
      const cx = cellCentre(grid, col);
      const cz = cellCentre(grid, row);
      if (landmark || frame.keepouts.some((keepout) => keepoutReaches(keepout, cx - half, cx + half, cz - half, cz + half))) fault('clear of every landmark', where);
    }
  }
  // By the crossing: its nearest cell within `MOST_OUT` of the middle.
  const middle = (n - 1) / 2;
  const out = Math.max(Math.min(Math.abs(parcel.c0 - middle), Math.abs(parcel.c1 - middle)), Math.min(Math.abs(parcel.r0 - middle), Math.abs(parcel.r1 - middle)));
  if (out > MOST_OUT + 0.5) fault('by the middle crossing', `${where} ${out} cells out`);
  // No stretch of street closed round it.
  for (let col = parcel.c0 - PARCEL_OPEN; col <= parcel.c1 + PARCEL_OPEN; col++) {
    for (let row = parcel.r0 - PARCEL_OPEN; row <= parcel.r1 + PARCEL_OPEN; row++) {
      if (col >= 0 && row >= 0 && col < n && row < n && !inParcel(col, row) && grid.shut[col * n + row] !== 0) fault('its streets whole round it', where);
    }
  }
  // The gates the roads come in by, where the roads expect them.
  for (const gate of roadGates.get(place) ?? []) {
    const cell = gatesOf(grid)[gate]?.cells[0];
    if (cell === undefined) continue;
    const expected = gateHeight(place, gate, world);
    const got = frame.terraceAt(cell[0], cell[1]);
    if (expected !== null && (got === null || Math.abs(got - expected) > 1e-6)) fault('the roads\' gates at the levels the roads expect', `${where} gate ${gate}: ${got} against ${expected}`);
  }
  layoutFaults(layout, where);
}
/** The layout's own promises: the six people inside the square, clear of its walls, of each other and of the strolls. */
function layoutFaults(layout: GuildLayout, where: string): void {
  const solids = guildSolids(layout, { hall: 20 });
  const inside = (x: number, z: number, margin: number): boolean => x >= layout.x0 + margin && x <= layout.x1 - margin && z >= layout.z0 + margin && z <= layout.z1 - margin;
  const gap = (x: number, z: number): number => {
    let least = Infinity;
    for (const { solid: s } of solids) {
      const dx = x - s.x;
      const dz = z - s.z;
      if (s.round) least = Math.min(least, Math.hypot(dx, dz) - s.hx);
      else {
        const a = Math.abs(dx * s.cos + dz * s.sin) - s.hx;
        const b = Math.abs(-dx * s.sin + dz * s.cos) - s.hz;
        least = Math.min(least, a > 0 || b > 0 ? Math.hypot(Math.max(a, 0), Math.max(b, 0)) : Math.max(a, b));
      }
    }
    return least;
  };
  const roles = new Set(layout.spots.map((spot) => spot.role));
  if (roles.size !== roleSet.size || layout.spots.length !== roleSet.size) fault('all six people', where);
  for (const spot of layout.spots) {
    counts.spots++;
    if (!inside(spot.x, spot.z, BODY)) fault('every spot inside the square', `${where} ${spot.role}`);
    const clear = gap(spot.x, spot.z);
    if (clear < SPOT_CLEAR) fault(`every spot ${SPOT_CLEAR.toFixed(2)} clear of the square's walls`, `${where} ${spot.role} ${clear.toFixed(2)}`);
    for (const other of layout.spots) {
      if (other !== spot && Math.hypot(other.x - spot.x, other.z - spot.z) < SPOT_APART - 1e-6) fault('the people apart', `${where} ${spot.role}/${other.role}`);
    }
  }
  for (const [x0, z0, x1, z1] of layout.strolls) {
    for (let t = 0; t <= 1.0001; t += 0.025) {
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (gap(x, z) < STROLL_CLEAR - 1e-6) fault('every stroll clear of the walls', `${where} at ${t.toFixed(2)}`);
      if (layout.spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < SPOT_APART - 1e-6)) fault('every stroll clear of the people', `${where} at ${t.toFixed(2)}`);
      if (!inside(x, z, STROLL_CLEAR - 1e-6)) fault('every stroll inside the square', where);
    }
  }
  for (const piece of [...layout.stalls, ...layout.boards, ...layout.flags, ...layout.lamps, ...layout.benches, ...layout.planters]) {
    if (!inside(piece.x, piece.z, 0)) fault('every piece inside the square', where);
  }
}
const refusedShare = refused.length / Math.max(1, list.length);
check(refusedShare <= MAX_REFUSED, `a parcel in all but ${(MAX_REFUSED * 100).toFixed(0)}% of them`, `${counts.found} of ${list.length}; refused (${refused.length}): ${refused.join(', ')}`);
console.log(`  shapes: ${[...counts.sizes].sort((a, b) => b[1] - a[1]).map(([shape, k]) => `${shape} ${k}`).join(', ')}`);
for (const what of ['dry', 'one terrace', 'off the edge', 'on no gate', 'clear of every landmark', 'by the middle crossing', 'its streets whole round it', 'the roads\' gates at the levels the roads expect', 'all six people', 'every spot inside the square', `every spot ${SPOT_CLEAR.toFixed(2)} clear of the square's walls`, 'the people apart', 'every stroll clear of the walls', 'every stroll clear of the people', 'every stroll inside the square', 'every piece inside the square']) {
  const where = faults.get(what) ?? [];
  check(where.length === 0, what, where.join('; '));
}
console.log(`  ${counts.spots} spots; the longest step of a square's cut ${counts.worstStep.toFixed(1)} ms (${counts.worstAt})`);
const sample = list.filter((_, k) => k % 37 === 0);
let same = true;
for (const index of sample) {
  const a = JSON.stringify(cut(index).layout);
  const b = JSON.stringify(cut(index).layout);
  if (a !== b) same = false;
}
check(same, 'the same parcel and layout cut twice', `${sample.length} towns`);

// --- drawn ------------------------------------------------------------------------

console.log('drawn:');
const parisIndex = places.findIndex((place) => place.name === 'Paris');
const paris = cut(parisIndex).layout;
check(paris !== null, 'Paris has a square');
if (paris !== null) {
  const slot = slotOf(parisIndex);
  const drawn = drawGuild(paris, { region: slot.style.id, iso: 'FRA', plaza: slot.ground.plaza, near: true, seed: slot.seed });
  const far = drawGuild(paris, { region: slot.style.id, iso: 'FRA', plaza: slot.ground.plaza, near: false, seed: slot.seed });
  const tris = (sink: Sink): number => sink.position.length / 9;
  console.log(`  near: hall ${tris(drawn.stone) + tris(drawn.upper)} triangles, the rest ${tris(drawn.decor)}; far: ${tris(far.stone) + tris(far.upper) + tris(far.decor)}; the hall ${drawn.hallHeight.toFixed(1)} tall`);
  check(tris(drawn.stone) + tris(drawn.upper) + tris(drawn.decor) < 9000, 'the drawn square under 9,000 triangles');
  const group = new THREE.Group();
  for (const sink of [drawn.stone, drawn.upper, drawn.decor]) {
    const byColour = new Map<string, number[]>();
    for (let t = 0; t < sink.position.length / 9; t++) {
      const v = t * 3;
      const key = `${Math.round(sink.color[v * 3]! * 255)},${Math.round(sink.color[v * 3 + 1]! * 255)},${Math.round(sink.color[v * 3 + 2]! * 255)}/${sink.glow[v * 2]}`;
      const list = byColour.get(key) ?? [];
      for (let k = 0; k < 9; k++) list.push(sink.position[t * 9 + k]!);
      byColour.set(key, list);
    }
    for (const [key, positions] of byColour) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.MeshBasicMaterial();
      material.userData.atlasToon = key;
      group.add(new THREE.Mesh(geometry, material));
    }
  }
  const fights = fightsIn(group);
  check(fights.length === 0, 'no two faces of different colours in one plane', fights.slice(0, 4).map((f) => `${f.a}/${f.b} at y ${f.y.toFixed(2)}`).join('; '));
  const plan = settlements.townPlanNow(parisIndex);
  check(plan?.guild !== undefined && plan.guild.c0 === paris.parcel.c0 && plan.guild.r1 === paris.parcel.r1, "the map's plan carries the square");
  const hall = plan === null ? -1 : Array.from(plan.roofs).lastIndexOf(HALL_COLOURS.roof);
  check(plan !== null && hall >= 0 && plan.kinds[hall] === 2 && plan.kinds.length === plan.buildings.length / 6, 'and its hall among the buildings, in its roof\'s colour');
}

// --- raised near ------------------------------------------------------------------

console.log('raised near:');
const { beginFrameBuild, endFrameBuild } = await import('../src/view.ts');
const { parkedModel } = await import('../src/craft/parked.ts');
parkedModel('bicycle');
const { createSettlements } = await import('../src/settlements.ts');

/** Stands a town near round the viewer; its mesh, and the longest frame. */
function standNear(towns: typeof settlements, place: Place): { mesh: THREE.Mesh | undefined; worst: number } {
  const radius = radiusOf(place);
  const viewer = unitAt(place.lat + (radius + 60) / UNITS_PER_DEGREE, place.lon, new THREE.Vector3()).multiplyScalar(PLANET_RADIUS + 2);
  const name = `town:${place.name}`;
  let worst = 0;
  for (let frame = 0; frame < 4000; frame++) {
    beginFrameBuild();
    const began = performance.now();
    towns.update(viewer, 20);
    if (frame > 0) worst = Math.max(worst, performance.now() - began);
    endFrameBuild();
    if (frame > 2 && towns.stats.pending === 0 && towns.group.getObjectByName(name) !== undefined) break;
  }
  return { mesh: towns.group.getObjectByName(name) as THREE.Mesh | undefined, worst };
}
const trianglesOf = (mesh: THREE.Mesh | undefined): number => (mesh === undefined ? 0 : mesh.geometry.getAttribute('position').count / 3);

const named = ['Paris', 'Tokyo', 'London', 'Nairobi', 'Lima', 'Cairo', 'Mexico City', 'Sydney', 'Madrid'];
const near = [
  ...named.map((name) => places.findIndex((place) => place.name === name)).filter((index) => index >= 0 && guildTowns.has(places[index]!)),
  ...list.filter((_, k) => k % 151 === 75),
];
const push = new THREE.Vector3();
const nearFaults = new Map<string, string[]>();
const nearFault = (what: string, where: string): void => {
  const known = nearFaults.get(what) ?? [];
  if (known.length < 6) known.push(where);
  nearFaults.set(what, known);
};
let published = 0;
let worstFrame = 0;
const costs: string[] = [];
for (const index of near) {
  const place = places[index]!;
  const where = place.name;
  const stood = standNear(settlements, place);
  worstFrame = Math.max(worstFrame, stood.worst);
  const square = settlements.guilds().find((entry) => entry.index === index);
  const layout = cut(index).layout;
  if (layout === null) {
    if (square !== undefined) nearFault('a square published only where one was cut', where);
    continue;
  }
  if (square === undefined) {
    nearFault('a square published for every town raised near with one', where);
    continue;
  }
  published++;
  if (square.place !== place || square.spots.length !== 6) nearFault('the square is its town\'s, with six spots', where);
  for (const spot of square.spots) {
    const made = settlements.madeHeightAt(spot.at);
    if (!(Math.abs(made - spot.at.length()) < 0.05)) nearFault('every spot on the floor a foot finds', `${where} ${spot.role} ${(made - spot.at.length()).toFixed(2)}`);
    if (settlements.collide(spot.at, BODY, push)) nearFault('every spot clear of every wall in the town', `${where} ${spot.role} pushed ${push.length().toFixed(2)}`);
    if (Math.abs(spot.facing.dot(spot.at.clone().normalize())) > 1e-3 || Math.abs(spot.facing.length() - 1) > 1e-6) nearFault('every facing along the ground', where);
  }
  for (const board of square.boards) {
    const over = board.at.length() - settlements.madeHeightAt(board.at);
    if (!(over > board.height / 2)) nearFault('each board\'s face over the floor', `${where} ${board.kind} ${over.toFixed(2)}`);
    if (Math.abs(board.normal.dot(square.up)) > 0.01 || Math.abs(board.up.dot(square.up)) < 0.99) nearFault('each board upright', where);
  }
  if (square.boards.length !== 2) nearFault('both boards', where);
  if (Math.abs(settlements.madeHeightAt(square.hall.at) - square.hall.at.length()) > 0.05) nearFault('the hall\'s door on the floor', where);
  // A point inside the hall's body: a wall.
  const inside = square.hall.at.clone().addScaledVector(square.hall.facing, -layout.hall.depth / 2);
  if (!settlements.collide(inside, 0.5, push)) nearFault('the hall is a wall', where);
  if (square.centre.distanceTo(square.up.clone().multiplyScalar(square.centre.length())) > 1e-6) nearFault('its up through its middle', where);
  if (costs.length < 3) {
    const withIt = trianglesOf(stood.mesh);
    guildSquares.enabled = false;
    const bare = createSettlements(world, places, { monuments: landmarks as never, roads });
    const without = trianglesOf(standNear(bare, place).mesh);
    guildSquares.enabled = true;
    costs.push(`${where} ${withIt.toLocaleString('en')} with, ${without.toLocaleString('en')} without (${withIt >= without ? '+' : ''}${(((withIt - without) / Math.max(1, without)) * 100).toFixed(1)}%)`);
  }
}
check(published >= near.length - refused.length && published > 0, 'every town raised near with a square publishes it', `${published} of ${near.length}`);
for (const what of ['a square published only where one was cut', 'a square published for every town raised near with one', 'the square is its town\'s, with six spots', 'every spot on the floor a foot finds', 'every spot clear of every wall in the town', 'every facing along the ground', 'each board\'s face over the floor', 'each board upright', 'both boards', 'the hall\'s door on the floor', 'the hall is a wall', 'its up through its middle']) {
  const where = nearFaults.get(what) ?? [];
  check(where.length === 0, what, where.join('; '));
}
console.log(`  the longest frame of the streamer while they built near from nothing: ${worstFrame.toFixed(1)} ms (\`pnpm town-steps\` holds the bound, ${MAX_FRAME_MS} ms, on a city built far first)`);
console.log(`  triangles: ${costs.join('; ')}`);

console.log(failures === 0 ? '\nguild: all ok' : `\nguild: ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
