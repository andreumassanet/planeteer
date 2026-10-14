/** Vehicle poses: validating a wire pose, standing an object at one, and setting a vehicle down on its wheels. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import type { CraftKind, WirePose } from '../craft/contract.ts';
import { writePose } from '../player/pose.ts';
import { AFLOAT } from './models.ts';

const poseX = new THREE.Vector3();
const poseY = new THREE.Vector3();
const poseZ = new THREE.Vector3();
const poseBasis = new THREE.Matrix4();

/** A pose with all nine numbers finite and both directions of some length. */
export function isPose(pose: readonly number[] | undefined): pose is WirePose {
  if (pose === undefined || pose.length < 9) return false;
  for (let i = 0; i < 9; i++) if (!Number.isFinite(pose[i])) return false;
  return Math.hypot(pose[3]!, pose[4]!, pose[5]!) > 1e-6 && Math.hypot(pose[6]!, pose[7]!, pose[8]!) > 1e-6;
}

/**
 * Stands an object at a pose.
 *
 * The basis is built as `X = Y x Z`, so its determinant is +1. `makeBasis(east,
 * up, north)` is the other way round, a reflection, and a reflected vehicle
 * renders as a solid ink blob; hence the assertion.
 */
export function applyPose(pose: WirePose, object: THREE.Object3D): void {
  poseZ.set(pose[3]!, pose[4]!, pose[5]!).normalize();
  poseY.set(pose[6]!, pose[7]!, pose[8]!);
  poseX.crossVectors(poseY, poseZ);
  if (poseX.lengthSq() < 1e-12) {
    // Forward along up: fall back on the planet's normal for the up.
    poseY.set(pose[0]!, pose[1]!, pose[2]!);
    poseX.crossVectors(poseY, poseZ);
  }
  poseX.normalize();
  poseY.crossVectors(poseZ, poseX).normalize();
  poseBasis.makeBasis(poseX, poseY, poseZ);
  if (poseBasis.determinant() <= 0) throw new Error('fleet: a vehicle pose would be mirrored');
  object.position.set(pose[0]!, pose[1]!, pose[2]!);
  object.quaternion.setFromRotationMatrix(poseBasis);
}

/**
 * Where a vehicle's wheels are, as a fraction of its half length and half
 * width: a model's size is its bumpers and mirrors, and its tyres stand a
 * little inside them.
 */
const WHEEL_INSET = 0.8;
/** The steepest a vehicle is set down at, as rise over run: past it, it sits at this and a corner floats. */
const SEAT_GRADE = 0.6;
/** What stands on two points along its length, and so takes the ground's pitch and never its roll. */
const IN_LINE: ReadonlySet<CraftKind> = new Set<CraftKind>(['bicycle', 'motorbike', 'horse']);

const seatDir = new THREE.Vector3();
const seatForward = new THREE.Vector3();
const seatSide = new THREE.Vector3();
const seatUp = new THREE.Vector3();
const seatCorner = new THREE.Vector3();
const seatHeights = [0, 0, 0, 0];

/**
 * Sets a vehicle down on the ground under its wheels, not under its middle:
 * `pose`'s point and forward in, its seated pose into `out` (which may be `pose`).
 *
 * The ground is asked under four wheels, `WHEEL_INSET` of the half length and
 * half width out, and the plane through them tilts the vehicle: pitch from the
 * axles, roll from the sides. The plane is raised by the most any wheel is
 * under it, so every wheel is on the ground or over it and one is on it. A
 * two-wheeler and a horse take the pitch only; a balloon's basket stands
 * upright on the highest of the four; a hull is left on the water. `groundAt`
 * is the surface the kind stands on, as a radius.
 */
export function seatPose(
  pose: WirePose,
  size: readonly [number, number, number],
  kind: CraftKind,
  groundAt: (point: THREE.Vector3) => number,
  out: WirePose,
): WirePose {
  for (let i = 0; i < 9; i++) out[i] = pose[i]!;
  if (AFLOAT.has(kind)) return out;
  seatDir.set(pose[0]!, pose[1]!, pose[2]!).normalize();
  seatForward.set(pose[3]!, pose[4]!, pose[5]!).projectOnPlane(seatDir);
  if (seatForward.lengthSq() < 1e-12) return out;
  seatForward.normalize();
  // Screen right: forward x up.
  seatSide.crossVectors(seatForward, seatDir).normalize();
  const length = (size[0] / 2) * WHEEL_INSET;
  const width = IN_LINE.has(kind) ? 0 : (size[1] / 2) * WHEEL_INSET;
  let radius = 0;
  let pitch = 0;
  let roll = 0;
  // Twice: a wheel `length` out along a pitched body stands nearer than that
  // over the ground, so the second pass asks the ground where the first
  // pass's wheels are.
  for (let pass = 0; pass < 2; pass++) {
    const along = length / Math.sqrt(1 + pitch * pitch);
    const across = width / Math.sqrt(1 + roll * roll);
    // Front right, front left, back right, back left.
    let k = 0;
    for (const f of [1, -1]) {
      for (const r of [1, -1]) {
        seatCorner
          .copy(seatDir)
          .addScaledVector(seatForward, (f * along) / PLANET_RADIUS)
          .addScaledVector(seatSide, (r * across) / PLANET_RADIUS)
          .normalize()
          .multiplyScalar(PLANET_RADIUS);
        seatHeights[k++] = groundAt(seatCorner);
      }
    }
    const [fr, fl, br, bl] = seatHeights as [number, number, number, number];
    if (kind === 'balloon') {
      radius = Math.max(fr, fl, br, bl);
      break;
    }
    const mean = (fr + fl + br + bl) / 4;
    pitch = along > 0 ? Math.max(-SEAT_GRADE, Math.min(SEAT_GRADE, (fr + fl - br - bl) / (4 * along))) : 0;
    roll = across > 0 ? Math.max(-SEAT_GRADE, Math.min(SEAT_GRADE, (fr + br - fl - bl) / (4 * across))) : 0;
    // The plane through the middle, raised until no wheel is under the ground.
    let lift = -Infinity;
    k = 0;
    for (const f of [1, -1]) {
      for (const r of [1, -1]) {
        const plane = mean + pitch * f * along + roll * r * across;
        lift = Math.max(lift, seatHeights[k++]! - plane);
      }
    }
    radius = mean + lift;
  }
  // The ground's plane rises `pitch` a unit forward and `roll` a unit right,
  // so its normal leans back and left of the radius by as much.
  seatUp.copy(seatDir).addScaledVector(seatForward, -pitch).addScaledVector(seatSide, -roll).normalize();
  seatForward.addScaledVector(seatDir, pitch).projectOnPlane(seatUp).normalize();
  seatDir.multiplyScalar(radius);
  return writePose(seatDir, seatForward, seatUp, out);
}
