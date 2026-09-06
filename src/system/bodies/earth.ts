/**
 * Earth, as a row of the registry and nothing more.
 *
 * **Every field that another body invents, this one delegates**, and that is
 * the whole design of this file. `ground` is `null` because `src/biome.ts` is
 * the one definition of what Terran ground is made of and a second one here
 * would be the duplication this repo names more often than any other fault.
 * `nations` is empty because `public/data/countries.bin` holds 97,280
 * coordinates of real cartography and `geo.ts`'s `countryAt` is exact over
 * them; a spherical cap standing in for Spain would be a worse answer to a
 * question already answered. `settlements` is empty because `places.bin` holds
 * 23,867 real towns. `species` is `null` because the species here is us, and
 * `scenery/people.ts` builds it.
 *
 * What this row *is* for is the menu and the orrery: Earth has to be listed
 * beside the others, drawn on its own true orbit, and pickable — and for that
 * it needs an id, a name, a radius, a colour and an orbit key. It has those and
 * it deliberately has nothing else.
 *
 * The one number worth stating here rather than deriving it again: **Earth's
 * `radiusKm` and `globe.ts`'s `PLANET_RADIUS` are the same fact**, and
 * `KM_PER_UNIT` in the contract is their ratio. `scripts/check-system.ts`
 * asserts that `surfaceRadiusOf(6371)` comes back as exactly 16,000, so this
 * row cannot drift from the planet everyone is standing on.
 */

import { PALETTE } from '../../theme.ts';
import type { Body } from '../contract.ts';

export const EARTH: Body = {
  id: 'earth',
  name: 'Earth',
  kind: 'rocky',
  orbit: 'earth',
  radiusKm: 6371,
  // Sidereal, not solar: 23h 56m 4s. The four minutes are the orbit, and they
  // are the same four minutes `sun.ts`'s equation of time is a refinement of.
  rotationHours: 23.9345,
  tiltDeg: 23.44,
  gravity: 9.807,
  blurb:
    'The one with the outlines, the 23,867 towns, the roads between them and the weather over them. ' +
    'Seven tenths water, which no other body here has any of.',
  look: {
    surface: PALETTE.green,
    highland: PALETTE.tan,
    lowland: PALETTE.darkOlive,
    cap: PALETTE.white,
    sky: PALETTE.skyBlue,
  },
  ground: null,
  nations: [],
  settlements: [],
  species: null,
};
