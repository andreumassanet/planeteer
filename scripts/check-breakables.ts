/**
 * `pnpm breakables`: the small things a vehicle knocks over (`breakables.ts`)
 * and the people it knocks down, headless.
 *
 * The table (every kind is felt and asks something; the country's small pieces
 * break and its buildings do not; a bicycle cannot
 * fell a lamp, a car can fell a tree, nothing breaks under `BREAK_SPEED`); the
 * knock pose (over, lying, up, dizzy, solid again in order); a synthetic host
 * struck (the run folded onto its first vertex, the wall down, a copy thrown
 * that falls, bounces and lies flat on the floor, the same at any frame rate,
 * then dissolves and returns, the run put back bit for bit); and a real town
 * built near twice (the same props both times, every run inside its buffer
 * and no two overlapping, a bench's wall down after the strike while a
 * building's still stands).
 *
 *   node scripts/check-breakables.ts [town]
 */
import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import {
  BREAKABLE, BREAK_SPEED, DRESSING_KIND, KNOCK_DIZZY, KNOCK_FLY, KNOCK_LIE, KNOCK_RISE, KNOCK_TOTAL, LIE_SECONDS, MAX_JOLT,
  REGROW_SECONDS, breaks, createBreakables, flingOf, knockPose, newKnockPose, punchOf,
  BUILDING_REACH, BUILDING_REGROW_SECONDS, COLLAPSE_SECONDS, blown,
} from '../src/breakables.ts';
import type { Prop, PropHost, PropKind } from '../src/breakables.ts';
import { knockSolidAt } from '../src/breakables/knock.ts';
import { AVATAR_HEIGHT } from '../src/stature.ts';
import { radiusOf } from '../src/places.ts';
import { unitAt } from '../src/sphere.ts';
import { disc } from '../src/scenery/solids.ts';
import type { Solid } from '../src/scenery/solids.ts';
import { loadEarthFeatures } from './map-node.ts';
import { COUNTRY_PARTS } from '../src/countryside-kit.ts';
import { packTile } from '../src/vegetation/pack.ts';
import type { Placed } from '../src/vegetation/frame.ts';
import type { FlatVariant } from '../src/vegetation/tiles.ts';

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// --- the table ---------------------------------------------------------------
console.log('the table');
{
  const kinds = Object.keys(BREAKABLE) as PropKind[];
  check(kinds.every((kind) => BREAKABLE[kind].jolt > 0 && BREAKABLE[kind].jolt <= MAX_JOLT), 'every kind is felt, under the cap');
  check(kinds.every((kind) => BREAKABLE[kind].need > 0 && (kind === 'building' || BREAKABLE[kind].need <= 1.6)), 'every kind but a building asks a punch a bus has');
  check(!breaks('building', punchOf(11, 2.6), 200) && blown('building', 1, BUILDING_REACH * 0.9) && !blown('building', 1, BUILDING_REACH * 1.1) && !blown('building', 0.3, BUILDING_REACH * 0.5),
    'no vehicle brings a building down; a blast does, near enough and hard enough');
  check(blown('bench', 0.2, 0.95) && !blown('bench', 1, 1.05), 'a blast knocks anything small over anywhere inside its radius, nothing past it');
  check(Object.values(DRESSING_KIND).every((kind) => kind in BREAKABLE), 'every dressing piece names a kind');
  check(!('kiosk' in DRESSING_KIND), 'a kiosk is not breakable');
  const bicycle = punchOf(1.8, 0.6);
  const car = punchOf(4.5, 2);
  const bus = punchOf(11, 2.6);
  check(breaks('lamp', bicycle, 20) && breaks('tree', bicycle, 20) && !breaks('vending', bicycle, 30), 'a bicycle fells a lamp and a tree, and not a vending machine');
  check(breaks('tree', car, 30) && breaks('bench', car, 30), 'a car fells a tree and a bench');
  check(breaks('vending', bus, 30), 'a bus fells a vending machine');
  check(!breaks('bollard', bus, BREAK_SPEED - 0.1) && breaks('bollard', bus, BREAK_SPEED), `nothing breaks under ${BREAK_SPEED} units a second`);
  // The country's small pieces go over; its buildings stay walls.
  const small = ['standing-stone', 'cairn', 'rocks', 'hay-bale', 'wayside-cross', 'spirit-house', 'bench', 'signpost'];
  const big = ['barn', 'silo', 'windmill', 'turbine', 'lighthouse', 'chapel', 'windpump', 'marabout', 'ger', 'ruin-wall'];
  check(small.every((id) => { const kind = COUNTRY_PARTS[id]?.breaks; return kind !== undefined && kind in BREAKABLE; }), 'standing stones, cairns, rocks, bales and the other small country pieces are breakable');
  check(big.every((id) => COUNTRY_PARTS[id] !== undefined && COUNTRY_PARTS[id].breaks === undefined), 'barns, mills, lighthouses and chapels stay walls');
  check(breaks('stone', car, 30) && !breaks('stone', bicycle, 30), 'a car fells a standing stone and a bicycle does not');
  check(breaks('boulder', car, 30) && !breaks('boulder', car, (BREAKABLE.boulder.speed ?? 0) - 1) && !breaks('boulder', bicycle, 30),
    'a car at speed shatters a boulder; crawling, or on a bicycle, it is a wall', `from ${BREAKABLE.boulder.speed} units/s`);
  // A tile packs such a piece as a prop of its kind, its walls with it; a farm building it leaves alone.
  const triangle = (): FlatVariant => ({
    position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 0]), normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    color: new Float32Array(9).fill(0.5), outline: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    triangles: 1, height: 2, footprint: 1, tilt: 0, solid: 'walls',
  });
  const stone: Placed = { flat: { ...triangle(), breaks: 'stone' }, matrix: new THREE.Matrix4().makeTranslation(5, 0, 3) };
  const barn: Placed = { flat: triangle(), matrix: new THREE.Matrix4() };
  const wall = disc(5, 3, 0.5, 2);
  const packed = packTile([barn, stone], 6, 0, false, new Map(), new Map([[stone, [wall]]]));
  const prop = packed.props[0];
  check(packed.props.length === 1 && prop?.kind === 'stone' && prop.start === 3 && prop.count === 3 && prop.solids[0] === wall && prop.x === 5,
    'a tile packs a standing stone as a stone prop with its wall, and not the barn beside it', JSON.stringify(packed.props.map((p) => [p.kind, p.start, p.count])));
  // The wood's boulders: one with a wall is a prop that reaches past its wall; a pebble under the knee is none.
  const rock: Placed = { flat: { ...triangle(), solid: 'boulder' }, matrix: new THREE.Matrix4().makeTranslation(-4, 0, 2) };
  const pebble: Placed = { flat: { ...triangle(), solid: 'boulder' }, matrix: new THREE.Matrix4().makeTranslation(8, 0, 8) };
  const rockWall = disc(-4, 2, 2.5, 2);
  const rocks = packTile([rock, pebble], 6, 0, false, new Map(), new Map([[rock, [rockWall]], [pebble, []]]));
  check(rocks.props.length === 1 && rocks.props[0]!.kind === 'boulder' && rocks.props[0]!.radius * 0.8 >= rockWall.hx && rocks.props[0]!.solids[0] === rockWall,
    'a tile packs a boulder with a wall as a boulder prop, met before its wall, and no pebble', JSON.stringify(rocks.props.map((p) => [p.kind, p.radius.toFixed(2)])));
}

// --- the knock pose ----------------------------------------------------------
console.log('the knock pose');
{
  const pose = newKnockPose();
  const fling = flingOf(30);
  const at = (t: number) => knockPose(t, AVATAR_HEIGHT, fling, pose);
  at(0);
  check(pose.tilt === 0 && pose.along === 0 && !pose.solid, 'at the knock: upright, in place, not solid');
  at(KNOCK_FLY * 0.5);
  check(pose.lift > 0 && pose.along > 0 && pose.along < fling, 'flying: off the ground and on the way');
  at(KNOCK_FLY + KNOCK_LIE * 0.5);
  check(Math.abs(pose.tilt - Math.PI / 2) < 0.1 && pose.lift === 0 && pose.along === fling && !pose.solid, 'lying: flat, down, flung, not solid');
  at(KNOCK_FLY + KNOCK_LIE + KNOCK_RISE * 0.5);
  check(pose.tilt > 0 && pose.tilt < Math.PI / 2 && !pose.solid, 'getting up: half way, not yet solid');
  at(KNOCK_FLY + KNOCK_LIE + KNOCK_RISE + 0.1);
  check(pose.tilt === 0 && pose.solid && pose.up && pose.sway !== 0 && !pose.done, 'up: upright, solid, swaying, not done');
  at(KNOCK_TOTAL + 0.01);
  check(pose.done && pose.sway === 0, 'done after the dizzy spell');
  let continuous = true;
  let last = at(0).tilt;
  for (let t = 0; t <= KNOCK_TOTAL; t += 1 / 240) {
    const tilt = at(t).tilt;
    if (Math.abs(tilt - last) > 0.08) continuous = false;
    last = tilt;
  }
  check(continuous, 'the tilt never jumps');
  check(!knockSolidAt(KNOCK_FLY + KNOCK_LIE) && knockSolidAt(KNOCK_FLY + KNOCK_LIE + KNOCK_RISE) && knockSolidAt(-1), 'solid again once up, and when never knocked');
  check(flingOf(5) >= AVATAR_HEIGHT * 0.4 && flingOf(100) <= AVATAR_HEIGHT * 1.6 && flingOf(40) > flingOf(20), 'the fling grows with the speed, within bounds');
  console.log(`  (fly ${KNOCK_FLY}, lie ${KNOCK_LIE}, rise ${KNOCK_RISE}, dizzy ${KNOCK_DIZZY} s)`);
}

// --- a synthetic host ----------------------------------------------------------
console.log('a synthetic host');

/** A box standing on `y = 0` at `(x, z)`, as `count` non-indexed vertices appended to `into`. */
function boxAt(into: number[], x: number, z: number, hx: number, height: number): number {
  const box = new THREE.BoxGeometry(hx * 2, height, hx * 2).toNonIndexed();
  const position = box.getAttribute('position');
  for (let v = 0; v < position.count; v++) into.push(position.getX(v) + x, position.getY(v) + height / 2, position.getZ(v) + z);
  return position.count;
}

interface Synthetic {
  host: PropHost;
  mesh: THREE.Mesh;
  leaves: THREE.Mesh;
  up: THREE.Vector3;
  across: THREE.Vector3;
  original: Float32Array;
  leafOriginal: Float32Array;
  dropped: Solid[];
  feet: THREE.Vector3[];
}

/** Three props on a flat pad on the sphere: a bench (a wall), a lamp, and a tree whose leaves are a second mesh. */
function synthetic(): Synthetic {
  const up = unitAt(41.5, 2.1, new THREE.Vector3());
  const north = new THREE.Vector3(0, 1, 0).projectOnPlane(up).normalize();
  const across = new THREE.Vector3().crossVectors(up, north).normalize();
  const basis = new THREE.Matrix4().makeBasis(across, up, north);
  if (basis.determinant() <= 0) throw new Error('the synthetic basis reflects');
  const positions: number[] = [];
  const props: Prop[] = [];
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  const leaves = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.add(leaves);
  const place = (kind: PropKind, x: number, z: number, hx: number, height: number, solid: Solid | null): void => {
    const start = positions.length / 3;
    const count = boxAt(positions, x, z, hx, height);
    props.push({ kind, x, y: 0, z, radius: hx, height, ranges: [{ mesh, start, count, material }], solids: solid === null ? [] : [solid] });
  };
  place('bench', 0, 0, 1, 1, disc(0, 0, 1, PLANET_RADIUS + 1));
  place('lamp', 12, 0, 0.3, 6, null);
  place('tree', 0, 14, 0.5, 8, disc(0, 14, 0.5, 0));
  const leafPositions: number[] = [];
  const leafCount = boxAt(leafPositions, 0, 14, 3, 4);
  const tree = props[2]!;
  tree.ranges.push({ mesh: leaves, start: 0, count: leafCount, material: leaves.material as THREE.Material });
  const colour = new Float32Array(positions.length).fill(0.5);
  mesh.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  mesh.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(positions.length), 3));
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  leaves.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(leafPositions), 3));
  leaves.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(leafPositions.length).fill(0.2), 3));
  mesh.position.copy(up).multiplyScalar(PLANET_RADIUS);
  mesh.quaternion.setFromRotationMatrix(basis);
  mesh.updateMatrixWorld(true);
  const dropped: Solid[] = [];
  const host: PropHost = { mesh, props, dropSolids: (gone) => dropped.push(...gone) };
  const feet = props.map((prop) => new THREE.Vector3(prop.x, prop.y, prop.z).applyMatrix4(mesh.matrixWorld));
  return {
    host, mesh, leaves, up, across, dropped, feet,
    original: (mesh.geometry.getAttribute('position').array as Float32Array).slice(),
    leafOriginal: (leaves.geometry.getAttribute('position').array as Float32Array).slice(),
  };
}

/** Whether every vertex of the run sits on its first. */
function foldedRun(mesh: THREE.Mesh, start: number, count: number): boolean {
  const p = mesh.geometry.getAttribute('position');
  for (let v = start + 1; v < start + count; v++) {
    if (p.getX(v) !== p.getX(start) || p.getY(v) !== p.getY(start) || p.getZ(v) !== p.getZ(start)) return false;
  }
  return true;
}

const same = (a: Float32Array, b: Float32Array): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

{
  const s = synthetic();
  const landings: PropKind[] = [];
  const knocks: { kind: PropKind; speed: number }[] = [];
  const floor = PLANET_RADIUS;
  const breakables = createBreakables({
    floorAt: () => floor,
    onBreak: (knock) => knocks.push({ kind: knock.kind, speed: knock.speed }),
    onLand: (_point, kind) => landings.push(kind),
  });
  breakables.register(s.host);
  check(breakables.stats.hosts === 0, 'the stats count after an update');
  breakables.update(0);
  check(breakables.stats.hosts === 1 && breakables.stats.props === 3, 'one host, three props');

  const velocity = s.across.clone().multiplyScalar(20);
  const sweep = (foot: THREE.Vector3, radius: number, speed: number, punch: number): number => {
    const from = foot.clone().addScaledVector(s.across, -3);
    const to = foot.clone().addScaledVector(s.across, 3);
    return breakables.strike(from, to, radius, s.across.clone().multiplyScalar(speed), punch);
  };
  // Too slow, too light: nothing.
  check(sweep(s.feet[0]!, 1, BREAK_SPEED - 1, 1) === 0 && breakables.stats.folded === 0, 'a slow sweep breaks nothing');
  check(sweep(s.feet[1]!, 1, 20, 0.2) === 0 && s.dropped.length === 0, 'a punch under its need leaves the lamp standing');
  // The bench.
  const jolt = sweep(s.feet[0]!, 1, 20, 1);
  check(Math.abs(jolt - BREAKABLE.bench.jolt) < 1e-9, 'the bench is felt as its jolt', jolt.toFixed(3));
  const bench = s.host.props[0]!;
  check(foldedRun(s.mesh, bench.ranges[0]!.start, bench.ranges[0]!.count), 'the bench\'s run is folded onto its first vertex');
  check(!foldedRun(s.mesh, s.host.props[1]!.ranges[0]!.start, s.host.props[1]!.ranges[0]!.count), 'the lamp\'s run is untouched');
  check(s.dropped.length === 1 && s.dropped[0] === bench.solids[0], 'the bench\'s wall came down');
  check(knocks.length === 1 && knocks[0]!.kind === 'bench' && Math.abs(knocks[0]!.speed - 20) < 1e-9, 'the knock was told, with its speed');
  check(breakables.group.children.length === 1 && breakables.group.children[0]!.children.length === 1, 'one copy thrown, one mesh');
  const copy = breakables.group.children[0]!.children[0] as THREE.Mesh;
  check(copy.geometry.getAttribute('position').count === bench.ranges[0]!.count && copy.material === bench.ranges[0]!.material, 'the copy is the run, under the host\'s material');
  check(sweep(s.feet[0]!, 1, 20, 1) === 0, 'struck again, the bench is already down');
  // The tree, two ranges.
  sweep(s.feet[2]!, 1, 30, 1);
  const tree = s.host.props[2]!;
  check(foldedRun(s.mesh, tree.ranges[0]!.start, tree.ranges[0]!.count) && foldedRun(s.leaves, 0, tree.ranges[1]!.count), 'the tree\'s wood and leaves both fold');
  check(breakables.group.children[1]!.children.length === 2, 'the tree\'s copy carries both');

  // The fall: stepped a frame at a time until it lies still.
  let frames = 0;
  while (frames < 60 * 12) {
    breakables.update(1 / 60);
    frames++;
    if (landings.length >= 2 && breakables.stats.lying === 2) break;
  }
  const piece = breakables.group.children[0]!;
  const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(piece.quaternion);
  const upAt = piece.position.clone().normalize();
  check(landings.includes('bench') && landings.includes('tree'), 'both landed, and said so');
  check(Math.abs(axisY.dot(upAt)) < 0.15, 'the bench lies flat', axisY.dot(upAt).toFixed(3));
  const over = piece.position.length() - floor;
  check(over > -0.5 && over < bench.height + bench.radius, 'its foot is on the floor', over.toFixed(2));
  const thrownFrom = s.feet[0]!.distanceTo(piece.position);
  check(thrownFrom > 1 && thrownFrom < 40, 'thrown some way off, not far', thrownFrom.toFixed(1));

  // The same knock at another frame rate lands in the same place.
  const t = synthetic();
  const other = createBreakables({ floorAt: () => floor });
  other.register(t.host);
  other.strike(t.feet[0]!.clone().addScaledVector(t.across, -3), t.feet[0]!.clone().addScaledVector(t.across, 3), 1, velocity, 1);
  for (let i = 0; i < 12 * 144; i++) other.update(1 / 144);
  const again = other.group.children[0]!;
  check(again.position.distanceTo(piece.position) < 1e-3 && again.quaternion.angleTo(piece.quaternion) < 1e-3, 'the same at 144 Hz as at 60', again.position.distanceTo(piece.position).toExponential(1));

  // It lies, then dissolves; after the regrow it returns and the run is put back exactly.
  breakables.update(LIE_SECONDS);
  await sleep(450);
  breakables.update(1 / 60);
  check(breakables.stats.thrown === 0 && breakables.group.children.length === 0, 'after lying it dissolves and goes');
  check(foldedRun(s.mesh, bench.ranges[0]!.start, bench.ranges[0]!.count), 'the run stays folded meanwhile');
  breakables.update(REGROW_SECONDS);
  check(breakables.stats.returning === 2 && breakables.group.children.length === 2, 'at the regrow, the copies stand again, dissolving in');
  await sleep(450);
  breakables.update(0.5);
  check(breakables.stats.folded === 0 && breakables.group.children.length === 0, 'once in, the copies go and nothing is folded');
  check(same(s.mesh.geometry.getAttribute('position').array as Float32Array, s.original), 'the buffer is bit for bit what it was');
  check(same(s.leaves.geometry.getAttribute('position').array as Float32Array, s.leafOriginal), 'and the leaves\' too');
  // A host that went while a prop was down: the debris stays, nothing is put back.
  sweep(s.feet[1]!, 1, 20, 1);
  breakables.forget(s.host);
  breakables.update(1 / 60);
  check(breakables.stats.hosts === 0 && breakables.group.children.length === 1, 'a forgotten host leaves its debris');
  breakables.clear();
  check(breakables.group.children.length === 0, 'cleared');
}

// --- every vehicle on wheels or hooves -----------------------------------------
console.log('every vehicle on wheels or hooves');
{
  // Each road kind at its ordinary speed knocks over a bench, a lamp and a tree.
  const { readFileSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
  await import('./kit-node.ts');
  const { modelsFrom, rigFrom } = await import('../src/kit.ts');
  const { craftFrom } = await import('../src/craft/index.ts');
  const { horseMaterial } = await import('../src/craft/horse.ts');
  const { ROAD_HANDLING } = await import('../src/vehicles.ts');
  const horse = await rigFrom(readFileSync(resolve(PUBLIC, 'models/fauna/horse.bin')), 'horse', horseMaterial());
  const models = [...craftFrom(await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin'))), horse).values()];
  const misses: string[] = [];
  const kinds = Object.keys(ROAD_HANDLING) as (keyof typeof ROAD_HANDLING)[];
  for (const kind of kinds) {
    const model = models.find((entry) => entry.kind === kind);
    if (model === undefined) continue;
    const punch = punchOf(model.size[0], model.size[1]);
    const speed = ROAD_HANDLING[kind]!.speed;
    for (const prop of ['bench', 'lamp', 'tree'] as const) if (!breaks(prop, punch, speed)) misses.push(`${kind} ${prop}`);
  }
  check(misses.length === 0, `${kinds.length} road kinds at their ordinary speed knock over a bench, a lamp and a tree`, misses.join(', '));
}
{
  // A tree whose trunk's wall reaches past its own radius, met by a car at
  // mid-trunk height and off its foot, inside its wall: knocked over.
  const s = synthetic();
  const tree = s.host.props[2]!;
  (tree.solids as Solid[])[0] = disc(0, 14, 1.4, 0);
  const breakables = createBreakables({ floorAt: () => PLANET_RADIUS });
  breakables.register(s.host);
  const half = 1.1;
  const mid = s.feet[2]!.clone().addScaledVector(s.up, tree.height * 0.5).addScaledVector(s.across, 0);
  const side = new THREE.Vector3().crossVectors(s.up, s.across).normalize();
  mid.addScaledVector(side, half + 1.2);
  const jolt = breakables.strike(mid.clone().addScaledVector(s.across, -3), mid.clone().addScaledVector(s.across, 3), half, s.across.clone().multiplyScalar(30), 1);
  check(jolt > 0 && foldedRun(s.mesh, tree.ranges[0]!.start, tree.ranges[0]!.count), 'a car meeting a tree at mid-trunk, off its foot but inside its wall, knocks it over', jolt.toFixed(3));
}

// --- a blast -------------------------------------------------------------------
console.log('a blast');
{
  // A building with an awning on its front and a lamp and a bench beside it,
  // one host; a blast at the building's door.
  const up = unitAt(41.5, 2.1, new THREE.Vector3());
  const north = new THREE.Vector3(0, 1, 0).projectOnPlane(up).normalize();
  const across = new THREE.Vector3().crossVectors(up, north).normalize();
  const basis = new THREE.Matrix4().makeBasis(across, up, north);
  if (basis.determinant() <= 0) throw new Error('the blast basis reflects');
  const positions: number[] = [];
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  const buildingCount = boxAt(positions, 0, 0, 4, 10);
  const awningStart = positions.length / 3;
  const awningCount = boxAt(positions, 4.6, 0, 0.5, 4);
  const lampStart = positions.length / 3;
  const lampCount = boxAt(positions, 0, 12, 0.3, 6);
  const benchStart = positions.length / 3;
  const benchCount = boxAt(positions, 80, 0, 1, 1);
  mesh.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(positions.length).fill(0.5), 3));
  mesh.position.copy(up).multiplyScalar(PLANET_RADIUS);
  mesh.quaternion.setFromRotationMatrix(basis);
  mesh.updateMatrixWorld(true);
  const original = (mesh.geometry.getAttribute('position').array as Float32Array).slice();
  const wall = disc(0, 0, 4, PLANET_RADIUS + 10);
  const props: Prop[] = [
    { kind: 'building', x: 0, y: 0, z: 0, radius: 4, height: 10, ranges: [{ mesh, start: 0, count: buildingCount, material }], solids: [wall],
      clings: () => [{ mesh, start: awningStart, count: awningCount, material }] },
    { kind: 'lamp', x: 0, y: 0, z: 12, radius: 0.3, height: 6, ranges: [{ mesh, start: lampStart, count: lampCount, material }], solids: [] },
    { kind: 'bench', x: 80, y: 0, z: 0, radius: 1, height: 1, ranges: [{ mesh, start: benchStart, count: benchCount, material }], solids: [] },
  ];
  const standing = new Set<Solid>([wall]);
  const host: PropHost = {
    mesh, props,
    dropSolids: (gone) => gone.forEach((solid) => standing.delete(solid)),
    restoreSolids: (back) => back.forEach((solid) => standing.add(solid)),
  };
  const knocked: PropKind[] = [];
  const breakables = createBreakables({ floorAt: () => PLANET_RADIUS, onBreak: (knock) => knock.blasted && knocked.push(knock.kind) });
  breakables.register(host);
  const door = new THREE.Vector3(0, 0, 5).applyMatrix4(mesh.matrixWorld);
  const down = breakables.blast(door, 30, 1);
  breakables.update(0);
  check(down === 2 && knocked.includes('building') && knocked.includes('lamp') && !knocked.includes('bench'), 'a blast brings down the building and the lamp in its radius, not the bench past it', knocked.join(', '));
  check(foldedRun(mesh, 0, buildingCount) && foldedRun(mesh, awningStart, awningCount) && !foldedRun(mesh, benchStart, benchCount),
    'the building\'s run is folded, and the awning on its front with it');
  check(!standing.has(wall), 'its wall is down');
  check(breakables.stats.collapsed === 1, 'one building down');
  // It sinks into its plot as it dissolves, never thrown about.
  const copy = breakables.group.children.find((child) => child.children.some((m) => (m as THREE.Mesh).geometry.getAttribute('position').count === buildingCount + awningCount));
  check(copy !== undefined, 'its copy carries the building and the awning in one mesh');
  const foot = new THREE.Vector3(0, 0, 0).applyMatrix4(mesh.matrixWorld);
  breakables.update(COLLAPSE_SECONDS * 0.5);
  const sunk = copy === undefined ? 0 : foot.length() - copy.position.length();
  check(sunk > 0.5 && copy!.position.clone().projectOnPlane(up).distanceTo(foot.clone().projectOnPlane(up)) < 0.01, 'and sinks straight down into its plot as it goes', `${sunk.toFixed(2)} down`);
  for (let t = 0; t < COLLAPSE_SECONDS + 1; t += 0.1) {
    await sleep(40);
    breakables.update(0.1);
  }
  check(copy !== undefined && copy.parent === null, 'down and gone once the dissolve has run');
  check(blown('building', 1, 0) && breakables.blast(door, 30, 1) === 0, 'a second blast finds nothing standing');
  breakables.update(BUILDING_REGROW_SECONDS);
  check(breakables.stats.returning >= 1 && foldedRun(mesh, 0, buildingCount), 'after the regrow it stands again, dissolving in, the run still folded under it');
  // The lamp beside it lies, goes and stands again on its own clock.
  for (let k = 0; k < 8 && breakables.stats.folded > 0; k++) {
    for (let j = 0; j < 40; j++) breakables.update(0.25);
    await sleep(400);
    breakables.update(LIE_SECONDS);
  }
  check(breakables.stats.collapsed === 0 && standing.has(wall), 'its wall is back');
  const after = mesh.geometry.getAttribute('position').array as Float32Array;
  let first = -1;
  for (let i = 0; i < after.length && first < 0; i++) if (after[i] !== original[i]) first = i / 3;
  check(breakables.stats.folded === 0 && same(after, original), 'every run is put back bit for bit, the awning\'s too', `${breakables.stats.folded} folded, first differing vertex ${first} (building ${buildingCount}, awning from ${awningStart}, lamp from ${lampStart})`);
}

// --- a real town ---------------------------------------------------------------
const name = process.argv[2] ?? 'Palma';
console.log(`a real town: ${name}`);
{
  const { world, places, roads, landmarks } = await loadEarthFeatures();
  const { createSettlements } = await import('../src/settlements.ts');
  const { beginFrameBuild, endFrameBuild } = await import('../src/view.ts');
  const { parkedModel } = await import('../src/craft/parked.ts');
  parkedModel('bicycle');
  const place = places.find((entry) => entry.name === name);
  if (place === undefined) {
    check(false, `${name}: no such place`);
  } else {
    const radius = radiusOf(place);
    const viewer = unitAt(place.lat + (radius + 60) / UNITS_PER_DEGREE, place.lon, new THREE.Vector3()).multiplyScalar(PLANET_RADIUS + 2);
    const town = `town:${place.name}`;
    const build = (): { hosts: PropHost[]; settlements: ReturnType<typeof createSettlements> } => {
      const hosts: PropHost[] = [];
      const sink = { register: (host: PropHost) => void hosts.push(host), forget: (host: PropHost) => void hosts.splice(hosts.indexOf(host), 1) };
      const settlements = createSettlements(world, places, { monuments: landmarks as never, roads, breakables: sink });
      for (let frame = 0; frame < 4000; frame++) {
        beginFrameBuild();
        settlements.update(viewer, 20);
        endFrameBuild();
        if (frame > 2 && settlements.stats.pending === 0 && settlements.group.getObjectByName(town) !== undefined) break;
      }
      return { hosts, settlements };
    };
    const first = build();
    const host = first.hosts.find((entry) => entry.mesh.name === town);
    check(host !== undefined, 'the town registered its props');
    if (host !== undefined) {
      const counts: Record<string, number> = {};
      for (const prop of host.props) counts[prop.kind] = (counts[prop.kind] ?? 0) + 1;
      console.log(`  ${host.props.length} props: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      check((counts.tree ?? 0) > 0 && (counts.lamp ?? 0) > 0, 'trees and lamps among them');
      check(Object.keys(counts).some((kind) => kind in DRESSING_KIND || kind === 'table' || kind === 'bin'), 'and the street dressing\'s pieces');
      let inside = true;
      let apart = true;
      const byMesh = new Map<THREE.Mesh, { start: number; end: number }[]>();
      for (const prop of host.props) {
        if (Math.hypot(prop.x, prop.z) > radius * 1.5 + 70) inside = false;
        for (const range of prop.ranges) {
          if (range.start + range.count > range.mesh.geometry.getAttribute('position').count || range.count <= 0) inside = false;
          const list = byMesh.get(range.mesh) ?? [];
          list.push({ start: range.start, end: range.start + range.count });
          byMesh.set(range.mesh, list);
        }
      }
      for (const list of byMesh.values()) {
        list.sort((a, b) => a.start - b.start);
        for (let i = 1; i < list.length; i++) if (list[i]!.start < list[i - 1]!.end) apart = false;
      }
      check(inside, 'every prop stands in its town and every run inside its buffer');
      check(apart, 'no two runs overlap');
      check(host.props.filter((prop) => prop.kind === 'tree').some((prop) => prop.ranges.length === 2), 'a near tree\'s leaves ride with its wood');

      // The same town built again is the same list.
      const second = build();
      const twin = second.hosts.find((entry) => entry.mesh.name === town);
      const key = (prop: Prop): string => `${prop.kind}|${prop.x.toFixed(5)}|${prop.y.toFixed(5)}|${prop.z.toFixed(5)}|${prop.ranges.map((range) => `${range.start}:${range.count}`).join(',')}|${prop.solids.length}`;
      check(twin !== undefined && twin.props.length === host.props.length && host.props.every((prop, i) => key(prop) === key(twin.props[i]!)), 'built again, the same props in the same runs');

      // A strike on the real town: a walled prop's wall comes down, the buildings stay.
      const { settlements } = first;
      const breakables = createBreakables({ floorAt: (point) => Math.max(PLANET_RADIUS, settlements.madeHeightAt(point)) });
      breakables.register(host);
      const push = new THREE.Vector3();
      const at = new THREE.Vector3();
      const across = new THREE.Vector3();
      const walled = host.props.find((prop) => {
        if (prop.solids.length === 0 || prop.kind === 'building') return false;
        at.set(prop.x, prop.y, prop.z).applyMatrix4(host.mesh.matrixWorld);
        return settlements.collide(at, 0.2, push);
      });
      check(walled !== undefined, 'a prop with a wall stands as one', walled?.kind ?? 'none');
      if (walled !== undefined) {
        at.set(walled.x, walled.y, walled.z).applyMatrix4(host.mesh.matrixWorld);
        across.set(1, 0, 0).applyQuaternion(host.mesh.quaternion);
        const jolt = breakables.strike(at.clone().addScaledVector(across, -3), at.clone().addScaledVector(across, 3), 1, across.clone().multiplyScalar(25), 1.6);
        check(jolt > 0 && !settlements.collide(at, 0.2, push), `struck, the ${walled.kind} is no wall`, jolt.toFixed(3));
        check(foldedRun(walled.ranges[0]!.mesh, walled.ranges[0]!.start, walled.ranges[0]!.count), 'and its run is folded');
      }
      // Every prop down: what still stops a body is a building.
      for (const prop of host.props) {
        at.set(prop.x, prop.y, prop.z).applyMatrix4(host.mesh.matrixWorld);
        across.set(1, 0, 0).applyQuaternion(host.mesh.quaternion);
        breakables.strike(at.clone().addScaledVector(across, -3), at.clone().addScaledVector(across, 3), Math.max(1, prop.radius), across.clone().multiplyScalar(40), 1.6);
      }
      breakables.update(0);
      let walls = 0;
      for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
          const point = unitAt(place.lat + (i * radius) / 5 / UNITS_PER_DEGREE, place.lon + (j * radius) / 5 / UNITS_PER_DEGREE / Math.cos((place.lat * Math.PI) / 180), new THREE.Vector3()).multiplyScalar(PLANET_RADIUS);
          if (settlements.madeHeightAt(point) > 0 && settlements.collide(point, 6, push)) walls++;
        }
      }
      const small = host.props.filter((prop) => prop.kind !== 'building').length;
      check(breakables.stats.folded === small && walls > 0, 'every prop down, the buildings still walls', `${breakables.stats.folded}/${small} down, ${walls} probes met a wall`);
      breakables.clear();
      breakables.update(0);
      check(breakables.stats.folded === 0, 'cleared, every run back');
      // A blast at a building's door: its wall drops, what hangs on its front goes with it, and it comes back.
      const building = host.props.find((prop) => prop.kind === 'building' && prop.solids.length > 0 && (prop.clings?.().length ?? 0) > 0);
      check(building !== undefined, 'a building stands as a prop, with something on its front', `${host.props.filter((prop) => prop.kind === 'building').length} buildings`);
      if (building !== undefined) {
        const before = (building.ranges[0]!.mesh.geometry.getAttribute('position').array as Float32Array).slice();
        at.set(building.x, building.y, building.z).applyMatrix4(host.mesh.matrixWorld);
        const solid = building.solids[0]!;
        const inside = new THREE.Vector3(solid.x, 0, solid.z);
        const probe = settlements.collide(at, 0.5, push);
        breakables.blast(at, building.radius * 1.2, 1);
        breakables.update(0);
        const clinging = building.clings?.() ?? [];
        check(probe && !settlements.collide(at, 0.5, push), 'a blast brings a building down: its wall is gone', `${inside.x.toFixed(1)}, ${inside.z.toFixed(1)}`);
        check(foldedRun(building.ranges[0]!.mesh, building.ranges[0]!.start, building.ranges[0]!.count), 'and its run is folded');
        breakables.update(BUILDING_REGROW_SECONDS + COLLAPSE_SECONDS);
        await sleep(450);
        breakables.update(1);
        await sleep(450);
        breakables.update(1);
        check(settlements.collide(at, 0.5, push), 'it stands again, a wall again');
        check(same(building.ranges[0]!.mesh.geometry.getAttribute('position').array as Float32Array, before), 'its run and what clung to it put back bit for bit', `${clinging.length} clinging runs`);
      }
      // A span strung from a building's wall (bunting, washing, a wire) goes down with it and comes back with it.
      const lines = (host.mesh.userData.lines ?? []) as number[];
      const starts = new Set<number>();
      for (let i = 0; i + 7 < lines.length; i += 8) starts.add(lines[i]!);
      let spanned: Prop | undefined;
      let span = -1;
      for (const prop of host.props) {
        if (prop.kind !== 'building' || prop.solids.length === 0) continue;
        const hit = (prop.clings?.() ?? []).find((range) => starts.has(range.start));
        if (hit !== undefined) {
          spanned = prop;
          span = lines.indexOf(hit.start);
          break;
        }
      }
      check(spanned !== undefined, 'a line is strung from a building\'s wall', `${lines.length / 8} lines in the town`);
      if (spanned !== undefined && span >= 0) {
        const geometry = spanned.ranges[0]!.mesh;
        const before = (geometry.geometry.getAttribute('position').array as Float32Array).slice();
        at.set(spanned.x, spanned.y, spanned.z).applyMatrix4(host.mesh.matrixWorld);
        breakables.blast(at, spanned.radius * 1.2, 1);
        breakables.update(0);
        check(foldedRun(geometry, lines[span]!, lines[span + 1]!), 'broken, the building takes the line strung from it down with it');
        breakables.update(BUILDING_REGROW_SECONDS + COLLAPSE_SECONDS);
        for (let k = 0; k < 8 && breakables.stats.folded > 0; k++) {
          for (let j = 0; j < 40; j++) breakables.update(0.25);
          await sleep(400);
          breakables.update(LIE_SECONDS);
        }
        check(!foldedRun(geometry, lines[span]!, lines[span + 1]!) && same(geometry.geometry.getAttribute('position').array as Float32Array, before), 'and stood again, the line hangs where it hung');
      }
    }
  }
}

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall good');
