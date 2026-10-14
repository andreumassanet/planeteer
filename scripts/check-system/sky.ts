import './orbits.ts';
import { siderealDegrees, equatorialBasis, ECLIPTIC_J2000, GALACTIC, loadStars } from '../../src/celestial.ts';
import { near, DEG, fail } from './setup.ts';
import { Vector3, Matrix4, Scene, Fog } from 'three';
import { heliocentric, type OrbitId, geocentric, apparentMagnitude, ringTilt } from '../../src/system/orbits.ts';
import { sunDirection, twilightLimit, createSky } from '../../src/sun.ts';
import { unitAt } from '../../src/sphere.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNightSky } from '../../src/night-sky.ts';
import { PLANET_RADIUS } from '../../src/system/contract.ts';

// ===========================================================================
// 1b. The night sky, against the real one
// ===========================================================================

/**
 * The stars and the planets as the world draws them (`celestial.ts`,
 * `night-sky.ts`), held to the sky rather than to themselves.
 *
 * A mirrored sky is a sky that looks right. Every constellation keeps its
 * shape in a reflection; only its handedness and the way it wheels are wrong,
 * and nobody checks either from a screenshot. So the witnesses here are all
 * third parties: Meeus's worked examples for sidereal time, the IAU's own
 * galactic matrix, `sun.ts`'s NOAA sun against the same sun put through the
 * star pipeline, Polaris standing at the latitude, a star on the equator
 * rising in the east, and the almanac's dates and magnitudes for the planets.
 */
console.log('\n\n=== the night sky ===\n');

{
  // Meeus, Astronomical Algorithms, examples 12.a and 12.b: 1987 April 10 at
  // 0h UT is 13h10m46.3668s of mean sidereal time, and at 19h21m UT it is
  // 8h34m57.0896s.
  const a = siderealDegrees(new Date('1987-04-10T00:00:00Z'));
  const b = siderealDegrees(new Date('1987-04-10T19:21:00Z'));
  console.log(`  sidereal time, Meeus 12.a ${a.toFixed(6)} (197.693195) and 12.b ${b.toFixed(6)} (128.737873) degrees`);
  near('GMST, Meeus 12.a', a, 197.693195, 1e-5, ' deg');
  near('GMST, Meeus 12.b', b, 128.737873, 1e-5, ' deg');
}

/** Degrees between two directions. */
const angle = (a: Vector3, b: Vector3): number => a.angleTo(b) / DEG;

{
  // A rotation at every date the project could run in, and never a mirror.
  const basis = new Matrix4();
  const x = new Vector3();
  const y = new Vector3();
  const z = new Vector3();
  let worstDet = 0;
  let worstSquare = 0;
  for (let k = 0; k < 50; k++) {
    const date = new Date(Date.UTC(2000 + k, (k * 7) % 12, 1 + ((k * 11) % 28), (k * 5) % 24, (k * 13) % 60));
    equatorialBasis(date, basis).extractBasis(x, y, z);
    worstDet = Math.max(worstDet, Math.abs(basis.determinant() - 1));
    worstSquare = Math.max(worstSquare, Math.abs(x.dot(y)), Math.abs(y.dot(z)), Math.abs(z.dot(x)), Math.abs(x.length() - 1));
  }
  console.log(`  the J2000 sky to the world, 50 dates 2000-2049: determinant within ${worstDet.toExponential(1)} of +1, axes square to ${worstSquare.toExponential(1)}`);
  if (worstDet > 1e-9 || worstSquare > 1e-9) fail(`equatorialBasis is not a rotation: determinant off by ${worstDet}, axes off by ${worstSquare}`);
}

/**
 * The strongest witness, and the one the orrery's `verify()` already trusts:
 * the Sun put through the whole star pipeline — Standish's Earth, turned
 * round, into the catalogue's frame, precessed and turned by sidereal time —
 * against `sun.ts`, which finds it by NOAA's formulas and has never heard of
 * a sidereal time. A mirror, a sign on the precession or a GMST a few seconds
 * out is tenths of a degree here.
 */
{
  const basis = new Matrix4();
  const mine = new Vector3();
  const theirs = new Vector3();
  let worst = 0;
  let worstAt = '';
  let n = 0;
  for (let year = 2020; year <= 2035; year++) {
    for (let month = 0; month < 12; month++) {
      for (const [day, hour] of [[3, 0], [11, 7], [19, 13], [27, 20]] as const) {
        const date = new Date(Date.UTC(year, month, day, hour, 17));
        const earth = heliocentric('earth', date);
        mine.set(-earth.x, -earth.y, -earth.z).applyMatrix3(ECLIPTIC_J2000).applyMatrix4(equatorialBasis(date, basis)).normalize();
        const off = angle(mine, sunDirection(date, theirs));
        n++;
        if (off > worst) {
          worst = off;
          worstAt = date.toISOString().slice(0, 13);
        }
      }
    }
  }
  console.log(`  the sun through the star pipeline against sun.ts, ${n} instants 2020-2035: worst ${worst.toFixed(4)} deg at ${worstAt}`);
  if (worst > 0.05) fail(`the stars' frame puts the sun ${worst.toFixed(3)} deg from where sun.ts lights the world`);
}

/** Altitude and azimuth, degrees, of a world direction for somebody standing at `lat`, `lon`. */
function horizontal(direction: Vector3, lat: number, lon: number): { alt: number; az: number } {
  const up = unitAt(lat, lon, new Vector3());
  const north = new Vector3(0, 1, 0).addScaledVector(up, -up.y).normalize();
  const east = new Vector3().crossVectors(north, up);
  const az = Math.atan2(direction.dot(east), direction.dot(north)) / DEG;
  return { alt: Math.asin(Math.max(-1, Math.min(1, direction.dot(up)))) / DEG, az: (az + 360) % 360 };
}

/**
 * Polaris stands at your latitude, give or take its own distance from the
 * pole — and that distance is the precession's witness: 0.74 degrees in 2000,
 * 0.63 in 2026, and a sky without the term keeps the first. The catalogue's
 * own J2000 position (HR 424), not the file's rounding of it.
 */
{
  const polaris = unitAt(89 + 15 / 60 + 51 / 3600, (2 + 31 / 60 + 48.7 / 3600) * 15, new Vector3());
  const basis = new Matrix4();
  const now = new Vector3();
  const pole = new Vector3(0, 1, 0);
  equatorialBasis(new Date('2026-06-01T00:00:00Z'), basis);
  const distance = angle(now.copy(polaris).applyMatrix4(basis), pole);
  const inJ2000 = angle(polaris, pole);
  let worst = 0;
  let widest = 0;
  for (const lat of [-10, 0.5, 39.57, 69.65]) {
    for (let hour = 0; hour < 24; hour++) {
      const date = new Date(Date.UTC(2026, (hour * 5) % 12, 15, hour, 7 * hour));
      equatorialBasis(date, basis);
      const off = Math.abs(horizontal(now.copy(polaris).applyMatrix4(basis), lat, 2.65).alt - lat);
      worst = Math.max(worst, off - distance);
      widest = Math.max(widest, off);
    }
  }
  console.log(
    `  Polaris: ${distance.toFixed(3)} deg from the pole in 2026 (${inJ2000.toFixed(3)} in J2000); ` +
      `altitude minus latitude reaches ${widest.toFixed(3)} over 96 samples at four latitudes`,
  );
  if (distance < 0.61 || distance > 0.65) fail(`Polaris is ${distance.toFixed(3)} deg from the pole of 2026, not the 0.63 the precession makes it`);
  if (worst > 0.005) fail(`Polaris strays ${worst.toFixed(4)} deg further from the latitude than its own pole distance allows`);
  if (widest < distance * 0.9) fail(`Polaris never swings its full ${distance.toFixed(3)} deg about the pole: the sky is not turning`);
}

/**
 * A star on the celestial equator rises due east and sets due west: while it
 * climbs, its azimuth is between 0 and 180. The mirrored sky passes every
 * other test in this file that compares the sky with itself and fails this
 * one on every sample. "Climbs" is by half a degree in the ten minutes: at
 * the meridian a star is neither rising nor setting, and a pair of samples
 * either side of it says nothing about which way the sky turns.
 */
{
  const basis = new Matrix4();
  const star = new Vector3();
  let rising = 0;
  let wrong = 0;
  for (const ra of [0, 90, 180, 270]) {
    const fixed = unitAt(0, ra, new Vector3());
    let before = Number.NaN;
    for (let step = 0; step <= 144; step++) {
      const date = new Date(Date.UTC(2026, 9, 4, 0, step * 10));
      equatorialBasis(date, basis);
      const { alt, az } = horizontal(star.copy(fixed).applyMatrix4(basis), 39.57, 2.65);
      if (alt > before + 0.5 && alt > -5) {
        rising++;
        if (!(az > 0 && az < 180)) wrong++;
      }
      before = alt;
    }
  }
  console.log(`  a star on the equator rises in the east: ${rising - wrong} of ${rising} climbing samples east of the meridian`);
  if (rising < 100 || wrong > 0) fail(`${wrong} of ${rising} samples have an equatorial star climbing in the west — the sky turns backwards`);
}

/**
 * The galactic frame the Milky Way is painted in, against the IAU's own A_G
 * matrix as the Hipparcos catalogue prints it (volume 1, section 1.5.3), and
 * against the galactic coordinates of the celestial pole that every table
 * gives: l 122.932, b 27.128.
 */
{
  const A_G = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [0.4941094279, -0.44482963, 0.7469822445],
    [-0.867666149, -0.1980763734, 0.4559837762],
  ];
  // The astronomers' equatorial axes, in the catalogue's frame (`toUnit`'s layout).
  const axes = [unitAt(0, 0, new Vector3()), unitAt(0, 90, new Vector3()), unitAt(90, 0, new Vector3())];
  let worst = 0;
  axes.forEach((axis, column) => {
    const g = axis.clone().applyMatrix3(GALACTIC);
    worst = Math.max(worst, Math.abs(g.x - A_G[0]![column]!), Math.abs(g.y - A_G[1]![column]!), Math.abs(g.z - A_G[2]![column]!));
  });
  const pole = unitAt(90, 0, new Vector3()).applyMatrix3(GALACTIC);
  const l = (Math.atan2(pole.y, pole.x) / DEG + 360) % 360;
  const b = Math.asin(pole.z) / DEG;
  console.log(
    `  the galactic frame against the IAU's A_G: worst element off by ${worst.toExponential(1)}; ` +
      `the celestial pole at l ${l.toFixed(3)}, b ${b.toFixed(3)} (122.932, 27.128); determinant ${GALACTIC.determinant().toFixed(6)}`,
  );
  if (worst > 2e-6) fail(`GALACTIC differs from the IAU matrix by ${worst}`);
  near('the celestial pole, galactic longitude', l, 122.932, 0.002, ' deg');
  near('the celestial pole, galactic latitude', b, 27.128, 0.002, ' deg');
  near('the galactic frame, determinant', GALACTIC.determinant(), 1, 1e-9);
}

/**
 * The planets against the almanac: the 2026 oppositions of Jupiter (January
 * 10) and Saturn (October 4) by date, elongation and magnitude — Saturn's
 * with its rings, which at a tilt of 7 degrees are worth a third of a
 * magnitude — the great conjunction of 2020, which put the two a tenth of a
 * degree apart on December 21, and the two inner planets never further from
 * the Sun than their greatest elongations allow.
 */
{
  const widestOf = (id: OrbitId, from: number, days: number, stepHours: number): { at: Date; elongation: number } => {
    let best = { at: new Date(from), elongation: -1 };
    for (let hour = 0; hour <= days * 24; hour += stepHours) {
      const at = new Date(from + hour * 3600000);
      const { elongation } = geocentric(id, at);
      if (elongation > best.elongation) best = { at, elongation };
    }
    return best;
  };
  const days = (a: Date, iso: string): number => (a.getTime() - Date.parse(iso)) / 86400000;
  const opposition = (id: OrbitId, iso: string, wantMag: number, tolMag: number, minElongation: number): void => {
    const found = widestOf(id, Date.parse(iso) - 20 * 86400000, 40, 1);
    const mag = apparentMagnitude(id, found.at);
    console.log(
      `    ${id.padEnd(8)} opposite the Sun ${found.at.toISOString().slice(0, 13)}h (published ${iso}), ` +
        `elongation ${found.elongation.toFixed(2)}, V ${mag.toFixed(2)} (almanac ${wantMag.toFixed(1)})`,
    );
    if (Math.abs(days(found.at, `${iso}T12:00:00Z`)) > 1.5) fail(`${id}'s opposition lands on ${found.at.toISOString().slice(0, 10)}, not ${iso}`);
    if (found.elongation < minElongation) fail(`${id} at opposition is only ${found.elongation.toFixed(2)} deg from the Sun`);
    near(`${id} at opposition, V`, mag, wantMag, tolMag);
  };
  console.log('  the planets against the almanac:');
  opposition('jupiter', '2026-01-10', -2.7, 0.1, 179);
  opposition('saturn', '2026-10-04', 0.3, 0.15, 176.5);
  const tilt = ringTilt(new Date('2026-10-04T12:00:00Z'));
  console.log(`    Saturn's rings at opposition tilted ${tilt.toFixed(2)} deg to the line of sight (almanac about -7.5)`);
  near("Saturn's ring tilt at the 2026 opposition", tilt, -7.5, 0.5, ' deg');

  let closest = 99;
  let closestAt = new Date(0);
  for (let hour = 0; hour < 8 * 24; hour++) {
    const at = new Date(Date.UTC(2020, 11, 17) + hour * 3600000);
    const j = geocentric('jupiter', at);
    const s = geocentric('saturn', at);
    const apart = angle(new Vector3(j.x, j.y, j.z), new Vector3(s.x, s.y, s.z));
    if (apart < closest) {
      closest = apart;
      closestAt = at;
    }
  }
  console.log(`    Jupiter and Saturn closest ${closestAt.toISOString().slice(0, 13)}h, ${closest.toFixed(3)} deg apart (the great conjunction, 0.10 deg on 2020-12-21)`);
  if (closest > 0.3 || Math.abs(days(closestAt, '2020-12-21T18:00:00Z')) > 1.5) {
    fail(`the great conjunction comes out ${closest.toFixed(3)} deg on ${closestAt.toISOString().slice(0, 10)}`);
  }

  const venus = widestOf('venus', Date.UTC(2026, 0, 1), 365, 6);
  const mercury = widestOf('mercury', Date.UTC(2026, 0, 1), 365, 6);
  console.log(
    `    widest from the Sun in 2026: Venus ${venus.elongation.toFixed(1)} deg on ${venus.at.toISOString().slice(0, 10)}, ` +
      `Mercury ${mercury.elongation.toFixed(1)} on ${mercury.at.toISOString().slice(0, 10)} (never past 47.5 and 28.5)`,
  );
  if (venus.elongation > 47.5 || venus.elongation < 44) fail(`Venus reaches ${venus.elongation.toFixed(1)} deg from the Sun in 2026`);
  if (mercury.elongation > 28.5 || mercury.elongation < 17.5) fail(`Mercury reaches ${mercury.elongation.toFixed(1)} deg from the Sun in 2026`);

  // Every magnitude of every day of two years inside what the almanac has
  // ever printed for that planet.
  const RANGE: Partial<Record<OrbitId, readonly [number, number]>> = {
    mercury: [-2.6, 5.8],
    venus: [-4.95, -3.7],
    mars: [-3, 1.9],
    jupiter: [-2.95, -1.6],
    saturn: [-0.6, 1.5],
  };
  for (const [id, [lo, hi]] of Object.entries(RANGE) as [OrbitId, readonly [number, number]][]) {
    let min = Infinity;
    let max = -Infinity;
    for (let day = 0; day < 730; day++) {
      const m = apparentMagnitude(id, new Date(Date.UTC(2026, 0, 1) + day * 86400000));
      min = Math.min(min, m);
      max = Math.max(max, m);
    }
    console.log(`    ${id.padEnd(8)} V ${min.toFixed(2)} to ${max.toFixed(2)} over 2026-2027 (almanac ${lo} to ${hi})`);
    if (!(min >= lo && max <= hi)) fail(`${id}'s magnitude runs ${min.toFixed(2)} to ${max.toFixed(2)}, outside ${lo} to ${hi}`);
  }
}

/**
 * The twilight ladder: the limit only rises as the sun sinks, and it brings
 * the sky out in the order an evening does — Venus, then Sirius, then Polaris,
 * then a fifth-magnitude star — at elevations an almanac would recognise.
 */
{
  let rises = true;
  for (let e = 10; e > -30; e -= 0.25) if (twilightLimit(e - 0.25) < twilightLimit(e)) rises = false;
  const appears = (m: number): number => {
    for (let e = 10; e > -30; e -= 0.05) if (twilightLimit(e) >= m) return e;
    return -90;
  };
  const venus = apparentMagnitude('venus', new Date('2026-10-02T18:00:00Z'));
  const order = [['Venus', venus], ['Sirius', -1.46], ['Polaris', 2.02], ['a fifth-magnitude star', 5]] as const;
  const at = order.map(([, m]) => appears(m));
  console.log(
    `  the twilight ladder, the sun's elevation at which each comes out overhead: ` +
      order.map(([name, m], i) => `${name} (${m.toFixed(1)}) ${at[i]!.toFixed(1)}`).join(', '),
  );
  if (!rises) fail('the twilight ladder is not monotonic: some star goes out as the sun sinks');
  for (let i = 1; i < at.length; i++) {
    if (!(at[i]! < at[i - 1]!)) fail(`${order[i]![0]} comes out no later than ${order[i - 1]![0]}`);
  }
  // Overhead and with no glare, which is the ladder alone: Venus low in the
  // west beside the sunset loses a magnitude or two more to the air and the
  // glare (`night-sky.ts`) and comes out a few minutes after the sun is down.
  if (!(at[0]! < 2 && at[0]! > -2)) fail(`Venus comes out with the sun at ${at[0]!.toFixed(1)}, not with the sunset`);
  if (!(at[1]! < -2 && at[1]! > -5)) fail(`Sirius comes out with the sun at ${at[1]!.toFixed(1)}, not in civil twilight`);
  if (!(at[3]! < -8 && at[3]! > -14)) fail(`a fifth-magnitude star comes out with the sun at ${at[3]!.toFixed(1)}, not in nautical twilight`);
}

/**
 * And the drawing, built headless: the catalogue decodes from the shipped
 * file, the points draw a prefix of it that is empty by day and whole at
 * night, and the menu holds them to its own limit and leaves the planets to
 * the orrery.
 */
{
  const bin = readFileSync(resolve(import.meta.dirname, '../../public/data/stars.bin'));
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, status: 200, arrayBuffer: async () => bin })) as unknown as typeof fetch;
  const catalogue = await loadStars();
  globalThis.fetch = realFetch;
  const scene = new Scene();
  const sky = createSky(scene, new Fog(0, 1, 2));
  const night = createNightSky(catalogue, sky);
  scene.add(night.points);
  sky.attach(night.update);
  const palma = unitAt(39.57, 2.65, new Vector3()).multiplyScalar(PLANET_RADIUS);
  const eye = palma.clone().multiplyScalar(1 + 2 / PLANET_RADIUS);
  const drawnAt = (iso: string): { drawn: number; limit: number; first: number } => {
    sky.setTime(iso);
    sky.setRate(0);
    sky.update(palma, eye, 15);
    return { drawn: night.stats.drawn, limit: night.stats.limit, first: night.points.geometry.drawRange.start };
  };
  const noon = drawnAt('2026-10-04T12:00:00Z');
  const dusk = drawnAt('2026-10-02T18:05:00Z');
  const midnight = drawnAt('2026-10-04T22:30:00Z');
  night.menu = true;
  const menu = drawnAt('2026-10-04T22:30:00Z');
  console.log(
    `  the drawing: ${catalogue.count} stars in the file; drawn at noon ${noon.drawn} (limit ${noon.limit}), ` +
      `at dusk ${dusk.drawn} (${dusk.limit}), at 22:30Z ${midnight.drawn} (${midnight.limit}), in the menu ${menu.drawn} (${menu.limit})`,
  );
  if (noon.drawn !== 0) fail(`${noon.drawn} stars are drawn at noon`);
  if (!(dusk.drawn > 5 && dusk.drawn < midnight.drawn)) fail(`the dusk sky draws ${dusk.drawn} stars against the night's ${midnight.drawn}`);
  if (midnight.drawn < 2000) fail(`a clear night at Palma draws only ${midnight.drawn} stars`);
  if (menu.limit > 5 || menu.first !== 5) fail(`the menu's sky has limit ${menu.limit} and starts at vertex ${menu.first}`);
  if (Math.abs(night.points.matrix.determinant() - 1) > 1e-9) fail('the stars are drawn through a matrix that is not a rotation');
  night.dispose();
}
