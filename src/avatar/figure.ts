import { AVATAR_HEIGHT, BODY_SCALE } from '../stature.ts';

/**
 * Four heads: the head is a quarter of the figure and everything else hangs
 * off that. Four heads with a 44% leg is the stylised middle between a toddler
 * and a realistic adult, and the head is big enough at distance to carry a
 * hat, hair, a jaw and two eyes.
 */
export const HEAD = AVATAR_HEIGHT / 4;

/**
 * The skeleton, above the sole, plus every half-width the model is built from.
 * Written in the units of a 6.8-unit figure and multiplied by `BODY_SCALE`, so
 * every proportion holds at `AVATAR_HEIGHT`.
 *
 * Half-widths are across the flats (the apothem), which is what `ctx.column`
 * and `ctx.taper` take. Two entries are not arithmetic:
 *
 * - `shoulderHalf` (1.30) is wider than `chestHalf` (1.00): the shoulder mass
 *   is what makes an arm read as an arm instead of a stick pushed into a torso.
 * - `bodyDepth` (0.74): a figure is a slab, not a totem pole.
 */
export const FIGURE = {
  /** Crown. */
  height: AVATAR_HEIGHT,
  /** Chin to crown. The module of the whole figure. */
  head: HEAD,

  // --- heights above the sole ---
  /** Top of the boot sole; the ankle pivot sits here. */
  ankleY: 0.4 * BODY_SCALE,
  kneeY: 1.66 * BODY_SCALE,
  /** Hip pivot. 44% of the height — the number that stopped it being a toddler. */
  hipY: 3.0 * BODY_SCALE,
  waistY: 3.78 * BODY_SCALE,
  chestY: 4.44 * BODY_SCALE,
  /** Top of the shoulder mass. */
  shoulderY: 4.78 * BODY_SCALE,
  /** Where the arms actually hang from, which is below the top of the shoulder. */
  shoulderJointY: 4.42 * BODY_SCALE,
  /** Head base. `height - chinY` is exactly `head`. */
  chinY: 5.1 * BODY_SCALE,

  // --- half-widths ---
  shoulderHalf: 1.3 * BODY_SCALE,
  chestHalf: 1.0 * BODY_SCALE,
  waistHalf: 0.82 * BODY_SCALE,
  hipHalf: 0.98 * BODY_SCALE,
  /** Front-to-back squash on the torso. */
  bodyDepth: 0.74 * BODY_SCALE,
  headHalf: 0.68 * BODY_SCALE,
  /** Front-to-back stretch on the head: a skull is deeper than it is wide. */
  headDepth: 1.06 * BODY_SCALE,
  /** Lateral offset of each hip and each shoulder from the centreline. */
  hipX: 0.58 * BODY_SCALE,
  /**
   * Where the arm hangs from. At 1.24 the arm's inner edge clears the torso's
   * silhouette standing still, and with the splay below the elbow clears the
   * hip by 0.31 units, a gap rather than two ink lines meeting.
   */
  shoulderX: 1.24 * BODY_SCALE,

  // --- segments ---
  thigh: 1.34 * BODY_SCALE,
  shin: 1.26 * BODY_SCALE,
  upperArm: 1.15 * BODY_SCALE,
  forearm: 1.0 * BODY_SCALE,
  hand: 0.33 * BODY_SCALE,

  /**
   * Limb section radii, tip first then root: the crowd's arms and legs. The
   * hero's limbs are cloth and wider; what the two share is the skeleton (every
   * height above, the hip and shoulder offsets and the segment lengths).
   */
  thighRadius: [0.34 * BODY_SCALE, 0.42 * BODY_SCALE],
  shinRadius: [0.25 * BODY_SCALE, 0.33 * BODY_SCALE],
  upperArmRadius: [0.24 * BODY_SCALE, 0.28 * BODY_SCALE],
  forearmRadius: [0.19 * BODY_SCALE, 0.24 * BODY_SCALE],
} as const;
