import { TAU, inkedText, tracePin } from '../cartography.ts';
import { COURSE_GREEN, traceRingMark } from '../course-marks.ts';
import { FONT } from '../ui.ts';
import { COURSE_RING, RIM_WIDTH, TARGET_PIN_SCALE, TARGET_REACH, TARGET_WIDTH } from './constants.ts';
import { niceKm } from './format.ts';
import { cream, ink, violet } from './palette.ts';
import type { MinimapState } from './state.ts';

/** A wedge on the rim pointing out at the marker, at its screen azimuth. */
export function traceBearing(m: MinimapState, angle: number, reach: number, width: number, fill: string): void {
  const { ctx, centre, discRadius, uiScale } = m;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const apex = discRadius - RIM_WIDTH;
  const from = apex - reach * uiScale;
  const wide = width * uiScale;

  ctx.beginPath();
  ctx.moveTo(centre + dx * apex, centre + dy * apex);
  ctx.lineTo(centre + dx * from - dy * wide, centre + dy * from + dx * wide);
  ctx.lineTo(centre + dx * from + dy * wide, centre + dy * from - dx * wide);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.5 * uiScale);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.stroke();
}

/** The rim carries one mark, the marker's, and only the player's own marker. */
export function drawBearing(m: MinimapState): void {
  const { deadzone } = m;
  if (m.marked && m.targetAngle >= deadzone) traceBearing(m, m.targetScreen, TARGET_REACH, TARGET_WIDTH, violet);
}

/**
 * The ring a course waits for: on the disc a green ring where it stands
 * (chequered for the finish), off it a green wedge on the rim pointing the
 * way. Drawn over the paper every redraw, so a ring passed moves at once.
 */
export function drawCourseRing(m: MinimapState): void {
  const { ctx, centre, discRadius, uiScale, coursePoint, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale } = m;
  if (!m.coursed) return;
  const { x: px, y: py, z: pz } = coursePoint;
  const across = px * rx + py * ry + pz * rz;
  const ahead = px * fx + py * fy + pz * fz;
  const ring = COURSE_RING * uiScale;
  const inside = discRadius - RIM_WIDTH - ring - 2 * uiScale;
  if (px * ux + py * uy + pz * uz > 0 && Math.hypot(across, ahead) * scale <= inside) {
    traceRingMark(ctx, centre + across * scale, centre - ahead * scale, ring, m.courseFinish);
    return;
  }
  traceBearing(m, Math.atan2(across, ahead), TARGET_REACH, TARGET_WIDTH, COURSE_GREEN);
}

/** The marker's pin, when it stands on the disc. */
export function drawMarkerPin(m: MinimapState): void {
  const { baseCtx, centre, discRadius, pinRise, pinHead, markerPoint, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale } = m;
  if (!m.marked) return;
  const { x: mx, y: my, z: mz } = markerPoint;
  if (mx * ux + my * uy + mz * uz <= 0) return;
  const x = centre + (mx * rx + my * ry + mz * rz) * scale;
  const y = centre - (mx * fx + my * fy + mz * fz) * scale;
  if ((x - centre) ** 2 + (y - centre) ** 2 > discRadius * discRadius) return;
  tracePin(baseCtx, x, y, pinRise, pinHead, violet, TARGET_PIN_SCALE);
}

/** The scale bar's box, worked out before the names so they can keep off it. */
export function scaleBar(m: MinimapState): { x0: number; x1: number; y: number; km: number } {
  const { size, RADIUS_KM, centre, discRadius, uiScale, view } = m;
  const kmPerPixel = (view * RADIUS_KM) / discRadius;
  const km = niceKm(kmPerPixel * discRadius * 0.42);
  const width = km / kmPerPixel;
  return { x0: centre - width / 2, x1: centre + width / 2, y: size - 13 * uiScale, km };
}

export function drawScale(m: MinimapState, bar: { x0: number; x1: number; y: number; km: number }): void {
  const { ctx, centre, uiScale } = m;
  const { x0, x1, y, km } = bar;
  ctx.lineWidth = Math.max(1, 1.6 * uiScale);
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.moveTo(x0, y - 2.5 * uiScale);
  ctx.lineTo(x0, y + 2.5 * uiScale);
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.moveTo(x1, y - 2.5 * uiScale);
  ctx.lineTo(x1, y + 2.5 * uiScale);
  ctx.stroke();
  ctx.font = `800 ${(8.5 * uiScale).toFixed(1)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Under a kilometre in metres: the small worlds' discs go that far down,
  // and a tenth of a kilometre to one place read `0.0 km`.
  inkedText(ctx, km >= 1 ? `${km} km` : `${Math.round(km * 1000)} m`, centre, y - 4 * uiScale, cream, ink, 3);
}

/**
 * What belongs to the disc rather than to the paper (the rim, north riding
 * round it, the scale bar and the marker's wedge), drawn over the paper on
 * every redraw because the paper between its redraws is moved.
 */
export function drawFrameMarks(m: MinimapState): void {
  const { ctx, centre, discRadius, uiScale } = m;
  ctx.beginPath();
  ctx.arc(centre, centre, discRadius, 0, TAU);
  ctx.lineWidth = RIM_WIDTH;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // North, riding round the rim as the paper turns under it.
  ctx.font = `800 ${(9 * uiScale).toFixed(1)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const northAt = discRadius - RIM_WIDTH - 5 * uiScale;
  inkedText(ctx, 'N', centre + Math.sin(m.northAngle) * northAt, centre - Math.cos(m.northAngle) * northAt, cream, ink, 2.5);

  drawScale(m, scaleBar(m));
  drawBearing(m);
}
