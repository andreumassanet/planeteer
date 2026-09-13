/**
 * Uranus, as a row and nothing more — see `jupiter.ts`.
 *
 * The rotation is negative because the planet turns retrograde, which is the
 * convention `venus.ts` already uses; the obliquity of 97.77 degrees is the
 * same fact from the other side, and it is the one a menu card should lead
 * with. The numbers are NASA's planetary fact sheet.
 */

import { PALETTE } from '../../theme.ts';
import type { Body } from '../contract.ts';

export const URANUS: Body = {
  id: 'uranus',
  name: 'Uranus',
  kind: 'giant',
  orbit: 'uranus',
  radiusKm: 25362,
  rotationHours: -17.24,
  tiltDeg: 97.77,
  gravity: 8.69,
  blurb:
    'Knocked onto its side in its youth, so each pole gets forty-two years of daylight and then forty-two of night. ' +
    'Methane in the air makes it the colour of a swimming pool.',
  look: {
    // Neptune is the same blue with dark bands in it; Uranus is famously the
    // featureless one, so its bands are the two palest entries the palette has.
    surface: PALETTE.skyBlue,
    highland: PALETTE.cream,
    lowland: PALETTE.bone,
    cap: PALETTE.cream,
    sky: PALETTE.skyBlue,
  },
  ground: null,
  nations: [],
  settlements: [],
  species: null,
};
