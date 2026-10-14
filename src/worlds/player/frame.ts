/** Scratch vectors the player's parts share, and the orientation they set an object's frame by. */

import * as THREE from 'three';

export const UP = new THREE.Vector3();
export const RIGHT = new THREE.Vector3();
export const FORWARD = new THREE.Vector3();
export const WANT = new THREE.Vector3();
export const WAS_FACING = new THREE.Vector3();
const CROSS = new THREE.Vector3();
const basis = new THREE.Matrix4();

/** The angle from `from` to `to` about `about`, positive to the left: Earth's `player.ts` measures the same. */
export function angleAbout(from: THREE.Vector3, to: THREE.Vector3, about: THREE.Vector3): number {
  CROSS.crossVectors(from, to);
  return Math.atan2(CROSS.dot(about), from.dot(to));
}

/** Points a group's +y along `up` and its +z along `forward` (tangent). Right-handed. */
export function orient(object: THREE.Object3D, up: THREE.Vector3, forward: THREE.Vector3): void {
  const z = FORWARD.copy(forward).addScaledVector(up, -forward.dot(up));
  if (z.lengthSq() < 1e-10) z.set(up.y, -up.x, 0).normalize();
  z.normalize();
  const x = RIGHT.crossVectors(up, z).normalize();
  basis.makeBasis(x, up, z);
  object.quaternion.setFromRotationMatrix(basis);
}
