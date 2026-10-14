/**
 * How tall a person is, in world units, and nothing else.
 *
 * A leaf of its own because the hero (`avatar.ts`, which reaches the cast) and
 * the crowd, vehicles and animals (`scenery/contract.ts`, which headless checks
 * import and which must not drag a skinned character into Node) both need it.
 * Changing `AVATAR_HEIGHT` moves every person, rider and animal.
 *
 * Everything made (a house, a tree, a lamp, a road) is `SCENERY_SCALE` units to
 * the metre. A person is 1.75 m of it times `STATURE`: about 3.77 units. The
 * animals take the same stature (`FAUNA_SCALE`) and the vehicles a part of it
 * (`PLACED_SECTION` in `traffic/contract.ts`).
 */
export const SCENERY_SCALE = 1.267;
/** How tall a person is, in metres. */
export const PERSON_METRES = 1.75;
/**
 * How much larger than life a living thing is drawn: at 1.0 a door is a
 * person's height and a house three and a half of them, a small figure in a big
 * town; at 1.7 a door comes to his chest and the character carries the scene.
 * People and animals take all of it; the vehicles take `PLACED_SECTION`, as much
 * as a road lets two of them pass on.
 */
export const STATURE = 1.7;
export const AVATAR_HEIGHT = PERSON_METRES * SCENERY_SCALE * STATURE;

/**
 * The height the body's own tables are written for, and the factor from them.
 * `FIGURE`, the seated frame, the crowd's heights, the hero's pack and the two
 * craft are tables of lengths argued on a figure 6.8 units tall; they keep those
 * numbers and are multiplied by this, so they are the same body at the world's
 * scale rather than a second set of numbers.
 */
export const NOMINAL_HEIGHT = 6.8;
export const BODY_SCALE = AVATAR_HEIGHT / NOMINAL_HEIGHT;
