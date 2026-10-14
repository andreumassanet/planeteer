import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * The Pitons, Soufrière, Saint Lucia.
 *
 * A pair of volcanic plugs 2 km apart, one sharp and one broad, forested to the
 * summit and dropping straight into the water; the pair is the recognition.
 * Petit is 743 m on a base about a kilometre across (a mean slope of 56 degrees)
 * and Gros is 771 m on a base half again as wide (about 46). The model builds
 * them at 65 and 58 degrees, steeper by 1.4x and 1.5x, because every
 * photograph is taken from the water or across the bay, where the rock fills
 * the sky. The exaggeration is deliberately unequal, so a spire and a dome read
 * as two mountains rather than one drawn twice. Half-diagonal over height is
 * 0.92 against the cap of 2.
 *
 * The model owns no ground and has no sea: Saint Lucia's ring is 50 units wide
 * and this model 73 across, so the world's own ocean comes up to their feet,
 * and they stand on whatever `biome.ts` gives (the shore band's pale sand).
 *
 * Every section of both peaks is a seven-sided `taper`: few joints read as
 * natural, and seven gives the sunlit half two cel bands with the ridges
 * between facets reading as spurs. The sections are the only regular
 * subdivision on the slopes. Both cones are one `green` from foot to summit and
 * the cel ramp does the shading, because colour banding by height produced a
 * dark skirt that hid the dark trees at the feet. Every dark and grey in the
 * model is a feature big enough to see: three andesite cliffs (20 units tall)
 * and ten clumps of forest.
 */

/**
 * A peak, as a stack of [top of the section, apothem at the foot, apothem at the
 * top]. Petit ends at 0.8 and Gros at 6.2: a spire and a dome.
 */
const PETIT: [top: number, bottom: number, apex: number][] = [
  [9.0, 14.0, 11.6],
  [19.0, 11.6, 8.7],
  [28.0, 8.7, 5.6],
  [34.5, 5.6, 3.0],
  [39.4, 3.0, 0.7],
];

const GROS: [top: number, bottom: number, apex: number][] = [
  [8.0, 20.0, 17.5],
  [16.0, 17.5, 14.5],
  [23.0, 14.5, 11.0],
  [28.5, 11.0, 7.0],
];

/** Where each peak stands. Petit is nearer the camera and Gros is behind it. */
const PETIT_AT: [x: number, z: number] = [11, 6];
const GROS_AT: [x: number, z: number] = [-12.5, -5];

/**
 * The bare andesite, as [x, z, foot, apothem at the foot, height, lean, yaw].
 * Three, each big enough to be a face rather than a speckle.
 */
const CLIFFS: [x: number, z: number, y: number, size: number, tall: number, lean: number, yaw: number][] = [
  [15.5, 15.5, 2.0, 6.4, 20.0, 0.30, 0.5],
  [20.0, 3.0, 4.0, 4.2, 12.0, 0.26, 1.5],
  [-7.5, 11.0, 2.0, 5.0, 11.0, 0.22, -0.4],
];

/** Forest clumps, as [x, z, height]. Ten, all `darkOlive` against the peaks' `green`, all big. */
const CLUMPS: [x: number, z: number, height: number][] = [
  [27.5, 13.0, 11.5],
  [24.0, 18.5, 7.5],
  [11.0, 25.0, 12.0],
  [5.0, 22.0, 8.0],
  [-4.5, 18.0, 9.5],
  [31.0, -1.0, 10.0],
  [24.5, -13.0, 8.5],
  [-25.5, 12.0, 11.0],
  [-31.5, -3.5, 9.0],
  [-21.0, -20.5, 11.5],
  [-6.5, -23.5, 8.0],
];

export const thePitons: Monument = {
  id: 'the-pitons',
  name: 'The Pitons',
  iso: 'LCA',
  lat: 13.81,
  lon: -61.06,
  realHeight: 771,
  tier: 'building',
  footprint: 38,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, taper } = ctx;

    const canopy = palette.green; // the rainforest that covers both peaks to the summit
    const deep = palette.darkOlive; // the clumps at the feet, and the col between the two
    const cliff = palette.slate; // bare andesite: the only cool colour, and the only grey
    const scrub = palette.bark; // trunks, warm enough to keep hue in the shade they sit in

    const group = new THREE.Group();

    /** One peak: a stack of seven-sided frusta, all one colour. */
    const peak = (
      sections: [top: number, bottom: number, apex: number][],
      x: number,
      z: number,
    ): Object3D => {
      const mountain = new THREE.Group();
      mountain.position.set(x, 0, z);
      let base = 0;
      for (const [top, bottom, apex] of sections) {
        const shell = taper(bottom, apex, top - base, canopy, 7);
        shell.position.y = base;
        mountain.add(shell);
        base = top;
      }
      group.add(mountain);
      return mountain;
    };

    // 1. The two peaks. Petit is 39.4 units and comes to a point; Gros is 30 and
    //    stops at an apothem of 6.2, a dome. Petit stands nearer the camera, so it
    //    is the taller (Gros is really 28 m higher), as in every photograph from
    //    Soufrière Bay.
    peak(PETIT, PETIT_AT[0], PETIT_AT[1]);
    peak(GROS, GROS_AT[0], GROS_AT[1]);

    // 2. Piton Mitan, the col: two low masses joining the feet of the peaks, which
    //    gives the pair depth.
    const saddleA = taper(10.0, 7.0, 8.0, deep, 6);
    saddleA.position.set(-1.0, 0, 2.0);
    group.add(saddleA);
    const saddleB = taper(8.0, 5.0, 5.5, deep, 6);
    saddleB.position.set(-3.0, 0, -8.0);
    group.add(saddleB);

    // 3. The rock. Petit Piton's seaward face is bare andesite for most of its
    //    height, and grey against all that green tells the peaks apart. Each cliff
    //    is one leaning frustum: a rotation with no scale on the same object.
    for (const [x, z, y, size, tall, lean, yaw] of CLIFFS) {
      const rock = taper(size, size * 0.32, tall, cliff, 5);
      rock.rotation.set(Math.cos(yaw) * lean, yaw, -Math.sin(yaw) * lean);
      rock.position.set(x, y, z);
      group.add(rock);
    }

    // 4. The forest at the feet: ten clumps, none on a grid, each about a quarter
    //    of Petit Piton's height, so the base is broken and reads as jungle.
    for (const [x, z, height] of CLUMPS) {
      const trunk = taper(0.75, 0.6, height * 0.30, scrub, 5);
      trunk.position.set(x, 0, z);
      group.add(trunk);
      // Blunt, not pointed: a crown that keeps 0.44 of its width at the top reads as broadleaf, not spruce.
      const crown = taper(height * 0.42, height * 0.28, height * 0.66, deep, 7);
      crown.position.set(x, height * 0.26, z);
      group.add(crown);
    }

    return group;
  },
};
