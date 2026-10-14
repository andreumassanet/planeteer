import * as THREE from 'three';
import { shadeByClouds } from '../cloud-shade.ts';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
export const pixelCache = new WeakMap<object, { data: Uint8ClampedArray; width: number; height: number } | null>();
export function pixelsOf(texture: THREE.Texture): { data: Uint8ClampedArray; width: number; height: number } | null {
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

export function swatch(texture: THREE.Texture, u: number, v: number, into: THREE.Color): boolean {
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
