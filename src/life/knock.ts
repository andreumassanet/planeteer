/** The verge's walkers and the near herds' animals knocked down by a vehicle: who is in its way, and setting each falling. */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../avatar.ts';
import { flingOf } from '../breakables/knock.ts';
import type { Herding } from './herd-types.ts';
import type { Mover } from './mover.ts';

const sweep = new THREE.Vector3();
const gap = new THREE.Vector3();
const up = new THREE.Vector3();
const nearest = new THREE.Vector3();
const fling = new THREE.Vector3();

/** How far a hit animal is shoved, against a person's fling: heavier, and gently. */
const ANIMAL_FLING = 0.7;

/** The gap along the ground from the sweep to `at`, into `gap`, and how far up `at` is off the sweep; the nearest point of the sweep in `nearest`. */
function gapFrom(from: THREE.Vector3, length2: number, at: THREE.Vector3): number {
  gap.copy(at).sub(from);
  const t = length2 < 1e-9 ? 0 : THREE.MathUtils.clamp(gap.dot(sweep) / length2, 0, 1);
  nearest.copy(from).addScaledVector(sweep, t);
  up.copy(at).normalize();
  gap.copy(at).sub(nearest);
  const rise = gap.dot(up);
  gap.addScaledVector(up, -rise);
  return rise;
}

/** Whoever the sweep meets falls; see `Life.knock`. */
export function knockMovers(
  from: THREE.Vector3, to: THREE.Vector3, radius: number, velocity: THREE.Vector3,
  walkers: readonly Mover[], herds: readonly Herding[],
): number {
  const speed = velocity.length();
  sweep.copy(to).sub(from);
  const length2 = sweep.lengthSq();
  let count = 0;
  for (const mover of walkers) {
    if (mover.knock) continue;
    const rise = gapFrom(from, length2, mover.at);
    if (Math.abs(rise) > AVATAR_HEIGHT) continue;
    const d = gap.length();
    if (d >= radius + AVATAR_HEIGHT * 0.15) continue;
    fling.copy(velocity).projectOnPlane(up).normalize().multiplyScalar(0.7);
    if (d > 1e-6) fling.addScaledVector(gap, 0.7 / d);
    fling.projectOnPlane(up).normalize();
    mover.knock = { t: 0, at: mover.at.clone(), dir: fling.clone(), fling: flingOf(speed) };
    count++;
  }
  for (const herd of herds) {
    for (const head of herd.heads) {
      if (head.knocked >= 0) continue;
      const rise = gapFrom(from, length2, head.world);
      if (rise > head.height || rise < -AVATAR_HEIGHT) continue;
      const d = gap.length();
      if (d >= radius + head.halfWidth) continue;
      fling.copy(velocity).projectOnPlane(up).normalize().multiplyScalar(0.7);
      if (d > 1e-6) fling.addScaledVector(gap, 0.7 / d);
      // Into the herd's own plane.
      const dx = fling.dot(herd.axisX);
      const dz = fling.dot(herd.axisZ);
      const length = Math.hypot(dx, dz) || 1;
      head.knockDx = dx / length;
      head.knockDz = dz / length;
      head.knockX = head.x;
      head.knockZ = head.z;
      head.knockFling = flingOf(speed) * ANIMAL_FLING;
      head.knocked = 0;
      head.speed = 0;
      count++;
    }
  }
  return count;
}
