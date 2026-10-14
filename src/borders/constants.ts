import { LAND_HEIGHT } from '../geo.ts';

/**
 * Width of the line, world units: the floor, the ceiling and the pixel target.
 * The width is chosen against the range for `TARGET_PIXELS` of line at any
 * altitude. Below about 1,200 units the world width (`WIDTH`) wins, since a
 * border underfoot is a painted mark; above, `WIDTH_MAX` caps it so a dash
 * stays three times as long as it is wide.
 */
export const WIDTH = 7;
export const WIDTH_MAX = 21;
export const TARGET_PIXELS = 6;

/**
 * How close to the eye a border fragment is thrown away, world units. The
 * depth test is off, so without this the frontier under the plane is drawn
 * over the plane; the camera orbits its craft at 62 to 340 units while the
 * fade keeps the ground at least 500 below.
 */
export const NEAR_CUT = 400;

/** Below this fade the mesh goes invisible. */
export const MIN_FADE = 0.004;

/**
 * Lift off the ground. The quad is half a width either side of the line and
 * lands inside a mesh triangle, where the surface is a plane and the relief is
 * not (bounded by `RELIEF_SAG`); this lift keeps it above that disagreement.
 */
export const LIFT = 1.8;

/** Dash and gap along the frontier, world units. */
export const DASH = 60;
export const GAP = 34;

/**
 * Longest piece of frontier drawn as one quad, world units. The line's height
 * is sampled at its corners, so a quad is a flat chord across the ground
 * between them; the straight borders ruled across a desert need splitting.
 */
export const MAX_SPAN = 40;

/**
 * Where the line gives up, in units of ground height. The shore ramps from
 * the shelf's `LAND_HEIGHT` down to a 4-unit lip, so a ribbon at a fixed
 * height above it comes off as slivers; a frontier that has reached the beach
 * has ended, and the line stops across the top of the ramp.
 */
export const SHORE_FADE_START = LAND_HEIGHT - 2.5;
export const SHORE_FADE_END = LAND_HEIGHT - 0.4;

export const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
