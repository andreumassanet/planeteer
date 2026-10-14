/** Words for numbers: sizes, day lengths, and where the other bodies are from Earth today. */
import type { OrreryBody } from '../orrery.ts';
import { AU_KM, type Body, geocentric, heliocentric, moonPosition } from '../system/index.ts';
import { DEG } from './constants.ts';

/** 3.2M, 410k, 900: a list of towns is not a census. */
export function compact(count: number): string {
  if (count >= 1e6) return `${(count / 1e6).toFixed(count >= 1e7 ? 0 : 1)}M`;
  if (count >= 1e3) return `${Math.round(count / 1e3)}k`;
  return String(Math.round(count));
}

export const ordinal = (n: number): string => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** A rotation period as a length of day: hours under two days, days past it. */
export function dayLength(hours: number): string {
  const abs = Math.abs(hours);
  let text: string;
  if (abs < 48) {
    const whole = Math.floor(abs);
    text = `${whole} h ${Math.round((abs - whole) * 60)} min`;
  } else {
    const days = abs / 24;
    text = `${days.toFixed(days < 100 ? 1 : 0)} days`;
  }
  return hours < 0 ? `${text}, backwards` : text;
}

export const yearLength = (days: number): string =>
  days < 700 ? `${Math.round(days)} days` : `${(days / 365.25).toFixed(1)} years`;

/** The speed of light in km/s. */
const LIGHT_KM_S = 299792.458;

/** Closer to the Sun than this in our sky, in degrees, a planet is lost in its glare. */
const GLARE = 12;

/** Further than this from the Sun, in degrees, a body rises as the Sun sets. */
const OPPOSED = 165;

/** A body as seen from Earth at one instant. */
interface Sighting {
  /** Real kilometres from Earth. */
  km: number;
  /** Degrees between it and the Sun in our sky; 0 for the Sun itself. */
  elongation: number;
  /** East of the Sun, which is the evening sky: it sets after the Sun does. */
  east: boolean;
}

/** Where a body is from Earth right now, from `system/orbits.ts`'s `geocentric`, the difference the night sky draws the planet by. */
export function sighting(body: Body, date: Date): Sighting {
  const earth = heliocentric('earth', date);
  if (body.kind === 'moon') {
    // Geocentric already: the Sun's ecliptic longitude seen from here is Earth's
    // heliocentric one turned round. Standish's own right-handed frame, never a
    // world vector, so not `sphere.ts`'s.
    const lunar = moonPosition(date);
    const sunLambda = Math.atan2(-earth.y, -earth.x);
    const lambda = lunar.lon * DEG;
    const beta = lunar.lat * DEG;
    const cos = Math.cos(beta) * Math.cos(lambda - sunLambda);
    return {
      km: lunar.distance,
      elongation: Math.acos(Math.max(-1, Math.min(1, cos))) / DEG,
      east: Math.sin(lambda - sunLambda) > 0,
    };
  }
  if (body.orbit === null) return { km: earth.r * AU_KM, elongation: 0, east: false };
  const seen = geocentric(body.orbit, date);
  return { km: seen.distance * AU_KM, elongation: seen.elongation, east: seen.east };
}

/** 41.2 million km, 225 million km, 4.35 billion km. */
export function distanceText(value: number): string {
  // The Moon: a distance anyone can say in one breath.
  if (value < 1e6) return `${(Math.round(value / 100) * 100).toLocaleString('en')} km`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} billion km`;
  return `${(value / 1e6).toFixed(value >= 1e8 ? 0 : 1)} million km`;
}

/** How long its light takes to get here: 8.3 min, 12 min, 4.1 h. */
export function lightText(value: number, unit: 'min' | 'light-min' = 'min'): string {
  const minutes = value / LIGHT_KM_S / 60;
  const hours = unit === 'min' ? 'h' : 'light-h';
  if (minutes < 1) return `${(minutes * 60).toFixed(1)} ${unit === 'min' ? 's' : 'light-s'}`;
  if (minutes < 60) return `${minutes.toFixed(minutes < 10 ? 1 : 0)} ${unit}`;
  return `${(minutes / 60).toFixed(1)} ${hours}`;
}

/** Where to look tonight, without naming a constellation. */
export function skyText(seen: Sighting): string {
  if (seen.elongation < GLARE) return 'Too close to the Sun to see right now';
  if (seen.elongation > OPPOSED) return 'Opposite the Sun: up all night';
  return `In the ${seen.east ? 'evening' : 'morning'} sky, ${Math.round(seen.elongation)}° from the Sun`;
}

export function kindOf(entry: OrreryBody): string {
  const body = entry.body;
  if (body.kind === 'star') return 'Star';
  if (body.kind === 'rocky') return 'Rocky planet';
  if (body.kind === 'moon') return 'Moon';
  // The radius separates hydrogen giants from ice giants.
  return body.radiusKm > 40000 ? 'Gas giant' : 'Ice giant';
}

export const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
