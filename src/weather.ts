import * as THREE from 'three';
import { DECK_AXIS, DEPTH_SPAN, THRESHOLD, coverageAt, deckTurn } from './clouds.ts';
import { biomeAt, biomeSample, meanTemperature, seasonalSwing, zonalMoisture } from './biome.ts';
import { lyingSnowAt } from './globe.ts';
import { fbm, shoreDistance } from './terrain.ts';
import { unitAt } from './sphere.ts';

/**
 * The weather, as a pure function of where and when.
 *
 * **Nothing about it is sent, stored or random**: `weatherAt(lat, lon,
 * elevation, time)` is the whole model, so every client on the relay that asks
 * about the same place at the same instant gets the same rain, and scrubbing
 * `atlas.sky.setTime` scrubs the weather with the sun. What draws it —
 * the rain and snow round the camera, the lightning, the wet and the snow on
 * the ground, the sky's grey — is `weather-view.ts`, which asks this a few
 * times a second and eases between the answers.
 *
 * **The clouds are the weather, not a picture of it.** The cover here is the
 * deck's own coverage field (`coverageAt` in `clouds.ts`) read at the point
 * under you through the deck's turn at that instant, so where the deck has a
 * bank there is cloud, and where the bank is deepest — the tall middle the
 * deck builds as a tower — is where it rains. Walk out from under a bank and
 * the rain stops at the same edge the sky shows. The deck turns about a tilted
 * axis once every 19 hours, so the weather drifts with it and a front passes.
 *
 * **What the deck cannot know is the climate**, and the rest of this file is
 * that: whether a deep bank rains at all is its moisture — `biomeAt`'s, the
 * same number that made the ground a desert or a forest — shifted by the
 * season (the rain belt follows the sun, and South Asia's monsoon is a term of
 * its own) and by a slow field of fronts that wanders over days, so a wet
 * place has dry spells and the Sahara keeps its cloud and not its rain.
 * Whether it falls as rain or snow is the temperature — `biome.ts`'s mean,
 * the season's swing, the hour's, the height's lapse — and whether it is a
 * storm is how deep the bank is and how warm the air, or how strong the front.
 */

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'storm' | 'snow';

export interface WeatherSample {
  kind: WeatherKind;
  /** How strong `kind` is, 0 to 1: the precipitation, or the fog, or the cover. */
  intensity: number;
  /** Cloud overhead, 0 to 1: the deck's own field round its cut. */
  cover: number;
  /** How deep into its bank this point is, 0 at the edge to 1 at the heart. */
  depth: number;
  /** How hard it is falling, 0 to 1, rain or snow. */
  precipitation: number;
  /** The share of it that is snow, 0 to 1. */
  snow: number;
  /** How much of a storm it is, 0 to 1. */
  storm: number;
  /** Mist or fog, 0 to 1. */
  fog: number;
  /** The air's temperature, degrees Celsius. */
  temperatureC: number;
  /** The moisture the rain is drawn against, after the season and the fronts. */
  wet: number;
  /** Where the wind blows *to*, as a unit vector's east and north. */
  windEast: number;
  windNorth: number;
  /** Metres a second. */
  windSpeed: number;
  /** Snow lying from the season alone, 0 to 1 (`lyingSnowAt`). */
  lying: number;
  /** The snowline's own factor (`BiomeSample.snow`): 1 is snow the year round. */
  permanent: number;
}

export function weatherSample(): WeatherSample {
  return {
    kind: 'clear',
    intensity: 0,
    cover: 0,
    depth: 0,
    precipitation: 0,
    snow: 0,
    storm: 0,
    fog: 0,
    temperatureC: 15,
    wet: 0,
    windEast: 1,
    windNorth: 0,
    windSpeed: 3,
    lying: 0,
    permanent: 0,
  };
}

const DAY_MS = 86400000;
const YEAR_DAYS = 365.2422;
/**
 * The day of the northern year the warmth peaks, counted from 1 January 1970:
 * 20 July, a month past the solstice, which is how long the ground and the sea
 * take to catch the sun up.
 */
const SUMMER_PEAK_DAY = 200;

/**
 * The season, as the northern phase: +1 at the height of the northern summer,
 * -1 at the depth of its winter. The south reads it turned round
 * (`seasonalTemperature` in `globe.ts`).
 */
export function seasonOf(timeMs: number): number {
  return Math.cos(seasonTurn(timeMs));
}

/**
 * The same phase as an angle, radians: 0 at the height of the northern
 * summer, a quarter turn at the height of its autumn (mid-October), a half at
 * the depth of its winter. `seasonOf` is its cosine; its sine tells autumn
 * (+) from spring (-), which the cosine alone cannot — the falling leaves in
 * `ambient.ts` read it.
 */
export function seasonTurn(timeMs: number): number {
  return (2 * Math.PI * (timeMs / DAY_MS - SUMMER_PEAK_DAY)) / YEAR_DAYS;
}

/** Local solar hour at a longitude, 0 to 24. */
function solarHour(timeMs: number, lon: number): number {
  const hour = (timeMs / 3600000 + lon / 15) % 24;
  return hour < 0 ? hour + 24 : hour;
}

/**
 * How far the rain belt swings with the sun, in degrees of latitude. The ITCZ
 * wanders about this far either side of the equator over a year, and it is
 * what gives the Sahel and the savannas their one wet season.
 */
const ITCZ_SWING = 7;

/**
 * The monsoon, as a box and a season: South and South-East Asia wetter by this
 * much at the height of the northern summer and drier by `MONSOON_DRY` in its
 * winter. The one regional term in the model, because it is the one climate
 * a latitude cannot give — Mumbai gets four-fifths of its year's rain in four
 * months.
 */
const MONSOON_WET = 0.42;
const MONSOON_DRY = 0.3;

function monsoonAt(lat: number, lon: number, season: number): number {
  const inLat = smoothstep(2, 8, lat) * (1 - smoothstep(28, 34, lat));
  const inLon = smoothstep(62, 70, lon) * (1 - smoothstep(122, 130, lon));
  const box = inLat * inLon;
  return box * (season > 0 ? MONSOON_WET * season : MONSOON_DRY * season);
}

/**
 * The fronts: a slow field that wanders through itself over days, so a wet
 * climate has its dry spells. Its span is several banks wide, so a front is a
 * region having a wet week rather than one cloud having a bad hour.
 */
const FRONT_FREQUENCY = 2.2;
const FRONT_DAYS = 2.6;
/** How much a front moves the moisture either way. */
const FRONT_SWING = 0.9;

/** The mist's own patches, finer than the fronts, and changing daily. */
const MIST_FREQUENCY = 14;

/**
 * The prevailing wind by latitude, as the eastward share of it: the trades
 * blowing west under 25 degrees, the westerlies east from 35 to 60, the polar
 * easterlies west again past 66. The northward share turns each towards the
 * equator or the pole the way the three cells do.
 */
const WIND_EAST_KNOTS: readonly [number, number][] = [
  [0, -0.8], [22, -1], [30, -0.2], [38, 0.9], [52, 1], [62, 0.3], [70, -0.7], [90, -0.3],
];

/** Where the moisture is enough for a deep bank to rain at all, and to rain hard. */
const WET_FROM = 0.3;
const WET_FULL = 0.72;
/** How deep into a bank the rain starts, and how deep it is at its hardest. */
const RAIN_DEPTH_FROM = 0.12;
const RAIN_DEPTH_FULL = 0.7;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function knot(knots: readonly [number, number][], a: number): number {
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i]!;
    if (a <= x1) {
      const [x0, y0] = knots[i - 1]!;
      return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0);
    }
  }
  return knots[knots.length - 1]![1];
}

// Scratch: the model is asked a few times a second and allocates nothing.
const unit = new THREE.Vector3();
const turn = new THREE.Quaternion();
const drift = new THREE.Vector3();
const east = new THREE.Vector3();
const north = new THREE.Vector3();
const POLE = new THREE.Vector3(0, 1, 0);
const climate = biomeSample();

/**
 * The weather at a place and an instant. `elevation` is the relief over the
 * shelf in world units, as `biomeAt` takes it; `prepareTerrain` must have run.
 */
export function weatherAt(
  lat: number,
  lon: number,
  elevation: number,
  timeMs: number,
  target: WeatherSample,
): WeatherSample {
  unitAt(lat, lon, unit);
  biomeAt(unit.x, unit.y, unit.z, lat, lon, elevation, climate);

  // The deck overhead: the point under you, turned back into the deck's own
  // frame, which is where its field was evaluated when it was built.
  deckTurn(timeMs, turn);
  drift.copy(unit).applyQuaternion(turn.invert());
  const coverage = coverageAt(drift.x, drift.y, drift.z);
  const depth = clamp01((coverage - THRESHOLD) / DEPTH_SPAN);
  const cover = smoothstep(THRESHOLD - 0.06, THRESHOLD + 0.05, coverage);

  // The season and the fronts on the moisture.
  const season = seasonOf(timeMs);
  const itcz = ITCZ_SWING * season;
  const days = timeMs / DAY_MS;
  const tau = days / FRONT_DAYS;
  const front = fbm(
    unit.x * FRONT_FREQUENCY + tau,
    unit.y * FRONT_FREQUENCY - tau * 0.7,
    unit.z * FRONT_FREQUENCY + tau * 0.4 + 31.7,
    2,
  );
  const wet = clamp01(
    climate.moisture +
      (zonalMoisture(lat - itcz) - zonalMoisture(lat)) +
      monsoonAt(lat, lon, season) +
      (front - 0.5) * FRONT_SWING,
  );
  const precipitation =
    smoothstep(RAIN_DEPTH_FROM, RAIN_DEPTH_FULL, depth) * smoothstep(WET_FROM, WET_FULL, wet);

  // The temperature: the climate's mean, the year, the day, and what the rain
  // and the cloud take off it.
  const hour = solarHour(timeMs, lon);
  const hemisphere = Math.max(-1, Math.min(1, lat / 5));
  const daily = 3 + 3.5 * (1 - climate.moisture);
  const temperatureC =
    meanTemperature(lat, elevation) +
    seasonalSwing(lat, climate.continental) * season * hemisphere +
    daily * Math.cos((2 * Math.PI * (hour - 15)) / 24) * (1 - 0.55 * cover) -
    2.5 * precipitation;
  const snow = smoothstep(1.5, -0.5, temperatureC);

  // The storm: a deep bank in warm air is a thunderstorm, and so is a strong
  // front at any temperature a storm can happen at.
  const convective = smoothstep(14, 25, temperatureC);
  const frontal = smoothstep(0.7, 0.86, front) * smoothstep(-4, 6, temperatureC);
  const storm = precipitation * smoothstep(0.3, 0.75, depth) * Math.max(convective, frontal);

  // The wind: the zonal belt, the deck's own drift and the storm.
  const a = Math.abs(lat);
  const sign = lat >= 0 ? 1 : -1;
  let e = knot(WIND_EAST_KNOTS, a);
  let n = a < 30 ? -0.35 * sign : a < 62 ? 0.3 * sign : -0.25 * sign;
  east.crossVectors(POLE, unit);
  if (east.lengthSq() > 1e-10) {
    east.normalize();
    north.crossVectors(unit, east);
    // The deck's velocity at this point, turned: axis cross position.
    drift.crossVectors(DECK_AXIS, unit);
    const dl = drift.length();
    if (dl > 1e-6) {
      e += (0.6 * drift.dot(east)) / dl;
      n += (0.6 * drift.dot(north)) / dl;
    }
  }
  const gust = fbm(unit.x * 9 + tau * 3, unit.y * 9 - tau * 2, unit.z * 9 + 5.3, 2);
  e += (gust - 0.5) * 0.8;
  const length = Math.hypot(e, n) || 1;
  const windSpeed =
    1 + 2.5 * Math.abs(knot(WIND_EAST_KNOTS, a)) + 5 * clamp01((front - 0.5) * 2) + 4 * precipitation + 11 * storm + 2.5 * gust;

  // The mist: the morning's, in calm, humid, cool air, thickest on a coast;
  // and the murk rain and snow bring with them.
  const morning = Math.exp(-(((hour - 6.5) / 2.4) ** 2));
  const calm = 1 - smoothstep(5, 11, windSpeed);
  const humid = smoothstep(0.35, 0.7, wet);
  const cool = smoothstep(22, 8, temperatureC);
  const coast = 1 - smoothstep(0.3, 2.5, shoreDistance(lat, lon));
  const patch = smoothstep(
    0.45,
    0.64,
    fbm(unit.x * MIST_FREQUENCY + days * 0.9, unit.y * MIST_FREQUENCY, unit.z * MIST_FREQUENCY - days * 0.6, 2),
  );
  const mist = morning * calm * humid * cool * patch * (0.55 + 0.45 * coast);
  const fog = clamp01(Math.max(mist, precipitation * (0.45 + 0.35 * snow)));

  target.cover = cover;
  target.depth = depth;
  target.precipitation = precipitation;
  target.snow = snow;
  target.storm = storm;
  target.fog = fog;
  target.temperatureC = temperatureC;
  target.wet = wet;
  target.windEast = e / length;
  target.windNorth = n / length;
  target.windSpeed = windSpeed;
  target.lying = lyingSnowAt(lat, elevation, climate.continental, season);
  target.permanent = climate.snow;
  return classify(target);
}

/** Names what a sample is, and how strongly. Exported for the forced presets. */
export function classify(target: WeatherSample): WeatherSample {
  const p = target.precipitation;
  if (p > 0.08) {
    if (target.snow > 0.5) {
      target.kind = 'snow';
      target.intensity = p;
    } else if (target.storm > 0.3) {
      target.kind = 'storm';
      target.intensity = target.storm;
    } else {
      target.kind = p < 0.3 ? 'drizzle' : 'rain';
      target.intensity = p;
    }
  } else if (target.fog > 0.45) {
    target.kind = 'fog';
    target.intensity = target.fog;
  } else if (target.cover > 0.5) {
    target.kind = 'cloudy';
    target.intensity = target.cover;
  } else {
    target.kind = 'clear';
    target.intensity = 1 - target.cover;
  }
  return target;
}

/**
 * A place to start a strike from, and whether one is due: the lightning as a
 * pure function of the clock, so everybody under the same storm sees the same
 * bolt. The sky is cut into cells of `STRIKE_CELL` degrees and the clock into
 * `STRIKE_SLOT_MS` slots; each cell rolls once a slot, and a roll under
 * `STRIKE_ODDS` times the storm at the point it names is a strike there.
 */
export const STRIKE_CELL = 1.5;
export const STRIKE_SLOT_MS = 2000;
export const STRIKE_ODDS = 0.07;

/** A 32-bit hash of three integers, to [0, 1). */
export function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface Strike {
  lat: number;
  lon: number;
  /** When it strikes, ms since the epoch. */
  at: number;
  /** A seed for the bolt's shape. */
  seed: number;
}

/**
 * The strike a cell rolls in a slot, if its roll is low enough to be worth
 * asking the weather about; `null` otherwise. The caller decides with
 * `storm * STRIKE_ODDS > roll`, where `roll` is `strike.seed`'s own first draw.
 */
export function strikeCandidate(cellLat: number, cellLon: number, slot: number, target: Strike): number {
  const roll = hash3(cellLat, cellLon, slot);
  target.lat = (cellLat + hash3(cellLat, cellLon, slot + 7919)) * STRIKE_CELL;
  target.lon = (cellLon + hash3(cellLat, cellLon, slot + 104729)) * STRIKE_CELL;
  target.at = slot * STRIKE_SLOT_MS + hash3(cellLon, cellLat, slot) * STRIKE_SLOT_MS;
  target.seed = hash3(slot, cellLat, cellLon);
  return roll;
}
