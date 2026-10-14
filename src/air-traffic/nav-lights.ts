import * as THREE from 'three';
import { AIRLINER_ENGINE_X, AIRLINER_ENGINE_Y, AIRLINER_LENGTH } from '../craft/airliner.ts';
import { CAPS } from './flight.ts';
import type { Flight } from './flight.ts';

/** Navigation lights after dark: a beacon on each engined flyer, wingtips and a tail strobe on an airliner. */

const LIGHTS = CAPS.airliner * 3 + (CAPS.plane + CAPS.helicopter + CAPS.airship) * 1;

export interface NavLights {
  readonly points: THREE.Points;
  begin(): void;
  /** Adds a flyer's lights; `object` is its drawn group, posed this frame. */
  add(flight: Flight, object: THREE.Object3D, seconds: number, night: number, shown: number): void;
  finish(): void;
  clear(): void;
}

export function createNavLights(): NavLights {
  const position = new Float32Array(LIGHTS * 3);
  const color = new Float32Array(LIGHTS * 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = new THREE.PointsMaterial({
    size: 3.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  material.userData.outlineParameters = { visible: false };
  material.name = 'nav-lights';
  const points = new THREE.Points(geometry, material);
  points.name = 'nav-lights';
  points.frustumCulled = false;
  points.renderOrder = 2;

  const point = new THREE.Vector3();
  let count = 0;

  return {
    points,
    begin() {
      count = 0;
    },
    add(flight, object, seconds, night, shown) {
      const flash = ((seconds * 1.1 + (flight.id.length % 5) * 0.23) % 1) < 0.12 ? 1 : 0;
      const put = (x: number, y: number, z: number, r: number, g: number, b: number, a: number): void => {
        if (count >= LIGHTS) return;
        point.set(x, y, z).applyMatrix4(object.matrixWorld);
        position[count * 3] = point.x;
        position[count * 3 + 1] = point.y;
        position[count * 3 + 2] = point.z;
        color[count * 4] = r;
        color[count * 4 + 1] = g;
        color[count * 4 + 2] = b;
        color[count * 4 + 3] = a * night * shown;
        count++;
      };
      object.updateMatrixWorld();
      if (flight.kind === 'airliner') {
        const s = 17 * (AIRLINER_ENGINE_X / 5.7);
        put(s, AIRLINER_ENGINE_Y + 2.5, -5, 1, 0.2, 0.15, 1);
        put(-s, AIRLINER_ENGINE_Y + 2.5, -5, 0.2, 1, 0.35, 1);
        put(0, 2, -AIRLINER_LENGTH / 2, 1, 1, 1, flash);
      } else {
        put(0, flight.kind === 'airship' ? -12 : 0.2, 0, 1, 0.25, 0.15, flash);
      }
    },
    finish() {
      geometry.setDrawRange(0, count);
      (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    },
    clear() {
      geometry.setDrawRange(0, 0);
    },
  };
}
