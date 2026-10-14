import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Las Lajas Sanctuary, Ipiales, Colombia.
 *
 * A neo-Gothic church standing on a viaduct across a river gorge. y = 0 is the
 * river (a monument cannot go below its base), so the canyon walls are two
 * masses of rock beside it, 32 units high, with the bridge spanning between
 * them and the church on top. The gorge runs toward the camera so the bridge is
 * seen broadside, and the walls sit at x = +-17 to +-23 so they do not hide the
 * arches.
 *
 * Every arch head is three stepped courses of falling width, set shallower than
 * the wall they hang in, rather than a `column` on its side: a laid-down prism
 * is a whole prism and its ink hull would draw the buried half as a wheel.
 *
 * About 1.84:1 from river to cross against bridge width (2:1 in life); nothing
 * is stretched. No `realHeight`: the quoted figure is measured from the
 * riverbed.
 */

/** The gorge: the river's half-width, and where the rock starts and stops. */
const RIVER = 4.5;
const WALL_IN = 17;
const WALL_OUT = 23;
const WALL_TOP = 32;
const GORGE_Z = 13;

/** The bridge: its piers, its deck, and the two levels of arcade under it. */
const PIER = 2.9;
const ABUTMENT = 14.2;
const DECK = 26;
const DECK_TOP = 33.4;
const SPAN_Z = 8.5;

export const lasLajas: Monument = {
  id: 'las-lajas',
  name: 'Las Lajas Sanctuary',
  iso: 'COL',
  lat: 0.8047,
  lon: -77.5854,
  tier: 'tower',
  footprint: 27,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper } = ctx;

    const church = palette.white; // warm white: grey stone that still has hue in shade
    const roof = palette.slate; // the roofs and the spires, and the only cool mass up top
    const masonry = palette.tan; // the bridge, which is a different and warmer stone
    const rock = palette.brown; // the canyon walls
    const seam = palette.clay; // one band through them, so 32 units of rock is not one plane
    const dark = palette.bark; // the portal and every arch soffit
    const water = palette.skyBlue; // the Guáitara, and the rose window
    const leaf = palette.darkOlive;
    const bright = palette.green;

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

    /**
     * An arch: two jambs, a dark soffit between them and a three-course pointed
     * head. Every course is shallower than the void (see `column` in `contract.ts`).
     */
    const arch = (
      centre: number,
      half: number,
      // Where the void starts: the upper arcade does not stand on the ground.
      base: number,
      spring: number,
      crown: number,
      z0: number,
      z1: number,
    ): void => {
      block(centre - half, centre + half, base, spring, z0 + 0.8, z1 - 0.8, dark);
      const rise = (crown - spring) / 3;
      const widths = [half, half * 0.78, half * 0.42];
      for (let i = 0; i < 3; i++) {
        block(
          centre - widths[i]!,
          centre + widths[i]!,
          spring + i * rise,
          spring + (i + 1) * rise,
          z0 + 0.5,
          z1 - 0.5,
          masonry,
        );
      }
    };

    // --- 1. The gorge: two walls of rock and the river between them ---
    block(-RIVER, RIVER, 0, 0.9, -GORGE_Z, GORGE_Z, water);
    for (const side of [-1, 1]) {
      block(side * WALL_IN, side * WALL_OUT, 0, WALL_TOP, -GORGE_Z, GORGE_Z, rock);
      // One bright seam through the rock, stopped `PROUD` inside the back face.
      block(side * (WALL_IN - 0.6), side * (WALL_OUT - PROUD), 11, 15, -GORGE_Z - 0.5, GORGE_Z + 0.5, seam);
      // The talus at the foot, sloping in toward the river.
      block(side * RIVER, side * WALL_IN, 0, 3.2, -GORGE_Z, GORGE_Z, rock);
      block(side * (RIVER + 3), side * WALL_IN, 3.2, 7.0, -GORGE_Z, GORGE_Z, rock);

      // Trees on the canyon rim; the dark clumps separate the rock from the sky.
      for (const [dz, size, height] of [
        [-8, 3.4, 7.2],
        [3, 2.8, 5.4],
      ] as const) {
        const tree = taper(size, size * 0.45, height, dz < 0 ? leaf : bright, 5);
        tree.position.set(side * 20, WALL_TOP, dz);
        group.add(tree);
      }
    }

    // --- 2. The bridge: abutment piers, a river pier, two great arches and an arcade ---
    // The river pier's foot sits `PROUD` under the arches' soffits.
    for (const x of [-ABUTMENT, 0, ABUTMENT]) {
      const half = x === 0 ? PIER : PIER + 1.4;
      block(x - half, x + half, x === 0 ? 3.0 - PROUD : 0, DECK, -SPAN_Z, SPAN_Z, masonry);
    }
    arch(-ABUTMENT / 2, 4.6, 3.0, 14.0, DECK - 1.2, -SPAN_Z, SPAN_Z);
    arch(ABUTMENT / 2, 4.6, 3.0, 14.0, DECK - 1.2, -SPAN_Z, SPAN_Z);

    // The arcade: three arches on top of the great two (an `arch` is four meshes).
    block(-18.4, 18.4, DECK, DECK + 0.9, -SPAN_Z - 0.6, SPAN_Z + 0.6, masonry);
    for (const x of [-11, 0, 11]) {
      arch(x, 3.4, DECK + 0.9, 29.4, DECK_TOP - 1.0, -SPAN_Z - 0.4, SPAN_Z + 0.4);
    }
    block(-19.0, 19.0, DECK_TOP - 1.0, DECK_TOP, -SPAN_Z - 1.0, SPAN_Z + 1.0, masonry);

    // --- 3. The church: two front towers, a taller one behind, and a nave ---
    block(-8.2, 8.2, DECK_TOP, 52.0, -7.0, 7.0, church);
    // Buttresses down each flank, stepped out so the wall is not a slab.
    for (const side of [-1, 1]) {
      for (const z of [-4.4, 0, 4.4]) {
        block(side * 8.2, side * 9.6, DECK_TOP, 48.0, z - 1.1, z + 1.1, church);
        const pinnacle = taper(1.15, 0.22, 3.8, roof, 4);
        pinnacle.position.set(side * 8.9, 48.0, z);
        group.add(pinnacle);
      }
    }
    // The nave roof, in two courses so it reads as a roof rather than as a lid.
    block(-8.6, 8.6, 52.0, 54.2, -7.4, 7.4, roof);
    block(-6.4, 6.4, 54.2, 56.4, -5.6, 5.6, roof);

    // The two front towers.
    for (const side of [-1, 1]) {
      const x = side * 5.6;
      block(x - 2.7, x + 2.7, DECK_TOP, 50.0, 3.0, 8.4, church);
      block(x - 3.0, x + 3.0, 50.0, 51.4, 2.6, 8.8, church);
      const spire = taper(2.9, 0.35, 7.4, roof, 4);
      spire.position.set(x, 51.4, 5.7);
      group.add(spire);
      // Lancets: two tall dark slots to a tower.
      for (const at of [-1.2, 1.2]) {
        block(x + at - 0.45, x + at + 0.45, 40.0, 47.6, 8.4, 8.75, dark);
      }
    }

    // The central tower over the crossing, and its spire.
    block(-3.4, 3.4, DECK_TOP, 54.0, -3.4, 3.4, church);
    block(-3.8, 3.8, 54.0, 55.6, -3.8, 3.8, church);
    const spire = taper(3.6, 0.4, 11.6, roof, 4);
    spire.position.y = 55.6;
    group.add(spire);
    block(-0.18, 0.18, 66.0, 69.8, -0.18, 0.18, roof);
    block(-1.1, 1.1, 68.0, 68.4, -0.16, 0.16, roof);

    // --- 4. The west front, between the towers: a portal, a rose window and a gable ---
    block(-2.8, 2.8, DECK_TOP, 41.0, 6.4, 8.4, dark);
    block(-2.2, 2.2, 41.0, 42.6, 6.4, 8.4, dark);
    block(-1.4, 1.4, 42.6, 43.6, 6.4, 8.4, dark);
    for (const side of [-1, 1]) {
      block(side * 2.8, side * 3.6, DECK_TOP, 44.4, 6.4, 8.8, church);
    }
    block(-3.6, 3.6, 44.4, 45.4, 6.4, 8.8, church);

    const rose = column(2.3, 0.5, water, 8);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(0, 48.4, 8.4);
    group.add(rose);
    const surround = column(3.0, 0.35, church, 8);
    surround.rotation.x = Math.PI / 2;
    surround.position.set(0, 48.4, 8.05);
    group.add(surround);

    return group;
  },
};
