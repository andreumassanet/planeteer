import type { Monument } from './contract.ts';

/**
 * Parthenon.
 *
 * Four things survive at thumbnail size: the peristyle (a rectangle of columns,
 * eight across the front and seventeen down the flank; that ratio is the
 * building, 46 perimeter positions of which 37 still carry stone), the
 * entablature under a low pediment (a 15-degree rake; a 30-degree gable is a
 * house), a three-step stylobate whose ink lines separate the temple from a
 * colonnade in a field, and the ruin (no roof, no pediment sculpture, whole runs
 * of column and entablature gone, from a fixed table read off the column index).
 *
 * True proportions are 7% too flat for `MAX_ASPECT` (half-diagonal 39.9 m on
 * 18.7 m), and the plan carries the recognition, so the plan is kept honest (40.0
 * by 87.7 units at the stylobate, 2.19 against the real 2.25) and every vertical
 * dimension is multiplied by 1.30, leaving the order's internal proportions
 * untouched. The shafts are thickened 15% to 2.72 across (6.2 diameters, still
 * Doric, where 7.1 would be Ionic), which narrows the gaps between columns from
 * 1.25 diameters to 0.95; the denser rank holds together as one band.
 *
 * The `building` tier allows 110 meshes, and each column is two: an 8-facet
 * frustum shaft (the facets are the fluting, two or three cel steps across a
 * face) and a 4-facet capital whose corners project at 45 degrees like the
 * abacus. Entasis is dropped (a 0.16% bulge, invisible, and a second drum would
 * cost ten columns); the 22% taper is kept in full. The frieze is merged into
 * the architrave, and there is no corner contraction.
 */

// --- Plan. One interaxial spacing rules the grid on both axes, which lands
// 7 x 16 bays at a stylobate ratio of 2.19 against the real 2.25. ---

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
 * The ruin, as four rows of a fixed table: `W` whole, `H` shaft standing but
 * capital fallen, `S` a broken stump, `.` gone. The front and back rows are
 * written left to right facing the front; the flanks front to back. The front
 * row is whole, so eight is countable. The right flank (the one the quarter view
 * looks along) keeps nine intact bays coming forward, loses four, and picks up at
 * the far corner. The left flank, mostly hidden, carries five bays of damage.
 * The back row has lost its middle.
 */
const FRONT_ROW = 'WWWWWWWW';
const BACK_ROW = 'W.S.WWWW';
const RIGHT_FLANK = 'WWWWWWWHWS..SWW';
const LEFT_FLANK = 'WHWWWS.....SWWW';

/**
 * Deterministic wobble in [-1, 1], for the broken stones only; the standing
 * order stays dead regular. The step is the golden angle.
 */
const wobble = (index: number, salt: number): number => Math.sin(index * 2.39996 + salt);

export const parthenon: Monument = {
  id: 'parthenon',
  name: 'Parthenon',
  iso: 'GRC',
  lat: 37.971,
  lon: 23.727,
  // No `realHeight`: the height is quoted anywhere from 13.7 m to 19 m, and the
  // building has stood as a temple, a church, a mosque and a powder magazine.
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
     * The empty tympanum and the cella walls behind the colonnade. Warm, because
     * the hemisphere light is sky blue, so a neutral grey in shade comes back
     * blue and reads as a hole.
     */
    const shadow = palette.tan;

    const group = new THREE.Group();

    // --- The krepidoma ---
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

    // --- The peristyle ---

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
          // A stump is snapped mid-drum, so its break is a touch wider than the dressed profile and a few degrees off the rank.
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

    // --- The entablature, in surviving runs ---

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

    // Right flank: a long run forward from the breach and a scrap at the far
    // corner; the cornice stops short of the band at the broken end.
    run('z', AXIS_X, -8, STYLOBATE_Z, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);
    run('z', AXIS_X, -3, CORNICE_Z, CORNICE_Y, CORNICE_HEIGHT, CORNICE_HALF, beamStone);
    run('z', AXIS_X, -STYLOBATE_Z, -28, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);

    // Left flank: only the two ends survive.
    run('z', -AXIS_X, 13.25, STYLOBATE_Z, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);
    run('z', -AXIS_X, 15.5, CORNICE_Z, CORNICE_Y, CORNICE_HEIGHT, CORNICE_HALF, beamStone);
    run('z', -AXIS_X, -STYLOBATE_Z, -23.85, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);

    // Back: half a band and no cornice at all.
    run('x', -AXIS_Z, -3, STYLOBATE_X, BAND_Y, BAND_HEIGHT, BAND_HALF, beamStone);

    // --- The pediments ---

    // The front tympanum: `taper` makes regular prisms, so a gable is a square
    // pyramid squashed to a 2.6-unit plate (the raking cornices hide the point
    // in section). It is empty, as the sculpture is gone.
    const tympanum = taper(TYMPANUM_HALF, 0.3, PEDIMENT_HEIGHT, shadow, 4);
    tympanum.scale.z = TYMPANUM_THICKNESS / (TYMPANUM_HALF * 2);
    tympanum.position.set(0, CORNICE_TOP, AXIS_Z);
    group.add(tympanum);

    const apex = CORNICE_TOP + PEDIMENT_HEIGHT;
    for (const side of [-1, 1]) {
      // The two rakes cross a little past the centre line, so the apex is closed.
      group.add(
        strut(
          new THREE.Vector3(side * CORNICE_X, CORNICE_TOP, RAKE_Z),
          new THREE.Vector3(-side * 0.5, apex, RAKE_Z),
          RAKE_THICKNESS,
          beamStone,
        ),
      );
    }

    // The back pediment is gone but for one spur of raking cornice on the band,
    // at the front pediment's own rake. It is the inner half that survives:
    // from the front view a spur at the back corner clears the front eaves and
    // reads as a plank floating in the sky.
    group.add(
      strut(
        new THREE.Vector3(10.5, CORNICE_Y, -RAKE_Z),
        new THREE.Vector3(-0.5, CORNICE_Y + 2.9, -RAKE_Z),
        RAKE_THICKNESS,
        beamStone,
      ),
    );

    // --- Inside: the cella walls, the porch, and what has fallen off. With no
    // roof the interior is visible from above and through the colonnade's gaps. ---

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

    // The pronaos columns, broken at four heights, standing in the gaps of the front rank.
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
      // The prism's axis is +Y; tipped a quarter turn about x it lies along +Z with a flat down.
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

    // Inside, in the ambulatory under the breaches, seen through the gaps in the colonnade.
    drum(-15.4, STYLOBATE, -8, 0.4, 1.25, 3.2);
    drum(-14.9, STYLOBATE, -13.4, 1.9, 1.15, 2.9);
    drum(15.6, STYLOBATE, -19, -0.7, 1.3, 3.4);
    fallen(-15, STYLOBATE, -1.5, 0.25);

    // And on the ground off the front steps, inside the 50.7 the krepidoma already reaches.
    drum(12.5, 0, 44, 0.95, 1.3, 3.4);
    fallen(-8.5, 0, 47, -0.35);

    return group;
  },
};
