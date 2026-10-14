import * as THREE from 'three';
import type { OutlineEffect } from './outline.ts';

/**
 * Every shader the world will draw with, compiled while the menu is up.
 *
 * Three compiles a program synchronously the first time something drawn with it
 * is on screen, so the first town, wood, landmark and animal each arrived with a
 * hitch the size of a link (worst on Windows, where ANGLE translates every
 * program to HLSL first). The menu is seconds of a player choosing where to go
 * with the world already built underneath.
 *
 * Each streamer hands over a proxy: one triangle drawn with its own material,
 * carrying the attributes its real buffers carry, compiled against the real
 * scene (its lights, fog and shadow) through `renderer.compileAsync`, and its
 * ink hull through the effect's own `compileAsync`, since the hull is a material
 * the effect makes. Programs are shared between materials by source and
 * parameters, so one proxy stands for every material of its kind, and a
 * streamer that fades (`fade.ts`) hands over its dissolving twin too.
 *
 * Not covered: the shadow pass's depth programs, which three builds inside
 * `WebGLShadowMap` during a render and offers no way to compile. The land's
 * flagged program is handed over by `main.ts` as `landFlagProxy`.
 */
export interface Warmable {
  /** One mesh for each program this module draws with; see `proxyOf`. */
  proxies(): THREE.Object3D[];
}

/**
 * One triangle drawn with `material`, with the attributes a merged buffer in
 * this world carries (position, normal, a three-channel colour and the ink's
 * normal) so it asks three for the same program the real buffer will. A skinned
 * one is bound to a skeleton of one bone.
 */
export function proxyOf(material: THREE.Material, skinned = false): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const triangle = new Float32Array([0, 0, 0, 1e-3, 0, 0, 0, 0, 1e-3]);
  const up = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
  geometry.setAttribute('position', new THREE.BufferAttribute(triangle, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(up, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(up.slice(), 3));
  if (!skinned) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const bone = new THREE.Bone();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Compiles every proxy's program, fill and hull, against `scene`, and throws
 * the proxies away. Resolves with how long it took.
 */
export async function warmShaders(
  renderer: THREE.WebGLRenderer,
  outline: OutlineEffect,
  scene: THREE.Scene,
  sources: readonly Warmable[],
  /** A material of the kind the people and the animals are drawn with, for the skinned twin. */
  skinnedLike?: THREE.Material,
): Promise<number> {
  const began = performance.now();
  const holder = new THREE.Group();
  for (const source of sources) for (const proxy of source.proxies()) holder.add(proxy);
  if (skinnedLike !== undefined) holder.add(proxyOf(skinnedLike, true));
  holder.updateMatrixWorld(true);
  // Only the render state: lights and layers. It draws nothing.
  const camera = new THREE.PerspectiveCamera();
  const inked = new THREE.Group();
  try {
    // The fills first: `compileAsync` takes what it compiles synchronously, so the
    // proxies can move on to the hulls straight after, but only those that have
    // one (a road or a blade of grass has no ink).
    const fills = renderer.compileAsync(holder, camera, scene);
    for (const proxy of [...holder.children]) {
      const material = (proxy as THREE.Mesh).material as THREE.Material;
      const ink = material.userData.outlineParameters as { visible?: boolean } | undefined;
      if (ink?.visible !== false) inked.add(proxy);
    }
    inked.updateMatrixWorld(true);
    await Promise.all([fills, outline.compileAsync(inked, camera, scene)]);
  } finally {
    for (const group of [holder, inked]) group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
      const skinned = object as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) skinned.skeleton.dispose();
    });
  }
  return performance.now() - began;
}
