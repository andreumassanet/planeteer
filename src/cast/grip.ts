import * as THREE from 'three';

/**
 * One joint of a finger, as a hand closed round a control needs it: the bone,
 * its turn in the bind pose, and the axis in its parent's frame that it
 * closes about, with how far.
 */
export interface Knuckle {
  bone: THREE.Bone;
  bind: THREE.Quaternion;
  axis: THREE.Vector3;
  angle: number;
}

/**
 * How far each joint of a finger closes round a bar, a rim or a pair of
 * reins, radians: the knuckle, the middle joint and the last. The rig's first
 * finger bone is the palm's own and stays.
 */
const FINGER_CLOSE = [0.85, 1.15, 0.65] as const;
/**
 * How much of that each finger closes: the shorter ones less, so all four
 * leave the same hollow round what the hand holds.
 */
const FINGER_SHARE = { Index: 1, Middle: 1, Ring: 0.92, Pinky: 0.8 } as const;
/** The thumb's two outer joints, across the palm and over the closed fingers. */
const THUMB_CLOSE = [0.4, 0.6] as const;
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'] as const;

/**
 * Both hands' knuckles, the left first, measured off the rig as it stands in
 * its bind pose with its world matrices current; a hand the rig has no
 * fingers for is empty. The palm's side is the one the thumb hangs on.
 */
export function handsOf(find: (name: string) => THREE.Bone | undefined): Knuckle[][] {
  return (['L', 'R'] as const).map((side) => handOf(find, side));
}

function handOf(find: (name: string) => THREE.Bone | undefined, side: 'L' | 'R'): Knuckle[] {
  const bone = (name: string): THREE.Bone | undefined => find(`${name}.${side}`);
  const at = (name: string): THREE.Vector3 => bone(name)!.getWorldPosition(new THREE.Vector3());
  const needed = [...FINGERS.flatMap((f) => [2, 3, 4].map((k) => `${f}${k}`)), 'Thumb2', 'Thumb3'];
  if (needed.some((name) => bone(name) === undefined)) return [];
  const along = at('Middle3').sub(at('Middle2')).normalize();
  const across = at('Pinky2').sub(at('Index2'));
  const palm = new THREE.Vector3().crossVectors(along, across).normalize();
  if (at('Thumb3').sub(at('Middle2')).dot(palm) < 0) palm.negate();
  const out: Knuckle[] = [];
  for (const finger of FINGERS) {
    // Turning a finger about `finger x palm` swings it towards the palm.
    const axis = at(`${finger}3`).sub(at(`${finger}2`)).normalize().cross(palm).normalize();
    FINGER_CLOSE.forEach((angle, k) => out.push(knuckle(bone(`${finger}${k + 2}`)!, axis, angle * FINGER_SHARE[finger])));
  }
  // The thumb swings towards the middle finger's knuckle, across the palm.
  const thumb = at('Thumb3').sub(at('Thumb2')).normalize();
  const axis = thumb.cross(at('Middle2').sub(at('Thumb2'))).normalize();
  THUMB_CLOSE.forEach((angle, k) => out.push(knuckle(bone(`Thumb${k + 2}`)!, axis, angle)));
  return out;
}

const parentTurn = new THREE.Quaternion();

/** A joint closing about `axis`, a world direction in the bind pose, written in its parent's frame. */
function knuckle(bone: THREE.Bone, axis: THREE.Vector3, angle: number): Knuckle {
  bone.parent!.getWorldQuaternion(parentTurn).invert();
  return { bone, bind: bone.quaternion.clone(), axis: axis.clone().applyQuaternion(parentTurn).normalize(), angle };
}

/** Closes a hand round whatever it holds, from its bind pose, so it can be laid on every frame. Allocates nothing. */
export function closeHand(hand: readonly Knuckle[]): void {
  for (const k of hand) k.bone.quaternion.setFromAxisAngle(k.axis, k.angle).multiply(k.bind);
}
