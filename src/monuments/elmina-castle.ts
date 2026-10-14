import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Elmina Castle — São Jorge da Mina, Central Region, Ghana.
 *
 * A Portuguese sea fort of 1482 on a rock between the lagoon and the Atlantic:
 * lime-wash on horizontals (one long parapet line, round drums at the seaward
 * corners, red pantile roofs over the wall, dark rock below), the opposite of
 * the grey battered `citadelle-laferriere.ts`. The tallest thing is a flagstaff.
 *
 * The ground there is already pale sand, close to `sand`, so the fort is
 * separated from the beach by the `clay` roofs, the `bark` gunports and sea gate
 * and the `darkOlive` rock, not by its white. `sand` is not used; the warm grey-
 * buff `tan` takes plinths, copings and string course.
 *
 * Nothing behind the sea wall can be seen: at 13.4 degrees a rim of height `h`
 * hides about `4h` of depth. Anything at depth `d` behind the parapet (19.4) must
 * stand above `19.4 + 0.238 d`:
 *   centre pavilion roof   ridge 26.4 at d = 10.3   needs 21.9
 *   left wing roof         ridge 24.2 at d = 10.0   needs 21.8
 *   right wing roof        ridge 23.8 at d = 10.0   needs 21.8
 *   landward range roof    ridge 22.5 at d = 31.0   needs 26.8   hidden
 * So the seaward range is pulled against the back of the sea curtain with a
 * raised centre pavilion; the landward roof is one 12-triangle mesh (for the
 * air); the courtyard holds one token chapel (two meshes). The rear is wider,
 * not taller: the landward block reaches x = 25 and its bastions 29, past the
 * seaward front's 21.
 *
 * Flush faces get no ink, so every horizontal on the sea front is separated in
 * depth: wall face z = 19.0, parapet 19.5, plinth 19.6, cordon 19.7, sea battery
 * 20.0, gate surround 20.4, gate 20.6.
 *
 * The rock is modelled (it is half of every photograph): `darkOlive` over `bark`,
 * two battered oblong courses (the oblong comes from a parent group carrying the
 * scale) with eight crags breaking the rim. The sea is not: an opaque `skyBlue`
 * disc would be inked into a ring. Instead the `bark` wave-cut lower course and
 * two outlying rocks seaward say where the water is.
 *
 * Cropped to the main quadrangle and four bastions (about 100 m by 90 m of 180 m)
 * and stretched 2.5x on the vertical: 58.8 units across the landward front, wall
 * 16.0 from rock to parapet. The seaward drums are widened to a 6.4 apothem (12.8
 * across, 14.1 tall) and capped with an open `ringWall` gun platform 3 units
 * proud, so each ends as a ring. Radius 42.2 over height 26.8 is 1.57; the fort
 * alone reaches 34. 1,488 triangles, 83 meshes. No `realHeight`: the curtain is
 * about 11 m and the bastions higher.
 */

// ---------------------------------------------------------------------------
// Levels. Every white thing is measured from the rock; these four numbers are
// the fort's whole section.
// ---------------------------------------------------------------------------

/** Top of the rock shelf: the datum the fort stands on. */
const ROCK = 3.4;
/** Top of the `tan` plinth course under the lime-wash. */
const FOOT = 6.2;
/** The wall-walk — top of the curtain, underside of its parapet. */
const WALK = 17.0;
/** Top of the seaward parapet, and the rim every roof behind it has to clear. */
const PARAPET = 19.4;

/**
 * The crags, as [x, z, apothem at the foot, at the top, height, wet]. Written out
 * because a regular ring of rocks is a crown, not a coast. `wet` picks the darker
 * `bark` for the ones the sea reaches. The last two stand off the shelf in front
 * of the sea gate and say where the water is.
 */
const CRAGS: [x: number, z: number, foot: number, top: number, height: number, wet: boolean][] = [
  [-30.0, 6.0, 3.4, 1.4, 5.2, false],
  [28.0, -14.0, 2.8, 1.0, 4.4, true],
  [-24.0, -20.0, 3.0, 1.2, 4.8, false],
  [14.0, 21.5, 2.4, 0.9, 4.0, true],
  [-11.0, 27.5, 2.6, 0.8, 4.6, true],
  [19.0, 25.0, 2.0, 0.6, 3.4, false],
  [-32.0, -12.0, 2.6, 1.0, 4.2, true],
  [31.0, 9.0, 3.0, 1.1, 4.6, false],
];

export const elminaCastle: Monument = {
  id: 'elmina-castle',
  name: 'Elmina Castle',
  iso: 'GHA',
  lat: 5.0847,
  lon: -1.3494,
  tier: 'building',
  // Set by the rock shelf's corners at 42.2. The fort alone reaches 34.
  footprint: 43,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, ringWall } = ctx;

    const lime = palette.white; // 0xfff2e8, a warm white: this is lime-wash, not marble
    const stone = palette.tan; // plinths, copings, the cordon — a step down from the lime
    const tile = palette.clay; // the pantile roofs, and the only strong hue here
    const dark = palette.bark; // gunports, the sea gate, the wave-cut rock
    const reef = palette.darkOlive; // the shelf the fort stands on
    const iron = palette.steel; // two guns, and nothing else

    const group = new THREE.Group();

    /** A block given by its two opposite corners, which is how a fort is drawn. */
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

    /**
     * One oblong battered course of the rock. A four-sided `taper` is square, so
     * the oblong comes from a parent group carrying the stretch (same idiom as
     * the roofs below).
     */
    const shelf = (
      foot: number,
      top: number,
      height: number,
      y: number,
      stretch: number,
      color: number,
    ): void => {
      const wrap = new THREE.Group();
      wrap.add(taper(foot, top, height, color, 4));
      wrap.scale.x = stretch;
      wrap.position.y = y;
      group.add(wrap);
    };

    /**
     * A pitched roof: eaves at `eaves`, ridge `rise` above them, ridge along X. A
     * three-sided `column` on its side is the cheapest gable (12 triangles) but
     * fixed at 60 degrees, and a pantile roof is nearer 43, so the mesh carries
     * the scale and the pivot the yaw. After the quarter turn about X: local x is
     * world x, local y is the run, local z is the height spanning -1 to +2, hence
     * `scale.set(_, 1, _)`.
     */
    const roof = (
      cx: number,
      cz: number,
      length: number,
      halfWidth: number,
      eaves: number,
      rise: number,
      color: number,
    ): void => {
      const prism = column(1, length, color, 3);
      prism.scale.set(halfWidth / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);

      const pivot = new THREE.Group();
      pivot.add(prism);
      pivot.rotation.y = Math.PI / 2; // the ridge runs along X
      pivot.position.set(cx, eaves, cz);
      group.add(pivot);
    };

    // -----------------------------------------------------------------------
    // 1. The rock: two oblong battered courses (the lower `bark`, the wave-cut
    //    foot; the upper `darkOlive`) and six crags above them.
    // -----------------------------------------------------------------------
    shelf(24.5, 23.0, 1.2, 0, 1.4, dark);
    shelf(23.0, 21.0, 2.2, 1.2, 1.4, reef);

    for (const [x, z, foot, top, height, wet] of CRAGS) {
      const crag = taper(foot, top, height, wet ? dark : reef, 5);
      crag.position.set(x, 0, z);
      group.add(crag);
    }

    // The landing in front of the sea gate, one step down. It reaches z = 24.5,
    // past the shelf's 23, so it reads as the shelf breaking down to the water.
    block(-6.0, 6.0, 2.4, ROCK, 20.4, 24.5, reef);

    // -----------------------------------------------------------------------
    // 2. The sea front: six planes in one colour (separated by depth).
    // -----------------------------------------------------------------------
    block(-21.0, 21.0, ROCK, FOOT, 15.2, 19.6, stone); // plinth, 0.6 proud
    block(-21.0, 21.0, FOOT, WALK, 15.5, 19.0, lime); // the curtain
    block(-21.2, 21.2, 16.5, 17.3, 15.3, 19.7, stone); // the cordon, proudest of the wall
    block(-21.4, 21.4, 17.3, PARAPET, 15.2, 19.5, lime); // the parapet

    // Gunports: one row, grouped away from the centre (one repeating feature on
    // this face). The row stops at 13.0: the drums reach in to x = 14.8, and the
    // outer pair were sealed inside them.
    for (const x of [-13.0, -8.5, 8.5, 13.0]) {
      block(x - 0.9, x + 0.9, 10.4, 13.0, 19.0, 19.55, dark);
    }

    // -----------------------------------------------------------------------
    // 3. The sea battery, 1.5 in front of the curtain and lower than it, so both
    //    the 16.8 rim and the parapet at 19.4 show.
    // -----------------------------------------------------------------------
    block(-8.0, 8.0, ROCK, 15.0, 18.5, 20.0, lime);
    block(-8.4, 8.4, 15.0, 16.8, 18.2, 20.3, lime);
    for (const x of [-6.8, -3.4, 0, 3.4, 6.8]) {
      block(x - 0.9, x + 0.9, 16.8, 18.4, 18.4, 20.1, lime);
    }

    // The Door of No Return: small, at the water, at the centre of the front with a
    // `tan` surround that gives it two ink lines.
    block(-3.0, 3.0, ROCK, 9.6, 19.9, 20.4, stone);
    block(-1.9, 1.9, ROCK, 8.4, 20.2, 20.6, dark);
    // One step down from the sill onto the ledge (a flight would stand in front of
    // the door). Its tread stands `PROUD` over the ledge.
    block(-3.4, 3.4, 2.9, ROCK + PROUD, 20.6, 22.2, stone);

    // -----------------------------------------------------------------------
    // 4. The flanks, and the landward block, wider than the front so it shows
    //    behind the 19.4 rim.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * 17.5, side * 21.4, ROCK, FOOT, -5.4, 19.6, stone);
      block(side * 17.5, side * 21.0, FOOT, WALK, -5.0, 19.0, lime);
      // The cordon carries round the corner, which is the line the quarter view
      // reads the fort by: one horizontal running the whole way round at 16.5.
      block(side * 17.3, side * 21.2, 16.5, 17.3, -5.2, 19.6, stone);
      block(side * 17.3, side * 21.4, 17.3, PARAPET, -5.2, 19.5, lime);
      // Two ports per flank, clear of the drums' z 6.8..20.2.
      for (const z of [0.0, 4.6]) {
        block(side * 21.0, side * 21.55, 10.4, 13.0, z - 0.9, z + 0.9, dark);
      }
    }

    block(-25.4, 25.4, ROCK, FOOT, -18.4, -4.6, stone);
    block(-25.0, 25.0, FOOT, 18.0, -18.0, -5.0, lime);
    block(-25.4, 25.4, 18.0, 20.4, -18.4, -4.6, lime);
    // The landward range's roof: one mesh, hidden from both fixed cameras (it
    // would need 26.7 and stands at 22.5), here for the flyover and the courtyard.
    roof(0, -11.5, 49.0, 6.4, 18.0, 4.5, tile);

    // The two landward bastions, square, projecting sideways to x = 29 so their
    // flanks clear the sea front's 21.
    for (const side of [-1, 1]) {
      block(side * 24.6, side * 29.0, ROCK, 17.0, -17.0, -8.0, lime);
      block(side * 24.4, side * 29.4, 17.0, 19.2, -17.4, -7.6, lime);
      // Merlons, only here: the seaward parapet stays one line (a solid parapet with
      // embrasures), since anything on it raises the rim the roofs must clear.
      // These two copings are the widest things at x = 29, past the front's 21.
      for (const z of [-15.4, -12.5, -9.6]) {
        block(side * 24.6, side * 29.2, 19.2, 20.8, z - 0.9, z + 0.9, lime);
      }
    }

    // -----------------------------------------------------------------------
    // 5. The seaward drums, ten sides (a chord of 4.2 units at a 6.4 apothem reads
    //    as coursing). The open `ringWall` on top finishes each as a horizontal
    //    ring 3 units clear of the shaft, a gun platform and not a tower.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      const cx = side * 21.5;
      const cz = 13.5;

      const flare = taper(7.0, 6.4, 2.0, stone, 10);
      flare.position.set(cx, ROCK, cz);
      group.add(flare);

      const drum = column(6.4, 14.1, lime, 10);
      drum.position.set(cx, 5.4, cz);
      group.add(drum);

      // `PROUD` short of the drum's top: flush, the cordon's top and the
      // drum's shared a plane under the platform's hole and flickered.
      const cordon = column(6.7, 0.8 - PROUD, stone, 10);
      cordon.position.set(cx, 18.7, cz);
      group.add(cordon);

      const platform = ringWall(5.9, 7.0, 3.0, lime, 10);
      platform.position.set(cx, 19.5, cz);
      group.add(platform);

      // A gun on the drum's top face at 19.5, pointing out to sea (a quarter turn
      // of `rotation.x` puts the column's axis on +Z; 0.16 less is the elevation).
      const carriage = box(1.6, 1.0, 2.4, dark);
      carriage.position.set(cx, 19.5, cz + 1.6);
      group.add(carriage);

      const barrel = taper(0.46, 0.3, 4.2, iron, 6);
      barrel.rotation.x = Math.PI / 2 - 0.16;
      barrel.position.set(cx, 20.4, cz + 1.2);
      group.add(barrel);

      // A guerite, the corbelled sentry box: on the parapet ring at radius 6.5 from
      // the drum's centre (at 5.7 it sat over the hole).
      const gx = cx + side * 5.13;
      const gz = cz + 3.99;
      const shaftBox = column(1.15, 2.2, lime, 8);
      shaftBox.position.set(gx, 22.5, gz);
      group.add(shaftBox);
      const cap = taper(1.35, 0.12, 1.5, stone, 8);
      cap.position.set(gx, 24.7, gz);
      group.add(cap);
    }

    // The flagstaff, on the left-hand platform. Elmina flew four flags in five
    // hundred years and it is the one vertical in a model of horizontals.
    const staff = column(0.3, 4.3, dark, 6);
    staff.position.set(-21.5, 22.5, 13.5);
    group.add(staff);

    // -----------------------------------------------------------------------
    // 6. The seaward range, the governor's quarters, against the back of the sea
    //    curtain: three blocks at three depths and two heights (a raised centre
    //    between two wings), since a single run of pantile is a tent.
    // -----------------------------------------------------------------------
    block(-8.0, 8.0, ROCK, 20.5, 3.0, 15.4, lime);
    block(-8.4, 8.4, 19.8, 20.5, 2.8, 15.6, stone);
    roof(0, 9.2, 16.8, 6.4, 20.5, 5.9, tile); // ridge 26.4, pitch 43 degrees

    for (const [x0, x1, eaves, rise] of [
      [-19.0, -8.0, 19.4, 4.8],
      [8.0, 19.0, 19.0, 4.8],
    ] as const) {
      block(x0, x1, ROCK, eaves, 4.2, 14.8, lime);
      block(x0 - 0.4, x1 + 0.4, eaves - 0.7, eaves, 4.0, 15.0, stone);
      roof((x0 + x1) / 2, 9.5, x1 - x0 + 0.8, 5.6, eaves, rise, tile);
    }

    // -----------------------------------------------------------------------
    // 7. The chapel in the courtyard: two meshes, invisible from both fixed
    //    cameras (it would need 29.4 and stands at 21.6), here for the player.
    // -----------------------------------------------------------------------
    block(-5.6, 5.6, ROCK, 17.0, -3.8, 3.4, lime);
    roof(0, -0.2, 10.4, 3.4, 17.0, 4.6, tile);

    return group;
  },
};
