/**
 * Uranus's sky: its five major moons and its rings, for `SkySpec.moons` and
 * `SkySpec.layers`.
 *
 * **The moons** go round the equator, which is to say round the sky's
 * strange pole: from Highsun they circle like the Sun does. Radii, distances,
 * periods and inclinations (to Uranus's equator) are JPL's; they orbit in the
 * sense Uranus turns, backwards about the IAU pole, which the engine reads
 * off the sign of `rotationHours`. Ariel is the largest from the deck, 0.40
 * degrees across overhead, then Umbriel 0.28, Miranda 0.26, Titania 0.22 and
 * Oberon 0.16. Umbriel is the dark one. The epochs are not the almanac's.
 *
 * **The rings** are thirteen dark threads, and the ten narrow ones found by
 * stellar occultation are here, km from the centre with their widths and
 * normal optical depths (French et al., 1991; Esposito, 2002): the particles
 * are metre-sized and black as charcoal, an albedo of a few percent, and
 * nearly opaque where they are — so from the deck they are a dark line across
 * the sky, the Epsilon ring a few pixels wide and the rest hairlines, at 1.65
 * to 2.02 radii. The dusty Zeta ring inside them and the faint Nu and Mu
 * rings outside are not drawn.
 */

import { PALETTE } from '../../../theme.ts';
import { URANUS } from '../../../system/bodies/uranus.ts';
import type { SkyMoon } from '../../contract.ts';
import { thinRings } from '../../rings.ts';
import type { ThinRing } from '../../rings.ts';

export const URANUS_MOONS: readonly SkyMoon[] = [
  { name: 'Miranda', radiusKm: 235.8, distanceKm: 129390, period: 1.413479, inclination: 4.23, epoch: 75, color: PALETTE.bone },
  { name: 'Ariel', radiusKm: 578.9, distanceKm: 191020, period: 2.520379, inclination: 0.26, epoch: 200, color: PALETTE.white },
  { name: 'Umbriel', radiusKm: 584.7, distanceKm: 266300, period: 4.144177, inclination: 0.21, epoch: 320, color: PALETTE.steel },
  { name: 'Titania', radiusKm: 788.9, distanceKm: 435910, period: 8.705872, inclination: 0.34, epoch: 15, color: PALETTE.bone },
  { name: 'Oberon', radiusKm: 761.4, distanceKm: 583520, period: 13.463239, inclination: 0.06, epoch: 140, color: PALETTE.tan },
];

/** Radius of the centre line, km; width, km; normal optical depth. */
const ring = (name: string, radius: number, width: number, tau: number, dusty = 0): ThinRing => ({
  name,
  inner: radius - width / 2,
  outer: radius + width / 2,
  tau,
  color: dusty > 0 ? PALETTE.slate : PALETTE.steel,
  dusty,
});

export const URANUS_RINGS: readonly ThinRing[] = [
  ring('6', 41837, 1.5, 0.3),
  ring('5', 42234, 2.4, 0.5),
  ring('4', 42571, 2, 0.3),
  ring('Alpha', 44718, 7, 0.4),
  ring('Beta', 45661, 8, 0.2),
  ring('Eta', 47176, 1.6, 0.2),
  ring('Gamma', 47627, 3, 1.5),
  ring('Delta', 48300, 5, 0.5),
  ring('Lambda', 50024, 2, 0.1, 0.8),
  // Wider at apoapsis (96 km) than at periapsis (20): the mean.
  ring('Epsilon', 51149, 58, 1.2),
];

/** The rings as a sky layer, for the air the spec gives the sky. */
export const uranusRings = (air: number) => thinRings({ rings: URANUS_RINGS, radiusKm: URANUS.radiusKm, air });
