import type { Monument } from './contract.ts';

/**
 * Parthenon.
 *
 * Four things have to survive at thumbnail size, and every number in this file
 * is spent on one of them:
 *
 * - **The peristyle.** A rectangle of columns all the way round, **eight across
 *   the front and seventeen down the flank**. That ratio is the building. A
 *   temple with six and thirteen is the Hephaisteion; a temple with eight and
 *   fifteen is nothing in particular. 46 perimeter positions, and the budget is
 *   laid out below so that 37 of them still carry stone.
 * - **The entablature and the low pediment.** The most quoted shape in
 *   architecture is a shallow triangle over a horizontal band over a colonnade,
 *   and it only works if the triangle stays shallow: a 30-degree gable is a
 *   house. Ours rakes at 15 degrees.
 * - **The stepped stylobate.** Three steps, not a slab. Greek temples sit on a
 *   plinth you climb, and the three ink lines round the base are what separates
 *   this from a colonnade standing in a field.
 * - **The ruin.** No roof, no pediment sculpture, and whole runs of column and
 *   entablature gone. A complete Parthenon is a bank in Washington. The gaps are
 *   a fixed table read off the column index — never `Math.random()`, because the
 *   loader builds twice and compares.
 *
 * ## Scale: the plan kept honest, the vertical stretched 1.30x
 *
 * True proportions do not fit. The krepidoma is 33.7 m by 72.3 m and the apex of
 * the pediment is 18.7 m over the ground, so the half-diagonal is 39.9 m against
 * an 18.7 m height — a ratio of 2.13, where `MAX_ASPECT` allows 2.00. The
 * Parthenon is genuinely a shade too flat to model whole, by 7%.
 *
 * The `MAX_ASPECT` note says to distort the axis that carries the least
 * recognition. Here that is unambiguous: **the plan carries everything.** Eight
 * by seventeen is the identity, and 8:17 in count only reads as the Parthenon if
 * the rectangle it draws is roughly 1:2.2. So the plan is kept honest — 40.0 by
 * 87.7 units at the stylobate, a ratio of 2.19 against the real 2.25 — and every
 * vertical dimension is multiplied by **1.30**: steps, shafts, entablature and
 * pediment alike, so the *internal* proportions of the order are untouched and
 * only the whole thing is taller. Height comes out at 30.5 against a half-width
 * of 50.7, a ratio of 3.32 inside the cap of 4.
 *
 * One knock-on had to be paid for. Stretching the shaft to 16.75 units without
 * touching its diameter would leave it 7.1 diameters tall, which is Ionic
 * slenderness; Doric is 5.5 and the stockiness is half of why the building looks
 * planted. So the shafts are thickened 15% to 2.72 units across, giving 6.2
 * diameters — still visibly Doric. The cost is that the gaps between columns
 * narrow from 1.25 diameters to 0.95, so the colonnade is denser than life. At
 * the distance this is read from that is a gain, not a loss: a denser rank of
 * columns holds together as one band of light and shade instead of dissolving
 * into sticks.
 *
 * ## Where the budget went: 46 positions before any one column
 *
 * The `building` tier allows 110 meshes, and the column count is what the eye
 * counts, so the columns were sized last. Two meshes each:
 *
 * - **Shaft** — an 8-facet frustum. The facets *are* the fluting. `OutlineEffect`
 *   only inks silhouettes, so an interior edge is drawn by the cel ramp stepping
 *   between two flat-shaded faces, and 8 facets put two or three of those steps
 *   across a column's face. Six is too coarse to read as fluting and twelve costs
 *   160 triangles a column for a smooth cylinder, which is the opposite of what
 *   is wanted.
 * - **Capital** — a 4-facet flare from the neck out to the abacus. A square
 *   spreading out of a round shaft, corners projecting past the shaft at 45
 *   degrees, exactly as the real abacus does. This mesh is what makes the ranks
 *   read as *columns* rather than tapered posts, because it puts a second ink
 *   event at the top of all 30 that still have one.
 *
 * **Entasis lost the head-to-head against the capital, and it is not close.** A
 * curved shaft needs a second drum, so it costs one mesh per column, the same as
 * a capital — and at 110 meshes total that is the difference between 37 columns
 * standing and 27. It is also invisible: the real entasis is a 1.7 cm bulge on a
 * 10.43 m shaft, 0.16%, which lands here at 0.03 units — a fifth of the width of
 * the ink line drawn over it. The **taper** is the part of the profile that can
 * actually be seen (1.905 m at the foot to 1.48 m at the neck, a real 22%) and it
 * is kept in full, and the shaft-neck-abacus profile gives the silhouette its
 * one honest inflection at the top. The mesh the entasis would have cost bought
 * ten more columns instead.
 *
 * The other departures, briefly: **the frieze is merged into the architrave** as
 * one band with a projecting cornice on top, because triglyphs would be fifteen
 * blocks across the front alone; and **there is no corner contraction**, the real
 * shortening of the end bays, which is a 14% change in one bay out of sixteen.
 */

// ---------------------------------------------------------------------------
// Plan. One interaxial spacing rules the whole grid, on both axes, which is
// almost true of the real temple (4.29 m on the flank, 4.13 m on the front) and
// lands 7 x 16 bays at a stylobate ratio of 2.19 against the real 2.25.
// ---------------------------------------------------------------------------

const BAY = 5.3;
const FRONT_COLUMNS = 8;
const FLANK_COLUMNS = 17;
/** Half-extent of the column *axes*, not of the stone. */
const AXIS_X = ((FRONT_COLUMNS - 1) / 2) * BAY; // 18.55
const AXIS_Z = ((FLANK_COLUMNS - 1) / 2) * BAY; // 42.40

// --- the krepidoma: three steps, the top one being the stylobate ---
const STEPS = 3;
const STEP_RISE = 0.82;
const STEP_TREAD = 0.95;
const STYLOBATE = STEPS * STEP_RISE; // 2.46
/** The stylobate oversails the corner column axes by about one column radius. */
const STYLOBATE_X = AXIS_X + 1.45; // 20.00
const STYLOBATE_Z = AXIS_Z + 1.45; // 43.85

// --- the Doric order, every height already multiplied by the 1.30 stretch ---
const COLUMN_HEIGHT = 16.75;
const CAPITAL_HEIGHT = 1.83;
const SHAFT_HEIGHT = COLUMN_HEIGHT - CAPITAL_HEIGHT;
/** Half-widths across the flats: 2.72 across at the foot, 2.30 at the neck. */
const SHAFT_FOOT = 1.36;
const SHAFT_NECK = 1.15;
/** The abacus, 3.00 across the flats — 1.10 times the foot, as on the real capital. */
const ABACUS = 1.5;
const SHAFT_SIDES = 8;

// --- entablature: architrave and frieze as one band, then the cornice ---
const BAND_Y = STYLOBATE + COLUMN_HEIGHT; // 19.21
const BAND_HEIGHT = 4.34;
/** Half-depth of the band, measured off the column axis it sits on. */
const BAND_HALF = 1.5;
const CORNICE_Y = BAND_Y + BAND_HEIGHT; // 23.55
const CORNICE_HEIGHT = 0.96;
const CORNICE_HALF = 2.3;
const CORNICE_TOP = CORNICE_Y + CORNICE_HEIGHT; // 24.51
/** Outer face of the cornice, which is the widest thing above the steps. */
const CORNICE_X = AXIS_X + CORNICE_HALF; // 20.85
const CORNICE_Z = AXIS_Z + CORNICE_HALF; // 44.70

// --- pediment: 5.5 over a half-span of 20.85 is a 14.8 degree rake ---
const PEDIMENT_HEIGHT = 5.5;
const TYMPANUM_HALF = 19;
const TYMPANUM_THICKNESS = 2.6;
const RAKE_THICKNESS = 1.1;
/** The raking cornices stand proud of the tympanum, so the ink finds a ledge. */
const RAKE_Z = AXIS_Z + 1.6;

// --- the cella, ruined to stubs, seen through the colonnade and over its top ---
const CELLA_X = 11.5;
const CELLA_WALL = 1.6;

/**
 * The ruin, as four rows of a fixed table.
 *
 * `W` whole, `H` shaft standing but the capital fallen, `S` a broken stump,
 * `.` gone. The two rows are written left to right as you face the front; the
 * two flanks are written front to back, so the leading character of each is the
 * bay nearest the viewer.
 *
 * The shape of the ruin is chosen for the two fixed cameras of the contact
 * sheet. The front row is whole, so eight is countable. The right flank — the
 * one the quarter view looks along — keeps an unbroken run of nine bays coming
 * forward, then loses four in the middle and picks up again at the far corner:
 * enough intact rhythm to count seventeen positions, and an unmistakable breach.
 * The left flank, which the fixed views mostly hide, carries the heavy damage,
 * five bays gone in one stretch. The back row has lost its middle.
 */
const FRONT_ROW = 'WWWWWWWW';
const BACK_ROW = 'W.S.WWWW';
const RIGHT_FLANK = 'WWWWWWWHWS..SWW';
const LEFT_FLANK = 'WHWWWS.....SWWW';

/**
 * Deterministic wobble in [-1, 1], for the broken stones only — the standing
 * order is precision masonry and must stay dead regular. The step is the golden
 * angle so neighbouring bays never land on the same value.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const parthenon: Monument = {
  id: 'parthenon',
  name: 'Parthenon',
  iso: 'GRC',
  lat: 37.971,
  lon: 23.727,
  // No `realHeight`, matching the source list. The stylobate-to-pediment height
  // is quoted anywhere between 13.7 m (to the top of the cornice) and 19 m (from
  // the rock to the apex), and the building has stood as a temple, a church, a
  // mosque and a powder magazine at four different heights. The card says less.
  tier: 'building',
  footprint: 51,

  build(ctx) {
    const { THREE, palette, box, taper, column, strut } = ctx;
    /** Sunlit Pentelic marble. The brightest thing in the model, as it should be. */
    const marble = palette.cream;
    /** The steps and the fallen stone: greyer, so the base sits down and the debris reads apart. */
    const weathered = palette.bone;
    /** Honeyed upper courses. A colour step here is what makes the entablature a separate horizontal. */
    const beamStone = palette.sand;
    /**
     * The empty tympanum and the cella walls behind the colonnade. Warm and dark
     * on purpose, and the warmth is not decoration: the hemisphere light is sky
     * blue, so a neutral grey standing in shade inside the peristyle comes back
     * *blue*, and a blue slab between marble columns reads as a hole in the model
     * rather than as a wall in shadow. A warm base colour absorbs the tint.
     */
    const shadow = palette.tan;

    const group = new THREE.Group();

    // -----------------------------------------------------------------------
    // The krepidoma
    // -----------------------------------------------------------------------
    for (let step = 0; step < STEPS; step++) {
      const out = (STEPS - 1 - step) * STEP_TREAD;
      const slab = box(
        (STYLOBATE_X + out) * 2,
        STEP_RISE,
        (STYLOBATE_Z + out) * 2,
        weathered,
      );
      slab.position.y = step * STEP_RISE;
      group.add(slab);
    }

    // -----------------------------------------------------------------------
    // The peristyle
    // -----------------------------------------------------------------------

    /** Shaft half-width a fraction `t` of the way up, for cutting a stump. */
    const shaftAt = (t: number): number => SHAFT_FOOT + (SHAFT_NECK - SHAFT_FOOT) * t;

    const stateAt = (i: number, j: number): string => {
      if (j === FLANK_COLUMNS - 1) return FRONT_ROW[i]!;
      if (j === 0) return BACK_ROW[i]!;
      // The flanks are written front to back: j = 15 is the first character.
      const bay = FLANK_COLUMNS - 2 - j;
      return (i === FRONT_COLUMNS - 1 ? RIGHT_FLANK : LEFT_FLANK)[bay]!;
    };

    for (let i = 0; i < FRONT_COLUMNS; i++) {
      for (let j = 0; j < FLANK_COLUMNS; j++) {
        const perimeter =
          i === 0 || i === FRONT_COLUMNS - 1 || j === 0 || j === FLANK_COLUMNS - 1;
        if (!perimeter) continue;

        const state = stateAt(i, j);
        if (state === '.') continue;

        const x = (i - (FRONT_COLUMNS - 1) / 2) * BAY;
        const z = (j - (FLANK_COLUMNS - 1) / 2) * BAY;
        const seed = i * FLANK_COLUMNS + j;

        if (state === 'S') {
          // A stump is snapped mid-drum, so its break is a touch wider than the
          // dressed profile and it sits a few degrees off the rank.
          const cut = 0.38 + 0.14 * wobble(seed, 0);
          const stump = taper(
            SHAFT_FOOT,
            shaftAt(cut) * 1.04,
            SHAFT_HEIGHT * cut,
            marble,
            SHAFT_SIDES,
          );
          stump.position.set(x, STYLOBATE, z);
          stump.rotation.y = 0.07 * wobble(seed, 1);
          group.add(stump);
          continue;
        }

        const shaft = taper(SHAFT_FOOT, SHAFT_NECK, SHAFT_HEIGHT, marble, SHAFT_SIDES);
        shaft.position.set(x, STYLOBATE, z);
        group.add(shaft);

        if (state === 'W') {
          const capital = taper(SHAFT_NECK, ABACUS, CAPITAL_HEIGHT, marble, 4);
          capital.position.set(x, STYLOBATE + SHAFT_HEIGHT, z);
          group.add(capital);
        }
      }
    }

    // -----------------------------------------------------------------------
    // The entablature, in surviving runs
    // -----------------------------------------------------------------------

    /**
     * One run of entablature. `axis` is the direction it spans; `offset` is the
     * column axis it rides, and `from`/`to` its two ends along the span.
     */
    const run = (
      axis: 'x' | 'z',
      offset: number,
      from: number,
      to: number,
      y: number,
      height: number,
      half: number,
      color: number,
    ): void => {
      const length = to - from;
      const middle = (from + to) / 2;
      const beam =
        axis === 'x'
          ? box(length, height, half * 2, color)
          : box(half * 2, height, length, color);
      beam.position.set(
        axis === 'x' ? middle : offset,
        y,
        axis === 'x' ? offset : middle,
      );
      group.add(beam);
    };

    // Front: the one face that keeps everything.
    run('x', AXIS_Z, -STYLOBATE_X, STYLOBATE_X, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);
    run('x', AXIS_Z, -CORNICE_X, CORNICE_X, CORNICE_Y, CORNICE_HEIGHT, CORNICE_HALF, beamStone);

    // Right flank: a long run forward from the breach, and a scrap at the far
    // corner. The cornice stops short of the band at the broken end, so the ruin
    // steps down instead of shearing off in one plane.
    run('z', AXIS_X, -8, STYLOBATE_Z, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);
    run('z', AXIS_X, -3, CORNICE_Z, CORNICE_Y, CORNICE_HEIGHT, CORNICE_HALF, beamStone);
    run('z', AXIS_X, -STYLOBATE_Z, -28, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);

    // Left flank: only the two ends survive, and the middle five bays carry
    // nothing at all.
    run('z', -AXIS_X, 13.25, STYLOBATE_Z, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);
    run('z', -AXIS_X, 15.5, CORNICE_Z, CORNICE_Y, CORNICE_HEIGHT, CORNICE_HALF, beamStone);
    run('z', -AXIS_X, -STYLOBATE_Z, -23.85, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);

    // Back: half a band and no cornice at all.
    run('x', -AXIS_Z, -3, STYLOBATE_X, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);

    // -----------------------------------------------------------------------
    // The pediments
    // -----------------------------------------------------------------------

    // The front tympanum. `taper` makes regular prisms, so a gable is a square
    // pyramid squashed on its own z to a 2.6-unit plate; the raking cornices in
    // front of it hide that its apex comes to a point in section as well as in
    // elevation. It is empty: the sculpture went to London and to the museum,
    // and an empty tympanum in shadow is the truthful reading and the strong one.
    const tympanum = taper(TYMPANUM_HALF, 0.3, PEDIMENT_HEIGHT, shadow, 4);
    tympanum.scale.z = TYMPANUM_THICKNESS / (TYMPANUM_HALF * 2);
    tympanum.position.set(0, CORNICE_TOP, AXIS_Z);
    group.add(tympanum);

    const apex = CORNICE_TOP + PEDIMENT_HEIGHT;
    for (const side of [-1, 1]) {
      // The two rakes cross a little past the centre line, so the apex is a
      // closed point rather than a notch.
      group.add(
        strut(
          new THREE.Vector3(side * CORNICE_X, CORNICE_TOP, RAKE_Z),
          new THREE.Vector3(-side * 0.5, apex, RAKE_Z),
          RAKE_THICKNESS,
          beamStone,
        ),
      );
    }

    // The back pediment is gone but for one spur of raking cornice still lying
    // on the band, climbing towards an apex that is not there. It says "there
    // was a gable at this end too" in one mesh, and it rakes at the front
    // pediment's own 0.264 so the two read as the same building.
    //
    // It is the *inner* half of the rake that survives, not the corner, and that
    // is a framing decision as much as a ruin: the fixed front view looks down
    // the length of the temple, and 44 units of extra distance lift anything at
    // the far end by about two units in screen space. A spur springing from the
    // back corner clears the front pediment's eaves and reads as a plank
    // floating in the sky. Kept near the centre line it stays inside the
    // pediment's own silhouette from the front and shows in full from the
    // quarter view, which is the one that looks along the flank.
    group.add(
      strut(
        new THREE.Vector3(10.5, CORNICE_Y, -RAKE_Z),
        new THREE.Vector3(-0.5, CORNICE_Y + 2.9, -RAKE_Z),
        RAKE_THICKNESS,
        beamStone,
      ),
    );

    // -----------------------------------------------------------------------
    // Inside: the cella walls, the porch, and what has fallen off
    //
    // There is no roof, so the interior is visible from anywhere above eye
    // level and through every gap in the colonnade. Left empty it reads as a
    // hollow box; these nine meshes are what make it read as a ruin with an
    // inside.
    // -----------------------------------------------------------------------

    const wall = (
      width: number,
      height: number,
      depth: number,
      x: number,
      z: number,
    ): void => {
      const mesh = box(width, height, depth, shadow);
      mesh.position.set(x, STYLOBATE, z);
      group.add(mesh);
    };

    wall(CELLA_WALL, 6.5, 46, -CELLA_X, -5);
    wall(CELLA_WALL, 4.2, 34, CELLA_X, 4);
    wall(23, 10.5, CELLA_WALL, 0, -31);

    // The pronaos columns, broken at four different heights, standing in the
    // gaps of the front rank so they are seen between it and not behind it.
    const PORCH = [-10.6, -5.3, 5.3, 10.6];
    PORCH.forEach((x, index) => {
      const cut = 0.62 + 0.16 * wobble(index, 2);
      const shaft = taper(
        SHAFT_FOOT * 0.85,
        shaftAt(cut) * 0.88,
        SHAFT_HEIGHT * cut,
        marble,
        SHAFT_SIDES,
      );
      shaft.position.set(x, STYLOBATE, 26.5);
      group.add(shaft);
    });

    /** A column drum on its side, resting on one of its own flats. */
    const drum = (
      x: number,
      floor: number,
      z: number,
      yaw: number,
      radius: number,
      length: number,
    ): void => {
      const pivot = new THREE.Group();
      pivot.position.set(x, floor + radius, z);
      pivot.rotation.y = yaw;
      const stone = column(radius, length, weathered, 6);
      // The prism's axis is +Y with its origin on the bottom face; tipped a
      // quarter turn about x it lies along +Z, and a flat, not an edge, is down.
      stone.rotation.x = Math.PI / 2;
      stone.position.z = -length / 2;
      pivot.add(stone);
      group.add(pivot);
    };

    /** A squared block, tipped off the axis so it reads as fallen and not as placed. */
    const fallen = (x: number, floor: number, z: number, yaw: number): void => {
      const pivot = new THREE.Group();
      pivot.position.set(x, floor, z);
      pivot.rotation.y = yaw;
      pivot.add(box(5.2, 1.7, 2.5, weathered));
      group.add(pivot);
    };

    // Inside, in the ambulatory under the breaches, where it is seen through the
    // gaps in the colonnade.
    drum(-15.4, STYLOBATE, -8, 0.4, 1.25, 3.2);
    drum(-14.9, STYLOBATE, -13.4, 1.9, 1.15, 2.9);
    drum(15.6, STYLOBATE, -19, -0.7, 1.3, 3.4);
    fallen(-15, STYLOBATE, -1.5, 0.25);

    // And on the ground off the front steps, which is the only debris either
    // fixed camera can see without looking through the building. It stays well
    // inside the 50.7 the krepidoma already reaches, so it costs no footprint.
    drum(12.5, 0, 44, 0.95, 1.3, 3.4);
    fallen(-8.5, 0, 47, -0.35);

    return group;
  },
};
