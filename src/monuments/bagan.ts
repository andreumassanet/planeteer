import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Bagan — the Ananda Temple and two of the plain's stupas.
 *
 * The model is the Ananda (the corn-cob spire) with two bare-brick stupas
 * beside it at x = ±34, not behind it: a 39-unit temple hides a band about 160
 * deep at the 13.4-degree camera. The temple is stretched about 1.5x vertically
 * (38.4 on a 46-unit square against 51 m on 88 m) but keeps the real 40% base,
 * 60% spire split. Half-diagonal 42.7 over height 38.4 is 1.11; the temple alone
 * reaches 25.
 *
 * The sikhara is seven four-sided tapers with half-widths
 * 10.0 9.2 8.3 7.2 5.9 4.5 3.1 1.8: the decrement grows from 0.8 to 1.3, giving
 * the concave corn-cob profile. The top half is `gold`, as on the real spire.
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
    // 1. The terraces: five, each with a `tan` cornice proud of the course above
    //    so every step has its own ink line.
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
    // 2. The four porches, the arms of the Greek cross: a projecting hall with a
    //    dark arched doorway, two stepped pediment courses and a gilded finial.
    //    Built once on +Z and spun by `around`.
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

        // The doorway: a dark panel half sunk in the wall with a second course over it.
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

    // The bell and the lotus over it, then the hti: three discs of falling size on a mast.
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
    // The mast the discs are threaded on (without it the middle disc floats).
    block(-0.3, 0.3, SIKHARA_TOP + 2.0, y - 0.7, -0.3, 0.3, gild);

    // -----------------------------------------------------------------------
    // 4. Two bare-brick stupas: a bell of four courses narrowing faster as they
    //    rise (the reverse order gives a cooling tower).
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      const x = side * 34;
      const z = -2;

      // Three square plinths, then the bell; without the plinths a stupa is a cone.
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
