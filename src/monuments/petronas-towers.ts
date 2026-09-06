import type { Monument } from './contract.ts';

/**
 * Petronas Towers.
 *
 * Four things have to survive to a thumbnail, and everything in this file is
 * one of them:
 *
 * - **Two towers, identical, standing apart.** The silhouette has a *hole* in
 *   it, and nothing else on the sheet does. Every other tall thing here — Burj
 *   Khalifa, the Empire State, Big Ben, Pisa — is one mass narrowing upwards;
 *   this one is a mass, a void as wide as the mass, and the same mass again.
 *   The two are the same model translated, not mirrored, because the real pair
 *   is the same design built twice.
 * - **The skybridge, double-decker, at mid height.** Two horizontal bars with a
 *   slot of sky between them, thrown across that void at 37% of the height,
 *   with the two-legged arch under it that carries the load back into the
 *   towers. The bridge is the read: a pair of towers is a pair of towers, but a
 *   pair of towers *stitched together at the waist* is only this building.
 * - **The eight-pointed plan.** Two squares crossed at 45 degrees give eight
 *   points; the eight notches between them are filled with circles, which is
 *   why the towers are faceted and round-ish rather than square. Modelled as
 *   exactly that: an octagonal core turned so a flat sits in each notch, plus
 *   two four-sided prisms whose corners are the eight points. It costs three
 *   meshes a storey-band and it is what puts five vertical steel piers on every
 *   face (see the arithmetic under *plan stretch* below).
 * - **The stepped setbacks and the pinnacle.** Above floor 60 the shaft
 *   telescopes in through four rings to 53% of its width, each step capped with
 *   a dark collar that oversails the tier above it, and then 11.3 units — a
 *   sixth of the model — of tapering mast. The mast is not decoration: it is
 *   what counted as architectural height in 1998 and took the record off the
 *   Sears Tower, and a Petronas with a flat top is a Petronas that never held
 *   the record.
 *
 * ## Tier: `tower`, and the argument is mostly arithmetic
 *
 * The temptation is `landmark` — this held the outright world record, and it is
 * the one building anybody anywhere can name as Malaysia. But `empire-state.ts`
 * already settled the shape of this argument and the numbers cut the same way
 * here, harder:
 *
 * - **452 m against 443 m.** Petronas and the Empire State are the same
 *   building height to within 2%. Empire State filed `tower` at 70 units. Filing
 *   Petronas at `landmark`'s 120 would say on the contact sheet, in the only
 *   language the sheet speaks, that this is 71% taller than the Empire State.
 *   It is 2% taller.
 * - **The record does not separate them either.** The Empire State was the
 *   tallest building on Earth for forty years, Petronas for six. If four decades
 *   of the record does not buy `landmark`, six years cannot.
 * - **What `landmark` is holding.** Burj Khalifa is at 120 units and is still
 *   the tallest building there is. The tiers can express "tallest ever built" and
 *   "tallest of its city" as different sizes, and spending `landmark` on the
 *   second one throws that ordering away for good.
 *
 * And the twin costs nothing to give up, because **a pair reads bigger than a
 * single at the same height.** At 70 units this model is 30.3 units wide where
 * the Empire State is 30.6 and the Burj 29 — the same footprint on the sheet —
 * but the mass is split in two with a void down the middle, so it occupies its
 * cell more emphatically than either. `tower` is not a demotion here; it is the
 * tier at which the pair still out-reads its neighbours.
 *
 * ## Where this lands against `MAX_ASPECT` — nowhere near it, and that is the point
 *
 * The pair is wider than any single tower on this sheet, so the cap is worth
 * actually computing rather than assuming. Overall width **30.29 units against
 * 70 tall is an aspect of 0.43**, against a cap of 4: nine times of headroom.
 * The binding constraint is the other one — `tower`'s deliberately tight
 * **28-unit footprint**, the cap that exists to stop squat things being filed as
 * towers. The declared footprint is **15.2**, 54% of it, and the model reaches
 * 15.14. Twin towers pass the squatness test comfortably; it is worth saying so
 * out loud, because "the pair is wider than one tower" is the first thing that
 * looks like a problem here and it turns out not to be one.
 *
 * ## Plan stretch: 1.3x, uniformly, so every plan ratio survives
 *
 * At true scale each tower is 46 m wide against 452 m tall, **9.8 : 1** — more
 * slender than anything else on the sheet, and every tall thing here has already
 * been fattened for the same reason (Big Ben 8:1 to 6.4:1, Burj 5.3:1 to 4.4:1,
 * Empire State 1.5x on the plan). **The whole plan is scaled by 1.3 against the
 * height** — towers, gap, bridge span and star geometry together — so the
 * proportions you would name the thing by are all preserved exactly: the gap
 * stays 1.27 tower-widths, the bridge stays 58.4 m of the 104.4 m between axes,
 * the star's points stay at 1.41 times the square apothem.
 *
 * The 1.3 is set by the piers. A tower face carries nine separable vertical
 * bands — steel pier, glass, pier, glass, pier, glass, pier, glass, pier, the
 * five piers being the +Z point, the two 45-degree shoulder points and the two
 * silhouette edges. At true scale that is 7.13 units of face over nine bands,
 * 0.79 units each; `empire-state.ts` puts the floor at about 4 px in a
 * contact-sheet cell and measures ~1.4 units to get there. At 1.3x the bands are
 * 1.03 units. Going further would buy another tenth of a unit and start costing
 * the slenderness, which is the other half of what this building looks like:
 * after the stretch it is still **7.6 : 1**, the most slender thing on the sheet.
 *
 * ## Traded away, and why
 *
 * - **Eight flats, not eight circles.** The notch infills are semicircles in
 *   life; here each is one chord of an octagon whose flats are turned into the
 *   notches. Eight circles at six sides each is 192 triangles and eight meshes
 *   for *one band of one tower*, and there are ten such bands: **1,920
 *   triangles and 80 meshes**, more than the whole triangle budget and every
 *   mesh of it, to move a surface 0.4 units. The octagon spends three meshes a
 *   band instead and puts the same eight bulges between the same eight points.
 * - **The skybridge is 2.2x too tall.** Two decks and their structure are about
 *   8 m of 452, so 1.3 units — under the ink around them. They are built at 2.8
 *   units: deck 0.9, slot 1.0, deck 0.9, plus a 0.3 canopy. **The slot is the
 *   thing being protected**: two bars touching is one bar, and "double-decker"
 *   is in the brief for this building the way "stepped" is for the Empire State.
 * - **The horizontal sunshades are gone.** Every floor of the real facade has
 *   one, and 88 of them at 0.6 units apart is a grey wash, not a stripe. The
 *   horizontals that survive are the four setback collars, the lobby band, the
 *   bridge band and the band where the arch legs spring — seven, each of which
 *   is a real event in the building and each of which gets an ink line.
 * - **The podium is a plain two-step block.** Suria KLCC is a curved six-storey
 *   mall and the towers stand in a park with a lake; here that is a green apron
 *   and a tan block, 4.2 units, 6% of the height — the one proportion in this
 *   file that needed **no** exaggeration at all, where the Empire State's base
 *   needed 2.7x.
 *
 * ## Not the other two towers
 *
 * Three tall towers on one sheet is the risk, so the separations are deliberate
 * and none of them is subtle: **two masses instead of one**, a **horizontal**
 * element above the base where neither of the others has anything horizontal at
 * all, a **cool slate curtain wall struck with white piers** where both of the
 * others are a quiet warm `bone`, an **eight-pointed** plan against the Burj's Y
 * and the Empire State's slab, **two** needles against one, and a **symmetric**
 * crown against the Burj's spiralling one. Squint at the card and what is left
 * is a capital H — which is a thing no other monument in this world is shaped
 * like.
 */

// ---------------------------------------------------------------------------
// Scale. The vertical and the horizontal have different metres — see the header.
// ---------------------------------------------------------------------------

/** Metres to the tip of the pinnacle, and the 70 units of the `tower` tier over it. */
const UNIT = 70 / 451.9;
/** The plan's metre: 1.3x the height's, uniformly, so plan ratios are untouched. */
const PLAN = UNIT * 1.3;

/** Half the 104.4 m between the two tower axes. */
const HALF_SPACING = 52.2 * PLAN;
/** Half the 46 m plan: the radius of the eight star points at the shaft. */
const SHAFT_POINT = 23 * PLAN;

/**
 * The octagonal core's apothem, as a fraction of the point radius.
 *
 * Two crossed squares meet at 1.0824 x the square apothem, which is 0.765 of the
 * point radius, so anything above 0.765 bulges out of the notch the way the
 * infill circles do. 0.85 leaves the core's own corners at 0.92, safely tucked
 * inside the points, and the bulge 0.085 of the point radius proud of the square
 * edges — 0.39 units at the shaft, which is an ink line's worth.
 */
const NOTCH = 0.85;

/** A square's apothem against its corner radius. The corners are the star points. */
const SQUARE = Math.SQRT1_2;

/**
 * A setback collar's apothem, as a multiple of the point radius of the tier it
 * caps. At 1.03 its own corners land at 1.115 of that — which, because each tier
 * is about 0.88 of the one below, is just inside the tier below's points. So
 * every collar oversails upward and none of them flanges outward.
 */
const COLLAR = 1.03;

// --- elevation --------------------------------------------------------------
const APRON_TOP = 0.9;
const PODIUM_TOP = 4.2;
const CORNICE_TOP = 4.55;
const LOBBY_TOP = 6.1;
/** Floor 29, where the two legs of the skybridge arch spring from the towers. */
const LEG_FOOT = 18.6;
/** Floors 41 and 42, at 170 m. */
const BRIDGE_BASE = 24.95;
const DECK = 0.9;
const SLOT = 1.0;
const CANOPY = 0.3;
const BRIDGE_TOP = BRIDGE_BASE + DECK + SLOT + DECK + CANOPY;
/** Floor 88, where the shaft stops and the mast starts. */
const ROOF = 57.2;
const MAST_BASE = 58.7;
const TOP = 70;

/**
 * The shaft and the four setbacks above floor 60, by the radius of their star
 * points. The top tier is 53% of the shaft, which is what the real telescoping
 * comes to between floors 60 and 88.
 */
const LEVELS = [
  { base: 0, top: 38.7, point: SHAFT_POINT },
  { base: 38.7, top: 45.2, point: SHAFT_POINT * 0.896 },
  { base: 45.2, top: 50.4, point: SHAFT_POINT * 0.782 },
  { base: 50.4, top: 54.3, point: SHAFT_POINT * 0.659 },
  { base: 54.3, top: ROOF, point: SHAFT_POINT * 0.531 },
];
const CROWN_POINT = SHAFT_POINT * 0.531;

/** Half the bridge box: the clear gap between the towers, plus a bite into each. */
const BRIDGE_HALF = HALF_SPACING - SHAFT_POINT + 0.75;
const BRIDGE_DEPTH = 1.4;

export const petronasTowers: Monument = {
  id: 'petronas-towers',
  name: 'Petronas Towers',
  iso: 'MYS',
  lat: 3.158,
  lon: 101.712,
  realHeight: 452,
  tier: 'tower',
  footprint: 15.2,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut } = ctx;

    // Dark vision glass between the piers. `slate` is the only true mid-grey in
    // the palette and it is deliberately not the `bone` that both of the other
    // tall towers on this sheet are made of.
    const glass = palette.slate;
    // Stainless steel: the eight points, the bands, the bridge and the mast.
    //
    // `white`, not `bone`, and this was decided by looking rather than by
    // taste. Against `slate`, `bone` is only two ramp steps away and the eight
    // piers dissolve into the glass — the tower comes back as one dark slab and
    // the whole point of modelling the star plan is thrown away. `white` is the
    // brightest thing in the palette and it is what makes the piers read as
    // separate objects, which is also what the real building does: brilliant
    // stainless fins against glass that photographs almost black.
    const skin = palette.white;
    // Setback collars, the crown, and the line on top of the podium.
    const dark = palette.steel;
    const mall = palette.tan;
    const park = palette.green;

    const group = new THREE.Group();

    /**
     * A band of the plan's octagonal core, turned by half a segment so a flat
     * sits in each of the eight notches and its corners hide inside the points.
     */
    const core = (apothem: number, base: number, height: number, color: number) => {
      const mesh = column(apothem, height, color, 8);
      mesh.rotation.y = Math.PI / 8;
      mesh.position.y = base;
      return mesh;
    };

    const buildTower = (side: number) => {
      const tower = new THREE.Group();

      // --- shaft and setbacks: one core and two crossed squares per band ---
      for (const level of LEVELS) {
        const height = level.top - level.base;
        tower.add(core(level.point * NOTCH, level.base, height, glass));
        // Turn 0 puts a flat on +Z and corners on the diagonals; turn 45 puts
        // corners on +Z and +X. Between them, eight points at every 45 degrees.
        for (const turn of [0, Math.PI / 4]) {
          const square = column(level.point * SQUARE, height, skin, 4);
          square.rotation.y = turn;
          square.position.y = level.base;
          tower.add(square);
        }
      }

      // --- the dark collar under each setback ---
      for (const level of LEVELS.slice(1)) {
        tower.add(core(level.point * COLLAR, level.base, 0.45, dark));
      }

      // --- the three horizontals on the shaft, all proud of the glass so each
      //     one earns its own outline while the piers still pass in front ---
      const shaftCore = SHAFT_POINT * NOTCH;
      tower.add(core(shaftCore + 0.16, CORNICE_TOP, LOBBY_TOP - CORNICE_TOP, skin));
      tower.add(core(shaftCore + 0.1, LEG_FOOT - 0.25, 0.6, skin));
      tower.add(core(shaftCore + 0.1, BRIDGE_BASE, BRIDGE_TOP - BRIDGE_BASE, skin));

      // --- the crown: the last narrowing, and the only sloped face on the tower ---
      const crown = taper(CROWN_POINT * COLLAR, 1.05, MAST_BASE - ROOF, dark, 8);
      crown.rotation.y = Math.PI / 8;
      crown.position.y = ROOF;
      tower.add(crown);

      // --- the pinnacle: 11.3 units, a sixth of the model. The ring at its
      //     foot and the bead partway up are both on the real mast, and a bare
      //     stick would read as a scratch without them. ---
      tower.add(core(1.25, MAST_BASE, 0.5, skin));

      const lower = taper(0.62, 0.4, 4.3, skin, 6);
      lower.position.y = MAST_BASE + 0.5;
      tower.add(lower);

      const bead = column(0.58, 0.45, dark, 6);
      bead.position.y = 63.5;
      tower.add(bead);

      const upper = taper(0.36, 0.17, 4.1, skin, 6);
      upper.position.y = 63.95;
      tower.add(upper);

      const needle = taper(0.17, 0.045, TOP - 68.05, skin, 4);
      needle.position.y = 68.05;
      tower.add(needle);

      tower.position.x = side * HALF_SPACING;
      return tower;
    };

    group.add(buildTower(-1));
    group.add(buildTower(1));

    // --- the base. KLCC park, the mall podium, and one dark line on top of it.
    //     Its job is to make the pair one object at the bottom the way the
    //     bridge does at the waist: two towers on nothing are two monuments. ---
    // The apron oversails the podium by a full unit on all four sides, which is
    // the least that leaves any green visible: at 0.2 the park was a colour
    // nobody could see, which is the same as not spending the mesh.
    group.add(box(27.6, APRON_TOP, 11.4, park));

    const podium = box(25, PODIUM_TOP - APRON_TOP, 9.4, mall);
    podium.position.y = APRON_TOP;
    group.add(podium);

    const cornice = box(25.4, CORNICE_TOP - PODIUM_TOP, 9.8, dark);
    cornice.position.y = PODIUM_TOP;
    group.add(cornice);

    // --- the skybridge ---
    for (const base of [BRIDGE_BASE, BRIDGE_BASE + DECK + SLOT]) {
      const deck = box(BRIDGE_HALF * 2, DECK, BRIDGE_DEPTH, skin);
      deck.position.y = base;
      group.add(deck);
    }

    // Two posts in the slot, and no more: the sky between the decks is the
    // thing that makes it read as two decks, so it stays open everywhere else.
    for (const x of [-3.4, 3.4]) {
      const post = box(0.5, SLOT, 1, dark);
      post.position.set(x, BRIDGE_BASE + DECK, 0);
      group.add(post);
    }

    const canopy = box(BRIDGE_HALF * 2, CANOPY, BRIDGE_DEPTH + 0.3, skin);
    canopy.position.y = BRIDGE_TOP - CANOPY;
    group.add(canopy);

    // The two-hinged arch: one leg out of each tower at floor 29, meeting under
    // the middle of the bridge. Struts rather than columns because they lean,
    // and the lean is the whole shape of it.
    for (const x of [-1, 1]) {
      group.add(
        strut(
          new THREE.Vector3(x * 6.35, LEG_FOOT, 0),
          new THREE.Vector3(0, BRIDGE_BASE, 0),
          0.55,
          skin,
        ),
      );
    }

    return group;
  },
};
