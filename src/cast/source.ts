import * as THREE from 'three';
import { shadeByClouds } from '../cloud-shade.ts';
import { inflate } from '../pack.ts';
import type { PartSource, Source } from './types.ts';
import { BASE, CLIPS, CREASE, PARTS, bodyOf, partOf, type BodyKind, type ClipName, type OutfitId, type PartName, type Wardrobe, type WornPart } from './wardrobe.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One material for the whole cast, built by the caller so it shares the world's ramp. */
export function castMaterial(gradientMap: THREE.Texture, ink: { thickness: number; color: [number, number, number] }): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  // The hull rides smooth normals of its own (`outlineNormal`, see `assemble`).
  material.userData.outlineParameters = { ...ink, outlineNormal: true };
  // The hero's inkless copy in a closed cab (`player.ts`) keeps the hook. The
  // traveller's card draws the cast round the origin, where the shade's shell
  // (`SHADE_BAND`) is not.
  return shadeByClouds(material);
}

/**
 * Normals welded across every edge, by position: the hull's, not the fill's.
 *
 * The creased normals that keep a jacket's planes flat split the ink hull at
 * every crease, and on a figure forty units away the splits read as a furred,
 * broken line. The hull wants one closed skin, so it gets normals averaged over
 * every face that meets at a point, whatever the angle.
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
  const along = new THREE.Vector3();
  const own = new THREE.Vector3();
  for (let i = 0; i + 2 < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    // Area-weighted, so a sliver does not pull a corner off true.
    face.subVectors(c, b).cross(along.subVectors(b, a));
    if (face.dot(own.fromBufferAttribute(normal, i)) < 0) face.negate();
    for (let k = 0; k < 3; k++) {
      const key = keyOf(i + k);
      const sum = sums.get(key);
      if (sum === undefined) sums.set(key, face.clone());
      else sum.add(face);
    }
  }
  const out = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const n = own.copy(sums.get(keyOf(i))!).normalize();
    out[i * 3] = n.x;
    out[i * 3 + 1] = n.y;
    out[i * 3 + 2] = n.z;
  }
  return new THREE.BufferAttribute(out, 3);
}

/** Splits a loaded outfit into its rig and its parts. Material-free, so every cast shares it. */
export function split(outfit: OutfitId, gltf: { scene: THREE.Group }): Source {
  const scene = gltf.scene;
  const meshes: THREE.SkinnedMesh[] = [];
  const loose: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
    // A prop the bake did not strip would draw in the pack's own material, off
    // the world's ramp and without ink. Nothing unskinned belongs to a person.
    else if ((object as THREE.Mesh).isMesh) loose.push(object);
  });
  if (meshes.length === 0) throw new Error(`cast: ${outfit} has no skinned mesh`);
  for (const object of loose) object.removeFromParent();
  const skeleton = meshes[0]!.skeleton;
  if (meshes.some((mesh) => mesh.skeleton !== skeleton)) throw new Error(`cast: ${outfit} is on two skeletons`);
  // The pack's meshes sit under the armature with their own transforms baked
  // into the bind matrix; merging assumes they share one, and says so if not.
  if (meshes.some((mesh) => !mesh.bindMatrix.equals(meshes[0]!.bindMatrix))) {
    throw new Error(`cast: ${outfit} has parts with different bind matrices`);
  }

  const collected = new Map<PartName, { geometries: THREE.BufferGeometry[]; materials: { name: string; color: THREE.Color }[]; vertexMaterial: number[] }>();
  for (const mesh of meshes) {
    // A part of one material is its node's own mesh; a part of several is a
    // group named for the node, with a mesh a material under it.
    const part = partOf(mesh.name) ?? partOf(mesh.parent?.name ?? '');
    if (part === null) throw new Error(`cast: ${outfit} has a part called ${mesh.name} (${mesh.parent?.name})`);
    let entry = collected.get(part);
    if (entry === undefined) collected.set(part, (entry = { geometries: [], materials: [], vertexMaterial: [] }));
    const own = mesh.material as THREE.MeshStandardMaterial;
    let index = entry.materials.findIndex((known) => known.name === own.name);
    if (index < 0) {
      index = entry.materials.length;
      entry.materials.push({ name: own.name, color: own.color.clone() });
    }
    const source = mesh.geometry.clone();
    for (const name of Object.keys(source.attributes)) {
      if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(name)) source.deleteAttribute(name);
    }
    const creased = toCreasedNormals(source, CREASE);
    source.dispose();
    entry.geometries.push(creased);
    for (let v = 0; v < creased.getAttribute('position').count; v++) entry.vertexMaterial.push(index);
  }
  const parts = new Map<PartName, PartSource>();
  for (const [part, entry] of collected) {
    const geometry = mergeGeometries(entry.geometries, false);
    if (geometry === null) throw new Error(`cast: ${outfit}'s ${part} cannot merge`);
    for (const piece of entry.geometries) piece.dispose();
    parts.set(part, { geometry, materials: entry.materials, vertexMaterial: Uint8Array.from(entry.vertexMaterial) });
  }

  const anchor = meshes[0]!.parent!.name;
  const joints = skeleton.bones.map((bone) => bone.name);
  const inverses = skeleton.boneInverses.map((matrix) => matrix.clone());
  const bindMatrix = meshes[0]!.bindMatrix.clone();
  for (const mesh of meshes) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  return { outfit, bare: scene, anchor, joints, inverses, bindMatrix, parts };
}

/**
 * Every outfit's download and split, shared by every cast on the page: the
 * hero's, the crowd's and the traveller's card each build their own material
 * and templates, and none of them fetches or parses a file another has.
 */
export const sources = new Map<OutfitId, Promise<Source>>();
export let clipSource: Promise<Map<ClipName, THREE.AnimationClip>> | null = null;

export async function fetchGltf(file: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const response = await fetch(`${BASE}${file}.bin`);
  if (!response.ok) throw new Error(`cast: ${file} answered ${response.status}`);
  // Gzipped GLB, like the data: see `scripts/build-cast.mjs`.
  const raw = await inflate(await response.arrayBuffer());
  return new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, '');
}

export function sourceOf(outfit: OutfitId): Promise<Source> {
  let found = sources.get(outfit);
  if (found === undefined) {
    found = fetchGltf(outfit).then((gltf) => split(outfit, gltf));
    // A failed download is asked again by the next caller, not remembered.
    found.catch(() => sources.delete(outfit));
    sources.set(outfit, found);
  }
  return found;
}

export function clipsOf(): Promise<Map<ClipName, THREE.AnimationClip>> {
  if (clipSource === null) {
    // `retargeted` is the library's clips on this rig (`retarget-clips.ts`).
    clipSource = Promise.all([fetchGltf('clips'), fetchGltf('retargeted')]).then(([clipFile, libraryFile]) => {
      const clips = new Map<ClipName, THREE.AnimationClip>();
      for (const clip of [...clipFile.animations, ...libraryFile.animations]) {
        if ((CLIPS as readonly string[]).includes(clip.name)) clips.set(clip.name as ClipName, clip);
      }
      return clips;
    });
    clipSource.catch(() => (clipSource = null));
  }
  return clipSource;
}

/** A wardrobe's pool key: the same parts in any order are the same wardrobe. */
export function keyOf(wardrobe: Wardrobe): string {
  return PARTS.map((part) => wardrobe.find((worn) => worn.part === part))
    .filter((worn): worn is WornPart => worn !== undefined)
    .map((worn) => `${worn.outfit}.${worn.part}`)
    .join('+');
}

/** The parts of a wardrobe in slot order, one a slot, checked to be of one body. */
export function ordered(wardrobe: Wardrobe): WornPart[] {
  const list: WornPart[] = [];
  let body: BodyKind | null = null;
  for (const part of PARTS) {
    const worn = wardrobe.filter((entry) => entry.part === part);
    if (worn.length > 1) throw new Error(`cast: a wardrobe with two ${part}s`);
    if (worn.length === 0) continue;
    // The rucksack hangs off a chest both rigs share; every other part is its rig's.
    if (part !== 'pack') {
      const own = bodyOf(worn[0]!.outfit);
      if (body !== null && own !== body) throw new Error('cast: a wardrobe mixing the two bodies');
      body = own;
    }
    list.push(worn[0]!);
  }
  if (body === null) throw new Error('cast: a wardrobe with nothing but a rucksack');
  return list;
}
