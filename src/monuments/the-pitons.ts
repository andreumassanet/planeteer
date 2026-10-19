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
 * Every section of both peaks is a seven-sided `taper`, each turned a little
 * against the one under it so the facets break into spurs and gullies; Petit's
 * profile is concave, a spire, and Gros's convex, a dome. Both cones are one
 * `green` and the cel ramp does the shading. The bare andesite is laid on the
 * slopes as ribs running down the fall line, not as blocks at the foot, and
 * the forest is a skirt of round crowns in a deep green with the sea's sand
 * under it.
 */

const DEG = Math.PI / 180;

/** A peak, as [height, apothem] steps from the foot to the top. */
const PETIT: [y: number, r: number][] = [
  [0, 14.5],
  [7, 11.0],
  [15, 8.0],
  [23, 5.6],
  [31, 3.6],
  [36.5, 2.0],
  [39.6, 0.5],
];

const GROS: [y: number, r: number][] = [
  [0, 20.5],
  [8, 17.5],
  [16, 14.4],
  [23, 11.2],
  [28, 7.8],
  [31, 3.8],
];

/** The turn of each step against the last, degrees: what makes the spurs. */
const TWIST = [0, 4, -3, 5, -2, 4, 0];

/** Where each peak stands. Petit is nearer the camera and Gros is behind it. */
const PETIT_AT: [x: number, z: number] = [11, 6];
const GROS_AT: [x: number, z: number] = [-12.5, -5];

/** Bare rock down the fall line: [which peak, bearing, from height, to height, width]. */
const RIBS: [peak: 'petit' | 'gros', bearing: number, from: number, to: number, width: number][] = [
  ['petit', 20, 6, 33, 2.6],
  ['petit', 70, 4, 26, 2.0],
  ['petit', -35, 10, 30, 1.6],
  ['gros', 35, 6, 25, 2.4],
];

/** The forest skirt: [x, z, crown radius]. */
const CROWNS: [x: number, z: number, r: number][] = [
  [26.5, 12.5, 3.6], [22.0, 18.5, 3.0], [14.0, 23.0, 3.8], [5.5, 21.5, 3.0],
  [-3.5, 17.5, 3.4], [-12.0, 15.5, 3.0], [29.0, 1.0, 3.2], [24.0, -9.0, 3.0],
  [-26.0, 11.0, 3.4], [-31.0, -2.0, 3.0], [-27.0, -15.0, 3.2], [-14.0, -24.0, 3.0],
  [3.0, -15.0, 3.4], [-0.5, 6.5, 3.6],
];

export const thePitons: Monument = {
  id: 'the-pitons',
  name: 'The Pitons',
  iso: 'LCA',
  lat: 13.81,
  lon: -61.06,
  realHeight: 771,
  tier: 'building',
  surface: 'none',
  footprint: 38,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, strut } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);
    const canopy = palette.green;
    const rock = tone(palette.slate, 0.85);
    const jungle = tone(palette.green, 0.66);

    const apothemAt = (steps: [number, number][], y: number): number => {
      for (let i = 1; i < steps.length; i++) {
        const [ya, ra] = steps[i - 1]!;
        const [yb, rb] = steps[i]!;
        if (y <= yb) return ra + ((rb - ra) * (y - ya)) / (yb - ya);
      }
      return steps[steps.length - 1]![1];
    };

    const peak = (steps: [number, number][], [x, z]: [number, number]): void => {
      for (let i = 1; i < steps.length; i++) {
        const [ya, ra] = steps[i - 1]!;
        const [yb, rb] = steps[i]!;
        const shell = taper(ra, rb, yb - ya, canopy, 7);
        shell.position.set(x, ya, z);
        shell.rotation.y = TWIST[i]! * DEG;
        add(shell);
      }
    };

    // 1. The two peaks: Petit a spire nearer the bay, Gros a dome behind it.
    peak(PETIT, PETIT_AT);
    peak(GROS, GROS_AT);

    // 2. The col between them, Piton Mitan, lower and darker.
    const col = taper(9.5, 5.5, 9, tone(palette.green, 0.82), 6);
    col.position.set(-1.5, 0, 0.5);
    add(col);

    // 3. Bare andesite down the fall line, a little proud of the slope.
    for (const [which, bearing, from, to, width] of RIBS) {
      const steps = which === 'petit' ? PETIT : GROS;
      const [x, z] = which === 'petit' ? PETIT_AT : GROS_AT;
      const at = (y: number) => {
        const r = apothemAt(steps, y) + 0.35;
        return new THREE.Vector3(x + Math.sin(bearing * DEG) * r, y, z + Math.cos(bearing * DEG) * r);
      };
      // In short runs, so the rib follows the slope's curve instead of cutting its chord.
      const runs = 4;
      for (let i = 0; i < runs; i++) {
        const y0 = from + ((to - from) * i) / runs;
        const y1 = from + ((to - from) * (i + 1)) / runs;
        add(strut(at(y0), at(y1), width * (1 - 0.12 * i), rock));
      }
    }

    // 4. The forest skirt: round broadleaf crowns on short trunks.
    for (const [x, z, r] of CROWNS) {
      const trunk = column(0.5, 1.6, palette.bark, 5);
      trunk.position.set(x, 0, z);
      add(trunk);
      const crown = taper(r, r * 0.55, r * 1.2, jungle, 7);
      crown.position.set(x, 1.4, z);
      add(crown);
      const top = taper(r * 0.55, r * 0.15, r * 0.5, jungle, 7);
      top.position.set(x, 1.4 + r * 1.2, z);
      add(top);
    }

    return ctx.merge(draft);
  },
};
