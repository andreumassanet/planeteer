/**
 * Where everything celestial is.
 *
 * One rotation carries the whole sky. Everything is placed in the inertial
 * frame (the world frame of `system/contract.ts`'s `eclipticToWorld`, y at the
 * ecliptic's north) and hung in one group whose rotation is the body's own:
 * the turn that carries its pole (`poleOf`, the IAU's J2000) onto +y, then its
 * spin about that pole, `-theta` for a turn of `theta`. The sun, stars and
 * planets therefore rise and set together, a retrograde world turns the other
 * way without a special case, and the sun's height over the horizon (day and
 * night, and the seasons) is read off the same rotation.
 *
 * The moons go round the planet's equator, not the ecliptic, and are near
 * enough for where the traveller stands to move them, so each is placed per
 * frame in the body-fixed frame, from its orbit. So is Earth from the Moon.
 *
 * A locked world (the Moon) turns once an orbit: its spin is its mean longitude
 * round Earth, and its clock moves the date, not the spin.
 */

import * as THREE from 'three';
import { eclipticToWorld } from '../../system/contract.ts';
import { heliocentric, moonMeanLongitude, moonPosition } from '../../system/orbits.ts';
import { lonOf, unitAt } from '../../sphere.ts';
import { DEG } from './build.ts';
import type { SkyParts } from './build.ts';

/** The Sun's angular radius from 1 au, degrees. */
const SUN_RADIUS_DEG = 0.2666;
/** The smallest the disc is drawn, degrees: under it a far sun is a point you cannot find. */
const SUN_MIN_DEG = 0.12;
/**
 * The smallest a moon's disc is drawn, radius in degrees: a pixel or two, so
 * Deimos (0.018) is the bright star it is from Mars rather than nothing.
 */
const MOON_MIN_DEG = 0.035;
/** J2000.0, the instant the orbits and the moons' epochs are measured from. */
const J2000_MS = Date.UTC(2000, 0, 1, 12);
/** The planets crawl across the sky over days, so they are moved this often, ms of the sky's clock. */
const PLANETS_EVERY_MS = 20 * 60000;

const Y = new THREE.Vector3(0, 1, 0);
/** A circle's face, and the way back to the eye from a point on the dome. */
const FACING = new THREE.Vector3(0, 0, 1);
const inward = new THREE.Vector3();
const scratch = new THREE.Vector3();
const across = new THREE.Vector3();
const local = new THREE.Quaternion();
const observer = new THREE.Vector3();

/** Where the body is, au, in the world frame. The Moon rides with Earth. */
function bodyAt(parts: SkyParts, date: Date): THREE.Vector3 {
  const orbit = parts.spec.body.orbit ?? 'earth';
  const h = heliocentric(orbit, date);
  const v = eclipticToWorld(h);
  return new THREE.Vector3(v.x, v.y, v.z);
}

/** The body's turn at `date`, radians: the angle `spin` turns the aligned frame back by. */
function turnAt(parts: SkyParts, date: Date): number {
  if (parts.locked) {
    // The prime meridian faces the mean Earth: the Moon's mean longitude
    // turned round, in the ecliptic, seen in the aligned frame.
    unitAt(0, moonMeanLongitude(date) + 180, scratch).applyQuaternion(parts.align);
    return lonOf(scratch.x, scratch.z) * DEG;
  }
  const hours = (date.getTime() - J2000_MS) / 3600000 + parts.offset;
  return (2 * Math.PI * hours) / parts.spec.body.rotationHours;
}

/** The inertial direction of the Sun, written by `place` and read by `update`. */
export const sunInertial = new THREE.Vector3();

/** Moves the sun, the planets and the moons' centres to `date`. */
export function place(parts: SkyParts, date: Date): void {
  const { state, spin, celestial, sunDisc, halo, others, planetPositions, planetGeometry, satellites } = parts;
  const body = parts.spec.body;
  const here = bodyAt(parts, date);
  state.au = here.length();
  sunInertial.copy(here).multiplyScalar(-1).normalize();
  parts.turn = turnAt(parts, date);
  spin.setFromAxisAngle(Y, -parts.turn);
  celestial.quaternion.copy(spin).multiply(parts.align);

  const discDeg = Math.max(SUN_MIN_DEG, SUN_RADIUS_DEG / state.au);
  sunDisc.position.copy(sunInertial).multiplyScalar(0.95);
  sunDisc.scale.setScalar(Math.tan(discDeg * DEG) * 0.95);
  // Facing the eye, which is this group's origin: `lookAt` would aim in
  // world space, at the planet's centre.
  sunDisc.quaternion.setFromUnitVectors(FACING, inward.copy(sunInertial).negate());
  halo.position.copy(sunDisc.position);
  halo.scale.setScalar(Math.tan(Math.max(discDeg * 9, 1.6) * DEG) * 0.95);

  // The planets, from here; their colours, which never change, were laid once.
  if (!(Math.abs(date.getTime() - parts.planetsAt) < PLANETS_EVERY_MS)) {
    parts.planetsAt = date.getTime();
    others.forEach((id, k) => {
      const h = heliocentric(id, date);
      const w = eclipticToWorld(h);
      const v = scratch.set(w.x, w.y, w.z).sub(here).normalize();
      planetPositions[k * 3] = v.x * 0.96;
      planetPositions[k * 3 + 1] = v.y * 0.96;
      planetPositions[k * 3 + 2] = v.z * 0.96;
    });
    planetGeometry.getAttribute('position').needsUpdate = true;
  }

  // The moons' centres, km from the planet's, body-fixed.
  const days = (date.getTime() - J2000_MS) / 86400000;
  const sense = Math.sign(body.rotationHours) || 1;
  for (const one of satellites) {
    const moon = one.moon;
    if (moon === null) {
      // Earth, from the Moon: the Moon's own geocentric place turned round.
      // Ecliptic latitude and longitude are the world's (`eclipticToWorld`
      // keeps longitude), so `unitAt` is the ecliptic direction too.
      const lunar = moonPosition(date);
      unitAt(lunar.lat, lunar.lon, one.at).negate().applyQuaternion(celestial.quaternion).multiplyScalar(lunar.distance);
      continue;
    }
    const ascending = parts.equinox / DEG + (moon.node ?? 0);
    const u = moon.epoch + ((moon.retrograde === true ? -sense : sense) * 360 * days) / moon.period;
    const w = (u - (moon.node ?? 0)) * DEG;
    const i = moon.inclination * DEG;
    // The node's direction in the equator, the direction a quarter turn on
    // from it tipped up out of the equator by the inclination, and the orbit
    // between the two.
    unitAt(0, ascending, scratch);
    across.crossVectors(Y, scratch).multiplyScalar(Math.cos(i)).addScaledVector(Y, Math.sin(i));
    one.at.copy(scratch).multiplyScalar(Math.cos(w)).addScaledVector(across, Math.sin(w));
    one.at.applyQuaternion(spin).multiplyScalar(moon.distanceKm);
  }
}

/** The moons as the traveller at `position` sees them: direction, size and phase, and their discs drawn. */
export function updateMoons(parts: SkyParts, position: THREE.Vector3): void {
  const { state, satellites, views } = parts;
  const sky = parts.spec.sky;
  observer.copy(position).multiplyScalar(parts.spec.body.radiusKm / parts.radius);
  const moonOpacity = 1 - 0.55 * sky.air * state.day;
  const dark = 1 - Math.min(1, sky.air * state.day * 1.5);
  satellites.forEach((one, k) => {
    const view = views[k]!;
    const rel = scratch.copy(one.at).sub(observer);
    const distance = rel.length();
    view.direction.copy(rel).divideScalar(distance);
    view.radiusDeg = Math.asin(Math.min(1, one.radiusKm / distance)) / DEG;
    view.lit = (1 - view.direction.dot(state.sun)) / 2;
    const mesh = one.disc.mesh;
    const drawn = Math.max(MOON_MIN_DEG, view.radiusDeg);
    mesh.position.copy(view.direction).multiplyScalar(0.93);
    mesh.scale.setScalar(Math.tan(drawn * DEG) * 0.93);
    mesh.quaternion.setFromUnitVectors(FACING, inward.copy(view.direction).negate());
    local.copy(mesh.quaternion).invert();
    one.disc.uniforms.uSun.value.copy(state.sun).applyQuaternion(local);
    one.disc.uniforms.uOpacity.value = moonOpacity;
    one.disc.uniforms.uDark.value = dark;
  });
}
