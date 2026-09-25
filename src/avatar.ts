import * as THREE from 'three';
import { castMaterial, foldLegs, limbsOf, loadCast, paintWith, poseAstride } from './cast.ts';
import type { AstrideSeat, Cast, ClipName, Limbs, Person } from './cast.ts';
import {
  DEFAULT_APPEARANCE,
  WARDROBE_OUTFITS,
  coloursOf,
  fitAppearance,
  outfitsOf,
  storeAppearance,
  storedAppearance,
  wardrobeOf,
} from './appearance.ts';
import type { Appearance } from './appearance.ts';
import { createContext } from './monuments/contract.ts';
import { AVATAR_HEIGHT, BODY_SCALE } from './stature.ts';
import type { Emote } from '../server/src/limits.ts';

/**
 * The player's body: the character, the clips it plays and every pose it takes.
 *
 * ## What it is, and the three bodies it replaced
 *
 * This is the one object a player looks at for the whole session. It was ten
 * smooth capsules, then thirty-five faceted prisms, then soft lathes — each
 * built in code, each a rigid piece per joint, and each read wrong: the last
 * (2026-09-16) looked like Roblox, and standing still it was a statue. Both
 * halves of that were structural. A body that is a rigid piece per bone *is* a
 * Roblox body however the pieces are shaped, and a pose computed from sines has
 * no weight in it.
 *
 * So the hero is now an authored character on an authored rig: Quaternius's
 * CC0 modular cast (`src/cast.ts`, `scripts/build-cast.mjs`), one continuous
 * skinned mesh that bends at every joint. What moves it is the pack's own
 * clips — a relaxed idle that breathes and shifts, a walk and a run, blended by
 * speed and kept in step with the ground — and the Universal Animation
 * Library's, retargeted onto the same rig: the jump and its landing, a crawl
 * and treading water, and a second idle. `createMotion` plays them, for the
 * hero and for every other player, and adds what no clip has: the head
 * turned towards where the camera looks, a shuffle when turning on the spot,
 * the arms of a fall, a tip into a change of speed.
 *
 * ## And it is whoever the player chose
 *
 * The body is an `Appearance` (`appearance.ts`): a man or a woman, a head of
 * hair, a top, a bottom and shoes taken from any of the pack's outfits of that
 * body, each in a colour of the world's palette, and the pack's own rucksack.
 * Until anyone chooses, it is the man in the crimson hoodie that nobody else
 * in the world wears. The rucksack was built here, from `soft.ts`'s rounded
 * boxes, until 2026-09-24: a smooth gold lozenge strapped to an authored body,
 * the one piece of the rejected code-built style left on the hero. It is the
 * adventurer's own now, skinned to the same chest.
 *
 * `dressHero` changes the appearance of every hero on the page at once — the
 * card calls it, and the body is swapped under the same group between two
 * frames, clips, weights and stride phase carried over.
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
 * measured against. It lives in `stature.ts` so that the scenery kit reads the
 * same number rather than a copy of it; see there.
 */
export { AVATAR_HEIGHT };

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
 * The skeleton, above the sole, plus every half-width the model is built from:
 * written in the units of the 6.8-unit figure it was drawn on and multiplied by
 * `BODY_SCALE`, so every proportion argued below holds at `AVATAR_HEIGHT`.
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
   * Where the arm hangs from, and it is 1.24 rather than 1.16 because of what
   * came back from the first render: at 1.16 the arm's inner edge sits at 0.88
   * against a torso 1.00 wide, so the arms were *inside* the body's silhouette
   * standing still and only appeared when they swung. With the splay below, the
   * elbow now clears the hip by 0.31 units — about nine pixels at the camera's
   * own distance, which is a gap you can see rather than two ink lines meeting
   * (both measured on the 6.8-unit figure and its camera, before 2026-09-24).
   */
  shoulderX: 1.24 * BODY_SCALE,

  // --- segments ---
  thigh: 1.34 * BODY_SCALE,
  shin: 1.26 * BODY_SCALE,
  upperArm: 1.15 * BODY_SCALE,
  forearm: 1.0 * BODY_SCALE,
  hand: 0.33 * BODY_SCALE,

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
  thighRadius: [0.34 * BODY_SCALE, 0.42 * BODY_SCALE],
  shinRadius: [0.25 * BODY_SCALE, 0.33 * BODY_SCALE],
  upperArmRadius: [0.24 * BODY_SCALE, 0.28 * BODY_SCALE],
  forearmRadius: [0.19 * BODY_SCALE, 0.24 * BODY_SCALE],
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
 * number. It came down on 2026-09-13, because the run read as far too fast.
 *
 * **And both came down with the body** (2026-09-24). A person is 3.77 units
 * now (`stature.ts`), and 45 would have been twelve body heights a second. 6
 * is 1.6 heights a second, a brisk walk with a game's exaggeration and not a
 * sprint car; the run kept a little over twice it, 13.5, 3.6 heights a
 * second. The planet did not shrink with the body: a full lap is 100,531
 * units, about two hours at a run, which is what the plane is for.
 *
 * **And the run went back up** (later the same day): 13.5 read as a jog that
 * cost a lot to get anywhere, on a planet where the next town is a few hundred
 * units off. 20 is 5.3 heights a second — a sprinter's, held for as long as
 * the key is — and three times a walk that came up to 6.5 with it, 1.7
 * heights a second. A lap at a run is 84 minutes.
 */
export const WALK_SPEED = 6.5;
export const RUN_SPEED = 20;

/**
 * Distance covered by one full stride cycle, walking and running.
 *
 * The cycle is driven by distance, not by time, so the cadence keeps pace with
 * the ground at any speed and there is nothing to resynchronise when the speed
 * changes. It is the walk over a cadence of 1.1 cycles a second — a real walk
 * is 0.9 to 1 — so the legs turn over as a body this size walks at this pace:
 * about 1.57 body heights a cycle (5.91 on a 3.77-unit body, at the 6.5 walk
 * of 2026-09-24; 1.45 at the 6 before it), where the old 22
 * at a 6.8-unit body was 3.2 and the feet slid.
 */
export const WALK_STRIDE = WALK_SPEED / 1.1;
/**
 * Stride cycles a second at a full run, and the run's stride is derived from
 * it rather than written down.
 *
 * 1.6, three and a bit footfalls a second: a hard run's, and above the walk's
 * 1.1. It must stay above it — a body that speeds up when Shift goes down while
 * its legs slow down reads as bounding on the moon — and it is written as a
 * cadence so the next change to `RUN_SPEED` cannot break that. At 20 units a
 * second it is a stride cycle of 12.5 units, 3.3 heights, which is a sprint's
 * reach; 1.5 would have been 3.5 heights and a bound.
 */
export const RUN_CADENCE = 1.6;
export const RUN_STRIDE = RUN_SPEED / RUN_CADENCE;


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

let heroCast: Cast | null = null;
/** The traveller as chosen, which every hero `buildAvatar` makes without one wears. */
let chosen: Appearance = storedAppearance();
/** Every hero built without an appearance of its own, to be dressed when it changes. */
const heroes = new Set<(appearance: Appearance) => Promise<void>>();

/**
 * Loads the chosen outfits and the clips (and the default's, which a hero
 * wears while a choice it has not loaded yet arrives). `buildAvatar` is
 * synchronous and throws without this, which is deliberate: a player built
 * before its body has arrived would be an invisible player, and that is a
 * worse failure than a stack trace.
 */
export async function prepareAvatar(): Promise<void> {
  if (heroCast !== null) return;
  const source = ctx.toon(palette.ink);
  const ink = source.userData.outlineParameters as { thickness: number; color: [number, number, number] };
  const outfits = [...new Set([...outfitsOf(chosen), ...outfitsOf(DEFAULT_APPEARANCE)])];
  heroCast = await loadCast(castMaterial(source.gradientMap!, ink), outfits);
}

/**
 * The hero's cast with every outfit either body can wear loaded: what the
 * traveller's card dresses its preview from, so a choice made there is a
 * template the hero already has.
 */
export async function wardrobeCast(): Promise<Cast> {
  await prepareAvatar();
  await heroCast!.ensure(WARDROBE_OUTFITS);
  return heroCast!;
}

/** The traveller as chosen: what a new hero wears, and what the card opens on. */
export function heroAppearance(): Appearance {
  return { ...chosen };
}

/**
 * Dresses every hero on the page as `appearance` and keeps it on this device.
 * Resolves once they are dressed, which is at once when its outfits are loaded.
 */
export function dressHero(appearance: Appearance): Promise<void> {
  chosen = fitAppearance(appearance);
  storeAppearance(chosen);
  return Promise.all([...heroes].map((wear) => wear(chosen))).then(() => undefined);
}

/**
 * How a seated body's legs fold, in its own frame: the thigh level and forward,
 * the shin hanging. The plane's seat (`sit`) and every cast rider on a bench
 * (`life.ts`) fold to these, so there is one seated pose in the world.
 */
export const SEAT_THIGH = new THREE.Vector3(0, -0.12, 1).normalize();
export const SEAT_SHIN = new THREE.Vector3(0, -1, 0.08).normalize();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const smoothstep = (x: number, a: number, b: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};


// ---------------------------------------------------------------------------
// Motion: what plays a body on foot, afloat and at rest
// ---------------------------------------------------------------------------

/**
 * Where the run clip's cycle is when the walk's is at `phase`, as a share of
 * a cycle ahead.
 *
 * **The pack's walk and run are not authored from the same foot.** The walk
 * puts its left foot down 3% into its cycle and the run 45% into its own, so
 * played at one phase a body halfway between the two had its left foot
 * planted in one clip and swinging in the other: both feet half down and
 * sliding for as long as the blend lasted, which is every start and every
 * stop at a run. 0.36 is where the left foot's fore-and-aft path through the
 * run best matches its path through the walk (a correlation of 0.99 over the
 * cycle, measured on the bake on 2026-09-24); `pnpm people` measures it again
 * and fails if the best offset moves off this one.
 */
export const RUN_PHASE = 0.36;

/**
 * How far one stroke cycle — both arms — carries a swimmer at an easy pace: a
 * body's length. The hands of the library's crawl pull 3.1 units back through
 * the water a cycle between them, and a swimmer glides a little past his
 * pull, so at a slow pace the stroke is driven by distance as the walk is and
 * the arms keep pace with the sea going by.
 */
export const SWIM_STROKE = AVATAR_HEIGHT;
/**
 * The most stroke cycles a second the arms ever make. **A swimmer here is
 * faster than a person is** — a swim at a jog, a sprint at a run — and at
 * `SWIM_STROKE` a cycle that would be two and a half cycles a second at the
 * sprint: arms windmilling, which is what a fast crawl drawn by distance
 * looked like. So past an easy pace the cadence eases towards this and the
 * rest of the speed is glide: 1.3 cycles a second at the swim, 1.5 at the
 * sprint, which is a racing crawl's.
 */
export const SWIM_CADENCE = 1.55;
/**
 * How far the body rolls with the stroke, radians; rides up on each pull,
 * units; and how much higher than the clip's own waterline a crawl is carried
 * at the surface — the library's crawl has the head's root a tenth of a unit
 * out, which from the chase camera is a swimmer with his face in the sea and
 * nothing else showing.
 */
const SWIM_ROLL = 0.22;
const SWIM_RIDE = AVATAR_HEIGHT * 0.025;
const SWIM_LIFT = AVATAR_HEIGHT * 0.04;
/** Under the surface, the stroke is a long, slow pull and a glide: this share of the cadence. */
const UNDER_CADENCE = 0.6;

/** Stroke cycles a second at `speed`: by distance when slow, easing to `SWIM_CADENCE`. */
export function swimCadence(speed: number): number {
  return SWIM_CADENCE * Math.tanh(Math.max(0, speed) / SWIM_STROKE / SWIM_CADENCE);
}

/** How quickly the clip weights follow the speed, per second, on foot and afloat. */
const BLEND_RATE = 10;
const SWIM_BLEND_RATE = 4;

/**
 * Turning on the spot is a shuffle: the walk mixed in under the idle, its
 * cycle turned over at `TURN_CADENCE` rather than by any distance, as far as
 * `TURN_STEP_SHARE` of the pose when the body turns at `TURN_STEP_RATE`
 * radians a second or faster. A body that rotated with its feet planted read
 * as a figure on a turntable.
 */
const TURN_STEP_RATE = 2.5;
const TURN_CADENCE = 1.3;
const TURN_STEP_SHARE = 0.7;

/**
 * Standing, the head and chest turn towards where the camera looks: at most
 * `LOOK_LIMIT` radians between them, the chest `LOOK_CHEST` of it and the
 * head the rest. Past `LOOK_FADE[0]` off the body's facing the camera is
 * coming round to the front, and the look fades out by `LOOK_FADE[1]` rather
 * than wringing the neck over the shoulder.
 */
const LOOK_LIMIT = 1.0;
const LOOK_CHEST = 0.35;
const LOOK_FADE: readonly [number, number] = [1.7, 2.4];
const LOOK_RATE = 5;

/**
 * After `IDLE_WAIT` seconds standing still, something every `IDLE_EVERY`:
 * the weight shifted onto one leg (the library's second idle, held for
 * `SHIFT_HOLD`), then a look round, the head sweeping `SWEEP_REACH` either
 * side over `SWEEP_TIME`, in turn. Standing is most of what a traveller who
 * stops to look at something does, and one breathing loop for a minute is a
 * statue again.
 */
const IDLE_WAIT = 6;
const IDLE_EVERY = 8;
const SHIFT_HOLD = 5;
const SHIFT_RATE = 1.5;
const SWEEP_TIME = 4;
const SWEEP_REACH = 0.8;

/**
 * Longer in the air than this is a fall, not a jump — a jump is 0.68 s of
 * air (`JUMP_RISE` twice, in `player.ts`) — and the arms go up and flail,
 * `FALL_RAISE` radians over the jump's own and `FALL_FLAIL` either side of
 * that at `FALL_RATE` cycles a second.
 */
export const FALL_AFTER = 0.8;
const FALL_RAISE = 0.7;
const FALL_FLAIL = 0.18;
const FALL_RATE = 1.6;

/**
 * The body tips into a change of speed: forward as it sets off, back as it
 * pulls up, `PITCH_GAIN` radians for each unit a second squared, up to
 * `MAX_PITCH`. Setting off to a run is about 80 units a second squared at
 * the controller's ramp (`ACCELERATION_TIME` in `player.ts`), so about a
 * tenth of a radian for the quarter second it lasts.
 */
const PITCH_GAIN = 0.0012;
const MAX_PITCH = 0.1;

/**
 * A landing is the library's `Jump_Land` laid over whatever else is playing:
 * a knee-bend `LAND_SOFT` deep after an ordinary jump and all of the clip's
 * crouch after a hard fall, played faster the softer it is, and a third as
 * deep for a body already moving off.
 */
const LAND_SOFT = 0.35;

/** What a `Motion` is told by the controller that moves the body, on top of the speed. */
export interface MotionCues {
  /** Radians a second the body is turning about its own up, positive to its left. */
  turn?: number;
  /** Radians from the body's facing to where the camera looks, positive to its left. */
  look?: number;
}

/**
 * The clips of one person, played by speed: the hero's, and every other
 * player's (`peers.ts`), so a traveller seen walking past moves exactly as
 * the one being played does. `person.root` is its to place: on foot its feet
 * are on the origin, afloat the water's surface is.
 */
export interface Motion {
  readonly person: Person;
  /** Where the gait is in its cycle, 0 to 1: see `Avatar.phase`. */
  readonly phase: number;
  /** Walking, running, standing, turning on the spot and in the air. */
  foot(dt: number, speed: number, airborne: boolean, cues?: MotionCues): void;
  /**
   * Afloat, the origin on the surface: a crawl at speed, treading water when
   * still. `under` is how far under the surface the body is, 0 to 1: under
   * it the stroke slows into a long pull and a glide.
   */
  swim(dt: number, speed: number, under?: number): void;
  /** Where the stroke is in its cycle, 0 to 1; what the body's roll keeps time with. */
  readonly stroke: number;
  /** The relaxed idle and nothing else, the weights blended `rate` times as fast: a seat, a helm. */
  still(dt: number, rate?: number): void;
  /** Back on the ground: `hardness` 0 for an ordinary jump, 1 for a fall that should have hurt. */
  land(hardness: number): void;
  /** Carries everything this body was doing onto another, mid-step. */
  rebind(person: Person): void;
  /**
   * Takes off what this motion turned by hand, before the person goes back
   * to the pool (`Cast.release`): see `Motion`'s note on the mixer.
   */
  unlay(): void;
  /** A standing start, the cycle at zero. */
  reset(): void;
  /**
   * A gesture over the standing pose, for the others to see: a wave plays
   * once, a dance and sitting down go on until the body moves off, swims or
   * is seated, or another gesture or `null` is asked. False where this body
   * has no clip for it.
   */
  emote(name: Emote | null): boolean;
  /** The gesture being made, or null. */
  readonly emoting: Emote | null;
}

/**
 * Which clip each gesture plays, and whether it goes on until the body moves.
 * The sitting clip is sat on a chair (`retarget-clips.ts`), and nothing here
 * brings one.
 */
const GESTURES: Readonly<Record<Emote, { clip: ClipName; loop: boolean }>> = {
  wave: { clip: 'Wave', loop: false },
  dance: { clip: 'Dance', loop: true },
  sit: { clip: 'Sit', loop: true },
};
/** How fast a gesture comes in and goes out, per second: a fifth of a second either way. */
const GESTURE_RATE = 10;
/** A body moving at more than this share of `WALK_SPEED`, or leaving the ground, ends its gesture. */
const GESTURE_MOVES = 0.15;

interface Clips {
  idle: THREE.AnimationAction;
  shift: THREE.AnimationAction;
  walk: THREE.AnimationAction;
  run: THREE.AnimationAction;
  air: THREE.AnimationAction;
  land: THREE.AnimationAction;
  swim: THREE.AnimationAction;
  tread: THREE.AnimationAction;
}

interface Weights {
  idle: number;
  walk: number;
  run: number;
  air: number;
  swim: number;
  tread: number;
}

const CLIP_OF: Readonly<Record<keyof Clips, ClipName>> = {
  idle: 'Idle_Neutral',
  shift: 'Idle_Shift',
  walk: 'Walk',
  run: 'Run',
  air: 'Jump',
  land: 'Jump_Land',
  swim: 'Swim',
  tread: 'Swim_Idle',
};

/** The actions of `person` a motion plays, started at no weight; the hand-driven ones held still. */
function clipsOf(person: Person): Clips {
  const clips = {} as Clips;
  for (const key of Object.keys(CLIP_OF) as (keyof Clips)[]) {
    const action = person.actions.get(CLIP_OF[key]);
    if (action === undefined) throw new Error(`motion: no ${CLIP_OF[key]} clip`);
    action.play();
    action.setEffectiveWeight(0);
    // A pooled person comes back with every action at a time scale of one.
    action.timeScale = 1;
    clips[key] = action;
  }
  // The walk, the run and the stroke are driven by distance, and the landing
  // by its own clock: all by hand, never by the mixer's.
  clips.walk.timeScale = 0;
  clips.run.timeScale = 0;
  clips.swim.timeScale = 0;
  clips.land.timeScale = 0;
  return clips;
}

const bone = (person: Person, name: string): THREE.Bone | null => person.bones.get(name) ?? person.bones.get(name.replace('.', '')) ?? null;

// Scratch for the hand-written turns, so a frame allocates nothing.
const rootTurn = new THREE.Quaternion();
const axisWorld = new THREE.Vector3();
const parentWorld = new THREE.Quaternion();
const parentInverse = new THREE.Quaternion();
const turnWorld = new THREE.Quaternion();

/**
 * Turns `bone` by `angle` about `axis`, a direction in world space, on top of
 * whatever the clips left it at: `L' = P^-1 T P L`, P its parent's world turn.
 */
function turnBone(target: THREE.Bone, axis: THREE.Vector3, angle: number): void {
  target.parent!.getWorldQuaternion(parentWorld);
  turnWorld.setFromAxisAngle(axis, angle);
  parentInverse.copy(parentWorld).invert();
  turnWorld.premultiply(parentInverse).multiply(parentWorld);
  target.quaternion.premultiply(turnWorld);
}

export function createMotion(first: Person): Motion {
  let person = first;
  let clips = clipsOf(person);
  const weights: Weights = { idle: 1, walk: 0, run: 0, air: 0, swim: 0, tread: 0 };
  let head = bone(person, 'Head');
  let chest = bone(person, 'Chest');
  let arms = [bone(person, 'UpperArm.L'), bone(person, 'UpperArm.R')] as const;
  /** Stride cycles completed, 0..1; stroke cycles, afloat. */
  let phase = 0;
  let stroke = 0;
  /** The share of the standing pose that is the second idle. */
  let shift = 0;
  let airTime = 0;
  let stillTime = 0;
  let fall = 0;
  let flail = 0;
  /** Seconds since touching down, its depth and how fast it plays; Infinity when none is playing. */
  let landAt = Infinity;
  let landPeak = 0;
  let landRate = 1;
  /** How far the landing gives way for a body moving off, 1 standing. */
  let landDamp = 1;
  let look = 0;
  let pitch = 0;
  let lastSpeed = 0;
  let accel = 0;
  /** The gesture asked for, its action on this person, how far in and how much of the pose it is. */
  let gesture: Emote | null = null;
  let gestureAction: THREE.AnimationAction | null = null;
  let gestureLoop = false;
  let gestureTime = 0;
  let gestureWeight = 0;

  function blend(dt: number, rate: number, target: Weights): void {
    const k = approach(rate, dt);
    weights.idle += (target.idle - weights.idle) * k;
    weights.walk += (target.walk - weights.walk) * k;
    weights.run += (target.run - weights.run) * k;
    weights.air += (target.air - weights.air) * k;
    weights.swim += (target.swim - weights.swim) * k;
    weights.tread += (target.tread - weights.tread) * k;
  }
  const target: Weights = { idle: 0, walk: 0, run: 0, air: 0, swim: 0, tread: 0 };
  const aim = (idle: number, walk: number, run: number, air: number, swim: number, tread: number): Weights => {
    target.idle = idle;
    target.walk = walk;
    target.run = run;
    target.air = air;
    target.swim = swim;
    target.tread = tread;
    return target;
  };

  /** The landing's share of the pose now: in over a twentieth of a second, out as the clip stands up. */
  function landing(): number {
    if (landAt === Infinity) return 0;
    const u = landAt * landRate;
    if (u >= clips.land.getClip().duration) {
      landAt = Infinity;
      return 0;
    }
    return landPeak * landDamp * smoothstep(u, 0, 0.05) * (1 - smoothstep(u, 0.45, 0.9));
  }

  /** The gesture's share of the pose this frame, its clip played by hand on its own clock. */
  function gesturing(dt: number): number {
    const action = gestureAction;
    if (action === null) return 0;
    const duration = action.getClip().duration;
    gestureTime += dt;
    // A one-off starts going out a fifth of a second before its end.
    if (gesture !== null && !gestureLoop && gestureTime >= duration - 0.2) gesture = null;
    gestureWeight += ((gesture !== null ? 1 : 0) - gestureWeight) * approach(GESTURE_RATE, dt);
    if (gesture === null && gestureWeight < 0.01) {
      dropGesture();
      return 0;
    }
    action.time = gestureLoop ? gestureTime % duration : Math.min(gestureTime, duration);
    action.setEffectiveWeight(gestureWeight);
    return gestureWeight;
  }

  function dropGesture(): void {
    gestureAction?.setEffectiveWeight(0);
    gestureAction?.stop();
    gestureAction = null;
    gesture = null;
    gestureWeight = 0;
  }

  function emote(name: Emote | null): boolean {
    if (name === null) {
      gesture = null;
      return true;
    }
    const wanted = GESTURES[name];
    const action = person.actions.get(wanted.clip);
    if (action === undefined) return false;
    if (gestureAction !== action) {
      // Another gesture's clip gives way at once; the weight it had carries on.
      if (gestureAction !== null) {
        gestureAction.setEffectiveWeight(0);
        gestureAction.stop();
      }
      action.reset().play();
      action.timeScale = 0;
      action.setEffectiveWeight(gestureWeight);
      gestureAction = action;
    }
    gesture = name;
    gestureLoop = wanted.loop;
    gestureTime = 0;
    return true;
  }

  function apply(dt: number): void {
    if (landAt !== Infinity) landAt += dt;
    const landed = landing();
    const gestured = gesturing(dt);
    const keep = (1 - landed) * (1 - gestured);
    clips.idle.setEffectiveWeight(weights.idle * (1 - shift) * keep);
    clips.shift.setEffectiveWeight(weights.idle * shift * keep);
    clips.walk.setEffectiveWeight(weights.walk * keep);
    clips.run.setEffectiveWeight(weights.run * keep);
    clips.air.setEffectiveWeight(weights.air * keep);
    clips.swim.setEffectiveWeight(weights.swim * (1 - gestured));
    clips.tread.setEffectiveWeight(weights.tread * (1 - gestured));
    clips.land.setEffectiveWeight(landed);
    if (landed > 0) clips.land.time = landAt * landRate;
    clips.walk.time = phase * clips.walk.getClip().duration;
    clips.run.time = ((phase + RUN_PHASE) % 1) * clips.run.getClip().duration;
    clips.swim.time = stroke * clips.swim.getClip().duration;
    unlay();
    person.mixer.update(dt);
    lay();
  }

  /**
   * What no clip does: the look, and the arms of a fall, turned about the
   * body's own axes.
   *
   * **Each turned bone is put back before the mixer runs** (`unlay`). The
   * mixer writes a bone only when the value its clips blend to has changed
   * since the last one it wrote, so a bone its clips hold still — the chest
   * in the relaxed idle — keeps whatever was done to it by hand, and a turn
   * laid on it every frame winds it round and round. The townsfolk's glance
   * puts the head back for the same reason.
   */
  function lay(): void {
    const looking = Math.abs(look) > 1e-3;
    const falling = fall > 1e-3;
    if (!looking && !falling) return;
    person.root.getWorldQuaternion(rootTurn);
    if (looking) {
      axisWorld.set(0, 1, 0).applyQuaternion(rootTurn);
      if (chest !== null) turn(0, chest, look * LOOK_CHEST);
      if (head !== null) turn(1, head, look * (1 - LOOK_CHEST));
    }
    if (falling) {
      // About the body's forward axis: +X is its left, so a left arm hanging
      // down swings out and up under a positive turn and a right arm under a
      // negative one.
      axisWorld.set(0, 0, 1).applyQuaternion(rootTurn);
      const wave = Math.sin(flail * Math.PI * 2) * FALL_FLAIL;
      if (arms[0] !== null) turn(2, arms[0], fall * (FALL_RAISE + wave));
      if (arms[1] !== null) turn(3, arms[1], -fall * (FALL_RAISE - wave));
    }
  }

  /** The bones `lay` turned this frame and what the clips had left them at. */
  const laid: (THREE.Bone | null)[] = [null, null, null, null];
  const before = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  function turn(slot: number, target: THREE.Bone, angle: number): void {
    if (laid[slot] === null) {
      laid[slot] = target;
      before[slot]!.copy(target.quaternion);
    }
    turnBone(target, axisWorld, angle);
  }
  function unlay(): void {
    for (let i = 0; i < laid.length; i++) {
      laid[i]?.quaternion.copy(before[i]!);
      laid[i] = null;
    }
  }

  function foot(dt: number, speed: number, airborne: boolean, cues?: MotionCues): void {
    person.root.position.set(0, 0, 0);
    const running = clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    // Half a walk is already walking: below that the legs would shuffle.
    const moving = clamp(speed / (WALK_SPEED * 0.5), 0, 1);
    const turning = Math.abs(cues?.turn ?? 0);
    const stepping = airborne ? 0 : (1 - moving) * clamp(turning / TURN_STEP_RATE, 0, 1) * TURN_STEP_SHARE;
    if (gesture !== null && (airborne || speed > WALK_SPEED * GESTURE_MOVES)) gesture = null;
    const length = mix(WALK_STRIDE, RUN_STRIDE, running);
    phase = (phase + (speed * dt) / length + stepping * TURN_CADENCE * dt) % 1;
    const up = airborne ? 1 : 0;
    // A jump starts its loop from the take-off, not wherever the clock left it.
    if (airborne && weights.air < 0.02) clips.air.time = 0;
    airTime = airborne ? airTime + dt : 0;
    stillTime = !airborne && speed < 0.1 && stepping < 0.05 ? stillTime + dt : 0;
    landDamp = 1 - 0.6 * moving;

    // Standing a while: a weight shift, then a look round, in turn.
    let shiftWanted = 0;
    let sweep = 0;
    if (stillTime > IDLE_WAIT) {
      const t = stillTime - IDLE_WAIT;
      const turn = Math.floor(t / IDLE_EVERY);
      const u = t - turn * IDLE_EVERY;
      if (turn % 2 === 0) shiftWanted = u < SHIFT_HOLD ? 1 : 0;
      else if (u < SWEEP_TIME) sweep = Math.sin((u / SWEEP_TIME) * Math.PI * 2) * SWEEP_REACH;
    }
    shift += (shiftWanted - shift) * approach(SHIFT_RATE, dt);

    const standing = (1 - moving) * (1 - up);
    blend(dt, BLEND_RATE, aim(
      standing * (1 - stepping),
      (moving * (1 - running) + (1 - moving) * stepping) * (1 - up),
      moving * running * (1 - up),
      up,
      0,
      0,
    ));

    // The head and chest towards the camera's look, standing.
    const asked = cues?.look ?? 0;
    const lookWanted =
      clamp(asked, -LOOK_LIMIT, LOOK_LIMIT) * (1 - smoothstep(Math.abs(asked), LOOK_FADE[0], LOOK_FADE[1])) * standing + sweep;
    look += (clamp(lookWanted, -LOOK_LIMIT, LOOK_LIMIT) - look) * approach(LOOK_RATE, dt);

    const falling = airborne && airTime > FALL_AFTER ? 1 : 0;
    fall += (falling - fall) * approach(falling > fall ? 4 : 12, dt);
    flail = (flail + dt * FALL_RATE) % 1;

    if (dt > 0) accel += ((speed - lastSpeed) / dt - accel) * approach(6, dt);
    lastSpeed = speed;
    const pitchWanted = clamp(accel * PITCH_GAIN, -MAX_PITCH, MAX_PITCH) * (1 - up);
    pitch += (pitchWanted - pitch) * approach(8, dt);
    person.root.rotation.set(pitch, 0, 0);
    apply(dt);
  }

  /** Everything the foot's extras carry, let go at once: afloat and seated they mean nothing. */
  function settle(): void {
    gesture = null;
    airTime = 0;
    stillTime = 0;
    fall = 0;
    look = 0;
    pitch = 0;
    accel = 0;
    shift = 0;
    person.root.position.set(0, 0, 0);
    person.root.rotation.set(0, 0, 0);
  }

  function swim(dt: number, speed: number, under = 0): void {
    settle();
    lastSpeed = speed;
    landAt = Infinity;
    stroke = (stroke + swimCadence(speed) * (1 - (1 - UNDER_CADENCE) * under) * dt) % 1;
    // Most of a crawl by a third of an easy pace, treading water under it;
    // under the surface a little of the treading stays in, which is the legs
    // kicking under a long pull.
    const paddling = smoothstep(speed, 0.2, SWIM_STROKE * 0.25) * (1 - 0.2 * under);
    blend(dt, SWIM_BLEND_RATE, aim(0, 0, 0, 0, paddling, 1 - paddling));
    apply(dt);
  }

  function still(dt: number, rate = 1): void {
    settle();
    lastSpeed = 0;
    blend(dt * rate, BLEND_RATE, aim(1, 0, 0, 0, 0, 0));
    apply(dt);
  }

  function land(hardness: number): void {
    const hard = clamp(hardness, 0, 1);
    landAt = 0;
    landPeak = mix(LAND_SOFT, 1, hard);
    landRate = mix(1.6, 1, hard);
    clips.land.time = 0;
  }

  function rebind(next: Person): void {
    unlay();
    const old = clips;
    person = next;
    clips = clipsOf(next);
    // The clocked clips take up where they were; the rest are written every frame.
    clips.idle.time = old.idle.time;
    clips.shift.time = old.shift.time;
    clips.air.time = old.air.time;
    clips.tread.time = old.tread.time;
    head = bone(next, 'Head');
    chest = bone(next, 'Chest');
    arms = [bone(next, 'UpperArm.L'), bone(next, 'UpperArm.R')] as const;
    // A gesture goes on in the new clothes where it was.
    if (gestureAction !== null) {
      const clip = gestureAction.getClip().name as ClipName;
      gestureAction.setEffectiveWeight(0);
      gestureAction.stop();
      gestureAction = null;
      const action = next.actions.get(clip);
      if (action !== undefined) {
        action.reset().play();
        action.timeScale = 0;
        gestureAction = action;
      } else gesture = null;
    }
    person.root.rotation.set(pitch, 0, 0);
    apply(0);
  }

  function reset(): void {
    phase = 0;
    stroke = 0;
    landAt = Infinity;
    lastSpeed = 0;
    aim(1, 0, 0, 0, 0, 0);
    Object.assign(weights, target);
    person.mixer.setTime(0);
    settle();
    dropGesture();
    foot(0, 0, false);
  }

  reset();
  return {
    get person() {
      return person;
    },
    get phase() {
      return phase;
    },
    get stroke() {
      return stroke;
    },
    foot,
    swim,
    still,
    land,
    rebind,
    // A person going back to the pool takes no gesture with it.
    unlay: () => {
      unlay();
      dropGesture();
    },
    reset,
    emote,
    get emoting() {
      return gesture;
    },
  };
}


// ---------------------------------------------------------------------------
// The hero
// ---------------------------------------------------------------------------

export interface Avatar {
  /** Origin between the feet, facing +Z. */
  group: THREE.Group;
  /** Walking, running, standing and airborne. Everything on foot. */
  stride(dt: number, speed: number, airborne: boolean, cues?: MotionCues): void;
  /**
   * Afloat. `sink` is how far the group hangs under the water's surface
   * (`Player.sink`), which the body gives back: the swimming clips are drawn
   * with the waterline at their origin. `under` is how far under the surface
   * the body has dived, 0 to 1.
   */
  swim(dt: number, speed: number, sink: number, under?: number): void;
  /** Back on the ground after a jump or a fall; see `Motion.land`. */
  land(hardness: number): void;
  /** At the launch's helm. `heel` is the craft's roll. */
  steer(dt: number, heel: number): void;
  /** Seated at the controls of the floatplane, hips at `FIGURE.hipY`. */
  sit(dt: number): void;
  /**
   * Astride — a saddle, a bicycle, a jet ski — hips at `FIGURE.hipY` as
   * seated, the legs to the seat's footrests or round its crank at `phase`,
   * the hands on its grip (`poseAstride` in `cast.ts`).
   */
  ride(dt: number, seat: AstrideSeat, phase: number): void;
  /** Back to a clean standing pose with the cycle at zero. For `goTo`. */
  reset(): void;
  /** A gesture, standing: see `Motion.emote`. */
  emote(name: Emote | null): boolean;
  /** The gesture being made, or null. */
  readonly emoting: Emote | null;
  /**
   * Where the gait is in its cycle, 0 to 1. The walk clip is played at this
   * phase and the run a fixed share ahead of it (`RUN_PHASE`), so a foot
   * comes down twice a cycle at fixed phases whichever of the two is
   * showing, and the footsteps in `audio.ts` are timed at 0 and a half: the
   * walk's left foot lands 3% into its cycle (measured off the bake on
   * 2026-09-24), within a frame of a step at a walk.
   */
  readonly phase: number;
  /** What it is wearing. */
  readonly appearance: Appearance;
  /**
   * Changes clothes: loads whatever outfit the new appearance needs, then
   * swaps the body under `group` between two frames. A later call wins over
   * one still loading.
   */
  wear(appearance: Appearance): Promise<void>;
}

/** One dressed body. Swapped whole by `wear`; the motion carries over. */
interface Rig {
  person: Person;
  appearance: Appearance;
  limbs: Limbs;
}

/**
 * Builds the body and returns the rig that poses it. Needs `prepareAvatar`
 * first. Without an appearance it is the hero, wearing what the player chose
 * and changing with `dressHero`; with one it wears that and nothing else.
 */
export function buildAvatar(appearance?: Appearance): Avatar {
  if (heroCast === null) throw new Error('avatar: call prepareAvatar() before buildAvatar()');
  const cast = heroCast;
  const hero = appearance === undefined;

  const group = new THREE.Group();
  group.name = 'avatar';
  /** Carries the seated offset, so `group` stays where `player.ts` puts it. */
  const body = new THREE.Group();
  group.add(body);

  function dress(wanted: Appearance): Rig {
    const person = cast.make(wardrobeOf(wanted), paintWith(coloursOf(wanted)), AVATAR_HEIGHT);
    // Measured in the bind pose, which `limbsOf` puts the skeleton in.
    const limbs = limbsOf(person);
    body.add(person.root);
    return { person, appearance: wanted, limbs };
  }

  const wanted = fitAppearance(appearance ?? chosen);
  const loaded = outfitsOf(wanted).every((outfit) => cast.has(outfit));
  // A choice whose outfits have not arrived is worn when they have; the
  // default is always loaded (`prepareAvatar`).
  let rig = dress(loaded ? wanted : DEFAULT_APPEARANCE);
  const motion = createMotion(rig.person);
  let asked = 0;

  function stride(dt: number, speed: number, airborne: boolean, cues?: MotionCues): void {
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    motion.foot(dt, speed, airborne, cues);
  }

  function swim(dt: number, speed: number, sink: number, under = 0): void {
    motion.swim(dt, speed, under);
    // The body rolls with the stroke, towards the arm that is pulling — a
    // crawl breathes on the roll — and rides a little up on each pull; both
    // by how much of the crawl is showing, and less under the surface, where
    // the stroke is a glide.
    const crawl = smoothstep(speed, 0.2, SWIM_STROKE * 0.25) * (1 - 0.5 * under);
    const turn = motion.stroke * Math.PI * 2;
    body.position.set(0, sink + (SWIM_LIFT + Math.abs(Math.sin(turn)) * SWIM_RIDE) * crawl * (1 - under), 0);
    body.rotation.set(0, 0, Math.sin(turn) * SWIM_ROLL * crawl);
  }

  const hipAt = new THREE.Vector3();
  const to = new THREE.Vector3();

  /**
   * Seated: the idle clip for everything above the waist, and the legs folded
   * by hand (`foldLegs` in `cast.ts`, which carries each foot, an IK control
   * under the root, to its folded ankle), because the pack has no sitting clip.
   */
  function sit(dt: number): void {
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    motion.still(dt, 4);
    foldLegs(rig.limbs, group, SEAT_THIGH, SEAT_SHIN);
    // Put this character's own hips where `FIGURE` says a seated hip is.
    hipAt.copy(group.worldToLocal(rig.limbs.hips.getWorldPosition(to)));
    body.position.x -= hipAt.x;
    body.position.y += FIGURE.hipY - hipAt.y;
    body.position.z -= hipAt.z;
  }

  function ride(dt: number, seat: AstrideSeat, phase: number): void {
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    motion.still(dt, 4);
    group.updateMatrixWorld(true);
    hipAt.copy(group.worldToLocal(rig.limbs.hips.getWorldPosition(to)));
    poseAstride(rig.limbs, group, hipAt, seat, phase);
    // The hips where `FIGURE` says a seated hip is, as `sit` puts them.
    hipAt.copy(group.worldToLocal(rig.limbs.hips.getWorldPosition(to)));
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
    motion.still(dt);
    body.rotation.set(0, 0, -heel * 0.65);
  }

  function reset(): void {
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    motion.reset();
  }

  async function wear(next: Appearance): Promise<void> {
    const ask = ++asked;
    const fitted = fitAppearance(next);
    await cast.ensure(outfitsOf(fitted));
    if (ask !== asked) return;
    const old = rig;
    // Whatever the old body was doing, the new one takes up mid-step: the
    // motion's weights and phase, and every clocked clip where it was.
    rig = dress(fitted);
    body.remove(old.person.root);
    motion.rebind(rig.person);
    cast.release(old.person);
  }

  if (hero) heroes.add(wear);
  if (!loaded) void wear(wanted);
  return {
    group,
    stride,
    swim,
    land: (hardness) => motion.land(hardness),
    steer,
    sit,
    ride,
    reset,
    wear,
    emote: (name) => motion.emote(name),
    get emoting() {
      return motion.emoting;
    },
    get phase() {
      return motion.phase;
    },
    get appearance() {
      return { ...rig.appearance };
    },
  };
}
