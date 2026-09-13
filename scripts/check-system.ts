/**
 * Headless assertions over the solar system.
 *
 * `scripts/check-world.ts` is about **data** — the bake, the mesh, where the
 * monuments landed. `check-traffic.ts` and `check-people.ts` are about **kits**,
 * which have no baked artefact. This is about neither: most of it is about
 * **arithmetic that has a right answer in the real world**, which is the one
 * category this project had not needed a check for until a planet had to be
 * somewhere real.
 *
 * That is why the first section is the longest. **A wrong orbit is exactly the
 * class of bug this repo catches in a table and never in a screenshot** — a
 * planet in the wrong place looks precisely like a planet in the right place —
 * and the same was true of the mirrored globe, which passed every check for
 * months because every check compared it with itself. So the orbits are checked
 * against three things that are *not* this file: published periods, published
 * opposition dates, and `src/sun.ts`, which arrives at the sun's position by a
 * completely different route and is itself verified against a real sunset.
 *
 * The one trick, and it is `check-traffic.ts`'s: **the registry cannot be used
 * here.** `import.meta.glob` is a Vite transform and does not exist in Node, so
 * the bodies are read off disk and imported by path. The consequence is that a
 * fault the registry would catch — two files exporting the same body — is
 * caught by `registryProblems()` in a browser and not by this. Both are needed.
 *
 * `node scripts/check-system.ts`, or `pnpm system`.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { solarPosition } from '../src/sun.ts';
import { createSceneryContext } from '../src/scenery/contract.ts';
import { measure } from '../src/monuments/contract.ts';
import { rngFrom } from '../src/scenery/random.ts';
import { WALK_SPEED, RUN_SPEED } from '../src/avatar.ts';

import {
  ELEMENTS,
  centuriesSince2000,
  elementsAt,
  heliocentric,
  moonPosition,
  periodOf,
} from '../src/system/orbits.ts';
import type { OrbitId } from '../src/system/orbits.ts';
import {
  ALIEN_VARIANTS,
  AU_KM,
  AU_UNITS,
  BUDGETS,
  DECORATION_VARIANTS,
  EARTH_DRAWN,
  EARTH_RADIUS_KM,
  KM_PER_UNIT,
  PLANET_RADIUS,
  SUN_DRAWN,
  apparentPixels,
  decorationRng,
  drawnRadiusOf,
  eclipticToWorld,
  meshWithin,
  surfaceRadiusOf,
  validateBody,
} from '../src/system/contract.ts';
import type { Body, Decoration, GroundSample, Species } from '../src/system/contract.ts';
import { alienFor, buildAlien } from '../src/system/alien.ts';

const DEG = Math.PI / 180;

let failures = 0;
const fail = (message: string): void => {
  failures++;
  console.log(`  FAIL  ${message}`);
};
const near = (label: string, got: number, want: number, tol: number, unit = ''): void => {
  const off = Math.abs(got - want);
  if (off > tol) fail(`${label}: ${got.toFixed(6)}${unit} against ${want.toFixed(6)}${unit} — off by ${off.toFixed(6)}`);
};

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
  const real = REAL_PERIOD[id];
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
 * Against `src/sun.ts`, which is the strongest third party available offline.
 *
 * `sun.ts` reaches the sun's declination through NOAA's low-precision solar
 * position — a mean longitude, an equation of the centre, one nutation term —
 * and is verified against a real sunset in Mallorca. This file reaches the same
 * declination through Kepler's equation on the Earth–Moon barycentre and an
 * obliquity. Two derivations with almost nothing in common; if they agree,
 * both are right.
 *
 * **They do not agree until the frames are named, and that is a finding rather
 * than a nuisance.** Standish's elements are referred to the **J2000 mean
 * ecliptic and equinox**, a frame fixed at one instant; NOAA's mean longitude
 * carries 36000.77 degrees a century, which is the *tropical* rate and includes
 * precession. So the two drift apart by 1.397 degrees a century — **0.49
 * degrees of longitude by 2035**, which came out as 0.195 degrees of
 * declination and looks exactly like a plausible epoch error. Adding general
 * precession in longitude takes the disagreement to a few arcseconds.
 *
 * That is the same shape of fault as the mirrored globe: two self-consistent
 * systems, each correct in its own frame, and no way to see it except by
 * putting a third party between them.
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
 * **This is the check the whole first section exists for.** An opposition is
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

// ===========================================================================
// 2. The scale
// ===========================================================================

console.log('\n\n=== the scale ===\n');

console.log(`  Earth is PLANET_RADIUS ${PLANET_RADIUS} against a real ${EARTH_RADIUS_KM} km,`);
// Read a world unit as a metre and the planet is 1:398 — which is the sense
// CLAUDE.md means, and it is *not* the avatar's scale. The avatar is 6.8 units
// for a 1.75 m person, so the body is at about 1:0.26 of the same reading.
// That conflict is real, it is written down rather than hidden, and it is the
// reason this file states which of the two any number belongs to.
console.log(`  so one world unit is ${KM_PER_UNIT.toFixed(5)} km, and read as a metre that is 1:${((EARTH_RADIUS_KM * 1000) / PLANET_RADIUS).toFixed(0)}.`);
near('Earth round-trips through surfaceRadiusOf', surfaceRadiusOf(EARTH_RADIUS_KM), PLANET_RADIUS, 1e-9);

{
  const auInUnits = AU_KM / KM_PER_UNIT;
  const neptune = 30.06992276 * auInUnits;
  // The spacing between representable float32 values at |x|.
  const ulp = 2 ** (Math.floor(Math.log2(neptune)) - 23);
  console.log(`\n  at true scale: 1 au is ${(auInUnits / 1e6).toFixed(1)} M units and Neptune's orbit ${(neptune / 1e9).toFixed(2)} G units.`);
  console.log(`    float32 spacing there: ${ulp.toFixed(0)} units — ${(ulp / 6.8).toFixed(0)} avatars. Positions do not exist at that range.`);
  console.log(`    Earth from Mars at closest approach: ${apparentPixels(PLANET_RADIUS, 0.52 * auInUnits).toFixed(3)} px.`);
  if (ulp < 6.8) fail('float32 can hold a true-scale Neptune after all — the compression argument needs re-deriving');
}

console.log(`\n  so the orrery is ${AU_UNITS} units to the au, linear, with the ellipses untouched.`);
console.log('\n    body       real km   surface u    lap at a run    drawn u   mesh within   ratio to Earth');

// ===========================================================================
// 3. The bodies
// ===========================================================================

const BODY_DIR = resolve(import.meta.dirname, '../src/system/bodies');
const PART_DIR = resolve(import.meta.dirname, '../src/system/parts');

const bodies: Body[] = [];
const speciesById = new Map<string, Species>();
for (const file of readdirSync(BODY_DIR).filter((n) => n.endsWith('.ts')).sort()) {
  const module = (await import(pathToFileURL(resolve(BODY_DIR, file)).href)) as Record<string, unknown>;
  let found = 0;
  for (const value of Object.values(module)) {
    if (typeof value === 'object' && value !== null && typeof (value as Body).radiusKm === 'number' && typeof (value as Body).blurb === 'string') {
      bodies.push(value as Body);
      found++;
    }
  }
  const list = (module as { SPECIES?: readonly Species[] }).SPECIES;
  if (Array.isArray(list)) for (const one of list) speciesById.set(one.id, one);
  if (found !== 1) fail(`${file} exports ${found} bodies — one file, one world`);
}
bodies.sort((a, b) => (a.orbit === null ? -1 : ELEMENTS[a.orbit]!.epoch.a) - (b.orbit === null ? -1 : ELEMENTS[b.orbit]!.epoch.a));

for (const body of bodies) {
  const surface = surfaceRadiusOf(body.radiusKm);
  const drawn = body.kind === 'star' ? SUN_DRAWN : drawnRadiusOf(body.radiusKm);
  const lap = (2 * Math.PI * surface) / RUN_SPEED;
  console.log(
    `    ${body.id.padEnd(9)} ${body.radiusKm.toFixed(0).padStart(8)} ${surface.toFixed(0).padStart(10)}` +
      `   ${body.kind === 'star' ? '        —' : `${(lap / 60).toFixed(1).padStart(6)} min`}   ${drawn.toFixed(1).padStart(7)}   ${meshWithin(drawn).toFixed(0).padStart(9)}` +
      `   ${(drawn / EARTH_DRAWN).toFixed(2).padStart(6)} (real ${(body.radiusKm / EARTH_RADIUS_KM).toFixed(2)})`,
  );
}
console.log(`\n    (a lap of Earth at ${RUN_SPEED} units/s is ${((2 * Math.PI * PLANET_RADIUS) / RUN_SPEED / 60).toFixed(1)} min; at a walk, ${WALK_SPEED}, it is ${((2 * Math.PI * PLANET_RADIUS) / WALK_SPEED / 3600).toFixed(1)} h)`);

/**
 * The neighbour rule, which is what licenses the exaggeration.
 *
 * *Two neighbouring bodies' drawn radii must sum to less than half the minimum
 * distance between their orbits.* Half, so that whatever the phases do there is
 * always a gap of at least the same size again between the two discs. This is
 * the assertion that stops somebody raising `EARTH_DRAWN` until Venus and Earth
 * overlap in the middle of the frame.
 */
console.log('\n  the neighbour rule — drawn radii against the gap between the orbits:');
{
  const ordered = bodies.filter((b) => b.orbit !== null);
  const drawnOf = (b: Body): number => (b.kind === 'star' ? SUN_DRAWN : drawnRadiusOf(b.radiusKm));
  const star = bodies.find((b) => b.kind === 'star');
  const rows: [string, number, number][] = [];
  if (star !== undefined && ordered[0] !== undefined) {
    const inner = ELEMENTS[ordered[0]!.orbit!]!.epoch;
    rows.push([`sun / ${ordered[0]!.id}`, drawnOf(star) + drawnOf(ordered[0]!), inner.a * (1 - inner.e) * AU_UNITS]);
  }
  for (let i = 1; i < ordered.length; i++) {
    const a = ELEMENTS[ordered[i - 1]!.orbit!]!.epoch;
    const b = ELEMENTS[ordered[i]!.orbit!]!.epoch;
    const gap = (b.a * (1 - b.e) - a.a * (1 + a.e)) * AU_UNITS;
    rows.push([`${ordered[i - 1]!.id} / ${ordered[i]!.id}`, drawnOf(ordered[i - 1]!) + drawnOf(ordered[i]!), gap]);
  }
  for (const [label, sum, gap] of rows) {
    const share = sum / gap;
    console.log(`    ${label.padEnd(20)} radii sum ${sum.toFixed(1).padStart(7)}   gap ${gap.toFixed(0).padStart(6)}   ${(share * 100).toFixed(1)}% of it`);
    if (share > 0.5) fail(`${label}: the two discs take ${(share * 100).toFixed(1)}% of the gap between their orbits`);
  }
}

/**
 * The frame conversion, checked by a third party rather than by itself.
 *
 * The ecliptic frame goes to the world frame as `(x, y, z) -> (x, z, -y)`. Two
 * things have to be true and neither is obvious: its determinant must be **+1**,
 * because a reflection here would mirror the entire solar system exactly as
 * `z = +cos(lat) sin(lon)` mirrored the planet for months and passed every
 * check; and it must carry ecliptic longitude to *world* longitude unchanged,
 * where world longitude is `geo.ts`'s `atan2(-z, x)` and not a fresh one.
 */
{
  const e1 = eclipticToWorld({ x: 1, y: 0, z: 0 });
  const e2 = eclipticToWorld({ x: 0, y: 1, z: 0 });
  const e3 = eclipticToWorld({ x: 0, y: 0, z: 1 });
  const det =
    e1.x * (e2.y * e3.z - e2.z * e3.y) -
    e2.x * (e1.y * e3.z - e1.z * e3.y) +
    e3.x * (e1.y * e2.z - e1.z * e2.y);
  console.log(`\n  ecliptic -> world: determinant ${det.toFixed(3)} (a reflection would be -1 and would mirror the system)`);
  if (Math.abs(det - 1) > 1e-9) fail(`the frame conversion has determinant ${det} — it is not a rotation`);
  for (const lon of [0, 45, 90, 135, 180, -90, -135]) {
    for (const lat of [0, 30, -60]) {
      const c = Math.cos(lat * DEG);
      const w = eclipticToWorld({ x: c * Math.cos(lon * DEG), y: c * Math.sin(lon * DEG), z: Math.sin(lat * DEG) });
      const gotLon = Math.atan2(-w.z, w.x) / DEG;
      const gotLat = Math.asin(w.y) / DEG;
      if (Math.abs(((gotLon - lon + 540) % 360) - 180) > 1e-9) fail(`ecliptic lon ${lon} arrives as world lon ${gotLon.toFixed(4)}`);
      if (Math.abs(gotLat - lat) > 1e-9) fail(`ecliptic lat ${lat} arrives as world lat ${gotLat.toFixed(4)}`);
    }
  }
}

/** Where everything is right now, which is the whole point of the exercise. */
{
  const now = new Date();
  console.log(`\n  where they are at ${now.toISOString().slice(0, 16)}Z:`);
  console.log('    body        r (au)   ecl. lon   ecl. lat    orrery x, y, z');
  for (const body of bodies) {
    if (body.orbit === null) continue;
    const h = heliocentric(body.orbit, now);
    const w = eclipticToWorld(h);
    console.log(
      `    ${body.id.padEnd(9)} ${h.r.toFixed(4).padStart(8)} ${h.lon.toFixed(2).padStart(10)} ${h.lat.toFixed(2).padStart(9)}` +
        `    ${(w.x * AU_UNITS).toFixed(0).padStart(7)}, ${(w.y * AU_UNITS).toFixed(0).padStart(5)}, ${(w.z * AU_UNITS).toFixed(0).padStart(7)}`,
    );
  }
}

// --- the countries and the cities -----------------------------------------

console.log('\n\n=== the worlds ===\n');
for (const body of bodies) {
  for (const problem of validateBody(body)) fail(`${body.id}: ${problem}`);
  if (body.species !== null && !speciesById.has(body.species)) {
    fail(`${body.id} names species '${body.species}' and no file declares it`);
  }
  const inhabited = body.nations.length > 0;
  console.log(
    `  ${body.name.padEnd(10)} ${body.kind.padEnd(6)} ${body.nations.length} countries, ${body.settlements.length} cities, ` +
      `${body.ground === null ? 'no ground model' : `${Object.keys(body.ground.biomes).length} biomes on ${body.ground.secondAxis}`}` +
      `${body.species === null ? ', nobody lives there' : `, ${body.species}`}`,
  );
  // A country with no city in it is a pin on a map that leads to nothing —
  // exactly what a monument row with no model file is, and the bake places
  // those happily.
  if (inhabited) {
    for (const nation of body.nations) {
      if (!body.settlements.some((s) => s.nation === nation.id)) {
        fail(`${body.id}: '${nation.id}' has no city in it — a name on the map that leads nowhere`);
      }
    }
  }
  // Every city resolving to the country it declares is `validateBody`'s job and
  // it is done above — through the smallest-containing-cap rule rather than
  // through the name, so an enclave resolves the way Lesotho does.
}

// --- the ground models ----------------------------------------------------

/**
 * Named places against the biome the ground model gives them.
 *
 * This is `check-world.ts`'s 25-Terran-places assertion, one planet over, and
 * the reason it can exist at all is that **every coordinate in `mars.ts` is a
 * real one.** Olympus Mons is where Olympus Mons is, Syrtis Major is the dark
 * patch Huygens drew in 1659, and a reader can check this table against an
 * atlas. On a body with invented coordinates there would be nothing to check.
 */
const GROUND_EXPECTED: Record<string, [string, number, number, string][]> = {
  mercury: [
    // The two cold traps and the two hot poles: the four places on Mercury that
    // are what they are for a reason anyone can state, and the only four on the
    // planet whose ground a model this crude has any business predicting.
    ['north cold trap', 89, 0, 'ice'],
    ['south cold trap', -89, 180, 'ice'],
    ['hot pole, lon 0', 0, 0, 'slag'],
    ['hot pole, lon 180', 0, 180, 'slag'],
    ['warm pole, lon 90', 0, 90, 'regolith'],
    ['Caloris Planitia', 30.5, -170.2, 'ash'],
    ['Caloris Montes', 30.5, -155, 'scarp'],
    ['Rembrandt', -32.9, 87.9, 'ash'],
    ['Beagle Rupes', -2.1, -101.2, 'scarp'],
  ],
  venus: [
    // Maxwell is the highest ground on the planet and the metal frost is on it;
    // Alpha Regio is the type locality for tessera, the deformed highland
    // Venera radar found and nobody has a good explanation for; Atla is one of
    // the two places most likely to be erupting now.
    ['Maxwell Montes', 65.2, 3.3, 'frost'],
    ['Alpha Regio', -25.5, 4.5, 'tessera'],
    ['Lakshmi Planum', 68.6, -20.7, 'tessera'],
    ['Atla Regio', 0.9, -165.5, 'sulphur'],
    ['Atalanta Planitia', 46, 166, 'crust'],
    ['Diana Chasma', -14.7, 156, 'plain'],
    ['Guinevere Planitia', 22, -35, 'crust'],
  ],
  neptune: [
    // 1989 coordinates, which is when anything was last seen here. The Great
    // Dark Spot was gone by 1994 and the point of putting it in a check is
    // that the model reproduces the *Voyager* map, which is the only map there
    // is.
    ['Great Dark Spot', -22, 15, 'storm'],
    ['Scooter', -42, -60, 'cirrus'],
    ['South Polar Collar', -80, 0, 'collar'],
    ['North Polar Collar', 80, 180, 'collar'],
    ['the equatorial jet', 0, 150, 'storm'],
    ['the northern band', 40, -140, 'deck'],
  ],
  mars: [
    ['Olympus Mons summit', 18.65, -133.8, 'rock'],
    ['Ascraeus Mons', 11.8, -104.5, 'rock'],
    ['Elysium Mons', 25.02, 147.2, 'lava'],
    ['Syrtis Major', 8.4, 69.5, 'basalt'],
    ['Meridiani Planum', 0, 0, 'basalt'],
    ['Acidalia Planitia', 46.7, -22, 'basalt'],
    ['Terra Sirenum', -35, -155, 'basalt'],
    ['Arabia Terra', 21, 6, 'dust'],
    ['Amazonis Planitia', 24.8, -164, 'dust'],
    ['Hellas Planitia', -42.4, 70.5, 'dust'],
    ['Argyre Planitia', -49.7, -44, 'dust'],
    ['Valles Marineris', -13.4, -61, 'chasma'],
    ['Planum Boreum', 88, 0, 'ice'],
    ['Planum Australe', -87, 160, 'ice'],
    ['Vastitas Borealis', 70, 120, 'frost'],
  ],
};

console.log('\n  the ground, at named places:');
const sample: GroundSample = { id: '', warmth: 0, second: 0, elevation: 0 };
for (const body of bodies) {
  if (body.ground === null) continue;
  const expected = GROUND_EXPECTED[body.id];
  console.log(`\n    ${body.name} — warmth against ${body.ground.secondAxis}`);
  const places =
    expected ??
    // No table for this world: sample it on a spiral instead, so the check at
    // least says the classifier reaches more than one answer. A body whose
    // whole surface is one biome is the flat world all over again.
    Array.from({ length: 24 }, (_, i) => {
      const lat = (Math.asin(1 - (2 * (i + 0.5)) / 24) * 180) / Math.PI;
      const lon = (((i * 2.399963) % (2 * Math.PI)) * 180) / Math.PI - 180;
      return [`${lat.toFixed(0)},${lon.toFixed(0)}`, lat, lon, ''] as [string, number, number, string];
    });
  const seen = new Set<string>();
  for (const [name, lat, lon, want] of places) {
    const elevation = body.ground.relief(lat, lon);
    body.ground.at(lat, lon, elevation, sample);
    seen.add(sample.id);
    if (want === '') continue;
    const ok = sample.id === want;
    if (!ok) fail(`${body.id}: ${name} comes out ${sample.id} and should be ${want}`);
    console.log(
      `      ${ok ? ' ' : '!'} ${name.padEnd(22)} elev ${elevation.toFixed(0).padStart(5)}` +
        `  warmth ${sample.warmth.toFixed(2)}  ${body.ground.secondAxis} ${sample.second.toFixed(2)}   ${sample.id}`,
    );
  }
  if (expected === undefined) {
    console.log(`      ${seen.size} of ${Object.keys(body.ground.biomes).length} biomes reached over 24 spiral samples: ${[...seen].sort().join(', ')}`);
  }
  if (seen.size < 3) fail(`${body.id}'s ground model reaches only ${seen.size} biome(s) — the world is one texture`);
}

// ===========================================================================
// 4. The species
// ===========================================================================

console.log('\n\n=== the species ===\n');

const ctx = createSceneryContext();

/** Every vertex of a built group, in group space, and what it is drawn in. */
function fingerprint(group: import('three').Group): string {
  group.updateMatrixWorld(true);
  const parts: string[] = [];
  group.traverse((object) => {
    const mesh = object as unknown as {
      isMesh?: boolean;
      material?: { userData: Record<string, unknown> };
      geometry?: import('three').BufferGeometry;
      matrixWorld: { elements: number[] };
    };
    if (mesh.isMesh !== true || mesh.geometry === undefined) return;
    parts.push(`#${String(mesh.material?.userData.atlasToon ?? 'none')}`);
    parts.push(mesh.matrixWorld.elements.map((n) => n.toFixed(4)).join(','));
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      parts.push(`${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`);
    }
  });
  return parts.join('|');
}

/** The lowest world-space vertex of a built group. */
function lowest(group: import('three').Group): number {
  group.updateMatrixWorld(true);
  let low = 0;
  group.traverse((object) => {
    const mesh = object as unknown as { isMesh?: boolean; geometry?: import('three').BufferGeometry; matrixWorld: { elements: number[] } };
    if (mesh.isMesh !== true || mesh.geometry === undefined) return;
    const e = mesh.matrixWorld.elements;
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = e[1]! * p.getX(i) + e[5]! * p.getY(i) + e[9]! * p.getZ(i) + e[13]!;
      if (y < low) low = y;
    }
  });
  return low;
}

const dispose = (group: import('three').Group): void => {
  group.traverse((o) => {
    const mesh = o as unknown as { isMesh?: boolean; geometry?: { dispose(): void } };
    if (mesh.isMesh === true) mesh.geometry?.dispose();
  });
};

interface Row {
  triangles: number;
  meshes: number;
  colors: number;
  height: number;
  radius: number;
}

console.log('  every species, built in every country of its own world, over every pose:\n');
console.log('    species     builds   tris (worst/median)   meshes   colours   height    radius   worst dip');

/**
 * How many distinct people the variety sweep draws.
 *
 * **Not `ALIEN_VARIANTS`, and that distinction was a wrong measurement first.**
 * The budget sweep above walks 24 variants across every country and every pose,
 * which is the right shape for a *contract* check — it is asking whether any
 * combination breaks a budget. It is the wrong shape for a *variety* check,
 * because the country reaches only the wardrobe and the pose is forced, so
 * those 1,440 builds hold **24 distinct bodies**. Measured that way the martian
 * came out 80 of 210 distinguishable at 40 units, which is a true statement
 * about a sample containing 24 heights and says nothing about the species.
 * `check-people.ts` draws 840 separate seeds and this draws 240.
 */
const VARIETY_SEEDS = 240;
for (const body of bodies) {
  const species = body.species === null ? undefined : speciesById.get(body.species);
  if (species === undefined) continue;
  const rows: Row[] = [];
  let dip = 0;
  let builds = 0;
  const nations = body.nations.length > 0 ? body.nations : [undefined];
  for (let variant = 0; variant < ALIEN_VARIANTS; variant++) {
    for (const nation of nations) {
      for (const pose of ['stand', 'walk', 'work', 'watch'] as const) {
        const alien = alienFor(rngFrom('system', body.id, species.id, variant), species, {
          nation,
          warmth: (variant % 10) / 10,
          pose,
        });
        const group = buildAlien(ctx, species.morph, alien);
        builds++;
        const m = measure(group);
        rows.push({ triangles: m.triangles, meshes: m.meshes, colors: m.colors.length, height: m.height, radius: m.radius });
        dip = Math.min(dip, lowest(group));
        dispose(group);
      }
    }
  }
  const tris = rows.map((r) => r.triangles).sort((a, b) => a - b);
  const worst = {
    triangles: tris[tris.length - 1]!,
    median: tris[Math.floor(tris.length / 2)]!,
    meshes: Math.max(...rows.map((r) => r.meshes)),
    colors: Math.max(...rows.map((r) => r.colors)),
    height: Math.max(...rows.map((r) => r.height)),
    radius: Math.max(...rows.map((r) => r.radius)),
  };
  console.log(
    `    ${species.id.padEnd(11)} ${String(builds).padStart(5)}      ${String(worst.triangles).padStart(4)} / ${String(worst.median).padEnd(4)}` +
      `        ${String(worst.meshes).padStart(3)}       ${worst.colors}      ${worst.height.toFixed(2).padStart(6)}   ${worst.radius.toFixed(2).padStart(6)}    ${dip.toFixed(4)}`,
  );
  if (worst.triangles > BUDGETS.alien.triangles) fail(`${species.id} is ${worst.triangles} triangles against a budget of ${BUDGETS.alien.triangles}`);
  if (worst.meshes > BUDGETS.alien.meshes) fail(`${species.id} is ${worst.meshes} meshes against a budget of ${BUDGETS.alien.meshes}`);
  if (worst.colors > BUDGETS.alien.colors) fail(`${species.id} uses ${worst.colors} colours against a budget of ${BUDGETS.alien.colors}`);
  // The crowd's own number: a foot a hundredth of a unit under the floor is a
  // figure standing on nothing, and it is invisible in every thumbnail.
  if (dip < -0.01) fail(`${species.id} puts a vertex ${dip.toFixed(4)} under the floor`);
}

// --- determinism ----------------------------------------------------------

{
  let checked = 0;
  for (const body of bodies) {
    const species = body.species === null ? undefined : speciesById.get(body.species);
    if (species === undefined) continue;
    for (let variant = 0; variant < 6; variant++) {
      const alien = alienFor(rngFrom('system', body.id, species.id, variant), species, { nation: body.nations[0] });
      const once = fingerprint(buildAlien(ctx, species.morph, alien));
      const twice = fingerprint(buildAlien(ctx, species.morph, alien));
      checked++;
      if (once !== twice) fail(`${species.id}/${variant} is not deterministic — same Look, two different bodies`);
    }
  }
  console.log(`\n  determinism: ${checked} bodies built twice and fingerprinted vertex by vertex`);
}

// --- who somebody is, against what they wear ------------------------------

/**
 * The measurement `dress.ts` makes, on an invented species.
 *
 * *Clothing is regional; appearance is not.* On Earth that measured 600 of 600
 * identical people across fourteen regions, dressed 200 of 200 differently. The
 * reason it matters more here is that an alien is the one place where "everyone
 * from Hellas looks like this" is the easiest thing to write and the hardest to
 * take back — a planet whose population is a monoculture is the uniform band
 * `biome.ts` exists to prevent, arriving through a different door.
 */
console.log('\n  the same seed in every country of its own world:');
for (const body of bodies) {
  const species = body.species === null ? undefined : speciesById.get(body.species);
  if (species === undefined || body.nations.length < 2) continue;
  let sameBody = 0;
  let differentDress = 0;
  const seeds = 200;
  for (let seed = 0; seed < seeds; seed++) {
    const drawn = body.nations.map((nation) => alienFor(rngFrom('who', seed), species, { nation }));
    const first = drawn[0]!;
    if (drawn.every((a) => a.height === first.height && a.girth === first.girth && a.hide === first.hide && a.sway === first.sway)) {
      sameBody++;
    }
    if (drawn.some((a) => a.wear !== first.wear || a.accent !== first.accent || a.carry !== first.carry)) {
      differentDress++;
    }
  }
  console.log(`    ${species.id.padEnd(11)} ${sameBody}/${seeds} are the identical person · ${differentDress}/${seeds} are dressed differently somewhere`);
  if (sameBody !== seeds) fail(`${species.id}: the country reaches the body — ${seeds - sameBody} of ${seeds} seeds change who somebody is`);
  if (differentDress < seeds * 0.9) fail(`${species.id}: the country barely reaches the wardrobe — only ${differentDress} of ${seeds}`);
}

// --- how many of them are actually different ------------------------------

/**
 * Rasterise the front view at the pixel size the figure really is, and count
 * how many are distinguishable.
 *
 * `check-people.ts`'s measurement, unchanged, including the part of it that is
 * a warning: **`exact` is nearly useless and is printed to say so.** Height is
 * a continuous draw, so of 840 human figures 840 differed by a pixel somewhere
 * and the number meant nothing. What means something is a threshold on the
 * inked area, and the honest summary on Earth was that at 40 units about 780 of
 * 840 are visibly different people and at 300 units about 330 still are.
 */
function silhouette(group: import('three').Group, distance: number, height: number): Uint8Array {
  group.updateMatrixWorld(true);
  const pxPerUnit = 937 / distance;
  const halfWidth = height * 0.45;
  const top = height * 1.35;
  const w = Math.max(4, Math.round(halfWidth * 2 * pxPerUnit));
  const h = Math.max(4, Math.round(top * pxPerUnit));
  const bits = new Uint8Array(w * h);
  group.traverse((object) => {
    const mesh = object as unknown as { isMesh?: boolean; geometry?: import('three').BufferGeometry; matrixWorld: { elements: number[] } };
    if (mesh.isMesh !== true || mesh.geometry === undefined) return;
    const e = mesh.matrixWorld.elements;
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const count = index ? index.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      const px: number[] = [];
      const py: number[] = [];
      for (let c = 0; c < 3; c++) {
        const i = index ? index.getX(t + c) : t + c;
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const wx = e[0]! * vx + e[4]! * vy + e[8]! * vz + e[12]!;
        const wy = e[1]! * vx + e[5]! * vy + e[9]! * vz + e[13]!;
        px.push((wx + halfWidth) * pxPerUnit);
        py.push((top - wy) * pxPerUnit);
      }
      const minX = Math.max(0, Math.floor(Math.min(px[0]!, px[1]!, px[2]!)));
      const maxX = Math.min(w - 1, Math.ceil(Math.max(px[0]!, px[1]!, px[2]!)));
      const minY = Math.max(0, Math.floor(Math.min(py[0]!, py[1]!, py[2]!)));
      const maxY = Math.min(h - 1, Math.ceil(Math.max(py[0]!, py[1]!, py[2]!)));
      const d = (px[1]! - px[0]!) * (py[2]! - py[0]!) - (px[2]! - px[0]!) * (py[1]! - py[0]!);
      if (Math.abs(d) < 1e-9) continue;
      for (let yy = minY; yy <= maxY; yy++) {
        for (let xx = minX; xx <= maxX; xx++) {
          const sx = xx + 0.5;
          const sy = yy + 0.5;
          const a = ((px[1]! - sx) * (py[2]! - sy) - (px[2]! - sx) * (py[1]! - sy)) / d;
          const b = ((px[2]! - sx) * (py[0]! - sy) - (px[0]! - sx) * (py[2]! - sy)) / d;
          if (a >= -0.002 && b >= -0.002 && 1 - a - b >= -0.002) bits[yy * w + xx] = 1;
        }
      }
    }
  });
  return bits;
}

const hashOf = (bits: Uint8Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < bits.length; i++) if (bits[i] !== 0) h = Math.imul(h ^ i, 0x01000193);
  return String(h >>> 0);
};
const differs = (a: Uint8Array, b: Uint8Array): number => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};

console.log('\n  silhouette variety — the front view at the size the figure really is:');
console.log('    (`exact` is printed to say it is worthless: height is a continuous draw)\n');
console.log('    species      distance    px    exact    >2%    >5%   >10%');
for (const body of bodies) {
  const species = body.species === null ? undefined : speciesById.get(body.species);
  if (species === undefined) continue;
  const nations = body.nations.length > 0 ? body.nations : [undefined];
  const looks = Array.from({ length: VARIETY_SEEDS }, (_, seed) =>
    alienFor(rngFrom('variety', body.id, seed), species, {
      nation: nations[seed % nations.length],
      warmth: ((seed * 7) % 11) / 10,
    }),
  );
  for (const distance of [40, 120, 300]) {
    const bits: Uint8Array[] = [];
    const seen = new Set<string>();
    let ink = 0;
    for (const look of looks) {
      const group = buildAlien(ctx, species.morph, look);
      const raster = silhouette(group, distance, species.morph.height);
      dispose(group);
      seen.add(hashOf(raster));
      let filled = 0;
      for (let i = 0; i < raster.length; i++) filled += raster[i]!;
      ink += filled;
      bits.push(raster);
    }
    const mean = ink / bits.length;
    const counts = [0.02, 0.05, 0.1].map((share) => {
      const reps: Uint8Array[] = [];
      for (const raster of bits) {
        if (reps.every((rep) => differs(rep, raster) > mean * share)) reps.push(raster);
      }
      return reps.length;
    });
    console.log(
      `    ${species.id.padEnd(12)} ${String(distance).padStart(5)} u  ${((937 * species.morph.height) / distance).toFixed(0).padStart(4)}` +
        `   ${String(seen.size).padStart(5)}  ${String(counts[0]).padStart(5)}  ${String(counts[1]).padStart(5)}  ${String(counts[2]).padStart(5)}   of ${bits.length}`,
    );
    // At conversational range a crowd that is one figure is a crowd nobody
    // believes. Half is the floor, and Earth's is 93% at 5%.
    if (distance === 40 && counts[1]! < bits.length * 0.5) {
      fail(`${species.id}: only ${counts[1]} of ${bits.length} are distinguishable at 40 units`);
    }
  }
}

// ===========================================================================
// 5. The decoration
// ===========================================================================

console.log('\n\n=== the decoration ===\n');

const decorations: Decoration[] = [];
for (const file of readdirSync(PART_DIR).filter((n) => n.endsWith('.ts')).sort()) {
  const module = (await import(pathToFileURL(resolve(PART_DIR, file)).href)) as Record<string, unknown>;
  let found = 0;
  for (const value of Object.values(module)) {
    if (typeof value === 'object' && value !== null && typeof (value as Decoration).build === 'function') {
      const part = value as Decoration;
      if (file !== `${part.id}.ts`) fail(`${file} holds '${part.id}' — the file should be ${part.id}.ts`);
      decorations.push(part);
      found++;
    }
  }
  if (found === 0) fail(`${file} exports no Decoration`);
}

console.log('    part          builds   tris (worst)   meshes   colours   height   radius / declared');
for (const part of decorations) {
  let worstT = 0;
  let worstM = 0;
  let worstC = 0;
  let worstH = 0;
  let worstR = 0;
  let builds = 0;
  let dip = 0;
  for (const body of bodies) {
    if (part.bodies.length > 0 && !part.bodies.includes(body.id)) continue;
    // A decoration stands on ground, and a body with no ground model will never
    // place one: building it there measures seeds nothing will ever draw. The
    // Sun was the only such body until the giants arrived as rows for the menu
    // (2026-09-13), and the first of their seeds to be built failed a footprint
    // on a world with nowhere to put the part.
    if (body.ground === null) continue;
    for (let variant = 0; variant < DECORATION_VARIANTS; variant++) {
      let group;
      try {
        group = part.build(ctx, decorationRng(part, body.id, variant), body.look);
      } catch (error) {
        fail(`${part.id} threw on ${body.id}/${variant}: ${String(error)}`);
        continue;
      }
      builds++;
      const m = measure(group);
      worstT = Math.max(worstT, m.triangles);
      worstM = Math.max(worstM, m.meshes);
      worstC = Math.max(worstC, m.colors.length);
      worstH = Math.max(worstH, m.height);
      worstR = Math.max(worstR, m.radius);
      dip = Math.min(dip, m.base);
      const once = fingerprint(group);
      const twice = fingerprint(part.build(ctx, decorationRng(part, body.id, variant), body.look));
      if (once !== twice) fail(`${part.id} (${body.id}/${variant}) is not deterministic`);
      dispose(group);
    }
  }
  console.log(
    `    ${part.id.padEnd(13)} ${String(builds).padStart(5)}      ${String(worstT).padStart(6)}      ${String(worstM).padStart(3)}       ${worstC}` +
      `     ${worstH.toFixed(2).padStart(6)}   ${worstR.toFixed(2)} / ${part.footprint.toFixed(2)}`,
  );
  if (worstT > BUDGETS.decoration.triangles) fail(`${part.id} is ${worstT} triangles against a budget of ${BUDGETS.decoration.triangles}`);
  if (worstM > BUDGETS.decoration.meshes) fail(`${part.id} is ${worstM} meshes against a budget of ${BUDGETS.decoration.meshes}`);
  if (worstC > BUDGETS.decoration.colors) fail(`${part.id} uses ${worstC} colours against a budget of ${BUDGETS.decoration.colors}`);
  // A declared footprint that is smaller than the built one is a placer
  // reserving less ground than the thing needs, which is how two of them end up
  // inside each other. Larger by more than a fifth is ground nobody uses.
  if (worstR > part.footprint * 1.02) fail(`${part.id} builds out to ${worstR.toFixed(2)} against a declared footprint of ${part.footprint}`);
  if (worstR < part.footprint * 0.7) fail(`${part.id} declares ${part.footprint} and never exceeds ${worstR.toFixed(2)} — it is reserving ground nothing uses`);
  if (dip < -0.01) fail(`${part.id} sinks ${dip.toFixed(3)} into the ground`);
}

// Every part must be reachable from some biome, and every biome's named parts
// must exist. Same pair the scenery sheet's orphan banner checks, and it had to
// ask *both* tables the day `biome.ts` became a second placer.
{
  const claimed = new Set<string>();
  const known = new Set(decorations.map((p) => p.id));
  for (const body of bodies) {
    if (body.ground === null) continue;
    for (const biome of Object.values(body.ground.biomes)) {
      for (const id of biome.parts) {
        claimed.add(id);
        if (!known.has(id)) fail(`${body.id}'s '${biome.id}' names decoration '${id}' and no such part exists`);
      }
    }
  }
  for (const part of decorations) {
    if (!claimed.has(part.id)) fail(`nothing will ever build '${part.id}' — no biome on any world names it`);
  }
}

console.log(failures === 0 ? '\nOK\n' : `\n${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
