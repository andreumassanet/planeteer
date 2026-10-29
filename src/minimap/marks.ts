import { inkedText, tracePin } from '../cartography.ts';
import { COURSE_GREEN, traceRingMark } from '../course-marks.ts';
import { FONT } from '../ui.ts';
import { COURSE_RING, RIM_WIDTH, TARGET_PIN_SCALE, TARGET_REACH, TARGET_WIDTH } from './constants.ts';
import { niceKm } from './format.ts';
import { cream, ink, violet } from './palette.ts';
import type { MinimapState } from './state.ts';
import { edgeAt, insideFrame, traceFrame } from './shape.ts';

const edge = { x: 0, y: 0 };

/** A wedge on the edge pointing out at the marker, at its screen azimuth. */
export function traceBearing(m: MinimapState, angle: number, reach: number, width: number, fill: string): void {
  const { ctx, centre, uiScale } = m;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  edgeAt(m, angle, RIM_WIDTH, edge);
  const ax = centre + edge.x;
  const ay = centre + edge.y;
  const fromX = ax - dx * reach * uiScale;
  const fromY = ay - dy * reach * uiScale;
  const wide = width * uiScale;

  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(fromX - dy * wide, fromY + dx * wide);
  ctx.lineTo(fromX + dy * wide, fromY - dx * wide);
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
  const { ctx, centre, uiScale, coursePoint, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale } = m;
  if (!m.coursed) return;
  const { x: px, y: py, z: pz } = coursePoint;
  const across = px * rx + py * ry + pz * rz;
  const ahead = px * fx + py * fy + pz * fz;
  const ring = COURSE_RING * uiScale;
  const inset = RIM_WIDTH + ring + 2 * uiScale;
  if (px * ux + py * uy + pz * uz > 0 && insideFrame(m, centre + across * scale, centre - ahead * scale, inset)) {
    traceRingMark(ctx, centre + across * scale, centre - ahead * scale, ring, m.courseFinish);
    return;
  }
  traceBearing(m, Math.atan2(across, ahead), TARGET_REACH, TARGET_WIDTH, COURSE_GREEN);
}

/** The marker's pin, when it stands on the disc. */
export function drawMarkerPin(m: MinimapState): void {
  const { baseCtx, centre, pinRise, pinHead, markerPoint, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale } = m;
  if (!m.marked) return;
  const { x: mx, y: my, z: mz } = markerPoint;
  if (mx * ux + my * uy + mz * uz <= 0) return;
  const x = centre + (mx * rx + my * ry + mz * rz) * scale;
  const y = centre - (mx * fx + my * fy + mz * fz) * scale;
  if (!insideFrame(m, x, y)) return;
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
  const { ctx, centre, uiScale } = m;
  traceFrame(ctx, m);
  ctx.lineWidth = RIM_WIDTH;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // North, riding round the rim as the paper turns under it.
  ctx.font = `800 ${(9 * uiScale).toFixed(1)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  edgeAt(m, m.northAngle, RIM_WIDTH + 7 * uiScale, edge);
  inkedText(ctx, 'N', centre + edge.x, centre + edge.y, cream, ink, 2.5);

  drawScale(m, scaleBar(m));
  drawBearing(m);
}
