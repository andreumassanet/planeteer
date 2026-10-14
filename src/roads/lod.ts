import { PLANET_RADIUS } from '../globe.ts';
import { detailReach, fogFar, horizonAt } from '../view.ts';
import { ROAD_CLASSES } from './classes.ts';

/** The streamer's level of detail: span length and width by distance band, and how far each class is drawn. */

/** How much narrower a road is drawn in each distance band, so it thins before its class reach culls it. */
export const BAND_WIDTH = [1, 0.8, 0.62];

/**
 * Longest piece of road drawn as one quad, by distance from the eye. Near the
 * camera a span must be short enough to follow the relief's finest octave
 * without the ground cutting through the chord; far off the sag is under a
 * pixel. A tile whose band changes is rebuilt.
 */
export const SPANS: readonly { until: number; span: number }[] = [
  { until: 2600, span: 18 },
  { until: 9000, span: 150 },
  { until: Infinity, span: 520 },
];

export function bandFor(distance: number): number {
  for (let i = 0; i < SPANS.length; i++) if (distance < SPANS[i]!.until) return i;
  return SPANS.length - 1;
}

/**
 * How far each class is drawn now: the table times the detail knob. Not
 * floored at the haze, which follows the camera's altitude and would admit
 * every road within it from the air.
 */
export function classReaches(into: number[]): number[] {
  for (let i = 0; i < ROAD_CLASSES.length; i++) into[i] = detailReach(ROAD_CLASSES[i]!.reach);
  return into;
}

/**
 * How far along the ground a road is worth drawing before its class has its
 * say: twice the horizon, as `settlements.ts` uses. The class reach binds for
 * everything but a trunk.
 */
export function reachFor(altitude: number): number {
  return Math.min(fogFar(altitude, PLANET_RADIUS) * 1.1, detailReach(Math.min(34000, Math.max(2600, horizonAt(altitude, PLANET_RADIUS) * 2))));
}
