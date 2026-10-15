import { LAND_HEIGHT } from '../globe.ts';
import { MAX_RELIEF } from '../terrain.ts';

/** Tuning for the minimap's framing, marks and redraw budget. */

export const DEFAULT_SIZE = 180;
/** Ink rim width, px. */
export const RIM_WIDTH = 3;
/** Redraws a second. */
export const MAX_FPS = 30;
/** A redraw of the paper is skipped unless something moved by at least this many pixels. */
export const MIN_SHIFT = 0.35;
/** The turn, radians, before the disc is redrawn: the camera's turns the paper, the body's the arrow. */
export const MIN_TURN = 0.02;
/** How finely the horizon rim is walked, radians. Only the hidden side is ever walked. */
export const RIM_STEP = 0.12;
/** A road gets one stroked segment per this many pixels of its own extent on the disc. */
export const ROAD_SEGMENT_PX = 3;
/**
 * How long the paper stands before it is drawn again, as a multiple of what
 * drawing it last cost (an eighth of the time), and the most that may be, ms.
 * Between its redraws `draw` carries the old paper with the camera.
 */
export const BASE_GAP = 8;
export const BASE_GAP_MAX = 250;

/** Pin geometry, px at the default size: a teardrop with its point at the coordinate. */
export const PIN_RISE = 6;
export const PIN_HEAD = 3;
/** No two landmark pins closer together than this, px. */
export const PIN_SPACING = 9;
/** No two town dots closer than this, px. */
export const PLACE_SPACING = 13;
/** At most this many town dots; the largest towns win. */
export const MAX_PLACE_MARKS = 22;
/** At most this many names over landmarks and towns together. */
export const MAX_LABELS = 4;
/** The rockets' pads are drawn while the disc is no wider than this, units. */
export const PAD_VIEW = 2400;
/** A pad's rocket, px at the default size, base to nose; no two closer than `PAD_SPACING`. */
export const PAD_HEIGHT = 12;
export const PAD_SPACING = 10;
/** At most this many pad marks. */
export const MAX_PAD_MARKS = 12;
/** At most this many tiles under the disc: a coarser level is taken past it. */
export const MAX_DISC_TILES = 20;
/**
 * A tile is drawn on the disc as a grid of pieces, each by its own affine (the
 * disc is orthographic and the tile is Miller). A piece spans at most
 * `PIECE_DEGREES` of latitude, and a paper draws at most `MAX_PIECES`, coarsening past it.
 */
export const PIECE_DEGREES = 0.4;
export const MAX_PIECES = 640;
/** The tile level from which the towns are the paper's and not dots. */
export const TOWNS_TILED = 6;

/** The marker's wedge on the rim: how far it reaches in, and its half-width, px. */
export const TARGET_REACH = 13;
export const TARGET_WIDTH = 5.5;
/** Its pin on the disc is drawn this much bigger than a landmark's. */
export const TARGET_PIN_SCALE = 1.3;
/** Closer than this, in world units, the bearing mark is dropped: it would spin on top of the target. */
export const BEARING_DEADZONE = 120;

/** Half-width of the disc at its tightest and widest, world units; the widest is nominal, times `WORLD_SCALE` on Earth. */
export const MIN_VIEW = 220;
export const MAX_VIEW = 4000;
/** The disc round a walker, units, and the seconds of the way ahead it opens by with speed. */
export const LOCAL_VIEW = 260;
export const SPEED_VIEW = 10;
/** Time constant of the speed the zoom reads, seconds. */
export const SPEED_EASE = 0.8;
/** Units moved in one update past which it was a jump and not a speed. */
export const JUMP = 60;
/** The altitude floor the horizon framing counts from: sea level plus the highest ground. */
export const GROUND_CEILING = LAND_HEIGHT + MAX_RELIEF;
/** The widest the disc gets: the near hemisphere. */
export const SKY_LIMIT = (85 * Math.PI) / 180;
/** Time constant of the zoom when the framing changes, seconds. */
export const ZOOM_TIME = 0.4;

/**
 * Outline resolutions, chosen by how far the disc is zoomed out. Each level is
 * half a pixel at the bottom of its band (world units of half-width); a single
 * fine set would trace tens of thousands of points when the framing opens in the air.
 */
export const SHAPE_BANDS = [MIN_VIEW, 4000, 10000, 20000];
