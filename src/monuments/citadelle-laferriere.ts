import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Citadelle Laferrière — Nord, Haiti.
 *
 * The largest fortress in the Americas, a ship's bow in masonry on a 900 m peak.
 * The prow is at the front and everything else steps down behind it (the reverse
 * of the real building): from 13.4 degrees a 35-unit prow hides a band about 147
 * deep, so the rear batteries are built wider, not taller.
 *
 * The prow is four courses of a three-sided `taper` yawed 60 degrees, which puts
 * the apex on +Z at twice the apothem (apothem 10 gives vertices (17.32, -10),
 * (-17.32, -10), (0, 20)). Each course steps in about a unit, the batter.
 *
 * Gunports: `around(3, ...)` inside a pivot yawed by the same 60 degrees puts
 * index 0 on the front-right face, 1 on the back and 2 on the front-left;
 * returning `null` for 1 spends every port on a face the camera sees. Two tiers
 * of five stand for the 365 cannon.
 *
 * 39.8 tall on a 30.9 half-diagonal (0.78), unstretched. No `realHeight`: the
 * quoted 40 m is one wall of a fortress that covers a hectare.
 */

/**
 * How much the prow is narrowed across its beam: a scale on a parent of the
 * rotated prism, not on the prism (see `build`).
 */
const PROW_BEAM = 0.62;

/** The mountain the fortress stands on, and the top of it. */
const PEAK = 26;
const PEAK_TOP = 4;

/**
 * The prow, as [top of the course, apothem]. Each course's apex stands at twice
 * its apothem on +Z: 22.0, 21.2, 20.4, 19.6 forward.
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
    // 1. The mountain: four units of rock, the least that says the walls are not
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
    // 2. The rear batteries: lower than the prow and wider, so they show past it
    //    from 13.4 degrees. They also centre the bounding box (without them it
    //    sits 5.5 units in front of the Y axis and `validate` rejects it).
    // -----------------------------------------------------------------------
    // The dressed stone starts where the old courses stop rather than running
    // down through them, so no two colours share a plane.
    block(-22, 22, 8.0, 17.0, -20, -6, wall);
    block(-22, 22, PEAK_TOP, 8.0, -20, -6, old);
    block(-22.8, 22.8, 17.0, 19.6, -20.8, -6, old);

    // The two shoulder bastions, running forward from the batteries along the
    // prow's flanks.
    for (const side of [-1, 1]) {
      block(side * 13, side * 21, 6.5, 14.5, -8, 6, wall);
      block(side * 13, side * 21, PEAK_TOP, 6.5, -8, 6, old);
      block(side * 13, side * 21.8, 14.5, 16.8, -8.8, 6.8, old);
      // A gun on each, on the terreplein: one barrel on one trunnion block.
      const barrel = taper(0.62, 0.42, 5.2, iron, 6);
      barrel.rotation.set(0, side * Math.PI * 0.5, side * 1.24);
      barrel.position.set(side * 17, 18.2, 1.0);
      group.add(barrel);
      const carriage = box(2.0, 1.4, 3.0, old);
      carriage.position.set(side * 17, 16.8, 1.0);
      group.add(carriage);
    }

    // -----------------------------------------------------------------------
    // 3. The prow: four battered courses of a three-sided taper, apex on +Z.
    // -----------------------------------------------------------------------
    //
    // The wedge is narrowed by a group. An equilateral 60-degree bow reads as a
    // box corner; squashing to 0.62 in x gives a 39-degree included angle. T * R
    // * S composes scale before rotation, so scale and rotation are split: the
    // parent carries the scale and no rotation, the child the rotation and no
    // scale, composing S * R and narrowing the wedge across its own beam. The
    // determinant stays positive.
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
    // 4. The embrasures, on the prism's own faces (see the header); `null` for
    //    the back face.
    // -----------------------------------------------------------------------
    const ports = new THREE.Group();
    ports.rotation.y = Math.PI / 3;
    wedge.add(ports);
    ports.add(
      around(3, (index) => {
        if (index === 1) return null;
        const face = new THREE.Group();
        // Every port runs toward the apex. For apothem 10 the apex sits at local
        // (-17.32, 10) in a face's own frame, so negative `along` is forward;
        // a symmetric row puts the rearmost ports inside the shoulder bastions.
        for (const [y, apothem] of [
          [11.5, 10.75],
          [22.0, 10.4],
        ] as const) {
          // The two faces mirror each other, so the apex is at negative `along` on
          // one and positive on the other: the sign flips per face.
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
    // 5. The gate. The real one is on the back wall, out of sight, so the sally
    //    port through the right-hand bastion (facing the path everyone walks up)
    //    is modelled instead.
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
