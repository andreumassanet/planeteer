/** The disc's spots over its paper: the jobs waiting near (small apricot diamonds), the one headed for, and the guilds (gold stars). */
import { edgeAt, insideFrame } from './shape.ts';
import { ink } from './palette.ts';
import type { MinimapState } from './state.ts';

const edge = { x: 0, y: 0 };
const GOLD = '#f6c445';
const APRICOT = '#f8a658';

function star(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? outer : outer * 0.45;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
}

export function drawSpots(m: MinimapState): void {
  const { ctx, centre, uiScale, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale } = m;
  const rim = 6 * uiScale;
  for (const spot of m.spots) {
    let x = (spot.x * rx + spot.y * ry + spot.z * rz) * scale;
    let y = -(spot.x * fx + spot.y * fy + spot.z * fz) * scale;
    const off = spot.x * ux + spot.y * uy + spot.z * uz <= 0 || !insideFrame(m, centre + x, centre + y, rim);
    if (off) {
      if (spot.rim !== true) continue;
      edgeAt(m, Math.atan2(x, -y), rim, edge);
      x = edge.x;
      y = edge.y;
    }
    if (spot.kind === 'guild') star(ctx, centre + x, centre + y, 6.5 * uiScale);
    else diamond(ctx, centre + x, centre + y, (spot.kind === 'tracked' ? 5.5 : 3.8) * uiScale);
    ctx.fillStyle = spot.kind === 'guild' ? GOLD : APRICOT;
    ctx.fill();
    ctx.lineWidth = (spot.kind === 'job' ? 1.3 : 1.8) * uiScale;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
}
