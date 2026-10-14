/**
 * The player's body: the character, the clips it plays and every pose it takes.
 *
 * `FIGURE` (`avatar/figure.ts`) holds the seat conventions the craft and the
 * code-built riders are sized against. The gait constants (`WALK_SPEED`,
 * `swingLift`) are the one gait in this world. `buildAvatar` returns the rig
 * that poses the body on foot, afloat, seated, astride and under a canopy.
 */
export { AVATAR_HEIGHT } from './stature.ts';
export { FIGURE } from './avatar/figure.ts';
export { RUN_CADENCE, RUN_SPEED, RUN_STRIDE, WALK_SPEED, WALK_STRIDE, swingLift } from './avatar/gait.ts';
export { dressHero, heroAppearance, prepareAvatar, wardrobeCast } from './avatar/hero.ts';
export { DRIVE_SHIN, DRIVE_THIGH, SEAT_SHIN, SEAT_THIGH } from './avatar/seat-folds.ts';
export { FALL_AFTER, RUN_PHASE, SWIM_CADENCE, SWIM_STROKE, swimCadence } from './avatar/motion-config.ts';
export type { Motion, MotionCues } from './avatar/motion-types.ts';
export { createMotion } from './avatar/motion.ts';
export type { Avatar } from './avatar/avatar-type.ts';
export { buildAvatar } from './avatar/build.ts';
