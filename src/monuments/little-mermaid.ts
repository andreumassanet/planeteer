import type { Monument, Vector3 } from './contract.ts';

/**
 * The Little Mermaid, Langelinie, Copenhagen.
 *
 * ## What the monument is, because the figure alone cannot be one
 *
 * She is **1.25 m tall**. The avatar is 6.8 units for 1.8 m, so at avatar scale
 * she is 4.7 units — a third of the `monument` tier's 15, under half of what
 * `FILL` demands, and smaller than the block Christ the Redeemer's *hand* is
 * made of. There is no tier she fits and no honest way to inflate her: blow the
 * figure up to 15 units on her own and she stops being the famous
 * disappointment of Copenhagen and becomes a colossus, which is the one thing
 * she is emphatically not.
 *
 * So the model is not the figure. **It is the outcrop** — the granite erratic
 * she sits on and the cluster of stones around it at the waterline — **with her
 * on it**. That is not a dodge to fill a bounding box. It is what the thing
 * actually is:
 *
 * - Eriksen carved a *seated* figure. The pose only exists because there is a
 *   rock: the planted hand needs something to press on, the drawn-up knee needs
 *   a surface to be drawn up from, the tail needs an edge to spill over. Take
 *   the rock away and the pose is a person falling over.
 * - Nobody photographs her without it. She is at the water's edge, half the
 *   frame is wet stone, and at high tide the sea comes up around her.
 * - The tier's own question — *from how far should a player be able to name
 *   it?* — answers `monument`: **you find it by walking into it.** Which is
 *   precisely the experience every visitor reports having.
 *
 * So `monument`, and of its 14.8 units the figure is 9.4.
 *
 * ## The stretch, and what it broke
 *
 * The boulder is **5.4 units against 9.4 of figure, 1:1.74**. A photograph at
 * middling tide gives roughly 1:1.1 — the rock is nearly as tall as she is. The
 * vertical is exaggerated in the figure's favour by about **1.6x**, because the
 * figure is what has to be nameable and a boulder is a boulder at any
 * proportion.
 *
 * A stretch is never free. Squeezing the boulder's height took away the mass
 * that made it read as a boulder rather than a pebble, so **the mass went
 * sideways instead**: the erratic is 11 units across at its belly and six more
 * stones ring it out to a radius of 9.0, which is why this model is 18 units
 * wide against 14.8 tall. That is also what carries `footprint` — the figure
 * alone would use 4 of the 9.5 units declared and fail `FOOTPRINT_FILL`
 * outright.
 *
 * Aspect is the one constraint that is not tight here: half-diagonal over height
 * is **9.0 / 14.8 = 0.61** where 2.00 is allowed. The binding constraint at this
 * tier runs the other way, and it is `FILL`, and it is met on width.
 *
 * ## What has to survive at thumbnail size
 *
 * In order, and every number in this file serves one of them:
 *
 * 1. **The seated pose**, which nothing else in the dataset has. Three things
 *    make it, and they are all *negative space*, which is the lesson Liberty's
 *    raised arm already paid for — what makes an arm an arm is the sky between
 *    it and the body:
 *    - the **planted arm**, elbow jutting out to 4.55 units while the ribs at
 *      the same height are at 2.01, leaving a 2.5-unit hole under her armpit;
 *    - the **drawn-up knee**, out over the rock's edge on the far side at 8.25
 *      units up, against sky;
 *    - the **torso leaning 8.6 degrees onto the planted hand**, which drops that
 *      shoulder to 10.15 and lifts the other to 10.83. Without the lean the arm
 *      is decoration; with it, the arm is carrying her.
 * 2. **The tail and its split fluke.** The one detail that says mermaid rather
 *    than woman. Eriksen's real oddity is that she keeps human thighs and the
 *    fish begins below the knees, so that is what is built: two thighs, and from
 *    the knees down a single tail spilling over the front of the boulder,
 *    ending in **two lobes splayed 97 degrees apart**. Both the splay and the
 *    height the tail stops at were changed after rendering, and `FLUKE_SPLAY`
 *    records why: a fluke seen edge-on is a stick, and a bronze fluke in front
 *    of grey stone is nothing at all.
 * 3. **The hair**, a long fall down her back plus a lock over the near
 *    shoulder, in the *darker* bronze. Same colour as the body it would only be
 *    an outline; and Christ the Redeemer's file records the opposite failure, a
 *    head going solid dark, so it is kept off her face entirely.
 * 4. **The rock**, dark and rough against her. `steel` for the boulder at 56% of
 *    the bronze's value, `slate` for the outer stones. Rough is done with
 *    *normals*, not a second colour — Victoria Falls' finding — so the boulder
 *    is five prisms of 6, 7 and 8 sides yawed against each other and every outer
 *    stone leans inward at its own angle. The stones were also cut by a third in
 *    height after the first render: at their original size their tops came up
 *    level with the seat and the figure's legs disappeared into them.
 *
 * ## Colour
 *
 * Five, and all five survive shade, which the note beside `ctx.palette` makes
 * the first question to ask:
 *
 * - **`green` (0x91ad78) — the patina.** The same choice as the Statue of
 *   Liberty, and it should be: both are weathered bronze. Measured off this
 *   scene's lights it holds at roughly (77, 92, 64) turned away from the sun —
 *   still obviously green, where a neutral would go hueless.
 * - **`darkOlive` (0x574e37) — the hair**, read as the darker unweathered
 *   bronze that patina never took, which is true of the real statue's hair and
 *   hands. Warm, and at 78 luminance against the body's 158 it separates the
 *   hair mass from the head at any size.
 * - **`steel` (0x575a5e) — the boulder.** Dark and cool. The contract warns it
 *   goes effectively black turned away, and that is a warning about *recesses*
 *   seen against sky; a convex sunlit erratic has none, and its shadowed flank
 *   going near-black is what a wet granite boulder does.
 * - **`slate` (0x7c7691) — the outer stones**, one value up from the boulder so
 *   the base is not one silhouette blob, and far enough off the bronze that the
 *   fluke does not vanish when it passes in front of one.
 * - **`skyBlue` (0x3dbbe7) — the water**, a plate 0.55 high that the stones
 *   stand through. Victoria Falls' reasoning exactly: nothing here is
 *   transparent or moving, so water has to be *stated*, and this is the only
 *   `skyBlue` in the model. It earns its brightness twice — it says "water's
 *   edge", which is half of what this monument is, and it gives the dark
 *   boulder something bright to be a silhouette against.
 *
 * ## Honest notes
 *
 * - **The handedness of the pose is arranged for the camera, not surveyed.** She
 *   leans on her left hand, draws up her right knee, and her tail spills to her
 *   left-front. The contact sheet's quarter camera sits 45 degrees off her front
 *   on her left, so the planted arm, the hair and the fluke are all on the near
 *   side and the knee swings clear on the far one. Stonehenge's file makes the same
 *   admission about its ruin: a monument has to be nameable before it is
 *   accurate.
 * - **No `realHeight`.** The source list gives her none, and 1.25 m on a card
 *   next to a 15-unit model would be a fact fighting its own picture. The height
 *   of this monument is not a number anyone means when they talk about it.
 * - **The fluke is the weakest of the four at 260 pixels, and it stays that
 *   way.** Rendered at contact-sheet size it reads as *a fan on the end of the
 *   tail* from the quarter view and as an ambiguous green mass from dead front.
 *   Three things were tried and are worth not repeating: hanging it to the
 *   waterline, where it landed on `slate` stones at nearly its own value and
 *   vanished; splaying it flat at 143 degrees, which a camera 15 degrees above
 *   the ground foreshortens to two sticks; and growing the lobes further, which
 *   pushed the model past its footprint. What it has instead is contrast — it is
 *   the one part of the figure that sits against `steel` rather than sky — and
 *   that is enough to say *fin* even when it is not enough to count the lobes.
 * - **Budget: 844 triangles of 900 and 37 meshes of 40.** The triangles went on
 *   giving every limb a five- or six-sided section instead of `strut`'s square
 *   one, which is the single change that stopped the figure reading as an
 *   android; see `limb` in `build`. Nothing is left over, and nothing else was
 *   worth buying with what there was — a nose was drawn and cut, because at 260
 *   pixels a 0.3-unit block on a 2.15-unit head is one stray pixel of ink.
 */

// ---------------------------------------------------------------------------
// The outcrop
// ---------------------------------------------------------------------------

/** Waterline. Everything stands on y = 0 and 0.55 of every stone is submerged. */
const WATER_RADIUS = 7.7;
const WATER_HEIGHT = 0.55;

/** Top of the boulder, and so the height she sits at. */
const SEAT = 5.4;

/**
 * The stones at the water's edge. `lean` tips each one **inward**, toward the
 * boulder — Stonehenge's rule, for Stonehenge's reason: tipped the other way a
 * stone swings its top out past the footprint, and a cluster converging on the
 * erratic reads as one outcrop rather than as gravel dropped around a plinth.
 * `yaw` spins each prism on its own axis so no two present the same facet.
 *
 * A stone tilted about its own base dips one corner below y = 0, which `validate`
 * calls sinking; each is lifted by exactly `circumradius * sin(lean)` to put that
 * corner back on the waterline. The lift raises the far corner by twice that, and
 * the leans are kept small enough — 0.10 at most — that the gap stays under the
 * water plate's 0.55 and never shows.
 */
const STONES = [
  { x: 5.3, z: 2.7, radius: 2.1, top: 0.6, height: 1.9, sides: 6, yaw: 0.42, lean: 0.07 },
  { x: 4.7, z: -3.2, radius: 1.8, top: 0.55, height: 1.5, sides: 5, yaw: -0.7, lean: 0.09 },
  { x: 0.85, z: -5.7, radius: 2.2, top: 0.6, height: 2.2, sides: 6, yaw: 0.25, lean: 0.055 },
  { x: -4.0, z: -4.4, radius: 1.9, top: 0.58, height: 1.7, sides: 5, yaw: 0.9, lean: 0.08 },
  { x: -5.7, z: 0.6, radius: 2.1, top: 0.6, height: 2.4, sides: 6, yaw: -0.35, lean: 0.05 },
  { x: -4.1, z: 4.15, radius: 1.8, top: 0.55, height: 1.3, sides: 5, yaw: 0.55, lean: 0.1 },
];

// ---------------------------------------------------------------------------
// The figure
// ---------------------------------------------------------------------------

/**
 * How far she is turned within the composition.
 *
 * The group still faces +Z — the front of the *outcrop* is +Z, the tail and the
 * knee both open that way — but a seated figure viewed dead on is a blob with
 * its legs pointing at the camera. At -13 degrees her own facing is 45 degrees
 * off the contact sheet's quarter camera (which sits at +32), which is a proper
 * three-quarter, and 13 degrees off the front camera, which is frontal enough
 * for the +Z check to mean something.
 */
const YAW = -0.227;

/** Hips: the pivot everything above is built on, sunk 0.15 into the seat. */
const HIP_Y = SEAT - 0.15;
const HIP_Z = 0.25;

/**
 * Lean, about Z, onto the planted hand. Negative tips her top toward +X, her
 * left. 8.6 degrees is small on paper and it is the whole difference between an
 * arm that is holding her up and an arm that is hanging there.
 */
const LEAN = -0.15;

/** Front-to-back squash on the torso. A slim figure is much deeper than she is wide. */
const DEPTH = 0.72;
/** Faces of the torso prism. Six, not Christ's eight: chunkier reads better this small. */
const SIDES = 6;

/**
 * Half-width of the torso at each height above the hips, and the whole shape of
 * her. The 1.58 waist against 2.32 hips and 2.05 chest is the hourglass, and
 * with the pair of cones on the chest it is what says the figure is a woman.
 */
const TORSO = [
  { y: 0.0, r: 2.32 }, // hips, spread on the stone
  { y: 1.35, r: 2.02 },
  { y: 2.75, r: 1.58 }, // waist, 1.47:1 under the hips
  { y: 4.15, r: 1.92 },
  { y: 5.55, r: 2.05 }, // chest
];

/** Where the arms hang from, in the leaning bust's own frame. */
const SHOULDER_X = 2.3;
const SHOULDER_Y = 5.3;

// --- her left arm: the one taking her weight ---
/**
 * The elbow is the point of the whole pose. It juts to x = 4.55 while the ribs
 * at that height are at 2.01, and what fills the 2.54 units between them is air:
 * the boulder tops out at 5.4 and this is at 7.75.
 */
const PROP_ELBOW = [4.55, 7.75, -0.95] as const;
/** Hand flat on the boulder top, behind her hip: 3.5 out, inside the cap's 4.2. */
const PROP_HAND = [3.1, 5.5, -1.7] as const;

// --- her right arm: draped, hand resting on the raised knee ---
const DRAPE_ELBOW = [-3.05, 8.15, 1.65] as const;
const DRAPE_HAND = [-2.15, 8.55, 3.7] as const;

// --- legs. Human thighs; the fish starts below the knees. ---
const RIGHT_HIP = [-1.05, 5.7, 0.8] as const;
/** The drawn-up knee, out over the rock's edge and against sky. */
const RIGHT_KNEE = [-2.15, 8.25, 3.75] as const;
const LEFT_HIP = [1.2, 5.6, 0.65] as const;
/** Where both legs have become one tail. */
const TAIL_ROOT = [0.7, 4.9, 4.7] as const;
const TAIL_MID = [1.8, 4.05, 5.3] as const;
const TAIL_END = [2.85, 3.35, 5.7] as const;

/**
 * The fluke.
 *
 * `FLUKE_HEADING` turns the pair so the plane they splay in lies across the
 * quarter camera's ray rather than along it: the tail runs out at about 70
 * degrees in her frame, the lobes open perpendicular to that, and the camera meets them
 * near broadside. Splayed the other way they would foreshorten to two sticks,
 * and the fluke is the one detail that distinguishes this from a seated woman.
 *
 * `FLUKE_SPLAY` is measured off vertical. It started at 1.25 — a 143-degree fan,
 * which is anatomically what a fluke is and rendered as two horizontal shards
 * indistinguishable from the shore stones behind them, because a horizontal
 * blade under a camera 15 degrees above the ground has almost no height to
 * project. At 0.85 the two lobes are 97 degrees apart and each keeps a strong
 * upward component, which is a fish tail seen side on and reads instantly.
 *
 * The tail is also **short and high** rather than draping to the water, and that
 * is a background decision, not an anatomical one: at 3.35 units up the fluke
 * sits against the boulder's own dark face, bright green on `steel`. Hung down
 * to the waterline it landed among the `slate` stones at nearly its own value
 * and disappeared.
 */
const FLUKE_HEADING = 1.265;
const FLUKE_SPLAY = 0.85;
const FLUKE_LENGTH = 2.25;

// --- head and hair ---
const NECK_Y = 5.95;
/** Head pivot, in the bust's frame. A clear unit of neck shows under it. */
const HEAD_Y = 6.72;
/**
 * Turned toward her left — toward the planted hand and toward the camera, so
 * the sheet gets her face and not the back of her skull — and bowed. The bow is
 * the pose's signature and it is why the crown of the model is her hair and not
 * the top of her head.
 */
const HEAD_TURN = 0.62;
const HEAD_BOW = 0.3;
const HEAD_TILT = -0.12;

export const littleMermaid: Monument = {
  id: 'little-mermaid',
  name: 'The Little Mermaid',
  iso: 'DNK',
  lat: 55.693,
  lon: 12.599,
  // No `realHeight`. See the note at the top: the source list gives none, and
  // 1.25 m is a fact that would fight its own picture on the card.
  tier: 'monument',
  footprint: 9.5,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const bronze = palette.green; //     the patina
    const hairColor = palette.darkOlive; // the bronze the patina never took
    const boulder = palette.steel; //    the erratic she sits on
    const shore = palette.slate; //      the stones around it
    const water = palette.skyBlue; //    the harbour, stated rather than shown

    const group = new THREE.Group();
    const at = (p: readonly [number, number, number] | number[]) =>
      new THREE.Vector3(p[0]!, p[1]!, p[2]!);

    /**
     * A tapered limb between two points.
     *
     * The pose is a list of joints, so `strut` is the obvious tool and it was
     * the first one used here. Nine square beams of constant thickness rendered
     * as scaffolding — the figure came back reading as an android, and the fix
     * was not more parts, it was giving every limb the two things a limb has:
     * a five-sided section instead of a square one, and a narrower end than
     * start. `strut` can do neither, so this wraps `taper` in the placement
     * `strut` was doing.
     */
    const limb = (from: Vector3, to: Vector3, thick: number, thin: number, sides = 5) => {
      const pivot = new THREE.Group();
      pivot.position.copy(from);
      pivot.lookAt(to);
      // `taper` stands on +Y and `lookAt` aimed the pivot's +Z at the far end.
      const bone = taper(thick, thin, from.distanceTo(to), bronze, sides);
      bone.rotation.x = Math.PI / 2;
      pivot.add(bone);
      return pivot;
    };

    // -----------------------------------------------------------------------
    // Water, then the outcrop standing through it
    // -----------------------------------------------------------------------

    // Bevelled rather than a straight-sided disc: placed on the planet this
    // meets land, and a vertical cyan wall reads as a swimming pool.
    group.add(taper(WATER_RADIUS, WATER_RADIUS - 0.3, WATER_HEIGHT, water, 16));

    for (const stone of STONES) {
      const circumradius = stone.radius / Math.cos(Math.PI / stone.sides);
      const pivot = new THREE.Group();
      // Lifted by the amount the lean is about to dip the low corner.
      pivot.position.set(stone.x, circumradius * Math.sin(stone.lean), stone.z);
      // Local +Z now points away from the boulder, so a positive `lean` about X
      // tips the top outward and a negative one tips it in.
      pivot.rotation.y = Math.atan2(stone.x, stone.z);

      const mass = taper(
        stone.radius,
        stone.radius * stone.top,
        stone.height,
        shore,
        stone.sides,
      );
      mass.rotation.y = stone.yaw;
      mass.rotation.x = -stone.lean;
      pivot.add(mass);
      group.add(pivot);
    }

    // The erratic: a bulge, not a cone. Wider at 2.6 than at its foot, which is
    // what a glacial boulder does and a plinth does not. Two prisms of eight
    // sides yawed against each other, so the facet seams do not run straight
    // from the water to the seat.
    const lower = taper(4.9, 5.5, 2.5, boulder, 8);
    lower.rotation.y = 0.2;
    group.add(lower);

    const upper = taper(5.5, 4.35, 2.5, boulder, 8);
    upper.position.y = 2.5;
    upper.rotation.y = -0.18;
    group.add(upper);

    // The seat, a seven-sided cap standing 0.15 proud of the mass under it so
    // the ink finds a lip where she meets the stone instead of one unbroken
    // face running from the water to her hip.
    const cap = taper(4.5, 4.2, 0.4, boulder, 7);
    cap.position.y = 5.0;
    cap.rotation.y = 0.5;
    group.add(cap);

    // Two shoulders on the erratic. The +X one sits directly under the planted
    // elbow, so the arm has something to be over; the -Z one keeps the boulder
    // from reading as a drum from behind.
    const flank = taper(2.4, 1.85, 4.2, boulder, 6);
    // Same lift as the shore stones, for the same reason.
    flank.position.set(4.9, (2.4 / Math.cos(Math.PI / 6)) * Math.sin(0.07), 0.7);
    flank.rotation.set(-0.07, -0.35, 0);
    group.add(flank);

    const haunch = taper(2.3, 1.7, 3.6, boulder, 6);
    haunch.position.set(-2.1, (2.3 / Math.cos(Math.PI / 6)) * Math.sin(0.08), -4.8);
    haunch.rotation.set(0.08, 0.5, 0);
    group.add(haunch);

    // -----------------------------------------------------------------------
    // The figure
    // -----------------------------------------------------------------------

    const figure = new THREE.Group();
    figure.rotation.y = YAW;
    group.add(figure);

    // The bust carries the lean; `body` inside it carries the front-to-back
    // squash, so the head and shoulders are not squashed with the ribs. Liberty
    // splits them the same way and for the same reason.
    const bust = new THREE.Group();
    bust.position.set(0, HIP_Y, HIP_Z);
    bust.rotation.z = LEAN;
    figure.add(bust);

    /** A point in the bust's leaning frame, expressed in the figure's. */
    const fromBust = (x: number, y: number, z: number) =>
      new THREE.Vector3(x, y, z)
        .applyEuler(new THREE.Euler(0, 0, LEAN))
        .add(new THREE.Vector3(0, HIP_Y, HIP_Z));

    const body = new THREE.Group();
    body.scale.z = DEPTH;
    bust.add(body);

    for (let i = 0; i + 1 < TORSO.length; i++) {
      const a = TORSO[i]!;
      const b = TORSO[i + 1]!;
      const course = taper(a.r, b.r, b.y - a.y, bronze, SIDES);
      course.position.y = a.y;
      body.add(course);
    }

    // Outside `body`, so the squash does not pull it flat: this horizontal mass
    // is Christ the Redeemer's finding — it is what turns two limbs into arms
    // rather than sticks pushed into a torso — and here it doubles as the line
    // that shows one shoulder dropped and the other lifted.
    // Squashed six-sided rather than a box: square corners on the widest
    // horizontal mass in the figure were most of what made the first renders
    // read mechanical.
    const shoulders = taper(2.05, 1.88, 1.15, bronze, 6);
    shoulders.position.y = 4.95;
    shoulders.scale.z = 0.56;
    bust.add(shoulders);

    // Also outside `body`, so the squash does not flatten them back into the
    // ribs. Two five-sided cones laid forward, standing 0.3 proud. A single
    // chest slab was tried first and read as a breastplate: the pair is what
    // breaks the torso's front contour, and at this size the contour is the
    // only thing that says the figure is a woman.
    for (const side of [1, -1]) {
      const breast = taper(0.52, 0.3, 0.72, bronze, 5);
      breast.position.set(side * 0.66, 4.05, 1.0);
      breast.rotation.set(Math.PI / 2 - 0.3, 0, side * 0.2);
      bust.add(breast);
    }

    const neck = taper(0.68, 0.56, 1.05, bronze, 6);
    neck.position.set(0, NECK_Y, 0.12);
    bust.add(neck);

    // --- head, on its own pivot so the bow and the turn happen at the neck ---
    const head = new THREE.Group();
    head.position.set(0, HEAD_Y, 0.1);
    head.rotation.set(HEAD_BOW, HEAD_TURN, HEAD_TILT);
    bust.add(head);

    const skull = taper(0.9, 0.83, 2.15, bronze, 6);
    skull.scale.z = 1.08;
    head.add(skull);

    // Hair **around the back of the skull**, not on top of it, and running the
    // head's full height rather than sitting above it. Two earlier versions put
    // a wide flat slab across the crown and both rendered as a brown lid on a
    // green cube — a golem in a helmet. This covers the back two thirds and 0.6
    // proud behind, which also gives the profile something other than a flat
    // wall of face, and leaves the front third bare. Christ the Redeemer's
    // warning holds in the other direction: nothing comes down over the brow.
    const crown = box(1.8, 2.3, 1.9, hairColor);
    crown.position.set(0, 0.15, -0.65);
    head.add(crown);

    // --- the fall, in the bust's frame so it hangs off her shoulder and does
    //     not swing with the head ---
    // **One hank, forward over the near shoulder, and big.** It was down her
    // back first — which is where a head turned to her left actually throws it —
    // and the camera sits on that same side, so the whole mass hid behind her
    // ribs and the figure read bald. It was then three small dark pieces around
    // the same shoulder, which read as a satchel. One long tapering hank from
    // the nape to below the waist, off-centre enough not to hang down her
    // sternum like a tie, is the version that reads as hair.
    const fall = taper(0.4, 1.1, 4.9, hairColor, 5);
    fall.position.set(2.0, 1.7, -1.05);
    fall.rotation.set(0.1, 0.25, 0.26);
    bust.add(fall);

    // -----------------------------------------------------------------------
    // Arms. Built in the figure's frame from the shoulders the lean put them at,
    // which is why they are struts between named points rather than tapers with
    // rotations: the pose is a list of joints, and it should read as one.
    // -----------------------------------------------------------------------

    const propShoulder = fromBust(SHOULDER_X, SHOULDER_Y, 0);
    const dropShoulder = fromBust(-SHOULDER_X, SHOULDER_Y, 0);

    figure.add(limb(propShoulder, at(PROP_ELBOW), 0.52, 0.4));
    figure.add(limb(at(PROP_ELBOW), at(PROP_HAND), 0.4, 0.31));
    const propHand = box(0.85, 0.45, 1.1, bronze);
    propHand.position.set(PROP_HAND[0], PROP_HAND[1] - 0.1, PROP_HAND[2]);
    propHand.rotation.y = -0.3;
    figure.add(propHand);

    figure.add(limb(dropShoulder, at(DRAPE_ELBOW), 0.5, 0.38));
    figure.add(limb(at(DRAPE_ELBOW), at(DRAPE_HAND), 0.38, 0.3));
    const dropHand = box(0.82, 0.45, 1.05, bronze);
    dropHand.position.set(DRAPE_HAND[0], DRAPE_HAND[1], DRAPE_HAND[2]);
    dropHand.rotation.y = 0.35;
    figure.add(dropHand);

    // -----------------------------------------------------------------------
    // Legs and tail
    // -----------------------------------------------------------------------

    figure.add(limb(at(RIGHT_HIP), at(RIGHT_KNEE), 0.82, 0.56, 6));
    // The knee gets a block of its own. Two struts meeting at a point leave a
    // notch there, and this is the joint the whole far side of the silhouette
    // is hanging on.
    const kneecap = box(1.2, 1.0, 1.2, bronze);
    kneecap.position.set(RIGHT_KNEE[0], RIGHT_KNEE[1] - 0.55, RIGHT_KNEE[2]);
    kneecap.rotation.y = 0.4;
    figure.add(kneecap);
    figure.add(limb(at(RIGHT_KNEE), at(TAIL_ROOT), 0.54, 0.66, 6));

    // The other leg is folded away along the rock and goes to the same place, so
    // it is one beam: thigh, knee and all. It costs a mesh it would otherwise
    // spend on a joint nobody can see from in front.
    figure.add(limb(at(LEFT_HIP), at(TAIL_ROOT), 0.8, 0.62, 6));

    // The tail proper, thinning as it spills over the boulder's front edge onto
    // the low stone below.
    // Deliberately fatter than any limb — 0.95 against the thigh's 0.82 — and
    // thinning as it goes. A tail the same thickness as an arm is a fifth limb.
    figure.add(limb(at(TAIL_ROOT), at(TAIL_MID), 0.95, 0.78, 6));
    figure.add(limb(at(TAIL_MID), at(TAIL_END), 0.78, 0.5, 6));

    const fluke = new THREE.Group();
    fluke.position.set(TAIL_END[0], TAIL_END[1], TAIL_END[2]);
    fluke.rotation.y = FLUKE_HEADING;
    figure.add(fluke);

    for (const side of [1, -1]) {
      // A four-sided taper flaring from 0.4 to 1.3, then squashed to a third of
      // its thickness: a blade whose broad face is its local Z, which the
      // group's heading has already aimed across the camera.
      const lobe = taper(0.5, 1.75, FLUKE_LENGTH, bronze, 4);
      lobe.scale.z = 0.38;
      lobe.rotation.z = side * FLUKE_SPLAY;
      fluke.add(lobe);
    }

    return group;
  },
};
