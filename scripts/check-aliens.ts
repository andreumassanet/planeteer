/**
 * The other worlds as the space kit draws them, headless: the colonies, the
 * people, the craft and what lies about, against the kit read off disk.
 *
 *   node scripts/check-aliens.ts          # every world
 *   node scripts/check-aliens.ts mars     # one
 *
 * `check-worlds.ts` builds the worlds without the kit — there is no fetch in
 * Node, so every kit piece is its code-built stand-in there — and this is the
 * other half: the kit handed in (`provideWorldKit`) the way the browser's
 * `prepareWorldKit` would have fetched it, and then:
 *
 * - **The kit's table.** `PIECES` and `SCATTER` in `src/worlds/kit.ts` are
 *   the layout's knowledge of the pieces before they arrive; each is held to
 *   `manifest.json` (size, triangles, where its middle is). Every slot
 *   `CREATURE_SLOTS` paints is a slot the creature has.
 * - **Who lives where.** Every world's cast is creatures the kit has, its
 *   visitors are crew, and no two worlds share a creature: a people is
 *   recognisably its world's.
 * - **The colonies.** Every town built from the kit, deterministically,
 *   inside `colonyBudget`; no two buildings inside each other, none on an
 *   avenue, every row module's door to its avenue, windows that glow.
 * - **The people.** A town peopled with the traveller standing in it: the
 *   walkers the species' height, playing their clips, never inside a wall in
 *   a minute of walking; spoken to, they wave. The crew at a spaceport.
 * - **The craft.** Every vehicle a world names built from the kit where it
 *   asks for one, the seat inside the model, driven two seconds without
 *   going under the ground.
 * - **The ground's scatter.** The kit's props and plants on a few tiles, in
 *   budget.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';

const g = globalThis as Record<string, unknown>;
g.ProgressEvent ??= class extends Event {
  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type);
    Object.assign(this, init);
  }
};
g.self ??= globalThis;

const { spaceCreatureFrom, spaceGroupFrom } = await import('../src/space-kit.ts');
const kitModule = await import('../src/worlds/kit.ts');
const { CREATURE_SLOTS, PIECES, SCATTER, provideWorldKit, isKitBuilding } = kitModule;
const { WORLD_IDS, loadWorldSpec } = await import('../src/worlds/registry.ts');
const { createTerrain } = await import('../src/worlds/terrain.ts');
const { arrivalOf, colonyBudget, createSettlements, layoutOf } = await import('../src/worlds/settlements.ts');
const { townBudget } = await import('../src/worlds/town-grid.ts');
const { parkingOf } = await import('../src/worlds/arrival.ts');
const { AVATAR_HEIGHT } = await import('../src/stature.ts');
const { createCrowd, statureOf, WIDEST } = await import('../src/worlds/aliens.ts');
const { DEFAULT_KITS, createCraft } = await import('../src/worlds/craft.ts');
const { createDecor } = await import('../src/worlds/decor.ts');
const { BUILT_IN_FORMS } = await import('../src/worlds/architecture.ts');
const { townRadii } = await import('../src/system/contract.ts');
const { EARTH_GRAVITY } = await import('../src/worlds/player.ts');
const { facePoint } = await import('../src/worlds/cube.ts');
const { createSceneryContext } = await import('../src/scenery/contract.ts');
const { createToonRamp } = await import('../src/theme.ts');
const { unitAt } = await import('../src/sphere.ts');
type SpaceEntry = import('../src/space-kit.ts').SpaceEntry;
type WorldSpec = import('../src/worlds/contract.ts').WorldSpec;

let failures = 0;
const fail = (message: string): void => {
  failures++;
  console.log(`  FAIL  ${message}`);
};

const SPACE = resolve(import.meta.dirname, '../public/models/space');
const manifest = (JSON.parse(readFileSync(resolve(SPACE, 'manifest.json'), 'utf8')) as { models: SpaceEntry[] }).models;
const byId = new Map(manifest.filter((entry) => entry.group !== 'interior').map((entry) => [entry.id, entry]));
const only = process.argv[2];
const ctx = createSceneryContext();
const gradientMap = createToonRamp(4);

// ---------------------------------------------------------------------------
// The kit, off disk
// ---------------------------------------------------------------------------

console.log('\n=== the space kit in the worlds ===');
const began = performance.now();
const pieces = new Map<string, import('../src/space-kit.ts').SpacePiece>();
for (const group of ['buildings', 'craft', 'props', 'flora'] as const) {
  const loaded = await spaceGroupFrom(readFileSync(resolve(SPACE, `${group}.bin`)), manifest.filter((entry) => entry.group === group));
  for (const [id, piece] of loaded) pieces.set(id, piece);
}
const creatures = new Map<string, import('../src/space-kit.ts').SpaceCreature>();
for (const entry of manifest.filter((one) => one.group === 'creatures')) {
  creatures.set(entry.id, await spaceCreatureFrom(readFileSync(resolve(SPACE, entry.file)), entry, new THREE.MeshBasicMaterial()));
}
provideWorldKit({ pieces, creatures });
console.log(`  read ${pieces.size} pieces and ${creatures.size} creatures in ${(performance.now() - began).toFixed(0)} ms`);

// The table against the manifest.
for (const [id, info] of Object.entries(PIECES)) {
  const entry = byId.get(id);
  if (entry === undefined || entry.group !== 'buildings') {
    fail(`PIECES names ${id}, which is not a building in the manifest`);
    continue;
  }
  if (entry.triangles !== info.triangles) fail(`PIECES says ${id} is ${info.triangles} triangles, the manifest ${entry.triangles}`);
  info.size.forEach((v, k) => {
    if (Math.abs(v - entry.size[k]!) > 0.02) fail(`PIECES gives ${id} a size of ${info.size.join(' x ')}, the manifest ${entry.size.join(' x ')}`);
  });
  const box = pieces.get(id)!.model.box;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  if (Math.abs(cx - info.centre[0]) > 0.06 || Math.abs(cz - info.centre[1]) > 0.06) fail(`PIECES puts ${id}'s middle at ${info.centre.join(', ')}, its box at ${cx.toFixed(2)}, ${cz.toFixed(2)}`);
}
for (const [id, info] of Object.entries(SCATTER)) {
  const entry = byId.get(id);
  if (entry === undefined || (entry.group !== 'props' && entry.group !== 'flora')) fail(`SCATTER names ${id}, which is not a prop or a plant`);
  else if (entry.triangles !== info.triangles) fail(`SCATTER says ${id} is ${info.triangles} triangles, the manifest ${entry.triangles}`);
}
for (const [id, slots] of Object.entries(CREATURE_SLOTS)) {
  const creature = creatures.get(id);
  if (creature === undefined) {
    fail(`CREATURE_SLOTS paints ${id}, which is not a creature`);
    continue;
  }
  const have = creature.rig.slots.map((slot) => slot.slice(slot.lastIndexOf('#') + 1).toLowerCase());
  for (const hex of Object.keys(slots)) if (!have.includes(hex)) fail(`CREATURE_SLOTS paints ${id}'s slot ${hex}, which it does not have (${have.join(' ')})`);
  if (!Object.values(slots).includes('hide')) fail(`CREATURE_SLOTS gives ${id} no hide`);
}
for (const [kind, made] of Object.entries(DEFAULT_KITS)) {
  if (!pieces.has(made!.id)) fail(`the ${kind}'s kit craft ${made!.id} is not in the kit`);
}

// ---------------------------------------------------------------------------
// The worlds
// ---------------------------------------------------------------------------

const castOwner = new Map<string, string>();
const fingerprint = (geometry: THREE.BufferGeometry): string => {
  const p = geometry.getAttribute('position').array as Float32Array;
  let sum = 0;
  for (let i = 0; i < p.length; i += 7) sum += p[i]! * ((i % 13) + 1);
  return `${p.length}:${sum.toFixed(3)}`;
};

function checkCast(spec: WorldSpec): void {
  const civ = spec.civilisation;
  if (civ === null) return;
  const cast = civ.cast;
  if (cast === undefined) {
    fail(`${spec.id}: the ${civ.species.name} have no cast, so nobody walks the towns`);
    return;
  }
  for (const { item } of cast.creatures) {
    const entry = byId.get(item);
    if (entry === undefined || entry.group !== 'creatures' || entry.kind === 'crew') fail(`${spec.id}: the cast names ${item}, which is not one of the kit's aliens`);
    const owner = castOwner.get(item);
    if (owner !== undefined && owner !== spec.id) fail(`${spec.id}: ${item} is already ${owner}'s people`);
    castOwner.set(item, spec.id);
    if (CREATURE_SLOTS[item] === undefined) fail(`${spec.id}: ${item} has no slots to paint in the species' colours`);
  }
  for (const id of cast.visitors ?? []) if (byId.get(id)?.kind !== 'crew') fail(`${spec.id}: the visitor ${id} is not crew`);
  const colony = civ.architecture.colony;
  if (colony === undefined) {
    fail(`${spec.id}: the towns are not built from the kit (no colony)`);
    return;
  }
  const forms = new Set([...BUILT_IN_FORMS, ...Object.keys(civ.architecture.extra)]);
  for (const { item } of colony.modules) if (!isKitBuilding(item) && !forms.has(item)) fail(`${spec.id}: the colony's module ${item} is neither a kit building nor a form`);
  if (colony.centre !== null && !isKitBuilding(colony.centre)) fail(`${spec.id}: the colony's centre ${colony.centre} is not a kit building`);
  if (colony.centre === null && !forms.has(civ.architecture.landmark)) fail(`${spec.id}: the centrepiece ${civ.architecture.landmark} is not a form`);
  for (const id of colony.gardens) if (SCATTER[id] === undefined) fail(`${spec.id}: the garden plant ${id} is not in the kit`);
  for (const { item } of [...(spec.scatter?.props ?? []), ...(spec.scatter?.flora ?? [])]) if (SCATTER[item] === undefined) fail(`${spec.id}: the scatter names ${item}, which is not a prop or a plant`);
  console.log(
    `  cast: ${cast.creatures.map((one) => one.item).join(' and ')} as the ${civ.species.name} (${civ.species.morph.height.toFixed(1)} units)` +
      `${(cast.visitors?.length ?? 0) > 0 ? `, ${cast.visitors!.length} crew visiting` : ''}; colony of ${colony.modules.length} modules round ${colony.centre ?? civ.architecture.landmark}`,
  );
}

function checkTowns(spec: WorldSpec, terrain: import('../src/worlds/terrain.ts').Terrain): import('../src/worlds/settlements.ts').Settlements {
  const towns = createSettlements(spec, terrain, ctx, gradientMap);
  const again = createSettlements(spec, terrain, ctx, gradientMap);
  let worst = 0;
  let worstName = '';
  let total = 0;
  let glowing = 0;
  let ports = 0;
  let buildings = 0;
  let slowest = 0;
  for (const site of towns.sites) {
    if (site.landmark) continue;
    const t0 = performance.now();
    towns.prime(site.origin);
    slowest = Math.max(slowest, performance.now() - t0);
    if (site.mesh === null || !site.kit) {
      fail(`${spec.id}: ${site.id} was not built from the kit`);
      continue;
    }
    const triangles = site.mesh.geometry.getAttribute('position').count / 3;
    total += triangles;
    if (triangles > worst) {
      worst = triangles;
      worstName = site.id;
    }
    // A grid town (`town-grid.ts`) spends its own budget on its buildings and
    // the street on top of it: the pavements, lamps, planters and parked craft.
    const allowed = site.town !== null ? townBudget(site.radius) * 1.25 + 24000 : colonyBudget(site.radius) * 1.3 + 4000;
    if (triangles > allowed) fail(`${spec.id}: ${site.id} is ${triangles} triangles, over the ${Math.round(allowed)} its size allows`);
    if (triangles > 150000) fail(`${spec.id}: ${site.id} is ${triangles} triangles, over the 150,000 a town may cost`);
    // Determinism: the same town from a second set of settlements.
    const twin = again.sites.find((one) => one.id === site.id)!;
    again.prime(twin.origin);
    if (twin.mesh === null || fingerprint(twin.mesh.geometry) !== fingerprint(site.mesh.geometry)) fail(`${spec.id}: ${site.id} builds differently twice`);
    const glow = site.mesh.geometry.getAttribute('aGlow').array as Float32Array;
    if (glow.some((v) => v > 0)) glowing++;
    if (site.port !== null) ports++;
    // Walls: no two buildings inside each other, none on an avenue.
    const fs = site.footprints;
    buildings += new Set(fs.map((f, k) => f.part ?? -1 - k)).size;
    for (let a = 0; a < fs.length; a++) {
      const A = fs[a]!;
      if (A.height <= 0) fail(`${spec.id}: a wall of ${site.id} has no height`);
      for (let b = a + 1; b < fs.length; b++) {
        const B = fs[b]!;
        if (A.part !== undefined && A.part === B.part) continue;
        // A tube's beads end inside the modules it joins.
        if ((A.part ?? 0) >= 10000 || (B.part ?? 0) >= 10000) continue;
        const d = Math.hypot(A.x - B.x, A.z - B.z);
        if (d < (A.radius + B.radius) * 0.8) fail(`${spec.id}: two walls of ${site.id} stand inside each other (${A.radius.toFixed(1)} and ${B.radius.toFixed(1)} at ${d.toFixed(1)})`);
      }
      if (Math.hypot(A.x, A.z) < 0.5) continue;
      if (site.town !== null) {
        // A grid town: nothing solid on a carriageway but what stands at its
        // kerb on purpose — a lamp, a parked craft.
        for (const street of site.town.streets) {
          const across = Math.abs((street.axis === 'x' ? A.z : A.x) - street.at);
          const along = Math.abs(street.axis === 'x' ? A.x : A.z);
          const carriage = street.half - street.walk;
          const kerbside = A.radius < 0.5 || (A.part ?? 0) >= 20000;
          if (!kerbside && along < site.town.grid.half && across + A.radius < carriage - 0.3) {
            fail(`${spec.id}: a wall of ${site.id} stands in a carriageway (${across.toFixed(1)} from its line)`);
          }
        }
        continue;
      }
      for (const avenue of site.avenues) {
        const along = A.x * Math.sin(avenue) + A.z * Math.cos(avenue);
        const across = Math.abs(A.x * Math.cos(avenue) - A.z * Math.sin(avenue));
        if (along > site.plaza && along < site.paving - 4 && across - A.radius < site.avenueHalf - 0.25) {
          fail(`${spec.id}: a wall of ${site.id} reaches ${(site.avenueHalf - across + A.radius).toFixed(1)} into an avenue`);
        }
      }
    }
    // The arrival: clear of every wall, the square in sight, the craft parked clear.
    const at = (x: number, z: number): THREE.Vector3 => towns.toWorld(site, x, site.floor + 0.05, z, new THREE.Vector3());
    const arrival = arrivalOf(site);
    if (towns.collide(at(arrival.x, arrival.z), 0.6)) fail(`${spec.id}: the arrival in ${site.id} stands in a wall`);
    const into = Math.hypot(arrival.x, arrival.z);
    for (let k = 1; k < 24; k++) {
      const t = k / 24;
      const reach = into + (site.plaza * 0.9 - into) * t;
      const probe = towns.toWorld(site, (arrival.x / into) * reach, site.floor + AVATAR_HEIGHT * 0.93, (arrival.z / into) * reach, new THREE.Vector3());
      if (towns.blocks(probe)) {
        fail(`${spec.id}: the arrival in ${site.id} cannot see the square: a wall ${(into - reach).toFixed(1)} units in`);
        break;
      }
    }
    spec.vehicles.forEach((vehicle, k) => {
      const kind = typeof vehicle === 'string' ? vehicle : vehicle.kind;
      const spot = parkingOf(site, k, kind === 'lander' || kind === 'aerostat');
      if (towns.collide(at(spot.x, spot.z), 2)) fail(`${spec.id}: in ${site.id} craft ${k} waits inside a wall`);
    });
    // Every row module's front is to its avenue (the disc of modules; a grid
    // town's fronts are to its streets by construction, `town-grid.ts`).
    for (const plot of site.town !== null ? [] : layoutOf(spec, site.id, site.radius, false).plots) {
      if (plot.row === undefined) continue;
      const avenue = site.avenues[Math.floor(plot.row / 2)]!;
      const side = plot.row % 2 === 1 ? 1 : -1;
      const toward = { x: -side * Math.cos(avenue), z: side * Math.sin(avenue) };
      const front = Math.sin(plot.yaw) * toward.x + Math.cos(plot.yaw) * toward.z;
      if (front < 0.95) fail(`${spec.id}: a module of ${site.id} turns its door ${(Math.acos(Math.min(1, front)) * 57.3).toFixed(0)} degrees off its avenue`);
    }
  }
  const towns_ = towns.sites.filter((one) => !one.landmark).length;
  console.log(
    `  colonies: ${towns_} towns, ${buildings} buildings, ${Math.round(total / Math.max(1, towns_)).toLocaleString('en')} triangles a town on average, the largest ` +
      `${worst.toLocaleString('en')} (${worstName}); ${ports} spaceports; windows lit in ${glowing}; the slowest built in ${slowest.toFixed(0)} ms`,
  );
  if (glowing === 0) fail(`${spec.id}: no town has a window that glows`);
  again.dispose();
  return towns;
}

function checkPeople(spec: WorldSpec, towns: import('../src/worlds/settlements.ts').Settlements): void {
  const civ = spec.civilisation;
  if (civ === null || civ.cast === undefined) return;
  const crowd = createCrowd(spec, towns, ctx, gradientMap);
  // The two biggest towns, the traveller standing in the square of each.
  const sites = towns.sites.filter((one) => !one.landmark).sort((a, b) => b.population - a.population).slice(0, 2);
  let walked = 0;
  let inside = 0;
  let worstInside = 0;
  const clips = new Set<string>();
  let visitors = 0;
  let tall = [Infinity, 0];
  for (const site of sites) {
    const player = site.origin.clone().addScaledVector(site.dir, site.floor + 0.1);
    crowd.update(0.016, player, player);
    const mine = crowd.walkers.filter((w) => w.site === site);
    const people = mine.filter((w) => !w.visitor);
    visitors += mine.length - people.length;
    if (people.length < 2) fail(`${spec.id}: ${site.id} is peopled by ${people.length}`);
    if (site.port !== null && mine.length === people.length) fail(`${spec.id}: ${site.id} has a pad and no crew at it`);
    for (const w of people) {
      tall = [Math.min(tall[0]!, w.height), Math.max(tall[1]!, w.height)];
      // A person's stature at most (`statureOf`), smaller for a blob or a
      // flyer, and never wider than `WIDEST`.
      const most = statureOf(civ.species.morph.height) * 1.08;
      if (w.height > most || w.height < most * 0.3) fail(`${spec.id}: a ${civ.species.name} of ${site.id} is ${w.height.toFixed(1)} units tall, against ${most.toFixed(1)}`);
      if (w.room * 2 > WIDEST * 1.01) fail(`${spec.id}: a ${civ.species.name} of ${site.id} is ${(w.room * 2).toFixed(1)} units across, wider than ${WIDEST.toFixed(1)}`);
    }
    // A minute of walking, at 30 frames a second, from out of the way.
    const away = player.clone().addScaledVector(site.dir, 200);
    const start = new Map(people.map((w) => [w, { x: w.x, z: w.z }]));
    for (let frame = 0; frame < 1800; frame++) {
      crowd.update(1 / 30, away, player);
      for (const w of people) {
        clips.add(`${w.clip}`);
        for (const f of site.footprints) {
          const into = f.radius - Math.hypot(w.x - f.x, w.z - f.z);
          if (into > 0.35) {
            inside++;
            worstInside = Math.max(worstInside, into);
          }
        }
      }
    }
    for (const w of people) if (Math.hypot(w.x - start.get(w)!.x, w.z - start.get(w)!.z) > 2) walked++;
    // Spoken to: the walker turns, stops and greets.
    const talker = people[0];
    if (talker !== undefined) {
      talker.facing = player;
      crowd.update(1 / 30, away, player);
      if (talker.clip !== 'greet') fail(`${spec.id}: a ${civ.species.name} spoken to plays ${talker.clip}, not a greeting`);
      talker.facing = null;
    }
  }
  if (inside > 0) fail(`${spec.id}: walkers stood ${inside} frames inside a wall, ${worstInside.toFixed(2)} deep at worst`);
  if (walked === 0) fail(`${spec.id}: nobody walked anywhere in a minute`);
  if (!clips.has('idle')) fail(`${spec.id}: nobody stood idle`);
  if (!clips.has('walk') && !clips.has('fly')) fail(`${spec.id}: nobody walked or flew along an avenue`);
  const body = [...crowd.walkers].find((w) => !w.visitor);
  const triangles = body === undefined ? 0 : body.creature.entry.triangles;
  console.log(
    `  people: ${crowd.walkers.length - visitors} in the two biggest towns, ${tall[0]!.toFixed(1)} to ${tall[1]!.toFixed(1)} units tall, ${walked} walked in a minute, ` +
      `clips ${[...clips].sort().join(' ')}; ${visitors} crew; a body about ${triangles.toLocaleString('en')} triangles, one call`,
  );
  crowd.dispose();
}

function checkCraft(spec: WorldSpec, terrain: import('../src/worlds/terrain.ts').Terrain): void {
  const here = new THREE.Vector3();
  unitAt(5, 5, here);
  const names: string[] = [];
  for (const vehicle of spec.vehicles) {
    const kind = typeof vehicle === 'string' ? vehicle : vehicle.kind;
    const made = typeof vehicle === 'string' ? DEFAULT_KITS[vehicle] : vehicle.kit;
    const craft = createCraft(vehicle, ctx, gradientMap, here.clone().multiplyScalar(terrain.radius), new THREE.Vector3(0, 1, 0).addScaledVector(here, -here.y).normalize(), spec.wind);
    const label = `${craft.name}${made === undefined ? ' (in code)' : ` (${made.id})`}`;
    names.push(label);
    const groundAt = (p: THREE.Vector3): number => {
      const n = p.clone().normalize();
      return terrain.groundAt(n.x, n.y, n.z);
    };
    let triangles = 0;
    craft.object.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      const g = mesh.geometry;
      triangles += (g.index !== null ? g.index.count : g.getAttribute('position').count) / 3;
    });
    if (triangles > 10000) fail(`${spec.id}: ${label} is ${triangles} triangles`);
    if (made !== undefined) {
      // The seat is inside the model's plan, and the hips under its roof.
      const box = new THREE.Box3().setFromObject(craft.object);
      craft.object.updateMatrixWorld(true);
      const size = box.getSize(new THREE.Vector3());
      const seat = craft.seat;
      if (Math.abs(seat.x) > size.x / 2 || Math.abs(seat.z) > Math.max(size.x, size.z) / 2) fail(`${spec.id}: ${label}'s seat is outside it`);
    }
    const flies = kind !== 'rover' && kind !== 'skiff';
    for (let k = 0; k < 120; k++) craft.update(1 / 60, { throttle: 1, steer: 0.3, climb: flies && k < 60, descend: false }, groundAt, EARTH_GRAVITY, terrain.radius);
    const p = craft.position;
    if (![p.x, p.y, p.z].every(Number.isFinite)) fail(`${spec.id}: ${label} drove off to ${p.toArray()}`);
    if (p.length() - terrain.radius - groundAt(p) < -0.01) fail(`${spec.id}: ${label} is under the ground after two seconds`);
    craft.object.updateMatrixWorld(true);
    if (craft.object.matrixWorld.determinant() <= 0) fail(`${spec.id}: ${label}'s frame is mirrored`);
  }
  console.log(`  craft: ${names.join(', ')}`);
}

function checkScatter(spec: WorldSpec, terrain: import('../src/worlds/terrain.ts').Terrain): void {
  if (spec.scatter === null) return;
  const decorate = createDecor(spec, terrain, ctx);
  let tiles = 0;
  let worst = 0;
  let triangles = 0;
  const point = { face: 0, u: 0, v: 0 };
  const n = 1 << terrain.levels;
  for (let k = 0; k < 40; k++) {
    const dir = new THREE.Vector3();
    unitAt(-60 + (k % 10) * 13, -170 + Math.floor(k / 10) * 90, dir);
    facePoint(dir.x, dir.y, dir.z, point);
    const key = { face: point.face, level: terrain.levels, i: Math.min(n - 1, Math.floor(((point.u + 1) / 2) * n)), j: Math.min(n - 1, Math.floor(((point.v + 1) / 2) * n)) };
    const geometry = decorate(key, dir.clone().multiplyScalar(terrain.radius), dir);
    tiles++;
    if (geometry === null) continue;
    const t = geometry.getAttribute('position').count / 3;
    triangles += t;
    worst = Math.max(worst, t);
  }
  if (worst > 9000) fail(`${spec.id}: a tile's scatter is ${worst} triangles`);
  console.log(`  scatter: ${Math.round(triangles / tiles).toLocaleString('en')} triangles a tile on average, the most ${worst.toLocaleString('en')}`);
}

for (const id of WORLD_IDS) {
  if (only !== undefined && id !== only) continue;
  const spec = await loadWorldSpec(id);
  console.log(`\n${spec.body.name}`);
  const terrain = createTerrain(spec);
  checkCast(spec);
  const towns = checkTowns(spec, terrain);
  checkPeople(spec, towns);
  towns.dispose();
  checkCraft(spec, terrain);
  checkScatter(spec, terrain);
  // The layout knows the town without the kit: the same plots either way.
  const place = spec.body.settlements[0];
  if (place !== undefined) {
    const a = JSON.stringify(layoutOf(spec, place.id, townRadii(spec.body).get(place.id)!, false));
    const b = JSON.stringify(layoutOf(spec, place.id, townRadii(spec.body).get(place.id)!, false));
    if (a !== b) fail(`${id}: ${place.id}'s layout differs between two calls`);
  }
}

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
