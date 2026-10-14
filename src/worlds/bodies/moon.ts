/**
 * The Moon, walked. Its `Body` (true numbers, countries and towns) is
 * `src/system/bodies/moon.ts`, kept out of the orrery's `BODIES` because a moon
 * drawn among the planets would sit on top of Earth; this file says what it is
 * like to stand there, with Earth hung in the black, two degrees across.
 *
 * - The ground (`moon/ground.ts`) is grey in two tones, dark maria in the great
 *   basins at their real places and pale highland elsewhere, with the young
 *   craters' rays laid bright across both. Named craters, rilles, the Straight
 *   Wall and three lava-tube skylights are drawn where they are.
 * - The sky is black at noon, with stars and no haze: the horizon is as sharp
 *   as the foreground.
 * - Gravity is 1.62 m/s2, a sixth of Earth's: a jump goes four times a person's
 *   height and hangs for four seconds.
 * - What people left (`moon/landmarks.ts`): Tranquility Base, Hadley,
 *   Taurus-Littrow and Surveyor Crater, Lunokhod 1, Chang'e 4 and Yutu-2.
 * - The Selenites (`moon/selenites.ts`, invented) live in the lava tubes; their
 *   towns are the porches over the skylights, built from the kit's mushnubs and
 *   blobs, pods, tubes, domes and solar arrays.
 * - Takeable: Apollo's rover, the Selenites' own, a lander and a saucer.
 */

import { PALETTE } from '../../theme.ts';
import { MOON } from '../../system/bodies/moon.ts';
import { defineWorld } from '../contract.ts';
import type { VehicleSpec } from '../contract.ts';
import { FEATURES, craterDensity } from './moon/ground.ts';
import { LANDMARKS, LUNAR_ROVER } from './moon/landmarks.ts';
import { MOON_DECORATIONS } from './moon/rocks.ts';
import { SELENITES } from './moon/selenites.ts';

/**
 * The Selenites' own rover beside Apollo's: the kit's six-wheeled pressurised
 * one, white with an orange stripe, its crew seen through the cab's glass, for
 * the long drive between the towns.
 */
const BUBBLE_ROVER: VehicleSpec = {
  kind: 'rover',
  name: 'the pressurised rover',
  // 8.8 long, where it was 7.6: fitted so a seated crown clears its cab (`worlds/cockpit.ts`).
  kit: { id: 'rover', length: 8.8, seat: [-0.17, 0.3, 0.06], closed: true, livery: { wall: PALETTE.white, roof: PALETTE.steel, accent: PALETTE.orange } },
  handling: { top: 20 },
};

export { MOON };

export const WORLD = defineWorld(MOON, {
  relief: {
    planetScale: 1,
    // Regolith rolls rather than creases: metres of churned dust, so the fine octave is soft and the broad one swells.
    detail: [
      { amplitude: 1.1, wavelength: 16, octaves: 3, ridged: 0.3 },
      { amplitude: 5, wavelength: 180, octaves: 3, ridged: 0.4 },
      { amplitude: 14, wavelength: 1100, octaves: 2, ridged: 0 },
    ],
    craters: {
      seed: 'moon',
      // Saturated: on the highlands there is no ground that is not inside some crater; the biggest class is a basin 300 km across.
      classes: [
        { cell: 40, chance: 0.55, radius: [1.5, 8], depth: 0.2, rim: 0.05 },
        { cell: 220, chance: 0.6, radius: [12, 70], depth: 0.17, rim: 0.045, complexAbove: 45 },
        { cell: 1200, chance: 0.5, radius: [110, 420], depth: 0.09, rim: 0.03, complexAbove: 150 },
      ],
      density: craterDensity,
    },
    features: FEATURES,
    padReach: 1.5,
  },
  palette: {
    // The biomes carry their own colours. The steep colour is what a crater's
    // wall shows, and the ejecta is the brightest ground on the Moon.
    base: PALETTE.bone,
    steep: PALETTE.slate,
    craterFloor: 0.84,
    ejecta: 1.22,
    // Grey. The palette has no grey that is not warm or violet and the grade's warm highlights made bone read as beige, so the regolith keeps a trace of its colour and the maria stay dark by value alone.
    chroma: 0.14,
  },
  sky: { horizon: PALETTE.ink, zenith: PALETTE.ink, air: 0, light: PALETTE.white, exposure: 1.05 },
  civilisation: SELENITES,
  decorations: MOON_DECORATIONS,
  rocks: 8,
  vehicles: [LUNAR_ROVER, BUBBLE_ROVER, 'lander', 'ufo'],
  // Lunar horizon glow: dust lofted by the charge sunlight leaves on it. Few, and slow.
  ambient: [{ kind: 'motes', count: 40, color: PALETTE.bone }],
  scatter: {
    props: [{ item: 'rock-1', weight: 2 }, { item: 'rock-2', weight: 2 }, { item: 'rock-3', weight: 2 }, { item: 'rock-4', weight: 1 }, { item: 'rock-large-1', weight: 1 }, { item: 'rock-large-2', weight: 1 }, { item: 'rock-large-3', weight: 1 }, { item: 'meteor', weight: 2 }, { item: 'meteor-half', weight: 2 }, { item: 'crater-large', weight: 1 }, { item: 'crater', weight: 2 }, { item: 'crystals', weight: 1 }],
    flora: [],
    perTile: 1.4,
    green: 0,
  },
  landmarks: LANDMARKS,
  // In Statio, the porch a few hundred metres from Tranquility Base.
  spawn: 'statio',
});
