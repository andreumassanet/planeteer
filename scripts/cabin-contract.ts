/**
 * The contract a closed craft's inside is held to, on Earth (`check-craft.ts`)
 * and on the other worlds (`check-worlds.ts`) alike, so the two cannot hold
 * different things (`craft/cabin.ts` is the head of it):
 *
 * - the glass is see-through, drawn from both sides, **writes no depth** (it
 *   would hide every ink line behind it from the outline pass), carries no
 *   ink and casts no shadow (`glassFaults`);
 * - a driver's wheel clears the knees, the chest and the eye, and both its
 *   hand-holds are within the hero's reach of their shoulders, leaning in as
 *   a driver does, straight and at full lock either way (`wheelFaults`);
 * - and, where it is asked, the shell is **lined**: from the seated eye no
 *   ray meets the shell before it meets the lining, the furniture or the
 *   glass (`uncovered`), because what hides the far wall's ink hull through a
 *   window is the lining and never the glass.
 */

import * as THREE from 'three';
import { WHEEL_LEAN, wheelHand } from '../src/cast.ts';
import type { WheelGrip } from '../src/cast.ts';
import { COCKPIT_NEAR, HERO, SEAT_EYE } from '../src/craft/body.ts';
import { WHEEL_LOCK, probeOf } from '../src/craft/cabin.ts';
import type { ShellProbe } from '../src/craft/cabin.ts';
import { AVATAR_HEIGHT } from '../src/stature.ts';

const H = AVATAR_HEIGHT;
const LEAN_AXIS = new THREE.Vector3(1, 0, 0);

/** What is wrong with a pane of a closed craft's glass, as sentences; none when it is glass. */
export function glassFaults(glass: THREE.Mesh): string[] {
  const out: string[] = [];
  const material = glass.material as THREE.Material;
  if (!material.transparent || !(material.opacity < 1)) out.push('its glass is opaque');
  if (material.depthWrite) out.push('its glass writes depth, and would hide every ink line behind it');
  if (material.side !== THREE.DoubleSide) out.push('its glass is drawn from one side only');
  if ((material.userData.outlineParameters as { visible?: boolean } | undefined)?.visible !== false) out.push('its glass is inked');
  if (glass.castShadow) out.push('its glass casts a shadow');
  return out;
}

/**
 * A driver's wheel against the seated body, all about the hip in the seat's
 * frame: the faults, the rim's nearest point to the eye, and the furthest
 * hand-hold from its shoulder. A hand that rests elsewhere (`WheelGrip.rest`)
 * is held to the same reach.
 */
export function wheelFaults(wheel: WheelGrip, legs: 'drive' | 'chair' | undefined, rim = true): { faults: string[]; close: number; reach: number } {
  const faults: string[] = [];
  const f = (value: number): string => value.toFixed(2);
  // A rim is a ring the knees and the chest must clear; `rim` false is a
  // pair of grips (a saucer's sticks, a T-handle) that stand beside them.
  if (rim) {
    const knee = legs === 'drive' ? HERO.drive : { knee: HERO.knee, kneeTop: HERO.kneeTop };
    const low = wheel.centre[1] - wheel.radius * Math.cos(wheel.tilt);
    const lowZ = wheel.centre[2] - wheel.radius * Math.sin(wheel.tilt);
    if (low < knee.kneeTop + 0.03 * H && lowZ < knee.knee + 0.06 * H) faults.push(`the wheel's rim comes down to ${f(low)} over the hip, onto the knees`);
    if (lowZ < 0.1 * H + 0.02 * H) faults.push(`the wheel's rim is ${f(lowZ)} ahead of the hip, in the chest`);
  }
  const eye = new THREE.Vector3(0, SEAT_EYE.up, SEAT_EYE.ahead);
  const hip = new THREE.Vector3(0, 0, 0);
  const point = new THREE.Vector3();
  let close = Infinity;
  for (let k = 0; k < 32; k++) {
    // Round the rim: a spread of the whole turn, which no hold clamps.
    close = Math.min(close, wheelHand(hip, { ...wheel, spread: (k / 32) * Math.PI * 2, rest: undefined }, 0, 1, point).distanceTo(eye));
  }
  if (close < COCKPIT_NEAR * 2) faults.push(`the wheel's rim is ${f(close)} from the eye, inside the near plane`);
  let reach = 0;
  // A wheel's holds straight and at full lock either way; grips do not turn.
  for (const turn of rim ? [-WHEEL_LOCK, 0, WHEEL_LOCK] : [0]) {
    for (const side of [1, -1] as const) {
      // The shoulders as far forward as a driver leans in to reach (`WHEEL_LEAN`):
      // turned with the spine about the hip.
      const shoulder = new THREE.Vector3(side * HERO.reachFrom[0], HERO.reachFrom[1], HERO.reachFrom[2]).applyAxisAngle(LEAN_AXIS, WHEEL_LEAN);
      reach = Math.max(reach, wheelHand(hip, wheel, turn, side, point).distanceTo(shoulder));
    }
  }
  // A hand's breadth past the wrist is the palm on the rim.
  if (reach > HERO.reach + 0.04 * H) faults.push(`a hand-hold on the wheel is ${f(reach)} from its shoulder, past the arm's ${f(HERO.reach)} and a hand`);
  return { faults, close, reach };
}

/** Meshes' triangles in the frame `root` is in, as flat positions, nine to a triangle. */
export function meshTriangles(meshes: readonly THREE.Mesh[], root: THREE.Object3D): Float32Array {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  let total = 0;
  for (const mesh of meshes) total += mesh.geometry.index !== null ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count;
  const out = new Float32Array(total * 3);
  let o = 0;
  const v = new THREE.Vector3();
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const count = index !== null ? index.count : position.count;
    const place = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(position, index !== null ? index.getX(i) : i).applyMatrix4(place);
      out[o++] = v.x;
      out[o++] = v.y;
      out[o++] = v.z;
    }
  }
  return out;
}

/** Meshes' triangles in the frame `root` is in, both faces, as a probe (`probeOf`). */
export function probeOfMeshes(meshes: readonly THREE.Mesh[], root: THREE.Object3D): ShellProbe {
  const p = meshTriangles(meshes, root);
  return probeOf([{ position: p, normal: p, color: p, outline: p }]);
}

/**
 * The first triangle along a ray, both faces: its distance, and whether the
 * ray meets it from behind — its wound normal pointing along the ray, which
 * is a face the renderer culls and whose ink hull shows through it.
 */
function firstHit(p: Float32Array, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): { distance: number; behind: boolean } {
  let best = Infinity;
  let behind = false;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i]!, ay = p[i + 1]!, az = p[i + 2]!;
    const e1x = p[i + 3]! - ax, e1y = p[i + 4]! - ay, e1z = p[i + 5]! - az;
    const e2x = p[i + 6]! - ax, e2y = p[i + 7]! - ay, e2z = p[i + 8]! - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (d > 1e-6 && d < best) {
      best = d;
      // The wound normal e1 x e2 against the ray: positive is met from behind.
      behind = (e1y * e2z - e1z * e2y) * dx + (e1z * e2x - e1x * e2z) * dy + (e1x * e2y - e1y * e2x) * dz > 0;
    }
  }
  return { distance: best, behind };
}

/**
 * The share of rays from `eye`, spread evenly over the sphere, whose first
 * hit is the shell **from behind** rather than the lining, the furniture or
 * a pane: where the eye would see past a culled face to the shell's ink hull.
 * A face of the shell met from the front is drawn and inked as it should be,
 * and counts as covered; rays that meet nothing do not count.
 */
export function uncovered(eye: THREE.Vector3, shell: Float32Array, inside: ShellProbe, glass: ShellProbe, rays = 600): number {
  let seen = 0;
  let bare = 0;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < rays; i++) {
    const y = 1 - (2 * (i + 0.5)) / rays;
    const r = Math.sqrt(1 - y * y);
    const x = Math.cos(golden * i) * r;
    const z = Math.sin(golden * i) * r;
    const hit = firstHit(shell, eye.x, eye.y, eye.z, x, y, z);
    if (!Number.isFinite(hit.distance)) continue;
    seen++;
    if (!hit.behind) continue;
    const first = Math.min(inside.cast(eye.x, eye.y, eye.z, x, y, z), glass.cast(eye.x, eye.y, eye.z, x, y, z));
    // The lining stands `LINER_INSET` inside the shell: anything nearer than the shell itself covers it.
    if (!(first <= hit.distance + 1e-4)) bare++;
  }
  return seen === 0 ? 0 : bare / seen;
}
