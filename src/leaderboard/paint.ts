/**
 * A board's top ten painted on a canvas, for the Hall of Fame board that
 * stands in a guild's square (a `CanvasTexture` the caller makes of it): a
 * cream face framed in ink, a gold head with the title, a crimson ribbon
 * under it, and ten ruled lines of rank, name and score in Nunito, sized off
 * the canvas so a line reads from across the square. A name is only ever
 * drawn as text. Painted at once; if the face is not loaded yet it is painted
 * again when it is, and `onRepaint` says so (the texture wants an update).
 */
import { FONT, hex } from '../ui.ts';
import { PALETTE } from '../theme.ts';
import { scoreText } from './boards.ts';

/** A line of the board: what any of the boards' rows carries. */
export interface FameLine {
  rank: number;
  name: string;
  score: number | string;
}

export interface FamePaint {
  /** The ribbon's words: what the board counts. */
  ribbon?: string;
  /** The score's unit, after each score. */
  unit?: string;
  /** Called after a repaint once the face has loaded. */
  onRepaint?(): void;
}

/** How many lines a board holds. */
export const FAME_LINES = 10;
const EMPTY_LINE = 4;

const INK = hex(PALETTE.ink);
const PAPER = hex(PALETTE.white);
const CREAM = hex(PALETTE.cream);
const GOLD = hex(PALETTE.gold);
const CRIMSON = hex(PALETTE.crimson);
const METALS: Record<number, string> = { 1: GOLD, 2: '#cfd6de', 3: '#c98a4b' };

/** The repaints waiting on the face, by canvas, so a board repainted twice waits once. */
const waiting = new WeakSet<object>();

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + radius, y);
  g.lineTo(x + w - radius, y);
  g.arcTo(x + w, y, x + w, y + radius, radius);
  g.lineTo(x + w, y + h - radius);
  g.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  g.lineTo(x + radius, y + h);
  g.arcTo(x, y + h, x, y + h - radius, radius);
  g.lineTo(x, y + radius);
  g.arcTo(x, y, x + radius, y, radius);
  g.closePath();
}

/** `text` cut with an ellipsis to fit `width` at the context's font. */
function fitted(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && g.measureText(`${chars.join('')}…`).width > width) chars.pop();
  return `${chars.join('')}…`;
}

/** The largest size up to `size` at which `text` fits `width`, in weight `weight`. */
function fontFor(g: CanvasRenderingContext2D, text: string, weight: number, size: number, width: number): number {
  let px = size;
  g.font = `${weight} ${px}px ${FONT}`;
  while (px > size * 0.55 && g.measureText(text).width > width) {
    px *= 0.92;
    g.font = `${weight} ${px}px ${FONT}`;
  }
  return px;
}

/** The ribbon: a crimson band with swallowtail ends, inked. */
function ribbon(g: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number, line: number): void {
  const half = w / 2;
  const notch = h * 0.42;
  const tail = h * 0.9;
  g.beginPath();
  g.moveTo(cx - half - tail, y + h * 0.18);
  g.lineTo(cx - half, y + h * 0.18);
  g.lineTo(cx - half, y + h * 1.06);
  g.lineTo(cx - half - tail, y + h * 1.06);
  g.lineTo(cx - half - tail + notch, y + h * 0.62);
  g.closePath();
  g.moveTo(cx + half + tail, y + h * 0.18);
  g.lineTo(cx + half, y + h * 0.18);
  g.lineTo(cx + half, y + h * 1.06);
  g.lineTo(cx + half + tail, y + h * 1.06);
  g.lineTo(cx + half + tail - notch, y + h * 0.62);
  g.closePath();
  g.fillStyle = hex(0x8f0a2b);
  g.fill();
  g.lineWidth = line;
  g.strokeStyle = INK;
  g.stroke();
  roundRect(g, cx - half, y, w, h * 0.88, h * 0.08);
  g.fillStyle = CRIMSON;
  g.fill();
  g.stroke();
}

/** One ruled line: the rank's disc, the name, the score. */
function paintLine(g: CanvasRenderingContext2D, row: FameLine | null, at: { x: number; y: number; w: number; h: number; line: number }, unit: string): void {
  const { x, y, w, h, line } = at;
  const mid = y + h / 2;
  const r = h * 0.34;
  const discX = x + r + h * 0.1;
  const rank = row === null ? 0 : Math.max(0, Math.floor(row.rank));
  g.beginPath();
  g.arc(discX, mid, r, 0, Math.PI * 2);
  g.fillStyle = METALS[rank] ?? CREAM;
  g.fill();
  g.lineWidth = line * 0.8;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const rankText = row === null ? '' : rank.toLocaleString('en');
  fontFor(g, rankText, 900, h * 0.4, r * 1.7);
  g.fillText(rankText, discX, mid + h * 0.02);

  const nameX = discX + r + h * 0.32;
  const score = row === null ? '' : `${typeof row.score === 'number' ? scoreText(row.score) : String(row.score).slice(0, 16)}${unit === '' ? '' : ` ${unit}`}`;
  g.textAlign = 'right';
  g.font = `900 ${h * 0.42}px ${FONT}`;
  const scoreWidth = Math.min(w * 0.42, g.measureText(score).width);
  if (row !== null) g.fillText(fitted(g, score, w * 0.42), x + w, mid + h * 0.02);
  g.textAlign = 'left';
  g.font = `800 ${h * 0.46}px ${FONT}`;
  const name = row === null ? '' : row.name;
  if (name !== '') g.fillText(fitted(g, name, x + w - nameX - scoreWidth - h * 0.4), nameX, mid + h * 0.02);
  else {
    g.globalAlpha = 0.25;
    g.fillRect(nameX, mid - line * 0.4, (x + w - nameX) * 0.55, line * 0.8);
    g.globalAlpha = 1;
  }
}

/**
 * Paints `rows` (the first ten) on `canvas` under `title`. Any size works;
 * a portrait one, 1024 by 1280, reads best. Never throws.
 */
export function paintFameBoard(canvas: HTMLCanvasElement, rows: readonly FameLine[], title: string, paint: FamePaint = {}): void {
  let g: CanvasRenderingContext2D | null = null;
  try {
    g = canvas.getContext('2d');
  } catch {
    g = null;
  }
  if (g === null) return;
  try {
    draw(g, canvas.width, canvas.height, rows.slice(0, FAME_LINES), title, paint);
  } catch {
    // A canvas that refuses a call keeps what it had.
  }
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (fonts === undefined || waiting.has(canvas)) return;
  const face = `800 32px ${FONT}`;
  if (fonts.check(face)) return;
  waiting.add(canvas);
  fonts.load(face).then(() => {
    waiting.delete(canvas);
    if (!fonts.check(face)) return;
    paintFameBoard(canvas, rows, title, paint);
    paint.onRepaint?.();
  }).catch(() => waiting.delete(canvas));
}

function draw(g: CanvasRenderingContext2D, width: number, height: number, rows: readonly FameLine[], title: string, paint: FamePaint): void {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const u = Math.min(w, h) / 100;
  const line = Math.max(2, u * 0.9);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  // The face and its frame.
  g.fillStyle = INK;
  g.fillRect(0, 0, w, h);
  roundRect(g, u * 2.4, u * 2.4, w - u * 4.8, h - u * 4.8, u * 3);
  g.fillStyle = PAPER;
  g.fill();
  // The head.
  const headH = h * 0.16;
  roundRect(g, u * 2.4, u * 2.4, w - u * 4.8, headH, u * 3);
  g.fillStyle = GOLD;
  g.fill();
  g.fillRect(u * 2.4, u * 2.4 + headH - u * 3, w - u * 4.8, u * 3);
  g.fillStyle = INK;
  g.fillRect(u * 2.4, u * 2.4 + headH, w - u * 4.8, line);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const heading = (title.trim() === '' ? 'Hall of Fame' : title).toUpperCase().slice(0, 40);
  fontFor(g, heading, 900, headH * 0.5, w * 0.84);
  g.fillText(heading, w / 2, u * 2.4 + headH * 0.54);
  // The ribbon.
  const ribbonY = u * 2.4 + headH + h * 0.025;
  const ribbonH = h * 0.075;
  ribbon(g, w / 2, ribbonY, w * 0.62, ribbonH, line);
  const words = (paint.ribbon ?? 'The top ten').slice(0, 40);
  g.fillStyle = PAPER;
  fontFor(g, words, 800, ribbonH * 0.5, w * 0.56);
  g.fillText(words, w / 2, ribbonY + ribbonH * 0.45);
  // The lines.
  const top = ribbonY + ribbonH * 1.3;
  const bottom = h - u * 6;
  const lineH = (bottom - top) / FAME_LINES;
  const x = u * 7;
  const lineW = w - u * 14;
  for (let i = 0; i < FAME_LINES; i++) {
    const y = top + i * lineH;
    // An empty board says so on its middle line.
    if (rows.length > 0 || i !== EMPTY_LINE) paintLine(g, rows[i] ?? null, { x, y, w: lineW, h: lineH, line }, (paint.unit ?? '').slice(0, 12));
    if (i < FAME_LINES - 1) {
      g.globalAlpha = 0.22;
      g.fillStyle = INK;
      g.fillRect(x, y + lineH - line / 2, lineW, line * 0.7);
      g.globalAlpha = 1;
    }
  }
  if (rows.length === 0) {
    g.fillStyle = INK;
    g.globalAlpha = 0.7;
    g.textAlign = 'center';
    g.font = `800 ${lineH * 0.42}px ${FONT}`;
    g.fillText(fitted(g, 'The first name here could be yours', lineW), w / 2, top + lineH * (EMPTY_LINE + 0.5));
    g.globalAlpha = 1;
  }
}
