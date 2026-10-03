/**
 * Saturn, end to end: its bands, its storms, its hexagon, its countries, its
 * cities and its people.
 *
 * **`radiusKm` is the 1-bar level**, as on every giant (`neptune.ts` says why
 * once for all four), and it is the *volumetric mean* radius of NASA's fact
 * sheet, 58,232 km: the deck is drawn as a sphere and Saturn's real 10%
 * flattening — 60,268 km at the equator, 54,364 at the poles — is not drawn.
 * The rotation is System III, 10 h 39 m; the gravity is the fact sheet's
 * equatorial 1-bar value, 10.44 m/s², which is 1.07 g. Of all the giants this
 * is the one that weighs what Earth does.
 *
 * Mars's rule holds, and it is what makes the map checkable: **every named
 * place is a real feature at a real latitude.**
 *
 * - **The bands** are Saturn's own, in round figures: a broad bright
 *   Equatorial Zone out to about 20 degrees either side, the Equatorial Belts
 *   beyond it, the Tropical and Temperate Zones and Belts, and the polar
 *   regions. They are paler and softer than Jupiter's because a thicker haze
 *   of ammonia lies over all of them, which is why Saturn is butterscotch and
 *   not striped.
 * - **The Hexagon** is the jet stream round the north pole at 78 N
 *   (planetographic), six straight sides each about 14,500 km long — longer
 *   than Earth is wide — first seen by Voyager in 1981 and still there.
 * - **The Rose** is the north polar vortex inside it, a hurricane-shaped
 *   storm with an eye about 2,000 km across; Cassini's false-colour image of
 *   it in 2012 looked like a rose, and the name stuck.
 * - **The Southern Eye** is the south polar vortex, a real eye about 8,000 km
 *   across ringed by cloud walls 30 to 75 km high, the only storm on another
 *   planet seen to have a hurricane's eyewall (Cassini, 2006).
 * - **The Great White Spot** of 2010–11 erupted at about 35 N (planetocentric)
 *   and its tail wrapped all the way round the planet in half a year; the one
 *   of 1990, seen by Hubble, was near the equator at 5 N. Such storms come
 *   about once a Saturnian year, in northern summer.
 * - **Storm Alley** is the band at 35 S where Cassini watched convective
 *   storms come and go for years, the Dragon Storm of 2004 among them —
 *   lightning bright enough to see from orbit.
 * - **The Ribbon** is the wavy jet at about 47 N (planetographic) that
 *   Cassini photographed as a white thread rippling round the planet.
 *
 * **Longitude is the honest exception**, as on Jupiter: nothing on a cloud
 * deck stays put, so the latitudes are true and the longitudes a snapshot —
 * except Cassini's, whose last signal came from 9.4 N, 53 W in System III on
 * 15 September 2017.
 *
 * The rings are not here: nothing in `Body` is a ring. The orrery keys them
 * off this id, and the walkable sky's are `worlds/bodies/saturn/sky.ts`.
 *
 * Everything with a name and a population — the countries, the towns and the
 * Drifters who live in them — is invented, against the rule that it stands on
 * a real feature and is named after it or after the piece of sky it watches.
 */

import { BODY_SCALE } from '../../stature.ts';
import { unitAt } from '../../sphere.ts';
import { PALETTE } from '../../theme.ts';
import type { Body, Nation, Settlement, Species } from '../contract.ts';
import { surfaceRadiusOf } from '../contract.ts';
import { fbm, smoothstep } from '../noise.ts';
import { grownTowns } from '../towns.ts';

const RADIUS_KM = 58232;

/** 146,240 units: the 1-bar level at the 0.398 km a unit the avatar fixes. */
export const SURFACE_RADIUS = surfaceRadiusOf(RADIUS_KM);

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The belts and the zones
// ---------------------------------------------------------------------------

/**
 * Saturn's bands, south to north: where each ends and how much of a **zone**
 * it is (1 the brightest, highest, freshest ammonia cloud; 0 a belt, where
 * the air sinks and the deck lies lower). The latitudes are round figures —
 * Saturn's bands are wide, soft-edged and drift with the seasons, and the
 * Equatorial Zone is the only one nobody argues about.
 */
const BANDS: readonly { name: string; north: number; zone: number }[] = [
  { name: 'South Polar Region', north: -62, zone: 0.4 },
  { name: 'South South Temperate Zone', north: -48, zone: 0.75 },
  { name: 'South Temperate Belt', north: -40, zone: 0.3 },
  { name: 'South Tropical Zone', north: -28, zone: 0.8 },
  { name: 'South Equatorial Belt', north: -20, zone: 0.25 },
  { name: 'Equatorial Zone', north: 20, zone: 1 },
  { name: 'North Equatorial Belt', north: 28, zone: 0.2 },
  { name: 'North Tropical Zone', north: 40, zone: 0.75 },
  { name: 'North Temperate Belt', north: 50, zone: 0.3 },
  { name: 'North North Temperate Zone', north: 62, zone: 0.7 },
  { name: 'North Polar Region', north: 90, zone: 0.45 },
];

/** Degrees a band edge is smeared over: Saturn's edges are softer than Jupiter's 1.2. */
const EDGE = 2.5;

/** 0 in a belt, 1 in the brightest zone, continuous in latitude. */
export function zoneAt(lat: number): number {
  let value = BANDS[0]!.zone;
  for (let k = 0; k < BANDS.length - 1; k++) {
    const edge = BANDS[k]!.north;
    if (lat < edge - EDGE) break;
    value += (BANDS[k + 1]!.zone - BANDS[k]!.zone) * smoothstep(edge - EDGE, edge + EDGE, lat);
  }
  return value;
}

/** The band a latitude is in, by name. */
export function bandAt(lat: number): string {
  for (const band of BANDS) if (lat <= band.north) return band.name;
  return BANDS[BANDS.length - 1]!.name;
}

/**
 * How much higher a zone stands than a belt, units, and the floor under both.
 * The true difference is a few tens of kilometres spread over bands ten
 * thousand wide — a slope nobody would see — so it is kept near the true
 * order and its job is to be the long, soft climb out of a belt.
 */
const ZONE_RISE = 40;
const ZONE_FLOOR = 20;

// ---------------------------------------------------------------------------
// The Hexagon, and the two polar eyes
// ---------------------------------------------------------------------------

/**
 * The Hexagon's geometry. A regular hexagon's side equals its circumradius,
 * so sides of 14,500 km put the corners 14.3 degrees of arc from the pole and
 * the middle of each side (the apothem, 12.4 degrees) at 77.6 N — which is
 * where the jet is measured. The hexagon is laid out in the polar plane
 * (`x`, `-z`, whose angle is the longitude), so a side is a dot product and
 * the six of them are a `max`: no trigonometry per vertex.
 *
 * The wall is the jet's cloud: 260 units (about a hundred kilometres) at the
 * crest and five hundred units to either side of it, a climb of about thirty
 * degrees, which is exaggerated some threefold and is the point — it is a
 * ridge you can see from a day's walk off and stand on the top of.
 */
export const HEXAGON = {
  /** The apothem, degrees of arc from the pole to the middle of a side. */
  apothem: 12.4,
  /** The longitude of the first corner; the rest follow every 60 degrees. */
  corner: 0,
  /** The jet's cloud wall: crest height and its half-width, units. */
  wall: 260,
  halfWidth: 520,
  /** How much higher the polar cap inside stands than the deck outside. */
  shelf: 50,
} as const;

/** The middle of a side's latitude, and a corner's: where to stand on the wall. */
export const HEXAGON_SIDE_LAT = 90 - HEXAGON.apothem;
export const HEXAGON_CORNER_LAT = 90 - Math.asin(Math.sin(HEXAGON.apothem * DEG) / Math.cos(30 * DEG)) / DEG;

const HEX_A = Math.sin(HEXAGON.apothem * DEG);
const HEX_WIDTH = HEXAGON.halfWidth / (HEXAGON.apothem * DEG * SURFACE_RADIUS);
const HEX_NORMALS: readonly (readonly [number, number])[] = Array.from({ length: 6 }, (_, k) => {
  const a = (HEXAGON.corner + 30 + k * 60) * DEG;
  return [Math.cos(a), Math.sin(a)] as const;
});
/** Nothing polar is computed south of this `y`: 18 degrees from the north pole. */
const NORTH_REACH = Math.cos(18 * DEG);
/** Nor north of this one: 9.5 degrees from the south pole. */
const SOUTH_REACH = -Math.cos(9.5 * DEG);

/**
 * The Rose: the north polar vortex. Its eye is about 2,000 km across, so a
 * radius of a degree; the wall round it stands 170 units and five spiral
 * bands — the petals — wind out to five eye-radii.
 */
export const ROSE = { eye: 1.0, wall: 170, bowl: 120, petals: 5, petal: 45 } as const;

/**
 * The Southern Eye: the south polar vortex. 8,000 km across, so 3.94 degrees
 * of radius; Cassini saw two concentric eyewalls, the inner one 30 to 75 km
 * high (75 km is 188 units, and the wall is drawn at 240), and a clear, deep
 * eye inside.
 */
export const SOUTH_EYE = { eye: 3.94, wall: 240, outer: 120, bowl: 150 } as const;

const gauss = (x: number): number => Math.exp(-x * x);

/** The two polar regions' relief at a unit direction, units. */
function polarRelief(x: number, y: number, z: number): number {
  let h = 0;
  if (y > NORTH_REACH) {
    // The Hexagon: `rho` is 1 on the jet, under 1 inside it.
    const X = x;
    const Z = -z;
    let along = -Infinity;
    for (const [c, s] of HEX_NORMALS) along = Math.max(along, X * c + Z * s);
    const rho = along / HEX_A;
    h += HEXAGON.wall * gauss((rho - 1) / HEX_WIDTH);
    h += HEXAGON.shelf * (1 - smoothstep(0.95, 1.01, rho));
    // The Rose, in the middle of it.
    const e = Math.hypot(X, Z) / Math.sin(ROSE.eye * DEG);
    if (e < 6) {
      h += ROSE.wall * gauss((e - 1) / 0.2);
      h -= ROSE.bowl * (1 - smoothstep(0, 0.85, e));
      if (e > 1.1) {
        // `sin(5 theta)` is continuous across atan2's cut; the petals are
        // faded out before the eye, where theta means nothing.
        const theta = Math.atan2(Z, X);
        const wind = smoothstep(1.1, 1.8, e) * (1 - smoothstep(4.2, 5.6, e));
        h += ROSE.petal * Math.sin(ROSE.petals * theta + 2.4 * e) * wind;
      }
    }
  } else if (y < SOUTH_REACH) {
    const e = Math.hypot(x, z) / Math.sin(SOUTH_EYE.eye * DEG);
    h += SOUTH_EYE.wall * gauss((e - 1) / 0.075);
    h += SOUTH_EYE.outer * gauss((e - 1.42) / 0.085);
    h -= SOUTH_EYE.bowl * (1 - smoothstep(0, 0.92, e));
    if (e > 1.12 && e < 2.2) {
      const theta = Math.atan2(-z, x);
      const wind = smoothstep(1.12, 1.3, e) * (1 - smoothstep(1.85, 2.15, e));
      h += 30 * Math.sin(4 * theta - 9 * e) * wind;
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// The storms
// ---------------------------------------------------------------------------

/**
 * A storm: a convective **head** (a plateau of cloud heaped into towers, the
 * Great White Spots) or a **cell** (a single white dome, Storm Alley's).
 * Half-axes are degrees of arc east-west (`a`) and north-south (`b`), heights
 * units, exaggerated some ten times so that a head reads from a town beside
 * it. Evaluated in each storm's tangent frame, dot products only, and the
 * towers' noise only inside a head.
 */
interface Storm {
  name: string;
  kind: 'head' | 'cell';
  lat: number;
  lon: number;
  a: number;
  b: number;
  /** The plateau's height. */
  plateau: number;
  /** How tall the towers heaped on it stand. */
  towers: number;
}

export const GREAT_WHITE_SPOT = { lat: 35, lon: -50 } as const;
export const DRAGON_STORM = { lat: -35, lon: 60 } as const;

const STORMS: Storm[] = [
  // The Great White Spot of 2010–11, the "Great Springtime Storm": its head
  // was about 10,000 km long when Cassini first saw it in December 2010.
  { name: 'Great White Spot', kind: 'head', lat: GREAT_WHITE_SPOT.lat, lon: GREAT_WHITE_SPOT.lon, a: 4.2, b: 2.4, plateau: 150, towers: 190 },
  // The one of 1990, Hubble's, on the equator.
  { name: 'Old White Spot', kind: 'head', lat: 5, lon: 160, a: 3.2, b: 1.7, plateau: 110, towers: 130 },
  // The Dragon Storm of 2004, the brightest of Storm Alley's.
  { name: 'Dragon Storm', kind: 'head', lat: DRAGON_STORM.lat, lon: DRAGON_STORM.lon, a: 1.6, b: 1.1, plateau: 90, towers: 100 },
];
// Storm Alley's lesser cells, either side of the Dragon, a little off the
// line by turns.
for (const lon of [36, 48, 72, 84, 96, 108]) {
  STORMS.push({ name: `Storm Alley cell at ${lon} E`, kind: 'cell', lat: -35 + (lon % 24 === 0 ? 0.6 : -0.6), lon, a: 0.8, b: 0.6, plateau: 55, towers: 0 });
}

interface Placed extends Storm {
  cx: number;
  cy: number;
  cz: number;
  ex: number;
  ey: number;
  ez: number;
  nx: number;
  ny: number;
  nz: number;
  ia: number;
  ib: number;
  cosReach: number;
}

/** A storm adds nothing past this many half-axes. */
const REACH = 1.3;

const PLACED: readonly Placed[] = STORMS.map((storm) => {
  const c = unitAt(storm.lat, storm.lon, { x: 0, y: 0, z: 0 });
  // North and east, each measured against the sphere by a step along its
  // own coordinate rather than assumed from a cross product's hand.
  const north = unitAt(storm.lat + 0.01, storm.lon, { x: 0, y: 0, z: 0 });
  const east = unitAt(storm.lat, storm.lon + 0.01, { x: 0, y: 0, z: 0 });
  const nx = north.x - c.x;
  const ny = north.y - c.y;
  const nz = north.z - c.z;
  const ex = east.x - c.x;
  const ey = east.y - c.y;
  const ez = east.z - c.z;
  const n = Math.hypot(nx, ny, nz);
  const e = Math.hypot(ex, ey, ez);
  return {
    ...storm,
    cx: c.x,
    cy: c.y,
    cz: c.z,
    ex: ex / e,
    ey: ey / e,
    ez: ez / e,
    nx: nx / n,
    ny: ny / n,
    nz: nz / n,
    ia: 1 / Math.sin(storm.a * DEG),
    ib: 1 / Math.sin(storm.b * DEG),
    cosReach: Math.cos(Math.max(storm.a, storm.b) * REACH * DEG),
  };
});

/** Towers about nine hundred units apart: the cumulus a head is heaped from. */
const TOWER_K = SURFACE_RADIUS / 900;

function stormRelief(x: number, y: number, z: number): number {
  let h = 0;
  for (const s of PLACED) {
    const cos = x * s.cx + y * s.cy + z * s.cz;
    if (cos < s.cosReach) continue;
    const u = (x * s.ex + y * s.ey + z * s.ez) * s.ia;
    const v = (x * s.nx + y * s.ny + z * s.nz) * s.ib;
    const e = Math.sqrt(u * u + v * v);
    if (e >= REACH) continue;
    const body = 1 - smoothstep(0.55, REACH * 0.98, e);
    h += s.plateau * body;
    if (s.towers > 0 && body > 0) {
      // Billows: the absolute value of a noise is round on top and creased
      // where two towers meet, which is what cumulus looks like and where the
      // cel ramp steps. A little lower in the middle, where the head is
      // already spreading into its anvil.
      const n = Math.abs(fbm(x * TOWER_K, y * TOWER_K, z * TOWER_K, 3));
      h += s.towers * n * body * (1 - (1 - smoothstep(0, 0.35, e)) * 0.35);
    }
  }
  return h;
}

/**
 * The Great White Spot's tail: the white band it spun off downstream, east
 * of the head along its latitude, wavering and fading over 220 degrees of
 * longitude. Continuous all round: it is zero at the head and at its end.
 */
function tailRelief(lat: number, lon: number): number {
  const off = lat - GREAT_WHITE_SPOT.lat;
  if (off < -5 || off > 5) return 0;
  const along = (((lon - GREAT_WHITE_SPOT.lon) % 360) + 360) % 360;
  if (along > 220) return 0;
  const centre = 0.9 * Math.sin(along * 2.5 * DEG);
  return 55 * gauss((off - centre) / 1.1) * smoothstep(0, 5, along) * (1 - along / 220);
}

/**
 * The Ribbon: a jet at 45 N that ripples north and south as it goes round,
 * 52 waves to the lap — a wavelength of about 5,000 km at that latitude, which
 * is what Cassini measured. A whole number of waves, so it closes on itself.
 */
export const RIBBON = { lat: 45, waves: 52, swing: 1.1, height: 40, lon: 150 } as const;

/** The Ribbon's crest at a longitude. */
export function ribbonLat(lon: number): number {
  return RIBBON.lat + RIBBON.swing * Math.sin(RIBBON.waves * (lon - RIBBON.lon) * DEG);
}

function ribbonRelief(lat: number, lon: number): number {
  if (lat < RIBBON.lat - 3 || lat > RIBBON.lat + 3) return 0;
  return RIBBON.height * gauss((lat - ribbonLat(lon)) / 0.45);
}

/**
 * The whole deck's relief at a unit direction, units: the zones over the
 * belts, the polar walls and eyes, the storms, the tail and the Ribbon. **The
 * one definition**: the deck the foot walks on (`worlds/bodies/saturn.ts`,
 * as a feature) and every place named on it read this.
 */
export function deckRelief(x: number, y: number, z: number, lat: number, lon: number): number {
  return ZONE_FLOOR + ZONE_RISE * zoneAt(lat) + polarRelief(x, y, z) + stormRelief(x, y, z) + tailRelief(lat, lon) + ribbonRelief(lat, lon);
}

// ---------------------------------------------------------------------------
// The countries and the towns (invented, on real features)
// ---------------------------------------------------------------------------

/**
 * The countries are the features, a cap each. The Rose is an enclave of the
 * Hexagon — the vortex inside the jet — and the Old White Spot sits in the
 * Equatorial Zone's own band, far enough east of its cap to be its own.
 */
const NATIONS: readonly Nation[] = [
  { id: 'hexagon', name: 'The Hexagon', lat: 89.9, lon: 0, radius: 16, color: PALETTE.skyBlue,
    note: 'A jet stream with six straight sides round the north pole, each one longer than Earth is wide. Its people live on the wall.' },
  { id: 'rose', name: 'The Rose', lat: 89.9, lon: 0, radius: 3, color: PALETTE.pink,
    note: 'The storm at the very top of the planet, an eye two thousand kilometres wide with petals of cloud wound round it.' },
  { id: 'ribbon', name: 'The Ribbon', lat: 45, lon: 155, radius: 10, color: PALETTE.cream,
    note: 'A white jet that ripples round the planet like a ribbon in the wind. Its towns sit on the crests.' },
  { id: 'white-spot', name: 'The Great White Spot', lat: 35, lon: -48, radius: 7, color: PALETTE.white,
    note: 'The storm of 2010, whose tail went all the way round the world in six months. Once a Saturn year, the north boils over.' },
  { id: 'equatorial', name: 'The Equatorial Zone', lat: 2, lon: -40, radius: 17, color: PALETTE.sand,
    note: 'The broad pale belt round the middle, where the wind runs east at nearly five hundred metres a second.' },
  { id: 'old-spot', name: 'The Old White Spot', lat: 5, lon: 160, radius: 6, color: PALETTE.bone,
    note: 'Where the storm of 1990 rose on the equator. The towers have sunk back, mostly; the old ones say they will come again.' },
  { id: 'north-belt', name: 'The North Equatorial Belt', lat: 24, lon: 90, radius: 9, color: PALETTE.apricot,
    note: 'The golden belt north of the equator, under one of the widest views of the rings anywhere on the planet.' },
  { id: 'storm-alley', name: 'Storm Alley', lat: -35, lon: 72, radius: 12, color: PALETTE.slate,
    note: 'The stormiest latitude in the south: white cells that come and go for years, and lightning you can see from orbit.' },
  { id: 'south-tropic', name: 'The South Tropical Zone', lat: -22, lon: -142, radius: 10, color: PALETTE.blush,
    note: 'A quiet white zone, bright and high, where the rings stand high overhead and their shadow comes and goes with the years.' },
  { id: 'south-eye', name: 'The Southern Eye', lat: -89.9, lon: 0, radius: 8, color: PALETTE.violet,
    note: 'A hurricane eye eight thousand kilometres across, with walls seventy kilometres high. Nobody has ever seen the bottom.' },
];

/**
 * Eighteen towns, each on the feature its country is named for or watching
 * the piece of sky it is named after — a Drifter names a town for what is
 * overhead, so Keeler and Encke are named for gaps in the rings and Daphnis
 * and Pan for the little moons that keep those gaps open. Populations are
 * invented, and how big a town is built follows them by Earth's law.
 *
 * Jetwall stands on the crest of the Hexagon at the middle of a side and
 * Corner on a corner; Eyewall on the Southern Eye's inner wall; Thunderhead on
 * the top of the Great White Spot, Ninety on the 1990 storm's, Ribbon on the
 * Ribbon's crest, and Finale beside where Cassini went in.
 */
const SETTLEMENTS: readonly Settlement[] = [
  { id: 'rose', name: 'Rose', lat: 88.6, lon: 45, population: 260000, nation: 'rose' },
  { id: 'jetwall', name: 'Jetwall', lat: HEXAGON_SIDE_LAT, lon: 90, population: 340000, nation: 'hexagon' },
  { id: 'corner', name: 'Corner', lat: HEXAGON_CORNER_LAT, lon: -120, population: 280000, nation: 'hexagon' },
  { id: 'leeward', name: 'Leeward', lat: 82, lon: -30, population: 250000, nation: 'hexagon' },
  { id: 'ribbon', name: 'Ribbon', lat: RIBBON.lat, lon: RIBBON.lon, population: 380000, nation: 'ribbon' },
  { id: 'titanview', name: 'Titanview', lat: 47.5, lon: 163, population: 250000, nation: 'ribbon' },
  { id: 'thunderhead', name: 'Thunderhead', lat: GREAT_WHITE_SPOT.lat, lon: GREAT_WHITE_SPOT.lon, population: 620000, nation: 'white-spot' },
  { id: 'springtide', name: 'Springtide', lat: 35.6, lon: -41, population: 270000, nation: 'white-spot' },
  { id: 'huygens', name: 'Huygens', lat: 2, lon: -40, population: 900000, nation: 'equatorial' },
  { id: 'daphnis', name: 'Daphnis', lat: -3, lon: -28, population: 420000, nation: 'equatorial' },
  { id: 'finale', name: 'Finale', lat: 8, lon: -49, population: 260000, nation: 'equatorial' },
  { id: 'ninety', name: 'Ninety', lat: 5, lon: 160, population: 360000, nation: 'old-spot' },
  { id: 'keeler', name: 'Keeler', lat: 24, lon: 90, population: 520000, nation: 'north-belt' },
  { id: 'dragon', name: 'Dragon', lat: -33.4, lon: 60, population: 480000, nation: 'storm-alley' },
  { id: 'lightning-row', name: 'Lightning Row', lat: -36.6, lon: 78, population: 290000, nation: 'storm-alley' },
  { id: 'encke', name: 'Encke', lat: -22, lon: -142, population: 400000, nation: 'south-tropic' },
  { id: 'pan', name: 'Pan', lat: -18, lon: -150, population: 255000, nation: 'south-tropic' },
  { id: 'eyewall', name: 'Eyewall', lat: -(90 - SOUTH_EYE.eye), lon: 30, population: 300000, nation: 'south-eye' },
];

// ---------------------------------------------------------------------------
// The Drifters (invented)
// ---------------------------------------------------------------------------

/**
 * The Drifters, and on Saturn gravity is the one thing that does **not**
 * argue for anything: 1.07 g is the traveller's own weight, so the body is
 * free to be shaped by the sky instead. The rest is the rings:
 *
 * - **Tall and slender.** A people who live on a world light enough to float
 *   and spend their lives looking up — 8.6 units at the old 6.8-unit person's
 *   scale (`BODY_SCALE`), a head and a half over the traveller, with long
 *   legs (`legShare` 0.54), a narrow waisted trunk in two segments and the
 *   thinnest limbs of any species here. What survives at three hundred units
 *   is height and line, and this is all line.
 * - **A small head on a long neck, ringed.** Six and a half heads to the
 *   body, round (eight sides), two wide-set eyes, and the frill worn as a
 *   **halo**: a flat ring round the skull, the first thing a traveller sees
 *   and the last thing a silhouette loses.
 * - **A streamer of a tail**, a third of the height, trailed like a kite's —
 *   the one part of a Drifter the wind is allowed to keep.
 *
 * Hides cool on a butterscotch world, for Mars's reason: a person the colour
 * of the deck is a person nobody can see.
 */
const DRIFTER: Species = {
  id: 'drifter',
  name: 'Drifter',
  morph: {
    id: 'drifter',
    name: 'Drifter',
    height: 8.6 * BODY_SCALE,
    heads: 6.5,
    legShare: 0.54,
    legPairs: 1,
    armPairs: 1,
    segments: 2,
    shoulderShare: 0.078,
    hipShare: 0.056,
    depth: 0.62,
    neck: 'long',
    headSides: 8,
    eyes: 2,
    crown: 'frill',
    tail: 0.32,
    limbR: 0.0135,
  },
  hides: [PALETTE.slate, PALETTE.skyBlue, PALETTE.violet, PALETTE.steel, PALETTE.bone, PALETTE.pink],
  wears: [
    { item: 'cloak', weight: 4 },
    { item: 'wrap', weight: 3 },
    { item: 'none', weight: 2 },
    { item: 'harness', weight: 1 },
  ],
  carries: [
    { item: 'none', weight: 4 },
    { item: 'staff', weight: 3 },
    { item: 'vessel', weight: 1 },
    { item: 'pack', weight: 1 },
  ],
  trims: [PALETTE.ink, PALETTE.steel, PALETTE.bark],
  accents: [PALETTE.gold, PALETTE.white, PALETTE.apricot, PALETTE.cream, PALETTE.orange],
};

export const SPECIES: readonly Species[] = [DRIFTER];

export const SATURN: Body = {
  id: 'saturn',
  name: 'Saturn',
  kind: 'giant',
  orbit: 'saturn',
  radiusKm: RADIUS_KM,
  rotationHours: 10.656,
  tiltDeg: 26.73,
  // The IAU's north pole of rotation, J2000 right ascension and declination.
  pole: { ra: 40.59, dec: 83.54 },
  gravity: 10.44,
  blurb:
    'Light enough that it would float, if you could find a bath big enough. ' +
    'The rings are 270,000 kilometres across and in most places about as thick as a house.',
  look: {
    surface: PALETTE.sand,
    highland: PALETTE.gold,
    lowland: PALETTE.tan,
    cap: PALETTE.cream,
    sky: PALETTE.blush,
  },
  // A giant has no ground model: the deck is the world file's feature,
  // `deckRelief`, and its bands are painted by latitude.
  ground: null,
  nations: NATIONS,
  // The file's own towns, and the nations filled out round them (`towns.ts`).
  settlements: grownTowns({ id: 'saturn', radiusKm: RADIUS_KM, nations: NATIONS, settlements: SETTLEMENTS }),
  species: 'drifter',
};
