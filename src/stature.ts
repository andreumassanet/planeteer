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
 * Crown of the head, and the constant everything human-scale in the world is
 * measured against — `LAND_HEIGHT` is three of these, `JUMP_HEIGHT` is capped
 * against it, and `SCENERY_SCALE` was derived from it. Unchanged by every
 * rebuild, deliberately: moving it moves the planet. It is the top of the
 * hair's mass; the tuft on the crown stands 0.08 over it.
 */
export const AVATAR_HEIGHT = 6.8;
