import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Charles Bridge, Prague.
 *
 * **The fourth bridge among the monuments, and it has to be the one that is not made of
 * steel.** The Golden Gate is a suspension cable, Sydney is a lattice arch,
 * Tower Bridge is a pair of Gothic towers over a bascule — three 19th- and
 * 20th-century steel machines that all read as *one heroic span with something
 * holding it up*. This is a 14th-century masonry causeway, and everything below
 * is chosen so that it reads as a different class of object at a glance:
 *
 * - **Repetition instead of a span.** Nine short round arches on massive
 *   cutwatered piers, not one long thing between two towers. The rhythm is the
 *   whole read, and it is countable at thumbnail size — nine openings across
 *   107 units, each 6.7 wide with a 3.3-wide pier between.
 * - **Nothing hangs and nothing is open.** No cable, no hanger, no lattice, no
 *   strut anywhere in the file. Every void here is a hole in a wall.
 * - **It hugs the ground.** The roadway sits at y = 9.1, on piers 5.2 tall.
 *   The Golden Gate's deck is at 13.6 under a 36-unit tower, Sydney's at 12
 *   under a 33-unit crown; both soar and this one does not.
 * - **Asymmetric, with nothing tall in the middle.** One tower, at one end. See
 *   the note on the crop below.
 * - **All-warm masonry.** `tan`, `sand`, `brown`, `bark`, `darkOlive` — and not
 *   one of the other three bridges' signature colours: no `red`, no `skyBlue`,
 *   no `steel`, no `bone`. It is the only bridge here with no cool entry in it
 *   at all, which is also what the palette note asks for: the arch voids are the
 *   deepest recesses in the model, and `bark` (0x4a413c, R > G > B) keeps its
 *   hue in shade where `steel` would go flat black and open a hole in the wall.
 * - **It is populated.** Thirty statues. No other bridge among the monuments carries
 *   figures, and that alone names this one.
 *
 * ---
 *
 * **The crop.** 516 m of bridge under a 47 m tower is 11:1, and `footprint` is a
 * circle with no long axis to spend. Kept: the **west half of the arcade — nine
 * of the sixteen arches** — and the **Old Town Bridge Tower** at the east end,
 * with the roadway running 2.6 units past it onto the bank so it leaves the
 * frame rather than stopping. Cut: the eastern arches, the two Lesser Town
 * towers at the far end, and the Kampa island span. That is **267.5 m of 516, or
 * 52%**, at a horizontal scale of **0.400 u/m**.
 *
 * **The west edge is cut through a pier, not through an arch.** Nothing in `ctx`
 * clips a solid, so the half arch a photograph would show at the frame edge is
 * not buildable; a pier sliced down its middle is, and it says the same thing.
 * The arcade therefore starts on a pier whose outer face is the end of the deck,
 * and the first statue stands over it.
 *
 * **One tower, not both, and that is the deliberate part.** The bridge has a
 * tower at each end and a symmetric crop would have kept both — which is exactly
 * the Golden Gate's frame (tower, span, tower) and exactly Tower Bridge's. Two
 * verticals with something strung between them is the silhouette this monument most needs to avoid. One tower at one end and
 * an arcade running off the opposite edge is a shape nothing else here has, and
 * it is the view from Kampa that every photograph of the bridge uses.
 *
 * **The stretch: 1.75x on the vertical**, giving 0.700 u/m. That puts the tower
 * at 47 m -> 33.0 units and the roadway at 13 m -> 9.1, and the model measures
 * **107.3 wide by 33.0 tall, an aspect of 3.25** against the cap of 4. At true
 * proportion it would be 5.7x and unbuildable.
 *
 * **What the stretch broke, and the fix.** A semicircle stretched 1.75x
 * vertically is a lancet. Run the arches through the vertical scale and their
 * rise goes to 5.85 units on a 6.68-unit span — a pointed Gothic arch, which
 * would make this a different bridge in a different century. So **the arch rise
 * alone is drawn at the horizontal scale** (3.34 on a 6.68 span: a true
 * semicircle across the flats, the sixteen facets bulging 2% outside it at the
 * diagonals) while the springing line and the deck level take the full 1.75x.
 *
 * **The price is paid in the spandrel, and it is exactly the rise the head gave
 * up.** A stretched arch springing at 3.34 would crown at 9.19, which is the
 * roadway at 9.1 — in life the arch comes up to the deck and there is barely any
 * masonry over it. Unstretched it crowns at 6.68 and leaves **2.4 units of solid
 * wall** between crown and road surface. That is the right place for the error
 * to land — a heavier, more medieval bridge — and it is why the spandrel is a
 * plain unbroken band rather than something decorated.
 *
 * **Two things drawn in plan at the vertical scale**, the same device Sydney
 * uses for its pylons:
 *
 * - **The tower.** At the horizontal scale a 14 m-square tower is 5.6 units wide
 *   against 33 tall — a needle. At the vertical scale it is 10.0, its own true
 *   1:3.3, and it reads as the square Gothic keep it is.
 * - **The deck**, 7.2 units across rather than the 4.1 the horizontal scale
 *   would give, so the two rows of statues are far enough apart to read as two
 *   rows in the quarter view.
 *
 * **The statues are at true count and half true spacing.** Thirty statues over
 * 516 m is one every 34 m per side; keeping all thirty inside a half-length crop
 * puts them every 16.5 m instead. The count is what names this bridge and not
 * any other stone bridge in Europe, so the count won. The spacing was then
 * locked to **two thirds of a bay**, so every third statue stands over a pier
 * and the two rhythms — nine arches, fifteen pedestals — are in phase instead of
 * beating against each other. Five of the fifteen land on piers, starting with
 * the one over the cut pier at the west edge.
 *
 * ---
 *
 * **What carries the thumbnail**, in order:
 *
 * 1. **Nine dark round-headed openings** in a pale wall, framed by piers that
 *    project 1.2 units further in z than the wall behind them and 1.0 further
 *    than the openings, so every pier throws its own cutwater and its own ink
 *    line into the elevation. Counting the arches is the test.
 * 2. **Thirty dark masses on pale plinths** along both parapets. A thumbnail gives
 *    this model about 1.7 px per unit, so each is four pixels — a dark blob on a
 *    light one, which is all it is meant to be, and the deterministic variation
 *    in their height and yaw is what stops fifteen of them reading as a picket
 *    fence.
 * 3. **The tower**: square, `tan`, with a steep `bark` roof and four pinnacles,
 *    anchoring the east end at three times the height of anything else.
 *
 * **Round below, pointed above.** The bridge arches are semicircular and the
 * tower's gateway is a pointed Gothic gable. That contrast is true to the
 * building — a 1357 bridge under a 1380 tower — and it is also the fastest way
 * to say *this tower is not part of the arcade*.
 *
 * **Traded away.** The arch openings are not through-holes: nothing here can cut
 * one. Each is a dark solid whose z extent (+/-3.4) fully encloses the arcade
 * wall behind it (+/-3.2), so from every angle the opening is a dark tunnel-
 * shaped mass with pale masonry around it, which is Tower Bridge's dark-reveal
 * trick and reads the same way — an arch is a shadow, and this one is warm. The
 * order of those two solids is load-bearing; see `opening` below. Also
 * gone: the cobbles, the tramway of statue detail (a baroque saint at four
 * pixels is a blob whichever way it is carved), the Lesser Town towers, and the
 * bridge's slight upward camber, which at 107 units would be under half a unit.
 *
 * **Budget.** 116 meshes of 130 and 2,508 triangles of 3,600 at the `landmark`
 * tier. Meshes bind, not triangles — thirty statues are sixty of those 116
 * before anything else exists — which is why each pier is a *single* scaled
 * hexagonal prism carrying both its cutwaters rather than a box with two wedges
 * bolted on. That one decision paid for the statues.
 *
 * Filed `landmark` for the footprint and the mesh budget, not for the height, as
 * all three of its neighbours are: at 107 wide and 33 tall it fills its tier on
 * width, which is the case the contract has in mind when it says a wall passes
 * on its diameter.
 */

// ---------------------------------------------------------------------------
// The arcade. Horizontal 0.400 u/m, vertical 0.700 u/m.
// ---------------------------------------------------------------------------

/** Half the frame. 107 units = 267.5 m, about half the bridge. */
const DECK_END = 53.5;

/** Clear span, 6.68 u = 16.7 m — the bridge's own narrowest arch. */
const ARCH_SPAN = 6.68;
const ARCH_R = ARCH_SPAN / 2;
/** Pier thickness along the bridge, 3.2 u = 8.0 m. The real piers are 8-11 m. */
const PIER_HALF_X = 1.6;
const BAY = ARCH_SPAN + PIER_HALF_X * 2;

/**
 * Ten piers carrying nine arches, with pier 0's outer face flush with the west
 * end of the deck — so the arcade is cut through a pier and not through an arch.
 * Nothing here can clip a solid, so a half arch at the edge is not buildable;
 * a pier sliced by the frame is, and it is the same "runs off the edge" device
 * the other three bridges use on their decks. The pier's extra 0.05 of half-
 * length leaves it standing 0.05 proud of the wall's end face rather than
 * exactly flush with it, which is the rule the whole file keeps: no two solids
 * share a plane.
 */
const PIERS = 10;
const PIER_X0 = -DECK_END + PIER_HALF_X;
const pierX = (index: number): number => PIER_X0 + index * BAY;

/**
 * Across the bridge. The wall sits *behind* the openings and the openings behind
 * the piers, so each of the three gets its own ink line in elevation and the
 * piers saw-tooth in the quarter view.
 */
const WALL_HALF_Z = 3.2;
const VOID_HALF_Z = 3.4;
const PIER_HALF_Z = 4.4;
const PARAPET_FACE_Z = 3.6;
const CORNICE_HALF_Z = 3.85;

/**
 * Springing line, 3.34 u = 4.8 m above the water — and equal to `ARCH_R`, so
 * the arch head's polygon reaches exactly y = 0 at its bottom and the whole
 * model sits on the ground plane with nothing to trim.
 */
const SPRING_Y = 3.34;
/**
 * Facets drawing the arch head. Sixteen is a multiple of four, which is what
 * makes this work with `column`: the radius argument is the half-width **across
 * the flats**, and at 16 sides there are flats on all four axes, so passing the
 * half-span gives an opening exactly `ARCH_SPAN` wide rising exactly `ARCH_R` —
 * a true semicircle, with the facets bulging at most 2% outside it on the
 * diagonals — a thirteenth of a unit. It also leaves a flat 1.33 units wide at
 * the crown, which reads as the keystone course and never as a point.
 */
const ARCH_SIDES = 16;

const PIER_TOP = 5.2;
const WALL_TOP = 8.2;
const CORNICE_TOP = 8.7;
const ROAD_TOP = 9.1;
const PARAPET_TOP = 10.3;

// ---------------------------------------------------------------------------
// The statues: fifteen a side, two thirds of a bay apart, ending over pier 9.
// ---------------------------------------------------------------------------

const STATUES_PER_SIDE = 15;
const STATUE_SPACING = (BAY * 2) / 3;
/**
 * Anchored on the *west* pier, so the run starts over the pier the frame cuts
 * and ends at 40.3 — 0.09 clear of the tower shaft's west face, which is a
 * statue standing at the gate rather than one embedded in it.
 */
const STATUE_FIRST_X = pierX(0);
const PLINTH_HALF = 0.5;
const PLINTH_TOP = PARAPET_TOP + 0.9;
const STATUE_Z = (PARAPET_FACE_Z + WALL_HALF_Z) / 2;

// ---------------------------------------------------------------------------
// The Old Town Bridge Tower. Plan drawn at the vertical scale: 47 m tall on a
// 14 m square is 33.0 on 10.0 here, its own true 1:3.3.
// ---------------------------------------------------------------------------

const TOWER_X = 45.9;
const TOWER_HALF_X = 5.0;
const TOWER_HALF_Z = 5.2;
const TOWER_PLINTH_TOP = 2.0;
const TOWER_SHAFT_TOP = 22.0;
const GALLERY_TOP = 23.6;
const ROOF_TOP = 31.2;
const TOWER_TOP = 33.0;

/**
 * The gateway: pointed, where every arch below it is round.
 *
 * `GATE_SPRING` is not free. The head is a gable 6.24 units tall — its width is
 * the roadway's, so its rise follows — and it has to clear the lower string
 * course underneath it and the upper one above it, or a pale band cuts the arch
 * in half. Springing at 14.8 puts the apex at 21.0, which is 0.2 under the
 * corbel course at 21.2 and leaves the lower band sitting directly beneath the
 * springing as the impost the arch rises from.
 */
const GATE_HALF_Z = 3.0;
const GATE_SPRING = 14.8;
/**
 * Half-width across the flats of the gable's three-sided head, which spans
 * +/-1.732a across and 3a tall unstretched — so `GATE_HALF_Z / sqrt(3)` is the
 * value that makes the head exactly as wide as the gateway under it.
 */
const GABLE_A = GATE_HALF_Z / Math.sqrt(3);
/** Stretches the gable head to 1.2x, which is what makes it read as Gothic and not as a hip. */
const GABLE_RISE = 1.2;

const PINNACLE_X = 4.5;
const PINNACLE_Z = 4.7;
const PINNACLE_TOP = 27.2;
const PINNACLE_CAP_TOP = 29.8;

export const charlesBridge: Monument = {
  id: 'charles-bridge',
  name: 'Charles Bridge',
  iso: 'CZE',
  lat: 50.086,
  lon: 14.411,
  tier: 'landmark',
  footprint: 54,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;
    const stone = palette.tan;
    const dressing = palette.sand;
    const shadow = palette.bark;
    const figure = palette.darkOlive;
    const paving = palette.brown;

    const group = new THREE.Group();

    // -----------------------------------------------------------------------
    // The arcade wall
    // -----------------------------------------------------------------------
    // One box the whole length. Everything else in the arcade is either a hole
    // punched into it (the openings, which stand proud of it in z so they
    // enclose it) or a mass standing off it (the piers).
    const wall = box(DECK_END * 2, WALL_TOP, WALL_HALF_Z * 2, stone);
    group.add(wall);

    // -----------------------------------------------------------------------
    // Piers with cutwaters — one mesh each
    // -----------------------------------------------------------------------
    // A hexagonal prism turned a quarter so its two points face up- and
    // downstream. That gives a pier with a flat-sided body and a triangular
    // cutwater at each end out of a single `taper`, which is what leaves room in
    // the mesh budget for thirty statues. The taper is the batter: the cutwaters
    // lean in as they rise, as they must to shed ice.
    //
    // **The scale is written in the prism's own axes, before the rotation, and
    // that is the whole of the trick.** Three composes a local matrix as
    // T * R * S, so the scale lands first: an unrotated 6-gon from `taper` has
    // its flats on +/-Z (the contract puts a face on +Z) and its two points on
    // +/-X, and only afterwards does the quarter turn swap them. So the *z*
    // argument is the half-length along the bridge and the *x* argument reaches
    // the cutwater tips — the opposite of how they read. Getting that pair round
    // the wrong way is silent: the piers come out 7.6 long and 3.8 across, which
    // is narrower than the 6.4-deep wall, so they vanish inside it, the arcade
    // loses every cutwater, and the model still builds, still validates and
    // still looks like a bridge.
    for (let i = 0; i < PIERS; i++) {
      const pier = taper(1, 0.86, PIER_TOP, stone, 6);
      pier.rotation.y = Math.PI / 2;
      // `PIER_HALF_Z * cos(30 deg)` is the apothem that puts the hexagon's point
      // at PIER_HALF_Z. The extra 0.05 buries the pier's flat face 0.05 inside
      // the arch opening beside it instead of leaving the two exactly flush, for
      // the same reason the head is inset: no two solids share a plane here.
      pier.scale.set(PIER_HALF_Z * Math.cos(Math.PI / 6), 1, PIER_HALF_X + 0.05);
      pier.position.x = pierX(i);
      group.add(pier);
    }

    // -----------------------------------------------------------------------
    // The openings
    // -----------------------------------------------------------------------
    // Each is a dark rectangle up to the springing line with a dark polygon
    // above it. The polygon's bottom half sits inside the rectangle, so what
    // shows is one arch-shaped silhouette. Both are ~6.8 deep against the wall's
    // 6.4, so from any angle the opening is a dark tunnel-shaped mass with pale
    // masonry all round it rather than a plaque painted on a face.
    const opening = (centre: number) => {
      const jamb = box(ARCH_SPAN, SPRING_Y, VOID_HALF_Z * 2, shadow);
      jamb.position.x = centre;
      group.add(jamb);

      // **The jamb stands 0.03 proud of the head on each face, and that order
      // matters.** `column` makes a whole prism, so the head is a full circle
      // and only its top half is an arch; with the head in front, the outline
      // hulls that circle and inks the bottom half of it straight across the
      // opening, which turns nine arches into nine wheels. Behind the jamb the
      // lower half is occluded, the ink that survives is the semicircle above
      // the springing, and the jamb's own top edge draws the impost line the
      // arch springs from. It also keeps the two dark solids off a shared
      // plane, which is the thing that builds clean and then flickers.
      const head = column(ARCH_R, VOID_HALF_Z * 2 - 0.06, shadow, ARCH_SIDES);
      head.rotation.x = Math.PI / 2;
      head.position.set(centre, SPRING_Y, -(VOID_HALF_Z - 0.03));
      group.add(head);
    };

    for (let i = 0; i < PIERS - 1; i++) {
      opening(pierX(i) + BAY / 2);
    }

    // -----------------------------------------------------------------------
    // Deck: cornice, roadway, parapets
    // -----------------------------------------------------------------------
    // The cornice is the strongest horizontal in the model. It projects past
    // both the parapet and the wall, so one unbroken ink line runs the whole
    // 107 units and separates the arcade below from the statues above.
    const cornice = box(DECK_END * 2, CORNICE_TOP - WALL_TOP, CORNICE_HALF_Z * 2, dressing);
    cornice.position.y = WALL_TOP;
    group.add(cornice);

    // 0.05 under each parapet's inner face rather than flush with it, and
    // `PROUD` short of the deck's ends: flush, its end faces shared a plane
    // with the parapets' where the two overlap, and the two colours flickered.
    const road = box(DECK_END * 2 - PROUD * 2, ROAD_TOP - CORNICE_TOP, (PARAPET_FACE_Z - 0.45) * 2, paving);
    road.position.y = CORNICE_TOP;
    group.add(road);

    for (const side of [1, -1]) {
      const parapet = box(DECK_END * 2, PARAPET_TOP - CORNICE_TOP, 0.5, dressing);
      parapet.position.set(0, CORNICE_TOP, side * (PARAPET_FACE_Z - 0.25));
      group.add(parapet);
    }

    // -----------------------------------------------------------------------
    // Thirty statues
    // -----------------------------------------------------------------------
    for (let i = 0; i < STATUES_PER_SIDE; i++) {
      const x = STATUE_FIRST_X + i * STATUE_SPACING;
      // Golden-angle wobble: deterministic, and no two neighbours match. Without
      // it fifteen identical posts read as railings rather than as sculpture.
      const wobble = Math.sin(i * 2.39996);

      for (const side of [1, -1]) {
        const z = side * STATUE_Z;

        const plinth = box(PLINTH_HALF * 2, PLINTH_TOP - PARAPET_TOP, PLINTH_HALF * 2, dressing);
        plinth.position.set(x, PARAPET_TOP, z);
        group.add(plinth);

        // Six sides and only a shallow taper. A four-sided spike at this size
        // is a railing spindle; what is wanted is a lump with shoulders, and
        // the last 0.25 of taper is all the "figure" a four-pixel mass can hold.
        const saint = taper(0.40 + 0.04 * wobble, 0.25, 2.0 + 0.3 * wobble, figure, 6);
        saint.rotation.y = 0.5 * wobble * side;
        saint.position.set(x, PLINTH_TOP, z);
        group.add(saint);
      }
    }

    // -----------------------------------------------------------------------
    // The Old Town Bridge Tower
    // -----------------------------------------------------------------------
    const plinth = box(TOWER_HALF_X * 2 + 1.0, TOWER_PLINTH_TOP, TOWER_HALF_Z * 2 + 1.0, stone);
    plinth.position.x = TOWER_X;
    group.add(plinth);

    const shaft = box(
      TOWER_HALF_X * 2,
      TOWER_SHAFT_TOP - TOWER_PLINTH_TOP,
      TOWER_HALF_Z * 2,
      stone,
    );
    shaft.position.set(TOWER_X, TOWER_PLINTH_TOP, 0);
    group.add(shaft);

    // String courses, proud of the shaft so each casts its own line. The lower
    // one is the gateway's impost: its top stops 0.1 under the springing, so
    // the pointed head rises straight out of it and no band crosses the arch.
    // The upper one corbels under the gallery, 0.2 clear of the gable's apex.
    for (const base of [14.0, 21.2]) {
      const band = box(TOWER_HALF_X * 2 + 0.6, 0.7, TOWER_HALF_Z * 2 + 0.6, dressing);
      band.position.set(TOWER_X, base, 0);
      group.add(band);
    }

    // Tall window slots, raised rather than recessed: a shallow recess vanishes
    // under a four-step ramp, a proud dark strip gets its own outline.
    for (const side of [1, -1]) {
      for (const offset of [-2.5, 2.5]) {
        const window = box(1.3, 3.8, 0.7, shadow);
        window.position.set(TOWER_X + offset, 17.0, side * TOWER_HALF_Z);
        group.add(window);
      }
    }

    // --- the gateway, on both end faces ---
    // A dark reveal with a pointed head. The roadway runs through the tower
    // hidden inside; what shows is the Gothic hole it goes in by.
    for (const face of [1, -1]) {
      const reveal = box(0.8, GATE_SPRING - ROAD_TOP, GATE_HALF_Z * 2, shadow);
      reveal.position.set(TOWER_X + face * TOWER_HALF_X, ROAD_TOP, 0);
      group.add(reveal);

      // A three-sided `column` on its side is a gable: apex up, 1.732a across
      // and 3a tall. Stretched 1.2x on its own rise so the head comes out
      // taller than wide — pointed, against the round arches below. It is built
      // lying across z and swung a quarter turn to lie across x instead, which
      // takes a wrapper group because the two rotations do not compose in a
      // single Euler.
      const head = new THREE.Group();
      head.rotation.y = face * (Math.PI / 2);
      const gable = column(GABLE_A, 0.8, shadow, 3);
      gable.rotation.x = Math.PI / 2;
      gable.scale.z = GABLE_RISE;
      gable.position.y = GATE_SPRING + GABLE_A * GABLE_RISE;
      head.add(gable);
      head.position.x = TOWER_X + face * (TOWER_HALF_X - 0.4);
      group.add(head);
    }

    // --- gallery, roof, pinnacles ---
    const gallery = box(TOWER_HALF_X * 2 + 1.6, GALLERY_TOP - TOWER_SHAFT_TOP, TOWER_HALF_Z * 2 + 1.6, dressing);
    gallery.position.set(TOWER_X, TOWER_SHAFT_TOP, 0);
    group.add(gallery);

    const roof = taper(TOWER_HALF_X, 0.35, ROOF_TOP - GALLERY_TOP, shadow, 4);
    roof.position.set(TOWER_X, GALLERY_TOP, 0);
    group.add(roof);

    const finial = taper(0.35, 0.06, TOWER_TOP - ROOF_TOP, shadow, 4);
    finial.position.set(TOWER_X, ROOF_TOP, 0);
    group.add(finial);

    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const px = TOWER_X + sx * PINNACLE_X;
        const pz = sz * PINNACLE_Z;

        const pinnacle = column(0.5, PINNACLE_TOP - GALLERY_TOP, dressing, 8);
        pinnacle.position.set(px, GALLERY_TOP, pz);
        group.add(pinnacle);

        const cap = taper(0.58, 0.05, PINNACLE_CAP_TOP - PINNACLE_TOP, shadow, 8);
        cap.position.set(px, PINNACLE_TOP, pz);
        group.add(cap);
      }
    }

    return group;
  },
};
