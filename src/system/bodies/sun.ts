/**
 * The Sun, and the honest answer to "have you made it physical yet".
 *
 * Until now: no. `src/sun.ts` computes the real subsolar point from a UTC
 * timestamp — declination, equation of time, hour angle, verified against the
 * real sunset in Mallorca to about half an hour — and then hangs a **1.1-degree
 * disc five radii out** and calls it the sun. There is real astronomy behind the
 * light and no body you could fly to. That is the starting point and this row is
 * the change: the Sun is a `Body` with a radius, a rotation and a place, and
 * the place is the origin because everything else's place is measured from it.
 *
 * **It is the one body whose drawn size breaks the law**, and `contract.ts`
 * carries the arithmetic: 109 Earth radii against a Mercury perihelion of 66
 * solar radii, so any exaggeration that makes Earth a shape puts the Sun over
 * Mercury's orbit. Drawn 4.6 times Earth instead of 109, and Mercury passes it
 * with 1.25 solar radii of daylight.
 *
 * Nothing stands on it. `ground`, `nations` and `species` are all empty and
 * that is not an omission to be filled in later — a photosphere is a plasma at
 * 5,772 K and inventing a country on it would be the one piece of this
 * directory that no rule could check.
 */

import { PALETTE } from '../../theme.ts';
import type { Body } from '../contract.ts';

export const SUN: Body = {
  id: 'sun',
  name: 'The Sun',
  kind: 'star',
  orbit: null,
  radiusKm: 696000,
  // 25.38 days at the equator, and it is not one number: the poles take 34.
  // A fluid body has no single rotation period, which is the first fact that
  // makes a star not a planet.
  rotationHours: 609.12,
  tiltDeg: 7.25,
  gravity: 274,
  blurb:
    'Three quarters of a million kilometres across and a third of a million times the mass of Earth. ' +
    'Everything else here is a rounding error orbiting it.',
  look: {
    surface: PALETTE.gold,
    highland: PALETTE.orange,
    lowland: PALETTE.apricot,
    cap: PALETTE.cream,
    sky: PALETTE.white,
  },
  ground: null,
  nations: [],
  settlements: [],
  species: null,
};
