/**
 * One parametric body, and a different species is a different set of numbers.
 *
 * `scenery/people.ts` is the model: a `Morph` describes a species the way a
 * `Figure` describes a people, an `Alien` is one member, and the builder reads
 * nothing else and touches no `Rng`, so one `Alien` is one body for ever. The
 * topology moves too: a `Morph` says how many legs, arms, trunk segments and
 * eyes and what is on the crown.
 *
 * A body is rounded sections hung on joints: every limb a tapered capsule whose
 * cap at the joint end is a ball (a bent joint reads as one continuous limb),
 * the trunk and head lathed eggs, the eyes balls with an ink pupil. Sections
 * carry smooth normals and the hide is counter-shaded a vertex at a time. The
 * joints are `Bone`s, so one build serves as a still (`buildAlien`, stood on
 * its own feet) and as the rig of an animated walker (`worlds/aliens.ts`).
 *
 * Facts about bodies carried over from `people.ts`:
 * - A static pose is in double support (a frozen mid-swing reads as floating),
 *   and the whole body drops onto its own lowest sole.
 * - A limb's vertical reach is `thigh cos h + shin cos(h + k)`, longest at
 *   `h + k = 0`, so the knee folds only on a thigh at or behind vertical.
 * - An arm hangs inside the body unless splayed (about 0.22 at least), or the
 *   figure has no visible arms.
 * Not carried over: no `Figure`/`FIGURE` (every proportion is a share of the
 * body's own height) and no child body (a height spread does that work).
 *
 * Angles: every joint turns about its own X. The body faces +Z; a hanging limb
 * swung forward is a negative turn about X; a knee bends positive (the foot
 * goes back); an elbow bends negative; a trunk leaning forward is positive.
 * `ALIEN_POSES` is written in swings and bends, never raw turns.
 *
 * The parts live in `alien/`: `frame.ts` (lengths), `geometry.ts` (sections),
 * `rig*.ts` (the joints and what hangs on them), `poses.ts`, `stand.ts` and
 * `individual.ts` (a seeded member of a species).
 *
 * There is no `footprintOf`: how wide one is depends on its pose, and
 * `measure` in the monument contract already returns that as `radius`.
 */
export type { AlienRig, ArmRig, LegRig } from './alien/types.ts';
export { ALIEN_POSES, poseAlien, setArm, setLeg } from './alien/poses.ts';
export { rigAlien } from './alien/rig.ts';
export { buildAlien, standAlien } from './alien/stand.ts';
export type { AlienOptions } from './alien/individual.ts';
export { alienFor } from './alien/individual.ts';
