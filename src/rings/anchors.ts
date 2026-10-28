/**
 * Which towns fly a sky course: one a country, and only a country of
 * `COURSE_MIN_AREA` or more. The course is laid round its capital where the
 * capital is built, else round its most populous built town. Pure, so the
 * check finds the same anchors the game does.
 */
import { isShown } from '../places.ts';
import type { Place } from '../places.ts';

/**
 * The smallest country with a course, square kilometres: Croatia and Costa
 * Rica (about 56,000 and 51,000) are under it, Ireland and Austria (70,000
 * and 84,000) over.
 */
export const COURSE_MIN_AREA = 60_000;

const EARTH_KM = 6371;
const DEG = Math.PI / 180;

/** A ring of `[lon, lat]` pairs' area on the sphere, km², by the trapezoids under each edge (unsigned). */
export function ringArea(ring: readonly (readonly number[])[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon0, lat0] = ring[i]!;
    const [lon1, lat1] = ring[(i + 1) % ring.length]!;
    let dLon = lon1! - lon0!;
    if (dLon > 180) dLon -= 360;
    else if (dLon < -180) dLon += 360;
    sum += dLon * DEG * (Math.sin(lat0! * DEG) + Math.sin(lat1! * DEG));
  }
  return Math.abs((sum * EARTH_KM * EARTH_KM) / 2);
}

/** A country's land area, km²: its rings' areas summed. */
export function countryArea(country: { rings: readonly (readonly (readonly number[])[])[] }): number {
  let area = 0;
  for (const ring of country.rings) area += ringArea(ring);
  return area;
}

/**
 * The anchor of every country with a course, as an index into `places`: its
 * built capital, else its most populous built town. A country with no built
 * town has none.
 */
export function courseAnchors(
  places: readonly Place[],
  countries: readonly { iso: string; rings: readonly (readonly (readonly number[])[])[] }[],
  shown: (place: Place) => boolean = isShown,
): number[] {
  const big = new Set(countries.filter((c) => countryArea(c) >= COURSE_MIN_AREA).map((c) => c.iso));
  const best = new Map<string, number>();
  const rank = (place: Place): number => (place.capital === true ? 1e12 : 0) + place.pop;
  places.forEach((place, index) => {
    if (!big.has(place.iso) || !shown(place)) return;
    const held = best.get(place.iso);
    if (held === undefined || rank(place) > rank(places[held]!)) best.set(place.iso, index);
  });
  return [...best.values()].sort((a, b) => a - b);
}
