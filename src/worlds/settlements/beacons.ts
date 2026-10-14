/** A mark in the civilisation's accent over every town, seen from far off and from the air. */

import * as THREE from 'three';
import type { ArchitectureStyle } from '../contract.ts';
import { linearOf } from '../terrain.ts';
import type { Site } from './types.ts';

export function createBeacons(sites: readonly Site[], style: ArchitectureStyle): THREE.Points {
  const beaconPositions = new Float32Array(sites.length * 3);
  const beaconColors = new Float32Array(sites.length * 3);
  const accent = linearOf(style.accents[0] ?? 0xe4a90c);
  sites.forEach((site, k) => {
    const p = site.origin.clone().addScaledVector(site.dir, 30);
    beaconPositions.set([p.x, p.y, p.z], k * 3);
    beaconColors.set([accent[0] * 3, accent[1] * 3, accent[2] * 3], k * 3);
  });
  const beaconGeometry = new THREE.BufferGeometry();
  beaconGeometry.setAttribute('position', new THREE.BufferAttribute(beaconPositions, 3));
  beaconGeometry.setAttribute('color', new THREE.BufferAttribute(beaconColors, 3));
  const beacons = new THREE.Points(
    beaconGeometry,
    new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }),
  );
  beacons.name = 'world-beacons';
  beacons.frustumCulled = false;
  return beacons;
}
