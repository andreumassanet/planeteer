import type { Mesh, Monument } from './contract.ts';

/**
 * Petra: Al-Khazneh, the Treasury.
 *
 * The Treasury is a facade quarried out of a cliff, so the cliff is in the model
 * (most of it by volume) and four things make the facade read as cut into it.
 * The recess is a negative space, never a subtraction: a back slab, two jambs
 * and an overhanging brow are four solids arranged around a rectangle of rock
 * that is never built, and the same trick gives the portico its three doorways
 * and each upper wing its niche. The whole facade lives behind the cliff's front
 * plane (7 units back at the portico columns, never less than 5), so the jambs
 * and brow crop it from every angle but dead-on. The facade is 2 units narrower
 * than its slot, so a sliver of each jamb's inner face shows. Nothing is built
 * behind it: the tympanum, the gaps beside the tholos and the backs of the
 * doorways are the cliff's own back slab, one tone darker.
 *
 * Colour: three tones of one rose used as three weathers of one rock: `clay`
 * for the weathered cliff, `salmon` for the cut face, `blush` (the palest) for
 * the tholos. `crimson` would look painted, `sand` and `tan` read Egyptian,
 * `orange` and `apricot` are too hot. `bark` is the dark of the chambers.
 *
 * At 64 px the eye should get, in order: the round tholos with its cone and urn
 * between two flat wings, the broken pediment splitting either side, six
 * columns below in one wide portico and four above in two pairs, and the frame
 * of raw rock. The facade is 104 units tall and 68 wide (1.53; the real 39 m by
 * 25 m), unstretched. The cliff is cropped to a frame: 16 units of brow above
 * the urn and 9 of jamb down each side. No `realHeight`: Petra is a city.
 */

// --- the rock ---
/** Half-width of the cliff face, and the model's widest point. */
const CLIFF_HALF = 44;
const CLIFF_TOP = 120;
/** Half-width of the slot quarried into it, 1 unit wider than the facade on each side. */
const RECESS_HALF = 35;
/** Where the brow closes over the top of the recess. */
const RECESS_TOP = 106;
/** The face of the rock the façade was cut back to. */
const BACK = -14;
const SLAB_BACK = -18;
/** The plane the untouched rock presents to the Siq; everything carved is behind it. */
const CLIFF_FRONT = 10;
const JAMB = CLIFF_HALF - RECESS_HALF;

// --- the façade ---
const HALF = 34;
/** Tip of the urn. The rock goes on above it. */
const FACADE_TOP = 104;
const STYLOBATE = 5;

// --- lower order: podium, six columns, entablature, full pediment ---
const L_SHAFT = 8;
const L_CAP = 39;
const L_ARCHITRAVE = 43.5;
const L_CORNICE = 47;
const L_TOP = 50;
const PEDIMENT_RISE = 10.5;
/** Six columns, the central bay widened over the great door. */
const LOWER_COLUMNS = [-31, -19, -7, 7, 19, 31];
const COLUMN_Z = 1;

// --- upper order: two wings, the tholos in the gap, the pediment broken over it ---
const U_FLOOR = 56;
const U_SHAFT = 58.5;
const U_CAP = 76;
const U_ENTABLATURE = 80;
const U_TOP = 83.5;
/** Inner and outer edges of a wing. The tholos lives in ±WING_IN. */
const WING_IN = 17;
const WING_COLUMNS = [21.5, 30.5];
const UPPER_COLUMN_Z = -6;
const THOLOS_Z = -4.5;
const THOLOS_R = 11;
/** Cella wall inside the peristyle, and the ring the columns stand on. */
const THOLOS_DRUM = 7.6;
const THOLOS_PERISTYLE = 9.8;

export const petra: Monument = {
  id: 'petra',
  name: 'Petra',
  iso: 'JOR',
  lat: 30.329,
  lon: 35.444,
  tier: 'landmark',
  surface: 'none',
  footprint: 48,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut, around } = ctx;

    const rock = palette.clay; // weathered cliff
    const carved = palette.salmon; // the cut face
    const sunlit = palette.blush; // the tholos, highest and most exposed
    const shadow = palette.bark; // the chambers behind the doorways

    const group = new THREE.Group();
    const place = (mesh: Mesh, x: number, y: number, z: number) => {
      mesh.position.set(x, y, z);
      group.add(mesh);
    };
    /** A block spanning `z0..z1` rather than a depth about a centre: the whole file thinks in planes. */
    const slab = (
      width: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      color: number,
      x = 0,
    ) => place(box(width, y1 - y0, z1 - z0, color), x, y0, (z0 + z1) / 2);

    // --- 1. The cliff: four masses, and the recess is what they leave between them ---

    // The rock the facade was cut back to; also the backdrop for the tholos and the fill behind every opening.
    slab(CLIFF_HALF * 2, 0, CLIFF_TOP, SLAB_BACK, BACK, rock);

    for (const side of [-1, 1]) {
      const x = side * (RECESS_HALF + JAMB / 2);
      // Three courses to a jamb, each presenting a different plane to the front, so the face is stepped, not milled flat.
      slab(JAMB, 0, 46, BACK, CLIFF_FRONT, rock, x);
      slab(JAMB, 46, 82, BACK, CLIFF_FRONT - 3, rock, x);
      // The top course is 2.5 units narrower on the outside only, so the silhouette steps in as it rises.
      slab(JAMB - 2.5, 82, RECESS_TOP, BACK, CLIFF_FRONT + 1, rock, x - side * 1.25);

      // A boulder at the foot, so the jamb does not end on a clean corner.
      const boulder = taper(5, 3, 18, rock, 6);
      boulder.rotation.y = side * 0.35;
      place(boulder, side * 37.5, 0, 8.5);
    }

    // The brow overhangs further than anything below it, so the facade does not read as a building with sky above it.
    slab(84, RECESS_TOP, 116, BACK, CLIFF_FRONT + 2, rock);
    slab(38, 114, CLIFF_TOP, BACK, CLIFF_FRONT - 2, rock, -21);
    slab(42, 115, CLIFF_TOP, BACK, CLIFF_FRONT, rock, 19);

    // --- 2. The floor of the quarried court, and the stylobate the portico stands on ---
    slab(RECESS_HALF * 2, 0, 2, BACK, CLIFF_FRONT, rock);
    slab(HALF * 2, 2, STYLOBATE, BACK, 2, carved);
    slab(60, 2, 3.5, 2, 5, carved); // the step down to the court

    // --- 3. The portico wall: four piers and three lintels, and the three
    // doorways are the gaps. The great door is 16 units wide and reaches 33; the side doors stop at 26. ---
    // -----------------------------------------------------------------------
    const WALL_FRONT = -8;
    const wall = (x: number, width: number, y0: number, y1: number) =>
      slab(width, y0, y1, BACK, WALL_FRONT, carved, x);
    for (const side of [-1, 1]) {
      wall(side * 31, 6, STYLOBATE, L_TOP); // outer pier, x 28..34
      wall(side * 13.5, 11, STYLOBATE, L_TOP); // inner pier, x 8..19
      wall(side * 23.5, 9, 26, L_TOP); // over a side door, x 19..28
    }
    wall(0, 16, 33, L_TOP); // over the great door

    // The chamber the doors open onto: one dark plane is all the doorways show.
    slab(62, STYLOBATE, 35, BACK, BACK + 1, shadow);

    // --- 4. The lower portico: six columns, wide ---
    for (const x of LOWER_COLUMNS) {
      place(taper(3, 2.4, L_SHAFT - STYLOBATE, carved, 8), x, STYLOBATE, COLUMN_Z);
      place(column(2.2, L_CAP - L_SHAFT, carved, 8), x, L_SHAFT, COLUMN_Z);
      // Corinthian: the capital flares, which separates a column from a post.
      place(taper(2.2, 3.4, L_ARCHITRAVE - L_CAP, carved, 8), x, L_CAP, COLUMN_Z);
    }

    // Architrave and cornice run the full width into the jambs, tying the portico back into the rock.
    slab(HALF * 2, L_ARCHITRAVE, L_CORNICE, BACK, 4, carved);
    slab(HALF * 2, L_CORNICE, L_TOP, BACK, 5, carved);

    /**
     * A pediment. `taper(a, a, depth, colour, 3)` is an equilateral prism about
     * Y; a quarter turn about X lays it along Z with a flat bottom and its point
     * up. That is a 60-degree gable, so the wrapper's Y scale squashes it to the
     * rise asked for (only the monument's own `Group` must keep an identity
     * transform). The prism's flats sit at the apothem `a` and its apex at `2a`.
     */
    const pediment = (span: number, rise: number, z0: number, z1: number, y0: number) => {
      const a = span / (2 * Math.sqrt(3));
      const gable = taper(a, a, z1 - z0, carved, 3);
      gable.rotation.x = Math.PI / 2;
      const wrap = new THREE.Group();
      wrap.add(gable);
      wrap.scale.y = rise / (3 * a);
      wrap.position.set(0, y0 + rise / 3, z0);
      group.add(wrap);
    };
    // Rise 10.5 on a span of 68 is a 17-degree rake; the broken pediment above repeats it.
    pediment(HALF * 2, PEDIMENT_RISE, -3, 5, L_TOP);

    // --- 5. The upper order: set back 7 units, so the lower pediment overlaps its base ---
    // -----------------------------------------------------------------------
    slab(HALF * 2, L_TOP, U_FLOOR, BACK, -4, carved);

    for (const side of [-1, 1]) {
      // A wing: pier, pier, lintel. The niche between them is the cliff.
      slab(6, L_TOP, U_TOP, BACK, -9, carved, side * 20);
      slab(5, L_TOP, U_TOP, BACK, -9, carved, side * 31.5);
      slab(6, U_CAP, U_TOP, BACK, -9, carved, side * 26);

      for (const cx of WING_COLUMNS) {
        const x = side * cx;
        place(taper(2.3, 1.9, U_SHAFT - U_FLOOR, carved, 8), x, U_FLOOR, UPPER_COLUMN_Z);
        place(column(1.7, U_CAP - U_SHAFT, carved, 8), x, U_SHAFT, UPPER_COLUMN_Z);
        place(taper(1.7, 2.6, U_ENTABLATURE - U_CAP, carved, 8), x, U_CAP, UPPER_COLUMN_Z);
      }

      slab(HALF - WING_IN, U_ENTABLATURE, U_TOP, BACK, -3, carved, (side * (WING_IN + HALF)) / 2);

      // The broken pediment: each half rakes up from the jamb and stops at the
      // tholos (a beam for the raking cornice and a block for the break). The
      // tympanum is the cliff's own back slab, a tone darker.
      const at = (x: number, y: number) => new THREE.Vector3(x, y, -5);
      group.add(strut(at(side * HALF, U_TOP), at(side * WING_IN, U_TOP + 5.5), 3.4, carved));
      slab(3.4, U_TOP + 0.5, U_TOP + 7.5, -8.5, -2.5, carved, side * (WING_IN + 1.7));
    }

    // --- 6. The tholos: the one circular thing between two flat wings ---
    const DRUM = U_FLOOR + 3; // the tholos stands on a round plinth of its own
    place(column(THOLOS_R, DRUM - U_FLOOR, sunlit, 16), 0, U_FLOOR, THOLOS_Z);
    place(column(THOLOS_DRUM, U_ENTABLATURE - DRUM, sunlit, 16), 0, DRUM, THOLOS_Z);

    // Five columns, not eight: the back three never face the Siq. Index 0 is the +Z front.
    const peristyle = around(8, (index) => {
      if (index >= 3 && index <= 5) return null;
      const shaft = column(1.7, U_ENTABLATURE - DRUM, sunlit, 8);
      shaft.position.z = THOLOS_PERISTYLE;
      return shaft;
    });
    peristyle.position.set(0, DRUM, THOLOS_Z);
    group.add(peristyle);

    // Its cornice lines up with the wings' entablature, so the upper storey sits on one line.
    place(column(THOLOS_R, U_TOP - U_ENTABLATURE, sunlit, 16), 0, U_ENTABLATURE, THOLOS_Z);
    place(taper(THOLOS_R, 1.6, 96 - U_TOP, sunlit, 16), 0, U_TOP, THOLOS_Z);

    // The urn: pedestal, bowl, finial; the top of the silhouette.
    place(column(1.7, 2, sunlit, 8), 0, 96, THOLOS_Z);
    place(taper(1.2, 3, 4, sunlit, 8), 0, 98, THOLOS_Z);
    place(taper(3, 0.8, FACADE_TOP - 102, sunlit, 8), 0, 102, THOLOS_Z);

    return group;
  },
};
