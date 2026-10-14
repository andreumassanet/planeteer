/** Sparkles on the ground. */

import * as THREE from 'three';
import type { AmbientSpec } from '../contract.ts';
import type { AmbientContext, System } from './types.ts';
import { place, wrap } from './types.ts';

const GLINT_BOX = 120;

/**
 * Sparkles on the ground: each spot flashes for a moment now and then, on a
 * clock of its own, which is how a facet catching the sun looks to someone
 * walking past it.
 */
export function glints(c: AmbientContext, spec: AmbientSpec, color: THREE.Color): System {
  const { rng, group, disposables, soft } = c;
  const count = Math.max(1, spec.count);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = Array.from({ length: count }, () => ({
    e: rng.range(0, GLINT_BOX),
    n: rng.range(0, GLINT_BOX),
    rate: rng.range(0.25, 0.7),
    phase: rng.range(0, Math.PI * 2),
    height: 0,
    cell: '',
  }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: spec.size ?? 0.6, map: soft(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  material.userData.outlineParameters = { visible: false };
  disposables.push(geometry, material);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);
  const at = new THREE.Vector3();
  return {
    update(frame) {
      const position = geometry.getAttribute('position') as THREE.BufferAttribute;
      const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
      seeds.forEach((s, k) => {
        const e = wrap(s.e - frame.walkedE, GLINT_BOX);
        const n = wrap(s.n - frame.walkedN, GLINT_BOX);
        place(frame, e, n, 0, at);
        // The ground under it is asked again only when it has wrapped to a new place.
        const cell = `${Math.round(s.e - frame.walkedE - e)}:${Math.round(s.n - frame.walkedN - n)}`;
        if (cell !== s.cell) {
          s.cell = cell;
          s.height = frame.groundAt(at);
        }
        at.setLength(frame.radius + s.height + 0.15);
        position.setXYZ(k, at.x, at.y, at.z);
        // A sharp peak once a cycle: most of the time nothing at all.
        const flash = Math.pow(Math.max(0, Math.sin(frame.time * s.rate * Math.PI * 2 + s.phase)), 60) * 3;
        colour.setXYZ(k, color.r * flash, color.g * flash, color.b * flash);
      });
      position.needsUpdate = true;
      colour.needsUpdate = true;
    },
  };
}
