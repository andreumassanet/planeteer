/**
 * Titan and Rhea in Saturn's sky, for `SkySpec.moons`.
 *
 * Radii, distances, periods and inclinations (to Saturn's equator) are
 * JPL's. Titan is 0.25 degrees across from the deck, half the Moon from
 * Earth and orange with its haze; Rhea, nearer and smaller, 0.19 and grey
 * ice. Both go round in the ring plane, so from the deck they keep to the
 * line the arch of the rings tends to, beyond its outer edge. The epochs are not the almanac's:
 * a fixed place at J2000, the same for every visitor.
 */

import { PALETTE } from '../../../theme.ts';
import type { SkyMoon } from '../../contract.ts';

export const SATURN_MOONS: readonly SkyMoon[] = [
  { name: 'Titan', radiusKm: 2574.7, distanceKm: 1221870, period: 15.945421, inclination: 0.35, epoch: 40, color: PALETTE.apricot },
  { name: 'Rhea', radiusKm: 763.8, distanceKm: 527108, period: 4.518212, inclination: 0.35, epoch: 210, color: PALETTE.bone },
];
