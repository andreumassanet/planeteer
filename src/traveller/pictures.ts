/**
 * The pictures of what the stage cannot show standing still: a trail's
 * particles, a title, a parachute's canopy, a companion. Drawn flat on the
 * tile's canvas in the palette, the same every time.
 */
import { canopyCell } from '../cosmetics/canopy.ts';
import { TRAIL_KINDS } from '../cosmetics/trails.ts';
import { PALETTE } from '../theme.ts';
import { FONT, hex } from '../ui.ts';

const SIZE = 128;
const INK = hex(PALETTE.ink);

function surface(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (canvas.width !== SIZE) canvas.width = SIZE;
  if (canvas.height !== SIZE) canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  context.clearRect(0, 0, SIZE, SIZE);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  return context;
}

/** A small generator, so a picture is drawn the same each time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** Nothing worn: a dashed ring. */
export function paintNothing(canvas: HTMLCanvasElement): void {
  const c = surface(canvas);
  if (c === null) return;
  c.strokeStyle = 'rgba(255, 242, 232, 0.45)';
  c.lineWidth = 5;
  c.setLineDash([9, 9]);
  c.beginPath();
  c.arc(SIZE / 2, SIZE / 2, 30, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  c.beginPath();
  c.moveTo(SIZE / 2 - 21, SIZE / 2 + 21);
  c.lineTo(SIZE / 2 + 21, SIZE / 2 - 21);
  c.stroke();
}

/** A trail: its particles strewn along a path that sweeps up across the tile. */
export function paintTrail(canvas: HTMLCanvasElement, id: string): void {
  const c = surface(canvas);
  const kind = TRAIL_KINDS[id];
  if (c === null || kind === undefined) return;
  const random = seeded(id.length * 7919 + id.charCodeAt(6));
  c.lineWidth = 3;
  c.strokeStyle = INK;
  if (kind.ribbon === true) {
    const bands = kind.colours.length;
    for (let b = 0; b < bands; b++) {
      c.beginPath();
      c.strokeStyle = hex(kind.colours[b]!);
      c.lineWidth = 7;
      const y = 44 + b * 7;
      c.moveTo(14, y + 34);
      c.bezierCurveTo(44, y + 30, 70, y - 20, 114, y - 18);
      c.stroke();
    }
    return;
  }
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const x = 14 + t * 100 + (random() - 0.5) * 18;
    const y = 104 - t * 70 + Math.sin(t * 5) * 8 + (random() - 0.5) * 22;
    const r = (3 + (1 - t) * 6) * (0.7 + random() * 0.6);
    c.fillStyle = hex(kind.colours[Math.floor(random() * kind.colours.length)]!);
    c.beginPath();
    if (kind.stretch[1] < 0.5) c.ellipse(x, y, r * 1.3, r * 0.55, random() * Math.PI, 0, Math.PI * 2);
    else if (kind.stretch[1] > 1.2) {
      c.moveTo(x, y - r * 1.6);
      c.lineTo(x + r * 0.6, y);
      c.lineTo(x, y + r * 1.6);
      c.lineTo(x - r * 0.6, y);
      c.closePath();
    } else c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
}

/** A title: the word on a banner. */
export function paintTitle(canvas: HTMLCanvasElement, name: string): void {
  const c = surface(canvas);
  if (c === null) return;
  c.fillStyle = 'rgba(20, 16, 12, 0.72)';
  c.beginPath();
  c.roundRect(8, 46, SIZE - 16, 36, 18);
  c.fill();
  let size = 19;
  c.font = `900 ${size}px ${FONT}`;
  while (size > 10 && c.measureText(name.toUpperCase()).width > SIZE - 30) {
    size--;
    c.font = `900 ${size}px ${FONT}`;
  }
  c.fillStyle = hex(PALETTE.gold);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(name.toUpperCase(), SIZE / 2, 65);
}

/** A canopy: its cells across the arc, from below, with its lines. */
export function paintCanopy(canvas: HTMLCanvasElement, canopy: number): void {
  const c = surface(canvas);
  if (c === null) return;
  const cells = 9;
  const cx = SIZE / 2;
  const cy = 98;
  const outer = 70;
  const inner = 52;
  const from = Math.PI * 1.15;
  const to = Math.PI * 1.85;
  c.lineWidth = 3;
  c.strokeStyle = INK;
  for (let i = 0; i < cells; i++) {
    const a = from + ((to - from) * i) / cells;
    const b = from + ((to - from) * (i + 1)) / cells;
    c.fillStyle = hex(canopyCell(canopy, i, cells));
    c.beginPath();
    c.arc(cx, cy, outer, a, b);
    c.arc(cx, cy, inner, b, a, true);
    c.closePath();
    c.fill();
    c.stroke();
  }
  c.lineWidth = 1.5;
  for (const a of [from, (from + to) / 2 - 0.15, (from + to) / 2 + 0.15, to]) {
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    c.lineTo(cx, cy + 20);
    c.stroke();
  }
}

/** A companion: a dog's head, ears up. */
export function paintPet(canvas: HTMLCanvasElement): void {
  const c = surface(canvas);
  if (c === null) return;
  c.lineWidth = 4;
  c.strokeStyle = INK;
  c.fillStyle = hex(PALETTE.apricot);
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(64 + s * 16, 46);
    c.lineTo(64 + s * 34, 22);
    c.lineTo(64 + s * 38, 56);
    c.closePath();
    c.fill();
    c.stroke();
  }
  c.beginPath();
  c.ellipse(64, 70, 34, 30, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = hex(PALETTE.white);
  c.beginPath();
  c.ellipse(64, 84, 18, 14, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = INK;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(64 + s * 13, 64, 3.6, 0, Math.PI * 2);
    c.fill();
  }
  c.beginPath();
  c.ellipse(64, 78, 6, 4.5, 0, 0, Math.PI * 2);
  c.fill();
}
