import { MAX_LEVEL, SHEET_HEIGHT, TILE } from '../map-tiles.ts';
import { OPEN_DEGREES, SURFACE_OPEN_DEGREES } from './constants.ts';
import type { MapSheet } from './sheet.ts';

/** The smallest zoom: the sheet fills the screen. */
export function minScale(s: MapSheet): number {
  return Math.max(s.width, s.height / SHEET_HEIGHT) * 0.999;
}

/** The largest zoom: the deepest tile level at one pixel per texel. */
export function maxScale(): number {
  return TILE * 2 ** MAX_LEVEL;
}

export function clampView(s: MapSheet): void {
  s.S = Math.min(maxScale(), Math.max(minScale(s), s.S));
  s.cu -= Math.floor(s.cu);
  const halfV = s.height / 2 / s.S;
  if (SHEET_HEIGHT <= 2 * halfV) s.cv = SHEET_HEIGHT / 2;
  else s.cv = Math.min(SHEET_HEIGHT - halfV, Math.max(halfV, s.cv));
}

export function resize(s: MapSheet): void {
  const { surface, canvas, marksCanvas, sheet } = s;
  const box = sheet.getBoundingClientRect();
  s.width = Math.max(1, Math.round(box.width - 6));
  s.height = Math.max(1, Math.round(box.height - 6));
  s.ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = marksCanvas.width = Math.round(s.width * s.ratio);
  canvas.height = marksCanvas.height = Math.round(s.height * s.ratio);
  // Where the canvas sits in the sheet, for the tip: read here, once, and
  // not off two layouts on every move of the mouse.
  const inner = canvas.getBoundingClientRect();
  s.canvasLeft = inner.left - box.left;
  s.canvasTop = inner.top - box.top;
  s.canvasX = inner.left;
  s.canvasY = inner.top;
  if (!s.zoomSet) {
    s.S = (s.width * 360) / (surface === undefined ? OPEN_DEGREES : SURFACE_OPEN_DEGREES);
    s.zoomSet = true;
  }
  clampView(s);
  s.dirty = true;
}

/** Screen position of a map point, taking the copy of the sheet nearest the middle. */
export function screenX(s: MapSheet, u: number): number {
  let du = u - s.cu;
  du -= Math.round(du);
  return s.width / 2 + du * s.S;
}

export function screenY(s: MapSheet, v: number): number {
  return s.height / 2 + (v - s.cv) * s.S;
}

export function zoomAt(s: MapSheet, factor: number, x: number, y: number): void {
  const u = s.cu + (x - s.width / 2) / s.S;
  const v = s.cv + (y - s.height / 2) / s.S;
  s.S *= factor;
  s.S = Math.min(maxScale(), Math.max(minScale(s), s.S));
  s.cu = u - (x - s.width / 2) / s.S;
  s.cv = v - (y - s.height / 2) / s.S;
  clampView(s);
  s.dirty = true;
}

export function centreOnMe(s: MapSheet): void {
  const { me } = s;
  if (!me.known) return;
  s.cu = me.u;
  s.cv = me.v;
  clampView(s);
  s.dirty = true;
}

/** Whether the sheet is being moved by hand. */
export function busy(s: MapSheet): boolean {
  return performance.now() < s.busyUntil;
}

/** The level a zoom draws: tiles a little under a screen pixel at a two-to-one screen. */
export function levelAt(s: MapSheet, scale: number): number {
  return Math.min(MAX_LEVEL, Math.max(0, Math.round(Math.log2((scale * Math.min(s.ratio, 1.5)) / TILE))));
}
