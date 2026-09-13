/**
 * Saturn, as a row and nothing more — see `jupiter.ts` for why the giants
 * arrived as rows before anything stands on them.
 *
 * The rings are not a field here, because nothing in `Body` is a ring and the
 * menu is the only thing that draws one: it keys them off this id. The numbers
 * are NASA's planetary fact sheet.
 */

import { PALETTE } from '../../theme.ts';
import type { Body } from '../contract.ts';

export const SATURN: Body = {
  id: 'saturn',
  name: 'Saturn',
  kind: 'giant',
  orbit: 'saturn',
  radiusKm: 58232,
  rotationHours: 10.656,
  tiltDeg: 26.73,
  gravity: 10.44,
  blurb:
    'Light enough that it would float, if you could find a bath big enough. ' +
    'The rings are 270,000 kilometres across and in most places about as thick as a house.',
  look: {
    surface: PALETTE.sand,
    highland: PALETTE.gold,
    lowland: PALETTE.tan,
    cap: PALETTE.cream,
    sky: PALETTE.blush,
  },
  ground: null,
  nations: [],
  settlements: [],
  species: null,
};
