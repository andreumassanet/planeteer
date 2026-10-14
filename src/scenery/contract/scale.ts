import { SCENERY_SCALE } from '../../stature.ts';

/**
 * The working unit of the kit: one floor of a building, 3 m in life.
 *
 * A person is 0.58 of a storey. A house of 1 storey is a hut, 2 is a house, 4 is a
 * street, 8 is as tall as the fabric of a city ever gets here.
 */
export const STOREY = 3 * SCENERY_SCALE;

/**
 * What a part may spend detail on, decided at the distance it is seen from.
 *
 * A feature of size `s` is about `937 * s / d` pixels, and nothing under four
 * pixels reads once the ink is on it, so the smallest legible feature is
 * `d / 234`:
 *
 * ```
 * distance   house (10u)   smallest feature that reads
 *   40 u        234 px       0.17 u   a door frame, a window bar
 *  120 u         78 px       0.51 u   a window, a chimney
 *  360 u         26 px       1.54 u   a storey band, a roof plane
 *  930 u         10 px       4.0  u   the mass, and nothing else
 * ```
 *
 * Model at storey scale and articulate at window scale. The masses (roof
 * pitch, eaves, the stack of blocks) survive past 120 units, so they get the
 * geometry; under 120 the detail is tones and edges (a darker base course, a
 * shadow band under the eaves, a ridge cap, a frame with two panes), each two
 * or three tones of a colour the part already has, at no draw calls. `TONES`
 * and `PROUD` are the two rules it obeys.
 *
 * Past about 400 units a part is mostly its outline: the pen is screen space,
 * the same two or three pixels on a 10-unit house as on the coastline. Every
 * part must be nameable as a black shape.
 */
export const LEGIBLE_AT = (distance: number): number => distance / 234;
