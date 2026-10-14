/** Camera framing, input and layout constants for the menu. */
import { PLANET_RADIUS } from '../globe.ts';

export const DEG = Math.PI / 180;
export const R = PLANET_RADIUS;

/** The rig's own lens, so the menu and the game frame the planet identically. */
export const FOV = 55;

/** Share of the vertical frame the globe fills at the region stage (2.47 radii away). */
export const GLOBE_FILL = 0.87;

/** The same for a country, looser because a country is not a disc. */
export const REGION_FILL = 0.8;

/** A region's bounding cap is clamped here; see `frameRegion`. */
export const MAX_CAP = 42 * DEG;

/** Lowest altitude to pick a city from; the fog hides the ground below it. */
export const MIN_ALTITUDE = 420;

/** Latitude is clamped here so the camera's up vector never degenerates. */
export const MAX_LAT = 88;

/** Time constant of the drag's chase, seconds. */
export const DRAG_LAG = 0.1;

/**
 * Zoom per wheel pixel: `exp(pixels * WHEEL_ZOOM)`. Proportional to the delta so
 * a trackpad flick and a mouse notch (100 px, +12%) zoom alike.
 */
export const WHEEL_ZOOM = Math.log(1.12) / 100;
/** A `deltaMode` of lines, in pixels. Pages are a screen. */
export const WHEEL_LINE = 40;
/** No single wheel event moves more than this, whatever the device claims. */
export const WHEEL_MAX = 400;

/** Ink and gold ribbon widths, in pixels of a 1080-tall frame. The gold rides inside the ink. */
export const RIBBON_INK = 5.4;
export const RIBBON_GOLD = 2.6;

/** The ribbon floats this far over the shelf, so it never sinks into a coast. */
export const RIBBON_LIFT = 12;

/** Pixels between two town pins, and the most that ever stand at once. */
export const PIN_SPACING = 56;
export const MAX_PINS = 48;

/**
 * The system shot: the camera's elevation above the ecliptic, its azimuth round
 * from Earth as seen from the Sun, and how far the look target leads the Sun
 * toward the camera. 115 degrees shows Earth gibbous and off to one side of the
 * Sun; the lead lifts the Sun above the middle of the frame, since the dock sits
 * along the bottom. The distance is searched (`frameSystem`).
 */
export const SYSTEM_ELEVATION = 30 * DEG;
export const SYSTEM_AZIMUTH = 115 * DEG;
export const SYSTEM_LEAD = 0.14;

/** Where every body must land for the system shot to count as framed, in NDC: clear of the sides, the brand and the dock. */
export const SYSTEM_SAFE = { x: 0.9, top: 0.78, bottom: -0.56 };

/** How fast the system turns on its own once nobody has touched it for a while. */
export const DRIFT = 0.016;
export const IDLE_BEFORE_DRIFT = 5;

/** A planet up close: this many of its own radii away, a little above its equator. */
export const FOCUS_DISTANCE = 3.3;
export const FOCUS_ELEVATION = 14 * DEG;

/** The dive into the chosen town ends this far up, where the curtain closes. */
export const DEPART_HEIGHT = 1500;

/** How many towns the country list shows before it says how many more there are. */
export const LIST_LENGTH = 80;
