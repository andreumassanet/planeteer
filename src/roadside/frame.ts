import * as THREE from 'three';
import { CHEVRON_SPAN, POLE_SPACING } from './constants.ts';
import type { RoadsideSite } from './types.ts';

/**
 * The frame the last `stand` call left: the foot `at` and the right-handed
 * basis `right`, `up`, `forward`. Shared by everything that lays roadside
 * geometry, which reads it right after standing.
 */
export const at = new THREE.Vector3();
export const ahead = new THREE.Vector3();
export const side = new THREE.Vector3();
export const up = new THREE.Vector3();
export const right = new THREE.Vector3();
export const forward = new THREE.Vector3();
/** Scratch vectors for the builders. */
export const centre = new THREE.Vector3();
export const scratch = new THREE.Vector3();
export const scratchB = new THREE.Vector3();

/** Whether the last `stand` was on a bridge or its ramps. */
let onDeck = false;

/**
 * Stands one thing at `s`, `lateral` off the centre line, facing `facing`
 * (+1 along the road from A to B, -1 back), sunk `sink` into its ground so a
 * bank's slope does not show under its downhill side.
 */
export function stand(site: RoadsideSite, s: number, lateral: number, facing: number, sink: number): void {
  // On a bridge and its ramps nothing stands but the bridge's own railings.
  const bridge = site.bridge;
  onDeck = bridge !== undefined && bridge !== null && s > bridge[0] - bridge[2] - 6 && s < bridge[1] + bridge[2] + 6;
  site.surface(s, lateral, at, ahead, side);
  up.copy(at).normalize();
  forward.copy(ahead).multiplyScalar(facing).projectOnPlane(up).normalize();
  right.crossVectors(up, forward).normalize();
  at.addScaledVector(up, -sink);
}

/** Whether what `stand` just stood is clear of the other roads' tops and off a bridge. */
export function clearAt(site: RoadsideSite, footprint: number): boolean {
  if (onDeck) return false;
  return site.clear === undefined || site.clear(at, footprint);
}

const bendAhead = new THREE.Vector3();
const bendBehind = new THREE.Vector3();
const bendPoint = new THREE.Vector3();
const bendSide = new THREE.Vector3();
const turnUp = new THREE.Vector3();

/** How far the road turns over `POLE_SPACING` centred on `s`, in radians. */
export function bendAt(site: RoadsideSite, s: number): number {
  const half = POLE_SPACING * 0.5;
  site.surface(Math.max(0, s - half), 0, bendPoint, bendBehind, bendSide);
  site.surface(Math.min(site.length, s + half), 0, bendPoint, bendAhead, bendSide);
  return bendBehind.angleTo(bendAhead);
}

/** The signed turn over `CHEVRON_SPAN` centred on `s`: positive bends to the left of A to B. */
export function turnAt(site: RoadsideSite, s: number): number {
  const half = CHEVRON_SPAN * 0.5;
  site.surface(Math.max(0, s - half), 0, bendPoint, bendBehind, bendSide);
  site.surface(Math.min(site.length, s + half), 0, bendPoint, bendAhead, bendSide);
  turnUp.copy(bendPoint).normalize();
  const angle = bendBehind.angleTo(bendAhead);
  return bendSide.crossVectors(bendBehind, bendAhead).dot(turnUp) >= 0 ? angle : -angle;
}
