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
const { modelsFrom } = await import('../src/kit.ts');
const { CRAFT_IDS, craftFrom } = await import('../src/craft/index.ts');
const { AVATAR_HIP, HERO } = await import('../src/craft/body.ts');
const { reviewCraft } = await import('../src/craft/review.ts');
type CraftReview = import('../src/craft/review.ts').CraftReview;
const kit = await modelsFrom(readFileSync(resolve(PUBLIC, 'models/traffic/kit.bin')));
const craft = craftFrom(kit);

/** Triangles a craft may spend, all its parts together. */
const BUDGET: Record<string, number> = {
  hatchback: 3000,
  van: 3000,
  launch: 3000,
  'light-plane': 6000,
  balloon: 5000,
};
/** Seats a craft must have at least. */
const SEATS_AT_LEAST: Record<string, number> = { hatchback: 4, van: 2, launch: 4, 'light-plane': 4, balloon: 4 };

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
        `${row.under === null ? '' : `   under the ${seat.pose === 'sit' ? 'hip' : 'soles'} ${f(row.under)}`}` +
        `   inside the body: ${Object.entries(row.inside).map(([name, area]) => `${name} ${area.toFixed(3)}`).join(', ')}`,
    );
  }
}

for (const model of craft.values()) checkCraft(model);

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
