// The bubbles: a ring of particles, each born somewhere and rising.

import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { dotTexture } from './shapes.ts';

export const MAX_BUBBLES = 96;

export interface Bubbles {
  points: THREE.Points;
  material: THREE.PointsMaterial;
  /** Releases a bubble at `from`, rising at `rise` with `spread` of jitter, for `life` seconds. */
  spawn(from: THREE.Vector3, rise: number, spread: number, life: number): void;
  /** Advances every bubble by `dt`; returns how many are alive. */
  update(dt: number): number;
}

export function createBubbles(): Bubbles {
  const position = new Float32Array(MAX_BUBBLES * 3);
  const velocity = new Float32Array(MAX_BUBBLES * 3);
  const age = new Float32Array(MAX_BUBBLES).fill(Infinity);
  const life = new Float32Array(MAX_BUBBLES).fill(1);
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(position, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  const material = new THREE.PointsMaterial({
    size: 0.45,
    map: dotTexture(),
    transparent: true,
    depthWrite: false,
    color: 0xeaf8ff,
    opacity: 0.85,
  });
  material.userData.outlineParameters = { visible: false };
  const points = new THREE.Points(geometry, material);
  points.name = 'bubbles';
  points.frustumCulled = false;
  let next = 0;
  const up = new THREE.Vector3();
  const at = new THREE.Vector3();

  function spawn(from: THREE.Vector3, rise: number, spread: number, lifetime: number): void {
    const i = next;
    next = (next + 1) % MAX_BUBBLES;
    up.copy(from).normalize();
    position[i * 3] = from.x + (Math.random() - 0.5) * spread;
    position[i * 3 + 1] = from.y + (Math.random() - 0.5) * spread;
    position[i * 3 + 2] = from.z + (Math.random() - 0.5) * spread;
    velocity[i * 3] = up.x * rise + (Math.random() - 0.5) * 0.3;
    velocity[i * 3 + 1] = up.y * rise + (Math.random() - 0.5) * 0.3;
    velocity[i * 3 + 2] = up.z * rise + (Math.random() - 0.5) * 0.3;
    age[i] = 0;
    life[i] = lifetime;
  }

  function update(dt: number): number {
    let alive = 0;
    for (let i = 0; i < MAX_BUBBLES; i++) {
      const old = age[i]! + dt;
      if (old === Infinity) continue;
      age[i] = old;
      const o = i * 3;
      at.set(position[o]!, position[o + 1]!, position[o + 2]!);
      // A bubble that reaches the surface, or outlives itself, is gone.
      if (age[i]! > life[i]! || at.length() > PLANET_RADIUS + 0.3 + (life[i]! < 1.5 ? 8 : 0)) {
        age[i] = Infinity;
        position[o] = position[o + 1] = position[o + 2] = 0;
        continue;
      }
      position[o] = at.x + velocity[o]! * dt;
      position[o + 1] = at.y + velocity[o + 1]! * dt;
      position[o + 2] = at.z + velocity[o + 2]! * dt;
      alive++;
    }
    if (alive > 0) attribute.needsUpdate = true;
    points.visible = alive > 0;
    return alive;
  }

  return { points, material, spawn, update };
}
