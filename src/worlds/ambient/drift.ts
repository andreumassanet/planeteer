/** The systems that drift and wrap round the traveller: motes, racing cirrus and haze. */

import * as THREE from 'three';
import type { AmbientSpec } from '../contract.ts';
import type { AmbientContext, System } from './types.ts';
import { place, wrap } from './types.ts';

const MOTE_BOX = 60;
/** The square the streaks and haze wrap in, units on a side. */
const STREAK_BOX = 320;
const HAZE_BOX = 420;

/**
 * Specks in a box round the eye, each drifting and wrapping inside it: the
 * box is the world's axes and the drift is the frame's, so a mote that falls
 * falls toward the ground wherever on the planet the box is.
 */
export function motes(c: AmbientContext, spec: AmbientSpec, color: THREE.Color): System {
  const { rng, group, disposables, driftOf } = c;
  const count = Math.max(1, spec.count);
  const box = spec.fall !== undefined && spec.fall > 0 ? MOTE_BOX * 1.6 : MOTE_BOX;
  const positions = new Float32Array(count * 3);
  const offsets = new Float32Array(count * 3);
  for (let k = 0; k < count * 3; k++) offsets[k] = rng.range(0, box);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size: spec.size ?? 0.35, transparent: true, opacity: 0.7, depthWrite: false });
  // The ink draws the scene twice; a see-through speck drawn twice is twice as opaque.
  material.userData.outlineParameters = { visible: false };
  disposables.push(geometry, material);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);
  const drift = driftOf(spec, 0.8);
  const fall = spec.fall ?? 0;
  const moved = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  return {
    update(frame, dt) {
      velocity
        .copy(frame.east)
        .multiplyScalar(drift.e * drift.speed)
        .addScaledVector(frame.north, drift.n * drift.speed)
        .addScaledVector(frame.up, -fall);
      moved.addScaledVector(velocity, dt);
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      const eye = frame.eye;
      for (let k = 0; k < array.length; k += 3) {
        // A little wander of its own on top of the drift, so a box of them
        // is not a lattice sliding by.
        const sway = Math.sin(frame.time * 0.3 + k) * 0.5;
        array[k] = eye.x + wrap(offsets[k]! + moved.x + sway - eye.x, box);
        array[k + 1] = eye.y + wrap(offsets[k + 1]! + moved.y - eye.y, box);
        array[k + 2] = eye.z + wrap(offsets[k + 2]! + moved.z + sway * 0.6 - eye.z, box);
      }
      attribute.needsUpdate = true;
    },
  };
}

/**
 * Racing cirrus: thin strokes high over the traveller, torn along the wind,
 * fading from a bright head to nothing at the tail, and moving fast.
 */
export function streaks(c: AmbientContext, spec: AmbientSpec, color: THREE.Color): System {
  const { rng, group, disposables, driftOf } = c;
  const count = Math.max(1, spec.count);
  const positions = new Float32Array(count * 6);
  const colors = new Float32Array(count * 6);
  const seeds = Array.from({ length: count }, () => ({
    e: rng.range(0, STREAK_BOX),
    n: rng.range(0, STREAK_BOX),
    up: rng.range(30, 110),
    length: rng.range(18, 60) * (spec.size ?? 1),
    pace: rng.range(0.7, 1.3),
  }));
  for (let k = 0; k < count; k++) {
    // Additive: black is nothing, so the tail fades to it.
    colors.set([color.r, color.g, color.b, 0, 0, 0], k * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  material.userData.outlineParameters = { visible: false };
  disposables.push(geometry, material);
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  group.add(lines);
  const drift = driftOf(spec, 30);
  const head = new THREE.Vector3();
  let travelled = 0;
  return {
    update(frame, dt) {
      travelled += drift.speed * dt;
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      seeds.forEach((s, k) => {
        const e = wrap(s.e + drift.e * travelled * s.pace - frame.walkedE, STREAK_BOX);
        const n = wrap(s.n + drift.n * travelled * s.pace - frame.walkedN, STREAK_BOX);
        place(frame, e, n, s.up, head);
        array[k * 6] = head.x;
        array[k * 6 + 1] = head.y;
        array[k * 6 + 2] = head.z;
        head.addScaledVector(frame.east, -drift.e * s.length).addScaledVector(frame.north, -drift.n * s.length);
        array[k * 6 + 3] = head.x;
        array[k * 6 + 4] = head.y;
        array[k * 6 + 5] = head.z;
      });
      attribute.needsUpdate = true;
    },
  };
}

/**
 * Haze: big soft sheets of murk hanging at a few heights over the ground,
 * drifting slowly and passing as the traveller walks through them.
 */
export function haze(c: AmbientContext, spec: AmbientSpec, color: THREE.Color): System {
  const { rng, group, disposables, soft, driftOf } = c;
  const count = Math.max(1, spec.count);
  const positions = new Float32Array(count * 3);
  const seeds = Array.from({ length: count }, () => ({
    e: rng.range(0, HAZE_BOX),
    n: rng.range(0, HAZE_BOX),
    up: rng.range(3, 36),
  }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size: spec.size ?? 90, map: soft(), transparent: true, opacity: 0.16, depthWrite: false });
  material.userData.outlineParameters = { visible: false };
  disposables.push(geometry, material);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  group.add(points);
  const drift = driftOf(spec, 1.2);
  let travelled = 0;
  const at = new THREE.Vector3();
  const ground = { height: 0, clock: Infinity };
  return {
    update(frame, dt) {
      travelled += drift.speed * dt;
      ground.clock += dt;
      if (ground.clock > 0.5) {
        ground.clock = 0;
        ground.height = frame.groundAt(frame.player);
      }
      const attribute = geometry.getAttribute('position') as THREE.BufferAttribute;
      seeds.forEach((s, k) => {
        const e = wrap(s.e + drift.e * travelled - frame.walkedE, HAZE_BOX);
        const n = wrap(s.n + drift.n * travelled - frame.walkedN, HAZE_BOX);
        place(frame, e, n, 0, at);
        at.setLength(frame.radius + ground.height + s.up);
        attribute.setXYZ(k, at.x, at.y, at.z);
      });
      attribute.needsUpdate = true;
    },
  };
}
