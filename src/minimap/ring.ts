import { RIM_STEP } from './constants.ts';
import { TAU, type Shape } from '../cartography.ts';
import type { MinimapState } from './state.ts';

/**
 * Traces one ring in the player's frame.
 *
 * Only the near hemisphere exists on screen, so every point behind the
 * horizon is pushed out onto the horizon circle along its own azimuth. The map
 * is continuous across the horizon, so a ring that straddles it comes back
 * closed: its hidden stretch walks the horizon circle the way the real
 * coastline does, instead of snapping shut across the disc.
 */
export function traceRing(m: MinimapState, shape: Shape, fill = true): void {
  const { baseCtx, centre, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale } = m;
  const p = shape.points;
  const count = p.length / 3;
  /** Azimuth at which the previous point sat on the horizon; NaN if it was near. */
  let rim = NaN;

  baseCtx.beginPath();
  // One extra step wraps back to the first point: the rings are open — none of
  // them repeats its start — and the closing segment has to go through the
  // horizon logic like any other, so `closePath` never cuts a chord.
  for (let i = 0; i <= count; i++) {
    const k = (i === count ? 0 : i) * 3;
    const px = p[k]!;
    const py = p[k + 1]!;
    const pz = p[k + 2]!;
    const height = px * ux + py * uy + pz * uz;
    const sx = px * rx + py * ry + pz * rz;
    const sy = px * fx + py * fy + pz * fz;

    if (height > 0) {
      // Orthographic azimuthal: right across, north up. Canvas y grows
      // downward, hence the subtraction.
      const x = centre + sx * scale;
      const y = centre - sy * scale;
      if (i === 0) baseCtx.moveTo(x, y);
      else baseCtx.lineTo(x, y);
      rim = NaN;
      continue;
    }

    const flat = Math.sqrt(sx * sx + sy * sy);
    // Straight under the player's feet on the far side the azimuth is
    // undefined; hold the last one rather than spinning the rim walk.
    const angle = flat > 1e-6 ? Math.atan2(sy, sx) : rim;
    if (Number.isNaN(angle)) continue;

    if (i === 0) {
      baseCtx.moveTo(centre + Math.cos(angle) * scale, centre - Math.sin(angle) * scale);
    } else if (Number.isNaN(rim)) {
      baseCtx.lineTo(centre + Math.cos(angle) * scale, centre - Math.sin(angle) * scale);
    } else {
      // Both ends hidden: follow the circle round instead of cutting a chord
      // across the disc, which would eat a bite out of the fill.
      let delta = angle - rim;
      if (delta > Math.PI) delta -= TAU;
      else if (delta < -Math.PI) delta += TAU;
      const steps = Math.max(1, Math.ceil(Math.abs(delta) / RIM_STEP));
      for (let s = 1; s <= steps; s++) {
        const t = rim + (delta * s) / steps;
        baseCtx.lineTo(centre + Math.cos(t) * scale, centre - Math.sin(t) * scale);
      }
    }
    rim = angle;
  }
  baseCtx.closePath();
  if (fill) baseCtx.fill();
  baseCtx.stroke();
}
