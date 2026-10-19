import type { Group, Monument, MonumentContext, Object3D } from './contract.ts';

/**
 * The Darvaza Gas Crater, Turkmenistan: the Door to Hell.
 *
 * A collapsed drilling site in the Karakum, 69 m across and 30 deep, burning
 * since it was lit in 1971. What names it is a ring of pale desert rim round a
 * pit full of fire: an orange floor and tongues of flame along the inner
 * walls, brightest in the middle.
 *
 * The rim is a `ringWall` on a low sand apron; the inner wall `clay`, the
 * floor `orange`, the flames `gold`, `orange` and `red` frusta of fixed
 * heights, set round the inside at fixed bearings. Tier `monument`: the
 * flames are stretched upwards to keep the crater within `MAX_ASPECT`.
 */

const DEG = Math.PI / 180;

/** Flames: [bearing, distance from the centre, height, radius, colour]. */
const FLAMES: [bearing: number, out: number, h: number, r: number, c: 'gold' | 'orange' | 'red'][] = [
  [0, 2.0, 7.4, 1.4, 'gold'],
  [140, 2.6, 6.2, 1.3, 'orange'],
  [250, 2.2, 6.8, 1.2, 'gold'],
  [20, 6.0, 4.6, 1.1, 'orange'],
  [70, 6.4, 3.4, 0.9, 'red'],
  [115, 5.8, 4.2, 1.0, 'gold'],
  [165, 6.6, 3.0, 0.9, 'orange'],
  [205, 6.0, 4.8, 1.1, 'red'],
  [235, 6.5, 3.4, 0.9, 'gold'],
  [285, 6.2, 4.4, 1.0, 'orange'],
  [325, 6.6, 3.2, 0.9, 'red'],
  [350, 4.4, 5.4, 1.0, 'orange'],
  [95, 4.0, 5.6, 1.1, 'red'],
  [190, 4.0, 5.0, 1.0, 'gold'],
];

export const darvazaGasCrater: Monument = {
  id: 'darvaza-gas-crater',
  name: 'Darvaza Gas Crater',
  iso: 'TKM',
  lat: 40.2525,
  lon: 58.4397,
  tier: 'monument',
  surface: 'none',
  footprint: 14,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, taper, column, ringWall } = ctx;
    const draft = new THREE.Group();
    const add = (o: Object3D): void => void draft.add(o);

    // The apron of spoil and the rim.
    add(ringWall(9.0, 13.9, 0.8, tone(palette.sand, 0.92), 12));
    const rim = ringWall(8.6, 12.4, 1.8, palette.sand, 12);
    rim.position.y = 0.8;
    add(rim);
    // The scorched inner wall, a step inside the rim.
    add(ringWall(7.4, 8.65, 2.0, palette.clay, 12));
    // The burning floor.
    const floor = column(7.5, 0.5, palette.orange, 12);
    add(floor);

    // The flames.
    for (const [bearing, out, h, r, c] of FLAMES) {
      const x = Math.sin(bearing * DEG) * out;
      const z = Math.cos(bearing * DEG) * out;
      const body = taper(r, r * 0.45, h * 0.55, palette[c], 4);
      body.position.set(x, 0.5, z);
      body.rotation.y = bearing * DEG;
      add(body);
      const tip = taper(r * 0.45, 0.05, h * 0.45, c === 'red' ? palette.orange : palette.gold, 4);
      tip.position.set(x, 0.5 + h * 0.55, z);
      tip.rotation.y = bearing * DEG;
      add(tip);
    }

    return ctx.merge(draft);
  },
};
