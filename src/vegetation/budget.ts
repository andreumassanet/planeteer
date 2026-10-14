/** How much vegetation may stand, how it is shared between levels, and when the streamer rescans. */
import { detailArea, detailCount, detailReach } from '../view.ts';

/**
 * Resident triangles before the knob. The outline pass draws the scene twice,
 * so this is twice as many triangles a frame. `MAX_TILES` bounds draw calls
 * (a tile is one merged mesh).
 */
const TRIANGLE_BUDGET = 300_000;
const MAX_TILES = 80;

/**
 * The memory ceiling: the knob scales the budget with the square of the
 * reach, and this is what stops it. It equals `TRIANGLE_BUDGET` at the knob's
 * maximum, so the cap never binds under the slider (`pnpm reach` holds the two
 * together).
 */
const MAX_TRIANGLES = 2_700_000;
export const triangleBudget = (): number => Math.min(MAX_TRIANGLES, detailArea(TRIANGLE_BUDGET));
/** Whether the memory ceiling, rather than the knob, decides the budget. For `pnpm reach`. */
export const budgetCapped = (): boolean => detailArea(TRIANGLE_BUDGET) > MAX_TRIANGLES;
export const maxTiles = (): number => detailCount(MAX_TILES);

/**
 * The disc dressed whatever the camera faces: it holds the whole level-0 ring,
 * the ground a mouse flick can put in view before a tile could be built.
 */
const KEEP_ALL_WITHIN = 520;
/** `KEEP_ALL_WITHIN` scaled with the knob, as the ring it protects is. */
export const keepAllWithin = (): number => detailReach(KEEP_ALL_WITHIN);

/** Radians of turn that force a rescan. */
export const RESCAN_TURN = 8 * (Math.PI / 180);

/**
 * Padding on a tile's bounding sphere before the frustum sees it. The centre
 * is on the relief, so this covers the relief's swing inside one tile plus a
 * plant's height. Too big admits one extra tile; too small deletes a visible wood.
 */
export const TILE_SLACK = 300;

/**
 * The budget's share per level, finest first. Without shares the near field
 * spends everything in a dense biome and the horizon is bare. They add up to
 * more than one on purpose: each is a ceiling on one level, and the global
 * budget is the only floor, so unspent share never leaves the near field short.
 */
export const SHARE_OF = [0.62, 0.28, 0.2, 0.16];

/**
 * How far the viewer moves before the tile list is worked out again. Scanning
 * from a position that moves in 50-unit steps also stops a tile on a switch
 * distance from splitting and merging on alternate frames.
 */
export const RESCAN_MOVE = 50;

/** Milliseconds of building allowed in one frame. Below the settlements' 3.5 because they share the frame. */
export const BUILD_BUDGET_MS = 2.5;
