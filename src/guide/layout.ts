/**
 * Where the guide's chevrons stand: along the great circle from the player
 * towards the target, a stretch of it ahead, spaced and sized by how the
 * player is travelling. Pure, so the check lays the same line the game does.
 */
import * as THREE from 'three';

/** How the player is travelling, as the guide sizes it. */
export type GuideMedium = 'foot' | 'road' | 'water' | 'air';

export interface GuideProfile {
  /** Units between two chevrons along the line. */
  spacing: number;
  /** The stretch of line drawn, units from the player. */
  from: number;
  to: number;
  /** A chevron's length, units. */
  size: number;
  /** How high a chevron rides over what is under it, units. */
  lift: number;
  /** How fast the chevrons crawl on along the line, units a second. */
  flow: number;
}

/**
 * On foot a short line at the feet; a road vehicle or a boat a longer one,
 * larger, laid on the road or the water; an aircraft a line hung in the air at
 * its own height, sloping down to the target over the whole way there.
 */
export const GUIDE_PROFILES: Readonly<Record<GuideMedium, GuideProfile>> = {
  foot: { spacing: 4.5, from: 5, to: 58, size: 1.6, lift: 0.3, flow: 3 },
  road: { spacing: 11, from: 12, to: 150, size: 3.4, lift: 0.35, flow: 16 },
  water: { spacing: 13, from: 14, to: 170, size: 3.8, lift: 0.6, flow: 16 },
  air: { spacing: 60, from: 70, to: 960, size: 13, lift: 0, flow: 110 },
};

/** The most chevrons any profile lays. */
export const MAX_CHEVRONS = Math.max(
  ...Object.values(GUIDE_PROFILES).map((p) => Math.floor((p.to - p.from) / p.spacing) + 2),
);

/**
 * Units short of the target the line stops: the target's own mark (the
 * beacon, a ring) takes over there.
 */
export const GUIDE_STOP = 30;
/** How far over the ground a line in the air is kept at the least, units. */
export const AIR_FLOOR = 25;

export interface GuideInput {
  /** The player's position. */
  from: THREE.Vector3;
  /** The point the line leads to. */
  target: THREE.Vector3;
  medium: GuideMedium;
  /** Seconds, for the crawl. */
  time: number;
  /** The planet's radius, for distances along the surface. */
  radius: number;
  /** The radius of what a chevron on the ground rides on, under a direction. */
  surfaceAt: (direction: THREE.Vector3) => number;
  /** The camera, which a chevron in the air turns its face towards. */
  eye: THREE.Vector3;
}

const start = new THREE.Vector3();
const goal = new THREE.Vector3();
const axis = new THREE.Vector3();
const here = new THREE.Vector3();
const ahead = new THREE.Vector3();
const along = new THREE.Vector3();
const face = new THREE.Vector3();
const side = new THREE.Vector3();
const toEye = new THREE.Vector3();
const point = new THREE.Vector3();
const scale = new THREE.Vector3();
const basis = new THREE.Matrix4();
const turn = new THREE.Quaternion();

/** The unit direction `distance` units along the great circle from `start` about `axis`. */
function alongCircle(distance: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  turn.setFromAxisAngle(axis, distance / radius);
  return out.copy(start).applyQuaternion(turn);
}

/**
 * Writes one matrix a chevron into `out` (a chevron's model points +Z, its
 * face +Y) and returns how many it wrote. A chevron near either end of the
 * line is drawn smaller, down to nothing, so the line grows in and out rather
 * than popping. Every matrix is a proper rotation times a positive scale.
 */
export function layGuide(input: GuideInput, out: THREE.Matrix4[]): number {
  const profile = GUIDE_PROFILES[input.medium];
  const { radius } = input;
  start.copy(input.from).normalize();
  goal.copy(input.target).normalize();
  axis.crossVectors(start, goal);
  const sine = axis.length();
  // At the target itself, or its antipode, there is no one way to it.
  if (sine < 1e-9) return 0;
  axis.divideScalar(sine);
  const total = Math.atan2(sine, start.dot(goal)) * radius;
  const end = Math.min(profile.to, total - GUIDE_STOP);
  if (end <= profile.from) return 0;

  const fromHeight = input.from.length();
  const toHeight = input.target.length();
  const crawl = ((input.time * profile.flow) % profile.spacing + profile.spacing) % profile.spacing;
  let count = 0;
  for (let d = profile.from + crawl; d <= end && count < out.length; d += profile.spacing) {
    alongCircle(d, radius, here);
    alongCircle(d + profile.size * 0.5, radius, ahead);
    // The line's way at this point, in its tangent plane.
    along.subVectors(ahead, here);
    along.addScaledVector(here, -along.dot(here)).normalize();
    let height: number;
    if (input.medium === 'air') {
      height = fromHeight + (toHeight - fromHeight) * Math.min(1, d / total);
      height = Math.max(height, input.surfaceAt(here) + AIR_FLOOR);
      point.copy(here).multiplyScalar(height);
      // Turned about its own way to face the eye, so it is never seen edge on.
      toEye.subVectors(input.eye, point);
      face.copy(toEye).addScaledVector(along, -toEye.dot(along));
      if (face.lengthSq() < 1e-9) face.copy(here);
      face.normalize();
    } else {
      const centre = input.surfaceAt(here);
      const tip = input.surfaceAt(ahead);
      height = Math.max(centre, tip) + profile.lift;
      point.copy(here).multiplyScalar(height);
      // Pitched with the ground along the way, flat across it.
      along.addScaledVector(here, (tip - centre) / (profile.size * 0.5)).normalize();
      face.copy(here).addScaledVector(along, -here.dot(along)).normalize();
    }
    // A right-handed basis: X x Y = Z, so X = Y x Z.
    side.crossVectors(face, along).normalize();
    const grow = Math.min(1, (d - profile.from) / profile.spacing, (end - d) / (profile.spacing * 1.5));
    const size = profile.size * Math.max(0, grow);
    if (size <= 1e-3) continue;
    basis.makeBasis(side, face, along);
    out[count]!.copy(basis).setPosition(point);
    out[count]!.scale(scale.set(size, size, size));
    count++;
  }
  return count;
}
