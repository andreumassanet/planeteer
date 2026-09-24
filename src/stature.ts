/**
 * How tall a person is, in world units, and nothing else.
 *
 * **One number, in a file of its own, because two files need it and neither may
 * import the other.** The hero is built in `avatar.ts`, which reaches the cast
 * and the soft kit; the crowd, the vehicles and the animals are sized in
 * `scenery/contract.ts`, which the headless checks import and which must not
 * drag a skinned character into Node. It used to be written in both, and the
 * copy's comment said it mirrored `player.ts`, a file that had not held it for
 * a long time — so "change `AVATAR_HEIGHT` and every person and rider on the
 * planet moves" was true of the hero and the townsfolk and false of the crowd,
 * the riders, the traffic and the fauna. This leaf is what makes it true.
 *
 * **One scale for everything made, and a person drawn larger than it.**
 * Everything made — a house, a tree, a lamp, a road — is `SCENERY_SCALE` units
 * to the metre. A person is 1.75 m of it times `STATURE`, 1.7: about 3.77
 * units. Until 2026-09-24 a person was 6.8 units, 3.78 to the metre, three
 * times the scale of the world around him — a door came to his hip, a
 * two-storey house was a head and a half taller than him, a tree less than
 * twice his height and a street lamp below his chin — and the vehicles and the
 * animals were placed at scales of their own to keep up with him. Earlier on
 * 2026-09-24 he was 2.22, the world's scale exactly, and that read as a small
 * figure in a big town; `STATURE` is the difference. The animals take the same
 * stature (`FAUNA_SCALE`) and the vehicles a part of it (`PLACED_SECTION`,
 * 1.35, a number of its own in `traffic/contract.ts`): moving this moves every
 * person and animal on the planet, and the vehicles only if that number is
 * moved with it.
 *
 * Crown of the head; the tuft on the crown stands a little over it.
 */
export const SCENERY_SCALE = 1.267;
/** How tall a person is, in metres. */
export const PERSON_METRES = 1.75;
/**
 * **And how much larger than life a living thing is drawn against it: 1.7.**
 * At 1.0 the world was true to a person — a door his height, a house three
 * and a half of him — and he was a small figure in a big town. At 1.7 a door
 * comes to his chest and a two-storey house is about two of him, the register
 * of a game in which the character carries the scene: chosen side by side
 * against 1.0 and 1.4 on 2026-09-24. People and animals take all of it
 * (`FAUNA_SCALE`); the vehicles take `PLACED_SECTION`, which is as much as a
 * road lets two of them pass on.
 */
export const STATURE = 1.7;
export const AVATAR_HEIGHT = PERSON_METRES * SCENERY_SCALE * STATURE;

/**
 * The height the body's own tables are written for, and the factor from them.
 *
 * `FIGURE`, the seated frame, the crowd's heights, the hero's pack and the two
 * craft are tables of lengths measured and argued on a figure 6.8 units tall,
 * the height a person had until 2026-09-24. They keep those numbers — each is a
 * proportion somebody paid for with a render — and are multiplied by this, so
 * they are the same body at the world's scale rather than a second set of
 * numbers to keep in step.
 */
export const NOMINAL_HEIGHT = 6.8;
export const BODY_SCALE = AVATAR_HEIGHT / NOMINAL_HEIGHT;
