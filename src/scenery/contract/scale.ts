import { AVATAR_HEIGHT } from '../../stature.ts';

/** The smallest a town may scale a building to fit its cell; past it, the region's next part is tried. */
export const FIT_SCALE = 0.9;

/**
 * How tall a front door opens: 1.3 of the person drawn, so it still clears
 * him by `DOOR_LEAST` once a town has shrunk the building to fit its cell
 * (by 0.9 at most, `FIT_SCALE`). A person is drawn `STATURE` larger than life
 * and a door is drawn for him, or every house is a doll's house.
 */
export const DOOR_HEIGHT = AVATAR_HEIGHT * 1.3;
/** The shortest door a building may stand with in a town: 1.15 of the person. `pnpm scenery` holds every variant to it. */
export const DOOR_LEAST = AVATAR_HEIGHT * 1.15;

/**
 * The working unit of the kit: one floor of a building. A door of
 * `DOOR_HEIGHT` over a half-metre course, its head, and a band of wall over
 * it: 6 units, where a 3 m storey at `SCENERY_SCALE` is 3.8. Heights are drawn
 * for the people and plans for the town's cells, so a house is a little
 * taller and narrower than its life-size self.
 *
 * A person is 0.63 of a storey. A house of 1 storey is a cottage, 2 is a
 * house, 4 is a street, 7 is as tall as the fabric of a city gets here.
 */
export const STOREY = 6;

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
