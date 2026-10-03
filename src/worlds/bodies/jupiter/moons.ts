/**
 * The four Galilean moons in Jupiter's sky, for `SkySpec.moons`.
 *
 * Radii, distances and periods are JPL's; the inclinations are to Jupiter's
 * equator. The epochs are Meeus's mean longitudes at J2000 (*Astronomical
 * Algorithms*, ch. 44), less 157.8 degrees, the ecliptic longitude of
 * Jupiter's equinox (`poleOf`), so Io, Europa, Ganymede and Callisto stand
 * where they really stand, to a few degrees, on any date. The periods are
 * Meeus's rates turned round, so the two agree.
 *
 * From the cloud tops Io is 0.59 degrees across overhead and 0.50 on the
 * horizon — a little larger than the Moon from Earth — Europa 0.31 and 0.27,
 * Ganymede 0.31 and 0.28, Callisto 0.15: four moons, three of them the
 * Moon's size, going round faster than the sky turns under them, with
 * phases.
 */

import { PALETTE } from '../../../theme.ts';
import type { SkyMoon } from '../../contract.ts';

export const GALILEANS: readonly SkyMoon[] = [
  { name: 'Io', radiusKm: 1821.6, distanceKm: 421700, period: 360 / 203.48895579, inclination: 0.05, epoch: 308.27, color: PALETTE.gold },
  { name: 'Europa', radiusKm: 1560.8, distanceKm: 671034, period: 360 / 101.374724735, inclination: 0.47, epoch: 17.92, color: PALETTE.cream },
  { name: 'Ganymede', radiusKm: 2634.1, distanceKm: 1070412, period: 360 / 50.317609207, inclination: 0.2, epoch: 322.75, color: PALETTE.tan },
  { name: 'Callisto', radiusKm: 2410.3, distanceKm: 1882709, period: 360 / 21.571071177, inclination: 0.19, epoch: 286.63, color: PALETTE.brown },
];
