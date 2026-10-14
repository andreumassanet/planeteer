/** The sun's place in the sky: NOAA's low-precision solar position, and the direction it gives. */
import * as THREE from 'three';
import { unitAt } from '../sphere.ts';

export const DEG = Math.PI / 180;

/**
 * The sun's direction, published as a live uniform. `Mood` answers what the
 * light is like where the player stands, which is wrong for anything seen from
 * the air: the terminator is in the frame, so a shader that wants to know
 * whether a point is in daylight has to ask at that point. `lights.ts` owns
 * this for what the world emits; this is the same fact for what it is shaded
 * by. Written once a frame by `update`.
 */
export const sunUniform = { value: new THREE.Vector3(0, 1, 0) };

/** Where the sun is straight up, and by how much the clock lies about it. */
export interface Solar {
  /** Latitude of the subsolar point, degrees. Between -23.44 and +23.44. */
  declination: number;
  /** Longitude of the subsolar point, degrees east of Greenwich. */
  subsolarLon: number;
  /** Apparent solar time minus mean solar time, minutes. +-16 over a year. */
  equationOfTime: number;
}

const norm360 = (x: number): number => x - 360 * Math.floor(x / 360);

/**
 * NOAA's solar position, term for term. The line worth reading twice is the
 * equation of time: without it the sun is up to sixteen minutes wrong (four
 * degrees of longitude, 1,100 units on this planet), and the error is seasonal.
 */
export function solarPosition(
  date: Date,
  // Written in place when given: `createSky` asks every frame.
  out: Solar = { declination: 0, subsolarLon: 0, equationOfTime: 0 },
): Solar {
  const julian = date.getTime() / 86400000 + 2440587.5;
  const t = (julian - 2451545) / 36525;

  const meanLon = norm360(280.46646 + t * (36000.76983 + t * 0.0003032));
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  // Equation of the centre: the orbit is an ellipse, so the sun runs ahead of its
  // own average by up to two degrees.
  const m = meanAnomaly * DEG;
  const centre =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;

  // Nutation, as one term: the difference between close enough and an equinox
  // that lands on the right minute.
  const omega = (125.04 - 1934.136 * t) * DEG;
  const apparentLon = (meanLon + centre - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;
  const obliquity =
    (23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 +
      0.00256 * Math.cos(omega)) *
    DEG;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLon)) / DEG;

  const y = Math.tan(obliquity / 2) ** 2;
  const l = meanLon * DEG;
  const equationOfTime =
    (4 *
      (y * Math.sin(2 * l) -
        2 * eccentricity * Math.sin(m) +
        4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l) -
        0.5 * y * y * Math.sin(4 * l) -
        1.25 * eccentricity * eccentricity * Math.sin(2 * m))) /
    DEG;

  // Solar noon is where apparent solar time reads 12:00, and apparent time is
  // the clock plus the equation of time plus four minutes per degree east.
  const minutes = ((julian + 0.5) % 1) * 1440;
  const subsolarLon = ((((720 - minutes - equationOfTime) / 4 + 180) % 360) + 360) % 360 - 180;

  out.declination = declination;
  out.subsolarLon = subsolarLon;
  out.equationOfTime = equationOfTime;
  return out;
}

/** The surface normal at a subsolar point already found; see `sunDirection`. */
export function directionOf(solar: Solar, target: THREE.Vector3): THREE.Vector3 {
  return unitAt(solar.declination, solar.subsolarLon, target);
}
const solarScratch: Solar = { declination: 0, subsolarLon: 0, equationOfTime: 0 };

/**
 * The sun's direction: the surface normal at the subsolar point. Same
 * convention as `onSphere` in `globe.ts` and `toLatLon` in `geo.ts`; if this
 * disagreed with them the sun would rise in the west.
 */
export function sunDirection(date: Date, target: THREE.Vector3): THREE.Vector3 {
  return directionOf(solarPosition(date, solarScratch), target);
}

/** Degrees of the sun above the horizon for someone standing at `up`. */
export function sunElevation(sun: THREE.Vector3, up: THREE.Vector3): number {
  return Math.asin(THREE.MathUtils.clamp(sun.dot(up), -1, 1)) / DEG;
}
