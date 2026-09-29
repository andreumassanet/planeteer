import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, Vector3 } from './contract.ts';

/**
 * Christ the Redeemer.
 *
 * **A figure on a peak, not a figure on a plinth.** The old model was the
 * statue alone on a 16-unit block, 104 units of figure, and it read as a
 * crucifix standing in a field. Nobody has ever seen it that way: the statue is
 * 30 m on a 700 m granite dome and every picture of it — from the bay, from
 * Sugarloaf, from the beach at Botafogo — is a small white cross on a dark
 * rock over a green forest. So the 120 units are now spent as the view spends
 * them:
 *
 * - **0 to 30: Corcovado's summit.** A steep granite dome in four stacked
 *   frusta, each stepped in from the one below and turned so their facets never
 *   line up — rock, not masonry — and leaning back, away from where the
 *   statue looks, as the ridge runs on behind it. Three lower shoulders stand
 *   round it, four sheer faces stand proud of it leaning with its slope, and
 *   the Atlantic forest rings its feet and climbs its lower third. The dome is
 *   `steel` lifted to a mid grey in two tones, the forest `green` and
 *   `darkOlive`.
 * - **30 to 33: the terrace.** The viewing platform in a ring round the top,
 *   cantilevered a unit past the rock with its railing, and the square upper
 *   platform the pedestal stands on, railed too.
 * - **33 to 46: the pedestal**, which is also the chapel: a stone block under a
 *   cornice, with its door on the back.
 * - **46 to 120: the statue**, 74 units for its 30 m — the true proportion, so
 *   the arms span 68 against 74 of height, 28 m against 30.
 *
 * **Why a summit and not the mountain.** `footprint` is 48 and the landmark
 * tier is 120 tall. The real Corcovado, at the statue's own scale, would be
 * 1,750 units high; at the tier's scale the statue would be a speck. So this is
 * the crag the statue stands on and no more — thirty units, a quarter of the
 * model — which is enough to read as a peak in silhouette and keeps the figure
 * at five-eighths of the model's height. The statue lost 30 units to it,
 * and the pedestal is 13 units where true scale would make it 20: the chapel is
 * the part nobody names the thing by.
 *
 * **The figure, and what makes it this one rather than a crucifix.** Carried
 * over from the first model: the robe flares from a pinched waist, the body is
 * flattened front to back, the shoulders are a mass of their own and the arms
 * taper to open hands. New:
 *
 * - **The sleeves.** The robe's sleeves hang under the arms from the armpit to
 *   the forearm, deepest nearest the body, so each arm is a thick wedge rather
 *   than a stick — that is the real silhouette, and it is what stops the arms
 *   reading as a crossbar through a post.
 * - **The head is bowed**, eleven degrees forward, looking down at the city.
 * - **Hair to the shoulders and a beard**, in a darker tone of the same stone,
 *   parted over a face with a brow, a nose and eye sockets.
 * - **The cord at the waist**, its two ends hanging down the front, and **the
 *   heart** on the chest, both in relief.
 * - **Feet** under the hem, on the statue's own base.
 * - **Folds** down every face of the robe: they carry no colour, only ink.
 *
 * **Colour.** The statue is soapstone, a pale warm grey-white: `white`, the
 * palette's warm one, because a neutral goes blue in shade and this figure is
 * half in shade from most angles; folds, cord and heart a tone down, hair and
 * beard further. The pedestal and terraces are `bone` concrete, the railings
 * `white`.
 *
 * **Budget.** Built as ordinary pieces and drawn by `ctx.merge` as one mesh per
 * colour — the "merging them by material later is a single call" that
 * `contract.ts` made every geometry non-indexed for.
 */

// --- the summit -------------------------------------------------------------

interface Frustum {
  bottom: number;
  top: number;
  base: number;
  height: number;
  /** Offset of the centre along Z: the dome leans back, behind the statue, where the ridge runs on. */
  z: number;
  /** Yaw, so no two layers' facets line up. */
  turn: number;
}

/** Four frusta, each stepped in half a unit from the top of the one below: the ledge is an ink line. */
const DOME: Frustum[] = [
  { bottom: 27.0, top: 23.6, base: 0, height: 9, z: -3.5, turn: 0 },
  { bottom: 23.0, top: 19.8, base: 9, height: 8, z: -2.2, turn: 0.21 },
  { bottom: 19.3, top: 16.8, base: 17, height: 7, z: -1.0, turn: 0.47 },
  { bottom: 16.3, top: 14.2, base: 24, height: 6, z: 0, turn: 0.12 },
];
const SUMMIT = 30;

/**
 * Lower masses round the dome, as [x, z, bottom, top, height]. The ridge runs on
 * behind. The third stops `PROUD` under the dome's first ledge: level with it,
 * its top and the ledge were two tones of granite in one plane and flickered.
 */
const SHOULDERS: [number, number, number, number, number][] = [
  [-17, -15, 13, 7, 15],
  [16, -17, 12, 6.5, 13],
  [-20, 7, 9.5, 5, 9 - PROUD],
];

/**
 * Sheer granite faces standing proud of the dome, as [angle, distance, width,
 * height]. Each leans back with the dome's own slope, so it is a cliff in the
 * hillside rather than a wall stood in front of it.
 */
const CLIFFS: [number, number, number, number][] = [
  [0.38, 20.4, 10, 16],
  [-0.52, 20.0, 8, 13],
  [1.65, 19.6, 9, 15],
  [-1.9, 19.2, 7.5, 12],
];
const CLIFF_BASE = 8;
const CLIFF_LEAN = 0.26;

/**
 * The forest climbing the dome's lower third, as [angle, height]. These stand
 * half inside the rock at `CLIMB` from the axis, so from outside they are the
 * canopy washing up the slope behind the collar.
 */
const CLIMBING: [number, number][] = [
  [0.3, 13], [0.95, 11], [1.55, 14], [2.35, 12], [3.9, 12], [4.6, 14], [5.25, 11], [5.85, 13],
];
const CLIMB = 27;

/**
 * The forest collar, as [x, z, height]. Blunt crowns, not points: a crown that
 * keeps two thirds of its width at the top is a broadleaf mass, where a point is
 * a spruce, and this is the Tijuca rainforest.
 */
const CLUMPS: [number, number, number][] = [
  [0, 31, 8.5],
  [11, 29.5, 7],
  [-11, 29, 9],
  [21, 24, 8],
  [-21, 23.5, 7.5],
  [29, 13, 9],
  [-29.5, 13, 8],
  [33, 0, 7],
  [-33, -1, 9.5],
  [30, -14, 8.5],
  [-30, -15, 7.5],
  [23, -27, 9],
  [-22, -28, 8],
  [9, -33, 7.5],
  [-9, -33.5, 9],
  [0, -36, 6.5],
  [38.5, 7, 6],
  [-39, 7, 6.5],
  [37, -19, 6],
  [-37, -20, 6.5],
];

// --- the terrace and the pedestal -------------------------------------------

const TERRACE = 15.5;
const TERRACE_TOP = SUMMIT + 1.4;
const PLATFORM_HALF = 10.6;
const PLATFORM_TOP = TERRACE_TOP + 2.0;
const PEDESTAL_TOP = 43.8;
const FEET = 46;

// --- the statue --------------------------------------------------------------

/**
 * Half-width of the robe at each height, before the front-to-back squash. The
 * hem is 10.5 against a 6.9 waist: 1.5 : 1, gentler than the first model's
 * 2.2, because the sleeves now carry the width the flare used to.
 */
const ROBE = [
  { y: FEET, r: 10.5 }, // hem lip, proud of the course above so the ink catches it
  { y: 48.5, r: 9.9 },
  { y: 58, r: 9.2 },
  { y: 70, r: 8.2 },
  { y: 80, r: 7.4 },
  { y: 88, r: 6.9 }, // waist, and the cord
  { y: 96, r: 7.6 },
  { y: 104, r: 8.4 }, // chest
];
const SIDES = 8;
/** How much narrower the statue is front to back than side to side. */
const DEPTH = 0.66;

const SHOULDER_BASE = 102.4;
const SHOULDER_HEIGHT = 6.1;
const ARM_Y = 106.2;
const SHOULDER_X = 8.4;
const ARM_LENGTH = 21;
const HAND_LENGTH = 5;
/** A couple of degrees below horizontal: a gesture, not a slump. */
const DROOP = 0.035;

const NECK_TOP = 109.8;
/** Forward tilt of the head. Eleven degrees. */
const BOW = 0.19;

function radiusAt(y: number): number {
  const first = ROBE[0]!;
  if (y <= first.y) return first.r;
  for (let i = 1; i < ROBE.length; i++) {
    const a = ROBE[i - 1]!;
    const b = ROBE[i]!;
    if (y <= b.y) return a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y);
  }
  return ROBE[ROBE.length - 1]!.r;
}

export const christTheRedeemer: Monument = {
  id: 'christ-the-redeemer',
  name: 'Christ the Redeemer',
  iso: 'BRA',
  lat: -22.9519,
  lon: -43.2105,
  realHeight: 38,
  tier: 'landmark',
  footprint: 48,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper, strut, ringWall, around } = ctx;
    const stone = palette.white;
    const fold = tone(palette.white, 0.9);
    const relief = tone(palette.white, 0.84);
    const hair = tone(palette.white, 0.72);
    const socket = tone(palette.white, 0.55);
    const concrete = palette.bone;
    const paving = tone(palette.bone, 0.9);
    const rail = palette.white;
    const door = palette.bark;
    const granite = [tone(palette.steel, 1.34), tone(palette.steel, 1.2)];
    const forest = [palette.green, palette.darkOlive, tone(palette.green, 0.84)];

    const draft = new THREE.Group();
    const at = (x: number, y: number, z: number): Vector3 => new THREE.Vector3(x, y, z);
    const place = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      draft.add(mesh);
      return mesh;
    };

    // --- the summit: dome, shoulders, forest ---------------------------------
    DOME.forEach((layer, index) => {
      const rock = taper(layer.bottom, layer.top, layer.height, granite[index % 2]!, 9);
      rock.rotation.y = layer.turn;
      place(rock, 0, layer.base, layer.z);
    });
    SHOULDERS.forEach(([x, z, bottom, top, height], index) => {
      const rock = taper(bottom, top, height, granite[(index + 1) % 2]!, 7);
      rock.rotation.y = 0.6 * index;
      place(rock, x, 0, z);
    });
    for (const [angle, distance, width, height] of CLIFFS) {
      const pivot = new THREE.Group();
      pivot.rotation.y = angle;
      const face = box(width, height, 3, granite[1]!);
      face.position.set(0, CLIFF_BASE, distance);
      // Pivoting on its own foot, the top falls back toward the axis.
      face.rotation.x = -CLIFF_LEAN;
      pivot.add(face);
      draft.add(pivot);
    }
    const clump = (height: number, index: number, x: number, z: number): void => {
      const crown = taper(height * 0.62, height * 0.42, height, forest[index % 3]!, 7);
      crown.rotation.y = 0.37 * index;
      place(crown, x, 0, z);
    };
    CLIMBING.forEach(([angle, height], index) => {
      clump(height, index + 1, CLIMB * Math.sin(angle), CLIMB * Math.cos(angle));
    });
    CLUMPS.forEach(([x, z, height], index) => clump(height, index, x, z));

    // --- the terrace: a railed ring on the rock, and the platform on it ---
    place(column(TERRACE, TERRACE_TOP - SUMMIT, paving, 12), 0, SUMMIT, 0);
    place(ringWall(TERRACE - 0.45, TERRACE, 1.1, rail, 12), 0, TERRACE_TOP, 0);
    place(box(PLATFORM_HALF * 2, PLATFORM_TOP - TERRACE_TOP, PLATFORM_HALF * 2, concrete), 0, TERRACE_TOP, 0);
    // The platform's rail: a four-sided ring turned so its flats face the axes.
    const platformRail = ringWall((PLATFORM_HALF - 0.4) * Math.SQRT2, PLATFORM_HALF * Math.SQRT2, 1.0, rail, 4);
    platformRail.rotation.y = Math.PI / 4;
    place(platformRail, 0, PLATFORM_TOP, 0);

    // --- the pedestal, which is the chapel ---
    place(taper(9.8, 9.2, PEDESTAL_TOP - PLATFORM_TOP, concrete, 4), 0, PLATFORM_TOP, 0);
    place(box(21.4, 1.0, 21.4, concrete), 0, PEDESTAL_TOP, 0);
    place(box(18.4, FEET - PEDESTAL_TOP - 1.0, 18.4, paving), 0, PEDESTAL_TOP + 1.0, 0);
    place(box(3.4, 5.4, 0.5, door), 0, PLATFORM_TOP, -9.75);

    // --- the robe ---
    // Squashed front to back on a group of its own, so every radius above stays
    // a plain half-width and the folds sit flat on the faces they belong to.
    const body = new THREE.Group();
    body.scale.z = DEPTH;
    draft.add(body);

    for (let i = 0; i + 1 < ROBE.length; i++) {
      const a = ROBE[i]!;
      const b = ROBE[i + 1]!;
      const section = taper(a.r, b.r, b.y - a.y, stone, SIDES);
      section.position.y = a.y;
      body.add(section);
    }

    // Folds, one per face of the prism, standing proud of it. They carry no
    // colour of their own worth naming — a tone down — and exist for the ink.
    const folds = (bottom: number, top: number, thickness: number): Group =>
      around(SIDES, () =>
        strut(at(0, bottom, radiusAt(bottom) + 0.5), at(0, top, radiusAt(top) + 0.4), thickness, fold),
      );
    body.add(folds(FEET + 3, 85.5, 1.6));
    body.add(folds(90.5, 102, 1.2));

    // The cord at the waist, and its two ends down the front.
    const cord = taper(radiusAt(88) + 0.45, radiusAt(89.6) + 0.45, 1.6, relief, SIDES);
    cord.position.y = 87.4;
    body.add(cord);
    for (const x of [-1, 1]) {
      body.add(strut(at(x * 0.9, 87.8, radiusAt(88) + 0.6), at(x * 1.5, 71, radiusAt(71) + 0.9), 0.9, relief));
    }

    // The heart, a diamond in relief on the left breast — the figure's left,
    // which is +X, the viewer's right.
    const heart = new THREE.Group();
    heart.position.set(2.4, 99.2, radiusAt(99.2) + 0.1);
    heart.rotation.z = Math.PI / 4;
    const lobe = box(2.2, 2.2, 1.4, relief);
    lobe.position.y = -1.1;
    heart.add(lobe);
    body.add(heart);

    // Feet, just showing under the hem.
    for (const x of [-1, 1]) {
      place(box(2.6, 1.4, 3.2, stone), x * 2.4, FEET, radiusAt(FEET) * DEPTH + 0.6);
    }

    // --- shoulders: their own mass, and their own squash ---
    const shoulders = new THREE.Group();
    shoulders.scale.z = 0.6;
    shoulders.position.y = SHOULDER_BASE;
    shoulders.add(taper(9.6, 7.4, SHOULDER_HEIGHT, stone, 8));
    draft.add(shoulders);

    // --- arms, sleeves and hands ---
    for (const side of [1, -1]) {
      const arm = new THREE.Group();
      arm.position.set(side * SHOULDER_X, ARM_Y, 0);
      // A `taper` stands on +Y, so a quarter turn about Z lays it out sideways;
      // the extra `DROOP` past the quarter turn tips the hand a little down.
      arm.rotation.z = -side * (Math.PI / 2 + DROOP);
      arm.add(taper(2.5, 1.5, ARM_LENGTH, stone, 6));
      const hand = box(4.4, HAND_LENGTH, 1.8, stone);
      hand.position.y = ARM_LENGTH - 0.3;
      arm.add(hand);
      // The thumb, forward and up, so the hand reads as open. The arm's quarter
      // turn sends its local X to world -Y on the right and +Y on the left, so
      // the thumb's X carries the opposite sign to put it on top both sides.
      const thumb = box(1.1, 2.4, 1.1, stone);
      thumb.position.set(-side * 1.8, ARM_LENGTH + 0.4, 1.0);
      arm.add(thumb);
      draft.add(arm);

      // The sleeves, hanging under the arm: deepest by the body, shallower
      // along the forearm. Axis-aligned boxes with their tops buried in the
      // arm, so only the drape shows.
      // The inner one starts inside the robe's side, which is the armpit.
      place(box(11.2, 7.4, 4.6, fold), side * 12.8, ARM_Y - 8.6, 0);
      place(box(8.6, 4.6, 3.8, fold), side * 22.3, ARM_Y - 5.6, 0);
    }

    // --- neck and head ---
    place(taper(3.4, 3.0, NECK_TOP - SHOULDER_BASE - SHOULDER_HEIGHT + 0.6, stone, 6), 0, SHOULDER_BASE + SHOULDER_HEIGHT - 0.6, 0.4);

    // The head is its own group, tipped forward about the chin, so every feature
    // below is written against the jaw line and the bow is one number.
    const head = new THREE.Group();
    head.position.set(0, NECK_TOP, 0.9);
    head.rotation.x = BOW;
    draft.add(head);
    const feature = (width: number, height: number, depth: number, color: number, x: number, y: number, z: number): void => {
      const mesh = box(width, height, depth, color);
      mesh.position.set(x, y, z);
      head.add(mesh);
    };
    feature(7.2, 8.4, 7.6, stone, 0, 0, 0); // the head
    feature(8.2, 2.2, 8.6, hair, 0, 7.2, -0.3); // crown of the hair
    feature(1.5, 8.0, 6.4, hair, 3.9, -1.2, -1.0); // the locks down each side
    feature(1.5, 8.0, 6.4, hair, -3.9, -1.2, -1.0);
    feature(7.6, 9.0, 2.2, hair, 0, -1.6, -3.8); // and down the back, to the shoulders
    feature(5.2, 3.0, 1.2, hair, 0, -0.4, 3.9); // the beard
    feature(5.6, 0.8, 1.0, stone, 0, 5.2, 3.9); // the brow
    feature(1.1, 2.4, 1.2, stone, 0, 2.8, 4.1); // the nose
    feature(1.5, 0.8, 0.5, socket, -1.5, 4.3, 3.85); // the eyes, under the brow
    feature(1.5, 0.8, 0.5, socket, 1.5, 4.3, 3.85);

    return ctx.merge(draft);
  },
};
