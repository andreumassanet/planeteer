/**
 * Saturn, walked: a cloud deck at the 1-bar level under the rings.
 *
 * Everything true about Saturn — its bands at their latitudes, the Hexagon,
 * the two polar eyes, the White Spots, Storm Alley, the Ribbon, the eighteen
 * towns and the Drifters — is `src/system/bodies/saturn.ts`. This file says
 * what it is like to stand there:
 *
 * - **The deck** is banded soft butterscotch and pale gold, paler and quieter
 *   than Jupiter's because a thicker haze lies over it, and it rises into the
 *   world's landmarks: the Hexagon's jet a cloud wall 260 units high round
 *   the north pole, six sides each longer than Earth is wide; the Rose's eye
 *   on the pole inside it; the Southern Eye's double eyewall; the Great White
 *   Spot's head heaped into towers, its tail wavering east; Storm Alley's
 *   white cells; the Ribbon's rippling ridge.
 * - **The weight**: 10.44 m/s², 1.07 g — the giant that weighs what home does.
 * - **The sky** is pale: a cream haze at the horizon, pale gold overhead, the
 *   Sun a small hard point 9.5 au away with a ninetieth of Earth's light. And
 *   **the rings**, arching from horizon to horizon with the Cassini Division
 *   in them and the planet's shadow across them, are `saturn/sky.ts`, a sky
 *   layer; Titan and Rhea keep to their plane (`saturn/moons.ts`).
 * - **The Drifters** write in loops and dots like rings and moons, hung from
 *   nothing; speak high, soft and slow; and build halos, armillaries, hanging
 *   gardens, hooped halls and circle gates on platforms moored to the wind,
 *   round an orrery of their own planet in every square.
 * - **What moves**: ice glinting down out of the rings, and white columns of
 *   rising cloud wandering the deck.
 * - **Drawn from the space kit**: the Drifters are the kit's squidle and pink
 *   blob; their platforms carry glass domes and pods among their halos and
 *   gyres, with swirl trees in the yards, and the big ones a landing pad.
 * - **What to take**: a hover-skiff and a lander.
 */

import { PALETTE } from '../../theme.ts';
import { DRAGON_STORM, GREAT_WHITE_SPOT, HEXAGON_SIDE_LAT, SATURN, SPECIES, deckRelief } from '../../system/bodies/saturn.ts';
import { smoothstep } from '../../system/noise.ts';
import { unitAt } from '../../sphere.ts';
import type { Tint } from '../contract.ts';
import { surfaceRadiusOf } from '../../system/contract.ts';
import { defineCivilisation, defineWorld } from '../contract.ts';
import { DRIFTER_BUILDINGS } from './saturn/buildings.ts';
import { LANDMARKS } from './saturn/landmarks.ts';
import { createSaturnSky } from './saturn/sky.ts';
import { SATURN_MOONS } from './saturn/moons.ts';
import type { SkyLayerFactory } from '../contract.ts';

const DRIFTER = SPECIES.find((one) => one.id === 'drifter')!;

/**
 * The bands, equator outward, one entry for each 2.34 degrees: the deck's
 * painter lays the list over 37.5 degrees and repeats it, mirrored north and
 * south, so these sixteen put the bright Equatorial Zone to about 9 degrees,
 * its butterscotch edge and the North and South Equatorial Belts' single
 * pale-gold stripe by 16, the Tropical Zone after them and a grey-gold
 * Temperate Belt at the end. Neighbours are near in tone on purpose: Saturn's
 * bands are felt more than seen.
 */
const BANDS = [
  PALETTE.cream, // the Equatorial Zone
  PALETTE.white,
  PALETTE.cream,
  PALETTE.sand,
  PALETTE.sand, // its butterscotch edge
  PALETTE.blush,
  PALETTE.apricot, // the Equatorial Belt: one pale-gold stripe
  PALETTE.sand,
  PALETTE.blush,
  PALETTE.cream, // the Tropical Zone
  PALETTE.sand,
  PALETTE.cream,
  PALETTE.sand,
  PALETTE.tan, // the Temperate Belt, grey-gold
  PALETTE.sand,
  PALETTE.bone,
];

const AIR = 0.6;

/**
 * The rings and the aurora, as the engine's sky draws them (`SkySpec.layers`):
 * made with the walkable radius, updated each frame with the traveller, the
 * Sun, the daylight and the clock, and the Sun's light multiplied by what
 * they let through (the rings' shadow on the deck).
 */
export const SKY_LAYERS: readonly SkyLayerFactory[] = [(radius) => createSaturnSky(radius, AIR)];

/** The walkable radius the layers are made for. */
export const SKY_RADIUS = surfaceRadiusOf(SATURN.radiusKm);

/**
 * The storms' heads painted white where they stand — the Great White Spot of
 * 2010, Hubble's of 1990 on the equator, the Dragon in Storm Alley — and the
 * pole inside the hexagon the blue Cassini found there in 2012, when the
 * north came out of its winter.
 */
const HEADS = [
  { ...GREAT_WHITE_SPOT, size: 4.6 },
  { lat: 5, lon: 160, size: 3.4 },
  { ...DRAGON_STORM, size: 2.2 },
].map((head) => ({
  at: unitAt(head.lat, head.lon, { x: 0, y: 0, z: 0 }),
  inner: Math.cos((head.size * 0.5 * Math.PI) / 180),
  outer: Math.cos((head.size * 1.3 * Math.PI) / 180),
}));
const PAINT: Tint = { color: PALETTE.white, weight: 0 };

function paintDeck(dir: { readonly x: number; readonly y: number; readonly z: number }, lat: number): Tint | null {
  for (const head of HEADS) {
    const dot = dir.x * head.at.x + dir.y * head.at.y + dir.z * head.at.z;
    if (dot <= head.outer) continue;
    PAINT.color = PALETTE.white;
    PAINT.weight = 0.85 * smoothstep(head.outer, head.inner, dot);
    return PAINT;
  }
  const pole = smoothstep(HEXAGON_SIDE_LAT - 2, HEXAGON_SIDE_LAT + 3, lat);
  if (pole <= 0) return null;
  PAINT.color = PALETTE.skyBlue;
  PAINT.weight = 0.32 * pole;
  return PAINT;
}

/** Storm Alley: how stormy a latitude is, for the lightning. */
const stormAlley = (lat: number): number => Math.exp(-(((lat - DRAGON_STORM.lat) / 4) ** 2));

export const WORLD = defineWorld(SATURN, {
  relief: {
    // No ground model: the deck's relief — the zones over the belts, the
    // walls, the eyes and the storms — is the one feature below, in units.
    planetScale: 1,
    detail: [
      // Billows, softer than Jupiter's: the haze rounds everything off.
      { amplitude: 3, wavelength: 120, octaves: 3, ridged: 0.15 },
      // The deck's long slow swell.
      { amplitude: 18, wavelength: 1700, octaves: 2, ridged: 0 },
    ],
    craters: null,
    features: [(dir, lat, lon) => deckRelief(dir.x, dir.y, dir.z, lat, lon)],
    padReach: 1.5,
  },
  palette: {
    base: PALETTE.sand,
    steep: PALETTE.tan,
    bands: BANDS,
    turbulence: 0.16,
    tint: paintDeck,
    // The equatorial jet runs east, fast; the drift says so, gently.
    churn: { boil: 0.3, speed: 20, wavelength: 340, strength: 0.05 },
  },
  sky: {
    horizon: PALETTE.cream,
    zenith: PALETTE.sand,
    // Less air than Jupiter's 0.75: a paler, clearer sky, so the rings and
    // the stars come through at dusk.
    air: AIR,
    light: PALETTE.cream,
    // At 9.5 au the sky's softened law gives back 0.36 of Earth's light;
    // this lifts the deck to about Jupiter's.
    exposure: 1.5,
    moons: SATURN_MOONS,
    layers: SKY_LAYERS,
  },
  civilisation: defineCivilisation(DRIFTER, {
    script: {
      glyphs: 28,
      strokes: [2, 3],
      loops: 5,
      hooks: 1,
      bars: 0,
      dots: 3,
      zigzags: 0,
      slant: 0.22,
      line: 'none',
      consonants: 'lshfyrw',
      vowels: 'aeiiy',
    },
    // A long, narrow throat: high, breathy and unhurried, wandering as it goes.
    voice: { pitch: [230, 340], pace: [4.2, 5.6], tract: [1.22, 1.45], wander: 0.24 },
    phrases: {
      greet: [
        'Light winds, traveller. You have come down in {place}.',
        'Welcome to {nation}. Look up first; everybody does.',
        'A visitor! Mind the edge of the platform. Below it is a long way down, and then more of it.',
        'You came in from the sunward side? Then you have seen the rings from outside. Lucky. Welcome to {place}.',
        'Halo to you. That is how we say hello: a circle in the air with one finger.',
        'Stand still a moment, small one. The deck is softer than it looks, and you are heavier.',
        'Welcome, welcome. The rings are bright today; it is a good day to arrive.',
        'You walk as if the ground might stay where it is. Charming. This is {place}.',
        'Greetings from {nation}, where the wind is always going somewhere and we are always going with it.',
      ],
      world: [
        'The rings are ice, every grain of them. On still nights you can hear them fall.',
        'There is a gap in the rings called Cassini. We named nothing after it; it was already famous.',
        '{place} is moored to the wind. The nearest other town is {distance} away, if it has not drifted.',
        'Far north the wind runs in a hexagon. Six straight sides, all the way round. Nobody has ever told it to stop.',
        'Our day is ten and a half hours. We spend most of it looking up.',
        'Once in a Saturn year the north boils over in a great white storm. The last one went all the way round the world.',
        'Every town has an orrery in the middle, so the children know which way is up.',
        'When the Sun lies flat on the rings they go thin as a thread, and the old ones go quiet for a season.',
        'In winter the rings throw their shadow on us. We call it the long shade, and we hang lanterns in the gardens.',
        'Titan is the orange moon. Its air is thicker than ours and it rains on purpose there.',
        'The little moons sweep the gaps in the rings. Pan keeps Encke clean, Daphnis keeps Keeler. Good neighbours.',
        'We build in circles because a circle has no corner for the wind to catch.',
        'Down in the Storm Alley the lightning plays the Dragon\'s Harp. Some nights you can hear it from here.',
      ],
      visitor: [
        'Your world has only one moon? Where do you put the rest of your sky?',
        'Is it true your planet has no rings? We are so sorry. Is anyone working on it?',
        'You weigh almost exactly what you weigh at home. Saturn is polite like that.',
        'Your sky is blue, they say, and empty at noon. What do you look at all day?',
        'We would sink in your oceans. You would sink in our clouds. Let us agree to visit.',
        'A {species} would think your world very heavy, very wet and very small. Lovely, but small.',
        'Earth is the faint blue dot beside the Sun. Cassini took its picture from here once. You were all waving.',
        'Two arms, one head, no halo. You must be cold round the ears.',
        'Your little machine floats nicely. Most heavy things we see are going down.',
        'You came nine and a half times as far from the Sun as you live. Was it worth it? Look up and tell me.',
      ],
      farewell: [
        'Drift well. Keep the rings on your south and you will not get lost.',
        'Go gently, and do not walk off the edge of anything.',
        'Come back at night. The rings are better at night.',
        'May your wind be steady and your platform level.',
        'Light winds. That means goodbye too, if you say it while walking away.',
        'Mind the Hexagon if you go north. It has corners, and corners bite.',
        'Off you go, then. We will look for you in the blue dot.',
      ],
    },
    architecture: {
      forms: [
        { item: 'halo', weight: 5 },
        { item: 'gyre', weight: 3 },
        { item: 'garden', weight: 3 },
        { item: 'hall', weight: 2 },
        { item: 'gate', weight: 1 },
        { item: 'bulb', weight: 1 },
      ],
      landmark: 'orrery',
      // Ice and cream for the walls, butterscotch and gold for the masts and
      // hoops, cool accents that read on a warm deck; the platform a pale
      // grey stone, so the town is a disc of light on the cloud.
      walls: [PALETTE.cream, PALETTE.white, PALETTE.bone, PALETTE.blush],
      roofs: [PALETTE.sand, PALETTE.apricot, PALETTE.gold, PALETTE.tan],
      accents: [PALETTE.gold, PALETTE.skyBlue, PALETTE.violet, PALETTE.white],
      // Steel paving on the cream deck, so the town stands out of it.
      ground: PALETTE.steel,
      height: 1.1,
      density: 3.6,
      // Five spokes: an odd number, so no avenue lines up with another.
      avenues: 5,
      colony: {
        modules: [{ item: 'geodesic-dome', weight: 2 }, { item: 'house-cylinder', weight: 2 }, { item: 'house-open', weight: 2 }, { item: 'solar-array', weight: 1 }, { item: 'hangar-glass', weight: 1 }, { item: 'halo', weight: 2 }, { item: 'gyre', weight: 1 }, { item: 'garden', weight: 1 }],
        centre: null,
        roofs: 0.45,
        yards: 0.35,
        tubes: true,
        gardens: ['tree-swirl-1', 'tree-swirl-2', 'tree-light-1'],
        spaceport: 300000,
      },
      extra: DRIFTER_BUILDINGS,
    },
    cast: { creatures: [{ item: 'squidle', weight: 3 }, { item: 'pinkblob', weight: 2 }], visitors: ['astronaut-bee', 'astronaut-redpanda'] },
    crowd: 1.1,
  }),
  decorations: [],
  // Billows of the deck (`BILLOW`), where a crust has its boulders.
  rocks: 14,
  vehicles: ['skiff', 'lander'],
  ambient: [
    // Sky mantas over the deck.
    { kind: 'fliers', count: 12, color: PALETTE.apricot, belly: PALETTE.white, size: 3.8 },
    // Ice from the rings: grains drift down out of them all the time (Cassini
    // measured tonnes a second falling in along the field lines), glinting.
    { kind: 'motes', count: 190, color: PALETTE.white, fall: 1.4, speed: 0.6 },
    // Columns of rising cloud: the convection that heaps a white storm.
    { kind: 'dust-devil', count: 3, color: PALETTE.cream },
    // Storm Alley's lightning, which Cassini heard as radio crackle for
    // months at a time and saw by night once.
    { kind: 'lightning', count: 1, rate: 6, color: PALETTE.white, where: stormAlley },
  ],
  // Saturn's equatorial jet, the fastest wind of the giants after Neptune's.
  wind: { toward: 90, speed: 45, strength: 0.8 },
  landmarks: LANDMARKS,
  // Keeler, at 24 N in the North Equatorial Belt: the latitude the rings are
  // widest from, arched over the southern sky from eighteen degrees above the
  // horizon to fifty. (From Thunderhead at 35 N, on the Great White Spot,
  // they run from four to thirty-four; from the equator they are a thread.)
  spawn: 'keeler',
});
