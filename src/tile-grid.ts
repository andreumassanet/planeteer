/**
 * The quadtree the country is tiled on: `vegetation.ts` streams its tiles, and
 * `countryside.ts` plans one farm, mill or shrine a finest tile on the same
 * cells, so what a tile holds and what the plan put there are one grid and
 * cannot disagree about where a cell ends.
 *
 * Latitude spanned by the *coarsest* tile, in degrees, and the number of levels
 * under it.
 *
 * The grid is a quadtree in latitude and longitude, and it has to be one rather
 * than four independent grids for a reason that is invisible until you look at a
 * hillside: if the levels did not nest, the boundary between two of them would
 * be a seam — the same ground covered twice, or a gap with nothing in it, in a
 * ring around the viewer that moves as you walk. Nesting makes the cover exact.
 * A level-`L` tile is exactly the four level-`L-1` tiles under it, because the
 * latitude step halves and the longitude cell count doubles at every step down.
 *
 * 5 degrees and four levels put the finest tile at 0.625 degrees, which is 174
 * world units — about two thirds of the distance at which a house stops being
 * legible, and small enough that frustum culling has something to throw away.
 */
export const ROOT_STEP = 5;
export const LEVELS = 4;

const DEG = Math.PI / 180;

/** Degrees of latitude spanned by a tile of this level. 0.625 to 5. */
export const stepOf = (level: number): number => ROOT_STEP / 2 ** (LEVELS - 1 - level);

/** Rows of latitude at this level. Integral at every level, by construction. */
export const rowsOf = (level: number): number => Math.round(180 / stepOf(level));

/** The root band a level-`level` row belongs to. */
export const rootOf = (row: number, level: number): number =>
  Math.floor(row / 2 ** (LEVELS - 1 - level));

/**
 * Longitude cells in a root band, rounded to a power of two.
 *
 * A power of two and not the nearest integer, because the quadtree's whole
 * property is that a cell splits into exactly two: round to 60 cells at the
 * equator and the level below cannot be 120 without the tiles ceasing to nest.
 * The cost is that a tile is up to 40% off square in longitude, which nothing
 * can see — the plot grid is laid out in the tile's own half-extents and does
 * not care what shape they are.
 */
export function rootCells(root: number): number {
  const lat = -90 + (root + 0.5) * ROOT_STEP;
  const want = (360 * Math.cos(lat * DEG)) / ROOT_STEP;
  return 2 ** Math.max(0, Math.round(Math.log2(Math.max(1, want))));
}

export const cellsOf = (root: number, level: number): number =>
  rootCells(root) * 2 ** (LEVELS - 1 - level);

/** Where one tile is, in degrees: its south-west corner and its extent. */
export interface CellBounds {
  south: number;
  west: number;
  dLat: number;
  dLon: number;
}

/** The tile of a level a point is in, as its row and its column (wrapped). */
export function cellAt(lat: number, lon: number, level: number): { row: number; column: number } {
  const step = stepOf(level);
  const row = Math.min(rowsOf(level) - 1, Math.max(0, Math.floor((lat + 90) / step)));
  const cells = cellsOf(rootOf(row, level), level);
  const turn = (((lon + 180) % 360) + 360) % 360;
  return { row, column: Math.min(cells - 1, Math.floor((turn / 360) * cells)) };
}

/** A tile's bounds, `column` wrapped round the antimeridian. */
export function cellBounds(level: number, row: number, column: number, into: CellBounds): CellBounds {
  const step = stepOf(level);
  const cells = cellsOf(rootOf(row, level), level);
  const dLon = 360 / cells;
  into.south = -90 + row * step;
  into.west = -180 + (((column % cells) + cells) % cells) * dLon;
  into.dLat = step;
  into.dLon = dLon;
  return into;
}

/**
 * What the wood (`vegetation.ts`) and the country's plan (`countryside.ts`)
 * both keep clear of, past what each thing claims: a landmark's footprint,
 * falling back to the widest a model may have, plus a margin, and a standing
 * plane's or balloon's field plus a margin. One copy, so the two cannot
 * disagree about where a clearing ends.
 */
export const WIDEST_FOOTPRINT = 55;
export const MONUMENT_CLEARANCE = 6;
/**
 * And round a standing plane's or balloon's field (`fleet.ts`), past the
 * field's own radius and the plant's own spread: open grass between the tip
 * and the first trunk, so the aircraft reads as standing in a clearing rather
 * than parked against a hedge. It was 3, which left a balloon's envelope, 7.3
 * of its 8-unit field, under four units from the nearest canopy; 6 is a body
 * and a half more.
 */
export const FIELD_CLEARANCE = 6;
