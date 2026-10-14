import type { Pose } from './look.ts';

/**
 * A pose is a table of joint angles and nothing else. There is no skeleton or
 * animation here: every person is a static mesh, so a pose is baked in at build
 * time, and a crowd needs more than one or it reads as mannequins.
 *
 * Sign convention: a limb hangs down `-Y` from a pivot at its top, so rotating
 * the pivot by `+x` swings the far end towards `-Z`, backwards. Forward is
 * negative. `z` is signed per side by the builder, so a positive `z` here
 * always means away from the body.
 *
 * No resting pose has `shoulderZ` under about 0.2: the arm hangs from x = 1.24
 * with a section of 0.28, so dead vertical its inner edge (0.96) sits inside
 * the chest half-width (1.00) and the arm is invisible until it swings.
 */
export interface PoseAngles {
  /** Upper body about the hip. Negative leans forward. */
  lean: number;
  /** Head about Y. */
  turn: number;
  /** [left, right] shoulder swing. Negative is forward. */
  shoulderX: readonly [number, number];
  /** [left, right] shoulder abduction. Positive is away from the body. */
  shoulderZ: readonly [number, number];
  /** [left, right] elbow. Negative folds the forearm forward. */
  elbow: readonly [number, number];
  hipX: readonly [number, number];
  /** Knee. Positive takes the heel backwards, which is the only way a knee bends. */
  kneeX: readonly [number, number];
  /** Feet apart, as a multiple of the hip offset. */
  stance: number;
  /**
   * Knees out, in radians, for a body straddling something.
   *
   * Every other pose leaves it at zero and moves the feet with `stance`, which
   * is a translation. A saddle needs a *rotation*: the thigh has to leave the
   * body's own plane, and sliding the hip sideways instead puts the leg through
   * the frame it is meant to be either side of.
   */
  splay?: number;
}

export const HALF_PI = Math.PI / 2;

/**
 * A static walk has to be in double support, and the knee decides it. A body
 * frozen mid-swing has one foot in the air, which reads as floating in a still
 * frame. A knee only lifts a foot while the thigh is behind vertical, so
 * bending the trailing knee raises that foot and nothing else moves.
 * `buildPerson` drops the whole body onto its own lowest point, so the other
 * boot is what ends up in the air. Daylight under the higher boot:
 *
 * ```
 *              trailing knee   daylight under the higher boot
 *   walk          0.50            0.053
 *   walk          0.42            0.002
 *   stride        0.76            0.352   <- eight pixels at 40 units
 *   stride        0.40            0.001
 * ```
 *
 * 0.40 radians is still 23 degrees of knee.
 */
export const POSES: Record<Pose, PoseAngles> = {
  // Weight on both feet, arms hanging with a hint of clearance from the hips.
  // The small asymmetry is deliberate: a perfectly symmetric figure reads as a
  // shop dummy, and 0.05 radians is invisible as a detail and obvious as a mood.
  stand: {
    lean: -0.01,
    turn: 0.06,
    shoulderX: [-0.05, 0.03],
    shoulderZ: [0.22, 0.2],
    elbow: [-0.14, -0.1],
    hipX: [0.02, -0.03],
    kneeX: [0.03, 0.06],
    stance: 1.02,
  },
  // The arm pairs swing the opposite way from the legs (contralateral gait).
  // `shoulderX[0]` and `hipX[0]` are the same side, so a walk written with both
  // negative would swing an arm forward with the leg under it. `life.ts`'s
  // `poseAt` writes all four joints itself and takes only the amplitudes from
  // here, so this table matters for the standing figures merged into a
  // settlement, where `walk` and `stride` are 8 of the 18 `IDLE_POSES` weights.
  //
  // The elbows travel with their own arms; `shoulderZ`'s 0.02 does not, because
  // it is the mood asymmetry every pose carries and not a fact about the gait.
  walk: {
    lean: -0.05,
    turn: 0.03,
    shoulderX: [0.4, -0.44],
    shoulderZ: [0.21, 0.19],
    elbow: [-0.22, -0.34],
    hipX: [-0.36, 0.3],
    // 0.42 and not 0.50, and 0.40 and not 0.76 in `stride` below, and both were
    // searched rather than chosen. See the note under `POSES`.
    kneeX: [0.12, 0.42],
    stance: 0.92,
  },
  // Half again the walk's swing and no more: a bigger swing would take the reach
  // of an outstretched arm past the declared footprint (see `villager.footprint`:
  // a person's footprint is a pose, not a body). Contralateral like `walk`; the
  // pose is never animated, so a bigger swing would only show in a still.
  stride: {
    lean: -0.11,
    turn: 0.02,
    shoulderX: [0.56, -0.62],
    shoulderZ: [0.22, 0.2],
    elbow: [-0.3, -0.55],
    hipX: [-0.46, 0.37],
    kneeX: [0.16, 0.4],
    stance: 0.9,
  },
  // One arm up mid-sentence. It is the only pose whose hand is above the
  // shoulder, so at 300 units it is the one that reads as "these two are
  // talking" rather than as "two people".
  talk: {
    lean: -0.02,
    turn: 0.42,
    shoulderX: [-0.62, 0.06],
    shoulderZ: [0.36, 0.21],
    elbow: [-1.3, -0.2],
    hipX: [0.04, -0.06],
    kneeX: [0.05, 0.1],
    stance: 1.22,
  },
  // Arms folded. Two straight forearms brought across the chest read as folded
  // arms at every distance that matters, and a real fold would want a shoulder
  // roll this body does not have.
  rest: {
    lean: 0.03,
    turn: -0.14,
    shoulderX: [-0.2, -0.18],
    shoulderZ: [0.3, 0.28],
    elbow: [-1.72, -1.66],
    hipX: [0.06, -0.04],
    kneeX: [0.04, 0.12],
    stance: 1.1,
  },
  // Both forearms forward and level: something is being held in front.
  carry: {
    lean: 0.04,
    turn: 0.02,
    shoulderX: [-0.26, -0.24],
    shoulderZ: [0.24, 0.22],
    elbow: [-1.42, -1.38],
    hipX: [0.02, -0.02],
    kneeX: [0.05, 0.05],
    stance: 1.06,
  },
  // Both hands up beside the head, steadying a load on it. The hardest
  // silhouette in the set to mistake for any other. The abduction is 0.52 and
  // not more because past that the hand walks out of the declared footprint.
  lift: {
    lean: 0.02,
    turn: 0,
    shoulderX: [-0.08, 0.06],
    shoulderZ: [0.52, 0.5],
    elbow: [-2.26, -2.2],
    hipX: [0, 0],
    kneeX: [0.03, 0.03],
    stance: 1,
  },
  // Thighs horizontal, shins down. See `buildPerson` for why this pose alone
  // changes where the origin is.
  sit: {
    lean: 0.05,
    turn: 0.1,
    shoulderX: [-0.22, -0.18],
    shoulderZ: [0.24, 0.22],
    elbow: [-0.62, -0.5],
    hipX: [-HALF_PI, -HALF_PI],
    kneeX: [HALF_PI, HALF_PI],
    stance: 1.12,
  },
  // Straddling something: a bicycle, a scooter, an animal. Same origin as
  // `sit` — the saddle surface, hip joint on it — and these angles are only the
  // fallback, for a mount that publishes no footrest and no grip. Give
  // `Look.footrest` and `Look.grip` and the four joints are solved instead, so
  // the feet land on the actual pedals of the actual vehicle.
  astride: {
    lean: -0.34,
    turn: 0.02,
    shoulderX: [-0.92, -0.88],
    shoulderZ: [0.2, 0.18],
    elbow: [-0.22, -0.18],
    hipX: [-1.05, -1.0],
    kneeX: [0.92, 0.86],
    stance: 1.0,
    splay: 0.22,
  },
};

/** The two poses whose origin is the seat surface rather than the sole. */
export const SEATED_POSES: ReadonlySet<Pose> = new Set<Pose>(['sit', 'astride']);

/**
 * Two-link inverse kinematics for one limb. A rider who does not reach the
 * pedals is the failure mode of a seated pose, and the kit's vehicles publish
 * where the feet and hands go (`Mount.footrest` and `Mount.grip` in
 * `src/traffic/contract.ts`), which differs between a bicycle, a scooter and a
 * tractor by more than one pose could absorb. So the angles are solved.
 *
 * `dx`, `dy`, `dz` are the target relative to the limb's root pivot, in that
 * pivot's parent frame. The result is what the builder applies: the abduction
 * about Z, the swing about X, and the bend at the middle joint.
 *
 * The sign convention is the pose table's: a limb hangs down `-Y`, `+x` swings
 * it backwards, and the middle joint bends so the far segment trails. `bend`
 * is `+1` for a knee, which folds backwards, and `-1` for an elbow.
 */
export function solveLimb(
  dx: number,
  dy: number,
  dz: number,
  upper: number,
  lower: number,
  bend: 1 | -1,
): { splay: number; swing: number; joint: number } {
  const reach = Math.hypot(dx, dy, dz);
  if (reach < 1e-6) return { splay: 0, swing: 0, joint: 0 };
  // A target further than the limb is straightened at it rather than snapped to
  // it, and one inside the fold is pushed out — both cases are a vehicle whose
  // published point does not suit this body, and a straight leg pointing the
  // right way is the least wrong answer.
  const span = Math.min(upper + lower - 1e-4, Math.max(Math.abs(upper - lower) + 1e-4, reach));
  const ux = dx / reach;
  const uy = dy / reach;
  const uz = dz / reach;
  const splay = Math.asin(Math.max(-1, Math.min(1, ux)));
  // The swing that would point a *straight* limb at the target.
  const straight = Math.atan2(-uz, -uy);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const atRoot = Math.acos(clamp((upper * upper + span * span - lower * lower) / (2 * upper * span)));
  const atJoint = Math.acos(clamp((upper * upper + lower * lower - span * span) / (2 * upper * lower)));
  return {
    splay,
    swing: straight - bend * atRoot,
    joint: bend * (Math.PI - atJoint),
  };
}
