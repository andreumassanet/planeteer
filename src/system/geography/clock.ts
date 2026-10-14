import { Quaternion, Vector3 } from 'three';
import { lonOf, unitAt } from '../../sphere.ts';
import type { Body } from '../contract.ts';
import { eclipticToWorld, poleOf } from '../contract.ts';
import { heliocentric, moonMeanLongitude, periodOf } from '../orbits.ts';

const DEG = Math.PI / 180;


const J2000_MS = Date.UTC(2000, 0, 1, 12);
const Y = new Vector3(0, 1, 0);

/**
 * Local solar time at a longitude, 0 to 24: the hour the walking engine's sky
 * (`worlds/sky.ts`) shows there at `date` before anyone has turned its clock.
 *
 * The same construction, step for step, so the menu's clock and the sky
 * agree: the body's pole turned onto +y, its spin about it — from the date on
 * a turning world, from where Earth is on a locked one — and the hour the
 * angle round the pole between the observer's meridian and the Sun's, read
 * the other way on a world that turns backwards.
 */
export function localHour(body: Body, lon: number, date: Date): number {
  const pole = poleOf(body);
  const P = new Vector3(pole.x, pole.y, pole.z).normalize();
  const align = new Quaternion().setFromUnitVectors(P, Y);
  let turn: number;
  if (body.locked === true) {
    const toward = unitAt(0, moonMeanLongitude(date) + 180, new Vector3()).applyQuaternion(align);
    turn = lonOf(toward.x, toward.z) * DEG;
  } else {
    const hours = (date.getTime() - J2000_MS) / 3600000;
    turn = (2 * Math.PI * hours) / body.rotationHours;
  }
  const spin = new Quaternion().setFromAxisAngle(Y, -turn);
  const celestial = spin.multiply(align);
  const here = eclipticToWorld(heliocentric(body.orbit ?? 'earth', date));
  const sun = new Vector3(-here.x, -here.y, -here.z).normalize().applyQuaternion(celestial);
  const sense = Math.sign(body.rotationHours) || 1;
  let angle = lon - lonOf(sun.x, sun.z);
  angle = ((angle + 540) % 360) - 180;
  return (((12 + (sense * angle) / 15) % 24) + 24) % 24;
}

/** How long a solar day is on a body, Earth hours: its turn against the Sun's. */
export function solarDayHours(body: Body): number {
  return Math.abs(1 / (1 / body.rotationHours - 1 / (periodOf(body.orbit ?? 'earth') * 24)));
}
