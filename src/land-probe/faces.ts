/** The land probe's bucket index over a set of faces, and the ray test against it. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';

/** Width of one bucket of the index, in the centre's tangent plane, units. */
export const BUCKET = 48;
/**
 * A face's box is grown by this in the index. The box is taken off the
 * corners projected onto the tangent plane, and the face between them is a
 * chord the projection bends: by hundredths of a unit at the index's edge,
 * which is a point on a shared edge answered by neither face.
 */
const PAD = 0.5;
/** Slack on the barycentric test, for the same seam: a ray down an edge hits both faces rather than neither. */
const SEAM = 1e-7;

export interface FaceIndex {
  centre: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  /** Where bucket `b`'s faces start in `faces`; `side * side + 1` long. */
  start: Uint32Array;
  faces: Uint32Array;
}

const unit = new THREE.Vector3();

/** Buckets `found` (face numbers of `position`) in the tangent plane at `centre`, `side` buckets across, `reach` units either way. */
export function buildFaceIndex(position: Float32Array, centre: THREE.Vector3, found: number[], reach: number, side: number): FaceIndex {
  const east = new THREE.Vector3();
  const north = new THREE.Vector3(0, 1, 0).projectOnPlane(centre);
  if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(centre);
  north.normalize();
  east.crossVectors(centre, north).normalize();
  const count = new Uint32Array(side * side + 1);
  const spans: number[] = [];
  const kept: number[] = [];
  for (const face of found) {
    const o = face * 9;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let k = 0; k < 9; k += 3) {
      unit.set(position[o + k]!, position[o + k + 1]!, position[o + k + 2]!);
      const scale = PLANET_RADIUS / unit.length();
      const x = unit.dot(east) * scale;
      const z = unit.dot(north) * scale;
      x0 = Math.min(x0, x - PAD);
      x1 = Math.max(x1, x + PAD);
      z0 = Math.min(z0, z - PAD);
      z1 = Math.max(z1, z + PAD);
    }
    const i0 = Math.max(0, Math.floor((x0 + reach) / BUCKET));
    const i1 = Math.min(side - 1, Math.floor((x1 + reach) / BUCKET));
    const j0 = Math.max(0, Math.floor((z0 + reach) / BUCKET));
    const j1 = Math.min(side - 1, Math.floor((z1 + reach) / BUCKET));
    if (i0 > i1 || j0 > j1) continue;
    kept.push(face);
    spans.push(i0, i1, j0, j1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) count[j * side + i + 1]!++;
  }
  for (let b = 1; b < count.length; b++) count[b]! += count[b - 1]!;
  const into = new Uint32Array(count[count.length - 1]!);
  const cursor = count.slice(0, side * side);
  kept.forEach((face, n) => {
    const i0 = spans[n * 4]!;
    const i1 = spans[n * 4 + 1]!;
    const j0 = spans[n * 4 + 2]!;
    const j1 = spans[n * 4 + 3]!;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) into[cursor[j * side + i]!++] = face;
  });
  return { centre: centre.clone(), east, north, start: count, faces: into };
}

/**
 * The distance along `direction` from the planet's centre to the highest face
 * of the index it meets, or null. An enclave is drawn twice (its own ring and
 * the outer ring of the country round it, by two triangulations of one
 * relief), so the two surfaces are a unit or two apart and the higher is the
 * one seen. `normal`, when given, is filled with that face's own; `shading`,
 * with the mesh's own normals (`normals`, three signed bytes a corner) laid
 * between the corners, which is the normal the land is drawn with.
 */
export function highestHit(
  position: Float32Array, index: FaceIndex, direction: THREE.Vector3, normal: THREE.Vector3 | undefined, reach: number, side: number,
  normals?: Int8Array, shading?: THREE.Vector3,
): number | null {
  if (direction.dot(index.centre) < 0) return null;
  const i = Math.floor((direction.dot(index.east) * PLANET_RADIUS + reach) / BUCKET);
  const j = Math.floor((direction.dot(index.north) * PLANET_RADIUS + reach) / BUCKET);
  if (i < 0 || j < 0 || i >= side || j >= side) return null;
  const b = j * side + i;
  let best = 0;
  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;
  for (let n = index.start[b]!; n < index.start[b + 1]!; n++) {
    // Moller-Trumbore, on the ray from the planet's centre.
    const o = index.faces[n]! * 9;
    const ax = position[o]!;
    const ay = position[o + 1]!;
    const az = position[o + 2]!;
    const e1x = position[o + 3]! - ax;
    const e1y = position[o + 4]! - ay;
    const e1z = position[o + 5]! - az;
    const e2x = position[o + 6]! - ax;
    const e2y = position[o + 7]! - ay;
    const e2z = position[o + 8]! - az;
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) continue;
    const inverse = 1 / det;
    const u = (-ax * px - ay * py - az * pz) * inverse;
    if (u < -SEAM || u > 1 + SEAM) continue;
    const qx = -ay * e1z + az * e1y;
    const qy = -az * e1x + ax * e1z;
    const qz = -ax * e1y + ay * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inverse;
    if (v < -SEAM || u + v > 1 + SEAM) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inverse;
    if (t <= best) continue;
    best = t;
    if (normal !== undefined) {
      normal.set(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x).normalize();
      if (normal.dot(direction) < 0) normal.negate();
    }
    if (shading !== undefined && normals !== undefined) {
      const w = 1 - u - v;
      shading.set(
        normals[o]! * w + normals[o + 3]! * u + normals[o + 6]! * v,
        normals[o + 1]! * w + normals[o + 4]! * u + normals[o + 7]! * v,
        normals[o + 2]! * w + normals[o + 5]! * u + normals[o + 8]! * v,
      ).normalize();
    }
  }
  return best > 0 ? best : null;
}
