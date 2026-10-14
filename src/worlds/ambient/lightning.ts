/** A bolt on the horizon. */

import * as THREE from 'three';
import type { AmbientSpec } from '../contract.ts';
import { latOf, lonOf } from '../../sphere.ts';
import type { AmbientContext, System } from './types.ts';
import { place } from './types.ts';

/**
 * A bolt on the horizon: a jagged line from a cloud base to the ground and a
 * glow round it, flickering twice in a quarter of a second. Where it strikes
 * is drawn at random round the traveller and kept at the odds `where` gives
 * the place, so a belt storms and a zone does not.
 */
export function lightning(c: AmbientContext, spec: AmbientSpec, color: THREE.Color): System {
  const { rng, group, disposables, soft } = c;
  const SEGMENTS = 10;
  const positions = new Float32Array(SEGMENTS * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  material.userData.outlineParameters = { visible: false };
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const glowMaterial = new THREE.PointsMaterial({ color: color.clone().multiplyScalar(1.6), size: 420, map: soft(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  glowMaterial.userData.outlineParameters = { visible: false };
  disposables.push(geometry, material, glowGeometry, glowMaterial);
  const bolt = new THREE.LineSegments(geometry, material);
  const glow = new THREE.Points(glowGeometry, glowMaterial);
  bolt.frustumCulled = false;
  glow.frustumCulled = false;
  bolt.visible = false;
  glow.visible = false;
  group.add(bolt, glow);
  const perMinute = Math.max(0.01, spec.rate ?? Math.max(1, spec.count));
  let next = rng.range(1, 60 / perMinute);
  let age = Infinity;
  const top = new THREE.Vector3();
  const point = new THREE.Vector3();
  const strike = new THREE.Vector3();
  return {
    update(frame, dt) {
      next -= dt;
      age += dt;
      if (next <= 0) {
        // Exponential gaps: a storm has no metronome.
        next = -Math.log(1 - rng.unit() * 0.999) * (60 / perMinute);
        for (let attempt = 0; attempt < 6; attempt++) {
          const a = rng.range(0, Math.PI * 2);
          const d = rng.range(450, 1900);
          place(frame, Math.sin(a) * d, Math.cos(a) * d, 0, strike);
          const n = strike.clone().normalize();
          const odds = spec.where === undefined ? 1 : spec.where(latOf(n.y), lonOf(n.x, n.z));
          if (rng.unit() > odds) continue;
          strike.setLength(frame.radius + frame.groundAt(strike));
          const up = n;
          const side = new THREE.Vector3().crossVectors(up, frame.north).normalize();
          const height = rng.range(220, 420);
          top.copy(strike).addScaledVector(up, height);
          const array = (geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
          let from = top.clone();
          for (let k = 0; k < SEGMENTS; k++) {
            const t = (k + 1) / SEGMENTS;
            point.copy(top).lerp(strike, t);
            if (k < SEGMENTS - 1) point.addScaledVector(side, rng.range(-1, 1) * height * 0.08).addScaledVector(frame.north, rng.range(-1, 1) * height * 0.05);
            array.set([from.x, from.y, from.z, point.x, point.y, point.z], k * 6);
            from = point.clone();
          }
          geometry.getAttribute('position').needsUpdate = true;
          const glowAt = glowGeometry.getAttribute('position') as THREE.BufferAttribute;
          glowAt.setXYZ(0, (top.x + strike.x) / 2, (top.y + strike.y) / 2, (top.z + strike.z) / 2);
          glowAt.needsUpdate = true;
          age = 0;
          break;
        }
      }
      // Two flickers and a fade.
      const on = age < 0.07 || (age > 0.12 && age < 0.26);
      bolt.visible = on;
      glow.visible = age < 0.45;
      glowMaterial.opacity = Math.max(0, 1 - age / 0.45);
    },
  };
}
