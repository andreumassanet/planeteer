/**
 * The saucer's dimensions. Every length is a share of `AVATAR_HEIGHT` (`H`):
 * the seated body's own reach (`HERO` in `craft/body.ts`, measured off the
 * cast) decides the cockpit (the soles on the floor, the hips `HERO.sole` over
 * them, the crown `HERO.crown` over the hips) and the dome is what clears that
 * crown by a margin (`UFO_HEAD_ROOM`). The disc is 2.2 bodies in radius, the
 * size of the lander's kit ship, and the dome 1 body: a dome a little under
 * half the disc.
 */

import { AVATAR_HEIGHT } from '../../stature.ts';
import { HERO } from '../../craft/body.ts';
import type { WheelGrip } from '../../cast.ts';

export const H = AVATAR_HEIGHT;

/** The disc's radius at its band, units: 2.2 bodies, the lander's kit ship's size. */
export const DISC = 2.2 * H;
/** How long the legs are: the belly stands this high over the ground when parked. */
export const LEGS = 0.5 * H;
/** The lower hull's height, belly to band, the belly's share of it, and the upper's, band to the dome's collar. */
export const LOWER = 0.3 * H;
export const BELLY = 0.12 * H;
export const UPPER = 0.32 * H;
/** The band's centre and the top of the upper hull, where the cockpit floor and the collar are. */
export const BAND_Y = LEGS + LOWER;
export const DECK_Y = BAND_Y + UPPER;
/** The cockpit floor, stepped proud of the hull's cap (`PROUD` is 0.08; this is more). */
export const FLOOR = 0.06 * H;
export const FLOOR_Y = DECK_Y + FLOOR;
/**
 * The seated hips over the floor: the soles a hair over it. `HERO.sole` is
 * how far the cast's seated soles hang under its hips, and the hip lands on
 * the seat's surface (`craft/body.ts`), so the cushion's top is here too.
 */
export const HIP_Y = FLOOR_Y + HERO.sole + 0.01 * H;
/** The dome: a hemisphere on the collar, a body in radius. */
export const DOME_RADIUS = 1.0 * H;
export const DOME_HEIGHT = 1.0 * H;
/**
 * How much of what is behind it each of the dome's two shells lets through:
 * the pair is about a third, as one of Earth's panes is a quarter
 * (`GLASS_OPACITY`), so the pilot and the cockpit's colours read through it.
 */
export const UFO_GLASS_OPACITY = 0.2;
/** How many lamps ride the band. */
export const LAMPS = 16;
/** The beam is drawn under this height of the belly over the ground, units, and fades in under it. */
export const BEAM_REACH = 14 * H;

/**
 * The cockpit's own numbers, for `scripts/check-worlds.ts`: the seated hips
 * and the dome they sit under, in the craft's frame (standing on `y = 0`,
 * facing +Z), and the least room the crown is to have under the glass.
 */
export const UFO_COCKPIT = {
  hip: { x: 0, y: HIP_Y, z: -0.02 * H },
  dome: { y: DECK_Y, radius: DOME_RADIUS, height: DOME_HEIGHT },
  floor: FLOOR_Y,
} as const;
/**
 * The two sticks the pilot holds, as a wheel whose rim is the knobs
 * (`WheelGrip`, `holdWheel` in `cast.ts`): its middle about the hip, upright,
 * each hand a quarter turn round from its top, so the left on the left knob and
 * the right on the right. Forward and high enough that the hands on them are in
 * the first-person view, so the pilot leans in to them (`WHEEL_LEAN`), and each
 * knob is within the arm's reach of its shoulder (`HERO.reachFrom`,
 * `HERO.reach`; `wheelFaults` in the checks).
 */
export const UFO_STICKS: WheelGrip = { centre: [0, 0.32 * H, 0.31 * H], tilt: 0, radius: 0.14 * H, spread: Math.PI / 2 };
/**
 * The horseshoe console about the seated hips, in their frame: its inner and
 * outer radius (the inner past the toes, `HERO.toe`), the arc it spans ahead
 * and in how many segments, the desk's height at its inner and outer edge over
 * the hip, and how far round from ahead its two screens stand. From the seated
 * eye the desk's far edge is 28 degrees under its level, a degree under the
 * line to the rim's band, so the band shows over the console; with the seat's
 * gaze tipped 14 down (the helicopter's, `camera.ts`) the console is the bottom
 * quarter of the view and the way ahead is over it.
 */
export const UFO_CONSOLE = { inner: 0.46 * H, outer: 0.7 * H, span: (150 * Math.PI) / 180, segments: 5, low: 0, high: 0.1 * H, screens: (38 * Math.PI) / 180 } as const;
/** The least room between the seated crown and the glass over it, units: a hand's breadth. */
export const UFO_HEAD_ROOM = 0.08 * H;
/** Its footprint: the band's outer edge, which is the wall it is when parked. */
export const UFO_RADIUS = DISC * 1.05;
