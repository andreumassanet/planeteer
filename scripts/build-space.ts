/**
 * The space kit: CC0 creatures, colony buildings, craft, props and a ship's
 * bridge for the other worlds and the title screen -> public/models/space/
 *
 *   node scripts/build-space.ts          # write every file
 *   node scripts/build-space.ts --dry    # report and write nothing
 *
 * Sources, all CC0 1.0, downloaded to ../.cache/assets/ (INVENTORY.md says
 * from where and when; `scripts/sources.json` records each pack's URL and the
 * hash of what was baked):
 *
 * - Quaternius, "Ultimate Space Kit" (glTF): the astronauts, the space kit's
 *   own aliens, the colony's buildings, rovers and spaceships, alien flora,
 *   rocks and pickups. One 512-pixel swatch atlas, 16-pixel swatches.
 * - Quaternius, "Ultimate Monsters" (glTF): the Big, Blob and Flying sets.
 *   One 1024-pixel swatch atlas, 32-pixel swatches.
 * - Kenney, "Space Kit" (GLB, flat material colours): craft, hangars, dishes,
 *   crystals, meteors, craters.
 * - Kenney, "Space Station Kit" (GLB, the City Kits' 16-by-4 gradient
 *   colormap): the ship's bridge — floor, walls, windows, consoles, seats.
 *
 * ## What a bake does
 *
 * The same as `build-kit.ts` does for the Earth's kit, so `src/models.ts`
 * reads the result with no new code: every node's transform applied, one
 * colour slot a material or an atlas swatch, creased normals for the fill and
 * a welded `outlineNormal` for the ink; a creature is one skinned body on its
 * own skeleton with only the clips the worlds play. The atlas packs are read
 * a swatch a triangle at its centroid, snapped to the middle of the swatch,
 * so a slot is one flat colour and the world's palette can replace it
 * (`onPalette`, applied by `src/space-kit.ts` unless asked for the pack's own).
 *
 * Every file is a gzipped GLB, like the kit's. `manifest.json` beside them
 * says what each holds — group, triangles, size, clips, source — so a loader
 * can list the kit without opening a file.
 *
 * The PNG decoder and the Node shims are the ones `build-kit.ts` carries; the
 * glTF loader here also reads images embedded in a `.gltf`'s data-URI buffer,
 * which is how both Quaternius packs ship their atlas.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync, inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { modelFrom, rigFrom, slotTable } from '../src/models.ts';
import type { Model, Rig } from '../src/models.ts';

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
const OUT = new URL('../public/models/space/', import.meta.url).pathname;
const DRY = process.argv.includes('--dry');

// ---------------------------------------------------------------------------
// PNG: 8-bit greyscale, RGB, palette and RGBA, no interlace
// ---------------------------------------------------------------------------

interface Pixels {
  width: number;
  height: number;
  rgba: Uint8Array;
}

function decodePng(label: string, bytes: Buffer): Pixels {
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
      if (chunk[8] !== 8 || chunk[12] !== 0) throw new Error(`${label}: only 8-bit, non-interlaced PNG`);
      type = chunk[9]!;
    } else if (kind === 'PLTE') palette = chunk;
    else if (kind === 'tRNS') alpha = chunk;
    else if (kind === 'IDAT') data.push(chunk);
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type as 0 | 2 | 3 | 4 | 6];
  if (channels === undefined) throw new Error(`${label}: PNG colour type ${type}`);
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
// glTF and GLB in Node, images decoded here rather than through a DOM
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
 * A textured mesh as one material a swatch: every triangle's colour read at
 * its centroid, the triangles sorted by it and grouped, each group a plain
 * material named `<material>#rrggbb`. What `modelFrom` does for a still
 * model, done ahead of `rigFrom` for a skinned one, which slots by material.
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
// The manifest
// ---------------------------------------------------------------------------

const Q_SPACE = 'quaternius/ultimate-space-kit/';
const Q_MONSTERS = 'quaternius/ultimate-monsters/';
const K_SPACE = 'kenney/space-kit/Models/GLTF format/';
const K_STATION = 'kenney/space-station-kit/Models/GLB format/';
/** Quaternius's two atlases: 32 swatches a side (16 px of 512, 32 px of 1024). */
const Q_GRID: [number, number] = [32, 32];
/** Kenney's colormap: 16 swatches by 4, each shaded top to bottom. */
const K_GRID: [number, number] = [16, 4];

/** The pack a source belongs to, for the manifest and the licence. */
function packOf(source: string): string {
  if (source.startsWith(Q_SPACE)) return 'Quaternius, Ultimate Space Kit';
  if (source.startsWith(Q_MONSTERS)) return 'Quaternius, Ultimate Monsters';
  if (source.startsWith(K_STATION)) return 'Kenney, Space Station Kit';
  if (source.startsWith(K_SPACE)) return 'Kenney, Space Kit';
  throw new Error(`no pack for ${source}`);
}

interface StaticEntry {
  id: string;
  source: string;
  /** Radians about Y that turn the pack's model to face +Z. */
  yaw?: number;
  grid?: [number, number];
  /** Free words for a consumer to choose by: `dome`, `ice`, `lava`, `seat`... */
  tags?: string[];
}

const q = (path: string, id: string, tags: string[] = [], yaw?: number): StaticEntry => ({ id, source: `${Q_SPACE}${path}.gltf`, grid: Q_GRID, tags, yaw });
const k = (name: string, id: string, tags: string[] = [], yaw?: number): StaticEntry => ({ id, source: `${K_SPACE}${name}.glb`, tags, yaw });
const st = (name: string, tags: string[] = []): StaticEntry => ({ id: name, source: `${K_STATION}${name}.glb`, grid: K_GRID, tags });

/** The colony: modules, domes, a hangar, the masts and dishes round them. */
const BUILDINGS: StaticEntry[] = [
  q('Environment/GLTF/Base_Large', 'base-large', ['hub']),
  q('Environment/GLTF/Building_L', 'building-l', ['module']),
  q('Environment/GLTF/GeodesicDome', 'geodesic-dome', ['dome']),
  q('Environment/GLTF/House_Cylinder', 'house-cylinder', ['module']),
  q('Environment/GLTF/House_Long', 'house-long', ['module']),
  q('Environment/GLTF/House_Open', 'house-open', ['module', 'door']),
  q('Environment/GLTF/House_OpenBack', 'house-open-back', ['module', 'door']),
  q('Environment/GLTF/House_Single', 'house-single', ['module']),
  q('Environment/GLTF/House_Single_Support', 'house-single-support', ['module', 'stilts']),
  q('Environment/GLTF/Connector', 'connector', ['tube']),
  q('Environment/GLTF/MetalSupport', 'metal-support', ['frame']),
  q('Environment/GLTF/Stairs', 'stairs', ['access']),
  q('Environment/GLTF/Ramp', 'ramp', ['access']),
  q('Environment/GLTF/Roof_Antenna', 'roof-antenna', ['roof']),
  q('Environment/GLTF/Roof_Radar', 'roof-radar', ['roof']),
  q('Environment/GLTF/Roof_Opening', 'roof-opening', ['roof']),
  q('Environment/GLTF/SolarPanel_Ground', 'solar-ground', ['power']),
  q('Environment/GLTF/SolarPanel_Structure', 'solar-array', ['power']),
  k('hangar_largeA', 'hangar-large', ['hangar']),
  k('hangar_roundA', 'hangar-round', ['hangar']),
  k('hangar_roundGlass', 'hangar-glass', ['hangar', 'dome']),
  k('hangar_smallA', 'hangar-small', ['hangar']),
  k('gate_complex', 'gate', ['gate']),
  k('satelliteDish_large', 'dish-large', ['mast']),
  k('satelliteDish_detailed', 'dish', ['mast']),
  k('machine_generatorLarge', 'generator', ['power']),
  k('machine_wireless', 'beacon', ['mast']),
  k('structure_detailed', 'scaffold', ['frame']),
];

/** What can be taken: rovers on the ground, ships for the sky. */
const CRAFT: StaticEntry[] = [
  q('Vehicles/GLTF/Rover_1', 'rover', ['ground']),
  q('Vehicles/GLTF/Rover_2', 'rover-cab', ['ground']),
  q('Vehicles/GLTF/Rover_Round', 'rover-round', ['ground']),
  q('Vehicles/GLTF/Spaceship_BarbaraTheBee', 'ship-bee', ['air']),
  q('Vehicles/GLTF/Spaceship_FernandoTheFlamingo', 'ship-flamingo', ['air']),
  q('Vehicles/GLTF/Spaceship_FinnTheFrog', 'ship-frog', ['air']),
  q('Vehicles/GLTF/Spaceship_RaeTheRedPanda', 'ship-panda', ['air']),
  k('rover', 'buggy', ['ground']),
  k('craft_speederA', 'speeder-a', ['air', 'hover']),
  k('craft_speederB', 'speeder-b', ['air', 'hover']),
  k('craft_speederD', 'speeder-d', ['air', 'hover']),
  k('craft_racer', 'racer', ['air']),
  k('craft_miner', 'miner', ['air', 'heavy']),
  k('craft_cargoA', 'cargo-a', ['air', 'heavy']),
  k('craft_cargoB', 'cargo-b', ['air', 'heavy']),
];

/** Rocks, crystals and the colony's clutter. */
const PROPS: StaticEntry[] = [
  ...['Rock_1', 'Rock_2', 'Rock_3', 'Rock_4'].map((n, i) => q(`Environment/GLTF/${n}`, `rock-${i + 1}`, ['rock'])),
  ...['Rock_Large_1', 'Rock_Large_2', 'Rock_Large_3'].map((n, i) => q(`Environment/GLTF/${n}`, `rock-large-${i + 1}`, ['rock', 'large'])),
  k('rock_crystals', 'crystals', ['crystal']),
  k('rock_crystalsLargeA', 'crystals-large-a', ['crystal', 'large']),
  k('rock_crystalsLargeB', 'crystals-large-b', ['crystal', 'large']),
  k('meteor_detailed', 'meteor', ['rock', 'meteor']),
  k('meteor_half', 'meteor-half', ['rock', 'meteor']),
  k('craterLarge', 'crater-large', ['crater']),
  k('crater', 'crater', ['crater']),
  k('bones', 'bones', ['remains']),
  k('barrels', 'barrels', ['clutter']),
  k('machine_barrel', 'tank', ['clutter']),
  q('Items/GLTF/Pickup_Crate', 'crate', ['clutter']),
  q('Items/GLTF/Pickup_Jar', 'jar', ['clutter']),
];

/** Alien plants: the space kit's trees, bushes and grass. */
const FLORA: StaticEntry[] = [
  ...['Blob_3', 'Floating_1', 'Lava_1', 'Lava_2', 'Lava_3', 'Light_1', 'Light_2', 'Spikes_1', 'Spikes_2', 'Spiral_1', 'Spiral_2', 'Spiral_3', 'Swirl_1', 'Swirl_2'].map((n) =>
    q(`Environment/GLTF/Tree_${n}`, `tree-${n.toLowerCase().replace('_', '-')}`, ['tree', n.split('_')[0]!.toLowerCase()]),
  ),
  ...['Bush_1', 'Bush_2', 'Bush_3', 'Plant_1', 'Plant_2', 'Plant_3', 'Grass_1', 'Grass_2', 'Grass_3'].map((n) =>
    q(`Environment/GLTF/${n}`, n.toLowerCase().replace('_', '-'), [n.split('_')[0]!.toLowerCase()]),
  ),
];

/** A ship's bridge: the Space Station Kit, and the Space Kit's desk seats. */
const INTERIOR: StaticEntry[] = [
  ...['floor', 'floor-detail', 'floor-corner', 'floor-panel', 'floor-panel-straight', 'floor-panel-end', 'floor-panel-corner'].map((n) => st(n, ['floor'])),
  ...['wall', 'wall-detail', 'wall-banner', 'wall-corner', 'wall-corner-round', 'wall-pillar', 'wall-switch'].map((n) => st(n, ['wall'])),
  ...['wall-window', 'wall-window-frame', 'wall-window-banner', 'wall-window-shutters'].map((n) => st(n, ['wall', 'window'])),
  ...['wall-door', 'wall-door-wide', 'door-double', 'door-single'].map((n) => st(n, ['wall', 'door'])),
  ...['computer', 'computer-screen', 'computer-system', 'computer-wide', 'display-wall', 'display-wall-wide'].map((n) => st(n, ['console'])),
  ...['table-display', 'table-display-planet', 'table-display-small', 'table', 'table-inset'].map((n) => st(n, ['table'])),
  ...['chair', 'chair-headrest', 'chair-armrest', 'chair-armrest-headrest', 'chair-cushion-headrest'].map((n) => st(n, ['seat'])),
  ...['container', 'container-tall', 'container-wide', 'pipe', 'pipe-bend', 'pipe-ring-colored', 'structure-panel', 'rail', 'stairs', 'stairs-handrail'].map((n) => st(n, ['fitting'])),
  k('desk_chairArms', 'desk-chair', ['seat']),
  k('desk_computerCorner', 'desk-console-corner', ['console']),
  k('desk_computerScreen', 'desk-console', ['console']),
];

/** `crew` are the astronauts; `walker`, `blob` and `flyer` the aliens, by how they move. */
type CreatureKind = 'crew' | 'walker' | 'blob' | 'flyer';

interface RigEntry {
  id: string;
  source: string;
  kind: CreatureKind;
  clips: RegExp;
  tags?: string[];
}

const BIG_CLIPS = /^(Idle|Walk|Run|Wave|Yes|No|Jump)$/;
const BLOB_CLIPS = /^(Idle|Walk|Dance|Yes|No|Jump)$/;
const FLY_CLIPS = /^(Flying_Idle|Fast_Flying|Yes|No)$/;
const CREW_CLIPS = /^(Idle|Walk|Run|Wave|Yes|No|Jump|Jump_Idle|Jump_Land)$/;

const big = (name: string, tags: string[] = []): RigEntry => ({ id: name.toLowerCase(), source: `${Q_MONSTERS}Big/glTF/${name}.gltf`, kind: 'walker', clips: BIG_CLIPS, tags });
const blob = (name: string, tags: string[] = []): RigEntry => ({ id: name.toLowerCase().replace('_', '-'), source: `${Q_MONSTERS}Blob/glTF/${name}.gltf`, kind: 'blob', clips: BLOB_CLIPS, tags });
const flyer = (name: string, tags: string[] = []): RigEntry => ({ id: name.toLowerCase(), source: `${Q_MONSTERS}Flying/glTF/${name}.gltf`, kind: 'flyer', clips: FLY_CLIPS, tags });

/**
 * The creatures. Chosen for shapes that read as another world's people and
 * not as Earth's fantasy: no orcs, ninjas, demons, wizards or skulls, which
 * the same packs carry.
 */
const CREATURES: RigEntry[] = [
  ...['BarbaraTheBee', 'FernandoTheFlamingo', 'FinnTheFrog', 'RaeTheRedPanda'].map(
    (name): RigEntry => ({ id: `astronaut-${name.replace(/^(\w+?)The/, '').toLowerCase()}`, source: `${Q_SPACE}Characters/GLTF/Astronaut_${name}.gltf`, kind: 'crew', clips: CREW_CLIPS }),
  ),
  { id: 'greyling', source: `${Q_SPACE}Characters/GLTF/Enemy_Large.gltf`, kind: 'walker', clips: BIG_CLIPS, tags: ['alien'] },
  { id: 'drifter', source: `${Q_SPACE}Characters/GLTF/Enemy_Flying.gltf`, kind: 'flyer', clips: FLY_CLIPS, tags: ['alien'] },
  big('Alien', ['alien']),
  big('Cactoro', ['desert']),
  big('MushroomKing', ['fungus']),
  big('Fish', ['water']),
  big('Frog', ['water']),
  big('Birb', ['feathered']),
  big('Monkroose', ['furred']),
  big('Yeti', ['ice']),
  blob('GreenBlob', ['slime']),
  blob('PinkBlob', ['slime']),
  blob('Mushnub', ['fungus']),
  flyer('Squidle', ['tentacled']),
  flyer('Glub', ['water']),
  flyer('Hywirl', ['wind']),
];

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
  // The exporter renormalises every normal it writes and says so once a mesh;
  // the creased normals are unit length already, so the message is noise.
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
    // The astronauts carry a pistol in the right hand; nobody here is armed.
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
