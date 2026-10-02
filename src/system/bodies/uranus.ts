/**
 * Uranus, end to end: its deck, its countries, its towns and its people.
 *
 * The physical numbers are NASA's planetary fact sheet: the volumetric mean
 * radius at the 1-bar level (`neptune.ts` says once for all four giants what
 * that radius means), the sidereal rotation, negative because the planet turns
 * retrograde — the convention `venus.ts` already uses — the obliquity of
 * 97.77 degrees, which is the same fact from the other side and the one a menu
 * card should lead with, and the gravity at the 1-bar equator, 8.69 m/s², a
 * little under Earth's.
 *
 * **The tilt is the whole planet.** Uranus lies on its side, so through its
 * 84-year year each pole points almost straight at the Sun for a season and
 * straight away from it for another: forty-two years of daylight, then
 * forty-two of night, with the equator getting a long dusk in between. The
 * northern spring equinox was in December 2007 and the northern summer
 * solstice falls in 2030, so in the 2020s the north is in its long day —
 * and the walking sky (`src/worlds/sky.ts`, from the IAU pole and the real
 * orbit) agrees without being told, equinox and solstice to the year: in
 * October 2026 the Sun is overhead at 73 N, circles the north pole without
 * ever setting, rolls round the equator's horizon no more than 17 degrees
 * above or below it, and does not rise south of 17 S at all. So the people live mostly in the north, and the southern towns sleep.
 *
 * **The deck is the featureless one**, which is its own fact: Voyager 2 flew
 * past in January 1986, with the south pole facing the Sun, and found almost
 * nothing — a pale haze, a faint bright collar round the south pole, and a
 * handful of clouds it took image processing to find. Since the equinox the
 * Hubble and Keck telescopes have watched the north come into the light and
 * found more: a bright **polar hood** over the north pole, a field of small
 * convective **"popcorn" clouds** inside it, the **Uranus Dark Spot** of 2006 at
 * about 28 N, the long-lived bright feature called **Berg** that wandered the
 * southern mid-latitudes until it fell apart near the equator in 2009, and in
 * August 2014 a burst of **bright methane storms** in the northern
 * mid-latitudes. Every one of those is on the deck below, at its latitude.
 *
 * **Longitude is a snapshot**, as on Jupiter: nothing on a cloud deck stays put
 * against a meridian, so the latitudes are the observed ones and the
 * longitudes are chosen.
 *
 * Everything with a name and a population — the countries, the towns and the
 * Sidelings who live in them — is invented, against the rule that it stands on
 * a real feature and is named after it.
 */

import { BODY_SCALE } from '../../stature.ts';
import { unitAt } from '../../sphere.ts';
import { PALETTE } from '../../theme.ts';
import type { Body, Nation, Settlement, Species } from '../contract.ts';
import { surfaceRadiusOf } from '../contract.ts';
import { fbm, smoothstep } from '../noise.ts';
import { grownTowns } from '../towns.ts';

const RADIUS_KM = 25362;

/** 63,693 units: the 1-bar level at the 0.398 km a unit the avatar fixes. */
export const SURFACE_RADIUS = surfaceRadiusOf(RADIUS_KM);

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

/**
 * How the deck stands, units, and every number is small on purpose.
 *
 * Uranus is the calm one: it gives off almost no heat of its own (Jupiter,
 * Saturn and Neptune each radiate between 1.6 and 2.6 times what the Sun
 * gives them; Uranus about 1.1), so there is little to drive convection and
 * the deck rolls rather than boils. The heights are exaggerated over the true
 * ones for the same reason Jupiter's are — so a cloud reads from the town
 * beside it — and kept well below Jupiter's.
 */
const DECK_FLOOR = 15;
/** The north polar hood stands this much over the mid-latitudes. */
const HOOD_RISE = 55;
/** Voyager's south polar collar, a ridge round the night pole. */
const COLLAR_RISE = 40;
/** The popcorn clouds inside the hood, peak height. */
const POPCORN = 24;
/** Their spacing, units: Keck's polar cells are a few hundred kilometres across. */
const POPCORN_WAVELENGTH = 280;

/** One named cloud: a smooth dome (or a hollow) of `height` units and `width` degrees. */
interface Cloud {
  name: string;
  lat: number;
  lon: number;
  width: number;
  height: number;
}

const CLOUDS: Cloud[] = [
  // The Uranus Dark Spot, Hubble, August 2006: about 1,700 by 3,000 km at
  // 28 N, the first dark spot ever seen on the planet. A hollow in the deck,
  // and beside it, poleward, the bright companion cloud that dark spots on
  // the ice giants keep — methane freezing out over the vortex.
  { name: 'Uranus Dark Spot', lat: 28, lon: 150, width: 1.6, height: -70 },
  { name: 'Dark Spot companion', lat: 29.6, lon: 150.4, width: 0.55, height: 75 },
  // Berg: the long-lived bright feature at about 34 S, watched from 2004 until
  // it drifted toward the equator and came apart in 2009. Drawn as the
  // elongated cloud it was, three domes along its length.
  { name: 'Berg', lat: -34, lon: -30, width: 0.9, height: 90 },
  { name: 'Berg tail', lat: -34.4, lon: -28.6, width: 0.7, height: 60 },
  { name: 'Berg head', lat: -33.7, lon: -31.3, width: 0.6, height: 70 },
];

// The August 2014 storms: Keck saw eight big bright clouds in the northern
// mid-latitudes, one of them the brightest thing ever seen on the planet at
// 2.2 microns. Here as five towers in the Storm Latitudes and three more
// strung east of them.
const STORM_TOWERS: readonly [number, number, number, number][] = [
  [31, -98, 0.45, 130],
  [33.2, -93, 0.35, 95],
  [29.4, -104, 0.4, 110],
  [34, -103.5, 0.3, 80],
  [30.6, -90, 0.3, 85],
  [32, -78, 0.5, 120],
  [30, -64, 0.4, 90],
  [33, -52, 0.35, 85],
];
STORM_TOWERS.forEach(([lat, lon, width, height], k) => CLOUDS.push({ name: `Storm of 2014, ${k + 1}`, lat, lon, width, height }));

/** The named clouds, for the landmarks that stand on them. */
export const DECK_CLOUDS: readonly Cloud[] = CLOUDS;

interface PlacedCloud extends Cloud {
  cx: number;
  cy: number;
  cz: number;
  /** `2 / width^2` in radians, so `exp(-(1 - dot) * inv)` is a Gaussian in angle. */
  inv: number;
  /** Past this cosine the cloud adds nothing. */
  cosReach: number;
}

const PLACED: readonly PlacedCloud[] = CLOUDS.map((cloud) => {
  const c = unitAt(cloud.lat, cloud.lon, { x: 0, y: 0, z: 0 });
  const w = cloud.width * DEG;
  return { ...cloud, cx: c.x, cy: c.y, cz: c.z, inv: 2 / (w * w), cosReach: Math.cos(w * 3.2) };
});

/** Popcorn spacing as a frequency on the unit sphere. */
const POPCORN_K = SURFACE_RADIUS / POPCORN_WAVELENGTH;

/**
 * The deck's relief at a unit direction, units.
 *
 * **The one definition of the deck**: the walking world adds it as a feature
 * (`src/worlds/bodies/uranus.ts`), and the landmarks are put on its features
 * by these same tables. Cheap on purpose — two smoothsteps of latitude, one
 * noise inside the hood and a dot product a cloud — because it runs once a
 * ground vertex.
 */
export function deckRelief(x: number, y: number, z: number, lat: number): number {
  let h = DECK_FLOOR;
  // The hood: the north pole's bright cap, standing over the rest from
  // about 50 N, with the popcorn on it.
  const hood = smoothstep(46, 64, lat);
  if (hood > 0) {
    h += HOOD_RISE * hood;
    const pole = smoothstep(50, 64, lat);
    if (pole > 0) {
      const n = fbm(x * POPCORN_K, y * POPCORN_K, z * POPCORN_K, 2);
      h += POPCORN * pole * smoothstep(0.02, 0.42, n);
    }
  }
  // The collar: a ridge at 48 S, four degrees wide.
  if (lat < -38 && lat > -58) {
    const t = (lat + 48) / 4;
    h += COLLAR_RISE * Math.exp(-t * t);
  }
  for (const c of PLACED) {
    const dot = x * c.cx + y * c.cy + z * c.cz;
    if (dot < c.cosReach) continue;
    h += c.height * Math.exp(-(1 - dot) * c.inv);
  }
  return h;
}

// ---------------------------------------------------------------------------
// The countries and the towns (invented, on real features)
// ---------------------------------------------------------------------------

/**
 * The countries are the light. A Sideling's loyalty is to how the Sun moves
 * over its home — round and round overhead in the hood, round the horizon at
 * the equator, not at all in the south — so a country is a stretch of one of
 * those skies, or a feature in it, as a cap like every country off Earth
 * (`system/contract.ts`). The Dark Spot is the smallest country on the planet.
 */
const NATIONS: readonly Nation[] = [
  { id: 'polar-hood', name: 'The Polar Hood', lat: 90, lon: 0, radius: 22, color: PALETTE.white,
    note: 'The bright cap round the north pole, where the Sun has not set since 2007 and will not until 2049.' },
  { id: 'highsun', name: 'Highsun', lat: 54, lon: 42, radius: 12, color: PALETTE.skyBlue,
    note: 'The rim of the hood, where the Sun circles highest and the people are most numerous.' },
  { id: 'storm-latitudes', name: 'The Storm Latitudes', lat: 31, lon: -92, radius: 16, color: PALETTE.violet,
    note: 'Where Keck saw eight bright methane storms rise in the summer of 2014. Everyone here remembers it.' },
  { id: 'dark-spot', name: 'The Dark Spot', lat: 28, lon: 150, radius: 4, color: PALETTE.slate,
    note: 'A hollow in the deck the size of a continent, seen by Hubble in 2006 and never since.' },
  { id: 'long-dusk', name: 'The Long Dusk', lat: 0, lon: 62, radius: 14, color: PALETTE.apricot,
    note: 'The equator, where the Sun rolls along the horizon, a third of the way up at best, and half of every day under it.' },
  { id: 'berg', name: 'Berg', lat: -34, lon: -30, radius: 7, color: PALETTE.bone,
    note: 'A bright cloud that drifted for five years before it fell apart in 2009. Its people moved with it.' },
  { id: 'voyager-collar', name: 'The Voyager Collar', lat: -48, lon: 124, radius: 11, color: PALETTE.cream,
    note: 'The faint bright ring round the south pole that Voyager 2 saw in 1986, when the Sun still shone there.' },
  { id: 'long-night', name: 'The Long Night', lat: -90, lon: 0, radius: 24, color: PALETTE.steel,
    note: 'The south pole, in the dark since 2007. Its people are asleep until the Sun comes back.' },
];

/**
 * Fifteen towns. Populations are invented, and how big a town is built
 * follows them by Earth's law. Evernoon, the capital, is inside the hood
 * where the Sun has circled overhead for nineteen years; Longlight on the
 * hood's rim is the busiest. The eleven in the light are a quarter of a
 * million or more, which is what a town needs to be built as streets round a
 * square rather than as one sunwatch on its own (`layoutOf`, under 40 units
 * of radius). The four in the south are kept small on purpose: winterers,
 * asleep through the Long Night, each its sunwatch and nobody about.
 */
const SETTLEMENTS: readonly Settlement[] = [
  { id: 'evernoon', name: 'Evernoon', lat: 80, lon: 20, population: 900000, nation: 'polar-hood' },
  { id: 'stillpoint', name: 'Stillpoint', lat: 86.5, lon: -150, population: 280000, nation: 'polar-hood' },
  { id: 'popcorn', name: 'Popcorn', lat: 72, lon: -40, population: 300000, nation: 'polar-hood' },
  { id: 'longlight', name: 'Longlight', lat: 55, lon: 35, population: 620000, nation: 'highsun' },
  { id: 'prism', name: 'Prism', lat: 50, lon: 50, population: 340000, nation: 'highsun' },
  { id: 'halo', name: 'Halo', lat: 58.5, lon: 52, population: 270000, nation: 'highsun' },
  { id: 'squall', name: 'Squall', lat: 32.4, lon: -96, population: 420000, nation: 'storm-latitudes' },
  { id: 'billow', name: 'Billow', lat: 28, lon: -82, population: 260000, nation: 'storm-latitudes' },
  { id: 'umbra', name: 'Umbra', lat: 27.2, lon: 148.6, population: 260000, nation: 'dark-spot' },
  { id: 'gloaming', name: 'Gloaming', lat: 2, lon: 60, population: 480000, nation: 'long-dusk' },
  { id: 'lowsun', name: 'Lowsun', lat: -5, lon: 71, population: 270000, nation: 'long-dusk' },
  { id: 'driftberg', name: 'Driftberg', lat: -32.6, lon: -30, population: 21000, nation: 'berg' },
  { id: 'voyager', name: 'Voyager', lat: -48, lon: 120, population: 45000, nation: 'voyager-collar' },
  { id: 'lantern', name: 'Lantern', lat: -52, lon: 131, population: 14000, nation: 'voyager-collar' },
  { id: 'hibernal', name: 'Hibernal', lat: -80, lon: 0, population: 24000, nation: 'long-night' },
];

// ---------------------------------------------------------------------------
// The Sidelings (invented)
// ---------------------------------------------------------------------------

/**
 * The Sidelings, and the body is the planet's patience and its cold.
 *
 * 0.89 g is nearly Earth's, so gravity alone says little — a skeleton here is
 * a person's skeleton, a little longer. **The cold says the rest.** The air
 * at the deck is about 76 K and the coldest atmosphere in the solar system
 * reaches 49 K above it, so this is a body built like ice: a slab of a trunk
 * (`depth` 0.7, a crystal's flat faces rather than a barrel), two segments
 * of it stacked like prisms, a **three-sided head** that reads as a wedge of
 * quartz, and one great eye in it — the lens a creature grows to see by a
 * sun that gives a three-hundred-and-seventieth of Earth's light. On the
 * crown, two horns of frost. The limbs are long and thin, and they move
 * slowly: the voice in the walking world is the slowest of any species.
 *
 * 8.8 units at the old 6.8-unit person's scale (`BODY_SCALE`), so a Sideling
 * stands a head over the traveller.
 */
const SIDELING: Species = {
  id: 'sideling',
  name: 'Sideling',
  morph: {
    id: 'sideling',
    name: 'Sideling',
    height: 8.8 * BODY_SCALE,
    heads: 4.4,
    legShare: 0.49,
    legPairs: 1,
    armPairs: 1,
    segments: 2,
    shoulderShare: 0.12,
    hipShare: 0.085,
    depth: 0.7,
    neck: 'short',
    headSides: 3,
    eyes: 1,
    crown: 'horns',
    tail: 0,
    limbR: 0.02,
  },
  // Warm hides on a cold planet, for Mars's reason turned round: the deck is
  // cyan and white, and a person that colour is a person nobody can see.
  hides: [PALETTE.violet, PALETTE.slate, PALETTE.pink, PALETTE.salmon, PALETTE.steel, PALETTE.blush],
  wears: [
    { item: 'cloak', weight: 4 },
    { item: 'wrap', weight: 3 },
    { item: 'none', weight: 2 },
    { item: 'harness', weight: 1 },
  ],
  carries: [
    { item: 'staff', weight: 3 },
    { item: 'none', weight: 4 },
    { item: 'vessel', weight: 1 },
    { item: 'pack', weight: 1 },
  ],
  trims: [PALETTE.ink, PALETTE.bark, PALETTE.steel],
  accents: [PALETTE.gold, PALETTE.skyBlue, PALETTE.white, PALETTE.cream, PALETTE.apricot],
};

export const SPECIES: readonly Species[] = [SIDELING];

export const URANUS: Body = {
  id: 'uranus',
  name: 'Uranus',
  kind: 'giant',
  orbit: 'uranus',
  radiusKm: RADIUS_KM,
  rotationHours: -17.24,
  tiltDeg: 97.77,
  // The IAU's north pole of rotation, J2000 right ascension and declination.
  pole: { ra: 257.31, dec: -15.18 },
  gravity: 8.69,
  blurb:
    'Knocked onto its side in its youth, so each pole gets forty-two years of daylight and then forty-two of night. ' +
    'Methane in the air makes it the colour of a swimming pool.',
  look: {
    // Neptune is the same blue with dark bands in it; Uranus is famously the
    // featureless one, so its bands are the palest entries the palette has.
    surface: PALETTE.skyBlue,
    highland: PALETTE.cream,
    lowland: PALETTE.bone,
    cap: PALETTE.white,
    sky: PALETTE.skyBlue,
  },
  // A deck needs no ground model: its relief reaches the walking world as a
  // feature (`deckRelief`), which is Jupiter's arrangement and for Jupiter's
  // reason — nothing is ever scattered on cloud, and with a model attached
  // `check-system.ts` would build every shared decoration on this body's seeds.
  ground: null,
  nations: NATIONS,
  // The file's own towns, and the nations filled out round them (`towns.ts`).
  settlements: grownTowns({ id: 'uranus', radiusKm: RADIUS_KM, nations: NATIONS, settlements: SETTLEMENTS }),
  species: 'sideling',
};
