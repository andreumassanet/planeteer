import type { Mesh, Monument } from './contract.ts';

/**
 * Petra — Al-Khazneh, the Treasury.
 *
 * **The Treasury is not a building. It is a façade quarried out of a cliff**,
 * and that is the whole problem this file had to solve. Every helper in the
 * contract makes a solid that stands free, so the obvious model — six columns, a
 * tholos, a broken pediment — comes out as a stage flat: a Hellenistic temple
 * front standing in the open air with sky behind it. It is wrong in a way that
 * is hard to name and impossible to unsee once you have.
 *
 * So the cliff is in the model, and by volume it is most of the model. Four
 * things make the façade read as *cut into* it rather than stuck onto it:
 *
 * 1. **The recess is a negative space, never a subtraction.** Nothing in the
 *    contract can cut a hole in a solid, so the hole is simply never built: a
 *    back slab, two jambs and an overhanging brow are four solids arranged
 *    *around* a rectangle of rock that does not exist. The same trick, smaller,
 *    gives the portico its three doorways and each upper wing its niche — a
 *    pier, a pier and a lintel, and the gap they leave is the opening. Every
 *    void in this model is a void by arrangement.
 * 2. **The whole façade lives behind the cliff's front plane** — 7 units back at
 *    the portico columns and never less than 5 anywhere, cornices included. The
 *    jambs and the brow crop it from every angle except dead-on,
 *    which is exactly what the Siq does to the real one. A thing glued *onto* a
 *    cliff projects in front of the rock; this one cannot, at any camera angle.
 * 3. **The façade is 2 units narrower than the slot it stands in**, so a sliver
 *    of each jamb's inner face shows down the sides. That reveal is the tell of
 *    a cut face rather than a butt joint.
 * 4. **Nothing was added behind it, because there is nothing behind it but
 *    rock.** The tympanum under each half of the broken pediment, the gaps
 *    flanking the tholos, the backs of the doorways: all of it is the cliff's
 *    own back slab showing through, one tone darker. Modelling a wall back there
 *    would have been modelling a building.
 *
 * **Colour.** `ctx.palette` has an unusual amount of rose in it, which is lucky,
 * because Petra's sandstone is banded and no single swatch is honest. `crimson`
 * is out — "the rose-red city" is Burgon's line, not the rock's colour, and at
 * cel-shaded saturation it would look painted. `sand` and `tan` are the wrong
 * side of the wheel and read Egyptian. `orange` and `apricot` are too hot. What
 * is left is three tones of one rose, used as three weathers of one rock:
 * `clay` for the weathered cliff, `salmon` for the cut face, `blush` — the
 * palest — for the tholos, which stands highest and clear of the pediment's
 * shadow, and which needs every bit of separation it can get at thumbnail size.
 * `bark` is the dark of the chambers behind the doorways.
 *
 * **What has to survive at 64 px**, in the order the eye should get it: the
 * round tholos with its cone and urn, sitting in the gap between two flat wings;
 * the broken pediment splitting either side of it; six columns below in one wide
 * portico, four above in two pairs; and the frame of raw rock around all of it.
 *
 * **Proportion.** The façade is 104 units tall and 68 wide, a ratio of 1.53
 * against the real building's 39 m by 25 m — true proportions, no stretch. The
 * *cliff* is the crop: the Siq wall here rises well over twice the Treasury's
 * height and closes in on both sides, and modelling that would bury the façade
 * in a canyon. Only the frame is kept — 16 units of brow above the urn and 9 of
 * jamb down each side, the least rock that still reads as a mountainside.
 *
 * No `realHeight`: the source list asserts none for Petra, and Petra is a city,
 * not a height. The commonly quoted 39 m belongs to Al-Khazneh alone.
 */

// --- the rock ---
/** Half-width of the cliff face, and the model's widest point. */
const CLIFF_HALF = 44;
const CLIFF_TOP = 120;
/** Half-width of the slot quarried into it. 1 unit wider than the façade on each side. */
const RECESS_HALF = 35;
/** Where the brow closes over the top of the recess. */
const RECESS_TOP = 106;
/** The face of the rock the façade was cut back to. */
const BACK = -14;
const SLAB_BACK = -18;
/** The plane the untouched rock presents to the Siq. Everything carved is behind it. */
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
    /** A block spanning `z0..z1` rather than a depth about a centre — the whole file thinks in planes. */
    const slab = (
      width: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      color: number,
      x = 0,
    ) => place(box(width, y1 - y0, z1 - z0, color), x, y0, (z0 + z1) / 2);

    // -----------------------------------------------------------------------
    // 1. The cliff. Four masses, and the recess is what they leave between them.
    // -----------------------------------------------------------------------

    // The rock the façade was cut back to. It is also the backdrop the tholos is
    // seen against and the fill behind every opening in the model.
    slab(CLIFF_HALF * 2, 0, CLIFF_TOP, SLAB_BACK, BACK, rock);

    for (const side of [-1, 1]) {
      const x = side * (RECESS_HALF + JAMB / 2);
      // Three courses to a jamb, each presenting a different plane to the front,
      // so the cliff face is stepped instead of milled flat. A single box here
      // reads as a picture frame, which is the other way to get this wrong.
      slab(JAMB, 0, 46, BACK, CLIFF_FRONT, rock, x);
      slab(JAMB, 46, 82, BACK, CLIFF_FRONT - 3, rock, x);
      // The top course is 2.5 units narrower on the *outside* only, so the
      // silhouette steps in as it rises. Two vertical edges of full height turn
      // the whole cliff into a wardrobe with a hole in it.
      slab(JAMB - 2.5, 82, RECESS_TOP, BACK, CLIFF_FRONT + 1, rock, x - side * 1.25);

      // A boulder at the foot, so the jamb does not end on a clean corner.
      const boulder = taper(5, 3, 18, rock, 6);
      boulder.rotation.y = side * 0.35;
      place(boulder, side * 37.5, 0, 8.5);
    }

    // The brow. It overhangs further than anything below it — rock does — and it
    // is what stops the façade reading as a building with sky above it.
    slab(84, RECESS_TOP, 116, BACK, CLIFF_FRONT + 2, rock);
    slab(38, 114, CLIFF_TOP, BACK, CLIFF_FRONT - 2, rock, -21);
    slab(42, 115, CLIFF_TOP, BACK, CLIFF_FRONT, rock, 19);

    // -----------------------------------------------------------------------
    // 2. The floor of the quarried court, and the stylobate the portico stands on.
    // -----------------------------------------------------------------------
    slab(RECESS_HALF * 2, 0, 2, BACK, CLIFF_FRONT, rock);
    slab(HALF * 2, 2, STYLOBATE, BACK, 2, carved);
    slab(60, 2, 3.5, 2, 5, carved); // the step down to the court

    // -----------------------------------------------------------------------
    // 3. The portico wall: four piers and three lintels, and the three doorways
    //    are the gaps left over. The great door is 16 units wide and reaches 33;
    //    the two side doors stop at 26.
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

    // The chamber the doors open onto, six units deep behind the wall face. One
    // dark plane is all three doorways will ever show, and it is the only place
    // in the model where the interior is anything but rock.
    slab(62, STYLOBATE, 35, BACK, BACK + 1, shadow);

    // -----------------------------------------------------------------------
    // 4. The lower portico: six columns, wide.
    // -----------------------------------------------------------------------
    for (const x of LOWER_COLUMNS) {
      place(taper(3, 2.4, L_SHAFT - STYLOBATE, carved, 8), x, STYLOBATE, COLUMN_Z);
      place(column(2.2, L_CAP - L_SHAFT, carved, 8), x, L_SHAFT, COLUMN_Z);
      // Corinthian: the capital flares. It is the only thing at this size that
      // separates a column from a post.
      place(taper(2.2, 3.4, L_ARCHITRAVE - L_CAP, carved, 8), x, L_CAP, COLUMN_Z);
    }

    // Architrave and cornice run the full width into the jambs on both sides, so
    // the portico ties back into the rock instead of stopping in mid-air.
    slab(HALF * 2, L_ARCHITRAVE, L_CORNICE, BACK, 4, carved);
    slab(HALF * 2, L_CORNICE, L_TOP, BACK, 5, carved);

    /**
     * A pediment.
     *
     * `taper(a, a, depth, colour, 3)` is an equilateral prism about Y; a quarter
     * turn about X lays it along Z with a flat bottom and its point up, which is
     * a gable — but an equilateral one, at 60°, and no pediment was ever built
     * at 60°. A regular prism has no other triangle to give, so the wrapper's Y
     * scale squashes it to the rise asked for. Scaling a child group is fine;
     * only the monument's own `Group` has to keep an identity transform.
     *
     * The prism's flats sit at the apothem `a` and its apex at `2a`, so the
     * natural gable is `3a` tall on a base of `2a*sqrt(3)`.
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
    // Rise 10.5 on a span of 68: a 17° rake, and the broken pediment above
    // repeats it so the two orders read as one design.
    pediment(HALF * 2, PEDIMENT_RISE, -3, 5, L_TOP);

    // -----------------------------------------------------------------------
    // 5. The upper order. Set back 7 units from the lower one, which is what
    //    lets the lower pediment stand in front of it and overlap its base.
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

      // The broken pediment. Each half rakes up from the jamb and stops dead at
      // the tholos: a beam for the raking cornice and a block for the break. The
      // tympanum underneath is deliberately not modelled — it is the cliff's own
      // back slab, a tone darker, which is what a carved tympanum in shadow is.
      const at = (x: number, y: number) => new THREE.Vector3(x, y, -5);
      group.add(strut(at(side * HALF, U_TOP), at(side * WING_IN, U_TOP + 5.5), 3.4, carved));
      slab(3.4, U_TOP + 0.5, U_TOP + 7.5, -8.5, -2.5, carved, side * (WING_IN + 1.7));
    }

    // -----------------------------------------------------------------------
    // 6. The tholos. The one circular thing between two flat wings, and the
    //    reason anyone can name this façade from across a valley.
    // -----------------------------------------------------------------------
    const DRUM = U_FLOOR + 3; // the tholos stands on a round plinth of its own
    place(column(THOLOS_R, DRUM - U_FLOOR, sunlit, 16), 0, U_FLOOR, THOLOS_Z);
    place(column(THOLOS_DRUM, U_ENTABLATURE - DRUM, sunlit, 16), 0, DRUM, THOLOS_Z);

    // Five columns, not eight: the back three never face the Siq, and `around`
    // takes a null to leave them out. Index 0 is the +Z front.
    const peristyle = around(8, (index) => {
      if (index >= 3 && index <= 5) return null;
      const shaft = column(1.7, U_ENTABLATURE - DRUM, sunlit, 8);
      shaft.position.z = THOLOS_PERISTYLE;
      return shaft;
    });
    peristyle.position.set(0, DRUM, THOLOS_Z);
    group.add(peristyle);

    // Its cornice lines up with the wings' entablature, so the three parts of
    // the upper storey sit on one line and the gaps read as gaps.
    place(column(THOLOS_R, U_TOP - U_ENTABLATURE, sunlit, 16), 0, U_ENTABLATURE, THOLOS_Z);
    place(taper(THOLOS_R, 1.6, 96 - U_TOP, sunlit, 16), 0, U_TOP, THOLOS_Z);

    // The urn: pedestal, bowl, finial. Small, but it is the top of the
    // silhouette and it is what the whole legend of the Treasury is about.
    place(column(1.7, 2, sunlit, 8), 0, 96, THOLOS_Z);
    place(taper(1.2, 3, 4, sunlit, 8), 0, 98, THOLOS_Z);
    place(taper(3, 0.8, FACADE_TOP - 102, sunlit, 8), 0, 102, THOLOS_Z);

    return group;
  },
};
