import { type OrbitId, ELEMENTS, periodOf, centuriesSince2000, elementsAt, heliocentric, moonPosition } from '../../src/system/orbits.ts';
import { fail, DEG, near } from './setup.ts';
import { solarPosition } from '../../src/sun.ts';
import { AU_KM } from '../../src/system/contract.ts';

// ===========================================================================
// 1. The orbits, against the real solar system
// ===========================================================================

console.log('=== the orbits ===\n');

/**
 * Published sidereal periods, days.
 *
 * These are the check's third party for the `L` column, and they are
 * independent of it in the way that matters: the table carries a *rate of mean
 * longitude* fitted to an ephemeris, and these are periods measured by watching
 * planets. If a digit of `Ldot` is fat-fingered, this is what says so.
 */
const REAL_PERIOD: Record<OrbitId, number> = {
  mercury: 87.969,
  venus: 224.701,
  earth: 365.256,
  mars: 686.980,
  jupiter: 4332.589,
  saturn: 10759.22,
  uranus: 30685.4,
  neptune: 60189,
};

console.log('  sidereal period, derived from the mean-longitude rate against the published value:');
console.log('    body        derived        real      error     P^2/a^3');
for (const id of Object.keys(ELEMENTS) as OrbitId[]) {
  const days = periodOf(id);
  const real = REAL_PERIOD[id]!;
  const years = days / 365.25636;
  const a = ELEMENTS[id]!.epoch.a;
  // Kepler's third law, in years and au, where the constant is exactly 1. `a`
  // and `Ldot` are separate columns fitted separately, so this relates two
  // numbers that had no arithmetic reason to agree.
  const kepler = (years * years) / (a * a * a);
  console.log(
    `    ${id.padEnd(9)} ${days.toFixed(2).padStart(10)} ${real.toFixed(2).padStart(11)}` +
      `  ${(((days / real) - 1) * 100).toFixed(3).padStart(7)}%   ${kepler.toFixed(5)}`,
  );
  if (Math.abs(days / real - 1) > 0.001) fail(`${id}'s period is ${days.toFixed(1)} d against a real ${real}`);
  if (Math.abs(kepler - 1) > 0.004) fail(`${id} breaks Kepler's third law: P^2/a^3 = ${kepler.toFixed(5)}`);
}

/**
 * The Kepler solver's own residual.
 *
 * Not a check against reality — a check that the iteration converged. Standish
 * writes it in degrees, where the eccentricity that multiplies the sine has to
 * carry a factor of 180/pi or the correction is 57 times too small and the
 * solver converges *slowly, to the wrong answer*, which is worse than
 * diverging. Working in radians removes the trap and this proves it removed.
 */
{
  let worst = 0;
  for (const id of Object.keys(ELEMENTS) as OrbitId[]) {
    for (let n = 0; n < 400; n++) {
      const date = new Date(Date.UTC(2020, 0, 1) + n * 20 * 86400000);
      const t = centuriesSince2000(date);
      const { e, L, peri } = elementsAt(id, t);
      const M = (((L - peri) % 360) + 540) % 360 - 180;
      const h = heliocentric(id, date);
      // Recover E from the position and put it back through Kepler's equation.
      const a = elementsAt(id, t).a;
      const cosE = (h.r / a) * Math.cos(h.trueAnomaly * DEG) + e;
      const sinE = ((h.r / a) * Math.sin(h.trueAnomaly * DEG)) / Math.sqrt(1 - e * e);
      const E = Math.atan2(sinE, cosE);
      const residual = Math.abs(((E - e * Math.sin(E)) / DEG - M + 540) % 360 - 180);
      worst = Math.max(worst, residual);
    }
  }
  console.log(`\n  Kepler's equation, worst residual over 3,200 solves: ${worst.toExponential(2)} deg`);
  if (worst > 1e-9) fail(`the Kepler solver is not converging: ${worst} deg of residual`);
}

/**
 * Against `src/sun.ts`, the strongest third party available offline.
 *
 * `sun.ts` reaches the Sun's declination through NOAA's low-precision solar
 * position and is verified against a real sunset; this file reaches it through
 * Kepler's equation on the Earth-Moon barycentre and an obliquity. The two
 * derivations share almost nothing, so agreement means both are right.
 *
 * They agree only once the frames are named: Standish's elements are referred
 * to the J2000 mean ecliptic and equinox, while NOAA's mean longitude carries
 * the tropical rate (36000.77 degrees a century), which includes precession.
 * The two drift apart by 1.397 degrees a century until general precession in
 * longitude is added, after which they agree to a few arcseconds.
 */
{
  let worst = 0;
  let worstAt = '';
  let sum = 0;
  let n = 0;
  for (let year = 2020; year <= 2035; year++) {
    for (let month = 0; month < 12; month++) {
      for (const day of [5, 20]) {
        const date = new Date(Date.UTC(year, month, day));
        const t = centuriesSince2000(date);
        const obliquity = (23.439291 - 0.0130042 * t) * DEG;
        const precession = (5029.0966 * t + 1.11113 * t * t) / 3600;
        const lambda = (heliocentric('earth', date).lon + 180 + precession) * DEG;
        const mine = Math.asin(Math.sin(obliquity) * Math.sin(lambda)) / DEG;
        const theirs = solarPosition(date).declination;
        const off = Math.abs(mine - theirs);
        sum += off;
        n++;
        if (off > worst) {
          worst = off;
          worstAt = date.toISOString().slice(0, 10);
        }
      }
    }
  }
  console.log(
    `\n  the sun's declination, this file against src/sun.ts, ${n} samples 2020-2035:\n` +
      `    mean ${(sum / n) * 3600 < 100 ? ((sum / n) * 3600).toFixed(1) : '???'}" · worst ${(worst * 3600).toFixed(1)}" at ${worstAt}`,
  );
  // A minute of arc. The residue is the Earth's own wobble about the barycentre
  // (6.4"), aberration (20.5") and nutation, none of which either side models
  // the same way.
  if (worst > 1 / 60) fail(`the two solar positions differ by ${(worst * 3600).toFixed(1)} arcsec — more than a minute`);
}

/**
 * Earth's perihelion and aphelion, against the published values.
 *
 * 0.98329 au on 3–5 January and 1.01671 au on 3–6 July are facts anybody can
 * look up, and they are what says the *ellipse* is right rather than the
 * average distance. A circular orbit with the right period would pass every
 * check above this one.
 */
console.log('\n  Earth at its nearest and furthest, scanned hourly:');
for (const year of [2026, 2027]) {
  let lo = Infinity;
  let loAt = 0;
  let hi = 0;
  let hiAt = 0;
  for (let hour = 0; hour < 366 * 24; hour++) {
    const at = Date.UTC(year, 0, 1) + hour * 3600000;
    const r = heliocentric('earth', new Date(at)).r;
    if (r < lo) {
      lo = r;
      loAt = at;
    }
    if (r > hi) {
      hi = r;
      hiAt = at;
    }
  }
  const loDate = new Date(loAt);
  const hiDate = new Date(hiAt);
  console.log(
    `    ${year}  perihelion ${lo.toFixed(5)} au (${(lo * AU_KM / 1e6).toFixed(2)} M km) on ${loDate.toISOString().slice(0, 13)}` +
      `   aphelion ${hi.toFixed(5)} au on ${hiDate.toISOString().slice(0, 13)}`,
  );
  near(`${year} perihelion distance`, lo, 0.98329, 0.0002, ' au');
  near(`${year} aphelion distance`, hi, 1.01671, 0.0002, ' au');
  if (loDate.getUTCMonth() !== 0 || loDate.getUTCDate() < 2 || loDate.getUTCDate() > 6) {
    fail(`perihelion ${year} lands on ${loDate.toISOString().slice(0, 10)}, not in the first week of January`);
  }
  if (hiDate.getUTCMonth() !== 6 || hiDate.getUTCDate() < 2 || hiDate.getUTCDate() > 8) {
    fail(`aphelion ${year} lands on ${hiDate.toISOString().slice(0, 10)}, not in the first week of July`);
  }
}

/**
 * Mars's oppositions, against the published dates.
 *
 * This is the check the whole first section exists for. An opposition is
 * the two heliocentric longitudes coming level, so it depends on *both* orbits
 * at once — their periods, their phases at J2000, their eccentricities and
 * their inclinations — and there is no way to pass it with one of them wrong.
 * The dates below are the ones in every almanac; the synodic interval between
 * them is not constant, and that it is not is itself a consequence of Mars's
 * 0.093 eccentricity rather than an error.
 */
const REAL_OPPOSITIONS = ['2020-10-13', '2022-12-08', '2025-01-16', '2027-02-19', '2029-03-25'];
{
  const signed = (x: number): number => (((x % 360) + 540) % 360) - 180;
  const elongation = (at: number): number =>
    signed(heliocentric('mars', new Date(at)).lon - heliocentric('earth', new Date(at)).lon);

  const found: Date[] = [];
  const start = Date.UTC(2020, 0, 1);
  for (let hour = 0; hour < 10 * 365 * 24; hour += 6) {
    const a = elongation(start + hour * 3600000);
    const b = elongation(start + (hour + 6) * 3600000);
    // Earth overtakes Mars, so the crossing is downward. Upward is conjunction.
    if (!(a > 0 && b <= 0 && a - b < 90)) continue;
    let lo = start + hour * 3600000;
    let hi = lo + 6 * 3600000;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (elongation(mid) > 0) lo = mid;
      else hi = mid;
    }
    found.push(new Date((lo + hi) / 2));
  }
  console.log('\n  Mars at opposition — computed, against the almanac:');
  for (let i = 0; i < REAL_OPPOSITIONS.length; i++) {
    const got = found[i];
    if (got === undefined) {
      fail(`no opposition found for the published ${REAL_OPPOSITIONS[i]}`);
      continue;
    }
    const day = got.toISOString().slice(0, 10);
    const off = Math.round((Date.parse(day) - Date.parse(REAL_OPPOSITIONS[i]!)) / 86400000);
    console.log(`    ${got.toISOString().slice(0, 16)}   published ${REAL_OPPOSITIONS[i]}   ${off === 0 ? 'same day' : `${off} d`}`);
    if (Math.abs(off) > 1) fail(`Mars opposition ${day} against a published ${REAL_OPPOSITIONS[i]} — ${off} days out`);
  }
  if (found.length > 1) {
    const gaps = found.slice(1).map((d, i) => (d.getTime() - found[i]!.getTime()) / 86400000);
    console.log(`    synodic intervals: ${gaps.map((g) => g.toFixed(1)).join(', ')} d (the mean is 779.9 and it is not constant)`);
  }
}

/**
 * The moon, and the honest reading of a truncated series.
 *
 * Six terms of longitude out of sixty, so this is good to roughly a third of a
 * degree — half a moon's width — where the full theory is good to ten
 * arcseconds. What that buys is checked against the one lunar number everybody
 * knows: the synodic month, 29.530589 days.
 *
 * **The distance range is where the truncation shows and it is printed rather
 * than asserted tightly.** Three cosine terms give 357,400 to 412,600 km
 * against a real 356,500 to 406,700; the missing 5,900 km at apogee is the
 * terms that are not here.
 */
{
  const phase = (at: number): number => {
    const p = moonPosition(new Date(at)).phase;
    return p > 0.5 ? p - 1 : p;
  };
  const news: number[] = [];
  const start = Date.UTC(2026, 0, 1);
  for (let hour = 0; hour < 800 * 24; hour++) {
    const a = phase(start + hour * 3600000);
    const b = phase(start + (hour + 1) * 3600000);
    if (!(a < 0 && b >= 0)) continue;
    let lo = start + hour * 3600000;
    let hi = lo + 3600000;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (phase(mid) < 0) lo = mid;
      else hi = mid;
    }
    news.push((lo + hi) / 2);
  }
  const months = news.length - 1;
  const synodic = (news[months]! - news[0]!) / 86400000 / months;
  let lo = Infinity;
  let hi = 0;
  for (let hour = 0; hour < 800 * 24; hour++) {
    const r = moonPosition(new Date(start + hour * 3600000)).distance;
    lo = Math.min(lo, r);
    hi = Math.max(hi, r);
  }
  console.log(
    `\n  the moon: ${months} new moons, mean synodic month ${synodic.toFixed(5)} d against a real 29.53059` +
      ` (${(((synodic / 29.530589) - 1) * 100).toFixed(3)}%)\n` +
      `    first four: ${news.slice(0, 4).map((n) => new Date(n).toISOString().slice(0, 16)).join('  ')}\n` +
      `    distance ${lo.toFixed(0)} to ${hi.toFixed(0)} km against a real 356,500 to 406,700 — ` +
      `perigee ${(lo - 356500).toFixed(0)} km high, apogee ${(406700 - hi).toFixed(0)} km low, which is the fifty terms that are not here`,
  );
  if (Math.abs(synodic / 29.530589 - 1) > 0.001) {
    fail(`the synodic month comes out ${synodic.toFixed(4)} d against 29.5306`);
  }
}
