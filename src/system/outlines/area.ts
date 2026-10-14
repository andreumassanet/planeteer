import * as THREE from 'three';
import type { World } from '../../geo.ts';
import { latLonOf, unitAt } from '../../sphere.ts';

/**
 * The solid angle on a loop's left, seen from outside the sphere, in
 * steradians: 2 pi less its turning, by Gauss-Bonnet.
 */
export function leftArea(points: number[][]): number {
  const n = points.length;
  const p = points.map((q) => unitAt(q[1]!, q[0]!, new THREE.Vector3()));
  const tin = new THREE.Vector3();
  const tout = new THREE.Vector3();
  const turnAxis = new THREE.Vector3();
  let turning = 0;
  for (let k = 0; k < n; k++) {
    const here = p[k]!;
    tin.subVectors(here, p[(k + n - 1) % n]!).projectOnPlane(here);
    tout.subVectors(p[(k + 1) % n]!, here).projectOnPlane(here);
    if (tin.lengthSq() < 1e-20 || tout.lengthSq() < 1e-20) continue;
    turning += Math.atan2(turnAxis.crossVectors(tin, tout).dot(here), tin.dot(tout));
  }
  const area = 2 * Math.PI - turning;
  return ((area % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI);
}

/**
 * A cut ring's solid angle, steradians. Its edges run along the lattice (a
 * parallel is not a great circle, and one ninety degrees long is no edge at
 * all to the turning), so the area is summed in longitude against the sine of
 * latitude, which is exact along a parallel and along a meridian.
 */
export function flatArea(points: number[][]): number {
  let sum = 0;
  for (let k = 0; k < points.length; k++) {
    const a = points[k]!;
    const b = points[(k + 1) % points.length]!;
    sum += ((b[0]! - a[0]!) * Math.PI) / 180 * (Math.sin((a[1]! * Math.PI) / 180) + Math.sin((b[1]! * Math.PI) / 180)) / 2;
  }
  return Math.abs(sum);
}

/**
 * Which side of a loop its nation lies on (+1 its left, -1 its right), by
 * asking the world at a point a hair to one side of several of its edges,
 * voted. A loop's sense cannot say by itself: one round more than a
 * hemisphere turns the way its complement does.
 */
export function sideOf(world: World, points: number[][], id: number): number {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const across = new THREE.Vector3();
  const at = { lat: 0, lon: 0 };
  let vote = 0;
  const step = Math.max(1, Math.floor(points.length / 9));
  for (let k = 0; k < points.length; k += step) {
    unitAt(points[k]![1]!, points[k]![0]!, a);
    unitAt(points[(k + 1) % points.length]![1]!, points[(k + 1) % points.length]![0]!, b);
    if (a.distanceToSquared(b) < 1e-14) continue;
    mid.addVectors(a, b).normalize();
    // `mid x forward` is the left, seen from outside.
    across.crossVectors(mid, b.clone().sub(a)).normalize().multiplyScalar(Math.min(2e-3, a.distanceTo(b) * 0.25));
    latLonOf(mid.add(across).normalize(), at);
    vote += world.countryAt(at.lat, at.lon) === id ? 1 : -1;
  }
  return vote >= 0 ? 1 : -1;
}
