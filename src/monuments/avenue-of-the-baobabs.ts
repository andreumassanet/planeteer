import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Avenue of the Baobabs — Menabe, Madagascar.
 *
 * A grove: six Grandidier's baobabs along a laterite track, seen along the road
 * (it runs in z). The recognition is the near-parallel trunk (it loses 0.58 of
 * half-width over 25 units of rise) under a flat crown 15 across on a 33-unit
 * tree, with every limb leaving the top at 22 to 34 degrees above horizontal.
 *
 * The trunk is about twice as fat as life (29 on 5, 5.8:1 against 10:1) so the
 * ink lines down its sides do not close into one stroke. The crown is thin: five
 * primaries, two secondaries and two small `darkOlive` pads, enough that it does
 * not read as a dead stick.
 *
 * Trees are staggered, not paired (z = -19, -6, 7, 20 on one side, -13, 6 on the
 * other), so each trunk is its own vertical, and they differ in height (33.0 to
 * 27.1). The tallest is 33 because the crown finishes about 5.3 above its trunk
 * and the tier ceiling is 40. Half-diagonal 32.0 over height 38.1 is 0.84. No
 * `realHeight`: a grove has none.
 *
 * The model owns no ground: a green plate would show as a rectangle cut into
 * the savanna's dry gold, so the track sits directly on what `biome.ts` draws.
 */

/**
/**
 * One trunk, as [top of the section, half-width at the bottom, at the top], for
 * a 29-unit tree, scaled by the individual's height. Only the last section
 * narrows quickly: a baobab has no shoulders.
 */
const TRUNK: [top: number, bottom: number, apex: number][] = [
  [3.2, 2.62, 2.5],
  [11.0, 2.5, 2.36],
  [18.5, 2.36, 2.22],
  [25.0, 2.22, 2.04],
  [29.0, 2.04, 1.35],
];
const TRUNK_HEIGHT = 29.0;

/** [x, z, height]. Staggered, not paired — see the note above. */
const TREES: [x: number, z: number, height: number][] = [
  [-12.5, -19, 33.0],
  [-12.5, -6, 28.5],
  [-12.5, 7, 31.6],
  [-12.5, 20, 27.1],
  [12.5, -13, 30.7],
  [12.5, 6, 29.7],
];

/** Half-width of the road, and how far along z it runs. */
const ROAD = 6.5;
const ROAD_END = 26;

export const avenueOfTheBaobabs: Monument = {
  id: 'avenue-of-the-baobabs',
  name: 'Avenue of the Baobabs',
  iso: 'MDG',
  lat: -20.2506,
  lon: 44.4181,
  tier: 'building',
  surface: 'none',
  footprint: 34,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, taper, strut, around } = ctx;

    const bark = palette.blush; // smooth, pale, faintly pink: this really is the colour
    const limb = palette.brown; // the crown, which is a different surface and a darker one
    const leaf = palette.darkOlive; // the two pads a bare tree needs to not be a stick
    const laterite = palette.clay; // the road, and the reason the photographs look like that
    const rut = palette.brown; // packed earth in the wheel tracks, a shade off the laterite
    const scrub = palette.darkOlive;

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
    // 1. The road: a 13-unit red track laid straight on the savanna.
    // -----------------------------------------------------------------------
    block(-ROAD, ROAD, 0, 0.4, -ROAD_END, ROAD_END, laterite);
    // Ruts: two darker strips of packed earth (`brown`) down the track.
    for (const side of [-1, 1]) {
      block(side * 2.0, side * 3.6, 0.4, 0.55, -ROAD_END, ROAD_END, rut);
    }

    // -----------------------------------------------------------------------
    // 2. The trees.
    // -----------------------------------------------------------------------
    for (const [x, z, height] of TREES) {
      const k = height / TRUNK_HEIGHT;
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      group.add(tree);

      let base = 0;
      for (const [top, bottom, apex] of TRUNK) {
        const section = taper(bottom * k, apex * k, (top - base) * k, bark, 6);
        section.position.y = base * k;
        tree.add(section);
        base = top;
      }

      // The crown. Five primaries leaving the top at 22 to 34 degrees, then two
      // secondaries off the two longest, and two pads. `strut` places by its
      // endpoints, so no rotation is needed (every tree is scaled by its height).
      const top = height;
      const reach = 6.4 * k;
      tree.add(
        around(5, (index) => {
          const rise = [2.9, 4.1, 2.4, 3.6, 3.1][index]! * k;
          const out = reach * [1.0, 0.82, 1.06, 0.9, 0.96][index]!;
          const limbGroup = new THREE.Group();
          limbGroup.add(
            strut(
              new THREE.Vector3(0, top - 1.6 * k, 0.6 * k),
              new THREE.Vector3(0, top - 1.6 * k + rise, out),
              0.72 * k,
              limb,
            ),
          );
          if (index === 1 || index === 3) {
            limbGroup.add(
              strut(
                new THREE.Vector3(0, top - 1.6 * k + rise, out),
                new THREE.Vector3(0.9 * k, top - 1.6 * k + rise * 1.45, out + 2.2 * k),
                0.42 * k,
                limb,
              ),
            );
          }
          return limbGroup;
        }),
      );

      for (const [dx, dz, size] of [
        [-1.6, 3.4, 2.5],
        [2.4, -2.2, 2.0],
      ] as const) {
        const pad = taper(size * k, size * 0.6 * k, 1.5 * k, leaf, 6);
        pad.position.set(dx * k, top + 1.3 * k, dz * k);
        tree.add(pad);
      }
    }

    // -----------------------------------------------------------------------
    // 3. The scrub: four low bushes either side of the track.
    // -----------------------------------------------------------------------
    for (const [x, z, size] of [
      [-17.0, -12, 2.6],
      [-16.2, 14, 2.1],
      [16.6, -2, 2.4],
      [17.2, 19, 1.9],
    ] as const) {
      const bush = taper(size, size * 0.5, size * 1.8, scrub, 5);
      bush.position.set(x, 0, z);
      group.add(bush);
    }

    return group;
  },
};
