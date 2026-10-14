/** Loading the packs' glTF, GLB, OBJ and FBX files in Node. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { decodeJpeg, decodePng } from './images.ts';
import './node-shims.ts';

export interface Loaded {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const arrayBuffer = (file: string): ArrayBuffer => {
  const buffer = readFileSync(file);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};

/**
 * glTF and GLB. Images are taken out of the JSON before the loader sees it,
 * because it would decode them through the DOM; a PNG a material referenced is
 * decoded here instead and hung on a stand-in texture for `pngSwatch`.
 */
export async function loadGltf(file: string): Promise<Loaded> {
  let json: Record<string, unknown[] | undefined> & { buffers?: { uri?: string }[] };
  let bin: Buffer | null = null;
  const bytes = readFileSync(file);
  if (file.endsWith('.glb')) {
    const jsonLength = bytes.readUInt32LE(12);
    json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
    const binStart = 20 + jsonLength;
    if (binStart < bytes.length) bin = bytes.subarray(binStart + 8, binStart + 8 + bytes.readUInt32LE(binStart));
  } else {
    json = JSON.parse(bytes.toString('utf8'));
  }
  const images = (json.images ?? []) as { uri?: string; bufferView?: number; mimeType?: string }[];
  const textures = (json.textures ?? []) as { source?: number }[];
  const views = (json.bufferViews ?? []) as { byteOffset?: number; byteLength: number }[];
  const pixelsByTexture = textures.map((texture) => {
    const image = images[texture.source ?? -1];
    if (image?.uri !== undefined && !image.uri.startsWith('data:')) return decodePng(join(dirname(file), decodeURIComponent(image.uri)));
    // An image in the GLB's own binary chunk (JPEG or PNG).
    if (image?.bufferView !== undefined && bin !== null) {
      const view = views[image.bufferView]!;
      const data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      return image.mimeType === 'image/jpeg' ? decodeJpeg(file, data) : decodePng(file, data);
    }
    return null;
  });
  const mapOf = new Map<number, number>();
  for (const [index, material] of ((json.materials ?? []) as { pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }[]).entries()) {
    const texture = material.pbrMetallicRoughness?.baseColorTexture?.index;
    if (texture !== undefined) mapOf.set(index, texture);
    delete material.pbrMetallicRoughness?.baseColorTexture;
  }
  delete json.images;
  delete json.textures;
  delete json.samplers;
  // Re-embed the binary chunk (or external .bin) as a data URI for `parse`.
  for (const buffer of json.buffers ?? []) {
    if (buffer.uri === undefined && bin !== null) buffer.uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
    else if (buffer.uri !== undefined && !buffer.uri.startsWith('data:')) {
      buffer.uri = `data:application/octet-stream;base64,${readFileSync(join(dirname(file), decodeURIComponent(buffer.uri))).toString('base64')}`;
    }
  }
  const text = new TextEncoder().encode(JSON.stringify(json));
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[]; parser: { json: unknown; getDependency(type: string, index: number): Promise<unknown> } }>(
    (resolve, reject) => new GLTFLoader().parse(text.buffer as ArrayBuffer, '', resolve as never, reject),
  );
  for (const [materialIndex, textureIndex] of mapOf) {
    const pixels = pixelsByTexture[textureIndex];
    if (!pixels) continue;
    const material = (await gltf.parser.getDependency('material', materialIndex)) as THREE.MeshStandardMaterial;
    const stand = new THREE.Texture();
    stand.userData.pixels = pixels;
    // Every mesh using this material shares the one instance the parser cached.
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const own of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (own.name === material.name) (own as THREE.MeshStandardMaterial).map = stand;
      }
    });
  }
  return { scene: gltf.scene, animations: gltf.animations };
}

/** OBJ with its MTL beside it, if there is one. */
export function loadObj(file: string): Loaded {
  const loader = new OBJLoader();
  try {
    const materials = new MTLLoader().parse(readFileSync(file.replace(/\.obj$/i, '.mtl'), 'utf8'), '');
    materials.preload();
    loader.setMaterials(materials);
  } catch {
    // An OBJ without its MTL comes out white; the report will say so.
  }
  const scene = loader.parse(readFileSync(file, 'utf8'));
  // Blender writes an MTL's `Kd` in linear light but `MTLLoader` reads it as sRGB.
  const seen = new Set<THREE.Material>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(material)) continue;
      seen.add(material);
      (material as THREE.MeshPhongMaterial).color?.convertLinearToSRGB();
    }
  });
  return { scene, animations: [] };
}

/** FBX, with the loader's per-vertex warnings silenced. */
export function loadFbx(file: string): Loaded {
  const warn = console.warn;
  // The pack's FBX weights some vertices to five bones and the loader says so once a vertex.
  console.warn = () => {};
  try {
    const group = new FBXLoader().parse(arrayBuffer(file), '');
    return { scene: group, animations: group.animations };
  } finally {
    console.warn = warn;
  }
}
