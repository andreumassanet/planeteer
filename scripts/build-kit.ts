/**
 * Bakes the CC0 kit: vehicles, plants, buildings, animals and trains into
 * public/models/{traffic,nature,buildings,fauna,rail}/*.bin.
 *
 *   node scripts/build-kit.ts              # write every file
 *   node scripts/build-kit.ts --dry        # report and write nothing
 *   node scripts/build-kit.ts --only=rail  # one directory, the rest left as shipped
 *
 * Sources (all CC0 1.0, under ../.cache/assets/, credited in the LICENSE.txt
 * written beside each directory): Kenney's Car, Watercraft, Nature, City and
 * Train Kits; Quaternius's animals and public transport; KayKit packs; one
 * CreativeTrio model.
 *
 * Everything `src/models.ts` does to a pack model (transforms applied,
 * materials folded into colour slots, creased normals plus a welded
 * `outlineNormal`, rigs with only the clips the world plays) happens here
 * once, so the browser reads finished meshes. Kenney's wheels are replaced by
 * a 12-sided tyre and hub, a fraction of their triangles. Output is GLB,
 * gzipped (no CDN compresses `application/octet-stream`), read by `src/kit.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coarsened, modelFrom, posedGeometry, rigFrom, slotTable } from '../src/models.ts';
import type { Model, Rig } from '../src/models.ts';
import { pngSwatch } from './build-kit/images.ts';
import { loadFbx, loadGltf, loadObj } from './build-kit/loaders.ts';
import type { Loaded } from './build-kit/loaders.ts';
import { BUILDINGS, FAUNA, NATURE, RAIL, TRAFFIC } from './build-kit/manifest.ts';
import type { StaticEntry } from './build-kit/manifest.ts';
import { addHump, rebuildWheels } from './build-kit/reshape.ts';

const CACHE = new URL('../../.cache/assets/', import.meta.url).pathname;
const OUT = new URL('../public/models/', import.meta.url).pathname;
const DRY = process.argv.includes('--dry');

async function load(source: string): Promise<Loaded> {
  const file = join(CACHE, source);
  if (/\.(gltf|glb)$/i.test(file)) return loadGltf(file);
  if (/\.obj$/i.test(file)) return loadObj(file);
  if (/\.fbx$/i.test(file)) return loadFbx(file);
  throw new Error(`no loader for ${source}`);
}

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

async function bakeStatic(entries: StaticEntry[], file: string): Promise<number> {
  const scene = new THREE.Scene();
  let triangles = 0;
  for (const entry of entries) {
    const loaded = await load(entry.source);
    const wheels = entry.wheels ? rebuildWheels(loaded.scene, entry.wheels) : 0;
    const holder = new THREE.Group();
    holder.rotation.y = entry.yaw ?? 0;
    holder.add(loaded.scene);
    const grid = entry.grid;
    const swatch =
      grid === undefined
        ? pngSwatch
        : (texture: THREE.Texture, u: number, v: number, into: THREE.Color) =>
            pngSwatch(texture, (Math.floor((u - Math.floor(u)) * grid[0]) + 0.5) / grid[0], (Math.floor((v - Math.floor(v)) * grid[1]) + 0.5) / grid[1], into);
    const model = modelFrom(holder, entry.id, { swatch });
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
  report.push(`${file}  ${entries.length} models  ${triangles} tris  ${kb(glb.length)} glb  ${kb(packed.length)} gzipped`);
  if (!DRY) {
    mkdirSync(join(OUT, dirname(file)), { recursive: true });
    writeFileSync(join(OUT, file), packed);
  }
  return packed.length;
}

/**
 * Fixed frames of the clips a far herd holds still in, skinned at bake time
 * and coarsened to about `FAR_TRIANGLES` (`coarsened` in `src/models.ts`). A
 * near herd plays the clip from the same instant, so the swap changes detail
 * and not pose. Full rigs merged into far herds cost several times the
 * triangles for animals a dozen pixels long.
 */
const FAR_TRIANGLES = 600;
const FAR_FRAMES: readonly { clip: string; at: number }[] = [
  { clip: 'Eating', at: 0.2 },
  { clip: 'Eating', at: 0.6 },
  { clip: 'Idle', at: 0.4 },
];

function farFrames(rig: Rig): THREE.Mesh[] {
  // Posing moves the bones; the file has to keep the rest the pack exported.
  const rest = rig.body.skeleton.bones.map((bone) => [bone.position.clone(), bone.quaternion.clone(), bone.scale.clone()] as const);
  const meshes: THREE.Mesh[] = [];
  const seen = new Set<string>();
  for (const frame of FAR_FRAMES) {
    const clip = rig.clips.find((entry) => entry.name === frame.clip) ?? rig.clips.find((entry) => entry.name === 'Idle');
    if (clip === undefined) continue;
    const signature = `${clip.name}|${frame.at}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    const time = frame.at * clip.duration;
    const far = coarsened(posedGeometry(rig, clip.name, time), rig.slot, FAR_TRIANGLES);
    const model = { name: '', geometry: far.geometry, slot: far.slot, slots: rig.slots, defaults: rig.defaults } as unknown as Model;
    const geometry = indexed(model);
    geometry.userData.slots = slotTable(rig);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `far|${clip.name}|${time.toFixed(3)}`;
    mesh.userData.slots = slotTable(rig);
    meshes.push(mesh);
  }
  rig.body.skeleton.bones.forEach((bone, i) => {
    bone.position.copy(rest[i]![0]);
    bone.quaternion.copy(rest[i]![1]);
    bone.scale.copy(rest[i]![2]);
  });
  return meshes;
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
      // Drop redundant keys; most bones in a grazing clip do not move.
      clip.optimize();
    }
    if (entry.hump !== undefined) {
      // The hump is a separate mesh; it joins the hide's slot by material name.
      addHump(loaded.scene, entry.hump);
    }
    const rig: Rig = rigFrom(loaded.scene, clips, entry.id, material);
    const far = farFrames(rig);
    const geometry = indexed({ ...rig, geometry: rig.body.geometry } as unknown as Model);
    geometry.userData.slots = slotTable(rig);
    rig.body.geometry = geometry;
    rig.body.userData.slots = slotTable(rig);
    rig.body.material = material;
    rig.scene.name = entry.id;
    for (const mesh of far) rig.scene.add(mesh);
    const glb = await exportGlb(rig.scene, clips);
    for (const mesh of far) rig.scene.remove(mesh);
    const packed = gzipSync(glb, { level: 9 });
    total += packed.length;
    const size = rig.box.getSize(new THREE.Vector3());
    report.push(
      `  ${entry.id.padEnd(8)} ${String(rig.triangles).padStart(5)} tris  ${String(geometry.getAttribute('position').count).padStart(5)} verts  ` +
        `${rig.body.skeleton.bones.length} bones  ${clips.map((c) => c.name).join(',')}  ` +
        `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}  far ${far.map((m) => (m.geometry.index!.count / 3)).join('/')} tris  ${kb(glb.length)} glb  ${kb(packed.length)} gzipped`,
    );
    if (!DRY) {
      mkdirSync(join(OUT, 'fauna'), { recursive: true });
      writeFileSync(join(OUT, 'fauna', `${entry.id}.bin`), packed);
    }
  }
  return total;
}

const LICENSE = `The models in this directory, rebuilt by scripts/build-kit.ts.
Geometry, colours and animation clips are unchanged except where the script
says: wheels rebuilt, materials merged into colour slots, normals creased.

Kenney (https://kenney.nl) — Car Kit, Watercraft Kit, Nature Kit, City Kit (Suburban),
City Kit (Commercial), City Kit (Roads), Train Kit. License: CC0 1.0 Universal.
Quaternius (https://quaternius.com) — Ultimate Animated Animals, Farm Animal Pack,
Public Transport. License: CC0 1.0 Universal.
Kay Lousberg (https://www.kaylousberg.com) — KayKit Forest Nature Pack 1.0,
KayKit City Builder Bits 1.0. License: CC0 1.0 Universal.
CreativeTrio — Church (https://poly.pizza/m/GHzPfvoyzX). License: CC0 1.0 Universal.
`;

/** `--only=<directory>` bakes one directory and leaves the others' files as they are. */
const ONLY = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length) ?? null;
const bakes: [string, () => Promise<number>][] = [
  ['traffic', () => bakeStatic(TRAFFIC, 'traffic/kit.bin')],
  ['nature', () => bakeStatic(NATURE, 'nature/kit.bin')],
  ['buildings', () => bakeStatic(BUILDINGS, 'buildings/kit.bin')],
  ['fauna', () => bakeFauna()],
  ['rail', () => bakeStatic(RAIL, 'rail/kit.bin')],
];
let totalBytes = 0;
const baked: string[] = [];
for (const [directory, bake] of bakes) {
  if (ONLY !== null && ONLY !== directory) continue;
  totalBytes += await bake();
  baked.push(directory);
}
console.log(report.join('\n'));
console.log(`total ${kb(totalBytes)} gzipped`);
if (!DRY) {
  for (const directory of baked) writeFileSync(join(OUT, directory, 'LICENSE.txt'), LICENSE);
}
