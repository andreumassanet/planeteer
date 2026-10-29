import { BASE_GAP, BASE_GAP_MAX } from './constants.ts';
import { drawBase } from './base.ts';
import { drawCourseRing, drawFrameMarks } from './marks.ts';
import { cream, ink, pink } from './palette.ts';
import type { MinimapState } from './state.ts';
import { edgeAt, insideFrame, traceFrame } from './shape.ts';

const edge = { x: 0, y: 0 };

/** One overlay redraw: the paper (rebuilt when stale, else carried along), the rim marks, a course's ring, the other players and the arrow. */
export function draw(m: MinimapState): void {
  const { size, canvas, ctx, base, centre, uiScale, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale } = m;
  const dpr = Math.min(devicePixelRatio || 1, 3);
  if (dpr !== m.ratio) {
    m.ratio = dpr;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    m.baseStale = true;
    m.baseDrawnAt = -Infinity;
  }
  const began = performance.now();
  const redrawn = m.baseStale && began - m.baseDrawnAt >= m.baseGap;
  if (redrawn) {
    drawBase(m);
    m.baseStale = false;
    m.baseDrawnAt = began;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // The paper as it was drawn, moved to where it is now: between its own
  // redraws it is carried by the turn, the shift and the zoom since, which near
  // the centre of an orthographic disc is one affine transform. Over the ocean
  // the paper uncovers, which is why the disc is filled first.
  const k = scale / m.baseScale;
  const a = k * (m.baseRx * rx + m.baseRy * ry + m.baseRz * rz);
  const b = -k * (m.baseRx * fx + m.baseRy * fy + m.baseRz * fz);
  const c = -k * (m.baseFx * rx + m.baseFy * ry + m.baseFz * rz);
  const d = k * (m.baseFx * fx + m.baseFy * fy + m.baseFz * fz);
  const e = centre + scale * (m.baseUx * rx + m.baseUy * ry + m.baseUz * rz) - (a + c) * centre;
  const f = centre - scale * (m.baseUx * fx + m.baseUy * fy + m.baseUz * fz) - (b + d) * centre;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  traceFrame(ctx, m);
  ctx.fillStyle = m.paper;
  ctx.fill();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e * dpr, f * dpr);
  ctx.drawImage(base, 0, 0);
  ctx.restore();
  if (redrawn) {
    // What the paper costs, the copy that flushes it included, says how
    // long until it may be drawn again.
    m.baseGap = Math.min(BASE_GAP_MAX, (performance.now() - began) * BASE_GAP);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawFrameMarks(m);
  drawCourseRing(m);

  const rim = 5 * uiScale;
  for (const mark of m.peerMarks) {
    let x = (mark.x * rx + mark.y * ry + mark.z * rz) * scale;
    let y = -(mark.x * fx + mark.y * fy + mark.z * fz) * scale;
    // Off the square, or behind the horizon, it is still somewhere round the edge.
    if (mark.x * ux + mark.y * uy + mark.z * uz <= 0 || !insideFrame(m, centre + x, centre + y, rim)) {
      edgeAt(m, Math.atan2(x, -y), rim, edge);
      x = edge.x;
      y = edge.y;
    }
    ctx.beginPath();
    ctx.arc(centre + x, centre + y, 3.5 * uiScale, 0, Math.PI * 2);
    ctx.fillStyle = pink;
    ctx.fill();
    ctx.lineWidth = 1.5 * uiScale;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }

  // The player, always dead centre, turned to the heading.
  ctx.save();
  ctx.translate(centre, centre);
  ctx.rotate(m.heading);
  ctx.beginPath();
  ctx.moveTo(0, -11 * uiScale);
  ctx.lineTo(7 * uiScale, 8 * uiScale);
  ctx.lineTo(0, 3.5 * uiScale);
  ctx.lineTo(-7 * uiScale, 8 * uiScale);
  ctx.closePath();
  ctx.fillStyle = cream;
  ctx.fill();
  ctx.lineWidth = 2 * uiScale;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.restore();
}
