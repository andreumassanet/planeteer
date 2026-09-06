import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Bagan — the Ananda Temple and two of the plain's stupas.
 *
 * **Why Myanmar:** mainland South-East Asia had exactly one landmark, Angkor
 * Wat, and nothing at all north or west of it — Myanmar, Thailand, Laos,
 * Vietnam. Bagan is 3,500 temples standing on 40 square kilometres of dry plain
 * and it is the largest thing of its kind anywhere.
 *
 * ---------------------------------------------------------------------------
 * The crop, and why it is three buildings and not one
 * ---------------------------------------------------------------------------
 *
 * Angkor is already in the world as a single temple mountain, so building Bagan
 * as one temple would have produced a second one of those. What Bagan actually
 * is, and what every photograph of it is of, is **a plain with temples scattered
 * across it at different sizes** — so the model is the Ananda, which is the one
 * with the corn-cob spire everyone knows, with two bare-brick stupas standing
 * out on either side.
 *
 * They are placed **beside** it and not behind it, and that is the 13.4-degree
 * camera again: a 39-unit temple hides a band about 160 deep behind itself, and
 * a stupa at the back would be entirely gone. Set out at x = ±34 they are clear
 * of the temple's own mass — checked by walking the camera ray back from each of
 * them, which leaves the temple's 23-unit platform at z = 32, past its front
 * edge.
 *
 * ---------------------------------------------------------------------------
 * The sikhara is seven courses and the profile is the whole point
 * ---------------------------------------------------------------------------
 *
 * A Burmese temple spire is a *sikhara*, and its silhouette is concave: it
 * leaves the terraces almost vertically and then bends in hard near the top.
 * Seven four-sided `taper`s, with the half-width falling
 *
 *     10.0  9.2  8.3  7.2  5.9  4.5  3.1  1.8
 *
 * do that — the decrement grows from 0.8 to 1.3 all the way up, which is what
 * makes it a corn cob rather than a cone. Seven ink lines up a spire is the
 * *manufactured* end of the joint-count note in `CLAUDE.md`, and it is right
 * here for the same reason it is right at the Registan: this is a plastered
 * brick surface laid in receding string courses and it is meant to read as one.
 *
 * The top half is `gold`. Ananda's sikhara and hti really are gilded, and it is
 * also the one thing that lifts a white temple off a pale sky.
 *
 * ---------------------------------------------------------------------------
 * Proportion
 * ---------------------------------------------------------------------------
 *
 * The Ananda is 51 m tall on a 88 m square — 0.58. Here it is 38.4 on a 46-unit
 * square, 0.85, so the temple alone is stretched about 1.5x vertically, which is
 * the tier doing what the tier does. What is *not* stretched is the split
 * between the terraces and the spire: the real one is roughly 40% base and 60%
 * spire and so is this one, and that ratio is what a Burmese temple is.
 *
 * Half-diagonal 42.7 against height 38.4 is 1.11, inside the 2.0 cap, and the
 * whole of that reach is the two stupas — the temple by itself is 25.
 */

/** The stepped terraces: [top of the course, half-width]. */
const TERRACES: [top: number, half: number][] = [
  [2.4, 23.0],
  [6.6, 19.6],
  [10.2, 16.8],
  [13.4, 14.2],
  [16.0, 11.6],
];

/** The sikhara: half-widths, top to bottom of each of the seven courses. */
const SIKHARA = [10.0, 9.2, 8.3, 7.2, 5.9, 4.5, 3.1, 1.8];
const SIKHARA_BASE = 16.0;
const SIKHARA_TOP = 30.4;

export const bagan: Monument = {
  id: 'bagan',
  name: 'Bagan',
  iso: 'MMR',
  lat: 21.1703,
  lon: 94.8672,
  tier: 'building',
  footprint: 43,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, around } = ctx;

    const lime = palette.cream; // the Ananda is whitewashed and is repainted every year
    const gild = palette.gold; // the sikhara's upper courses and every hti on the plain
    const brick = palette.clay; // the two stupas, which were never plastered
    const old = palette.brown; // their weathered lower courses
    const shade = palette.bark; // the four doorways
    const stone = palette.tan; // the plinth and the terrace cornices

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
    // 1. The terraces. Five of them, each with a `tan` cornice a hand's width
    //    proud of the course above, so every step has its own ink line rather
    //    than one long stair of flush faces.
    // -----------------------------------------------------------------------
    let base = 0;
    for (const [top, half] of TERRACES) {
      block(-half, half, base, top - 0.7, -half, half, lime);
      block(-half - 0.5, half + 0.5, top - 0.7, top, -half - 0.5, half + 0.5, stone);
      base = top;
    }

    // Corner stupas on the second terrace — small gilded bells, four of them,
    // and a Burmese temple is never without them.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const at = 17.2;
        const bell = taper(2.0, 1.2, 3.4, gild, 8);
        bell.position.set(sx * at, 6.6, sz * at);
        group.add(bell);
        const tip = taper(1.1, 0.15, 2.6, gild, 8);
        tip.position.set(sx * at, 10.0, sz * at);
        group.add(tip);
      }
    }

    // -----------------------------------------------------------------------
    // 2. The four porches. Ananda's plan is a Greek cross and the porches are
    //    the arms of it; each is a projecting hall with a dark arched doorway,
    //    two stepped pediment courses and a small gilded finial.
    //
    //    Built once on the +Z axis and spun by `around`, which is what `around`
    //    is for and is also the only way four identical arms can be guaranteed
    //    identical.
    // -----------------------------------------------------------------------
    group.add(
      around(4, () => {
        const porch = new THREE.Group();
        const hall = box(18, 12.6, 9.5, lime);
        hall.position.set(0, 0, 19.75);
        porch.add(hall);

        const first = box(15.2, 2.0, 8.6, lime);
        first.position.set(0, 12.6, 19.4);
        porch.add(first);

        const second = box(11.4, 1.6, 7.4, stone);
        second.position.set(0, 14.6, 19.1);
        porch.add(second);

        const cap = taper(3.6, 0.9, 3.4, gild, 4);
        cap.position.set(0, 16.2, 19.1);
        porch.add(cap);

        // The doorway. Nothing in the contract cuts a hole, so it is a dark
        // panel half sunk in the wall with a second course over it — which at
        // 260 pixels is the same drawing as an arch.
        const door = box(4.4, 7.6, 1.4, shade);
        door.position.set(0, 0.8, 24.2);
        porch.add(door);
        const head = box(3.0, 1.8, 1.4, shade);
        head.position.set(0, 8.4, 24.2);
        porch.add(head);
        return porch;
      }),
    );

    // -----------------------------------------------------------------------
    // 3. The sikhara. Seven receding courses, the top four gilded.
    // -----------------------------------------------------------------------
    const rise = (SIKHARA_TOP - SIKHARA_BASE) / (SIKHARA.length - 1);
    for (let i = 0; i + 1 < SIKHARA.length; i++) {
      const course = taper(SIKHARA[i]!, SIKHARA[i + 1]!, rise, i >= 3 ? gild : lime, 4);
      course.position.y = SIKHARA_BASE + i * rise;
      group.add(course);
    }

    // The bell and the lotus over it, then the hti — the tiered iron umbrella
    // that finishes every stupa in Burma, here three discs of falling size on a
    // mast, which is what it looks like from further away than arm's length.
    const bell = taper(2.4, 1.5, 2.0, gild, 8);
    bell.position.y = SIKHARA_TOP;
    group.add(bell);
    let y = SIKHARA_TOP + 2.0;
    for (const [radius, thickness] of [
      [2.0, 0.5],
      [1.45, 0.45],
      [0.95, 0.4],
    ] as const) {
      const disc = column(radius, thickness, gild, 8);
      disc.position.y = y;
      group.add(disc);
      y += thickness + 0.7;
    }
    const spike = taper(0.45, 0.08, 3.2, gild, 6);
    spike.position.y = y - 0.7;
    group.add(spike);
    // The mast the discs are threaded on. Without it the middle disc touches
    // nothing at all and `findFlaws` calls it floating, which it is: an hti is
    // an umbrella on a pole and the pole was missing.
    block(-0.3, 0.3, SIKHARA_TOP + 2.0, y - 0.7, -0.3, 0.3, gild);

    // -----------------------------------------------------------------------
    // 4. Two stupas out on the plain, bare brick and never plastered. A Burmese
    //    zedi is a *bell* — widest low, with a long concave shoulder — so it is
    //    four courses that narrow faster as they rise, and the reverse of that
    //    order would give a cooling tower.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      const x = side * 34;
      const z = -2;

      // Three square plinths, then the bell. The plinths matter more than they
      // look: without them a stupa is a cone, and a cone is a slag heap. Every
      // zedi on the plain stands on a stack of square terraces and it is the
      // corner between the square and the round that says what it is.
      let at = 0;
      for (const [half, rise, color] of [
        [7.6, 1.7, old],
        [6.6, 1.5, old],
        [5.7, 1.4, brick],
      ] as const) {
        block(x - half, x + half, at, at + rise, z - half, z + half, color);
        at += rise;
      }
      for (const [bottom, top, height] of [
        [5.0, 4.7, 2.4],
        [4.7, 3.9, 2.6],
        [3.9, 2.6, 2.8],
        [2.6, 1.2, 2.6],
      ] as const) {
        const course = taper(bottom, top, height, brick, 8);
        course.position.set(x, at, z);
        group.add(course);
        at += height;
      }
      const finial = taper(1.0, 0.1, 4.2, gild, 6);
      finial.position.set(x, at, z);
      group.add(finial);
    }

    return group;
  },
};
