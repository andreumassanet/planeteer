/** The lightning bolt's geometry. */
import * as THREE from 'three';
import { BOLT_SEGMENTS, BOLT_SIDES, BRANCH_SEGMENTS, mulberry } from './constants.ts';

/**
 * The bolt: a jagged square tube from the cloud base to the ground, with one
 * branch, written into a buffer that exists from the start. Each quad is wound
 * outward, checked against its own segment's axis, because the ink is a
 * back-face hull and an inward quad is a solid black blob. Returns how many
 * quads had to be turned.
 */
export function writeBolt(
  positions: Float32Array,
  base: THREE.Vector3,
  up: THREE.Vector3,
  height: number,
  radius: number,
  seed: number,
): number {
  const random = mulberry(Math.floor(seed * 4294967296));
  const east = new THREE.Vector3().crossVectors(Y, up);
  if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
  east.normalize();
  const north = new THREE.Vector3().crossVectors(up, east);
  const path: THREE.Vector3[] = [];
  let x = 0;
  let z = 0;
  for (let i = 0; i <= BOLT_SEGMENTS; i++) {
    const t = i / BOLT_SEGMENTS;
    if (i > 0 && i < BOLT_SEGMENTS) {
      x += (random() - 0.5) * height * 0.09;
      z += (random() - 0.5) * height * 0.09;
    }
    path.push(new THREE.Vector3().copy(base).addScaledVector(up, height * (1 - t)).addScaledVector(east, x).addScaledVector(north, z));
  }
  const fork = 3 + Math.floor(random() * 5);
  const branch: THREE.Vector3[] = [path[fork]!.clone()];
  const lean = random() * Math.PI * 2;
  for (let i = 1; i <= BRANCH_SEGMENTS; i++) {
    const last = branch[i - 1]!;
    branch.push(
      last
        .clone()
        .addScaledVector(up, -height * 0.055)
        .addScaledVector(east, Math.cos(lean) * height * 0.05 + (random() - 0.5) * height * 0.04)
        .addScaledVector(north, Math.sin(lean) * height * 0.05 + (random() - 0.5) * height * 0.04),
    );
  }
  let at = 0;
  let turned = 0;
  const axis = new THREE.Vector3();
  const u = new THREE.Vector3();
  const w = new THREE.Vector3();
  const ci = new THREE.Vector3();
  const cj = new THREE.Vector3();
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const write = (v: THREE.Vector3): void => {
    positions[at++] = v.x;
    positions[at++] = v.y;
    positions[at++] = v.z;
  };
  const tube = (points: THREE.Vector3[], r0: number, r1: number): void => {
    for (let s = 0; s + 1 < points.length; s++) {
      const a = points[s]!;
      const b = points[s + 1]!;
      axis.subVectors(b, a).normalize();
      u.copy(Math.abs(axis.dot(up)) < 0.9 ? up : east).projectOnPlane(axis).normalize();
      w.crossVectors(axis, u);
      const ra = r0 + (r1 - r0) * (s / (points.length - 1));
      const rb = r0 + (r1 - r0) * ((s + 1) / (points.length - 1));
      for (let k = 0; k < BOLT_SIDES; k++) {
        const t0 = (k / BOLT_SIDES) * Math.PI * 2;
        const t1 = ((k + 1) / BOLT_SIDES) * Math.PI * 2;
        ci.copy(u).multiplyScalar(Math.cos(t0)).addScaledVector(w, Math.sin(t0));
        cj.copy(u).multiplyScalar(Math.cos(t1)).addScaledVector(w, Math.sin(t1));
        p[0]!.copy(a).addScaledVector(ci, ra);
        p[1]!.copy(a).addScaledVector(cj, ra);
        p[2]!.copy(b).addScaledVector(cj, rb);
        p[3]!.copy(b).addScaledVector(ci, rb);
        e1.subVectors(p[1]!, p[0]!);
        e2.subVectors(p[2]!, p[0]!);
        n.crossVectors(e1, e2);
        const outward = n.dot(ci.add(cj)) > 0;
        if (!outward) turned++;
        const order = outward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const o of order) write(p[o]!);
      }
    }
  };
  tube(path, radius, radius * 0.55);
  tube(branch, radius * 0.6, radius * 0.25);
  return turned;
}

/** Vertices the bolt buffer holds: two triangles a side, a side a segment. */
export const BOLT_VERTICES = (BOLT_SEGMENTS + BRANCH_SEGMENTS) * BOLT_SIDES * 6;
export const Y = new THREE.Vector3(0, 1, 0);

/** The bolt mesh, its buffer and its material. */
export function createBoltMesh() {
  const boltPositions = new Float32Array(BOLT_VERTICES * 3);
  const boltGeometry = new THREE.BufferGeometry();
  const boltAttribute = new THREE.BufferAttribute(boltPositions, 3);
  boltAttribute.setUsage(THREE.DynamicDrawUsage);
  boltGeometry.setAttribute('position', boltAttribute);
  const boltMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f1ff, fog: false });
  boltMaterial.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01] };
  const bolt = new THREE.Mesh(boltGeometry, boltMaterial);
  bolt.name = 'weather-bolt';
  bolt.frustumCulled = false;
  bolt.visible = false;
  return { bolt, boltPositions, boltAttribute, boltGeometry, boltMaterial };
}
