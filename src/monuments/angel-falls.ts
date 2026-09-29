import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Angel Falls — Salto Ángel, Canaima, Venezuela.
 *
 * **Why Venezuela:** the northern half of South America was empty. Machu Picchu
 * and Perito Moreno are both in the far south of the continent and Christ the
 * Redeemer is on its Atlantic edge; Venezuela, Colombia, Ecuador, Guyana,
 * Suriname and the whole Guiana Shield had nothing. Angel Falls is 979 m, the
 * tallest waterfall on Earth by a factor of two, and it comes off the side of a
 * tepui — a flat-topped sandstone table two billion years old.
 *
 * ---------------------------------------------------------------------------
 * Why `landmark` when Victoria and Niagara are both `building`
 * ---------------------------------------------------------------------------
 *
 * Because the tier is a question about distance, and the answer is different.
 * Victoria Falls is 108 m and Niagara 51; this is 979, nine times one and
 * nineteen times the other, and the whole reason anybody goes is that it is too
 * tall to photograph from the ground. At 120 units it stands beside Everest,
 * Fuji and Kilimanjaro, which is the company it keeps in life.
 *
 * It is also the tier the *shape* wants. `MAX_ASPECT` measures the half-diagonal
 * against the height, and this is the one landmark in the world whose problem is
 * the opposite of a bridge's: it is far taller than it is wide, so the cap that
 * forces the Golden Gate into a crop costs this nothing at all. 45.7 against
 * 119.4 is 0.38.
 *
 * ---------------------------------------------------------------------------
 * The cliff is five bands and not one slab, and the reason is ink
 * ---------------------------------------------------------------------------
 *
 * A 112-unit wall of one colour is the single largest blank area any monument in
 * this world could produce, and `OutlineEffect` would draw exactly one line
 * round the whole of it. That is Niagara's American curtain again — *two
 * coplanar meshes get no ink between them* — so the strata are stepped in
 * **depth** as well as in colour, each band standing a little further back than
 * the one under it. Every band then gets its own line the full width of the
 * cliff, which is what a sandstone escarpment looks like, and it costs nothing:
 * five boxes instead of one.
 *
 * **Five and not seven, and the colours run as a gradient and not an
 * alternation.** Seven bands swapping back and forth between two browns, with
 * five vertical ribs over them, divided the face into a six-by-four grid and the
 * whole cliff rendered as *brickwork*. What replaced the ribs is two spurs — the
 * ridges that flank the real amphitheatre — which give the rock a plan instead
 * of a texture.
 *
 * The top band overhangs and is `darkOlive`. A tepui's rim is undercut and its
 * plateau is covered in scrub, and both facts are doing work here — the
 * overhang gives the strongest ink line in the model and the dark cap stops a
 * 120-unit rock ending in a bare edge against the sky.
 *
 * ---------------------------------------------------------------------------
 * The water, and the one thing about it that is not obvious
 * ---------------------------------------------------------------------------
 *
 * Angel Falls **does not reach the bottom as water.** The free drop is 807 m and
 * the fall atomises into mist long before it lands, which is why every
 * photograph of it fades out two thirds of the way down. So the ribbon is five
 * boxes that get **wider and further forward** as they fall — 2.6 to 5.6 units
 * across, and 3.2 to 7.0 units clear of the rock — and then stops at y = 26 into
 * a bank of `cream` haze. A ribbon of constant width running into a pool would
 * be a different waterfall.
 *
 * Stepping it forward is the same coplanar rule as the strata, used for the
 * opposite purpose: the ribbon has to *separate* from the cliff, and it only
 * does so if each of its five sections has its own silhouette.
 *
 * The fall is off-centre, at x = -7. It is in life — it comes over one notch in
 * the Auyán-tepui's rim — and a waterfall down the middle of a symmetrical cliff
 * reads as a drawing rather than as a place.
 */

/**
 * The cliff, band by band: [top of the band, half-width, how far forward its
 * face stands]. Read the third column down — 6.0 to 0.4 — and that is the
 * batter, and then the last row steps back out, which is the undercut rim.
 */
const STRATA: [top: number, half: number, front: number][] = [
  [26, 42.0, 4.6],
  [56, 41.6, 3.2],
  [86, 41.8, 1.8],
  [105, 41.4, 0.4],
  [112, 42.0, 2.6],
];

/**
 * The two spurs that frame the fall: [top, half-width of the spur, how far
 * forward of the band behind it]. Angel Falls comes off the back of an
 * amphitheatre with a ridge down either side of it, and *that* is what gives a
 * cliff depth — not the vertical ribs the first build used, which divided the
 * face into a four-by-six grid of rectangles and read as brickwork.
 */
const SPURS: [top: number, half: number, out: number][] = [
  [24, 5.6, 4.4],
  [54, 4.6, 3.0],
];
const SPUR_X = 30;
const CLIFF_BACK = -18;

/** The fall: [top, bottom, half-width, front of the ribbon]. */
const RIBBON: [top: number, bottom: number, half: number, front: number][] = [
  [104, 90, 1.3, 3.2],
  [90, 74, 1.5, 4.0],
  [74, 58, 1.8, 4.9],
  [58, 42, 2.2, 5.9],
  [42, 26, 2.8, 7.0],
];
const FALL_X = -7;

export const angelFalls: Monument = {
  id: 'angel-falls',
  name: 'Angel Falls',
  iso: 'VEN',
  lat: 5.9701,
  lon: -62.5362,
  realHeight: 979,
  tier: 'landmark',
  footprint: 47,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, taper } = ctx;

    const rock = palette.brown; // the sandstone, wet and dark most of the year
    const dry = palette.clay; // the bands the sun gets at, which are redder
    const deep = palette.bark; // the two bands in permanent shadow under the rim
    const rim = palette.darkOlive; // the plateau: undercut, and covered in scrub
    const water = palette.white; // warm white, which survives being in shade
    const spray = palette.cream; // the haze the fall turns into before it lands
    const pool = palette.skyBlue;
    const leaf = palette.green;

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
    // 1. The cliff.
    // -----------------------------------------------------------------------
    // Bottom to top: dark at the foot where a gorge this deep never sees the
    // sun, lighter as it rises. A **gradient** and not an alternation — six
    // bands that swap back and forth read as stripes painted on, and stripes
    // plus ribs read as a totem pole.
    const bandColor = [deep, rock, dry, dry, rim];
    let base = 0;
    for (let i = 0; i < STRATA.length; i++) {
      const [top, half, front] = STRATA[i]!;
      block(-half, half, base, top, CLIFF_BACK, front, bandColor[i]!);

      base = top;
    }

    // The two spurs. Each is three courses standing proud of the wall behind
    // it, tapering as it rises, so the cliff has a plan as well as an elevation
    // and the fall sits in a recess between them.
    let spurBase = 0;
    for (const [top, half, out] of SPURS) {
      for (const side of [-1, 1]) {
        const front = STRATA.find((band) => band[0] >= top)?.[2] ?? STRATA[0]![2];
        block(
          side * (SPUR_X - half),
          side * (SPUR_X + half),
          spurBase,
          top,
          front - 2.0,
          front + out,
          spurBase === 0 ? deep : rock,
        );
      }
      spurBase = top;
    }

    // Scrub on the plateau. It is the only thing in the model above the rim and
    // it is what stops 120 units of rock ending in a ruled line.
    for (const [x, z, size, height] of [
      [-33, -6, 4.4, 6.2],
      [-16, -11, 3.6, 4.8],
      [2, -4, 5.0, 7.4],
      [20, -12, 3.4, 5.0],
      [34, -3, 4.0, 5.8],
    ] as const) {
      const bush = taper(size, size * 0.45, height, leaf, 5);
      bush.position.set(x, 112, z);
      group.add(bush);
    }

    // -----------------------------------------------------------------------
    // 2. The fall. Five sections, each wider and further forward than the one
    //    above it, ending in haze rather than in a pool.
    // -----------------------------------------------------------------------
    let previous = STRATA[STRATA.length - 2]![2] + 1.0;
    for (let i = 0; i < RIBBON.length; i++) {
      const [top, bottom, half, front] = RIBBON[i]!;
      block(FALL_X - half, FALL_X + half, bottom, top, previous - 1.2, front, i % 2 === 0 ? water : spray);
      previous = front;
    }
    // The notch it comes over, cut back into the rim. Its top stops `PROUD`
    // under the plateau's: flush, the water and the scrub shared a plane.
    block(FALL_X - 2.4, FALL_X + 2.4, 104, 112 - PROUD, 0.4, 3.2, water);

    // A second, seasonal cascade off the right-hand rim. Auyán-tepui carries a
    // dozen of these after rain and one of them is what keeps this cliff from
    // reading as a wall with a single decal on it.
    block(23.6, 25.4, 74, 104, 1.0, 2.0, spray);
    block(23.2, 26.0, 56, 74, 2.0, 3.4, water);

    // The haze. Three masses of falling brightness, wider than the ribbon and
    // standing further out than it, which is what dispersing looks like.
    block(FALL_X - 5.0, FALL_X + 4.4, 22, 38, 5.6, 9.0, spray);
    block(FALL_X - 8.4, FALL_X + 7.2, 12, 24, 6.6, 12.4, spray);

    // -----------------------------------------------------------------------
    // 3. The foot. Talus, jungle and the river — the Churún runs out of the
    //    bottom of this and it is the only way anyone gets here.
    //
    //    Everything down here is kept **low**: at 13.4 degrees a mass 20 units
    //    tall with its front at z = 22 hides the cliff behind it to y = 24, and
    //    the fall stops at 26. Two units more of jungle would have eaten the
    //    bottom of the waterfall.
    // -----------------------------------------------------------------------
    block(-38, 34, 0, 4.0, 5.0, 22.0, rock);
    block(-19, 12, 1.0, 2.2, 14.0, 27.0, pool);
    for (const [x, z, size, height] of [
      [-34, 12, 5.2, 12.0],
      [-22, 19, 4.0, 8.6],
      [18, 10, 5.6, 13.4],
      [29, 18, 4.2, 9.2],
      [7, 20, 3.6, 7.0],
    ] as const) {
      const tree = taper(size, size * 0.4, height, z > 15 ? leaf : rim, 5);
      tree.position.set(x, 3.4, z);
      group.add(tree);
    }
    // Boulders in the river bed, which is what the foot of a tepui is made of.
    for (const [x, z, size] of [
      [-24, 24, 3.0],
      [-6, 26, 2.4],
      [9, 24, 2.8],
    ] as const) {
      const boulder = taper(size, size * 0.7, size * 1.1, rock, 6);
      boulder.position.set(x, 1.4, z);
      group.add(boulder);
    }

    return group;
  },
};
