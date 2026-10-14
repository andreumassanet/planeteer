import type { Nearby } from '../../places.ts';

/** What one frame has worked out so far, handed from phase to phase and rewritten in place. */
export interface Tick {
  /** The frame's `requestAnimationFrame` timestamp, ms. */
  now: number;
  /** Seconds since the last frame, clamped to [0, 0.1]. */
  dt: number;
  /** Ms since the last frame, unclamped. */
  interval: number;
  /** Whether the loop is idling at half rate with nobody at the keyboard. */
  idle: boolean;
  /** When this frame's work began, `performance.now()`. */
  frameStart: number;
  /** The ground radius under the player. */
  ground: number;
  /** The camera's height over the ground under the player. */
  eyeOverGround: number;
  /** The altitude the haze and every streamer are handed (`haze.ts`). */
  altitude: number;
  /** The country under the player, 1-based; 0 at sea. */
  standingIn: number;
  nearbyPlace: Nearby;
  here: { lat: number; lon: number };
}
