import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Empire State Building.
 *
 * Four things have to survive to a thumbnail and every part in this file serves
 * one of them:
 *
 * - **The stepped setbacks.** A five-storey base filling the whole block, then
 *   the mass stepping back four times before the shaft starts. That envelope is
 *   not styling, it is the 1916 New York zoning law drawn in limestone, and it
 *   is why a New York tower of this decade is shaped like nothing else on the
 *   planet. Nearly all of the stepping is on the long axis — half-widths run
 *   15.3 -> 12.9 -> 10.2 -> 8.1 -> 6.15 across the front and only 7.2 -> 5.1
 *   through the depth — which is what makes the tower look grown out of a slab
 *   rather than simply narrowed.
 * - **The vertical ribs.** Dark window strips with limestone piers between
 *   them, running from the base course to the crown. Big Ben's file records the
 *   lesson and it is worth repeating here because this building depends on it
 *   twice as much: **a tower reads tall because it is striped, not because it
 *   is thin.** Strip the ribs off and what is left is a stack of boxes with
 *   ledges on it.
 * - **The crown**: four tight tiers receding to the 86th-floor deck, each with
 *   its own cornice, so the shaft arrives somewhere instead of stopping.
 * - **The mooring mast and the antenna**, together a quarter of the height.
 *   Nothing else has this: a ribbed metal cone with a lantern on it, then a
 *   needle almost as long again. It is the half of the profile that cannot be
 *   confused with any other skyscraper, and it gets the same care as the shaft.
 *
 * ## Tier: `tower`, for the reason `statue-of-liberty.ts` gives, and one more
 *
 * Liberty argued `tower` over `landmark` because she is the landmark of New
 * York rather than of the planet. **That reasoning holds here and is stronger,
 * not weaker.** If the Statue of Liberty is a city landmark then an office
 * building three miles away cannot outrank her; nothing about the Empire State
 * says "planet" the way the Pyramids or Christ the Redeemer do. It is the thing
 * that means *New York*, which is the definition of the tier.
 *
 * The extra reason is arithmetic. `UNITS_PER_DEGREE` is 279, so these two sites
 * are **20.7 units apart** — Liberty declares a footprint of 24 and this one 18.
 * They are not neighbours on this planet, they are on top of each other, and
 * they will be read in one glance. At `landmark` this would be 120 units to her
 * 70 and a 55-unit footprint to her 24: the office block would eat the statue.
 * At 70 against 70 the pair reads as one skyline, which is what New York is.
 *
 * A third check, weaker but pointing the same way: Burj Khalifa is the `landmark`
 * exemplar for "tall building". Filing a 443 m tower at the same 120 units as an
 * 828 m one throws away an ordering the tiers can still express.
 *
 * ## Where this lands against `MAX_ASPECT`, and which way the rule cuts
 *
 * Not the way it cuts for a bridge. At true proportions this model is 20.5 units
 * wide against 69.6 tall, an aspect of **0.29** where the cap is 4 — the ceiling
 * is nowhere in sight. The rule's *other* direction is what applies, the
 * Stonehenge case: distort the axis carrying the least recognition and protect
 * the one carrying the most. For a skyscraper the untouchable axis is obviously
 * the height, and nobody has ever named this building by its floor plate, so
 * **the plan goes out 1.5x**: the block is 129.5 m x 61 m, which would be
 * 20.5 x 9.6 units at the height's own scale of 0.158 units per metre, and is
 * built here at 30.6 x 14.4. Aspect after the stretch is 0.50, still an eighth
 * of the cap.
 *
 * The 1.5x is not taste, it is what the ribs cost. A shaft face at true scale is
 * 8.2 units and carries about six bands of pier and window before they stop
 * being separable at thumbnail size; at 12.3 units it carries nine, which is
 * enough for the striping to read as striping rather than as texture. Big Ben
 * made the same trade in the same direction and said so — 8:1 in life, 6.4:1 in
 * the model, "because a truer tower frames smaller in every view it will ever be
 * seen in and loses the ribs first".
 *
 * **The base is stretched too, and further.** Five storeys is 20 m of 443, or
 * 4.5% of the height; a 3.1-unit band under a 70-unit tower is thinner than the
 * ink around it. The base course, podium and first cornice here occupy 8.35
 * units, **12% of the height, a 2.7x exaggeration**, which is the least that
 * still reads as a storeyed building rather than a plinth.
 *
 * ## The front is the 34th Street elevation, not Fifth Avenue
 *
 * The address is 350 Fifth Avenue and the grand lobby is on the 61 m face, so
 * strictly the entrance front is the narrow one. It faces +X here instead, and
 * the long 129.5 m elevation faces +Z, because **every setback is on this axis**:
 * seen down the short face the building is a slab that narrows slightly, and
 * seen down the long face it is the wedding cake. The fixed
 * front camera should get the silhouette that names the thing. A 34th Street
 * doorway is modelled at the centre of the front so the view has a marked front
 * and a sense of scale.
 *
 * ## Traded away, and why
 *
 * - **Window strips on the side faces of the two upper setback tiers.** They are
 *   3 units tall and heavily foreshortened in every view; the six meshes they
 *   would cost buy the mast its eight ribs instead, which are in the silhouette.
 *   The podium and the first tier keep theirs, and so does the shaft on all four
 *   faces.
 * - **Every opening is rectangular.** No spandrel relief, no Art Deco chevrons,
 *   no aluminium canopy. At the distance this is read from, the piers and the
 *   ink between them are the ornament.
 * - **The mooring mast is one ribbed cone.** The real thing is an airship
 *   gantry with a walkway and a nest of struts. Below about ten pixels it is a
 *   fluted cone with a lantern, which is what is here.
 * - **The tower is centred on the block.** In life it stands toward the Fifth
 *   Avenue end and the setback wings are lopsided. Centred costs nothing to the
 *   read and keeps the model straddling the Y axis honestly.
 */

// --- elevation, in tier units. The antenna tip stops just under the ceiling. ---
const GRANITE_TOP = 1.5;
const SHAFT_BASE = 20.0;
const SHAFT_TOP = 44.4;
const C4_BASE = 49.7;
const C4_TOP = 50.7;
const DECK_TOP = 51.3;
const DRUM_TOP = 53.6;
const MAST_RIB_TOP = 58.0;
const MAST_SHAFT_TOP = 58.4;
const LANTERN_TOP = 60.3;
const MAST_TOP = 61.2;
const ANTENNA_TOP = 69.6;

// --- plan: half-widths across the flats, X across the front, Z through the depth ---
const SHAFT_X = 6.15;
const SHAFT_Z = 5.1;

/** How far a setback cornice oversails the mass it caps. Its ink line is the step. */
const LEDGE_OUT = 0.5;

/**
 * How far a dark strip stands out of the wall it is set into.
 *
 * Big Ben's trick, and the reason it is worth copying: a recess this shallow is
 * invisible under a cel ramp, because a four-step gradient map has nothing
 * between "lit" and "lit" to spend on it. A strip standing *proud* gets its own
 * outline for free, and an outline is a hard black line at any distance.
 */
const STRIP_OUT = 0.28;

/**
 * The zoning envelope, bottom to top: the mass runs `base` to `top` at
 * half-widths `x` by `z`, then its cornice runs `top` to `ledge` half a unit
 * proud all round in the lighter stone.
 *
 * `front` and `side` are the window strips, listed as non-negative offsets and
 * mirrored — a 0 is the centre bay and is not doubled. Each entry is **one
 * mesh**: the strip is a beam driven right through the mass, so it surfaces on
 * both opposite faces and costs half what two slabs would. Nothing of it is
 * visible in between, which is also why the strips of the two directions may
 * cross inside without anyone seeing it.
 */
const SETBACKS = [
  // The five-storey base, on the whole block. No centre bay: the doorway is there.
  { base: GRANITE_TOP, top: 7.6, x: 15.3, z: 7.2, ledge: 8.35, front: [5.3, 10.6], side: [0, 3.2] },
  { base: 8.35, top: 12.1, x: 12.9, z: 6.9, ledge: 12.8, front: [0, 4.3, 8.6], side: [0, 3.2] },
  { base: 12.8, top: 15.9, x: 10.2, z: 6.2, ledge: 16.6, front: [0, 3.5, 7.0], side: [] },
  { base: 16.6, top: 19.3, x: 8.1, z: 5.6, ledge: 20.0, front: [0, 2.7, 5.4], side: [] },
];

const SETBACK_STRIP = 1.3;

/**
 * The crown, floors 81 to 85: four tiers stepping in 0.75 a side across the
 * front and 0.55 through the depth, so the plan converges from the shaft's
 * 1.21 : 1 toward square by the time it reaches the deck. Each tier caps at
 * `capTop`, and every cap is narrower than the one below it — a crown that
 * widens again anywhere has stopped receding and reads as a hat.
 */
const CROWN = [
  { base: SHAFT_TOP, top: 46.0, x: 5.55, z: 4.75, capTop: 46.4 },
  { base: 46.4, top: 47.7, x: 4.8, z: 4.2, capTop: 48.1 },
  { base: 48.1, top: 49.3, x: 4.05, z: 3.65, capTop: 49.7 },
];
const CROWN_CAP_OUT = 0.35;

/** Non-negative offsets, mirrored about the axis; a 0 stays single. */
const mirrored = (offsets: number[]): number[] =>
  offsets.flatMap((offset) => (offset === 0 ? [0] : [offset, -offset]));

export const empireState: Monument = {
  id: 'empire-state',
  name: 'Empire State Building',
  iso: 'USA',
  lat: 40.748,
  lon: -73.986,
  realHeight: 443,
  tier: 'tower',
  footprint: 18,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut, around } = ctx;
    // Indiana limestone: pale, faintly cool, and deliberately not the `sand`
    // that half the world's stone buildings will be painted in.
    const stone = palette.bone;
    // Windows, spandrels and the granite at the pavement, all one dark.
    const dark = palette.steel;
    // Warmer and a shade lighter than the walls: the sunlit top of every
    // cornice, and the aluminium of the mast.
    const trim = palette.sand;
    const gilt = palette.gold;

    const group = new THREE.Group();

    /** A rectangular course, placed by the heights it starts and stops at. */
    const slab = (base: number, top: number, x: number, z: number, color: number): void => {
      const mesh = box(x * 2, top - base, z * 2, color);
      mesh.position.y = base;
      group.add(mesh);
    };

    /** A window strip driven through the depth: one mesh, front face and back. */
    const acrossFront = (
      base: number,
      top: number,
      x: number,
      halfZ: number,
      width: number,
    ): void => {
      const strip = box(width, top - base, halfZ * 2 + STRIP_OUT * 2, dark);
      strip.position.set(x, base, 0);
      group.add(strip);
    };

    /** The same beam turned through a right angle: one mesh, both side faces. */
    const alongSide = (
      base: number,
      top: number,
      z: number,
      halfX: number,
      depth: number,
    ): void => {
      const strip = box(halfX * 2 + STRIP_OUT * 2, top - base, depth, dark);
      strip.position.set(0, base, z);
      group.add(strip);
    };

    // --- the granite course at the pavement, proud of the limestone above it ---
    slab(0, GRANITE_TOP, 15.6, 7.5, dark);

    // --- base and setbacks ---
    for (const step of SETBACKS) {
      slab(step.base, step.top, step.x, step.z, stone);
      slab(step.top, step.ledge, step.x + LEDGE_OUT, step.z + LEDGE_OUT, trim);

      for (const x of mirrored(step.front)) {
        acrossFront(step.base, step.top, x, step.z, SETBACK_STRIP);
      }
      for (const z of mirrored(step.side)) {
        alongSide(step.base, step.top, z, step.x, SETBACK_STRIP);
      }
    }

    // --- the doorway, and the one place a warm metal belongs down here ---
    // It also marks the front for the only check the validator cannot make.
    const portal = box(4.6, 4.6, 0.7, dark);
    portal.position.set(0, 0.4, 7.3);
    group.add(portal);

    const lintel = box(5.8, 0.75, 0.6, gilt);
    lintel.position.set(0, 5.0, 7.35);
    group.add(lintel);

    // --- the shaft: twenty-four units of it, and all of them striped ---
    slab(SHAFT_BASE, SHAFT_TOP, SHAFT_X, SHAFT_Z, stone);

    // Four strips a face, so the front reads corner pier / slot / pier / slot /
    // wide centre pier / slot / pier / slot / corner pier. Nine bands on a
    // 12.3-unit face is about 4 pixels each in a thumbnail, which is
    // the floor: three strips would be a fence, five would be grey.
    // They stop `PROUD` under the shaft's top: level with it, the dark strips'
    // tops and the stone's shared a plane round the crown's foot and flickered.
    const stripTop = SHAFT_TOP - PROUD;
    for (const x of mirrored([1.45, 3.95])) {
      acrossFront(SHAFT_BASE, stripTop, x, SHAFT_Z, 1.15);
    }
    for (const z of mirrored([0, 2.85])) {
      alongSide(SHAFT_BASE, stripTop, z, SHAFT_X, 1.2);
    }

    // The corner piers stand proud of both faces they meet, which puts four
    // unbroken ink lines up the full height of the shaft and stops the striping
    // from dissolving where the two ribbed faces turn the corner. They stop at
    // the crown, as the real ones do.
    for (const x of [1, -1]) {
      for (const z of [1, -1]) {
        const pier = box(1.7, SHAFT_TOP - SHAFT_BASE, 1.7, stone);
        pier.position.set(x * (SHAFT_X - 0.55), SHAFT_BASE, z * (SHAFT_Z - 0.55));
        group.add(pier);
      }
    }

    // --- the crown ---
    for (const tier of CROWN) {
      slab(tier.base, tier.top, tier.x, tier.z, stone);
      slab(tier.top, tier.capTop, tier.x + CROWN_CAP_OUT, tier.z + CROWN_CAP_OUT, trim);
    }
    slab(C4_BASE, C4_TOP, 3.3, 3.1, stone);

    // The 86th-floor deck, and the only piece of gold above the doorway. The
    // building is famous for being lit at the top; one bright band exactly where
    // the stone ends and the mast begins is the cheapest way to say so, and it
    // gives the eye a target at the point the silhouette changes character.
    slab(C4_TOP, DECK_TOP, 3.7, 3.5, gilt);

    // --- the mooring mast ---
    const drum = column(2.9, DRUM_TOP - DECK_TOP, trim, 8);
    drum.position.y = DECK_TOP;
    group.add(drum);

    const cone = taper(2.4, 1.6, MAST_SHAFT_TOP - DRUM_TOP, trim, 8);
    cone.position.y = DRUM_TOP;
    group.add(cone);

    // Eight ribs from the deck to just below the lantern. They lean with the
    // cone rather than standing plumb, which is the whole reason they are
    // `strut`s: a column here would part company with the mast halfway up and
    // read as scaffolding. `around(8)` lands one on the centre of each facet,
    // because the prism helpers put a flat on +Z and so does this.
    group.add(
      around(8, () =>
        strut(
          new THREE.Vector3(0, DECK_TOP, 3.0),
          new THREE.Vector3(0, MAST_RIB_TOP, 1.85),
          0.75,
          trim,
        ),
      ),
    );

    // One horizontal across the cone, so it is a mast and not a funnel.
    const collar = column(2.1, 0.5, stone, 8);
    collar.position.y = 55.9;
    group.add(collar);

    // The 102nd-floor lantern: glazed, so dark, and a shade wider than the cone
    // under it. A pale mast with one dark bead near the top is the read.
    const lantern = column(1.8, LANTERN_TOP - MAST_SHAFT_TOP, dark, 8);
    lantern.position.y = MAST_SHAFT_TOP;
    group.add(lantern);

    const cap = taper(1.8, 0.75, MAST_TOP - LANTERN_TOP, trim, 8);
    cap.position.y = LANTERN_TOP;
    group.add(cap);

    // --- the antenna: eight units of it, an eighth of the whole building ---
    const mast = column(0.62, 65.5 - MAST_TOP, dark, 6);
    mast.position.y = MAST_TOP;
    group.add(mast);

    // Two collars. A bare 1.2-unit stick is a scratch on the sky; two beads on
    // it are a piece of engineering, and they cost 48 triangles.
    // The upper one stops `PROUD` short of the mast's top, which it would
    // otherwise share in another colour.
    for (const [y, radius] of [
      [63.0, 1.0],
      [65.0 - PROUD, 0.85],
    ] as const) {
      const ring = column(radius, 0.5, trim, 6);
      ring.position.y = y;
      group.add(ring);
    }

    const whip = taper(0.45, 0.12, ANTENNA_TOP - 65.5, dark, 4);
    whip.position.y = 65.5;
    group.add(whip);

    return group;
  },
};
