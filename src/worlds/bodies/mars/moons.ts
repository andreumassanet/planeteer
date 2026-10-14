/**
 * Phobos and Deimos in the Martian sky, for `SkySpec.moons`.
 *
 * Radii, distances, periods and inclinations (to Mars's equator) are JPL's.
 * Phobos goes round in seven and a half hours, faster than Mars turns, so it
 * rises in the west and never clears the horizon past 70 degrees of latitude;
 * that falls out of where it is. Deimos, slower than the sky, rises in the east
 * and takes two and a half days to set. The epochs are not the almanac's.
 */

import { PALETTE } from '../../../theme.ts';
import type { SkyMoon } from '../../contract.ts';

export const MARS_MOONS: readonly SkyMoon[] = [
  { name: 'Phobos', radiusKm: 11.08, distanceKm: 9376, period: 0.31891023, inclination: 1.09, epoch: 120, color: PALETTE.tan },
  { name: 'Deimos', radiusKm: 6.2, distanceKm: 23463.2, period: 1.263, inclination: 0.93, epoch: 300, color: PALETTE.bone },
];
