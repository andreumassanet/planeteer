/**
 * The kit: CC0 vehicles and animals -> public/models/{traffic,fauna}/*.bin
 *
 *   node scripts/build-kit.ts          # write every file
 *   node scripts/build-kit.ts --dry    # report and write nothing
 *
 * Sources, all CC0 1.0, downloaded to ../.cache/assets/ (see the LICENSE.txt
 * this writes beside the files, which names each one):
 *
 * - Kenney, "Car Kit" and "Watercraft Kit" (https://kenney.nl/assets), GLB,
 *   coloured through one small palette texture a kit.
 * - Quaternius, "Ultimate Animated Animals" (glTF), "Farm Animal Pack" (FBX),
 *   "Public Transport" (FBX/OBJ) (https://quaternius.com), flat colour a
 *   material.
 *
 * ## What a bake does, and why here rather than on load
 *
 * Everything `src/models.ts` does to a pack model — every node's transform
 * applied, a colour slot a material (or a palette swatch), creased normals for
 * the fill and a welded `outlineNormal` for the ink, and for an animal one
 * skinned body on its own skeleton with the clips the world plays — is done
 * once, here, and written out. The browser then reads a finished mesh: no
 * texture is decoded, no normal is welded and no FBX parser ships.
 *
 * Kenney's wheels are the one thing replaced rather than converted. Each is 332
 * triangles of a car that is about 700 without them, for a disc that is four
 * pixels at the distance traffic is seen; a 12-sided tyre and a hub are 72.
 *
 * The files are GLB, gzipped the way `public/data/*.bin` is — no CDN compresses
 * `application/octet-stream` — and read by `src/kit.ts`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync, inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { modelFrom, rigFrom, slotTable } from '../src/models.ts';
import type { Model, Rig } from '../src/models.ts';

// Node has no DOM: the loaders and the exporter want these three and nothing else.
const g = globalThis as Record<string, unknown>;
g.ProgressEvent ??= class extends Event {
  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type);
    Object.assign(this, init);
  }
};
g.self ??= globalThis;
g.FileReader ??= class {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const CACHE = new URL('../../.cache/assets/', import.meta.url).pathname;
const OUT = new URL('../public/models/', import.meta.url).pathname;
const DRY = process.argv.includes('--dry');

// ---------------------------------------------------------------------------
// PNG, for a palette atlas: 8-bit greyscale, RGB, palette and RGBA, no interlace
// ---------------------------------------------------------------------------

interface Pixels {
  width: number;
  height: number;
  rgba: Uint8Array;
}

function decodePng(file: string): Pixels {
  const bytes = readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  let palette: Buffer | null = null;
  let alpha: Buffer | null = null;
  const data: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      if (chunk[8] !== 8 || chunk[12] !== 0) throw new Error(`${file}: only 8-bit, non-interlaced PNG`);
      type = chunk[9]!;
    } else if (kind === 'PLTE') palette = chunk;
    else if (kind === 'tRNS') alpha = chunk;
    else if (kind === 'IDAT') data.push(chunk);
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type as 0 | 2 | 3 | 4 | 6];
  if (channels === undefined) throw new Error(`${file}: PNG colour type ${type}`);
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const out = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]!;
      const left = x >= channels ? out[row + x - channels]! : 0;
      const up = y > 0 ? out[row - stride + x]! : 0;
      const corner = y > 0 && x >= channels ? out[row - stride + x - channels]! : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      out[row + x] = (value + predicted) & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (type === 6) rgba.set(out.subarray(i * 4, i * 4 + 4), i * 4);
    else if (type === 2) rgba.set([out[i * 3]!, out[i * 3 + 1]!, out[i * 3 + 2]!, 255], i * 4);
    else if (type === 3) {
      const p = out[i]!;
      rgba.set([palette![p * 3]!, palette![p * 3 + 1]!, palette![p * 3 + 2]!, alpha?.[p] ?? 255], i * 4);
    } else {
      const v = out[i * channels]!;
      rgba.set([v, v, v, 255], i * 4);
    }
  }
  return { width, height, rgba };
}

function pngSwatch(texture: THREE.Texture, u: number, v: number, into: THREE.Color): boolean {
  const pixels = texture.userData.pixels as Pixels | undefined;
  if (pixels === undefined) return false;
  const wrap = (t: number) => t - Math.floor(t);
  const x = Math.min(pixels.width - 1, Math.floor(wrap(u) * pixels.width));
  const y = Math.min(pixels.height - 1, Math.floor(wrap(v) * pixels.height));
  const i = (y * pixels.width + x) * 4;
  into.setRGB(pixels.rgba[i]! / 255, pixels.rgba[i + 1]! / 255, pixels.rgba[i + 2]! / 255, THREE.SRGBColorSpace);
  return true;
}

// ---------------------------------------------------------------------------
// Loading any of the pack formats, in Node
// ---------------------------------------------------------------------------

interface Loaded {
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
async function loadGltf(file: string): Promise<Loaded> {
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
  const images = (json.images ?? []) as { uri?: string }[];
  const textures = (json.textures ?? []) as { source?: number }[];
  const pixelsByTexture = textures.map((texture) => {
    const uri = images[texture.source ?? -1]?.uri;
    return uri && !uri.startsWith('data:') ? decodePng(join(dirname(file), decodeURIComponent(uri))) : null;
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

function loadObj(file: string): Loaded {
  const loader = new OBJLoader();
  try {
    const materials = new MTLLoader().parse(readFileSync(file.replace(/\.obj$/i, '.mtl'), 'utf8'), '');
    materials.preload();
    loader.setMaterials(materials);
  } catch {
    // An OBJ without its MTL comes out white; the report will say so.
  }
  return { scene: loader.parse(readFileSync(file, 'utf8')), animations: [] };
}

function loadFbx(file: string): Loaded {
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

async function load(source: string): Promise<Loaded> {
  const file = join(CACHE, source);
  if (/\.(gltf|glb)$/i.test(file)) return loadGltf(file);
  if (/\.obj$/i.test(file)) return loadObj(file);
  if (/\.fbx$/i.test(file)) return loadFbx(file);
  throw new Error(`no loader for ${source}`);
}

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

const KENNEY_CARS = 'kenney/car-kit/Models/GLB format/';
const KENNEY_BOATS = 'kenney/watercraft-kit/Models/GLB format/';
const Q_TRANSPORT = 'quaternius/public-transport/';
const UAA = 'quaternius/ultimate-animated-animals/glTF/';
const FARM = 'quaternius/farm-animals/FBX/';

interface StaticEntry {
  /** What the traffic parts ask for. */
  id: string;
  source: string;
  /** Radians about Y that turn the pack's model to face +Z. */
  yaw?: number;
  /** Mesh names that are wheels, to be rebuilt as a tyre and a hub. */
  wheels?: RegExp;
}

const TRAFFIC: StaticEntry[] = [
  { id: 'hatchback-sports', source: `${KENNEY_CARS}hatchback-sports.glb`, wheels: /^wheel/ },
  { id: 'sedan', source: `${KENNEY_CARS}sedan.glb`, wheels: /^wheel/ },
  { id: 'sedan-sports', source: `${KENNEY_CARS}sedan-sports.glb`, wheels: /^wheel/ },
  { id: 'taxi', source: `${KENNEY_CARS}taxi.glb`, wheels: /^wheel/ },
  { id: 'suv', source: `${KENNEY_CARS}suv.glb`, wheels: /^wheel/ },
  { id: 'suv-luxury', source: `${KENNEY_CARS}suv-luxury.glb`, wheels: /^wheel/ },
  { id: 'van', source: `${KENNEY_CARS}van.glb`, wheels: /^wheel/ },
  { id: 'delivery', source: `${KENNEY_CARS}delivery.glb`, wheels: /^wheel/ },
  { id: 'delivery-flat', source: `${KENNEY_CARS}delivery-flat.glb`, wheels: /^wheel/ },
  { id: 'truck', source: `${KENNEY_CARS}truck.glb`, wheels: /^wheel/ },
  { id: 'truck-flat', source: `${KENNEY_CARS}truck-flat.glb`, wheels: /^wheel/ },
  { id: 'tractor', source: `${KENNEY_CARS}tractor.glb`, wheels: /^wheel/ },
  { id: 'bus', source: `${Q_TRANSPORT}FBX/Bus.fbx`, yaw: -Math.PI / 2 },
  { id: 'school-bus', source: `${Q_TRANSPORT}FBX/SchoolBus.fbx`, yaw: Math.PI / 2 },
  { id: 'ambulance', source: `${Q_TRANSPORT}FBX/Ambulance.fbx` },
  { id: 'bicycle', source: `${Q_TRANSPORT}OBJ/SquareFrameBicycle.obj`, yaw: Math.PI },
  { id: 'boat-row-small', source: `${KENNEY_BOATS}boat-row-small.glb` },
  { id: 'boat-row-large', source: `${KENNEY_BOATS}boat-row-large.glb` },
  { id: 'boat-sail-a', source: `${KENNEY_BOATS}boat-sail-a.glb` },
  { id: 'boat-sail-b', source: `${KENNEY_BOATS}boat-sail-b.glb` },
  { id: 'boat-fishing-small', source: `${KENNEY_BOATS}boat-fishing-small.glb` },
  { id: 'boat-tug-a', source: `${KENNEY_BOATS}boat-tug-a.glb` },
];

interface RigEntry {
  id: string;
  source: string;
  /** The clips the world plays; the rest of the pack's are fights and deaths. */
  clips: RegExp;
  /**
   * A hump grown on `bone`, as shares of the animal's own length and width, in
   * the material `slot`. There is no CC0 camel in this style, so the camel is a
   * pack animal with one: see `addHump`.
   */
  hump?: { bone: string; slot: string; length: number; height: number; width: number };
}

const FAUNA: RigEntry[] = [
  { id: 'cow', source: `${UAA}Cow.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  { id: 'bull', source: `${UAA}Bull.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  { id: 'horse', source: `${UAA}Horse.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  { id: 'donkey', source: `${UAA}Donkey.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  { id: 'alpaca', source: `${UAA}Alpaca.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  { id: 'stag', source: `${UAA}Stag.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  { id: 'deer', source: `${UAA}Deer.gltf`, clips: /^(Eating|Idle|Walk)$/ },
  // No CC0 camel exists in the style (see ../.cache/assets/INVENTORY.md), so
  // the camel is Quaternius's horse with a hump grown on its middle back. The
  // alpaca was tried as the base too and read as a llama with a lump; the
  // horse's long legs are most of what a camel's silhouette is.
  { id: 'camel', source: `${UAA}Horse.gltf`, clips: /^(Eating|Idle|Walk)$/, hump: { bone: 'Torso2', slot: 'Main', length: 0.38, height: 0.13, width: 0.72 } },
  { id: 'sheep', source: `${FARM}Sheep.fbx`, clips: /Idle$/ },
  { id: 'pig', source: `${FARM}Pig.fbx`, clips: /Idle$/ },
];

// ---------------------------------------------------------------------------
// Wheels
// ---------------------------------------------------------------------------

const TYRE = new THREE.MeshStandardMaterial({ name: 'Tyre', color: new THREE.Color().setStyle('#3a3a44', THREE.SRGBColorSpace) });
const HUB = new THREE.MeshStandardMaterial({ name: 'Hub', color: new THREE.Color().setStyle('#c8c8d8', THREE.SRGBColorSpace) });

/**
 * Swaps every wheel mesh under `root` for a 12-sided tyre and a hub of the same
 * bounding box, in the wheel's own place. The axle is the box's thinnest axis.
 */
function rebuildWheels(root: THREE.Object3D, pattern: RegExp): number {
  root.updateMatrixWorld(true);
  const wheels: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && pattern.test(object.name)) wheels.push(object as THREE.Mesh);
  });
  const parent = new THREE.Matrix4();
  for (const wheel of wheels) {
    const box = new THREE.Box3().setFromObject(wheel);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.y, Math.min(size.x, size.z)) / 2;
    const width = Math.min(size.x, size.z);
    const axleX = size.x <= size.z;
    const tyre = new THREE.CylinderGeometry(radius, radius, width, 12, 1, false);
    const hub = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width * 1.08, 12, 1, false);
    for (const geometry of [tyre, hub]) {
      geometry.rotateZ(Math.PI / 2);
      if (!axleX) geometry.rotateY(Math.PI / 2);
      geometry.translate(centre.x, centre.y, centre.z);
    }
    const group = new THREE.Group();
    group.add(new THREE.Mesh(tyre, TYRE), new THREE.Mesh(hub, HUB));
    // The new meshes are in the root's frame; put them where the wheel's parent is.
    const holder = wheel.parent!;
    parent.copy(holder.matrixWorld).invert().multiply(root.matrixWorld);
    group.applyMatrix4(parent);
    holder.add(group);
    wheel.removeFromParent();
  }
  return wheels.length;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Indexed again after creasing: the creased normals leave most corners shared. */
function indexed(model: Model): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', model.geometry.getAttribute('position'));
  geometry.setAttribute('normal', model.geometry.getAttribute('normal'));
  geometry.setAttribute('outlineNormal', model.geometry.getAttribute('outlineNormal'));
  const slot = new THREE.BufferAttribute(Uint8Array.from(model.slot), 1);
  geometry.setAttribute('slot', slot);
  for (const name of ['skinIndex', 'skinWeight']) {
    const attribute = model.geometry.getAttribute(name);
    if (attribute) geometry.setAttribute(name, attribute);
  }
  const merged = mergeVertices(geometry, 1e-5);
  merged.getAttribute('normal').normalized = false;
  const normal = merged.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, ...n.fromBufferAttribute(normal, i).normalize().toArray());
  return merged;
}

async function exportGlb(scene: THREE.Object3D, animations: THREE.AnimationClip[] = []): Promise<Buffer> {
  const result = await new GLTFExporter().parseAsync(scene, { binary: true, animations, onlyVisible: true });
  return Buffer.from(result as ArrayBuffer);
}

const material = new THREE.MeshStandardMaterial({ name: 'kit' });
const report: string[] = [];
const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

async function bakeTraffic(): Promise<number> {
  const scene = new THREE.Scene();
  let triangles = 0;
  for (const entry of TRAFFIC) {
    const loaded = await load(entry.source);
    const wheels = entry.wheels ? rebuildWheels(loaded.scene, entry.wheels) : 0;
    const holder = new THREE.Group();
    holder.rotation.y = entry.yaw ?? 0;
    holder.add(loaded.scene);
    const model = modelFrom(holder, entry.id, { swatch: pngSwatch });
    const geometry = indexed(model);
    geometry.userData.slots = slotTable(model);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = entry.id;
    mesh.userData.slots = slotTable(model);
    scene.add(mesh);
    const size = model.box.getSize(new THREE.Vector3());
    triangles += model.triangles;
    report.push(
      `  ${entry.id.padEnd(20)} ${String(model.triangles).padStart(5)} tris  ${String(geometry.getAttribute('position').count).padStart(5)} verts  ` +
        `${String(model.slots.length).padStart(3)} slots  ${wheels ? `${wheels} wheels  ` : ''}` +
        `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`,
    );
  }
  const glb = await exportGlb(scene);
  const packed = gzipSync(glb, { level: 9 });
  report.push(`traffic.bin  ${TRAFFIC.length} models  ${triangles} tris  ${kb(glb.length)} glb  ${kb(packed.length)} gzipped`);
  if (!DRY) {
    mkdirSync(join(OUT, 'traffic'), { recursive: true });
    writeFileSync(join(OUT, 'traffic', 'kit.bin'), packed);
  }
  return packed.length;
}

/**
 * Grows a hump on a rig's back: a low-poly ellipsoid hung off `bone`, sitting on
 * the top of the body where that bone runs, in the colour slot of the hide.
 * `rigFrom` then weights it wholly to the bone, the way it keeps a stag's
 * antlers, so the hump rides the spine through every clip.
 */
function addHump(scene: THREE.Group, hump: NonNullable<RigEntry['hump']>): void {
  scene.updateMatrixWorld(true);
  let body: THREE.SkinnedMesh | null = null;
  let bone: THREE.Bone | null = null;
  scene.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh && body === null) body = object as THREE.SkinnedMesh;
    if ((object as THREE.Bone).isBone && object.name === hump.bone) bone = object as THREE.Bone;
  });
  if (body === null || bone === null) throw new Error(`hump: no body or no bone ${hump.bone}`);
  const skinned = body as THREE.SkinnedMesh;
  const spine = bone as THREE.Bone;
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  const at = spine.getWorldPosition(new THREE.Vector3());
  // The top of the back over the bone: the highest skinned vertex near it.
  let top = -Infinity;
  const vertex = new THREE.Vector3();
  const reach = size.z * 0.12;
  for (let i = 0; i < skinned.geometry.getAttribute('position').count; i++) {
    skinned.getVertexPosition(i, vertex).applyMatrix4(skinned.matrixWorld);
    if (Math.abs(vertex.z - at.z) < reach && Math.abs(vertex.x - at.x) < size.x * 0.25) top = Math.max(top, vertex.y);
  }
  const material = (Array.isArray(skinned.material) ? skinned.material : [skinned.material]).find((m) => m.name === hump.slot);
  const geometry = new THREE.SphereGeometry(1, 9, 6);
  const mesh = new THREE.Mesh(geometry, material ?? new THREE.MeshStandardMaterial({ name: hump.slot }));
  mesh.scale.set((size.x * hump.width) / 2, size.z * hump.height, (size.z * hump.length) / 2);
  // Sunk most of the way into the back, so it grows out of the hide rather than sitting on it.
  mesh.position.set(at.x, top + mesh.scale.y * 0.2, at.z);
  scene.add(mesh);
  mesh.updateMatrixWorld(true);
  spine.attach(mesh);
}

async function bakeFauna(): Promise<number> {
  let total = 0;
  for (const entry of FAUNA) {
    const loaded = await load(entry.source);
    const clips = loaded.animations.filter((clip) => entry.clips.test(clip.name));
    if (clips.length === 0) throw new Error(`${entry.id}: no clip matches ${entry.clips}`);
    // FBX clips come named "Armature|Idle"; the world asks for "Idle".
    for (const clip of clips) {
      clip.name = clip.name.replace(/^.*\|/, '');
      // A key equal to its neighbours says nothing; most of a grazing clip's
      // bones do not move at all.
      clip.optimize();
    }
    if (entry.hump !== undefined) {
      // The hump is its own mesh, and a sibling mesh of the pack's material shares
      // the slot only if it is the same material object; the name is enough.
      addHump(loaded.scene, entry.hump);
    }
    const rig: Rig = rigFrom(loaded.scene, clips, entry.id, material);
    const geometry = indexed({ ...rig, geometry: rig.body.geometry } as unknown as Model);
    geometry.userData.slots = slotTable(rig);
    rig.body.geometry = geometry;
    rig.body.userData.slots = slotTable(rig);
    rig.body.material = material;
    rig.scene.name = entry.id;
    const glb = await exportGlb(rig.scene, clips);
    const packed = gzipSync(glb, { level: 9 });
    total += packed.length;
    const size = rig.box.getSize(new THREE.Vector3());
    report.push(
      `  ${entry.id.padEnd(8)} ${String(rig.triangles).padStart(5)} tris  ${String(geometry.getAttribute('position').count).padStart(5)} verts  ` +
        `${rig.body.skeleton.bones.length} bones  ${clips.map((c) => c.name).join(',')}  ` +
        `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}  ${kb(glb.length)} glb  ${kb(packed.length)} gzipped`,
    );
    if (!DRY) {
      mkdirSync(join(OUT, 'fauna'), { recursive: true });
      writeFileSync(join(OUT, 'fauna', `${entry.id}.bin`), packed);
    }
  }
  return total;
}

const LICENSE = `Vehicles and animals in this directory, rebuilt by scripts/build-kit.ts.
Geometry, colours and animation clips are unchanged except where the script
says: wheels rebuilt, materials merged into colour slots, normals creased.

Kenney (https://kenney.nl) — Car Kit, Watercraft Kit. License: CC0 1.0 Universal.
Quaternius (https://quaternius.com) — Ultimate Animated Animals, Farm Animal Pack,
Public Transport. License: CC0 1.0 Universal.
`;

const trafficBytes = await bakeTraffic();
const faunaBytes = await bakeFauna();
console.log(report.join('\n'));
console.log(`total ${kb(trafficBytes + faunaBytes)} gzipped`);
if (!DRY) {
  writeFileSync(join(OUT, 'traffic', 'LICENSE.txt'), LICENSE);
  writeFileSync(join(OUT, 'fauna', 'LICENSE.txt'), LICENSE);
}
