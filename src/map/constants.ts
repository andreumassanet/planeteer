/** Tuning for the world map's painting budget, zoom and marks. */

export const DEG = Math.PI / 180;

/** Tile painting allowance per frame, ms, while the sheet is still and frames keep time. */
export const TILE_BUDGET_MS = 10;
/** The allowance while a hand moves the sheet or the frame came late. */
export const TILE_BUSY_MS = 4;
/** A frame interval over this is late, ms. */
export const LATE_FRAME_MS = 24;
/** How long after the last drag or wheel step the sheet counts as moving, ms. */
export const SETTLE_MS = 180;
/** While the sheet is shut, the tiles it will open on are painted in the world's spare time. */
export const WARM_BUDGET_MS = 1.5;
/** Warming waits this long after creation, ms, so it stays out of the arrival. */
export const WARM_AFTER_MS = 8000;
/** The screenful round the player is asked for again at most this often, ms. */
export const WARM_EVERY_MS = 15000;
/** The first levels, asked for with every warming: 1 + 2 + 6 tiles, baked on Earth. */
export const KEEP_LEVEL = 2;

/** Redraws a second when only the player or a peer moved. The drag is not throttled. */
export const MAX_FPS = 30;
/** The first open's zoom, as degrees of longitude across the screen. */
export const OPEN_DEGREES = 38;
/** The same on another world, whose nations are tens of degrees wide. */
export const SURFACE_OPEN_DEGREES = 120;
/** Pin geometry in pixels. */
export const PIN_RISE = 13;
export const PIN_HEAD = 6;
/** No two pins closer together than this; the destination is exempt. */
export const PIN_SPACING = 16;
/** A course's badge, its radius in pixels; the two badges at one capital stand this far either side of it. */
export const COURSE_BADGE = 9;
export const COURSE_SPREAD = 9.5;
/** Its waiting ring, radius in pixels. */
export const COURSE_RING = 9;
/** How far the cursor may be from a mark and still be pointing at it. */
export const PICK_RANGE = 16;
/** How long a click on the bare sheet waits before it puts the marker down, ms; a double click zooms instead. */
export const DOUBLE_MS = 280;
/** A press that moves further than this is a drag, not a click. */
export const CLICK_SLOP = 5;
/** A town is left to the paper rather than marked with a dot once its square is this many pixels. */
export const SQUARE_FROM = 7;

/**
 * The smallest population named at a zoom, by pixels per degree. A capital is
 * named from the second row on.
 */
export const TOWN_FLOOR: readonly [number, number][] = [
  [3, 8_000_000],
  [6, 2_500_000],
  [14, 700_000],
  [32, 150_000],
  [70, 30_000],
  [Infinity, 0],
];
/** The rockets' pads are drawn from this zoom, in pixels per degree, and asked for within this many units of the middle. */
export const PADS_FROM = 70;
export const PADS_REACH = 6000;
/** A pad's rocket on the sheet, base to nose, in pixels. */
export const PAD_HEIGHT = 17;
/** Roads are drawn from this zoom, in pixels per degree; lanes from the second. */
export const ROADS_FROM = 30;
export const LANES_FROM = 55;
/** Under this many pixels per sheet unit the coast is traced at a pixel and a half rather than 0.8. */
export const PLANET_ZOOM = 4096;
/** Pixels you may move on the screen before the names are laid out round you again. */
export const RELAYOUT_PX = 18;
/** Samples taken along a road's course. */
export const ROAD_SAMPLES = 14;
