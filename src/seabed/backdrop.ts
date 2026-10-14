// Under the surface: the water's haze and the backdrop that closes it.

import * as THREE from 'three';
import { OCEAN_COLOR, PALETTE } from '../theme.ts';
import { SEA_REACH, coastAt, coastSample, seaZoneAt } from '../sea-floor.ts';
import { latOf } from '../sphere.ts';
import { BACKDROP_RADIUS, UNDER_FAR, UNDER_NEAR } from './constants.ts';

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const WARM_UNDER = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.skyBlue), 0.45);
const COLD_UNDER = new THREE.Color(OCEAN_COLOR).lerp(new THREE.Color(PALETTE.green), 0.3).multiplyScalar(0.75);

export interface Backdrop {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  /**
   * Sets the scene's fog to the water's haze and paints the backdrop round the
   * camera. `surfaceTint` is the colour the surface seen from below is lit with.
   */
  paint(camera: THREE.Vector3, daylight: number, cameraDepth: number, fog: THREE.Fog, surfaceTint: THREE.Color): void;
}

/**
 * A sphere round the camera just past the haze, in the haze's colour at its
 * equator, lighter towards the surface and darker towards the deep. It hides the
 * sky, which has no fog, and the far side of every sheet of water, which from
 * under it is culled.
 */
export function createBackdrop(): Backdrop {
  const geometry = new THREE.SphereGeometry(BACKDROP_RADIUS, 16, 12);
  const colours = new Float32Array(geometry.getAttribute('position').count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: true }),
  );
  mesh.name = 'sea-backdrop';
  (mesh.material as THREE.Material).userData.outlineParameters = { visible: false };
  mesh.visible = false;
  mesh.frustumCulled = false;

  const sample = coastSample();
  const unit = new THREE.Vector3();
  const up = new THREE.Vector3();
  const colour = new THREE.Color();
  const underColour = new THREE.Color();
  const deepColour = new THREE.Color();
  const lightColour = new THREE.Color();
  const quaternion = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);

  function paint(camera: THREE.Vector3, daylight: number, cameraDepth: number, fog: THREE.Fog, surfaceTint: THREE.Color): void {
    unit.copy(camera).normalize();
    coastAt(unit.x, unit.y, unit.z, SEA_REACH, sample);
    const warm = seaZoneAt(latOf(unit.y), sample.lake) === 'reef' ? 1 : 0.35;
    const light = 0.18 + 0.82 * clamp(daylight, 0, 1);
    underColour.copy(COLD_UNDER).lerp(WARM_UNDER, warm).multiplyScalar(light * Math.exp(-cameraDepth / 70));
    fog.color.copy(underColour);
    fog.near = UNDER_NEAR;
    fog.far = UNDER_FAR;
    mesh.position.copy(camera);
    up.copy(unit);
    quaternion.setFromUnitVectors(Y, up);
    mesh.quaternion.copy(quaternion);
    deepColour.copy(underColour).multiplyScalar(0.35);
    lightColour.copy(underColour).lerp(surfaceTint, 0.55 * light * Math.exp(-cameraDepth / 25));
    const positions = geometry.getAttribute('position');
    for (let v = 0; v < positions.count; v++) {
      const y = positions.getY(v) / BACKDROP_RADIUS;
      if (y >= 0) colour.copy(underColour).lerp(lightColour, smoothstep(0, 1, y));
      else colour.copy(underColour).lerp(deepColour, smoothstep(0, 1, -y));
      colours[v * 3] = colour.r;
      colours[v * 3 + 1] = colour.g;
      colours[v * 3 + 2] = colour.b;
    }
    (geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  return { mesh, paint };
}
