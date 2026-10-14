import { PLANET_RADIUS } from '../globe.ts';
import { SCENERY_SCALE } from '../stature.ts';
import { clearHazeAt } from '../view.ts';

/**
 * The render-distance setting as a distance a walker reads: where the haze
 * closes on foot in clear air (`clearHazeAt`), in metres at the scale
 * buildings are made to (`SCENERY_SCALE`), not the planet's map scale.
 */
export function renderDistanceWords(value: number): string {
  const metres = clearHazeAt(value, PLANET_RADIUS) / SCENERY_SCALE;
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}
