/**
 * The four Galilean moons in Jupiter's sky, for `SkySpec.moons`.
 *
 * Radii, distances and periods are JPL's; inclinations are to Jupiter's
 * equator. The epochs are Meeus's mean longitudes at J2000 (Astronomical
 * Algorithms, ch. 44), less 157.8 degrees, the ecliptic longitude of Jupiter's
 * equinox (`poleOf`), so the moons stand where they really stand, to a few
 * degrees. The periods are Meeus's rates turned round, so the two agree.
 */

import { PALETTE } from '../../../theme.ts';
import type { SkyMoon } from '../../contract.ts';

export const GALILEANS: readonly SkyMoon[] = [
  { name: 'Io', radiusKm: 1821.6, distanceKm: 421700, period: 360 / 203.48895579, inclination: 0.05, epoch: 308.27, color: PALETTE.gold },
  { name: 'Europa', radiusKm: 1560.8, distanceKm: 671034, period: 360 / 101.374724735, inclination: 0.47, epoch: 17.92, color: PALETTE.cream },
  { name: 'Ganymede', radiusKm: 2634.1, distanceKm: 1070412, period: 360 / 50.317609207, inclination: 0.2, epoch: 322.75, color: PALETTE.tan },
  { name: 'Callisto', radiusKm: 2410.3, distanceKm: 1882709, period: 360 / 21.571071177, inclination: 0.19, epoch: 286.63, color: PALETTE.brown },
];
