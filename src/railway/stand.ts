import * as THREE from 'three';

const standBasis = new THREE.Matrix4();
const standX = new THREE.Vector3();
const standY = new THREE.Vector3();
const standZ = new THREE.Vector3();

/**
 * Stands an object at `direction`, `radius` from the planet's centre, facing
 * `facing` (a tangent). Throws on a mirrored basis, which would turn the
 * outline hull inside out.
 */
export function standAt(object: THREE.Object3D, direction: THREE.Vector3, radius: number, facing: THREE.Vector3): void {
  standY.copy(direction).normalize();
  standZ.copy(facing).addScaledVector(standY, -facing.dot(standY)).normalize();
  standX.crossVectors(standY, standZ).normalize();
  standBasis.makeBasis(standX, standY, standZ);
  if (standBasis.determinant() <= 0) throw new Error('railway: a mirrored placement');
  object.position.copy(standY).multiplyScalar(radius);
  object.quaternion.setFromRotationMatrix(standBasis);
  object.updateMatrixWorld(true);
}

/** Disposes every mesh geometry under an object. */
export function disposeGroup(object: THREE.Object3D): void {
  object.traverse((part) => {
    const mesh = part as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}
