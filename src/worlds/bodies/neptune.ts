/**
 * Neptune, walked: a cloud deck at the 1-bar level thirty times further from
 * the Sun than Earth, in the fastest wind in the solar system.
 *
 * Everything true about Neptune — its radius, its 16.11-hour day, its tilt,
 * the storms at the latitudes Voyager 2 found them, the eight nations and
 * sixteen towns and the Gale who live in them — is
 * `src/system/bodies/neptune.ts`. This file says what it is like to stand
 * there:
 *
 * - **The deck** is deep blue — methane takes the red out of the sunlight
 *   and leaves the rest — banded darker at the Great Dark Spot's latitude and
 *   white at its companions', and combed east to west everywhere by a wind
 *   that does not stop. The storms are relief (`neptune/features.ts`): the
 *   Dark Spot a basin the size of Earth with a wall round it and white
 *   companion clouds piled on its south rim, Scooter a lens of bright cloud,
 *   the Wizard's Eye a smaller basin with a bright core, and between 20 and
 *   55 degrees either side long thin ridges of cirrus along the parallels.
 * - **The weight**: 11.15 m/s², a seventh more than Earth's, so a jump is a
 *   little shorter than at home and nothing else is very different.
 * - **The sky** is a deep, dim blue with the stars faint through it in the
 *   day, and the Sun a hard white point 30 au away giving about a
 *   nine-hundredth of Earth's light; the sky's law gives back a share and
 *   `exposure` a little more, and no more than that, so the place stays dim.
 * - **The Gale** (invented) write in a raked, zigzag hand that stands on a
 *   line like grass in a gale, speak high and quick in whistles, and build
 *   hulls, fins, sails and kites, all of it tied down (`neptune/buildings.ts`).
 * - **What moves**: methane ice crystals blowing past the eye, and white
 *   updraft columns walking the deck — the convection the companion clouds
 *   are made of.
 * - **Drawn from the space kit**: the Gale are the kit's birb and hywirl at
 *   their own great height, and the kit's modules are drawn large for them,
 *   among their own wind-houses and sail halls.
 * - **What to take**: a saucer and a lander, both of which fly; the rovers
 *   parked on its streets drive its skyways.
 */

import { PALETTE } from '../../theme.ts';
import { NEPTUNE, SPECIES } from '../../system/bodies/neptune.ts';
import { ICE_PLUME } from '../../system/parts/ice-plume.ts';
import { defineCivilisation, defineWorld } from '../contract.ts';
import type { Tint } from '../contract.ts';
import { smoothstep } from '../../system/noise.ts';
import { tone } from '../../monuments/contract.ts';
import { unitAt } from '../../sphere.ts';
import { NEPTUNE_FEATURES } from './neptune/features.ts';
import { GALE_BUILDINGS } from './neptune/buildings.ts';
import { LANDMARKS } from './neptune/landmarks.ts';
import { NEPTUNE_MOONS, neptuneRings } from './neptune/sky.ts';

const GALE = SPECIES.find((one) => one.id === 'gale')!;

/**
 * The bands, equator outward, one entry for each 2.34 degrees.
 *
 * The deck's painter lays the list over 37.5 degrees of latitude and repeats
 * it, mirrored north and south. Neptune is one azure, and the bands are only
 * that and the white of the streaks (28 to 33 degrees, where the companions
 * sit); the dark spots are painted where they are by `paintDeck` below, not
 * at their latitude all the way round, which grey bands had done and which
 * turned the whole deck the colour of slate.
 */
const BANDS = [
  PALETTE.skyBlue, // 0: the equatorial blue
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.white, // 28: the companions and the streaks
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
];

/**
 * The spots, painted where Voyager 2 saw them: the Great Dark Spot a deep blue
 * hole with its bright companions on the southern rim, the Wizard's Eye dark
 * with a white core, the northern spot of 2018 dark, Scooter white. A spot is
 * a disc of `size` degrees in a darker or brighter tone of the deck, soft at
 * its edge; `core` is a white centre.
 */
const DEEP = tone(PALETTE.skyBlue, 0.5);
const SPOTS = [
  { lat: -22, lon: 15, size: 11, color: DEEP, weight: 0.85, core: 0 },
  { lat: -29.5, lon: 13, size: 3.2, color: PALETTE.white, weight: 0.8, core: 0 },
  { lat: -55, lon: 120, size: 6.5, color: DEEP, weight: 0.75, core: 1.6 },
  { lat: 32, lon: -150, size: 7, color: DEEP, weight: 0.7, core: 0 },
  { lat: -42, lon: -60, size: 4, color: PALETTE.white, weight: 0.85, core: 0 },
].map((spot) => ({
  ...spot,
  at: unitAt(spot.lat, spot.lon, { x: 0, y: 0, z: 0 }),
  inner: Math.cos((spot.size * 0.45 * Math.PI) / 180),
  outer: Math.cos((spot.size * Math.PI) / 180),
  coreCos: Math.cos((spot.core * Math.PI) / 180),
}));
const PAINT: Tint = { color: DEEP, weight: 0 };

function paintDeck(dir: { readonly x: number; readonly y: number; readonly z: number }): Tint | null {
  for (const spot of SPOTS) {
    const dot = dir.x * spot.at.x + dir.y * spot.at.y + dir.z * spot.at.z;
    if (dot <= spot.outer) continue;
    if (spot.core > 0 && dot > spot.coreCos) {
      PAINT.color = PALETTE.white;
      PAINT.weight = 0.8;
      return PAINT;
    }
    PAINT.color = spot.color;
    PAINT.weight = spot.weight * smoothstep(spot.outer, spot.inner, dot);
    return PAINT;
  }
  return null;
}

export const WORLD = defineWorld(NEPTUNE, {
  relief: {
    // The system's map at a twenty-fifth: from orbit the storms are there as
    // swells; on foot it is the features below that carry them.
    planetScale: 0.04,
    detail: [
      // Billows a walker finds, creased a little where they meet.
      { amplitude: 3.5, wavelength: 90, octaves: 3, ridged: 0.3 },
      // The deck's long roll.
      { amplitude: 22, wavelength: 1700, octaves: 2, ridged: 0 },
    ],
    craters: null,
    features: NEPTUNE_FEATURES,
    padReach: 1.5,
  },
  palette: {
    base: PALETTE.skyBlue,
    steep: PALETTE.white,
    bands: BANDS,
    // Low: the bands on Neptune are clean, the wind smears them along a
    // parallel rather than across it.
    turbulence: 0.3,
    // The high cirrus — the system's biome over the bright companions —
    // shows white through the blue.
    biomes: { cirrus: PALETTE.white },
    biomeBlend: 0.6,
    tint: paintDeck,
    // The fastest winds in the solar system, and backwards: the deck's
    // paint streams west.
    churn: { boil: 0.6, speed: -42, wavelength: 320, strength: 0.12 },
  },
  sky: {
    horizon: PALETTE.skyBlue,
    zenith: PALETTE.slate,
    // Less than Jupiter's, so a little of the dark shows through overhead
    // and the brightest stars stay up by day: the light here is that thin.
    air: 0.62,
    light: PALETTE.white,
    exposure: 1.15,
    // Triton going round the wrong way, and the faint rings with their arcs
    // (`neptune/sky.ts`).
    moons: NEPTUNE_MOONS,
    layers: [neptuneRings(0.62)],
  },
  civilisation: defineCivilisation(GALE, {
    script: {
      glyphs: 28,
      strokes: [2, 4],
      loops: 0,
      hooks: 2,
      bars: 3,
      dots: 1,
      zigzags: 4,
      // Raked hard, like everything here.
      slant: 0.5,
      line: 'base',
      consonants: 'fwshvlrt',
      vowels: 'iiueo',
    },
    // A long thin throat and a wind to be heard over: high, quick, whistling.
    voice: { pitch: [280, 430], pace: [8.5, 11], tract: [1.3, 1.6], wander: 0.3 },
    phrases: {
      greet: [
        'Hold on to something, small one. Welcome to {place}.',
        'Fwee-sh! That is hello. Said properly it lasts until the wind changes.',
        'You came down through the haze on purpose? Then welcome to {nation}, and stand side-on.',
        'A visitor! Turn your shoulder to the wind and you will hardly notice it.',
        'Greetings from {place}. We have been expecting someone since the bright machine went by.',
        'You walk face-first into the gale. That is very brave, or you have not noticed it yet.',
        'Welcome. You are standing on a cloud, in a wind faster than sound. Try not to think about either.',
        'So short! Every {species} in {place} will want to look at you. Welcome.',
      ],
      world: [
        'The wind at the equator runs backwards, against the turning of the world. We have stopped asking it why.',
        'The nearest other town is {distance} away, downwind. Upwind it takes most of a life.',
        'Every house in {place} points its nose into the wind. A house that turns its back is a house that leaves.',
        'Our year is a hundred and sixty-five of yours. Nobody here has ever had two birthdays.',
        'Our day is sixteen hours. The wind does not care; it blows through the night as well.',
        'The Great Dark Spot opened in the south, stayed a while, and shut. The old ones say it went to sleep.',
        "The white companions sit on the Spot's south rim like gulls on a wave. We climb them for the view.",
        'Scooter goes round faster than everything near it. Our children race it and lose, every time.',
        'The high cirrus throws a shadow on the blue below. It is the only shade on the whole world.',
        'Far, far down it is hot and it rains diamonds, they say. Nobody goes down to look.',
        'The Sun is a bright star here. It is warm in stories only.',
        'Our moon Triton goes round backwards and is falling slowly. One day it will be rings. We are patient.',
        'Our rings have arcs in them called Liberty, Equality, Fraternity and Courage. Liberty is fading. We worry about that.',
        'We read the gale off a kite line. Today it is a three-kite wind, which is a calm.',
      ],
      visitor: [
        'Your people found our world with a pencil, they say, before anyone ever looked. Is that true?',
        'Earth is too near the Sun to see from here. We will have to take your word for it.',
        'Your clouds have water in them? And it falls out? Onto you? On purpose?',
        'You feel heavy here, I think. A seventh heavier. You walk like someone carrying a sleeping child.',
        'The bright machine came by once, long before you. It did not stop to talk either.',
        'Your sky is blue because of the air, ours because of the methane. So we are both blue for nothing.',
        'You have no tail. How do you know which way to face?',
        'On your world the wind stops sometimes? What do you do all day?',
        'Is it true your Sun is too bright to look at? Ours is just the right size for wishing on.',
      ],
      farewell: [
        'Go with the wind, small one. It is going anyway.',
        'Keep your nose in the gale and your lines tight.',
        'Fwee-sh. That one was goodbye.',
        'May your kites fly high and your tether hold.',
        'Come back in a hundred and sixty-five years. We will hardly have changed.',
        'Mind the edge of the Spot. It has been known to come back.',
      ],
    },
    architecture: {
      forms: [
        { item: 'wind-house', weight: 6 },
        { item: 'kite-mast', weight: 2 },
        { item: 'sail-hall', weight: 2 },
        { item: 'anchored-lens', weight: 2 },
      ],
      landmark: 'gale-mast',
      // Hulls pale, so a town reads on the blue; the rigging the dark slate
      // and steel; the sails and kites the brightest things on the planet,
      // which is the point of a kite.
      walls: [PALETTE.white, PALETTE.bone, PALETTE.cream],
      roofs: [PALETTE.steel, PALETTE.slate],
      accents: [PALETTE.gold, PALETTE.orange, PALETTE.crimson, PALETTE.pink],
      ground: PALETTE.slate,
      height: 1,
      density: 2.6,
      avenues: 4,
      // Every hull lies head to wind, like a boat at anchor.
      yaw: 'wind',
      colony: {
        modules: [{ item: 'house-long', weight: 2 }, { item: 'house-cylinder', weight: 3 }, { item: 'hangar-large', weight: 1 }, { item: 'geodesic-dome', weight: 1 }, { item: 'wind-house', weight: 3 }, { item: 'sail-hall', weight: 1 }, { item: 'kite-mast', weight: 1 }],
        centre: null,
        scale: 1.35,
        roofs: 0.5,
        yards: 0.15,
        tubes: true,
        gardens: ['tree-spiral-2', 'tree-spiral-3', 'grass-2'],
        spaceport: 200000,
      },
      extra: GALE_BUILDINGS,
    },
    cast: { creatures: [{ item: 'birb', weight: 3 }, { item: 'hywirl', weight: 2 }], visitors: ['astronaut-redpanda', 'astronaut-bee'] },
    crowd: 1.1,
  }),
  // The system's biomes name these, and they stand on the deck where its
  // biomes say: ice plumes on the cirrus, drifts in the bands.
  decorations: [ICE_PLUME],
  // Billows of the deck (`BILLOW`), where a crust has its boulders.
  rocks: 14,
  vehicles: ['ufo', 'lander'],
  ambient: [
    // Fliers holding into the gale.
    { kind: 'fliers', count: 10, color: PALETTE.slate, belly: PALETTE.white, size: 3.2 },
    // Methane ice, blowing past: what the white streaks are made of.
    { kind: 'motes', count: 240, color: PALETTE.white, speed: 16 },
    // Updraft columns, the convection that makes a companion cloud.
    { kind: 'dust-devil', count: 4, color: PALETTE.white },
    // Cirrus racing overhead on the jet.
    { kind: 'streaks', count: 34, color: PALETTE.white, speed: 70 },
  ],
  // Westward, and hard: what the Gales lean into and the towns lie to.
  wind: { toward: 270, speed: 40, strength: 1 },
  landmarks: LANDMARKS,
  // Companion, on the bright ridge over the Great Dark Spot's south rim: the
  // basin falls away to the north, the Overlook two thousand units along it.
  spawn: 'companion',
});
