import * as THREE from 'three';
import { createContext } from './monuments/contract.ts';

/**
 * The player's body: the model, the skeleton and every pose it takes.
 *
 * ## Why this is its own file, and why it is built like a monument
 *
 * This is the one object a player looks at for the whole session, and until now
 * it was ten smooth capsules buried in the middle of `player.ts`. Two things
 * were wrong with that and neither was a matter of taste.
 *
 * **It was the only smooth-shaded object in the world.** The land mesh is
 * non-indexed on purpose so every face gets its own normal; `createContext`
 * does the same for every monument and every scenic part, and the whole style
 * rests on a directional sun stepping across a four-band `gradientMap`. A
 * `CapsuleGeometry` has smooth normals, so the ramp sweeps continuously round
 * it and the cel bands turn into a gradient — the exact thing `theme.ts` is
 * arranged to prevent. The avatar was the one object in the scene rendering in
 * a different style from everything it stood next to.
 *
 * **And it was not cheap.** Measured: **2,376 triangles in 10 meshes** — a
 * `CapsuleGeometry(0.42, l, 4, 12)` is 216 triangles and a
 * `SphereGeometry(1.05, 20, 14)` is 520 — which is 91% of a whole
 * `building`-tier monument's budget, spent on subdivision the ramp cannot use.
 * This rebuild is **632 triangles**: under the `monument` tier's 900, four times
 * the model, 73% fewer triangles.
 *
 * So it is built through `createContext()` from `src/monuments/contract.ts`,
 * exactly as the Colosseum is. Same `box`/`column`/`taper`, same non-indexed
 * flat facets, same 24 colours, same four-band ramp, same 0.005 pen. There is
 * no avatar material, no avatar ramp and no avatar outline width to keep in
 * step with anything.
 *
 * **It is built as 35 pieces and drawn as 13**, and both numbers matter. 35 is
 * how many masses a body wants — a jaw under a cranium, a toe under a boot, a
 * flap over a pack — and each of them earns an ink line. 13 is how many *joints*
 * there are, and everything hanging off a joint is rigid, so `mergeBones`
 * collapses each one into a single vertex-coloured buffer with the skeleton left
 * exactly as it was. Measured in Paris with `atlas.player.object.visible` off and
 * on, twenty `outline.render` calls each with `gl.finish()`, both passes
 * counted: **+70 draw calls before, +26 after, and +1,264 drawn triangles
 * either way**. `OutlineEffect` draws every mesh twice, which is why a mesh
 * saved is two calls saved.
 *
 * ## Proportions are a shared decision
 *
 * `src/scenery/people.ts` and `src/camera.ts` both read `FIGURE` below, and the
 * crowd is built from it at avatar scale
 * and not at `SCENERY_SCALE`, because a person is not a building. A crowd a
 * head shorter than the player reads as children. So every number that says how
 * tall a person is or where their shoulders are lives here, once, with the
 * reasoning attached — including `WALK_SPEED` and `WALK_STRIDE`, because how
 * fast a body of this size walks and how far it gets per stride is a fact about
 * the body and not about the controller.
 *
 * ## What the model is for
 *
 * The third-person camera sits 30 units back and 15 up — 26 degrees above the
 * ground, **directly behind**. At a 900 px viewport that makes the avatar about
 * 175 px tall and puts `LEGIBLE_AT` (the scenery kit's four-pixel floor) at
 * 0.14 units, so a 0.15-unit feature reads and a 0.05-unit one is ink. Every
 * size in this file was chosen against that number, and the camera's *position*
 * decides more than its distance does: see `SWAY`.
 */

// ---------------------------------------------------------------------------
// Proportions
// ---------------------------------------------------------------------------

/**
 * Crown of the head, and the constant everything human-scale in the world is
 * measured against — `LAND_HEIGHT` is three of these, `JUMP_HEIGHT` is capped
 * against it, the scenery kit restates it, and `SCENERY_SCALE` was derived from
 * it. Unchanged by the rebuild, deliberately: moving it moves the planet.
 */
export const AVATAR_HEIGHT = 6.8;

/**
 * **Four heads.** The head is a quarter of the figure and everything else is
 * hung off that.
 *
 * The old avatar was 3.24 heads tall with legs 32% of its height. Those are not
 * stylised adult proportions, they are a **toddler's** — a real two-year-old is
 * about 4 heads and 35% leg — and that one fact is most of why it read as
 * crude however the parts were shaped. A real adult is 7.5 heads with 47% leg;
 * four heads with 44% leg is the stylised middle, and it is the register the two
 * references already sit in.
 *
 * Four rather than five because the head is what carries the character at 175
 * px: at 4 heads it is 44 px tall, which holds a hat, hair, a jaw and two eyes.
 * At 6 heads it is 29 px and holds a hat.
 */
const HEAD = AVATAR_HEIGHT / 4;

/**
 * The skeleton, in world units above the sole, plus every half-width the model
 * is built from.
 *
 * Half-widths are **across the flats** (the apothem), because that is what
 * `ctx.column` and `ctx.taper` take and it is the number you need when you
 * stack one mass on another.
 *
 * Two entries here are not arithmetic and both were paid for by a render:
 *
 * - **`shoulderHalf` (1.30) is deliberately wider than `chestHalf` (1.00).**
 *   Christ the Redeemer's file found it and it is the single thing that makes an
 *   arm read as an arm instead of a stick pushed into a torso. The old avatar
 *   had no shoulder mass at all and hung 0.34-radius arms at x = 1.15 off a
 *   1.05-radius torso capsule, so the arms' inner edges sat at 0.81 *inside* a
 *   body 1.05 wide: they were buried, and only emerged when they swung.
 * - **`bodyDepth` (0.74).** A figure is a slab, not a totem pole. Same finding,
 *   same file.
 */
export const FIGURE = {
  /** Crown. */
  height: AVATAR_HEIGHT,
  /** Chin to crown. The module of the whole figure. */
  head: HEAD,

  // --- heights above the sole ---
  /** Top of the boot sole; the ankle pivot sits here. */
  ankleY: 0.4,
  kneeY: 1.66,
  /** Hip pivot. 44% of the height — the number that stopped it being a toddler. */
  hipY: 3.0,
  waistY: 3.78,
  chestY: 4.44,
  /** Top of the shoulder mass. */
  shoulderY: 4.78,
  /** Where the arms actually hang from, which is below the top of the shoulder. */
  shoulderJointY: 4.42,
  /** Head base. `height - chinY` is exactly `head`. */
  chinY: 5.1,

  // --- half-widths ---
  shoulderHalf: 1.3,
  chestHalf: 1.0,
  waistHalf: 0.82,
  hipHalf: 0.98,
  /** Front-to-back squash on the torso. */
  bodyDepth: 0.74,
  headHalf: 0.68,
  /** Front-to-back stretch on the head: a skull is deeper than it is wide. */
  headDepth: 1.06,
  /** Lateral offset of each hip and each shoulder from the centreline. */
  hipX: 0.58,
  /**
   * Where the arm hangs from, and it is 1.24 rather than 1.16 because of what
   * came back from the first render: at 1.16 the arm's inner edge sits at 0.88
   * against a torso 1.00 wide, so the arms were *inside* the body's silhouette
   * standing still and only appeared when they swung. With the splay below, the
   * elbow now clears the hip by 0.31 units — about nine pixels at the camera's
   * own distance, which is a gap you can see rather than two ink lines meeting.
   */
  shoulderX: 1.24,

  // --- segments ---
  thigh: 1.34,
  shin: 1.26,
  upperArm: 1.15,
  forearm: 1.0,
  hand: 0.33,

  /**
   * Section radii, tip first then root, the way `taper` takes them.
   *
   * Published rather than left as literals inside `buildAvatar` because they
   * were the last thing about this body that only existed in one place as a
   * number in an expression, and `src/scenery/people.ts` was holding its own
   * copy of all four. That is the drift this file exists to prevent: every
   * other proportion is imported from here, so a limb that got thicker in the
   * hero and not in the crowd would be the one difference nobody could name.
   */
  thighRadius: [0.34, 0.42],
  shinRadius: [0.25, 0.33],
  upperArmRadius: [0.24, 0.28],
  forearmRadius: [0.19, 0.24],
} as const;

/**
 * The colours a person is drawn from, all out of `PALETTE` and all warm enough
 * to survive being turned away from the sun — the contract's first question
 * about any colour, and it matters more here than on a building because a body
 * is convex and half of it is always in shade.
 *
 * `crimson` is the player's alone. A world where the crowd can wear it is a
 * world where you lose yourself in it.
 */
export interface AvatarLook {
  skin: number;
  /** Jacket and sleeves. */
  jacket: number;
  trousers: number;
  /** Boots, hat, hair, straps: everything that would be leather. */
  leather: number;
  /**
   * The rucksack. It is the largest single area the camera ever sees, so it is
   * the figure's second colour and not a neutral: the first version was
   * `darkOlive` and the whole back of the avatar — hat, hair, pack, straps —
   * came out as one dark mass with two red slivers where the arms were.
   */
  pack: number;
}

/**
 * One context for the body, built at import. `createContext` registers its ramp
 * with `theme.ts` so the moods can repaint it, so it must be made once and not
 * once per avatar.
 */
const ctx = createContext();
const palette = ctx.palette;

export const AVATAR_LOOK: AvatarLook = {
  skin: palette.blush,
  jacket: palette.crimson,
  trousers: palette.slate,
  leather: palette.bark,
  pack: palette.gold,
};

/**
 * Jackets a crowd may wear. Every one of these reads against grass, sand, snow
 * and open water, which is the only test that matters for something the size of
 * a person seen across a valley — and none of them is `crimson`.
 */
export const CLOTH_COLORS: readonly number[] = [
  palette.skyBlue,
  palette.olive,
  palette.clay,
  palette.cream,
  palette.gold,
  palette.salmon,
  palette.violet,
  palette.tan,
  palette.steel,
];

/** Skin, dark to light. Four, because the head is 44 px and a fifth would not read. */
export const SKIN_TONES: readonly number[] = [
  palette.bark,
  palette.brown,
  palette.tan,
  palette.blush,
];

// ---------------------------------------------------------------------------
// Gait
// ---------------------------------------------------------------------------

/**
 * How fast a body this size travels, and how far it gets per stride.
 *
 * These live with the body rather than with the controller because they are
 * facts about the body: a stride is a leg length and a cadence. `player.ts`
 * imports them, and so does anything that wants a walking crowd figure to keep
 * step with the player rather than moonwalk beside him.
 *
 * **A run is twice a walk, and it was nearly three times.** At avatar scale, 3.78
 * units to the metre, the walk's 45 is 11.9 m/s and 6.6 body heights a second:
 * eight times a real stroll and already a platformer's jog, which is the
 * exaggeration a planet 1:400 on distance asks of anything on foot, and nobody
 * has objected to it. The run was 130 — 34 m/s, **19 body heights a second**,
 * where a real sprinter manages about 5.5 — and what the eye reads beside the
 * walk is the ratio: 2.9 is a sprint car. Real jogging is 2.1 times a walk (3.0
 * m/s against 1.4), and games that exaggerate both put their run at about twice
 * their walk. 90 is that: 23.8 m/s, 13 heights a second, a third off the old
 * number. It moved on the user's word (*corre demasiado rápido*, 2026-09-13).
 *
 * Tied to the planet's size at the other end: at radius 16000 a full lap is
 * 100,531 units, about 19 minutes at a run.
 */
export const WALK_SPEED = 45;
export const RUN_SPEED = 90;

/**
 * Distance covered by one full stride cycle, walking and running.
 *
 * The cycle is driven by distance, not by time, so the cadence keeps pace with
 * the ground at any speed and there is nothing to resynchronise when the speed
 * changes. What it does not do is plant a foot: with the hip swinging 0.42 each
 * way a stance foot sweeps 2.1 units under the body while the body covers 11,
 * and at a run 3.4 against 18. No stride at these speeds can close that with
 * this swing, and the rear camera sees the lift and the bob rather than the
 * slide (see `SWAY`).
 */
export const WALK_STRIDE = 22;
/**
 * Stride cycles a second at a full run, and the run's stride is derived from
 * it rather than written down.
 *
 * 2.5 is the cadence the run already had, 130 over a 52-unit stride — five
 * footfalls a second, 1.22 times the walk's 2.05 — so the legs turn over as
 * they always did and only the ground goes by slower. Keeping the 52 with the
 * slower run would have dropped the cadence to 1.73, **below the walk's**, and a
 * body that speeds up when Shift goes down while its legs slow down reads as
 * bounding on the moon. Derived, so the next change to `RUN_SPEED` cannot do
 * that either: the stride stays longer than the walk's for any run over 55.
 */
const RUN_CADENCE = 2.5;
const RUN_STRIDE = RUN_SPEED / RUN_CADENCE;

/** Radians the hip swings each way. */
const WALK_SWING = 0.42;
const RUN_SWING = 0.72;

/**
 * Radians the knee folds, and the joint that stopped the avatar moonwalking.
 *
 * **With straight legs the feet never leave the ground — provably, not
 * approximately.** Swing a straight leg by `t` and its foot rises by
 * `(hipY - ankleY)(1 - cos t)`; the hips drop by exactly that much so the
 * *stance* foot stays down; and the two cancel, so the swinging foot is at zero
 * for every `t`. Both feet slide along the floor for the whole cycle. That is
 * what the old rig did, and no amount of swing amplitude could have fixed it.
 *
 * **A knee only lifts a foot while the thigh is behind vertical, and getting
 * that wrong is worse than having no knee at all.** The vertical reach of a leg
 * is `thigh cos(h) + shin cos(h + k)`, so it is *longest* when `h + k = 0` — a
 * bent knee under a thigh that has already swung forward pushes the foot
 * **down**. The first driver here was `max(0, -cos(phase))`, which peaks at
 * mid-swing and is still half folded a quarter of a cycle later with the thigh
 * 0.51 forward: measured over a full cycle, the lowest point of the rig was
 * **0.31 units under the floor**, and it was the swinging foot, not the planted
 * one. The two zeros of the dip are `k = 0` and `k = -2h`, and every value
 * between them digs, so there is no smooth driver that crosses that gap.
 *
 * `SWING_LIFT` below is the shape that cannot: it is non-zero only while the
 * thigh is behind, where more fold is always more clearance. The foot kicks up
 * off the toe, reaches its peak in early swing, and travels forward close to
 * the ground — which is what a walk actually looks like, and is why people trip
 * on kerbs.
 */
const WALK_KNEE = 0.42;
const RUN_KNEE = 0.85;

/**
 * The knee's driver: `2 sin(p)+ * -cos(p)+`, which is zero everywhere except
 * the quarter cycle between toe-off and mid-swing and peaks at 1.
 *
 * Both factors are load-bearing. `-cos(p)+` is *this leg is swinging*, and
 * `sin(p)+` is *this thigh is still behind vertical* — the condition above,
 * written as a factor rather than as a branch, so the fold arrives and leaves
 * continuously and the leg is provably straight whenever its foot is down.
 *
 * **Exported, because `src/life.ts` walks thirty crowd figures a town with the
 * same curve** and was carrying a copy of this line — written down honestly, but
 * a copy, and the third one this body has had to take back after the limb radii
 * and the crowd's four section widths. There is one gait in this world and this
 * is where it is defined.
 */
export const swingLift = (phase: number): number =>
  2 * Math.max(0, Math.sin(phase)) * Math.max(0, -Math.cos(phase));

/** Radians the shoulder swings, against the hip of the same side. */
const ARM_SWING = 0.85;
/**
 * Radians the elbow folds. A walk carries the arms nearly straight and a run
 * carries them bent, and that is the most recognisable single difference
 * between the two from any angle.
 */
const WALK_ELBOW = 0.22;
const RUN_ELBOW = 1.1;

/**
 * The ankle keeps the boot **flat in the world**, and that is not a stylistic
 * choice about how a foot should look. It is the second thing that stops the
 * foot digging.
 *
 * A rigid boot bolted to the shin swings about the hip, and the sole is not a
 * point: its front corner is 0.64 units ahead of the ankle. Rotate the leg back
 * by `t` and, with the hips dropped by exactly the amount that keeps a *point*
 * foot on the floor, that corner lands at `-0.64 sin t` — **0.42 units under
 * the ground at a run**, twelve pixels at the camera's own distance, every
 * stride, with the heel sticking up in the air behind it. Measured over a full
 * cycle before the fix, the lowest point of the whole rig was -0.44 walking and
 * -0.53 running.
 *
 * Cancelling the leg's total rotation at the ankle fixes it outright, and it
 * moves the bob with it: with the foot flat, what pivots about the hip is the
 * 2.6 units from hip to *ankle* and not the 3.0 from hip to sole, so the drop
 * that keeps the sole on the floor is `(hipY - ankleY)(1 - cos t)`. The two
 * belong together — change one and the feet leave the ground.
 *
 * What is left is free, because it happens in the air: a little toe-up while
 * the knee is folded, which is a heel leading the step.
 */
const ANKLE_LIFT = 0.3;

/**
 * Lateral shift of the whole body toward the leg it is standing on, and the one
 * addition made for where the camera actually is rather than for what a walk
 * cycle looks like on a turntable.
 *
 * **The camera lives directly behind the avatar, and from directly behind the
 * fore-aft limb swing is the motion you can see least.** A hand travelling 1.4
 * units fore and aft projects to 0.63 units of screen movement from 26 degrees
 * up, and the legs are worse because they are further from the eye line. What
 * carries a walk from back there is the vertical bob, the sole of the lifting
 * foot, the shoulders counter-twisting under the pack — and the weight shifting
 * side to side, which is pure lateral motion and therefore the only part of the
 * cycle the rear camera sees at full size.
 *
 * Less of it at a run because a run is more vertical and less lateral than a
 * walk, which is also true of the real thing.
 */
const WALK_SWAY = 0.13;
const RUN_SWAY = 0.07;

/**
 * The bob is not a decorative sine, and its exaggeration is gone.
 *
 * A leg swung by `t` about the hip lifts the ankle by `(hipY - ankleY)(1 - cos
 * t)`, so the hips must drop by exactly that for the flat sole to reach the
 * floor — see `ANKLE_LIFT` for why it is the ankle's height and not the sole's.
 * The old rig multiplied its version by 1.6 "the way a drawing would" and the
 * arithmetic says what it bought: the stance foot ends up at
 * `hipY (1 - cos t)(1 - k)`, which at `k = 1.6` and a run's 0.72 of swing is
 * **0.33 units under the floor**, buried, every stride.
 *
 * There is nothing left to pay for. The honest drop is 0.65 units at a run
 * against the old rig's 0.87: the longer leg bought back three quarters of the
 * amplitude the exaggeration was faking, and the feet stay on the ground.
 */
const bobFor = (swing: number): number =>
  -(FIGURE.hipY - FIGURE.ankleY) * (1 - Math.cos(swing));

/** How much of the run's forward pitch the head undoes. A walk reads as walking only when the eyes stay on the horizon. */
const HEAD_STEADY = 0.7;

/** Rest pose: the arms hang open, because negative space is what makes an arm an arm. */
const ARM_SPLAY = 0.22;
const ARM_REST_ELBOW = 0.12;

/** Breathing, for a body that is standing still. Amplitude in units, rate in radians a second. */
const BREATH = 0.035;
const BREATH_RATE = 1.6;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// The helm
// ---------------------------------------------------------------------------

/**
 * Where the hands go at the wheel, in the **launch's own frame**: cockpit sole
 * at `y = 0`, helm amidships, facing `+Z`. The avatar's group sits on that datum
 * (`player.ts` gives the boat no seat offset), so this is the boat's number and
 * the only one in this file that is.
 *
 * **It is a restatement and that is the honest cost of the split.** The plane
 * publishes `PLANE_SEAT` and `player.ts` hands it over, so no pose knows a
 * fuselage dimension; the launch publishes no equivalent for its wheel, so the
 * grip is derived here from what `vehicles.ts`'s own comment states — hub at
 * (0, 3.72, 1.15), `ringWall(0.42, 0.62, 0.14)`, and an axis raked with the
 * column. Move the wheel without moving these four numbers and the hands stay
 * where the wheel was: nothing throws, nothing checks, and from the one camera
 * that matters the helmsman's own back hides the gap.
 */
const HELM = {
  hub: [0, 3.72, 1.15] as const,
  /** Mid-rim: the wheel is an annulus from 0.42 to 0.62 and a hand wraps the middle of it. */
  radius: 0.52,
  /** The wheel's axis is the column's, which is `rim.rotation.x` in `vehicles.ts`. */
  rake: -1.14,
  /**
   * How far along that axis the palm sits. The rim is 0.14 thick and `ringWall`
   * lathes it from the hub *outward* along the axis, so 0.07 is its mid-plane
   * and the extra 0.10 puts the hand on the helmsman's side of it rather than
   * inside the ink.
   */
  palm: 0.07 + 0.1,
} as const;

/**
 * The two grip points, in the launch's frame. Positive x is the figure's left —
 * see `player.ts`: the basis is right-handed with the avatar facing `+Z`.
 *
 * Measured off this: each grip is **1.35 from its own shoulder joint against an
 * arm of 2.32 to the palm — 58% of full reach**, which is the same fact
 * `vehicles.ts` states as 60% and measured to the rim rather than to the hand.
 */
const HELM_GRIP: readonly THREE.Vector3[] = [1, -1].map((side) => {
  const axis = new THREE.Vector3(0, Math.cos(HELM.rake), Math.sin(HELM.rake));
  return new THREE.Vector3(side * HELM.radius, 0, 0)
    .addScaledVector(axis, HELM.palm)
    .add(new THREE.Vector3(...HELM.hub));
});

/**
 * Shoulder to elbow, and elbow to the centre of the hand — which is the point
 * that has to land on the rim, and is not the wrist. `box` stands on `y = 0`, so
 * the hand mesh spans `-(forearm + hand)` to `-forearm` and its middle is half a
 * hand below the wrist.
 */
const UPPER = FIGURE.upperArm;
const LOWER = FIGURE.forearm + FIGURE.hand / 2;

/**
 * Where the elbow wants to be, as a direction: outboard and down.
 *
 * **This is the whole reason the arms are not solved the way the crowd's are.**
 * `people.ts`'s `solveLimb` takes a splay about Z and a swing about X, which is
 * two degrees of freedom at the shoulder — and two is exactly enough to hit a
 * point and no more, so the elbow lands wherever the arithmetic puts it. Solved
 * that way against this wheel it puts it at **x = 0.63 against a chest half-width
 * of 1.00: inside the torso**, which is the trap `ARM_SPLAY` exists to answer,
 * arriving through a joint solver instead of through a rest pose. A hand on a
 * wheel is 0.72 inboard of its own shoulder, so an arm reaching for it *wants*
 * to fold inward, and the only thing that stops the elbow following it in is
 * spending the third degree of freedom on where the elbow goes.
 *
 * So the shoulder is given a full basis and the elbow is **placed** on the circle
 * of positions that satisfy both bone lengths, at the point furthest along this
 * direction. 0.75 outboard against 1 down is 37 degrees of abduction and puts
 * the elbow at x = 1.53, which is clear of the shoulder itself. Straight out
 * (down = 0) reaches 1.68 and reads as a chicken wing; straight down puts it
 * back inside the jacket.
 */
const ELBOW_OUT = 0.75;

/**
 * Aims one arm at a point, and places the elbow rather than deriving it.
 *
 * `target` is in the shoulder's **parent** frame — the chest — because that is
 * the frame the shoulder's own position is written in and the frame the chest's
 * counter-roll against the swell has already been applied to. So the hands stay
 * on the wheel while the body works underneath them, which is the difference
 * between a man holding a wheel and a man posed beside one.
 *
 * The elbow's bend axis is its local X, so the arm's whole bend plane is fixed
 * by the shoulder's rotation: the basis below is built to put `-Y` down the
 * upper arm and `Z` where the fold needs it, and it is a **proper** rotation by
 * construction — `col1 = col2 x col3` of two orthonormal columns — because
 * `setFromRotationMatrix` silently discards a reflection and returns something
 * that is not even normalised. See the trap; it cost a round of accusing
 * `outline.ts` of a bug it did not have.
 */
const solveArm = (() => {
  const reach = new THREE.Vector3();
  const line = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const out = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const bone = new THREE.Vector3();
  const forearm = new THREE.Vector3();
  const roll = new THREE.Vector3();
  const up = new THREE.Vector3();
  const across = new THREE.Vector3();
  const basis = new THREE.Matrix4();

  return function solveArm(arm: Arm, target: THREE.Vector3, side: number): void {
    reach.copy(target).sub(arm.shoulder.position);
    // A target outside the arm, or inside its own fold, is reached *towards*
    // rather than snapped to: a straight arm pointing the right way is the least
    // wrong answer, and it is what a helm this body has outgrown should look
    // like rather than a limb turned inside out.
    const span = clamp(reach.length(), Math.abs(UPPER - LOWER) + 1e-3, UPPER + LOWER - 1e-3);
    if (span < 1e-4) return;
    reach.setLength(span);
    line.copy(reach).divideScalar(span);

    // The elbow lies on a circle — the two spheres about the shoulder and the
    // target intersect in one — and the circle is where the third degree of
    // freedom lives.
    const along = (span * span + UPPER * UPPER - LOWER * LOWER) / (2 * span);
    centre.copy(arm.shoulder.position).addScaledVector(line, along);
    const radius = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));

    // Furthest out and down, projected onto the circle's own plane.
    out.set(side * ELBOW_OUT, -1, 0);
    out.addScaledVector(line, -out.dot(line));
    if (out.lengthSq() < 1e-6) out.set(side, 0, 0).addScaledVector(line, -line.x * side);
    elbow.copy(centre).addScaledVector(out.normalize(), radius);

    bone.copy(elbow).sub(arm.shoulder.position).normalize();
    forearm.copy(arm.shoulder.position).add(reach).sub(elbow).normalize();
    const fold = Math.acos(clamp(bone.dot(forearm), -1, 1));
    const sine = Math.sin(fold);
    // `elbow.rotation.x = -fold` takes the forearm from `-Y` to
    // `cos(fold) * bone + sin(fold) * roll`, so that is the Z the basis needs.
    // Straight, there is no bend plane and any perpendicular will do.
    if (sine > 1e-4) roll.copy(forearm).addScaledVector(bone, -Math.cos(fold)).divideScalar(sine);
    else roll.set(0, 0, 1).addScaledVector(bone, -bone.z).normalize();

    // The limb hangs down `-Y`, so the basis's Y column is the *negative* of the
    // upper arm, and X is what is left. Taking X as the cross of the other two
    // is what makes the determinant +1 rather than hoping it is.
    up.copy(bone).multiplyScalar(-1);
    across.crossVectors(up, roll);
    basis.makeBasis(across, up, roll);
    arm.shoulder.quaternion.setFromRotationMatrix(basis);
    arm.elbow.rotation.set(-fold, 0, 0);
  };
})();

// ---------------------------------------------------------------------------
// The merge
// ---------------------------------------------------------------------------

/**
 * One material for every body in the world, and the ramp and the pen are the
 * contract's own rather than restated.
 *
 * `ctx.toon` is still the only thing that makes a material here; this one is
 * built *from* one — same `gradientMap`, same `outlineParameters` object — so
 * there is no avatar ramp and no avatar pen to keep in step with anything, which
 * was the whole reason this file went through `createContext` in the first
 * place. What it adds is `vertexColors`, because a merged bone carries five
 * colours in one buffer.
 */
const bodyMaterial = (() => {
  const source = ctx.toon(palette.ink);
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: source.gradientMap,
  });
  material.userData.outlineParameters = source.userData.outlineParameters;
  return material;
})();

/** Marks a pivot the merge must not reach through. */
const BONE = 'atlasBone';

interface Piece {
  mesh: THREE.Mesh;
  /** Where it sits relative to the bone that carries it, static scales and all. */
  matrix: THREE.Matrix4;
}

function piecesOf(node: THREE.Object3D, into: THREE.Matrix4, out: Piece[]): void {
  for (const child of node.children) {
    // Another bone's, and it has to keep its own pivot to be rotated by.
    if (child.userData[BONE] === true) continue;
    child.updateMatrix();
    const matrix = new THREE.Matrix4().multiplyMatrices(into, child.matrix);
    if ((child as THREE.Mesh).isMesh === true) out.push({ mesh: child as THREE.Mesh, matrix });
    piecesOf(child, matrix, out);
  }
}

/**
 * Collapses each bone's own meshes into one vertex-coloured buffer, and leaves
 * the skeleton exactly as it was.
 *
 * **The merge is per bone and not global, because a merged mesh cannot move** —
 * that is `settlements.ts`'s finding and `life.ts` is built on it. Every part of
 * this body is rigid *on* a joint, though, and there are only thirteen joints,
 * so the whole figure collapses to one buffer per joint with the hierarchy that
 * poses it untouched: **35 meshes to 13, and 70 draw calls to 26**, because
 * `OutlineEffect` draws every mesh twice. The triangles do not move — 632 either
 * way — and neither does the ink: a hull is expanded per *vertex* along its own
 * normal and depth-tested, so which buffer a triangle sits in is not a fact the
 * outline can see. The jacket's three courses still get their two seams.
 *
 * What it costs is that `measure` can no longer name the colours a body is drawn
 * from, because they are on the vertices now and not on a material.
 *
 * Static groups inside a bone — the torso's `bodyDepth` squash, the skull's
 * `headDepth` stretch, the foot's seven degrees of toe-out — are baked into the
 * vertices with the inverse transpose on the normals, and every one of those
 * scales is positive, which is not a thing to assume: a **negative determinant
 * flips the winding**, and a merged triangle wound backwards turns the
 * `BackSide` hull front-facing and renders the body as a solid ink blob. It is
 * the reflected-instance trap and it does not need an `InstancedMesh` to bite.
 */
function mergeBones(bones: readonly THREE.Object3D[]): void {
  for (const bone of bones) bone.userData[BONE] = true;
  const identity = new THREE.Matrix4();
  const tint = new THREE.Color();
  const point = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  for (const bone of bones) {
    const pieces: Piece[] = [];
    piecesOf(bone, identity, pieces);
    if (pieces.length === 0) continue;

    let vertices = 0;
    for (const piece of pieces) {
      const geometry = piece.mesh.geometry;
      vertices += geometry.index ? geometry.index.count : geometry.getAttribute('position').count;
    }

    const position = new Float32Array(vertices * 3);
    const normal = new Float32Array(vertices * 3);
    const color = new Float32Array(vertices * 3);
    let cursor = 0;

    for (const piece of pieces) {
      if (piece.matrix.determinant() <= 0) {
        throw new Error('avatar: a body part is placed by a reflection, which would render as ink');
      }
      const geometry = piece.mesh.geometry;
      const from = geometry.getAttribute('position');
      const facing = geometry.getAttribute('normal');
      const index = geometry.index;
      const count = index ? index.count : from.count;
      normalMatrix.getNormalMatrix(piece.matrix);
      const material = Array.isArray(piece.mesh.material) ? piece.mesh.material[0]! : piece.mesh.material;
      const hex = material.userData.atlasToon as number | undefined;
      if (hex === undefined) {
        throw new Error('avatar: a material escaped ctx.toon and cannot say what colour it is');
      }
      tint.set(hex);
      for (let i = 0; i < count; i++) {
        const v = index ? index.getX(i) : i;
        point.fromBufferAttribute(from, v).applyMatrix4(piece.matrix);
        position[cursor] = point.x;
        position[cursor + 1] = point.y;
        position[cursor + 2] = point.z;
        point.fromBufferAttribute(facing, v).applyMatrix3(normalMatrix).normalize();
        normal[cursor] = point.x;
        normal[cursor + 1] = point.y;
        normal[cursor + 2] = point.z;
        color[cursor] = tint.r;
        color[cursor + 1] = tint.g;
        color[cursor + 2] = tint.b;
        cursor += 3;
      }
    }

    for (const piece of pieces) {
      piece.mesh.removeFromParent();
      piece.mesh.geometry.dispose();
    }
    // Whatever static groups the pieces hung from are empty now.
    for (const child of [...bone.children]) {
      if (child.userData[BONE] !== true) child.removeFromParent();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    const merged = new THREE.Mesh(geometry, bodyMaterial);
    // The body casts its own shadow and stands in everything else's.
    merged.castShadow = true;
    merged.receiveShadow = true;
    bone.add(merged);
  }
}

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

/** One leg: three pivots, each the top of what hangs off it. */
interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
}

/** One arm: two pivots. The hand is rigid on the forearm. */
interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
}

export interface Avatar {
  /** Origin between the feet, facing +Z. Owns its own bob and sway. */
  group: THREE.Group;
  /** Walking, running, standing and airborne. Everything on foot. */
  stride(dt: number, speed: number, airborne: boolean): void;
  /** At the launch's helm, hands on the wheel. `heel` is the craft's roll. */
  steer(dt: number, heel: number): void;
  /** Seated at the controls, head and shoulders out in the open cockpit. */
  sit(dt: number): void;
  /** Back to a clean standing pose with the cycle at zero. For `goTo`. */
  reset(): void;
}

/** Builds the body and returns the rig that poses it. */
export function buildAvatar(look: AvatarLook = AVATAR_LOOK): Avatar {
  const { box, taper, strut } = ctx;
  const { skin, jacket, trousers, leather, pack } = look;
  const F = FIGURE;

  const group = new THREE.Group();

  // -------------------------------------------------------------------------
  // Legs
  //
  // Every pivot is the *top* of what hangs from it, so a rotation is a joint
  // and never a limb swinging about its own middle. `taper` stands on +Y, so a
  // hanging segment is placed at `y = -length` and written thin-end-first —
  // which is also why no limb here needs a rotation baked into it, and so the
  // `T * R * S` trap has nothing to catch.
  // -------------------------------------------------------------------------
  const legs: Leg[] = [1, -1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * F.hipX, F.hipY, 0);
    group.add(hip);

    const thigh = taper(F.thighRadius[0], F.thighRadius[1], F.thigh, trousers, 5);
    thigh.position.y = -F.thigh;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -F.thigh;
    hip.add(knee);

    const shin = taper(F.shinRadius[0], F.shinRadius[1], F.shin, trousers, 5);
    shin.position.y = -F.shin;
    knee.add(shin);

    const ankle = new THREE.Group();
    ankle.position.y = -F.shin;
    knee.add(ankle);

    // A five-sided cuff over the top of the boot. The trouser is 0.25 across
    // here and the boot is 0.58, so without it the leg steps straight from a
    // pencil to a brick.
    const cuff = taper(0.32, 0.27, 0.3, leather, 5);
    ankle.add(cuff);

    // The foot toes out seven degrees, which is what a stance looks like and
    // what a pair of parallel bricks does not. On its own group so the ankle
    // pivot stays a pure fore-aft joint for the walk to drive.
    const foot = new THREE.Group();
    foot.rotation.y = side * 0.07;
    ankle.add(foot);

    const boot = box(0.58, F.ankleY, 0.96, leather);
    boot.position.set(0, -F.ankleY, 0.16);
    foot.add(boot);

    // The toe is a second, lower, narrower mass rather than a longer boot.
    // Coplanar faces get no ink between them, so a one-box shoe is one flat
    // shape; stepping the toe down and forward buys an ink line across it for
    // twelve triangles.
    const toe = box(0.5, 0.24, 0.26, leather);
    toe.position.set(0, -F.ankleY, 0.58);
    foot.add(toe);

    return { hip, knee, ankle };
  });

  // The pelvis belongs to the legs, not to the chest: it must not twist when
  // the shoulders counter-rotate, or the hips wag.
  const pelvis = taper(F.hipHalf, 0.9, 0.6, trousers, 6);
  pelvis.position.y = 2.95;
  pelvis.scale.z = 0.8;
  group.add(pelvis);

  // -------------------------------------------------------------------------
  // Torso
  // -------------------------------------------------------------------------
  const chest = new THREE.Group();
  chest.position.y = F.hipY;
  group.add(chest);

  /** Chest-local height for a world height. */
  const at = (y: number) => y - F.hipY;

  // Three courses, so two ink lines run across the jacket. Few joints read as
  // natural and many read as manufactured — a garment is manufactured, and the
  // seams are what say cloth rather than skin. The hem flares back out past the
  // waist, which is the whole difference between a jacket and a tube.
  const body = new THREE.Group();
  body.scale.z = F.bodyDepth;
  chest.add(body);

  // The hem is 1.00 against a 0.82 waist so it stands clear of the trousers
  // under it — 0.07 of overhang and a different depth, which is what buys the
  // ink line. Coplanar, there would be none.
  const seams = [3.35, F.waistY, F.chestY, F.shoulderY];
  const widths = [1.0, F.waistHalf, F.chestHalf, 0.96];
  for (let i = 0; i + 1 < seams.length; i++) {
    const course = taper(widths[i]!, widths[i + 1]!, seams[i + 1]! - seams[i]!, jacket, 6);
    course.position.y = at(seams[i]!);
    body.add(course);
  }

  // The rucksack's hip belt, standing proud of the hem. It is the reason the
  // pack is on his back rather than floating behind it, and it costs one mesh.
  const belt = taper(1.06, 1.06, 0.2, leather, 6);
  belt.position.y = at(3.4);
  belt.scale.z = 0.78;
  chest.add(belt);

  // Outside `body`, so the front-to-back squash does not pull it flat. Wider
  // than the chest by 0.30 a side: this mass is the difference between an arm
  // and a stick pushed into a torso.
  const shoulders = taper(F.shoulderHalf, 1.14, 0.52, jacket, 6);
  shoulders.position.y = at(4.26);
  shoulders.scale.z = 0.62;
  chest.add(shoulders);

  // A dark collar across the top of the shoulders, standing proud in depth so
  // the ink finds it. The pack is narrower than the shoulders, so this band
  // still shows on both sides of it from the camera's own position.
  const collar = taper(1.12, 0.98, 0.22, leather, 6);
  collar.position.y = at(4.6);
  collar.scale.z = 0.66;
  chest.add(collar);

  const neck = taper(0.32, 0.29, F.chinY - 4.72, skin, 6);
  neck.position.y = at(4.72);
  chest.add(neck);

  // -------------------------------------------------------------------------
  // Arms
  //
  // Sleeve to the elbow and bare from there: three colours down the arm, which
  // is what stops it reading as one tube, and it is a rolled sleeve rather than
  // a decision about anatomy.
  // -------------------------------------------------------------------------
  const arms: Arm[] = [1, -1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * F.shoulderX, at(F.shoulderJointY), 0);
    chest.add(shoulder);

    const upper = taper(F.upperArmRadius[0], F.upperArmRadius[1], F.upperArm, jacket, 5);
    upper.position.y = -F.upperArm;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -F.upperArm;
    shoulder.add(elbow);

    const lower = taper(F.forearmRadius[0], F.forearmRadius[1], F.forearm, skin, 5);
    lower.position.y = -F.forearm;
    elbow.add(lower);

    const hand = box(0.34, F.hand, 0.28, skin);
    hand.position.set(0, -F.forearm - F.hand, 0.02);
    elbow.add(hand);

    return { shoulder, elbow };
  });

  // -------------------------------------------------------------------------
  // Head
  //
  // Two masses, not one. A single prism is a drum; a jaw narrowing to the chin
  // under a cranium puts an ink line across the cheek, and that line is most of
  // what makes it a face at 44 px.
  // -------------------------------------------------------------------------
  const head = new THREE.Group();
  head.position.y = at(F.chinY);
  chest.add(head);

  const skull = new THREE.Group();
  skull.scale.z = F.headDepth;
  head.add(skull);

  const jaw = taper(0.56, F.headHalf, 0.52, skin, 6);
  skull.add(jaw);

  // Stopped 0.08 under the crown, because at exactly `HEAD` the cranium's top
  // face and the cap's were the same size at the same height and the scalp came
  // through the hat. The model's crown is the cap.
  const cranium = taper(F.headHalf, 0.58, HEAD - 0.6, skin, 6);
  cranium.position.y = 0.52;
  skull.add(cranium);

  // The hat lives **inside** `skull`, so it inherits the same `headDepth`
  // stretch the skull has. Outside it, the two are scaled differently in z and
  // the skull's corners come through the crown: the first render had pale
  // wedges of scalp standing proud of the hat front and back, which is the
  // clearest possible demonstration that a cover has to be built in the frame
  // of the thing it covers. Six sides on both, aligned, so the cap's apothem is
  // over the cranium's at every bearing and not only at the flats.
  //
  // **And it has no brim, which is the second thing the first render settled.**
  // A brim at 0.96 against a 0.68 head is 1.4 times the width of the skull, and
  // from 26 degrees up it is a flat disc seen nearly edge-on: the head came out
  // as a dark lampshade 2.3 units across against 2.6 of shoulder, and the
  // figure read as a bobblehead. A peak costs the *front* view a direction cue
  // and costs the rear silhouette nothing at all, which is the right way round
  // for a camera that lives behind.
  const cap = taper(0.74, 0.58, HEAD - 0.98, leather, 6);
  cap.position.y = 0.98;
  skull.add(cap);

  const peak = box(0.72, 0.13, 0.36, leather);
  peak.position.set(0, 0.98, 0.6);
  skull.add(peak);

  // Hair around the back of the skull rather than a lid on top of it, and run
  // up under the cap so it cannot grow through it. The Little Mermaid's file
  // records both failures this avoids: a slab across the crown reads as a
  // helmet, and hair the same colour as the head is an outline.
  // It runs from just above the chin to under the cap: at 0.42 it left 0.80
  // units of bare nape between the collar and the hat, and from directly
  // astern — the one view that is always there — that pale band read as the
  // head not being attached to the body.
  const hair = box(1.34, 0.86, 0.4, leather);
  hair.position.set(0, 0.18, -0.76);
  head.add(hair);

  // Eyes, standing 0.07 proud of the face. Flush they would be coplanar with
  // it and get no ink at all, which is Niagara's finding and it applies to a
  // 0.15-unit box exactly as it did to a waterfall. High on the head — 46% of
  // it, where a real eye line sits — because at 0.62 they were level with the
  // jaw seam and the two together read as a moustache.
  for (const side of [1, -1]) {
    const eye = box(0.15, 0.17, 0.1, palette.ink);
    eye.position.set(side * 0.24, 0.78, 0.72);
    head.add(eye);
  }

  // -------------------------------------------------------------------------
  // The pack
  //
  // The camera is behind this avatar for the whole session, so the back of the
  // figure is the primary read and it gets the most parts. Narrower than the
  // shoulders on purpose — a pack as wide as the shoulders hides the arms that
  // do the walking — and it stops 0.05 below the chin so it does not merge with
  // the head from directly astern.
  // -------------------------------------------------------------------------
  const sack = box(1.24, 1.0, 0.52, pack);
  sack.position.set(0, at(3.42), -1.0);
  chest.add(sack);

  // A flap over the top two fifths of it. Without one the pack is a single
  // bright brick and reads as a box he is carrying rather than a bag he is
  // wearing; the straps cannot do that job, because a strap runs down the
  // *front* of a pack and is invisible from the one angle the camera has.
  const flap = box(1.3, 0.36, 0.58, leather);
  flap.position.set(0, at(4.42), -1.02);
  chest.add(flap);

  // Straps over the shoulders. Each is buried inside the shoulder mass in the
  // middle and shows at both ends, which is what a strap looks like.
  for (const side of [1, -1]) {
    chest.add(
      strut(
        new THREE.Vector3(side * 0.48, at(4.6), -0.78),
        new THREE.Vector3(side * 0.46, at(3.72), 0.6),
        0.2,
        leather,
      ),
    );
  }

  // -------------------------------------------------------------------------
  // The merge
  //
  // Thirteen bones, and the list is the skeleton: the pelvis on the root, one
  // per hip, knee and ankle, the chest, the head, and one per shoulder and
  // elbow. Everything hanging off each of them is rigid, so each becomes one
  // buffer. See `mergeBones`.
  // -------------------------------------------------------------------------
  mergeBones([
    group,
    ...legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]),
    chest,
    head,
    ...arms.flatMap((arm) => [arm.shoulder, arm.elbow]),
  ]);

  // -------------------------------------------------------------------------
  // Posing
  // -------------------------------------------------------------------------

  const [armLeft, armRight] = arms as [Arm, Arm];

  /** Phase of the walk cycle, advanced by distance covered and never by time. */
  let phase = 0;
  /** How airborne he is, smoothed, so take-off and landing are not a snap. */
  let airPose = 0;
  /** Wall clock, for the things that are not driven by distance: breath, swell. */
  let clock = 0;

  function stride(dt: number, speed: number, airborne: boolean): void {
    clock += dt;
    const running = clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    const stride_ = mix(WALK_STRIDE, RUN_STRIDE, running);
    // The phase is integrated rather than derived from a distance counter, so
    // changing stride length mid-step does not jump.
    phase = (phase + (speed * dt * TAU) / stride_) % TAU;

    airPose += ((airborne ? 1 : 0) - airPose) * approach(9, dt);

    // Below a walk the legs barely move, so easing to a stop settles into the
    // idle pose instead of freezing mid-stride.
    const intensity = clamp(speed / WALK_SPEED, 0, 1);
    const swing = Math.sin(phase) * mix(WALK_SWING, RUN_SWING, running) * intensity;
    const fold = mix(WALK_KNEE, RUN_KNEE, running) * intensity;
    const ground = 1 - airPose;

    // Positive rotation about local X swings a limb backwards.
    const hips = [swing, -swing];
    // Non-zero only while this leg is swinging *and* its thigh is still behind
    // vertical, which is the one window where folding the knee raises the foot.
    const lifts = [swingLift(phase), swingLift(phase + Math.PI)];

    // Airborne: one leg tucked, one reaching, arms up. It is a leap rather than
    // a star jump, so the two legs do different things.
    const air: [number, number, number][] = [
      [-0.28, 1.15, 0.2],
      [-0.62, 0.22, -0.12],
    ];
    legs.forEach((leg, i) => {
      const [airHip, airKnee, airAnkle] = air[i]!;
      const hip = hips[i]!;
      const knee = lifts[i]! * fold;
      // `.set` and not `.x`: the boat's braced stance splays the hips about Z,
      // and stepping ashore has to put that back or you walk bow-legged.
      leg.hip.rotation.set(mix(hip, airHip, airPose), 0, 0);
      leg.knee.rotation.x = mix(knee, airKnee, airPose);
      // Cancel the leg's total rotation so the boot stays flat on the world,
      // then add the toe-up that rides with the fold. See ANKLE_LIFT: between
      // them these two lines are what keep the feet out of the ground.
      leg.ankle.rotation.x = mix(-(hip + knee) - ANKLE_LIFT * lifts[i]! * intensity, airAnkle, airPose);
    });

    const elbow = mix(WALK_ELBOW, RUN_ELBOW, running) * intensity + ARM_REST_ELBOW;
    armLeft.shoulder.rotation.set(mix(-swing * ARM_SWING, -1.05, airPose), 0, ARM_SPLAY + airPose * 0.3);
    armRight.shoulder.rotation.set(mix(swing * ARM_SWING, -1.05, airPose), 0, -ARM_SPLAY - airPose * 0.3);
    // More fold on the forward swing than on the back, which is what an arm does.
    armLeft.elbow.rotation.x = -mix(elbow * (1 - swing * 0.5), 0.62, airPose);
    armRight.elbow.rotation.x = -mix(elbow * (1 + swing * 0.5), 0.62, airPose);

    // The shoulders counter-twist against the arms and the run leans forward;
    // the head undoes both.
    const twist = -swing * mix(0.12, 0.2, running);
    const pitch = mix(0.05, 0.28, running) * intensity;
    // Roll toward the swing side, so the head stays over the stance foot.
    const roll_ = -Math.cos(phase) * 0.05 * intensity;
    chest.rotation.set(mix(pitch, -0.16, airPose), twist, roll_ * ground);
    chest.position.y = F.hipY + (1 - intensity) * Math.sin(clock * BREATH_RATE) * BREATH * ground;
    head.rotation.set(-chest.rotation.x * HEAD_STEADY, -twist * 0.5, -roll_ * 0.5);

    // The bob, and the lateral shift: see `bobFor` and `SWAY`.
    const sway = Math.cos(phase) * mix(WALK_SWAY, RUN_SWAY, running) * intensity;
    group.position.set(sway * ground, bobFor(swing) * ground, 0);
  }

  /** Scratch for the helm solve: the grip, walked back into the chest's frame. */
  const grip = new THREE.Vector3();
  const unchest = new THREE.Quaternion();

  /**
   * At the helm of the launch: hands on the wheel, standing on a deck that is
   * moving under him.
   *
   * **It used to be a braced stance with both palms on a ledge, and that was a
   * measurement rather than a preference.** The launch's console topped out at
   * 1.30 units — knee height on a 6.8-unit body against a knee at 1.66 — so the
   * wheel could not be reached without kneeling on it, and this pose's own
   * comment said so. `vehicles.ts` then rebuilt the boat around the pilot: the
   * console is two boxes because this pose has two heights in it, the after
   * ledge tops out where the braced hands already were, and the wheel sits on a
   * binnacle at 60% of an arm's reach. The geometry answered; this is the pose
   * that was owed back.
   *
   * The legs did not change and should not. Feet planted wide, hips splayed,
   * knees soft — a man at a wheel is still balancing, and the counter-roll is
   * still what says the sea is moving even when the boat is stopped. What the
   * wheel adds is that the counter-roll now has something to work *against*:
   * the hands are solved in the chest's own frame every frame, so the body
   * rolls and the grip does not.
   */
  function steer(dt: number, heel: number): void {
    clock += dt;
    airPose = 0;
    phase = 0;

    const sway = Math.sin(clock * 0.9);
    for (const [i, leg] of legs.entries()) {
      // Feet planted wide: the hips splay outward, which is what bracing is.
      leg.hip.rotation.set(0.1, 0, (i === 0 ? 1 : -1) * 0.1);
      leg.knee.rotation.x = 0.22;
      // Flat on the deck, the same rule the walk obeys.
      leg.ankle.rotation.x = -0.32;
    }
    // Counter-roll: the deck rolls by `heel`, the legs go with it, the chest
    // gives about two thirds of it back.
    chest.rotation.set(0.08, sway * 0.05, -heel * 0.65);
    chest.position.y = F.hipY + Math.sin(clock * BREATH_RATE) * BREATH;
    head.rotation.set(-0.06, sway * 0.12, heel * 0.35);
    // The soft knees already shorten him by 0.08; this puts the soles back on
    // the deck rather than a hand's breadth over it. It is also what makes the
    // group's frame the *boat's* frame, which is what the grips are written in.
    group.position.set(0, -0.08, 0);

    // The arms last, because the solve reads the chest the two lines above have
    // just placed. Boat -> group -> chest, and then `solveArm` works in the
    // shoulder's parent frame, which is where its own position is written.
    unchest.copy(chest.quaternion).invert();
    for (const [i, arm] of arms.entries()) {
      grip.copy(HELM_GRIP[i]!).sub(group.position).sub(chest.position).applyQuaternion(unchest);
      solveArm(arm, grip, i === 0 ? 1 : -1);
    }
  }

  /**
   * Seated at the controls of the floatplane.
   *
   * **The hip is the origin of a seated figure and this pose leaves it there.**
   * That is the convention the crowd and the vehicle kits already share — origin
   * at the seat surface, hip at zero, +Z the way the person faces — and it is
   * what lets `player.ts`'s `seatOn` place him from the plane's own
   * `PLANE_SEAT` without either file knowing the other's dimensions.
   *
   * It used to drop the whole body 0.9 and shift it 0.6 back, and the comment
   * explaining why described a fuselage that no longer exists: a 4.4-unit
   * capsule against a 6.8-unit body, with no offset that seated him properly.
   * The plane was rebuilt around the pilot instead of the other way round —
   * cockpit floor at the datum, seat at 1.90, a 4.30 cabin against the crowd's
   * measured 4.27 envelope — so the cheat has nothing left to hide and the
   * numbers had become two magic constants whose only job was to be cancelled
   * by `seatOn` on the next line of a different file.
   *
   * The knees are what turn it from a standing man with his legs pointing
   * forward into somebody sitting down — the old rig had no knee and could not
   * say it.
   */
  function sit(dt: number): void {
    clock += dt;
    airPose = 0;
    phase = 0;

    for (const leg of legs) {
      leg.hip.rotation.set(-1.45, 0, 0);
      leg.knee.rotation.x = 1.35;
      leg.ankle.rotation.x = 0.15;
    }
    for (const [i, arm] of arms.entries()) {
      const side = i === 0 ? 1 : -1;
      // Forward and down onto the yoke, whose crossbar `vehicles.ts` puts where
      // these hands land rather than the other way round.
      arm.shoulder.rotation.set(-1.0, 0, side * 0.06);
      arm.elbow.rotation.x = -0.45;
    }
    chest.rotation.set(0.1, 0, 0);
    chest.position.y = F.hipY;
    head.rotation.set(-0.07, 0, 0);
    // No offset: the seat is the vehicle's to place, and it places it on the
    // hip. See the note above for the two numbers that used to be here.
    group.position.set(0, 0, 0);
  }

  function reset(): void {
    phase = 0;
    airPose = 0;
    clock = 0;
    stride(0, 0, false);
  }

  reset();
  group.name = 'avatar';
  return { group, stride, steer, sit, reset };
}
