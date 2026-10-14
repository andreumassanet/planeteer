/** Small numeric helpers the controller's modes share. */

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Frame-rate independent version of `x += (target - x) * rate`. */
export const approach = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/**
 * The movement keys as a vehicle reads them: two levers (stick and throttle),
 * not a direction. `input.ts` scales a diagonal to unit length, which on foot is
 * right, but in a vehicle it coupled the two controls. This stretches the vector
 * along its own direction until its longer component is as long as the whole
 * was: a key held alone is untouched, and two held together come back as
 * exactly 1 each.
 */
export function levers(move: { x: number; y: number }, out: { x: number; y: number }): { x: number; y: number } {
  const longer = Math.max(Math.abs(move.x), Math.abs(move.y));
  const stretch = longer > 1e-9 ? Math.hypot(move.x, move.y) / longer : 0;
  out.x = move.x * stretch;
  out.y = move.y * stretch;
  return out;
}
