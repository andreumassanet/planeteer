import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PALETTE } from './theme.ts';
import { shadeByClouds } from './cloud-shade.ts';

/**
 * Static models from CC0 packs: a vehicle, a tree, a rock, a house.
 *
 * The same treatment `cast.ts` gives the people, without the skeleton, and for
 * the same reasons:
 *
 * - **One geometry a model.** A pack model is a handful of nodes and a handful
 *   of materials; every node's transform is applied and everything is merged
 *   into one non-indexed geometry. Each vertex remembers which material it came
 *   from (`slot`), so a model is painted by writing a colour attribute and is
 *   drawn with the world's one vertex-coloured toon material.
 * - **Creased normals for the fill, welded normals for the ink.** Faces meeting
 *   under `CREASE` share a normal, so a flat panel stays flat and a round trunk
 *   is round; the hull reads `outlineNormal`, averaged over every face at a
 *   point, so the line is one closed skin instead of a slab per facet.
 * - **Colour is a slot, not a texture.** A pack drawn in flat material colours
 *   gives one slot a material. A pack drawn through a palette atlas (one small
 *   texture that every face samples a swatch of) gives one slot a swatch: each
 *   triangle's colour is read at its centroid, which is where an atlas face's
 *   swatch is, and the slot is named `<material>#rrggbb`.
 *
 * Nothing here decides a colour or a size; the kit that uses a model does.
 */

/** Faces meeting at less than this share a normal. */
export const CREASE = (50 * Math.PI) / 180;

export interface Model {
  name: string;
  /** Non-indexed: `position`, `normal` (creased), `outlineNormal` (welded). In the pack's own units. */
  geometry: THREE.BufferGeometry;
  /** Per vertex, which of `slots` its colour comes from. */
  slot: Uint8Array;
  slots: readonly string[];
  /** The pack's own colour for each slot, linear. */
  defaults: readonly THREE.Color[];
  box: THREE.Box3;
  triangles: number;
}

/** Turns a slot into this instance's colour, or `null` for the pack's own. */
export type Paint = (slot: string, original: THREE.Color) => number | THREE.Color | null;

/**
 * Normals welded across every edge, by position: the hull's, not the fill's.
 * Area-weighted, so a sliver does not pull a corner off true.
 */
export function weldedNormals(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const sums = new Map<string, THREE.Vector3>();
  const keyOf = (i: number) =>
    `${Math.round(position.getX(i) * 1000)},${Math.round(position.getY(i) * 1000)},${Math.round(position.getZ(i) * 1000)}`;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const face = new THREE.Vector3();
  const given = new THREE.Vector3();
  const ab = new THREE.Vector3();
  for (let i = 0; i + 2 < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    face.subVectors(c, b).cross(ab.subVectors(a, b));
    if (face.dot(given.fromBufferAttribute(normal, i)) < 0) face.negate();
    for (let k = 0; k < 3; k++) {
      const key = keyOf(i + k);
      const sum = sums.get(key);
      if (sum === undefined) sums.set(key, face.clone());
      else sum.add(face);
    }
  }
  const out = new Float32Array(position.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    n.copy(sums.get(keyOf(i))!);
    if (n.lengthSq() === 0) n.fromBufferAttribute(normal, i);
    n.normalize();
    out[i * 3] = n.x;
    out[i * 3 + 1] = n.y;
    out[i * 3 + 2] = n.z;
  }
  return new THREE.BufferAttribute(out, 3);
}

/** Reads a texture's pixels once, for sampling swatches. */
const pixelCache = new WeakMap<object, { data: Uint8ClampedArray; width: number; height: number } | null>();
function pixelsOf(texture: THREE.Texture): { data: Uint8ClampedArray; width: number; height: number } | null {
  const image = texture.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (image === undefined || image === null) return null;
  const cached = pixelCache.get(image);
  if (cached !== undefined) return cached;
  let value: { data: Uint8ClampedArray; width: number; height: number } | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    value = { data: context.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
  } catch {
    value = null;
  }
  pixelCache.set(image, value);
  return value;
}

function swatch(texture: THREE.Texture, u: number, v: number, into: THREE.Color): boolean {
  const pixels = pixelsOf(texture);
  if (pixels === null) return false;
  const wrap = (x: number) => x - Math.floor(x);
  const x = Math.min(pixels.width - 1, Math.floor(wrap(u) * pixels.width));
  // glTF's UV origin is the top-left of the image, and GLTFLoader sets flipY false.
  const y = Math.min(pixels.height - 1, Math.floor(wrap(v) * pixels.height));
  const i = (y * pixels.width + x) * 4;
  into.setRGB(pixels.data[i]! / 255, pixels.data[i + 1]! / 255, pixels.data[i + 2]! / 255, THREE.SRGBColorSpace);
  return true;
}

/**
 * Merges everything visible under `root` into one `Model`. Skinned meshes are
 * taken in their bind pose. Reflected nodes have their winding put back.
 */
export interface ModelOptions {
  /**
   * Reads a palette atlas at a texture coordinate. The default draws the image
   * to a canvas, which only a browser has; a bake passes its own decoder.
   */
  swatch?: (texture: THREE.Texture, u: number, v: number, into: THREE.Color) => boolean;
}

export function modelFrom(root: THREE.Object3D, name: string, options: ModelOptions = {}): Model {
  const sample = options.swatch ?? swatch;
  root.updateMatrixWorld(true);
  const slots: string[] = [];
  const defaults: THREE.Color[] = [];
  const slotOf = (key: string, color: THREE.Color): number => {
    let index = slots.indexOf(key);
    if (index < 0) {
      if (slots.length >= 255) throw new Error(`models: ${name} has more than 255 colours`);
      index = slots.length;
      slots.push(key);
      defaults.push(color.clone());
    }
    return index;
  };
  const geometries: THREE.BufferGeometry[] = [];
  const vertexSlots: number[] = [];
  const colour = new THREE.Color();
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && object.visible) meshes.push(object as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let source = mesh.geometry.clone();
    for (const attribute of Object.keys(source.attributes)) {
      if (!['position', 'normal', 'uv'].includes(attribute)) source.deleteAttribute(attribute);
    }
    source.applyMatrix4(mesh.matrixWorld);
    const flipped = mesh.matrixWorld.determinant() < 0;
    const groups = source.groups.length > 0 ? source.groups : [{ start: 0, count: source.index?.count ?? source.getAttribute('position').count, materialIndex: 0 }];
    source = source.index !== null ? source.toNonIndexed() : source;
    const position = source.getAttribute('position');
    if (flipped) {
      // A reflection turns every triangle inside out; swap two corners back.
      for (const attribute of Object.values(source.attributes)) {
        const array = attribute.array as Float32Array;
        const size = attribute.itemSize;
        for (let t = 0; t + 2 < attribute.count; t += 3) {
          for (let k = 0; k < size; k++) {
            const tmp = array[(t + 1) * size + k]!;
            array[(t + 1) * size + k] = array[(t + 2) * size + k]!;
            array[(t + 2) * size + k] = tmp;
          }
        }
      }
    }
    if (!source.getAttribute('normal')) source.computeVertexNormals();
    const uv = source.getAttribute('uv');
    const triangleSlot = new Int16Array(position.count / 3).fill(-1);
    for (const group of groups) {
      const material = (materials[group.materialIndex ?? 0] ?? materials[0]) as THREE.MeshStandardMaterial;
      const base = material.color ?? new THREE.Color(1, 1, 1);
      const label = material.name || 'material';
      for (let t = Math.floor(group.start / 3); t < Math.floor((group.start + group.count) / 3); t++) {
        if (material.map && uv) {
          const u = (uv.getX(t * 3) + uv.getX(t * 3 + 1) + uv.getX(t * 3 + 2)) / 3;
          const v = (uv.getY(t * 3) + uv.getY(t * 3 + 1) + uv.getY(t * 3 + 2)) / 3;
          if (sample(material.map, u, v, colour)) {
            colour.multiply(base);
            triangleSlot[t] = slotOf(`${label}#${colour.getHexString(THREE.SRGBColorSpace)}`, colour);
            continue;
          }
        }
        triangleSlot[t] = slotOf(label, base);
      }
    }
    if (uv) source.deleteAttribute('uv');
    const creased = toCreasedNormals(source, CREASE);
    geometries.push(creased);
    for (let t = 0; t < position.count / 3; t++) {
      const s = Math.max(0, triangleSlot[t]!);
      vertexSlots.push(s, s, s);
    }
  }
  if (geometries.length === 0) throw new Error(`models: ${name} has no meshes`);
  const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false);
  if (merged === null) throw new Error(`models: ${name} has parts that cannot merge`);
  merged.setAttribute('outlineNormal', weldedNormals(merged));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const count = merged.getAttribute('position').count;
  return {
    name,
    geometry: merged,
    slot: Uint8Array.from(vertexSlots),
    slots,
    defaults,
    box: merged.boundingBox!.clone(),
    triangles: count / 3,
  };
}

/**
 * A painted copy: the model's positions and normals, shared, and a colour
 * attribute of its own. Never `dispose()` the result while the model is in use
 * elsewhere — disposing a geometry frees the GPU buffers of every attribute on
 * it, shared ones included.
 */
export function paintModel(model: Model, paint: Paint = () => null): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'outlineNormal']) geometry.setAttribute(name, model.geometry.getAttribute(name));
  geometry.setIndex(model.geometry.index);
  geometry.setAttribute('color', new THREE.BufferAttribute(paintColors(model, paint), 3));
  geometry.boundingBox = model.box.clone();
  geometry.boundingSphere = model.geometry.boundingSphere!.clone();
  return geometry;
}

/** The colour attribute alone, for a caller that owns its own geometry. */
export function paintColors(model: Model, paint: Paint = () => null): Float32Array {
  const bySlot = model.slots.map((name, s) => {
    const chosen = paint(name, model.defaults[s]!);
    if (chosen === null) return model.defaults[s]!.clone();
    return chosen instanceof THREE.Color ? chosen.clone() : new THREE.Color(chosen);
  });
  const colors = new Float32Array(model.slot.length * 3);
  for (let v = 0; v < model.slot.length; v++) {
    const c = bySlot[model.slot[v]!]!;
    colors[v * 3] = c.r;
    colors[v * 3 + 1] = c.g;
    colors[v * 3 + 2] = c.b;
  }
  return colors;
}

/** The world's vertex-coloured toon material, inked along `outlineNormal`. */
export function modelMaterial(
  gradientMap: THREE.Texture,
  ink: { thickness: number; color: [number, number, number] },
): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  material.userData.outlineParameters = { ...ink, outlineNormal: true };
  return shadeByClouds(material);
}

// ---------------------------------------------------------------------------
// Rigged models: an animal, a person
// ---------------------------------------------------------------------------

/** A skinned pack model merged into one skinned mesh, ready to clone and paint. */
export interface Rig {
  name: string;
  /** The pack's scene with the merged body in it, bind pose. */
  scene: THREE.Group;
  body: THREE.SkinnedMesh;
  slot: Uint8Array;
  slots: readonly string[];
  defaults: readonly THREE.Color[];
  /** Bind-pose bounds, in the pack's units. */
  box: THREE.Box3;
  triangles: number;
  clips: readonly THREE.AnimationClip[];
  /**
   * Still frames of the rig, coarsened, for a merged herd far off: which clip,
   * how many seconds in, and the model. Written by the bake (`farFrames` in
   * `scripts/build-kit.ts`); empty on a rig that was not baked.
   */
  far: readonly { clip: string; time: number; model: Model }[];
}

export interface Rigged {
  /** Feet on y = 0 as authored; owns nothing but the scene. */
  root: THREE.Group;
  body: THREE.SkinnedMesh;
  mixer: THREE.AnimationMixer;
  actions: ReadonlyMap<string, THREE.AnimationAction>;
}

/**
 * Merges every skinned part under `root` into one skinned mesh on their shared
 * skeleton: creased normals, a welded `outlineNormal`, a slot a material.
 * Unskinned meshes are dropped — nothing loose belongs to a body.
 */
export function rigFrom(root: THREE.Group, clips: readonly THREE.AnimationClip[], name: string, material: THREE.Material): Rig {
  const parts: THREE.SkinnedMesh[] = [];
  const loose: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) parts.push(object as THREE.SkinnedMesh);
    else if ((object as THREE.Mesh).isMesh) loose.push(object as THREE.Mesh);
  });
  if (parts.length === 0) throw new Error(`models: ${name} has no skinned mesh`);
  const skeleton = parts[0]!.skeleton;
  // A rigid piece is carried into the body at the bind pose. The scene's own
  // pose is put back afterwards: an FBX rig's inverse bind matrices do not
  // always describe the pose it was exported in, and posing it from them
  // stretched the Farm Animals to three times their height.
  const rest = skeleton.bones.map((bone) => [bone.position.clone(), bone.quaternion.clone(), bone.scale.clone()] as const);
  const attached = loose.some((mesh) => {
    let up: THREE.Object3D | null = mesh.parent;
    while (up !== null && !(up as THREE.Bone).isBone) up = up.parent;
    return up !== null;
  });
  if (attached) skeleton.pose();
  root.updateMatrixWorld(true);
  const bodyWorld = parts[0]!.matrixWorld.clone();
  const toBody = bodyWorld.clone().invert();
  const slots: string[] = [];
  const defaults: THREE.Color[] = [];
  const slotOf = (key: string, color: THREE.Color): number => {
    let index = slots.indexOf(key);
    if (index < 0) {
      index = slots.length;
      slots.push(key);
      defaults.push(color.clone());
    }
    return index;
  };
  const geometries: THREE.BufferGeometry[] = [];
  const vertexSlots: number[] = [];
  const take = (source: THREE.BufferGeometry, materials: THREE.Material[]): void => {
    const groups = source.groups.length > 0 ? source.groups : [{ start: 0, count: source.index?.count ?? source.getAttribute('position').count, materialIndex: 0 }];
    const creased = toCreasedNormals(source, CREASE);
    for (const group of groups) {
      const own = (materials[group.materialIndex ?? 0] ?? materials[0]) as THREE.MeshStandardMaterial;
      const slot = slotOf(own.name || 'material', own.color ?? new THREE.Color(1, 1, 1));
      for (let v = 0; v < group.count; v++) vertexSlots.push(slot);
    }
    geometries.push(creased);
  };
  for (const part of parts) {
    if (part.skeleton !== skeleton) throw new Error(`models: ${name} is on two skeletons`);
    if (!part.bindMatrix.equals(parts[0]!.bindMatrix)) throw new Error(`models: ${name} has parts with different bind matrices`);
    const source = part.geometry.clone();
    for (const attribute of Object.keys(source.attributes)) {
      if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(attribute)) source.deleteAttribute(attribute);
    }
    take(source, Array.isArray(part.material) ? part.material : [part.material]);
  }
  // A rigid piece hung off a bone — a stag's antlers on its head — becomes part
  // of the body, weighted wholly to that bone. Anything not under a bone is a
  // prop and is dropped: nothing loose belongs to a body.
  for (const mesh of loose) {
    let bone: THREE.Object3D | null = mesh.parent;
    while (bone !== null && !(bone as THREE.Bone).isBone) bone = bone.parent;
    const index = bone === null ? -1 : skeleton.bones.indexOf(bone as THREE.Bone);
    if (index >= 0) {
      const source = mesh.geometry.clone();
      for (const attribute of Object.keys(source.attributes)) {
        if (!['position', 'normal'].includes(attribute)) source.deleteAttribute(attribute);
      }
      const matrix = toBody.clone().multiply(mesh.matrixWorld);
      if (matrix.determinant() <= 0) throw new Error(`models: ${name} has a reflected piece on ${bone!.name}`);
      source.applyMatrix4(matrix);
      const count = source.getAttribute('position').count;
      const joints = new Uint16Array(count * 4);
      const weights = new Float32Array(count * 4);
      for (let v = 0; v < count; v++) {
        joints[v * 4] = index;
        weights[v * 4] = 1;
      }
      source.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
      source.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
      take(source, Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
    }
    mesh.removeFromParent();
  }
  // Merging needs one attribute layout; a rig's own skin indices may be 8-bit.
  for (const geometry of geometries) {
    const joints = geometry.getAttribute('skinIndex');
    if (!(joints.array instanceof Uint16Array)) {
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(joints.array as ArrayLike<number>), 4));
    }
    const weights = geometry.getAttribute('skinWeight');
    if (!(weights.array instanceof Float32Array) || weights.normalized) {
      const out = new Float32Array(weights.count * 4);
      for (let i = 0; i < weights.count; i++) for (let k = 0; k < 4; k++) out[i * 4 + k] = weights.getComponent(i, k);
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out, 4));
    }
  }
  skeleton.bones.forEach((bone, i) => {
    bone.position.copy(rest[i]![0]);
    bone.quaternion.copy(rest[i]![1]);
    bone.scale.copy(rest[i]![2]);
  });
  const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false);
  if (merged === null) throw new Error(`models: ${name} has parts that cannot merge`);
  merged.setAttribute('outlineNormal', weldedNormals(merged));
  const slot = Uint8Array.from(vertexSlots);
  if (slot.length !== merged.getAttribute('position').count) throw new Error(`models: ${name} slots do not cover the mesh`);
  merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(slot.length * 3), 3));
  const body = new THREE.SkinnedMesh(merged, material);
  body.name = 'body';
  parts[0]!.parent!.add(body);
  body.position.copy(parts[0]!.position);
  body.quaternion.copy(parts[0]!.quaternion);
  body.scale.copy(parts[0]!.scale);
  body.bind(skeleton, parts[0]!.bindMatrix);
  for (const part of parts) part.removeFromParent();
  body.castShadow = true;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  return { name, scene: root, body, slot, slots, defaults, box, triangles: slot.length / 3, clips, far: [] };
}

/** A painted, independently animated copy of a rig. */
export function makeRigged(rig: Rig, paint: Paint = () => null): Rigged {
  const scene = cloneSkinned(rig.scene) as THREE.Group;
  let body: THREE.SkinnedMesh | null = null;
  scene.traverse((object) => {
    if (object.name === 'body' && (object as THREE.SkinnedMesh).isSkinnedMesh) body = object as THREE.SkinnedMesh;
  });
  if (body === null) throw new Error(`models: the clone of ${rig.name} lost its body`);
  const mesh = body as THREE.SkinnedMesh;
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'outlineNormal', 'skinIndex', 'skinWeight']) {
    geometry.setAttribute(name, rig.body.geometry.getAttribute(name));
  }
  geometry.setIndex(rig.body.geometry.index);
  const model = { slot: rig.slot, slots: rig.slots, defaults: rig.defaults } as Pick<Model, 'slot' | 'slots' | 'defaults'>;
  geometry.setAttribute('color', new THREE.BufferAttribute(paintColors(model as Model, paint), 3));
  mesh.geometry = geometry;
  const size = rig.box.getSize(new THREE.Vector3());
  const centre = rig.box.getCenter(new THREE.Vector3());
  mesh.boundingSphere = new THREE.Sphere(centre, size.length() * 0.75);
  mesh.frustumCulled = true;
  const root = new THREE.Group();
  root.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of rig.clips) actions.set(clip.name, mixer.clipAction(clip));
  return { root, body: mesh, mixer, actions };
}

// ---------------------------------------------------------------------------
// Paint: bringing a pack's colours onto the world's palette
// ---------------------------------------------------------------------------

const PALETTE_LIST = Object.values(PALETTE).map((hex) => new THREE.Color(hex));

/**
 * A colour darker or lighter by `factor` the way `tone` in the monument
 * contract makes one: each sRGB channel scaled, so a tone here and a tone of the
 * same palette colour on a built part are the same colour.
 */
export function toned(color: THREE.Color | number, factor: number): THREE.Color {
  const srgb = new THREE.Color(color).convertLinearToSRGB();
  const channel = (value: number) => Math.min(1, Math.max(0, value * factor));
  return new THREE.Color().setRGB(channel(srgb.r), channel(srgb.g), channel(srgb.b), THREE.SRGBColorSpace);
}

/** CIELAB of a linear colour, for distances that follow the eye. */
function labOf(color: THREE.Color): [number, number, number] {
  // Linear sRGB -> XYZ (D65) -> Lab.
  const x = (0.4124 * color.r + 0.3576 * color.g + 0.1805 * color.b) / 0.95047;
  const y = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const z = (0.0193 * color.r + 0.1192 * color.g + 0.9505 * color.b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const PALETTE_LAB = PALETTE_LIST.map(labOf);

/**
 * The palette colour nearest `color`, toned to keep its lightness. A pack's
 * baked shading — Kenney's atlas is a gradient per swatch — survives as a tone
 * of one palette entry, clamped to the tone range the kit allows.
 *
 * **Nearest in CIELAB, with lightness weighed at a third**, because the tone
 * gives the lightness back afterwards and what has to match is the hue. The
 * first version compared hue and lightness in linear RGB, where a mid green's
 * lightness is under a fifth, and every leaf of Quaternius's trees came out the
 * colour of the ink.
 */
export function onPalette(color: THREE.Color, exclude: readonly number[] = []): THREE.Color {
  const [l, a, b] = labOf(color);
  let best = 0;
  let bestDistance = Infinity;
  PALETTE_LIST.forEach((candidate, i) => {
    if (exclude.includes(candidate.getHex())) return;
    const [cl, ca, cb] = PALETTE_LAB[i]!;
    const chroma = Math.hypot(a, b);
    // A near-grey keeps to the greys: its hue is noise, and its lightness is all it has.
    const lightWeight = chroma < 8 ? 1 : 0.35;
    const d = Math.hypot((l - cl) * lightWeight, a - ca, b - cb);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  const base = PALETTE_LIST[best]!;
  const factor = THREE.MathUtils.clamp(PALETTE_LAB[best]![0] > 2 ? (l + 16) / (PALETTE_LAB[best]![0] + 16) : 1, 0.6, 1.4);
  return toned(base, factor);
}

/** Whether a slot is glass: by name, or a pale sky-blue swatch in a palette atlas. */
export function isGlass(slot: string, color: THREE.Color): boolean {
  if (/window|glass|windshield/i.test(slot)) return true;
  const hsl = { h: 0, s: 0, l: 0 };
  color.clone().convertLinearToSRGB().getHSL(hsl);
  return hsl.h > 0.52 && hsl.h < 0.64 && hsl.l > 0.72 && hsl.s > 0.4;
}

/** How many vertices each slot covers. */
function slotShares(model: Pick<Model, 'slot' | 'slots'>): number[] {
  const shares = new Array<number>(model.slots.length).fill(0);
  for (const s of model.slot) shares[s]!++;
  return shares;
}

/**
 * A vehicle's paint: the largest saturated colour family is the body and takes
 * `body` (keeping each swatch's lightness against the family's mean), glass
 * goes to toned slate, and everything else goes to its nearest palette colour.
 */
export function bodyPaint(
  model: Pick<Model, 'slot' | 'slots' | 'defaults'>,
  body: number,
  glass: (slot: string, c: THREE.Color) => boolean,
  /** Names the body outright, for a pack drawn in greys where no colour family leads. */
  bodySlots?: RegExp,
): Paint {
  const shares = slotShares(model);
  const hsl = model.defaults.map((c) => {
    const out = { h: 0, s: 0, l: 0 };
    c.clone().convertLinearToSRGB().getHSL(out);
    return out;
  });
  let lead = -1;
  model.slots.forEach((slot, i) => {
    if (glass(slot, model.defaults[i]!) || hsl[i]!.s < 0.3 || hsl[i]!.l < 0.12 || hsl[i]!.l > 0.9) return;
    if (lead < 0 || shares[i]! > shares[lead]!) lead = i;
  });
  const family = new Set<number>();
  if (bodySlots !== undefined) {
    model.slots.forEach((slot, i) => {
      if (bodySlots.test(slot)) family.add(i);
    });
    lead = -1;
  }
  if (lead >= 0) {
    model.slots.forEach((_, i) => {
      const dh = Math.min(Math.abs(hsl[i]!.h - hsl[lead]!.h), 1 - Math.abs(hsl[i]!.h - hsl[lead]!.h));
      if (dh < 0.06 && hsl[i]!.s > 0.2) family.add(i);
    });
  }
  let meanL = 0;
  let count = 0;
  for (const i of family) {
    meanL += hsl[i]!.l * shares[i]!;
    count += shares[i]!;
  }
  meanL = count > 0 ? meanL / count : 0.5;
  const bodyColor = new THREE.Color(body);
  // `GLASS_TONE` in the scenery contract: glazing is slate toned down, never black.
  const glassColor = toned(PALETTE.slate, 0.72);
  return (slot, original) => {
    const i = model.slots.indexOf(slot);
    if (glass(slot, original)) return glassColor;
    if (family.has(i)) return toned(bodyColor, THREE.MathUtils.clamp(hsl[i]!.l / meanL, 0.6, 1.4));
    return onPalette(original);
  };
}

// ---------------------------------------------------------------------------
// Baked: what a kit file holds, read back
// ---------------------------------------------------------------------------

/**
 * The attributes a bake writes beside position and normal. glTF wants a custom
 * attribute's name to start with an underscore and `GLTFLoader` lower-cases it,
 * so `outlineNormal` goes out as `_OUTLINENORMAL` and comes back as
 * `_outlinenormal`; `slot` likewise.
 */
const BAKED_OUTLINE = '_outlinenormal';
const BAKED_SLOT = '_slot';

/** The slot table a bake stores in a mesh's extras: `[name, sRGB hex]` pairs. */
export type SlotTable = [string, string][];

export function slotTable(model: Pick<Model, 'slots' | 'defaults'>): SlotTable {
  return model.slots.map((name, i) => [name, model.defaults[i]!.getHexString(THREE.SRGBColorSpace)]);
}

function readSlots(mesh: THREE.Mesh, name: string): { slot: Uint8Array; slots: string[]; defaults: THREE.Color[] } {
  const geometry = mesh.geometry;
  const table = (mesh.userData.slots ?? geometry.userData.slots) as SlotTable | undefined;
  const attribute = geometry.getAttribute(BAKED_SLOT) ?? geometry.getAttribute('slot');
  const outline = geometry.getAttribute(BAKED_OUTLINE);
  if (table === undefined || attribute === undefined || outline === undefined) {
    throw new Error(`models: ${name} was not baked by scripts/build-kit.ts`);
  }
  geometry.setAttribute('outlineNormal', outline);
  geometry.deleteAttribute(BAKED_OUTLINE);
  geometry.deleteAttribute(BAKED_SLOT);
  const slot = new Uint8Array(attribute.count);
  for (let i = 0; i < attribute.count; i++) slot[i] = attribute.getX(i);
  return {
    slot,
    slots: table.map(([slotName]) => slotName),
    defaults: table.map(([, hex]) => new THREE.Color().setStyle(`#${hex}`, THREE.SRGBColorSpace)),
  };
}

/** A static model from a baked mesh: indexed, creased, with its slots. */
export function modelFromBaked(mesh: THREE.Mesh, name = mesh.name): Model {
  mesh.updateMatrixWorld(true);
  const geometry = mesh.geometry;
  if (!mesh.matrixWorld.equals(new THREE.Matrix4())) geometry.applyMatrix4(mesh.matrixWorld);
  const { slot, slots, defaults } = readSlots(mesh, name);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const count = geometry.index ? geometry.index.count : geometry.getAttribute('position').count;
  return { name, geometry, slot, slots, defaults, box: geometry.boundingBox!.clone(), triangles: count / 3 };
}

/** A rig from a baked scene: its one skinned body, its skeleton, its clips. */
export function rigFromBaked(root: THREE.Group, clips: readonly THREE.AnimationClip[], name: string, material: THREE.Material): Rig {
  let body: THREE.SkinnedMesh | null = null;
  const farMeshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) body = object as THREE.SkinnedMesh;
    else if ((object as THREE.Mesh).isMesh && object.name.startsWith('far|')) farMeshes.push(object as THREE.Mesh);
  });
  // Out of the scene before anything clones it: a far frame is a still model,
  // not a part of the body.
  const far = farMeshes.map((mesh) => {
    mesh.removeFromParent();
    const [, clip, time] = mesh.name.split('|');
    return { clip: clip!, time: Number(time), model: modelFromBaked(mesh, mesh.name) };
  });
  if (body === null) throw new Error(`models: ${name} has no skinned body`);
  const mesh = body as THREE.SkinnedMesh;
  const { slot, slots, defaults } = readSlots(mesh, name);
  mesh.material = material;
  mesh.name = 'body';
  mesh.castShadow = true;
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(slot.length * 3), 3));
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const count = mesh.geometry.index ? mesh.geometry.index.count : slot.length;
  return { name, scene: root, body: mesh, slot, slots, defaults, box, triangles: count / 3, clips, far };
}

// ---------------------------------------------------------------------------
// A rig held still: a merged herd's animal
// ---------------------------------------------------------------------------

const poseMatrix = new THREE.Matrix4();
const poseSum = new THREE.Matrix4();
const poseBone = new THREE.Matrix4();
const poseVector = new THREE.Vector3();
const poseNormal = new THREE.Matrix3();

/**
 * The rig's body at `time` seconds into `clip`, skinned on the CPU into a plain
 * geometry in the rig's own frame: `position`, `normal` and `outlineNormal`,
 * sharing the rig's index.
 *
 * **What lets a merged herd be authored animals**: a grazing herd is still, so
 * each head is one frame of the pack's own `Eating` or `Idle`, baked once per
 * species, pose and variant, and merged like anything else that does not move.
 * The animated copies near the player (`makeRigged`) play the same clips.
 */
export function posedGeometry(rig: Rig, clip: string | null, time: number): THREE.BufferGeometry {
  const scene = rig.scene;
  const body = rig.body;
  const mixer = new THREE.AnimationMixer(scene);
  const found = clip === null ? undefined : rig.clips.find((entry) => entry.name === clip);
  if (found !== undefined) {
    mixer.clipAction(found).play();
    mixer.setTime(time % found.duration);
  }
  const geometry = bakeSkin(body, scene);
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  return geometry;
}

/**
 * A skinned mesh as it stands right now, skinned on the CPU into a plain
 * geometry in `frame`'s space: `position`, `normal`, `outlineNormal`, and its
 * `color` when it has one, sharing its index.
 */
export function bakeSkin(body: THREE.SkinnedMesh, frame: THREE.Object3D): THREE.BufferGeometry {
  const scene = frame;
  scene.updateMatrixWorld(true);
  body.skeleton.update();
  const source = body.geometry;
  const position = source.getAttribute('position');
  const normal = source.getAttribute('normal');
  const outline = source.getAttribute('outlineNormal');
  const joints = source.getAttribute('skinIndex');
  const weights = source.getAttribute('skinWeight');
  const bones = body.skeleton.boneMatrices!;
  const toRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const count = position.count;
  const outPosition = new Float32Array(count * 3);
  const outNormal = new Float32Array(count * 3);
  const outOutline = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    poseSum.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const weight = weights.getComponent(v, k);
      if (weight === 0) continue;
      poseBone.fromArray(bones, joints.getComponent(v, k) * 16);
      for (let e = 0; e < 16; e++) poseSum.elements[e]! += poseBone.elements[e]! * weight;
    }
    // World = sum(bone * inverse) * bindMatrix * v; the rig's frame is its root's.
    poseMatrix.multiplyMatrices(toRoot, poseSum).multiply(body.bindMatrix);
    poseNormal.getNormalMatrix(poseMatrix);
    poseVector.fromBufferAttribute(position, v).applyMatrix4(poseMatrix).toArray(outPosition, v * 3);
    poseVector.fromBufferAttribute(normal, v).applyMatrix3(poseNormal).normalize().toArray(outNormal, v * 3);
    poseVector.fromBufferAttribute(outline, v).applyMatrix3(poseNormal).normalize().toArray(outOutline, v * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(outPosition, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(outNormal, 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(outOutline, 3));
  const color = source.getAttribute('color');
  if (color !== undefined) geometry.setAttribute('color', new THREE.BufferAttribute((color.array as Float32Array).slice(), 3));
  geometry.setIndex(source.index);
  return geometry;
}

/** Where a rig's library is asked for rigs: `null` while one is still arriving. */
export interface RigSource {
  get(id: string): Rig | null;
}

// ---------------------------------------------------------------------------
// A coarser copy: the far one
// ---------------------------------------------------------------------------

/**
 * `geometry` with its vertices clustered onto a grid fine enough to leave about
 * `triangles` triangles: every vertex moves to the mean of its cell, triangles
 * whose corners share a cell vanish, and each surviving triangle keeps the
 * colour slot it had.
 *
 * **Why clustering and not three's `SimplifyModifier`**: measured on the
 * baked cow (2026-09-17) the modifier returned position counts not divisible
 * by three, and removing a fifth of the vertices took 2,450 triangles to 394.
 * Clustering is linear, cannot tear a triangle list, and a far animal needs a
 * silhouette rather than its eyelids. Normals are recomputed creased and the
 * ink's normals welded, as a bake does.
 */
export function coarsened(
  geometry: THREE.BufferGeometry,
  slot: Uint8Array,
  triangles: number,
): { geometry: THREE.BufferGeometry; slot: Uint8Array } {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const corners = index ? index.count : position.count;
  const cornerAt = (i: number) => (index ? index.getX(i) : i);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  let best: { positions: number[]; slots: number[] } | null = null;
  // The cell is searched rather than derived: how many triangles survive a grid
  // depends on the shape. Coarser each step until the count is under the target.
  for (let cells = 64; cells >= 6; cells = Math.floor(cells * 0.85)) {
    const cell = span / cells;
    const keyOf = (i: number) =>
      `${Math.round(position.getX(i) / cell)},${Math.round(position.getY(i) / cell)},${Math.round(position.getZ(i) / cell)}`;
    const sums = new Map<string, [number, number, number, number]>();
    for (let i = 0; i < position.count; i++) {
      const key = keyOf(i);
      const sum = sums.get(key);
      if (sum === undefined) sums.set(key, [position.getX(i), position.getY(i), position.getZ(i), 1]);
      else {
        sum[0] += position.getX(i);
        sum[1] += position.getY(i);
        sum[2] += position.getZ(i);
        sum[3]++;
      }
    }
    const seen = new Set<string>();
    const positions: number[] = [];
    const slots: number[] = [];
    for (let t = 0; t + 2 < corners; t += 3) {
      const keys = [keyOf(cornerAt(t)), keyOf(cornerAt(t + 1)), keyOf(cornerAt(t + 2))];
      if (keys[0] === keys[1] || keys[1] === keys[2] || keys[0] === keys[2]) continue;
      const signature = `${keys[0]}|${keys[1]}|${keys[2]}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      for (const key of keys) {
        const sum = sums.get(key)!;
        positions.push(sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]);
      }
      const s = slot[cornerAt(t)]!;
      slots.push(s, s, s);
    }
    best = { positions, slots };
    if (positions.length / 9 <= triangles) break;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(best!.positions, 3));
  out.computeVertexNormals();
  const creased = toCreasedNormals(out, CREASE);
  creased.setAttribute('outlineNormal', weldedNormals(creased));
  return { geometry: creased, slot: Uint8Array.from(best!.slots) };
}
