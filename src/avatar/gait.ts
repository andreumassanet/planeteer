

/**
 * How fast a body this size travels, and how far it gets per stride.
 *
 * These are facts about the body (a stride is a leg length and a cadence), so
 * they live here. `player.ts` imports them, and so does anything that wants a
 * crowd figure to keep step with the player.
 *
 * A person is 3.77 units tall. The walk is 6.5 units a second, 1.7 body heights
 * a second: a brisk walk with a game's exaggeration. The run is 14, 3.7 heights
 * a second and a little over twice the walk: a run, not a sprint. A lap of the
 * planet at a run is about four hours, which is what the plane is for.
 */
export const WALK_SPEED = 6.5;
export const RUN_SPEED = 14;

/**
 * Distance covered by one full stride cycle, walking and running.
 *
 * The cycle is driven by distance, not time, so the cadence keeps pace with
 * the ground at any speed. The walk's is its speed over a cadence of 1.1
 * cycles a second, about 1.57 body heights a cycle.
 */
export const WALK_STRIDE = WALK_SPEED / 1.1;
/**
 * Stride cycles a second at a full run; the run's stride is derived from it.
 * It must stay above the walk's 1.1, or a body that speeds up when Shift goes
 * down while its legs slow down reads as bounding on the moon. At 14 units a
 * second it gives a stride of 8.75 units, 2.3 heights.
 */
export const RUN_CADENCE = 1.6;
export const RUN_STRIDE = RUN_SPEED / RUN_CADENCE;

/**
 * The knee's driver: `2 sin(p)+ * -cos(p)+`, zero everywhere except the
 * quarter cycle between toe-off and mid-swing, peaking at 1.
 *
 * `-cos(p)+` is "this leg is swinging" and `sin(p)+` is "this thigh is still
 * behind vertical". Written as factors rather than a branch, the fold arrives
 * and leaves continuously and the leg is straight whenever its foot is down.
 * Exported because `life.ts` walks its crowd figures with the same curve.
 */
export const swingLift = (phase: number): number =>
  2 * Math.max(0, Math.sin(phase)) * Math.max(0, -Math.cos(phase));
