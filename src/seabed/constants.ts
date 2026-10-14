// The sea floor's numbers. Distances are world units.

import { TILE_QUADS } from '../sea-floor.ts';

/** How far from the player the window reaches, and its hand-over band. */
export const WINDOW = 340;
export const BAND = 24;
/** The narrowest window worth opening: less is a keyhole, and the sea stays opaque. */
export const WINDOW_MIN = 120;
/** How far out tiles are wanted, so they are ready before the window gets to them. */
export const PREFETCH = 540;
/** Tiles resident at once: a disc of `PREFETCH` touches at most this many. */
export const SLOTS = 16;
/** Past this much coast-free water round the player, or this high, nothing here is drawn. */
export const ACTIVE_REACH = 820;
export const ACTIVE_CEILING = 700;
/** The water's clearness fades out between these camera heights over the sea. */
export const CLEAR_HIGH_FROM = 140;
export const CLEAR_HIGH_TO = 420;
/** And between these shares of the window's radius, measured from the player. */
export const CLEAR_FROM = 0.5;
export const CLEAR_TO = 0.82;
/**
 * The water's absorption length, in units of path through it: a floor this far
 * down, looked at straight down, is seen through `1/e` of the water. At 7 the
 * beach's two units read as sand, the reef flat's ten as coral under blue, and
 * the drop-off's thirty as the sea.
 */
export const ABSORB = 7;
/** The caustics seen from above fade out between these camera heights. */
export const CAUSTIC_HIGH_FROM = 6;
export const CAUSTIC_HIGH_TO = 60;
/** How much of a frame this may spend building, milliseconds. */
export const BUILD_SHARE = 0.8;
/** How often the wanted tiles are re-listed, seconds, or sooner after this much of a move. */
export const WANT_EVERY = 0.5;
export const WANT_MOVE = 40;

/** Under the surface: how far the haze lets you see, and the backdrop that closes it. */
export const UNDER_FAR = 95;
export const UNDER_NEAR = 3;
export const BACKDROP_RADIUS = 170;

/** Vertices a tile's grid has. */
export const SIDE = TILE_QUADS + 1;
export const GRID = SIDE * SIDE;
/**
 * The decor a slot holds, in vertices; a tile with more keeps what fits. A
 * multiple of three, because the decor is one triangle list and a slot has to
 * start on a triangle.
 */
export const DECOR_CAP = 16383;
