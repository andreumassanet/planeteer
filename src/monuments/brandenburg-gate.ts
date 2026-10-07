import type { Mesh, Monument, Object3D } from './contract.ts';

/**
 * Brandenburg Gate.
 *
 * ## The one thing this file exists to not be: the Arc de Triomphe
 *
 * Both are city gates, both are `building`, both stand 39.7 units tall out of
 * the tier's 40. If they read alike there are two copies of the same
 * monument, so the difference is worth stating as a table before any geometry:
 *
 * | | Arc de Triomphe | Brandenburg Gate |
 * |---|---|---|
 * | system | **arcuated** — one semicircular vault cut in a block | **trabeated** — straight lintels carried on posts |
 * | openings | one, 16.5 wide | **five**, 8.6 in the middle and 5.8 either side |
 * | order | astylar: no column anywhere on it | **twelve Doric columns**, and nothing else holds it up |
 * | plan | 36.0 x 17.6, ratio 0.90 — nearly square | 85.6 x 20.0, ratio **4.3** — a band |
 * | front elevation | 46% of the block's width is the one opening | **60% of the colonnade's width is opening**, and the sky is behind all five |
 * | crown | a roof terrace, a rim round a flat | a **quadriga**, a figure group a fifth of the height |
 * | footprint | 21 | **44** |
 *
 * The silhouettes cannot be confused: one is a square with a hole punched in
 * it, the other is a comb of six verticals under a horizontal band with a lump
 * of statuary on top, four times as wide as it is tall. Every recognisable
 * quality of the Arc — the round head, the massive pier, the blank astylar wall,
 * the near-square block — is a quality this building does not have, and the
 * reverse holds too. Roman and massive against Greek and open, exactly as the
 * brief puts it.
 *
 * ## Aspect, worked out before planning rather than after
 *
 * `measure` reports `radius` as the greatest horizontal distance any vertex
 * reaches from the Y axis, which for a rectangular building is the
 * half-diagonal; `validate` tests `2 * radius <= MAX_ASPECT * height`, so what
 * must hold is **halfDiagonal / height <= 2**.
 *
 * At 39.7 units for the real 26 m the scale is **k = 1.527 units/m**. Life is
 * 65.5 m wide and 11 m deep, so at true proportions this is 100.0 by 16.8 units:
 *
 *     hypot(100.0, 16.8) / 2 / 39.7 = 50.7 / 39.7 = **1.28**
 *
 * Under 2, and the 50.7-unit footprint is under the `building` tier's 55.
 * (Built, it comes out at 43.95 / 39.70 = **1.11**.) **So
 * the cap forced nothing here** — unlike the Parthenon at 2.13 or the Golden
 * Gate. That is worth saying plainly, because it means the one distortion in the
 * plan below is a decision about the read and not a rule being obeyed, and it
 * has to be justified on its own.
 *
 * ## The two distortions, and what each of them broke
 *
 * **1. The wings are shortened to 0.60x.** Life's 65.5 m is the whole Pariser
 * Platz frontage: a colonnade of about 31.4 m with a wing house of about 17 m
 * bolted to each end. True to scale that is a 47.9-unit colonnade inside a
 * 100.0-unit ensemble — the thing that names the building is **48% of its own
 * width**, and the six columns that have to be countable are each 2.7 units in a
 * frame 120 units across. So each wing comes down from 26.1 units to **15.5**,
 * the ensemble from 100.0 to 84.4, and the colonnade rises to **63% of the
 * width**. Footprint falls from 50.7 (92% of the tier cap, sprawling across
 * Berlin) to 44.
 *
 * What that broke: the ensemble is squarer in plan than the real frontage, and
 * anyone who has stood on Pariser Platz knows the wings run further out than
 * this. It is the axis carrying the least recognition — nobody names this
 * building by the length of its wings — and it is the one distorted.
 *
 * **2. The columns are thickened 1.35x.** Life gives 15 m shafts of 1.75 m
 * diameter: **8.6 diameters**, which is not a Doric proportion, it is an Ionic
 * one, and Schinkel's generation got away with it because the gate is 65 m wide
 * and you never read one shaft alone. At 2.67 units across in a thumbnail they
 * are sticks. So the shaft goes to **3.6 units**, putting the whole column at
 * 6.1 diameters and the shaft alone at 5.6 — squarely Doric, and the same fix
 * `parthenon.ts` had to make for the same reason.
 *
 * What that broke, and it is measurable: the **openings are kept at true scale**
 * (5.65 m and 3.80 m become 8.6 and 5.8) because those five widths are the
 * proportion the building is named by, so the extra column stone has to come out
 * of the total width instead. The colonnade grows from 47.9 to 53.4 units, +11%,
 * and the void fraction of the front drops from 66% to **60%**. Still two thirds
 * open, still nothing like the Arc, and the trade buys columns you can count.
 *
 * ## The five openings, and why the middle one is taller as well as wider
 *
 * The proportion that names the gate is 5.65 m against 3.80 m — **1.49x wider**
 * in the middle. That is kept exactly. The height difference is the part that is
 * easy to miss and easy to lose: the four flanking passages have their soffits
 * well below the central one, so from the front there is a band of recessed wall
 * over each side opening and much less over the middle. Built:
 *
 * - central opening **8.6 wide x 19.0 tall**
 * - flanking openings **5.8 wide x 14.1 tall** — 1.49x and 1.35x smaller
 *
 * Those heads are the four `HEAD_SIDE` blocks and the one `HEAD_MID` block, and
 * they sit in the wall plane at z = 5.8, a full unit behind the column faces at
 * 8.4. That recess is why they are `brown` and not `cream`: it is precisely the
 * case the note on `ctx.palette` warns about — a neutral in shade behind a
 * colonnade with sky showing through the gaps beside it reads as a *hole*, and
 * five real holes are already in the elevation. The wall over an opening has to
 * read as wall, one step darker than the stone and no more.
 *
 * ## The quadriga
 *
 * 7.9 units of the 39.6, **20%** — the fifth the brief asks for, and the same
 * fifth life gives it. Four horses abreast facing +Z (the real one faces east
 * into the city, which is the side everyone photographs, so head-on is the front
 * view), a two-wheeled chariot behind them, and Victoria with her standard.
 *
 * It is a mass, not an animal study: six meshes a horse — barrel, neck, head,
 * fore group, hind group, tail — is enough for the ink to draw **four leg-groups
 * under one body mass**, which is all that survives at thumbnail size, and 24 of
 * the 100 meshes is the largest single line in the budget after the colonnade
 * itself.
 *
 * The proportions were got wrong once and the fix is the interesting part. Built
 * at anything like a real horse's proportions the four of them read as **four
 * standing men**, because head-on a horse is a vertical stack of same-width
 * blocks and four of those in a row is a row of figures. What fixed it was
 * pulling the whole animal down and pushing the barrel out to 2.55 against a
 * 2.7 spacing: the bodies close up into one horizontal mass with 0.15 between
 * them, while the leg groups stay 1.15 wide with 1.55 of sky between, so the
 * silhouette becomes one body on four sets of legs. Victoria then had to be
 * lifted clear — horse heads top out at 37.7 and her head starts at 38.4 — or
 * she is a fifth horse. The outer pair are yawed 0.12 rad outwards and the
 * inner pair 0.04, so the group fans.
 *
 * The wreath on the standard is a `ringWall` — the one helper that makes a real
 * hole — tipped a quarter turn to stand vertical, so there is sky through it at
 * the highest point of the model. It and the staff are the only `gold` in the
 * file: two small meshes, and they mark the apex.
 *
 * ## Where the 100 meshes went (cap 110)
 *
 * base 4, transverse walls 6, shafts 12, capitals 12, passage heads 5,
 * entablature and attic 6, wings 20, quadriga 35. About 1,830 triangles of 2,600.
 *
 * Traded away: **the Doric triglyphs**, for the reason `parthenon.ts` gives —
 * the front alone would want fifteen blocks, and the brief asks for a *plain*
 * entablature anyway; the **coffered passage soffits**, invisible from any
 * camera that can see the whole gate; and **entasis**, which is a 0.03-unit
 * bulge here, a fifth of the width of the line inked over it.
 *
 * ## Colour
 *
 * Six entries, every one of them warm, because the whole model is recesses.
 * `cream` for the sunlit sandstone (shafts, capitals, attic, wing walls and
 * their columns); `sand` for the entablature band, both cornices and the attic
 * cap, so the horizontal that caps the colonnade steps away from the columns in
 * hue as well as in plane; `tan` for the steps and the wing plinths, a shade
 * that sits the building down; `brown` for the bronze quadriga and for the wall
 * over each opening; `gold` for the standard and its wreath; `darkOlive` for
 * the side walls of the passages.
 *
 * **The last two are one decision made twice, and the two halves disagree.** A
 * passage has a wall you see head-on (over the opening, with sky either side of
 * it) and walls you only ever see at an angle (down the sides). Painted the same
 * `tan`, the first read correctly and the second turned the whole colonnade into
 * one flat olive slab from the quarter view — the gate read *solid*, which is
 * the single thing it must never do. So the head-on wall stays a step below the
 * stone at `brown`, and the side walls drop to `darkOlive`, the darkest warm
 * entry in the palette, which turns the five passages into slots and puts the
 * columns in front of shadow.
 *
 * `bone` is not used anywhere, and this is the building where that matters most:
 * five openings' worth of shaded wall, seen with cyan sky beside it.
 */

// ---------------------------------------------------------------------------
// Plan. X runs across the front, Z through the depth, the front face at +Z.
// ---------------------------------------------------------------------------

/** Half-widths across the flats. The shaft is 3.6 across: 6.1 diameters tall. */
const COLUMN_R = 1.8;
const COLUMN_NECK = 1.53;
const ABACUS_R = 2.0;

/** True scale, and the pair of numbers the building is named by: 1.49 to 1. */
const PASSAGE_MID = 8.6;
const PASSAGE_SIDE = 5.8;

/** Column axes out from the centre line. Six across the front, mirrored. */
const AXIS_1 = PASSAGE_MID / 2 + COLUMN_R; // 6.1
const AXIS_2 = AXIS_1 + COLUMN_R * 2 + PASSAGE_SIDE; // 15.5
const AXIS_3 = AXIS_2 + COLUMN_R * 2 + PASSAGE_SIDE; // 24.9
const COLUMN_X = [AXIS_1, AXIS_2, AXIS_3];
/** Outer face of the outermost shaft: half the colonnade, 53.4 across. */
const BLOCK_HALF_W = AXIS_3 + COLUMN_R; // 26.7

/** 11 m deep at k = 1.523. The columns' outer faces are the datum. */
const BLOCK_HALF_D = 8.4;
const COLUMN_Z = BLOCK_HALF_D - COLUMN_R; // 6.6
/** The transverse walls stop a unit short of the shafts, so the columns stand proud. */
const WALL_HALF_D = 5.8;
const WALL_T = 2.4;

// ---------------------------------------------------------------------------
// Elevation. Every level is absolute above y = 0.
// ---------------------------------------------------------------------------

const STEP = 0.7;
const STYLOBATE = 2 * STEP; // 1.4
const CAPITAL_H = 1.8;
const COLUMN_H = 22.0;
const COLUMN_TOP = STYLOBATE + COLUMN_H; // 23.4
const ARCHITRAVE_TOP = 25.4;
const FRIEZE_TOP = 27.3;
const CORNICE_TOP = 28.2;
const ATTIC_TOP = 31.0;
const CAP_TOP = 31.7;

/** Passage soffits. 19.0 clear in the middle against 14.1 at the sides. */
const HEAD_MID = 20.4;
const HEAD_SIDE = 15.5;

/** How far each course stands proud of the colonnade's own half-width. */
const OUT_ARCHITRAVE = 0.2;
const OUT_CORNICE = 1.0;
const IN_ATTIC = 1.5;
const OUT_CAP = 0.5;

// ---------------------------------------------------------------------------
// The wings: low screening walls, so the gate is not a free-standing frame.
// ---------------------------------------------------------------------------

const WING_W = 15.5;
const WING_X = BLOCK_HALF_W + WING_W / 2; // 34.45
const WING_HALF_D = 6.0;
const WING_TOP = 16.5;
const WING_CORNICE_TOP = 17.9;
const WING_COL_R = 1.15;
const WING_COL_NECK = 0.98;
const WING_ABACUS = 1.28;
const WING_COL_X = [-5.7, -1.9, 1.9, 5.7];
const WING_COL_Z = WING_HALF_D + 0.35;

// ---------------------------------------------------------------------------
// The quadriga, standing on the attic cap.
// ---------------------------------------------------------------------------

/**
 * Four abreast, 2.7 apart. The barrels are 2.55 wide, so they leave a 0.15 gap
 * and merge into **one mass**; the leg groups are 1.15 wide and leave 1.55, so
 * they stay four. That difference is the whole read: a body with four sets of
 * legs under it, not four posts in a row. The outer pair are splayed, so the
 * group fans instead of being one horse stamped out four times.
 */
const HORSE_X = [-4.05, -1.35, 1.35, 4.05];
const HORSE_YAW = [0.12, 0.04, -0.04, -0.12];
const HORSE_Z = 1.0;
const CHARIOT_Z = -4.2;
const VICTORIA_Z = -3.8;
const WHEEL_R = 1.6;
const WHEEL_T = 0.4;
const WHEEL_X = 2.3;

export const brandenburgGate: Monument = {
  id: 'brandenburg-gate',
  name: 'Brandenburg Gate',
  iso: 'DEU',
  lat: 52.516,
  lon: 13.378,
  realHeight: 26,
  tier: 'building',
  footprint: 44,

  build(ctx) {
    const { THREE, palette, box, taper, column, strut, ringWall } = ctx;

    /** Sunlit sandstone: the columns and everything that stands in the light. */
    const stone = palette.cream;
    /** The entablature, the cornices and the attic cap — a warmer horizontal. */
    const trim = palette.sand;
    /** The base: a step darker than the shafts, so the building sits down. */
    const plinth = palette.tan;
    /**
     * The wall over each opening. Seen head-on with sky either side of it, so it
     * has to read as *wall*: warm, and only a step below the stone.
     */
    const infill = palette.brown;
    /**
     * The side walls of the five passages. These are only ever seen at an angle,
     * and at any angle worth calling a quarter view the passage is closed by
     * them — `tan` here made the whole colonnade one flat olive slab and the gate
     * read solid, which is the one thing it must not. `darkOlive` is the darkest
     * warm entry there is, so the passages become slots and the columns stand in
     * front of shadow.
     */
    const recess = palette.darkOlive;
    /** Bronze. A mid tone, so the cel ramp still models the horses. */
    const bronze = palette.brown;
    const gilt = palette.gold;

    const group = new THREE.Group();
    const SIDES = [-1, 1] as const;

    const place = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    /** A course of the colonnade block: full width, centred, standing on `base`. */
    const course = (base: number, top: number, out: number, color: number): Mesh =>
      place(
        box((BLOCK_HALF_W + out) * 2, top - base, (BLOCK_HALF_D + out) * 2, color),
        0,
        base,
        0,
      );

    // -----------------------------------------------------------------------
    // The base: two steps under the colonnade, a plinth under each wing.
    // -----------------------------------------------------------------------
    course(0, STEP, OUT_CORNICE + 0.6, plinth);
    course(STEP, STYLOBATE, OUT_CORNICE, plinth);
    for (const sx of SIDES) {
      place(box(WING_W + 0.8, STYLOBATE, WING_HALF_D * 2 + 3.0, plinth), sx * WING_X, 0, 0);
    }

    // -----------------------------------------------------------------------
    // The five passages: six transverse walls, and the heads that close four of
    // them early. The walls carry the columns; the gaps between them are the
    // gate.
    // -----------------------------------------------------------------------
    for (const sx of SIDES) {
      for (const axis of COLUMN_X) {
        place(
          box(WALL_T, COLUMN_TOP - STYLOBATE, WALL_HALF_D * 2, recess),
          sx * axis,
          STYLOBATE,
          0,
        );
      }
    }

    /** A passage head: it overlaps the wall either side of it by half its thickness. */
    const head = (centre: number, clear: number, from: number): Mesh =>
      place(
        box(clear + WALL_T, COLUMN_TOP - from, WALL_HALF_D * 2, infill),
        centre,
        from,
        0,
      );

    head(0, AXIS_1 * 2 - WALL_T, HEAD_MID);
    for (const sx of SIDES) {
      head(sx * ((AXIS_1 + AXIS_2) / 2), AXIS_2 - AXIS_1 - WALL_T, HEAD_SIDE);
      head(sx * ((AXIS_2 + AXIS_3) / 2), AXIS_3 - AXIS_2 - WALL_T, HEAD_SIDE);
    }

    // -----------------------------------------------------------------------
    // Twelve Doric columns: two rows of six. Eight facets, because the facets
    // are the fluting — the cel ramp steps between flat-shaded faces and draws
    // two or three flutes across the face of a shaft. The capital is a
    // four-sided flare from the neck out to a square abacus, 1.11x the foot, and
    // it is what makes a rank read as columns rather than as tapered posts.
    // -----------------------------------------------------------------------
    for (const sx of SIDES) {
      for (const sz of SIDES) {
        for (const axis of COLUMN_X) {
          place(
            taper(COLUMN_R, COLUMN_NECK, COLUMN_H - CAPITAL_H, stone, 8),
            sx * axis,
            STYLOBATE,
            sz * COLUMN_Z,
          );
          place(
            taper(COLUMN_NECK, ABACUS_R, CAPITAL_H, stone, 4),
            sx * axis,
            COLUMN_TOP - CAPITAL_H,
            sz * COLUMN_Z,
          );
        }
      }
    }

    // -----------------------------------------------------------------------
    // The entablature: architrave, plain frieze, cornice. No triglyphs — the
    // brief asks for plain and the budget agrees.
    // -----------------------------------------------------------------------
    course(COLUMN_TOP, ARCHITRAVE_TOP, OUT_ARCHITRAVE, trim);
    course(ARCHITRAVE_TOP, FRIEZE_TOP, 0, trim);
    course(FRIEZE_TOP, CORNICE_TOP, OUT_CORNICE, trim);

    // The attic: set back off the cornice, carrying the inscription band, capped
    // by the plinth the quadriga stands on.
    course(CORNICE_TOP, ATTIC_TOP, -IN_ATTIC, stone);
    const atticHalfD = BLOCK_HALF_D - IN_ATTIC;
    place(box(38, 1.9, 0.5, trim), 0, CORNICE_TOP + 0.5, atticHalfD);
    course(ATTIC_TOP, CAP_TOP, -IN_ATTIC + OUT_CAP, trim);

    // -----------------------------------------------------------------------
    // The wings. Half the gate's height, their own smaller Doric rhythm in front
    // of a solid wall, so the eye reads "the colonnade continues, quieter"
    // rather than "two boxes".
    // -----------------------------------------------------------------------
    for (const sx of SIDES) {
      place(box(WING_W, WING_TOP - STYLOBATE, WING_HALF_D * 2, stone), sx * WING_X, STYLOBATE, 0);
      place(
        box(WING_W + 1.2, WING_CORNICE_TOP - WING_TOP, WING_HALF_D * 2 + 3.2, trim),
        sx * WING_X,
        WING_TOP,
        0,
      );
      for (const offset of WING_COL_X) {
        place(
          taper(WING_COL_R, WING_COL_NECK, WING_TOP - STYLOBATE - 1.2, stone, 8),
          sx * WING_X + offset,
          STYLOBATE,
          WING_COL_Z,
        );
        place(
          taper(WING_COL_NECK, WING_ABACUS, 1.2, stone, 4),
          sx * WING_X + offset,
          WING_TOP - 1.2,
          WING_COL_Z,
        );
      }
    }

    // -----------------------------------------------------------------------
    // The quadriga.
    // -----------------------------------------------------------------------

    /**
     * One horse, hooves at its own y = 0, facing +Z. Six meshes, no more: hind
     * group, fore group, barrel, neck, head, tail. Low and broad on purpose —
     * an earlier version was tall and narrow and the four of them read as four
     * standing men, because from dead front a horse modelled honestly is a
     * vertical stack of same-width blocks.
     */
    const horse = (x: number, yaw: number): Object3D => {
      const animal = new THREE.Group();
      const put = (mesh: Mesh, px: number, py: number, pz: number): Mesh => {
        mesh.position.set(px, py, pz);
        animal.add(mesh);
        return mesh;
      };

      put(box(1.5, 2.3, 1.0, bronze), 0, 0, -1.7);
      put(box(1.15, 2.4, 1.0, bronze), 0, 0, 1.3);
      put(box(2.55, 2.3, 4.2, bronze), 0, 2.2, -0.2);
      animal.add(
        strut(
          new THREE.Vector3(0, 4.0, 1.4),
          new THREE.Vector3(0, 5.0, 2.5),
          1.0,
          bronze,
        ),
      );
      put(box(0.85, 0.95, 1.6, bronze), 0, 4.8, 2.45).rotation.x = -0.35;
      put(box(0.5, 1.6, 0.5, bronze), 0, 3.4, -2.2).rotation.x = -0.55;

      animal.position.set(x, CAP_TOP, HORSE_Z);
      animal.rotation.y = yaw;
      return animal;
    };

    HORSE_X.forEach((x, index) => group.add(horse(x, HORSE_YAW[index]!)));

    // The chariot, and the two wheels it rolls on. `column` stands on +Y, so a
    // quarter turn about Z lays a wheel on its axle; the prism then grows from
    // its origin along -X for a positive turn and +X for a negative one, which
    // is why the origin is offset by half the rim's thickness.
    place(box(4.2, 2.6, 3.0, bronze), 0, CAP_TOP + 1.0, CHARIOT_Z);
    place(box(4.6, 0.5, 3.4, bronze), 0, CAP_TOP + 3.6, CHARIOT_Z);
    for (const sx of SIDES) {
      const wheel = column(WHEEL_R, WHEEL_T, bronze, 10);
      wheel.rotation.z = sx * Math.PI / 2;
      wheel.position.set(sx * (WHEEL_X + WHEEL_T / 2), CAP_TOP + WHEEL_R, CHARIOT_Z);
      group.add(wheel);
    }

    // Victoria: a flared robe, a torso, a head, two wings, and the standard.
    // Her feet are on the chariot floor, which is above the horses' backs, so
    // everything from the waist up clears the mass in front of her — which is
    // the only reason a figure standing behind four horses is visible at all.
    place(taper(1.05, 0.62, 3.2, bronze, 6), 0, CAP_TOP + 1.5, VICTORIA_Z);
    place(box(1.5, 2.0, 1.0, bronze), 0, CAP_TOP + 4.7, VICTORIA_Z);
    place(box(0.75, 0.85, 0.75, bronze), 0, CAP_TOP + 6.7, VICTORIA_Z + 0.1);
    // Horse heads top out at 37.7 and her head starts at 38.4: the gap is small
    // and it is the whole difference between a driver and a fifth horse.
    // The wings are broad across X and thin through Z. Built the other way round
    // they were two diagonal sticks over the horses' backs, which reads as a
    // spear, not a wing.
    for (const sx of SIDES) {
      place(box(1.15, 2.3, 0.55, bronze), sx * 1.05, CAP_TOP + 5.2, VICTORIA_Z - 0.35).rotation.z =
        -sx * 0.30;
    }

    place(column(0.17, 4.8, gilt, 6), 1.15, CAP_TOP + 2.1, VICTORIA_Z + 0.6);
    // The wreath is the one hole in the model, and it is at its highest point.
    // Lathed about Y and tipped a quarter turn, it stands vertical facing +Z.
    place(ringWall(0.45, 0.85, 0.32, gilt, 10), 1.15, CAP_TOP + 7.15, VICTORIA_Z + 0.45).rotation.x =
      Math.PI / 2;

    return group;
  },
};
