import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Angel Falls — Salto Ángel, Canaima, Venezuela.
 *
 * The 979 m waterfall off the Auyán-tepui, tier `landmark` (far taller than
 * wide, so the aspect cap costs nothing: 45.7 against 119.4).
 *
 * The cliff is five bands stepped back in depth as well as colour, so each band
 * gets its own ink line (coplanar meshes get none); the colours run as a
 * gradient, dark at the foot. Two spurs flank the fall to give the rock a plan.
 * The top band overhangs and is `darkOlive`, like the scrub-covered rim.
 *
 * The water never reaches the bottom: five boxes grow wider (2.6 to 5.6) and
 * stand further forward (3.2 to 7.0) as they fall, ending at y = 26 in a bank
 * of `cream` haze. The fall is off-centre at x = -7, as on the real rim.
 */

/**
 * The cliff, band by band: [top of the band, half-width, how far forward its
 * face stands]. The third column falls 6.0 to 0.4 (the batter), then the last
 * row steps back out for the undercut rim.
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
 * forward of the band behind it].
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
  surface: 'none',
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
    // Bottom to top: dark at the foot, lighter as it rises (a gradient, not stripes).
    const bandColor = [deep, rock, dry, dry, rim];
    let base = 0;
    for (let i = 0; i < STRATA.length; i++) {
      const [top, half, front] = STRATA[i]!;
      block(-half, half, base, top, CLIFF_BACK, front, bandColor[i]!);

      base = top;
    }

    // The two spurs: three courses each, standing proud of the wall and tapering,
    // so the fall sits in a recess.
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

    // A second, seasonal cascade off the right-hand rim.
    block(23.6, 25.4, 74, 104, 1.0, 2.0, spray);
    block(23.2, 26.0, 56, 74, 2.0, 3.4, water);

    // The haze. Three masses of falling brightness, wider than the ribbon and
    // standing further out than it, which is what dispersing looks like.
    block(FALL_X - 5.0, FALL_X + 4.4, 22, 38, 5.6, 9.0, spray);
    block(FALL_X - 8.4, FALL_X + 7.2, 12, 24, 6.6, 12.4, spray);

    // -----------------------------------------------------------------------
    // 3. The foot: talus, jungle and the river. Kept low: a mass 20 units tall
    //    with its front at z = 22 would hide the cliff to y = 24, and the fall
    //    stops at 26.
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
