/**
 * Phobos and Deimos in the Martian sky, for `SkySpec.moons`.
 *
 * Radii, distances, periods and inclinations (to Mars's equator) are JPL's.
 * Phobos goes round in seven hours and a half, faster than Mars turns, so it
 * rises in the **west** and crosses the sky in about four hours; it is 0.21
 * degrees across overhead, a third of the Moon from Earth, and it is so close
 * that it never clears the horizon past 70 degrees of latitude — none of
 * which is a rule here, all of it falls out of where it is. Deimos, slower
 * than the sky, rises in the east and takes two and a half days to set: a
 * bright star, too small for a disc. The epochs are not the almanac's.
 */

import { PALETTE } from '../../../theme.ts';
import type { SkyMoon } from '../../contract.ts';

export const MARS_MOONS: readonly SkyMoon[] = [
  { name: 'Phobos', radiusKm: 11.08, distanceKm: 9376, period: 0.31891023, inclination: 1.09, epoch: 120, color: PALETTE.tan },
  { name: 'Deimos', radiusKm: 6.2, distanceKm: 23463.2, period: 1.263, inclination: 0.93, epoch: 300, color: PALETTE.bone },
];
