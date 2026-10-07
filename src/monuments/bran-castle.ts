import type { Monument, Mesh } from './contract.ts';

/**
 * Bran Castle, Romania.
 *
 * A fortress the Saxons of Brașov raised in 1377-1388 over the pass between
 * Wallachia and Transylvania, on a crag at the mouth of the valley. Its read is
 * the opposite of Malbork's: **small, tall and white, on a rock**. The walls
 * rise straight out of the outcrop, the plan is a knot of towers of different
 * shapes — square, round, five-sided — and every one of them wears a steep red
 * roof, so the silhouette is a cluster of red points over a white mass over
 * brown stone.
 *
 * What has to survive at thumbnail size, in the order the eye finds it:
 *
 * - **The rock.** Half the model's height. Two stacked prisms of different
 *   side counts and yaws, three spurs at the foot, in two browns and a tan, so
 *   it reads as a crag and not as a plinth.
 * - **The keep**, the tallest point: a square white tower to 31 under a steep
 *   pyramid roof to 39.8, at the back so the lower towers step down in front.
 * - **The round tower** on the front-right corner, under a conical roof, and
 *   **the five-sided tower** on the east flank, under a five-sided spire. They
 *   are the two shapes no other castle among the monuments has together.
 * - **Steep hipped roofs** over the wings, at four different eaves heights, so
 *   no two lines of red tile meet at one level.
 * - **Small windows**, few and scattered, a bartizan on the west wing's front
 *   corner and two dormers. Bran has plain walls; the rhythm is the roofs'.
 * - **A few firs** round the foot of the rock, because the castle stands in a
 *   wood on every photograph of it and a bare crag reads as a quarry.
 *
 * ## Colour
 *
 * `white` walls, a tone of it for the corbel bands, `red` toned to 0.85 for the
 * tile, `bark` for the windows. The rock is `brown` in two tones with `tan`
 * spurs; the firs are `green` in two tones on `bark` trunks. No ground plate:
 * the biome comes up to the rock (*Monuments* in the traps).
 *
 * ## Departures, in numbers
 *
 * - **The rock is taller than life against the castle.** The real crag lifts
 *   the walls a few tens of metres over the road and the castle is about as
 *   tall again; here the rock is 13 units under a 27-unit castle, near the
 *   real ratio, and the whole is stretched to fill the tier's 40.
 * - **The courtyard is solid**, roofed at the lowest eaves, for the reason the
 *   other castles give: an open court from the quarter view is a ruin.
 * - **Merged by colour** (`ctx.merge`).
 */

/** Where the castle's walls start: inside the lower rock, under the upper. */
const WALL_FOOT = 6.6;
/** The keep's shaft top, and the tier ceiling at its spire. */
const KEEP_TOP = 31;

export const branCastle: Monument = {
  id: 'bran-castle',
  name: 'Bran Castle',
  iso: 'ROU',
  lat: 45.5149,
  lon: 25.3672,
  tier: 'building',
  footprint: 25,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper } = ctx;

    const wall = palette.white;
    const band = tone(palette.white, 0.86);
    const roof = tone(palette.red, 0.85);
    const glass = palette.bark;
    const rock = palette.brown;
    const rockDark = tone(palette.brown, 0.86);
    const spur = palette.tan;
    const fir = tone(palette.green, 0.78);
    const firLight = palette.green;

    const draft = new THREE.Group();

    const put = (mesh: Mesh, x: number, y: number, z: number, yaw = 0): Mesh => {
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      draft.add(mesh);
      return mesh;
    };

    /**
     * A hipped roof over a rectangle: a four-sided frustum scaled on X and Z.
     * The mesh carries a scale and no rotation, so nothing composes wrongly.
     */
    const hip = (x: number, z: number, halfX: number, halfZ: number, eaves: number, rise: number): void => {
      const mesh = taper(1, 0.12, rise, roof, 4);
      mesh.scale.set(halfX, 1, halfZ);
      put(mesh, x, eaves, z);
    };

    /** A window 0.25 proud of a wall facing ±Z (`facing` 'z') or ±X. */
    const pane = (x: number, y: number, z: number, facing: 'x' | 'z', height = 1.6): void => {
      put(facing === 'z' ? box(1.0, height, 0.5, glass) : box(0.5, height, 1.0, glass), x, y, z);
    };

    // -----------------------------------------------------------------------
    // The rock. The lower prism's top is the castle's first floor; the upper
    // one rises through the walls, so they come out of the stone at
    // different heights round the plan.
    // -----------------------------------------------------------------------
    put(taper(19, 14.5, 7, rock, 7), 0, 0, 0, 0.2);
    put(taper(13.5, 11, 6.2, rockDark, 6), 0.6, 7, -0.8, 0.7);
    put(taper(7, 3.5, 9.5, spur, 5), -11.5, 0, 5.5, 0.4);
    put(taper(6, 2.8, 8, tone(palette.tan, 0.9), 5), 10.5, 0, 8.5, 1.1);
    put(taper(8, 4.5, 10.5, rockDark, 6), -6, 0, -12, 0.3);

    // -----------------------------------------------------------------------
    // The keep, at the back.
    // -----------------------------------------------------------------------
    const KX = -4.5;
    const KZ = -5;
    put(box(7, KEEP_TOP - WALL_FOOT, 7, wall), KX, WALL_FOOT, KZ);
    put(box(7.6, 0.8, 7.6, band), KX, KEEP_TOP, KZ);
    put(taper(4.2, 0, 8, roof, 4), KX, KEEP_TOP + 0.8, KZ); // apex 39.8
    for (const y of [22, 26.5]) {
      pane(KX, y, KZ + 3.5, 'z');
      pane(KX - 3.5, y, KZ, 'x');
    }
    pane(KX + 1.6, 28.6, KZ + 3.5, 'z', 1.2);

    // -----------------------------------------------------------------------
    // The west wing, x -9.5..-2.5, z -3..10, and its bartizan.
    // -----------------------------------------------------------------------
    const W_EAVES = 24;
    put(box(7, W_EAVES - WALL_FOOT, 13, wall), -6, WALL_FOOT, 3.5);
    put(box(7.6, 0.6, 13.6, band), -6, W_EAVES - 0.8, 3.5);
    hip(-6, 3.5, 4.2, 7.2, W_EAVES, 6.5); // ridge 30.5
    for (const y of [14.5, 18.5]) pane(-6, y, 10, 'z');
    pane(-7.6, 21.2, 10, 'z', 1.3);
    for (const z of [0, 4, 8]) pane(-9.5, 19, z, 'x');
    // Dormer on the west slope.
    put(box(1.6, 1.8, 1.6, wall), -9.2, W_EAVES + 0.3, 2);
    put(taper(1.2, 0, 1.5, roof, 4), -9.2, W_EAVES + 2.1, 2);
    // Bartizan hung on the front-west corner.
    put(taper(0.35, 1.2, 2.2, band, 8), -9.5, 17.6, 10);
    put(column(1.2, 5.2, wall, 8), -9.5, 19.8, 10);
    put(taper(1.45, 0, 3.6, roof, 8), -9.5, 25, 10);

    // -----------------------------------------------------------------------
    // The north wing, x -4..8, z -10..-4.
    // -----------------------------------------------------------------------
    const N_EAVES = 22;
    put(box(12, N_EAVES - WALL_FOOT, 6, wall), 2, WALL_FOOT, -7);
    hip(2, -7, 6.6, 3.6, N_EAVES, 5.5);
    for (const x of [0, 4.5]) pane(x, 18, -10, 'z');

    // -----------------------------------------------------------------------
    // The courtyard block, roofed at the lowest eaves of the plan.
    // -----------------------------------------------------------------------
    const C_EAVES = 20;
    put(box(9, C_EAVES - WALL_FOOT, 10, wall), 1.5, WALL_FOOT, 0);
    hip(1.5, 0, 5, 5.4, C_EAVES, 4);

    // -----------------------------------------------------------------------
    // The south front wing, x -4.5..5.5, z 5..10, and a dormer.
    // -----------------------------------------------------------------------
    const S_EAVES = 18.6;
    put(box(10, S_EAVES - WALL_FOOT, 5, wall), 0.5, WALL_FOOT, 7.5);
    put(box(10.6, 0.6, 5.6, band), 0.5, S_EAVES - 0.8, 7.5);
    hip(0.5, 7.5, 5.6, 3.1, S_EAVES, 4.6);
    for (const x of [-2.2, 1, 3.8]) pane(x, 15.2, 10, 'z');
    pane(-0.6, 11.4, 10, 'z', 2.0);
    put(box(1.6, 1.6, 1.4, wall), 0.5, S_EAVES + 0.4, 9.2);
    put(taper(1.2, 0, 1.4, roof, 4), 0.5, S_EAVES + 2.0, 9.2);

    // -----------------------------------------------------------------------
    // The five-sided tower on the east flank.
    // -----------------------------------------------------------------------
    const EX = 8.5;
    const EZ = -2;
    const E_TOP = 27;
    put(column(2.9, E_TOP - WALL_FOOT, wall, 5), EX, WALL_FOOT, EZ);
    put(column(3.25, 0.7, band, 5), EX, E_TOP - 0.3, EZ);
    put(taper(3.4, 0, 6.5, roof, 5), EX, E_TOP + 0.4, EZ); // apex 33.9
    pane(EX, 20.5, EZ + 2.9, 'z');
    pane(EX, 15, EZ + 2.9, 'z', 1.3);

    // -----------------------------------------------------------------------
    // The round tower on the front-east corner.
    // -----------------------------------------------------------------------
    const RX = 6.5;
    const RZ = 6.5;
    const R_TOP = 25;
    put(column(3.4, R_TOP - 0.4 - WALL_FOOT, wall, 12), RX, WALL_FOOT, RZ);
    put(column(3.75, 0.7, band, 12), RX, R_TOP - 0.7, RZ);
    put(taper(4.0, 0, 7.5, roof, 12), RX, R_TOP, RZ); // apex 32.5
    for (const y of [12.5, 17, 21.2]) pane(RX, y, RZ + 3.4, 'z', y > 20 ? 1.2 : 1.6);

    // -----------------------------------------------------------------------
    // Firs round the foot of the rock, front and flanks.
    // -----------------------------------------------------------------------
    const firs: [number, number, number][] = [
      // x, z, scale
      [-19, 11.5, 1.0],
      [-21.2, 1.5, 0.85],
      [17.5, 13, 0.95],
      [21, 2.5, 1.05],
      [-5, 21, 0.9],
      [4, 21.2, 1.0],
      [15, -15, 0.9],
    ];
    for (const [x, z, s] of firs) {
      put(column(0.35 * s, 1.4 * s, glass, 4), x, 0, z);
      put(taper(1.9 * s, 0.25 * s, 3.4 * s, fir, 7), x, 1.2 * s, z);
      put(taper(1.35 * s, 0, 3.0 * s, firLight, 7), x, 3.9 * s, z);
    }

    return ctx.merge(draft);
  },
};
