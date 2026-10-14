/** The pieces picked for a tile, merged into the one geometry it carries. */

import * as THREE from 'three';
import type { Merged } from '../../merge.ts';

/** A shape standing on the tile: its arrays, the matrix that places it, and the colour it is multiplied by. */
export interface Pick {
  variant: Merged;
  matrix: THREE.Matrix4;
  tint?: [number, number, number] | undefined;
}

const normalMatrix = new THREE.Matrix3();
const point = new THREE.Vector3();

/** Every pick's arrays moved under its matrix and tinted, in one geometry; null if there are none. */
export function mergePicks(picks: readonly Pick[]): THREE.BufferGeometry | null {
  if (picks.length === 0) return null;
  let count = 0;
  for (const pick of picks) count += pick.variant.position.length;
  const position = new Float32Array(count);
  const normal = new Float32Array(count);
  const color = new Float32Array(count);
  let at = 0;
  for (const pick of picks) {
    normalMatrix.getNormalMatrix(pick.matrix);
    const source = pick.variant;
    for (let i = 0; i < source.position.length; i += 3) {
      point.set(source.position[i]!, source.position[i + 1]!, source.position[i + 2]!).applyMatrix4(pick.matrix);
      position[at + i] = point.x;
      position[at + i + 1] = point.y;
      position[at + i + 2] = point.z;
      point.set(source.normal[i]!, source.normal[i + 1]!, source.normal[i + 2]!).applyMatrix3(normalMatrix).normalize();
      normal[at + i] = point.x;
      normal[at + i + 1] = point.y;
      normal[at + i + 2] = point.z;
    }
    color.set(source.color, at);
    const tint = pick.tint;
    if (tint !== undefined) {
      for (let i = 0; i < source.color.length; i += 3) {
        color[at + i] = color[at + i]! * tint[0];
        color[at + i + 1] = color[at + i + 1]! * tint[1];
        color[at + i + 2] = color[at + i + 2]! * tint[2];
      }
    }
    at += source.position.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
