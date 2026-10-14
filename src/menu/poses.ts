/** Camera poses and orbits, and the small helpers the menu's modules share. */
import * as THREE from 'three';

export interface Pose {
  target: THREE.Vector3;
  eye: THREE.Vector3;
  up: THREE.Vector3;
}

export interface Flight {
  from: Pose;
  to: Pose;
  began: number;
  duration: number;
  done(): void;
}

export interface Orbit {
  azimuth: number;
  elevation: number;
  distance: number;
}

export const makePose = (): Pose => ({ target: new THREE.Vector3(), eye: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) });
export const copyPose = (from: Pose, to: Pose): Pose => {
  to.target.copy(from.target);
  to.eye.copy(from.eye);
  to.up.copy(from.up);
  return to;
};
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Either Enter: the keypad's has its own `code`. */
export const isEnter = (event: KeyboardEvent): boolean => event.code === 'Enter' || event.code === 'NumpadEnter';

/** Where the camera is and where it is going on a globe: degrees and units. */
export interface GlobeView {
  lat: number;
  lon: number;
  dist: number;
}
