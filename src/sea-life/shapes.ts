// The swimmers' bodies: a small fish with a swinging tail, the big swimmers
// lofted by the craft's helpers into one inked geometry each, and the dot the
// bubbles are drawn with.

import * as THREE from 'three';
import { PALETTE, createToonRamp } from '../theme.ts';
import { assemble, craftContext, loft, soupOf } from '../craft/build.ts';
import type { Station } from '../craft/build.ts';
import { shadeByClouds } from '../cloud-shade.ts';

/**
 * A small fish, facing +Z, half a unit long: a diamond body and a forked
 * tail. The tail's vertices carry `aTail`, which the vertex shader swings by.
 */
export function fishGeometry(): THREE.BufferGeometry {
  const p: number[] = [];
  const tail: number[] = [];
  const nose = [0, 0, 0.3];
  const back = [0, 0, -0.18];
  const ring = [[0, 0.11, 0.02], [0.06, 0, 0.02], [0, -0.08, 0.02], [-0.06, 0, 0.02]];
  for (let k = 0; k < 4; k++) {
    const a = ring[k]!;
    const b = ring[(k + 1) % 4]!;
    p.push(...nose, ...b, ...a);
    p.push(...back, ...a, ...b);
    tail.push(0, 0, 0, 0.35, 0, 0);
  }
  // The tail: two blades off the wrist, a fork.
  p.push(0, 0, -0.16, 0, 0.13, -0.38, 0, 0.01, -0.3);
  p.push(0, 0, -0.16, 0, -0.01, -0.3, 0, -0.12, -0.37);
  tail.push(0.4, 1, 0.8, 0.4, 0.8, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('aTail', new THREE.Float32BufferAttribute(tail, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function fishMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ gradientMap: createToonRamp(4), side: THREE.DoubleSide });
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uFishTime'] = fishTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTail;\nuniform float uFishTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  transformed.x += sin(uFishTime * 11.0 + float(gl_InstanceID) * 1.7) * aTail * 0.09;`,
      );
  };
  material.customProgramCacheKey = () => 'atlas-fish';
  return shadeByClouds(material);
}

export const fishTime: THREE.IUniform<number> = { value: 0 };

/** The body built by a craft file's helpers, as one inked geometry. */
function soupGeometry(name: string, group: THREE.Group): THREE.BufferGeometry {
  const built = assemble(name, [soupOf(group)]);
  const body = built.getObjectByName('body') as THREE.Mesh;
  return body.geometry;
}

/** A streamlined body: sections of an ellipse along +Z, `stations` as [z, half-width, top, bottom]. */
function body(stations: readonly (readonly [number, number, number, number])[], color: number, sides = 8): THREE.Mesh {
  const lofted: Station[] = stations.map(([z, half, top, bottom]) => ({
    z,
    ring: Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2;
      const s = Math.sin(a);
      return [Math.cos(a) * half, s >= 0 ? s * top : s * bottom] as [number, number];
    }),
  }));
  return loft(lofted, color);
}

/** A flat fin from `root` to `tip`, as a thin box. */
function fin(root: THREE.Vector3, tip: THREE.Vector3, chord: number, color: number): THREE.Mesh {
  const ctx = craftContext();
  return ctx.strut(root, tip, chord, color);
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** A palette colour a shade off, which is every colour a craft's helpers take. */
const toned = (colour: number, factor: number): number => craftContext().tone(colour, factor);

export function sharkGeometry(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const grey = toned(PALETTE.steel, 1.3);
  g.add(body([[-2.1, 0.05, 0.08, 0.05], [-1.4, 0.24, 0.3, 0.22], [-0.2, 0.42, 0.5, 0.36], [0.9, 0.36, 0.42, 0.3], [1.7, 0.16, 0.2, 0.14], [2.1, 0.03, 0.04, 0.03]], grey));
  g.add(fin(V(0, 0.4, -0.1), V(0, 1.25, -0.55), 0.12, grey));
  g.add(fin(V(0, 0.05, -2.0), V(0, 0.95, -2.5), 0.1, grey));
  g.add(fin(V(0, 0.0, -2.0), V(0, -0.6, -2.35), 0.1, grey));
  for (const side of [-1, 1]) g.add(fin(V(side * 0.3, -0.15, 0.3), V(side * 1.1, -0.45, -0.2), 0.1, grey));
  return soupGeometry('shark', g);
}

export function rayGeometry(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const sand = toned(PALETTE.brown, 0.85);
  // A wide flat diamond: the ring is broad and thin, the stations short.
  g.add(body([[-0.9, 0.2, 0.06, 0.04], [-0.3, 1.1, 0.14, 0.08], [0.3, 1.2, 0.16, 0.08], [0.9, 0.18, 0.06, 0.04]], sand, 6));
  g.add(fin(V(0, 0.02, -0.9), V(0, 0.04, -2.6), 0.05, toned(PALETTE.brown, 0.6)));
  return soupGeometry('ray', g);
}

export function turtleGeometry(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const shell = toned(PALETTE.olive, 0.62);
  const skin = toned(PALETTE.green, 0.9);
  g.add(body([[-0.8, 0.3, 0.2, 0.08], [-0.3, 0.62, 0.42, 0.14], [0.35, 0.6, 0.42, 0.14], [0.85, 0.28, 0.18, 0.08]], shell, 8));
  g.add(body([[0.8, 0.12, 0.12, 0.1], [1.2, 0.13, 0.13, 0.1], [1.4, 0.08, 0.08, 0.07]], skin, 6));
  for (const side of [-1, 1]) {
    g.add(fin(V(side * 0.45, 0, 0.45), V(side * 1.25, -0.05, 0.1), 0.12, skin));
    g.add(fin(V(side * 0.4, 0, -0.5), V(side * 0.8, -0.05, -0.85), 0.1, skin));
  }
  return soupGeometry('turtle', g);
}

export function dolphinGeometry(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const blue = toned(PALETTE.slate, 0.95);
  g.add(body([[-1.7, 0.06, 0.08, 0.06], [-1.1, 0.22, 0.28, 0.22], [-0.1, 0.36, 0.42, 0.34], [0.8, 0.3, 0.36, 0.3], [1.3, 0.13, 0.16, 0.12], [1.75, 0.06, 0.06, 0.05]], blue));
  g.add(fin(V(0, 0.38, 0.05), V(0, 0.95, -0.4), 0.1, blue));
  // The flukes, flat across the tail.
  g.add(fin(V(-0.05, 0, -1.65), V(-0.65, 0.02, -2.05), 0.08, blue));
  g.add(fin(V(0.05, 0, -1.65), V(0.65, 0.02, -2.05), 0.08, blue));
  for (const side of [-1, 1]) g.add(fin(V(side * 0.25, -0.18, 0.5), V(side * 0.75, -0.4, 0.15), 0.08, blue));
  return soupGeometry('dolphin', g);
}

export function whaleGeometry(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const slate = toned(PALETTE.steel, 0.95);
  g.add(body([[-9, 0.3, 0.35, 0.3], [-6, 1.3, 1.5, 1.2], [-1, 2.3, 2.6, 2.2], [3.5, 2.2, 2.4, 2.1], [7, 1.5, 1.4, 1.5], [9, 0.5, 0.4, 0.5]], slate, 10));
  g.add(fin(V(-0.3, 0, -8.8), V(-3.6, 0.1, -10.8), 0.35, slate));
  g.add(fin(V(0.3, 0, -8.8), V(3.6, 0.1, -10.8), 0.35, slate));
  g.add(fin(V(0, 2.2, -4), V(0, 3.0, -5.2), 0.3, slate));
  for (const side of [-1, 1]) g.add(fin(V(side * 1.8, -1.2, 3), V(side * 4.2, -2.1, 1.2), 0.3, slate));
  return soupGeometry('whale', g);
}

/** A soft round dot, for the bubbles and the spout. */
export function dotTexture(): THREE.DataTexture {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
      const ring = d > 1 ? 0 : d > 0.7 ? 1 : 0.35 + 0.4 * d;
      const o = (y * size + x) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = Math.round(ring * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}
