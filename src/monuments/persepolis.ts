import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Persepolis — the Gate of All Nations and the Apadana.
 *
 * **Why Iran:** the Middle East had two landmarks, Petra and the Burj Khalifa,
 * and between them nothing — no Iran, no Iraq, no Saudi Arabia, no Israel, no
 * Lebanon, and nothing at all of the ancient Near East, which is where cities
 * were invented. Persepolis is the largest thing standing from any of it.
 *
 * ---------------------------------------------------------------------------
 * A ruin is a composition problem, not a modelling one
 * ---------------------------------------------------------------------------
 *
 * Petra is already in the world and it is a *façade*. Persepolis is the
 * opposite: it is a terrace with almost nothing left on it, and what makes a
 * photograph of it is the **contrast between two survivals** — the squat
 * doorway of the Gate of All Nations with its winged bulls, and the absurdly
 * slender Apadana columns beside it, thirteen of the original seventy-two.
 *
 * So the two are set **side by side rather than one behind the other**. The
 * quarter view is 13.4 degrees up and 32 degrees round toward +X, so a
 * gate in front of the columns would cut their shafts off at the knee and leave
 * only capitals floating. Laid out across the terrace — gate at x = -16, columns
 * from x = 0 to 26 — both are seen whole, which is also how the site is
 * arranged: you come through the gate and the Apadana is to your right.
 *
 * ---------------------------------------------------------------------------
 * What makes a column read as Persian
 * ---------------------------------------------------------------------------
 *
 * Two things, and neither is the fluting.
 *
 * **Slenderness.** The real shafts are 20 m tall and 1.6 m thick — 12.5 to 1,
 * which is thinner than anything Greek or Roman and is the first thing anybody
 * notices. Here the shaft is 28.7 units on a 1.05 half-width, 13.7 to 1 — within
 * a tenth of the original and the one number in this file that was not allowed to
 * move.
 *
 * **The double-bull capital.** Two bull foreparts back to back with the beam
 * resting in the saddle between them. It is the one Achaemenid invention nobody
 * else copied, and it is three boxes: a saddle block and a head at each end.
 *
 * The fluting is 12 sides on the shaft, which is a decision about ink rather
 * than about geometry — at that count the facets read as flutes at thumbnail
 * size, and 8 read as a post.
 *
 * ---------------------------------------------------------------------------
 * Five of the thirteen are broken, and that is the model
 * ---------------------------------------------------------------------------
 *
 * A complete colonnade is a temple. What says *ruin* is the **distribution of
 * heights**: some columns whole with their capitals, one whole with the capital
 * gone, two snapped half way, two down to stumps. `around` returning `null` is
 * the contract's own idiom for this and the same idea is used here as a table of
 * survival states, so the pattern is deliberate rather than random — `build`
 * must be deterministic and there is no seed in this contract.
 *
 * Proportion: 39.9 units tall on a 33.0 half-diagonal, 0.83 against the 2.0 cap.
 * No `realHeight`: Persepolis is a city and the source list carries none.
 */

/** The terrace. Everything on the site stands on it and it is 12 m high in life. */
const TERRACE_X = 28;
const TERRACE_Z = 13;
const TERRACE_TOP = 3.4;

/** The Gate of All Nations: its two piers and the lintel across them. */
const GATE_X = -16;
const PIER = 3.5;
const GATE_TOP = 22.0;

/**
 * The colonnade. `[x, z, state]`, where the state is how much of the column is
 * left: 2 whole with a capital, 1 whole without one, and 0 down to a stump of
 * the height given.
 */
const COLUMNS: [x: number, z: number, state: 0 | 1 | 2, stump: number][] = [
  [1, 7, 2, 0],
  [1, -6, 2, 0],
  [10, 7, 2, 0],
  [10, -6, 1, 0],
  [19, 7, 2, 0],
  [19, -6, 0, 14.5],
  [27, 7, 0, 7.0],
  [27, -6, 0, 3.2],
];

const SHAFT = 1.05;
const SHAFT_TOP = 30.6;

export const persepolis: Monument = {
  id: 'persepolis',
  name: 'Persepolis',
  iso: 'IRN',
  lat: 29.9354,
  lon: 52.8916,
  tier: 'building',
  footprint: 33.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper } = ctx;

    const stone = palette.tan; // the terrace and the piers: grey limestone, warm with age
    const lit = palette.sand; // shafts and capitals, which are the sunlit half of the site
    const worn = palette.brown; // the weathered courses and the relief panels
    const shade = palette.bark; // the portal and the deepest carving

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
    // 1. The terrace, its plinth course, and the great double stair. The stair
    //    is the one part of Persepolis that is completely intact and it is
    //    shallow enough to ride a horse up, which is why it is 24 units long
    //    for 3.4 of rise.
    // -----------------------------------------------------------------------
    block(-TERRACE_X, TERRACE_X, 0, 1.2, -TERRACE_Z, TERRACE_Z, worn);
    block(-TERRACE_X + 0.9, TERRACE_X - 0.9, 1.2, TERRACE_TOP, -TERRACE_Z + 0.9, TERRACE_Z - 0.9, stone);

    for (let i = 0; i < 6; i++) {
      const y = (TERRACE_TOP * (i + 1)) / 6;
      block(-25, -6, y - TERRACE_TOP / 6, y, TERRACE_Z - 0.9 + i * 0.95, 19.0, stone);
    }
    // The parapets either side of the flight, each carrying a relief band —
    // the tribute procession, which is the most photographed carving in Iran
    // and at this size is one dark course under one lighter one.
    for (const x of [-25.6, -5.4]) {
      block(x - 0.9, x + 0.9, 0, TERRACE_TOP + 2.4, TERRACE_Z - 0.9, 19.6, stone);
    }
    block(-25.6, -5.4, 1.0, 2.6, 19.6, 20.2, worn);
    block(-25.6, -5.4, 2.6, 3.4, 19.6, 20.3, shade);

    // -----------------------------------------------------------------------
    // 2. The Gate of All Nations. Two piers, a lintel, and a winged bull on the
    //    outer face of each pier. Xerxes' inscription runs across the lintel and
    //    is a `worn` band here, because cuneiform at 260 pixels is a texture.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      const x = GATE_X + side * 6.5;
      block(x - PIER, x + PIER, TERRACE_TOP, GATE_TOP, -PIER, PIER, stone);
    }
    block(GATE_X - 10.6, GATE_X + 10.6, GATE_TOP, GATE_TOP + 2.6, -PIER - 0.5, PIER + 0.5, stone);
    block(GATE_X - 10.6, GATE_X + 10.6, GATE_TOP + 0.6, GATE_TOP + 1.8, PIER + 0.5, PIER + 0.9, worn);
    // The portal itself: a dark slab set between the piers, so the gate is a
    // gate and not two posts.
    block(GATE_X - 3.0, GATE_X + 3.0, TERRACE_TOP, GATE_TOP, -1.2, 1.2, shade);

    /**
     * A lamassu — a human-headed winged bull — carved in high relief on the
     * front of a pier. Body, two legs, a wing laid up the wall behind it, a
     * bearded head and the horned crown on top.
     */
    const lamassu = (x: number): void => {
      block(x - 3.0, x + 3.0, TERRACE_TOP + 4.2, TERRACE_TOP + 10.4, PIER, PIER + 1.9, worn);
      for (const at of [-2.1, 1.6]) {
        block(x + at - 0.7, x + at + 0.7, TERRACE_TOP, TERRACE_TOP + 4.2, PIER + 0.2, PIER + 1.5, worn);
      }
      // The wing: a long shallow slab sweeping up the pier behind the body.
      block(x - 3.0, x + 1.4, TERRACE_TOP + 10.4, TERRACE_TOP + 13.0, PIER, PIER + 1.2, stone);
      block(x - 2.4, x + 0.6, TERRACE_TOP + 13.0, TERRACE_TOP + 14.6, PIER, PIER + 0.9, stone);
      // Head, beard, and the horned tiara that makes it a king rather than a cow.
      block(x + 1.2, x + 3.1, TERRACE_TOP + 10.4, TERRACE_TOP + 13.4, PIER + 0.3, PIER + 2.3, stone);
      block(x + 1.4, x + 2.9, TERRACE_TOP + 8.6, TERRACE_TOP + 10.4, PIER + 0.9, PIER + 2.3, shade);
      block(x + 0.9, x + 3.4, TERRACE_TOP + 13.4, TERRACE_TOP + 14.8, PIER + 0.1, PIER + 2.5, worn);
    };
    lamassu(GATE_X - 6.5);
    lamassu(GATE_X + 6.5);

    // -----------------------------------------------------------------------
    // 3. The Apadana. Eight columns of a hall that had seventy-two, in four
    //    states of survival.
    // -----------------------------------------------------------------------
    for (const [x, z, state, stump] of COLUMNS) {
      // The bell base, which is where a Persian column starts and is the one
      // wide thing about it.
      const bell = taper(1.9, 1.35, 1.9, stone, 12);
      bell.position.set(x, TERRACE_TOP, z);
      group.add(bell);

      const top = state === 0 ? stump : SHAFT_TOP;
      const shaft = taper(1.35, SHAFT, top - 1.9, lit, 12);
      shaft.position.set(x, TERRACE_TOP + 1.9, z);
      group.add(shaft);

      if (state === 0) {
        // A broken shaft has a ragged top. One short wider course does it, and
        // it is the difference between a column that was cut down and one that
        // fell.
        const broken = taper(SHAFT + 0.25, SHAFT - 0.3, 0.8, worn, 7);
        broken.position.set(x, TERRACE_TOP + top, z);
        group.add(broken);
        continue;
      }

      // The necking: a band of palm leaves and then a fluted collar. Two
      // courses, and without them the capital sits on the shaft like a hat.
      const collar = taper(SHAFT + 0.35, SHAFT + 0.6, 1.5, stone, 12);
      collar.position.set(x, TERRACE_TOP + SHAFT_TOP, z);
      group.add(collar);
      const volutes = column(SHAFT + 0.75, 1.4, lit, 12);
      volutes.position.set(x, TERRACE_TOP + SHAFT_TOP + 1.5, z);
      group.add(volutes);

      if (state !== 2) continue;

      // The double bull. The saddle between the two foreparts is where the
      // roof beam actually sat, so it is modelled as a channel: two heads with
      // a lower block between them.
      const saddleY = TERRACE_TOP + SHAFT_TOP + 2.9;
      block(x - 1.15, x + 1.15, saddleY, saddleY + 1.3, z - 2.3, z + 2.3, lit);
      for (const side of [-1, 1]) {
        block(x - 1.3, x + 1.3, saddleY, saddleY + 2.7, z + side * 1.6, z + side * 3.3, lit);
        // The muzzle, dropped and thrown out past the body — a bull forepart
        // reads as a bull only once the head is clear of the block.
        block(x - 0.75, x + 0.75, saddleY + 0.9, saddleY + 2.3, z + side * 3.3, z + side * 4.6, lit);
        block(x - 0.85, x + 0.85, saddleY + 2.3, saddleY + 3.0, z + side * 2.6, z + side * 4.1, worn);
      }
    }

    return group;
  },
};
