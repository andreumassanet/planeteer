/**
 * One parametric body, and a different species is a different set of numbers.
 *
 * `scenery/people.ts` is the model and the debt to it is total: `Figure`
 * describes a species, `Look` describes one member of it, `buildPerson` reads
 * nothing else and touches no `Rng`, so one `Look` is one body for ever. All
 * three of those hold here. What is added is the one thing a crowd of humans
 * never needed — **the topology moves too.** A `Morph` says how many legs, how
 * many arms, how many trunk segments, how many eyes and what is on the crown,
 * and the builder below reads those the way `buildPerson` reads a limb length.
 * A martian with four arms and a venusian with two are the same code.
 *
 * ## Soft bodies on a skeleton
 *
 * A body is **rounded sections hung on joints**: every limb a tapered capsule
 * whose cap at the joint end is a ball, so a joint bent any way still reads as
 * one continuous limb and never as two sticks meeting at a corner; the trunk and
 * the head are lathed eggs; the eyes are balls with an ink pupil. The sections
 * carry **smooth normals**, the way the cast's baked bodies do (`cast.ts`), so
 * the light rolls round a shoulder rather than stepping across a facet, and the
 * hide is **counter-shaded** a vertex at a time — a lighter belly and muzzle, a
 * darker back — which is how a painted creature is painted.
 *
 * The joints are `Bone`s, so one build serves twice: as a still (`buildAlien`,
 * posed and stood on its own feet, which is what the check script measures) and as the rig of an animated walker (`worlds/aliens.ts`
 * merges the sections into one skinned mesh, each bound wholly to its joint,
 * and moves the bones). A section is bound rigidly and the ball at its joint is
 * what hides the seam, which is the oldest trick there is for a jointed figure
 * and costs no weights.
 *
 * ## What was taken from `people.ts` and what could not be
 *
 * **Taken, because they are facts about bodies rather than about humans:**
 *
 * - **A static pose has to be in double support**, and the knee is what decides
 *   it. A body frozen mid-swing has one foot in the air, which is correct in an
 *   animation and reads as *floating* in a still. Measured on Earth: a trailing
 *   knee of 0.76 left **0.352 units of daylight, eight pixels at 40 units**, and
 *   0.40 left 0.001. The builder drops the whole body onto its own lowest sole,
 *   exactly as `buildPerson` does.
 * - **A limb's vertical reach is `thigh cos h + shin cos(h + k)`, which is
 *   longest at `h + k = 0`** — so a bent knee under a thigh that has already
 *   swung *forward* pushes the foot down. The fold is gated to a thigh at or
 *   behind vertical in a still; the walk cycle (`worlds/aliens.ts`) bends the
 *   knee only on the swing, where the foot is meant to clear the ground.
 * - **An arm hangs inside the body unless it is deliberately splayed.** Two
 *   files on Earth found this independently and arrived at the same 0.22, and
 *   it is not comfort, it is *whether the figure has arms at all*. Four arms
 *   hanging inside a deep trunk is one arm's worth of silhouette.
 *
 * **Not taken, and each is a decision rather than an omission:**
 *
 * - **No `Figure` and no `FIGURE`.** There is no alien player, so there is
 *   nothing to agree with; a `Morph` is free to be whatever it is. What it must
 *   **not** do is drift towards the avatar's numbers by imitation, which is why
 *   every proportion here is a *share of the body's own height* and not a unit.
 * - **No child.** `CHILD_BODY` is a second `Figure` with the head kept and the
 *   legs shortened, because a child is not a small adult. That relation is a
 *   fact about *human* growth and asserting it of an invented species would be
 *   inventing a second thing. The height spread does the work instead.
 *
 * ## The angles
 *
 * Every joint turns about its own X, and the signs are written once here so
 * nobody has to rediscover them from a screenshot: the body faces **+Z**; a
 * hanging limb swung **forward** is a *negative* turn about X (its far end goes
 * to +Z); a knee **bends** positive (the foot goes back); an elbow bends
 * negative (the hand comes forward); a trunk leaning **forward** is positive.
 * `ALIEN_POSES` is written in swings and bends, never in raw turns.
 */

import type { Bone, BufferGeometry, Group, Mesh, Object3D } from 'three';
import type { SceneryContext } from '../scenery/contract.ts';
import type { Alien, Morph, Species } from './contract.ts';
import type { Nation } from './contract.ts';
import type { Rng } from '../scenery/random.ts';
import { PALETTE } from '../theme.ts';

type Three = SceneryContext['THREE'];

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// The skeleton, derived
// ---------------------------------------------------------------------------

/**
 * Every length a builder needs, in world units, derived from the `Morph`'s
 * shares and one height.
 *
 * It is a derivation and not a table for the reason `scaleFigure` is one on
 * Earth: a species is a set of *ratios*, and a member of it is one number. Two
 * tables would be two places for a shoulder to be.
 */
interface Frame {
  height: number;
  head: number;
  neck: number;
  shoulder: number;
  hip: number;
  ankle: number;
  thigh: number;
  shin: number;
  upperArm: number;
  forearm: number;
  hand: number;
  shoulderHalf: number;
  hipHalf: number;
  depth: number;
  headHalf: number;
  limbR: number;
  legX: number;
  armX: number;
}

const NECK_SHARE: Record<Morph['neck'], number> = {
  none: 0.005,
  short: 0.035,
  long: 0.09,
  stalk: 0.16,
};

function frameOf(morph: Morph, height: number, girth: number): Frame {
  const head = height / morph.heads;
  const chin = height - head;
  const neck = height * NECK_SHARE[morph.neck];
  const shoulder = chin - neck;
  const hip = height * morph.legShare;
  // The ankle is what the foot fills; the two long bones share what is left,
  // and the thigh takes the larger share because on every body that walks it
  // does.
  const ankle = hip * 0.09;
  const thigh = (hip - ankle) * 0.53;
  const shin = (hip - ankle) * 0.47;
  const armSpan = shoulder - hip * 0.62;
  const shoulderHalf = height * morph.shoulderShare * girth;
  const hipHalf = height * morph.hipShare * girth;
  // A big head is a round one: under about three and a half heads to the body
  // the skull widens toward a ball, which is what turns a Floater's head into
  // the bag it is meant to be rather than a tall box with eyes.
  const round = Math.min(1, Math.max(0, (3.5 - morph.heads) / 1.2));
  return {
    height,
    head,
    neck,
    shoulder,
    hip,
    ankle,
    thigh,
    shin,
    upperArm: armSpan * 0.5,
    forearm: armSpan * 0.38,
    hand: armSpan * 0.12,
    shoulderHalf,
    hipHalf,
    depth: height * morph.shoulderShare * morph.depth * girth,
    headHalf: head * (0.3 + 0.12 * round),
    limbR: height * morph.limbR * girth,
    legX: hipHalf * 0.55,
    armX: shoulderHalf * 0.94,
  };
}

// ---------------------------------------------------------------------------
// The sections
// ---------------------------------------------------------------------------

/** A profile point: radius out from the axis, then height. */
type Ring = readonly [number, number];

/**
 * A surface of revolution about Y, from a profile and a number of sides, with
 * a single vertex wherever the radius is 0 (a pole) and **smooth normals**.
 *
 * The winding follows the profile: a profile read **upward on the outside** —
 * or, for a closed shell, counter-clockwise in the radius-height plane — faces
 * outward. The angle starts at +Z, the way the figure faces, and runs toward
 * +X; `arc` short of a full turn leaves the surface open at both ends of it.
 */
function lathe(T: Three, profile: readonly Ring[], sides: number, arc = TAU, start = 0): BufferGeometry {
  const full = arc >= TAU - 1e-6;
  const around = full ? sides : sides + 1;
  const positions: number[] = [];
  const index: number[] = [];
  const rows: { first: number; pole: boolean }[] = [];
  for (const [r, y] of profile) {
    const first = positions.length / 3;
    if (r <= 1e-9) {
      positions.push(0, y, 0);
      rows.push({ first, pole: true });
      continue;
    }
    for (let k = 0; k < around; k++) {
      const a = start + (k / sides) * arc;
      positions.push(Math.sin(a) * r, y, Math.cos(a) * r);
    }
    rows.push({ first, pole: false });
  }
  const at = (row: { first: number; pole: boolean }, k: number): number => (row.pole ? row.first : row.first + (full ? k % sides : k));
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if (a.pole && b.pole) continue;
    for (let k = 0; k < sides; k++) {
      const a0 = at(a, k);
      const a1 = at(a, k + 1);
      const b0 = at(b, k);
      const b1 = at(b, k + 1);
      if (a.pole) index.push(a0, b1, b0);
      else if (b.pole) index.push(a0, a1, b0);
      else index.push(a0, a1, b1, a0, b1, b0);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Scales a section and works its normals out again for the new shape. */
function scaled(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  geometry.scale(x, y, z);
  geometry.computeVertexNormals();
  return geometry;
}

/** An ellipsoid centred on its origin: `rings` rows between the poles. */
function blob(T: Three, rx: number, ry: number, rz: number, sides: number, rings: number): BufferGeometry {
  const profile: Ring[] = [[0, -1]];
  for (let k = 1; k <= rings; k++) {
    const p = (k / (rings + 1)) * Math.PI;
    profile.push([Math.sin(p), -Math.cos(p)]);
  }
  profile.push([0, 1]);
  return scaled(lathe(T, profile, sides), rx, ry, rz);
}

/**
 * A limb section hanging from its joint at `y = 0` down to `-length`, `r0`
 * wide at the joint and `r1` at the far end, **with a ball over the joint**:
 * the cap above `y = 0` is what fills the elbow when the forearm folds, so a
 * bent limb has no notch in it. Four bands of `sides`: 4 x sides triangles.
 */
function limb(T: Three, r0: number, r1: number, length: number, sides: number): BufferGeometry {
  return lathe(T, [[0, -length - r1 * 0.7], [r1, -length + r1 * 0.15], [r0, -r0 * 0.15], [0, r0 * 0.75]], sides);
}

/** Several sections as one geometry, which is one mesh against the mesh budget. */
function joined(T: Three, parts: readonly BufferGeometry[]): BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  for (const part of parts) {
    const base = positions.length / 3;
    const p = part.getAttribute('position');
    for (let i = 0; i < p.count; i++) positions.push(p.getX(i), p.getY(i), p.getZ(i));
    const own = part.index!;
    for (let i = 0; i < own.count; i++) index.push(base + own.getX(i));
    part.dispose();
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// The poses
// ---------------------------------------------------------------------------

/**
 * Four still poses, in swings and bends (see *The angles* above): a hip swung
 * forward is positive, a knee or an elbow bent is positive, an arm swung
 * forward is positive, a lean forward is positive.
 *
 * Both entries of a pair are the two sides, and they must not be equal in a
 * walk — an ipsilateral gait is the one thing a walk cannot get wrong, and
 * `POSES.walk` on Earth shipped that way for months. A second pair of legs
 * takes the *other* side's angles, which is a trot's diagonal and the only
 * four-legged stance that stands.
 */
interface PoseAngles {
  hip: readonly [number, number];
  knee: readonly [number, number];
  /** Per arm pair: swing at the shoulder. */
  arm: readonly [number, number];
  elbow: readonly [number, number];
  /** Outward splay of every arm. Never under about 0.2 — see the note above. */
  splay: number;
  lean: number;
  /** How far apart the feet stand, as a multiple of `legX`. */
  stance: number;
}

export const ALIEN_POSES: Record<Alien['pose'], PoseAngles> = {
  stand: { hip: [0.04, -0.04], knee: [0.06, 0.06], arm: [0.05, -0.05], elbow: [0.16, 0.2], splay: 0.24, lean: 0.02, stance: 1 },
  // Contralateral, and stated as such: the arm on a side opposes the leg on
  // that side. First hip forward, first arm back.
  walk: { hip: [0.34, -0.26], knee: [0.05, 0.40], arm: [-0.30, 0.28], elbow: [0.22, 0.30], splay: 0.26, lean: 0.06, stance: 0.9 },
  work: { hip: [0.1, -0.12], knee: [0.24, 0.20], arm: [0.62, 0.54], elbow: [0.85, 0.9], splay: 0.34, lean: 0.28, stance: 1.25 },
  watch: { hip: [-0.05, 0.05], knee: [0.05, 0.08], arm: [0.16, -0.42], elbow: [0.3, 1.1], splay: 0.3, lean: -0.05, stance: 1.05 },
};

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

export interface LegRig {
  hip: Bone;
  knee: Bone;
  ankle: Bone;
  pair: number;
  /** 0 or 1; `sign` is which way along X it stands. */
  side: number;
  sign: number;
  /** How far the sole is under the ankle joint, units: the foot is kept level. */
  sole: number;
  /** Where the hip stands across, before the stance spreads it. */
  x: number;
}

export interface ArmRig {
  shoulder: Bone;
  elbow: Bone;
  pair: number;
  side: number;
  sign: number;
  /** From the elbow to the middle of the hand, units. */
  reach: number;
}

/**
 * A built body and its joints. Every `Bone` is in `bones`, in the order a
 * traversal of `root` meets them, which is the order a skeleton is made in
 * and a clone of the root is walked in.
 */
export interface AlienRig {
  group: Group;
  root: Bone;
  bones: Bone[];
  legs: LegRig[];
  arms: ArmRig[];
  upper: Bone;
  head: Bone;
  /** The tail's joints from the base out, or empty. */
  tail: Bone[];
  /** A carried staff stands on its own joint under the root, or there is none. */
  staff: Bone | null;
  /** Lengths the animation reads. */
  height: number;
  hip: number;
  /** A comfortable step, heel to heel, units. */
  stride: number;
  /** How far a floater hangs over the ground, units; 0 for a walker. */
  hover: number;
}

/** A hide colour as linear RGB, for the painted sections. */
function linear(T: Three, hex: number): [number, number, number] {
  const c = new T.Color().setHex(hex);
  return [c.r, c.g, c.b];
}

/**
 * The rig of one alien, its sections on their joints, **unposed**: every
 * joint at rest, the arms straight down, the root at the hip's height over
 * `y = 0`. `poseAlien` turns the joints and `standAlien` puts the soles on the
 * ground. Nothing here touches an `Rng`: two calls with the same arguments are
 * the same geometry, byte for byte.
 */
export function rigAlien(ctx: SceneryContext, morph: Morph, alien: Alien): AlienRig {
  const T = ctx.THREE;
  const group = new T.Group();
  const f = frameOf(morph, alien.height, alien.girth);
  const pose = ALIEN_POSES[alien.pose];

  const joint = (parent: Object3D, name: string, x: number, y: number, z: number): Bone => {
    const bone = new T.Bone();
    bone.name = name;
    bone.position.set(x, y, z);
    parent.add(bone);
    return bone;
  };
  const root = joint(group, 'root', 0, 0, 0);

  // The hide is painted rather than flat: lighter underneath and in front,
  // darker over the back, a vertex at a time, so the figure is modelled by
  // its colour as well as by the light. `shade` is a function of the section's
  // own coordinates, unit-free, between about 0.86 and 1.12.
  const hide = linear(T, alien.hide);
  const painted = (geometry: BufferGeometry, shade: (x: number, y: number, z: number) => number): Mesh => {
    const p = geometry.getAttribute('position');
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const s = shade(p.getX(i), p.getY(i), p.getZ(i));
      colors[i * 3] = Math.min(1, hide[0] * s);
      colors[i * 3 + 1] = Math.min(1, hide[1] * s);
      colors[i * 3 + 2] = Math.min(1, hide[2] * s);
    }
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    return ctx.coloured(geometry);
  };
  const solid = (geometry: BufferGeometry, color: number): Mesh => new T.Mesh(geometry, ctx.toon(color));
  /** A limb's shade: darker toward its far end, the light falling off it. */
  const limbShade = (length: number) => (_x: number, y: number, z: number): number => 1.02 - 0.1 * Math.min(1, -y / Math.max(1e-6, length)) + (z > 0 ? 0.03 : -0.02);

  // --- the legs -----------------------------------------------------------
  const legs: LegRig[] = [];
  const legPairs = morph.legPairs;
  for (let pair = 0; pair < legPairs; pair++) {
    // Two pairs stand under the trunk fore and aft, the back pair slightly
    // narrower: a stance, not a copy. Widening it instead reads as a table.
    const z = legPairs === 1 ? 0 : (pair === 0 ? 1 : -1) * Math.max(f.depth * 0.6, f.limbR * 2.5);
    const narrow = pair === 0 ? 1 : 0.86;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      const x = sign * f.legX * narrow;
      const hip = joint(root, `hip${pair}${side}`, x, f.hip, z);
      hip.add(painted(limb(T, f.limbR * 1.18, f.limbR * 0.92, f.thigh, 6), limbShade(f.thigh)));
      const knee = joint(hip, `knee${pair}${side}`, 0, -f.thigh, 0);
      knee.add(painted(limb(T, f.limbR * 0.94, f.limbR * 0.7, f.shin, legPairs === 1 ? 6 : 5), limbShade(f.shin)));
      const ankle = joint(knee, `ankle${pair}${side}`, 0, -f.shin, 0);
      // The foot: a lozenge reaching forward of the ankle, sole flat at
      // `-ankle`, in the trim colour like a boot.
      const foot = solid(blob(T, f.limbR * 1.25, f.ankle * 0.5, f.limbR * 2.3, 6, 1), alien.trim);
      foot.position.set(0, -f.ankle * 0.5, f.limbR * 0.9);
      ankle.add(foot);
      legs.push({ hip, knee, ankle, pair, side, sign, sole: f.ankle, x });
    }
  }

  // --- the trunk ----------------------------------------------------------
  const upper = joint(root, 'upper', 0, f.hip, 0);
  const run = f.shoulder - f.hip;
  const segments = morph.segments;
  const trunk: BufferGeometry[] = [];
  // An egg, broad at the shoulder: unit radius, from pole to pole.
  const EGG: readonly Ring[] = [[0, -1], [0.8, -0.62], [1, 0.02], [0.88, 0.62], [0, 1]];
  for (let n = 0; n < segments; n++) {
    // Segments taper upward on a one-segment body and *outward* on a
    // three-segment one, which is what makes an insect read as an insect
    // rather than as a person with lines drawn on them.
    const t0 = n / segments;
    const t1 = (n + 1) / segments;
    const wide = segments === 1 ? 1 : 0.82 + 0.36 * Math.sin((t0 + t1) * 0.5 * Math.PI);
    const bottom = n === 0 ? -Math.min(f.thigh * 0.3, run * 0.25) : run * t0 - run * 0.06;
    const top = n === segments - 1 ? run + f.limbR * 1.2 : run * t1 + run * 0.06;
    const half0 = segments === 1 ? f.hipHalf * 1.05 : (f.hipHalf + (f.shoulderHalf - f.hipHalf) * t0) * wide;
    const half1 = segments === 1 ? f.shoulderHalf * 1.08 : (f.hipHalf + (f.shoulderHalf - f.hipHalf) * t1) * wide;
    const depth = f.depth * (segments === 1 ? 1.02 : wide);
    const egg = lathe(T, EGG, segments === 1 ? 8 : 7);
    const p = egg.getAttribute('position');
    const mid = (bottom + top) / 2;
    const span = (top - bottom) / 2;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getY(i) + 1) / 2;
      const half = half0 + (half1 - half0) * u;
      p.setXYZ(i, p.getX(i) * half, mid + p.getY(i) * span, p.getZ(i) * depth);
    }
    egg.computeVertexNormals();
    trunk.push(egg);
  }
  const trunkTop = run + f.limbR * 1.2;
  // Counter-shaded: a pale belly and chest in front, a darker back.
  upper.add(painted(joined(T, trunk), (_x, y, z) => 0.95 + 0.12 * Math.max(0, z / Math.max(1e-6, f.depth)) - 0.06 * Math.max(0, -z / Math.max(1e-6, f.depth)) + 0.03 * (y / Math.max(1e-6, run))));

  // --- the arms -----------------------------------------------------------
  //
  // Every pair after the first hangs lower and slightly shorter. The lower pair
  // is the one that carries; the upper pair is the one that gestures, which is
  // the only way four arms read as four arms rather than as a rendering fault.
  const arms: ArmRig[] = [];
  for (let pair = 0; pair < morph.armPairs; pair++) {
    const drop = pair * run * 0.3;
    const shrink = pair === 0 ? 1 : 0.84;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      const shoulder = joint(upper, `shoulder${pair}${side}`, sign * f.armX, run - drop - f.limbR * 0.6, 0);
      shoulder.add(painted(limb(T, f.limbR * 1.05, f.limbR * 0.82, f.upperArm * shrink, 6), limbShade(f.upperArm)));
      const elbow = joint(shoulder, `elbow${pair}${side}`, 0, -f.upperArm * shrink, 0);
      elbow.add(painted(limb(T, f.limbR * 0.84, f.limbR * 0.64, f.forearm * shrink, 5), limbShade(f.forearm)));
      const hand = painted(blob(T, f.limbR * 1.05, f.hand * shrink * 0.6, f.limbR * 0.85, 5, 1), () => 0.96);
      hand.position.y = -f.forearm * shrink - f.hand * shrink * 0.45;
      elbow.add(hand);
      arms.push({ shoulder, elbow, pair, side, sign, reach: f.forearm * shrink + f.hand * shrink * 0.45 });
    }
  }

  // --- the neck and the head ----------------------------------------------
  if (morph.neck !== 'none') {
    const neck = painted(limb(T, f.limbR * 1.3, f.limbR * 1.05, f.neck + f.limbR, 6), () => 0.97);
    // A hanging section turned a half turn stands up from its joint.
    neck.rotation.x = Math.PI;
    neck.position.y = run;
    upper.add(neck);
  }
  // With no neck the head sits down into the shoulders.
  const head = joint(upper, 'head', 0, morph.neck === 'none' ? run - f.head * 0.14 : run + f.neck, 0);
  // Under four sides the head is a wedge — a leading edge, longer front to
  // back and narrower — and from six up an egg; between, between.
  const wedge = Math.min(1, Math.max(0, (6 - morph.headSides) / 3));
  const wx = f.headHalf * (1 - 0.2 * wedge);
  const wz = f.headHalf * 1.1 * (1 + 0.35 * wedge);
  const forward = f.headHalf * 0.2 * wedge;
  const SKULL: readonly Ring[] = [[0, 0], [0.8, 0.15], [1, 0.5], [0.75, 0.88], [0, 1]];
  const skull = scaled(lathe(T, SKULL, 8), wx, f.head, wz);
  skull.translate(0, 0, forward);
  // A paler muzzle: the face is lit and the crown is not.
  head.add(painted(skull, (_x, y, z) => 0.94 + 0.12 * Math.max(0, z / wz) - 0.04 * (y / f.head)));

  // Eyes in one row across the face, each a ball with an ink pupil: the whole
  // of the near read, and the pupils are what make one look *at* something.
  const eyeY = f.head * 0.58;
  // The skull's radius at the eyes' height, read off its own profile.
  const atEyes = 1 - 0.25 * ((eyeY / f.head - 0.5) / 0.38);
  const span = morph.eyes === 1 ? 0 : Math.min(1.7, 0.42 * (morph.eyes - 1));
  const eyeR = Math.min(f.headHalf * 0.26, morph.eyes === 1 ? f.headHalf * 0.3 : ((f.headHalf * span) / (morph.eyes - 1)) * 0.46);
  const balls: BufferGeometry[] = [];
  const pupils: BufferGeometry[] = [];
  for (let n = 0; n < morph.eyes; n++) {
    const a = morph.eyes === 1 ? 0 : -span / 2 + (n * span) / (morph.eyes - 1);
    const x = Math.sin(a) * wx * atEyes * 0.94;
    const z = Math.cos(a) * wz * atEyes * 0.94 + forward;
    const ball = blob(T, eyeR, eyeR * 1.12, eyeR * 0.85, 5, 1);
    ball.rotateY(a);
    ball.translate(x, eyeY, z);
    ball.computeVertexNormals();
    balls.push(ball);
    const pupil = blob(T, eyeR * 0.5, eyeR * 0.62, eyeR * 0.32, 4, 1);
    pupil.rotateY(a);
    pupil.translate(x + Math.sin(a) * eyeR * 0.66, eyeY, z + Math.cos(a) * eyeR * 0.66);
    pupil.computeVertexNormals();
    pupils.push(pupil);
  }
  head.add(solid(joined(T, balls), PALETTE.white));
  head.add(solid(joined(T, pupils), PALETTE.ink));

  if (morph.crown === 'crest') {
    // A fin along the sagittal plane: the one addition that changes the
    // silhouette from every bearing except dead ahead, which is where the
    // eyes already are.
    const crest = solid(blob(T, f.headHalf * 0.16, f.head * 0.34, wz * 0.85, 6, 2), alien.trim);
    crest.position.set(0, f.head * 0.92, forward - wz * 0.12);
    crest.rotation.x = -0.25;
    head.add(crest);
  } else if (morph.crown === 'horns') {
    for (const sign of [1, -1]) {
      const horn = solid(limb(T, f.headHalf * 0.2, f.headHalf * 0.05, f.head * 0.55, 5), alien.trim);
      // Up and out, swept a little back: a hanging section turned past level.
      horn.position.set(sign * wx * 0.55, f.head * 0.82, forward * 0.5);
      horn.rotation.set(Math.PI - 0.3, 0, sign * 0.45);
      head.add(horn);
    }
  } else if (morph.crown === 'frill') {
    // A membrane round the skull, flaring up and out: a closed shell read
    // counter-clockwise, so it faces outward on both sides.
    const r = f.headHalf;
    const y = f.head * 0.42;
    const frill = lathe(
      T,
      [[r * 0.92, y - f.head * 0.06], [r * 1.95, y + f.head * 0.12], [r * 0.9, y + f.head * 0.04], [r * 0.92, y - f.head * 0.06]],
      8,
    );
    frill.scale(wx / f.headHalf, 1, wz / f.headHalf);
    frill.translate(0, 0, forward);
    frill.computeVertexNormals();
    head.add(solid(frill, alien.trim));
  }

  // --- the tail -----------------------------------------------------------
  const tail: Bone[] = [];
  if (morph.tail > 0) {
    const length = f.height * morph.tail;
    const base = joint(root, 'tail0', 0, f.hip * 0.96, -f.depth * 0.75);
    // Back and a little down, from the hanging convention: a quarter turn
    // less a third of a radian.
    base.rotation.x = Math.PI / 2 - 0.35;
    tail.push(base);
    if (morph.tail < 0.3) {
      // A stub is one section; only a long tail earns the joint that curls it.
      base.add(painted(limb(T, f.limbR * 1.15, f.limbR * 0.4, length, 5), limbShade(length)));
    } else {
      base.add(painted(limb(T, f.limbR * 1.15, f.limbR * 0.7, length * 0.55, 6), limbShade(length * 0.55)));
      const tip = joint(base, 'tail1', 0, -length * 0.55, 0);
      // The far half curls up, so a long tail never reaches the floor.
      tip.rotation.x = 0.45;
      tip.add(painted(limb(T, f.limbR * 0.72, f.limbR * 0.28, length * 0.45, 5), limbShade(length * 0.45)));
      tail.push(tip);
    }
  }

  // --- what is worn -------------------------------------------------------
  //
  // The wardrobe is the largest silhouette lever there is, which is `dress.ts`'s
  // own finding: what survives at 300 units, where a person is a 21-pixel dash,
  // is height, the hem, the crown and two colours. So each of these changes an
  // outline rather than adding a detail. They are bands round the trunk's own
  // ellipse, so they hug it rather than boxing it in.
  const trunkHalf = (segments === 1 ? f.shoulderHalf * 1.08 : f.shoulderHalf) * 1.0;
  const band = (y0: number, y1: number, flare: number, color: number): Mesh => {
    const geometry = lathe(T, [[1.0, y0], [1.06 + flare * 0.5, (y0 + y1) / 2], [1.02 + flare, y1]], 8);
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * trunkHalf, p.getY(i), p.getZ(i) * f.depth * 1.04);
    geometry.computeVertexNormals();
    return solid(geometry, color);
  };
  if (alien.wear === 'wrap') {
    upper.add(band(run * 0.02, run * 0.5, 0.12, alien.accent));
  } else if (alien.wear === 'harness') {
    upper.add(band(run * 0.04, run * 0.16, 0.02, alien.trim));
    for (const sign of [1, -1]) {
      const strap = ctx.box(f.shoulderHalf * 0.3, run * 0.9, f.depth * 2.1, alien.accent);
      strap.position.set(sign * f.shoulderHalf * 0.42, run * 0.08, 0);
      strap.rotation.z = sign * 0.18;
      upper.add(strap);
    }
  } else if (alien.wear === 'cloak') {
    // Hem above the knee, which is a *hem* and therefore an outline. Behind
    // the body rather than around it: a cloak that wraps is a barrel.
    const top = trunkTop;
    const hem = -f.thigh * 0.5;
    const r0 = 1.02;
    const r1 = 1.38;
    const cloak = lathe(T, [[r1, hem], [r1 * 1.08, hem], [r0 * 1.1, top], [r0 * 0.98, top], [r1, hem]], 6, Math.PI, Math.PI / 2);
    const p = cloak.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * f.shoulderHalf, p.getY(i), p.getZ(i) * f.depth * 1.15);
    cloak.computeVertexNormals();
    upper.add(solid(cloak, alien.accent));
  } else if (alien.wear === 'suit') {
    upper.add(band(run * 0.9, run + f.limbR, 0.18, alien.accent));
    upper.add(band(run * 0.04, run * 0.14, 0.02, alien.trim));
  }

  // --- what is carried ----------------------------------------------------
  //
  // Parented to the **trunk** and never to a hand. A hand's frame turns with
  // the forearm, so a load hung off one lies down flat the moment the elbow
  // bends — which is exactly the pose it is carried in.
  let staff: Bone | null = null;
  if (alien.carry === 'pack') {
    const pack = solid(blob(T, f.shoulderHalf * 0.72, run * 0.3, f.depth * 0.55, 6, 2), alien.trim);
    pack.position.set(0, run * 0.58, -f.depth * 1.12);
    upper.add(pack);
  } else if (alien.carry === 'staff') {
    // On a joint of its own under the root: planted beside the body in a
    // still, and carried along beside the hand by the walk.
    staff = joint(root, 'staff', f.armX * 1.3 + f.limbR * 2, 0, f.limbR * 2.4);
    const pole = ctx.column(f.limbR * 0.42, f.height * 0.9, alien.trim, 5);
    staff.add(pole);
    const knob = solid(blob(T, f.limbR * 1.1, f.limbR * 1.4, f.limbR * 1.1, 5, 1), alien.accent);
    knob.position.y = f.height * 0.9 + f.limbR * 0.9;
    staff.add(knob);
  } else if (alien.carry === 'vessel') {
    // Balanced on the crown: a pot, open at the top.
    const r = f.hipHalf * 0.8;
    const h = f.hipHalf * 1.2;
    const vessel = solid(lathe(T, [[0, 0], [r * 0.75, h * 0.08], [r, h * 0.55], [r * 0.62, h]], 7), alien.accent);
    vessel.position.y = f.head * 0.97;
    head.add(vessel);
  }

  const bones: Bone[] = [];
  root.traverse((object) => {
    if ((object as Bone).isBone === true) bones.push(object as Bone);
  });

  const float = morph.locomotion === 'float';
  const rig: AlienRig = {
    group,
    root,
    bones,
    legs,
    arms,
    upper,
    head,
    tail,
    staff,
    height: f.height,
    hip: f.hip,
    // A cycle is two steps, and a step is what the swing reaches either side
    // of the hip: 2 sin(0.42) of a leg on two legs, 2 sin(0.32) on four
    // (`worlds/aliens.ts`'s amplitudes), so the feet do not slide.
    stride: f.hip * (float ? 1.1 : legPairs === 1 ? 1.63 : 1.26),
    hover: float ? f.height * 0.12 : 0,
  };
  // Every joint at rest, then the pose the alien was drawn in.
  poseAlien(rig, pose, alien.sway, alien.stoop);
  return rig;
}

/**
 * Turns the joints to a still pose. `sway` nudges every swing and `stoop`
 * leans the trunk on top of the pose's own lean.
 */
export function poseAlien(rig: AlienRig, pose: PoseAngles, sway = 0, stoop = 0): void {
  for (const leg of rig.legs) {
    // A second pair takes the other side's angles: the trot's diagonal.
    const k = (leg.side + leg.pair) % 2;
    const swing = pose.hip[k]! + sway * 0.09;
    // Forward of vertical, the knee may only straighten.
    const bend = swing >= 0 ? pose.knee[k]! * 0.35 : pose.knee[k]!;
    setLeg(leg, swing, bend);
    leg.hip.position.x = leg.x * pose.stance;
  }
  for (const arm of rig.arms) {
    const swing = pose.arm[arm.side]! + sway * (arm.pair === 0 ? 0.12 : -0.1);
    setArm(arm, swing, pose.elbow[arm.side]!, pose.splay);
  }
  rig.upper.rotation.set(pose.lean + stoop, 0, 0);
  rig.head.rotation.set(-(pose.lean + stoop) * 0.5, 0, 0);
}

/** A leg's swing (forward positive) and knee bend (positive), the foot kept level. */
export function setLeg(leg: LegRig, swing: number, bend: number): void {
  leg.hip.rotation.set(-swing, 0, 0);
  leg.knee.rotation.set(bend, 0, 0);
  leg.ankle.rotation.set(swing - bend, 0, 0);
}

/** An arm's swing (forward positive), elbow bend (positive) and outward splay. */
export function setArm(arm: ArmRig, swing: number, bend: number, splay: number): void {
  arm.shoulder.rotation.set(-swing, 0, arm.sign * splay);
  arm.elbow.rotation.set(-bend, 0, 0);
}

/**
 * One alien, from a `Morph`, an `Alien` and nothing else: the rig in its pose,
 * stood on its own lowest sole.
 *
 * The returned `Group` stands on `y = 0` with `+z` the way it faces, which is
 * the scenery contract's own convention and the one every placer already knows.
 * `scripts/check-system.ts` fingerprints every vertex of two builds rather than
 * rasterising a silhouette — at 0.2 units to a cell a raster cannot see a limb
 * moved by a tenth of a unit, and that is exactly the shape a stray
 * `Math.random()` takes.
 *
 * **The drop is measured off the built feet rather than solved from the
 * angles**, and that is not thrift, it is a bug that was there first: a sole
 * is not a point, it reaches ahead of the ankle, and solved without that the
 * walk pose put the forward foot 0.126 units through the floor — three pixels
 * at 40 units, invisible in a thumbnail.
 */
export function buildAlien(ctx: SceneryContext, morph: Morph, alien: Alien): Group {
  const rig = rigAlien(ctx, morph, alien);
  standAlien(rig);
  return rig.group;
}

/** Drops a posed rig onto its own lowest sole, measured off the feet's vertices. */
export function standAlien(rig: AlienRig): void {
  rig.root.position.y = 0;
  rig.group.updateMatrixWorld(true);
  let lowest = Infinity;
  for (const leg of rig.legs) {
    leg.ankle.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh !== true || mesh.parent !== leg.ankle) return;
      const e = mesh.matrixWorld.elements;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const y = e[1]! * position.getX(i) + e[5]! * position.getY(i) + e[9]! * position.getZ(i) + e[13]!;
        if (y < lowest) lowest = y;
      }
    });
  }
  if (!Number.isFinite(lowest)) lowest = 0;
  rig.root.position.y = -lowest;
  // A staff stands on the ground beside the body, whatever the drop was.
  if (rig.staff !== null) rig.staff.position.y = lowest;
  rig.group.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// Who somebody is, and separately what they wear
// ---------------------------------------------------------------------------

export interface AlienOptions {
  /**
   * Where this one stands, if anywhere. **It reaches the wardrobe and not the
   * body**, which is the whole of the arrangement below.
   */
  nation?: Nation;
  /** 0 to 1 from the body's own ground model. More cover where it is colder. */
  warmth?: number;
  pose?: Alien['pose'];
}

/**
 * A seeded individual, and the two forks are the point of the function.
 *
 * `dress.ts` states it and measures it: *clothing is regional; appearance is
 * not*. Every kind of person lives everywhere, so a kit that handed out bodies
 * from a place table would be wrong about the world; `lookFor` draws the body
 * from `rng.fork('who')` and the wardrobe from `rng.fork('worn')`, and `fork`
 * forks from the **original** seed rather than from the current state, so
 * neither side can move the other however many draws it makes. Over 600 seeds
 * in fourteen regions that measured **600 of 600 identical people, dressed 200
 * of 200 differently.**
 *
 * The identical arrangement holds here and the check script makes the identical
 * measurement across Mars's fourteen countries. The reason it matters more on
 * an invented species than on a real one: an alien is the one place where
 * "everyone from Hellas looks like this" is the easiest possible thing to write
 * and the hardest to take back.
 *
 * **The wardrobe's colour is the nation's own map colour**, at a chance, which
 * is a rule rather than a second table — and it is the same economy
 * `GROUND_STYLES` makes when it blends every colour against what `groundColorAt`
 * already said the land is.
 */
export function alienFor(rng: Rng, species: Species, options: AlienOptions = {}): Alien {
  const who = rng.fork('who');
  const worn = rng.fork(options.nation === undefined ? 'worn' : `worn:${options.nation.id}`);
  const morph = species.morph;

  // The body. Nothing in this block may consult `options`.
  const height = who.spread(morph.height, 0.11);
  const girth = who.range(0.86, 1.18);
  const hide = who.pick(species.hides);
  const sway = who.jitter() * 0.5;
  const stoop = who.chance(0.18) ? who.range(0.05, 0.22) : 0;

  // The wardrobe. Everything in this block may.
  const warmth = options.warmth ?? 0.5;
  // Colder ground puts more on: the same lever `DressStyle.warmth` is, and it
  // *multiplies* the species' own weights rather than replacing them, so one
  // table covers a polar station and an equatorial one.
  const cold = 1 - warmth;
  const wears = species.wears.map((entry) => ({
    item: entry.item,
    weight:
      entry.weight *
      (entry.item === 'cloak' || entry.item === 'suit' ? 0.5 + 2.2 * cold : entry.item === 'none' ? 0.4 + 1.8 * warmth : 1),
  }));
  const wear = worn.weighted(wears);
  const carry = worn.weighted(species.carries);
  const trim = worn.pick(species.trims);
  const accent =
    options.nation !== undefined && worn.chance(0.45) ? options.nation.color : worn.pick(species.accents);

  return {
    height,
    girth,
    hide,
    trim,
    accent,
    wear,
    carry,
    pose: options.pose ?? worn.weighted([
      { item: 'stand' as const, weight: 4 },
      { item: 'watch' as const, weight: 3 },
      { item: 'work' as const, weight: 3 },
      { item: 'walk' as const, weight: 2 },
    ]),
    sway,
    stoop,
  };
}

/**
 * There is no `footprintOf` here, and that is deliberate.
 *
 * How wide one of these is is a **pose** and not a body — `villager.footprint`
 * on Earth is declared at the reach of the widest pose, because the same
 * neutral figure measured 1.94 standing and 2.52 talking at 6.8 units tall
 * (before 2026-09-24), and *one arm
 * up and out is worth more than the whole rest of the figure*. Four arms make
 * that worse and `work` is the pose that finds it.
 *
 * But `measure` in the monument contract already returns exactly that number as
 * `radius`, and a second function computing it here would be the duplication
 * this repo names more often than any other fault. `scripts/check-system.ts`
 * sweeps the poses and prints it.
 */

