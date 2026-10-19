import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * The Hassan II Mosque — Casablanca.
 *
 * The tallest minaret in the world (210 m) and two bays of the prayer hall either
 * side of it (the 200 m hall is cropped; the tier's footprint cap is 28). The
 * minaret is put between the wings, not behind: from 13.4 degrees a 17-unit roof
 * hides a band about 70 deep, so a minaret at the back would lose its first twenty
 * units.
 *
 * Green on white: `cream` marble, `green` (0x91ad78) tile, `gold` the jamour, and
 * `brown` for the two arcade recesses (horseshoe arches into a colonnade that
 * never sees the sun; a neutral would read as a hole). The shaft's interlaced
 * lattice is a green panel down each face with eight `cream` lozenges standing 0.25
 * proud, boxes yawed 45 degrees about Z.
 *
 * 69.8 tall on a 26.6 half-diagonal (0.38). The shaft is 6.8 across under a 51-unit
 * top, 7.5:1 against the real 8.4. The hall is twice as tall as it should be
 * relative to the tower (69.8 over 18, 3.9 against 8.4), or it would be an 8-unit
 * kerb.
 */

/** The shaft: half-width, and the two ends of it. */
const SHAFT = 3.4;
const SHAFT_TOP = 51;

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
    // 1. The esplanade: two courses of paving for the platform over the Atlantic.
    // -----------------------------------------------------------------------
    block(-22.6, 22.6, 0, 0.8, -9, 14, stone);
    block(-21.2, 21.2, 0.8, 1.6, -8.2, 13.2, marble);

    // -----------------------------------------------------------------------
    // 2. The two wings of the prayer hall and the arcade along their front: four
    //    horseshoe arches a wing, each a dark panel with a two-course head whose
    //    lower course is the widest (a horseshoe is wider than its opening).
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * WING_IN, side * WING_OUT, 1.6, WING_TOP, -8, 12.6, marble);

      for (let i = 0; i < 4; i++) {
        const x = side * (WING_IN + 1.9 + i * 3.8);
        // `PROUD` out of the wing's face: 0.05 out, the arch and the marble
        // round it were two colours a hair apart and flickered.
        block(x - 1.05, x + 1.05, 2.6, 8.0, 11.6, 12.6 + PROUD, shade);
        block(x - 1.35, x + 1.35, 8.0, 9.6, 11.6, 12.6 + PROUD, shade);
        // A green voussoir band over each arch, the only tile at eye level.
        block(x - 1.6, x + 1.6, 9.6, 10.4, 11.9, 12.9, tile);
      }
    }

    // The hipped green roof: an eave course and a long hip over the whole hall,
    // a four-sided frustum stretched to the plan by a parent with no rotation.
    const eave = block(-22.2, 22.2, WING_TOP, WING_TOP + 0.8, -8.6, 13.2, tile);
    void eave;
    const hip = new THREE.Group();
    hip.position.set(0, WING_TOP + 0.8, 2.3);
    hip.scale.set(21.8, 1, 10.5);
    hip.add(taper(1, 0.72, 4.2, tile, 4));
    group.add(hip);

    // -----------------------------------------------------------------------
    // 3. The minaret: a square shaft, a gallery, a lantern, a cap and the jamour
    //    (three gilded spheres on a spike), the one gold on the model.
    // -----------------------------------------------------------------------
    block(-4.6, 4.6, 1.6, 4.6, -4.6, 4.6, stone);
    block(-SHAFT, SHAFT, 4.6, SHAFT_TOP, -SHAFT, SHAFT, marble);

    // The lattice: a tall green panel on each face, then lozenges standing proud
    // of the two faces the camera can see.
    for (const side of [-1, 1]) {
      block(-2.2, 2.2, 11, 46, side * SHAFT, side * (SHAFT + 0.3), tile);
      block(side * SHAFT, side * (SHAFT + 0.3), 11, 46, -2.2, 2.2, tile);
    }
    //
    // A lozenge is a four-sided `column` spun half a turn about its axis and then
    // laid on its face: `rotation.set(PI/2, PI/4, 0)` (Euler XYZ) puts a corner
    // where the flat was and the quarter turn about X lays the prism against the
    // wall. Two rotations and no scale; a yawed `box` would be wrong, since
    // `ctx.box` rotates about its foot.
    for (let i = 0; i < 8; i++) {
      const y = 20.0 + i * 3.3;
      for (const [x, z, yaw] of [
        [0, SHAFT + 0.3, 0],
        [SHAFT + 0.3, 0, Math.PI / 2],
      ] as const) {
        const lozenge = column(0.9, 0.28, marble, 4);
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
    block(-4.4, 4.4, SHAFT_TOP, SHAFT_TOP + 1.8, -4.4, 4.4, tile);
    for (const at of [-2.6, 2.6]) {
      block(at - 0.9, at + 0.9, SHAFT_TOP + 1.8, SHAFT_TOP + 3.4, 3.6, 4.4, marble);
      block(at - 0.9, at + 0.9, SHAFT_TOP + 1.8, SHAFT_TOP + 3.4, -4.4, -3.6, marble);
      block(3.6, 4.4, SHAFT_TOP + 1.8, SHAFT_TOP + 3.4, at - 0.9, at + 0.9, marble);
      block(-4.4, -3.6, SHAFT_TOP + 1.8, SHAFT_TOP + 3.4, at - 0.9, at + 0.9, marble);
    }

    // The lantern, its own green band, and a stepped cap.
    block(-2.3, 2.3, SHAFT_TOP + 1.8, 61.4, -2.3, 2.3, marble);
    block(-2.5, 2.5, 58.4, 59.4, -2.5, 2.5, tile);
    for (const side of [-1, 1]) {
      block(-0.7, 0.7, 55.0, 57.6, side * 2.3, side * (2.3 + PROUD), shade);
      block(side * 2.3, side * (2.3 + PROUD), 55.0, 57.6, -0.7, 0.7, shade);
    }
    const cap = taper(2.6, 0.9, 3.0, tile, 4);
    cap.position.y = 61.4;
    group.add(cap);

    // The jamour: three balls of falling size on a spike (`column` at eight sides is
    // the only sphere this contract makes).
    let y = 64.4;
    for (const [radius, rise] of [
      [1.2, 1.2],
      [0.95, 1.0],
      [0.7, 0.8],
    ] as const) {
      const ball = column(radius, rise, metal, 8);
      ball.position.y = y;
      group.add(ball);
      y += rise;
    }
    const spike = taper(0.36, 0.08, 2.4, metal, 6);
    spike.position.y = y;
    group.add(spike);

    // -----------------------------------------------------------------------
    // 4. The doors: one in the minaret's foot and one in each wing, all horseshoe-
    //    headed.
    // -----------------------------------------------------------------------
    block(-1.3, 1.3, 4.6, 8.4, SHAFT, SHAFT + 0.35, dark);
    block(-1.6, 1.6, 8.4, 9.6, SHAFT, SHAFT + 0.35, dark);
    for (const side of [-1, 1]) {
      block(side * 15.4, side * 18.2, 1.6, 6.6, 12.6, 12.95, dark);
      block(side * 15.0, side * 18.6, 6.6, 8.0, 12.6, 12.95, dark);
    }

    return ctx.merge(group);
  },
};
