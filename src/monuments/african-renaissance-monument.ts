import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * African Renaissance Monument — Dakar, Senegal.
 *
 * **Why Senegal:** West Africa's Atlantic coast had Elmina and nothing north
 * of it before Morocco. On the higher of the two Mamelles hills over the
 * Cap-Vert peninsula stands a bronze family 49 m tall, unveiled in 2010 for the
 * fiftieth anniversary of independence: the tallest statue in Africa, and the
 * one thing on the skyline of Dakar you can see from the sea.
 *
 * ---------------------------------------------------------------------------
 * The front is the group's profile, as for the Genghis Khan statue
 * ---------------------------------------------------------------------------
 *
 * The figures stride towards the Atlantic, and seen head-on a striding group
 * is a column. So they walk along +X — `placement.ts` turns +X to west, which
 * is where the real child points, out to sea — and the contract's +Z front is
 * their side. The woman is on the near (+Z) side, the man's right, and the
 * child is held up on his far (left) arm, so from the front all three read.
 *
 * ---------------------------------------------------------------------------
 * What has to survive at 260 pixels
 * ---------------------------------------------------------------------------
 *
 * **The diagonal.** The man stands upright and strides; the woman beside him
 * is swept along at a slant, her head at his shoulder and her feet trailing
 * far behind, her free arm flung back and her dress streaming; the child,
 * seated on the man's raised hand above his head, points forward. Read as one
 * mass it is a wedge leaning into the wind with a finger at its tip, and that
 * wedge is the monument. Everything is struts placed by their endpoints, so
 * every limb is exactly the line it is in the bronze.
 *
 * **The hill.** Like Christ the Redeemer, this is a figure on a summit, not on
 * a block, and the hill is how it reads from Dakar: a dry volcanic knoll with
 * two spurs, scrub and a couple of baobabs, a pale terrace on the top, the pedestal (a
 * building with exhibition halls inside) and the long straight stair up the
 * landward side. The stair is ten flights for the real 198 steps, each a
 * block bedded in the slope, so its edge is a staircase in silhouette.
 *
 * **The bronze.** There is no bronze in the palette. `clay` taken down to
 * 0.78 is a dark warm copper, and every part the sun turns away from or that
 * is cloth — the man's trousers, the woman's dress and hair — is `clay` at
 * 0.6, a material split rather than shading (the same split the Genghis Khan
 * statue makes between lit steel and `slate`).
 *
 * ---------------------------------------------------------------------------
 * Proportion
 * ---------------------------------------------------------------------------
 *
 * Tier `tower`, 70 units. 0 to 17 is the hill, 17 to 18.4 the terrace, 18.4
 * to 23.4 the pedestal and 23.4 to 69.5 the statue: 46 units for its 49 m,
 * so a metre of bronze is 0.94 units and the figure is at true proportion.
 * The real hill is about 100 m high, which at that rate would be 95 units on
 * its own; 17 is enough to make it a summit and keeps the statue at two
 * thirds of the model. The man's head is at 57, the child's at 67.5 and his
 * pointing hand the top of the model, as in the bronze.
 *
 * The plan is kept small on purpose — a hill 38 across — because the site is
 * on a narrow peninsula and a landmark is moved inland until its plan is on
 * dry land. Half-diagonal 20.2 against 69.5 is 0.29, well inside the 2.0 cap.
 */

/** The hill: three frusta, each stepped in half a unit, with different side counts so no facets line up. */
const HILL = [
  { bottom: 19, top: 15, base: 0, height: 6, sides: 9 },
  { bottom: 14.5, top: 11, base: 6, height: 6, sides: 8 },
  { bottom: 10.5, top: 8.5, base: 12, height: 5, sides: 7 },
];
const SUMMIT = 17;
const TERRACE = 8.6;
const TERRACE_TOP = SUMMIT + 1.4;
const PEDESTAL_TOP = TERRACE_TOP + 5;

/**
 * The stair, up the landward (-X) slope: flight k's front edge and its top.
 * Ten flights from the foot of the hill to the terrace, each block running
 * back under the next and its bottom `STEP_DEPTH` down, which is under the
 * slope at every flight (checked against the three frusta's profiles).
 */
const FLIGHTS = 10;
const FLIGHT_RUN = 1.15;
const FLIGHT_RISE = TERRACE_TOP / FLIGHTS;
const STAIR_FOOT = -20;
const STAIR_HEAD = -7;
const STAIR_WIDTH = 4.4;
const STEP_DEPTH = 5;

/**
 * Scrub on the slopes, as [angle in degrees from +Z, radius, base]. None on the
 * stair's side. Each base is half a unit under the slope, and no top lands on
 * 6.0, the first frustum's ledge: a bush's top there was two colours in one plane.
 */
const SCRUB: [number, number, number][] = [
  [10, 16, 3.9],
  [52, 16.2, 3.7],
  [98, 16, 3.9],
  [125, 16.4, 3.4],
  [184, 16, 3.9],
  [336, 16.2, 3.7],
  [28, 12.6, 8.8],
  [118, 12.6, 8.8],
  [166, 12.4, 9.1],
  [352, 12.6, 8.8],
];

/** Two baobabs at the foot, as [angle, radius, base]. A fat trunk under a flat crown is a baobab. */
const BAOBABS: [number, number, number][] = [
  [70, 17, 2.5],
  [205, 16.8, 2.7],
];

export const africanRenaissanceMonument: Monument = {
  id: 'african-renaissance-monument',
  name: 'African Renaissance Monument',
  iso: 'SEN',
  lat: 14.7222,
  lon: -17.495,
  realHeight: 49,
  tier: 'tower',
  footprint: 21,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, box, column, taper, strut } = ctx;

    const bronze = tone(palette.clay, 0.78);
    const cloth = tone(palette.clay, 0.6);
    const ground = [palette.tan, tone(palette.tan, 0.9), tone(palette.brown, 1.05)];
    const shoulder = tone(palette.tan, 0.84);
    const basalt = tone(palette.bark, 1.2);
    const scrub = [palette.darkOlive, tone(palette.darkOlive, 1.18)];
    const trunk = tone(palette.brown, 0.85);
    const paving = palette.bone;
    const pedestal = palette.white;
    const trim = tone(palette.white, 0.9);
    const dark = palette.bark;

    const group = new THREE.Group();
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const at = (degrees: number, radius: number): [number, number] => {
      const a = (degrees * Math.PI) / 180;
      return [radius * Math.sin(a), radius * Math.cos(a)];
    };
    const place = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };
    const limb = (from: [number, number, number], to: [number, number, number], thickness: number, color: number): void => {
      group.add(strut(V(...from), V(...to), thickness, color));
    };

    // -----------------------------------------------------------------------
    // 1. The hill, its two spurs, rock, scrub and baobabs.
    // -----------------------------------------------------------------------
    HILL.forEach((frustum, index) => {
      place(taper(frustum.bottom, frustum.top, frustum.height, ground[index]!, frustum.sides), 0, frustum.base, 0);
    });
    // Two spurs pushing out of the lower slope, so the hill is a knoll and
    // not a turned cone. Tall enough to stand out of it: the slope is already
    // 6 units up where they stand.
    for (const [degrees, radius, height] of [
      [24, 14.5, 8.5],
      [150, 14.5, 7.5],
    ] as const) {
      const [x, z] = at(degrees, radius);
      place(taper(5, 2, height, shoulder, 6), x, 0, z);
    }
    // Basalt breaking through the grass: the Mamelles are old volcanoes.
    for (const [degrees, radius, base] of [
      [110, 14, 6.3],
      [32, 11, 11.5],
    ] as const) {
      const [x, z] = at(degrees, radius);
      place(taper(2.6, 1.2, 3.0, basalt, 5), x, base, z);
    }
    SCRUB.forEach(([degrees, radius, base], index) => {
      const [x, z] = at(degrees, radius);
      place(taper(1.5, 1.0, 2.0, scrub[index % 2]!, 5), x, base, z);
    });
    for (const [degrees, radius, base] of BAOBABS) {
      const [x, z] = at(degrees, radius);
      place(column(1.0, 3.2, trunk, 6), x, base, z);
      place(taper(2.4, 1.6, 1.2, scrub[0]!, 6), x, base + 3.2, z);
    }

    // -----------------------------------------------------------------------
    // 2. The terrace, the stair and the pedestal.
    // -----------------------------------------------------------------------
    place(column(TERRACE, TERRACE_TOP - SUMMIT, paving, 8), 0, SUMMIT, 0);

    for (let k = 0; k < FLIGHTS; k++) {
      const front = STAIR_FOOT + k * FLIGHT_RUN;
      const top = (k + 1) * FLIGHT_RISE;
      const bottom = Math.max(0, top - STEP_DEPTH);
      // The last flight's top is the terrace's top, in the same colour, so
      // the two are one floor and not two faces fighting.
      place(box(STAIR_HEAD - front, top - bottom, STAIR_WIDTH, paving), (front + STAIR_HEAD) / 2, bottom, 0);
    }

    // The pedestal: a building, its door at the head of the stair, a band of
    // windows down its side and a band round it at mid-height. The figures'
    // feet and the trailing dress are all on its top, which is why it is long.
    place(box(14, PEDESTAL_TOP - TERRACE_TOP, 8, pedestal), -0.5, TERRACE_TOP, 0);
    place(box(14.6, 0.8, 8.6, trim), -0.5, TERRACE_TOP + 2.6, 0);
    // Both openings stand clear of the wall by more than `PROUD`.
    place(box(0.3, 2.2, 3.0, dark), -7.5 - 0.15 + PROUD / 2, TERRACE_TOP, 0);
    place(box(9, 0.9, 0.3, dark), -0.5, TERRACE_TOP + 0.9, 4 + 0.15 - PROUD / 2);

    const P = PEDESTAL_TOP;

    // -----------------------------------------------------------------------
    // 3. The man, walking along +X. Right side (+Z) towards the viewer.
    // -----------------------------------------------------------------------
    // Legs: the right leg forward, the left back, a long stride.
    limb([0.6, P + 15, 1.6], [2.8, P + 7.8, 1.6], 2.6, bronze);
    limb([2.8, P + 7.8, 1.6], [3.6, P + 0.8, 1.6], 2.0, bronze);
    limb([-0.6, P + 15, -1.6], [-2.2, P + 7.6, -1.6], 2.6, bronze);
    limb([-2.2, P + 7.6, -1.6], [-4.0, P + 1.0, -1.6], 2.0, bronze);
    place(box(3.4, 1.0, 1.8, bronze), 4.4, P, 1.6);
    place(box(3.2, 1.0, 1.8, bronze), -4.2, P, -1.6);

    // Trousers to the hip, then a bare torso leaning into the stride, and a
    // broader mass over it for the shoulders.
    place(box(4.6, 4.4, 6.4, cloth), 0, P + 13.2, 0);
    const lean = -0.12;
    const torso = box(4.2, 8.5, 6.6, bronze);
    torso.rotation.z = lean;
    place(torso, 0.2, P + 17.4, 0);
    const chest = box(4.8, 3.6, 9.2, bronze);
    chest.rotation.z = lean;
    place(chest, 1.25, P + 25.4, 0);
    place(column(1.1, 1.6, bronze, 6), 1.8, P + 28.8, 0);
    place(box(3.0, 3.6, 2.8, bronze), 2.0, P + 30.2, 0);
    // The brow and nose, looking ahead and a little up.
    place(box(0.7, 0.8, 0.8, bronze), 3.75, P + 31.6, 0);
    place(box(2.6, 0.6, 2.4, cloth), 1.9, P + 33.8 - PROUD, 0);

    // Left arm (-Z), raised, the hand under the child.
    limb([2.0, P + 28.1, -4.4], [4.0, P + 31.6, -4.8], 2.0, bronze);
    limb([4.0, P + 31.6, -4.8], [3.8, P + 36.0, -3.8], 1.7, bronze);
    place(box(2.0, 1.2, 2.0, bronze), 3.8, P + 35.6, -3.8);
    // Right arm (+Z), down round the woman's back.
    limb([1.0, P + 28.1, 4.0], [-0.4, P + 22.6, 4.4], 1.9, bronze);
    limb([-0.4, P + 22.6, 4.4], [-3.6, P + 19.0, 6.4], 1.6, bronze);

    // -----------------------------------------------------------------------
    // 4. The child, seated on the man's hand, pointing forward and up.
    // -----------------------------------------------------------------------
    const childTorso = box(2.6, 4.6, 2.6, bronze);
    childTorso.rotation.z = -0.15;
    place(childTorso, 3.6, P + 36.8, -3.6);
    place(box(2.4, 2.6, 2.4, bronze), 4.3, P + 41.5, -3.6);
    limb([3.2, P + 37.2, -3.6], [5.2, P + 35.0, -3.0], 1.2, bronze);
    limb([4.2, P + 40.4, -3.0], [8.4, P + 45.6, -3.2], 0.9, bronze);
    limb([3.4, P + 40.2, -4.6], [1.8, P + 37.8, -5.0], 0.8, bronze);

    // -----------------------------------------------------------------------
    // 5. The woman, on the near side, swept along at a slant: head at the
    //    man's shoulder, feet far behind, one arm flung back.
    // -----------------------------------------------------------------------
    limb([-3.4, P + 16.6, 5.8], [-1.4, P + 22.4, 6.0], 3.2, bronze);
    place(column(0.8, 1.0, bronze, 6), -1.2, P + 22.6, 6.4);
    place(box(2.4, 2.6, 2.3, bronze), -1.0, P + 23.4, 6.6);
    // Hair streaming back off the head.
    limb([-1.4, P + 25.4, 6.6], [-4.4, P + 24.4, 6.6], 1.5, cloth);
    // The dress from the waist, streaming back past her feet.
    limb([-3.2, P + 17.4, 5.8], [-7.2, P + 7.0, 5.8], 3.6, cloth);
    limb([-6.4, P + 9.8, 5.8], [-9.2, P + 3.0, 6.0], 2.6, cloth);
    // Her legs under it, and her feet on the pedestal.
    limb([-5.2, P + 9.6, 5.0], [-6.4, P + 0.8, 5.0], 1.4, bronze);
    limb([-4.8, P + 9.6, 6.6], [-5.4, P + 0.8, 6.6], 1.4, bronze);
    place(box(2.4, 0.8, 1.2, bronze), -5.9, P, 5.0);
    place(box(2.4, 0.8, 1.2, bronze), -4.9, P, 6.6);
    // The free arm flung back, and the other round the man.
    limb([-1.6, P + 21.8, 7.4], [-8.6, P + 25.8, 8.4], 1.1, bronze);
    limb([-1.0, P + 21.4, 4.8], [1.2, P + 23.0, 3.4], 1.0, bronze);

    return ctx.merge(group);
  },
};
