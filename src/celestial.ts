/**
 * The sky's frames: how far the Earth has turned under the stars, and where
 * the stars' own coordinates land in this Earth-fixed world.
 *
 * **One copy, and a leaf.** The orrery had Greenwich sidereal time, the
 * obliquity, the precession and the ecliptic frame as private functions, and
 * the night sky needs the same four; two copies of a sidereal time is two
 * chances to mirror the sky, which this project has done to the planet three
 * times. So they live here, and `orrery.ts`, `sun.ts` and `night-sky.ts` all
 * read them. It imports `sphere.ts`, `pack.ts` and three and nothing else —
 * in particular not `system/orbits.ts`, whose Standish table would ride into
 * the first load with it (`system/index.ts` has the rule and the measurement).
 * The Julian day moved here from there for that reason, and `orbits.ts`
 * re-exports it.
 *
 * # The frame the catalogue is stored in
 *
 * A direction on the celestial sphere at right ascension `a` and declination
 * `d` is, in this Earth-fixed world, the point on the unit sphere at longitude
 * `a - GMST` and latitude `d` — that is what sidereal time *means*. So the
 * catalogue is stored as `toUnit(dec, ra)`: the J2000 sky laid out the way the
 * world lays out a globe, which at GMST 0 in the year 2000 *is* the world.
 * What turns it into tonight's sky is one rotation, `equatorialBasis`, and a
 * `THREE.Points` carrying it as its matrix; no right ascension is ever turned
 * into a vector by hand (`pnpm check` fails a conversion written out in
 * `src/`, and a declination is a latitude with another name).
 *
 * **What is left out, and why it is allowed to be.** Nutation (17
 * arcseconds), aberration (20), proper motion (a minute of arc at most since
 * 2000, for a handful of stars) and refraction (half a degree, at the horizon
 * only, where the extinction has the star already). `sun.ts` refracts
 * nothing either, and the sun and the stars have to agree with each other
 * before they agree with anything else. The one correction that is **not**
 * sub-noise is precession: 0.37 degrees since 2000, seven pixels on a 60
 * degree lens, and it is what moves Polaris from 0.74 degrees off the pole to
 * 0.63. It is kept.
 */

import * as THREE from 'three';
import { unitAt } from './sphere.ts';
import { DATA_URL, decodeStars, inflate } from './pack.ts';
import type { StarCatalogue } from './pack.ts';

const DEG = Math.PI / 180;

/** Days in a Julian century, which is the unit every rate below is per. */
const CENTURY = 36525;

/** Julian date of J2000.0 — 2000 January 1, 12:00 TT. */
const J2000 = 2451545;

/**
 * The one place a JavaScript `Date` becomes an astronomical epoch.
 *
 * `Date.getTime()` is milliseconds of UTC since 1970-01-01T00:00:00Z, and
 * 2440587.5 is that instant's Julian date. This ignores the difference between
 * UTC and Terrestrial Time — 69 seconds today, and growing — which is 69
 * seconds of Earth's orbit, or **0.0008 degrees of heliocentric longitude**.
 * Against a table whose own error is ten arcminutes that is three orders of
 * magnitude below the noise, so correcting it would be precision theatre.
 * `sun.ts` makes the identical simplification for the identical reason, and
 * so does sidereal time below: UT1 is within a second of UTC by definition.
 */
export const julianDay = (date: Date): number => date.getTime() / 86400000 + 2440587.5;

/** Julian centuries since J2000, which is what every secular rate multiplies. */
export const centuriesSince2000 = (date: Date): number => (julianDay(date) - J2000) / CENTURY;

/**
 * The general precession in longitude, degrees per Julian century.
 *
 * Standish's elements and the star catalogue are both in the J2000 frame, and
 * the frame built from sidereal time is the equinox of *date*; between them
 * the equinox has slid 0.37 degrees since 2000. Adding it is one term, and
 * leaving it out would be a third of a degree of disagreement in the orrery's
 * `verify()` for no reason at all — and seven pixels of star.
 */
export const PRECESSION = 1.396971;

/** The mean obliquity of the ecliptic at `t` Julian centuries from J2000, degrees. */
export const obliquity = (t: number): number => 23.439291 - 0.0130042 * t;

/** The obliquity the catalogue and Standish's table are referred to. */
export const OBLIQUITY_J2000 = obliquity(0);

/**
 * Greenwich mean sidereal time, in degrees: how far the Earth-fixed frame has
 * turned under the stars. The IAU 1982 expression, good to a tenth of a
 * second of time, which is 0.0004 degrees; `pnpm system` holds it to both of
 * Meeus's worked examples (12.a and 12.b) to 1e-5.
 */
export function siderealDegrees(date: Date): number {
  const d = julianDay(date) - J2000;
  const t = d / CENTURY;
  const g = 280.46061837 + 360.98564736629 * d + 0.000387933 * t * t;
  return g - 360 * Math.floor(g / 360);
}

/**
 * The ecliptic of date as three world-space unit vectors.
 *
 * The three are: the equinox (RA 0, Dec 0), ecliptic longitude 90 (RA 90,
 * Dec +e), and the ecliptic pole (RA 270, Dec 90 - e). In the celestial frame
 * those are `(1,0,0)`, `(0, cos e, sin e)` and `(0, -sin e, cos e)`, a
 * right-handed triple; `unitAt` maps the celestial frame to this one by a
 * rotation, so it stays right-handed — and the orrery asserts the determinant
 * anyway, every frame.
 */
export function eclipticBasis(date: Date, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3): void {
  const g = siderealDegrees(date);
  const e = obliquity(centuriesSince2000(date));
  unitAt(0, 0 - g, x);
  unitAt(e, 90 - g, y);
  unitAt(90 - e, 270 - g, z);
}

const ex = new THREE.Vector3();
const ey = new THREE.Vector3();
const ez = new THREE.Vector3();
const e2 = new THREE.Vector3();
const axisX = new THREE.Vector3();
const axisY = new THREE.Vector3();
const axisZ = new THREE.Vector3();

/**
 * The J2000 sky in tonight's world: the rotation that takes a catalogue
 * direction (`toUnit(dec, ra)`, see the header) to where it is now.
 *
 * Built the way the orrery lays out its planets, from the images of three
 * axes rather than from a formula for the matrix: the ecliptic of date comes
 * from `eclipticBasis`, the J2000 ecliptic is that frame turned back by the
 * precession (the J2000 equinox is at ecliptic longitude `+p` of date,
 * because the equinox slides west under the stars), and the J2000 equator is
 * the J2000 ecliptic leaned by the J2000 obliquity. The three columns are then
 * where RA 0, the J2000 pole and RA 270 are tonight — the catalogue's own `x`,
 * `y` and `z`. Every step is a rotation, so the product is one; a reflection
 * anywhere in it would put Orion's belt the wrong way round and would look
 * fine in a screenshot, so `pnpm system` asserts the determinant at fifty
 * dates and `sun.ts` warns at runtime.
 *
 * The ecliptic of date is treated as the J2000 ecliptic turned about its own
 * pole. It is not quite — the ecliptic itself tilts by 47 arcseconds a century
 * — and that is 12 arcseconds in 2026, under a hundredth of a pixel.
 */
export function equatorialBasis(date: Date, out: THREE.Matrix4): THREE.Matrix4 {
  const p = PRECESSION * centuriesSince2000(date) * DEG;
  eclipticBasis(date, ex, ey, ez);
  const cosP = Math.cos(p);
  const sinP = Math.sin(p);
  // The J2000 ecliptic in the world: `axisX` its equinox, `e2` longitude 90,
  // and its pole is still `ez`.
  axisX.copy(ex).multiplyScalar(cosP).addScaledVector(ey, sinP);
  e2.copy(ey).multiplyScalar(cosP).addScaledVector(ex, -sinP);
  // Then the J2000 equator from it: the pole and RA 270.
  const e0 = OBLIQUITY_J2000 * DEG;
  const cosE = Math.cos(e0);
  const sinE = Math.sin(e0);
  axisY.copy(e2).multiplyScalar(sinE).addScaledVector(ez, cosE);
  axisZ.copy(ez).multiplyScalar(sinE).addScaledVector(e2, -cosE);
  return out.makeBasis(axisX, axisY, axisZ);
}

/**
 * Standish's J2000 ecliptic in the catalogue's frame: what a heliocentric or
 * geocentric vector from `system/orbits.ts` is multiplied by to become a
 * direction among the stars. Its columns are the equinox, ecliptic longitude
 * 90 (RA 90, Dec +e0) and the ecliptic pole (RA 270, Dec 90 - e0), found by
 * `unitAt` like everything else here — `eclipticBasis` at GMST 0 in 2000.
 */
export const ECLIPTIC_J2000: THREE.Matrix3 = (() => {
  const x = unitAt(0, 0, new THREE.Vector3());
  const y = unitAt(OBLIQUITY_J2000, 90, new THREE.Vector3());
  const z = unitAt(90 - OBLIQUITY_J2000, 270, new THREE.Vector3());
  return new THREE.Matrix3().set(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z);
})();

/**
 * The IAU galactic frame, as a matrix whose rows are its axes in the
 * catalogue's frame: `GALACTIC * toUnit(dec, ra)` is `(cos b cos l, cos b sin
 * l, sin b)`.
 *
 * The rows are the galactic centre (RA 266.40499, Dec -28.93617), longitude
 * 90, and the north galactic pole (RA 192.85948, Dec +27.12825) — the J2000
 * values of the 1958 definition, which is the A_G matrix of the Hipparcos
 * introduction. Longitude 90 is the pole crossed with the centre, which is
 * what makes the frame right-handed rather than a choice. The Milky Way in
 * `sun.ts` is painted in it, and `scripts/build-stars.ts` holds it to the
 * catalogue's own galactic coordinates for every star, which is a third party
 * inside the very file the sky is drawn from.
 */
export const GALACTIC: THREE.Matrix3 = (() => {
  const centre = unitAt(-28.93617, 266.40499, new THREE.Vector3());
  const pole = unitAt(27.12825, 192.85948, new THREE.Vector3());
  // The published axes are orthogonal to the digits given; this takes the
  // last of the rounding out of the centre so the matrix is a rotation.
  centre.addScaledVector(pole, -centre.dot(pole)).normalize();
  const l90 = new THREE.Vector3().crossVectors(pole, centre);
  return new THREE.Matrix3().set(centre.x, centre.y, centre.z, l90.x, l90.y, l90.z, pole.x, pole.y, pole.z);
})();

/**
 * Fetches and decodes `stars.bin`, the Bright Star Catalogue as
 * `scripts/build-stars.ts` baked it.
 *
 * Here rather than beside the code that draws it, because the fetch is fired
 * at the top of `main.ts`'s `start()` beside the railway's — nothing waits on
 * it, and the drawing is in a deferred chunk that arrives later — and a loader
 * in that chunk could not be asked for the file until the chunk itself had
 * come.
 */
export async function loadStars(url = `${DATA_URL}stars.bin`): Promise<StarCatalogue> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodeStars(await inflate(await response.arrayBuffer()));
}
