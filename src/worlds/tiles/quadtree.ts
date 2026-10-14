/**
 * Which tiles of the cube-sphere are drawn. The six level-0 tiles are the whole
 * planet and are built before the first frame, so the quadtree is the far
 * mesh: from orbit nothing splits, and on foot the tiles under the player are
 * several levels finer than those on the horizon. The rule that keeps it from
 * holes: a tile is replaced by its four children only once all four are built;
 * until then the parent is drawn, so a split never shows the sky through the
 * ground and the swap is a single frame.
 */

import * as THREE from 'three';
import type { Terrain } from '../terrain.ts';
import { FACES, keyOf } from '../cube.ts';
import type { TileKey } from '../cube.ts';

/** A tile splits when the eye is nearer than this many of its own edges. */
const SPLIT = 1.0;
/** Tiles kept built beyond what is drawn, so turning round costs nothing. */
const CACHE = 520;

export interface Tile {
  key: TileKey;
  id: string;
  mesh: THREE.Mesh;
  /** Unit vector of the centre, and the angular radius the tile spans. */
  dir: THREE.Vector3;
  angle: number;
  /** Edge length in units, for the split test. */
  edge: number;
  /** The highest and lowest the tile's own ground stands over the radius. */
  top: number;
  bottom: number;
  used: number;
}

export interface GroundStats {
  built: number;
  drawn: number;
  pending: number;
  triangles: number;
  buildMs: number;
}

/** What the quadtree remembers between frames. */
export interface QuadtreeState {
  tiles: Map<string, Tile>;
  pending: Map<string, { key: TileKey; priority: number }>;
  shown: Tile[];
  frame: number;
  /** How far the quadtree splits, as a multiple of its own rule. */
  detail: number;
  stats: GroundStats;
}

export function createQuadtreeState(): QuadtreeState {
  return { tiles: new Map(), pending: new Map(), shown: [], frame: 0, detail: 1, stats: { built: 0, drawn: 0, pending: 0, triangles: 0, buildMs: 0 } };
}

const children = (key: TileKey): TileKey[] => {
  const level = key.level + 1;
  const i = key.i * 2;
  const j = key.j * 2;
  return [
    { face: key.face, level, i, j },
    { face: key.face, level, i: i + 1, j },
    { face: key.face, level, i, j: j + 1 },
    { face: key.face, level, i: i + 1, j: j + 1 },
  ];
};

/**
 * Whether all of a tile is under the horizon from an eye at `distance` from
 * the centre: the eye's horizon over a sphere at the lower of the ground under
 * the eye and the tile's own lowest, plus how far past it the tile's own
 * highest ground still shows. The tile's own heights and not the planet's, or
 * a third of a world with one high mountain and one deep basin would stand
 * over every horizon.
 */
function beyond(R: number, tile: Tile, eyeDir: THREE.Vector3, distance: number, eyeGround: number): boolean {
  const low = R + Math.min(eyeGround, tile.bottom);
  const reach = Math.acos(Math.min(1, low / Math.max(low, distance))) + Math.acos(Math.min(1, low / Math.max(low, R + tile.top)));
  const between = Math.acos(Math.max(-1, Math.min(1, eyeDir.dot(tile.dir))));
  return between - tile.angle > reach;
}

/** Chooses the tiles to draw for an eye, and queues the children it would split into. */
export function choose(state: QuadtreeState, terrain: Terrain, eye: THREE.Vector3): void {
  const { tiles, pending, shown } = state;
  const R = terrain.radius;
  shown.length = 0;
  const distance = eye.length();
  const eyeDir = eye.clone().normalize();
  const eyeGround = terrain.heightAt(eyeDir.x, eyeDir.y, eyeDir.z);
  const visit = (tile: Tile): void => {
    tile.used = state.frame;
    if (beyond(R, tile, eyeDir, distance, eyeGround)) return;
    // From the tile's own centre, at its own height: measured from the
    // radius, a tile on a plateau four hundred units up never split.
    const nearest = Math.max(0, tile.mesh.position.distanceTo(eye) - tile.edge * 0.71);
    if (tile.key.level < terrain.levels && nearest < SPLIT * state.detail * tile.edge) {
      const keys = children(tile.key);
      const built: Tile[] = [];
      for (const key of keys) {
        const found = tiles.get(keyOf(key));
        if (found !== undefined) built.push(found);
        else {
          const id = keyOf(key);
          const priority = nearest + key.level;
          const queued = pending.get(id);
          if (queued === undefined || queued.priority > priority) pending.set(id, { key, priority });
        }
      }
      if (built.length === 4) {
        for (const child of built) visit(child);
        return;
      }
    }
    shown.push(tile);
  };
  for (let face = 0; face < FACES.length; face++) visit(tiles.get(keyOf({ face, level: 0, i: 0, j: 0 }))!);
}

/** Shows the chosen tiles and hides the rest. */
export function draw(state: QuadtreeState, trianglesPerTile: number): void {
  for (const tile of state.tiles.values()) tile.mesh.visible = false;
  let triangles = 0;
  for (const tile of state.shown) {
    tile.mesh.visible = true;
    triangles += trianglesPerTile;
  }
  state.stats.drawn = state.shown.length;
  state.stats.triangles = triangles;
}

/** Builds queued tiles nearest first, at least one, until `budgetMs` of the frame (begun at `began`) is spent. */
export function buildSome(state: QuadtreeState, build: (key: TileKey) => unknown, budgetMs: number, began: number): void {
  // A sort a frame over a queue of a few dozen is nothing.
  const queue = [...state.pending.values()].sort((a, b) => a.priority - b.priority);
  state.pending.clear();
  let built = 0;
  for (const item of queue) {
    if (built > 0 && performance.now() - began > budgetMs) break;
    if (!state.tiles.has(keyOf(item.key))) build(item.key);
    built++;
  }
}

/** Lets the oldest unused tiles go once more than `CACHE` are built. */
export function evict(state: QuadtreeState, terrain: Terrain, group: THREE.Group, retire: ((key: TileKey) => void) | undefined): void {
  const { tiles } = state;
  if (tiles.size <= CACHE) return;
  const old = [...tiles.values()].filter((tile) => tile.key.level > 0 && tile.used < state.frame).sort((a, b) => a.used - b.used);
  for (const tile of old.slice(0, tiles.size - CACHE)) {
    group.remove(tile.mesh);
    tile.mesh.geometry.dispose();
    for (const child of tile.mesh.children) (child as THREE.Mesh).geometry.dispose();
    tiles.delete(tile.id);
    if (tile.key.level >= terrain.levels - 1) retire?.(tile.key);
  }
}
