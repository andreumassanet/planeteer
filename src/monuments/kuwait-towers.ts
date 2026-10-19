import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * Kuwait Towers, Kuwait City.
 *
 * Three needles on the Gulf shore: the main tower with a great sphere (the
 * water tank and the restaurant) and a small one above it (the viewing
 * sphere), the second with one sphere, and the third bare, a mast of lights.
 * What names them is the spheres impaled on spires, and their skin of
 * enamelled discs in blues and greens: here two tones of `skyBlue` in bands of
 * latitude, with a `green` band just over each equator.
 *
 * The spheres are stacks of eleven-sided frusta through the profile of a
 * circle, so their ink draws the rings of discs. The spires are `white`, the
 * spheres slightly bigger against their shafts than life so they read from
 * across the bay. Main tower 187 m drawn at 69.5.
 */

/** [x, z, height, foot apothem, spheres as [centre height, radius]] */
const TOWERS: [x: number, z: number, h: number, foot: number, spheres: [y: number, r: number][]][] = [
  [0, 2, 69.5, 1.7, [[34, 7.6], [49.5, 3.8]]],
  [10.5, -4.5, 55, 1.4, [[31, 5.8]]],
  [-8.5, -5.5, 44, 1.0, []],
];

export const kuwaitTowers: Monument = {
  id: 'kuwait-towers',
  name: 'Kuwait Towers',
  iso: 'KWT',
  lat: 29.3896,
  lon: 48.0031,
  realHeight: 187,
  tier: 'tower',
  surface: 'concrete',
  surfaces: { skyBlue: 'metal', green: 'metal' },
  footprint: 17.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);

    const sphere = (x: number, z: number, cy: number, r: number): void => {
      const slices = 8;
      for (let i = 0; i < slices; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / slices;
        const b = -Math.PI / 2 + (Math.PI * (i + 1)) / slices;
        const y0 = cy + r * Math.sin(a);
        const y1 = cy + r * Math.sin(b);
        const r0 = Math.max(0.15, r * Math.cos(a));
        const r1 = Math.max(0.15, r * Math.cos(b));
        const equator = i === slices / 2;
        const color = equator ? palette.green : tone(palette.skyBlue, i % 2 ? 0.72 : 0.86);
        const band = taper(r0, r1, y1 - y0, color, 11);
        band.position.set(x, y0, z);
        add(band);
      }
    };

    // The forecourt the three stand on.
    const plaza = column(13.5, 0.6, palette.sand, 12);
    add(plaza);

    for (const [x, z, h, foot, spheres] of TOWERS) {
      // A shaft that tapers the whole way, a collar at its foot and a point at the top.
      const collar = taper(foot * 1.9, foot * 1.2, 2.2, palette.cream, 8);
      collar.position.set(x, 0.6, z);
      add(collar);
      const shaft = taper(foot, foot * 0.42, h * 0.84, palette.white, 8);
      shaft.position.set(x, 0.6, z);
      add(shaft);
      const tip = taper(foot * 0.42, 0.05, h * 0.16 - 0.6, palette.white, 8);
      tip.position.set(x, 0.6 + h * 0.84, z);
      add(tip);
      for (const [cy, r] of spheres) sphere(x, z, cy, r);
      if (spheres.length === 0) {
        // The bare tower's light rings.
        for (const y of [18, 26, 34]) {
          const ring = column(foot * 1.6, 0.5, tone(palette.skyBlue, 0.8), 8);
          ring.position.set(x, y, z);
          add(ring);
        }
      }
    }

    return ctx.merge(draft);
  },
};
