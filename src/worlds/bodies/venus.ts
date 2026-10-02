/**
 * Venus, walked: the hottest surface in the solar system under the heaviest
 * sky, and the one world here where you never see the Sun.
 *
 * Everything true about Venus — its relief with Maxwell and Aphrodite, its
 * sulphur, its metal frost, its nations, its towns and the Bathyd — is
 * `src/system/bodies/venus.ts`; this file says what it is like to stand there:
 *
 * - **The ground** is young. Lava resurfaced the whole planet some half a
 *   billion years ago, so there are only about a thousand craters on it, and
 *   **none smaller than about three kilometres**, because a small impactor is
 *   crushed and burned by ninety-two atmospheres before it reaches the
 *   ground. And they are spread evenly, with no old and young halves the way
 *   Mars has — which is the strangest fact about them, and is why the crater
 *   recipe below has no `density`. What there is instead are the landforms
 *   no other planet has: pancake domes, coronae, tessera, a lava channel
 *   longer than the Nile (`venus/features.ts`); and between them low,
 *   wrinkle-ridged plains of platy basalt.
 * - **The sky** is a gold overcast with no Sun in it, brightest at the
 *   horizon because the air bends light so far that the horizon rises into a
 *   bowl, and the haze closes in at a few hundred units. The light is a dim
 *   apricot and nearly shadowless.
 * - **The Bathyd** write a squat, barred hand that stands on its line, speak
 *   slowly and very low (a sound carries a long way in this air), and build
 *   low and round-shouldered (`venus/buildings.ts`) with a sulphur lamp on
 *   everything.
 * - **What lies about**: platy slabs on the plains, galena cubes on the
 *   mountains, sulphur vents on the flows; shimmering heat over the plain and
 *   glints of sulphur in the air.
 * - **Drawn from the space kit**: the Bathyd are the kit's yeti and monkroose,
 *   heavy and in their own violets, slates and greens; their towns are the
 *   kit's low hangars among their own kilns, vaults and pancakes, round the
 *   hearth, with lava trees and orange grass in the yards.
 * - **What to take**: a rover, and a lander for the long distances.
 */

import { PALETTE } from '../../theme.ts';
import { SPECIES, VENUS } from '../../system/bodies/venus.ts';
import { DUST_DRIFT } from '../../system/parts/dust-drift.ts';
import { IRON_SPIRE } from '../../system/parts/iron-spire.ts';
import { SULPHUR_VENT } from '../../system/parts/sulphur-vent.ts';
import { VENUS_GALENA } from '../../system/parts/venus-galena.ts';
import { VENUS_SLAB } from '../../system/parts/venus-slab.ts';
import { WIND_STONE } from '../../system/parts/wind-stone.ts';
import { defineCivilisation, defineWorld } from '../contract.ts';
import { CRAWLER, VENUS_AEROSTAT } from '../craft.ts';
import { BATHYD_BUILDINGS } from './venus/buildings.ts';
import { FEATURES } from './venus/features.ts';
import { LANDMARKS } from './venus/landmarks.ts';

const BATHYD = SPECIES.find((one) => one.id === 'bathyd')!;

export const WORLD = defineWorld(VENUS, {
  relief: {
    planetScale: 1,
    detail: [
      // Platy, broken basalt underfoot: small and creased.
      { amplitude: 1.1, wavelength: 16, octaves: 3, ridged: 0.55 },
      // Wrinkle ridges, the plains' one texture: long, low and sharp-crested,
      // where the cooled lava was squeezed. Mostly ridged.
      { amplitude: 4.5, wavelength: 170, octaves: 2, ridged: 0.8 },
      // And the broad swell of the flows themselves.
      { amplitude: 18, wavelength: 1400, octaves: 2, ridged: 0 },
    ],
    craters: {
      seed: 'venus',
      classes: [
        // The common size: 5 to 30 km across, about one per 1,700 units of
        // lattice, which is the real thousand craters spread over the real
        // surface. Shallow, because their floors are flooded with lava.
        { cell: 1700, chance: 0.5, radius: [6, 38], depth: 0.12, rim: 0.04 },
        // The big ones — Mead is 280 km across — with flat floors and peaks.
        { cell: 5200, chance: 0.22, radius: [160, 600], depth: 0.05, rim: 0.025, complexAbove: 200 },
      ],
    },
    features: FEATURES,
    padReach: 1.5,
    // The highlands' towns stand on tesserae and scarps, and a pad cut flat
    // into a slope there left a cliff round it: the land comes back to it at
    // a walkable grade instead.
    padGrade: 0.35,
  },
  palette: {
    biomes: {
      // Fresh flows are the darkest ground on the planet; the plains a warm
      // weathered brown, which the apricot light turns to rust.
      lava: PALETTE.bark,
      plain: PALETTE.brown,
      crust: PALETTE.clay,
    },
    steep: PALETTE.bark,
    // Radar-dark: a Venusian crater's floor is smooth lava, the darkest thing
    // in the Magellan images, and its ejecta the brightest.
    craterFloor: 0.7,
    ejecta: 1.22,
  },
  sky: {
    horizon: PALETTE.gold,
    zenith: PALETTE.apricot,
    air: 1,
    light: PALETTE.apricot,
    // About 2% of the sunlight at the top of the clouds reaches the ground —
    // an overcast winter afternoon on Earth — and a screen cannot show that
    // and still be played on, so this is dim rather than dark.
    exposure: 0.72,
    // No Sun, no stars: the deck is everywhere overhead.
    overcast: true,
  },
  civilisation: defineCivilisation(BATHYD, {
    script: {
      // Heavy and squat like everything else they make: bars and dots, few
      // curves, upright, and standing on its line the way a Bathyd stands on
      // the ground.
      glyphs: 22,
      strokes: [2, 4],
      loops: 1,
      hooks: 1,
      bars: 4,
      dots: 3,
      zigzags: 1,
      slant: 0,
      line: 'base',
      consonants: 'bdgmnlrwh',
      vowels: 'ouaoe',
    },
    // Low, slow and level: a throat a barrel wide, in air dense enough that
    // a low note carries for kilometres.
    voice: { pitch: [62, 104], pace: [3.2, 4.6], tract: [0.58, 0.74], wander: 0.07 },
    // Every line below is invented, and about true things.
    phrases: {
      greet: [
        'Slowly, slowly. Welcome to {place}. Nothing here is in a hurry, least of all the air.',
        'You came down through the clouds? All of them? Sit. Breathe. Do you breathe?',
        'Four feet on the ground, small one. That is how we greet. You will have to manage with two.',
        'Welcome to {nation}. The light is the same colour everywhere, so you are not lost, only far.',
        'A visitor from above the clouds! We warmed a stone for you. Well, all the stones are warm.',
        'Greetings. Your suit is very thin. Are you sure you are not being squashed?',
        'Mind the doorway as you come into {place}. We build them low, because everything here is.',
        'We lit the sulphur lamps when we saw you coming. It is always the same hour of light, but it is polite.',
      ],
      world: [
        'Our day is longer than our year. Birthdays come round before the morning does.',
        'The sun rises in the west here. Whoever told you otherwise lives somewhere backwards.',
        'Up on Maxwell the mountains wear metal frost. Lead, falling like snow. We sweep it up and make bells.',
        'The best houses are built into the old lava pancakes. They cooled flat on top, which was polite of them.',
        'The nearest town is {distance} away. The air is so thick you can lean on it the whole way.',
        'Nobody here has seen the sun. We know it is up there because the clouds glow on one side for two months at a time.',
        'Baltis Vallis was a river of lava longer than any river on your world. We follow it when we want to go far.',
        'Small rocks never reach the ground here. The sky eats them. Only the big ones arrive, and they arrive rudely.',
        'The lightning is how the sky talks. We are still learning the grammar.',
        'The Venera came down hot and sang for an hour before they died. We keep them where they fell, and polish them.',
        'In {nation} the wind blows at a walking pace. A storm is when it breaks into a jog.',
      ],
      visitor: [
        'Is it true your world is cold enough for water to lie on the ground? Does it not boil off when you look away?',
        'They say there are lights above the clouds. Little points of them. Is that true, or a story for children?',
        'You are so thin. Your air must weigh almost nothing. How do you know it is there?',
        'Your world turns the right way round, they tell us. That must make the mornings very confusing.',
        'You jumped! Look at you. Down here we consider that showing off.',
        'The scholars say your world is our neighbour: blue, wet and a little bigger. We have never seen it. What is blue?',
        'Do your people really stand on two legs all day? Who holds you up when you are tired?',
        'You smell of cold. It is a nice smell. Leave a little here when you go.',
        'Your day is one turn long? You must be exhausted. When do you sleep?',
      ],
      farewell: [
        'Go slowly. Everything worth reaching will still be there.',
        'Keep the bright side of the sky on your left and the frost above you, and you will find home.',
        'Mind the pancakes. The edges are steeper than they look.',
        'Come back for the sunset. It is in about a month.',
        'Press on, small one. Gently. The air will press back.',
        'May your seals hold at ninety atmospheres.',
      ],
    },
    architecture: {
      forms: [
        { item: 'pancake', weight: 5 },
        { item: 'kiln', weight: 3 },
        { item: 'vault', weight: 3 },
        { item: 'ring', weight: 1 },
      ],
      landmark: 'hearth',
      walls: [PALETTE.bark, PALETTE.steel, PALETTE.brown, PALETTE.slate],
      roofs: [PALETTE.clay, PALETTE.tan, PALETTE.bone, PALETTE.brown],
      accents: [PALETTE.gold, PALETTE.apricot, PALETTE.orange],
      ground: PALETTE.tan,
      height: 0.8,
      density: 2.6,
      avenues: 6,
      colony: {
        modules: [{ item: 'hangar-large', weight: 2 }, { item: 'hangar-round', weight: 2 }, { item: 'hangar-small', weight: 2 }, { item: 'house-cylinder', weight: 1 }, { item: 'pancake', weight: 2 }, { item: 'kiln', weight: 1 }, { item: 'vault', weight: 2 }],
        centre: null,
        scale: 0.9,
        roofs: 0.3,
        yards: 0.4,
        tubes: false,
        gardens: ['tree-lava-1', 'tree-lava-2', 'tree-lava-3', 'grass-1'],
        spaceport: 200000,
      },
      extra: BATHYD_BUILDINGS,
    },
    cast: { creatures: [{ item: 'yeti', weight: 3 }, { item: 'monkroose', weight: 2 }], visitors: ['astronaut-redpanda', 'astronaut-bee'] },
    crowd: 1.2,
  }),
  decorations: [DUST_DRIFT, IRON_SPIRE, SULPHUR_VENT, VENUS_GALENA, VENUS_SLAB, WIND_STONE],
  rocks: 4,
  // Armour for the ground and a balloon for the air: nothing else lasts here.
  vehicles: [CRAWLER, VENUS_AEROSTAT],
  ambient: [
    // Not dust devils — the surface wind is a walking pace — but the same
    // pale columns read as heat shimmer rising off a 464-degree plain.
    { kind: 'dust-devil', count: 3, color: PALETTE.cream },
    // Sulphur glinting in the haze.
    { kind: 'motes', count: 240, color: PALETTE.gold },
    // The haze itself, in sheets: ninety atmospheres of it, lit orange.
    { kind: 'haze', count: 26, color: PALETTE.apricot, size: 120 },
  ],
  // The super-rotation is a hurricane at the cloud tops and a walking pace
  // here; it carries the aerostat and the haze west all the same.
  wind: { toward: 270, speed: 5, strength: 0.15 },
  scatter: {
    props: [{ item: 'rock-1', weight: 2 }, { item: 'rock-2', weight: 2 }, { item: 'rock-3', weight: 2 }, { item: 'rock-4', weight: 1 }, { item: 'rock-large-1', weight: 1 }, { item: 'rock-large-2', weight: 1 }, { item: 'rock-large-3', weight: 1 }, { item: 'crystals-large-a', weight: 1 }],
    flora: [{ item: 'tree-lava-1', weight: 2 }, { item: 'tree-lava-2', weight: 2 }, { item: 'tree-lava-3', weight: 2 }, { item: 'grass-1', weight: 3 }, { item: 'tree-spikes-1', weight: 1 }],
    perTile: 1.0,
    green: 0.4,
  },
  landmarks: LANDMARKS,
  spawn: 'seoritsu',
});
