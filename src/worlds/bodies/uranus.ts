/**
 * Uranus, walked: a pale cyan deck under a sun that never sets, where the sky is
 * the strange thing and the ground is not.
 *
 * What is true about Uranus (hood, collar, dark spot and storms, the towns and
 * the Sidelings) is `src/system/bodies/uranus.ts`; this file says what it is
 * like to stand there.
 *
 * - The deck is the calmest of the four giants: long low swells, small soft
 *   billows and the faintest banding. North of about 50 degrees it climbs into
 *   the polar hood, which breaks into small round convective clouds (the
 *   "popcorn"); the Storm Latitudes carry the towers of 2014, the Dark Spot is
 *   a hollow with its bright companion, and the night pole is ringed by
 *   Voyager's collar.
 * - The engine turns the sky by the real pole, 97.77 degrees over, so the Sun
 *   circles all day: at 54 N it stays between about 37 and 71 degrees up, at the
 *   equator it rolls along the horizon, and south of 17 S it does not come up.
 *   It is a small hard point (19 au away) over a sky cyan at the horizon, where
 *   the methane haze is thickest, and dim violet overhead.
 * - Gravity is 8.69 m/s2 (0.89 g).
 * - The Sidelings write in a backward-leaning hand of bars, zigzags and dots,
 *   speak high, clear and very slowly, and build in crystal: prism clusters,
 *   flat lenses on stalks held level to the circling Sun, frost spires and a
 *   sunwatch in every square. They are the kit's fish and frog.
 * - Methane snow drifts past the eye and pale columns of convection stand up
 *   out of the deck.
 * - A saucer and a lander are takeable; the rovers on the streets drive its skyways.
 */

import { PALETTE } from '../../theme.ts';
import { DECK_CLOUDS, SPECIES, URANUS, deckRelief } from '../../system/bodies/uranus.ts';
import { defineCivilisation, defineWorld } from '../contract.ts';
import type { Tint } from '../contract.ts';
import { smoothstep } from '../../system/noise.ts';
import { tone } from '../../monuments/contract.ts';
import { unitAt } from '../../sphere.ts';
import { SIDELING_BUILDINGS } from './uranus/buildings.ts';
import { LANDMARKS } from './uranus/landmarks.ts';
import { URANUS_MOONS, uranusRings } from './uranus/sky.ts';

const SIDELING = SPECIES.find((one) => one.id === 'sideling')!;

/**
 * The bands, equator outward, one entry for each 2.34 degrees. The deck's
 * painter (`terrain.ts`) lays the list across 37.5 degrees of latitude and
 * repeats it. Uranus is the featureless one: cyan, with three pale lines. The
 * polar hood is one pole's, so it is painted over the bands by `paintDeck`
 * below, with the named clouds.
 */
const BANDS = [
  PALETTE.white, // 0: the bright equatorial line
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.bone, // a faint grey band, the haze thinning
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.white, // a pale line at 19 degrees
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.skyBlue,
  PALETTE.cream, // and a warmer one at 30
  PALETTE.skyBlue,
  PALETTE.skyBlue,
];

/**
 * The hood and the clouds, painted where they are: the north polar hood a pale
 * cap from about 45 N, brightest over the pole; the 2006 Dark Spot deep blue,
 * and every bright cloud (its companion, Berg, the storms of 2014) white, each
 * soft at its edge.
 */
const DEEP = tone(PALETTE.skyBlue, 0.5);
const CLOUDS = DECK_CLOUDS.map((cloud) => ({
  at: unitAt(cloud.lat, cloud.lon, { x: 0, y: 0, z: 0 }),
  inner: Math.cos((cloud.width * 0.8 * Math.PI) / 180),
  outer: Math.cos((cloud.width * 2.2 * Math.PI) / 180),
  dark: cloud.height < 0,
}));
const PAINT: Tint = { color: PALETTE.white, weight: 0 };

function paintDeck(dir: { readonly x: number; readonly y: number; readonly z: number }, lat: number): Tint | null {
  for (const cloud of CLOUDS) {
    const dot = dir.x * cloud.at.x + dir.y * cloud.at.y + dir.z * cloud.at.z;
    if (dot <= cloud.outer) continue;
    PAINT.color = cloud.dark ? DEEP : PALETTE.white;
    PAINT.weight = (cloud.dark ? 0.8 : 0.75) * smoothstep(cloud.outer, cloud.inner, dot);
    return PAINT;
  }
  const hood = smoothstep(42, 66, lat);
  if (hood <= 0) return null;
  PAINT.color = PALETTE.white;
  PAINT.weight = 0.72 * hood;
  return PAINT;
}

export const WORLD = defineWorld(URANUS, {
  relief: {
    // The body has no `ground`, so the whole of the deck's relief is the one feature below.
    planetScale: 1,
    detail: [
      // Billows: soft and small, with only a hint of a crease.
      { amplitude: 3, wavelength: 130, octaves: 3, ridged: 0.1 },
      // The long slow swell, two kilometres from crest to crest.
      { amplitude: 16, wavelength: 2200, octaves: 2, ridged: 0 },
    ],
    craters: null,
    features: [(dir, lat) => deckRelief(dir.x, dir.y, dir.z, lat)],
    padReach: 1.5,
  },
  palette: {
    base: PALETTE.skyBlue,
    steep: PALETTE.bone,
    bands: BANDS,
    turbulence: 0.22,
    tint: paintDeck,
    // The calm one: a slow simmer, a slow drift.
    churn: { boil: 0.25, speed: 6, wavelength: 360, strength: 0.04 },
  },
  sky: {
    // Cyan at the horizon, where the light comes through the most methane, and a dim violet overhead.
    horizon: PALETTE.skyBlue,
    zenith: PALETTE.slate,
    air: 0.7,
    light: PALETTE.white,
    // The light at 19 au is a three-hundred-and-seventieth of Earth's and the sky's softened law gives back a quarter; this takes it to a deck that reads, still dimmer than Jupiter's.
    exposure: 1.8,
    // Five moons going round the sky's strange pole, and a dark thread of
    // rings across it (`uranus/sky.ts`).
    moons: URANUS_MOONS,
    layers: [uranusRings(0.7)],
  },
  civilisation: defineCivilisation(SIDELING, {
    script: {
      glyphs: 22,
      strokes: [2, 4],
      loops: 0.5,
      hooks: 0.5,
      bars: 4,
      dots: 2,
      zigzags: 3,
      // Leaning backward: a script from a world on its side.
      slant: -0.22,
      line: 'base',
      consonants: 'shlnvrz',
      vowels: 'iieau',
    },
    // High, clear, the slowest speech of any species: a glass bell. The pitch hardly wanders.
    voice: { pitch: [210, 300], pace: [2.3, 3.3], tract: [1.05, 1.3], wander: 0.06 },
    phrases: {
      greet: [
        'Welcome... to... {place}. Forgive the pauses. We are a people who wait.',
        'You arrived in the middle of the day. That is lucky. The day here lasts forty-two years.',
        'Greetings, quick one. This is {nation}. Sit, if you like. Nothing here is in a hurry.',
        'A visitor! The last one was a machine called Voyager, and it did not stop.',
        'Hello. I began saying hello when I saw your craft come down. I have only just finished.',
        'Welcome to {place}. Stand in the light; it is the only warm thing we have.',
        'Look up and keep looking. The Sun goes round, not over. You will get used to it, or you will not.',
        'You are standing in the coldest air of any planet. Welcome, and keep your hood up.',
        '{place} welcomes you. We lean because the world leans. You will lean too, by evening. Evening is in 2049.',
      ],
      world: [
        'In the north the Sun has not set since your year 2007. In the south it has not risen. We call that fair.',
        'A day is forty-two years and a night is forty-two more. The south sleeps through its night and nobody minds.',
        'The world turns every seventeen hours, but the Sun hardly notices. It just goes round and round, like a lamp on a string.',
        'The nearest other town is {distance} away. We will get there eventually. Eventually is our favourite word.',
        'Far below us the weight of the air turns methane into diamonds, and they fall into the dark like hail. Some nights we think we hear them.',
        'We have thirteen rings, dark as soot and thin as a thought. The brightest is called Epsilon. Even it is shy.',
        'Twenty-eight moons go round us. The big ones are named for people in your plays: Miranda, Ariel, Umbriel, Titania, Oberon. We find that very touching.',
        'Something knocked our world onto its side long ago, before anyone was here to complain. We have been lying down ever since.',
        'Your scientists say our clouds smell of rotten eggs. We say they smell of home.',
        'In your year 2014 eight great storms rose in the Storm Latitudes. People still talk about it. It was very exciting.',
        'We build in crystal and glass because the light is so little that none of it may be wasted.',
        'Spring in {nation} takes twenty-one years. We plan our parties accordingly.',
        'Our wind blows backward at the equator and forward near the poles. It has never explained itself.',
        'In the Long Night the sleepers wait for the Sun. They will wake in 2049 and want to hear all the news.',
        'Our world gives off almost no warmth of its own. Whatever warmth you feel here, someone brought it.',
      ],
      visitor: [
        'You move so quickly. Do you ever see anything, moving like that?',
        'Is it true your days are only one day long? How does anything get finished?',
        'Your Sun is a fire you can warm your hands at, they say. Ours is a bright coin, very far off. We love it anyway.',
        'Your world is so near the Sun that from here we cannot find it at all. We have looked. We are very patient.',
        'A man of yours called Herschel found us in 1781 with a mirror he polished himself. He wanted to call us George. We would have liked that.',
        'Your Voyager went by in 1986 and never said a word. We waved for eleven years.',
        'You stand so straight. On a world that lies on its side, that looks very brave.',
        'You weigh almost what you weigh at home. Some visitors come here hoping to feel lighter, and are disappointed.',
        'One of our years is eighty-four of yours. If you stayed, you might see one summer. Just one.',
        'Your face changes so much while you talk. We find it exhausting, in a nice way.',
        'Will a {species} like me see you again at the next equinox? It is in 2049. I will save you a seat.',
      ],
      farewell: [
        'Go slowly. There is no other way to arrive.',
        'Until the equinox, then.',
        'Keep the Sun on your hood and the rings at your back.',
        'Farewell. I will think about what you said for a few years, and let you know.',
        'Walk gently on the deck. It remembers nothing and forgives everything.',
        'Go well, quick one. Do not wait for us; we will catch up.',
        'May your light last as long as ours. Ours lasts forty-two years.',
        'Goodbye. That one I said quickly, for your sake.',
      ],
    },
    architecture: {
      forms: [
        { item: 'crystal', weight: 5 },
        { item: 'lens', weight: 4 },
        { item: 'frost-spire', weight: 2 },
        { item: 'ring', weight: 1 },
      ],
      landmark: 'sunwatch',
      // Frost and quartz for the walls, the deck's cyan and the zenith's violet for
      // the roofs and plinths, and the Sun's gold for the trim (also every town's beacon).
      walls: [PALETTE.white, PALETTE.bone, PALETTE.cream, PALETTE.white],
      roofs: [PALETTE.skyBlue, PALETTE.violet, PALETTE.slate],
      accents: [PALETTE.gold, PALETTE.apricot, PALETTE.skyBlue, PALETTE.violet],
      ground: PALETTE.slate,
      height: 1.1,
      // Room between the houses, and five avenues out from the sunwatch: the five big moons.
      density: 3.4,
      avenues: 5,
      colony: {
        modules: [{ item: 'house-single', weight: 2 }, { item: 'house-open-back', weight: 2 }, { item: 'geodesic-dome', weight: 2 }, { item: 'house-long', weight: 1 }, { item: 'crystal', weight: 2 }, { item: 'lens', weight: 2 }],
        centre: null,
        roofs: 0.5,
        yards: 0.35,
        tubes: true,
        gardens: ['tree-spiral-1', 'bush-1', 'bush-2'],
        spaceport: 300000,
      },
      extra: SIDELING_BUILDINGS,
    },
    cast: { creatures: [{ item: 'fish', weight: 3 }, { item: 'frog', weight: 2 }], visitors: ['astronaut-frog', 'astronaut-flamingo'] },
    crowd: 0.8,
  }),
  decorations: [],
  // Billows of the deck (`BILLOW`), where a crust has its boulders.
  rocks: 14,
  vehicles: ['ufo', 'lander'],
  ambient: [
    // Pale fliers in the methane haze.
    { kind: 'fliers', count: 10, color: PALETTE.skyBlue, belly: PALETTE.white, size: 3 },
    // Methane snow: the deck's haze freezing out, drifting past the eye.
    { kind: 'motes', count: 200, color: PALETTE.white },
    // Columns of convection standing up out of the deck, few and slow.
    { kind: 'dust-devil', count: 3, color: PALETTE.white },
    // Diamonds: the carbon that rains out of the deep, a sparkle here and there.
    { kind: 'glint', count: 36, color: PALETTE.white, size: 0.7 },
  ],
  // A steady westward drift over the methane deck.
  wind: { toward: 270, speed: 20, strength: 0.4 },
  landmarks: LANDMARKS,
  // Longlight, on the hood's rim: the Sun circling high all day, Herschel's Glass a short walk north.
  spawn: 'longlight',
});
