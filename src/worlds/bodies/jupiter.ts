/**
 * Jupiter, walked: a cloud deck at the 1-bar level, and the one world where
 * the ground is weather.
 *
 * Everything true about Jupiter — its belts and zones at their latitudes, the
 * storms with their walls and spiral arms, the fourteen towns and the Floaters
 * — is `src/system/bodies/jupiter.ts`. This file says what it is like to stand
 * there:
 *
 * - **The deck** is banded in Jupiter's own order from the equator out —
 *   cream Equatorial Zone, rust Equatorial Belts, the white Tropical Zones,
 *   the tan Temperate Belts — torn along each edge by the turbulence the jets
 *   leave, and it rises and falls with the storms: the Great Red Spot is a
 *   wall three hundred units high round a raised plateau wound with three
 *   spiral arms, Oval BA and the eight Pearls are smaller walls, the hot spots
 *   are holes, and the poles are packed with Juno's cyclones.
 * - **The weight**: 24.79 m/s², two and a half Earths, and a jump is a hop.
 * - **The sky** is pale: hydrogen scatters blue overhead the way nitrogen does
 *   on Earth, the ammonia haze turns the horizon cream, and the Sun is a small
 *   hard point 5.2 au away, giving a twenty-seventh of Earth's light.
 * - **The Floaters** write in looped, dotted glyphs hung from a line, speak
 *   low and slow through a throat the size of a balloon, and build in
 *   membranes, bladders, rings and spokes on platforms moored in the wind.
 * - **What moves**: ammonia ice crystals drifting past the eye, and white
 *   columns of rising cloud wandering the deck.
 * - **Drawn from the space kit**: the Floaters are the kit's drifter and glub,
 *   floating; their platforms carry pods and glass hangars among their own
 *   bladders and wind wheels, with floating trees in the yards.
 * - **What to take**: a saucer and a lander, both of which fly; the rovers
 *   parked on its streets drive its skyways.
 */

import { PALETTE } from '../../theme.ts';
import { JUPITER, SPECIES, deckRelief, stormRelief, zoneAt } from '../../system/bodies/jupiter.ts';
import type { StormHit } from '../../system/bodies/jupiter.ts';
import { smoothstep } from '../../system/noise.ts';
import { tone } from '../../monuments/contract.ts';
import { defineCivilisation, defineWorld } from '../contract.ts';
import type { Tint } from '../contract.ts';
import { FLOATER_BUILDINGS } from './jupiter/buildings.ts';
import { LANDMARKS } from './jupiter/landmarks.ts';
import { GALILEANS } from './jupiter/moons.ts';

const FLOATER = SPECIES.find((one) => one.id === 'floater')!;

/**
 * The bands, equator outward, one entry for each 2.34 degrees.
 *
 * The deck's painter (`terrain.ts`) lays `bands` from the equator toward the
 * pole so that the whole list spans 37.5 degrees of latitude and then
 * repeats, mirrored north and south — so sixteen entries are sixteen steps of
 * 2.34 degrees, chosen to put Jupiter's own bands where they are: the
 * Equatorial Zone to 7, the Equatorial Belts to about 18, the Tropical Zone
 * to 24, the Temperate Belt to 33, the Temperate Zone after it. Past 37.5 the
 * pattern comes round again, which is not Jupiter but is at least banded.
 */
const BANDS = [
  PALETTE.cream, // 0: the Equatorial Zone
  PALETTE.cream,
  PALETTE.sand, // the Zone's ochre edge, where the festoons trail in
  PALETTE.clay, // 7: the Equatorial Belts, rust
  PALETTE.brown,
  PALETTE.clay,
  PALETTE.brown,
  PALETTE.salmon, // the belt fading out
  PALETTE.cream, // 19: the Tropical Zone, where the Red Spot lives
  PALETTE.white,
  PALETTE.sand,
  PALETTE.tan, // 24: the Temperate Belt
  PALETTE.brown,
  PALETTE.tan,
  PALETTE.cream, // 33: the Temperate Zone
  PALETTE.bone,
];

/**
 * The storms painted over the bands, by the same table the deck is raised by
 * (`stormRelief`): the Great Red Spot red, fading through salmon into the zone
 * round it; the ovals and the Pearls white; the hot spots the dark blue-grey of
 * a hole into clear air; the polar cyclones steel. And past about 55 degrees
 * the bands give way to the poles' grey-blue haze, which is what Juno saw.
 */
const stormHit: StormHit = { storm: null, e: Infinity };
const HOLE = tone(PALETTE.slate, 0.55);
const STORM_PAINT: Record<string, { color: number; weight: number }> = {
  'red-spot': { color: PALETTE.red, weight: 0.88 },
  oval: { color: PALETTE.white, weight: 0.85 },
  'hot-spot': { color: HOLE, weight: 0.8 },
  cyclone: { color: PALETTE.steel, weight: 0.55 },
};
const POLE: Tint = { color: PALETTE.slate, weight: 0 };
const STORM: Tint = { color: PALETTE.red, weight: 0 };

function paintDeck(dir: { readonly x: number; readonly y: number; readonly z: number }, lat: number): Tint | null {
  stormRelief(dir.x, dir.y, dir.z, stormHit);
  const storm = stormHit.storm;
  if (storm !== null && stormHit.e < 1.2) {
    const paint = STORM_PAINT[storm.kind];
    if (paint !== undefined) {
      STORM.color = paint.color;
      STORM.weight = paint.weight * (1 - smoothstep(0.45, 1.2, stormHit.e));
      return STORM;
    }
  }
  POLE.weight = 0.5 * smoothstep(50, 72, Math.abs(lat));
  return POLE.weight > 0 ? POLE : null;
}

export const WORLD = defineWorld(JUPITER, {
  relief: {
    // The body has no `ground` (see `JUPITER_GROUND` in the system file), so
    // the whole of the deck's relief — the zones over the belts and the
    // storms — is the one feature below, in units already.
    planetScale: 1,
    detail: [
      // Billows: the small heaps of cloud a foot finds, soft with a little
      // crease where they meet, which is where the cel ramp steps.
      { amplitude: 4, wavelength: 110, octaves: 3, ridged: 0.25 },
      // Swells a kilometre or two long, the deck's slow roll.
      { amplitude: 24, wavelength: 1500, octaves: 2, ridged: 0 },
    ],
    craters: null,
    features: [(dir, lat) => deckRelief(dir.x, dir.y, dir.z, lat)],
    padReach: 1.5,
  },
  palette: {
    base: PALETTE.sand,
    steep: PALETTE.brown,
    bands: BANDS,
    turbulence: 0.35,
    tint: paintDeck,
    // The jets run east and west in turn; on the deck the drift is a slow
    // eastward roll under the boil.
    churn: { boil: 0.4, speed: 14, wavelength: 300, strength: 0.06 },
  },
  sky: {
    horizon: PALETTE.cream,
    zenith: PALETTE.skyBlue,
    air: 0.75,
    light: PALETTE.cream,
    // The light at 5.2 au is a twenty-seventh of Earth's and the sky's own law
    // already gives back half; this is the rest of the way to a deck that reads.
    exposure: 1.3,
    moons: GALILEANS,
  },
  civilisation: defineCivilisation(FLOATER, {
    script: {
      glyphs: 30,
      strokes: [1, 3],
      loops: 4,
      hooks: 1,
      bars: 1,
      dots: 3,
      zigzags: 1,
      slant: 0,
      line: 'top',
      consonants: 'mwlbhvn',
      vowels: 'ouoa',
    },
    // A throat the size of a balloon: low, slow, and warbling as the bag
    // breathes.
    voice: { pitch: [62, 112], pace: [3.2, 4.8], tract: [0.52, 0.7], wander: 0.3 },
    phrases: {
      greet: [
        'Drift gently, small heavy one. You have come down in {place}.',
        'Welcome to {nation}. Hold on to something; the wind is in a good mood today.',
        'A visitor who walks! Everyone come and look, it uses its feet.',
        'Ooo-mm. That is hello. It is also goodbye, and pass the ammonia, depending on the bag.',
        'You came from the Sun side of the sky? Welcome to {place}, and mind the edge of the platform.',
        'Greetings. You are standing on a cloud. Try not to think about it too hard.',
        'You sank all the way down here on purpose? Then welcome to {place}.',
        'The bag sings when a guest arrives. Can you hear it? That is my bag singing.',
      ],
      world: [
        '{place} is moored to the wind. If we let go we would be somewhere else by supper.',
        'The nearest other town is {distance} away, upwind. Downwind it is a great deal further.',
        'The Great Spot has turned for longer than anyone remembers. Our songs say it is a door. Our maps say it is a storm.',
        'In the white zones the air climbs and freezes into snow. In the brown belts it sinks and hides. We trade between them.',
        'Our day is ten hours long. The young ones say it is too short for a proper nap.',
        'Far below us the air is hot and thick, and it rains diamonds. Nobody goes down to fetch them.',
        'When the lightning walks the belts we tie the town down twice and sing louder than the thunder.',
        'The little white storms in the south are like us: round, proud, and always in a row with somebody they dislike.',
        'Four big moons go round us. Io is the yellow one that never stops sneezing fire.',
        'Every few years the South Belt fades away, and then it bursts back all at once. We call that spring.',
        'We build with bladders and rings because anything heavy here falls for a very long time.',
      ],
      visitor: [
        'You are so dense! Do you sink in your own bath?',
        'Your world has a hard floor all the way round? Then where does the weather go to rest?',
        'Earth is the faint blue spark beside the Sun. We have watched it for ages and wondered who left the light on.',
        'Your feet hardly leave the cloud when you jump. Here, up is optional and down is compulsory.',
        'You have only one bag on top, and it is full of thinking. How do you stay up?',
        'Is it true that water falls out of your clouds and lies about on the ground in heaps?',
        'A {species} would weigh nothing on your world. We would float away and never be seen again. Lovely.',
        'You look tired. Two and a half times your weight will do that. Sit down; the cloud will hold you.',
        'Your little machine is very brave, flying in our wind. Ours prefer to drift.',
      ],
      farewell: [
        'Drift well, heavy one.',
        'Keep the wind behind you and the Spot on your left.',
        'Go gently. If you fall, fall slowly.',
        'May your bag stay warm and your lines stay tight.',
        'Come back when the moons line up. It is very pretty and nobody gets anything done.',
        'Off you sink, then. Mind the hot spots; there is no bottom to them.',
        'Ooo-mm. That one meant goodbye.',
      ],
    },
    architecture: {
      forms: [
        { item: 'bladder', weight: 5 },
        { item: 'cluster', weight: 3 },
        { item: 'wind-wheel', weight: 3 },
        { item: 'canopy', weight: 2 },
        { item: 'sail', weight: 2 },
        { item: 'pod', weight: 1 },
      ],
      landmark: 'mooring-mast',
      // Membranes pale, bags warm, trim the bright colours of a Floater's
      // harness; the platform a woven raft of tan, so a town reads on a cream
      // zone and a rust belt alike.
      walls: [PALETTE.cream, PALETTE.blush, PALETTE.bone, PALETTE.white],
      roofs: [PALETTE.salmon, PALETTE.apricot, PALETTE.pink, PALETTE.violet],
      accents: [PALETTE.gold, PALETTE.skyBlue, PALETTE.crimson, PALETTE.orange],
      ground: PALETTE.tan,
      height: 1,
      density: 3,
      // The spokes of a wheel.
      avenues: 6,
      colony: {
        modules: [{ item: 'geodesic-dome', weight: 1 }, { item: 'house-single', weight: 2 }, { item: 'house-open', weight: 1 }, { item: 'hangar-glass', weight: 2 }, { item: 'solar-array', weight: 1 }, { item: 'bladder', weight: 3 }, { item: 'cluster', weight: 2 }, { item: 'wind-wheel', weight: 1 }],
        centre: null,
        roofs: 0.5,
        yards: 0.35,
        tubes: true,
        gardens: ['tree-floating-1', 'tree-blob-3', 'tree-light-2'],
        spaceport: 150000,
      },
      extra: FLOATER_BUILDINGS,
    },
    cast: { creatures: [{ item: 'drifter', weight: 3 }, { item: 'glub', weight: 2 }], visitors: ['astronaut-flamingo', 'astronaut-frog'] },
    crowd: 1.2,
  }),
  decorations: [],
  // Billows of the deck (`BILLOW`), where a crust has its boulders.
  rocks: 14,
  vehicles: ['ufo', 'lander'],
  ambient: [
    // Sky mantas over the deck.
    { kind: 'fliers', count: 14, color: PALETTE.salmon, belly: PALETTE.cream, size: 4.2 },
    // Ammonia ice: the white of the zones is these, a few microns each,
    // drawn a good deal bigger.
    { kind: 'motes', count: 170, color: PALETTE.white },
    // Columns of rising cloud: the convection that makes a zone a zone.
    { kind: 'dust-devil', count: 5, color: PALETTE.cream },
    // Lightning in the belts, where the water clouds below convect: Galileo
    // and Juno saw it in the brown belts and almost never in the white zones.
    { kind: 'lightning', count: 1, rate: 7, color: PALETTE.white, where: (lat) => 1 - zoneAt(lat) },
  ],
  // The jets: Jupiter's belts and zones run east and west in alternate bands; here the deck runs east.
  wind: { toward: 90, speed: 30, strength: 0.6 },
  landmarks: LANDMARKS,
  // Hollow, on the Red Spot's northern flank: the storm's wall stands on the
  // southern horizon, Spot Watch on its crest four thousand units away.
  spawn: 'hollow',
});
