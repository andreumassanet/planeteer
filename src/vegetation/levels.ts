/**
 * The quadtree's levels: tile sizes, plot pitch, groves, how far each level is
 * worth building, and how small a plant may be before it is not worth drawing.
 */
import { HAZE_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import { detailPixels, detailReach, fogFar, horizonAt, slantRange } from '../view.ts';
import { LEVELS, stepOf } from '../tile-grid.ts';

export const DEG = Math.PI / 180;

/** A level's tile size in world units. */
export const spanOf = (level: number): number => stepOf(level) * UNITS_PER_DEGREE;

/**
 * A tile splits into its four children when nearer than its span times
 * `refine()`; one number sets every level's switch distance (401 units for
 * level 1, 803 for level 2, 1,605 for level 3 at detail 1). It also sets the
 * near field's cost: the full-density disc is pi * 401^2 at a 13-unit pitch.
 */
const REFINE_BASE = 1.15;

/**
 * `REFINE_BASE` scaled by the detail knob. It scales linearly: a gentler
 * exponent puts fewer trees in front of the camera at every setting. It is a
 * function because `legibleFloor` reads it and the two must move together.
 */
export const refine = (): number => REFINE_BASE * detailReach(1);

/**
 * Plot pitch per level, in world units. Level 0 is set by the triangle budget;
 * the pitch grows faster than the tile (2.6 against 2), so a wood thins as it
 * recedes, which the fog hides.
 */
const PITCH_0 = 15;
const PITCH_GROWTH = 2.6;
export const pitchOf = (level: number): number => PITCH_0 * PITCH_GROWTH ** level;

/** Plant scale per level: buys cover for no triangles. Geometric, about 1.34 a step. */
export const SCALE_OF = [1, 1.35, 1.9, 2.8];

/**
 * From `GROVE_FROM` up the plots are not a grid but groves: a lattice of
 * centres at `GROVE_SPACING` times the level's pitch, each a disc of
 * `GROVE_RADIUS` of that spacing holding `GROVE_PLANTS` plants. Evenly spread
 * trees read as noise from far away; clumps and clearings read as woodland.
 */
export const GROVE_FROM = 2;
export const GROVE_SPACING = 2.2;
export const GROVE_RADIUS = 0.45;
export const GROVE_PLANTS = 15;

/** Lattice spacing between grove centres at this level, world units. */
export const groveSpacing = (level: number): number => pitchOf(level) * GROVE_SPACING;

/**
 * How much of a plot's cell a plant may wander from its centre. A cell seeds
 * its plant, so adding a species or moving a town leaves every other plant in
 * place; the jitter hides the grid.
 */
export const JITTER = 0.42;

/** The tallest plant before the level scale, world units. Bounds `visibleTo`. */
const TALLEST_PLANT = 20;

/**
 * Pixels a plant has to be worth before it is built. At a 900 px viewport and
 * the 55 degree lens an object of size `s` at distance `d` subtends about
 * `PIXELS_PER_RADIAN * s / d` pixels.
 */
const MIN_APPARENT_PIXELS = 5;
const PIXELS_PER_RADIAN = 937;

/** The pixel floor as the detail knob leaves it. */
const minPixels = (): number => detailPixels(MIN_APPARENT_PIXELS);

/**
 * The furthest a tile of this level is worth building: the pixel test run on
 * the tallest plant that could stand on it. The outermost level has no parent
 * to bound its band, so this caps it.
 */
export function visibleTo(level: number): number {
  return (PIXELS_PER_RADIAN * TALLEST_PLANT * SCALE_OF[level]!) / minPixels();
}

/** How far along the ground vegetation is built from this altitude. */
export function reachFor(altitude: number): number {
  return Math.min(visibleTo(LEVELS - 1), fogFar(altitude, HAZE_RADIUS) * 1.1, detailReach(Math.max(1150, horizonAt(altitude, HAZE_RADIUS) * 1.3)));
}

/** `reachFor` as a slant distance, which is what the tile test compares. */
export function rangeFor(altitude: number): number {
  return slantRange(altitude, reachFor(altitude));
}

/**
 * The smallest a plant may be at this level, world units. Applied per level
 * rather than per frame: a level has a distance band, so the floor is constant.
 */
export function legibleFloor(level: number): number {
  if (level === 0) return 0;
  return (minPixels() * spanOf(level) * refine() * 1.5) / PIXELS_PER_RADIAN;
}
