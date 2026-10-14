import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS, groundRadius } from '../globe.ts';
import { latOf, lonOf } from '../sphere.ts';
import type { LaidRoadside } from './caches.ts';
import type { Ribbon } from './ribbon-writer.ts';
import type { RoadSummary } from './summary.ts';
import type { Road } from './types.ts';

/**
 * The unit of streaming: a 4-degree patch of the planet and every road whose
 * middle falls in it, merged into one mesh (one draw call) plus one roadside
 * mesh in the near band. Four degrees is about the length of the longest
 * roads, so a tile's bounding sphere stays tight for the frustum test.
 */
const TILE = 4;
const TILE_COLS = Math.round(360 / TILE);
const TILE_ROWS = Math.round(180 / TILE);

export interface Tile {
  /** Indices into `roads`. */
  members: number[];
  /** Unit vector at the middle of the tile's roads, the ground under it, and a radius that covers every course. */
  centre: THREE.Vector3;
  anchor: THREE.Vector3;
  bound: number;
  mesh: THREE.Mesh | null;
  /** The band this tile is built for, or -1 if it is not built. */
  band: number;
  /** A hash of the members admitted when it was built (`signOf`), 0 when not built: the rebuild key. */
  sign: number;
  /** Roads it actually drew. */
  drawn: number;
  triangles: number;
  bytes: number;
  /** What stands beside its roads, in the near band only, and its lamp heads in world units. */
  props: THREE.Mesh | null;
  heads: Float32Array | null;
}

/** Buckets every road into its tile, in the order the tiles are first met. */
export function bucketTiles(roads: readonly Road[], summary: RoadSummary, world: World): Tile[] {
  const tiles = new Map<number, Tile>();
  const point = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  roads.forEach((_, i) => {
    summary.readMiddle(i, point);
    const lat = latOf(point.y);
    const lon = lonOf(point.x, point.z);
    const row = Math.min(TILE_ROWS - 1, Math.max(0, Math.floor((90 - lat) / TILE)));
    const col = ((Math.floor((lon + 180) / TILE) % TILE_COLS) + TILE_COLS) % TILE_COLS;
    const key = row * TILE_COLS + col;
    let tile = tiles.get(key);
    if (tile === undefined) {
      tile = {
        members: [],
        centre: new THREE.Vector3(),
        anchor: new THREE.Vector3(),
        bound: 0,
        mesh: null,
        band: -1,
        sign: 0,
        drawn: 0,
        triangles: 0,
        bytes: 0,
        props: null,
        heads: null,
      };
      tiles.set(key, tile);
    }
    tile.members.push(i);
    tile.centre.add(point);
  });

  const list = [...tiles.values()];
  for (const tile of list) {
    tile.centre.normalize();
    // The bound covers every course, not just the middles it was bucketed on:
    // both ends of a long road can lie outside its tile.
    let reach = 0;
    for (const i of tile.members) reach = Math.max(reach, tile.centre.angleTo(summary.readMiddle(i, point)) + summary.reachOf[i]!);
    tile.bound = reach * PLANET_RADIUS + 60;
    tile.anchor.copy(tile.centre).multiplyScalar(groundRadius(world, scratch.copy(tile.centre).multiplyScalar(PLANET_RADIUS)));
  }
  return list;
}

/**
 * Merges a tile's ribbons into one mesh, placed at its first vertex: at the
 * planet's radius a float steps by about 0.002, more than a depth layer, so
 * the buffer holds small offsets instead. Returns that origin.
 */
export function raiseRibbons(
  tile: Tile, parts: readonly { ribbon: Ribbon; road: Road }[], vertices: number, material: THREE.Material, group: THREE.Group,
): THREE.Vector3 {
  const first = parts.find((part) => part.ribbon.glow.length > 0)!.ribbon.position;
  const ox = first[0]!;
  const oy = first[1]!;
  const oz = first[2]!;
  const positions = new Float32Array(vertices * 3);
  const colors = new Float32Array(vertices * 3);
  /** Each vertex's road's depth layer; see `LAYER_DEPTH`. */
  const layers = new Float32Array(vertices);
  /** And its class, which the dissolve reads its reach by. */
  const classes = new Uint8Array(vertices);
  const marks = new Int8Array(vertices * 2);
  /** Each vertex's light and its hour, the two bytes a town's floor carries. */
  const glow = new Uint8Array(vertices * 2);
  let v = 0;
  for (const { ribbon, road } of parts) {
    const count = ribbon.glow.length;
    const source = ribbon.position;
    for (let i = 0; i < count; i++) {
      positions[(v + i) * 3] = source[i * 3]! - ox;
      positions[(v + i) * 3 + 1] = source[i * 3 + 1]! - oy;
      positions[(v + i) * 3 + 2] = source[i * 3 + 2]! - oz;
      glow[(v + i) * 2] = ribbon.glow[i]!;
      // 255 is the hour that never comes: a gate's light burns till dawn.
      glow[(v + i) * 2 + 1] = 255;
    }
    colors.set(ribbon.color, v * 3);
    marks.set(ribbon.mark, v * 2);
    layers.fill(road.layer, v, v + count);
    classes.fill(road.cls, v, v + count);
    v += count;
  }

  const buffer = new THREE.BufferGeometry();
  buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  buffer.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  buffer.setAttribute('roadLayer', new THREE.BufferAttribute(layers, 1));
  buffer.setAttribute('roadClass', new THREE.BufferAttribute(classes, 1));
  buffer.setAttribute('roadMark', new THREE.BufferAttribute(marks, 2));
  // Normalised, so the shader reads 0..1 out of each byte, as it does a town's.
  buffer.setAttribute('atlasLit', new THREE.BufferAttribute(glow, 2, true));
  buffer.computeVertexNormals();
  buffer.computeBoundingSphere();

  const mesh = new THREE.Mesh(buffer, material);
  mesh.name = `roads:${tile.members.length}`;
  mesh.position.set(ox, oy, oz);
  // A mark on the ground takes the ground's shadows; it casts none.
  mesh.receiveShadow = true;
  group.add(mesh);
  tile.mesh = mesh;
  tile.triangles = vertices / 3;
  tile.bytes = (positions.length * 2 + layers.length) * 4 + glow.length + classes.length + marks.length;
  return mesh.position;
}

/**
 * The near band's roadside of a tile, merged into one buffer relative to the
 * ribbon's origin, and its lamp heads kept for `lampsNear`.
 */
export function raiseProps(
  tile: Tile, members: readonly number[], sides: readonly LaidRoadside[], origin: THREE.Vector3,
  material: THREE.Material, group: THREE.Group,
): void {
  let count = 0;
  let heads = 0;
  for (const side of sides) {
    count += side.position.length / 3;
    heads += side.heads.length;
  }
  if (count === 0) return;
  const { x: ox, y: oy, z: oz } = origin;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const lit = new Uint8Array(count * 2);
  const lamps = new Float32Array(heads);
  let v = 0;
  let h = 0;
  for (const side of sides) {
    const n = side.position.length / 3;
    for (let i = 0; i < n; i++) {
      position[(v + i) * 3] = side.position[i * 3]! - ox;
      position[(v + i) * 3 + 1] = side.position[i * 3 + 1]! - oy;
      position[(v + i) * 3 + 2] = side.position[i * 3 + 2]! - oz;
    }
    normal.set(side.normal, v * 3);
    color.set(side.color, v * 3);
    lit.set(side.lit, v * 2);
    lamps.set(side.heads, h);
    v += n;
    h += side.heads.length;
  }
  const buffer = new THREE.BufferGeometry();
  buffer.setAttribute('position', new THREE.BufferAttribute(position, 3));
  buffer.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  buffer.setAttribute('color', new THREE.BufferAttribute(color, 3));
  buffer.setAttribute('atlasLit', new THREE.BufferAttribute(lit, 2, true));
  buffer.computeBoundingSphere();
  const props = new THREE.Mesh(buffer, material);
  props.name = `roadside:${members.length}`;
  props.position.set(ox, oy, oz);
  props.receiveShadow = true;
  group.add(props);
  tile.props = props;
  tile.heads = lamps.length > 0 ? lamps : null;
  tile.triangles += count / 3;
  tile.bytes += (position.length + normal.length + color.length) * 4 + lit.length;
}

/** Removes a tile's meshes. The material is shared by every road and is not disposed. */
export function dropTile(tile: Tile, group: THREE.Group): void {
  if (tile.props !== null) {
    group.remove(tile.props);
    tile.props.geometry.dispose();
    tile.props = null;
    tile.heads = null;
  }
  if (tile.mesh === null) return;
  group.remove(tile.mesh);
  tile.mesh.geometry.dispose();
  tile.mesh = null;
  tile.band = -1;
  tile.sign = 0;
  tile.drawn = 0;
  tile.triangles = 0;
  tile.bytes = 0;
}
