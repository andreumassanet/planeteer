// The floor, the decor and the water are one buffer each, cut into `SLOTS`
// fixed slots of one tile each: a tile coming or going rewrites its slot and
// nothing else. Three draw calls, none inked: under the water the surface
// already hides a hull, and a coral's outline at the pen's width is the coral.

import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { TILE_QUADS } from '../sea-floor.ts';
import type { Decor } from '../sea-floor.ts';
import { DECOR_CAP, GRID, SIDE, SLOTS } from './constants.ts';
import { floorMaterial, waterMaterial } from './materials.ts';
import { COLOURS, HEADROOM, SIZE, buildShapes, kelpHeight } from './shapes.ts';
import type { Tile } from './tiles.ts';

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

const frameEast = new THREE.Vector3();
const frameNorth = new THREE.Vector3();

/**
 * An item's frame: its foot a hair into the sand, +Y up, turned by its yaw.
 * `x`, `up` and `z` come out orthonormal with `x × up = z`, a proper rotation
 * (`pnpm sea` holds every placed item to it).
 */
export function decorFrame(item: Decor, x: THREE.Vector3, up: THREE.Vector3, z: THREE.Vector3, foot: THREE.Vector3): void {
  up.set(item.x, item.y, item.z).normalize();
  frameEast.set(0, 1, 0).cross(up);
  if (frameEast.lengthSq() < 1e-8) frameEast.set(1, 0, 0);
  frameEast.normalize();
  frameNorth.crossVectors(up, frameEast).normalize();
  const c = Math.cos(item.yaw);
  const s = Math.sin(item.yaw);
  // Turned by its yaw in the tangent plane, and Z taken as `X x up` so the
  // frame is right-handed: a mirrored frame would turn every piece inside out.
  x.copy(frameEast).multiplyScalar(c).addScaledVector(frameNorth, s);
  z.crossVectors(x, up);
  foot.copy(up).multiplyScalar(PLANET_RADIUS - item.depth - 0.12);
}

function dynamic(array: Float32Array | Uint8Array | Int8Array, itemSize: number, normalized = false): THREE.BufferAttribute {
  const attribute = new THREE.BufferAttribute(array, itemSize, normalized);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

function markRange(attribute: THREE.BufferAttribute, start: number, count: number): void {
  attribute.addUpdateRange(start * attribute.itemSize, count * attribute.itemSize);
  attribute.needsUpdate = true;
}

/** One index for both grids: every slot's quads, wound so each faces out (`U x W = N` on every face of the cube sphere). */
function slotIndex(): Uint16Array {
  const index = new Uint16Array(SLOTS * TILE_QUADS * TILE_QUADS * 6);
  let at = 0;
  for (let slot = 0; slot < SLOTS; slot++) {
    const base = slot * GRID;
    for (let i = 0; i < TILE_QUADS; i++) {
      for (let j = 0; j < TILE_QUADS; j++) {
        const v00 = base + i * SIDE + j;
        const v10 = base + (i + 1) * SIDE + j;
        const v11 = base + (i + 1) * SIDE + j + 1;
        const v01 = base + i * SIDE + j + 1;
        index[at++] = v00; index[at++] = v10; index[at++] = v11;
        index[at++] = v00; index[at++] = v11; index[at++] = v01;
      }
    }
  }
  return index;
}

/** The three meshes and the slots they share. */
export interface SlotBuffers {
  floorMesh: THREE.Mesh;
  decorMesh: THREE.Mesh;
  waterMesh: THREE.Mesh;
  /** Writes a ready tile into a free slot; false when none is free. */
  stand(tile: Tile): boolean;
  /** Takes a tile out of its slot: its vertices collapse to the centre, where nothing draws. */
  retire(tile: Tile): void;
}

export function createSlotBuffers(): SlotBuffers {
  const shapes = buildShapes();
  const freeSlots: number[] = [];
  for (let slot = SLOTS - 1; slot >= 0; slot--) freeSlots.push(slot);

  const floorGeometry = new THREE.BufferGeometry();
  const floorPosition = dynamic(new Float32Array(SLOTS * GRID * 3), 3);
  const floorColour = dynamic(new Uint8Array(SLOTS * GRID * 3), 3, true);
  const floorDepth = dynamic(new Float32Array(SLOTS * GRID), 1);
  const floorNormal = dynamic(new Int8Array(SLOTS * GRID * 3), 3, true);
  floorGeometry.setAttribute('position', floorPosition);
  floorGeometry.setAttribute('normal', floorNormal);
  floorGeometry.setAttribute('color', floorColour);
  floorGeometry.setAttribute('aDepth', floorDepth);

  const waterGeometry = new THREE.BufferGeometry();
  const waterPosition = dynamic(new Float32Array(SLOTS * GRID * 3), 3);
  const waterNormal = dynamic(new Int8Array(SLOTS * GRID * 3), 3, true);
  const waterColour = dynamic(new Uint8Array(SLOTS * GRID * 3), 3, true);
  const waterShore = dynamic(new Float32Array(SLOTS * GRID * 2), 2);
  const waterDepth = dynamic(new Float32Array(SLOTS * GRID), 1);
  waterGeometry.setAttribute('position', waterPosition);
  waterGeometry.setAttribute('normal', waterNormal);
  waterGeometry.setAttribute('color', waterColour);
  waterGeometry.setAttribute('aShore', waterShore);
  waterGeometry.setAttribute('aDepth', waterDepth);

  const index = slotIndex();
  floorGeometry.setIndex(new THREE.BufferAttribute(index, 1));
  waterGeometry.setIndex(new THREE.BufferAttribute(index.slice(), 1));

  const decorGeometry = new THREE.BufferGeometry();
  const decorPosition = dynamic(new Float32Array(SLOTS * DECOR_CAP * 3), 3);
  const decorColour = dynamic(new Uint8Array(SLOTS * DECOR_CAP * 3), 3, true);
  const decorSway = dynamic(new Float32Array(SLOTS * DECOR_CAP), 1);
  const decorDepth = dynamic(new Float32Array(SLOTS * DECOR_CAP), 1);
  const decorNormal = dynamic(new Int8Array(SLOTS * DECOR_CAP * 3), 3, true);
  decorGeometry.setAttribute('position', decorPosition);
  decorGeometry.setAttribute('normal', decorNormal);
  decorGeometry.setAttribute('color', decorColour);
  decorGeometry.setAttribute('aSway', decorSway);
  decorGeometry.setAttribute('aDepth', decorDepth);

  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial(false));
  floorMesh.name = 'sea-floor';
  floorMesh.receiveShadow = true;
  const decorMesh = new THREE.Mesh(decorGeometry, floorMaterial(true));
  decorMesh.name = 'sea-decor';
  const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial());
  waterMesh.name = 'sea-water';
  waterMesh.receiveShadow = true;
  // The buffers hold the whole resident disc and move with it; a bound would
  // be recomputed at every slot written, and the camera is always inside it.
  for (const mesh of [floorMesh, decorMesh, waterMesh]) {
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
  }

  const itemUp = new THREE.Vector3();
  const itemFoot = new THREE.Vector3();
  const itemX = new THREE.Vector3();
  const itemZ = new THREE.Vector3();
  const body = new THREE.Color();
  const tip = new THREE.Color();

  /** A tile's decor, written straight into its slot of the decor buffer; returns the vertices used. */
  function writeDecor(tile: Tile, slot: number): number {
    const decor = tile.lived?.decor ?? [];
    const positions = decorPosition.array as Float32Array;
    const colours = decorColour.array as Uint8Array;
    const sways = decorSway.array as Float32Array;
    const depths = decorDepth.array as Float32Array;
    const normals = decorNormal.array as Int8Array;
    const base = slot * DECOR_CAP;
    let n = 0;
    for (const item of decor) {
      const variants = shapes[item.kind];
      const shape = variants[Math.floor(item.tone * 997) % variants.length]!;
      const count = shape.position.length / 3;
      if (n + count > DECOR_CAP) break;
      decorFrame(item, itemX, itemUp, itemZ, itemFoot);
      const palette = COLOURS[item.kind];
      const pair = palette[Math.floor(item.tone * palette.length) % palette.length]!;
      body.setHex(pair[0]);
      tip.setHex(pair[1]);
      // Shrunk, whole, where the water is too shallow for it: a coral head on
      // the beach's first metre is a small one, not one through the surface.
      const natural = item.kind === 'kelp' ? kelpHeight(item.depth) : SIZE[item.kind] * item.scale;
      const fit = Math.min(1, Math.max(0, item.depth - HEADROOM) / (shape.top * natural));
      const size = SIZE[item.kind] * item.scale * fit;
      const tall = natural * fit;
      for (let k = 0; k < count; k++) {
        const lx = shape.position[k * 3]! * size;
        const ly = shape.position[k * 3 + 1]! * tall;
        const lz = shape.position[k * 3 + 2]! * size;
        const o = (base + n) * 3;
        positions[o] = itemFoot.x + itemX.x * lx + itemUp.x * ly + itemZ.x * lz;
        positions[o + 1] = itemFoot.y + itemX.y * lx + itemUp.y * ly + itemZ.y * lz;
        positions[o + 2] = itemFoot.z + itemX.z * lx + itemUp.z * ly + itemZ.z * lz;
        const c = shape.part[k] === 0 ? body : tip;
        // A little darker at the foot, which is the shade a clump casts on itself.
        const shade = 0.72 + 0.28 * clamp(shape.position[k * 3 + 1]! / 1.2, 0, 1);
        colours[o] = Math.round(clamp(c.r * shade, 0, 1) * 255);
        colours[o + 1] = Math.round(clamp(c.g * shade, 0, 1) * 255);
        colours[o + 2] = Math.round(clamp(c.b * shade, 0, 1) * 255);
        normals[o] = Math.round(itemUp.x * 127);
        normals[o + 1] = Math.round(itemUp.y * 127);
        normals[o + 2] = Math.round(itemUp.z * 127);
        sways[base + n] = shape.sway[k]! * (item.kind === 'kelp' ? tall / 10 : item.scale);
        depths[base + n] = Math.max(0, item.depth - ly);
        n++;
      }
    }
    positions.fill(0, (base + n) * 3, (base + DECOR_CAP) * 3);
    return n;
  }

  function stand(tile: Tile): boolean {
    const slot = freeSlots.pop();
    if (slot === undefined) return false;
    tile.slot = slot;
    const base = slot * GRID;
    (floorPosition.array as Float32Array).set(tile.floor, base * 3);
    (floorColour.array as Uint8Array).set(tile.floorColour, base * 3);
    (floorDepth.array as Float32Array).set(tile.floorDepth, base);
    (floorNormal.array as Int8Array).set(tile.waterNormal, base * 3);
    (waterPosition.array as Float32Array).set(tile.water, base * 3);
    (waterNormal.array as Int8Array).set(tile.waterNormal, base * 3);
    (waterColour.array as Uint8Array).set(tile.waterColour, base * 3);
    (waterShore.array as Float32Array).set(tile.waterShore, base * 2);
    (waterDepth.array as Float32Array).set(tile.waterDepth, base);
    for (const attribute of [floorPosition, floorColour, floorDepth, floorNormal, waterPosition, waterNormal, waterColour, waterShore, waterDepth]) {
      markRange(attribute, base, GRID);
    }
    writeDecor(tile, slot);
    for (const attribute of [decorPosition, decorColour, decorSway, decorDepth, decorNormal]) markRange(attribute, slot * DECOR_CAP, DECOR_CAP);
    tile.state = 'ready';
    return true;
  }

  function retire(tile: Tile): void {
    if (tile.slot < 0) return;
    const base = tile.slot * GRID;
    (floorPosition.array as Float32Array).fill(0, base * 3, (base + GRID) * 3);
    (waterPosition.array as Float32Array).fill(0, base * 3, (base + GRID) * 3);
    (decorPosition.array as Float32Array).fill(0, tile.slot * DECOR_CAP * 3, (tile.slot + 1) * DECOR_CAP * 3);
    markRange(floorPosition, base, GRID);
    markRange(waterPosition, base, GRID);
    markRange(decorPosition, tile.slot * DECOR_CAP, DECOR_CAP);
    freeSlots.push(tile.slot);
    tile.slot = -1;
  }

  return { floorMesh, decorMesh, waterMesh, stand, retire };
}
