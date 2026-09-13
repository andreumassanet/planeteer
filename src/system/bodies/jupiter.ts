/**
 * Jupiter, as a row and nothing more.
 *
 * **It is here so the menu can draw the solar system whole**, which a system of
 * six bodies with a hole between Mars and Neptune is not. What that asks of a
 * body is exactly what `index.ts` says a menu reads — a name, a kind, a blurb,
 * a look and a radius — and the orbit, which `orbits.ts` already carried for
 * all eight planets. So the file is the Sun's shape: `ground`, `nations` and
 * `species` empty, and `walkable` answers false from the data rather than from
 * a list somebody has to keep.
 *
 * The physical numbers are NASA's planetary fact sheet: the volumetric mean
 * radius, the System III rotation, the obliquity to the orbit and the
 * equatorial gravity at the one-bar level.
 */

import { PALETTE } from '../../theme.ts';
import type { Body } from '../contract.ts';

export const JUPITER: Body = {
  id: 'jupiter',
  name: 'Jupiter',
  kind: 'giant',
  orbit: 'jupiter',
  radiusKm: 69911,
  rotationHours: 9.925,
  tiltDeg: 3.13,
  gravity: 24.79,
  blurb:
    'Eleven Earths across and more than twice the mass of every other planet put together. ' +
    'The Great Red Spot is a storm wider than Earth, and it has been blowing for at least two centuries.',
  look: {
    surface: PALETTE.sand,
    highland: PALETTE.salmon,
    lowland: PALETTE.brown,
    cap: PALETTE.cream,
    sky: PALETTE.apricot,
  },
  ground: null,
  nations: [],
  settlements: [],
  species: null,
};
