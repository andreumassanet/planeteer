import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Citadelle Laferrière — Nord, Haiti.
 *
 * **Why Haiti:** the Caribbean had nothing. Not one landmark between Mexico and
 * Brazil on the whole arc of islands — Cuba, Haiti, the Dominican Republic,
 * Jamaica, Puerto Rico, the Lesser Antilles — and the Citadelle is the largest
 * fortress in the Americas, built by Henri Christophe on a 900 m peak in the
 * fifteen years after the only successful slave revolt in history. It is also a
 * shape nothing else in the world's landmark list has: **a ship's bow in
 * masonry**, a hundred and thirty feet of battered wall running to a point.
 *
 * ---------------------------------------------------------------------------
 * The prow is at the front and everything else steps down behind it
 * ---------------------------------------------------------------------------
 *
 * That inverts the real building — the tallest part of the Citadelle is the
 * governor's quarters at the *back* — and it is the same inversion the Terracotta
 * Army had to make, for the same reason. The contact sheet's camera is 13.4
 * degrees up, so a 35-unit prow hides a band about 147 deep behind it: a keep at
 * the rear would be entirely gone whatever it cost. The prow is what every
 * photograph of the place is of, so the prow gets the height, and the rear
 * batteries are built **wider** rather than taller so they show past its flanks.
 *
 * The prow itself is four courses of a **three-sided `taper`** yawed 60 degrees,
 * which puts the apex on +Z. That is worth knowing because it is not obvious:
 * `contract.ts` rotates every prism by half a segment so a *face* points at the
 * front, and for a triangle another half-segment is what swaps the face for the
 * point. Measured off the built geometry rather than assumed — a 3-gon of
 * apothem 10 comes out with vertices at (17.32, -10), (-17.32, -10) and (0, 20),
 * so the apex stands at **twice the apothem** and the back face at minus one.
 *
 * The four courses each step in by about a unit, which is the batter. A battered
 * wall is the whole visual argument of this building — it is why it looks like it
 * grew out of the mountain — and four ink lines up it read as courses of dressed
 * stone rather than as a taper.
 *
 * ---------------------------------------------------------------------------
 * The gunports, and how they find the two faces that face you
 * ---------------------------------------------------------------------------
 *
 * `around(3, ...)` inside a pivot yawed by the same 60 degrees puts index 0 on
 * the front-right face, 1 on the back and 2 on the front-left — so returning
 * `null` for index 1 spends every port on a face the camera can see. The
 * Citadelle mounts 365 cannon and its walls are four tiers of embrasures; here
 * that is two tiers of five, which at 260 pixels is the same drawing.
 *
 * Proportion: 39.8 units tall on a 30.9 half-diagonal, 0.78 against the 2.0
 * cap, so nothing is stretched. No `realHeight` — the source list carries none,
 * and the number people quote (40 m) is one wall of a fortress that covers a
 * hectare.
 */

/**
 * How much the prow is narrowed across its beam. See the note in `build`: this
 * is a scale on a *parent* of the rotated prism, not on the prism.
 */
const PROW_BEAM = 0.62;

/** The mountain the fortress stands on, and the top of it. */
const PEAK = 26;
const PEAK_TOP = 4;

/**
 * The prow, as [top of the course, apothem]. The apex of each course stands at
 * twice its apothem on +Z, so the second column doubled is how far forward the
 * point reaches: 22.0, 21.2, 20.4, 19.6.
 */
const PROW: [top: number, apothem: number][] = [
  [12.5, 11.0],
  [21.0, 10.6],
  [28.6, 10.2],
  [33.0, 9.8],
];

export const citadelleLaferriere: Monument = {
  id: 'citadelle-laferriere',
  name: 'Citadelle Laferrière',
  iso: 'HTI',
  lat: 19.5744,
  lon: -72.2437,
  tier: 'building',
  footprint: 31,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, around } = ctx;

    const wall = palette.tan; // the dressed stone, which is grey-buff in life
    const old = palette.brown; // the lower courses and the parapets
    const port = palette.bark; // embrasures and the gate: warm dark, and in shade all day
    const peak = palette.slate; // the mountain, and the only cool colour here
    const scrub = palette.darkOlive; // what grows on it
    const iron = palette.steel; // the cannon

    const group = new THREE.Group();

    const block = (
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      color: number,
    ): Mesh => {
      const mesh = box(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), color);
      mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
      group.add(mesh);
      return mesh;
    };

    // -----------------------------------------------------------------------
    // 1. The mountain. Bonnet à l'Evêque is 900 m and the fortress is on top of
    //    it; four units of rock is the least that says the walls are not
    //    standing in a field.
    // -----------------------------------------------------------------------
    const rock = taper(PEAK, PEAK - 2.4, PEAK_TOP, peak, 6);
    group.add(rock);
    group.add(
      around(6, (index) => {
        if (index === 3) return null;
        const bush = taper(3.4, 1.6, 4.2, scrub, 5);
        bush.position.set(index % 2 === 0 ? 4.5 : -5.5, 1.4, 23.0);
        return bush;
      }),
    );

    // -----------------------------------------------------------------------
    // 2. The rear batteries. Lower than the prow and *wider* than it, which is
    //    the only way anything behind a 34-unit mass gets seen at all from 13.4
    //    degrees. They also give the model its depth: without them the bounding
    //    box sits 5.5 units in front of the Y axis and `validate` calls it
    //    off-centre, which it would be.
    // -----------------------------------------------------------------------
    // The dressed stone starts where the old courses stop rather than running
    // down through them: one box inside the other put their faces in one plane
    // in two colours, and they flickered.
    block(-22, 22, 8.0, 17.0, -20, -6, wall);
    block(-22, 22, PEAK_TOP, 8.0, -20, -6, old);
    block(-22.8, 22.8, 17.0, 19.6, -20.8, -6, old);

    // The two shoulder bastions, running forward from the batteries along the
    // prow's flanks.
    for (const side of [-1, 1]) {
      block(side * 13, side * 21, 6.5, 14.5, -8, 6, wall);
      block(side * 13, side * 21, PEAK_TOP, 6.5, -8, 6, old);
      block(side * 13, side * 21.8, 14.5, 16.8, -8.8, 6.8, old);
      // A gun on each, standing on the terreplein and pointing out over the
      // valley. Four boxes for a cannon is three more than it needs at this
      // size, so it is one barrel on one trunnion block.
      const barrel = taper(0.62, 0.42, 5.2, iron, 6);
      barrel.rotation.set(0, side * Math.PI * 0.5, side * 1.24);
      barrel.position.set(side * 17, 18.2, 1.0);
      group.add(barrel);
      const carriage = box(2.0, 1.4, 3.0, old);
      carriage.position.set(side * 17, 16.8, 1.0);
      group.add(carriage);
    }

    // -----------------------------------------------------------------------
    // 3. The prow. Four battered courses of a three-sided taper, apex on +Z.
    // -----------------------------------------------------------------------
    //
    // **The wedge is narrowed by a group, and which object carries which
    // transform is the whole of it.** A three-sided prism is equilateral, and a
    // 60-degree bow is not a bow — it renders as a corner of a box, which is
    // exactly what the first build did. Squashing it to 0.62 in x makes the
    // included angle 39 degrees, which reads.
    //
    // `T * R * S` composes scale *before* rotation, so putting both on the taper
    // would squash it along an axis 60 degrees off the one intended. Splitting
    // them — the **parent** carries the scale and no rotation, the **child**
    // carries the rotation and no scale — composes as `S * R` instead, which
    // narrows the wedge across its own beam. `validate` only forbids a transform
    // on the *root* group, and the determinant stays positive, so nothing here
    // trips the reflected-matrix trap either.
    const wedge = new THREE.Group();
    wedge.scale.x = PROW_BEAM;
    group.add(wedge);

    let base = PEAK_TOP;
    for (let i = 0; i < PROW.length; i++) {
      const [top, apothem] = PROW[i]!;
      const next = PROW[i + 1]?.[1] ?? apothem - 0.4;
      const course = taper(apothem, next, top - base, i === 0 ? old : wall, 3);
      course.rotation.y = Math.PI / 3;
      course.position.y = base;
      wedge.add(course);
      base = top;
    }
    // The parapet, a course proud of the wall it caps.
    const cap = taper(10.1, 9.9, 2.2, old, 3);
    cap.rotation.y = Math.PI / 3;
    cap.position.y = 33.0;
    wedge.add(cap);

    // -----------------------------------------------------------------------
    // 4. The embrasures. `around(3, ...)` inside a pivot yawed by the same 60
    //    degrees indexes the prism's own faces: 0 front-right, 1 back, 2
    //    front-left. Returning `null` for the back spends every port where the
    //    camera is.
    // -----------------------------------------------------------------------
    const ports = new THREE.Group();
    ports.rotation.y = Math.PI / 3;
    wedge.add(ports);
    ports.add(
      around(3, (index) => {
        if (index === 1) return null;
        const face = new THREE.Group();
        // **Every port runs toward the apex, and the sign is not a guess.**
        // Measured off the built prism: for apothem 10 the apex sits at local
        // (-17.32, 10) in a face's own frame, so negative `along` is forward. The
        // first build spread the row symmetrically and the two rearmost ports on
        // each face came out *inside the shoulder bastions* — `findFlaws` called
        // them buried, which is exactly what they were.
        for (const [y, apothem] of [
          [11.5, 10.75],
          [22.0, 10.4],
        ] as const) {
          // The two faces mirror each other, so the apex is at negative `along`
          // on one and positive on the other. Flipping the sign per face is the
          // whole fix; taking one sign for both put the left-hand row inside the
          // left bastion, which is the same bug measured twice.
          const toward = index === 0 ? -1 : 1;
          for (let i = 0; i < 5; i++) {
            const along = toward * (2.0 + i * 3.3);
            const hole = box(1.5, 2.1, 1.2, port);
            hole.position.set(along, y, apothem - 0.3);
            face.add(hole);
          }
        }
        return face;
      }),
    );

    // -----------------------------------------------------------------------
    // 5. The gate. It is on the back wall in life and it is on the back wall
    //    here, where the camera cannot see it — so the one that *is* modelled is
    //    the sally port through the right-hand bastion, which faces the path
    //    everyone walks up.
    // -----------------------------------------------------------------------
    block(21, 21.5, PEAK_TOP, 11.0, -3.0, 0.4, port);
    block(21, 22.2, 11.0, 12.6, -3.6, 1.0, old);
    // Steps up to it, cut into the rock.
    for (let i = 0; i < 4; i++) {
      block(21.2, 25.4 + i * 0.6, PEAK_TOP - (i + 1) * 1.0, PEAK_TOP - i * 1.0, -3.4, 0.8, peak);
    }

    // A flagstaff on the prow. Haiti's fortress flew the first flag of a free
    // black republic and it is the one vertical in a model of horizontals.
    const staff = column(0.32, 4.6, old, 6);
    staff.position.set(0, 35.2, 13.0);
    group.add(staff);

    return group;
  },
};
