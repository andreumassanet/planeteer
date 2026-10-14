import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { AIRLINER_ENGINE_X, AIRLINER_ENGINE_Y } from '../craft/airliner.ts';
import { CAPS, flyerPose } from './flight.ts';
import type { Flight } from './flight.ts';
import { smooth } from './paths.ts';

/**
 * Contrails. A flight is a function of time, so an airliner's trail is its
 * own past: `pose(t - k * TRAIL_STEP)` per sample, drawn as a camera-facing
 * ribbon behind each engine that widens and fades with age. One mesh for all
 * of them, rewritten each frame.
 */

/** Samples a contrail, and seconds between them: a trail a minute long. */
const TRAIL_POINTS = 40;
const TRAIL_STEP = 1.5;
/** Width at the engine and a minute later, in units. */
const TRAIL_NEAR = 1.6;
const TRAIL_FAR = 15;
/** Seconds behind the engines before it shows. */
const TRAIL_GAP = 2.5;
/** It forms only this high, and in full above the second. */
const TRAIL_ALTITUDE: readonly [number, number] = [1250, 1550];
const TRAILS = CAPS.airliner * 2;

export interface Contrails {
  readonly mesh: THREE.Mesh;
  /** Starts a frame's trails. */
  begin(): void;
  /** Writes both engines' trails for an airliner, while there is room. */
  add(flight: Flight, seconds: number, eye: THREE.Vector3, far: number, white: number): void;
  /** Publishes the frame's trails to the GPU. */
  finish(): void;
  clear(): void;
}

export function createContrails(): Contrails {
  const trailVertices = TRAILS * TRAIL_POINTS * 2;
  const position = new Float32Array(trailVertices * 3);
  const color = new Float32Array(trailVertices * 4);
  const index: number[] = [];
  for (let t = 0; t < TRAILS; t++) {
    for (let k = 0; k + 1 < TRAIL_POINTS; k++) {
      const a = (t * TRAIL_POINTS + k) * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);
  // Transparent and writing no depth, so no ink: its hull would show through.
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  material.userData.outlineParameters = { visible: false };
  material.name = 'contrail';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'contrails';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  const trailPose = flyerPose();
  const side = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  const point = new THREE.Vector3();
  const lastPoint = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let count = 0;

  function addTrail(flight: Flight, hand: number, seconds: number, eye: THREE.Vector3, far: number, white: number): void {
    const base = count * TRAIL_POINTS * 2;
    let have = false;
    for (let k = 0; k < TRAIL_POINTS; k++) {
      const at = seconds - k * TRAIL_STEP;
      const q = flight.pose(Math.max(flight.from, at), trailPose);
      side.crossVectors(q.up, q.forward).normalize();
      point.copy(q.position).addScaledVector(side, hand * AIRLINER_ENGINE_X).addScaledVector(q.up, AIRLINER_ENGINE_Y);
      if (k === 0) {
        tangent.copy(q.forward);
      } else {
        tangent.subVectors(lastPoint, point);
        if (tangent.lengthSq() < 1e-8) tangent.copy(q.forward);
        tangent.normalize();
      }
      lastPoint.copy(point);
      toEye.subVectors(eye, point);
      const distance = toEye.length();
      side.crossVectors(tangent, toEye).normalize();
      const age = k * TRAIL_STEP;
      const width = (TRAIL_NEAR + (TRAIL_FAR - TRAIL_NEAR) * (age / (TRAIL_POINTS * TRAIL_STEP))) / 2;
      const v = base + k * 2;
      position[v * 3] = point.x + side.x * width;
      position[v * 3 + 1] = point.y + side.y * width;
      position[v * 3 + 2] = point.z + side.z * width;
      position[v * 3 + 3] = point.x - side.x * width;
      position[v * 3 + 4] = point.y - side.y * width;
      position[v * 3 + 5] = point.z - side.z * width;
      const height = q.position.length() - PLANET_RADIUS;
      const alive = at >= flight.from ? 1 : 0;
      const alpha =
        alive *
        0.8 *
        smooth(0, TRAIL_GAP, age) *
        (1 - age / (TRAIL_POINTS * TRAIL_STEP)) ** 1.3 *
        smooth(TRAIL_ALTITUDE[0], TRAIL_ALTITUDE[1], height) *
        (1 - smooth(far * 0.6, far, distance)) *
        q.shown;
      if (alpha > 0.01) have = true;
      for (const c of [v, v + 1]) {
        color[c * 4] = white;
        color[c * 4 + 1] = white;
        color[c * 4 + 2] = white * 1.02;
        color[c * 4 + 3] = alpha;
      }
    }
    if (have) count++;
  }

  return {
    mesh,
    begin() {
      count = 0;
    },
    add(flight, seconds, eye, far, white) {
      if (count + 2 > TRAILS) return;
      for (const hand of [1, -1]) addTrail(flight, hand, seconds, eye, far, white);
    },
    finish() {
      geometry.setDrawRange(0, count * (TRAIL_POINTS - 1) * 6);
      (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    },
    clear() {
      geometry.setDrawRange(0, 0);
    },
  };
}
