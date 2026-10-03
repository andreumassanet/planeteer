/**
 * Where one nation of a walked world ends and the next begins, drawn on its
 * ground: the walked worlds' twin of Earth's `borders.ts`, and with it the
 * other half of the map layer (`B`), whose first half is the nations' colour
 * laid over the tiles (`Ground.political`).
 *
 * **The lines are `geography.frontiers`, never the rings' edges.** A ring of
 * another world can be cut along the equator or a quarter meridian to keep it
 * inside one tile of the sphere (`system/geography.ts`), and that cut is not
 * a border; each frontier is listed once, the line two nations share, so a
 * border is drawn once and its dashes are one pattern.
 *
 * What it looks like follows Earth's, for Earth's reasons:
 *
 * - **A dashed ink line, and nothing else.** No band of shade either side: a
 *   dark patch on the ground in a world of one hard sun is read as shadow.
 * - **A width that grows with the range**, held at a few pixels from the air
 *   so a frontier reads the same from three thousand units as from three
 *   hundred: a uniform against an `across` attribute, never a rebuilt mesh.
 * - **No depth test from the air**, so no hill or roof hides the map, with
 *   the far side of the planet cut by the vertex's own horizon test instead.
 *
 * And where Earth's is drawn only from the air, a walked world's is there on
 * foot too, **faint**: a thin dashed line across the dust, depth-tested, which
 * is the one thing on the ground that says the ground has owners. A world
 * with no sea has no coast to read a country's edge off.
 *
 * Built a frontier at a time, the nearest first, inside a few milliseconds a
 * frame: a frontier is densified to a sample every dozen units or so (more on a
 * giant, where the whole is millions of units long) and each sample is lifted
 * onto the drawn ground (`Terrain.groundAt`), which is a few microseconds.
 */

import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import { unitAt } from '../sphere.ts';
import type { Geography } from '../system/geography.ts';
import type { Terrain } from './terrain.ts';

/** A sample every this many units along a frontier, at the least. */
const SPACING = 12;
/** And never more than this many samples on a whole world: a giant's frontiers are spaced to fit. */
const MAX_SAMPLES = 32000;
/** How far over the drawn ground the line rides, units: clear of the tiles' faces, never floating. */
const LIFT = 0.35;
/** The line's width on foot, units: a painted line, a fraction of a person. */
const FOOT_WIDTH = 0.5;
/** And from the air, in pixels: the map's line. */
const AIR_PIXELS = 2.6;
/** One dash and its gap, as multiples of the width. */
const DASH = 7;
/** How much of the line shows on foot, and from the air. */
const FOOT_OPACITY = 0.26;
const AIR_OPACITY = 0.85;

export interface Frontiers {
  group: THREE.Group;
  /**
   * Builds the nearest frontiers not yet built, for at most `budgetMs`, and
   * draws them for this frame: `fade` is the map layer's (0 on foot, 1 high
   * up), `pixel` the world width of one CSS pixel at the ground's range, and
   * `fogNear`/`fogFar` the haze's, which the line fades into on foot.
   */
  update(eye: THREE.Vector3, fade: number, pixel: number, fogNear: number, fogFar: number, budgetMs: number): void;
  /** Whether the layer is wanted at all: `B`. */
  enabled: boolean;
  readonly stats: { built: number; total: number; samples: number };
  dispose(): void;
}

const VERTEX = /* glsl */ `
attribute vec3 across;
attribute float along;
uniform float uWidth;
varying float vAlong;
varying float vFacing;
varying float vRange;
void main() {
  vec3 local = position + across * uWidth;
  vec4 world = modelMatrix * vec4(local, 1.0);
  vAlong = along;
  // Over the horizon or not: a point on a ball is seen from an eye only where
  // the eye is on the outside of its tangent plane.
  vFacing = dot(cameraPosition - world.xyz, normalize(world.xyz));
  vRange = distance(cameraPosition, world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uDash;
uniform float uFogNear;
uniform float uFogFar;
uniform float uHorizon;
varying float vAlong;
varying float vFacing;
varying float vRange;
void main() {
  // From the air the depth test is off and the horizon is the only cut; on
  // foot a border up a hillside stands over the eye's tangent plane and the
  // depth test does the hiding.
  if (uHorizon > 0.5 && vFacing < 0.0) discard;
  if (fract(vAlong / uDash) > 0.58) discard;
  float haze = 1.0 - smoothstep(uFogNear, uFogFar, vRange);
  if (haze <= 0.0) discard;
  gl_FragColor = vec4(uColor, uOpacity * haze);
}`;

export function createFrontiers(geography: Geography, terrain: Terrain): Frontiers {
  const R = terrain.radius;
  const group = new THREE.Group();
  group.name = 'world-frontiers';
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.ink) },
      uOpacity: { value: FOOT_OPACITY },
      uWidth: { value: FOOT_WIDTH },
      uDash: { value: FOOT_WIDTH * DASH },
      uFogNear: { value: 1e9 },
      uFogFar: { value: 2e9 },
      uHorizon: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });
  material.name = 'world:frontiers';
  // A line on the ground is not an object: the ink pass leaves it out.
  material.userData.outlineParameters = { visible: false };

  // The whole length first, for the spacing a giant's frontiers can afford.
  const unit = new THREE.Vector3();
  const other = new THREE.Vector3();
  let length = 0;
  const lines = geography.frontiers.map((frontier) => {
    const dirs = frontier.points.map(([lon, lat]) => unitAt(lat!, lon!, new THREE.Vector3()));
    let span = 0;
    for (let k = 0; k + 1 < dirs.length; k++) span += dirs[k]!.angleTo(dirs[k + 1]!) * R;
    length += span;
    const middle = dirs[Math.floor(dirs.length / 2)] ?? new THREE.Vector3(0, 1, 0);
    return { dirs, span, middle, mesh: null as THREE.Mesh | null };
  });
  const spacing = Math.max(SPACING, length / MAX_SAMPLES);
  const stats = { built: 0, total: lines.length, samples: 0 };

  function build(line: (typeof lines)[number]): THREE.Mesh {
    const centres: THREE.Vector3[] = [];
    for (let k = 0; k + 1 < line.dirs.length; k++) {
      const a = line.dirs[k]!;
      const b = line.dirs[k + 1]!;
      const steps = Math.max(1, Math.ceil((a.angleTo(b) * R) / spacing));
      for (let s = 0; s < steps; s++) centres.push(unit.copy(a).lerp(b, s / steps).normalize().clone());
    }
    centres.push(line.dirs[line.dirs.length - 1]!.clone());
    // Each sample at the drawn ground's height, in the frame of the line's
    // first sample so the floats stay small on a giant.
    const origin = centres[0]!.clone().multiplyScalar(R + terrain.groundAt(centres[0]!.x, centres[0]!.y, centres[0]!.z));
    const n = centres.length;
    const positions = new Float32Array(n * 2 * 3);
    const across = new Float32Array(n * 2 * 3);
    const along = new Float32Array(n * 2);
    const points = centres.map((dir) => dir.clone().multiplyScalar(R + terrain.groundAt(dir.x, dir.y, dir.z) + LIFT));
    let travelled = 0;
    for (let k = 0; k < n; k++) {
      const p = points[k]!;
      if (k > 0) travelled += p.distanceTo(points[k - 1]!);
      // Sideways: the ground's up crossed with the way the line runs here.
      const ahead = points[Math.min(n - 1, k + 1)]!;
      const behind = points[Math.max(0, k - 1)]!;
      other.subVectors(ahead, behind);
      unit.copy(p).normalize().cross(other).normalize();
      for (let side = 0; side < 2; side++) {
        const v = k * 2 + side;
        positions[v * 3] = p.x - origin.x;
        positions[v * 3 + 1] = p.y - origin.y;
        positions[v * 3 + 2] = p.z - origin.z;
        const sign = side === 0 ? 0.5 : -0.5;
        across[v * 3] = unit.x * sign;
        across[v * 3 + 1] = unit.y * sign;
        across[v * 3 + 2] = unit.z * sign;
        along[v] = travelled;
      }
    }
    const index: number[] = [];
    for (let k = 0; k + 1 < n; k++) {
      const a = k * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('across', new THREE.BufferAttribute(across, 3));
    geometry.setAttribute('along', new THREE.BufferAttribute(along, 1));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    // The width moves the vertices out by at most a few pixels' worth.
    if (geometry.boundingSphere !== null) geometry.boundingSphere.radius += 50;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'frontier';
    mesh.position.copy(origin);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 2;
    mesh.frustumCulled = true;
    stats.samples += n;
    return mesh;
  }

  const eyeDir = new THREE.Vector3();
  const frontiers: Frontiers = {
    group,
    enabled: true,
    stats,
    update(eye, fade, pixel, fogNear, fogFar, budgetMs) {
      group.visible = frontiers.enabled;
      if (!frontiers.enabled) return;
      const began = performance.now();
      eyeDir.copy(eye).normalize();
      if (stats.built < stats.total) {
        const waiting = lines.filter((line) => line.mesh === null).sort((a, b) => b.middle.dot(eyeDir) - a.middle.dot(eyeDir));
        for (const line of waiting) {
          line.mesh = build(line);
          group.add(line.mesh);
          stats.built++;
          if (performance.now() - began > budgetMs) break;
        }
      }
      const width = Math.max(FOOT_WIDTH, FOOT_WIDTH + (AIR_PIXELS * pixel - FOOT_WIDTH) * fade);
      const uniforms = material.uniforms;
      uniforms.uWidth!.value = width;
      uniforms.uDash!.value = width * DASH;
      uniforms.uOpacity!.value = FOOT_OPACITY + (AIR_OPACITY - FOOT_OPACITY) * fade;
      // On foot the line is the haze's like everything else; from the air it
      // is the map's and is not hazed at all.
      uniforms.uFogNear!.value = fade > 0.5 ? 1e9 : fogNear;
      uniforms.uFogFar!.value = fade > 0.5 ? 2e9 : fogFar;
      material.depthTest = fade < 0.5;
      uniforms.uHorizon!.value = fade < 0.5 ? 0 : 1;
    },
    dispose() {
      for (const line of lines) line.mesh?.geometry.dispose();
      material.dispose();
    },
  };
  return frontiers;
}
