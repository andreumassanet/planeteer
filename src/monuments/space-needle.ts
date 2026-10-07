import type { Monument } from './contract.ts';

/**
 * Space Needle.
 *
 * Four things carry it, and there is nothing else in the file:
 *
 * 1. **The saucer.** Wide, shallow, double-edged, standing on a sharply flared
 *    underside. It is the entire read — everything below it is a stand.
 * 2. **Three curved legs**, splayed at the ground and closing fast as they rise,
 *    so the tower is a tall narrow hourglass. Straight legs make a water tower.
 * 3. **The core**, a thin dark column running the whole way up between them.
 * 4. **The needle**, rising out of the saucer's centre. It is in the name.
 *
 * ## Tier: `tower`, and unlike the Arc de Triomphe there is no neighbour to
 * argue against, so the ladder has to be walked on its own
 *
 * `UNITS_PER_DEGREE` is 279.25, and the nearest thing in
 * `scripts/monuments.source.json` is the Golden Gate Bridge at 37.820,
 * -122.478: 9.80 degrees of latitude away, **2,736 world units**. The Arc could
 * settle its tier by measuring 4.36 units to the Eiffel Tower and the Empire
 * State by measuring 20.7 to the Statue of Liberty. Seattle is alone on this
 * planet by two orders of magnitude more than either, so the four rungs get
 * taken one at a time.
 *
 * - **`landmark` (120 tall, 55 footprint)** inverts the ordering twice in one
 *   decision. The Space Needle is 184 m. The Eiffel Tower is 330 m and is filed
 *   at 120; the Empire State is 443 m and `empire-state.ts` filed it at 70. At
 *   `landmark` a 184 m observation tower would stand exactly as tall as the
 *   Eiffel Tower and **1.7x the Empire State**, which is 2.4x its real height.
 *   The tier ladder can still express that ordering and throwing it away for a
 *   world's-fair tower is not a trade worth making. Nor is the sentence right:
 *   `landmark` is "the landmark of the planet", and the exemplars beside it are
 *   the Pyramids and Christ the Redeemer.
 * - **`tower` (70 tall, 28 footprint)** is the tier's own sentence, verbatim —
 *   "the landmark of its city. Big Ben, Pisa, the Statue of Liberty." The Space
 *   Needle is on Seattle's skyline, on its postcards, and was built to *be* the
 *   emblem of the 1962 fair. And the footprint cap that this tier uses to refuse
 *   the Arc does not bite on a tripod: the widest thing here is the saucer at
 *   11.22, **40% of the 28-unit cap**, and the aspect is 0.32 against a cap of
 *   4. A tier drawn tight enough that nothing in it can come out squat is a tier
 *   drawn for exactly this shape.
 *
 *   The metres land right too. 184 m at 70 units, beside the Statue of Liberty's
 *   93 m at 70 and Big Ben's 96 m at 70. That the Needle is twice Liberty's real
 *   height and gets the same 70 is the tier system doing what `TIERS` says it
 *   does — Christ the Redeemer is 38 m and the Eiffel Tower 330 m and both are
 *   120.
 * - **`building` (40 tall, 55 footprint)** fails on shape rather than on status.
 *   Everything here is vertical, and the tier's 55-unit footprint against a
 *   40-unit height is a licence to be wide — the opposite of what this is. At 40
 *   units, scaling the plan below by 40/69.9, the saucer is 12.8 across and its
 *   glazing band 0.9 thick, and the needle is 7 units long and 0.16 wide. On the
 *   260-pixel thumbnail that band and that needle are under two
 *   pixels each, so **the two features the shape is named by are the first two
 *   to disappear**.
 * - **`monument` (15 tall, 14 footprint)** is "you find it by walking into it",
 *   which is the wrong sentence for a 184 m observation tower whose whole
 *   purpose is being seen from across Puget Sound. At 15 units the saucer is 4.8
 *   across, the double edge is gone, and the thing is a lollipop twice the
 *   height of the 6.8-unit avatar.
 *
 * **Footprint is 11.3, not the tier's 28.** The saucer's 16-gon has an apothem
 * of 11.0 and therefore a vertex reach of 11.216; nothing else in the model gets
 * near it (the footing pads corner at 9.42). Declaring the cap would fail
 * `FOOTPRINT_FILL` anyway — 11.22 is under 55% of 28 — but the real reason is
 * that `build-monuments.ts` pushes monuments apart by their declared footprints,
 * and there is no honest reason for this one to claim ground it does not stand
 * on.
 *
 * ## The three proportions, which are the whole job
 *
 * | | life | built | |
 * |---|---|---|---|
 * | saucer centre / total height | 0.86 | **0.757** | see below |
 * | saucer diameter / total height | 138/605 = 0.228 | 22.43/69.9 = **0.321** | **1.41x** |
 * | saucer diameter / base spread | 138/120 = 1.15 | 22.43/18.8 = **1.19** | |
 * | saucer diameter / waist width | ~7 | 22.43/5.45 = **4.1** | |
 * | needle above the roof / total | ~0.11 | 12.3/69.9 = **0.176** | **1.6x** |
 * | leg height / base spread | 143/36.6 = 3.9 | 46.2/16.4 = **2.8** | |
 *
 * Three of those are deliberate distortions and they are all the same one, so it
 * is worth doing the arithmetic in one place.
 *
 * **The needle is stretched 1.6x, and the saucer pays for it by sitting lower.**
 * In life the observation deck is at 520 ft of 605 and the top house roof at
 * about 540: the mast is the last 11% of the building. Built at 11% it would be
 * 7.7 units long and taper from 0.9 to 0.14 — about 26 pixels tall and one wide
 * in a 260-pixel thumbnail, which is a scratch, not a needle, on a monument
 * called the Space Needle. Stretching it to 17.6% is 12.3 units, and since the
 * total height is fixed by the tier the twelve units have to come out of
 * something: the saucer drops from life's 0.86 to **0.757**. That is not a
 * reluctant compromise, it is the proportion the shape is actually read by — a
 * disc at three quarters with sky above it and a needle through the sky, rather
 * than a disc capping the tower. Put the saucer at 0.86 and the mast has nowhere
 * to go, and what is left is a mushroom.
 *
 * **The saucer is 1.41x wider than life, and the legs pay for it.** The
 * commonest way to get this building wrong is a saucer that is merely wider than
 * the shaft. At true scale against a 70-unit height the roof would be 16.0
 * across; at 22.43 it is unmistakable from any distance the tower is visible
 * from, which is the whole point of the tier. The bill lands on the tripod: the
 * legs stand on a 16.4-unit circle rather than the 20.5 that life's 1.15 ratio
 * against a 22.43 saucer would want, so the model is a **stubbier hourglass than
 * the real one** (2.8:1 against 3.9:1). That is the right axis to spend on,
 * because the leg *spread* is the least-named thing in the silhouette and the
 * saucer is the most-named, but the curve had to be fixed to compensate: see
 * `LEG_CURVE`.
 *
 * Where `MAX_ASPECT` is concerned this is the Empire State's case rather than
 * the Golden Gate's. At 2 x 11.216 / 69.9 the aspect is **0.32 against a cap of
 * 4**, so the ceiling is nowhere in sight and the rule's other direction is what
 * applies — distort the axis carrying the least recognition. For a tripod tower
 * that is the plan, and widening the saucer is the whole of it.
 *
 * ## Colour: the 1962 scheme, checked against the shade note
 *
 * The fair painted it in four named colours and they are still the ones anybody
 * draws it in: **Astronaut White** legs, **Orbital Olive** core, **Re-entry
 * Red** halo, **Galaxy Gold** roof. Mapped onto `PALETTE`, with the reason each
 * survives being turned away from the sun:
 *
 * - **`white` for the legs, the flared underside and the mast.** Not `bone`.
 *   `bone` is a neutral grey that measures 76,68,58 in shade, and three-quarters
 *   of these legs is thin members seen against cyan sky — the reading that made
 *   `petronas-towers.ts` move its piers to `white` in the first place. `white`
 *   is 0xfff2e8 and holds 132,111,88, so a leg turned away from the sun is still
 *   a pale leg rather than a gap.
 * - **`darkOlive` for the core.** Orbital Olive, and the palette's `olive`
 *   (0xabae2b) is a chartreuse that would shout louder than the halo. More
 *   importantly the core is the one thing in this model that is permanently in a
 *   recess: it stands *behind* three legs and is seen through the gaps between
 *   them against the sky, which is the exact configuration the note beside
 *   `palette` says turns a neutral into a hole. `darkOlive` is on that note's
 *   warm list. It also earns its separate colour: a dark shaft between pale legs
 *   is what makes the core the third thing you see instead of a fourth leg.
 * - **`red` for both saucer rims and the roof.** Re-entry Red, and the answer to
 *   "the disc is a different colour from the legs". Both edges are red so the
 *   double edge reads as one object seen twice rather than as two plates.
 * - **`bark` for the glazing band inset between them.** The band has a rim
 *   overhanging it above and below, so it is the deepest shade in the model.
 *   `steel` there measures 13,13,12 — effectively black — and a black slot
 *   between two red rims would cut the saucer in half at distance. `bark` is
 *   warm and dark: still a window band, still one object.
 * - **`gold` for the beacon bead** below the needle. Galaxy Gold, one bright
 *   note at the point the silhouette changes character, which is the trick
 *   `empire-state.ts` uses at its 86th-floor deck for the same reason.
 * - **`bark` again for the three footing pads**, so nothing new is introduced at
 *   the ground. Five colours in total.
 *
 * ## The front, and why the legs are turned
 *
 * A tripod has no front, but it has a *good* view and a bad one. With the legs
 * left at `around`'s own 0/120/240 one leg stands on the +Z axis directly in
 * front of the core and hides it, which loses the third of the four things.
 * Turned half a step they sit at 60/180/300: two legs splay symmetrically to
 * either side of the front, the third goes straight back, and the core is
 * visible between them from the fixed front camera all the way up.
 *
 * ## Traded away
 *
 * - **The lattice under the saucer, the elevator cars and their rails, the
 *   restaurant's radial mullions.** All of it is under a unit wide. The brief
 *   for this shape is three proportions, not detail, and the ink does the
 *   drawing.
 * - **The saucer is a stack of prisms, not a lathe.** `ringWall` is the only
 *   helper that makes a hole and there is no hole here; five 16-gons stacked
 *   with alternating overhangs give four horizontal ink lines, which is what a
 *   double-edged disc is made of.
 * - **The horizontal ties between the legs and the core are schematic** — two
 *   levels, six thin members. Without them the four vertical elements are four
 *   unrelated sticks for 46 units. With more of them the hourglass silhouette
 *   fills up with noise.
 *
 * ## Against the budget
 *
 * `tower` allows 70 units, a 28 footprint, 1,800 triangles and 80 meshes. Built:
 * 69.9 tall, reach 11.216 of a declared 11.3, 776 triangles, 39 meshes, aspect
 * 0.32. Neither budget was ever the constraint here and the ink was — see
 * `LEG_SEGMENTS`, where the count came down from twelve to seven on how many
 * outlines cross a leg, not on triangles. 21 of the 39 meshes are leg segments,
 * which is what buying a curve out of straight beams costs.
 */

// --- elevation, in tier units. Every level is absolute above y = 0. ---
const PAD_TOP = 1.5;
/** Where the legs start. Below it a tilted `strut`'s corner would dip out of the pad. */
const LEG_BASE = 2.0;
/** Where the legs tuck under the saucer's flare. */
const LEG_TOP = 48.2;
const CONE_TOP = 52.6;
const DECK_TOP = 53.5;
const GLASS_TOP = 55.0;
const HALO_TOP = 55.9;
const CAP_TOP = 57.6;
const MAST_TOP = 63.0;
const BEACON_TOP = 63.9;
const TIP = 69.9;

// --- plan: half-widths across the flats, as every `ctx` radius is ---
const R_BASE = 8.2;
/** Where the three legs end up, just outside the core. */
const R_WAIST = 2.35;
const R_CORE = 1.3;
const R_CONE_BOTTOM = 3.0;
const R_CONE_TOP = 8.7;
const R_DECK = 10.1;
/** Inset under both rims: the band that makes the disc double-edged. */
const R_GLASS = 9.2;
const R_HALO = 11.0;
const R_CAP = 4.2;

/**
 * Sixteen, not twelve. The saucer is the read, and a twelve-gon of apothem 11
 * carries a 3.5% ripple between flat and vertex that is visible as a faceted rim
 * at the size this is looked at. Sixteen halves it to 2.0% and costs 80
 * triangles across the five prisms, out of a thousand spare.
 */
const DISC_SIDES = 16;

const LEGS = 3;

/**
 * How many beams a leg is made of, and it is **not** set by how smooth the curve
 * comes out — that was the assumption, and it was wrong by an order of
 * magnitude. Measured against the true profile, the worst chord error is 0.016
 * units at twelve segments and 0.063 at six: six per cent of the leg's own
 * section at its very worst, which is invisible at any size this is seen from.
 *
 * What the count actually buys is ink. `OutlineEffect` draws one inverted hull
 * per mesh, so every joint is a hard black line across the leg whether the
 * beams butt or overlap, and at twelve the two front legs come out as ladders —
 * twenty-four rungs at matching heights, competing with the saucer. Seven is the
 * fewest that still puts three joints inside the flare, where all the curvature
 * is, and it costs 0.047 units of accuracy to remove five rungs a leg.
 */
const LEG_SEGMENTS = 7;

/**
 * The exponent of the leg profile, and the number the silhouette lives or dies
 * on: `r(t) = R_WAIST + (R_BASE - R_WAIST) * (1 - t)^LEG_CURVE`, with `t` from 0
 * at the pads to 1 where the legs meet the saucer.
 *
 * A power above 1 is convex in `t`, so the curve runs *inside* the straight line
 * from foot to waist: the legs leave the ground leaning hard outward, close most
 * of the distance in the bottom third, and arrive at the saucer almost plumb.
 * That is the wine-glass profile, and it is the difference between a Space
 * Needle and a pylon — a straight taper between the same two radii is a water
 * tower with a tank on it.
 *
 * It is also where the widened saucer gets paid for. The base circle had to come
 * in to 8.2 (see the proportions table above), which flattens the lean at the
 * foot; 2.4 puts it back, giving **16.9 degrees off vertical at the pads**, and
 * by half height the legs are at 3.46 — 42% of their base radius, so four fifths
 * of the flare is spent in the bottom half. At 1.0, a plain cone, the foot leans
 * 7.2 degrees and there is no hourglass at all.
 */
const LEG_CURVE = 2.4;

/**
 * Segment ends are placed at `(i / LEG_SEGMENTS) ** LEG_BUNCH`, which crowds
 * them toward the ground. Curvature here is `k(k-1)dR(1-t)^0.4`, largest at the
 * foot and nearly nothing above half height, so evenly spaced segments would
 * spend half of them drawing a straight line and still corner the flare.
 */
const LEG_BUNCH = 1.3;

/** Two levels of tie between each leg and the core. Absolute heights. */
const TIE_LEVELS = [13, 23];

const LEG_SPAN = LEG_TOP - LEG_BASE;

const legRadius = (t: number): number => R_WAIST + (R_BASE - R_WAIST) * (1 - t) ** LEG_CURVE;
const legHeight = (t: number): number => LEG_BASE + t * LEG_SPAN;
/** Thick at the pads, slim at the saucer — the taper the real box columns have. */
const legThickness = (t: number): number => 1.25 - 0.5 * t;

export const spaceNeedle: Monument = {
  id: 'space-needle',
  name: 'Space Needle',
  iso: 'USA',
  lat: 47.62,
  lon: -122.349,
  realHeight: 184,
  tier: 'tower',
  footprint: 11.3,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut, around } = ctx;
    const paint = palette.white; // Astronaut White
    const core = palette.darkOlive; // Orbital Olive
    const halo = palette.red; // Re-entry Red
    const glass = palette.bark;
    const beaconLight = palette.gold; // Galaxy Gold
    const footing = palette.bark;

    const group = new THREE.Group();
    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // --- the core: one column, ground to saucer, dark against the pale legs ---
    group.add(column(R_CORE, LEG_TOP, core, 8));

    // --- the tripod ---
    const legs = around(LEGS, () => {
      const leg = new THREE.Group();

      // The pad is radial rather than square with the world: a tripod's footings
      // face the way their leg leans, which is outward.
      const pad = box(3.0, PAD_TOP, 2.2, footing);
      pad.position.z = R_BASE;
      leg.add(pad);

      for (let i = 0; i < LEG_SEGMENTS; i++) {
        const a = (i / LEG_SEGMENTS) ** LEG_BUNCH;
        const b = ((i + 1) / LEG_SEGMENTS) ** LEG_BUNCH;
        const from = at(0, legHeight(a), legRadius(a));
        const to = at(0, legHeight(b), legRadius(b));
        const thickness = legThickness((a + b) / 2);
        // Butt the beams end to end and every joint shows: the angle changes,
        // so a wedge of sky opens on the outside of each bend, and the section
        // changes, so a step shows on the inside. Pushing both ends half a
        // section past their neighbour buries the joint inside the beams. It
        // does not remove the ink line — `OutlineEffect` hulls every mesh
        // separately — which is why `LEG_SEGMENTS` had to come down as well.
        const overlap = to.clone().sub(from).setLength(thickness * 0.5);
        leg.add(strut(from.sub(overlap), to.add(overlap), thickness, paint));
      }

      // Ties, starting inside the core so the joint never opens a gap.
      for (const y of TIE_LEVELS) {
        const t = (y - LEG_BASE) / LEG_SPAN;
        leg.add(strut(at(0, y, R_CORE * 0.6), at(0, y, legRadius(t)), 0.42, paint));
      }
      return leg;
    });
    // Half a step, so no leg stands in front of the core. See the note above.
    legs.rotation.y = Math.PI;
    group.add(legs);

    // --- the saucer, bottom to top ---
    // The flare: 5.7 units of radius gained over 4.4 of height, 52 degrees off
    // vertical. This is the piece that has to be sharp — a gentle cone reads as
    // a spire the tower happens to widen into, and the saucer stops being a
    // separate object sitting on a stalk.
    const flare = taper(R_CONE_BOTTOM, R_CONE_TOP, CONE_TOP - LEG_TOP, paint, DISC_SIDES);
    flare.position.y = LEG_TOP;
    group.add(flare);

    // Edge one: the deck ring, 1.4 proud of the flare below it.
    const deck = column(R_DECK, DECK_TOP - CONE_TOP, halo, DISC_SIDES);
    deck.position.y = CONE_TOP;
    group.add(deck);

    const windows = column(R_GLASS, GLASS_TOP - DECK_TOP, glass, DISC_SIDES);
    windows.position.y = DECK_TOP;
    group.add(windows);

    // Edge two: the halo, the widest thing in the model, 1.8 proud of the glass.
    const brim = column(R_HALO, HALO_TOP - GLASS_TOP, halo, DISC_SIDES);
    brim.position.y = GLASS_TOP;
    group.add(brim);

    const roof = taper(R_HALO, R_CAP, CAP_TOP - HALO_TOP, halo, DISC_SIDES);
    roof.position.y = HALO_TOP;
    group.add(roof);

    // --- the needle ---
    const mast = taper(1.5, 0.95, MAST_TOP - CAP_TOP, paint, 6);
    mast.position.y = CAP_TOP;
    group.add(mast);

    const beacon = column(1.35, BEACON_TOP - MAST_TOP, beaconLight, 6);
    beacon.position.y = MAST_TOP;
    group.add(beacon);

    const needle = taper(0.9, 0.14, TIP - BEACON_TOP, paint, 4);
    needle.position.y = BEACON_TOP;
    group.add(needle);

    return group;
  },
};
