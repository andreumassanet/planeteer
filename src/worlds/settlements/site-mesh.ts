/** A town's draft group reduced to the one mesh it is drawn as. */

import * as THREE from 'three';
import { mergeMeshes, sourceVertex } from '../../merge.ts';
import type { MergePiece } from '../../merge.ts';
import type { Site } from './types.ts';

/**
 * Merges `draft` into one mesh at the site's frame, with each vertex's glow
 * (window masks, lit pieces and the civilisation's glowing colours), and
 * disposes the draft's own geometry. Returns the mesh and its triangle count.
 */
export function bakeTown(draft: THREE.Group, site: Site, material: THREE.Material, glowColors: ReadonlySet<number>): { mesh: THREE.Mesh; triangles: number } {
  const pieces: MergePiece[] = [];
  const merged = mergeMeshes(draft, pieces);
  const glow = new Float32Array(merged.position.length / 3);
  for (const piece of pieces) {
    const mask = piece.mesh.userData.glow as Uint8Array | undefined;
    if (mask !== undefined) {
      for (let i = 0; i < piece.count; i++) if (mask[sourceVertex(piece, i)] === 1) glow[piece.first + i] = 1;
      continue;
    }
    const lit = typeof piece.mesh.userData.atlasLit === 'number' ? (piece.mesh.userData.atlasLit as number) : 0;
    const stamped = piece.material.userData.atlasToon as number | undefined;
    const value = Math.max(lit, stamped !== undefined && glowColors.has(stamped) ? 1 : 0);
    if (value > 0) glow.fill(value, piece.first, piece.first + piece.count);
  }
  draft.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true && mesh.userData.shared !== true) mesh.geometry.dispose();
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(merged.color, 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(merged.outline, 3));
  geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `town ${site.id}`;
  mesh.position.copy(site.origin);
  mesh.quaternion.copy(site.quaternion);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return { mesh, triangles: merged.triangles };
}
