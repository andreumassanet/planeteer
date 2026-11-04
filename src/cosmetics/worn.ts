/**
 * Putting the cosmetics on a dressed person, and taking them off again.
 *
 * A hat hangs on the `Head` bone and a back piece on the `Chest` bone, each
 * one mesh whose matrix is its bone's inverse bind matrix: built in the rig's
 * frame (`fit.ts`), it sits at rest where it was built and moves as the bone
 * moves. Folding the head away (`Avatar.setHeadless`, first person) folds
 * the hat with it, since a bone's scale is its children's.
 *
 * The buffers are built once per piece, head (or wardrobe) and colour and
 * shared by everyone wearing the same; a shape nobody wears is kept a while
 * (`IDLE_SHAPES`) and then freed, which is safe because only this file holds
 * it. The material is the person's own (`castMaterial` on its ramp and pen),
 * so a hat is lit, shaded by the clouds and inked exactly as the head under
 * it. The cast's geometry is never touched.
 */
import * as THREE from 'three';
import { CLOTH, WARDROBE, coloursOf, type Appearance } from '../appearance.ts';
import { castMaterial, type Person } from '../cast.ts';
import { BACK_MODELS } from './back.ts';
import { BACKS, HATS, cosmeticAt } from './catalogue.ts';
import { backFitOf, headFitOf, takesHat } from './fit.ts';
import { HAT_MODELS } from './hats.ts';
import { piecesGeometry } from './shapes.ts';

/** How many built shapes nobody wears are kept before the oldest is freed. */
export const IDLE_SHAPES = 24;

interface Shape {
  geometry: THREE.BufferGeometry;
  users: number;
}

const shapes = new Map<string, Shape>();
/** Shapes nobody wears, oldest first. */
const idle: string[] = [];

function take(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let shape = shapes.get(key);
  if (shape === undefined) {
    shape = { geometry: build(), users: 0 };
    shapes.set(key, shape);
  }
  shape.users++;
  const waiting = idle.indexOf(key);
  if (waiting >= 0) idle.splice(waiting, 1);
  return shape.geometry;
}

function give(key: string): void {
  const shape = shapes.get(key);
  if (shape === undefined) return;
  shape.users = Math.max(0, shape.users - 1);
  if (shape.users > 0) return;
  idle.push(key);
  while (idle.length > IDLE_SHAPES) {
    const old = idle.shift()!;
    shapes.get(old)?.geometry.dispose();
    shapes.delete(old);
  }
}

/** Shapes built and in use, for the checks and the console. */
export function shapeStats(): { built: number; idle: number; worn: number } {
  let worn = 0;
  for (const shape of shapes.values()) worn += shape.users;
  return { built: shapes.size, idle: idle.length, worn };
}

const materials = new WeakMap<THREE.Material, THREE.MeshToonMaterial>();

/** The cosmetics' material for a person drawn in `body`: the cast's, on the same ramp and pen. */
export function cosmeticMaterial(body: THREE.Material): THREE.MeshToonMaterial {
  let material = materials.get(body);
  if (material === undefined) {
    const toon = body as THREE.MeshToonMaterial;
    const ink = (toon.userData.outlineParameters ?? { thickness: 0.003, color: [0, 0, 0] }) as { thickness: number; color: [number, number, number] };
    material = castMaterial(toon.gradientMap ?? new THREE.Texture(), ink);
    material.name = 'cosmetic';
    materials.set(body, material);
  }
  return material;
}

interface Worn {
  meshes: THREE.Mesh[];
  keys: string[];
  back: THREE.Mesh | null;
}

const worn = new WeakMap<Person, Worn>();

/** Hangs `geometry` on `bone` through the bone's inverse bind matrix. */
function hang(person: Person, boneName: string, geometry: THREE.BufferGeometry, name: string): THREE.Mesh | null {
  const skeleton = person.mesh.skeleton;
  const index = skeleton.bones.findIndex((bone) => bone.name === boneName);
  if (index < 0) return null;
  const mesh = new THREE.Mesh(geometry, cosmeticMaterial(person.mesh.material as THREE.Material));
  mesh.name = name;
  mesh.userData.cosmetic = true;
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(skeleton.boneInverses[index]!);
  if (!(mesh.matrix.determinant() > 0)) throw new Error(`cosmetics: ${boneName}'s bind matrix is reflected or collapsed`);
  mesh.matrixWorldNeedsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  skeleton.bones[index]!.add(mesh);
  return mesh;
}

/** The colour a hat is painted in: the look's, for a hat that takes one. */
const hatColour = (appearance: Appearance): number => CLOTH[appearance.hatColour] ?? CLOTH[0]!;

/**
 * Puts what `appearance` wears over its clothes onto `person`, who was dressed
 * as it (`wardrobeOf`): its hat, if its head takes one, and its back piece.
 * Whatever the person wore before is taken off first.
 */
export function wearCosmetics(person: Person, appearance: Appearance): void {
  shedCosmetics(person);
  const own: Worn = { meshes: [], keys: [], back: null };
  const hat = cosmeticAt('hat', appearance.hat);
  const headOutfit = WARDROBE[appearance.body].head[appearance.head]?.outfit;
  if (hat !== null && headOutfit !== undefined && takesHat(headOutfit)) {
    const model = HAT_MODELS[hat.id];
    if (model !== undefined) {
      const colour = hatColour(appearance);
      const key = `hat:${hat.id}:${appearance.body}:${headOutfit}:${model.colourable ? colour : 'own'}`;
      const fit = headFitOf(person, appearance.body, headOutfit);
      const geometry = take(key, () => piecesGeometry(model.build(fit, colour).parts));
      const mesh = hang(person, 'Head', geometry, `cosmetic:${hat.id}`);
      if (mesh === null) give(key);
      else {
        own.meshes.push(mesh);
        own.keys.push(key);
      }
    }
  }
  const back = cosmeticAt('back', appearance.back);
  const backModel = back === null ? undefined : BACK_MODELS[back.id];
  if (back !== null && backModel !== undefined) {
    const colours = coloursOf(appearance);
    const paint = { top: colours.top, bottom: colours.bottom, pack: colours.pack };
    const key = `back:${back.id}:${person.outfit}:${paint.top}:${paint.bottom}:${paint.pack}`;
    const fit = backFitOf(person);
    const geometry = take(key, () => piecesGeometry(backModel.build(fit, paint)));
    const mesh = hang(person, 'Chest', geometry, `cosmetic:${back.id}`);
    if (mesh === null) give(key);
    else {
      own.meshes.push(mesh);
      own.keys.push(key);
      own.back = mesh;
    }
  }
  if (own.meshes.length > 0) worn.set(person, own);
}

/** Takes off whatever `wearCosmetics` put on, before the person goes back to the cast. */
export function shedCosmetics(person: Person): void {
  const own = worn.get(person);
  if (own === undefined) return;
  worn.delete(person);
  for (const mesh of own.meshes) mesh.removeFromParent();
  for (const key of own.keys) give(key);
}

/**
 * Puts the back piece away while its wearer sits — a seat's back and a cab's
 * roof are where it would be — and out again when they stand. Cheap to call
 * every frame.
 */
export function stowCosmetics(person: Person, stowed: boolean): void {
  const back = worn.get(person)?.back;
  if (back !== null && back !== undefined) back.visible = !stowed;
}

/** The meshes `wearCosmetics` hung on `person`, for the checks and the stage's portraits. */
export function cosmeticMeshes(person: Person): readonly THREE.Mesh[] {
  return worn.get(person)?.meshes ?? [];
}

/** Whether every hat and back piece in the catalogue has a model. */
export const MODELLED = HATS.every((item) => HAT_MODELS[item.id] !== undefined) && BACKS.every((item) => BACK_MODELS[item.id] !== undefined);
