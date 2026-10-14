import type { Monument, Vector3 } from './contract.ts';

/**
 * The Little Mermaid, Langelinie, Copenhagen.
 *
 * The statue is 1.25 m tall, a third of the `monument` tier at avatar scale, so
 * the model is the outcrop she sits on: the granite erratic and a ring of
 * stones at the waterline, with her on it. The seated pose only exists because
 * of the rock. The boulder is 5.4 units against 9.4 of figure (about 1.6x
 * exaggerated in the figure's favour), and the mass goes sideways instead, so
 * the model is 18 wide against 14.8 tall, which also carries the footprint.
 *
 * Three things make the pose, all negative space: the planted arm (elbow at
 * 4.55 against ribs at 2.01), the drawn-up knee against sky, and a torso
 * leaning 8.6 degrees onto the planted hand. The tail has human thighs and the
 * fish begins below the knees, ending in two lobes splayed 97 degrees apart
 * (see `FLUKE_SPLAY`). The hair is the darker bronze, kept off the face.
 *
 * Colour: `green` patina for the bronze (as the Statue of Liberty),
 * `darkOlive` for hair, `steel` for the boulder, `slate` for the outer stones
 * and `skyBlue` for a 0.55-high water plate the stones stand through.
 * Roughness comes from normals: five prisms of 6, 7 and 8 sides yawed against
 * each other, and outer stones leaning inward.
 *
 * The handedness of the pose is arranged for the quarter camera: she leans on
 * her left hand, draws up her right knee, and her tail spills to her left front.
 * No `realHeight`: 1.25 m would fight its own picture on the card.
 * Budget: 844 triangles of 900 and 37 meshes of 40; every limb has a five- or
 * six-sided section instead of `strut`'s square one.
 */

// --- The outcrop ---

/** Waterline. Everything stands on y = 0 and 0.55 of every stone is submerged. */
const WATER_RADIUS = 7.7;
const WATER_HEIGHT = 0.55;

/** Top of the boulder, and so the height she sits at. */
const SEAT = 5.4;

/**
 * The stones at the water's edge. `lean` tips each one inward, toward the
 * boulder, so the cluster reads as one outcrop and no top swings out past the
 * footprint. `yaw` spins each prism so no two present the same facet. A stone
 * tilted about its base dips one corner below y = 0, so each is lifted by
 * `circumradius * sin(lean)`; the leans (0.10 at most) keep the gap under the
 * water plate's 0.55.
 */
const STONES = [
  { x: 5.3, z: 2.7, radius: 2.1, top: 0.6, height: 1.9, sides: 6, yaw: 0.42, lean: 0.07 },
  { x: 4.7, z: -3.2, radius: 1.8, top: 0.55, height: 1.5, sides: 5, yaw: -0.7, lean: 0.09 },
  { x: 0.85, z: -5.7, radius: 2.2, top: 0.6, height: 2.2, sides: 6, yaw: 0.25, lean: 0.055 },
  { x: -4.0, z: -4.4, radius: 1.9, top: 0.58, height: 1.7, sides: 5, yaw: 0.9, lean: 0.08 },
  { x: -5.7, z: 0.6, radius: 2.1, top: 0.6, height: 2.4, sides: 6, yaw: -0.35, lean: 0.05 },
  { x: -4.1, z: 4.15, radius: 1.8, top: 0.55, height: 1.3, sides: 5, yaw: 0.55, lean: 0.1 },
];

// --- The figure ---

/**
 * How far she is turned within the composition: -13 degrees puts her facing 45
 * degrees off the quarter camera and 13 off the front camera.
 */
const YAW = -0.227;

/** Hips: the pivot everything above is built on, sunk 0.15 into the seat. */
const HIP_Y = SEAT - 0.15;
const HIP_Z = 0.25;

/** Lean, about Z, onto the planted hand. Negative tips her top toward +X, her left. */
const LEAN = -0.15;

/** Front-to-back squash on the torso. A slim figure is much deeper than she is wide. */
const DEPTH = 0.72;
/** Faces of the torso prism. Six, not Christ's eight: chunkier reads better this small. */
const SIDES = 6;

/** Half-width of the torso at each height above the hips; the 1.58 waist against 2.32 hips and 2.05 chest is the hourglass. */
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
/** The elbow juts to x = 4.55 while the ribs at that height are at 2.01; the gap is air. */
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
 * The fluke. `FLUKE_HEADING` turns the pair so the plane they splay in lies
 * across the quarter camera's ray, not along it. `FLUKE_SPLAY` is measured off
 * vertical: at 0.85 the lobes are 97 degrees apart and each keeps an upward
 * component, where a flat 143-degree fan foreshortens to two sticks. The tail
 * is short and high so the fluke sits against the boulder's dark face, not
 * the slate stones.
 */
const FLUKE_HEADING = 1.265;
const FLUKE_SPLAY = 0.85;
const FLUKE_LENGTH = 2.25;

// --- head and hair ---
const NECK_Y = 5.95;
/** Head pivot, in the bust's frame. A clear unit of neck shows under it. */
const HEAD_Y = 6.72;
/** Turned toward her left (the planted hand and the camera) and bowed; the bow puts her hair at the crown. */
const HEAD_TURN = 0.62;
const HEAD_BOW = 0.3;
const HEAD_TILT = -0.12;

export const littleMermaid: Monument = {
  id: 'little-mermaid',
  name: 'The Little Mermaid',
  iso: 'DNK',
  lat: 55.693,
  lon: 12.599,
  // No `realHeight`: see the note at the top.
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
     * A tapered limb between two points: a five-sided section that narrows
     * toward the end, which `strut` cannot do, placed the way `strut` places.
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

    // --- Water, then the outcrop standing through it ---

    // Bevelled: a vertical cyan wall reads as a swimming pool where it meets land.
    group.add(taper(WATER_RADIUS, WATER_RADIUS - 0.3, WATER_HEIGHT, water, 16));

    for (const stone of STONES) {
      const circumradius = stone.radius / Math.cos(Math.PI / stone.sides);
      const pivot = new THREE.Group();
      // Lifted by the amount the lean is about to dip the low corner.
      pivot.position.set(stone.x, circumradius * Math.sin(stone.lean), stone.z);
      // Local +Z now points away from the boulder, so a positive `lean` about X tips the top outward.
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

    // The erratic: a bulge wider at 2.6 than at its foot. Two eight-sided prisms
    // yawed against each other, so the seams do not run straight up.
    const lower = taper(4.9, 5.5, 2.5, boulder, 8);
    lower.rotation.y = 0.2;
    group.add(lower);

    const upper = taper(5.5, 4.35, 2.5, boulder, 8);
    upper.position.y = 2.5;
    upper.rotation.y = -0.18;
    group.add(upper);

    // The seat, a seven-sided cap standing 0.15 proud so the ink finds a lip.
    const cap = taper(4.5, 4.2, 0.4, boulder, 7);
    cap.position.y = 5.0;
    cap.rotation.y = 0.5;
    group.add(cap);

    // Two shoulders on the erratic: the +X one under the planted elbow, the -Z one so it is not a drum from behind.
    const flank = taper(2.4, 1.85, 4.2, boulder, 6);
    // Same lift as the shore stones, for the same reason.
    flank.position.set(4.9, (2.4 / Math.cos(Math.PI / 6)) * Math.sin(0.07), 0.7);
    flank.rotation.set(-0.07, -0.35, 0);
    group.add(flank);

    const haunch = taper(2.3, 1.7, 3.6, boulder, 6);
    haunch.position.set(-2.1, (2.3 / Math.cos(Math.PI / 6)) * Math.sin(0.08), -4.8);
    haunch.rotation.set(0.08, 0.5, 0);
    group.add(haunch);

    // --- The figure ---

    const figure = new THREE.Group();
    figure.rotation.y = YAW;
    group.add(figure);

    // The bust carries the lean; `body` inside it carries the front-to-back squash.
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
    // turns two limbs into arms. Six-sided rather than a box.
    const shoulders = taper(2.05, 1.88, 1.15, bronze, 6);
    shoulders.position.y = 4.95;
    shoulders.scale.z = 0.56;
    bust.add(shoulders);

    // Also outside `body`: two five-sided cones laid forward, 0.3 proud, break the torso's front contour.
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

    // Hair around the back of the skull, over its full height, 0.6 proud behind, with the front third bare.
    const crown = box(1.8, 2.3, 1.9, hairColor);
    crown.position.set(0, 0.15, -0.65);
    head.add(crown);

    // --- the fall, in the bust's frame so it hangs off her shoulder ---
    // One long tapering hank from the nape to below the waist, forward over the near shoulder.
    const fall = taper(0.4, 1.1, 4.9, hairColor, 5);
    fall.position.set(2.0, 1.7, -1.05);
    fall.rotation.set(0.1, 0.25, 0.26);
    bust.add(fall);

    // --- Arms: struts between named joints in the figure's frame ---

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

    // --- Legs and tail ---

    figure.add(limb(at(RIGHT_HIP), at(RIGHT_KNEE), 0.82, 0.56, 6));
    // The knee gets a block of its own: two struts meeting at a point leave a notch.
    const kneecap = box(1.2, 1.0, 1.2, bronze);
    kneecap.position.set(RIGHT_KNEE[0], RIGHT_KNEE[1] - 0.55, RIGHT_KNEE[2]);
    kneecap.rotation.y = 0.4;
    figure.add(kneecap);
    figure.add(limb(at(RIGHT_KNEE), at(TAIL_ROOT), 0.54, 0.66, 6));

    // The other leg is folded along the rock and goes to the same place, so it is one beam.
    figure.add(limb(at(LEFT_HIP), at(TAIL_ROOT), 0.8, 0.62, 6));

    // The tail proper, thinning as it spills over the boulder's front edge. It is
    // fatter than any limb, or it reads as a fifth limb.
    figure.add(limb(at(TAIL_ROOT), at(TAIL_MID), 0.95, 0.78, 6));
    figure.add(limb(at(TAIL_MID), at(TAIL_END), 0.78, 0.5, 6));

    const fluke = new THREE.Group();
    fluke.position.set(TAIL_END[0], TAIL_END[1], TAIL_END[2]);
    fluke.rotation.y = FLUKE_HEADING;
    figure.add(fluke);

    for (const side of [1, -1]) {
      // A four-sided taper flaring from 0.4 to 1.3, squashed to a third: a blade
      // whose broad face is its local Z, aimed across the camera by the group's heading.
      const lobe = taper(0.5, 1.75, FLUKE_LENGTH, bronze, 4);
      lobe.scale.z = 0.38;
      lobe.rotation.z = side * FLUKE_SPLAY;
      fluke.add(lobe);
    }

    return group;
  },
};
