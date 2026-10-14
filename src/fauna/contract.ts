/**
 * The fauna kit: what a land animal is, how big it is, and how it walks.
 *
 * Shaped like `src/traffic/`: a contract, a region table, a registry over
 * `parts/` and a headless check. Like the crowd in `scenery/people.ts`, every
 * species is one body plan with different numbers: the part files are
 * proportion tables and `body.ts` builds the quadruped.
 */
import * as THREE from 'three';
import {
  AVATAR_HEIGHT,
  SCENERY_SCALE,
  createSceneryContext,
} from '../scenery/contract.ts';
import { NOMINAL_HEIGHT, PERSON_METRES } from '../stature.ts';
import type { RegionStyle, SceneryContext } from '../scenery/contract.ts';
import { rngFrom } from '../scenery/random.ts';
import { makeRigged, onPalette, toned } from '../models.ts';
import type { Paint, Rig } from '../models.ts';
import type { Rng, Weighted } from '../scenery/random.ts';
import { swingLift } from '../avatar.ts';
import type { GaitName } from './gait.ts';

export { PERSON_METRES };

/**
 * Units per metre for everything in this kit: an animal takes the person's
 * scale (`SCENERY_SCALE` times `STATURE`). Derived from `AVATAR_HEIGHT`, so
 * changing it moves every animal too.
 */
export const FAUNA_SCALE = AVATAR_HEIGHT / PERSON_METRES;

/**
 * Factor from the scale the species' sizes and the kit's caps were measured at
 * (6.8 units for a 1.8 m person) to the world's.
 */
export const FAUNA_RESCALE = FAUNA_SCALE / (NOMINAL_HEIGHT / 1.8);
/** A declared `[length, width, height]` at the scale it was measured at, at the world's. */
export const atFaunaScale = (size: readonly [number, number, number]): [number, number, number] =>
  [size[0] * FAUNA_RESCALE, size[1] * FAUNA_RESCALE, size[2] * FAUNA_RESCALE];

/**
 * Metres to world units. Parts author in metres so proportions can be checked
 * against real animals (a cow is 1.4 m at the withers).
 */
export const m = (metres: number): number => metres * FAUNA_SCALE;

export { AVATAR_HEIGHT, SCENERY_SCALE };

export { GAITS, LEG_ORDER, footDrop, foldLifts, legAt, lowerAngle, solveLeg } from './gait.ts';
export type { Fold, GaitName, Leg, LegPhase } from './gait.ts';

/**
 * How big an animal may come out, and how many of it stand together. The caps
 * catch a model that has quietly grown; an animal gets a budget of the order
 * of a crowd person's.
 */
export interface KindSpec {
  /** Longest a built variant may come out, nose to tail. */
  length: number;
  minLength: number;
  /** Widest, across the shoulders. */
  width: number;
  /** Tallest, which for most of these is the head and not the withers. */
  height: number;
  minHeight: number;
  triangles: number;
  meshes: number;
  /** Cap on distinct palette colours; a colour is a draw call. */
  colors: number;
  /** How many stand in one group, `[min, max]` inclusive. */
  group: readonly [number, number];
}

/**
 * Bands by how many stand together: gregarious `small` animals (sheep, llamas,
 * reindeer) in fours to nines, `large` ones (cattle, horses, camels) in threes
 * to sixes.
 */
export type AnimalKind = 'small' | 'large';

export const KINDS: Record<AnimalKind, KindSpec> = {
  small: { length: 9.5 * FAUNA_RESCALE, minLength: 4.0 * FAUNA_RESCALE, width: 2.8 * FAUNA_RESCALE, height: 7.5 * FAUNA_RESCALE, minHeight: 2.2 * FAUNA_RESCALE, triangles: 320, meshes: 24, colors: 4, group: [4, 9] },
  large: { length: 14.0 * FAUNA_RESCALE, minLength: 9.0 * FAUNA_RESCALE, width: 4.0 * FAUNA_RESCALE, height: 12.5 * FAUNA_RESCALE, minHeight: 4.2 * FAUNA_RESCALE, triangles: 340, meshes: 28, colors: 5, group: [3, 6] },
};

/**
 * Variants of one animal a region builds. Animals vary in structure (height,
 * barrel, horns, pose), not just colour, and a merged mesh cannot be scaled
 * per instance, so the variation is decided at build time.
 */
export const VARIANTS = 6;

/** A species' proportions: lengths in metres, angles in radians. */
export interface AnimalShape {
  // --- the frame ---
  /** Height of the shoulder. The animal's headline number. */
  withers: number;
  /** Height of the hip. Higher than the withers on a young or hunched animal. */
  croup: number;
  /** Shoulder to hip along the spine. */
  bodyLength: number;
  /** Top of the back to the bottom of the chest. */
  barrelDepth: number;
  barrelWidth: number;
  /** Chest width against rump width. Over 1 is deep-chested. */
  chestFore: number;

  // --- the neck and the head ---
  neckLength: number;
  /** Above horizontal. 0 is a grazing pose held permanently; 1.2 is upright. */
  neckRise: number;
  neckThick: number;
  headLength: number;
  headDepth: number;
  headWidth: number;
  /** Muzzle half-width as a fraction of the head's. Under 1 tapers. */
  muzzle: number;
  /** Ear length. Zero leaves them off. */
  ear: number;
  /** How far out from the skull the ears sit, in radians. */
  earFlare: number;

  // --- the legs ---
  legThick: number;
  cannonThick: number;
  /** Radians the fore and hind uppers swing either side of rest. */
  foreSwing: number;
  hindSwing: number;
  /** Radians of extra fold at the top of the lift. */
  foreLift: number;
  hindLift: number;

  // --- what sticks out ---
  /** Height of a hump above the back line. Zero leaves it off. */
  hump: number;
  /** Where along the spine the hump sits, 0 at the shoulder, 1 at the hip. */
  humpAt: number;
  /** Crest along the neck: a horse's mane, a camel's ruff. */
  mane: number;
  /** Tail length. Zero leaves it off. */
  tail: number;
  /** Tuft at the end of it: a cow's switch. Zero is a deer's scut. */
  tailTuft: number;
  horns: 'none' | 'cow' | 'curl' | 'antler';
  hornSize: number;
  /** How woolly: swells the barrel and adds a second, offset mass over it. */
  fleece: number;

  // --- colour, out of the palette and never blended ---
  coat: number;
  /** Belly, inner legs, muzzle. */
  under: number;
  /** Hooves, horns, nose, the tip of the tail. */
  point: number;
  /** Face and lower legs. Equal to `coat` leaves the head plain. */
  face: number;
}

/**
 * One entry in a species' coat list. `ctx.toon` only takes palette colours, so
 * a region cannot blend a coat; `pale` weights dust-coloured coats instead.
 */
export interface Coat {
  color: number;
  weight: number;
  /** A dust-coloured coat: weighted up where the ground is dry. */
  pale?: boolean;
}

/** Draws a coat, letting the region's `dust` push the choice toward the ground. */
export function coatFor(rng: Rng, style: FaunaStyle, coats: readonly Coat[]): number {
  return rng.weighted(
    coats.map((entry) => ({
      item: entry.color,
      weight: entry.weight * (entry.pale === true ? 1 + style.dust * 2.2 : 1 - style.dust * 0.42),
    })),
  );
}

/**
 * What a part file declares. `shape` is the whole model, in metres (see
 * `body.ts`); `build` always returns the animal standing, the box `size`
 * declares. A placer wanting another pose calls
 * `buildAnimal(ctx, animal.shape(rng, style), pose)`.
 */
export interface Animal {
  /** Kebab-case, unique, and the file is named after it: `camel.ts`. */
  id: string;
  name: string;
  kind: AnimalKind;
  /**
   * The box every variant must stay inside: `[length, width, height]`, in world
   * units. A herd spaces its members by it; `validateAnimal` holds every
   * variant to it from both sides.
   */
  size: readonly [number, number, number];
  gait: GaitName;
  /** One line: what this is and where it stands. */
  note?: string;
  /** The proportions of one variant, in metres. Deterministic in `rng` and `style`. */
  shape(rng: Rng, style: FaunaStyle): AnimalShape;
  /** Builds one variant standing, facing +Z, on y = 0, centred in x and z. */
  build(ctx: FaunaContext, rng: Rng, style: FaunaStyle): THREE.Group;
  /**
   * The baked CC0 rigs this animal is drawn with in the world
   * (`scripts/build-kit.ts`), by weight, with the coat role of each colour slot.
   * `shape` still draws the variant's colours, and a rig is fitted by its back
   * (`rigScale`), not by `size`. Absent means the code-built body.
   */
  rigs?: readonly RigChoice[];
}

/**
 * Which part of an animal's coat one of a rig's colour slots is: the shape's
 * own four colours, a darker or lighter tone of the coat, or a palette colour
 * outright (a cow's horns, an eye).
 */
export type CoatRole = 'coat' | 'under' | 'point' | 'face' | 'dark' | 'light' | number;

export interface RigChoice {
  /** A rig id in `public/models/fauna/`. */
  id: string;
  weight: number;
  /** How high the top of this rig's back stands, in metres; what `rigScale` fits. */
  back: number;
  /** Slot name -> role. A slot not named keeps its nearest palette colour. */
  slots: Readonly<Record<string, CoatRole>>;
}

/**
 * Scale for a baked rig: the top of its back, a tenth of its length ahead of
 * the middle (where a saddle goes), at `m(choice.back)`. By the back rather
 * than the length because the rigs are shorter for their height than the
 * declared box; the ridden horse (`craft/horse.ts`) is fitted the same way.
 *
 * Measured on the skinned vertices at the pack's own pose (an FBX rig's bind
 * matrices do not always describe it; see `rigFrom`).
 */
export function rigScale(choice: RigChoice, rig: Rig): number {
  return m(choice.back) / rigBack(rig);
}

/** The top of a rig's back over its feet, in the pack's units, measured once. */
const rigBacks = new WeakMap<Rig, number>();
export function rigBack(rig: Rig): number {
  const known = rigBacks.get(rig);
  if (known !== undefined) return known;
  const rigged = makeRigged(rig);
  rigged.root.updateMatrixWorld(true);
  const body = rigged.body;
  body.skeleton.update();
  const box = rig.box;
  const length = box.max.z - box.min.z;
  const centreX = (box.min.x + box.max.x) / 2;
  const at = (box.min.z + box.max.z) / 2 + length * 0.1;
  const band = length * 0.05;
  const point = new THREE.Vector3();
  let top = -Infinity;
  const count = body.geometry.getAttribute('position').count;
  for (let i = 0; i < count; i++) {
    body.getVertexPosition(i, point);
    point.applyMatrix4(body.matrixWorld);
    if (Math.abs(point.z - at) > band || Math.abs(point.x - centreX) > length * 0.05) continue;
    top = Math.max(top, point.y);
  }
  const back = Number.isFinite(top) ? top - box.min.y : box.max.y - box.min.y;
  rigBacks.set(rig, back);
  return back;
}

/** The paint for one variant of a rigged animal, from the colours its `shape` drew. */
export function rigPaint(shape: AnimalShape, choice: RigChoice): Paint {
  return (slot, original) => {
    const role = choice.slots[slot];
    if (role === undefined) return onPalette(original);
    if (typeof role === 'number') return role;
    if (role === 'dark') return toned(shape.coat, 0.78);
    if (role === 'light') return toned(shape.coat, 1.18);
    return shape[role];
  };
}

/** The seed for one variant. Identity, not order: see `scenery/random.ts`. */
export function variantRng(animal: Animal, style: FaunaStyle, variant: number): Rng {
  return rngFrom(animal.id, style.id, variant);
}

/**
 * What varies with place: which animals stand here and how dusty they are.
 * Coats belong to the species, not the region.
 */
export interface FaunaStyle {
  id: string;
  name: string;
  note: string;
  /** Which animals stand here at all, before the biome has its say. */
  stock: readonly Weighted<string>[];
  /**
   * How much the local dust has taken the coat toward the ground. 0 is a washed
   * Friesian, 1 is a Sahelian zebu. Multiplies, so a black coat stays dark.
   */
  dust: number;
  /** How many head stand together here, as a multiplier on the kind's group. */
  density: number;
}

export interface FaunaContext extends SceneryContext {
  /**
   * A tapered prism hanging from the origin: top face at `y = 0`, bottom at
   * `y = -length`. Limbs hang from their joint, unlike every other primitive,
   * which stands on `y = 0`.
   */
  hang(length: number, topRadius: number, bottomRadius: number, color: number, sides?: number): THREE.Mesh;

  /**
   * A barrel: a tapered prism lying along +Z, its axis on `y = 0`, with
   * independent width and depth. Three composes `T * R * S`, so the section
   * scale is on a parent group and the rotation on the child (`S * R`).
   */
  barrel(length: number, aftRadius: number, foreRadius: number, flatten: number, color: number, sides?: number): THREE.Group;
}

const round = (value: number): string => value.toFixed(2);

export function createFaunaContext(base: SceneryContext = createSceneryContext()): FaunaContext {
  const meshOf = (geometry: THREE.BufferGeometry, color: number): THREE.Mesh => {
    const faceted = geometry.index ? geometry.toNonIndexed() : geometry;
    if (faceted !== geometry) geometry.dispose();
    faceted.computeVertexNormals();
    return new THREE.Mesh(faceted, base.toon(color));
  };

  const prism = (length: number, bottom: number, top: number, color: number, sides: number): THREE.Mesh => {
    const n = Math.max(3, Math.round(sides));
    // `CylinderGeometry` takes radii to the corner; half-widths here are
    // across the flats.
    const toCorner = 1 / Math.cos(Math.PI / n);
    const geometry = new THREE.CylinderGeometry(top * toCorner, bottom * toCorner, length, n, 1, false, Math.PI / n);
    return meshOf(geometry, color);
  };

  return {
    ...base,

    hang(length, topRadius, bottomRadius, color, sides = 4) {
      const mesh = prism(length, bottomRadius, topRadius, color, sides);
      mesh.position.y = -length / 2;
      return mesh;
    },

    barrel(length, aftRadius, foreRadius, flatten, color, sides = 6) {
      // Built about +Y with `aftRadius` at its base; `rotation.x = +PI/2` sends
      // +Y to +Z, so the base points to -Z.
      const mesh = prism(length, aftRadius, foreRadius, color, sides);
      mesh.rotation.x = Math.PI / 2;
      const group = new THREE.Group();
      // Scale on the parent, rotation on the child, so `y` flattens the depth.
      group.scale.set(1, flatten, 1);
      group.add(mesh);
      return group;
    },
  };
}

export interface Extent {
  length: number;
  width: number;
  height: number;
  /** Lowest point. Anything below zero is a hoof through the ground. */
  floor: number;
  centreX: number;
  centreZ: number;
}

export function extentOf(group: THREE.Group): Extent {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return { length: 0, width: 0, height: 0, floor: 0, centreX: 0, centreZ: 0 };
  return {
    length: box.max.z - box.min.z,
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
    floor: box.min.y,
    centreX: (box.min.x + box.max.x) / 2,
    centreZ: (box.min.z + box.max.z) / 2,
  };
}

/**
 * Every complaint about one built variant. The declared size is checked from
 * both sides, since a herd spaces its members by it.
 */
export function validateAnimal(animal: Animal, group: THREE.Group): string[] {
  const problems: string[] = [];
  const spec = KINDS[animal.kind];
  const built = extentOf(group);

  let meshes = 0;
  let triangles = 0;
  const colors = new Set<number>();
  let untoned = 0;
  let smooth = 0;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    meshes++;
    const position = mesh.geometry.getAttribute('position');
    if (position === undefined) return;
    triangles += (mesh.geometry.index ? mesh.geometry.index.count : position.count) / 3;
    if (mesh.geometry.index) smooth++;
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    const hex = material?.userData.atlasToon as number | undefined;
    if (hex === undefined) untoned++;
    else colors.add(hex);
  });

  if (group.position.lengthSq() > 1e-8 || group.rotation.x !== 0 || group.rotation.y !== 0 || group.rotation.z !== 0) {
    problems.push('the root group carries a transform — a placer owns that');
  }
  if (untoned > 0) problems.push(`${untoned} mesh(es) not built through ctx.toon`);
  if (smooth > 0) {
    // Flat shading needs one normal a face; an indexed mesh shades smooth.
    problems.push(`${smooth} mesh(es) are indexed and will shade smooth`);
  }

  // The ground.
  if (built.floor < -0.02) problems.push(`stands ${round(-built.floor)} below y = 0 — a hoof through the ground`);
  if (built.floor > 0.06) problems.push(`floats ${round(built.floor)} above y = 0`);
  if (Math.abs(built.centreX) > 0.25) problems.push(`not centred in x: ${round(built.centreX)}`);
  if (Math.abs(built.centreZ) > 0.9) problems.push(`not centred in z: ${round(built.centreZ)}`);

  // The declared size.
  const [length, width, height] = animal.size;
  const over = (built: number, declared: number, axis: string): void => {
    if (built > declared + 0.02) problems.push(`${axis} ${round(built)} over its declared ${round(declared)}`);
    // A declaration comfortably too big leaves gaps in a herd.
    else if (built < declared * 0.88) problems.push(`${axis} ${round(built)} well under its declared ${round(declared)}`);
  };
  over(built.length, length, 'length');
  over(built.width, width, 'width');
  over(built.height, height, 'height');

  if (length > spec.length) problems.push(`declared length ${round(length)} over the ${animal.kind} cap ${spec.length}`);
  if (length < spec.minLength) problems.push(`declared length ${round(length)} under the ${animal.kind} floor ${spec.minLength}`);
  if (width > spec.width) problems.push(`declared width ${round(width)} over the ${animal.kind} cap ${spec.width}`);
  if (height > spec.height) problems.push(`declared height ${round(height)} over the ${animal.kind} cap ${spec.height}`);
  if (height < spec.minHeight) problems.push(`declared height ${round(height)} under the ${animal.kind} floor ${spec.minHeight}`);

  // Budget.
  if (triangles > spec.triangles) problems.push(`${triangles} triangles over the ${animal.kind} cap ${spec.triangles}`);
  if (meshes > spec.meshes) problems.push(`${meshes} meshes over the ${animal.kind} cap ${spec.meshes}`);
  if (colors.size > spec.colors) problems.push(`${colors.size} colours over the ${animal.kind} cap ${spec.colors}`);
  // A part well under its budget has usually dropped something.
  if (triangles < spec.triangles * 0.28) {
    problems.push(`only ${triangles} triangles of a ${spec.triangles} budget — has something been dropped?`);
  }

  return problems;
}

export type { Measurements } from '../monuments/contract.ts';
export { measure, paletteName } from '../monuments/contract.ts';
export type { Group, Mesh, Object3D, Vector3 } from '../monuments/contract.ts';
export type { Rng, Weighted, RegionStyle, SceneryContext };
export { rngFrom };
export { swingLift };
