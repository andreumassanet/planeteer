import type { Group, SceneryContext } from '../contract.ts';
import { BODY } from './figure.ts';
import type { Look } from './look.ts';
import { POSES, SEATED_POSES, solveLimb } from './poses.ts';
import type { PoseAngles } from './poses.ts';
import { HIDES_LEGS, softOf } from './scaled.ts';
import type { Scaled } from './scaled.ts';

type Limb = ReturnType<typeof solveLimb>;

/** A pose's joint angles after the person's sway, and any solved limbs for a footrest or grip. */
export interface Stance {
  pose: PoseAngles;
  seated: boolean;
  shoulderX: [number, number];
  elbow: [number, number];
  hipX: [number, number];
  kneeX: [number, number];
  legX: number;
  lean: number;
  /** Legs solved to a footrest, or null. */
  legs: Limb[] | null;
  /** Arms solved to a grip, or null. */
  arms: Limb[] | null;
}

export function resolveStance(look: Look, f: Scaled): Stance {
  const pose = POSES[look.pose];
  // The sway moves the swing angles only: nudging the stance or the lean moves
  // the feet, and a crowd standing at different heights stands on nothing.
  const s = look.sway;
  const swing = (angles: readonly [number, number], amount: number): [number, number] => [
    angles[0] + s * amount,
    angles[1] - s * amount,
  ];
  const seated = SEATED_POSES.has(look.pose);
  const shoulderX = swing(pose.shoulderX, 0.16);
  const elbow = swing(pose.elbow, 0.12);
  const hipX: [number, number] = seated ? [pose.hipX[0], pose.hipX[1]] : swing(pose.hipX, 0.1);
  const kneeX: [number, number] = seated ? [pose.kneeX[0], pose.kneeX[1]] : swing(pose.kneeX, 0.08);

  // Feet and hands on a published point, when there is one. Both targets arrive
  // in the person's own frame (for a seated pose, the seat surface with the hip
  // at the origin). The arms hang off `upper`, which is leaned, so the grip is
  // brought back through that rotation first.
  const legX = f.hipX * pose.stance;
  const lean = pose.lean - look.stoop;
  const legs =
    look.footrest === undefined
      ? null
      : ([0, 1] as const).map((i) => {
          const side = i === 0 ? 1 : -1;
          const target = look.footrest!;
          return solveLimb(
            side * Math.abs(target[0]) - side * legX,
            target[1],
            target[2],
            f.thigh,
            f.shin + f.ankle,
            1,
          );
        });
  const arms =
    look.grip === undefined
      ? null
      : ([0, 1] as const).map((i) => {
          const side = i === 0 ? 1 : -1;
          const target = look.grip!;
          const gy = target[1] * Math.cos(lean) + target[2] * Math.sin(lean);
          const gz = -target[1] * Math.sin(lean) + target[2] * Math.cos(lean);
          return solveLimb(
            side * Math.abs(target[0]) - side * f.shoulderX,
            gy - (f.shoulderJoint - f.hip),
            gz,
            f.upperArm,
            f.forearm + f.hand * 0.5,
            -1,
          );
        });
  return { pose, seated, shoulderX, elbow, hipX, kneeX, legX, lean, legs, arms };
}

/** Both legs: thigh, shin and shoe on a hip and a knee pivot, added to `root`. */
export function buildLegs(ctx: SceneryContext, look: Look, f: Scaled, root: Group, st: Stance): void {
  const { THREE } = ctx;
  const { lathe, ellipsoid } = softOf(ctx);
  const k = f.height / BODY.height;
  const { pose, legs, hipX, kneeX, legX } = st;
  const hidesLegs = HIDES_LEGS.has(look.garment);
  const legColor = hidesLegs ? look.top : look.bottom;
  // Built even under a robe, minus the thighs and shins: a hem with nothing
  // under it reads as a bell, and two shoes under it read as a person.
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * legX, f.hip, 0);
    hipPivot.rotation.x = legs ? legs[i]!.swing : hipX[i]!;
    hipPivot.rotation.z = side * (legs ? legs[i]!.splay : pose.splay ?? 0);
    root.add(hipPivot);

    if (!hidesLegs) {
      hipPivot.add(
        lathe(
          [
            [f.thighR[0], -f.thigh - 0.06 * k],
            [f.thighR[1], 0],
            [0, f.thighR[1] * 0.8],
          ],
          legColor,
          { sides: 8 },
        ),
      );
    }

    const kneePivot = new THREE.Group();
    kneePivot.position.y = -f.thigh;
    kneePivot.rotation.x = legs ? legs[i]!.joint : kneeX[i]!;
    hipPivot.add(kneePivot);

    if (!hidesLegs) {
      kneePivot.add(
        lathe(
          [
            [f.shinR[0], -f.shin],
            [f.shinR[1], 0.04 * k],
            [0, f.shinR[1] * 0.7],
          ],
          legColor,
          { sides: 8 },
        ),
      );
    }

    // A shoe: an ellipsoid with its underside pressed flat, which is a sole
    // without a second mesh. Its top runs up inside the shin, so a bent ankle
    // never opens a gap.
    const sole = -f.ankle * 0.62;
    const shoe = ellipsoid(f.bootWidth * 0.5, f.ankle * 0.95, f.bootDepth * 0.56, look.trim, {
      sides: 7,
      rings: 4,
      warp: (v) => {
        if (v.y < sole) v.y = sole;
      },
    });
    shoe.position.set(0, -f.shin - f.ankle - sole, f.bootDepth * 0.16);
    kneePivot.add(shoe);
  }
}

/** The shoulder caps and the neck, added to `upper`. `y` converts a height above the sole to `upper`'s frame. */
export function buildShoulders(ctx: SceneryContext, look: Look, f: Scaled, upper: Group, y: (world: number) => number): void {
  const { lathe, ellipsoid } = softOf(ctx);
  const k = f.height / BODY.height;
  // Two round masses standing out past the chest: the anatomy, and the ink
  // line that separates the arm from the body.
  const capHeight = (f.shoulder - f.chest) * 0.95;
  for (const side of [1, -1]) {
    const cap = ellipsoid(f.shoulderHalf * 0.31, capHeight, f.depth * 0.6, look.top, { sides: 8, rings: 3 });
    cap.position.set(side * f.shoulderHalf * 0.74, y(f.shoulder) - capHeight, 0);
    upper.add(cap);
  }

  // Buried in the collar at one end and the head at the other, so it is never
  // seen as a cylinder.
  upper.add(
    lathe(
      [
        [f.headHalf * 0.36, y(f.shoulder) - 0.12 * k],
        [f.headHalf * 0.33, y(f.chin)],
        [f.headHalf * 0.4, y(f.chin) + 0.3 * k],
      ],
      look.skin,
      { sides: 8 },
    ),
  );
}

/** Both arms: upper arm, forearm and hand on a shoulder and an elbow pivot, added to `upper`. */
export function buildArms(ctx: SceneryContext, look: Look, f: Scaled, upper: Group, y: (world: number) => number, st: Stance): void {
  const { THREE } = ctx;
  const { lathe, ellipsoid } = softOf(ctx);
  const k = f.height / BODY.height;
  const { pose, arms, shoulderX, elbow } = st;
  const armTop = look.sleeves !== 'bare' ? look.top : look.skin;
  const armLow = look.sleeves === 'long' ? look.top : look.skin;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * f.shoulderX, y(f.shoulderJoint), 0);
    shoulderPivot.rotation.x = arms ? arms[i]!.swing : shoulderX[i]!;
    shoulderPivot.rotation.z = side * (arms ? arms[i]!.splay : pose.shoulderZ[i]!);
    upper.add(shoulderPivot);

    shoulderPivot.add(
      lathe(
        [
          [f.upperArmR[0], -f.upperArm - 0.04 * k],
          [f.upperArmR[1], 0],
          [0, f.upperArmR[1] * 0.85],
        ],
        armTop,
        { sides: 8 },
      ),
    );

    const elbowPivot = new THREE.Group();
    elbowPivot.position.y = -f.upperArm;
    elbowPivot.rotation.x = arms ? arms[i]!.joint : elbow[i]!;
    shoulderPivot.add(elbowPivot);

    elbowPivot.add(
      lathe(
        [
          [f.forearmR[0], -f.forearm],
          [f.forearmR[1], 0.03 * k],
          [0, f.forearmR[1] * 0.75],
        ],
        armLow,
        { sides: 8 },
      ),
    );

    // A mitten, thin across the palm and broad front to back.
    const hand = ellipsoid(f.hand * 0.34, f.hand * 0.62, f.hand * 0.48, look.skin, { sides: 7, rings: 3 });
    hand.position.set(0, -f.forearm - f.hand * 0.42, 0.02 * k);
    elbowPivot.add(hand);
  }
}
