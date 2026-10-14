/** Scaling the book to the window, and the one-page-at-a-time layout of a phone held upright. */
import { isTouch } from '../touch.ts';
import { BOOK_W, COVER_PAD, FIT_HEIGHT, FIT_WIDTH, MAX_SCALE, SHEET_H, SHEET_W, SIDE_ROOM } from './constants.ts';
import type { BookDom } from './dom.ts';
import { spreads } from './model.ts';
import type { BookModel } from './model.ts';

/** One page at a time: a phone held upright, where the spread would be too small to read. */
export const single = (): boolean => isTouch() && innerWidth < innerHeight && innerWidth < 700;

/** The sheet's width as designed: the book, and the planets' room on its right once there are chapters. */
const sheetWidth = (dom: BookDom): number => SHEET_W + (dom.worldTabs.size > 0 ? SIDE_ROOM : 0);

/** The corners, which one page at a time also has between the two halves of a spread. */
export function updateCorners(model: BookModel, dom: BookDom): void {
  const one = single();
  dom.previous.hidden = model.spread === 0 && !(one && model.half === 1);
  dom.next.hidden = model.spread >= spreads(model) - 1 && !(one && model.half === 0);
}

/** The book as large as the window holds it, up to `MAX_SCALE` of its design. */
export function resize(model: BookModel, dom: BookDom): void {
  const { scaler, fit, panel } = dom;
  const width = sheetWidth(dom);
  const one = single();
  updateCorners(model, dom);
  panel.classList.toggle('single', one);
  panel.classList.toggle('half0', one && model.half === 0);
  panel.classList.toggle('half1', one && model.half === 1);
  scaler.style.width = `${width}px`;
  if (one) {
    // A page and a little of the spine, and the planets' room on the right page's side.
    const shown = BOOK_W / 2 + COVER_PAD + SIDE_ROOM + 12;
    const x0 = model.half === 0 ? SHEET_W / 2 + 12 - shown : SHEET_W / 2 - 12;
    const scale = Math.max(0.3, Math.min(MAX_SCALE, (innerWidth * FIT_WIDTH) / shown, (innerHeight * 0.85) / SHEET_H));
    scaler.style.transform = `scale(${scale.toFixed(4)}) translateX(${(-x0).toFixed(1)}px)`;
    fit.style.width = `${Math.round(shown * scale)}px`;
    fit.style.height = `${Math.round(SHEET_H * scale)}px`;
    return;
  }
  const scale = Math.max(0.3, Math.min(MAX_SCALE, (innerWidth * FIT_WIDTH) / width, (innerHeight * FIT_HEIGHT) / SHEET_H));
  scaler.style.transform = `scale(${scale.toFixed(4)})`;
  fit.style.width = `${Math.round(width * scale)}px`;
  fit.style.height = `${Math.round(SHEET_H * scale)}px`;
}
