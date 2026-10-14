/** Edits made to pack models before conversion: simpler wheels, and the camel's hump. */
import * as THREE from 'three';
import type { RigEntry } from './manifest.ts';

const TYRE = new THREE.MeshStandardMaterial({ name: 'Tyre', color: new THREE.Color().setStyle('#3a3a44', THREE.SRGBColorSpace) });
const HUB = new THREE.MeshStandardMaterial({ name: 'Hub', color: new THREE.Color().setStyle('#c8c8d8', THREE.SRGBColorSpace) });

/**
 * Swaps every wheel mesh under `root` for a 12-sided tyre and a hub of the same
 * bounding box, in the wheel's own place. The axle is the box's thinnest axis.
 */
export function rebuildWheels(root: THREE.Object3D, pattern: RegExp): number {
  root.updateMatrixWorld(true);
  const wheels: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && pattern.test(object.name)) wheels.push(object as THREE.Mesh);
  });
  const parent = new THREE.Matrix4();
  for (const wheel of wheels) {
    const box = new THREE.Box3().setFromObject(wheel);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.y, Math.min(size.x, size.z)) / 2;
    const width = Math.min(size.x, size.z);
    const axleX = size.x <= size.z;
    const tyre = new THREE.CylinderGeometry(radius, radius, width, 12, 1, false);
    const hub = new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width * 1.08, 12, 1, false);
    for (const geometry of [tyre, hub]) {
      geometry.rotateZ(Math.PI / 2);
      if (!axleX) geometry.rotateY(Math.PI / 2);
      geometry.translate(centre.x, centre.y, centre.z);
    }
    const group = new THREE.Group();
    group.add(new THREE.Mesh(tyre, TYRE), new THREE.Mesh(hub, HUB));
    // The new meshes are in the root's frame; put them where the wheel's parent is.
    const holder = wheel.parent!;
    parent.copy(holder.matrixWorld).invert().multiply(root.matrixWorld);
    group.applyMatrix4(parent);
    holder.add(group);
    wheel.removeFromParent();
  }
  return wheels.length;
}

/**
 * Grows a hump on a rig's back: a low-poly ellipsoid hung off `bone`, sitting on
 * the top of the body where that bone runs, in the colour slot of the hide.
 * `rigFrom` then weights it wholly to the bone, the way it keeps a stag's
 * antlers, so the hump rides the spine through every clip.
 */
export function addHump(scene: THREE.Group, hump: NonNullable<RigEntry['hump']>): void {
  scene.updateMatrixWorld(true);
  let body: THREE.SkinnedMesh | null = null;
  let bone: THREE.Bone | null = null;
  scene.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh && body === null) body = object as THREE.SkinnedMesh;
    if ((object as THREE.Bone).isBone && object.name === hump.bone) bone = object as THREE.Bone;
  });
  if (body === null || bone === null) throw new Error(`hump: no body or no bone ${hump.bone}`);
  const skinned = body as THREE.SkinnedMesh;
  const spine = bone as THREE.Bone;
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  const at = spine.getWorldPosition(new THREE.Vector3());
  // The top of the back over the bone: the highest skinned vertex near it.
  let top = -Infinity;
  const vertex = new THREE.Vector3();
  const reach = size.z * 0.12;
  for (let i = 0; i < skinned.geometry.getAttribute('position').count; i++) {
    skinned.getVertexPosition(i, vertex).applyMatrix4(skinned.matrixWorld);
    if (Math.abs(vertex.z - at.z) < reach && Math.abs(vertex.x - at.x) < size.x * 0.25) top = Math.max(top, vertex.y);
  }
  const material = (Array.isArray(skinned.material) ? skinned.material : [skinned.material]).find((m) => m.name === hump.slot);
  const geometry = new THREE.SphereGeometry(1, 9, 6);
  const mesh = new THREE.Mesh(geometry, material ?? new THREE.MeshStandardMaterial({ name: hump.slot }));
  mesh.scale.set((size.x * hump.width) / 2, size.z * hump.height, (size.z * hump.length) / 2);
  // Sunk most of the way into the back, so it grows out of the hide rather than sitting on it.
  mesh.position.set(at.x, top + mesh.scale.y * 0.2, at.z);
  scene.add(mesh);
  mesh.updateMatrixWorld(true);
  spine.attach(mesh);
}
