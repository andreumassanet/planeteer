/** The Miller cylindrical projection the map sheet and its tiles share, and the pyramid's levels. */

export const DEG = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const TAU = Math.PI * 2;

/** Miller's `y` at a pole: `1.25 ln tan(pi/4 + 0.4 * pi/2)`. */
export const Y_MAX = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.2 * Math.PI));
/** The sheet's height when its width is 1. */
export const SHEET_HEIGHT = (2 * Y_MAX) / TAU;

export const uOf = (lon: number): number => (lon + 180) / 360;
export const vOf = (lat: number): number =>
  (Y_MAX - 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * Math.max(-89.999, Math.min(89.999, lat)) * DEG))) / TAU;
export const lonOfU = (u: number): number => {
  const lon = u * 360 - 180;
  return lon - 360 * Math.floor((lon + 180) / 360);
};
export const latOfV = (v: number): number =>
  (2.5 * Math.atan(Math.exp(0.8 * (Y_MAX - v * TAU))) - 0.625 * Math.PI) * R2D;


/** Tile edge, pixels. */
export const TILE = 256;
/**
 * The deepest level: 728 pixels a degree, 0.38 world units a pixel at the
 * equator, so a house is twenty-odd pixels and its roof's colour reads.
 */
export const MAX_LEVEL = 10;
/** Rows of tiles at a level: the sheet is not square. */
export const rowsAt = (z: number): number => Math.ceil(SHEET_HEIGHT * 2 ** z);
/**
 * The levels pre-painted by `scripts/build-maps.ts`: 1 + 2 + 4 + 12 tiles,
 * the whole planet up to a screenful of it at 1,024 pixels.
 */
export const BAKED_LEVELS = 3;
/**
 * The style's version: part of every stored tile's key and of the bake's
 * stamp. Bump it when anything that changes what a tile looks like changes,
 * or stored tiles are drawn beside new ones.
 */
export const MAP_STYLE = 'maps-6';

/** The level whose pixels are no larger than a screen pixel at this many screen pixels a sheet unit. */
export function levelFor(pixelsPerUnit: number): number {
  return Math.min(MAX_LEVEL, Math.max(0, Math.ceil(Math.log2(pixelsPerUnit / TILE) - 0.15)));
}
