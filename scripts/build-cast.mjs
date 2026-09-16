// The cast: CC0 characters -> public/models/cast/*.glb
//
// Source: Quaternius, "Ultimate Modular Men Pack" and "Ultimate Modular Women
// Pack" (CC0 1.0, https://quaternius.com/packs/ultimatemodularcharacters.html
// and .../ultimatemodularwomen.html), the glTF files under "Individual
// Characters/glTF" on the packs' Google Drive, downloaded to
// ../.cache/assets/quaternius/modular/{men,women}/. Every outfit shares one
// 62-joint rig ("CharacterArmature") and the same 24 clips.
//
// What this does, and why it is a bake rather than a copy:
// - The packs ship .gltf with the buffer as base64, which is a third larger than
//   binary. This writes .glb.
// - Every outfit carries the same 24 clips. They are written once, into
//   clips.glb, keeping only the ones the world plays, and stripped from the
//   outfits — which is most of each file.
// - Unused accessors and buffer views are dropped, so what is stripped is gone
//   from the bytes and not only from the JSON.
//
// usage: node scripts/build-cast.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = new URL('../../.cache/assets/quaternius/modular/', import.meta.url).pathname;
const OUT = new URL('../public/models/cast/', import.meta.url).pathname;

/** Outfit id -> source file. The id is what the code asks for. */
export const OUTFITS = {
  'man-adventurer': 'men/Adventurer.gltf',
  'man-beach': 'men/Beach.gltf',
  'man-casual': 'men/Casual_2.gltf',
  'man-hoodie': 'men/Casual_Hoodie.gltf',
  'man-farmer': 'men/Farmer.gltf',
  'man-punk': 'men/Punk.gltf',
  'man-suit': 'men/Suit.gltf',
  'man-worker': 'men/Worker.gltf',
  'woman-adventurer': 'women/Adventurer.gltf',
  'woman-casual': 'women/Casual.gltf',
  'woman-formal': 'women/Formal.gltf',
  'woman-medieval': 'women/Medieval.gltf',
  'woman-punk': 'women/Punk.gltf',
  'woman-suit': 'women/Suit.gltf',
  'woman-worker': 'women/Worker.gltf',
};

/** Mesh nodes that are things held rather than worn. */
const PROPS = /pistol|sword|gun|rifle|knife|axe|shield/i;

/** The clips the world plays. The rest of the pack's 24 are weapons and fights. */
const CLIPS = ['Idle', 'Idle_Neutral', 'Walk', 'Run', 'Wave', 'Interact', 'Roll'];
/** The outfit the clips are taken from; any would do, the rig is shared. */
const CLIP_SOURCE = 'men/Casual_Hoodie.gltf';

function readGltf(file) {
  const json = JSON.parse(readFileSync(join(SOURCE, file), 'utf8'));
  if (json.buffers.length !== 1) throw new Error(`${file}: expected one buffer`);
  const uri = json.buffers[0].uri;
  const bin = uri.startsWith('data:')
    ? Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')
    : readFileSync(join(SOURCE, file, '..', decodeURIComponent(uri)));
  return { json, bin };
}

/**
 * Keeps only what is reachable from meshes, skins, animations and images, and
 * rewrites the buffer to hold exactly that, 4-byte aligned.
 */
function compact({ json, bin }) {
  const usedAccessors = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      for (const a of Object.values(p.attributes)) usedAccessors.add(a);
      if (p.indices !== undefined) usedAccessors.add(p.indices);
      for (const t of p.targets ?? []) for (const a of Object.values(t)) usedAccessors.add(a);
    }
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) usedAccessors.add(skin.inverseBindMatrices);
  for (const anim of json.animations ?? []) for (const s of anim.samplers) { usedAccessors.add(s.input); usedAccessors.add(s.output); }

  const accessorMap = new Map();
  const accessors = [];
  [...usedAccessors].sort((a, b) => a - b).forEach((old) => { accessorMap.set(old, accessors.length); accessors.push(json.accessors[old]); });

  const usedViews = new Set(accessors.map((a) => a.bufferView).filter((v) => v !== undefined));
  for (const img of json.images ?? []) if (img.bufferView !== undefined) usedViews.add(img.bufferView);
  const viewMap = new Map();
  const views = [];
  const chunks = [];
  let offset = 0;
  for (const old of [...usedViews].sort((a, b) => a - b)) {
    const view = { ...json.bufferViews[old] };
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    view.byteOffset = offset;
    view.buffer = 0;
    chunks.push(bytes);
    offset += bytes.length;
    viewMap.set(old, views.length);
    views.push(view);
  }
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }

  for (const a of accessors) if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
  for (const img of json.images ?? []) if (img.bufferView !== undefined) img.bufferView = viewMap.get(img.bufferView);
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = accessorMap.get(p.attributes[k]);
      if (p.indices !== undefined) p.indices = accessorMap.get(p.indices);
      for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = accessorMap.get(t[k]);
    }
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessorMap.get(skin.inverseBindMatrices);
  for (const anim of json.animations ?? []) for (const s of anim.samplers) { s.input = accessorMap.get(s.input); s.output = accessorMap.get(s.output); }

  json.accessors = accessors;
  json.bufferViews = views;
  json.buffers = [{ byteLength: offset }];
  return { json, bin: Buffer.concat(chunks) };
}

function writeGlb(path, { json, bin }) {
  const text = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = Buffer.alloc((4 - (text.length % 4)) % 4, 0x20);
  const jsonChunk = Buffer.concat([text, jsonPad]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  const out = Buffer.concat([header, jh, jsonChunk, bh, bin]);
  writeFileSync(path, out);
  return out.length;
}

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [id, file] of Object.entries(OUTFITS)) {
  const gltf = readGltf(file);
  gltf.json.animations = [];
  // Props the gun and sword clips hold — a pistol skinned to the suit's hand, a
  // sword parented to the medieval dress's finger — ship as meshes of their own.
  // Nobody in this world carries one, and nothing unskinned belongs to a body.
  for (const node of gltf.json.nodes) {
    if (node.mesh === undefined) continue;
    if (node.skin === undefined || PROPS.test(node.name)) {
      console.log(`  ${id}: dropped '${node.name}'`);
      // Emptied as well as unlinked, so `compact` drops its bytes too.
      gltf.json.meshes[node.mesh].primitives = [];
      delete node.mesh;
      delete node.skin;
    }
  }
  // No textures anywhere in the packs, so texture coordinates are dead weight.
  for (const mesh of gltf.json.meshes) for (const p of mesh.primitives) delete p.attributes.TEXCOORD_0;
  const bytes = writeGlb(join(OUT, `${id}.glb`), compact(gltf));
  const tris = gltf.json.meshes.reduce((s, m) => s + m.primitives.reduce((t, p) => t + gltf.json.accessors[p.indices].count / 3, 0), 0);
  total += bytes;
  console.log(`${id.padEnd(18)} ${String(tris).padStart(6)} tris  ${(bytes / 1024).toFixed(0).padStart(5)} KB`);
}
{
  const gltf = readGltf(CLIP_SOURCE);
  gltf.json.animations = gltf.json.animations.filter((a) => CLIPS.includes(a.name));
  const missing = CLIPS.filter((c) => !gltf.json.animations.some((a) => a.name === c));
  if (missing.length) throw new Error(`missing clips: ${missing.join(', ')}`);
  // The clips need the skeleton's nodes to bind to by name, and nothing else.
  gltf.json.meshes = [];
  gltf.json.materials = [];
  gltf.json.skins = [];
  for (const node of gltf.json.nodes) { delete node.mesh; delete node.skin; }
  const bytes = writeGlb(join(OUT, 'clips.glb'), compact(gltf));
  total += bytes;
  console.log(`clips.glb          ${CLIPS.length} clips  ${(bytes / 1024).toFixed(0).padStart(5)} KB`);
}
writeFileSync(
  join(OUT, 'LICENSE.txt'),
  'Characters and animations by Quaternius (https://quaternius.com), from the\n' +
    'Ultimate Modular Men Pack and Ultimate Modular Women Pack.\n' +
    'License: CC0 1.0 Universal (public domain dedication).\n' +
    'Rebuilt as .glb by scripts/build-cast.mjs; geometry and clips unchanged.\n',
);
console.log(`total ${(total / 1024).toFixed(0)} KB`);
