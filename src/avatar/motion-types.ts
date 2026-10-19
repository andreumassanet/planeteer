import type { Emote } from '../../server/src/limits.ts';
import type { Person } from '../cast.ts';

/** What a `Motion` is told by the controller that moves the body, on top of the speed. */
export interface MotionCues {
  /** Radians a second the body is turning about its own up, positive to its left. */
  turn?: number;
  /** Radians from the body's facing to where the camera looks, positive to its left. */
  look?: number;
  /** Backing: the gait's cycle played the other way, the body still facing ahead. */
  back?: boolean;
}

/**
 * The clips of one person, played by speed: the hero's, and every other
 * player's (`peers.ts`), so a traveller seen walking past moves exactly as
 * the one being played does. `person.root` is its to place: on foot its feet
 * are on the origin, afloat the water's surface is.
 */
export interface Motion {
  readonly person: Person;
  /** Where the gait is in its cycle, 0 to 1: see `Avatar.phase`. */
  readonly phase: number;
  /** Walking, running, standing, turning on the spot and in the air. */
  foot(dt: number, speed: number, airborne: boolean, cues?: MotionCues): void;
  /**
   * Afloat, the origin on the surface: a crawl at speed, treading water when
   * still. `under` is how far under the surface the body is, 0 to 1: under
   * it the stroke slows into a long pull and a glide.
   */
  swim(dt: number, speed: number, under?: number): void;
  /** Where the stroke is in its cycle, 0 to 1; what the body's roll keeps time with. */
  readonly stroke: number;
  /** The relaxed idle and nothing else, the weights blended `rate` times as fast: a seat, a helm. */
  still(dt: number, rate?: number): void;
  /** Back on the ground: `hardness` 0 for an ordinary jump, 1 for a fall that should have hurt. */
  land(hardness: number): void;
  /** Carries everything this body was doing onto another, mid-step. */
  rebind(person: Person): void;
  /**
   * Takes off what this motion turned by hand, before the person goes back
   * to the pool (`Cast.release`): see `Motion`'s note on the mixer.
   */
  unlay(): void;
  /** A standing start, the cycle at zero. */
  reset(): void;
  /**
   * A gesture over the standing pose, for the others to see: a wave plays
   * once, a dance and sitting down go on until the body moves off, swims or
   * is seated, or another gesture or `null` is asked. False where this body
   * has no clip for it.
   */
  emote(name: Emote | null): boolean;
  /** The gesture being made, or null. */
  readonly emoting: Emote | null;
}
