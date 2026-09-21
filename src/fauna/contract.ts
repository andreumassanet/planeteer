/**
 * The fauna kit: what a land animal is, how big it is, and how it walks.
 *
 * **This directory exists because a quadruped gait is not the biped rig with two
 * more legs**, and this project refused to build one for exactly that reason:
 * *a herd wants a quadruped kit with its own gait, and the nearest thing here is
 * a two-legged rig whose whole design rests on a knee only lifting a foot while
 * the thigh is behind vertical. A bad cow is worse than no cow.* That sentence
 * is right about the mechanism and it is the reason this file leads with the
 * arithmetic rather than with the models.
 *
 * The shape is `src/traffic/`'s, for the same reasons: a contract, a region
 * table, a registry over `parts/`, and a headless check that builds every animal
 * in every region and holds the result to the declaration. What it borrows from
 * `src/scenery/people.ts` instead is the *body*: six animals are one body plan
 * with different numbers in it, exactly as twenty-four villagers are, so the
 * part files are proportion tables and `body.ts` is the one thing that builds a
 * quadruped.
 */
import * as THREE from 'three';
import {
  AVATAR_HEIGHT,
  SCENERY_SCALE,
  createSceneryContext,
} from '../scenery/contract.ts';
import type { RegionStyle, SceneryContext } from '../scenery/contract.ts';
import { rngFrom } from '../scenery/random.ts';
import { onPalette, toned } from '../models.ts';
import type { Paint } from '../models.ts';
import type { Rng, Weighted } from '../scenery/random.ts';
import { swingLift } from '../avatar.ts';

// ---------------------------------------------------------------------------
// Scale: an animal is a living thing, and living things here are avatar-scale
// ---------------------------------------------------------------------------

/**
 * Units per metre for everything in this kit.
 *
 * **There are three scales in this world and an animal takes the person's.**
 * The kit compresses a metre to `SCENERY_SCALE`, 1.267 units — houses, roads,
 * street lamps, and vehicles as authored. A person is at *avatar* scale, 3.78,
 * because `AVATAR_HEIGHT` was decided before any of it. A vehicle is authored at
 * 1.267 and **placed** at twice it, which is a compromise: it fits the road at
 * one scale and the person at the other, and `traffic/contract.ts` writes down
 * that it can have only one of the two.
 *
 * **An animal has no road to fit**, so the compromise that forced the vehicles
 * is simply absent, and what is left is the relation the traffic kit says is the
 * one to be right about: the person you stand next to. So a cow is built against
 * him and nothing else.
 *
 * The arithmetic is the traffic file's own, run on a cow. At `SCENERY_SCALE` a
 * 1.4 m cow is **1.77 units against a 6.8-unit person: 26% of him, where life
 * gives 80%** — the roof-at-the-knee reading the traffic file calls *broken*
 * rather than toy, and worse here, because the error scales with how close the
 * object is to a person's size and a cow is closer than a car is. At avatar
 * scale she is 5.29 units, **78% of him**, which is what a cow looks like from
 * the gate.
 *
 * What it costs is the same thing every person in this world already costs: an
 * animal is 3x too big against the house behind her, exactly as the shepherd is.
 * That is not a new error and it is not this kit's to fix.
 *
 * Derived from `AVATAR_HEIGHT` rather than written down, so **the consequence
 * runs the same way `people.ts` records: change `AVATAR_HEIGHT` and every animal
 * on the planet moves**, which is correct — they are all one family of sizes.
 */
export const PERSON_METRES = 1.8;
export const FAUNA_SCALE = AVATAR_HEIGHT / PERSON_METRES;

/**
 * Metres to world units.
 *
 * **The traffic kit says "do not author in metres" and this kit does, and the
 * difference is whose decision the scale is.** There, the scale *was* the
 * decision under review — the whole file is an argument about whether a car
 * should be 1.267 or 3.78 — so quoting metres inside a part would have hidden
 * it. Here the scale is `AVATAR_HEIGHT`'s and is not up for discussion, and what
 * is up for discussion is whether a camel is taller than a horse. That has an
 * external ground truth every reader already has: a cow is 1.4 m at the withers
 * and a sheep is 0.9, and `m(1.4)` is checkable by anyone who has seen a cow
 * where `5.29` is checkable by nobody.
 */
export const m = (metres: number): number => metres * FAUNA_SCALE;

export { AVATAR_HEIGHT, SCENERY_SCALE };

/**
 * How many pixels one unit is at a given distance, on this project's own lens.
 *
 * The same `937 / distance` every other kit prices itself with. Quoted here
 * because the fauna are the one kit whose *correct* size was in doubt: see
 * `LEGIBILITY` below.
 */
export const LEGIBLE_AT = (distance: number): number => 937 / distance;

/**
 * What avatar scale buys, in pixels, and why nothing here needs the crop the
 * bird needed.
 *
 * `life.ts` had to enlarge its gull: *a herring gull is 1.4 m across, which at
 * `SCENERY_SCALE` is 1.8 units and at 300 units of distance is 5 pixels
 * including both wings* — so `BIRD_SPAN` is 4.2, a **2.37x crop**, and the trap
 * that records it is the smallest thing in the project to need one.
 *
 * **Avatar scale is a 2.98x enlargement over scenery scale and it is not a
 * crop**, and those two numbers are close enough to be worth saying out loud:
 * the gull's hand-tuned crop lands at **79% of the scale a living thing is
 * authored at in this world**. Sized the way this file sizes a sheep, the bird
 * would have been 5.29 units and would have needed no crop at all.
 *
 * So the fauna are checked against the same lens and pass without one:
 *
 * ```
 *                       real     scenery    avatar     px at 300u   px at 120u
 *   camel, nose to tail  3.0 m    3.80 u    11.33 u        35           88
 *   cattle, ditto        2.4      3.04       9.07          28           71
 *   horse, ditto         2.4      3.04       9.07          28           71
 *   sheep, ditto         1.3      1.65       4.91          15           38
 *   the gull, for scale  1.4      1.77       5.29 (4.2)    13 at 4.2
 * ```
 *
 * The sheep is the floor and it lands at 15 px at 300 units, two above the gull
 * the traps call *a bird*. Nothing in this kit is cropped.
 */
export const LEGIBILITY = { lens: 937, checkedAt: [300, 120, 40] } as const;

// ---------------------------------------------------------------------------
// The gait: one equation, and the two joints that read it in opposite directions
// ---------------------------------------------------------------------------

/**
 * Which way a joint's fold takes the segment below it.
 *
 * - `knee` — the lower segment swings **backward**. A human knee, and a
 *   quadruped's front carpus, which is its wrist: a horse picking up a fore foot
 *   tucks the hoof back under its chest.
 * - `hock` — the lower segment swings **forward**. The tarsus, which is a raised
 *   heel: a quadruped stands on its toes, so the joint that points backward out
 *   of a hind leg folds the cannon *toward* the belly.
 *
 * **Two segments per leg is not a simplification of the hind limb, it is the
 * hind limb you can see.** A real hind leg has a stifle (a true knee) as well,
 * and on a standing cow the stifle is *inside the flank* — above the belly line
 * and behind the barrel's silhouette. What stands clear of the body is the tibia
 * running down and back, the hock pointing back, and the cannon running down and
 * forward: one joint, folding the wrong way, which is the whole visual signature
 * of an animal's leg.
 */
export type Fold = 'knee' | 'hock';

/**
 * Absolute angle of the lower segment. **Positive is trailing**, matching
 * `avatar.ts`: a positive `rotation.x` on a hanging limb sends its distal end to
 * -Z, which is behind a body that faces +Z.
 */
export const lowerAngle = (upper: number, fold: number, kind: Fold): number =>
  kind === 'knee' ? upper + fold : upper - fold;

/**
 * How far below its attachment a hoof sits. **This is the equation the whole
 * kit turns on**, and it is the biped's own with the second angle left absolute
 * instead of being written as `upper + fold`.
 */
export const footDrop = (
  upperLength: number, lowerLength: number, upper: number, lower: number, hoof = 0,
): number => upperLength * Math.cos(upper) + lowerLength * Math.cos(lower) + hoof;

/**
 * **Whether folding this joint further lifts the foot or drives it into the
 * ground, and it is a test on the *lower* segment rather than on the upper
 * one.**
 *
 * `avatar.ts` states the biped version and states it in the upper segment:
 * *a leg's vertical reach is `thigh cos(h) + shin cos(h + k)`, which is longest
 * at `h + k = 0`, so a bent knee under a thigh that has already swung forward
 * pushes the foot down* — and the fix there is to gate the fold to a thigh
 * behind vertical. Both halves of that are true and neither transfers, because
 * the sentence names a joint that folds one way and a quadruped has one of each.
 *
 * Differentiate the drop with respect to the fold and the upper segment falls
 * out of it entirely:
 *
 * ```
 *   knee:   d(drop)/d(fold) = -L2 sin(lower)   lifts while  lower > 0   (trailing)
 *   hock:   d(drop)/d(fold) = +L2 sin(lower)   lifts while  lower < 0   (reaching)
 * ```
 *
 * So there is **one law and it is stated in the lower segment's absolute
 * angle**: *folding lifts the foot only while the fold is taking the lower
 * segment further from vertical.* The biped's `thigh behind vertical` is that
 * law's sufficient condition for a knee on a leg that is straight at rest, which
 * is the only leg a person has.
 *
 * Two things fall out of it and both are measured in `pnpm fauna`:
 *
 * - **The foreleg is the biped's problem word for word.** A fore limb is a
 *   near-vertical column at rest, so its lower segment sits at about zero and
 *   the sign of `sin(lower)` is whatever the swing has just done to it. It needs
 *   the gate, and it gets `avatar.ts`'s own `swingLift`.
 * - **The hind leg needs no gate at all, and the Z is why.** A hind leg is
 *   folded standing still — that is what the hock *is* — so `lower` is already
 *   negative before the cycle starts, by more than the swing can undo. The rest
 *   fold exceeds the swing amplitude and `sin(lower) < 0` holds for every phase,
 *   unconditionally. **The joint that looks like the hard one is the easy one**,
 *   and the reason is a fact about the animal rather than a choice about the rig.
 */
export const foldLifts = (lower: number, kind: Fold): boolean =>
  kind === 'knee' ? Math.sin(lower) > 0 : Math.sin(lower) < 0;

/**
 * A leg, as the four numbers the cycle needs and the two the rig does.
 *
 * `upperLength` and `lowerLength` are **solved rather than declared** — see
 * `solveLeg`. Declaring them is how an animal ends up hovering a tenth of a unit
 * over the ground or buried in it, and neither is visible in a thumbnail.
 */
export interface Leg {
  /** Height of the shoulder or hip above the ground, at rest. */
  attach: number;
  /** Where along +Z the leg hangs from. */
  z: number;
  /** Lateral offset from the centreline. Positive is the animal's left. */
  x: number;
  upperLength: number;
  lowerLength: number;
  upperRadius: number;
  lowerRadius: number;
  hoof: number;
  /** Rest angle of the upper segment. Positive trails. */
  restUpper: number;
  /** Rest fold. Always non-negative: a joint folds one way. */
  restFold: number;
  /** Radians the upper segment swings either side of its rest angle. */
  swing: number;
  /** Radians of extra fold at the top of the lift. */
  lift: number;
  kind: Fold;
  /** Where in the cycle this leg's footfall is, in turns. */
  offset: number;
}

/**
 * Solves the two segment lengths so that the hoof lands **exactly** on the
 * ground in the rest pose.
 *
 * `split` is the upper segment's share. The alternative is to declare both
 * lengths and hope, and the failure that produces is a herd standing a fraction
 * of a unit in the air — invisible at 30 pixels, and precisely the class of
 * mistake `ctx.box` stands on `y = 0` cost this project six times in one
 * afternoon. Here it cannot happen: change any proportion and the legs
 * re-length themselves against it.
 */
export function solveLeg(attach: number, hoof: number, restUpper: number, restFold: number, kind: Fold, split: number): [number, number] {
  const restLower = lowerAngle(restUpper, restFold, kind);
  const reach = split * Math.cos(restUpper) + (1 - split) * Math.cos(restLower);
  const total = (attach - hoof) / reach;
  return [total * split, total * (1 - split)];
}

/** Where one leg is at one phase of the cycle. Angles are absolute. */
export interface LegPhase {
  upper: number;
  lower: number;
  fold: number;
  /** Below the attachment. */
  drop: number;
  /** Above the ground, if the body has not moved. Negative digs. */
  footY: number;
  /** Fore-and-aft position of the hoof relative to the attachment. +Z is ahead. */
  footZ: number;
  /** Whether the fold is doing its job at this instant. */
  lifting: boolean;
}

/**
 * One leg at one phase, in turns.
 *
 * **The lift driver is `avatar.ts`'s `swingLift` and it is imported rather than
 * restated.** `people.ts` had to take that number back after copying it — *there
 * is one gait in this world and `avatar.ts` is where it is defined* — and the
 * fauna are the third body to need it. What is *not* imported is the gate, which
 * is `swingLift`'s own shape: it is non-zero only over the quarter cycle from
 * maximum retraction back to neutral, which is the first half of the forward
 * swing, and that window is where both a hoof and a boot want their clearance.
 */
export function legAt(leg: Leg, phase: number): LegPhase {
  const p = (phase + leg.offset) * Math.PI * 2;
  const upper = leg.restUpper + Math.sin(p) * leg.swing;
  const fold = leg.restFold + swingLift(p) * leg.lift;
  const lower = lowerAngle(upper, fold, leg.kind);
  const drop = footDrop(leg.upperLength, leg.lowerLength, upper, lower, leg.hoof);
  return {
    upper,
    lower,
    fold,
    drop,
    footY: leg.attach - drop,
    footZ: -(leg.upperLength * Math.sin(upper) + leg.lowerLength * Math.sin(lower)),
    lifting: foldLifts(lower, leg.kind),
  };
}

/**
 * The footfall offsets of the two gaits this kit walks, as fractions of a cycle,
 * in the order `[left hind, left fore, right hind, right fore]`.
 *
 * - **`walk`** is the four-beat lateral sequence every hoofed animal uses at
 *   low speed: LH, LF, RH, RF, evenly spaced. Two things fall out of it and
 *   both matter more here than they would in a game with a skeleton: the two
 *   fore legs are exactly half a cycle apart and so are the two hind, which is
 *   the quadruped spelling of the one thing a gait cannot get wrong — the crowd
 *   shipped an **ipsilateral** walk for months and `pnpm life` now asserts
 *   against it; and with each foot lifted for about a quarter of the cycle,
 *   **three feet are on the ground at any instant**, which is why a frozen
 *   frame of this does not float and why a merged herd can be built out of it.
 * - **`pace`** is the two-beat lateral amble: both legs on one side swing
 *   together. It is what a camel does and what makes it roll, and it is the
 *   whole reason a camel reads differently from a cow at 80 pixels without a
 *   single extra triangle. The pairs are offset by a twelfth rather than being
 *   exactly together, because a true pace is a racing gait and an ambling camel
 *   breaks it slightly — and because exactly together leaves the animal on two
 *   feet at every phase instead of two-or-three.
 */
export const GAITS = {
  walk: [0, 0.25, 0.5, 0.75],
  pace: [0, 0.08, 0.5, 0.58],
} as const;

export type GaitName = keyof typeof GAITS;

/** Index into a leg array: the order `GAITS` is written in. */
export const LEG_ORDER = ['left-hind', 'left-fore', 'right-hind', 'right-fore'] as const;

// ---------------------------------------------------------------------------
// The animal
// ---------------------------------------------------------------------------

/**
 * How big an animal may come out, and how many of it stand together.
 *
 * Two bands rather than a species list, on the traffic kit's argument: the caps
 * exist to catch a model that has quietly grown, not to describe a taxonomy. A
 * crowd person is ~296 triangles and that is the yardstick — **an animal is the
 * object you stand next to, exactly as a person is**, so it gets the same order
 * of budget and not a scatter-part's ninety.
 */
export interface KindSpec {
  /** Longest a built variant may come out, nose to tail. */
  length: number;
  minLength: number;
  /** Widest, across the shoulders. */
  width: number;
  /** Tallest, which for most of these is the head and not the withers. */
  height: number;
  minHeight: number;
  triangles: number;
  meshes: number;
  /**
   * Cap on distinct palette colours. Tighter than the triangle cap for the
   * scenery kit's reason: a colour is a draw call however the thing is drawn,
   * and a herd is merged into one buffer per site.
   */
  colors: number;
  /** How many stand in one group, `[min, max]` inclusive. */
  group: readonly [number, number];
}

/**
 * **The two bands are about how many stand together, not about how big they
 * are**, and the sizes fell out of that rather than the other way round.
 * Gregarious animals — sheep, llamas, reindeer — are `small` and come in fours
 * to nines; cattle, horses and camels are `large` and come in threes to sixes.
 * Measured over the built kit the length bands land at 5.6-8.9 and 10.3-12.6
 * units with nothing between them, which is a coincidence worth naming: the
 * animals people keep in big flocks really are the small ones.
 */
export type AnimalKind = 'small' | 'large';

export const KINDS: Record<AnimalKind, KindSpec> = {
  small: { length: 9.5, minLength: 4.0, width: 2.8, height: 7.5, minHeight: 2.2, triangles: 320, meshes: 24, colors: 4, group: [4, 9] },
  large: { length: 14.0, minLength: 9.0, width: 4.0, height: 12.5, minHeight: 4.2, triangles: 340, meshes: 28, colors: 5, group: [3, 6] },
};

/**
 * How many variants of one animal a region builds.
 *
 * Six, the scenery kit's number rather than the traffic kit's four, and the
 * reason is the reason the traffic kit gives for its own: **a vehicle's
 * variation is nearly all colour and an animal's is not.** A herd of six
 * identical cows is a bug you can see from the road; a herd of six cows that
 * differ in height, in barrel depth, in horn and in pose is a herd. None of that
 * is colour and all of it has to be decided at build time, because the mesh is
 * merged and cannot be scaled per instance without carrying the inverse
 * transpose through `OutlineEffect`'s hull.
 */
export const VARIANTS = 6;

/**
 * What a species is, as proportions.
 *
 * Read it as a side elevation: the frame first, then the neck and head, then
 * the legs, then the things that stick out. Every length is in metres and every
 * angle is in radians.
 */
export interface AnimalShape {
  // --- the frame ---
  /** Height of the shoulder. The animal's headline number. */
  withers: number;
  /** Height of the hip. Higher than the withers on a young or hunched animal. */
  croup: number;
  /** Shoulder to hip along the spine. */
  bodyLength: number;
  /** Top of the back to the bottom of the chest. */
  barrelDepth: number;
  barrelWidth: number;
  /** Chest width against rump width. Over 1 is deep-chested. */
  chestFore: number;

  // --- the neck and the head ---
  neckLength: number;
  /** Above horizontal. 0 is a grazing pose held permanently; 1.2 is upright. */
  neckRise: number;
  neckThick: number;
  headLength: number;
  headDepth: number;
  headWidth: number;
  /** Muzzle half-width as a fraction of the head's. Under 1 tapers. */
  muzzle: number;
  /** Ear length. Zero leaves them off. */
  ear: number;
  /** How far out from the skull the ears sit, in radians. */
  earFlare: number;

  // --- the legs ---
  legThick: number;
  cannonThick: number;
  /** Radians the fore and hind uppers swing either side of rest. */
  foreSwing: number;
  hindSwing: number;
  /** Radians of extra fold at the top of the lift. */
  foreLift: number;
  hindLift: number;

  // --- what sticks out ---
  /** Height of a hump above the back line. Zero leaves it off. */
  hump: number;
  /** Where along the spine the hump sits, 0 at the shoulder, 1 at the hip. */
  humpAt: number;
  /** Crest along the neck: a horse's mane, a camel's ruff. */
  mane: number;
  /** Tail length. Zero leaves it off. */
  tail: number;
  /** Tuft at the end of it: a cow's switch. Zero is a deer's scut. */
  tailTuft: number;
  horns: 'none' | 'cow' | 'curl' | 'antler';
  hornSize: number;
  /**
   * How woolly. Swells the barrel and adds a second, offset mass over it, which
   * is what turns a smooth silhouette into a shaggy one for 24 triangles.
   */
  fleece: number;

  // --- colour, out of the palette and never blended ---
  coat: number;
  /** Belly, inner legs, muzzle. */
  under: number;
  /** Hooves, horns, nose, the tip of the tail. The dark that reads at 15 px. */
  point: number;
  /** Face and lower legs. Equal to `coat` leaves the head plain. */
  face: number;
}

/**
 * One entry in a species' coat list.
 *
 * `pale` is the only regional lever this kit has on colour and it is a **weight
 * rather than a blend**, which is forced rather than chosen: `ctx.toon` throws
 * on any colour that is not in `PALETTE`, so there is no way to take a coat 40%
 * toward the ground and the only thing a region can move is which coats are
 * drawn at all. The traffic kit met the same wall from the other side — *the
 * regional signal in `paint` is saturation and not hue* — and this is the same
 * sentence about a cow.
 */
export interface Coat {
  color: number;
  weight: number;
  /** A dust-coloured coat: weighted up where the ground is dry. */
  pale?: boolean;
}

/** Draws a coat, letting the region's `dust` push the choice toward the ground. */
export function coatFor(rng: Rng, style: FaunaStyle, coats: readonly Coat[]): number {
  return rng.weighted(
    coats.map((entry) => ({
      item: entry.color,
      weight: entry.weight * (entry.pale === true ? 1 + style.dust * 2.2 : 1 - style.dust * 0.42),
    })),
  );
}

/**
 * What a part file declares.
 *
 * `shape` is the whole model — see `body.ts` — and it takes an `Rng` because the
 * variation is structural. Everything in it is in **metres**; `buildAnimal`
 * converts once.
 *
 * **`shape` is published and `build` is a wrapper over it**, which is the split
 * `people.ts` arrived at: *`build(ctx, rng, style)` has nowhere to put a climate
 * or a pose, so the part files are three lines each and the real entry is
 * `buildPerson(ctx, look)`.* Here the missing argument is the pose. `build`
 * always returns the animal **standing**, because that is the box `size`
 * declares and a grazing animal is a different box; a placer that wants a herd
 * with its heads down calls `buildAnimal(ctx, animal.shape(rng, style), pose)`.
 */
export interface Animal {
  /** Kebab-case, unique, and the file is named after it: `camel.ts`. */
  id: string;
  name: string;
  kind: AnimalKind;
  /**
   * The box every variant must stay inside: `[length, width, height]`, in world
   * units.
   *
   * Three numbers and not a radius, for the traffic kit's reason with a
   * different placer at the other end: a herd has to space its members and a
   * camel is four times as long as it is wide, so a bounding radius would put
   * them a camel apart across and half a camel apart end to end. `validateAnimal`
   * holds every variant to all three from both sides.
   */
  size: readonly [number, number, number];
  gait: GaitName;
  /** One line on the sheet: what this is and where it stands. */
  note?: string;
  /** The proportions of one variant, in metres. Deterministic in `rng` and `style`. */
  shape(rng: Rng, style: FaunaStyle): AnimalShape;
  /** Builds one variant standing, facing +Z, on y = 0, centred in x and z. */
  build(ctx: FaunaContext, rng: Rng, style: FaunaStyle): THREE.Group;
  /**
   * The baked CC0 rigs this animal is drawn with in the world (see
   * `scripts/build-kit.ts`), by weight, each with the role every colour slot of
   * the pack plays in this animal's coat. `shape` still draws the variant — its
   * coat, belly, points and face come out of the same `rng` — and a rig is
   * fitted to `size[0]` along its length.
   *
   * Absent means the code-built body; the camel is the one left, because no
   * CC0 camel exists in the style.
   */
  rigs?: readonly RigChoice[];
}

/**
 * Which part of an animal's coat one of a rig's colour slots is: the shape's
 * own four colours, a darker or lighter tone of the coat, or a palette colour
 * outright (a cow's horns, an eye).
 */
export type CoatRole = 'coat' | 'under' | 'point' | 'face' | 'dark' | 'light' | number;

export interface RigChoice {
  /** A rig id in `public/models/fauna/`. */
  id: string;
  weight: number;
  /** Slot name -> role. A slot not named keeps its nearest palette colour. */
  slots: Readonly<Record<string, CoatRole>>;
}

/** The paint for one variant of a rigged animal, from the colours its `shape` drew. */
export function rigPaint(shape: AnimalShape, choice: RigChoice): Paint {
  return (slot, original) => {
    const role = choice.slots[slot];
    if (role === undefined) return onPalette(original);
    if (typeof role === 'number') return role;
    if (role === 'dark') return toned(shape.coat, 0.78);
    if (role === 'light') return toned(shape.coat, 1.18);
    return shape[role];
  };
}


/** The seed for one variant. Identity, not order: see `scenery/random.ts`. */
export function variantRng(animal: Animal, style: FaunaStyle, variant: number): Rng {
  return rngFrom(animal.id, style.id, variant);
}

/**
 * What an animal is drawn in, region by region.
 *
 * Thin on purpose, and the reason is the one `dress.ts` makes about people:
 * **an animal's colour is a fact about the animal and not about the country**.
 * A Friesian is black and white in Chile and in Denmark. So the species carries
 * its own coats and the region carries only what genuinely varies with place —
 * which breeds are here at all, and how dusty the ground has made them.
 */
export interface FaunaStyle {
  id: string;
  name: string;
  note: string;
  /** Which animals stand here at all, before the biome has its say. */
  stock: readonly Weighted<string>[];
  /**
   * How much the local dust has taken the coat toward the ground. 0 is a washed
   * Friesian, 1 is a Sahelian zebu. Multiplies, so a black coat stays dark.
   */
  dust: number;
  /** How many head stand together here, as a multiplier on the kind's group. */
  density: number;
}

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------

export interface FaunaContext extends SceneryContext {
  /**
   * A tapered prism **hanging from the origin**: top face at `y = 0`, bottom at
   * `y = -length`.
   *
   * Every other primitive in this project stands on `y = 0`, which is the right
   * convention for a house and the wrong one for a limb. A leg is a chain of
   * joints and a joint is a `Group` whose child hangs *below* it, so a segment
   * built standing has to be pushed down by its own length by every caller —
   * which is `ctx.box` stands on `y = 0` waiting to happen, six times, once per
   * segment. Hanging is the convention here and it is stated once.
   *
   * `sides` is an ink decision before it is a geometry one, the way the wheel's
   * is: a cannon is one or two pixels wide at every distance an animal is seen
   * from, so three sides is not a saving, it is the correct number.
   */
  hang(length: number, topRadius: number, bottomRadius: number, color: number, sides?: number): THREE.Mesh;

  /**
   * A barrel: a tapered prism lying along **+Z**, its axis on `y = 0`, with
   * independent width and depth.
   *
   * Built as a group carrying the section scale over a child carrying the
   * rotation, which composes as `S * R` — rotation first, then scale — so the
   * scale lands on the world axes and not on the prism's own. That is the
   * Citadelle's arrangement and it is the one transform pair this contract
   * cannot express any other way: `Three` composes `T * R * S`, so putting both
   * on one object applies the scale in the prism's frame, where +Y is the length.
   */
  barrel(length: number, aftRadius: number, foreRadius: number, flatten: number, color: number, sides?: number): THREE.Group;
}

const round = (value: number): string => value.toFixed(2);

export function createFaunaContext(base: SceneryContext = createSceneryContext()): FaunaContext {
  const meshOf = (geometry: THREE.BufferGeometry, color: number): THREE.Mesh => {
    const faceted = geometry.index ? geometry.toNonIndexed() : geometry;
    if (faceted !== geometry) geometry.dispose();
    faceted.computeVertexNormals();
    return new THREE.Mesh(faceted, base.toon(color));
  };

  const prism = (length: number, bottom: number, top: number, color: number, sides: number): THREE.Mesh => {
    const n = Math.max(3, Math.round(sides));
    // `CylinderGeometry` takes radii to the *corner*; every half-width in this
    // project is across the flats, so divide by the apothem ratio. Without it a
    // three-sided cannon is twice the thickness it was asked for.
    const toCorner = 1 / Math.cos(Math.PI / n);
    const geometry = new THREE.CylinderGeometry(top * toCorner, bottom * toCorner, length, n, 1, false, Math.PI / n);
    return meshOf(geometry, color);
  };

  return {
    ...base,

    hang(length, topRadius, bottomRadius, color, sides = 4) {
      const mesh = prism(length, bottomRadius, topRadius, color, sides);
      mesh.position.y = -length / 2;
      return mesh;
    },

    barrel(length, aftRadius, foreRadius, flatten, color, sides = 6) {
      // The prism is built about +Y with `aftRadius` at its base, then laid down
      // so its base points to -Z. `rotation.x = +PI/2` sends +Y to +Z; the other
      // sign sends it to -Z and builds every animal facing backwards, which is
      // invisible on a symmetric barrel and obvious on a head.
      const mesh = prism(length, aftRadius, foreRadius, color, sides);
      mesh.rotation.x = Math.PI / 2;
      const group = new THREE.Group();
      // Scale on the parent, rotation on the child: `S * R`, so `y` flattens the
      // finished barrel's depth. A single object carrying both would apply the
      // scale in the prism's own axes, where `y` is the length — which is the
      // Citadelle's prow, and the one transform pair this contract cannot
      // express any other way.
      group.scale.set(1, flatten, 1);
      group.add(mesh);
      return group;
    },
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface Extent {
  length: number;
  width: number;
  height: number;
  /** Lowest point. Anything below zero is a hoof through the ground. */
  floor: number;
  centreX: number;
  centreZ: number;
}

export function extentOf(group: THREE.Group): Extent {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return { length: 0, width: 0, height: 0, floor: 0, centreX: 0, centreZ: 0 };
  return {
    length: box.max.z - box.min.z,
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
    floor: box.min.y,
    centreX: (box.min.x + box.max.x) / 2,
    centreZ: (box.min.z + box.max.z) / 2,
  };
}

/**
 * Every complaint about one built variant.
 *
 * **The declaration is checked from both sides**, which is the traffic kit's
 * rule and it matters more here: a herd spaces its members off `size`, so an
 * animal that declares itself a third longer than it is leaves gaps in the field
 * and one that declares itself shorter puts a camel's nose through the next
 * camel's flank. Neither is visible in a thumbnail and both are one subtraction.
 */
export function validateAnimal(animal: Animal, group: THREE.Group): string[] {
  const problems: string[] = [];
  const spec = KINDS[animal.kind];
  const built = extentOf(group);

  let meshes = 0;
  let triangles = 0;
  const colors = new Set<number>();
  let untoned = 0;
  let smooth = 0;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    meshes++;
    const position = mesh.geometry.getAttribute('position');
    if (position === undefined) return;
    triangles += (mesh.geometry.index ? mesh.geometry.index.count : position.count) / 3;
    if (mesh.geometry.index) smooth++;
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    const hex = material?.userData.atlasToon as number | undefined;
    if (hex === undefined) untoned++;
    else colors.add(hex);
  });

  if (group.position.lengthSq() > 1e-8 || group.rotation.x !== 0 || group.rotation.y !== 0 || group.rotation.z !== 0) {
    problems.push('the root group carries a transform — a placer owns that');
  }
  if (untoned > 0) problems.push(`${untoned} mesh(es) not built through ctx.toon`);
  if (smooth > 0) {
    // The land is non-indexed on purpose and so is every monument: one normal a
    // face is what makes the cel bands step. An indexed mesh here would be the
    // only smooth-shaded thing in the frame, which is the fault `avatar.ts`
    // found in its own ten capsules.
    problems.push(`${smooth} mesh(es) are indexed and will shade smooth`);
  }

  // --- the ground -------------------------------------------------------
  if (built.floor < -0.02) problems.push(`stands ${round(-built.floor)} below y = 0 — a hoof through the ground`);
  if (built.floor > 0.06) problems.push(`floats ${round(built.floor)} above y = 0`);
  if (Math.abs(built.centreX) > 0.25) problems.push(`not centred in x: ${round(built.centreX)}`);
  if (Math.abs(built.centreZ) > 0.9) problems.push(`not centred in z: ${round(built.centreZ)}`);

  // --- the declaration --------------------------------------------------
  const [length, width, height] = animal.size;
  const over = (built: number, declared: number, axis: string): void => {
    if (built > declared + 0.02) problems.push(`${axis} ${round(built)} over its declared ${round(declared)}`);
    // A declaration comfortably too big is the same fault seen from the other
    // side: a placer that reserves a camel's length for a sheep leaves a field
    // with four animals in it.
    else if (built < declared * 0.88) problems.push(`${axis} ${round(built)} well under its declared ${round(declared)}`);
  };
  over(built.length, length, 'length');
  over(built.width, width, 'width');
  over(built.height, height, 'height');

  if (length > spec.length) problems.push(`declared length ${round(length)} over the ${animal.kind} cap ${spec.length}`);
  if (length < spec.minLength) problems.push(`declared length ${round(length)} under the ${animal.kind} floor ${spec.minLength}`);
  if (width > spec.width) problems.push(`declared width ${round(width)} over the ${animal.kind} cap ${spec.width}`);
  if (height > spec.height) problems.push(`declared height ${round(height)} over the ${animal.kind} cap ${spec.height}`);
  if (height < spec.minHeight) problems.push(`declared height ${round(height)} under the ${animal.kind} floor ${spec.minHeight}`);

  // --- budget -----------------------------------------------------------
  if (triangles > spec.triangles) problems.push(`${triangles} triangles over the ${animal.kind} cap ${spec.triangles}`);
  if (meshes > spec.meshes) problems.push(`${meshes} meshes over the ${animal.kind} cap ${spec.meshes}`);
  if (colors.size > spec.colors) problems.push(`${colors.size} colours over the ${animal.kind} cap ${spec.colors}`);
  // The scenery kit's own tell, and it caught a whole jungle: a part well under
  // its budget has usually thrown something away.
  if (triangles < spec.triangles * 0.28) {
    problems.push(`only ${triangles} triangles of a ${spec.triangles} budget — has something been dropped?`);
  }

  return problems;
}

export type { Measurements } from '../monuments/contract.ts';
export { measure, paletteName } from '../monuments/contract.ts';
export type { Group, Mesh, Object3D, Vector3 } from '../monuments/contract.ts';
export type { Rng, Weighted, RegionStyle, SceneryContext };
export { rngFrom };
export { swingLift };
