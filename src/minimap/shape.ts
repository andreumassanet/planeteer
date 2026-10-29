import type { MinimapState } from './state.ts';

/**
 * The minimap is a square with rounded corners, `discRadius` from its middle
 * to each side. The projection under it is the same orthographic one, so a
 * corner reaches `SQUARE_REACH` times further than a side.
 */
export const CORNER = 12;
export const SQUARE_REACH = Math.SQRT2;

/** The square's outline as a path, `inset` px inside its sides. */
export function traceFrame(ctx: CanvasRenderingContext2D, m: MinimapState, inset = 0): void {
  const half = m.discRadius - inset;
  const left = m.centre - half;
  ctx.beginPath();
  ctx.roundRect(left, left, half * 2, half * 2, Math.max(0, CORNER * m.uiScale - inset));
}

/** Whether a screen point stands at least `inset` px inside the square. */
export function insideFrame(m: MinimapState, x: number, y: number, inset = 0): boolean {
  const half = m.discRadius - inset;
  return Math.abs(x - m.centre) <= half && Math.abs(y - m.centre) <= half;
}

/**
 * Where a screen azimuth (clockwise from up, radians) meets the square's
 * side, `inset` px in: the offset from the middle, into `out`.
 */
export function edgeAt(m: MinimapState, angle: number, inset: number, out: { x: number; y: number }): { x: number; y: number } {
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const reach = (m.discRadius - inset) / Math.max(Math.abs(dx), Math.abs(dy), 1e-6);
  out.x = dx * reach;
  out.y = dy * reach;
  return out;
}
