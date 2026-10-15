import { PROUD } from './contract.ts';
import type { Mesh, Monument } from './contract.ts';

/**
 * Marina Bay Sands.
 *
 * Three things are this building: three separate towers in a row (two full-height
 * slots of sky between them), each tower leaning and splitting low down into an
 * asymmetric A-frame (one leg vertical, one splayed, a triangular hole between),
 * and the SkyPark, a boat-shaped deck lying across all three tops and overhanging
 * the far end by a quarter of its length with nothing under it. The overhang
 * gets a pointed prow; the deck carries a row of trees down one edge and a pool
 * down the other. Proportions were measured off a bay photograph and the 2009
 * construction shot, in fractions of a tower's top width.
 *
 * Tier `building`: at true proportions the deck is 340 m long and 38 m wide, so
 * the true plan needs a radius of 34.2, which only `building` admits. Height is
 * the smallest dimension (39.6 tall, about 61 wide), and the deck being longer
 * than the towers are tall is the impression, so nothing is taken off the
 * horizontal. The metre is `UNIT`, anchored on the deck.
 *
 * Deliberate stretches: the deck is 2.4x too thick (a plank otherwise); the
 * cantilever is a quarter of the length rather than 19.4%, which closes the gaps
 * between towers to 0.65 of a tower, the photographed rhythm; everything is 1.2x
 * deep, seen from 15 degrees up; the trees are 1.9x, alternating big and small
 * and shifted across the bed so the row does not become a comb; the raking edge
 * goes to 11.2 degrees (the photograph gives 6.2) and the plumb edge gets 2.6
 * degrees so the whole card tips. Because one prism has one `scale.z`, depth
 * narrows with width, so the vertical leg is set to 4.2 deep, between the two.
 *
 * Left out: the podium (a 1.2-unit plinth instead, which still joins the three
 * towers at the bottom without eating the void), the curve of the raking leg
 * (straight keeps the waist and the flare), and floor banding. The splayed leg
 * is 1.37x too fat to keep it visible at thumbnail size.
 *
 * Colour: `white` for the boat's top layers, bow, stern and the blades up the
 * tower edges; `cream` for the towers and the hull's bottom two layers, one step
 * under white so the deck sits on the towers; `slate` only as a line (the
 * junction band and the plinth cornice); `darkOlive` and `green` for the garden;
 * `skyBlue` for the pool; `tan` for the plinth. The model's shaded surfaces (the
 * soffit and the A-frame voids) are all warm, since neutrals go hueless in shade.
 * It differs from Petronas by having three masses, a deck on top, a cantilever,
 * leaning slabs and holes through the bases.
 */

// --- Scale: one metre, fixed by the deck ---
/** The metre, anchored on the SkyPark's 340 m: 0.18 units per metre. */
const UNIT = 61.2 / 340;

/** Underside of the SkyPark: the top of the towers. */
const DECK_BASE = 33.4;
/** Deck thickness, 2.4x life. */
const DECK_DEPTH = 3.4;
const DECK_TOP = DECK_BASE + DECK_DEPTH;

/** 340 m. Half of it either side of the axis, which is what centres the model. */
const DECK_HALF = (340 * UNIT) / 2;
/** 38 m at 1.2x. It also leaves the pool and the bed room. */
const DECK_HALF_WIDTH = 4.2;

/** Where the hull's parallel body ends and the bow begins. */
const BOW_BASE = 24;
/** And where the blunt stern rounds off. */
const STERN_BASE = -27.6;

/** The prow face of the tower nearest the bow; from here to +30.6 the deck is over air. */
const CANTILEVER = 15.3;

const PLINTH_TOP = 1.2;

// --- The tower, in offsets from the centre of its slab where it meets the deck ---
/** Half the slab at the deck: 10.16 wide, which is 56 m — true scale. */
const TOWER_HALF = 5.08;
/** Depth there, 1.2x life; it narrows with the width down to the waist. */
const TOWER_DEPTH = 5.6;
/** Level 23 of 55, where the two legs lock together. 0.40 of the height. */
const WAIST_Y = 13.2;
/** The plumb edge: 2.6 degrees, where life is 0. */
const WAIST_MIN = -6;
/** The raking edge: 11.2 degrees, where the photograph gives 6.2. */
const WAIST_MAX = 1.05;
/** Geometric top of the slab; the last 0.2 is inside the hull. */
const SLAB_TOP = DECK_BASE + 0.2;

/** The vertical leg. 0.47 of the tower width, which is the measured value. */
const LEG_MIN = -5.55;
const LEG_MAX = -0.75;
const LEG_TOP = 14;
const LEG_DEPTH = 4.2;

/** The splayed leg: foot, head, half-width and depth. 21 degrees off plumb. */
const RAKE_FOOT_X = 4.85;
const RAKE_FOOT_Y = 0.55;
const RAKE_HEAD_X = -0.3;
const RAKE_HALF = 1.25;
const RAKE_DEPTH = 3.7;

/** The level-23 truss floor: the one horizontal on the tower. */
const BAND_MIN = -6.3;
const BAND_MAX = 2;
const BAND_BASE = 12.2;
const BAND_TOP = 13.8;
const BAND_DEPTH = 4.9;

/** The pale concrete blades up both edges of the slab. */
const FIN_HALF = 0.45;
const FIN_DEPTH = 5.8;

/**
 * Tower centres. The bow-most tower's slab ends exactly on `CANTILEVER`, the
 * stern-most 2.2 units inside the deck's tail, and the two gaps come out at 6.61.
 */
const TOWER_GAP = 6.61;
const TOWER_PITCH = TOWER_HALF * 2 + TOWER_GAP;
const TOWER_X = [
  CANTILEVER - TOWER_HALF - TOWER_PITCH * 2,
  CANTILEVER - TOWER_HALF - TOWER_PITCH,
  CANTILEVER - TOWER_HALF,
];

/** Trees: crowns evenly spaced along the bed, stopping where the bow narrows under them. */
const TREE_COUNT = 12;
const TREE_FIRST = -24.5;
const TREE_PITCH = 4.3;
const TREE_Z = -2.7;

export const marinaBaySands: Monument = {
  id: 'marina-bay-sands',
  name: 'Marina Bay Sands',
  iso: 'SGP',
  lat: 1.284,
  lon: 103.861,
  tier: 'building',
  surface: 'concrete',
  surfaces: { cream: 'metal', tan: 'none' },
  footprint: 31,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;

    const glass = palette.cream;
    const concrete = palette.white;
    const truss = palette.slate;
    const bed = palette.darkOlive;
    const leaf = palette.green;
    const trunkColor = palette.bark;
    const keel = palette.cream;
    const water = palette.skyBlue;
    const ground = palette.tan;

    const group = new THREE.Group();

    /**
     * A slab standing between two points, leaning and tapering with them. The
     * half-widths are horizontal; a tilted prism measures its own across its
     * axis, hence the cosine. `bury` extends it past both ends along the axis,
     * because a tilted prism's end caps are cut square to the axis and have to
     * finish inside something else (the hull, the truss band, the plinth). One
     * prism has one `scale.z`, so the depth narrows in step with the width.
     */
    const leaning = (
      footX: number,
      footY: number,
      footHalf: number,
      headX: number,
      headY: number,
      headHalf: number,
      depth: number,
      color: number,
      buryFoot: number,
      buryHead: number,
    ): Mesh => {
      const dx = headX - footX;
      const dy = headY - footY;
      const span = Math.hypot(dx, dy);
      const lean = Math.atan2(dx, dy);
      const cos = Math.cos(lean);
      const a = footHalf * cos;
      const b = headHalf * cos;
      const rate = (b - a) / span;
      const mesh = taper(
        a - rate * buryFoot,
        b + rate * buryHead,
        span + buryFoot + buryHead,
        color,
        4,
      );
      mesh.scale.z = depth / (2 * b);
      mesh.rotation.z = -lean;
      mesh.position.set(footX - Math.sin(lean) * buryFoot, footY - cos * buryFoot, 0);
      return mesh;
    };

    /**
     * A hull end: a prism laid along X so it narrows in plan and in section at
     * once. A quarter turn about Z sends a `taper`'s axis down +X (or -X) and
     * leaves its flats on the top, bottom and sides. Because the section would
     * shrink in height as fast as in plan (a sharpened pencil), the axis is
     * tilted up by `rise`, the height the section loses, so the deck line stays
     * level to the stem and the taper is spent on the underside.
     */
    const hullEnd = (
      baseX: number,
      tipX: number,
      baseHalf: number,
      tipHalf: number,
      baseHeight: number,
      baseY: number,
      color: number,
    ): Mesh => {
      const run = tipX - baseX;
      const rise = baseHeight * (1 - tipHalf / baseHalf);
      const delta = Math.atan2(rise, Math.abs(run));
      const mesh = taper(baseHalf, tipHalf, Math.hypot(run, rise), color, 4);
      mesh.scale.x = baseHeight / baseHalf;
      mesh.rotation.z = run > 0 ? -Math.PI / 2 + delta : Math.PI / 2 - delta;
      mesh.position.set(baseX, baseY, 0);
      return mesh;
    };

    // --- The plinth; it stops at 16.8, so the last 13.8 units of deck have nothing under them ---
    const plinthMin = -29.6;
    const plinthMax = 16.8;
    const plinthWidth = plinthMax - plinthMin;
    const plinth = box(plinthWidth, PLINTH_TOP, 10.2, ground);
    plinth.position.set((plinthMin + plinthMax) / 2, 0, 0);
    group.add(plinth);

    // Its top stops `PROUD` under the plinth's.
    const cornice = box(plinthWidth + 0.5, 0.28, 10.7, truss);
    cornice.position.set((plinthMin + plinthMax) / 2, PLINTH_TOP - 0.28 - PROUD, 0);
    group.add(cornice);

    // --- The three towers ---
    for (const centre of TOWER_X) {
      const tower = new THREE.Group();

      // The slab: plumb on the far edge, raking on the near one, so the card tips toward the bow.
      const waistCentre = (WAIST_MIN + WAIST_MAX) / 2;
      const waistHalf = (WAIST_MAX - WAIST_MIN) / 2;
      tower.add(
        leaning(
          waistCentre,
          WAIST_Y,
          waistHalf,
          0,
          SLAB_TOP,
          TOWER_HALF,
          TOWER_DEPTH,
          glass,
          0.5,
          0.5,
        ),
      );

      // The concrete blades up both edges, slightly proud in z so each takes its
      // own ink line, and stepped out past the slab's edge in x. The raking side
      // steps twice as far, because the slab's raking face stands a hair inside
      // `WAIST_MAX`.
      for (const side of [-1, 1] as const) {
        const waistEdge = side < 0 ? WAIST_MIN : WAIST_MAX;
        const topEdge = side * TOWER_HALF;
        const out = side < 0 ? PROUD : PROUD * 2;
        tower.add(
          leaning(
            waistEdge - side * (FIN_HALF - out),
            WAIST_Y,
            FIN_HALF,
            topEdge - side * (FIN_HALF - out),
            SLAB_TOP,
            FIN_HALF,
            FIN_DEPTH,
            concrete,
            0.5,
            0.5,
          ),
        );
      }

      // The vertical leg, straight to the ground.
      const legVertical = box(LEG_MAX - LEG_MIN, LEG_TOP, LEG_DEPTH, glass);
      legVertical.position.set((LEG_MIN + LEG_MAX) / 2, 0, 0);
      tower.add(legVertical);

      // The splayed leg. Its foot is buried in the plinth and its head inside
      // the slab, so neither square cut is ever seen.
      tower.add(
        leaning(
          RAKE_FOOT_X,
          RAKE_FOOT_Y,
          RAKE_HALF,
          RAKE_HEAD_X,
          LEG_TOP,
          RAKE_HALF,
          RAKE_DEPTH,
          concrete,
          0,
          1.2,
        ),
      );

      // Level 23: the truss floor that locks the two legs together.
      const band = box(BAND_MAX - BAND_MIN, BAND_TOP - BAND_BASE, BAND_DEPTH, truss);
      band.position.set((BAND_MIN + BAND_MAX) / 2, BAND_BASE, 0);
      tower.add(band);

      tower.position.x = centre;
      group.add(tower);
    }

    // --- The SkyPark: a narrow keel, a shoulder and the wide top fascia, with a
    // bow and a blunt stern continuing the section. The body runs 0.4 past both
    // ends so the tilted end caps finish inside it. ---
    const bodyMin = STERN_BASE - 0.4;
    const bodyMax = BOW_BASE + 0.4;
    const bodyWidth = bodyMax - bodyMin;
    const bodyCentre = (bodyMin + bodyMax) / 2;
    const layers: Array<[half: number, base: number, top: number, color: number]> = [
      [2, DECK_BASE, DECK_BASE + 0.9, keel],
      [3.1, DECK_BASE + 0.9, DECK_BASE + 1.8, keel],
      [3.6, DECK_BASE + 1.8, DECK_BASE + 2.6, concrete],
      [DECK_HALF_WIDTH, DECK_BASE + 2.6, DECK_TOP, concrete],
    ];
    for (const [half, base, top, color] of layers) {
      const layer = box(bodyWidth, top - base, half * 2, color);
      layer.position.set(bodyCentre, base, 0);
      group.add(layer);
    }

    const midDeck = (DECK_BASE + DECK_TOP) / 2;
    group.add(
      hullEnd(BOW_BASE, DECK_HALF, DECK_HALF_WIDTH, 0.9, DECK_DEPTH / 2, midDeck, concrete),
    );
    group.add(
      hullEnd(STERN_BASE, -DECK_HALF, DECK_HALF_WIDTH, 2.4, DECK_DEPTH / 2, midDeck, concrete),
    );

    // --- On top: the garden down the far edge, the pool down the near one ---
    const gardenBed = box(48, 0.45, 2.6, bed);
    gardenBed.position.set(-1, DECK_TOP, TREE_Z);
    group.add(gardenBed);

    for (let i = 0; i < TREE_COUNT; i++) {
      const x = TREE_FIRST + i * TREE_PITCH;
      const trunk = column(0.24, 0.6, trunkColor, 4);
      trunk.position.set(x, DECK_TOP + 0.45, TREE_Z);
      group.add(trunk);

      // Alternating crowns, deterministic on the index.
      const big = i % 2 === 0;
      const crown = taper(big ? 1.15 : 0.95, big ? 0.5 : 0.42, big ? 2.05 : 1.7, leaf, 6);
      crown.position.set(x, DECK_TOP + 0.8, TREE_Z + (big ? -0.2 : 0.25));
      group.add(crown);
    }

    // 150 m of infinity pool: a pale surround with the water standing proud of it.
    const poolCentre = -4.5;
    const poolPad = box(28.2, 0.34, 3.4, concrete);
    poolPad.position.set(poolCentre, DECK_TOP, 1.9);
    group.add(poolPad);

    const poolWater = box(150 * UNIT, 0.46, 2.6, water);
    poolWater.position.set(poolCentre, DECK_TOP, 1.9);
    group.add(poolWater);

    // The two rooftop pavilions, one either side of the pool.
    for (const [x, width, depth, height] of [
      [-22.4, 3.2, 2.4, 1.2],
      [14.6, 2.6, 2, 1],
    ] as const) {
      const pavilion = box(width, height, depth, glass);
      pavilion.position.set(x, DECK_TOP, 1.0);
      group.add(pavilion);
    }

    return group;
  },
};
