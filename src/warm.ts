import * as THREE from 'three';
import type { OutlineEffect } from './outline.ts';

/**
 * Every shader the world will draw with, compiled while the menu is up.
 *
 * **Three compiles a program the first time something drawn with it is on the
 * screen, synchronously, inside that frame** — so the first town, the first
 * wood, the first landmark and the first animal each arrived with a hitch the
 * size of a link, and on Windows, where ANGLE translates every program to
 * HLSL first, the worst of it. The menu is seconds of a player choosing where
 * to go with the world already built underneath, which is exactly the time
 * this wants.
 *
 * So each streamer hands over a **proxy**: one triangle drawn with its own
 * material, carrying the attributes its real buffers carry, compiled against
 * the real scene — its lights, its fog, its shadow — through
 * `renderer.compileAsync`, and its ink hull through the effect's own
 * `compileAsync`, which is the half three cannot see: the hull is a material
 * the effect makes, and a program three has never been shown. Programs are
 * shared between materials by source and parameters, so one proxy stands for
 * every material of its kind — the skinned twin below is the program every
 * person and every animal will use, whichever material instance they get —
 * and a streamer that fades (`fade.ts`) hands over its dissolving twin too,
 * fill and hull, so the first thing to fade in is not the first to compile.
 *
 * What is not covered, and why: the shadow pass's depth programs, which three
 * builds inside `WebGLShadowMap` during a render and exposes no way to compile
 * (they are a handful of tiny programs). The land's flagged program, which
 * `globe.ts` switches to on the first climb, is handed over by `main.ts` as
 * `landFlagProxy`.
 */
export interface Warmable {
  /** One mesh for each program this module draws with; see `proxyOf`. */
  proxies(): THREE.Object3D[];
}

/**
 * One triangle drawn with `material`, with the attributes a merged buffer in
 * this world carries — position, normal, a three-channel colour and the ink's
 * normal — so it asks three for the same program the real buffer will. A
 * skinned one is bound to a skeleton of one bone.
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
 * the proxies away. Resolves with how long the whole thing took, which is time
 * the menu spent and a frame did not.
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
    // The fills first: `compileAsync` takes what it compiles synchronously, so
    // the proxies can move on to the hulls straight after — but only those
    // that have one. A road or a blade of grass has no ink, and its hull would
    // be a program compiled for nothing.
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
