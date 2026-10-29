/** A line worth knowing, said while the world builds behind the arrival's curtain. */
import { labelOf } from '../controls.ts';

const TIPS: (() => string)[] = [
  () => `${labelOf('map')} opens the whole planet; click anywhere on it to set a marker.`,
  () => `${labelOf('passport')} opens your passport: every country you come down in is stamped.`,
  () => `${labelOf('use')} gets into whatever is parked near you, from a bicycle to a plane.`,
  () => `${labelOf('view')} looks through your own eyes.`,
  () => 'Planes take off from the strips outside the big cities. Climb high to cross an ocean.',
  () => 'The gold rings over every landmark are yours to collect.',
  () => 'Rockets stand on pads beside some airstrips: they go to the rest of the solar system.',
  () => `${labelOf('hud')} hides everything on the screen, for a clean view.`,
];

/** One of them, a different one each time. */
export function tipOfTheDay(): string {
  return TIPS[Math.floor(Math.random() * TIPS.length)]!();
}
