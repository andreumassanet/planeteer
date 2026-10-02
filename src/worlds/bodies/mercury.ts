/**
 * Mercury, walked: a black sky, a sun three times the size of Earth's, and a
 * people who live in the shade.
 *
 * Everything true about Mercury — its relief, its hot and warm poles, its
 * cold traps, its rays and hollows, its twelve nations and seventeen towns and
 * the Cinder — is `src/system/bodies/mercury.ts`; this file says what it is
 * like to stand there:
 *
 * - **The ground** is the most cratered in the inner system after the Moon's,
 *   with one thing the Moon lacks: Mercury's simple craters turn complex at
 *   about 10 km across, half the Moon's size, because its gravity is twice
 *   the Moon's — so here even a crater a walker can cross in a minute grows a
 *   central peak. Over that, the named ground of `mercury/relief.ts`:
 *   Rachmaninoff's ring of peaks, Hokusai, the Spider of Pantheon Fossae and
 *   the lobate scarps, the cliffs the planet raised as it shrank.
 * - **The sky** has no air in it. It is black at noon with the stars out, and
 *   the sun is drawn at its true size for wherever Mercury is on its orbit —
 *   2.1 to 3.2 times the disc seen from Earth — and its light is the harshest
 *   in the system: no haze, no fill, shadows like ink.
 * - **The Cinder** write in a hand of bars and dots that stands on a line,
 *   sing slowly (a day here is 176 of ours, and nobody hurries), and build
 *   mirror over shade (`mercury/buildings.ts`).
 * - **What lies about**: bright ejecta blocks, thrust slabs at the scarps,
 *   melt glass on the hot poles, ice in the cold traps, the blue flakes of
 *   the hollows; and in the air, nothing but the occasional glint of dust
 *   lofted by the solar wind.
 * - **Drawn from the space kit**: the Cinder are the kit's cactoro (its brim
 *   a sunshade) and mushroom king, in their own dark hides; their towns are
 *   pods, tall cylinders and long halls with solar arrays in every yard and
 *   their own parasols among them, round the shade tower in the square.
 * - **What to take**: a rover and a lander.
 */

import { PALETTE } from '../../theme.ts';
import { MERCURY, SPECIES } from '../../system/bodies/mercury.ts';
import { MERCURY_EJECTA_BLOCK } from '../../system/parts/mercury-ejecta-block.ts';
import { MERCURY_HOLLOW_GLINT } from '../../system/parts/mercury-hollow-glint.ts';
import { MERCURY_ICE_SHARD } from '../../system/parts/mercury-ice-shard.ts';
import { MERCURY_MELT_GLASS } from '../../system/parts/mercury-melt-glass.ts';
import { MERCURY_THRUST_SLAB } from '../../system/parts/mercury-thrust-slab.ts';
import { alignment, onSphere, smoothstep } from '../../system/noise.ts';
import { toUnit } from '../../sphere.ts';
import { defineCivilisation, defineWorld } from '../contract.ts';
import { SUNSHADE_ROVER } from '../craft.ts';
import { FEATURES, MERCURY_RADIUS, NAMED_CRATERS } from './mercury/relief.ts';
import { CINDER_BUILDINGS } from './mercury/buildings.ts';
import { LANDMARKS } from './mercury/landmarks.ts';

const CINDER = SPECIES.find((one) => one.id === 'cinder')!;

/** The young craters whose floors the crater field leaves bare, as centres and the cosine of their rims. */
const YOUNG = NAMED_CRATERS.filter((c) => c.peak > 0 || c.ring !== undefined || c.name === 'Apollodorus').map((c) => {
  const [x, y, z] = onSphere(c.lat, c.lon);
  return { x, y, z, cos: Math.cos((c.rim * 1.05) / MERCURY_RADIUS) };
});
const probe: [number, number, number] = [0, 0, 0];

/** 1 on open ground, 0.04 on a young crater's floor. */
function youngFloor(lat: number, lon: number): number {
  toUnit(lat, lon, probe);
  for (const c of YOUNG) {
    if (probe[0] * c.x + probe[1] * c.y + probe[2] * c.z > c.cos) return 0.04;
  }
  return 1;
}

export const WORLD = defineWorld(MERCURY, {
  relief: {
    planetScale: 1,
    detail: [
      // Regolith: soft at the smallest scale, because a few billion years of
      // micrometeorites garden the top metres into dust.
      { amplitude: 1.2, wavelength: 18, octaves: 3, ridged: 0.3 },
      { amplitude: 6, wavelength: 220, octaves: 3, ridged: 0.5 },
      { amplitude: 20, wavelength: 1500, octaves: 2, ridged: 0.2 },
    ],
    craters: {
      seed: 'mercury',
      classes: [
        // Walking-scale pits, simple bowls.
        { cell: 50, chance: 0.5, radius: [2, 9], depth: 0.2, rim: 0.05 },
        // From about 13 units of radius up, a central peak: Mercury's
        // simple-to-complex transition is near 10 km across, 25 units.
        { cell: 300, chance: 0.6, radius: [16, 72], depth: 0.16, rim: 0.05, complexAbove: 26 },
        { cell: 1600, chance: 0.5, radius: [150, 700], depth: 0.08, rim: 0.035, complexAbove: 200 },
      ],
      // The smooth plains — Caloris's interior and the northern plains round
      // Borealis Planitia (about 70 N) — are younger lava and keep a little
      // over a third of the craters the intercrater plains do.
      //
      // And the floors of the young named craters keep almost none: the
      // inner plain of Rachmaninoff is some of the youngest lava on the
      // planet, and a crater landing inside Hokusai since Hokusai is rare.
      density: (lat, lon) => {
        const caloris = smoothstep(0.93, 0.975, alignment(lat, lon, 30.5, 170.2));
        const north = smoothstep(55, 68, lat) * (1 - smoothstep(80, 86, lat));
        return (1 - 0.62 * Math.max(caloris, north)) * youngFloor(lat, lon);
      },
    },
    features: FEATURES,
    padReach: 1.5,
  },
  palette: {
    steep: PALETTE.steel,
    // Dark floors and bright, fresh ejecta: Mercury's craters are drawn in
    // the contrast of space weathering, which darkens everything old.
    craterFloor: 0.78,
    ejecta: 1.26,
  },
  sky: {
    horizon: PALETTE.ink,
    zenith: PALETTE.ink,
    air: 0,
    light: PALETTE.white,
    // Seven times Earth's sunlight at the mean distance, ten at perihelion;
    // the engine's softened law already lifts it to its ceiling, and this is
    // the glare above that.
    exposure: 1.15,
  },
  civilisation: defineCivilisation(CINDER, {
    script: {
      glyphs: 22,
      strokes: [2, 4],
      loops: 1,
      hooks: 1,
      bars: 4,
      dots: 3,
      zigzags: 2,
      slant: -0.08,
      line: 'base',
      consonants: 'shtlnpf',
      vowels: 'iea',
    },
    // High and slow, with a wide wander: a sing-song drawl, from a people
    // whose afternoons last six weeks.
    voice: { pitch: [250, 360], pace: [3.6, 5], tract: [1.2, 1.45], wander: 0.26 },
    phrases: {
      greet: [
        'You have come out in the sun. Come into the shade, quickly. This is {place}.',
        'A visitor with only four limbs, standing up straight in the light! Welcome to {nation}.',
        'Good shade to you. That is how we say hello: the other thing is not polite.',
        'You must be from the Wet One. Nobody else walks so tall into the noon.',
        'Welcome to {place}. We will not offer you a hot drink; there is enough heat.',
        'Ah, the guest who fell out of the black. Sit under the tower; the stone is cool there.',
        'Greetings. Mind the edge of the shadow: it is sharper here than anywhere you have been.',
        'You arrive at a good hour. The sun will hardly move before you leave.',
      ],
      world: [
        'Our day is a hundred and seventy-six of yours. We sleep through some of it, the way you would sleep through a winter.',
        'At the equator the sunset walks west at the pace of a slow stroll. Some families walk with it all their lives, and never see noon.',
        'The sun here is three of yours across. Do not look at it. Not even once. Not even sideways.',
        'At Twice-Dawn the sun comes up, thinks better of it, goes down, and comes up again. Everyone goes outside to watch.',
        'There is ice in the craters at the poles. On the hottest ground in the world, ice. We find that very funny.',
        'The cliffs are where the world shrank. It is still shrinking, a little. You can hear it at night if the ground is quiet.',
        'The hollows are blue because the ground is boiling away, slowly, a grain at a time. We are told not to build on them. We built on them.',
        'Rachmaninoff has a ring of mountains inside a ring of mountains. Our poets say it is the world listening.',
        '{place} is {distance} from the next town. You can walk it in the shade of the night, which lasts three of your months.',
        'Nothing here rusts and nothing rots. Our grandparents’ footprints are still outside the door.',
        'Caloris was struck so hard the ground on the far side of the world broke into hills. We call that part of the world the Echo.',
        'Above us there is no sky, only the black and the stars, even at noon. You call this beautiful. We call it noon.',
        'We paint everything that faces the sun white, and everything that faces the sky black. It is the whole of our architecture.',
        'Hokusai threw its white rock a thousand kilometres. On a clear day, which is every day, you can follow the rays home.',
      ],
      visitor: [
        'Is it true your world has a sky you cannot see the stars through? How do you know what time it is?',
        'Your planet is the brightest star at midnight. We call it the Wet One, and we do not entirely believe in it.',
        'You stand straight up into the sun like a tower. Does your world not punish that?',
        'Your days are only one of your days long? How do you get anything done?',
        'They say on your world the air carries heat away. Here, only the sky does. You must never have to think about shade.',
        'You came down out of the black like the old Guest at Janáček. Did you bring your own shade too?',
        'Your suit is the wrong colour. White on the top, dark underneath. Everyone knows this.',
        'You jump like a seed in the wind. We do not have wind, but we have heard of seeds.',
        'You have a moon? A whole extra small world, just hanging there? Greedy.',
      ],
      farewell: [
        'Good shade, and keep the sun behind you.',
        'Go east, and you will meet the evening. Go west at a stroll, and it will never come.',
        'Walk well. If your shadow disappears, you are standing at noon on a hot pole, and you should not be.',
        'Come back in a hundred days. It will still be today.',
        'Mind the cliffs: they go down further than they go up.',
        'Take some ice from Coldtrap, if you are going north. It makes a very good gift.',
      ],
    },
    architecture: {
      forms: [
        { item: 'parasol', weight: 5 },
        { item: 'heliostat', weight: 2 },
        { item: 'burrow', weight: 3 },
        { item: 'screen', weight: 2 },
        { item: 'ring', weight: 1 },
      ],
      landmark: 'shade-tower',
      walls: [PALETTE.white, PALETTE.bone, PALETTE.cream],
      roofs: [PALETTE.steel, PALETTE.slate, PALETTE.bark],
      accents: [PALETTE.gold, PALETTE.skyBlue, PALETTE.orange],
      // Dark paving: the town floor is in its buildings' shade and radiates
      // to the sky like they do; it is also what makes the white read.
      ground: PALETTE.slate,
      height: 1,
      density: 4,
      avenues: 3,
      colony: {
        modules: [{ item: 'house-cylinder', weight: 2 }, { item: 'house-single', weight: 2 }, { item: 'house-long', weight: 1 }, { item: 'solar-array', weight: 1 }, { item: 'hangar-small', weight: 1 }, { item: 'parasol', weight: 2 }, { item: 'burrow', weight: 1 }],
        centre: null,
        roofs: 0.4,
        yards: 0.6,
        tubes: true,
        gardens: ['crystals-large-a', 'crystals-large-b', 'crystals'],
        spaceport: 400000,
      },
      extra: CINDER_BUILDINGS,
    },
    cast: { creatures: [{ item: 'cactoro', weight: 3 }, { item: 'mushroomking', weight: 2 }], visitors: ['astronaut-flamingo', 'astronaut-frog'] },
    crowd: 1.2,
  }),
  decorations: [MERCURY_EJECTA_BLOCK, MERCURY_HOLLOW_GLINT, MERCURY_ICE_SHARD, MERCURY_MELT_GLASS, MERCURY_THRUST_SLAB],
  rocks: 6,
  // A rover under a parasol: on the day side, shade is the equipment.
  vehicles: [SUNSHADE_ROVER, 'lander'],
  // No air, so no devils and no blown dust: only grains lofted off the
  // ground by the charge the solar wind leaves on it, glinting in the sun.
  ambient: [
    { kind: 'motes', count: 70, color: PALETTE.bone },
    // The hollows' bright glaze catching the sun as you pass: a few at a time.
    { kind: 'glint', count: 28, color: PALETTE.skyBlue, size: 0.6 },
  ],
  scatter: {
    props: [{ item: 'rock-1', weight: 2 }, { item: 'rock-2', weight: 2 }, { item: 'rock-3', weight: 2 }, { item: 'rock-4', weight: 1 }, { item: 'rock-large-1', weight: 1 }, { item: 'rock-large-2', weight: 1 }, { item: 'rock-large-3', weight: 1 }, { item: 'meteor', weight: 2 }, { item: 'meteor-half', weight: 1 }, { item: 'crystals', weight: 1 }, { item: 'crater', weight: 1 }],
    flora: [],
    perTile: 1.1,
    green: 0,
  },
  landmarks: LANDMARKS,
  spawn: 'ringhold',
});
