/** How big each body is drawn and how far out its ring is. */
import { type Body, EARTH_RADIUS_KM } from '../system/index.ts';
import { R, RING_GAP, RINGS_A, SIZE_POWER, SUN_RADII } from './constants.ts';

/** How big a body is drawn, in world units. Earth is exactly the planet. */
export function drawnRadius(body: Body): number {
  if (body.kind === 'star') return SUN_RADII * R;
  if (body.id === 'earth') return R;
  return R * (body.radiusKm / EARTH_RADIUS_KM) ** SIZE_POWER;
}

/** The planet and everything it carries, as a radius: Saturn's is its rings. */
export const extentOf = (body: Body): number => drawnRadius(body) * (body.id === 'saturn' ? RINGS_A[1] : 1);

/** The rings, innermost first: each is as far out from the last as the two planets on them need to clear each other by `RING_GAP`, whatever longitude either is at. */
export function ringsFor(planets: readonly Body[]): Map<string, number> {
  const rings = new Map<string, number>();
  let previousRing = 0;
  let previousExtent = SUN_RADII * R;
  for (const planet of planets) {
    const extent = extentOf(planet);
    const ring = previousRing + previousExtent + extent + RING_GAP * R;
    rings.set(planet.id, ring);
    previousRing = ring;
    previousExtent = extent;
  }
  return rings;
}
