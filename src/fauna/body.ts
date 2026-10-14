/**
 * One parametric quadruped, its rig, and the poses it stands in. Every species
 * is this body plan with different numbers; everything in a `Shape` is in
 * metres and `m()` converts on the way in.
 */
import * as THREE from 'three';
import {
  GAITS,
  LEG_ORDER,
  legAt,
  m,
  solveLeg,
} from './contract.ts';
import type { AnimalShape as Shape, FaunaContext, Fold, GaitName, Leg } from './contract.ts';

export type { Shape };

/** How the animal is standing, this build. */
export type Pose =
  | { kind: 'stand' }
  | { kind: 'alert' }
  | { kind: 'graze' }
  | { kind: 'walk'; gait: GaitName; phase: number };

/**
 * Rest angles of the two kinds of leg. A fore limb is a near-vertical column
 * (lower segment at about +0.13 rad) and needs `swingLift`'s gate. A hind limb
 * stands as a `Z` (lower segment at about -0.38 rad), and its rest fold (0.60)
 * exceeds anything its swing (0.30) can undo, so per `foldLifts` the hock lifts
 * at every phase without a gate. `pnpm fauna` sweeps and asserts this.
 */
const REST = {
  fore: { upper: 0.08, fold: 0.05, kind: 'knee' as Fold, split: 0.52 },
  hind: { upper: 0.22, fold: 0.60, kind: 'hock' as Fold, split: 0.48 },
} as const;

/** The four legs of one shape solved onto the ground, in `LEG_ORDER`, offset by the gait. */
export function legsOf(shape: Shape, gait: GaitName): Leg[] {
  const withers = m(shape.withers);
  const croup = m(shape.croup);
  const half = m(shape.bodyLength) / 2;
  const spread = m(shape.barrelWidth) * 0.36;
  const offsets = GAITS[gait];
  return LEG_ORDER.map((name, index) => {
    const isFore = name.endsWith('fore');
    const rest = isFore ? REST.fore : REST.hind;
    const attach = isFore ? withers : croup;
    const [upperLength, lowerLength] = solveLeg(attach, 0, rest.upper, rest.fold, rest.kind, rest.split);
    return {
      attach,
      z: isFore ? half : -half,
      x: name.startsWith('left') ? spread : -spread,
      upperLength,
      lowerLength,
      upperRadius: m(shape.legThick),
      lowerRadius: m(shape.cannonThick),
      hoof: 0,
      restUpper: rest.upper,
      restFold: rest.fold,
      swing: isFore ? shape.foreSwing : shape.hindSwing,
      lift: isFore ? shape.foreLift : shape.hindLift,
      kind: rest.kind,
      offset: offsets[index]!,
    };
  });
}

/**
 * How far a hoof travels fore and aft over one cycle, in world units. Measured
 * off the rig: a mover's phase is `speed * clock / stride`, so a stride that
 * disagreed with the geometry would skate.
 */
export function strideOf(shape: Shape, gait: GaitName): number {
  const leg = legsOf(shape, gait)[1]!; // a fore leg; both pairs travel the same
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < 96; i++) {
    const { footZ } = legAt(leg, i / 96);
    if (footZ < low) low = footZ;
    if (footZ > high) high = footZ;
  }
  return high - low;
}

interface Joint {
  group: THREE.Group;
  lower: THREE.Group;
  leg: Leg;
}

/** A built animal, plus what a walker needs to re-pose it. */
export interface Body {
  group: THREE.Group;
  root: THREE.Group;
  joints: Joint[];
  neck: THREE.Group;
  /** The skull's own group, at the far end of the neck. Its +Z is the muzzle. */
  head: THREE.Group;
  /** How far ahead of the head's origin the nose reaches. */
  noseReach: number;
  /** How much the shape wanted for one cycle. */
  stride: number;
}

/**
 * Builds one animal. The group faces +Z, stands on `y = 0`, is centred in x
 * and z with an identity root transform, and takes materials only from
 * `ctx.toon`.
 */
export function buildAnimal(ctx: FaunaContext, given: Shape, pose: Pose): Body {
  const gait: GaitName = pose.kind === 'walk' ? pose.gait : 'walk';

  // A cow cannot reach the grass by bending her neck alone, so a grazing
  // animal lowers its withers (the croup stays): the fore legs re-solve
  // shorter and the spine pitches forward. Capped at 18%, past which the front
  // legs read as short rather than bent.
  let crouch = 0;
  if (pose.kind === 'graze') {
    const reachDown = given.neckLength + given.headLength * 1.1 * Math.sin(DROOP);
    const base = given.withers - given.barrelDepth * 0.22;
    crouch = Math.min(given.withers * 0.18, Math.max(0, base - reachDown - given.withers * GRASS));
  }
  const shape: Shape = crouch > 0 ? { ...given, withers: given.withers - crouch } : given;
  const legs = legsOf(shape, gait);

  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);

  const frame: Frame = {
    withers: m(shape.withers),
    croup: m(shape.croup),
    bodyLength: m(shape.bodyLength),
    depth: m(shape.barrelDepth) * (1 + shape.fleece * 0.10),
    width: m(shape.barrelWidth) * (1 + shape.fleece * 0.14),
  };

  addBarrel(ctx, root, shape, frame);
  const { neck, head, noseReach, neckThick } = addNeckAndHead(ctx, root, shape, frame, pose);
  addTail(ctx, root, shape, frame, neckThick);
  const joints = addLegs(ctx, root, shape, legs);

  const body: Body = { group, root, joints, neck, head, noseReach, stride: strideOf(shape, gait) };
  poseBody(body, pose);

  // Centre in z once, here: the head reaches further forward than the tail
  // back, and a herd spaces its members by `size[0]`. Re-centring per phase in
  // `poseBody` would slide a walker as its legs swing.
  poseBox.setFromObject(root);
  root.position.z = -(poseBox.min.z + poseBox.max.z) / 2;
  return body;
}

/** Height of the muzzle over the ground a grazing animal aims for, as a share of its withers. */
const GRASS = 0.10;
/** How far a grazing head points below horizontal, radians. */
const DROOP = 1.25;

/** The frame's measurements in world units, fleece included. */
interface Frame {
  withers: number;
  croup: number;
  bodyLength: number;
  depth: number;
  width: number;
}

/**
 * The barrel, belly, fleece and hump. The back line runs from the withers to
 * the croup, so a hip higher than the shoulder slopes the whole frame.
 */
function addBarrel(ctx: FaunaContext, root: THREE.Group, shape: Shape, f: Frame): void {
  const { withers, croup, bodyLength, depth, width } = f;
  const axisY = (withers + croup) / 2 - depth / 2;
  const frame = new THREE.Group();
  frame.position.y = axisY;
  const spine = Math.atan2(withers - croup, bodyLength);
  frame.rotation.x = -spine;
  root.add(frame);

  const rumpWidth = width / Math.max(0.6, shape.chestFore);
  const chestWidth = width * shape.chestFore;
  frame.add(ctx.barrel(bodyLength, rumpWidth / 2, chestWidth / 2, depth / width, shape.coat, 6));
  // A paler, shallower belly gives the side elevation two bands.
  const belly = ctx.barrel(bodyLength * 0.86, rumpWidth * 0.36, chestWidth * 0.40, 0.42, shape.under, 4);
  belly.position.y = -depth * 0.36;
  frame.add(belly);

  if (shape.fleece > 0.01) {
    // A second, shorter, offset mass reads as wool.
    const wool = ctx.barrel(bodyLength * 0.78, rumpWidth * 0.60, chestWidth * 0.54, 1.05, shape.coat, 6);
    wool.position.set(0, depth * 0.14 * shape.fleece, -bodyLength * 0.04);
    frame.add(wool);
  }

  if (shape.hump > 0.01) {
    const humpHeight = m(shape.hump);
    const hump = ctx.barrel(bodyLength * 0.34, width * 0.20, width * 0.16, humpHeight / (width * 0.36), shape.coat, 5);
    hump.position.set(0, depth / 2 + humpHeight * 0.28, bodyLength * (0.5 - shape.humpAt));
    frame.add(hump);
  }
}

/** The neck as a joint off the front of the barrel, the mane, and the head on it. */
function addNeckAndHead(
  ctx: FaunaContext, root: THREE.Group, shape: Shape, f: Frame, pose: Pose,
): { neck: THREE.Group; head: THREE.Group; noseReach: number; neckThick: number } {
  const { withers, bodyLength, depth } = f;
  const neck = new THREE.Group();
  neck.position.set(0, withers - depth * 0.22, bodyLength / 2 - m(0.02));
  root.add(neck);

  const neckLength = m(shape.neckLength);
  const neckThick = m(shape.neckThick);
  const headLength = m(shape.headLength);
  const headDepth = m(shape.headDepth);
  const headWidth = m(shape.headWidth);
  // `hang` points -Y; a rotation `t` about X sends it to (0, -cos t, -sin t).
  // Pointing forward and lifted by `rise`, (0, sin rise, cos rise), gives
  // t = -PI/2 - rise. Grazing solves the rise so the muzzle reaches the grass,
  // clamped because `asin` of an impossible reach is NaN.
  const noseReach = headLength * 1.1;
  let rise = poseNeck(pose, shape);
  if (pose.kind === 'graze') {
    const want = (withers * GRASS - (withers - depth * 0.22) + noseReach * Math.sin(DROOP)) / neckLength;
    rise = Math.asin(Math.max(-1, Math.min(1, want)));
  }
  const neckAngle = -(Math.PI / 2) - rise;
  neck.rotation.x = neckAngle;
  neck.add(ctx.hang(neckLength, neckThick, neckThick * 0.78, shape.coat, 4));

  if (shape.mane > 0.01) {
    // The neck's rotation sends its local +Z to world up, so the crest goes on +Z.
    const maneHeight = m(shape.mane);
    const crest = ctx.barrel(neckLength * 0.86, neckThick * 0.22, neckThick * 0.16, maneHeight / (neckThick * 0.22), shape.point, 4);
    crest.rotation.x = Math.PI / 2;
    crest.position.set(0, -neckLength * 0.5, neckThick * 0.62);
    neck.add(crest);
  }

  const head = new THREE.Group();
  head.position.y = -neckLength;
  // The head's world angle is `neckAngle + this`: `-neckAngle` cancels the
  // neck and leaves the droop. R_x(t) sends +Z to (0, -sin t, cos t), so
  // positive points the muzzle down.
  head.rotation.x = -neckAngle + (pose.kind === 'graze' ? DROOP : poseHead(pose));
  neck.add(head);

  // Skull and muzzle as one tapering mesh along +Z, so they are not coplanar.
  const skull = ctx.barrel(headLength, headWidth / 2, (headWidth * shape.muzzle) / 2, headDepth / headWidth, shape.face, 5);
  skull.position.z = headLength / 2;
  head.add(skull);
  // The nose: the one dark mark on the head.
  const nose = ctx.barrel(headLength * 0.16, (headWidth * shape.muzzle) / 2, (headWidth * shape.muzzle) / 2.3, (headDepth * 0.8) / headWidth, shape.point, 4);
  nose.position.z = headLength * 1.02;
  head.add(nose);

  if (shape.ear > 0.01) {
    const earLength = m(shape.ear);
    for (const side of [1, -1]) {
      const ear = ctx.hang(earLength, earLength * 0.26, earLength * 0.08, shape.face, 3);
      const holder = new THREE.Group();
      holder.position.set((side * headWidth) / 2.4, headDepth * 0.3, headLength * 0.24);
      holder.rotation.set(-0.5, 0, side * shape.earFlare);
      holder.add(ear);
      head.add(holder);
    }
  }

  if (shape.horns !== 'none') addHorns(ctx, head, shape, headWidth, headDepth, headLength);
  return { neck, head, noseReach, neckThick };
}

function addTail(ctx: FaunaContext, root: THREE.Group, shape: Shape, f: Frame, neckThick: number): void {
  if (shape.tail <= 0.01) return;
  const tailLength = m(shape.tail);
  const tail = new THREE.Group();
  tail.position.set(0, f.croup - f.depth * 0.10, -f.bodyLength / 2);
  // Down and back rather than dead vertical.
  tail.rotation.x = -0.34;
  root.add(tail);
  const thickness = neckThick * 0.20;
  tail.add(ctx.hang(tailLength, thickness, thickness * 0.6, shape.coat, 3));
  if (shape.tailTuft > 0.01) {
    const tuft = ctx.hang(m(shape.tailTuft), thickness * 1.9, thickness * 0.5, shape.point, 3);
    tuft.position.y = -tailLength;
    tail.add(tuft);
  }
}

function addLegs(ctx: FaunaContext, root: THREE.Group, shape: Shape, legs: Leg[]): Joint[] {
  return legs.map((leg) => {
    const hip = new THREE.Group();
    hip.position.set(leg.x, leg.attach, leg.z);
    root.add(hip);
    hip.add(ctx.hang(leg.upperLength, leg.upperRadius, leg.upperRadius * 0.72, shape.coat, 3));

    const lower = new THREE.Group();
    lower.position.y = -leg.upperLength;
    hip.add(lower);
    // The cannon reaches the ground with no separate hoof: its bottom face is
    // narrow enough that the swing digs only a fraction of the pen, which the
    // re-seat absorbs (`pnpm fauna` measures it).
    lower.add(ctx.hang(leg.lowerLength, leg.lowerRadius, leg.lowerRadius * 0.85, shape.face, 3));
    return { group: hip, lower, leg };
  });
}

/** Neck rise for a pose, radians above horizontal. `graze` is solved in `addNeckAndHead`. */
function poseNeck(pose: Pose, shape: Shape): number {
  if (pose.kind === 'alert') return Math.min(1.45, shape.neckRise + 0.42);
  return shape.neckRise;
}

/** How far the muzzle points below horizontal, past the neck. Positive is down. */
function poseHead(pose: Pose): number {
  if (pose.kind === 'alert') return -0.10;
  return 0.16;
}

const poseBox = new THREE.Box3();

/**
 * Sets the four legs to a pose and re-seats the animal on its lowest point,
 * which is where the bob comes from (as in `poseAt` in `life.ts`). Returns how
 * far the lowest point ended up below the floor: zero by construction.
 */
export function poseBody(body: Body, pose: Pose): number {
  for (const joint of body.joints) {
    if (pose.kind === 'walk') {
      const at = legAt(joint.leg, pose.phase);
      joint.group.rotation.x = at.upper;
      joint.lower.rotation.x = joint.leg.kind === 'knee' ? at.fold : -at.fold;
    } else {
      joint.group.rotation.x = joint.leg.restUpper;
      joint.lower.rotation.x = joint.leg.kind === 'knee' ? joint.leg.restFold : -joint.leg.restFold;
    }
  }
  // A grazing animal steps its fore feet forward; the crouch in `buildAnimal`
  // sets the shoulder height.
  if (pose.kind === 'graze') {
    for (const joint of body.joints) {
      if (joint.leg.kind !== 'knee') continue;
      joint.group.rotation.x -= 0.14;
    }
  }
  body.root.position.y = 0;
  poseBox.setFromObject(body.root);
  body.root.position.y = -poseBox.min.y;
  poseBox.setFromObject(body.root);
  return poseBox.min.y;
}

/**
 * Where every hoof is, in the animal's own frame, after a pose. Reads the built
 * rig rather than re-running `legAt`, so the sweep measures what is drawn.
 */
export function hooves(body: Body): THREE.Vector3[] {
  body.root.updateMatrixWorld(true);
  return body.joints.map((joint) => {
    const point = new THREE.Vector3(0, -joint.leg.lowerLength, 0);
    joint.lower.updateMatrixWorld(true);
    return point.applyMatrix4(joint.lower.matrixWorld);
  });
}

function addHorns(
  ctx: FaunaContext, head: THREE.Group, shape: Shape,
  headWidth: number, headDepth: number, headLength: number,
): void {
  const size = m(shape.hornSize);
  const base = headLength * 0.16;
  for (const side of [1, -1]) {
    const holder = new THREE.Group();
    holder.position.set((side * headWidth) / 3, headDepth * 0.42, base);
    head.add(holder);
    if (shape.horns === 'cow') {
      // `hang` points -Y, so a Z rotation `t` sends it to (sin t, -cos t, 0);
      // past PI/2 it lifts: at 1.99 it is 0.91 out and 0.41 up.
      holder.rotation.set(-0.2, 0, side * 1.99);
      holder.add(ctx.hang(size, size * 0.20, size * 0.09, shape.point, 3));
      const tip = new THREE.Group();
      tip.position.y = -size;
      // Further round the same way (2.44 rad in all), so the horn curves up.
      tip.rotation.z = side * 0.45;
      tip.add(ctx.hang(size * 0.55, size * 0.10, size * 0.04, shape.point, 3));
      holder.add(tip);
    } else if (shape.horns === 'curl') {
      // A ram's, curling back and down past the ear in three segments.
      holder.rotation.set(-1.9, 0, side * 0.5);
      let node: THREE.Object3D = holder;
      for (let i = 0; i < 3; i++) {
        const segment = ctx.hang(size * 0.5, size * (0.22 - i * 0.04), size * (0.18 - i * 0.04), shape.point, 3);
        const next = new THREE.Group();
        next.position.y = i === 0 ? 0 : -size * 0.5;
        next.rotation.x = i === 0 ? 0 : 0.95;
        next.add(segment);
        node.add(next);
        node = next;
      }
    } else {
      // Euler order XYZ applies the Z splay first: Rz(0.5) then Rx(2.35) takes
      // the hanging beam to (0.48, 0.62, -0.62), out, up and back.
      holder.rotation.set(2.35, 0, side * 0.5);
      holder.add(ctx.hang(size, size * 0.11, size * 0.06, shape.point, 3));
      const brow = new THREE.Group();
      brow.position.y = -size * 0.34;
      brow.rotation.set(-1.1, 0, side * 0.3);
      brow.add(ctx.hang(size * 0.42, size * 0.07, size * 0.03, shape.point, 3));
      holder.add(brow);
    }
  }
}
