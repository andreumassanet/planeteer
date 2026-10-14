import * as THREE from 'three';

/**
 * How a seated body's legs fold, in its own frame: the thigh level and forward,
 * the shin hanging. The plane's seat (`sit`) and every cast rider on a bench
 * (`life.ts`) fold to these, so there is one seated pose in the world.
 */
export const SEAT_THIGH = new THREE.Vector3(0, -0.12, 1).normalize();
export const SEAT_SHIN = new THREE.Vector3(0, -1, 0.08).normalize();
/**
 * How a body at the wheel of a car folds its legs (`SeatedPose.legs` of
 * `drive`): the thigh a little up off the cushion and the shin forward and down
 * to the pedals. A car's floor is much nearer the hip than a chair's, so the
 * soles end 0.13 of a body under the hip and the toes half a body ahead
 * (`HERO.drive` in `craft/body.ts`, checked by `pnpm craft`).
 */
export const DRIVE_THIGH = new THREE.Vector3(0, 0.12, 1).normalize();
export const DRIVE_SHIN = new THREE.Vector3(0, -0.62, 0.78).normalize();
