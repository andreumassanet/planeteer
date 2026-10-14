import * as THREE from 'three';
import { LAND_HEIGHT } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { reliefAt } from '../terrain.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { SCENERY_SCALE } from '../stature.ts';
import type { FlyerPose } from './flight.ts';

/**
 * The helpers every flight path is built from: deterministic hashes, a
 * tangent frame on the sphere, a smooth terrain hull to keep clear of, and
 * the pose (heading and bank) differentiated from a path.
 */

const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/** Gravity in units, for the bank a turn wants: 9.8 m/s^2 at the world's scale. */
const GRAVITY = 9.81 * SCENERY_SCALE;
const MAX_BANK = 40 * DEG;

/** A number in [0, 1) from three integers. */
export function hashUnit(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** FNV-1a of a string, for hashes keyed on a site's id. */
export function codeOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h | 0;
}

// Hash salts, one per question.
export const S_PHASE = 11;
export const S_DEST = 12;
export const S_AIRPORT = 13;
export const S_LIVERY = 14;
export const S_CIRCUIT = 21;
export const S_HELI = 31;
export const S_BALLOON = 41;
export const S_AIRSHIP = 51;

export const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** East and north at a unit direction; north is the pole's direction projected off it. */
export function tangentsAt(direction: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3): void {
  north.set(0, 1, 0).addScaledVector(direction, -direction.y);
  if (north.lengthSq() < 1e-10) north.set(1, 0, 0).addScaledVector(direction, -direction.x);
  north.normalize();
  // East is north x up, matching the handedness of `sphere.ts`.
  east.crossVectors(north, direction).normalize();
}

/** A direction moved from `from` by `x` units east and `y` north (a tangent-plane step). */
export function offsetOnSphere(from: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3, x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
  return out
    .copy(from)
    .addScaledVector(east, x / PLANET_RADIUS)
    .addScaledVector(north, y / PLANET_RADIUS)
    .normalize();
}

/**
 * The terrain hull flyers keep clear of: shelf plus relief as if every coast
 * were land, sampled every `HULL_STEP` degrees and interpolated bilinearly.
 * The real ground steps at shores and town pads; this is continuous, so a
 * clearance over it never jumps. Each node is the highest of five samples.
 */
const HULL_STEP = 0.2;
const hullNodes = new Map<number, number>();
const hullProbe = new THREE.Vector3();

function hullNode(row: number, col: number): number {
  const key = row * 4096 + col;
  const known = hullNodes.get(key);
  if (known !== undefined) return known;
  if (hullNodes.size > 60000) hullNodes.clear();
  const lat = Math.max(-90, Math.min(90, row * HULL_STEP - 90));
  const lon = col * HULL_STEP - 180;
  let top = 0;
  for (const [dlat, dlon] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]] as const) {
    unitAt(Math.max(-90, Math.min(90, lat + dlat * HULL_STEP)), lon + dlon * HULL_STEP, hullProbe);
    top = Math.max(top, reliefAt(hullProbe.x, hullProbe.y, hullProbe.z));
  }
  hullNodes.set(key, top);
  return top;
}

export function hullAt(direction: THREE.Vector3): number {
  const length = direction.length() || 1;
  const u = (latOf(direction.y / length) + 90) / HULL_STEP;
  const v = (lonOf(direction.x, direction.z) + 180) / HULL_STEP;
  const row = Math.floor(u);
  const col = Math.floor(v);
  const fu = u - row;
  const fv = v - col;
  const cols = Math.round(360 / HULL_STEP);
  const c0 = ((col % cols) + cols) % cols;
  const c1 = (c0 + 1) % cols;
  const a = hullNode(row, c0) * (1 - fv) + hullNode(row, c1) * fv;
  const b = hullNode(row + 1, c0) * (1 - fv) + hullNode(row + 1, c1) * fv;
  return PLANET_RADIUS + LAND_HEIGHT + a * (1 - fu) + b * fu;
}

/** Half the step a path is differentiated over, in seconds. */
const DIFF = 0.25;
const pBefore = new THREE.Vector3();
const pAfter = new THREE.Vector3();
const radial = new THREE.Vector3();
const across = new THREE.Vector3();
const bend = new THREE.Vector3();

/**
 * Fills a pose's forward, up, speed and climb from where the path `at` is a
 * moment before and after `seconds`: forward along the travel, up tipped by
 * the bank of a coordinated turn at that speed and radius.
 */
export function orient(at: (seconds: number, out: THREE.Vector3) => THREE.Vector3, seconds: number, out: FlyerPose, bank = true): FlyerPose {
  at(seconds - DIFF, pBefore);
  at(seconds + DIFF, pAfter);
  at(seconds, out.position);
  radial.copy(out.position).normalize();
  out.forward.subVectors(pAfter, pBefore);
  const run = out.forward.length();
  out.speed = run / (2 * DIFF);
  out.climb = (pAfter.length() - pBefore.length()) / (2 * DIFF);
  if (run < 1e-6) {
    // Standing: keep the previous forward, square to the ground.
    out.forward.addScaledVector(radial, -out.forward.dot(radial));
    if (out.forward.lengthSq() < 1e-10) tangentsAt(radial, out.forward, across);
  }
  out.forward.normalize();
  // The turn: the path's second difference across the travel.
  let roll = 0;
  if (bank && out.speed > 1) {
    bend.copy(pAfter).add(pBefore).addScaledVector(out.position, -2).multiplyScalar(1 / (DIFF * DIFF));
    across.crossVectors(radial, out.forward).normalize();
    const pull = bend.dot(across);
    roll = Math.max(-MAX_BANK, Math.min(MAX_BANK, Math.atan2(pull, GRAVITY)));
  }
  out.up.copy(radial).addScaledVector(out.forward, -radial.dot(out.forward)).normalize();
  if (roll !== 0) {
    // Roll the up about the forward, toward the inside of the turn.
    across.crossVectors(out.forward, out.up);
    out.up.multiplyScalar(Math.cos(roll)).addScaledVector(across, -Math.sin(roll)).normalize();
  }
  return out;
}
