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
 * ## What was taken from `people.ts` and what could not be
 *
 * **Taken, because they are facts about bodies rather than about humans:**
 *
 * - **A static pose has to be in double support**, and the knee is what decides
 *   it. A body frozen mid-swing has one foot in the air, which is correct in an
 *   animation and reads as *floating* in a still — and every one of these is a
 *   still, because a merged crowd figure has no clock. Measured on Earth: a
 *   trailing knee of 0.76 left **0.352 units of daylight, eight pixels at 40
 *   units**, and 0.40 left 0.001. The arithmetic is the same here and the
 *   builder drops the whole body onto its own lowest point, exactly as
 *   `buildPerson` does.
 * - **A limb's vertical reach is `thigh cos h + shin cos(h + k)`, which is
 *   longest at `h + k = 0`** — so a bent knee under a thigh that has already
 *   swung *forward* pushes the foot down. The fold has to be gated to
 *   `h >= 0`. This cost the avatar a year of both feet sliding along the ground
 *   and there is no reason a martian would be exempt.
 * - **An arm hangs inside the body unless it is deliberately splayed.** Two
 *   files on Earth found this independently and arrived at the same 0.22, and
 *   it is not comfort, it is *whether the figure has arms at all*. Here it
 *   matters more, not less: four arms hanging inside a 0.68-deep trunk is one
 *   arm's worth of silhouette.
 * - **Every limb is a four-sided taper, wider at the joint than at the far
 *   end.** 16 triangles a section against a box's 12, for the one thing that
 *   stops a limb reading as a dowel.
 *
 * **Not taken, and each is a decision rather than an omission:**
 *
 * - **No `Figure` and no `FIGURE`.** The avatar's proportions are one exported
 *   record that the hero, the camera and the crowd all read, and the reason is
 *   that a crowd a head shorter than the player reads as children. There is no
 *   alien player, so there is nothing to agree with; a `Morph` is free to be
 *   whatever it is. What it must **not** do is drift towards the avatar's
 *   numbers by imitation, which is why every proportion here is a *share of the
 *   body's own height* and not a unit.
 * - **No child.** `CHILD_BODY` is a second `Figure` with the head kept and the
 *   legs shortened, because a child is not a small adult. That relation is a
 *   fact about *human* growth and asserting it of an invented species would be
 *   inventing a second thing. The height spread does the work instead, and the
 *   omission is written here so nobody adds one by analogy.
 */

import type { Group, Mesh, SceneryContext } from '../scenery/contract.ts';
import type { Alien, Morph, Species } from './contract.ts';
import type { Nation } from './contract.ts';
import type { Rng } from '../scenery/random.ts';

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
  chin: number;
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
  // The ankle is what the boot fills; the two long bones share what is left,
  // and the thigh takes the larger share because on every body that walks it
  // does.
  const ankle = hip * 0.09;
  const thigh = (hip - ankle) * 0.53;
  const shin = (hip - ankle) * 0.47;
  const armSpan = shoulder - hip * 0.62;
  const upperArm = armSpan * 0.5;
  const forearm = armSpan * 0.38;
  const hand = armSpan * 0.12;
  const shoulderHalf = height * morph.shoulderShare * girth;
  const hipHalf = height * morph.hipShare * girth;
  return {
    height,
    head,
    chin,
    neck,
    shoulder,
    hip,
    ankle,
    thigh,
    shin,
    upperArm,
    forearm,
    hand,
    shoulderHalf,
    hipHalf,
    depth: height * morph.shoulderShare * morph.depth * girth,
    headHalf: head * 0.3,
    limbR: height * morph.limbR * girth,
    legX: hipHalf * 0.55,
    armX: shoulderHalf * 0.94,
  };
}

// ---------------------------------------------------------------------------
// The poses
// ---------------------------------------------------------------------------

/**
 * Four poses, and there are four rather than nine because a crowd that never
 * sits does not need a seated origin.
 *
 * `people.ts` carries nine and two of them — `sit` and `astride` — put the
 * origin at the *seat surface* rather than at the sole, because a bench and a
 * saddle already have that coordinate. Nothing on Mars has a bench yet. The
 * moment one exists, the thing to copy is the origin convention and the trap
 * that comes with it: *a load or a hem measured from the sole is measured from
 * the wrong thing the moment the origin moves to the seat*, which put a seated
 * villager's staff 1.5 units under the floor of the bench.
 *
 * Angles are radians. Positive `hip` is **forward**. Both entries of a pair are
 * the two sides, and they must not be equal in a walk — an ipsilateral gait is
 * the one thing a walk cannot get wrong, and `POSES.walk` on Earth shipped that
 * way for months because the only consumer that could see it overrode the half
 * that was wrong.
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
  // that side. Left hip forward (+), left arm back (-).
  walk: { hip: [0.34, -0.26], knee: [0.05, 0.40], arm: [-0.30, 0.28], elbow: [0.22, 0.30], splay: 0.26, lean: 0.06, stance: 0.9 },
  work: { hip: [0.1, -0.12], knee: [0.24, 0.20], arm: [0.62, 0.54], elbow: [0.85, 0.9], splay: 0.34, lean: 0.28, stance: 1.25 },
  watch: { hip: [-0.05, 0.05], knee: [0.05, 0.08], arm: [0.16, -0.42], elbow: [0.3, 1.1], splay: 0.3, lean: -0.05, stance: 1.05 },
};

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

/**
 * One alien, from a `Morph`, an `Alien` and nothing else.
 *
 * The returned `Group` stands on `y = 0` with `+z` the way it faces, which is
 * the scenery contract's own convention and the one every placer already knows.
 * Nothing here touches an `Rng`: two calls with the same arguments are the same
 * geometry, byte for byte, and `scripts/check-system.ts` asserts it by
 * fingerprinting every vertex rather than by rasterising a silhouette — at 0.2
 * units to a cell a raster cannot see a limb moved by a tenth of a unit, and
 * that is exactly the shape a stray `Math.random()` takes.
 */
export function buildAlien(ctx: SceneryContext, morph: Morph, alien: Alien): Group {
  const { THREE, box, taper } = ctx;
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);

  const f = frameOf(morph, alien.height, alien.girth);
  const pose = ALIEN_POSES[alien.pose];
  const s = alien.sway;
  const lean = pose.lean + alien.stoop;

  // --- the legs -----------------------------------------------------------
  //
  // The knee fold is gated to a thigh at or behind vertical. It is written as a
  // factor and not as a branch so that nothing downstream has a discontinuity
  // to trip over, which is what `2 sin(p)+ * -cos(p)+` buys on Earth.
  const legPairs = morph.legPairs;
  const soles: Mesh[] = [];
  for (let pair = 0; pair < legPairs; pair++) {
    // A second pair stands behind the first and slightly narrower — a stance,
    // not a copy. Widening it instead reads as a table with legs.
    const z = pair === 0 ? 0 : -f.hipHalf * 1.35;
    const narrow = pair === 0 ? 1 : 0.86;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      const hipA = pose.hip[side]! + s * 0.09;
      // Forward of vertical, the knee may only straighten.
      const kneeA = hipA >= 0 ? pose.knee[side]! * 0.35 : pose.knee[side]!;
      const leg = new THREE.Group();
      leg.position.set(sign * f.legX * pose.stance * narrow, f.hip, z);
      leg.rotation.x = hipA;
      root.add(leg);

      // `ctx.taper` stands on y = 0 and runs up; a half turn about X hangs it
      // from the joint with its wide end at the joint, which is where a limb is
      // wide. **Translating it as well is one section too far**, and it is the
      // same trap `ctx.box` sets — see the note on the boot below.
      const thigh = taper(f.limbR * 1.05, f.limbR * 0.86, f.thigh, alien.hide, 4);
      thigh.rotation.x = Math.PI;
      leg.add(thigh);

      const lower = new THREE.Group();
      lower.position.y = -f.thigh;
      lower.rotation.x = kneeA;
      leg.add(lower);

      const shin = taper(f.limbR * 0.86, f.limbR * 0.66, f.shin, alien.hide, 4);
      shin.rotation.x = Math.PI;
      lower.add(shin);

      // The foot is levelled against the leg's total rotation, which is the
      // third piece of the walk equation on Earth: a rigid boot is not a point,
      // its sole reaches ahead of the ankle, and swinging the leg back drives
      // that corner into the ground.
      //
      // **`ctx.box` stands on y = 0. It does not centre.** That is the monument
      // context's convention, it is documented, and it was got wrong in six
      // places in one afternoon on Earth — a balloon floating clear of the
      // ground, a glazing band through its own roof — so every `position.y`
      // below is a *bottom* and not a middle.
      const foot = box(f.limbR * 1.7, f.ankle * 0.9, f.limbR * 4.2, alien.trim);
      foot.position.set(0, -f.shin - f.ankle * 0.9, f.limbR * 1.1);
      foot.rotation.x = -(hipA + kneeA);
      lower.add(foot);
      soles.push(foot);
    }
  }

  // --- the trunk ----------------------------------------------------------
  const upper = new THREE.Group();
  upper.position.y = f.hip;
  upper.rotation.x = -lean;
  root.add(upper);

  const trunkRun = f.shoulder - f.hip;
  const segments = morph.segments;
  for (let n = 0; n < segments; n++) {
    // Segments taper upward on a one-segment body and *outward* on a
    // three-segment one, which is what makes an insect read as an insect
    // rather than as a person with lines drawn on them.
    const t0 = n / segments;
    const t1 = (n + 1) / segments;
    const wide = segments === 1 ? 1 : 0.82 + 0.36 * Math.sin((t0 + t1) * 0.5 * Math.PI);
    const half = (f.hipHalf + (f.shoulderHalf - f.hipHalf) * ((t0 + t1) * 0.5)) * wide;
    const piece = box(half * 2, trunkRun / segments, f.depth * 2 * wide, alien.hide);
    piece.position.y = trunkRun * t0;
    upper.add(piece);
  }

  // --- the arms -----------------------------------------------------------
  //
  // Every pair after the first hangs lower and slightly shorter. The lower pair
  // is the one that carries; the upper pair is the one that gestures, which is
  // the only way four arms read as four arms rather than as a rendering fault.
  for (let pair = 0; pair < morph.armPairs; pair++) {
    const drop = pair * trunkRun * 0.3;
    const shrink = pair === 0 ? 1 : 0.84;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? 1 : -1;
      const arm = new THREE.Group();
      arm.position.set(sign * f.armX, trunkRun - drop, 0);
      arm.rotation.z = -sign * pose.splay;
      arm.rotation.x = pose.arm[side]! + s * (pair === 0 ? 0.12 : -0.1);
      upper.add(arm);

      const upperArm = taper(f.limbR * 0.9, f.limbR * 0.72, f.upperArm * shrink, alien.hide, 4);
      upperArm.rotation.x = Math.PI;
      arm.add(upperArm);

      const fore = new THREE.Group();
      fore.position.y = -f.upperArm * shrink;
      fore.rotation.x = pose.elbow[side]!;
      arm.add(fore);

      const forearm = taper(f.limbR * 0.72, f.limbR * 0.55, f.forearm * shrink, alien.hide, 4);
      forearm.rotation.x = Math.PI;
      fore.add(forearm);

      const hand = box(f.limbR * 1.5, f.hand * shrink, f.limbR * 1.1, alien.hide);
      hand.position.y = -f.forearm * shrink - f.hand * shrink;
      fore.add(hand);
    }
  }

  // --- the neck and the head ----------------------------------------------
  if (morph.neck !== 'none') {
    const neck = taper(f.limbR * 1.0, f.limbR * 0.82, f.neck, alien.hide, morph.neck === 'stalk' ? 4 : 6);
    neck.position.y = trunkRun;
    upper.add(neck);
  }

  const head = new THREE.Group();
  head.position.y = trunkRun + f.neck;
  upper.add(head);

  const skull = ctx.column(f.headHalf, f.head, alien.hide, morph.headSides);
  // A skull is deeper than it is wide, and a cover has to be built in the frame
  // of the thing it covers — so the crown below is a child of this scaled
  // group and not a sibling of it. On Earth that mistake put pale wedges of
  // scalp through the front and back of the hat and read as z-fighting.
  const skullGroup = new THREE.Group();
  skullGroup.scale.z = 1.08;
  skullGroup.add(skull);
  head.add(skullGroup);

  // Eyes in one row across the face. Six triangles each and they are the whole
  // of the near read: at 40 units a figure is 159 px and a 3 px eye is legible.
  const eyeY = f.head * 0.62;
  const eyeR = f.headHalf * 0.2;
  const spread = f.headHalf * 1.05;
  for (let n = 0; n < morph.eyes; n++) {
    const t = morph.eyes === 1 ? 0 : (n / (morph.eyes - 1)) * 2 - 1;
    const eye = box(eyeR * 1.7, eyeR * 1.5, eyeR * 0.9, alien.accent);
    eye.position.set(t * spread * 0.62, eyeY - eyeR * 0.75, f.headHalf * 1.02);
    skullGroup.add(eye);
  }

  if (morph.crown === 'crest') {
    // A fin along the sagittal plane: the one addition that changes the
    // silhouette from every bearing except dead ahead, which is where the
    // eyes already are.
    const crest = ctx.roof(f.headHalf * 0.36, f.headHalf * 2.1, f.head * 0.55, f.headHalf * 0.9, alien.trim);
    crest.position.y = f.head * 0.86;
    skullGroup.add(crest);
  } else if (morph.crown === 'horns') {
    for (const sign of [1, -1]) {
      const horn = taper(f.headHalf * 0.22, f.headHalf * 0.05, f.head * 0.6, alien.trim, 4);
      horn.position.set(sign * f.headHalf * 0.55, f.head * 0.9, 0);
      horn.rotation.z = -sign * 0.35;
      skullGroup.add(horn);
    }
  } else if (morph.crown === 'frill') {
    const frill = ctx.ringWall(f.headHalf * 0.95, f.headHalf * 1.9, f.head * 0.16, alien.trim, morph.headSides);
    frill.position.y = f.head * 0.5;
    skullGroup.add(frill);
  }

  // --- the tail -----------------------------------------------------------
  if (morph.tail > 0) {
    const length = f.height * morph.tail;
    const tail = taper(f.limbR * 0.95, f.limbR * 0.3, length, alien.hide, 4);
    tail.position.set(0, f.hip * 0.98, -f.depth);
    // Back and down, not forward: a half turn's worth of sign, and the only
    // witness would be a screenshot from the side.
    tail.rotation.x = -(Math.PI * 0.5 + 0.35);
    root.add(tail);
  }

  // --- what is worn -------------------------------------------------------
  //
  // The wardrobe is the largest silhouette lever there is, which is `dress.ts`'s
  // own finding: what survives at 300 units, where a person is a 21-pixel dash,
  // is height, the hem, the crown and two colours. So each of these changes an
  // outline rather than adding a detail.
  if (alien.wear === 'wrap') {
    const wrap = box(f.shoulderHalf * 2.14, trunkRun * 0.5, f.depth * 2.18, alien.accent);
    wrap.position.y = trunkRun * 0.22;
    upper.add(wrap);
  } else if (alien.wear === 'harness') {
    for (const sign of [1, -1]) {
      const strap = box(f.shoulderHalf * 0.42, trunkRun * 0.92, f.depth * 2.2, alien.accent);
      strap.position.set(sign * f.shoulderHalf * 0.5, trunkRun * 0.08, 0);
      strap.rotation.z = sign * 0.16;
      upper.add(strap);
    }
  } else if (alien.wear === 'cloak') {
    // Hem to the knee, which is a *hem* and therefore an outline. Behind the
    // body rather than around it: a cloak that wraps is a barrel.
    const cloak = box(f.shoulderHalf * 2.3, trunkRun + f.thigh * 0.9, f.depth * 0.5, alien.accent);
    cloak.position.set(0, -f.thigh * 0.9, -f.depth * 1.15);
    upper.add(cloak);
  } else if (alien.wear === 'suit') {
    const collar = ctx.ringWall(f.shoulderHalf * 0.9, f.shoulderHalf * 1.5, f.head * 0.3, alien.accent, 6);
    collar.position.y = trunkRun;
    upper.add(collar);
    const belt = box(f.hipHalf * 2.3, trunkRun * 0.12, f.depth * 2.24, alien.trim);
    belt.position.y = trunkRun * 0.06;
    upper.add(belt);
  }

  // --- what is carried ----------------------------------------------------
  //
  // Parented to the **trunk** and never to a hand. A hand's frame turns with
  // the forearm, so a load hung off one lies down flat the moment the elbow
  // bends — which is exactly the pose it is carried in. `people.ts` reached the
  // same arrangement and for the same reason.
  if (alien.carry === 'pack') {
    const pack = box(f.shoulderHalf * 1.5, trunkRun * 0.55, f.depth * 1.1, alien.trim);
    pack.position.set(0, trunkRun * 0.35, -f.depth * 1.7);
    upper.add(pack);
  } else if (alien.carry === 'staff') {
    // Planted in the ground and therefore a child of `root`, not of the leaning
    // trunk. Hung off `upper` it rode the lean, and a backward lean of 0.05 rad
    // drove its foot **0.027 units under the floor** — which is nothing to look
    // at and is the whole reason `pnpm life` asserts a hundredth of a unit.
    const staff = ctx.column(f.limbR * 0.4, f.height * 0.92, alien.trim, 4);
    staff.position.set(f.armX * 1.25, 0, f.limbR * 2.4);
    root.add(staff);
  } else if (alien.carry === 'vessel') {
    const vessel = ctx.dome(f.hipHalf * 0.9, f.hipHalf * 1.4, alien.accent, 6, 3);
    vessel.position.set(0, trunkRun + f.neck + f.head * 1.02, 0);
    upper.add(vessel);
  }

  // --- stand it on the ground ---------------------------------------------
  //
  // The whole rig is dropped onto its own lowest foot, which is what makes the
  // bob free in an animation and what makes a still stand on the floor. It is
  // the *foot* and not the bounding box: a cloak's hem and a staff's tip both
  // reach lower than the sole and neither is standing on anything.
  //
  // **Measured off the built boots rather than solved from the angles**, and
  // that is not thrift, it is a bug that was there first. The closed form for a
  // sole's height is `hip - thigh cos h - shin cos(h + k)` only while the boot
  // sits *on* the ankle's axis; it is offset forward by `limbR * 1.1`, and that
  // offset rotates with the leg. Solved without it the walk pose put the
  // forward boot **0.126 units through the floor** — three pixels at 40 units,
  // invisible in a thumbnail, and exactly the kind of number `pnpm life`
  // asserts to four decimals on Earth.
  group.updateMatrixWorld(true);
  let lowest = 0;
  for (const sole of soles) {
    const e = sole.matrixWorld.elements;
    const position = sole.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const y = e[1]! * position.getX(i) + e[5]! * position.getY(i) + e[9]! * position.getZ(i) + e[13]!;
      if (y < lowest) lowest = y;
    }
  }
  root.position.y -= lowest;

  group.updateMatrixWorld(true);
  return group;
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

export { TAU };
