/**
 * Where one country ends and the next begins, drawn on the ground as a thick
 * dashed ink line, from the air only.
 *
 * The bake keeps only outer rings, so every country is one closed outline that
 * runs along its coast and its land frontiers alike. Which edges are which is
 * `coastEdges` in `globe.ts`: sea is a coastline, land is a frontier. Each
 * frontier is drawn once (the lower ring index owns a shared edge), as one
 * mark and no shading; the country fill of `land-flags.ts` says whose ground
 * it is.
 *
 * A frontier is a fact about people, so it comes up with the map layer on the
 * same fade and has to be seen from the air:
 *
 * - No depth test: no hill or roof may hide it. The vertex stage answers the
 *   horizon itself and the fragment stage discards what is over it (see
 *   `NEAR_CUT` for the other end).
 * - A width that grows with the range, so a frontier reads the same from 3,000
 *   units as from 300: the buffer holds zero-width quads with a sideways
 *   direction (`across`) and a uniform scales it.
 * - The normal is the ground's up; a cross product of a zero-width quad is NaN.
 *
 * The mesh is drawn at `CLOUD_ORDER - 1`, over the land and under the cloud
 * deck. `borders/geometry.ts` builds the buffers, `borders/material.ts` the
 * shader and `borders/constants.ts` the tuning.
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import { CLOUD_ORDER } from './clouds.ts';
import { MIN_FADE, TARGET_PIXELS, WIDTH, WIDTH_MAX, clamp01 } from './borders/constants.ts';
import { buildBorderBuffers } from './borders/geometry.ts';
import { createBorderMaterial } from './borders/material.ts';

export interface Borders {
  mesh: THREE.Mesh;
  /**
   * Frontier edges found, coastline edges skipped, and how many frontiers this
   * ring did not own because the country on the other side carries the same
   * edge. `width` and `fade` are what the last `update` set. On
   * `atlas.borders`.
   */
  stats: {
    frontier: number;
    coast: number;
    shared: number;
    drawn: number;
    triangles: number;
    width: number;
    fade: number;
  };
  /**
   * The altitude fade, and how many world units one pixel is at the range the
   * line is being read from. One float a frame; nothing is rebuilt.
   */
  update(fade: number, unitsPerPixel: number): void;
}

export function createBorders(world: World): Borders {
  const buffers = buildBorderBuffers(world);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute('across', new THREE.Float32BufferAttribute(buffers.offsets, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
  // The centreline's own bounding sphere, which is the planet: this mesh is one
  // draw call covering every frontier on Earth and there is nothing to cull.
  geometry.computeBoundingSphere();

  const { material, width } = createBorderMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'borders';
  // After the land and everything standing on it, and before the cloud deck:
  // with no depth test what is drawn later is what is seen.
  mesh.renderOrder = CLOUD_ORDER - 1;
  mesh.visible = false;

  const stats = {
    frontier: buffers.frontier,
    coast: buffers.coast,
    shared: buffers.shared,
    drawn: buffers.drawn,
    triangles: buffers.positions.length / 9,
    width: WIDTH,
    fade: 0,
  };

  return {
    mesh,
    stats,
    update(fade: number, unitsPerPixel: number): void {
      stats.fade = fade;
      mesh.visible = fade > MIN_FADE;
      if (!mesh.visible) return;
      material.opacity = clamp01(fade);
      width.value = Math.min(WIDTH_MAX, Math.max(WIDTH, TARGET_PIXELS * unitsPerPixel));
      stats.width = width.value;
    },
  };
}
