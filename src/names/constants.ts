/** How many names are drawn at once. */
export const MAX_LABELS = 10;

/**
 * Type size, px, against the square root of the country's area in square
 * degrees; the root keeps Luxembourg and Russia in one scale.
 */
export const FONT_MIN = 12;
export const FONT_MAX = 34;
export const FONT_PER_ROOT = 1.5;

/** The country under the player is drawn this much larger. */
export const HERE_SCALE = 1.22;

/**
 * Margin inside the viewport, px: where a name may be. The top and bottom
 * margins keep names out of the HUD's cards, which settles the stacking
 * order of two `position: fixed` layers.
 */
export const EDGE_X = 40;
export const EDGE_TOP = 90;
export const EDGE_BOTTOM = 118;

/**
 * How much of the horizon test is a fade rather than a cut: the test is
 * `dot(up, eye) - R / |eye|`, an angle in disguise, and 0.01 of it is about
 * 0.8 degrees of arc.
 */
export const LIMB_FADE = 0.01;

/**
 * How wide a country has to be on the screen, px, to be worth a name: the
 * diameter of a disc of the same area, in world units, over the range it is
 * seen from. A range test, not a size one. The country under the player is
 * exempt.
 */
export const MIN_COUNTRY_PIXELS = 45;

/** Below this fade nothing is drawn. */
export const MIN_FADE = 0.01;

/** The share of the haze's distance past which a town's name starts to fade, to nothing at the haze. */
export const REACH_FADE = 0.7;

/** How many town names are drawn at once. */
export const MAX_TOWNS = 18;

/** How wide a town's square has to be on the screen, px, to be named. */
export const MIN_TOWN_PIXELS = 7;

/** Town type size, px: a village at the edge of being named, and a city filling the view. */
export const TOWN_FONT_MIN = 12;
export const TOWN_FONT_MAX = 21;

/** How high a name floats over its town's ground: a share of its radius, and at least this many units. */
export const TOWN_HOVER = 0.32;
export const TOWN_HOVER_MIN = 16;

/**
 * Inside a town, as multiples of its radius along the ground from under the
 * eye: no name until `TOWN_NEAR_IN`, the whole name from `TOWN_NEAR_OUT`.
 */
export const TOWN_NEAR_IN = 0.75;
export const TOWN_NEAR_OUT = 1.3;

/** The eye's height over sea level, units, between which the town under it is named after all. */
export const TOWN_ALOFT_LOW = 220;
export const TOWN_ALOFT_HIGH = 420;

/**
 * Whether a hill hides a name: the line from the eye to it is sampled at
 * `SIGHT_SAMPLES` points over its first `SIGHT_REACH` (the last stretch is the
 * town's own ground), at most `SIGHT_TESTS` names a frame, each again after
 * `SIGHT_EVERY_MS`; a name eases in and out over `1 / SIGHT_EASE` seconds.
 */
export const SIGHT_SAMPLES = 14;
export const SIGHT_REACH = 0.9;
export const SIGHT_TESTS = 10;
export const SIGHT_EVERY_MS = 350;
export const SIGHT_EASE = 4;
