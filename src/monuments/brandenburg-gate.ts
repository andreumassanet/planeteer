import type { Mesh, Monument, Object3D } from './contract.ts';

/**
 * Brandenburg Gate.
 *
 * A trabeated gate (straight lintels on posts), unlike the arcuated Arc de
 * Triomphe, with which it shares tier `building` and a height of 39.7: twelve
 * Doric columns, five openings (8.6 wide in the middle, 5.8 either side), a
 * plan of 85.6 x 20.0 (a band, ratio 4.3) and a quadriga a fifth of the height.
 * Footprint 44. Half-diagonal over height is 1.11, so the aspect cap forces
 * nothing here.
 *
 * Two distortions, both for the read:
 * - The wings are shortened to 0.60x (26.1 to 15.5 units), so the colonnade is
 *   63% of the width instead of 48% and the six columns are countable.
 * - The columns are thickened 1.35x (shaft 3.6 units: 6.1 diameters, Doric, not
 *   the real 8.6). The openings stay at true scale (5.65 m and 3.80 m become 8.6
 *   and 5.8), so the colonnade grows to 53.4 units and the void fraction drops
 *   from 66% to 60%.
 * The middle opening is also taller (19.0 against 14.1). The heads are the four
 * `HEAD_SIDE` blocks and the one `HEAD_MID`, in the wall plane at z = 5.8,
 * behind the column faces at 8.4; they are `brown`, one step darker than the
 * stone, so they read as wall and not as a hole.
 *
 * The quadriga is 7.9 of the 39.6 units (20%): four horses abreast facing +Z,
 * six meshes each (barrel, neck, head, fore group, hind group, tail), a
 * two-wheeled chariot and Victoria with her standard. Horses are low and broad
 * (barrel 2.55 on a 2.7 spacing, leg groups 1.15 wide with 1.55 of sky between)
 * so they read as one body on four sets of legs, not four standing men. Their
 * heads top out at 37.7 and Victoria's head starts at 38.4, so she is not a
 * fifth horse. The outer pair are yawed 0.12 rad outwards, the inner 0.04. The
 * wreath is a `ringWall` tipped vertical, with the staff the only `gold`.
 *
 * Mesh budget (100 of 110): base 4, transverse walls 6, shafts 12, capitals 12,
 * passage heads 5, entablature and attic 6, wings 20, quadriga 35; about 1,830
 * triangles. Left out: triglyphs, coffered soffits, entasis.
 *
 * Colour, all warm because the model is recesses: `cream` shafts, capitals,
 * attic and wing walls; `sand` entablature, cornices and attic cap; `tan`
 * steps and wing plinths; `brown` quadriga and the wall over each opening;
 * `gold` standard and wreath; `darkOlive` passage side walls, which turns the
 * passages into slots (in `tan` the colonnade read as one solid slab from the
 * quarter view). `bone` is not used.
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
 * Four abreast, 2.7 apart. The barrels are 2.55 wide and merge into one mass;
 * the leg groups are 1.15 wide and stay four. The outer pair are splayed so the
 * group fans.
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
    /** The wall over each opening: seen head-on, warm, one step below the stone. */
    const infill = palette.brown;
    /**
     * The side walls of the five passages, seen only at an angle. `darkOlive`
     * turns the passages into slots and puts the columns in front of shadow.
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

    // The base: two steps under the colonnade, a plinth under each wing.
    course(0, STEP, OUT_CORNICE + 0.6, plinth);
    course(STEP, STYLOBATE, OUT_CORNICE, plinth);
    for (const sx of SIDES) {
      place(box(WING_W + 0.8, STYLOBATE, WING_HALF_D * 2 + 3.0, plinth), sx * WING_X, 0, 0);
    }

    // The five passages: six transverse walls, and the heads that close four of
    // them early. The walls carry the columns.
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
    // Twelve Doric columns, two rows of six. Eight facets, which are the fluting
    // (the cel ramp draws two or three flutes across a shaft). The capital is a
    // four-sided flare from the neck to a square abacus, 1.11x the foot.
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

    // The entablature: architrave, plain frieze, cornice (no triglyphs).
    course(COLUMN_TOP, ARCHITRAVE_TOP, OUT_ARCHITRAVE, trim);
    course(ARCHITRAVE_TOP, FRIEZE_TOP, 0, trim);
    course(FRIEZE_TOP, CORNICE_TOP, OUT_CORNICE, trim);

    // The attic: set back off the cornice, carrying the inscription band, capped
    // by the plinth the quadriga stands on.
    course(CORNICE_TOP, ATTIC_TOP, -IN_ATTIC, stone);
    const atticHalfD = BLOCK_HALF_D - IN_ATTIC;
    place(box(38, 1.9, 0.5, trim), 0, CORNICE_TOP + 0.5, atticHalfD);
    course(ATTIC_TOP, CAP_TOP, -IN_ATTIC + OUT_CAP, trim);

    // The wings: half the gate's height, a quieter Doric rhythm in front of a
    // solid wall.
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
     * One horse, hooves at its own y = 0, facing +Z. Six meshes: hind group, fore
     * group, barrel, neck, head, tail. Low and broad on purpose.
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

    // The chariot and its two wheels. `column` stands on +Y, so a quarter turn
    // about Z lays a wheel on its axle; the prism then grows from its origin along
    // -X for a positive turn and +X for a negative one, hence the half-rim offset.
    place(box(4.2, 2.6, 3.0, bronze), 0, CAP_TOP + 1.0, CHARIOT_Z);
    place(box(4.6, 0.5, 3.4, bronze), 0, CAP_TOP + 3.6, CHARIOT_Z);
    for (const sx of SIDES) {
      const wheel = column(WHEEL_R, WHEEL_T, bronze, 10);
      wheel.rotation.z = sx * Math.PI / 2;
      wheel.position.set(sx * (WHEEL_X + WHEEL_T / 2), CAP_TOP + WHEEL_R, CHARIOT_Z);
      group.add(wheel);
    }

    // Victoria: a flared robe, a torso, a head, two wings, and the standard. Her
    // feet are on the chariot floor, above the horses' backs, so she clears them.
    place(taper(1.05, 0.62, 3.2, bronze, 6), 0, CAP_TOP + 1.5, VICTORIA_Z);
    place(box(1.5, 2.0, 1.0, bronze), 0, CAP_TOP + 4.7, VICTORIA_Z);
    place(box(0.75, 0.85, 0.75, bronze), 0, CAP_TOP + 6.7, VICTORIA_Z + 0.1);
    // Horse heads top out at 37.7 and her head starts at 38.4. The wings are
    // broad across X and thin through Z (the other way round they read as a spear).
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
