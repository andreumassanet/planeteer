import * as THREE from 'three';
import { LEAN_STEP, leanAxis, leanInverse, leanParent, leanTo, leanTurn } from './astride.ts';
import { closeHand } from './grip.ts';
import { aimArm, twoBone, type Limbs } from './limbs.ts';

/**
 * A steering wheel, or a yoke, or a tiller held in both hands, as a seated
 * body's arms are put to it (`holdWheel`): its middle about the hip in the
 * seat's own frame (+X the body's left, +Z ahead), how far its axle tips
 * forward and down from level, its radius, and how far round from the top of
 * the rim each hand holds it, radians — about one, ten to two.
 */
export interface WheelGrip {
  centre: readonly [number, number, number];
  tilt: number;
  radius: number;
  spread: number;
  /**
   * One hand somewhere else, about the hip in the same frame: on its own
   * thigh beside a hand controller held in the other (the Lunar Roving
   * Vehicle's T-handle, between the seats, is driven one-handed). `side` 1
   * is the left hand, -1 the right; that hand neither holds the rim nor
   * turns with it.
   */
  rest?: { side: 1 | -1; at: readonly [number, number, number] };
}

/**
 * How a seated body sits: on a chair or a bench, the shins hanging (the
 * default); or in a car, `drive`, the thighs a little up and the shins
 * forward to the pedals (`DRIVE_THIGH` in `avatar.ts`), with the hands on a
 * `wheel` if it has one. `Seat` in `craft/contract.ts` carries the same two
 * fields.
 */
export interface SeatedPose {
  legs?: 'chair' | 'drive';
  wheel?: WheelGrip;
}

/**
 * How far round the hands go with the wheel, radians either way: past it they
 * slide on the rim as it goes on turning under them, as a driver's do — held
 * all the way to a car's full lock (`WHEEL_LOCK` in `craft/cabin.ts`) the
 * hand going down the far side was out of the arm's reach.
 */
export const WHEEL_HOLD = 0.7;

/**
 * Where on the rim a hand holds, in `frame` about `hip`: the left hand
 * `spread` round from the top towards the body's left and the right the same
 * the other way, both carried round by `turn` — the wheel's own angle, which
 * `craft/motion.ts` turns it by, positive clockwise as the driver sees it —
 * as far as `WHEEL_HOLD`. Writes the left hand's point for `side` 1 and the
 * right's for -1.
 */
export function wheelHand(hip: THREE.Vector3, wheel: WheelGrip, turn: number, side: 1 | -1, out: THREE.Vector3): THREE.Vector3 {
  if (wheel.rest !== undefined && wheel.rest.side === side) return out.set(hip.x + wheel.rest.at[0], hip.y + wheel.rest.at[1], hip.z + wheel.rest.at[2]);
  const angle = side * wheel.spread - Math.max(-WHEEL_HOLD, Math.min(WHEEL_HOLD, turn));
  const across = Math.sin(angle) * wheel.radius;
  const along = Math.cos(angle) * wheel.radius;
  // The rim's own up is square to its axle: up and a little forward, by the tilt.
  return out.set(
    hip.x + wheel.centre[0] + across,
    hip.y + wheel.centre[1] + along * Math.cos(wheel.tilt),
    hip.z + wheel.centre[2] + along * Math.sin(wheel.tilt),
  );
}

export const wheelShoulder = new THREE.Vector3();
export const wheelElbow = new THREE.Vector3();
export const wheelWrist = new THREE.Vector3();
export const wheelTarget = new THREE.Vector3();
export const wheelPole = new THREE.Vector3();
export const wheelUpper = new THREE.Vector3();
export const wheelLower = new THREE.Vector3();

/**
 * Both hands on a wheel, the elbows bent out and down by the two-bone solve
 * (`twoBone`): each wrist to its hand's point on the rim (`wheelHand`), a
 * hand's breadth short of it towards the shoulder, so the palm and not the
 * wrist is on the rim. `hip` is where the seat's hip is in `frame`. Unlike
 * `reachArms` the arms are not locked straight: a wheel is held near the
 * chest, and an arm pointed at it from the shoulder would put the hand
 * through it. The fingers close round the rim (`closeHand`). Allocates nothing.
 */
export function holdWheel(limbs: Limbs, frame: THREE.Object3D, hip: THREE.Vector3, wheel: WheelGrip, turn: number): number {
  frame.updateMatrixWorld(true);
  // Leaning in from the hips until the shoulders are within reach of the
  // rim's two holds as they stand with the wheel straight — no further than
  // `WHEEL_LEAN` — so the lean holds still while the wheel turns under the
  // hands.
  const lean = wheelLean(limbs, frame, hip, wheel);
  if (lean > 0 && limbs.spine !== null) {
    const spine = limbs.spine;
    leanAxis.set(1, 0, 0).transformDirection(frame.matrixWorld);
    spine.parent!.getWorldQuaternion(leanParent);
    leanTurn.setFromAxisAngle(leanAxis, lean);
    leanTurn.premultiply(leanInverse.copy(leanParent).invert()).multiply(leanParent);
    spine.quaternion.premultiply(leanTurn);
    spine.updateMatrixWorld(true);
  }
  limbs.arms.forEach((arm, i) => {
    const side = i === 0 ? 1 : -1;
    frame.worldToLocal(arm.upper.getWorldPosition(wheelShoulder));
    frame.worldToLocal(arm.lower.getWorldPosition(wheelElbow));
    frame.worldToLocal(arm.wrist.getWorldPosition(wheelWrist));
    const first = wheelShoulder.distanceTo(wheelElbow);
    const second = wheelElbow.distanceTo(wheelWrist);
    wheelHand(hip, wheel, turn, side, wheelTarget);
    // The palm on the rim: the wrist a little short of it, back towards the shoulder.
    wheelPole.copy(wheelShoulder).sub(wheelTarget).normalize();
    wheelTarget.addScaledVector(wheelPole, second * 0.12);
    // The elbow down and a little out to its own side, so the forearm comes
    // up to the rim from under it and the hand lies along the rim's side
    // rather than reaching across to meet the other one.
    wheelPole.set(side * 0.45, -1, -0.15);
    twoBone(wheelShoulder, first, second, wheelTarget, wheelPole, wheelUpper, wheelLower);
    aimArm(arm, frame, wheelUpper, wheelLower);
    // The fingers round the rim; a hand resting on its thigh stays open.
    const hand = limbs.hands[i];
    if (hand !== undefined && wheel.rest?.side !== side) closeHand(hand);
  });
  return lean;
}

/**
 * The furthest a driver leans in from the hips to reach the wheel, radians.
 * The cast's arms are short for its height (shoulder to wrist 0.22 of a
 * body), and a wheel near enough the chest to be reached upright is under
 * the eye and out of a first-person view; so the wheel stands where it is
 * seen and the driver leans into it, as an eager one does.
 */
export const WHEEL_LEAN = 0.35;

export const leanMid = new THREE.Vector3();
export const leanHold = new THREE.Vector3();
export const leanSpine = new THREE.Vector3();
export const leanShoulder = new THREE.Vector3();

/**
 * How far the body on a seat leans in to reach its wheel: the least turn of
 * the spine forward, in steps of `LEAN_STEP`, that brings the middle of the
 * shoulders within the arm, less a tenth, of the middle of the two holds with
 * the wheel straight. Reads the pose as it stands; writes nothing.
 */
export function wheelLean(limbs: Limbs, frame: THREE.Object3D, hip: THREE.Vector3, wheel: WheelGrip): number {
  const spine = limbs.spine;
  if (spine === null) return 0;
  frame.updateMatrixWorld(true);
  const [left, right] = limbs.arms as [Limbs['arms'][number], Limbs['arms'][number]];
  frame.worldToLocal(spine.getWorldPosition(leanSpine));
  frame.worldToLocal(left.upper.getWorldPosition(leanShoulder));
  frame.worldToLocal(right.upper.getWorldPosition(leanMid));
  leanMid.add(leanShoulder).multiplyScalar(0.5).sub(leanSpine);
  frame.worldToLocal(left.lower.getWorldPosition(leanHold));
  const upper = leanShoulder.distanceTo(leanHold);
  frame.worldToLocal(left.wrist.getWorldPosition(leanShoulder));
  const arm = (upper + leanHold.distanceTo(leanShoulder)) * 0.9;
  wheelHand(hip, wheel, 0, 1, leanHold);
  wheelHand(hip, wheel, 0, -1, leanShoulder);
  leanHold.add(leanShoulder).multiplyScalar(0.5);
  let lean = 0;
  for (; lean < WHEEL_LEAN; lean += LEAN_STEP) {
    const c = Math.cos(lean);
    const n = Math.sin(lean);
    leanTo.set(leanSpine.x + leanMid.x, leanSpine.y + leanMid.y * c - leanMid.z * n, leanSpine.z + leanMid.y * n + leanMid.z * c);
    if (leanTo.distanceTo(leanHold) <= arm) break;
  }
  return Math.min(lean, WHEEL_LEAN);
}
