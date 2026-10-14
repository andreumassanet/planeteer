/** A member of the species built in code, skinned: the body the species' numbers describe. */

import * as THREE from 'three';
import type { Civilisation, WorldSpec } from '../contract.ts';
import type { SceneryContext } from '../../scenery/contract.ts';
import { rngFrom } from '../../scenery/random.ts';
import { alienFor, rigAlien, standAlien } from '../../system/alien.ts';
import type { AlienRig } from '../../system/alien.ts';
import { mergeMeshes } from '../../merge.ts';
import type { MergePiece } from '../../merge.ts';

/** One body of the species built in code (`system/alien.ts`), skinned: a section a joint. */
export interface AlienBody {
  geometry: THREE.BufferGeometry;
  /** The joints as built, without their sections. */
  rig: AlienRig;
  inverses: THREE.Matrix4[];
  height: number;
  float: boolean;
}

/**
 * A member of the species as `system/alien.ts` builds it — the parametric
 * body the system's checks hold to its budget — skinned onto its own joints:
 * every section merged into one geometry and bound wholly to the joint it
 * hangs from. The towns are peopled from the kit's creatures instead; this
 * is the body the species' numbers describe.
 */
export function bodyOf(ctx: SceneryContext, spec: WorldSpec, civ: Civilisation, index: number): AlienBody {
  const alien = alienFor(rngFrom('worlds', spec.id, 'alien', index), civ.species, { pose: 'stand' });
  const rig = rigAlien(ctx, civ.species.morph, alien);
  standAlien(rig);
  const pieces: MergePiece[] = [];
  const merged = mergeMeshes(rig.group, pieces);
  const count = merged.position.length / 3;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (const piece of pieces) {
    let owner: THREE.Object3D | null = piece.mesh.parent;
    while (owner !== null && (owner as THREE.Bone).isBone !== true) owner = owner.parent;
    const bone = Math.max(0, rig.bones.indexOf(owner as THREE.Bone));
    for (let i = piece.first; i < piece.first + piece.count; i++) {
      skinIndex[i * 4] = bone;
      skinWeight[i * 4] = 1;
    }
    piece.mesh.parent?.remove(piece.mesh);
    piece.geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(merged.color, 3));
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(merged.outline, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geometry.computeBoundingSphere();
  // Bound where it stands: the rig's group is at the origin, so the joints'
  // world matrices are their rest matrices and their inverses are the bind.
  const holder = new THREE.SkinnedMesh(geometry);
  holder.add(rig.root);
  holder.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.bones);
  holder.bind(skeleton);
  holder.remove(rig.root);
  return { geometry, rig, inverses: skeleton.boneInverses, height: rig.height, float: rig.hover > 0 };
}
