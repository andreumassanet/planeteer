/**
 * Bakes the space kit: CC0 creatures, colony buildings, craft, props, flora
 * and a ship's bridge for the other worlds and the title screen, into
 * public/models/space/.
 *
 *   node scripts/build-space.ts          # write every file
 *   node scripts/build-space.ts --dry    # report and write nothing
 *
 * Sources (all CC0 1.0, under ../.cache/assets/, recorded in
 * `scripts/sources.json`): Quaternius's Ultimate Space Kit and Ultimate
 * Monsters (glTF, swatch atlases), Kenney's Space Kit (flat colours) and
 * Space Station Kit (gradient colormap).
 *
 * The bake does what `build-kit.ts` does, so `src/models.ts` reads the result
 * unchanged. Atlas textures are read one swatch per triangle at its centroid,
 * snapped to the swatch's middle, so each slot is one flat colour the world's
 * palette can replace (`src/space-kit.ts`). Each file is a gzipped GLB;
 * `manifest.json` lists what each holds.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { modelFrom, rigFrom, slotTable } from '../src/models.ts';
import type { Model, Rig } from '../src/models.ts';
import { decodePng } from './build-kit/images.ts';
import type { Pixels } from './build-kit/images.ts';
import './build-kit/node-shims.ts';
import { BUILDINGS, CRAFT, CREATURES, FLORA, INTERIOR, PROPS, Q_GRID, packOf } from './build-space/manifest.ts';
import type { CreatureKind, StaticEntry } from './build-space/manifest.ts';

const CACHE = new URL('../../.cache/assets/', import.meta.url).pathname;
const OUT = new URL('../public/models/space/', import.meta.url).pathname;
const DRY = process.argv.includes('--dry');

/** A swatch reader for an atlas of `grid` swatches, read at each swatch's middle. */
function swatchReader(grid: [number, number] | undefined) {
  return (texture: THREE.Texture, u: number, v: number, into: THREE.Color): boolean => {
    const pixels = texture.userData.pixels as Pixels | undefined;
    if (pixels === undefined) return false;
    const wrap = (t: number) => t - Math.floor(t);
    let x = wrap(u);
    let y = wrap(v);
    if (grid !== undefined) {
      x = (Math.floor(x * grid[0]) + 0.5) / grid[0];
      y = (Math.floor(y * grid[1]) + 0.5) / grid[1];
    }
    const px = Math.min(pixels.width - 1, Math.floor(x * pixels.width));
    const py = Math.min(pixels.height - 1, Math.floor(y * pixels.height));
    const i = (py * pixels.width + px) * 4;
    into.setRGB(pixels.rgba[i]! / 255, pixels.rgba[i + 1]! / 255, pixels.rgba[i + 2]! / 255, THREE.SRGBColorSpace);
    return true;
  };
}

// ---------------------------------------------------------------------------
// glTF and GLB in Node, with images decoded here rather than through a DOM.
// Unlike the kit's loader, this one also reads images embedded in a buffer.
// ---------------------------------------------------------------------------

interface Loaded {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

interface GltfJson {
  buffers?: { uri?: string; byteLength: number }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
  images?: { uri?: string; bufferView?: number; mimeType?: string }[];
  textures?: { source?: number }[];
  materials?: { name?: string; pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }[];
  [key: string]: unknown;
}

async function loadGltf(source: string): Promise<Loaded> {
  const file = join(CACHE, source);
  const bytes = readFileSync(file);
  let json: GltfJson;
  let glbBin: Buffer | null = null;
  if (file.endsWith('.glb')) {
    const jsonLength = bytes.readUInt32LE(12);
    json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
    const binStart = 20 + jsonLength;
    if (binStart < bytes.length) glbBin = bytes.subarray(binStart + 8, binStart + 8 + bytes.readUInt32LE(binStart));
  } else {
    json = JSON.parse(bytes.toString('utf8'));
  }
  const buffers = (json.buffers ?? []).map((buffer) => {
    if (buffer.uri === undefined) return glbBin!;
    if (buffer.uri.startsWith('data:')) return Buffer.from(buffer.uri.slice(buffer.uri.indexOf(',') + 1), 'base64');
    return readFileSync(join(dirname(file), decodeURIComponent(buffer.uri)));
  });
  const views = json.bufferViews ?? [];
  const pixelsOfImage = (json.images ?? []).map((image, i) => {
    if (image.uri !== undefined && !image.uri.startsWith('data:')) {
      const path = join(dirname(file), decodeURIComponent(image.uri));
      return decodePng(path, readFileSync(path));
    }
    if (image.bufferView !== undefined) {
      const view = views[image.bufferView]!;
      const data = buffers[view.buffer]!.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      if (image.mimeType !== undefined && image.mimeType !== 'image/png') throw new Error(`${source}: image ${i} is ${image.mimeType}`);
      return decodePng(`${source}#${i}`, Buffer.from(data));
    }
    return null;
  });
  const mapOf = new Map<number, Pixels>();
  for (const [index, material] of (json.materials ?? []).entries()) {
    const texture = material.pbrMetallicRoughness?.baseColorTexture?.index;
    const pixels = texture === undefined ? null : pixelsOfImage[json.textures?.[texture]?.source ?? -1];
    if (pixels) mapOf.set(index, pixels);
    delete material.pbrMetallicRoughness?.baseColorTexture;
  }
  delete json.images;
  delete json.textures;
  delete json.samplers;
  json.buffers = (json.buffers ?? []).map((buffer, i) => ({
    byteLength: buffer.byteLength,
    uri: `data:application/octet-stream;base64,${buffers[i]!.toString('base64')}`,
  }));
  const text = new TextEncoder().encode(JSON.stringify(json));
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[]; parser: { getDependency(type: string, index: number): Promise<unknown> } }>(
    (resolve, reject) => new GLTFLoader().parse(text.buffer as ArrayBuffer, '', resolve as never, reject),
  );
  for (const [materialIndex, pixels] of mapOf) {
    const material = (await gltf.parser.getDependency('material', materialIndex)) as THREE.MeshStandardMaterial;
    const stand = new THREE.Texture();
    stand.userData.pixels = pixels;
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const own of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (own === material || own.name === material.name) (own as THREE.MeshStandardMaterial).map = stand;
      }
    });
  }
  return { scene: gltf.scene, animations: gltf.animations };
}

/**
 * Splits a textured mesh into one plain material per swatch colour
 * (`<material>#rrggbb`), reading each triangle at its centroid. `modelFrom`
 * does this for still models; skinned ones need it before `rigFrom`.
 */
function swatchesToGroups(root: THREE.Object3D, read: ReturnType<typeof swatchReader>): void {
  const colour = new THREE.Color();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
    if (!materials.some((m) => m.map)) return;
    const source = mesh.geometry.index !== null ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const count = source.getAttribute('position').count / 3;
    const groups = mesh.geometry.groups.length > 0 ? mesh.geometry.groups : [{ start: 0, count: count * 3, materialIndex: 0 }];
    const uv = source.getAttribute('uv');
    const keys: string[] = new Array(count);
    const colours = new Map<string, THREE.Color>();
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0] ?? materials[0]!;
      for (let t = Math.floor(group.start / 3); t < Math.floor((group.start + group.count) / 3); t++) {
        let key = material.name || 'material';
        const base = material.color ?? new THREE.Color(1, 1, 1);
        colour.copy(base);
        if (material.map && uv) {
          const u = (uv.getX(t * 3) + uv.getX(t * 3 + 1) + uv.getX(t * 3 + 2)) / 3;
          const v = (uv.getY(t * 3) + uv.getY(t * 3 + 1) + uv.getY(t * 3 + 2)) / 3;
          if (read(material.map, u, v, colour)) {
            colour.multiply(base);
            key = `${key}#${colour.getHexString(THREE.SRGBColorSpace)}`;
          }
        }
        keys[t] = key;
        if (!colours.has(key)) colours.set(key, colour.clone());
      }
    }
    const order = [...keys.keys()].sort((a, b) => (keys[a]! < keys[b]! ? -1 : keys[a]! > keys[b]! ? 1 : a - b));
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      if (name === 'uv') continue;
      const size = attribute.itemSize;
      const array = new (attribute.array.constructor as Float32ArrayConstructor)(attribute.array.length);
      order.forEach((t, k) => array.set((attribute.array as Float32Array).subarray(t * 3 * size, (t + 1) * 3 * size), k * 3 * size));
      geometry.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized));
    }
    const names = [...new Set(order.map((t) => keys[t]!))];
    let start = 0;
    names.forEach((name, i) => {
      let n = 0;
      while (start + n < order.length && keys[order[start + n]!] === name) n++;
      geometry.addGroup(start * 3, n * 3, i);
      start += n;
    });
    mesh.geometry = geometry;
    mesh.material = names.map((name) => new THREE.MeshStandardMaterial({ name, color: colours.get(name)! }));
  });
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function indexed(model: Pick<Model, 'geometry' | 'slot'>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', model.geometry.getAttribute('position'));
  geometry.setAttribute('normal', model.geometry.getAttribute('normal'));
  geometry.setAttribute('outlineNormal', model.geometry.getAttribute('outlineNormal'));
  geometry.setAttribute('slot', new THREE.BufferAttribute(Uint8Array.from(model.slot), 1));
  for (const name of ['skinIndex', 'skinWeight']) {
    const attribute = model.geometry.getAttribute(name);
    if (attribute) geometry.setAttribute(name, attribute);
  }
  const merged = mergeVertices(geometry, 1e-5);
  const normal = merged.getAttribute('normal');
  normal.normalized = false;
  const n = new THREE.Vector3();
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, ...n.fromBufferAttribute(normal, i).normalize().toArray());
  return merged;
}

async function exportGlb(scene: THREE.Object3D, animations: THREE.AnimationClip[] = []): Promise<Buffer> {
  // Silence the exporter's per-mesh normalisation warning; the normals are unit length.
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (!String(args[0]).includes('normalized normal')) warn(...args);
  };
  try {
    const result = await new GLTFExporter().parseAsync(scene, { binary: true, animations, onlyVisible: true });
    return Buffer.from(result as ArrayBuffer);
  } finally {
    console.warn = warn;
  }
}

/** One row of `manifest.json`. */
interface Row {
  id: string;
  group: string;
  file: string;
  pack: string;
  source: string;
  triangles: number;
  /** Bounding box size in the pack's own units, x by y by z, rounded to a hundredth. */
  size: [number, number, number];
  slots: number;
  tags: string[];
  kind?: CreatureKind;
  bones?: number;
  clips?: { name: string; seconds: number }[];
  bytes?: number;
}

const material = new THREE.MeshStandardMaterial({ name: 'space' });
const rows: Row[] = [];
const files: { file: string; bytes: number; raw: number }[] = [];
const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;
const rounded = (v: THREE.Vector3): [number, number, number] => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];

function write(file: string, glb: Buffer): number {
  const packed = gzipSync(glb, { level: 9 });
  files.push({ file, bytes: packed.length, raw: glb.length });
  if (!DRY) {
    mkdirSync(dirname(join(OUT, file)), { recursive: true });
    writeFileSync(join(OUT, file), packed);
  }
  return packed.length;
}

async function bakeStatic(group: string, entries: StaticEntry[]): Promise<void> {
  const scene = new THREE.Scene();
  const file = `${group}.bin`;
  for (const entry of entries) {
    const loaded = await loadGltf(entry.source);
    const holder = new THREE.Group();
    holder.rotation.y = entry.yaw ?? 0;
    holder.add(loaded.scene);
    const model = modelFrom(holder, entry.id, { swatch: swatchReader(entry.grid) });
    const geometry = indexed(model);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = entry.id;
    mesh.userData.slots = slotTable(model);
    scene.add(mesh);
    rows.push({
      id: entry.id,
      group,
      file,
      pack: packOf(entry.source),
      source: entry.source,
      triangles: model.triangles,
      size: rounded(model.box.getSize(new THREE.Vector3())),
      slots: model.slots.length,
      tags: entry.tags ?? [],
    });
  }
  write(file, await exportGlb(scene));
}

async function bakeCreatures(): Promise<void> {
  for (const entry of CREATURES) {
    const loaded = await loadGltf(entry.source);
    const clips = loaded.animations.filter((clip) => entry.clips.test(clip.name.replace(/^.*\|/, '')));
    if (clips.length === 0) throw new Error(`${entry.id}: no clip matches ${entry.clips}`);
    for (const clip of clips) {
      clip.name = clip.name.replace(/^.*\|/, '');
      clip.optimize();
    }
    // Remove the astronauts' pistols.
    const weapons: THREE.Object3D[] = [];
    loaded.scene.traverse((object) => {
      if ((object as THREE.Mesh).isMesh && !(object as THREE.SkinnedMesh).isSkinnedMesh && /pistol|gun|weapon|sword/i.test(object.name)) weapons.push(object);
    });
    for (const weapon of weapons) weapon.removeFromParent();
    swatchesToGroups(loaded.scene, swatchReader(Q_GRID));
    const rig: Rig = rigFrom(loaded.scene, clips, entry.id, material);
    const geometry = indexed({ geometry: rig.body.geometry, slot: rig.slot });
    geometry.userData.slots = slotTable(rig);
    rig.body.geometry = geometry;
    rig.body.userData.slots = slotTable(rig);
    rig.body.material = material;
    rig.scene.name = entry.id;
    const file = `creatures/${entry.id}.bin`;
    const bytes = write(file, await exportGlb(rig.scene, clips));
    rows.push({
      id: entry.id,
      group: 'creatures',
      file,
      pack: packOf(entry.source),
      source: entry.source,
      triangles: rig.triangles,
      size: rounded(rig.box.getSize(new THREE.Vector3())),
      slots: rig.slots.length,
      tags: entry.tags ?? [],
      kind: entry.kind,
      bones: rig.body.skeleton.bones.length,
      clips: clips.map((clip) => ({ name: clip.name, seconds: Math.round(clip.duration * 100) / 100 })),
      bytes,
    });
  }
}

const LICENSE = `The models in this directory, rebuilt by scripts/build-space.ts.
Geometry, colours and animation clips are unchanged except where the script
says: textures read into flat colour slots, parts merged, normals creased,
clips the worlds do not play left out.

Quaternius (https://quaternius.com) — Ultimate Space Kit
(https://quaternius.com/packs/ultimatespacekit.html) and Ultimate Monsters
(https://quaternius.com/packs/ultimatemonsters.html).
License: CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/).

Kenney (https://kenney.nl) — Space Kit (https://kenney.nl/assets/space-kit) and
Space Station Kit (https://kenney.nl/assets/space-station-kit).
License: CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/).
`;

await bakeStatic('buildings', BUILDINGS);
await bakeStatic('craft', CRAFT);
await bakeStatic('props', PROPS);
await bakeStatic('flora', FLORA);
await bakeStatic('interior', INTERIOR);
await bakeCreatures();

for (const row of rows) {
  const extra = row.clips ? `  ${row.bones} bones  ${row.clips.map((c) => c.name).join(',')}  ${kb(row.bytes!)}` : '';
  console.log(`  ${row.group.padEnd(9)} ${row.id.padEnd(24)} ${String(row.triangles).padStart(6)} tris  ${String(row.slots).padStart(3)} slots  ${row.size.join(' x ')}${extra}`);
}
for (const f of files.filter((f) => !f.file.startsWith('creatures/'))) console.log(`${f.file.padEnd(16)} ${kb(f.raw)} glb  ${kb(f.bytes)} gzipped`);
const total = files.reduce((sum, f) => sum + f.bytes, 0);
const creatureBytes = files.filter((f) => f.file.startsWith('creatures/')).reduce((sum, f) => sum + f.bytes, 0);
console.log(`creatures ${kb(creatureBytes)} gzipped in ${CREATURES.length} files; total ${kb(total)} gzipped`);
if (!DRY) {
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({ baked: 'scripts/build-space.ts', models: rows }, null, 1)}\n`);
  writeFileSync(join(OUT, 'LICENSE.txt'), LICENSE);
}
