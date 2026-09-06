/**
 * Where the planets actually are, at the real time.
 *
 * `src/sun.ts` already does this for one body and one question — where is the
 * sun overhead right now — and the whole of its argument transfers: the
 * astronomy is a few dozen numbers rather than a data file, every step of it is
 * checkable against a fact, and a wrong orbit is exactly the class of bug this
 * project catches in a table and never in a screenshot.
 *
 * This is the same trick one level up. Standish's *Keplerian Elements for
 * Approximate Positions of the Major Planets* (JPL Solar System Dynamics) gives
 * six elements and six secular rates per planet, fitted for **1800 AD to 2050
 * AD**, and quoted good to about 10 arcminutes for the inner planets and 30 for
 * the outer over that span. That is 96 numbers for eight planets. **It is not
 * an external asset** — it is a table in a source file, like `flag-data.ts` and
 * `timezone.ts`, which is the line this project draws.
 *
 * What it deliberately is **not**: a perturbation theory. There is no VSOP87
 * here and no JPL kernel. Ten arcminutes is a third of the moon's width and
 * this planet is drawn at 1 au = 1,000 units, where ten arcminutes of Jupiter's
 * longitude is 15 units of a 5,203-unit orbit. Nothing in this world can see
 * it, and `scripts/check-system.ts` says how it was established that nothing
 * can.
 *
 * Everything here is a pure function of a `Date` and returns astronomical
 * units and degrees. **Nothing in this file knows about world units, and that
 * is the seam**: the compression from au to something you can draw lives in
 * `contract.ts`, alone, so that the astronomy can be checked without a scale
 * and the scale can be argued about without touching the astronomy.
 */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

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
 * `sun.ts` makes the identical simplification for the identical reason.
 */
export const julianDay = (date: Date): number => date.getTime() / 86400000 + 2440587.5;

/** Julian centuries since J2000, which is what the rates below multiply. */
export const centuriesSince2000 = (date: Date): number => (julianDay(date) - J2000) / CENTURY;

/**
 * The six Keplerian elements and their rates, in the order Standish tabulates
 * them.
 *
 * `L` is the mean longitude and `peri` the longitude of perihelion, both
 * measured from the J2000 mean ecliptic and equinox — so they are *longitudes*,
 * not angles in the orbital plane, and the argument of perihelion is
 * `peri - node`, and the mean anomaly is `L - peri`. Getting that pair the
 * wrong way round is the classic way to build an orbit that is the right shape
 * and in the wrong place, and it fails by exactly the amount that looks like a
 * plausible epoch error.
 */
export interface Elements {
  /** Semi-major axis, au. */
  a: number;
  /** Eccentricity, dimensionless. */
  e: number;
  /** Inclination to the ecliptic, degrees. */
  i: number;
  /** Mean longitude, degrees. */
  L: number;
  /** Longitude of perihelion, degrees. */
  peri: number;
  /** Longitude of the ascending node, degrees. */
  node: number;
}

export interface OrbitalElements {
  /** At J2000.0. */
  epoch: Elements;
  /** Per Julian century. `L`'s rate is essentially the mean motion. */
  rate: Elements;
}

/**
 * The table, 1800 AD – 2050 AD.
 *
 * Two things about it worth knowing before editing a digit.
 *
 * **The third row is the Earth–Moon barycentre, not the Earth**, which is what
 * Standish tabulates and what every ephemeris means by "Earth" in a table this
 * size. The Earth itself circles that point once a month at 4,671 km, which is
 * 3.1e-5 au — **6.4 arcseconds of heliocentric longitude**, 0.03 world units on
 * a 1,000-unit orbit. The check script measures the consequence rather than
 * assuming it: the disagreement between this and `sun.ts`'s independently
 * derived solar longitude is where that wobble shows up, and it is a hundredth
 * of a degree.
 *
 * **The rates are secular and they are a fit, not a physical law.** They are
 * why this is valid for 1800–2050 and not for 3000 BC: run it to the year 3000
 * and Saturn's eccentricity has drifted past anything real. There is a second
 * Standish table for the longer span with three extra correction terms on the
 * four outer planets; it is not here, because nothing in this project asks for
 * a date outside a human lifetime and carrying the terms would mean carrying
 * the argument for them too.
 */
export const ELEMENTS: Record<string, OrbitalElements> = {
  mercury: {
    epoch: { a: 0.38709927, e: 0.20563593, i: 7.00497902, L: 252.25032350, peri: 77.45779628, node: 48.33076593 },
    rate: { a: 0.00000037, e: 0.00001906, i: -0.00594749, L: 149472.67411175, peri: 0.16047689, node: -0.12534081 },
  },
  venus: {
    epoch: { a: 0.72333566, e: 0.00677672, i: 3.39467605, L: 181.97909950, peri: 131.60246718, node: 76.67984255 },
    rate: { a: 0.00000390, e: -0.00004107, i: -0.00078890, L: 58517.81538729, peri: 0.00268329, node: -0.27769418 },
  },
  earth: {
    epoch: { a: 1.00000261, e: 0.01671123, i: -0.00001531, L: 100.46457166, peri: 102.93768193, node: 0 },
    rate: { a: 0.00000562, e: -0.00004392, i: -0.01294668, L: 35999.37244981, peri: 0.32327364, node: 0 },
  },
  mars: {
    epoch: { a: 1.52371034, e: 0.09339410, i: 1.84969142, L: -4.55343205, peri: -23.94362959, node: 49.55953891 },
    rate: { a: 0.00001847, e: 0.00007882, i: -0.00813131, L: 19140.30268499, peri: 0.44441088, node: -0.29257343 },
  },
  jupiter: {
    epoch: { a: 5.20288700, e: 0.04838624, i: 1.30439695, L: 34.39644051, peri: 14.72847983, node: 100.47390909 },
    rate: { a: -0.00011607, e: -0.00013253, i: -0.00183714, L: 3034.74612775, peri: 0.21252668, node: 0.20469106 },
  },
  saturn: {
    epoch: { a: 9.53667594, e: 0.05386179, i: 2.48599187, L: 49.95424423, peri: 92.59887831, node: 113.66242448 },
    rate: { a: -0.00125060, e: -0.00050991, i: 0.00193609, L: 1222.49362201, peri: -0.41897216, node: -0.28867794 },
  },
  uranus: {
    epoch: { a: 19.18916464, e: 0.04725744, i: 0.77263783, L: 313.23810451, peri: 170.95427630, node: 74.01692503 },
    rate: { a: -0.00196176, e: -0.00004397, i: -0.00242939, L: 428.48202785, peri: 0.40805281, node: 0.04240589 },
  },
  neptune: {
    epoch: { a: 30.06992276, e: 0.00859048, i: 1.77004347, L: -55.12002969, peri: 44.96476227, node: 131.78422574 },
    rate: { a: 0.00026291, e: 0.00005105, i: 0.00035372, L: 218.45945325, peri: -0.32241464, node: -0.00508664 },
  },
};

export type OrbitId = keyof typeof ELEMENTS;

const norm360 = (x: number): number => x - 360 * Math.floor(x / 360);

/** To (-180, +180], which is the range Kepler's equation wants its anomaly in. */
const signed180 = (x: number): number => norm360(x + 180) - 180;

/** The elements at an instant. Public because the orrery draws the ellipse. */
export function elementsAt(id: OrbitId, t: number): Elements {
  const { epoch, rate } = ELEMENTS[id]!;
  return {
    a: epoch.a + rate.a * t,
    e: epoch.e + rate.e * t,
    i: epoch.i + rate.i * t,
    L: epoch.L + rate.L * t,
    peri: epoch.peri + rate.peri * t,
    node: epoch.node + rate.node * t,
  };
}

/**
 * Kepler's equation, `E - e* sin E = M`, by Newton.
 *
 * **The starred `e` is in degrees and it is the one thing here that catches
 * everybody.** Standish writes the iteration in degrees throughout, so the
 * eccentricity that multiplies the sine has to carry the 180/pi with it or the
 * correction is 57 times too small and the solver converges — slowly, and to
 * the wrong answer, which is worse than diverging. Working in radians instead
 * removes the trap entirely, which is why this does.
 *
 * Six iterations is generous. Mercury has the worst eccentricity in the table
 * at 0.206 and Newton on Kepler squares its error each step from a start of
 * `M + e sin M`; the check script reports the residual, which comes out at the
 * limit of a double for every planet on every date it samples.
 */
function eccentricAnomaly(meanAnomaly: number, e: number): number {
  const M = meanAnomaly * DEG;
  let E = M + e * Math.sin(M);
  for (let n = 0; n < 6; n++) {
    const dM = M - (E - e * Math.sin(E));
    const dE = dM / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

/** A position in the J2000 ecliptic frame, au, sun at the origin. */
export interface Heliocentric {
  x: number;
  y: number;
  z: number;
  /** Distance from the sun, au. */
  r: number;
  /** Ecliptic longitude, degrees, 0 to 360. */
  lon: number;
  /** Ecliptic latitude, degrees. */
  lat: number;
  /** True anomaly, degrees — the angle from perihelion. */
  trueAnomaly: number;
}

/**
 * Where a planet is, in the J2000 ecliptic frame with the sun at the origin.
 *
 * The frame is right-handed with +x towards the vernal equinox and +z towards
 * the ecliptic north pole. **That is not this project's world frame** and it is
 * deliberately not converted here: `globe.ts` puts north at +y and `geo.ts`
 * reads longitude as `atan2(-z, x)` because the planet was mirrored for months
 * and the fix was to pick one hand and hold it. Converting an astronomical
 * frame into a rendering frame inside the astronomy is exactly how that mirror
 * happened, so the conversion is one function in `contract.ts` and it is
 * asserted against a third party rather than against itself.
 */
export function heliocentric(id: OrbitId, date: Date): Heliocentric {
  const t = centuriesSince2000(date);
  const { a, e, i, L, peri, node } = elementsAt(id, t);

  const argument = (peri - node) * DEG;
  const meanAnomaly = signed180(L - peri);
  const E = eccentricAnomaly(meanAnomaly, e);

  // In the orbital plane, perifocal: +x towards perihelion.
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cosW = Math.cos(argument);
  const sinW = Math.sin(argument);
  const cosO = Math.cos(node * DEG);
  const sinO = Math.sin(node * DEG);
  const cosI = Math.cos(i * DEG);
  const sinI = Math.sin(i * DEG);

  const x = (cosW * cosO - sinW * sinO * cosI) * xp + (-sinW * cosO - cosW * sinO * cosI) * yp;
  const y = (cosW * sinO + sinW * cosO * cosI) * xp + (-sinW * sinO + cosW * cosO * cosI) * yp;
  const z = sinW * sinI * xp + cosW * sinI * yp;

  const r = Math.hypot(x, y, z);
  return {
    x,
    y,
    z,
    r,
    lon: norm360(Math.atan2(y, x) / DEG),
    lat: Math.asin(z / r) / DEG,
    trueAnomaly: norm360(Math.atan2(yp, xp) / DEG),
  };
}

/**
 * The sidereal period, in days, derived from the mean longitude's own rate.
 *
 * Worth having as a function rather than as a ninth column: it is `360 / Ldot`
 * and nothing else, so a table with a period in it would be a second copy of a
 * number already present — the failure this repo names more often than any
 * other. It is also the cheapest independent check there is, because `a` and
 * `L` are separate columns and Kepler's third law relates them: the check
 * script asks `P^2 = a^3` of all eight and gets it to a fraction of a percent
 * out of numbers that were fitted, not derived.
 */
export const periodOf = (id: OrbitId): number => (360 / ELEMENTS[id]!.rate.L) * CENTURY;

/**
 * A whole orbit as a closed polyline in the ecliptic frame, for drawing.
 *
 * Sampled in **eccentric** anomaly rather than in true anomaly or in time, and
 * that is the difference between an ellipse and a comet's tail. Equal steps in
 * time crowd the samples at aphelion, where the curvature is least and they are
 * worth least; equal steps in true anomaly crowd them at perihelion but not
 * enough, because for `e = 0.21` the radius still swings by half between
 * neighbouring samples near the turn. Equal steps in `E` put them where the
 * curvature is, which is what a parametrisation is for.
 *
 * The ellipse is evaluated at one instant's elements and not re-derived per
 * sample: over one orbit the rates move Mercury's own ellipse by 4e-7 au, and a
 * curve whose two ends were computed at different epochs does not close.
 */
export function orbitPath(id: OrbitId, date: Date, segments = 128): Heliocentric[] {
  const t = centuriesSince2000(date);
  const { a, e, i, peri, node } = elementsAt(id, t);
  const argument = (peri - node) * DEG;
  const cosW = Math.cos(argument);
  const sinW = Math.sin(argument);
  const cosO = Math.cos(node * DEG);
  const sinO = Math.sin(node * DEG);
  const cosI = Math.cos(i * DEG);
  const sinI = Math.sin(i * DEG);

  const path: Heliocentric[] = [];
  for (let n = 0; n < segments; n++) {
    const E = (n / segments) * TAU;
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const x = (cosW * cosO - sinW * sinO * cosI) * xp + (-sinW * cosO - cosW * sinO * cosI) * yp;
    const y = (cosW * sinO + sinW * cosO * cosI) * xp + (-sinW * sinO + cosW * cosO * cosI) * yp;
    const z = sinW * sinI * xp + cosW * sinI * yp;
    const r = Math.hypot(x, y, z);
    path.push({
      x,
      y,
      z,
      r,
      lon: norm360(Math.atan2(y, x) / DEG),
      lat: Math.asin(z / r) / DEG,
      trueAnomaly: norm360(Math.atan2(yp, xp) / DEG),
    });
  }
  return path;
}

// ---------------------------------------------------------------------------
// The moon
// ---------------------------------------------------------------------------

/**
 * The moon, geocentric, from the largest terms of the lunar theory.
 *
 * **It exists because the user asked whether the sun and the moon were physical
 * yet, and today they are not**: `sun.ts` hangs two 1.1-degree discs five radii
 * out and its moon is a *lantern* — always full, always opposite the sun, so
 * that night has a direction for the four-band ramp to step across. That is a
 * good decision for standing outside at 2 a.m. and it is not a position. This
 * is the position, and the two are allowed to disagree because they answer
 * different questions; nothing here changes what `sun.ts` draws.
 *
 * Six terms in longitude, two in latitude, three in distance — the head of
 * Meeus's chapter 47, which runs to sixty. What that buys and what it costs is
 * worth writing down rather than looking up: the full series is good to about
 * 10 arcseconds and this truncation to roughly **0.3 degrees**, which is half a
 * moon's width. At the orrery's scale the moon's whole orbit is 2.6 units
 * across, so 0.3 degrees is 0.007 units. The terms are named for what they are,
 * because a magic number in a trigonometric series is unauditable:
 *
 * - **the evection**, 1.274 degrees, the sun stretching the orbit — the largest
 *   correction after the ellipse itself and the one Ptolemy already had;
 * - **the variation**, 0.658 degrees, the orbit running fast at new and full;
 * - **the annual equation**, 0.186 degrees, the earth's own ellipse feeding
 *   through.
 *
 * Drop those three and the error is 2 degrees, four moon-widths, which is
 * visible on any orrery that draws the phase.
 */
export interface Lunar {
  /** Geocentric ecliptic longitude, degrees. */
  lon: number;
  /** Geocentric ecliptic latitude, degrees. */
  lat: number;
  /** Distance from the earth's centre, km. */
  distance: number;
  /**
   * 0 new, 0.5 full, 1 new again — the elongation from the sun over a turn.
   *
   * The one lunar fact anyone can check by looking up, which is why it is here
   * and why the check script asserts it against a named full moon rather than
   * against the longitude nobody can eyeball.
   */
  phase: number;
}

export function moonPosition(date: Date): Lunar {
  const t = centuriesSince2000(date);

  // The four fundamental arguments, degrees. Every term below is a combination
  // of these and of the sun's own mean anomaly.
  const L = norm360(218.3164477 + 481267.88123421 * t); // mean longitude
  const D = norm360(297.8501921 + 445267.1114034 * t); // mean elongation from the sun
  const M = norm360(357.5291092 + 35999.0502909 * t); // the sun's mean anomaly
  const Mp = norm360(134.9633964 + 477198.8675055 * t); // the moon's mean anomaly
  const F = norm360(93.2720950 + 483202.0175233 * t); // argument of latitude

  const d = D * DEG;
  const m = M * DEG;
  const mp = Mp * DEG;
  const f = F * DEG;

  const lon =
    L +
    6.288774 * Math.sin(mp) + //            the ellipse: the equation of the centre
    1.274027 * Math.sin(2 * d - mp) + //    the evection
    0.658314 * Math.sin(2 * d) + //         the variation
    0.213618 * Math.sin(2 * mp) + //        the second harmonic of the ellipse
    -0.185116 * Math.sin(m) + //            the annual equation
    -0.114332 * Math.sin(2 * f);

  const lat =
    5.128122 * Math.sin(f) +
    0.280602 * Math.sin(mp + f) +
    0.277693 * Math.sin(mp - f);

  const distance =
    385000.56 -
    20905.355 * Math.cos(mp) -
    3699.111 * Math.cos(2 * d - mp) -
    2955.968 * Math.cos(2 * d);

  // Elongation from the sun is what a phase is, and the sun's geometric
  // longitude is the earth's own heliocentric longitude turned round.
  const earth = heliocentric('earth', date);
  const elongation = norm360(lon - (earth.lon + 180));

  return { lon: norm360(lon), lat, distance, phase: elongation / 360 };
}
