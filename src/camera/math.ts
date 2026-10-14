/** Small helpers the camera's parts share. */
import { PIVOT_HEIGHT } from './constants.ts';
import type { CameraSubject } from './types.ts';

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const approach = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
/** An angle folded into (-pi, pi], so a gap is always closed the short way round. */
export const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Smooth 0..1 ramp between two thresholds. */
export function ramp(value: number, from: number, to: number): number {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

/** In a vehicle's seat, which is every framing that is not a foot's; swimming is a foot's. */
export const seated = (player: CameraSubject): boolean => player.state === 'seated';

/**
 * What the camera orbits: the head on foot and afloat (where the body hangs
 * under the surface, the head is `sink` nearer it), and in a vehicle a little
 * over the middle of it, so a balloon is orbited round its envelope.
 */
export const pivotHeight = (player: CameraSubject): number =>
  player.ride !== null ? Math.max(PIVOT_HEIGHT, player.ride.model.size[2] * 0.6) : PIVOT_HEIGHT - player.sink;
