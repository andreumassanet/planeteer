/**
 * Headless assertions over the vehicles a player can take (`src/craft/`).
 *
 * Builds every craft in every variant, from the same baked kit file the world
 * loads, and holds each to `src/craft/contract.ts` and to the body that rides
 * it: the ids the fleet places exist; the declared `size` is the built box; it
 * stands on y = 0, or on its draft; every matrix is proper and every geometry
 * carries the ink's normal; the triangles are inside a budget; two builds of a
 * variant are the same bytes; every seat is over the craft and, where it is
 * shown, the hero's body fits on it — the hip on the seat surface, the trunk,
 * the lap and the shins clear of the model, the soles on a floor.
 *
 * And it re-measures the hero. The seats are built round `HERO` in
 * `src/craft/body.ts`, a table measured off the cast in the sit pose; a
 * measured table only stays true if something measures it again, so this
 * loads the cast from `public/models/cast/` and fails on a drift.
 *
 * `node scripts/check-craft.ts`, or `pnpm craft`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { registerModelsFromDisk } from './kit-node.ts';
import type { CraftModel } from '../src/craft/contract.ts';
import { HEADLIGHTS_OF } from '../src/craft/contract.ts';
import { AVATAR_HEIGHT } from '../src/stature.ts';

const PUBLIC = resolve(import.meta.dirname, '../public');
const H = AVATAR_HEIGHT;

let failures = 0;
const fail = (message: string): void => {
  failures++;
  console.log(`  FAIL  ${message}`);
};
const f = (value: number, digits = 2): string => value.toFixed(digits);

// kit-node supplies the globals GLTFLoader reaches for in Node, so everything
// that reaches the loader is imported after it.
await registerModelsFromDisk();
const { modelsFrom, rigFrom } = await import('../src/kit.ts');
const { CRAFT_IDS, craftFrom } = await import('../src/craft/index.ts');
const { horseMaterial } = await import('../src/craft/horse.ts');
const { AVATAR_HIP, HERO } = await import('../src/craft/body.ts');
const { reviewCraft } = await import('../src/craft/review.ts');
type CraftReview = import('../src/craft/review.ts').CraftReview;
const kit = await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin')));
const horseRig = await rigFrom(readFileSync(resolve(PUBLIC, 'models/fauna/horse.bin')), 'horse', horseMaterial());
if (!horseRig.clips.some((clip) => clip.name === 'Gallop')) fail("the horse's rig has no Gallop: re-bake it (`pnpm kit`)");
const craft = craftFrom(kit, horseRig);

/** Triangles a craft may spend, all its parts together. */
const BUDGET: Record<string, number> = {
  hatchback: 3000,
  van: 3000,
  jeep: 3000,
  pickup: 3000,
  tractor: 3000,
  bus: 3000,
  scooter: 1500,
  'tuk-tuk': 1500,
  bicycle: 2000,
  motorbike: 2000,
  launch: 3000,
  'jet-ski': 2000,
  sailboat: 2000,
  'light-plane': 6000,
  helicopter: 3000,
  balloon: 5000,
  horse: 3000,
  submarine: 2000,
};
/** How near a headlamp is to the drawn surface, in bodies: on the model, not in the air before it. */
const LAMP_ON = 0.02;
/** Seats a craft must have at least. */
const SEATS_AT_LEAST: Record<string, number> = {
  hatchback: 4, van: 2, launch: 4, 'light-plane': 4, balloon: 4,
  bus: 8, helicopter: 4, 'tuk-tuk': 3, motorbike: 2, 'jet-ski': 2, sailboat: 2, jeep: 2, pickup: 2, submarine: 2,
};

// --- the ids -------------------------------------------------------------

for (const id of CRAFT_IDS) if (!craft.has(id)) fail(`no craft '${id}', which the fleet places`);
console.log(`craft: ${[...craft.keys()].join(', ')}\n`);

// --- per craft -------------------------------------------------------------

const hashOf = (group: THREE.Group): string => {
  let h = 2166136261;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const name of ['position', 'color', 'outlineNormal']) {
      const array = mesh.geometry.getAttribute(name).array as Float32Array;
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 16777619);
    }
    h = Math.imul(h ^ Math.round(mesh.matrixWorld.elements.reduce((a, b) => a + b * 1000, 0)), 16777619);
  });
  return (h >>> 0).toString(16);
};

function checkCraft(model: CraftModel): void {
  const budget = BUDGET[model.id] ?? 6000;
  let worstTriangles = 0;
  let first: CraftReview | null = null;
  for (let variant = 0; variant < model.variants; variant++) {
    const group = model.build(variant);
    const where = `${model.id} #${variant}`;
    // The box, the frame, the matrices, the attributes and the seats: the
    // same review the sheet prints.
    const review = reviewCraft(model, variant, group);
    first ??= review;
    for (const problem of review.problems) fail(`${where}: ${problem}`);
    worstTriangles = Math.max(worstTriangles, review.triangles);
    if (review.triangles > budget) fail(`${where}: ${review.triangles} triangles against a budget of ${budget}`);

    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const normal = mesh.geometry.getAttribute('normal').array;
      for (let i = 0; i < normal.length; i++) {
        if (!Number.isFinite(normal[i]!)) {
          fail(`${where}: '${mesh.name}' has a non-finite normal`);
          break;
        }
      }
    });

    // The turning parts: each centred across the axis it turns about, and a
    // wheel with its bottom on the ground.
    for (const part of group.children.filter((child) => ['prop', 'rotor', 'wheel'].includes(child.name))) {
      const own = new THREE.Box3().setFromObject(part.children[0]!);
      const at = part.getWorldPosition(new THREE.Vector3());
      const m = own.getCenter(new THREE.Vector3()).sub(at);
      const across = part.name === 'wheel' ? Math.hypot(m.y, m.z) : part.name === 'prop' ? Math.hypot(m.x, m.y) : Math.hypot(m.x, m.z);
      if (across > 0.02 * H) fail(`${where}: a ${part.name} turns ${f(across)} off its own middle`);
      if (part.name === 'wheel' && model.medium !== 'water' && Math.abs(own.min.y) > 0.01 * H) {
        fail(`${where}: a wheel's bottom is at y ${f(own.min.y)}, not on the ground`);
      }
    }
    if (model.kind === 'plane' && !group.children.some((child) => child.name === 'prop')) fail(`${where}: a plane with no 'prop'`);

    // Determinism: the same variant twice is the same bytes.
    if (hashOf(group) !== hashOf(model.build(variant))) fail(`${where}: two builds differ`);
  }
  if (model.seats.length < (SEATS_AT_LEAST[model.id] ?? 1)) fail(`${model.id}: ${model.seats.length} seats, wants ${SEATS_AT_LEAST[model.id]}`);
  if (model.seats[0] === undefined) fail(`${model.id}: no driver's seat`);

  // The headlamps: as many as the kind lights, each on the model itself —
  // on the surface that is drawn, in the front of it, over the road — and
  // a pair either side of the middle.
  const lights = HEADLIGHTS_OF[model.kind];
  const lamps = model.lamps ?? [];
  if (lamps.length !== lights.count) fail(`${model.id}: ${lamps.length} headlamps, and a ${model.kind} lights ${lights.count}`);
  if (lamps.length > 0) {
    const drawn = model.build(0);
    drawn.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(drawn);
    const triangle = new THREE.Triangle();
    const closest = new THREE.Vector3();
    const point = new THREE.Vector3();
    for (const [x, y, z] of lamps) {
      // How far the lamp is from the drawn surface: the nearest point of any triangle.
      let nearest = Infinity;
      point.set(x, y, z);
      drawn.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const position = mesh.geometry.getAttribute('position');
        const index = mesh.geometry.index;
        const corners = index !== null ? index.count : position.count;
        const at = (c: number): number => (index !== null ? index.getX(c) : c);
        for (let c = 0; c + 2 < corners; c += 3) {
          triangle.a.fromBufferAttribute(position, at(c)).applyMatrix4(mesh.matrixWorld);
          triangle.b.fromBufferAttribute(position, at(c + 1)).applyMatrix4(mesh.matrixWorld);
          triangle.c.fromBufferAttribute(position, at(c + 2)).applyMatrix4(mesh.matrixWorld);
          nearest = Math.min(nearest, triangle.closestPointToPoint(point, closest).distanceTo(point));
        }
      });
      if (nearest > LAMP_ON * H) fail(`${model.id}: a headlamp at ${f(x)} ${f(y)} ${f(z)} is ${f(nearest)} off the model`);
      if (z < box.max.z - model.size[0] * 0.3) fail(`${model.id}: a headlamp at z ${f(z)} is not at the front (${f(box.max.z)})`);
      if (y <= 0 || y > box.max.y) fail(`${model.id}: a headlamp at y ${f(y)} is not over the road and under the roof`);
    }
    if (lamps.length === 2 && Math.sign(lamps[0]![0]) === Math.sign(lamps[1]![0])) fail(`${model.id}: both headlamps on one side`);
    if (lamps.length === 1 && Math.abs(lamps[0]![0]) > 0.05 * model.size[1]) fail(`${model.id}: its one headlamp is off the middle`);
  }

  // The variants are different looks.
  const looks = new Set<string>();
  for (let variant = 0; variant < model.variants; variant++) looks.add(hashOf(model.build(variant)));
  if (looks.size !== model.variants) fail(`${model.id}: ${model.variants} variants but ${looks.size} looks`);

  console.log(
    `  ${model.id.padEnd(12)} ${model.kind.padEnd(8)} ${model.medium.padEnd(6)} ` +
      `${f(model.size[0])} x ${f(model.size[1])} x ${f(model.size[2])}  (${f(model.size[0] / H)} x ${f(model.size[1] / H)} x ${f(model.size[2] / H)} bodies)` +
      `  draft ${f(model.draft)}  ${worstTriangles} triangles of ${budget}  ${model.variants} variants  ${model.seats.length} seats` +
      `  turning: ${first!.turning.join(', ') || 'none'}` +
      `  lamps: ${(model.lamps ?? []).map((lamp) => lamp.map(f).join(' ')).join(' | ') || 'none'}`,
  );
  for (const row of first!.seats) {
    const { seat } = row;
    console.log(
      `    seat ${row.index}  ${seat.pose.padEnd(5)} ${seat.shown ? 'shown ' : 'hidden'} at ${f(seat.x).padStart(6)} ${f(seat.y).padStart(6)} ${f(seat.z).padStart(6)}` +
        `   ${row.headroom === null ? 'open over the head' : `roof ${f(row.headroom)} over the crown`}` +
        `${row.under === null ? '' : `   under the ${seat.pose === 'stand' ? 'soles' : 'hip'} ${f(row.under)}`}` +
        `   inside the body: ${Object.entries(row.inside).map(([name, area]) => `${name} ${area.toFixed(3)}`).join(', ')}`,
    );
  }
}

for (const model of craft.values()) checkCraft(model);

// --- the road wheels ---------------------------------------------------------
//
// Only a wheel on the road turns. The kit's `suv` (the jeep) carries a spare on
// its tailgate on the same slots as its road wheels, and sorted into the car's
// four corners it was split across the two rear wheels, which then spun about
// a point between the axle and the tailgate and swung the spare through the
// body. So every craft's turning wheels are counted, each is held on the
// ground, round, with its axle across the craft, and the kit's own wheels are found
// again from the pack: every one that is not on the road is the suv's spare.
{
  /** The wheels a craft turns: the model's real count, and none for the pack's wheel-less bus. */
  const WHEELS: Record<string, number> = {
    hatchback: 4, van: 4, jeep: 4, pickup: 4, tractor: 4, bus: 0,
    bicycle: 2, motorbike: 2, scooter: 2, 'tuk-tuk': 3, 'light-plane': 3,
  };
  const { wheelsOf } = await import('../src/craft/cars.ts');
  for (const model of craft.values()) {
    const group = model.build(0);
    group.updateMatrixWorld(true);
    const wheels = group.children.filter((child) => child.name === 'wheel');
    const wants = WHEELS[model.id] ?? 0;
    if (wheels.length !== wants) fail(`${model.id}: ${wheels.length} turning wheels, wants ${wants}`);
    for (const wheel of wheels) {
      const own = new THREE.Box3().setFromObject(wheel);
      const size = own.getSize(new THREE.Vector3());
      if (own.min.y > 0.01 * H) fail(`${model.id}: a turning wheel ${f(own.min.y)} off the ground, a spare`);
      // Round in its own plane: a spare's triangles taken into it make it tall or long.
      if (Math.abs(size.y - size.z) > 0.1 * Math.max(size.y, size.z)) fail(`${model.id}: a turning wheel is ${f(size.y)} tall and ${f(size.z)} long, not one wheel`);
      if (!(size.x < Math.min(size.y, size.z))) fail(`${model.id}: a turning wheel's axle is not across the craft (${f(size.x)} x ${f(size.y)} x ${f(size.z)})`);
    }
  }
  let spares = 0;
  for (const model of kit) {
    const wheelSlot = model.slots.map((slot) => /^(Tyre|Hub)$/.test(slot));
    if (!wheelSlot.some(Boolean)) continue;
    const index = model.geometry.index;
    const { road, other } = wheelsOf(model, (t) => wheelSlot[model.slot[index !== null ? index.getX(t * 3) : t * 3]!]!);
    if (road.length !== 4) fail(`kit '${model.name}': ${road.length} road wheels, wants 4`);
    const wantsSpare = model.name === 'suv' ? 1 : 0;
    if (other.length !== wantsSpare) fail(`kit '${model.name}': ${other.length} wheels off the road, wants ${wantsSpare}`);
    spares += other.length;
  }
  console.log(`road wheels: every craft's counted, grounded, round and across; ${spares} spare in the kit, left in the body\n`);
}

// --- which way is ahead ---------------------------------------------------------
//
// Every craft is built facing +Z and driven along it, and nothing above can
// tell a model built backwards: the box, the seats and the wheels are the same
// either way round, and the bus drove in reverse with every other assertion
// passing. So each craft's front is found by a witness the build did not use.
// A baked car's, on the kit model it is made of: its headlamps ahead of the
// middle and its tail-lamps behind it, which the pack coloured and nobody here
// chose; the bus's grille and number plate (the pack's `Details`) and its
// bumpers, which the pack puts at the nose. A code-built craft's, on the craft
// itself: a rider's hands ahead of the hip, a propeller on the nose and a tail
// rotor on the tail, a hull narrowest at the bow, and a horse's head (the
// highest of it) ahead of its middle.

console.log('\nwhich way is ahead:');
{
  /** The craft made of a kit model, and the kit model. */
  const KIT_OF: Record<string, string> = { hatchback: 'hatchback-sports', van: 'van', jeep: 'suv', pickup: 'truck', tractor: 'tractor', bus: 'bus' };
  const kitByName = new Map(kit.map((model) => [model.name, model]));
  const colour = new THREE.Color();
  /** Mean z, about the middle, of every corner whose slot passes `test`; NaN if none does. */
  const meanZ = (name: string, test: (slot: string, srgb: THREE.Color) => boolean): number => {
    const model = kitByName.get(name)!;
    const position = model.geometry.getAttribute('position');
    const index = model.geometry.index;
    const middle = (model.box.min.z + model.box.max.z) / 2;
    const passes = model.slots.map((slot, i) => test(slot, colour.copy(model.defaults[i]!).convertLinearToSRGB()));
    let sum = 0;
    let count = 0;
    const corners = index !== null ? index.count : position.count;
    for (let c = 0; c < corners; c++) {
      const v = index !== null ? index.getX(c) : c;
      if (!passes[model.slot[v]!]) continue;
      sum += position.getZ(v) - middle;
      count++;
    }
    return count === 0 ? NaN : sum / count;
  };
  const lamp = (_: string, c: THREE.Color): boolean => c.r > 0.9 && c.g > 0.7 && c.b < 0.45;
  const tail = (_: string, c: THREE.Color): boolean => c.r > 0.8 && c.g < 0.45 && c.b < 0.4;
  /** Width of a built craft within a tenth of its length of each end: [bow, stern]. */
  const endWidths = (group: THREE.Object3D): [number, number] => {
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const band = (box.max.z - box.min.z) * 0.1;
    const bow = [Infinity, -Infinity];
    const stern = [Infinity, -Infinity];
    const p = new THREE.Vector3();
    group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        const end = p.z > box.max.z - band ? bow : p.z < box.min.z + band ? stern : null;
        if (end === null) continue;
        end[0] = Math.min(end[0]!, p.x);
        end[1] = Math.max(end[1]!, p.x);
      }
    });
    return [bow[1]! - bow[0]!, stern[1]! - stern[0]!];
  };
  for (const model of craft.values()) {
    const seat = model.seats[0]!;
    const said: string[] = [];
    if (Math.abs(seat.yaw) > 1e-6) fail(`${model.id}: the driver faces ${f(seat.yaw, 3)} rad off the bow`);
    const kitName = KIT_OF[model.id];
    if (kitName !== undefined && !kitByName.has(kitName)) fail(`${model.id}: no kit model '${kitName}' to find its front on`);
    else if (kitName === 'bus') {
      const grille = meanZ(kitName, (slot) => slot === 'Details');
      const bumpers = meanZ(kitName, (slot) => slot === 'Bumper');
      said.push(`grille ${f(grille)}, bumpers ${f(bumpers)} (pack units)`);
      if (!(grille > 0) || !(bumpers > 0)) fail(`${model.id}: its grille and bumpers are behind its middle, so it is built facing -Z and drives backwards`);
    } else if (kitName !== undefined) {
      const ahead = meanZ(kitName, lamp);
      const behind = meanZ(kitName, tail);
      said.push(`headlamps ${f(ahead)}${Number.isNaN(behind) ? '' : `, tail-lamps ${f(behind)}`} (pack units)`);
      if (!(ahead > 0)) fail(`${model.id}: its headlamps are behind its middle, so it is built facing -Z and drives backwards`);
      if (behind > 0) fail(`${model.id}: its tail-lamps are ahead of its middle`);
    } else if (seat.pose === 'ride' && model.kind !== 'horse') {
      said.push(`hands ${f(seat.grip![2])} ahead of the hip`);
      if (!(seat.grip![2] > 0)) fail(`${model.id}: the rider's hands are behind the hip, so the bars are at the tail`);
    }
    const group = model.build(0);
    group.updateMatrixWorld(true);
    if (model.kind === 'plane') {
      const z = group.getObjectByName('prop')?.getWorldPosition(new THREE.Vector3()).z ?? NaN;
      said.push(`propeller at z ${f(z)}`);
      if (!(z > 0)) fail(`${model.id}: the propeller is not on the nose`);
    }
    if (model.kind === 'helicopter') {
      const z = group.getObjectByName('tail')?.getWorldPosition(new THREE.Vector3()).z ?? NaN;
      said.push(`tail rotor at z ${f(z)}`);
      if (!(z < 0)) fail(`${model.id}: the tail rotor is not on the tail`);
    }
    if (model.medium === 'water') {
      const [bow, stern] = endWidths(group);
      said.push(`${f(bow)} across the bow, ${f(stern)} across the stern`);
      if (!(bow < stern)) fail(`${model.id}: the hull is no narrower at the bow than at the stern, so it may be built facing -Z`);
    }
    if (model.kind === 'horse') {
      let body: THREE.SkinnedMesh | null = null;
      group.traverse((object) => {
        if ((object as THREE.SkinnedMesh).isSkinnedMesh) body = object as THREE.SkinnedMesh;
      });
      const skinned = body as THREE.SkinnedMesh | null;
      if (skinned === null) fail(`${model.id}: no skinned body to find its head on`);
      else {
        skinned.skeleton.update();
        const p = new THREE.Vector3();
        let top = -Infinity;
        let headZ = NaN;
        for (let i = 0; i < skinned.geometry.getAttribute('position').count; i++) {
          skinned.getVertexPosition(i, p);
          p.applyMatrix4(skinned.matrixWorld);
          if (p.y > top) {
            top = p.y;
            headZ = p.z;
          }
        }
        said.push(`head at z ${f(headZ)}`);
        if (!(headZ > 0)) fail(`${model.id}: its head is behind its middle`);
      }
    }
    console.log(`  ${model.id.padEnd(12)} ${said.join('; ') || 'no front to find: it is round'}`);
  }
}

// --- the motion ------------------------------------------------------------------
//
// Every craft driven hard for a few seconds — flat out, full lock, a stop —
// through `craft/motion.ts`, then let go: every matrix under it stays proper,
// every inked mesh keeps its outline normal, the wheels stay on their axles,
// a car's body leans and pitches and comes back square, and the propeller
// winds down to still. The airstrip and the windsock are built on a flat
// ground and held to the same.

console.log('\nthe motion:');
{
  const { AT_REST, motionOf } = await import('../src/craft/motion.ts');
  const worst = { det: Infinity };
  const proper = (group: THREE.Object3D, label: string): void => {
    group.updateMatrixWorld(true);
    group.traverse((part) => {
      const det = part.matrixWorld.determinant();
      worst.det = Math.min(worst.det, det);
      if (!(det > 0)) fail(`${label}: '${part.name}' has a reflected or collapsed matrix under its motion (det ${f(det, 4)})`);
    });
  };
  for (const model of craft.values()) {
    const group = model.build(0);
    const motion = motionOf(group, model);
    if (motionOf(group, model) !== motion) fail(`${model.id}: a second ask made a second motion`);
    const wheels: [THREE.Object3D, THREE.Vector3][] = [];
    group.traverse((part) => {
      if (part.name === 'wheel') wheels.push([part, part.position.clone()]);
    });
    const sprung = group.getObjectByName('sprung');
    if (sprung === undefined) fail(`${model.id}: no sprung group`);
    const air = model.medium === 'air';
    let leaned = 0;
    let pitched = 0;
    const input = { ...AT_REST, engine: true, grounded: true };
    for (let t = 0; t < 6; t += 1 / 60) {
      // Up to speed, round a hard left, and a hard stop.
      input.speed = t < 3 ? Math.min(45, t * 30) : Math.max(0, 45 - (t - 3) * 90);
      input.turnRate = t > 1 && t < 3 ? 0.9 : 0;
      input.steering = t > 1 && t < 3 ? -1 : 0;
      input.grounded = !(air && t > 2 && t < 4);
      motion.update(1 / 60, input);
      if (sprung !== undefined) {
        leaned = Math.max(leaned, sprung.rotation.z);
        pitched = Math.max(pitched, Math.abs(sprung.rotation.x));
      }
      if (Math.round(t * 60) % 30 === 0) proper(group, model.id);
    }
    if (['car', 'van', 'bus', 'tractor', 'jeep', 'tuktuk'].includes(model.kind) && (leaned < 0.01 || pitched < 0.01)) {
      fail(`${model.id}: the body did not lean out of a hard turn or pitch on the brake (roll ${f(leaned, 3)}, pitch ${f(pitched, 3)})`);
    }
    for (const [wheel, at] of wheels) if (wheel.position.distanceTo(at) > 1e-9) fail(`${model.id}: a wheel moved off its axle`);
    for (let t = 0; t < 8; t += 1 / 60) motion.update(1 / 60, AT_REST);
    if (motion.settling) fail(`${model.id}: eight seconds after it was let go of it is still moving`);
    if (sprung !== undefined && (Math.abs(sprung.rotation.x) > 1e-3 || Math.abs(sprung.rotation.z) > 1e-3)) fail(`${model.id}: the body did not come back square`);
    proper(group, model.id);
    group.traverse((part) => {
      const mesh = part as THREE.Mesh;
      if (!mesh.isMesh) return;
      const ink = (mesh.material as THREE.Material).userData.outlineParameters as { visible?: boolean } | undefined;
      if (ink?.visible === false) return;
      if (mesh.geometry.getAttribute('outlineNormal') === undefined) fail(`${model.id}: '${mesh.name}' is inked and has no outlineNormal`);
    });
    // A moored launch rides the swell, and only a launch does.
    if (model.medium === 'water' && sprung !== undefined) {
      let heave = 0;
      for (let t = 0; t < 4; t += 1 / 60) {
        motion.update(1 / 60, { ...AT_REST, moored: true });
        heave = Math.max(heave, Math.abs(sprung.position.y));
      }
      if (heave < 0.05) fail(`${model.id}: a moored launch does not ride the swell (${f(heave, 3)})`);
      proper(group, model.id);
    }
    // What turns besides the wheels: a bicycle's crank while it is pedalled,
    // a helicopter's rotors while its engine runs, a horse's legs and back.
    let extra = '';
    if (model.gearing !== undefined) {
      const crank = group.getObjectByName('crank');
      const fresh = motionOf(model.build(0), model);
      for (let t = 0; t < 1; t += 1 / 60) fresh.update(1 / 60, { ...AT_REST, engine: true, speed: 20, throttle: 1 });
      const pedalled = fresh.phase;
      for (let t = 0; t < 1; t += 1 / 60) fresh.update(1 / 60, { ...AT_REST, engine: true, speed: 20, throttle: 0 });
      if (crank === undefined) fail(`${model.id}: geared, with no 'crank'`);
      if (!(pedalled > 0.5)) fail(`${model.id}: the crank did not turn under the pedals (${f(pedalled, 3)})`);
      if (Math.abs(fresh.phase - pedalled) > 1e-9) fail(`${model.id}: the crank turned while it coasted`);
      extra += `  crank ${f(pedalled, 2)} rad in a second at 20`;
    }
    if (model.kind === 'helicopter') {
      const fresh = model.build(0);
      const motion2 = motionOf(fresh, model);
      const rotor = fresh.getObjectByName('rotor');
      const tail = fresh.getObjectByName('tail');
      for (let t = 0; t < 3; t += 1 / 60) motion2.update(1 / 60, { ...AT_REST, engine: true, grounded: false });
      if (rotor === undefined || tail === undefined) fail(`${model.id}: no 'rotor' or no 'tail'`);
      else if (rotor.rotation.y === 0 || tail.rotation.x === 0) fail(`${model.id}: the rotors did not turn with the engine running`);
      proper(fresh, model.id);
      extra += '  rotors turn';
    }
    if (model.kind === 'horse') {
      const fresh = model.build(0);
      const motion2 = motionOf(fresh, model);
      const rig = fresh.getObjectByName('rig');
      let rose = 0;
      let fell = 0;
      for (let t = 0; t < 3; t += 1 / 60) {
        motion2.update(1 / 60, { ...AT_REST, engine: true, speed: 30, throttle: 1 });
        rose = Math.max(rose, motion2.lift);
        fell = Math.min(fell, motion2.lift);
      }
      if (rig === undefined) fail(`${model.id}: no 'rig'`);
      if (rose - fell < 0.02) fail(`${model.id}: the saddle does not ride the gallop (${f(rose - fell, 3)})`);
      proper(fresh, model.id);
      extra += `  saddle rides ${f(rose - fell, 2)} at a gallop`;
      // A leap: off the ground for 0.7 s at a gallop, then down. The pack's
      // clip lifts the whole horse, and the motion must take that back off
      // (the player's jump is the height), and give it back once down.
      if (rig !== undefined) {
        const jumps = rig.userData.jumps as Record<string, { feet: Float32Array }> | undefined;
        if (jumps?.Gallop_Jump === undefined || jumps.Jump_toIdle === undefined) fail(`${model.id}: the jumps were not measured off the rig`);
        let lowered = 0;
        for (let t = 0; t < 0.7; t += 1 / 60) {
          motion2.update(1 / 60, { ...AT_REST, engine: true, speed: 30, throttle: 1, grounded: false });
          lowered = Math.min(lowered, rig.position.y);
        }
        for (let t = 0; t < 3; t += 1 / 60) motion2.update(1 / 60, { ...AT_REST, engine: true, speed: 30, throttle: 1 });
        if (!(lowered < -0.1)) fail(`${model.id}: a leap does not take the clip's own rise off (${f(lowered, 3)})`);
        if (Math.abs(rig.position.y) > 1e-6) fail(`${model.id}: the rig is still ${f(rig.position.y, 3)} off its place after landing`);
        proper(fresh, model.id);
        extra += `, a leap lowers the rig ${f(-lowered, 2)} under the clip's rise`;
      }
      // Its withers at `WITHERS` of a person, and not the herds' giant.
      const { WITHERS } = await import('../src/craft/horse.ts');
      const { rigBack } = await import('../src/fauna/contract.ts');
      const still = model.build(0);
      still.updateMatrixWorld(true);
      const held = still.getObjectByName('rig');
      const withers = held === undefined ? 0 : held.scale.y * rigBack(horseRig);
      if (Math.abs(withers / H - WITHERS) > 0.02) fail(`${model.id}: its withers are ${f(withers / H)} bodies up, not ${WITHERS}`);
      // And the saddle on its back, not on its withers or its neck: a quarter
      // of the way from the forelegs to the hind legs at least, which the
      // withers over the forelegs are not, and no higher than the withers.
      const seat = model.seats[0]!;
      const legZ = (pattern: RegExp): number | null => {
        let z: number | null = null;
        still.traverse((object) => {
          if (z === null && (object as THREE.Bone).isBone && pattern.test(object.name)) z = object.getWorldPosition(new THREE.Vector3()).z;
        });
        return z;
      };
      const fore = legZ(/^Front(Upper)?Leg/);
      const hind = legZ(/^Back(Upper)?Leg/);
      if (fore === null || hind === null) fail(`${model.id}: no leg bones to find the back between`);
      else if (!(fore - seat.z > 0.25 * (fore - hind) && seat.z > hind)) fail(`${model.id}: the seat at z ${f(seat.z)} is on the withers, not the back, between the forelegs at ${f(fore)} and the hind legs at ${f(hind)}`);
      if (seat.y - 0.04 * H > withers + 0.01 * H) fail(`${model.id}: the saddle's back is ${f(seat.y - 0.04 * H)} up, over the withers at ${f(withers)}`);
      extra += `, its withers ${f(withers / H)} bodies up, the seat ${f(fore !== null ? fore - seat.z : NaN)} behind the forelegs`;
    }
    console.log(`  ${model.id.padEnd(12)} lean ${f(leaned, 3)}  pitch ${f(pitched, 3)}  wheels ${wheels.length}  at rest after it was let go${extra}`);
  }

  const { buildStrip, buildWindsock, STRIP_LENGTH } = await import('../src/craft/airstrip.ts');
  const site = { at: new THREE.Vector3(0.3, 0.8, 0.2).normalize(), forward: new THREE.Vector3() };
  site.forward.set(0, 1, 0).projectOnPlane(site.at).normalize();
  const strip = buildStrip(site, () => 16000, new THREE.Color(0.4, 0.5, 0.3));
  const position = strip.geometry.getAttribute('position');
  const normal = strip.geometry.getAttribute('normal');
  let down = 0;
  const n = new THREE.Vector3();
  for (let i = 0; i < normal.count; i++) if (n.fromBufferAttribute(normal, i).dot(site.at) <= 0) down++;
  if (down > 0) fail(`the airstrip has ${down} vertices facing the ground`);
  strip.geometry.computeBoundingSphere();
  const reach = strip.geometry.boundingSphere!.radius * 2;
  if (reach < STRIP_LENGTH) fail(`the airstrip is ${f(reach)} long, shorter than the ${STRIP_LENGTH} it stands for`);
  const sock = buildWindsock();
  const pivot = sock.getObjectByName('rotor');
  if (pivot === undefined) fail('the windsock has no pivot');
  for (let t = 0; t < 4; t += 0.25) {
    if (pivot !== undefined) pivot.rotation.set(0.6 * Math.sin(t), t * 2, 0);
    proper(sock, 'windsock');
  }
  console.log(`  airstrip     ${position.count / 3} triangles, ${f(reach, 0)} units end to end; windsock ${sock.children.length} parts`);
  console.log(`  the least determinant under any motion: ${f(worst.det, 4)}`);
}

// --- what stands still until it is taken ------------------------------------------
//
// A town's parked car, a rack's bicycle and a farm's tractor are merged into
// the buffer they stand in as the craft that takes their place
// (`craft/parked.ts`), off the scenery kit's registry; the fleet builds the one
// taken off its own copy of the kit, from the id alone. The two must be one
// vehicle to the eye: for many ids, in every region's paints, the colours
// merged still and the colours of the vehicle driven off are the same numbers.
// And the paint has to reach the build at all, which it did not until
// 2026-09-28 (`finish` passed the variant alone): two paints, two colourings.

console.log('\nwhat stands still until it is taken:');
{
  const { fleetVariant, paintFor, parkedArrays, parkedModel, countryVehicleId } = await import('../src/craft/parked.ts');
  const { PARKED_CRAFT, PARKED_SLOT } = await import('../src/craft/contract.ts');
  const { TRAFFIC_STYLES } = await import('../src/traffic/regions.ts');
  const { mergeMeshes } = await import('../src/merge.ts');
  const { PALETTE } = await import('../src/theme.ts');
  const palettes = Object.values(TRAFFIC_STYLES).map((style) => style.paint);
  const crafts = [...new Set(Object.values(PARKED_CRAFT))];
  /** The vehicle as the fleet builds it from an id: its own model, its variant and the paint the id decides. */
  const taken = (id: string, paint: number | undefined): Float32Array => {
    const model = craft.get(id.slice(0, id.indexOf(':')))!;
    return mergeMeshes(model.build(fleetVariant(id, model.variants), paint)).color;
  };
  const same = (a: Float32Array, b: Float32Array): boolean => a.length === b.length && a.every((value, i) => value === b[i]);
  let compared = 0;
  let differ = 0;
  let unpainted = 0;
  for (const name of crafts) {
    const still = parkedModel(name);
    if (still === null || !craft.has(name)) {
      fail(`${name}: no parked model, or no craft, to stand still`);
      continue;
    }
    for (let place = 0; place < 40; place++) {
      const id = `${name}:${place * 733 + 11}:${PARKED_SLOT + (place % 20)}`;
      const palette = palettes[place % palettes.length]!;
      const paint = name === 'bicycle' ? undefined : paintFor(id, palette);
      const merged = parkedArrays(still, fleetVariant(id, still.variants), paint, 0.8).color;
      compared++;
      if (!same(merged, taken(id, paint))) {
        differ++;
        if (differ <= 5) fail(`${id}: the one parked and the one taken are not the same colours`);
      }
    }
    // Two paints of the same look must be two colourings, or the paint is lost on the way.
    if (name !== 'bicycle') {
      const model = craft.get(name)!;
      const a = mergeMeshes(model.build(0, PALETTE.crimson)).color;
      const b = mergeMeshes(model.build(0, PALETTE.skyBlue)).color;
      if (same(a, b)) {
        unpainted++;
        fail(`${name}: built in two paints, the same colours: the paint does not reach the model`);
      }
    }
  }
  // A farm's tractor, named after its cell.
  const tractor = parkedModel('tractor')!;
  for (let n = 0; n < 60; n++) {
    const id = countryVehicleId('tractor', 17 + n * 4, 3 + n * 9, n % 3)!;
    const arrays = parkedArrays(tractor, fleetVariant(id, tractor.variants), undefined);
    const merged = arrays.color;
    // And the same size: it stood at 0.70 of the craft, and grew under whoever took it.
    if (n === 0) {
      const takenPositions = mergeMeshes(craft.get('tractor')!.build(fleetVariant(id, tractor.variants))).position;
      if (!same(arrays.position, takenPositions)) fail(`${id}: the farm's tractor and the one driven off are not the same size`);
    }
    compared++;
    if (!same(merged, taken(id, undefined))) {
      differ++;
      if (differ <= 5) fail(`${id}: the farm's tractor and the one driven off are not the same colours`);
    }
  }
  const ids = [countryVehicleId('tractor', 287, 575, 99), countryVehicleId('tractor', 0, 0, 0)];
  if (ids.some((id) => id === null || !/^[a-z-]{2,20}:\d{1,6}:\d{1,2}$/.test(id))) fail(`a farm's vehicle id the relay would refuse: ${ids.join(', ')}`);
  console.log(`  ${compared} ids of ${crafts.length + 1} kinds, parked and taken: ${differ} differ; ${unpainted} crafts deaf to their paint; ids ${ids.join(', ')}`);
}

// --- the hero, measured again -------------------------------------------------

console.log('\nthe hero the seats are built round, re-measured off the cast:');
{
  const g = globalThis as Record<string, unknown>;
  const realFetch = g.fetch;
  g.fetch = async (url: string) => {
    const bytes = readFileSync(resolve(PUBLIC, `.${String(url).replace(/^[^/]*\/\/[^/]*/, '')}`));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  try {
    const avatar = await import('../src/avatar.ts');
    await avatar.prepareAvatar();
    const hero = avatar.buildAvatar();
    const boxOf = (object: THREE.Object3D): THREE.Box3 => {
      object.updateMatrixWorld(true);
      // A skinned body's precise box reads its bone matrices, which only a
      // render or `skeleton.update()` refreshes.
      object.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update();
      });
      return new THREE.Box3().setFromObject(object, true);
    };
    for (let i = 0; i < 30; i++) hero.stride(0.05, 0, false);
    const stand = boxOf(hero.group);
    for (let i = 0; i < 60; i++) hero.sit(0.05);
    const sit = boxOf(hero.group);
    const hip = AVATAR_HIP;
    const measured: [string, number, number][] = [
      ['crown over the hip', sit.max.y - hip, HERO.crown],
      ['sole under the hip', hip - sit.min.y, HERO.sole],
      ['toe ahead of the hip', sit.max.z, HERO.toe],
      ['pack behind the hip', -sit.min.z, HERO.back],
      ['half-width seated', Math.max(-sit.min.x, sit.max.x), HERO.half],
      ['standing crown', stand.max.y, HERO.standing],
      ['standing depth', Math.max(-stand.min.z, stand.max.z), HERO.depth],
    ];
    for (const [name, now, table] of measured) {
      const off = Math.abs(now - table) / table;
      console.log(`  ${name.padEnd(22)} ${f(now)} measured, ${f(table)} in HERO (${f(off * 100, 1)}%)`);
      if (off > 0.05) fail(`HERO's ${name} is ${f(table)} and the cast now measures ${f(now)}: re-measure body.ts`);
    }

    // Out of an aircraft: face down and flat in the fall, and under the
    // canopy hanging upright with both hands on the toggles its lines end in.
    const { CHUTE_GRIP } = await import('../src/craft/parachute.ts');
    for (let i = 0; i < 60; i++) hero.skydive(0.05, 0, 0, CHUTE_GRIP);
    const falling = boxOf(hero.group);
    const flat = falling.max.y - falling.min.y;
    const long = falling.max.z - falling.min.z;
    console.log(`  falling                ${f(flat)} tall, ${f(long)} long`);
    if (!(flat < AVATAR_HEIGHT * 0.6 && long > AVATAR_HEIGHT * 0.6)) fail(`the fall's pose is not face down and flat: ${f(flat)} tall, ${f(long)} long`);
    for (let i = 0; i < 60; i++) hero.skydive(0.05, 1, 0, CHUTE_GRIP);
    hero.group.updateMatrixWorld(true);
    const wrist = new THREE.Vector3();
    const misses: number[] = [];
    for (const side of ['L', 'R'] as const) {
      let bone: THREE.Object3D | undefined;
      hero.group.traverse((o) => {
        if ((o as THREE.Bone).isBone && (o.name === `Wrist.${side}` || o.name === `Wrist${side}`)) bone = o;
      });
      if (bone === undefined) continue;
      hero.group.worldToLocal(bone.getWorldPosition(wrist));
      const grip = new THREE.Vector3(side === 'L' ? CHUTE_GRIP[0] : -CHUTE_GRIP[0], CHUTE_GRIP[1], CHUTE_GRIP[2]);
      misses.push(wrist.distanceTo(grip));
    }
    const hanging = boxOf(hero.group);
    console.log(`  under the canopy       wrists ${misses.map((m) => f(m)).join(' and ')} off the toggles, ${f(hanging.max.y - hanging.min.y)} tall`);
    if (misses.length !== 2 || misses.some((miss) => miss > AVATAR_HEIGHT * 0.06)) fail(`the hands are not on the canopy's toggles: ${misses.map((m) => f(m)).join(', ')} off`);

    // A right turn pulls the right toggle down to the chest, and its line
    // comes down with the hand: the line's end, stretched by `openCanopy`,
    // and the wrist the pull put there.
    const { CHUTE_PULL, buildParachute, openCanopy } = await import('../src/craft/parachute.ts');
    for (let i = 0; i < 30; i++) hero.skydive(0.05, 1, 1, CHUTE_GRIP, CHUTE_PULL, [0, 0]);
    hero.group.updateMatrixWorld(true);
    const pulledTo = new THREE.Vector3(-CHUTE_GRIP[0], CHUTE_GRIP[1] - CHUTE_PULL, CHUTE_GRIP[2] + CHUTE_PULL * 0.25);
    let rightWrist: THREE.Object3D | undefined;
    hero.group.traverse((o) => {
      if ((o as THREE.Bone).isBone && (o.name === 'Wrist.R' || o.name === 'WristR')) rightWrist = o;
    });
    const handMiss = rightWrist === undefined ? Infinity : hero.group.worldToLocal(rightWrist.getWorldPosition(wrist)).distanceTo(pulledTo);
    const canopy = buildParachute();
    openCanopy(canopy, 10, 0, 1, 0);
    canopy.updateMatrixWorld(true);
    // Each line laid down its pivot's -Y, its rest length long: its end, in the player's frame.
    const toggles = (canopy.children[0]?.userData.toggles ?? []) as { pivot: THREE.Object3D; length: number }[];
    const lineEnds = toggles.map((toggle) => toggle.pivot.localToWorld(new THREE.Vector3(0, -toggle.length, 0)));
    const lineMiss = Math.min(...lineEnds.map((end) => end.distanceTo(pulledTo)));
    console.log(`  a toggle pulled         the wrist ${f(handMiss)} and the line's end ${f(lineMiss)} off the pulled grip`);
    if (handMiss > AVATAR_HEIGHT * 0.06) fail(`a right turn does not pull the right hand down to its toggle: ${f(handMiss)} off`);
    if (lineEnds.length !== 2 || lineMiss > AVATAR_HEIGHT * 0.04) fail(`the steering line does not follow the hand down: ${f(lineMiss)} off`);

    // Astride: a scooter is ridden sitting up, and every saddle's lean and
    // reach comes off the body with it. The lean is the line from the hips to
    // the neck against the vertical; a body that kept the pose stood with its
    // arms up at bars no longer there, and a lean laid on again each frame
    // wound a scooter's rider flat over its bars.
    const boneOf = (name: string): THREE.Object3D | undefined => {
      let found: THREE.Object3D | undefined;
      hero.group.traverse((o) => {
        if ((o as THREE.Bone).isBone && (o.name === name || o.name === name.replace('.', ''))) found = o;
      });
      return found;
    };
    const at = (name: string): THREE.Vector3 => {
      hero.group.updateMatrixWorld(true);
      return hero.group.worldToLocal(boneOf(name)!.getWorldPosition(new THREE.Vector3()));
    };
    const leanOf = (): number => {
      const spine = at('Neck').sub(at('Hips'));
      return Math.atan2(spine.z, spine.y);
    };
    const DEG = 180 / Math.PI;
    for (let i = 0; i < 30; i++) hero.stride(0.05, 0, false);
    const standingWrists = ['Wrist.L', 'Wrist.R'].map(at);
    const standingLean = leanOf();
    const UPRIGHT: Record<string, number> = { scooter: 18 / DEG };
    for (const id of ['scooter', 'bicycle', 'motorbike', 'tuk-tuk', 'jet-ski', 'horse']) {
      const seat = craft.get(id)?.seats.find((s) => s.pose === 'ride');
      if (seat === undefined) continue;
      const leans: number[] = [];
      for (let i = 0; i < 90; i++) {
        hero.ride(0.05, seat, i * 0.3);
        if (i % 30 === 29) leans.push(leanOf());
      }
      const wound = Math.max(...leans) - Math.min(...leans);
      const lean = leans[leans.length - 1]!;
      hero.stride(0.05, 0, false);
      const left = Math.max(...['Wrist.L', 'Wrist.R'].map((name, i) => at(name).distanceTo(standingWrists[i]!)));
      const after = Math.abs(leanOf() - standingLean);
      console.log(`  astride ${id.padEnd(10)} lean ${f(lean * DEG, 1)} deg, ${f(wound * DEG, 2)} wound over 90 frames; off, the wrists ${f(left)} from standing, the spine ${f(after * DEG, 1)} deg`);
      if (wound > 0.5 / DEG) fail(`${id}: the rider's lean changes frame to frame (${f(wound * DEG, 1)} deg): it is laid on again over itself`);
      if (UPRIGHT[id] !== undefined && lean > UPRIGHT[id]) fail(`${id}: the rider leans ${f(lean * DEG, 1)} deg forward, not sitting up (at most ${f(UPRIGHT[id] * DEG, 0)})`);
      if (left > AVATAR_HEIGHT * 0.02 || after > 1 / DEG) fail(`${id}: getting off kept the seat's pose: the wrists ${f(left)} from standing, the spine ${f(after * DEG, 1)} deg`);
    }
  } catch (error) {
    fail(`the cast did not load, so HERO was not re-measured: ${(error as Error).message}`);
  } finally {
    g.fetch = realFetch;
  }
}

console.log(failures === 0 ? '\ncraft: all good' : `\ncraft: ${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures === 0 ? 0 : 1);
