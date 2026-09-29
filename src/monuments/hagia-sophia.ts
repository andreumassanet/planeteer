import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Hagia Sophia.
 *
 * The hard part of this one is not the building, it is the Taj Mahal. Both are
 * domed, both have four minarets, and on a contact sheet two cards of "dome plus
 * four corner spikes" is one card printed twice. So every decision here is made
 * against that: the two buildings must be nameable side by side, from the
 * silhouette, with the captions covered.
 *
 * The five things they actually disagree about, all of them true of the real
 * buildings and all of them built here in numbers:
 *
 * 1. **The dome is a saucer, not an onion.** The Taj's is 12.7 wide and rises
 *    9.6 — rise/span 0.76, and it *swells past* its drum on the way up. This one
 *    is 20.0 wide and rises 6.0 — rise/span 0.30, two and a half times shallower,
 *    and every course is narrower than the one below it. It is also the widest
 *    thing on the roof rather than a crown perched on it: 20.0 across a core
 *    block 20.8 across, so the dome *is* the nave.
 * 2. **There is no drum.** The Taj lifts its dome on 4.9 units of drum above a
 *    roof terrace. Here the dome sits on 2.8 units of cornice and window ring
 *    directly on the walls — the low-slung look is that missing drum, not the
 *    dome's own profile.
 * 3. **Two half-domes on the long axis.** The Taj has none, and this is the
 *    profile that names the building: dome at 32.3, half-domes cresting at 23.5
 *    to left and right, mass at 15.1. Three steps down, on one axis only, so the
 *    building has a long side and a short side where the Taj is square.
 * 4. **The minarets over-top the dome.** The Taj's stop at 27.3 of its 39.6, a
 *    deliberate two-thirds so nothing competes with the crown. Istanbul's are
 *    ~60 m against a 55 m crown, so here they run 35.4 to 39.4 against a dome
 *    finial at 35.2. The silhouette is inverted, which is the single fastest
 *    read at thumbnail size.
 * 5. **Warm ochre stone and lead-grey domes**, against the Taj's white marble.
 *    Different card colour before you have looked at the shape at all.
 *
 * And the mass below is heavy where the Taj's is delicate: a long rectangle with
 * eight unequal flank buttresses, a low narthex on one end and a polygonal apse
 * on the other, so no two elevations match.
 *
 * ## What has to survive at thumbnail size
 *
 * - **The cascade.** Dome, then half-dome, then roof, stepping down twice on the
 *   long axis. Lose it and this is any domed mosque.
 * - **The ring of light.** A dark band of forty windows around the dome's foot,
 *   which is the one thing everyone knows about the interior and is visible from
 *   outside as a shadowed collar. Twelve piers across a `bark` band; forty would
 *   be forty meshes and the tier has 110 for the whole building.
 * - **The buttresses.** Eight, four a side, no two the same height. They are why
 *   the building reads as heavy rather than as a pavilion.
 * - **Four minarets that do not match.** They were added over 120 years by three
 *   builders and it shows: Mehmed II's brick one (SE, shortest and thinnest, one
 *   balcony, `clay`), Bayezid II's (NE, one balcony, `bone`), and Sinan's stone
 *   pair on the west (thickest, two balconies each, `cream`). Every dimension
 *   differs — pedestal, shaft, balcony count, cap, total height.
 *
 * ## Departures, in numbers
 *
 * - **The dome is flattened to 62% of its true rise.** In life it spans 31 m and
 *   rises about 15 m (0.48); here 20.0 and 6.0 (0.30). At the true rise it reads
 *   as a hemisphere on a box — a Pantheon, not a Hagia Sophia. The building is
 *   *perceived* as shallow-domed because the dome is enormous relative to what
 *   holds it up, and flattening is how you buy that perception back at 200 px.
 * - **The dome is 11% fatter than life** against its own crown height (0.62
 *   here, 0.56 in life), for the same reason the Taj's is fat: the thing being
 *   named must not come out a knob.
 * - **The plan is squeezed 15% across the short axis.** 82 x 73 m in life, a
 *   ratio of 1.12; here 53.6 x 41.6, a ratio of 1.29. The long axis carries the
 *   cascade and had to survive intact, so the short one paid.
 * - **The half-domes are whole domes with their inner halves buried.** Nothing
 *   in the contract subtracts. Each is a full revolution of radius 10.4 centred
 *   on the core block's own face at x = +/-10.4, so its landward half is exactly
 *   inscribed in the core block (half-widths 10.4 by 10.8) and never surfaces.
 *   The crown lands on the block's top edge, which is where a half-dome meets
 *   the great arch anyway. The apse conch is the same idea one step cheaper: a
 *   cone on the apse drum, its landward half inside the lower mass.
 * - **No exedrae.** The real half-domes are each carried on two smaller
 *   semi-domes, a fourth step in the cascade. Eight more dome stacks is 250
 *   triangles and 8 meshes, and at thumbnail size they close up into the
 *   shoulder blocks that stand in for them here.
 * - **The tympanum windows stand proud of the wall** rather than sinking into
 *   it, the same departure the Taj's recesses make and for the same reason: a
 *   dark panel half a unit off the wall reads as an opening the moment the
 *   outline inks it, at a third of the meshes.
 *
 * ## Colour
 *
 * Eight entries. `clay` for all the ochre-red stone — walls, buttresses, the
 * minaret pedestals and Mehmed's brick minaret — `brown` at grade, `bone` for
 * cornices and balconies, `cream` for Sinan's two marble minarets, `slate` for
 * the great lead shells, `steel` for the darker lead of the aisle roofs and the
 * minaret caps, `bark` for every opening, `gold` for the finials. The one rule
 * held throughout: the shells are cool and everything under them is warm, so the
 * cascade separates from the mass at any size.
 *
 * ## Three things the render changed
 *
 * Everything above is what the drawing wanted. These three are what looking at
 * it actually forced, and each was wrong in a way no measurement catches:
 *
 * - **The buttresses were a fence.** Eight piers 3.6 wide projecting 3.3 from the
 *   wall, in `tan` so they would read as a later addition, came out as a
 *   colonnade of posts standing in front of the building — and with four minaret
 *   pedestals in the same stone, twelve free-standing verticals across one
 *   elevation. Now they are 5.2 wide, project 2.2, and are the wall's own `clay`.
 *   They stopped being sticks and became mass the moment the contrast went: the
 *   outline was already drawing them, and the colour was drawing them twice.
 * - **A darker lead on the half-domes read as a hole.** `steel` beside `clay` at
 *   this size is not a second grey, it is a void, and the cascade turned into a
 *   dome with two bites out of it. All three shells share `slate`; what separates
 *   them is the `bone` cornice at each half-dome's springing, which exists for
 *   nothing else.
 * - **The flank was a blank red field.** The buttresses cover the bays the first
 *   pair of windows sat in, so there is now a second pair inboard of them, under
 *   the tympanum.
 *
 * Filed `building`: 55 m, a cathedral, and the tier where the Taj (73 m) and
 * Saint Basil's (65 m) already sit. Not over `MAX_ASPECT` — 59.7 wide by 39.4
 * tall is 1.52 — so nothing is cropped.
 */

// --- grade. Low: the real building has no plinth, only a stylobate course ---
const TERRACE = { halfX: 21.0, halfZ: 18.6, height: 0.6 };
const STEP = { halfX: 20.2, halfZ: 17.8, height: 0.6 };
const GRADE = TERRACE.height + STEP.height;

// --- the lower mass: aisles and galleries, one long block on the x axis ---
const LOWER = { halfX: 19.5, halfZ: 17.0, top: 14.2 };
const CORNICE = { halfX: 20.3, halfZ: 17.8, height: 0.9 };
const CORNICE_TOP = LOWER.top + CORNICE.height;
const AISLE_ROOF = { height: 1.1, inner: 10.8, outer: 17.0 };

/**
 * The nave. It runs from grade to the dome's cornice as one block; everything
 * below `CORNICE_TOP` is inside the lower mass and never seen. That is what lets
 * the half-domes be whole domes: their inner halves live in here.
 */
const CORE = { halfX: 10.4, halfZ: 10.8, top: 23.5 };

/** The stepped shoulders under each half-dome, standing in for the exedrae. */
const SHOULDER = { inner: 10.4, outer: 20.9, lowZ: 11.6, highZ: 10.6, mid: 16.2 };

/**
 * The half-domes. Springing at 17.0, crowning at 23.5 — exactly the core's top,
 * so each one dies against the block instead of poking through it. Radius 10.4
 * is the core's own half-width; centred on its face, the landward half is
 * inscribed in the block.
 */
const HALF_SPRING = 17.0;
const HALF_R = 10.4;
const HALF = [
  { y: 0, r: 10.4 },
  { y: 2.0, r: 9.89 },
  { y: 3.9, r: 8.32 },
  { y: 5.4, r: 5.79 },
  { y: 6.5, r: 0 },
];

// --- the dome's foot: cornice, then the ring of windows, then the shell ---
const DOME_RING = { radius: 10.6, height: 0.8 };
const WINDOWS = { radius: 9.8, height: 2.0, piers: 12, pierRadius: 9.6 };
const DOME_SPRING = CORE.top + DOME_RING.height + WINDOWS.height;

/**
 * The shell. Every course narrower than the last — the opposite of the Taj's
 * onion, which swells past its drum before it closes. Rise 6.0 on a span of
 * 20.0: an ellipse flattened to 62% of the real dome's rise.
 */
const DOME = [
  { y: 0, r: 10.0 },
  { y: 1.9, r: 9.49 },
  { y: 3.6, r: 8.0 },
  { y: 4.9, r: 5.77 },
  { y: 6.0, r: 0 },
];
const DOME_TOP = DOME_SPRING + DOME[DOME.length - 1]!.y;

// --- the ends. Narthex to the west, apse to the east: the plan is not mirrored ---
const NARTHEX = { centerX: -22.25, halfX: 2.75, halfZ: 12.0, top: 11.0, roof: 1.4 };
const WEST_PIER = { x: -24.0, z: 7.5, half: 1.8, reach: 3.0, height: 13.5 };
const APSE = { x: 21.8, radius: 4.6, top: 13.0, conch: 3.2 };
const SIDE_APSE = { x: 20.6, z: 8.8, radius: 2.4, top: 12.2, conch: 2.0 };

/**
 * The flank buttresses, four a side, and the two flanks do not agree. Written
 * out as tops rather than heights because what matters is the stagger against
 * the cornice at 15.1 and the core's top at 23.5.
 */
const BUTTRESS = { half: 2.6, depth: 3.4, center: 15.8 };
const SOUTH_BUTTRESSES: Array<[number, number]> = [
  [-16.0, 16.4],
  [-8.6, 20.6],
  [8.6, 19.6],
  [16.0, 17.2],
];
const NORTH_BUTTRESSES: Array<[number, number]> = [
  [-16.0, 17.0],
  [-8.6, 19.8],
  [8.6, 20.4],
  [16.0, 16.2],
];

/** The great arched window of a tympanum wall, drawn on the core's flank. */
const TYMPANUM = { width: 11.0, sill: 16.0, height: 4.8, head: 2.6, headTop: 1.2, depth: 0.5 };

export const hagiaSophia: Monument = {
  id: 'hagia-sophia',
  name: 'Hagia Sophia',
  iso: 'TUR',
  lat: 41.009,
  lon: 28.98,
  realHeight: 55,
  tier: 'building',
  footprint: 30,

  build(ctx) {
    const { THREE, palette, box, column, taper, around } = ctx;
    const stone = palette.clay; // the ochre-red walls
    const added = palette.clay; // the buttresses: the wall's own stone
    const grade = palette.brown;
    const trim = palette.bone;
    const marble = palette.cream; // Sinan's two minarets
    const lead = palette.slate; // the great lead shells: dome and half-domes
    const roofing = palette.steel; // aisle roofs and minaret caps
    const shadow = palette.bark;
    const gilt = palette.gold;

    const group = new THREE.Group();

    // --- grade ---
    group.add(box(TERRACE.halfX * 2, TERRACE.height, TERRACE.halfZ * 2, grade));
    const step = box(STEP.halfX * 2, STEP.height, STEP.halfZ * 2, trim);
    step.position.y = TERRACE.height;
    group.add(step);

    // --- the lower mass and its cornice ---
    const lower = box(LOWER.halfX * 2, LOWER.top - GRADE, LOWER.halfZ * 2, stone);
    lower.position.y = GRADE;
    group.add(lower);

    const eaves = box(CORNICE.halfX * 2, CORNICE.height, CORNICE.halfZ * 2, trim);
    eaves.position.y = LOWER.top;
    group.add(eaves);

    // --- the nave block. Below the cornice it is inside the mass above ---
    const core = box(CORE.halfX * 2, CORE.top - GRADE, CORE.halfZ * 2, stone);
    core.position.y = GRADE;
    group.add(core);

    // --- lead over the aisles, one strip each flank between core and eaves ---
    for (const side of [1, -1]) {
      // `PROUD` lower than the shoulders' first step and the lowest buttress,
      // whose tops it shared as one plane of two colours.
      const depth = AISLE_ROOF.outer - AISLE_ROOF.inner;
      const strip = box(LOWER.halfX * 2, AISLE_ROOF.height - PROUD, depth, roofing);
      strip.position.set(0, CORNICE_TOP, side * (AISLE_ROOF.inner + depth / 2));
      group.add(strip);
    }

    // --- the shoulders that carry the half-domes, stepped so the ink catches ---
    for (const side of [1, -1]) {
      const width = SHOULDER.outer - SHOULDER.inner;
      const x = side * (SHOULDER.inner + width / 2);

      const lowStep = box(width, SHOULDER.mid - CORNICE_TOP, SHOULDER.lowZ * 2, stone);
      lowStep.position.set(x, CORNICE_TOP, 0);
      group.add(lowStep);

      const highStep = box(width, HALF_SPRING - SHOULDER.mid, SHOULDER.highZ * 2, stone);
      highStep.position.set(x, SHOULDER.mid, 0);
      group.add(highStep);
    }

    // --- the two half-domes ---
    for (const side of [1, -1]) {
      const cx = side * CORE.halfX;

      // A cornice at the springing. Without it the half-dome runs straight into
      // the shoulder below and the whole roof silhouettes as one lump instead of
      // as the second step of the cascade.
      const springing = column(HALF_R + 0.3, 0.6, trim, 12);
      springing.position.set(cx, HALF_SPRING - 0.6, 0);
      group.add(springing);

      for (let i = 0; i + 1 < HALF.length; i++) {
        const a = HALF[i]!;
        const b = HALF[i + 1]!;
        const course = taper(a.r, b.r, b.y - a.y, lead, 12);
        course.position.set(cx, HALF_SPRING + a.y, 0);
        group.add(course);
      }
    }

    // --- narthex: the low western end, and the pair of piers that brace it ---
    const narthex = box(NARTHEX.halfX * 2, NARTHEX.top - GRADE, NARTHEX.halfZ * 2, stone);
    narthex.position.set(NARTHEX.centerX, GRADE, 0);
    group.add(narthex);

    const narthexRoof = taper(NARTHEX.halfX, NARTHEX.halfX * 0.72, NARTHEX.roof, roofing);
    narthexRoof.scale.z = NARTHEX.halfZ / NARTHEX.halfX;
    narthexRoof.position.set(NARTHEX.centerX, NARTHEX.top, 0);
    group.add(narthexRoof);

    for (const side of [1, -1]) {
      // Projecting along x, so the taper is stretched on x rather than z.
      const pier = taper(WEST_PIER.half, WEST_PIER.half * 0.76, WEST_PIER.height, added);
      pier.scale.x = WEST_PIER.reach / WEST_PIER.half;
      pier.position.set(WEST_PIER.x, GRADE, side * WEST_PIER.z);
      group.add(pier);
    }

    // --- apse: the eastern end is round where the western end is square ---
    const apse = column(APSE.radius, APSE.top - GRADE, stone, 10);
    apse.position.set(APSE.x, GRADE, 0);
    group.add(apse);

    const conch = taper(APSE.radius, 0, APSE.conch, lead, 10);
    conch.position.set(APSE.x, APSE.top, 0);
    group.add(conch);

    for (const side of [1, -1]) {
      const small = column(SIDE_APSE.radius, SIDE_APSE.top - GRADE, stone, 8);
      small.position.set(SIDE_APSE.x, GRADE, side * SIDE_APSE.z);
      group.add(small);

      const cap = taper(SIDE_APSE.radius, 0, SIDE_APSE.conch, lead, 8);
      cap.position.set(SIDE_APSE.x, SIDE_APSE.top, side * SIDE_APSE.z);
      group.add(cap);
    }

    // --- the flank buttresses ---
    for (const [flank, piers] of [
      [1, SOUTH_BUTTRESSES],
      [-1, NORTH_BUTTRESSES],
    ] as Array<[number, Array<[number, number]>]>) {
      for (const [x, top] of piers) {
        const pier = taper(BUTTRESS.half, BUTTRESS.half * 0.8, top - GRADE, added);
        pier.scale.z = BUTTRESS.depth / BUTTRESS.half;
        pier.position.set(x, GRADE, flank * BUTTRESS.center);
        group.add(pier);
      }
    }

    // --- the tympanum wall on each flank: one great arched window and its bars ---
    const tympana = around(2, () => {
      const face = new THREE.Group();
      const z = CORE.halfZ + TYMPANUM.depth / 2;

      const light = box(TYMPANUM.width, TYMPANUM.height, TYMPANUM.depth, shadow);
      light.position.set(0, TYMPANUM.sill, z);
      face.add(light);

      // A square taper flattened in z, the same way the Taj draws its iwan head:
      // left round it becomes a pyramid buried in the wall.
      const head = taper(TYMPANUM.width / 2, TYMPANUM.headTop, TYMPANUM.head, shadow);
      head.scale.z = TYMPANUM.depth / TYMPANUM.width;
      head.position.set(0, TYMPANUM.sill + TYMPANUM.height, z);
      face.add(head);

      // The bars reach `PROUD` below the sill and `PROUD` deeper into the wall
      // than the window: level with it, their floors and backs shared its planes.
      for (const side of [1, -1]) {
        const mullion = box(0.55, TYMPANUM.height + 0.6 + PROUD, 0.7 + PROUD, trim);
        mullion.position.set(side * 4.3, TYMPANUM.sill - PROUD, CORE.halfZ + 0.35 - PROUD / 2);
        face.add(mullion);
      }

      return face;
    });
    group.add(tympana);

    // --- gallery windows, in the bays the buttresses leave open ---
    const gallery = around(2, () => {
      const face = new THREE.Group();
      for (const side of [1, -1]) {
        const outer = box(2.0, 5.2, 0.5, shadow);
        outer.position.set(side * 12.3, 6.6, LOWER.halfZ + 0.25);
        face.add(outer);

        const inner = box(2.4, 6.4, 0.5, shadow);
        inner.position.set(side * 2.8, 6.2, LOWER.halfZ + 0.25);
        face.add(inner);
      }
      return face;
    });
    group.add(gallery);

    // --- the dome's foot: cornice, window ring, piers ---
    const ring = column(DOME_RING.radius, DOME_RING.height, trim, 20);
    ring.position.y = CORE.top;
    group.add(ring);

    const band = column(WINDOWS.radius, WINDOWS.height, shadow, 20);
    band.position.y = CORE.top + DOME_RING.height;
    group.add(band);

    const piers = around(WINDOWS.piers, () => {
      const pier = box(1.15, WINDOWS.height, 0.9, trim);
      pier.position.set(0, CORE.top + DOME_RING.height, WINDOWS.pierRadius);
      return pier;
    });
    group.add(piers);

    // --- the shell. It oversails the piers, the cornice oversails it ---
    for (let i = 0; i + 1 < DOME.length; i++) {
      const a = DOME[i]!;
      const b = DOME[i + 1]!;
      const course = taper(a.r, b.r, b.y - a.y, lead, 20);
      course.position.y = DOME_SPRING + a.y;
      group.add(course);
    }

    // --- the finial. Short on purpose: a long one would close the 4.2 units
    //     of daylight that put the minarets above the dome ---
    const lotus = taper(1.4, 0.75, 0.9, gilt, 8);
    lotus.position.y = DOME_TOP;
    group.add(lotus);

    const spire = column(0.26, 1.2, gilt, 6);
    spire.position.y = DOME_TOP + 0.9;
    group.add(spire);

    const alem = taper(0.4, 0, 0.8, gilt, 6);
    alem.position.y = DOME_TOP + 2.1;
    group.add(alem);

    /**
     * The four minarets, written out one at a time because they do not match.
     * Each row is [bottom half-width, top half-width, height, colour, sides];
     * the heights sum to the tip, and the four sums are 39.4, 39.0, 37.2 and
     * 35.4. Six sides on the shafts rather than eight for the same reason the
     * Taj gives: at a metre and a half across, the extra facets cost triangles
     * the tier needs elsewhere and the ink already draws the taper.
     */
    type Course = [number, number, number, number, number];
    const sinan = (petek: number): Course[] => [
      [2.45, 2.45, 15.5, stone, 8], // pedestal, engaged in the building's corner
      [1.9, 1.74, 8.5, marble, 6],
      [2.6, 2.6, 0.7, trim, 8], // first balcony
      [1.68, 1.54, 5.3, marble, 6],
      [2.24, 2.24, 0.6, trim, 8], // second balcony
      [1.48, 1.34, petek, marble, 6],
      [1.62, 0, 4.3, roofing, 8], // the lead cap
      [0.24, 0, 0.5, gilt, 4],
    ];

    const minarets: Array<{ x: number; z: number; stack: Course[] }> = [
      // Sinan's pair, west end: thickest, two balconies, white marble, tallest.
      { x: -20.2, z: 18.2, stack: sinan(4.0) },
      { x: -20.2, z: -18.2, stack: sinan(3.6) },
      // Bayezid II's, north-east: one balcony, thinner, plain stone.
      {
        x: 20.2,
        z: -18.2,
        stack: [
          [2.17, 2.17, 13.5, stone, 8],
          [1.55, 1.4, 11.4, trim, 6],
          [2.12, 2.12, 0.7, marble, 8],
          [1.34, 1.16, 7.4, trim, 6],
          [1.42, 0, 3.8, roofing, 8],
          [0.2, 0, 0.4, gilt, 4],
        ],
      },
      // Mehmed II's, south-east: the oldest, of brick, shortest and thinnest.
      {
        x: 20.2,
        z: 18.2,
        stack: [
          [2.03, 2.03, 12.5, stone, 8],
          [1.45, 1.31, 10.8, stone, 6],
          [1.98, 1.98, 0.7, trim, 8],
          [1.24, 1.08, 7.6, stone, 6],
          [1.32, 0, 3.4, roofing, 8],
          [0.19, 0, 0.4, gilt, 4],
        ],
      },
    ];

    for (const { x, z, stack } of minarets) {
      let y = 0;
      for (const [bottom, top, height, color, sides] of stack) {
        const piece = taper(bottom, top, height, color, sides);
        piece.position.set(x, y, z);
        group.add(piece);
        y += height;
      }
    }

    return group;
  },
};
