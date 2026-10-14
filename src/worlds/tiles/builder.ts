/**
 * One tile's geometry: a grid of vertices sampled off the terrain, tinted by
 * slope and by nation, with a skirt dropped from each edge.
 *
 * A tile's vertices are stored relative to its own centre, and the centre is
 * the mesh's position (a double in JavaScript). Three composes the model-view
 * matrix in doubles before it becomes a float32 uniform, so the difference
 * between the camera and a vertex is taken at full precision and the vertex is
 * never larger than the tile.
 *
 * The seams: two neighbours at different levels share an edge whose vertices
 * do not match, so every tile hangs a skirt from its four edges, a strip
 * dropped straight down by more than the largest gap a level can leave.
 */

import * as THREE from 'three';
import type { Terrain, TerrainSample } from '../terrain.ts';
import { linearOf, newSample } from '../terrain.ts';
import { TILE_SEGMENTS, faceDir, keyOf, tileSpan } from '../cube.ts';
import type { TileKey } from '../cube.ts';
import { fbm } from '../../system/noise.ts';
import type { GroundOptions } from '../tiles.ts';
import type { QuadtreeState, Tile } from './quadtree.ts';

/** One shared index for every tile: the topology is the same everywhere. */
function tileIndex(): THREE.BufferAttribute {
  const S = TILE_SEGMENTS;
  const row = S + 1;
  const indices: number[] = [];
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row + 1;
      const d = a + row;
      indices.push(a, b, c, a, c, d);
    }
  }
  // The skirt: one strip per edge, from the edge vertex down to its copy.
  const skirt = row * row;
  const edge = (from: number, step: number, at: number, flip: boolean): void => {
    for (let k = 0; k < S; k++) {
      const top0 = from + k * step;
      const top1 = from + (k + 1) * step;
      const bottom0 = skirt + at + k;
      const bottom1 = skirt + at + k + 1;
      if (flip) indices.push(top0, bottom1, top1, top0, bottom0, bottom1);
      else indices.push(top0, top1, bottom1, top0, bottom1, bottom0);
    }
  };
  edge(0, 1, 0, true); // j = 0, along u
  edge(S * row, 1, row, false); // j = S
  edge(0, row, 2 * row, false); // i = 0, along v
  edge(S, row, 3 * row, true); // i = S
  return new THREE.BufferAttribute(new Uint16Array(indices), 1);
}

/** A tile's vertex arrays, grid first and then the skirts', and where the tile stands. */
interface Raw {
  positions: Float32Array;
  colors: Float32Array;
  phases: Float32Array | null;
  tint: Float32Array;
  centre: THREE.Vector3;
  dir: THREE.Vector3;
  /** The tile's edge in the cube face's units, and the spacing between two of its vertices, units. */
  size: number;
  spacing: number;
}

const S = TILE_SEGMENTS;
const row = S + 1;

/** What the tile builders share: the terrain, the palette's colours, and the scratch arrays one tile at a time is built in. */
interface Env {
  terrain: Terrain;
  R: number;
  deck: boolean;
  steep: [number, number, number];
  sample: TerrainSample;
  nationLinear: THREE.Color[];
  noNation: THREE.Color;
  point: { x: number; y: number; z: number };
  heights: Float32Array;
  dirs: Float64Array;
}

const tangentA = new THREE.Vector3();
const tangentB = new THREE.Vector3();
const probe = new THREE.Vector3();
const upward = new THREE.Vector3();

/**
 * The deck's normals: inside the tile off the grid's own neighbours, and on
 * its edge (which the next tile shares) off the height field, the radial up
 * tilted by the field's slope `step` units either way along two tangents, so
 * both tiles give an edge vertex one normal; a skirt's vertex takes its edge
 * vertex's. `count` vertices, the grid's first and then the skirts'.
 */
function deckNormals(e: Env, count: number, spacing: number, positions: Float32Array): Float32Array {
  const { terrain, R, dirs } = e;
  const out = new Float32Array(count * 3);
  const step = Math.max(1, spacing);
  const angle = step / R;
  const heightAlong = (t: THREE.Vector3, sign: number): number => {
    probe.copy(upward).addScaledVector(t, sign * angle).normalize();
    return terrain.heightAt(probe.x, probe.y, probe.z);
  };
  for (let k = 0; k < row * row; k++) {
    upward.set(dirs[k * 3]!, dirs[k * 3 + 1]!, dirs[k * 3 + 2]!);
    const i = k % row;
    const j = (k - i) / row;
    if (i > 0 && i < S && j > 0 && j < S) {
      tangentA.set(positions[(k + 1) * 3]! - positions[(k - 1) * 3]!, positions[(k + 1) * 3 + 1]! - positions[(k - 1) * 3 + 1]!, positions[(k + 1) * 3 + 2]! - positions[(k - 1) * 3 + 2]!);
      tangentB.set(positions[(k + row) * 3]! - positions[(k - row) * 3]!, positions[(k + row) * 3 + 1]! - positions[(k - row) * 3 + 1]!, positions[(k + row) * 3 + 2]! - positions[(k - row) * 3 + 2]!);
      probe.crossVectors(tangentA, tangentB).normalize();
      if (probe.dot(upward) < 0) probe.negate();
      out[k * 3] = probe.x;
      out[k * 3 + 1] = probe.y;
      out[k * 3 + 2] = probe.z;
      continue;
    }
    tangentA.set(-upward.z, 0.31, upward.x);
    tangentA.addScaledVector(upward, -tangentA.dot(upward)).normalize();
    tangentB.crossVectors(upward, tangentA);
    const da = (heightAlong(tangentA, 1) - heightAlong(tangentA, -1)) / (2 * step);
    const db = (heightAlong(tangentB, 1) - heightAlong(tangentB, -1)) / (2 * step);
    probe.copy(upward).addScaledVector(tangentA, -da).addScaledVector(tangentB, -db).normalize();
    out[k * 3] = probe.x;
    out[k * 3 + 1] = probe.y;
    out[k * 3 + 2] = probe.z;
  }
  // The skirts, in the order `skirts` drops them: each its edge vertex's.
  let at = row * row;
  const copy = (from: number): void => {
    out[at * 3] = out[from * 3]!;
    out[at * 3 + 1] = out[from * 3 + 1]!;
    out[at * 3 + 2] = out[from * 3 + 2]!;
    at++;
  };
  for (let i = 0; i <= S; i++) copy(i);
  for (let i = 0; i <= S; i++) copy(S * row + i);
  for (let j = 0; j <= S; j++) copy(j * row);
  for (let j = 0; j <= S; j++) copy(j * row + S);
  return out;
}

/** The grid: each vertex's direction, height, position about the centre, colour and (on a deck) phase. */
function fillGrid(e: Env, key: TileKey, raw: Raw, u0: number, v0: number): void {
  const { terrain, R, point, sample, heights, dirs } = e;
  const { positions, colors, phases, centre, size } = raw;
  let k = 0;
  for (let j = 0; j <= S; j++) {
    for (let i = 0; i <= S; i++, k++) {
      faceDir(key.face, u0 + (size * i) / S, v0 + (size * j) / S, point);
      terrain.sample(point.x, point.y, point.z, sample);
      heights[k] = sample.height;
      dirs[k * 3] = point.x;
      dirs[k * 3 + 1] = point.y;
      dirs[k * 3 + 2] = point.z;
      const r = R + sample.height;
      positions[k * 3] = point.x * r - centre.x;
      positions[k * 3 + 1] = point.y * r - centre.y;
      positions[k * 3 + 2] = point.z * r - centre.z;
      colors[k * 3] = sample.r;
      colors[k * 3 + 1] = sample.g;
      colors[k * 3 + 2] = sample.b;
      if (phases !== null) phases[k] = fbm(point.x * 7, point.y * 7, point.z * 7, 2) + sample.height * 0.02;
    }
  }
}

/** The slope, from the grid's own neighbours: steep ground takes the palette's steep colour, the way a cliff on Earth is rock whatever the biome says. */
function tintSteep(e: Env, raw: Raw): void {
  const { steep, heights } = e;
  const { colors, spacing } = raw;
  for (let j = 0; j <= S; j++) {
    for (let i = 0; i <= S; i++) {
      const at = j * row + i;
      const du = heights[j * row + Math.min(S, i + 1)]! - heights[j * row + Math.max(0, i - 1)]!;
      const dv = heights[Math.min(S, j + 1) * row + i]! - heights[Math.max(0, j - 1) * row + i]!;
      const span = spacing * (i === 0 || i === S ? 1 : 2);
      const spanV = spacing * (j === 0 || j === S ? 1 : 2);
      const grade = Math.hypot(du / span, dv / spanV);
      const w = Math.min(1, Math.max(0, (grade - 0.45) / 0.4));
      if (w > 0) {
        colors[at * 3] = colors[at * 3]! + (steep[0] - colors[at * 3]!) * w;
        colors[at * 3 + 1] = colors[at * 3 + 1]! + (steep[1] - colors[at * 3 + 1]!) * w;
        colors[at * 3 + 2] = colors[at * 3 + 2]! + (steep[2] - colors[at * 3 + 2]!) * w;
      }
    }
  }
}

/**
 * The nations: one colour for a small tile when its corners and its centre
 * agree, a lookup a vertex where they do not. A tile a few degrees across or
 * more is always asked vertex by vertex, because a whole nation fits inside
 * it unseen by five points; there are a few dozen of those.
 */
function tintNations(e: Env, raw: Raw, at: NonNullable<GroundOptions['nations']>): void {
  const { nationLinear, noNation, dirs } = e;
  const { tint, dir, size } = raw;
  const corner = (a: number): number => at.at(dirs[a * 3]!, dirs[a * 3 + 1]!, dirs[a * 3 + 2]!);
  const first = at.at(dir.x, dir.y, dir.z);
  const small = size * 45 < 3;
  const whole = small && corner(0) === first && corner(S) === first && corner(S * row) === first && corner(S * row + S) === first;
  for (let v = 0; v < row * row; v++) {
    const id = whole ? first : corner(v);
    const colour = nationLinear[id - 1] ?? noNation;
    tint[v * 3] = colour.r;
    tint[v * 3 + 1] = colour.g;
    tint[v * 3 + 2] = colour.b;
  }
}

/**
 * The skirts: each edge vertex again, dropped. Deep enough to close the
 * widest crack a level can leave, which is bounded by how much the ground can
 * do between two vertices: never more than half the planet's whole relief
 * plus the sphere's own sag under a straight edge, and on a fine tile a few
 * spacings. Returns the vertex count.
 */
function skirts(e: Env, raw: Raw): number {
  const { terrain, R, heights, dirs } = e;
  const { positions, colors, phases, tint, centre, spacing } = raw;
  const drop = Math.max(4, Math.min(spacing * 3, (terrain.high - terrain.low) * 0.5 + 4 + (spacing * spacing) / (4 * R)));
  const edges: [number, number][] = [];
  for (let i = 0; i <= S; i++) edges.push([0 * row + i, 0]);
  for (let i = 0; i <= S; i++) edges.push([S * row + i, 1]);
  for (let j = 0; j <= S; j++) edges.push([j * row + 0, 2]);
  for (let j = 0; j <= S; j++) edges.push([j * row + S, 3]);
  let s = row * row;
  for (const [from] of edges) {
    const r = R + heights[from]! - drop;
    positions[s * 3] = dirs[from * 3]! * r - centre.x;
    positions[s * 3 + 1] = dirs[from * 3 + 1]! * r - centre.y;
    positions[s * 3 + 2] = dirs[from * 3 + 2]! * r - centre.z;
    colors[s * 3] = colors[from * 3]! * 0.8;
    colors[s * 3 + 1] = colors[from * 3 + 1]! * 0.8;
    colors[s * 3 + 2] = colors[from * 3 + 2]! * 0.8;
    if (phases !== null) phases[s] = phases[from]!;
    tint[s * 3] = tint[from * 3]!;
    tint[s * 3 + 1] = tint[from * 3 + 1]!;
    tint[s * 3 + 2] = tint[from * 3 + 2]!;
    s++;
  }
  return s;
}


export function createTileBuilder(deps: {
  terrain: Terrain;
  options: GroundOptions;
  material: THREE.Material;
  decorMaterial: THREE.Material;
  group: THREE.Group;
  state: QuadtreeState;
}): (key: TileKey) => Tile {
  const { terrain, options, material, decorMaterial, group, state } = deps;
  const R = terrain.radius;
  const deck = terrain.spec.ground === 'cloud-deck';
  const index = tileIndex();
  const nations = options.nations;
  const env: Env = {
    terrain,
    R,
    deck,
    steep: linearOf(terrain.spec.palette.steep),
    sample: newSample(),
    nationLinear: (nations?.colors ?? []).map((hex) => new THREE.Color().setHex(hex)),
    noNation: new THREE.Color().setHex(0x808080),
    point: { x: 0, y: 0, z: 0 },
    heights: new Float32Array(row * row),
    dirs: new Float64Array(row * row * 3),
  };
  const { point, heights } = env;

  return (key) => {
    const began = performance.now();
    const [u0, v0, size] = tileSpan(key);
    const vertices = row * row + 4 * row;
    // The centre: its own direction at its own height.
    faceDir(key.face, u0 + size / 2, v0 + size / 2, point);
    const dir = new THREE.Vector3(point.x, point.y, point.z);
    const centre = dir.clone().multiplyScalar(R + terrain.heightAt(point.x, point.y, point.z));
    const raw: Raw = {
      positions: new Float32Array(vertices * 3),
      colors: new Float32Array(vertices * 3),
      phases: deck ? new Float32Array(vertices) : null,
      tint: new Float32Array(vertices * 3),
      centre,
      dir,
      size,
      spacing: (R * size * (Math.PI / 4)) / S,
    };
    fillGrid(env, key, raw, u0, v0);
    if (!deck) tintSteep(env, raw);
    if (nations !== undefined) tintNations(env, raw, nations);
    const count = skirts(env, raw);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(raw.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(raw.colors, 3));
    if (raw.phases !== null) geometry.setAttribute('aPhase', new THREE.BufferAttribute(raw.phases, 1));
    geometry.setAttribute('aNation', new THREE.BufferAttribute(raw.tint, 3));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    // Smooth normals for the deck, which is drawn soft; the crust is
    // flat-shaded in the shader and needs none. Taken from the field, not the
    // mesh: a tile's own `computeVertexNormals` bends every edge vertex toward
    // its skirt, so the light steps at each tile's border and a flat deck is
    // drawn as a quilt of squares.
    if (deck) geometry.setAttribute('normal', new THREE.BufferAttribute(deckNormals(env, count, raw.spacing, raw.positions), 3));

    const mesh = new THREE.Mesh(geometry, material);
    // Earth's land never casts (`sun.ts`), and takes every shadow on it.
    mesh.receiveShadow = true;
    mesh.position.copy(centre);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.visible = false;
    mesh.name = `tile ${keyOf(key)}`;
    if (options.decorate !== undefined && key.level >= terrain.levels - 1) {
      const decor = options.decorate(key, centre, dir);
      if (decor !== null) {
        const child = new THREE.Mesh(decor, decorMaterial);
        child.matrixAutoUpdate = false;
        mesh.add(child);
      }
    }
    group.add(mesh);

    // The tile's angular radius: half its diagonal, generously.
    const angle = size * (Math.PI / 4) * 0.78;
    let top = -Infinity;
    let bottom = Infinity;
    for (let k = 0; k < row * row; k++) {
      top = Math.max(top, heights[k]!);
      bottom = Math.min(bottom, heights[k]!);
    }
    const tile: Tile = { key, id: keyOf(key), mesh, dir, angle, edge: R * size * (Math.PI / 4), top, bottom, used: state.frame };
    state.tiles.set(tile.id, tile);
    state.stats.buildMs = state.stats.buildMs * 0.9 + (performance.now() - began) * 0.1;
    return tile;
  };
}
