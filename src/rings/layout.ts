/**
 * Where the rings hang, as a pure function of the places and the landmarks,
 * so every client flies the same ones with nothing on the wire.
 *
 * A landmark's ring hangs high over it, clear of the tallest tier, turned to
 * a heading of its own: one to collect a landmark, kept on the device. A
 * course (one a country, `rings/anchors.ts` says round which town) is
 * `COURSE_RINGS` big rings on a wide, gently lobed loop round its town, at
 * nearly one height, to be flown in order against the clock. A course is meant to be flown with a
 * light touch: the turn from one ring to the next is a shallow bank, the
 * height barely changes, and a ring missed is passed by rather than flown
 * back to.
 */
import * as THREE from 'three';
import { unitAt } from '../sphere.ts';

/** A landmark's ring: its opening's radius and its height over the ground, units. Over `TIERS.landmark` (120) by its own radius and more. */
export const LANDMARK_RING_RADIUS = 34;
export const LANDMARK_RING_RISE = 215;
/** A course ring's opening, units: a light plane's span is about a seventh of it. */
export const COURSE_RING_RADIUS = 46;
export const COURSE_RINGS = 8;
/**
 * How far out of the town's built radius the loop runs, units. With eight
 * rings that puts 550 to 900 units between two, five or six seconds at the
 * low cruise, and a turn of 45 degrees over them: a bank of a few degrees.
 */
export const COURSE_GAP = 650;
/** How much the loop swells and pinches, as a share of its radius: enough to make it a shape and not a circle. */
export const COURSE_LOBE = 0.1;
/** A course ring's height over the town's own ground, units: `COURSE_RISE` give or take `COURSE_SWING`, once round the loop. */
export const COURSE_RISE = 150;
export const COURSE_SWING = 22;
/** The least a ring clears the ground under it, units: a ridge under the loop lifts that ring alone. */
export const COURSE_CLEAR = 95;
/** How far through a ring's plane a pass may miss its opening and still count, units. */
export const PASS_SLACK = 12;
/** A pass this near the centre, as a share of the opening, is a perfect one. */
export const PERFECT_SHARE = 0.45;
/** A crossing of a course ring's plane this far from its centre, units, is a ring missed and passed by. */
export const MISS_REACH = 650;
/** A step longer than this, units, is a jump across the map and passes nothing. */
export const PASS_LONGEST = 900;

export interface Ring {
  /** `l:<landmark id>` or `c:<place index>:<n>`. */
  key: string;
  kind: 'landmark' | 'course';
  /** Its order in its course; 0 for a landmark's. */
  index: number;
  centre: THREE.Vector3;
  /** The way through it, a unit vector: the ring's plane is square to it. */
  axis: THREE.Vector3;
  /** The opening's radius, units. */
  radius: number;
}

/** What crossing a ring's plane came to: through the middle, through it, beside it, or no crossing. */
export type Crossing = 'perfect' | 'through' | 'missed' | null;

/** A small deterministic hash of a string, 0 to 1. */
export function hashUnit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const pole = new THREE.Vector3(0, 1, 0);
const spare = new THREE.Vector3(1, 0, 0);

/** Two unit tangents at `up`, square to each other: any pair, since every use turns them by a seeded angle. */
export function tangentsAt(up: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): void {
  a.crossVectors(Math.abs(up.y) > 0.95 ? spare : pole, up).normalize();
  b.crossVectors(up, a).normalize();
}

/** The ring over a landmark at its placed position; `groundAt` is the ground's radius under a unit direction. */
export function landmarkRing(
  landmark: { id: string; lat: number; lon: number },
  groundAt: (direction: THREE.Vector3) => number,
  sea: number,
): Ring {
  const up = unitAt(landmark.lat, landmark.lon, new THREE.Vector3());
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  tangentsAt(up, a, b);
  const turn = hashUnit(landmark.id) * Math.PI * 2;
  const axis = a.multiplyScalar(Math.cos(turn)).addScaledVector(b, Math.sin(turn)).normalize();
  const ground = Math.max(groundAt(up), sea);
  return {
    key: `l:${landmark.id}`,
    kind: 'landmark',
    index: 0,
    centre: up.multiplyScalar(ground + LANDMARK_RING_RISE),
    axis,
    radius: LANDMARK_RING_RADIUS,
  };
}

/**
 * A town's course: `COURSE_RINGS` rings on a lobed loop `COURSE_GAP` outside
 * its built radius, flown one way or the other by the town's own seed, at
 * `COURSE_RISE` over the town's own ground (higher where a hill under a ring
 * would come within `COURSE_CLEAR` of it), each ring turned along the path
 * through it: square to the line from the ring before to the ring after.
 */
export function courseOf(
  place: { lat: number; lon: number },
  placeIndex: number,
  builtRadius: number,
  planetRadius: number,
  groundAt: (direction: THREE.Vector3) => number,
  sea: number,
): Ring[] {
  const up = unitAt(place.lat, place.lon, new THREE.Vector3());
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  tangentsAt(up, a, b);
  const start = hashUnit(`course:${placeIndex}`) * Math.PI * 2;
  const way = hashUnit(`way:${placeIndex}`) < 0.5 ? 1 : -1;
  const lobe = hashUnit(`lobe:${placeIndex}`) * Math.PI * 2;
  const swing = hashUnit(`swing:${placeIndex}`) * Math.PI * 2;
  const base = Math.max(groundAt(up), sea) + COURSE_RISE;
  const loop = builtRadius + COURSE_GAP;
  const centres: THREE.Vector3[] = [];
  for (let i = 0; i < COURSE_RINGS; i++) {
    const angle = start + (way * Math.PI * 2 * i) / COURSE_RINGS;
    const reach = (loop * (1 + COURSE_LOBE * Math.sin(2 * angle + lobe))) / planetRadius;
    const out = a.clone().multiplyScalar(Math.cos(angle)).addScaledVector(b, Math.sin(angle));
    const at = up.clone().addScaledVector(out, Math.tan(reach)).normalize();
    const height = Math.max(
      base + COURSE_SWING * Math.sin((Math.PI * 2 * i) / COURSE_RINGS + swing),
      Math.max(groundAt(at), sea) + COURSE_CLEAR,
    );
    centres.push(at.multiplyScalar(height));
  }
  return centres.map((centre, i) => {
    const before = centres[(i + COURSE_RINGS - 1) % COURSE_RINGS]!;
    const after = centres[(i + 1) % COURSE_RINGS]!;
    const axis = after.clone().sub(before);
    // Level: a ring tipped by a climb between its neighbours is harder to read and to thread.
    const upHere = centre.clone().normalize();
    axis.addScaledVector(upHere, -axis.dot(upHere)).normalize();
    return { key: `c:${placeIndex}:${i}`, kind: 'course', index: i, centre, axis, radius: COURSE_RING_RADIUS };
  });
}

/** The length of a course, units, ring to ring and back to the first. */
export function courseLength(rings: readonly Ring[]): number {
  let length = 0;
  for (let i = 0; i < rings.length; i++) length += rings[i]!.centre.distanceTo(rings[(i + 1) % rings.length]!.centre);
  return length;
}

const step = new THREE.Vector3();
const hit = new THREE.Vector3();

/**
 * What going from `p0` to `p1` came to at the ring: a crossing of its plane,
 * either way, inside the opening and `slack` (`perfect` within
 * `PERFECT_SHARE` of the centre), or beside it within `missReach`; null for
 * no crossing, or a step longer than `PASS_LONGEST` (a jump on the map).
 */
export function crossing(p0: THREE.Vector3, p1: THREE.Vector3, ring: Ring, slack = PASS_SLACK, missReach = 0): Crossing {
  step.subVectors(p1, p0);
  if (step.lengthSq() > PASS_LONGEST * PASS_LONGEST) return null;
  const d0 = hit.subVectors(p0, ring.centre).dot(ring.axis);
  const d1 = hit.subVectors(p1, ring.centre).dot(ring.axis);
  // A step in the ring's own plane crosses it nowhere in particular.
  if ((d0 > 0 && d1 > 0) || (d0 < 0 && d1 < 0) || Math.abs(d0 - d1) < 1e-6) return null;
  const t = d0 / (d0 - d1);
  hit.copy(p0).addScaledVector(step, t);
  const off = hit.distanceTo(ring.centre);
  if (off <= ring.radius * PERFECT_SHARE) return 'perfect';
  if (off <= ring.radius + slack) return 'through';
  return off <= missReach ? 'missed' : null;
}

/** Whether going from `p0` to `p1` went through the ring's opening. */
export function passes(p0: THREE.Vector3, p1: THREE.Vector3, ring: Ring, slack = PASS_SLACK): boolean {
  const result = crossing(p0, p1, ring, slack);
  return result === 'perfect' || result === 'through';
}

const across = new THREE.Vector3();
const upright = new THREE.Vector3();
const size = new THREE.Vector3();

/**
 * The matrix a ring is drawn with: a torus round +Z, of radius 1, turned so
 * +Z is the ring's axis and +Y the planet's up, scaled to the opening times
 * `grow`. A proper rotation (X = Y x Z) times a positive scale.
 */
export function ringMatrix(ring: Ring, grow: number, out: THREE.Matrix4): THREE.Matrix4 {
  upright.copy(ring.centre).normalize();
  upright.addScaledVector(ring.axis, -upright.dot(ring.axis)).normalize();
  across.crossVectors(upright, ring.axis).normalize();
  out.makeBasis(across, upright, ring.axis).setPosition(ring.centre);
  const s = ring.radius * Math.max(1e-4, grow);
  return out.scale(size.set(s, s, s));
}
