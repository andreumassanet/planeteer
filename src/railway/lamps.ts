import * as THREE from 'three';
import { CAR_PITCH } from '../rails/trains.ts';
import type { CrossingLamp } from './crossing-props.ts';
import type { Train } from './trains.ts';

/** The most crossing lamps drawn at once. */
const LAMPS = 128;

/**
 * The crossing lamps: one points mesh, flashing alternately at every crossing
 * within 160 units of a running train's ends.
 */
export function createCrossingLamps(): { points: THREE.Points; light(seconds: number, lamps: readonly CrossingLamp[], trains: ReadonlyMap<number, Train>): void } {
  const lampPosition = new Float32Array(LAMPS * 3);
  const lampColor = new Float32Array(LAMPS * 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(lampPosition, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(lampColor, 4).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false });
  material.userData.outlineParameters = { visible: false };
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.name = 'crossing-lamps';

  return {
    points,
    light(seconds, lamps, trains) {
      let count = 0;
      const flash = Math.floor(seconds * 2) % 2;
      for (const lamp of lamps) {
        if (count >= LAMPS) break;
        const train = trains.get(lamp.line);
        if (train === undefined) continue;
        const state = train.state;
        const tail = state.head - state.direction * train.cars.length * CAR_PITCH;
        const lo = Math.min(state.head, tail) - 160;
        const hi = Math.max(state.head, tail) + 160;
        if (lamp.s < lo || lamp.s > hi) continue;
        lampPosition[count * 3] = lamp.at.x;
        lampPosition[count * 3 + 1] = lamp.at.y;
        lampPosition[count * 3 + 2] = lamp.at.z;
        const on = (count % 2 === flash) ? 1 : 0.15;
        lampColor[count * 4] = 1;
        lampColor[count * 4 + 1] = 0.18;
        lampColor[count * 4 + 2] = 0.1;
        lampColor[count * 4 + 3] = on;
        count++;
      }
      geometry.setDrawRange(0, count);
      (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    },
  };
}
