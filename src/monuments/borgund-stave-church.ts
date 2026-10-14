import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Borgund Stave Church — Lærdal, Norway.
 *
 * A building made of roofs: five stages, each a wall and a steeply pitched
 * shingled roof, with dragon heads on the corners and a spired turret.
 *
 *   ambulatory  1.0 -> 10.4   eave 15.9   the open gallery round the foot
 *   nave        1.0 -> 21.0   eave 12.4
 *   second     21.0 -> 28.4   eave  9.0
 *   clerestory 28.4 -> 33.2   eave  6.0
 *   turret     33.2 -> 39.6   eave  3.4
 *
 * Roofs are four-sided `taper`s (a flat face at +Z, corners on the diagonals,
 * where the dragons go). Each big roof is two courses, split at 40% of its
 * rise, so the ink reads it as shingled; the pitch breaks by about a degree.
 *
 * The building is nearly black, so it is laddered across three warm darks:
 * `bark` shingles, `darkOlive` ambulatory roof, `brown` staves, planking and
 * dragons. The only cool colour is the `slate` stone sill. Half-diagonal 23.2
 * over height 39.9 is 0.58, unstretched. No `realHeight`: the quoted figure is
 * for the turret.
 */

/** The stone sill the whole frame stands on. */
const SILL = 16.4;
const SILL_TOP = 1.0;

/** The ambulatory: its wall, its posts and its lean-to roof. */
const AMBULATORY = 14.8;
const AMBULATORY_TOP = 4.4;
const EAVE = 15.9;

export const borgundStaveChurch: Monument = {
  id: 'borgund-stave-church',
  name: 'Borgund Stave Church',
  iso: 'NOR',
  lat: 61.0472,
  lon: 7.8125,
  tier: 'building',
  footprint: 24,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, taper, strut, around } = ctx;

    const shingle = palette.bark; // pine tar, on every roof but one
    const skirt = palette.darkOlive; // the ambulatory's roof, so it separates
    const timber = palette.brown; // staves, planking, dragons
    const stone = palette.slate; // the sill, and the only thing here that is not wood
    const shade = palette.tan; // inside the gallery arcade: warm, because it never sees the sun

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

    /** A roof, laid in two shingle courses so the ink finds the middle of it. */
    const roof = (
      bottom: number,
      top: number,
      y0: number,
      y1: number,
      color: number,
      split = 0.42,
    ): void => {
      const rise = y1 - y0;
      const middle = bottom + (top - bottom) * split;
      const lower = taper(bottom, middle, rise * split, color, 4);
      lower.position.y = y0;
      group.add(lower);
      const upper = taper(middle, top, rise * (1 - split), color, 4);
      upper.position.y = y0 + rise * split;
      group.add(upper);
    };

    // -----------------------------------------------------------------------
    // 1. The sill: a low stone footing, so the timber does not grow from the grass.
    // -----------------------------------------------------------------------
    block(-SILL, SILL, 0, SILL_TOP, -SILL, SILL, stone);

    // -----------------------------------------------------------------------
    // 2. The ambulatory: a dark walled walk with an arcade of posts standing
    //    proud of it, open on the front and sides, closed at the back.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * AMBULATORY, side * EAVE, SILL_TOP, AMBULATORY_TOP, -EAVE, EAVE, shade);
      block(-EAVE, EAVE, SILL_TOP, AMBULATORY_TOP, side * AMBULATORY, side * EAVE, shade);
    }
    // The back is boarded to the eave; the other three sides are open above the
    // waist rail, which is the whole difference between a gallery and a wall.
    block(-EAVE, EAVE, AMBULATORY_TOP, 7.0, -EAVE, -AMBULATORY, timber);

    // Corner posts, then three more along the front and two down each side, each
    // `PROUD` out of the wall's face.
    const edge = EAVE - 0.72 + PROUD;
    const posts: [number, number][] = [
      [-edge, -edge],
      [edge, -edge],
      [-edge, edge],
      [edge, edge],
      [-8.4, edge],
      [0, edge],
      [8.4, edge],
      [-edge, -6.2],
      [-edge, 6.2],
      [edge, -6.2],
      [edge, 6.2],
    ];
    for (const [x, z] of posts) {
      block(x - 0.72, x + 0.72, SILL_TOP, 7.0, z - 0.72, z + 0.72, timber);
    }

    // The lean-to roof over the gallery. It is the widest thing in the model and
    // the only roof that is not `bark`.
    roof(EAVE, 11.8, 7.0, 10.4, skirt, 0.4);

    // -----------------------------------------------------------------------
    // 3. The nave. Its wall shows only between the gallery's eave and its own
    //    roof (the skirt hides everything under about 5.6 from 13.4 degrees).
    // -----------------------------------------------------------------------
    block(-11.0, 11.0, SILL_TOP, 14.6, -11.0, 11.0, timber);
    // Vertical staves standing proud of the wall: this is the construction the
    // building is named for, and four to a face is enough for the ink to say so.
    for (const at of [-7.2, -2.4, 2.4, 7.2]) {
      block(at - 0.6, at + 0.6, 9.6, 14.6, 11.0, 11.55, shingle);
      block(at - 0.6, at + 0.6, 9.6, 14.6, -11.55, -11.0, shingle);
      block(11.0, 11.55, 9.6, 14.6, at - 0.6, at + 0.6, shingle);
      block(-11.55, -11.0, 9.6, 14.6, at - 0.6, at + 0.6, shingle);
    }
    roof(12.4, 8.6, 14.6, 21.0, shingle);

    // -----------------------------------------------------------------------
    // 4. Second stage, clerestory, turret: a short wall and a steeper roof each,
    //    so the pile accelerates upward.
    // -----------------------------------------------------------------------
    block(-8.0, 8.0, 21.0, 23.6, -8.0, 8.0, timber);
    roof(9.0, 5.8, 23.6, 28.4, shingle);

    block(-5.2, 5.2, 28.4, 30.6, -5.2, 5.2, timber);
    // The clerestory openings: small dark quatrefoil lights, one to a face.
    for (const side of [-1, 1]) {
      block(-1.5, 1.5, 29.0, 30.2, side * 5.2, side * 5.55, shade);
      block(side * 5.2, side * 5.55, 29.0, 30.2, -1.5, 1.5, shade);
    }
    roof(6.0, 3.4, 30.6, 33.2, shingle);

    block(-2.9, 2.9, 33.2, 35.0, -2.9, 2.9, timber);
    for (const side of [-1, 1]) {
      block(-1.0, 1.0, 33.5, 34.7, side * 2.9, side * 3.2, shade);
      block(side * 2.9, side * 3.2, 33.5, 34.7, -1.0, 1.0, shade);
    }

    // The spire is one taper (a second course on a 4-unit cone reads as a fault),
    // 4.6 tall on a 6.8 base: a blunt cap reads as a hat.
    const spire = taper(3.4, 0.28, 4.6, shingle, 4);
    spire.position.y = 35.0;
    group.add(spire);
    const finial = box(0.34, 1.8, 0.34, timber);
    finial.position.y = 38.1;
    group.add(finial);
    const arm = box(1.5, 0.34, 0.34, timber);
    arm.position.set(0, 38.7, 0);
    group.add(arm);

    // -----------------------------------------------------------------------
    // 5. The dragons: eight, on the diagonals, sweeping up and out from the ridge
    //    ends of the nave and second-stage roofs. The pivot carries a rotation
    //    and no scale (T * R * S puts scale first).
    // -----------------------------------------------------------------------
    const dragons = new THREE.Group();
    dragons.rotation.y = Math.PI / 4;
    group.add(dragons);

    /** One beast: a neck off the corner, a head, and a jaw under it. */
    const dragon = (base: number, y0: number, reach: number, rise: number, size: number): Group => {
      const beast = new THREE.Group();
      const from = new THREE.Vector3(0, y0, base);
      const to = new THREE.Vector3(0, y0 + rise, base + reach);
      beast.add(strut(from, to, size * 0.62, timber));

      const head = box(size * 0.9, size * 0.8, size * 1.5, timber);
      head.position.set(0, to.y - size * 0.1, to.z + size * 0.5);
      beast.add(head);

      // The jaw, dropped and thrown forward. It is what stops a head reading as
      // the end of a stick.
      const jaw = box(size * 0.55, size * 0.42, size * 1.1, timber);
      jaw.position.set(0, to.y - size * 0.5, to.z + size * 0.95);
      beast.add(jaw);
      return beast;
    };

    // The four big ones, off the nave roof's corners.
    dragons.add(around(4, () => dragon(11.4, 15.4, 4.6, 5.4, 1.5)));
    // The four small ones, off the second stage.
    dragons.add(around(4, () => dragon(8.2, 24.2, 3.2, 3.8, 1.05)));

    // -----------------------------------------------------------------------
    // 6. The west door: a tall dark opening with a heavy frame under the gallery
    //    roof. The leaf stands `PROUD` clear of the front posts, which stand
    //    `PROUD` clear of the wall.
    // -----------------------------------------------------------------------
    block(-1.9, 1.9, SILL_TOP, 6.2, EAVE - 0.4, EAVE + 2 * PROUD, palette.bark);
    for (const side of [-1, 1]) {
      block(side * 1.9, side * 2.8, SILL_TOP, 7.0, EAVE - 0.2, EAVE + 0.45, timber);
    }
    block(-2.8, 2.8, 6.2, 7.0, EAVE - 0.2, EAVE + 0.45, timber);

    return group;
  },
};
