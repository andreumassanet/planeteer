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
