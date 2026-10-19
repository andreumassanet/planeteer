import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * The Flame Towers, Baku.
 *
 * Three glass towers on the hill over the Caspian, each shaped like a flame:
 * swelling from its foot, then drawing in to a point that leans towards the
 * other two, so the three together are a fire. What names them is that
 * profile and the trio; the glass is `skyBlue` toned down, and the flames'
 * tips lean inward.
 *
 * Each tower is a stack of five-sided frusta whose centres move towards the
 * middle as they rise. The tallest stands at the back. Drawn 69 tall for
 * 182 m.
 */

const DEG = Math.PI / 180;

/** The flame profile: [height fraction, apothem]. */
const PROFILE: [t: number, r: number][] = [
  [0, 4.6],
  [0.22, 5.6],
  [0.46, 5.2],
  [0.66, 4.0],
  [0.82, 2.5],
  [0.94, 1.1],
  [1, 0.2],
];

/** The three: [bearing, distance out, height]. */
const TOWERS: [bearing: number, out: number, h: number][] = [
  [180, 12.5, 67.5],
  [60, 12.5, 59],
  [300, 12.5, 56],
];

export const flameTowers: Monument = {
  id: 'flame-towers',
  name: 'Flame Towers',
  iso: 'AZE',
  lat: 40.3594,
  lon: 49.8264,
  realHeight: 182,
  tier: 'tower',
  surface: 'metal',
  footprint: 22,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);

    const glass = tone(palette.skyBlue, 0.7);
    const podium = column(18, 1.4, tone(palette.sand, 0.9), 12);
    add(podium);

    for (const [bearing, out, h] of TOWERS) {
      const bx = Math.sin(bearing * DEG) * out;
      const bz = Math.cos(bearing * DEG) * out;
      for (let i = 1; i < PROFILE.length; i++) {
        const [ta, ra] = PROFILE[i - 1]!;
        const [tb, rb] = PROFILE[i]!;
        // The centre is drawn in towards the middle as the flame rises.
        const pull = 1 - 0.6 * ((ta + tb) / 2) ** 2.2;
        const section = taper(ra, rb, (tb - ta) * h, glass, 5);
        section.position.set(bx * pull, 1.4 + ta * h, bz * pull);
        section.rotation.y = bearing * DEG;
        add(section);
      }
    }

    return ctx.merge(draft);
  },
};
