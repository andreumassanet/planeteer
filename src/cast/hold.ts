import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { closeHand, type Knuckle } from './grip.ts';
import { aimArm, twoBone, type Limbs } from './limbs.ts';

/**
 * A hand as a grip needs it, measured in its wrist bone's own frame in the
 * bind pose: which way the fingers run (`along`, wrist to the middle
 * knuckle), which way the palm faces (`palm`, the side the fingers close
 * to), which way across the knuckles the little finger lies (`pinky`), where
 * a held bar's centre lies once the fingers are closed round it (`hold`, the
 * hollow in front of the knuckles), and the wrist's own turn in that pose
 * (`bind`).
 */
export interface HandFrame {
  along: THREE.Vector3;
  palm: THREE.Vector3;
  pinky: THREE.Vector3;
  hold: THREE.Vector3;
  /** Every finger's joints, the hand closed, which a held bar is kept out of. */
  closed: THREE.Vector3[];
  bind: THREE.Quaternion;
}

/**
 * Both hands' frames, the left first, off a rig standing in its bind pose
 * with its world matrices current; null for a hand the rig has no fingers
 * for. Where the hand holds is measured with the fingers closed
 * (`closeHand`): the middle of the circle the closed middle finger's three
 * joints lie on, the hollow a held bar passes through; the palm is the side
 * the fingers close to.
 */
export function handFramesOf(
  arms: Limbs['arms'],
  find: (name: string) => THREE.Bone | undefined,
  hands: readonly Knuckle[][],
): (HandFrame | null)[] {
  return (['L', 'R'] as const).map((side, i) => {
    const wrist = arms[i]!.wrist;
    const knuckles = hands[i];
    const bone = (name: string): THREE.Bone | undefined => find(`${name}.${side}`);
    const names = ['Middle2', 'Middle3', 'Middle4', 'Index2', 'Pinky2'];
    if (knuckles === undefined || knuckles.length === 0 || names.some((name) => bone(name) === undefined)) return null;
    const at = (name: string): THREE.Vector3 => wrist.worldToLocal(bone(name)!.getWorldPosition(new THREE.Vector3()));
    const knuckle = at('Middle2');
    const along = knuckle.clone().normalize();
    const across = at('Pinky2').sub(at('Index2'));
    const palm = new THREE.Vector3().crossVectors(along, across).normalize();
    // The closed middle finger's joints; the palm is the side they close to.
    const open = at('Middle4');
    const turns = knuckles.map((k) => k.bone.quaternion.clone());
    closeHand(knuckles);
    wrist.updateMatrixWorld(true);
    const closed = ['Middle2', 'Middle3', 'Middle4'].map(at);
    const joints4 = ['Index', 'Middle', 'Ring', 'Pinky'].flatMap((finger) => [2, 3, 4].map((n) => at(`${finger}${n}`)));
    knuckles.forEach((k, j) => k.bone.quaternion.copy(turns[j]!));
    wrist.updateMatrixWorld(true);
    if (closed[2]!.clone().sub(open).dot(palm) < 0) palm.negate();
    const pinky = across.addScaledVector(along, -across.dot(along)).normalize();
    const joints = closed.map((p) => [p.dot(along), p.dot(palm)] as const);
    const [u, v] = circumcentre(joints[0]!, joints[1]!, joints[2]!);
    const hold = along.clone().multiplyScalar(u).addScaledVector(palm, v);
    return { along, palm, pinky, hold, closed: joints4, bind: wrist.quaternion.clone() };
  });
}

/** The middle of the circle through three points in a plane. */
function circumcentre(a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]): [number, number] {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  if (Math.abs(d) < 1e-12) return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
  return [(a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d];
}

/**
 * A bar held in one hand, in the pose's frame: `at`, a point on its
 * centreline where the middle of the hand closes, and `pinky`, the bar's own
 * direction there, the way the little finger lies from the first.
 */
export interface Bar {
  at: THREE.Vector3;
  pinky: THREE.Vector3;
  /**
   * Which way the palm would rather face, square to the bar: the palm
   * against the bar from that side and the fingers round its other, the
   * side away from the one holding it.
   */
  facing: THREE.Vector3;
  /** A bar that is a ring, a wheel's rim: its middle, its axle and its radius, which the fingers are kept out of round its curve. */
  ring?: { centre: THREE.Vector3; axle: THREE.Vector3; radius: number };
}

/**
 * Half the section of what a hand closes round, radially: a wheel's rim
 * (`wheelPart` in `craft/cabin.ts`) and a handlebar's grip. Slim enough to
 * pass through the hollow of the cast's closed hand, whose finger joints are
 * kept clear of it.
 */
export const BAR_TUBE = 0.009 * AVATAR_HEIGHT;

/**
 * How far the bar may cross the palm aslant, radians off square to the
 * fingers: a held rim lies a little diagonally in a real hand. The wrist
 * bends aside only a little more (`WRIST_BEND`).
 */
export const BAR_SLANT = 0.35;
/**
 * How far the wrist may bend aside in the palm's own plane, radians, and
 * what a radian of it costs against a radian of slant.
 */
export const WRIST_BEND = 0.35;
const BEND_COST = 1.5;

/**
 * The search for the hand's turn round the bar: whole turns in `ROUND_STEP`
 * steps, the slant in `SLANT_STEP` steps and the wrist's bend in
 * `BEND_STEP` steps, then all three again at a fifth of the step round the
 * best.
 */
const ROUND_STEP = Math.PI / 12;
const SLANT_STEP = 0.15;
const BEND_STEP = 0.15;

/**
 * What a pose of the arm costs, against a radian of slant: a share of the
 * upper arm its length misses by, the elbow off `pole`, the elbow in
 * against the chest (inboard of a little outside its shoulder) or over the
 * shoulder, the palm turned off `Bar.facing`, and a finger joint in the bar.
 */
const MISS_COST = 12;
const POLE_COST = 0.6;
const CHEST_COST = 20;
const RAISED_COST = 4;
const FACING_COST = 3;
/** A finger joint inside `BAR_TUBE` of the bar's centreline, per share of it. */
const FINGER_COST = 20;
/** How far out of `BAR_TUBE` a finger joint, the middle of the finger, is kept. */
const FINGER_ROOM = 1.4;

/**
 * How much better a new grip must be than the one the hand already has
 * before it changes to it: held still at a wheel's lock, two grips about as
 * good took turns frame after frame as the body breathed under them.
 */
const REGRIP_COST = 0.6;
/** The grip each arm last took, on which frame's bar and where. */
const held = new WeakMap<object, { round: number; slant: number; bend: number; frame: THREE.Object3D; at: THREE.Vector3 }>();
/** How far the bar may move between two frames and the grip still be the hand's own, in `BAR_TUBE`s. */
const REGRIP_JUMP = 3;
/** What a radian of slant or bend away from the last frame's costs: the grip settles rather than twitching. */
const STEADY_COST = 1;
/** The grip the arm being solved last had, `round` NaN for none. */
const regrip = { round: NaN, slant: 0, bend: 0 };

/**
 * How much of the wrist's roll off its bind about the forearm's length the
 * forearm takes, so the skin round the wrist does not wring.
 */
const FOREARM_TWIST = 0.5;

const shoulder = new THREE.Vector3();
const elbow = new THREE.Vector3();
const wristAt = new THREE.Vector3();
const upper = new THREE.Vector3();
const lower = new THREE.Vector3();
const round1 = new THREE.Vector3();
const round2 = new THREE.Vector3();
const fingers = new THREE.Vector3();
const across = new THREE.Vector3();
const palmTo = new THREE.Vector3();
const side = new THREE.Vector3();
const wristTo = new THREE.Vector3();
const elbowTo = new THREE.Vector3();
const forearm = new THREE.Vector3();
const towards = new THREE.Vector3();
const bestForearm = new THREE.Vector3();
const offset = new THREE.Vector3();
const scale = new THREE.Vector3();
const own = new THREE.Matrix4();
const wanted = new THREE.Matrix4();
const handTurn = new THREE.Quaternion();
const bestTurn = new THREE.Quaternion();
const bestUpper = new THREE.Vector3();
const frameTurn = new THREE.Quaternion();
const parentTurn = new THREE.Quaternion();
const twist = new THREE.Quaternion();
const twistAxis = new THREE.Vector3();
const identity = new THREE.Quaternion();

/**
 * One arm to a bar, the hand closed round it and the wrist all but straight:
 * the hand's turn round the bar, its slant across the palm and the wrist's
 * small bend aside are searched for the one whose wrist, with the forearm on
 * from it, leaves an elbow an upper arm from the shoulder, towards `pole`
 * and off the chest, with the fingers out of the bar (the costs above); the
 * arm is laid along it, the forearm takes part of the wrist's roll, and the
 * fingers close. A hand with no frame is only reached to the bar with the
 * two-bone solve.
 */
export function gripBar(
  arm: Limbs['arms'][number],
  hand: HandFrame | null,
  knuckles: readonly Knuckle[] | undefined,
  frame: THREE.Object3D,
  bar: Bar,
  pole: THREE.Vector3,
): void {
  frame.updateMatrixWorld(true);
  frame.worldToLocal(arm.upper.getWorldPosition(shoulder));
  frame.worldToLocal(arm.lower.getWorldPosition(elbow));
  frame.worldToLocal(arm.wrist.getWorldPosition(wristAt));
  const first = shoulder.distanceTo(elbow);
  const second = elbow.distanceTo(wristAt);
  if (hand === null) {
    twoBone(shoulder, first, second, bar.at, pole, upper, lower);
    aimArm(arm, frame, upper, lower);
    return;
  }
  // The hand's own size in the frame's units, and two directions square to the bar.
  const k = arm.wrist.getWorldScale(scale).x / frame.getWorldScale(offset).x;
  round1.set(0, 1, 0).addScaledVector(bar.pinky, -bar.pinky.y);
  if (round1.lengthSq() < 1e-6) round1.set(0, 0, 1).addScaledVector(bar.pinky, -bar.pinky.z);
  round1.normalize();
  round2.crossVectors(bar.pinky, round1);
  const handed = Math.sign(side.crossVectors(hand.along, hand.pinky).dot(hand.palm)) || 1;
  const outboard = Math.sign(shoulder.x) || 1;
  towards.copy(pole).normalize();
  let best = Infinity;
  let bestRound = 0;
  let bestSlant = 0;
  let bestBend = 0;
  const tryPose = (round: number, slant: number, bend: number): void => {
    // The fingers square to the bar at `round`, then aslant along it.
    fingers.copy(round1).multiplyScalar(Math.cos(round)).addScaledVector(round2, Math.sin(round));
    across.copy(bar.pinky).multiplyScalar(Math.cos(slant)).addScaledVector(fingers, -Math.sin(slant));
    fingers.multiplyScalar(Math.cos(slant)).addScaledVector(bar.pinky, Math.sin(slant));
    palmTo.crossVectors(fingers, across).multiplyScalar(handed);
    own.makeBasis(hand.along, hand.palm, side.crossVectors(hand.along, hand.palm));
    wanted.makeBasis(fingers, palmTo, side.crossVectors(fingers, palmTo));
    handTurn.setFromRotationMatrix(wanted.multiply(own.transpose()));
    // The wrist where that turn puts the hollow on the bar, and the elbow a
    // forearm behind it, the forearm bent aside off the fingers by `bend`.
    wristTo.copy(hand.hold).multiplyScalar(k).applyQuaternion(handTurn);
    wristTo.subVectors(bar.at, wristTo);
    forearm.copy(fingers).multiplyScalar(Math.cos(bend)).addScaledVector(across, Math.sin(bend));
    elbowTo.copy(wristTo).addScaledVector(forearm, -second);
    const upperLength = elbowTo.distanceTo(shoulder);
    let cost = Math.abs(slant) + BEND_COST * Math.abs(bend) + (MISS_COST * Math.abs(upperLength - first)) / first;
    // Another turn round the bar than the hand already has is a regrip, and costs.
    if (regrip.round === regrip.round) {
      if (Math.abs(Math.atan2(Math.sin(round - regrip.round), Math.cos(round - regrip.round))) > ROUND_STEP) cost += REGRIP_COST;
      cost += STEADY_COST * (Math.abs(slant - regrip.slant) + Math.abs(bend - regrip.bend));
    }
    side.copy(elbowTo).sub(shoulder).divideScalar(Math.max(upperLength, 1e-6));
    cost += POLE_COST * (1 - side.dot(towards));
    cost += CHEST_COST * Math.max(0, (Math.abs(shoulder.x) * 1.15 - outboard * elbowTo.x) / first);
    cost += RAISED_COST * Math.max(0, (elbowTo.y - shoulder.y) / first);
    cost += (FACING_COST * (1 - palmTo.dot(bar.facing))) / 2;
    if (cost < best) {
      // Only a pose that could still win pays for its fingers' test.
      for (const joint of hand.closed) {
        side.copy(joint).multiplyScalar(k).applyQuaternion(handTurn).add(wristTo);
        let clear: number;
        if (bar.ring !== undefined) {
          side.sub(bar.ring.centre);
          const depth = side.dot(bar.ring.axle);
          clear = Math.hypot(depth, side.addScaledVector(bar.ring.axle, -depth).length() - bar.ring.radius);
        } else {
          side.sub(bar.at);
          clear = side.addScaledVector(bar.pinky, -side.dot(bar.pinky)).length();
        }
        cost += FINGER_COST * Math.max(0, 1 - clear / (BAR_TUBE * FINGER_ROOM));
      }
    }
    side.copy(elbowTo).sub(shoulder).divideScalar(Math.max(upperLength, 1e-6));
    if (cost < best) {
      best = cost;
      bestRound = round;
      bestSlant = slant;
      bestBend = bend;
      bestTurn.copy(handTurn);
      bestUpper.copy(side);
      bestForearm.copy(forearm);
    }
  };
  let last = held.get(arm);
  if (last !== undefined && (last.frame !== frame || last.at.distanceTo(bar.at) > REGRIP_JUMP * BAR_TUBE)) last = undefined;
  regrip.round = last === undefined ? NaN : last.round;
  regrip.slant = last?.slant ?? 0;
  regrip.bend = last?.bend ?? 0;
  for (let round = 0; round < Math.PI * 2; round += ROUND_STEP) {
    for (let slant = -BAR_SLANT; slant <= BAR_SLANT + 1e-6; slant += SLANT_STEP) {
      for (let bend = -WRIST_BEND; bend <= WRIST_BEND + 1e-6; bend += BEND_STEP) tryPose(round, slant, bend);
    }
  }
  const [r0, s0, b0] = [bestRound, bestSlant, bestBend];
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      for (let n = -2; n <= 2; n++) {
        const slant = s0 + (j * SLANT_STEP) / 5;
        const bend = b0 + (n * BEND_STEP) / 5;
        if (Math.abs(slant) <= BAR_SLANT + 1e-6 && Math.abs(bend) <= WRIST_BEND + 1e-6) tryPose(r0 + (i * ROUND_STEP) / 5, slant, bend);
      }
    }
  }
  const keep = held.get(arm) ?? { round: 0, slant: 0, bend: 0, frame, at: new THREE.Vector3() };
  keep.round = bestRound;
  keep.slant = bestSlant;
  keep.bend = bestBend;
  keep.frame = frame;
  keep.at.copy(bar.at);
  held.set(arm, keep);
  aimArm(arm, frame, bestUpper, bestForearm);
  // The wrist turned in the world to the hand's turn in the frame.
  frame.getWorldQuaternion(frameTurn);
  arm.wrist.parent!.getWorldQuaternion(parentTurn).invert();
  arm.wrist.quaternion.copy(parentTurn.multiply(frameTurn.multiply(bestTurn)));
  // Part of the wrist's roll about the forearm's length, off its bind, given to the forearm.
  twist.copy(arm.wrist.quaternion).multiply(handTurn.copy(hand.bind).invert());
  twistAxis.copy(arm.wrist.position).normalize();
  const along = twist.x * twistAxis.x + twist.y * twistAxis.y + twist.z * twistAxis.z;
  twist.set(twistAxis.x * along, twistAxis.y * along, twistAxis.z * along, twist.w);
  if (twist.lengthSq() > 1e-12) {
    twist.normalize();
    twist.slerpQuaternions(identity, twist, FOREARM_TWIST);
    arm.lower.quaternion.multiply(twist);
    arm.wrist.quaternion.premultiply(twist.invert());
  }
  arm.lower.updateMatrixWorld(true);
  if (knuckles !== undefined) closeHand(knuckles);
}
