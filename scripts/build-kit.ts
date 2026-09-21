/**
 * The kit: CC0 vehicles, plants, buildings and animals -> public/models/{traffic,nature,buildings,fauna}/*.bin
 *
 *   node scripts/build-kit.ts          # write every file
 *   node scripts/build-kit.ts --dry    # report and write nothing
 *
 * Sources, all CC0 1.0, downloaded to ../.cache/assets/ (see the LICENSE.txt
 * this writes beside the files, which names each one):
 *
 * - Kenney, "Car Kit", "Watercraft Kit", "City Kit (Suburban)", "City Kit
 *   (Commercial)" and "City Kit (Roads)" (https://kenney.nl/assets), GLB,
 *   coloured through one small palette texture a kit; "Nature Kit", GLB in flat
 *   material colours.
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
import { coarsened, modelFrom, posedGeometry, rigFrom, slotTable } from '../src/models.ts';
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

function decodePng(file: string, bytes: Buffer = readFileSync(file)): Pixels {
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
 * A baseline JPEG, **to the average colour of each 8-by-8 block**: the DC
 * coefficients and nothing else, the AC ones decoded only to be skipped.
 *
 * Enough for a palette atlas, which is flat swatches much larger than a block,
 * and it is what CreativeTrio's church ships its colours in — the one
 * candidate the bake had turned away (2026-09-17) because it read PNG only.
 * Every pixel of a block takes the block's colour; chroma is read at its own
 * sampling. No progressive JPEG, no arithmetic coding.
 */
function decodeJpeg(label: string, bytes: Uint8Array): Pixels {
  const quant: number[] = [];
  const tables = new Map<number, Map<number, number>>();
  let width = 0;
  let height = 0;
  let restart = 0;
  let components: { id: number; h: number; v: number; tq: number; td: number; ta: number; dc: Float32Array; columns: number }[] = [];
  let offset = 2;
  let scan = -1;
  while (offset < bytes.length && scan < 0) {
    if (bytes[offset] !== 0xff) throw new Error(`${label}: JPEG marker expected at ${offset}`);
    const marker = bytes[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    const segment = bytes.subarray(offset + 2, offset + length);
    if (marker === 0xdb) {
      for (let i = 0; i < segment.length; ) {
        const wide = segment[i]! >> 4;
        quant[segment[i]! & 15] = wide ? (segment[i + 1]! << 8) | segment[i + 2]! : segment[i + 1]!;
        i += 1 + 64 * (wide ? 2 : 1);
      }
    } else if (marker === 0xc4) {
      for (let i = 0; i < segment.length; ) {
        const key = segment[i]!;
        const counts = segment.subarray(i + 1, i + 17);
        const codes = new Map<number, number>();
        let code = 0;
        let at = i + 17;
        for (let length = 1; length <= 16; length++) {
          for (let k = 0; k < counts[length - 1]!; k++) codes.set((length << 16) | code++, segment[at++]!);
          code <<= 1;
        }
        tables.set(key, codes);
        i = at;
      }
    } else if (marker === 0xc0 || marker === 0xc1) {
      height = (segment[1]! << 8) | segment[2]!;
      width = (segment[3]! << 8) | segment[4]!;
      components = Array.from({ length: segment[5]! }, (_, k) => ({
        id: segment[6 + k * 3]!,
        h: segment[7 + k * 3]! >> 4,
        v: segment[7 + k * 3]! & 15,
        tq: segment[8 + k * 3]!,
        td: 0,
        ta: 0,
        dc: new Float32Array(0),
        columns: 0,
      }));
    } else if (marker === 0xc2 || marker === 0xc3 || marker >= 0xc5 && marker <= 0xcf && marker !== 0xc8 && marker !== 0xcc) {
      throw new Error(`${label}: only baseline JPEG (marker ${marker.toString(16)})`);
    } else if (marker === 0xdd) {
      restart = (segment[0]! << 8) | segment[1]!;
    } else if (marker === 0xda) {
      for (let k = 0; k < segment[0]!; k++) {
        const component = components.find((entry) => entry.id === segment[1 + k * 2])!;
        component.td = segment[2 + k * 2]! >> 4;
        component.ta = segment[2 + k * 2]! & 15;
      }
      scan = offset + length;
    }
    offset += length;
  }
  const hMax = Math.max(...components.map((c) => c.h));
  const vMax = Math.max(...components.map((c) => c.v));
  const mcuColumns = Math.ceil(width / (8 * hMax));
  const mcuRows = Math.ceil(height / (8 * vMax));
  for (const c of components) {
    c.columns = mcuColumns * c.h;
    c.dc = new Float32Array(c.columns * mcuRows * c.v);
  }

  let at = scan;
  let buffer = 0;
  let bits = 0;
  const bit = (): number => {
    if (bits === 0) {
      let byte = bytes[at++] ?? 0;
      if (byte === 0xff) {
        const next = bytes[at] ?? 0;
        if (next === 0) at++;
        else byte = 0;
      }
      buffer = byte;
      bits = 8;
    }
    bits--;
    return (buffer >> bits) & 1;
  };
  const receive = (count: number): number => {
    let value = 0;
    for (let k = 0; k < count; k++) value = (value << 1) | bit();
    return value;
  };
  const extend = (value: number, count: number): number => (count === 0 ? 0 : value < 1 << (count - 1) ? value - (1 << count) + 1 : value);
  const decode = (codes: Map<number, number>): number => {
    let code = 0;
    for (let length = 1; length <= 16; length++) {
      code = (code << 1) | bit();
      const symbol = codes.get((length << 16) | code);
      if (symbol !== undefined) return symbol;
    }
    throw new Error(`${label}: bad Huffman code at ${at}`);
  };

  const predictors = components.map(() => 0);
  for (let mcu = 0; mcu < mcuColumns * mcuRows; mcu++) {
    if (restart > 0 && mcu > 0 && mcu % restart === 0) {
      bits = 0;
      while (at < bytes.length && !(bytes[at] === 0xff && bytes[at + 1]! >= 0xd0 && bytes[at + 1]! <= 0xd7)) at++;
      at += 2;
      predictors.fill(0);
    }
    const mx = mcu % mcuColumns;
    const my = Math.floor(mcu / mcuColumns);
    components.forEach((c, index) => {
      for (let v = 0; v < c.v; v++) {
        for (let h = 0; h < c.h; h++) {
          const size = decode(tables.get(c.td)!);
          predictors[index]! += extend(receive(size), size);
          c.dc[(my * c.v + v) * c.columns + mx * c.h + h] = (predictors[index]! * quant[c.tq]!) / 8 + 128;
          for (let k = 1; k < 64; ) {
            const rs = decode(tables.get(0x10 | c.ta)!);
            const run = rs >> 4;
            const magnitude = rs & 15;
            if (magnitude === 0) {
              if (run !== 15) break;
              k += 16;
              continue;
            }
            k += run;
            receive(magnitude);
            k++;
          }
        }
      }
    });
  }

  const rgba = new Uint8Array(width * height * 4);
  const sample = (c: (typeof components)[number], x: number, y: number) =>
    c.dc[Math.floor((y * c.v) / vMax / 8) * c.columns + Math.floor((x * c.h) / hMax / 8)]!;
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const Y = sample(components[0]!, x, y);
      const i = (y * width + x) * 4;
      if (components.length === 1) {
        rgba.set([clamp(Y), clamp(Y), clamp(Y), 255], i);
        continue;
      }
      const cb = sample(components[1]!, x, y) - 128;
      const cr = sample(components[2]!, x, y) - 128;
      rgba.set([clamp(Y + 1.402 * cr), clamp(Y - 0.344136 * cb - 0.714136 * cr), clamp(Y + 1.772 * cb), 255], i);
    }
  }
  return { width, height, rgba };
}

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
  const images = (json.images ?? []) as { uri?: string; bufferView?: number; mimeType?: string }[];
  const textures = (json.textures ?? []) as { source?: number }[];
  const views = (json.bufferViews ?? []) as { byteOffset?: number; byteLength: number }[];
  const pixelsByTexture = textures.map((texture) => {
    const image = images[texture.source ?? -1];
    if (image?.uri !== undefined && !image.uri.startsWith('data:')) return decodePng(join(dirname(file), decodeURIComponent(image.uri)));
    // An image in the GLB's own binary chunk: CreativeTrio's are JPEG.
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

function loadObj(file: string): Loaded {
  const loader = new OBJLoader();
  try {
    const materials = new MTLLoader().parse(readFileSync(file.replace(/\.obj$/i, '.mtl'), 'utf8'), '');
    materials.preload();
    loader.setMaterials(materials);
  } catch {
    // An OBJ without its MTL comes out white; the report will say so.
  }
  const scene = loader.parse(readFileSync(file, 'utf8'));
  // Blender writes an MTL's `Kd` in linear light and `MTLLoader` reads it as
  // sRGB, so every Quaternius OBJ came out a stop and a half too dark.
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
  /**
   * The atlas's swatch grid, columns by rows, when its swatches are gradients.
   * Kenney's City Kits shade half their swatches top to bottom, and a wall's big
   * triangles span one: read at each centroid, one wall comes out in a patchwork
   * of tones. Snapped to the swatch's middle, a swatch is one colour.
   */
  grid?: [number, number];
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

const KENNEY_NATURE = 'kenney/nature-kit/Models/GLTF format/';
const KAYKIT_FOREST = 'kaykit/forest-nature-pack/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf/';

/**
 * The flora (Kenney's Nature Kit, CC0): every tree, bush, cactus, rock and tuft
 * the vegetation field and a town's yards stand, a few models a part. Flat
 * material colours, 16 to 230 triangles — the one nature pack whose weight fits
 * a field of thousands of plants; Quaternius's Ultimate Nature is 900 to 2,900
 * a tree (see *The kit* in `docs/built.md`).
 */
const NATURE: StaticEntry[] = [
  ...['tree_oak', 'tree_default', 'tree_fat', 'tree_tall', 'tree_simple'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  ...['tree_pineTallA', 'tree_pineTallB', 'tree_pineRoundC', 'tree_pineDefaultA', 'tree_pineSmallA'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  ...['tree_palmTall', 'tree_palm', 'tree_palmBend', 'tree_plateau', 'tree_cone'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  ...['cactus_tall', 'cactus_short', 'plant_bushLarge', 'plant_bush', 'plant_bushDetailed'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  ...['stone_largeA', 'stone_largeB', 'stone_largeC', 'stone_largeD', 'grass_leafs', 'plant_flatTall', 'plant_flatShort', 'flower_redA', 'flower_yellowA'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  ...['flower_purpleA', 'flower_redC', 'flower_yellowC'].map((name) => ({ id: name.replace(/_/g, '-'), source: `${KENNEY_NATURE}${name}.glb` })),
  // The sward (`vegetation.ts`): KayKit's single-sided grass clumps, 14 to 168
  // triangles, two heights in three sizes each. Single-sided, because the sward
  // draws both faces and gives every blade the ground's normal.
  ...['1_A', '1_B', '1_C', '2_A', '2_B', '2_C'].map((name) => ({ id: `grass-${name.replace('_', '-').toLowerCase()}`, source: `${KAYKIT_FOREST}Grass_${name}_Singlesided_Color1.gltf` })),
];

const KENNEY_SUBURBAN = 'kenney/city-kit-suburban/Models/GLB format/';
const KENNEY_COMMERCIAL = 'kenney/city-kit-commercial/Models/GLB format/';
const KENNEY_ROADS = 'kenney/city-kit-roads/Models/GLB format/';
/** Both City Kits' `colormap.png`: 16 swatches by 4, each 32 by 128 pixels. */
const CITY_GRID: [number, number] = [16, 4];

/**
 * The buildings of a near town in the regions that have them in the style:
 * Kenney's City Kits (CC0) — suburban houses, commercial blocks, towers. The
 * heaviest Kenney models are left out: every house kept is under 1,650
 * triangles and every block under 1,900.
 */
const BUILDINGS: StaticEntry[] = [
  ...['a', 'c', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 'u'].map((t) => ({ id: `suburban-${t}`, source: `${KENNEY_SUBURBAN}building-type-${t}.glb`, grid: CITY_GRID })),
  ...['a', 'b', 'c', 'd', 'e', 'f', 'h'].map((t) => ({ id: `commercial-${t}`, source: `${KENNEY_COMMERCIAL}building-${t}.glb`, grid: CITY_GRID })),
  ...['a', 'b', 'c', 'd', 'e'].map((t) => ({ id: `skyscraper-${t}`, source: `${KENNEY_COMMERCIAL}building-skyscraper-${t}.glb`, grid: CITY_GRID })),
  // Street furniture, from Kenney's City Kit (Roads).
  { id: 'lamp-curved', source: `${KENNEY_ROADS}light-curved.glb` },
  { id: 'lamp-square', source: `${KENNEY_ROADS}light-square.glb` },
  { id: 'traffic-light', source: `${KENNEY_ROADS}traffic-light.glb` },
  // CreativeTrio's clapboard church (Poly Pizza, CC0, https://poly.pizza/m/GHzPfvoyzX),
  // coloured through a JPEG palette in the GLB (`decodeJpeg`).
  { id: 'church-clapboard', source: 'polypizza/church-creativetrio/church-creativetrio.glb' },
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
  // No CC0 camel exists in the style (see ../.cache/assets/INVENTORY.md), so
  // the camel is Quaternius's horse with a hump grown on its middle back. The
  // alpaca was tried as the base too and read as a llama with a lump; the
  // horse's long legs are most of what a camel's silhouette is.
  { id: 'camel', source: `${UAA}Horse.gltf`, clips: /^(Eating|Idle|Walk)$/, hump: { bone: 'Torso2', slot: 'Main', length: 0.38, height: 0.13, width: 0.72 } },
  { id: 'sheep', source: `${FARM}Sheep.fbx`, clips: /Idle$/ },
  // The deer and the pig were baked here too, 335 KB and 90 KB that no species
  // read: the reindeer is the stag's rig and the pig has no region to stand
  // in. Nothing is baked that nothing loads; the lab shows both from the pack.
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

/**
 * The far herd's animals: fixed frames of the clips a herd holds still in,
 * skinned at bake time and clustered to about `FAR_TRIANGLES` (`coarsened` in
 * `src/models.ts`). A merged herd is drawn from these and a near one plays the
 * clip from the same instant, so the swap between them is a change of detail
 * and not of pose.
 *
 * **Why they exist**: merging the full rigs took a Finnmark herd scene from
 * 18,432 triangles to 182,336 and Ulm at detail 3 from 56,928 to 291,550
 * (`pnpm fauna`, 2026-09-17). A grazing animal at the far reach of a herd is a
 * dozen pixels long.
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
City Kit (Commercial), City Kit (Roads). License: CC0 1.0 Universal.
Quaternius (https://quaternius.com) — Ultimate Animated Animals, Farm Animal Pack,
Public Transport. License: CC0 1.0 Universal.
Kay Lousberg (https://www.kaylousberg.com) — KayKit Forest Nature Pack 1.0.
License: CC0 1.0 Universal.
CreativeTrio — Church (https://poly.pizza/m/GHzPfvoyzX). License: CC0 1.0 Universal.
`;

const trafficBytes = await bakeStatic(TRAFFIC, 'traffic/kit.bin');
const natureBytes = await bakeStatic(NATURE, 'nature/kit.bin');
const buildingBytes = await bakeStatic(BUILDINGS, 'buildings/kit.bin');
const faunaBytes = await bakeFauna();
console.log(report.join('\n'));
console.log(`total ${kb(trafficBytes + natureBytes + buildingBytes + faunaBytes)} gzipped`);
if (!DRY) {
  for (const directory of ['traffic', 'nature', 'buildings', 'fauna']) writeFileSync(join(OUT, directory, 'LICENSE.txt'), LICENSE);
}
