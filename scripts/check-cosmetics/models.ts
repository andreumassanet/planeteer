/** Every hat on every head that takes one and every back piece on every back: built, budgeted, seated, following, folding. */
import * as THREE from 'three';
import { CLOTH, DEFAULT_APPEARANCE, WARDROBE, coloursOf, wardrobeOf, type Appearance } from '../../src/appearance.ts';
import { paintWith, type Cast, type Person } from '../../src/cast.ts';
import { BY_SLOT, HATLESS_HEADS, takesHat } from '../../src/cosmetics.ts';
import { headFitOf, backFitOf } from '../../src/cosmetics/fit.ts';
import { HAT_MODELS } from '../../src/cosmetics/hats.ts';
import { piecesGeometry } from '../../src/cosmetics/shapes.ts';
import { cosmeticMeshes, shapeStats, shedCosmetics, stowCosmetics, wearCosmetics } from '../../src/cosmetics/worn.ts';
import { AVATAR_HEIGHT } from '../../src/stature.ts';
import { PALETTE } from '../../src/theme.ts';
import { castFromDisk, f3, fail } from './setup.ts';

/** The most a hat and a back piece may be, triangles. */
export const HAT_BUDGET = 400;
export const BACK_BUDGET = 480;

const cast: Cast = await castFromDisk();
const make = (look: Appearance): Person => {
  const person = cast.make(wardrobeOf(look), paintWith(coloursOf(look)), AVATAR_HEIGHT);
  person.mixer.stopAllAction();
  person.mesh.skeleton.pose();
  person.root.updateMatrixWorld(true);
  wearCosmetics(person, look);
  return person;
};
const drop = (person: Person): void => {
  shedCosmetics(person);
  cast.release(person);
};
const triangles = (mesh: THREE.Mesh): number => mesh.geometry.getAttribute('position').count / 3;

function finite(mesh: THREE.Mesh, what: string): void {
  for (const name of ['position', 'normal', 'color', 'outlineNormal']) {
    const attribute = mesh.geometry.getAttribute(name);
    if (attribute === undefined) {
      fail(`${what}: no ${name}`);
      continue;
    }
    for (const value of attribute.array as Float32Array) {
      if (!Number.isFinite(value)) {
        fail(`${what}: a ${name} that is not a number`);
        break;
      }
    }
  }
  if (mesh.geometry.getAttribute('atlasRole') === undefined) fail(`${what}: no finish (atlasRole)`);
  const ink = new THREE.Color(PALETTE.ink);
  const color = mesh.geometry.getAttribute('color');
  for (let i = 0; i < color.count; i++) {
    if (Math.abs(color.getX(i) - ink.r) + Math.abs(color.getY(i) - ink.g) + Math.abs(color.getZ(i) - ink.b) < 0.02) {
      fail(`${what}: painted the pen's ink, which reads as a line`);
      break;
    }
  }
}

/** The head's own points round height `y`, as the half-widths of its section about `cz`. */
function sectionAt(points: Float32Array, y: number, cz: number): { rx: number; rz: number } | null {
  let rx = 0;
  let rz = 0;
  let n = 0;
  for (let i = 0; i < points.length; i += 3) {
    if (Math.abs(points[i + 1]! - y) > 0.012) continue;
    rx = Math.max(rx, Math.abs(points[i]!));
    rz = Math.max(rz, Math.abs(points[i + 2]! - cz));
    n++;
  }
  return n < 6 ? null : { rx, rz };
}

/** Every vertex of the head under the hat, the face included, in the rig's frame. */
function headPoints(person: Person): Float32Array {
  const geometry = person.mesh.geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.getAttribute('skinIndex');
  const weight = geometry.getAttribute('skinWeight');
  const head = person.mesh.skeleton.bones.findIndex((bone) => bone.name === 'Head');
  const out: number[] = [];
  for (let v = 0; v < position.count; v++) {
    let best = -1;
    let bone = -1;
    for (let k = 0; k < 4; k++) if (weight.getComponent(v, k) > best) [best, bone] = [weight.getComponent(v, k), index.getComponent(v, k)];
    if (bone === head) out.push(position.getX(v), position.getY(v), position.getZ(v));
  }
  return Float32Array.from(out);
}

const ray = new THREE.Raycaster();
const DIRECTIONS = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];

console.log('\nthe frame cosmetics are built in:');
for (const body of ['man', 'woman'] as const) {
  const person = make({ ...DEFAULT_APPEARANCE, body });
  if (!person.mesh.bindMatrix.equals(new THREE.Matrix4())) fail(`${body}: the cast's bind matrix is not the identity, so its vertices are not in the rig's frame`);
  for (const name of ['Head', 'Chest', 'Neck']) {
    const i = person.mesh.skeleton.bones.findIndex((bone) => bone.name === name);
    if (i < 0) fail(`${body}: no ${name} bone`);
    else if (!(person.mesh.skeleton.boneInverses[i]!.determinant() > 0)) fail(`${body}: ${name}'s inverse bind matrix is reflected`);
  }
  drop(person);
}
console.log('  the bind matrix is the identity on both bodies, and the bones hats and packs hang from are proper');

console.log('\nevery hat on every head:');
{
  let built = 0;
  let worst = 0;
  let lowest = Infinity;
  let deepest = 0;
  let uncovered = 0;
  for (const body of ['man', 'woman'] as const) {
    WARDROBE[body].head.forEach((choice, head) => {
      for (const hat of BY_SLOT.hat) {
        const look: Appearance = { ...DEFAULT_APPEARANCE, body, head, hat: hat.index, hatColour: (hat.index * 5) % CLOTH.length };
        const person = make(look);
        const what = `${body} '${choice.label}' in ${hat.name}`;
        const meshes = cosmeticMeshes(person);
        if (!takesHat(choice.outfit)) {
          if (meshes.length > 0) fail(`${what}: a head that takes no hat wears one`);
          drop(person);
          continue;
        }
        const mesh = meshes.find((m) => m.name === `cosmetic:${hat.id}`);
        if (mesh === undefined) {
          fail(`${what}: not worn`);
          drop(person);
          continue;
        }
        built++;
        if (mesh.parent?.name !== 'Head') fail(`${what}: hung on ${mesh.parent?.name}, not the head`);
        worst = Math.max(worst, triangles(mesh));
        if (triangles(mesh) > HAT_BUDGET) fail(`${what}: ${triangles(mesh)} triangles, over ${HAT_BUDGET}`);
        finite(mesh, what);
        person.root.updateMatrixWorld(true);
        if (!(mesh.matrixWorld.determinant() > 0)) fail(`${what}: drawn through a reflected matrix`);
        const fit = headFitOf(person, body, choice.outfit);
        const points = headPoints(person);
        const p = mesh.geometry.getAttribute('position');
        // It sits where it was built: at rest the hat's frame is the rig's.
        const at = new THREE.Vector3().fromBufferAttribute(p, 0).applyMatrix4(mesh.matrixWorld);
        const want = new THREE.Vector3().fromBufferAttribute(p, 0).applyMatrix4(person.root.matrixWorld);
        if (at.distanceTo(want) > 1e-4) fail(`${what}: at rest it is ${f3(at.distanceTo(want))} from where it was built`);
        // Not into the face: nothing of it under the brow inside the head's section, nor over the eyes.
        for (let v = 0; v < p.count; v++) {
          const x = p.getX(v);
          const y = p.getY(v);
          const z = p.getZ(v);
          if (Math.abs(x) < 0.07 && z > fit.eyeFront - 0.01) lowest = Math.min(lowest, y - fit.eyeTop);
          if (Math.abs(x) < 0.07 && z > fit.eyeFront - 0.01 && y < fit.eyeTop - 0.02) {
            fail(`${what}: comes ${f3(fit.eyeTop - y)} down over the eyes`);
            break;
          }
          if (y > fit.eyeTop + 0.01) continue;
          const section = sectionAt(points, y, fit.centreZ);
          if (section === null) continue;
          const inside = Math.hypot(x / section.rx, (z - fit.centreZ) / section.rz);
          if (inside < 0.85) {
            deepest = Math.max(deepest, 1 - inside);
            fail(`${what}: sinks into the face at ${f3(y)} (${f3(inside)} of the way out)`);
            break;
          }
        }
        // A hat that covers the crown has every point of the hair over its band inside it.
        const model = HAT_MODELS[hat.id]!;
        if (model.covers) {
          const own = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
          const band = model.build(fit, CLOTH[0]!).band;
          let out = 0;
          const from = new THREE.Vector3();
          for (let i = 0; i < fit.cloud.length; i += 9) {
            if (fit.cloud[i + 1]! < band + 0.004) continue;
            from.fromArray(fit.cloud, i);
            for (const direction of DIRECTIONS) {
              ray.set(from, direction);
              if (ray.intersectObject(own, false).length === 0) {
                out++;
                break;
              }
            }
          }
          uncovered += out;
          if (out > 0) fail(`${what}: ${out} points of the hair show through it`);
        }
        drop(person);
      }
    });
  }
  console.log(`  ${built} hats fitted, at most ${worst} triangles (budget ${HAT_BUDGET}); the lowest brim in front of the eyes ${f3(lowest)} from their top; ${uncovered} points of hair through a crown; deepest into a face ${f3(deepest)}`);
  const hatless = [...HATLESS_HEADS].map((outfit) => (['man', 'woman'] as const).map((body) => WARDROBE[body].head.find((choice) => choice.outfit === outfit)?.label).find((label) => label !== undefined));
  const expected = ['Mohawk', 'Cowboy hat', 'Hard hat', 'Hood'];
  for (const label of hatless) if (!expected.includes(label ?? '')) fail(`${label ?? 'a head nobody wears'} refuses hats`);
  console.log(`  no hat on: ${hatless.join(', ')}`);
}

console.log('\na hat follows its head, and folds with it:');
{
  const look: Appearance = { ...DEFAULT_APPEARANCE, hat: BY_SLOT.hat.find((item) => item.id === 'hat-top')!.index };
  const person = make(look);
  const mesh = cosmeticMeshes(person)[0]!;
  const geometry = person.mesh.geometry;
  const weight = geometry.getAttribute('skinWeight');
  const index = geometry.getAttribute('skinIndex');
  const headBone = person.mesh.skeleton.bones.findIndex((bone) => bone.name === 'Head');
  // A point of the head moved by the head alone.
  let rigid = -1;
  for (let v = 0; v < weight.count && rigid < 0; v++) {
    for (let k = 0; k < 4; k++) if (index.getComponent(v, k) === headBone && weight.getComponent(v, k) > 0.999) rigid = v;
  }
  const hatPoint = new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), 0);
  const gap = (): number => {
    person.root.updateMatrixWorld(true);
    person.mesh.skeleton.update();
    const head = person.mesh.getVertexPosition(rigid, new THREE.Vector3()).applyMatrix4(person.mesh.matrixWorld);
    return head.distanceTo(hatPoint.clone().applyMatrix4(mesh.matrixWorld));
  };
  const rest = gap();
  let drift = 0;
  for (const clip of ['Walk', 'Run', 'Sit', 'Dance', 'Swim'] as const) {
    const action = person.actions.get(clip);
    if (action === undefined) continue;
    person.mixer.stopAllAction();
    action.reset().play();
    for (let i = 0; i < 6; i++) {
      action.time = (i / 6) * action.getClip().duration;
      person.mixer.update(0);
      drift = Math.max(drift, Math.abs(gap() - rest));
    }
  }
  if (rigid < 0) fail('no point of the head moves with it alone');
  else if (drift > 1e-3) fail(`through the clips the hat drifts ${f3(drift)} off the head`);
  // First person folds the neck to a point (`foldHead` in `avatar/build.ts`): the hat goes with it.
  person.bones.get('Neck')!.scale.setScalar(1e-3);
  person.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const folded = box.getSize(new THREE.Vector3()).length();
  if (folded > 0.01) fail(`with the head folded away the hat is still ${f3(folded)} across`);
  person.bones.get('Neck')!.scale.setScalar(1);
  console.log(`  through walk, run, sit, dance and swim it keeps to the head within ${f3(drift)}; folded with the head it is ${folded.toExponential(1)} across`);
  drop(person);
}

console.log('\nevery back piece on every back:');
{
  let built = 0;
  let worst = 0;
  let intrusion = 0;
  for (const body of ['man', 'woman'] as const) {
    WARDROBE[body].top.forEach((top, t) => {
      for (const pack of [false, true]) {
        for (const item of BY_SLOT.back) {
          const look: Appearance = { ...DEFAULT_APPEARANCE, body, top: t, pack, back: item.index };
          const person = make(look);
          const what = `${body} in ${top.label}${pack ? ' with the rucksack' : ''}: ${item.name}`;
          const mesh = cosmeticMeshes(person).find((m) => m.name === `cosmetic:${item.id}`);
          if (mesh === undefined) {
            fail(`${what}: not worn`);
            drop(person);
            continue;
          }
          built++;
          if (mesh.parent?.name !== 'Chest') fail(`${what}: hung on ${mesh.parent?.name}, not the chest`);
          worst = Math.max(worst, triangles(mesh));
          if (triangles(mesh) > BACK_BUDGET) fail(`${what}: ${triangles(mesh)} triangles, over ${BACK_BUDGET}`);
          finite(mesh, what);
          // Behind the body wherever the body is behind: the body's furthest back by cells of the back's plane.
          const cells = new Map<string, number>();
          const cell = (x: number, y: number): string => `${Math.floor(x / 0.03)},${Math.floor(y / 0.03)}`;
          const position = person.mesh.geometry.getAttribute('position');
          for (let v = 0; v < position.count; v++) {
            const key = cell(position.getX(v), position.getY(v));
            cells.set(key, Math.min(cells.get(key) ?? Infinity, position.getZ(v)));
          }
          const p = mesh.geometry.getAttribute('position');
          let into = 0;
          for (let v = 0; v < p.count; v++) {
            const back = cells.get(cell(p.getX(v), p.getY(v)));
            if (back !== undefined && p.getZ(v) > back) into = Math.max(into, p.getZ(v) - back);
          }
          intrusion = Math.max(intrusion, into);
          if (into > 0.03) fail(`${what}: ${f3(into)} into the body`);
          // Put away in a seat, out again on foot; the hat is not.
          stowCosmetics(person, true);
          if (mesh.visible) fail(`${what}: still out in a seat`);
          stowCosmetics(person, false);
          if (!mesh.visible) fail(`${what}: not out again on foot`);
          drop(person);
        }
      }
    });
  }
  const fit = backFitOf(make({ ...DEFAULT_APPEARANCE }));
  console.log(`  ${built} back pieces on every top, with and without the rucksack, at most ${worst} triangles (budget ${BACK_BUDGET}); at worst ${f3(intrusion)} into the body; the default's back at ${f3(fit.backZ)}`);
}

console.log('\nthe shapes, shared and let go:');
{
  const before = shapeStats();
  const people = Array.from({ length: 12 }, (_, i) => make({ ...DEFAULT_APPEARANCE, hat: 1 + (i % 3), back: 1 + (i % 2) }));
  const during = shapeStats();
  for (const person of people) drop(person);
  const after = shapeStats();
  if (after.worn !== 0) fail(`${after.worn} shapes still worn after everyone took them off`);
  if (during.built - before.built > 6) fail(`twelve people in three hats and two packs built ${during.built - before.built} shapes`);
  // A built piece is the same piece built again.
  const person = make({ ...DEFAULT_APPEARANCE });
  const fit = headFitOf(person, 'man', WARDROBE.man.head[0]!.outfit);
  for (const hat of BY_SLOT.hat) {
    const a = piecesGeometry(HAT_MODELS[hat.id]!.build(fit, CLOTH[3]!).parts).getAttribute('position').array;
    const b = piecesGeometry(HAT_MODELS[hat.id]!.build(fit, CLOTH[3]!).parts).getAttribute('position').array;
    if (a.length !== b.length || a.some((value, i) => value !== b[i])) fail(`${hat.name} is not the same twice`);
  }
  drop(person);
  console.log(`  twelve people shared ${during.built - before.built} shapes and gave every one back; every hat built twice is the same`);
}
