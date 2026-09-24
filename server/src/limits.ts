/**
 * What the relay accepts as a position and a speed, and how far a driven
 * vehicle may go between two poses.
 *
 * The relay is bundled on its own and cannot import the game, whose constants
 * live beside Three and the DOM, so the few it bounds are restated here — and
 * restated loosely, as bounds rather than copies: a limit a little over the
 * game's own is a relay that drops a legitimate player the day the plane is
 * tuned. `scripts/check-world.ts` imports this file beside `src/vehicles.ts`
 * and fails if the game has outgrown any of them, so tuning the plane past a
 * margin is a failed check rather than a silent one.
 *
 * No imports, so the check can load it under Node and the Worker can bundle it.
 */

/** `PLANET_RADIUS` in `src/globe.ts`. */
export const PLANET_RADIUS = 16_000;

/**
 * Under the lowest sea floor: nothing in the world stands this deep, and the
 * shore's lip and the waterline are a few units under the radius.
 */
export const MIN_RADIUS = 15_000;

/**
 * Over anything that flies. The plane's ceiling is an *altitude*,
 * `PLANET_RADIUS * 1.45` (23,200) over the sea, so a plane at it is at a
 * radius of 39,200; this is the radius plus twice that altitude (62,400),
 * room for the ceiling to be raised by half again and more. The same bound
 * holds a player and a vehicle, because a seated player is where his seat is.
 */
export const MAX_RADIUS = PLANET_RADIUS + 2 * (PLANET_RADIUS * 1.45);

/**
 * About twice the fastest thing in the world. The plane at the ceiling, its
 * cruise of 3,400 with the stick and the throttle full on (`fly` in
 * `src/player.ts`), went 7,344 a second on 2026-09-24. A state or a pose
 * faster than this is not a game's.
 */
export const MAX_SPEED = 15_000;

/**
 * How late a pose may arrive against the one before it: the client sends one
 * at most every 100 ms, and a network holds and releases them in bunches.
 */
export const JITTER_MS = 1_000;

/**
 * How far a driven vehicle may have gone in `elapsedMs` since its last known
 * pose: `MAX_SPEED` over that time and the jitter, plus `slack` (the claim's
 * reach, where the relay's pose is only as good as a claimer's word).
 *
 * A teleport on the wire is never a pose: `atlas.goTo`, the map's *join* and a
 * spawn from the menu all leave the vehicle where it was (the player's ride
 * ends, and the `up` that follows carries the pose it was left at), and the
 * player's own state is never bounded by a step, so a traveller can jump
 * anywhere and only a vehicle cannot. A pose past this is dropped rather than
 * answered; the bound grows with the time since the last one accepted, so a
 * client that lost a few catches up on its own.
 */
export function driveReach(elapsedMs: number, slack: number): number {
  return slack + (MAX_SPEED * (Math.max(0, elapsedMs) + JITTER_MS)) / 1000;
}
