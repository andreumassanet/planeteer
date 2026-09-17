import * as THREE from 'three';
import { castMaterial, foldLegs, limbsOf, loadCast } from './cast.ts';
import type { Cast } from './cast.ts';
import { createContext } from './monuments/contract.ts';
import { createSoftKit } from './soft.ts';

/**
 * The player's body: the character, the clips it plays and every pose it takes.
 *
 * ## What it is, and the three bodies it replaced
 *
 * This is the one object a player looks at for the whole session. It was ten
 * smooth capsules, then thirty-five faceted prisms, then soft lathes — each built
 * in code, each a rigid piece per joint, and each rejected on sight: the last
 * verdict (2026-09-16) was that it looked like Roblox and that standing still it
 * was a statue. Both halves of that were structural. A body that is a rigid
 * piece per bone *is* a Roblox body however the pieces are shaped, and a pose
 * computed from sines has no weight in it.
 *
 * So the hero is now an authored character on an authored rig: Quaternius's
 * CC0 casual man in a hoodie (`src/cast.ts`, `scripts/build-cast.mjs`), one
 * continuous skinned mesh that bends at every joint, painted in the hero's own
 * colours — the crimson that no one else in the world wears, and the gold pack,
 * which is the one piece still built here, from `soft.ts`. What moves it is the
 * pack's own clips: a relaxed idle that breathes and shifts, a walk and a run,
 * blended by speed and kept in step with the ground.
 *
 * ## What stays from the old body, and why
 *
 * `FIGURE` is still the record the rest of the world is sized against — the
 * plane's seat, the launch's bench, the camera's eye, the crowd — and it is
 * **unchanged**, because those files were built around it. The seated pose puts
 * this character's own hips exactly where `FIGURE.hipY` says a hip is, so
 * `PLANE_SEAT` still seats him. The gait's speeds, strides and `swingLift` stay
 * too: they are facts about how fast a body of this size moves, and `life.ts`
 * and the fauna kit still read them.
 */

// ---------------------------------------------------------------------------
// Proportions
// ---------------------------------------------------------------------------

/**
 * Crown of the head, and the constant everything human-scale in the world is
 * measured against — `LAND_HEIGHT` is three of these, `JUMP_HEIGHT` is capped
 * against it, the scenery kit restates it, and `SCENERY_SCALE` was derived from
 * it. Unchanged by every rebuild, deliberately: moving it moves the planet. It is
 * the top of the hair's mass; the tuft on the crown stands 0.08 over it.
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
   * Limb section radii, tip first then root: the crowd's arms and legs.
   *
   * They were the hero's too until 2026-09-15, and they moved here from
   * literals so the crowd could not hold its own copy. The hero's arms and legs
   * are now *cloth* — a loose sleeve and a loose trouser leg cut in
   * `buildAvatar` — so they are wider than these by a garment's worth and do
   * not read them. What the two still share, and what a crowd built to other
   * numbers would get visibly wrong, is the skeleton: every height above, the
   * hip and shoulder offsets and every segment length.
   */
  thighRadius: [0.34, 0.42],
  shinRadius: [0.25, 0.33],
  upperArmRadius: [0.24, 0.28],
  forearmRadius: [0.19, 0.24],
} as const;


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


// ---------------------------------------------------------------------------
// The character
// ---------------------------------------------------------------------------

const ctx = createContext();
const palette = ctx.palette;
/** The pack on his back is the one part still built here. */
const soft = createSoftKit(ctx.toon, 1.6);

const HERO_OUTFIT = 'man-hoodie' as const;

/**
 * The hero's colours, by the pack's material names. Crimson is his and nobody
 * else's; the shoes come out of the hoodie's own material (see `@feet` in
 * `cast.ts`) and go dark, because red trainers under a red hoodie is one shape.
 */
const HERO_PAINT: Readonly<Record<string, number>> = {
  Purple: palette.crimson,
  'Purple@feet': palette.bark,
  LightBlue: palette.slate,
  'LightBlue@feet': palette.bark,
  White: palette.white,
  'White@feet': palette.white,
  Skin: palette.blush,
  'Skin@feet': palette.blush,
  Hair: palette.bark,
  Eyebrows: palette.bark,
  Eye: palette.ink,
};

let heroCast: Cast | null = null;

/**
 * Loads the hero's outfit and the clips. `buildAvatar` is synchronous and
 * throws without this, which is deliberate: a player built before its body has
 * arrived would be an invisible player, and that is a worse failure than a
 * stack trace.
 */
export async function prepareAvatar(): Promise<void> {
  if (heroCast !== null) return;
  const source = ctx.toon(palette.ink);
  const ink = source.userData.outlineParameters as { thickness: number; color: [number, number, number] };
  heroCast = await loadCast(castMaterial(source.gradientMap!, ink), [HERO_OUTFIT]);
}

/**
 * How far into its run cycle the held jump pose is, as a share of the clip, if
 * the cast came without its retarget: a quarter in, one knee is up and the
 * other leg reaching back, which is a leap rather than a stride.
 */
const AIR_PHASE = 0.3;

/**
 * How a seated body's legs fold, in its own frame: the thigh level and forward,
 * the shin hanging. The plane's seat (`sit`) and every cast rider on a bench
 * (`life.ts`) fold to these, so there is one seated pose in the world.
 */
export const SEAT_THIGH = new THREE.Vector3(0, -0.12, 1).normalize();
export const SEAT_SHIN = new THREE.Vector3(0, -1, 0.08).normalize();

/** How quickly the clip weights follow the speed, per second. */
const BLEND_RATE = 10;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export interface Avatar {
  /** Origin between the feet, facing +Z. */
  group: THREE.Group;
  /** Walking, running, standing and airborne. Everything on foot. */
  stride(dt: number, speed: number, airborne: boolean): void;
  /** At the launch's helm. `heel` is the craft's roll. */
  steer(dt: number, heel: number): void;
  /** Seated at the controls of the floatplane, hips at `FIGURE.hipY`. */
  sit(dt: number): void;
  /** Back to a clean standing pose with the cycle at zero. For `goTo`. */
  reset(): void;
}

/** Builds the body and returns the rig that poses it. Needs `prepareAvatar` first. */
export function buildAvatar(): Avatar {
  if (heroCast === null) throw new Error('avatar: call prepareAvatar() before buildAvatar()');
  const person = heroCast.make(HERO_OUTFIT, (name) => HERO_PAINT[name] ?? null, AVATAR_HEIGHT);

  const group = new THREE.Group();
  group.name = 'avatar';
  /** Carries the seated offset, so `group` stays where `player.ts` puts it. */
  const body = new THREE.Group();
  group.add(body);
  body.add(person.root);

  const bone = (name: string): THREE.Bone => {
    const found = person.bones.get(name) ?? person.bones.get(name.replace('.', ''));
    if (found === undefined) throw new Error(`avatar: the rig has no ${name}`);
    return found;
  };
  const chest = bone('Chest');
  // Measured in the bind pose, which `limbsOf` puts the skeleton in.
  const limbs = limbsOf(person);
  const hips = limbs.hips;
  group.updateMatrixWorld(true);

  // -------------------------------------------------------------------------
  // The pack
  //
  // Built in the group's frame at the bind pose and then handed to the chest
  // bone with `attach`, which keeps where it is and takes the bone's motion from
  // then on: it breathes, twists and bobs with the torso it is strapped to.
  // -------------------------------------------------------------------------
  const chestAt = group.worldToLocal(chest.getWorldPosition(new THREE.Vector3()));
  const pack = new THREE.Group();
  {
    const { rounded, band } = soft;
    const back = chestAt.z - 0.5;
    const sack = rounded(1.2, 1.3, 0.62, 0.22, palette.gold);
    sack.position.set(0, chestAt.y - 1.35, back - 0.26);
    const flap = rounded(1.28, 0.5, 0.7, 0.2, ctx.tone(palette.gold, 0.8));
    flap.position.set(0, chestAt.y - 0.5, back - 0.28);
    const patch = rounded(0.38, 0.26, 0.06, 0.03, palette.white, 2);
    patch.position.set(0, chestAt.y - 0.4, back - 0.64);
    const pocket = rounded(0.82, 0.46, 0.2, 0.1, ctx.tone(palette.gold, 0.88));
    pocket.position.set(0, chestAt.y - 1.2, back - 0.62);
    pack.add(sack, flap, patch, pocket);
    for (const side of [1, -1]) {
      const top = new THREE.Vector3(side * 0.42, chestAt.y + 0.34, chestAt.z - 0.05);
      const rear = new THREE.Vector3(side * 0.4, chestAt.y - 0.3, back - 0.05);
      const front = new THREE.Vector3(side * 0.44, chestAt.y - 0.9, chestAt.z + 0.5);
      pack.add(band(rear, top, 0.22, 0.09, palette.bark), band(top, front, 0.22, 0.09, palette.bark));
    }
    pack.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).castShadow = true;
    });
  }
  group.add(pack);
  group.updateMatrixWorld(true);
  chest.attach(pack);

  // -------------------------------------------------------------------------
  // The clips
  // -------------------------------------------------------------------------
  const clip = (name: 'Idle_Neutral' | 'Walk' | 'Run') => {
    const found = person.actions.get(name);
    if (found === undefined) throw new Error(`avatar: no ${name} clip`);
    return found;
  };
  const idle = clip('Idle_Neutral');
  const walk = clip('Walk');
  const run = clip('Run');
  // Airborne is the Universal Animation Library's jump loop, retargeted onto the
  // cast (`scripts/retarget-clips.ts`), played on the clock. Without it the
  // pose is the run held still, on an action of its own so it can be mixed in
  // while the run itself keeps its phase.
  const jump = person.actions.get('Jump');
  const air = jump ?? person.mixer.clipAction(run.getClip().clone());
  for (const action of [idle, walk, run, air]) {
    action.play();
    action.setEffectiveWeight(0);
  }
  // Walk and run are driven by distance and by hand, never by the clock.
  walk.timeScale = 0;
  run.timeScale = 0;
  if (jump === undefined) {
    air.timeScale = 0;
    air.time = AIR_PHASE * air.getClip().duration;
  }

  const weights = { idle: 1, walk: 0, run: 0, air: 0 };
  /** Stride cycles completed, 0..1. */
  let phase = 0;

  function apply(dt: number): void {
    idle.setEffectiveWeight(weights.idle);
    walk.setEffectiveWeight(weights.walk);
    run.setEffectiveWeight(weights.run);
    air.setEffectiveWeight(weights.air);
    walk.time = phase * walk.getClip().duration;
    run.time = phase * run.getClip().duration;
    person.mixer.update(dt);
  }

  function blendTo(dt: number, target: typeof weights): void {
    const k = approach(BLEND_RATE, dt);
    weights.idle += (target.idle - weights.idle) * k;
    weights.walk += (target.walk - weights.walk) * k;
    weights.run += (target.run - weights.run) * k;
    weights.air += (target.air - weights.air) * k;
  }

  function stride(dt: number, speed: number, airborne: boolean): void {
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    const running = clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    // Half a walk is already walking: below that the legs would shuffle.
    const moving = clamp(speed / (WALK_SPEED * 0.5), 0, 1);
    const length = mix(WALK_STRIDE, RUN_STRIDE, running);
    phase = (phase + (speed * dt) / length) % 1;
    const up = airborne ? 1 : 0;
    // A jump starts its loop from the take-off, not wherever the clock left it.
    if (airborne && weights.air < 0.02 && air.timeScale !== 0) air.time = 0;
    blendTo(dt, {
      idle: (1 - moving) * (1 - up),
      walk: moving * (1 - running) * (1 - up),
      run: moving * running * (1 - up),
      air: up,
    });
    apply(dt);
  }

  const hipAt = new THREE.Vector3();
  const to = new THREE.Vector3();

  /**
   * Seated: the idle clip for everything above the waist, and the legs folded
   * by hand (`foldLegs` in `cast.ts`, which carries each foot, an IK control
   * under the root, to its folded ankle), because the pack has no sitting clip.
   */
  function sit(dt: number): void {
    body.rotation.set(0, 0, 0);
    blendTo(dt * 4, { idle: 1, walk: 0, run: 0, air: 0 });
    apply(dt);
    foldLegs(limbs, group, SEAT_THIGH, SEAT_SHIN);
    // Put this character's own hips where `FIGURE` says a seated hip is.
    hipAt.copy(group.worldToLocal(hips.getWorldPosition(to)));
    body.position.x -= hipAt.x;
    body.position.y += FIGURE.hipY - hipAt.y;
    body.position.z -= hipAt.z;
  }

  /**
   * At the helm: standing in the relaxed idle, giving back two thirds of the
   * deck's roll so the sea reads as moving under him.
   */
  function steer(dt: number, heel: number): void {
    body.position.set(0, 0, 0);
    blendTo(dt, { idle: 1, walk: 0, run: 0, air: 0 });
    apply(dt);
    body.rotation.set(0, 0, -heel * 0.65);
  }

  function reset(): void {
    phase = 0;
    weights.idle = 1;
    weights.walk = 0;
    weights.run = 0;
    weights.air = 0;
    person.mixer.setTime(0);
    stride(0, 0, false);
  }

  reset();
  return { group, stride, steer, sit, reset };
}
