// The sea, in three parts split by what each can afford to resolve:
//
// - The water sphere carries what varies over thousands of units: sea surface
//   temperature, the depth ramp and the basins. Smooth, coarse and cheap.
// - The shallows are a ribbon laid along every coastline at the resolution the
//   outlines have, carrying the shelf, the shoals and the surf.
// - The glint is the sun's path on the water, a term in both materials' shaders.
//
// The sea is a mechanic, not scenery: `isWater` is a predicate on ground height,
// and the land never comes below `SHORE_LIP`, so nothing here may displace the
// water surface downward or touch the ground.

import * as THREE from 'three';
import type { World } from './geo.ts';
import { PLANET_RADIUS } from './globe.ts';
import { detail } from './view.ts';
import {
  DEG,
  FOAM_CYCLE,
  LIFT_COAST,
  LIFT_SHELF,
  MAX_QUAD,
  OCEAN_DETAIL,
  OCEAN_SAG,
  SHELF,
} from './ocean/constants.ts';
import { glintUniforms, seaClock } from './ocean/shaders.ts';
import { buildShallows, shelfReach } from './ocean/shallows.ts';
import { buildWater } from './ocean/water-sphere.ts';

export { depthMix, waterProfile } from './ocean/water-colour.ts';
export {
  FOAM_GLSL,
  SURF_COLOR,
  addGlint,
  addSeaWindow,
  paintSea,
  seaClock,
  seaHull,
  seaWindow,
  seaWindowGLSL,
} from './ocean/shaders.ts';
export { ribbonColour, surfaceLift } from './ocean/shallows.ts';

/**
 * The numbers `pnpm check` holds the sea to, so the assertions are made against
 * this module rather than a copy of it. `quadSag` is both directions: a quad of
 * the ribbon dips `w^2 / 8R` below the line between its corners across the bands
 * and again along the shore, and the two add at its centre. The ribbon's lowest
 * point is `liftShelf` minus that sum above the sphere's vertices, and the water
 * pokes through its own shallows the moment it goes negative.
 */
export function oceanLimits(rows: readonly number[]): {
  sag: number;
  detail: number;
  shelf: number;
  rows: readonly number[];
  liftCoast: number;
  liftShelf: number;
  quadSag: number;
} {
  const sagOf = (w: number): number => (w * w) / (8 * PLANET_RADIUS);
  let widest = 0;
  for (let i = 1; i < rows.length; i++) widest = Math.max(widest, rows[i]! - rows[i - 1]!);
  return {
    sag: OCEAN_SAG,
    detail: OCEAN_DETAIL,
    shelf: SHELF,
    rows,
    liftCoast: LIFT_COAST,
    liftShelf: LIFT_SHELF,
    // Across the widest band plus along the longest span, which is `MAX_QUAD`.
    quadSag: sagOf(widest) + sagOf(MAX_QUAD),
  };
}

export interface OceanLight {
  /** Unit vector from the planet's centre towards the body. */
  direction: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
}

export interface Ocean {
  group: THREE.Group;
  /** On `atlas.ocean.stats`. */
  stats: {
    builtAt: number;
    shelfReach: number;
    rows: number[];
    tolerance: number;
    quadSag: number;
    detail: number;
    sphereFaces: number;
    sag: number;
    spans: number;
    chunks: number;
    openVertices: number;
    furthestFromLand: number;
    medianDepth: number;
    meanWater: readonly [number, number, number];
    triangles: number;
    mb: number;
    buildMs: number;
  };
  /**
   * The surf's clock and the glitter's light.
   *
   * The clock is `performance.now()` and deliberately *not* the sky's: a swell
   * is a fact about water and `atlas.sky.setRate(600)` is for watching a dawn,
   * not for putting the sea in a blender.
   */
  update(camera: THREE.Vector3, lights: readonly OceanLight[]): void;
}


export function createOcean(world: World): Ocean {
  const began = performance.now();
  const group = new THREE.Group();
  group.name = 'sea';

  const water = buildWater(world);
  group.add(water.mesh);

  // Read once, here: `[` and `]` move the streamers on the next frame but not
  // this, the same way they do not move the land mesh or the cloud deck.
  const knob = detail();
  const shallows = buildShallows(world, knob);
  for (const mesh of shallows.meshes) group.add(mesh);

  const sphereFaces = water.mesh.geometry.getAttribute('position').count / 3;
  const sphereEdge = (63.4349 / Math.sqrt(sphereFaces / 20)) * DEG;
  let bytes = 0;
  group.traverse((object) => {
    const geometry = (object as THREE.Mesh).geometry;
    if (geometry === undefined) return;
    for (const name of Object.keys(geometry.attributes)) {
      bytes += (geometry.getAttribute(name).array as ArrayLike<number> & { BYTES_PER_ELEMENT?: number }).length *
        ((geometry.getAttribute(name).array as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 4);
    }
  });

  const limits = oceanLimits(shallows.rows);
  const stats = {
    /** What `atlas.detail()` said when the sea was built. */
    builtAt: knob,
    shelfReach: Math.round(shelfReach(knob)),
    rows: shallows.rows.map((row) => Math.round(row)),
    tolerance: Number(shallows.tolerance.toFixed(2)),
    quadSag: Number(limits.quadSag.toFixed(3)),
    detail: OCEAN_DETAIL,
    sphereFaces,
    sag: PLANET_RADIUS * (1 - Math.cos(sphereEdge / 2)),
    spans: shallows.spans,
    chunks: shallows.meshes.length,
    triangles: sphereFaces + shallows.triangles,
    /** Sphere vertices the outlines call sea, and the furthest any of them is from land. */
    openVertices: water.wet,
    furthestFromLand: Math.round(water.deepest),
    medianDepth: water.medianDepth,
    meanWater: water.mean,
    mb: Number((bytes / 1e6).toFixed(1)),
    buildMs: Math.round(performance.now() - began),
  };

  const update = (_camera: THREE.Vector3, lights: readonly OceanLight[]): void => {
    const seconds = performance.now() / 1000;
    seaClock.value = seconds % FOAM_CYCLE;
    // One path, from whichever body is doing the lighting: the moon's path is
    // only worth drawing when the sun's is not.
    let best: OceanLight | null = null;
    for (const light of lights) {
      if (light.intensity <= 0.01) continue;
      if (best === null || light.intensity > best.intensity) best = light;
    }
    // The drift wraps where the hash repeats, so the clock never loses precision.
    glintUniforms.uGlintTime.value = seconds % 1000;
    if (best === null) {
      glintUniforms.uGlintStrength.value = 0;
      return;
    }
    glintUniforms.uGlintDir.value.copy(best.direction);
    glintUniforms.uGlintTint.value.copy(best.color);
    glintUniforms.uGlintStrength.value = Math.min(1, best.intensity * 0.55);
  };

  return { group, stats, update };
}
