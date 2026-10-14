/**
 * The ground, drawn: a quadtree of tiles on the cube-sphere, as fine as the
 * eye needs and no finer, built a few at a time.
 *
 * The six level-0 tiles are the whole planet and are built before the first
 * frame, so the quadtree is the far mesh (`tiles/quadtree.ts`). Each tile
 * (`tiles/builder.ts`) hangs a skirt from its edges to hide the cracks between
 * neighbours of different levels, and stores its vertices relative to its own
 * centre for precision. The material (`tiles/material.ts`) lays the nations'
 * colour over the ground and churns a cloud deck.
 */

import * as THREE from 'three';
import type { Terrain } from './terrain.ts';
import { FACES, TILE_SEGMENTS } from './cube.ts';
import type { TileKey } from './cube.ts';
import { createTileBuilder } from './tiles/builder.ts';
import { createGroundMaterial } from './tiles/material.ts';
import { buildSome, choose, createQuadtreeState, draw, evict } from './tiles/quadtree.ts';
import type { GroundStats } from './tiles/quadtree.ts';

export type { GroundStats } from './tiles/quadtree.ts';

export interface Ground {
  group: THREE.Group;
  material: THREE.MeshToonMaterial;
  /** Chooses and draws the tiles for an eye; builds for at most `budgetMs`. */
  update(eye: THREE.Vector3, budgetMs: number): void;
  /** Builds everything the eye wants now, whatever it costs: the first frame. */
  prime(eye: THREE.Vector3): void;
  /** The churning clock of a cloud deck, seconds. */
  time: number;
  /**
   * How far the political map is laid over the ground, 0 to 1: each nation's
   * own colour over its own land, the walked worlds' twin of Earth's map layer
   * (`land-flags.ts`). A uniform; nothing is rebuilt to move it.
   */
  political: number;
  /**
   * How far the quadtree splits, as a multiple of its own rule: the settings'
   * detail knob. Below 1 the ground is coarser sooner, above it finer further.
   */
  detail: number;
  readonly stats: GroundStats;
  dispose(): void;
}

export interface GroundOptions {
  /** Ramp shared with everything else lit. */
  gradientMap: THREE.Texture;
  /**
   * Something to stand on the finest tiles — rocks, drifts — as one geometry in
   * the tile's own frame, or null. Called once per finest tile.
   */
  decorate?(key: TileKey, centre: THREE.Vector3, up: THREE.Vector3): THREE.BufferGeometry | null;
  /** A decorated tile let go of: what `decorate` registered for it can go too. */
  retire?(key: TileKey): void;
  /**
   * Whose ground a direction is — a 1-based index into `colors`, 0 for
   * nobody's — and each nation's colour, for `Ground.political`. Asked at a
   * tile's corners and centre, and at every vertex only of a tile those five
   * do not agree on: most tiles lie inside one nation, and a frontier tile
   * costs a point-in-polygon a vertex.
   */
  nations?: { at(x: number, y: number, z: number): number; colors: readonly number[] };
}

export function createGround(terrain: Terrain, options: GroundOptions): Ground {
  const S = TILE_SEGMENTS;
  const { material, uniforms } = createGroundMaterial(terrain, options.gradientMap);
  const decorMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: options.gradientMap });
  decorMaterial.name = 'world:decor';
  const group = new THREE.Group();
  group.name = 'world-ground';
  const state = createQuadtreeState();
  const { tiles, pending, stats } = state;
  const build = createTileBuilder({ terrain, options, material, decorMaterial, group, state });
  for (let face = 0; face < FACES.length; face++) build({ face, level: 0, i: 0, j: 0 });

  return {
    group,
    material,
    get time() {
      return uniforms.uTime.value;
    },
    set time(value: number) {
      uniforms.uTime.value = value;
    },
    get political() {
      return uniforms.uPolitical.value;
    },
    set political(value: number) {
      uniforms.uPolitical.value = Math.min(1, Math.max(0, value));
    },
    get detail() {
      return state.detail;
    },
    set detail(value: number) {
      state.detail = Math.min(8, Math.max(0.25, value));
    },
    stats,
    update(eye, budgetMs) {
      state.frame++;
      const began = performance.now();
      choose(state, terrain, eye);
      draw(state, 2 * S * S);
      buildSome(state, build, budgetMs, began);
      stats.built = tiles.size;
      stats.pending = pending.size;
      evict(state, terrain, group, options.retire);
    },
    prime(eye) {
      const began = performance.now();
      for (let round = 0; round < 40; round++) {
        state.frame++;
        choose(state, terrain, eye);
        if (pending.size === 0 || performance.now() - began > 6000) break;
        buildSome(state, build, Infinity, performance.now());
      }
      draw(state, 2 * S * S);
      stats.built = tiles.size;
    },
    dispose() {
      for (const tile of tiles.values()) {
        tile.mesh.geometry.dispose();
        for (const child of tile.mesh.children) (child as THREE.Mesh).geometry.dispose();
      }
      tiles.clear();
      material.dispose();
      decorMaterial.dispose();
    },
  };
}
