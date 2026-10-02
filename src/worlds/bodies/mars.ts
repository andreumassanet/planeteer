/**
 * Mars, walked: the reference world, and the one file every other planet's is
 * shaped like.
 *
 * Everything true about Mars — its relief with Olympus Mons, Hellas and the
 * Valles, its dust map, its fifteen nations, its twenty-four towns and the
 * four-armed Martian — is `src/system/bodies/mars.ts`, and this file only says
 * what it is like to stand there:
 *
 * - **The ground** is the system's map plus the walking scale it does not
 *   have: three octaves of bumps, and craters in three size classes from a
 *   pothole to a basin two hundred units deep, **heavier on the ancient
 *   southern highlands than on the young northern plains** — the dichotomy is
 *   the first fact about Mars's surface, so the crater field reads it too.
 * - **The sky** is butterscotch by day and blue round the setting sun, which
 *   is the one thing everybody gets wrong about Mars, and the light is warm.
 * - **The Martians** write in a hooked, looped hand hung from a line, speak low
 *   (the throat of a body half again a person's height), and build domes on
 *   drums, stacked drums and spires — the shapes a low-pressure, cold, dusty
 *   world would make of pressure vessels.
 * - **What lies about**: rocks everywhere, the system's dust drifts, iron
 *   spires, wind-stones and frost fans by biome; dust devils on the plains.
 * - **Drawn from the space kit**: the Martians are the kit's greyling and
 *   alien in their own hides, and their towns are its colony — pods on
 *   cradles joined by tubes, long halls, glass domes, solar arrays — in rows
 *   down the avenues round a hub with a radar on its crown.
 * - **What to take**: the kit's six-wheeled rover and a cargo lander.
 */

import { PALETTE } from '../../theme.ts';
import { MARS, SPECIES } from '../../system/bodies/mars.ts';
import { DUST_DRIFT } from '../../system/parts/dust-drift.ts';
import { FROST_FAN } from '../../system/parts/frost-fan.ts';
import { IRON_SPIRE } from '../../system/parts/iron-spire.ts';
import { WIND_STONE } from '../../system/parts/wind-stone.ts';
import { alignment, smoothstep } from '../../system/noise.ts';
import { defineCivilisation, defineWorld } from '../contract.ts';
import type { Landmark } from '../contract.ts';
import { dome } from '../architecture.ts';
import { MARS_MOONS } from './mars/moons.ts';

const MARTIAN = SPECIES.find((one) => one.id === 'martian')!;

/**
 * The Viking 1 lander, where it came down on 20 July 1976 in Chryse Planitia:
 * a memorial the Martians keep, three legs, a hexagonal body, the dish.
 */
const VIKING: Landmark = {
  id: 'viking-1',
  name: 'Viking 1 Memorial',
  lat: 22.27,
  lon: -47.95,
  radius: 16,
  build(ctx) {
    const group = new ctx.THREE.Group();
    const plinth = ctx.column(9, 1.2, PALETTE.tan, 8);
    group.add(plinth);
    const body = ctx.column(2.6, 1.2, PALETTE.white, 6);
    body.position.y = 4.6;
    group.add(body);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const hip = new ctx.THREE.Vector3(Math.cos(a) * 2.2, 4.8, Math.sin(a) * 2.2);
      const foot = new ctx.THREE.Vector3(Math.cos(a) * 4.6, 1.2, Math.sin(a) * 4.6);
      group.add(ctx.strut(hip, foot, 0.3, PALETTE.steel));
      const pad = ctx.column(0.7, 0.25, PALETTE.steel, 8);
      pad.position.copy(foot);
      group.add(pad);
    }
    const mast = ctx.column(0.15, 2.4, PALETTE.steel, 6);
    mast.position.set(0.8, 5.8, 0);
    group.add(mast);
    const dish = dome(ctx, 1.4, PALETTE.white, 0.3, 12);
    dish.rotation.x = Math.PI * 0.75;
    dish.position.set(0.8, 8.4, 0);
    group.add(dish);
    const arm = ctx.strut(new ctx.THREE.Vector3(-1.5, 5.4, 0), new ctx.THREE.Vector3(-4.2, 3.4, 1.4), 0.22, PALETTE.gold);
    group.add(arm);
    return group;
  },
};

export const WORLD = defineWorld(MARS, {
  relief: {
    planetScale: 1,
    detail: [
      { amplitude: 1.8, wavelength: 22, octaves: 3, ridged: 0.5 },
      { amplitude: 8, wavelength: 240, octaves: 3, ridged: 0.3 },
      { amplitude: 24, wavelength: 1600, octaves: 2, ridged: 0 },
    ],
    craters: {
      seed: 'mars',
      classes: [
        { cell: 70, chance: 0.3, radius: [3, 14], depth: 0.2, rim: 0.05 },
        { cell: 420, chance: 0.45, radius: [25, 110], depth: 0.16, rim: 0.045, complexAbove: 80 },
        { cell: 2400, chance: 0.35, radius: [250, 900], depth: 0.08, rim: 0.03, complexAbove: 300 },
      ],
      // The dichotomy: the northern lowlands were resurfaced and keep a
      // third of the south's craters. The pole of the lowlands is the
      // system file's (55 N, 160 E).
      density: (lat, lon) => 1 - 0.65 * smoothstep(-0.1, 0.55, alignment(lat, lon, 55, 160)),
    },
  },
  palette: {
    steep: PALETTE.brown,
    craterFloor: 0.82,
    ejecta: 1.16,
  },
  sky: {
    horizon: PALETTE.apricot,
    zenith: PALETTE.salmon,
    air: 0.45,
    light: PALETTE.cream,
    exposure: 1.1,
    moons: MARS_MOONS,
  },
  civilisation: defineCivilisation(MARTIAN, {
    script: {
      glyphs: 26,
      strokes: [1, 3],
      loops: 3,
      hooks: 3,
      bars: 1,
      dots: 2,
      zigzags: 0,
      slant: 0.14,
      line: 'top',
      consonants: 'kxtrhvzsq',
      vowels: 'aouy',
    },
    voice: { pitch: [105, 165], pace: [5, 6.6], tract: [0.66, 0.84], wander: 0.18 },
    phrases: {
      greet: [
        'Four arms of welcome, small one. This is {place}.',
        'You came down in the dust like the old landers did. Welcome to {nation}.',
        'Breathe slowly in that suit. The air here is thin for everyone.',
      ],
      world: [
        '{place} keeps its doors shut in the storm season. The dust gets into everything else.',
        'The nearest town is {distance} away. We walk it; there is nowhere to hurry to.',
        'Our sky is the colour of honey at noon and blue at dusk. Yours is the other way round, they say.',
        'Olympus is so tall it stands above the weather. From the top you can see the curve of the world.',
      ],
      visitor: [
        'Is it true your world has water lying on the ground, open to the sky? We do not believe it.',
        'You jump so high here. On your world, do your feet never leave the ground?',
        'Your planet is the bright blue star before dawn. We have named it the Wet One.',
        'You have only two arms. How do you carry anything and wave at the same time?',
      ],
      farewell: [
        'Go well, and keep the sun on your left.',
        'May your seals hold and your tracks fill slowly.',
        'Come back before the dust season. After it, nobody finds anybody.',
      ],
    },
    architecture: {
      forms: [
        { item: 'dome', weight: 5 },
        { item: 'stack', weight: 3 },
        { item: 'spire', weight: 1 },
        { item: 'pod', weight: 2 },
        { item: 'ring', weight: 1 },
      ],
      landmark: 'spire',
      // Pale walls and strong trims, as a Terran town's are (white walls,
      // blue roofs): sand on sand was every module the colour of the ground.
      walls: [PALETTE.white, PALETTE.cream, PALETTE.bone, PALETTE.blush],
      roofs: [PALETTE.crimson, PALETTE.red, PALETTE.clay, PALETTE.steel],
      accents: [PALETTE.skyBlue, PALETTE.gold, PALETTE.crimson],
      ground: PALETTE.tan,
      height: 1.1,
      density: 3.2,
      avenues: 5,
      colony: {
        modules: [{ item: 'house-single', weight: 3 }, { item: 'house-open-back', weight: 2 }, { item: 'house-cylinder', weight: 3 }, { item: 'house-long', weight: 2 }, { item: 'building-l', weight: 1 }, { item: 'geodesic-dome', weight: 1 }, { item: 'solar-array', weight: 1 }, { item: 'hangar-round', weight: 1 }],
        centre: 'base-large',
        roofs: 0.5,
        yards: 0.4,
        tubes: true,
        gardens: ['tree-spikes-2', 'bush-3', 'plant-2'],
        spaceport: 150000,
      },
    },
    cast: { creatures: [{ item: 'greyling', weight: 3 }, { item: 'alien', weight: 2 }], visitors: ['astronaut-bee', 'astronaut-flamingo', 'astronaut-frog', 'astronaut-redpanda'] },
    crowd: 1,
  }),
  decorations: [DUST_DRIFT, FROST_FAN, IRON_SPIRE, WIND_STONE],
  rocks: 7,
  vehicles: ['rover', 'lander'],
  ambient: [
    { kind: 'dust-devil', count: 4, color: PALETTE.sand },
    { kind: 'motes', count: 140, color: PALETTE.apricot },
  ],
  scatter: {
    props: [{ item: 'rock-1', weight: 2 }, { item: 'rock-2', weight: 2 }, { item: 'rock-3', weight: 2 }, { item: 'rock-4', weight: 1 }, { item: 'rock-large-1', weight: 1 }, { item: 'rock-large-2', weight: 1 }, { item: 'rock-large-3', weight: 1 }, { item: 'meteor', weight: 1 }, { item: 'meteor-half', weight: 1 }, { item: 'crater', weight: 1 }],
    flora: [{ item: 'tree-spikes-2', weight: 1 }, { item: 'grass-3', weight: 2 }],
    perTile: 1.2,
    green: 0.12,
  },
  landmarks: [VIKING],
  spawn: 'meridiani',
});
