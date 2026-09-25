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
};
/** Seats a craft must have at least. */
const SEATS_AT_LEAST: Record<string, number> = {
  hatchback: 4, van: 2, launch: 4, 'light-plane': 4, balloon: 4,
  bus: 8, helicopter: 4, 'tuk-tuk': 3, motorbike: 2, 'jet-ski': 2, sailboat: 2, jeep: 2, pickup: 2,
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

  // The variants are different looks.
  const looks = new Set<string>();
  for (let variant = 0; variant < model.variants; variant++) looks.add(hashOf(model.build(variant)));
  if (looks.size !== model.variants) fail(`${model.id}: ${model.variants} variants but ${looks.size} looks`);

  console.log(
    `  ${model.id.padEnd(12)} ${model.kind.padEnd(8)} ${model.medium.padEnd(6)} ` +
      `${f(model.size[0])} x ${f(model.size[1])} x ${f(model.size[2])}  (${f(model.size[0] / H)} x ${f(model.size[1] / H)} x ${f(model.size[2] / H)} bodies)` +
      `  draft ${f(model.draft)}  ${worstTriangles} triangles of ${budget}  ${model.variants} variants  ${model.seats.length} seats` +
      `  turning: ${first!.turning.join(', ') || 'none'}`,
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
  } catch (error) {
    fail(`the cast did not load, so HERO was not re-measured: ${(error as Error).message}`);
  } finally {
    g.fetch = realFetch;
  }
}

console.log(failures === 0 ? '\ncraft: all good' : `\ncraft: ${failures} failure${failures === 1 ? '' : 's'}`);
process.exit(failures === 0 ? 0 : 1);
