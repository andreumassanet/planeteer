/**
 * One parametric quadruped, its rig, and the four poses it stands in.
 *
 * **Six animals are one body plan with different numbers in it**, which is the
 * shape `src/scenery/people.ts` already found for twenty-four villagers, and it
 * is more true here than it was there: a camel and a sheep differ in
 * proportion, in horn and in coat and in nothing else structural. So the part
 * files in `parts/` are proportion tables and this is the only file in the kit
 * that builds a body.
 *
 * Everything in a `Shape` is in **metres**. `m()` from the contract converts
 * once, on the way in — see the note there for why this kit authors in metres
 * where the traffic kit refuses to.
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
 * The rest angles of the two kinds of leg, and **the whole quadruped result is
 * in the second row of this table**.
 *
 * A fore limb is a near-vertical column: it stands with a hair of backward rake
 * and an almost straight carpus, so its lower segment sits at about +0.13 rad.
 * A hind limb is a `Z` standing still — the tibia rakes back, the hock points
 * back, the cannon comes forward under the hip — so its lower segment sits at
 * **-0.38 rad, well clear of vertical on the other side.**
 *
 * `foldLifts` in the contract says a fold lifts the foot only while it is taking
 * the lower segment *away* from vertical. So:
 *
 * ```
 *                   rest lower   sign needed   swing takes lower to    gate
 *   fore (knee)        +0.13        > 0          +0.13 .. +0.43        needed
 *   hind (hock)        -0.38        < 0          -0.38 .. -0.08        free
 * ```
 *
 * The fore leg is the biped's problem exactly and it takes the biped's answer,
 * `swingLift`, which is zero everywhere the sign could go wrong. **The hind leg
 * never leaves its own half-plane**, because its rest fold (0.60) is larger than
 * anything the swing (0.30) can subtract from it — so the hock has no gate at
 * all, and the reason is a fact about the animal rather than a decision about
 * the rig. `pnpm fauna` sweeps every phase of every animal and asserts it.
 */
const REST = {
  fore: { upper: 0.08, fold: 0.05, kind: 'knee' as Fold, split: 0.52 },
  hind: { upper: 0.22, fold: 0.60, kind: 'hock' as Fold, split: 0.48 },
} as const;

/**
 * The four legs of one shape, solved onto the ground.
 *
 * `offset` comes from the gait and the order is `LEG_ORDER`: left hind, left
 * fore, right hind, right fore.
 */
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
 * How far a hoof travels fore and aft over one cycle, in world units.
 *
 * **The stride is measured off the rig rather than declared**, which is the one
 * thing that keeps a walker's feet from skating: a mover's phase is
 * `speed * clock / stride`, so a stride that disagrees with the geometry is a
 * moonwalk in exact proportion to how far off it is. `roads.ts` and the bake
 * share `courseOf` for the same reason.
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
 * Builds one animal.
 *
 * The `Group` follows the kit conventions: faces **+Z**, stands on `y = 0`,
 * centred in x and z, identity transform on the root, materials only from
 * `ctx.toon`.
 */
export function buildAnimal(ctx: FaunaContext, given: Shape, pose: Pose): Body {
  const gait: GaitName = pose.kind === 'walk' ? pose.gait : 'walk';

  // **A grazing animal is a shape with a lower shoulder, and that is arithmetic
  // rather than styling.** Measured on the built rig: a cow's neck base stands
  // at 1.18 m and her neck and head together reach 1.01 m below it, so she is
  // 0.17 m short of the grass and *cannot* graze by bending her neck — which is
  // exactly why a real cow drops her chest and steps her forelegs apart. The
  // first version rotated the neck and nothing else, and the check caught it as
  // a nose *higher* grazing than standing.
  //
  // Lowering the withers and leaving the croup alone is the whole of it: the
  // fore legs re-solve shorter through `solveLeg`, the spine picks up the
  // forward pitch for free because the barrel already runs withers to croup,
  // and the neck base comes down with it. The cap is 18% — past that the front
  // legs read as shorter than the back ones rather than as bent.
  const GRASS = 0.10;
  const DROOP = 1.25;
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

  const withers = m(shape.withers);
  const croup = m(shape.croup);
  const bodyLength = m(shape.bodyLength);
  const depth = m(shape.barrelDepth) * (1 + shape.fleece * 0.10);
  const width = m(shape.barrelWidth) * (1 + shape.fleece * 0.14);

  // --- the barrel -------------------------------------------------------
  //
  // The back line runs from the withers to the croup, so an animal whose hip is
  // higher than its shoulder slopes, which is most of what tells a camel from a
  // horse in silhouette. The barrel's axis is the mid-line between the back and
  // the belly, and it is built along +Z from the rump forward.
  const backFore = withers;
  const backAft = croup;
  const axisY = (backFore + backAft) / 2 - depth / 2;
  const frame = new THREE.Group();
  frame.position.y = axisY;
  // The pitch of the spine. A hip 0.3 higher than a shoulder over a 1.5 m body
  // is 11 degrees, which reads.
  const spine = Math.atan2(backFore - backAft, bodyLength);
  frame.rotation.x = -spine;
  root.add(frame);

  const rumpWidth = width / Math.max(0.6, shape.chestFore);
  const chestWidth = width * shape.chestFore;
  frame.add(ctx.barrel(bodyLength, rumpWidth / 2, chestWidth / 2, depth / width, shape.coat, 6));
  // The belly, a shallower mass under the barrel in the pale colour. It is what
  // gives the side elevation two bands instead of one, and at 30 px two bands
  // is the whole read.
  const belly = ctx.barrel(bodyLength * 0.86, rumpWidth * 0.36, chestWidth * 0.40, 0.42, shape.under, 4);
  belly.position.y = -depth * 0.36;
  frame.add(belly);

  if (shape.fleece > 0.01) {
    // A second, shorter, offset mass. Not a detail: a smooth prism reads as an
    // animal shaved, and one lump over it reads as wool for 24 triangles.
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

  // --- the neck and the head -------------------------------------------
  //
  // The neck hangs off the front of the barrel and carries the head, and the
  // whole of `graze` is one rotation on this group. Building it as a joint
  // rather than as a fixed mass is what lets one shape stand both ways.
  const neck = new THREE.Group();
  neck.position.set(0, withers - depth * 0.22, bodyLength / 2 - m(0.02));
  root.add(neck);

  const neckLength = m(shape.neckLength);
  const neckThick = m(shape.neckThick);
  const headLength = m(shape.headLength);
  const headDepth = m(shape.headDepth);
  const headWidth = m(shape.headWidth);
  // **`hang` builds down from the origin, so the neck's angle is derived and not
  // guessed, and the guess was wrong by ninety degrees.** A hanging segment
  // points -Y; rotating it by `t` about X sends it to `(0, -cos t, -sin t)`, and
  // the direction wanted is `(0, sin rise, cos rise)` — forward, lifted by the
  // rise. Solving both components gives `t = -PI/2 - rise`, which is horizontal
  // at rise 0 and straight up at rise PI/2. The first version wrote `PI - rise`,
  // which reads plausibly and puts the neck **vertical and leaning backwards**:
  // measured, it made a 1.36 m cow 1.90 m tall and gave her a giraffe's neck.
  // Nothing in `validateAnimal` could catch it, because a vertical neck is
  // inside every cap in the table.
  //
  // For `graze` the rise is not a constant either: it is solved so the muzzle
  // lands on the grass, given whatever neck and head this species has and
  // whatever the crouch above has already bought. Clamped, because `asin` of an
  // impossible reach is `NaN` and a `NaN` rotation black-holes the whole mesh.
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
    // A crest, on the neck's own -Y (which the rotation has sent to the top).
    const maneHeight = m(shape.mane);
    const crest = ctx.barrel(neckLength * 0.86, neckThick * 0.22, neckThick * 0.16, maneHeight / (neckThick * 0.22), shape.point, 4);
    // The neck's local +Z is what its own rotation sends to world up, so the
    // crest goes on +Z. On -Z it is a dewlap, which is a different animal.
    crest.rotation.x = Math.PI / 2;
    crest.position.set(0, -neckLength * 0.5, neckThick * 0.62);
    neck.add(crest);
  }

  const head = new THREE.Group();
  head.position.y = -neckLength;
  // Undo the neck's own angle and then drop the muzzle: a head is level with
  // the world on an alert animal and points at the ground on a grazing one,
  // and neither is the angle its neck happens to be at.
  // **Composed, not applied: the head's world angle is `neckAngle + this`, so
  // `-neckAngle` cancels the neck and what is left is the droop alone.** The
  // droop's sign was inverted for one round and nothing could see it — `R_x(t)`
  // sends +Z to `(0, -sin t, cos t)`, so a *positive* rotation points the muzzle
  // down, and the first version's negative one pointed every animal's nose at
  // the sky. It measured as a grazing cow whose nose was 0.8 units **higher**
  // than a standing one.
  head.rotation.x = -neckAngle + (pose.kind === 'graze' ? DROOP : poseHead(pose));
  neck.add(head);

  // Built along +Z out of the neck, tapering to the muzzle. One mesh does the
  // skull and the muzzle; two would be the coplanar trap waiting to happen.
  const skull = ctx.barrel(headLength, headWidth / 2, (headWidth * shape.muzzle) / 2, headDepth / headWidth, shape.face, 5);
  skull.position.z = headLength / 2;
  head.add(skull);
  // The nose. The one dark mark on the head, and at 15 px it is the difference
  // between a head and a lump.
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

  // --- the tail ---------------------------------------------------------
  if (shape.tail > 0.01) {
    const tailLength = m(shape.tail);
    const tail = new THREE.Group();
    tail.position.set(0, backAft - depth * 0.10, -bodyLength / 2);
    // Down and back. A tail hanging dead vertical is a rope.
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

  // --- the legs ---------------------------------------------------------
  const joints: Joint[] = legs.map((leg) => {
    const hip = new THREE.Group();
    hip.position.set(leg.x, leg.attach, leg.z);
    root.add(hip);
    hip.add(ctx.hang(leg.upperLength, leg.upperRadius, leg.upperRadius * 0.72, shape.coat, 3));

    const lower = new THREE.Group();
    lower.position.y = -leg.upperLength;
    hip.add(lower);
    // The cannon reaches the ground and there is no separate hoof, which is a
    // measurement rather than thrift. `avatar.ts` needed an ankle because a
    // rigid boot's sole reaches 0.64 ahead of its pivot and swings 0.42 units
    // under the floor at a run; a cannon's bottom face reaches `cannonThick`,
    // about 0.15 units, so the same swing digs 0.044 — a fifth of the pen, and
    // absorbed by the re-seat. The sweep in `pnpm fauna` measures it.
    lower.add(ctx.hang(leg.lowerLength, leg.lowerRadius, leg.lowerRadius * 0.85, shape.face, 3));
    return { group: hip, lower, leg };
  });

  const body: Body = { group, root, joints, neck, head, noseReach, stride: strideOf(shape, gait) };
  poseBody(body, pose);

  // **Centred in z once, at build time, and never again.** The kit's convention
  // is that a part is centred on its own origin, and a quadruped is not: the
  // head and neck reach 2.5 units forward of the barrel and the tail only 1.0
  // back, so an uncentred cow's origin sits 1.2 units behind her middle and a
  // herd that spaces its members off `size[0]` overlaps at one end and gaps at
  // the other. Doing it here rather than in `poseBody` matters — the legs travel
  // fore and aft over the cycle, so re-centring per phase would slide a walker
  // backwards along its own route by a fraction of a stride a frame.
  poseBox.setFromObject(root);
  root.position.z = -(poseBox.min.z + poseBox.max.z) / 2;
  return body;
}

/**
 * Neck rise for a pose, in radians above horizontal. `graze` is absent because
 * it is solved rather than tabulated — see `buildAnimal`.
 */
function poseNeck(pose: Pose, shape: Shape): number {
  if (pose.kind === 'alert') return Math.min(1.45, shape.neckRise + 0.42);
  return shape.neckRise;
}

/**
 * How far the muzzle points below horizontal, past whatever the neck is doing.
 * **Positive is down** — see the note where it is used.
 */
function poseHead(pose: Pose): number {
  if (pose.kind === 'alert') return -0.10;
  return 0.16;
}

const poseBox = new THREE.Box3();

/**
 * Sets the four legs to a pose and re-seats the animal on its own lowest point.
 *
 * **The re-seat is where the bob comes from**, exactly as it is for the crowd:
 * `poseAt` in `life.ts` records that the hips rise and fall by precisely what
 * keeps the planted foot on the ground, with no separate bob term to get out of
 * step. It is a smaller motion here and that is correct — a walking cow's back
 * is famously level, because with four legs at quarter offsets there are three
 * feet down at every instant and the lowest of them barely moves.
 *
 * Returns how far the lowest point ended up below the floor. Zero by
 * construction, checked rather than assumed.
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
  // A grazing animal steps its fore feet forward. The *height* of the shoulder
  // is the crouch's job in `buildAnimal`; this is only the stance.
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
 * Where every hoof is, in the animal's own frame, after a pose.
 *
 * Used by the sweep and by nothing else. It reads the *built* rig rather than
 * re-running `legAt`, so what it measures is the thing on the screen and not a
 * second copy of the arithmetic — which is the whole reason `pnpm check`
 * samples `elevationAt` under a monument instead of re-deriving its pad.
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
      // **Out and up, and the first version said so and went out and down.**
      // `hang` points -Y, so a Z rotation of `t` sends it to
      // `(sin t, -cos t, 0)`: the *height* is `-cos t`, which is negative for
      // any `t` under a right angle. At 1.15 rad a cow's horns hung outward and
      // 24 degrees below the ear, where they are hidden by her own skull at
      // every distance — it rendered as a hornless head and read as a mistake in
      // the model rather than in one number. Past `PI/2` the same expression
      // lifts: at 1.99 it is 0.91 out and 0.41 up.
      holder.rotation.set(-0.2, 0, side * 1.99);
      holder.add(ctx.hang(size, size * 0.20, size * 0.09, shape.point, 3));
      const tip = new THREE.Group();
      tip.position.y = -size;
      // Further round the same way, so the horn curves up rather than kinking
      // back down. Composed with the holder's own 1.99 this is 2.44 rad: 0.65
      // out and 0.76 up.
      tip.rotation.z = side * 0.45;
      tip.add(ctx.hang(size * 0.55, size * 0.10, size * 0.04, shape.point, 3));
      holder.add(tip);
    } else if (shape.horns === 'curl') {
      // A ram's, curling back and down past the ear. Three short segments turn
      // it into a curl; two read as a bent stick.
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
      // **Antlers sweep up and back, and the same sign error put them forward
      // and down.** Euler order is XYZ, so the Z splay is applied first and the
      // X sweep second: `Rz(0.5)` takes the hanging beam to `(0.48, -0.88, 0)`
      // and `Rx(2.35)` takes that to `(0.48, 0.62, -0.62)` — out, up and back,
      // which is an antler. `Rx(-0.9)` gave `(0.48, -0.55, 0.68)`: forward and
      // into the ground.
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
