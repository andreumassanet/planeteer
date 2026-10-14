/** Elevations the moods are keyed at, and how far into the night the stars reach. */
import * as THREE from 'three';
import { DEG } from './astronomy.ts';

/**
 * Elevations the three moods are keyed at. -12 is nautical twilight, where the
 * last of the glow leaves the sky, and +10 is roughly where the light stops
 * being golden. Between them everything is a blend, so dawn never arrives as a
 * switch.
 */
export const NIGHT_ELEVATION = -12;
export const DAY_ELEVATION = 10;

/**
 * The twilight ladder: the faintest star the eye finds overhead, as a visual
 * magnitude, against the sun's elevation in degrees. It makes a dusk bring the
 * stars out brightest first. The catalogue is sorted by magnitude (`pack.ts`),
 * so the stars drawn are a prefix of it, everything brighter than this number.
 * The knots follow an almanac: Venus a few minutes after sunset, Jupiter and
 * Sirius by -3, the first-magnitude stars as civil twilight ends at -6, the
 * constellations by nautical dusk at -12 and the full sky, 6.4, by astronomical
 * dusk at -18. The numbers are the naked-eye limits of the twilight literature
 * (Schaefer's) rounded to what a player can tell apart; they carry on past
 * `NIGHT_ELEVATION` where the colours stop changing.
 *
 * It is the limit for a clear sky at the zenith. `update` takes the weather,
 * the moon and the altitude off it (`SkyState.limit`), and `night-sky.ts` adds
 * each star's own airmass and glare.
 */
const TWILIGHT_LADDER: readonly (readonly [number, number])[] = [
  [4, -6],
  [0, -4],
  [-2, -2.2],
  [-4, -0.3],
  [-6, 1.5],
  [-8, 3],
  [-10, 4.3],
  [-12, 5.3],
  [-14, 5.9],
  [-16, 6.2],
  [-18, 6.4],
];

/** `TWILIGHT_LADDER` read at an elevation: straight between the knots, flat past the ends. */
export function twilightLimit(elevation: number): number {
  const first = TWILIGHT_LADDER[0]!;
  if (elevation >= first[0]) return first[1];
  for (let i = 1; i < TWILIGHT_LADDER.length; i++) {
    const [e1, m1] = TWILIGHT_LADDER[i]!;
    if (elevation >= e1) {
      const [e0, m0] = TWILIGHT_LADDER[i - 1]!;
      return m0 + ((m1 - m0) * (elevation - e0)) / (e1 - e0);
    }
  }
  return TWILIGHT_LADDER[TWILIGHT_LADDER.length - 1]![1];
}

/**
 * What the lantern moon costs the stars when it is up: magnitudes off the limit,
 * and the share of the Milky Way it washes out. A real full moon takes a dark
 * site from 6.5 to about 5 and the Milky Way with it, and this moon is full
 * every night, so it takes half of that: the sky before moonrise and after
 * moonset is visibly deeper than under it, without the lantern (a lighting
 * decision, see `MOON_OFFSET`) becoming a decision about the stars.
 */
export const MOON_LIMIT = 0.7;
export const MOON_WASH = 0.4;

/**
 * Magnitudes the weather takes off: a closed overcast all of them (the stars go
 * behind a storm's grey dome) and a fog three.
 */
export const OVERCAST_LIMIT = 7;
export const MIST_LIMIT = 3;

/** The limit above the air, where nothing is in the way but the sun. */
export const SPACE_LIMIT = 6.5;

/**
 * The Milky Way is faint and comes after the stars: none while the limit is
 * under 4.6, all of it once it passes 6.2, so it rises out of a sky already full
 * of stars and goes first when the weather or the moon comes.
 */
export const MILKY_WAY_LIMITS: readonly [number, number] = [4.6, 6.2];

/**
 * A moon that is a lantern hung opposite the sun, not an ephemeris. The real
 * moon is somewhere else, is often new and often below the horizon, which would
 * hand back nights with no light in them on a planet whose look is a light
 * stepping across a ramp. This one is always full, always up at local midnight,
 * and offset west of the anti-solar point so it cross-lights the ground instead
 * of mirroring the sun.
 */
export const MOON_OFFSET = 22 * DEG;
export const NORTH = new THREE.Vector3(0, 1, 0);
