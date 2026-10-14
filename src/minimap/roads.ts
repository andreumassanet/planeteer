import { ROAD_SEGMENT_PX } from './constants.ts';
import { cream } from './palette.ts';
import type { MinimapState } from './state.ts';

/** The roads on the disc: an ink casing and a cream line over it, as the world map draws them. */
export function drawRoads(m: MinimapState): void {
  const { settings, RADIUS, baseCtx, centre, uiScale, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale, view } = m;
  if (settings.roads === undefined || typeof Path2D === 'undefined') return;
  m.roadLines ??= settings.roads().map((points) => {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < points.length; k += 3) {
      cx += points[k]!;
      cy += points[k + 1]!;
      cz += points[k + 2]!;
    }
    const length = Math.hypot(cx, cy, cz) || 1;
    cx /= length;
    cy /= length;
    cz /= length;
    let radius = 0;
    for (let k = 0; k < points.length; k += 3) {
      radius = Math.max(radius, Math.acos(Math.min(1, points[k]! * cx + points[k + 1]! * cy + points[k + 2]! * cz)));
    }
    return { points, cx, cy, cz, radius };
  });
  const path = new Path2D();
  let any = false;
  for (const line of m.roadLines) {
    const span = line.radius + view;
    if (span < Math.PI && line.cx * ux + line.cy * uy + line.cz * uz < Math.cos(span)) continue;
    const p = line.points;
    // One segment per `ROAD_SEGMENT_PX` of the road's own extent on the disc,
    // its ends always kept: stroking every sample of every road is costly when
    // the disc is wide and a road is a few pixels long.
    const pointCount = p.length / 3;
    const segments = Math.max(1, Math.min(pointCount - 1, Math.ceil((2 * line.radius * scale) / ROAD_SEGMENT_PX)));
    let open = false;
    for (let j = 0; j <= segments; j++) {
      const k = Math.round((j * (pointCount - 1)) / segments) * 3;
      const px = p[k]!;
      const py = p[k + 1]!;
      const pz = p[k + 2]!;
      if (px * ux + py * uy + pz * uz <= 0) {
        open = false;
        continue;
      }
      const x = centre + (px * rx + py * ry + pz * rz) * scale;
      const y = centre - (px * fx + py * fy + pz * fz) * scale;
      if (open) path.lineTo(x, y);
      else path.moveTo(x, y);
      open = true;
      any = true;
    }
  }
  if (!any) return;
  // As thick as the disc's zoom says a road is, within reason.
  const width = Math.min(4.2, Math.max(1.6, (9 / (view * RADIUS)) * 120)) * uiScale;
  baseCtx.lineCap = 'round';
  baseCtx.lineJoin = 'round';
  baseCtx.strokeStyle = 'rgba(30, 6, 3, 0.7)';
  baseCtx.lineWidth = width + 2.2 * uiScale;
  baseCtx.stroke(path);
  baseCtx.strokeStyle = cream;
  baseCtx.lineWidth = width;
  baseCtx.stroke(path);
}
