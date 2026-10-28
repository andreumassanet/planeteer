/**
 * A knocked-over prop in the air and on the ground: a stick about its middle
 * thrown the way the vehicle was going, tipping over as it flies, bouncing
 * once or twice on the ground and laid flat. Integrated in fixed steps, so a
 * frame rate changes nothing about where it lands.
 */
import * as THREE from 'three';

/** Gravity on a thrown prop, units a second squared: brisk, as a comic's is. */
const GRAVITY = 30;
/** The fixed step, seconds. */
const STEP = 1 / 120;
/** How much of its fall a prop keeps coming back off the ground, and of its slide. */
const BOUNCE = 0.3;
const SLIDE = 0.65;
/** How fast it is laid flat once it has touched: radians a second a radian of tilt. */
const LAY = 14;
/** Under this speed and this far from flat, a touching prop comes to rest. */
const REST_SPEED = 1.2;
const REST_TILT = 0.12;
/** Where along a prop's height its middle is, as a share: a lamp is top-heavy, a bench is not; one figure serves. */
const MIDDLE = 0.45;

export interface Tumble {
  /** The middle of the stick, in the world, and its velocity. */
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Its orientation and its angular velocity (world axis times radians a second). */
  q: THREE.Quaternion;
  w: THREE.Vector3;
  height: number;
  radius: number;
  /** Up at the prop, a unit vector. */
  up: THREE.Vector3;
  bounces: number;
  /** Lying still. */
  rest: boolean;
  /** Time not yet stepped, seconds. */
  owed: number;
}

const axisY = new THREE.Vector3();
const lie = new THREE.Vector3();
const spin = new THREE.Quaternion();
const turn = new THREE.Vector3();
const end = new THREE.Vector3();
const flat = new THREE.Vector3();

/**
 * Starts a tumble for a prop standing at `foot` with `q` (its host's frame),
 * `height` tall and `radius` wide, hit by something going `velocity`.
 */
export function startTumble(foot: THREE.Vector3, q: THREE.Quaternion, height: number, radius: number, velocity: THREE.Vector3): Tumble {
  const up = foot.clone().normalize();
  const speed = velocity.length();
  // The way it was hit, along the ground.
  flat.copy(velocity).projectOnPlane(up);
  if (flat.lengthSq() < 1e-6) flat.set(1, 0, 0).projectOnPlane(up);
  flat.normalize();
  const pos = foot.clone().addScaledVector(up, height * MIDDLE);
  // Flung a share of the hit, and up; the heavier the prop, the less.
  const heft = Math.min(1, 1.2 / Math.max(0.5, height));
  const vel = flat.clone().multiplyScalar((0.3 * speed + 2) * heft).addScaledVector(up, (0.15 * speed + 3) * heft);
  // Tipping over the way it was hit: `up x flat` turns the top along `flat`.
  const w = new THREE.Vector3().crossVectors(up, flat).multiplyScalar(2.2 + 0.05 * speed);
  // A little spin about its own axis, drawn off where it stood, so the same knock always falls the same way.
  const spin = (((foot.x * 12.9898 + foot.z * 78.233) % 1) + 1) % 1;
  w.addScaledVector(up, (spin - 0.5) * 2);
  return { pos, vel, q: q.clone(), w, height, radius, up, bounces: 0, rest: false, owed: 0 };
}

/** The lowest the stick reaches over the ground, by its two ends, as a height; negative is under it. */
function clearance(t: Tumble, floorAt: (point: THREE.Vector3) => number): number {
  axisY.set(0, 1, 0).applyQuaternion(t.q);
  let lowest = Infinity;
  for (const share of [-MIDDLE, 1 - MIDDLE]) {
    end.copy(t.pos).addScaledVector(axisY, t.height * share);
    lowest = Math.min(lowest, end.length() - floorAt(end) - t.radius);
  }
  return lowest;
}

function step(t: Tumble, floorAt: (point: THREE.Vector3) => number): void {
  t.pos.addScaledVector(t.vel, STEP);
  t.vel.addScaledVector(t.up, -GRAVITY * STEP);
  const rate = t.w.length();
  if (rate > 1e-6) {
    spin.setFromAxisAngle(turn.copy(t.w).divideScalar(rate), rate * STEP);
    t.q.premultiply(spin).normalize();
  }
  const under = clearance(t, floorAt);
  if (under >= 0) return;
  t.pos.addScaledVector(t.up, -under);
  const rising = t.vel.dot(t.up);
  if (rising < 0) {
    t.vel.addScaledVector(t.up, -rising * (1 + BOUNCE));
    // The slide along the ground gives up some of itself at each touch.
    flat.copy(t.vel).projectOnPlane(t.up);
    t.vel.sub(flat).addScaledVector(flat, SLIDE);
    t.w.multiplyScalar(0.5);
    t.bounces++;
  }
  // Laid towards flat: the turn from its axis to that axis along the ground.
  axisY.set(0, 1, 0).applyQuaternion(t.q);
  lie.copy(axisY).projectOnPlane(t.up);
  if (lie.lengthSq() < 1e-6) lie.crossVectors(t.up, t.vel.lengthSq() > 1e-6 ? t.vel : flat.set(1, 0, 0)).normalize();
  else lie.normalize();
  const tilt = axisY.angleTo(lie);
  turn.crossVectors(axisY, lie);
  if (turn.lengthSq() > 1e-9) t.w.addScaledVector(turn.normalize(), LAY * tilt * STEP);
  if (t.vel.length() < REST_SPEED && tilt < REST_TILT && rate < 2) {
    // Down: laid exactly flat, its side on the ground.
    spin.setFromUnitVectors(axisY, lie);
    t.q.premultiply(spin).normalize();
    t.vel.set(0, 0, 0);
    t.w.set(0, 0, 0);
    const low = clearance(t, floorAt);
    if (low < 0) t.pos.addScaledVector(t.up, -low);
    t.rest = true;
  }
}

/** Advances a tumble by `dt` seconds in fixed steps; true the frame it first touches the ground. */
export function stepTumble(t: Tumble, dt: number, floorAt: (point: THREE.Vector3) => number): boolean {
  if (t.rest) return false;
  const before = t.bounces;
  t.owed += Math.min(dt, 0.25);
  while (t.owed >= STEP && !t.rest) {
    t.owed -= STEP;
    step(t, floorAt);
  }
  return before === 0 && t.bounces > 0;
}

/** Where the prop's foot is now, from the stick's middle. */
export function tumbleFoot(t: Tumble, out: THREE.Vector3): THREE.Vector3 {
  axisY.set(0, 1, 0).applyQuaternion(t.q);
  return out.copy(t.pos).addScaledVector(axisY, -t.height * MIDDLE);
}
