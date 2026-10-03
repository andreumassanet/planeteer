/**
 * Neptune's sky: Triton, Proteus and the rings, for `SkySpec.moons` and
 * `SkySpec.layers`.
 *
 * **Triton** goes round the wrong way — the only large moon that does, a
 * captured body on an orbit tipped 157 degrees to the equator — so it rises
 * in the west, slowly, and sets in the east. It is 0.47 degrees across from
 * the deck, nearly the Moon from Earth, and pale pink with its nitrogen frost.
 * **Proteus**, dark and lumpy and near, is 0.26. JPL's radii, distances,
 * periods and inclinations; the epochs are not the almanac's.
 *
 * **The rings** are the faintest of the four giants': dust, optical depths of
 * a ten-thousandth to a hundredth (Galle, Le Verrier, Lassell, Arago, Adams;
 * de Pater et al., 2018), which no screen would show at all, so they are
 * drawn twenty to forty times deeper than they are and still read as a
 * whisper: a thread at Le Verrier, another at Adams, a broad haze between,
 * all of it brightening steeply looking toward the Sun. In the Adams ring are the
 * **arcs** — Courage, Liberté, Égalité and Fraternité, forty degrees of
 * clumped dust that have kept their order since Voyager — going round with
 * the ring every 10.54 hours, so they cross the sky and are gone.
 */

import { PALETTE } from '../../../theme.ts';
import { NEPTUNE } from '../../../system/bodies/neptune.ts';
import type { SkyMoon } from '../../contract.ts';
import { thinRings } from '../../rings.ts';
import type { ThinRing } from '../../rings.ts';

export const NEPTUNE_MOONS: readonly SkyMoon[] = [
  { name: 'Triton', radiusKm: 1353.4, distanceKm: 354759, period: 5.876854, inclination: 23.1, retrograde: true, epoch: 260, color: PALETTE.blush },
  { name: 'Proteus', radiusKm: 210, distanceKm: 117647, period: 1.122315, inclination: 0.52, epoch: 30, color: PALETTE.steel },
];

export const NEPTUNE_RINGS: readonly ThinRing[] = [
  // Real depths, in order: 1e-4, 2e-3 (a 113 km thread), 1e-4, about 1e-3, 5e-3.
  { name: 'Galle', inner: 40900, outer: 42900, tau: 0.004, color: PALETTE.slate, dusty: 1 },
  { name: 'Le Verrier', inner: 53143, outer: 53256, tau: 0.08, color: PALETTE.bone, dusty: 0.8 },
  { name: 'Lassell', inner: 53256, outer: 57200, tau: 0.002, color: PALETTE.slate, dusty: 1 },
  { name: 'Arago', inner: 57150, outer: 57250, tau: 0.03, color: PALETTE.bone, dusty: 0.8 },
  {
    name: 'Adams',
    inner: 62915,
    outer: 62950,
    tau: 0.12,
    color: PALETTE.bone,
    dusty: 0.7,
    // The arcs, leading to trailing, as spans of the ring at J2000; drawn
    // about six times deeper than the ring between them, as they are.
    arcs: [
      { from: 247, to: 249, tau: 0.6 },
      { from: 255, to: 259, tau: 0.6 },
      { from: 266, to: 271.5, tau: 0.7 },
      { from: 277, to: 287, tau: 0.8 },
    ],
  },
];

/** The rings as a sky layer, for the air the spec gives the sky. */
export const neptuneRings = (air: number) =>
  thinRings({ rings: NEPTUNE_RINGS, radiusKm: NEPTUNE.radiusKm, air, arcPeriodHours: 24 * (360 / 820.1194) });
