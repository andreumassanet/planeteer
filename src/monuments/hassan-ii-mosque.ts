import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Hassan II Mosque — Casablanca.
 *
 * **Why Morocco:** north-west Africa was empty. Egypt had three landmarks and
 * Mali one, and between Cairo and Djenné — Morocco, Algeria, Tunisia, Libya,
 * Mauritania, the whole Maghreb and the Atlantic coast — there was nothing at
 * all. Casablanca's mosque is the obvious repair and it is also the tallest
 * minaret in the world, 210 m, which is a thing this planet is short of: the
 * `tower` tier had eight members and six of them were in Europe, Japan or the
 * United States.
 *
 * ---------------------------------------------------------------------------
 * The crop: a minaret and two wings of the hall
 * ---------------------------------------------------------------------------
 *
 * The prayer hall is 200 m long and holds twenty-five thousand people. At this
 * tier that is a slab 6 units high and 300 long, and the tier's footprint cap is
 * 28 — so the hall is cropped to the two bays either side of the minaret, which
 * is what a photograph taken from the esplanade contains anyway.
 *
 * **The minaret is put between the wings rather than behind them, and that is a
 * camera decision.** The contact sheet looks from 13.4 degrees up, so a 17-unit
 * roof hides a band about 70 deep behind it; a minaret standing at the back of
 * the hall would rise out of nothing with its first twenty units missing. Set in
 * the gap between two wings it is seen full height, from the plinth to the
 * jamour, which is the only view of it worth having.
 *
 * ---------------------------------------------------------------------------
 * Two colours and one rule
 * ---------------------------------------------------------------------------
 *
 * Everything about this building is **green on white**: emerald zellij on white
 * marble, and a green tiled roof over it. `cream` is the marble, `green`
 * (0x91ad78) is the tile, `gold` is the jamour, and the two arcade recesses are
 * `brown` — because they are horseshoe arches into a colonnade that never sees
 * the sun, and the note beside `ctx.palette` is unambiguous about what a neutral
 * does in a recess.
 *
 * The lattice is the one thing that could not be built literally. The real shaft
 * carries an interlaced *darj-w-ktaf* over its whole height, which at 260 pixels
 * is a texture and not a geometry. What is built instead is a green panel down
 * each face with eight `cream` lozenges standing 0.25 proud of it — boxes yawed
 * 45 degrees about Z, which is a rotation and nothing else, so `T * R * S` has
 * nothing to get wrong. At thumbnail size that reads as a patterned band, which
 * is the honest answer.
 *
 * Proportion: 69.4 units tall on a 26.6 half-diagonal, 0.38 against the 2.0 cap.
 * The real minaret is 210 m over a hall 25 m high, a ratio of 8.4; here it is
 * 69.4 over 17.4, which is 4.0 — the hall is **twice as tall as it should be**
 * relative to its tower, deliberately, because a hall at true relative height
 * would be 8 units and would read as a kerb.
 */

/** The shaft: half-width, and the two ends of it. */
const SHAFT = 4.2;
const SHAFT_TOP = 46;

/** The wings of the prayer hall: from here out to here. */
const WING_IN = 6.4;
const WING_OUT = 22;
const WING_TOP = 13;

export const hassanIiMosque: Monument = {
  id: 'hassan-ii-mosque',
  name: 'Hassan II Mosque',
  iso: 'MAR',
  lat: 33.6086,
  lon: -7.6327,
  realHeight: 210,
  tier: 'tower',
  footprint: 27,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper } = ctx;

    const marble = palette.cream; // the walls, and the lozenges on the lattice
    const tile = palette.green; // zellij and the roof: the building's one colour
    const stone = palette.tan; // the esplanade and the plinth
    const shade = palette.brown; // inside the arcade, which is in shade all day
    const dark = palette.bark; // the doors
    const metal = palette.gold; // the jamour

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
    // 1. The esplanade. The mosque is built out over the Atlantic on a platform
    //    and is approached across it; two courses of paving are what say so.
    // -----------------------------------------------------------------------
    block(-22.6, 22.6, 0, 0.8, -9, 14, stone);
    block(-21.2, 21.2, 0.8, 1.6, -8.2, 13.2, marble);

    // -----------------------------------------------------------------------
    // 2. The two wings of the prayer hall, and the arcade along the front of
    //    them. Four horseshoe arches to a wing: a horseshoe is a round head that
    //    is *wider than its opening*, so each is a dark panel with a two-course
    //    head whose lower course is the widest thing in it.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * WING_IN, side * WING_OUT, 1.6, WING_TOP, -8, 12.6, marble);

      for (let i = 0; i < 4; i++) {
        const x = side * (WING_IN + 1.9 + i * 3.8);
        block(x - 1.05, x + 1.05, 2.6, 8.0, 11.6, 12.65, shade);
        block(x - 1.35, x + 1.35, 8.0, 9.6, 11.6, 12.65, shade);
        // A green voussoir band over each arch. It is the only tile at eye
        // level and it is what makes the arcade read as Moroccan rather than
        // Roman.
        block(x - 1.6, x + 1.6, 9.6, 10.4, 11.9, 12.9, tile);
      }
    }

    // The hipped green roof, in three courses. Each is narrower *and* shallower
    // than the one under it, so `OutlineEffect` finds all three: a roof built as
    // one slab is a lid, and coplanar faces get no ink between them at all.
    block(-22.2, 22.2, WING_TOP, 14.6, -8.6, 13.2, tile);
    block(-20.6, 20.6, 14.6, 16.1, -7.4, 11.8, tile);
    block(-18.8, 18.8, 16.1, 17.4, -5.9, 10.1, tile);

    // -----------------------------------------------------------------------
    // 3. The minaret. A square shaft, a gallery, a lantern, a cap, and the
    //    jamour — three gilded spheres on a spike, which is what finishes every
    //    minaret in the Maghreb and is the one gold on the model.
    // -----------------------------------------------------------------------
    block(-5.4, 5.4, 1.6, 4.6, -5.4, 5.4, stone);
    block(-SHAFT, SHAFT, 4.6, SHAFT_TOP, -SHAFT, SHAFT, marble);

    // The lattice: a tall green panel on each face, then lozenges standing proud
    // of the two faces the camera can see.
    for (const side of [-1, 1]) {
      block(-2.8, 2.8, 11, 40, side * SHAFT, side * (SHAFT + 0.3), tile);
      block(side * SHAFT, side * (SHAFT + 0.3), 11, 40, -2.8, 2.8, tile);
    }
    //
    // A lozenge is a four-sided `column` spun half a turn about its own axis and
    // then laid on its face: `rotation.set(PI/2, PI/4, 0)` is Euler order XYZ, so
    // the spin happens first and puts a *corner* where the flat face was, and the
    // quarter turn about X then lays the prism against the wall. Two rotations
    // and no scale, which is the only arrangement `T * R * S` cannot get wrong —
    // and a `box` yawed 45 degrees would have been wrong anyway, because `ctx.box`
    // stands on y = 0 and rotates about its own foot, not its centre.
    for (let i = 0; i < 8; i++) {
      const y = 12.6 + i * 3.5;
      for (const [x, z, yaw] of [
        [0, SHAFT + 0.3, 0],
        [SHAFT + 0.3, 0, Math.PI / 2],
      ] as const) {
        const lozenge = column(1.1, 0.28, marble, 4);
        lozenge.rotation.set(Math.PI / 2, Math.PI / 4, 0);
        const pivot = new THREE.Group();
        pivot.rotation.y = yaw;
        pivot.position.set(x, y, z);
        pivot.add(lozenge);
        group.add(pivot);
      }
    }

    // The gallery: a projecting course, then merlons — the stepped battlement
    // every Almohad minaret is finished with.
    block(-5.5, 5.5, SHAFT_TOP, SHAFT_TOP + 1.8, -5.5, 5.5, tile);
    for (const at of [-3.4, 3.4]) {
      block(at - 1.0, at + 1.0, SHAFT_TOP + 1.8, SHAFT_TOP + 3.4, 4.6, 5.5, marble);
      block(at - 1.0, at + 1.0, SHAFT_TOP + 1.8, SHAFT_TOP + 3.4, -5.5, -4.6, marble);
      block(4.6, 5.5, SHAFT_TOP + 1.8, SHAFT_TOP + 3.4, at - 1.0, at + 1.0, marble);
      block(-5.5, -4.6, SHAFT_TOP + 1.8, SHAFT_TOP + 3.4, at - 1.0, at + 1.0, marble);
    }

    // The lantern, its own green band, and a stepped cap.
    block(-2.9, 2.9, 49.4, 58.2, -2.9, 2.9, marble);
    block(-3.1, 3.1, 55.4, 56.6, -3.1, 3.1, tile);
    const cap = taper(3.2, 1.1, 3.6, tile, 4);
    cap.position.y = 58.2;
    group.add(cap);

    // The jamour: three balls of falling size on a spike. `column` at eight
    // sides is the only sphere this contract makes, and at this distance it is
    // the right one.
    let y = 61.8;
    for (const [radius, rise] of [
      [1.55, 1.6],
      [1.15, 1.25],
      [0.8, 0.95],
    ] as const) {
      const ball = column(radius, rise, metal, 8);
      ball.position.y = y;
      group.add(ball);
      y += rise;
    }
    const spike = taper(0.42, 0.1, 3.8, metal, 6);
    spike.position.y = y;
    group.add(spike);

    // -----------------------------------------------------------------------
    // 4. The doors. One in the minaret's own foot and one in each wing, all
    //    horseshoe-headed, because the arch is the thing the building repeats.
    // -----------------------------------------------------------------------
    block(-1.5, 1.5, 1.6, 6.4, SHAFT, SHAFT + 0.35, dark);
    block(-1.85, 1.85, 6.4, 7.7, SHAFT, SHAFT + 0.35, dark);
    for (const side of [-1, 1]) {
      block(side * 15.4, side * 18.2, 1.6, 6.6, 12.6, 12.95, dark);
      block(side * 15.0, side * 18.6, 6.6, 8.0, 12.6, 12.95, dark);
    }

    return group;
  },
};
