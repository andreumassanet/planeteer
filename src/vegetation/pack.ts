/** Packs a tile's placed plants into vertex buffers, quantised to bytes where it does not show. */
import * as THREE from 'three';
import { WIND_REACH } from '../foliage.ts';
import { MACHINE_BED } from '../craft/parked.ts';
import type { Solid } from '../scenery/solids.ts';
import type { CountryMachine } from '../countryside-tile.ts';
import type { Placed } from './frame.ts';
import type { TileMachine } from './tiles.ts';

export interface Packed {
  geometry: THREE.BufferGeometry;
  /** The leaf cards' geometry, or null when the tile has none. */
  cardGeometry: THREE.BufferGeometry | null;
  machines: TileMachine[];
}

/*
 * Normals and the ink's normals are signed bytes, colours unsigned bytes: a
 * normal's worst error is a quarter of a degree against a four-band ramp, and
 * it halves the memory of the field. Bytes a vertex: 12 position, 3 normal, 3
 * colour, 3 ink normal, plus 4 of wind in a near tile; a card's vertex is 12, 3,
 * 3, 4 of texture coordinate and 4 of wind. A tile with a building adds 1 of
 * surface, and 2 of pane where one has glass.
 */
interface Buffers {
  position: Float32Array;
  normal: Int8Array;
  color: Uint8Array;
  outline: Int8Array;
  wind: Uint8Array | null;
  /** A building's `atlasSurface` and `atlasPane` bytes, when the tile has a building. */
  surface: Uint8Array | null;
  pane: Uint8Array | null;
  leafPosition: Float32Array;
  leafNormal: Int8Array;
  leafColor: Uint8Array;
  leafUv: Uint16Array;
  leafWind: Uint8Array;
  cursor: number;
  leafCursor: number;
}

const byte = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 255);

/**
 * A rotated normal as a signed byte. 127, not 128: `normalized: true` divides
 * by 127, so 128 would clip a normal that is exactly 1 on an axis.
 */
function writeNormal(out: Int8Array, at: number, e: ArrayLike<number>, nx: number, ny: number, nz: number, inverseScale: number): void {
  out[at] = Math.round((e[0]! * nx + e[4]! * ny + e[8]! * nz) * inverseScale * 127);
  out[at + 1] = Math.round((e[1]! * nx + e[5]! * ny + e[9]! * nz) * inverseScale * 127);
  out[at + 2] = Math.round((e[2]! * nx + e[6]! * ny + e[10]! * nz) * inverseScale * 127);
}

function writePosition(out: Float32Array, at: number, e: ArrayLike<number>, x: number, y: number, z: number): void {
  out[at] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
  out[at + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
  out[at + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
}

/** The wood (or lump) vertices of one placed plant, transformed by its matrix. */
function writeWood(b: Buffers, item: Placed, inverseScale: number): number {
  const e = item.matrix.elements;
  const source = item.flat;
  const count = source.position.length;
  for (let i = 0; i < count; i += 3) {
    const at = b.cursor;
    writePosition(b.position, at, e, source.position[i]!, source.position[i + 1]!, source.position[i + 2]!);
    writeNormal(b.normal, at, e, source.normal[i]!, source.normal[i + 1]!, source.normal[i + 2]!, inverseScale);
    writeNormal(b.outline, at, e, source.outline[i]!, source.outline[i + 1]!, source.outline[i + 2]!, inverseScale);
    b.cursor += 3;
  }
  for (let i = 0; i < count; i++) {
    b.color[b.cursor - count + i] = Math.round(Math.min(1, Math.max(0, source.color[i]!)) * 255);
  }
  const first = (b.cursor - count) / 3;
  if (b.surface !== null && source.surface !== undefined) b.surface.set(source.surface, first);
  if (b.pane !== null && source.pane !== undefined && source.pane !== null) b.pane.set(source.pane, first * 2);
  return count;
}

/** A vehicle's slice of the buffer: recorded for the fleet and marked for the material. */
function recordMachine(b: Buffers, machine: CountryMachine, count: number, walls: Map<CountryMachine, Solid[]>): TileMachine {
  const first = (b.cursor - count) / 3;
  // The material paints a vertex with `MACHINE_BED` in its third wind byte as
  // the craft's own (`machineWood`): a near tile's wind has two bytes no wood uses.
  if (b.wind !== null) for (let v = 0; v < count / 3; v++) b.wind[(first + v) * 4 + 2] = MACHINE_BED;
  return {
    id: machine.id,
    model: machine.model,
    position: machine.position,
    forward: machine.forward,
    paint: null,
    start: first,
    count: count / 3,
    solids: walls.get(machine) ?? [],
    hidden: false,
  };
}

/** The sway of a tree's wood: bend by height, phase by where it stands. */
function writeWoodWind(b: Buffers, item: Placed, count: number, phase: number, bend: number): void {
  if (b.wind === null) return;
  const first = (b.cursor - count) / 3;
  for (let v = 0; v < count / 3; v++) {
    b.wind[(first + v) * 4] = Math.round(Math.min(1, Math.max(0, item.flat.position[v * 3 + 1]! * bend)) * 255);
    b.wind[(first + v) * 4 + 1] = phase;
  }
}

function writeLeaves(b: Buffers, item: Placed, phase: number, bend: number, inverseScale: number): void {
  const leaves = item.leaves;
  if (leaves === undefined || leaves === null) return;
  const e = item.matrix.elements;
  for (let i = 0; i < leaves.position.length; i += 3) {
    const y = leaves.position[i + 1]!;
    const at = b.leafCursor;
    writePosition(b.leafPosition, at, e, leaves.position[i]!, y, leaves.position[i + 2]!);
    writeNormal(b.leafNormal, at, e, leaves.normal[i]!, leaves.normal[i + 1]!, leaves.normal[i + 2]!, inverseScale);
    for (let c = 0; c < 3; c++) b.leafColor[at + c] = Math.round(Math.min(1, Math.max(0, leaves.color[i + c]!)) * 255);
    const v = at / 3;
    const w = i / 3;
    b.leafUv[v * 2] = Math.round(leaves.uv[w * 2]! * 65535);
    b.leafUv[v * 2 + 1] = Math.round(leaves.uv[w * 2 + 1]! * 65535);
    b.leafWind[v * 4] = Math.round(Math.min(1, Math.max(0, y * bend)) * 255);
    b.leafWind[v * 4 + 1] = phase;
    b.leafWind[v * 4 + 2] = byte(leaves.leaf[w * 2]!);
    b.leafWind[v * 4 + 3] = byte(leaves.leaf[w * 2 + 1]!);
    b.leafCursor += 3;
  }
}

function geometryOf(b: Buffers, leafVertices: number): { geometry: THREE.BufferGeometry; cardGeometry: THREE.BufferGeometry | null } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(b.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(b.color, 3, true));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(b.outline, 3, true));
  if (b.wind !== null) geometry.setAttribute('aWind', new THREE.BufferAttribute(b.wind, 4, true));
  if (b.surface !== null) geometry.setAttribute('atlasSurface', new THREE.BufferAttribute(b.surface, 1, false));
  if (b.pane !== null) geometry.setAttribute('atlasPane', new THREE.BufferAttribute(b.pane, 2, true));

  let cardGeometry: THREE.BufferGeometry | null = null;
  if (leafVertices > 0) {
    cardGeometry = new THREE.BufferGeometry();
    cardGeometry.setAttribute('position', new THREE.BufferAttribute(b.leafPosition, 3));
    cardGeometry.setAttribute('normal', new THREE.BufferAttribute(b.leafNormal, 3, true));
    cardGeometry.setAttribute('color', new THREE.BufferAttribute(b.leafColor, 3, true));
    cardGeometry.setAttribute('uv', new THREE.BufferAttribute(b.leafUv, 2, true));
    cardGeometry.setAttribute('aWind', new THREE.BufferAttribute(b.leafWind, 4, true));
    // The sway's reach past the cards' own sphere: a crown bends a unit or two.
    cardGeometry.computeBoundingSphere();
    cardGeometry.boundingSphere!.radius += 2;
  }
  return { geometry, cardGeometry };
}

/**
 * Merges the placed plants into one buffer (and a second for the leaf cards).
 * `vertices` and `leafVertices` are the totals the placing counted.
 */
export function packTile(
  placed: readonly Placed[],
  vertices: number,
  leafVertices: number,
  cards: boolean,
  machineWalls: Map<CountryMachine, Solid[]>,
): Packed {
  const surfaced = placed.some((item) => item.flat.surface !== undefined);
  const glazed = placed.some((item) => item.flat.pane !== undefined && item.flat.pane !== null);
  const b: Buffers = {
    position: new Float32Array(vertices * 3),
    normal: new Int8Array(vertices * 3),
    color: new Uint8Array(vertices * 3),
    outline: new Int8Array(vertices * 3),
    wind: cards ? new Uint8Array(vertices * 4) : null,
    // Only a tile with a building pays for the bytes; without them the material reads 0, drawn as it is.
    surface: surfaced ? new Uint8Array(vertices) : null,
    pane: glazed ? new Uint8Array(vertices * 2) : null,
    leafPosition: new Float32Array(leafVertices * 3),
    leafNormal: new Int8Array(leafVertices * 3),
    leafColor: new Uint8Array(leafVertices * 3),
    leafUv: new Uint16Array(leafVertices * 2),
    leafWind: new Uint8Array(leafVertices * 4),
    cursor: 0,
    leafCursor: 0,
  };
  const machines: TileMachine[] = [];
  for (const item of placed) {
    const e = item.matrix.elements;
    // Uniform scale (`validatePart` refuses a variant that scales itself), so
    // the normal transform is the rotation and dividing by the scale normalises.
    const scale = Math.hypot(e[0]!, e[1]!, e[2]!);
    const inverseScale = scale === 0 ? 0 : 1 / scale;
    const count = writeWood(b, item, inverseScale);
    if (item.machine !== undefined) machines.push(recordMachine(b, item.machine, count, machineWalls));
    if (item.sways !== true) continue;
    // The plant's phase, off where it stands: a tree sways the same way however often its tile is built.
    const phase = Math.round((((e[12]! * 0.1373 + e[14]! * 0.3117) % 1) + 1) % 1 * 255);
    const bend = scale / WIND_REACH;
    writeWoodWind(b, item, count, phase, bend);
    writeLeaves(b, item, phase, bend, inverseScale);
  }
  return { ...geometryOf(b, leafVertices), machines };
}
