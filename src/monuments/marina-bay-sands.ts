import type { Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Marina Bay Sands.
 *
 * Three things are this building and nothing else on the sheet has any of them.
 * Everything in this file serves one of the three:
 *
 * - **Three separate towers standing in a row.** Not two (Petronas), not one.
 *   Two full-height slots of sky cut through the middle of the silhouette, and
 *   the towers do not touch anywhere below the deck.
 * - **Each tower leans, and splits low down into two legs.** The slab is not a
 *   vertical rectangle: its far edge stands almost plumb while its near edge
 *   rakes outward as it rises, so the tower is a card tipped toward the prow and
 *   widest where it meets the deck. Below the junction it opens into an
 *   asymmetric A-frame — one leg vertical, one splayed — with a triangular hole
 *   through it: 11 units of open height above the plinth and 4.3 wide at the
 *   foot, on a model 39.6 tall.
 * - **The SkyPark: one boat lying across all three tower tops, overhanging the
 *   far end by a quarter of its length with nothing under it.** This is the
 *   read. Three towers with a flat slab on top is a housing estate. Three towers
 *   with a hull balanced across them, sticking 15.3 units out into the air over
 *   an empty plinth, is Marina Bay Sands. The overhang gets a pointed prow; the
 *   deck carries a row of trees down one edge and a long pool down the other.
 *
 * The elevation was measured off two photographs rather than recalled — the
 * Wikimedia bay view (finished, dusk) and the 2009 construction shot, which is
 * the only common view where the podium does not bury the A-frames. Every
 * proportion quoted below as "measured" is off the construction shot, in
 * fractions of a tower's top width.
 *
 * ## Tier: `building`, and the tiers decide it before taste gets a vote
 *
 * At true proportions the SkyPark is 340 m long, 38 m wide, and its top sits at
 * about 200 m. So the half-diagonal against the height is
 * `hypot(340, 38) / 2 / 200` = **0.86**, against a `MAX_ASPECT` limit of 2.00.
 * This monument needs no crop and no vertical stretch: it is one of the few
 * wide things on the sheet that fits its own shape honestly. What it does not
 * fit is a `footprint`, and that is what picks the tier:
 *
 * | tier | height | radius the true plan needs | cap |
 * |---|---|---|---|
 * | `landmark` | 120 | 102.7 | 55 |
 * | `tower` | 70 | 59.9 | 28 |
 * | `building` | 40 | **34.2** | **55** |
 *
 * Only `building` admits it. This is the Arc de Triomphe case the contract
 * already names — "at 70 units tall it would be 63 wide, so it is a
 * `building`" — except twice as pronounced: at 70 units tall this would be 120
 * wide, and at 120 it would be 205.
 *
 * Three further reasons it is the right answer and not a demotion:
 *
 * - **Height is this monument's smallest dimension.** The model is 39.7 tall and
 *   **61.3 wide**. Burj Khalifa is 120 x 29, Petronas 70 x 30.3. Framed by
 *   `max(radius, footprint)`, as the contact sheet frames everything, this fills
 *   its cell on the horizontal — which is correct for a building whose roof is
 *   longer than its towers are tall.
 * - **The metres already order it.** 200 m against Petronas's 452 and the Burj's
 *   828, which the sheet files at 70 and 120. Forty units for 200 m is if
 *   anything generous: 200/452 is 0.44 where 40/70 is 0.57.
 * - **Reaching a higher tier would cost the one proportion that names it.**
 *   `landmark`'s 55-unit footprint caps the deck at about 109 units against a
 *   height of 120 — 0.91 : 1, where life is **1.70 : 1**. The SkyPark being
 *   *longer than the towers are tall* is the whole impression; the contract says
 *   to distort the axis carrying the least recognition, and here nothing may
 *   come off the horizontal. The model keeps 1.83 : 1 (61.2 over 33.4).
 *
 * ## Where the model lands
 *
 * Radius **30.9** of a declared 31 footprint — 56% of `building`'s 55, and 100%
 * of its own. Aspect `2 * 30.9 / 39.65` = **1.56** of 4, half-diagonal against
 * height **0.78** of 2. Height 39.6 of 40, 908 triangles of 2,600, 55 meshes of
 * 110.
 *
 * ## The five stretches, and what each one broke
 *
 * The metre is `61.2 / 340` = 0.18 units, anchored on the deck because the deck
 * is the dimension this monument is made of. A stretch is never free, so:
 *
 * 1. **The deck is 2.4x too thick** — 3.4 units where 8 m of structure scales to
 *    1.44. Two earlier passes at 2.4 and 2.8 both came out as a plank: at 61
 *    units long, a hull needs a section you can see the steps in.
 *    *What it broke:* the towers paid for it. At 33.4 units they are 185 m of a
 *    real 194 — 4% short — which moves deck-to-tower from the true 1.75 : 1 to
 *    1.83 : 1. That is the right pocket to take it from, because the ratio it
 *    hurts is the one that was already comfortably on the right side of 1.
 * 2. **The cantilever is a quarter, not 19.4%** — 15.3 units where 66 of 340 m
 *    gives 11.9. *What it broke:* nothing, and this is the rare one that paid
 *    for itself. Pushing the towers 3.4 units back off the prow closed the gaps
 *    between them from 8.3 to **6.6 against a 10.16 tower**, a ratio of 0.65 —
 *    which is exactly the 0.55-0.66 measured off the photograph, where the
 *    honest cantilever would have given a too-airy 0.82.
 * 3. **Everything is 1.2x deep** — the deck 8.4 units against 38 m (46.7), the
 *    towers 5.6 against 26 m (31). The contact sheet looks down at about 15
 *    degrees, so a plate and three slabs at true width are all seen nearly
 *    edge-on. *What it broke:* the deck now oversails the towers by 1.4 a side
 *    rather than 2.2, so the "boat wider than what holds it up" margin narrowed;
 *    it is bought back by the top fascia oversailing the layer under it by 0.6,
 *    which puts an ink line along the gunwale.
 * 4. **The trees are 1.9x** — 2.05 units of crown where 6 m scales to 1.08.
 *    *What it broke:* at 2.05 the crowns are 60% of the deck's own thickness, so
 *    a regular row turned the SkyPark into a comb — it did, in the first render.
 *    They alternate big/small and shift 0.45 across the bed, and sit 4.3 apart,
 *    so the row reads as planting rather than as machined teeth.
 * 5. **The lean is exaggerated** — the raking edge goes to 11.2 degrees where
 *    the photograph measures 6.2, and the plumb edge is given 2.6 degrees where
 *    the building's is 0, so that the whole card tips instead of merely flaring.
 *    *What it broke:* the slab's waist is now 0.69 of its top where life is 0.75,
 *    and because one prism has one `scale.z`, the depth narrows with the width —
 *    5.6 at the deck, 3.89 at the waist. The vertical leg was therefore set to
 *    4.2 deep, between the two, so the step at the junction reads as the leg
 *    being slimmer than the mass it carries, which is true, instead of reading
 *    as a mistake.
 *
 * ## Traded away, and why
 *
 * - **The podium is gone.** In life the mall and casino wrap the tower bases and
 *   bury the A-frames; that is precisely why the finished bay photograph does
 *   not show them and the construction photograph does. The gap through each
 *   tower is in the brief and the podium is not, so the base is a 1.2-unit
 *   plinth — 3% of the height — which still does Petronas's job of making three
 *   towers one object at the bottom without eating the void.
 * - **The legs are straight.** The real raking leg is a curve, and a curve costs
 *   a mesh per segment on three towers. The straight line keeps the two things
 *   the curve is for: the waist at the junction and the flare at the foot.
 * - **The sloping leg is 1.37x too fat** — 2.5 units where the photograph gives
 *   0.18 of the tower width, which is 1.83. At 1.83 it is five pixels in a
 *   monument-sheet cell with ink either side. The void still comes out 4.26 wide,
 *   and the void is the read.
 * - **No floor banding.** Fifty-five storeys over 20.4 units is a grey wash. The
 *   only horizontal on each tower is the `slate` band at the junction, which is
 *   a real event: the level-23 truss floor where the two legs lock together.
 *
 * ## Colour: pale under dark green
 *
 * Everything above the ground is one pale material and one dark one, which is
 * what the building looks like and also what survives being turned away from the
 * sun. Reading the contract's shade table: `bone` and `slate` and `steel` all go
 * hueless in shade, and this model is *made* of surfaces that will sit in shade
 * — the whole soffit of a 15-unit cantilever, and the inner cheeks of three
 * A-frame voids seen against cyan sky. Those are exactly the "reads as a hole
 * rather than a wall" case, so:
 *
 * - **`white`** (0xfff2e8, and warm — it holds at 132,111,88 turned away) for
 *   the boat: its top two layers, the bow, the stern and the concrete blades up
 *   both edges of every tower. It is the brightest thing in the model, as the
 *   SkyPark is in every photograph.
 * - **`cream`** for the three towers *and for the hull's bottom two layers*, so
 *   the belly of the boat is the same pale material as the thing holding it up
 *   and only the top of the hull lifts to white. That is what the daylight
 *   photograph shows, and it is what makes the four stacked layers read as one
 *   curved section rather than as four boxes. One step under `white`, so the
 *   deck still sits *on* the towers instead of merging with them.
 * - **`slate`** twice only, and both times as a line: the junction band across
 *   each tower, and the plinth's cornice. It is the model's only mid-dark and it
 *   is deliberately not doing what it does on Petronas, where it is the curtain
 *   wall.
 * - **`darkOlive`** for the garden bed and **`green`** for the crowns — the dark
 *   green deck, and the one place on the sheet where a roof is a garden.
 * - **`skyBlue`** for the pool, the only saturated colour, 27 units long.
 * - **`tan`** for the plinth, warm, so the ground does not go hueless either.
 *
 * ## Not Petronas
 *
 * Two Asian towers with a horizontal element is the collision risk on this
 * sheet, so: **three** masses against two, a deck **lying across the tops**
 * against a bridge stitched through the waist, a **cantilever with nothing
 * under it** against a symmetric span, **leaning** slabs against plumb ones,
 * **holes through the bases** against a solid podium, **pale on dark green**
 * against dark glass on white steel, and no spire of any kind. Squinting,
 * Petronas is a capital H and this is a low, long boat on three tilted stilts.
 */

// ---------------------------------------------------------------------------
// Scale. One metre, fixed by the deck, and everything measured against it.
// ---------------------------------------------------------------------------

/**
 * The metre, anchored on the SkyPark's 340 m rather than on the towers, because
 * the deck is the dimension this monument is made of and the one every other
 * number is checked against. 0.18 units per metre exactly.
 */
const UNIT = 61.2 / 340;

/** Underside of the SkyPark: the top of the towers. */
const DECK_BASE = 33.4;
/** Deck thickness, 2.4x life — see stretch 1. */
const DECK_DEPTH = 3.4;
const DECK_TOP = DECK_BASE + DECK_DEPTH;

/** 340 m. Half of it either side of the axis, which is what centres the model. */
const DECK_HALF = (340 * UNIT) / 2;
/** 38 m at 1.2x — see stretch 3. It also leaves the pool and the bed room. */
const DECK_HALF_WIDTH = 4.2;

/** Where the hull's parallel body ends and the bow begins. */
const BOW_BASE = 24;
/** And where the blunt stern rounds off. */
const STERN_BASE = -27.6;

/**
 * The prow face of the tower nearest the bow. Everything from here to +30.6 is
 * deck over air: **a quarter of the deck's length**, which is the whole point.
 */
const CANTILEVER = 15.3;

const PLINTH_TOP = 1.2;
const TOP = 39.7;

// ---------------------------------------------------------------------------
// The tower, in offsets from the centre of its slab where it meets the deck.
// Fractions in the comments are of `TOWER_HALF * 2`, measured off the 2009
// construction photograph.
// ---------------------------------------------------------------------------

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
 * stern-most 2.2 units inside the deck's tail, and the two gaps come out at
 * 6.61 — 0.65 of a tower, which is the photographed rhythm. See stretch 2.
 */
const TOWER_GAP = 6.61;
const TOWER_PITCH = TOWER_HALF * 2 + TOWER_GAP;
const TOWER_X = [
  CANTILEVER - TOWER_HALF - TOWER_PITCH * 2,
  CANTILEVER - TOWER_HALF - TOWER_PITCH,
  CANTILEVER - TOWER_HALF,
];

/** Trees: 16 crowns 3.4 apart, stopping where the bow narrows under them. */
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
     * A slab standing between two points, leaning and tapering with them.
     *
     * The half-widths are **horizontal**, which is the number you actually want
     * when you are matching an elevation; a tilted prism measures its own across
     * its axis, hence the cosine. `bury` extends it past both ends along the
     * axis, because a tilted prism's end caps are cut square to the axis and
     * have to finish inside something else — the hull, the truss band, the
     * plinth — or the slanted cut shows. The two ends bury by different amounts
     * because they finish inside different things, and the splayed leg's foot
     * has only the plinth's 1.2 units to hide in before it is through the floor.
     *
     * One prism has one `scale.z`, so the depth narrows in step with the width.
     * That is the taper the towers wanted anyway.
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
     * A hull end: a prism laid along X so it narrows in plan *and* in section at
     * once, which is what makes a bow a bow rather than a wedge. Rotating a
     * `taper` by a quarter turn about Z sends its axis down +X (or -X) and
     * leaves its flats on the top, the bottom and the two sides; `scale.x`
     * becomes the vertical, and it tapers in the same ratio as the plan.
     *
     * One prism has one taper, so the section shrinks in height as fast as it
     * shrinks in plan, and a bow built that way comes out as a **sharpened
     * pencil** — the first two attempts both did, and at monument-sheet size a
     * pencil is what you see. The fix is the one a boatbuilder uses: tilt the
     * axis up by exactly the height the section loses, so the deck line stays
     * level all the way to the stem and the whole taper is spent on the
     * underside rising out of the water. `rise` is that lift.
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

    // -----------------------------------------------------------------------
    // The plinth. It stops at 16.8 so that the last 13.8 units of deck — 23% of
    // its length — have nothing whatever underneath them.
    // -----------------------------------------------------------------------
    const plinthMin = -29.6;
    const plinthMax = 16.8;
    const plinthWidth = plinthMax - plinthMin;
    const plinth = box(plinthWidth, PLINTH_TOP, 10.2, ground);
    plinth.position.set((plinthMin + plinthMax) / 2, 0, 0);
    group.add(plinth);

    const cornice = box(plinthWidth + 0.5, 0.28, 10.7, truss);
    cornice.position.set((plinthMin + plinthMax) / 2, PLINTH_TOP - 0.28, 0);
    group.add(cornice);

    // -----------------------------------------------------------------------
    // The three towers.
    // -----------------------------------------------------------------------
    for (const centre of TOWER_X) {
      const tower = new THREE.Group();

      // The slab: plumb on the far edge, raking on the near one, so the card
      // tips toward the bow and is widest where the deck lands on it.
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

      // The concrete blades up both edges. Slightly proud in z, so each one
      // takes its own ink line down the face instead of vanishing into it.
      for (const side of [-1, 1] as const) {
        const waistEdge = side < 0 ? WAIST_MIN : WAIST_MAX;
        const topEdge = side * TOWER_HALF;
        tower.add(
          leaning(
            waistEdge - side * FIN_HALF,
            WAIST_Y,
            FIN_HALF,
            topEdge - side * FIN_HALF,
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

      // Level 23: the truss floor that locks the two legs together, and the one
      // horizontal line anywhere on the tower.
      const band = box(BAND_MAX - BAND_MIN, BAND_TOP - BAND_BASE, BAND_DEPTH, truss);
      band.position.set((BAND_MIN + BAND_MAX) / 2, BAND_BASE, 0);
      tower.add(band);

      tower.position.x = centre;
      group.add(tower);
    }

    // -----------------------------------------------------------------------
    // The SkyPark. Three stacked layers give the hull its section: a narrow
    // keel, a shoulder, and the wide top fascia that is the edge you see from
    // the ground. The bow and the stern continue that section to a point and to
    // a blunt tail.
    // -----------------------------------------------------------------------
    // The body runs 0.4 past both ends, so the two tilted end caps finish
    // inside it rather than showing as slanted cuts.
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

    // -----------------------------------------------------------------------
    // On top: the garden down the far edge, the pool down the near one.
    // -----------------------------------------------------------------------
    const gardenBed = box(48, 0.45, 2.6, bed);
    gardenBed.position.set(-1, DECK_TOP, TREE_Z);
    group.add(gardenBed);

    for (let i = 0; i < TREE_COUNT; i++) {
      const x = TREE_FIRST + i * TREE_PITCH;
      const trunk = column(0.24, 0.6, trunkColor, 4);
      trunk.position.set(x, DECK_TOP + 0.45, TREE_Z);
      group.add(trunk);

      // Alternating crowns, so twelve identical cones do not come out as a
      // comb. Deterministic on the index: no `Math.random` anywhere near this.
      const big = i % 2 === 0;
      const crown = taper(big ? 1.15 : 0.95, big ? 0.5 : 0.42, big ? 2.05 : 1.7, leaf, 6);
      crown.position.set(x, DECK_TOP + 0.8, TREE_Z + (big ? -0.2 : 0.25));
      group.add(crown);
    }

    // 150 m of infinity pool: a pale surround with the water standing proud of
    // it, so the ink draws the coping and the blue reads as a separate surface.
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
