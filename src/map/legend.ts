import { TAU, traceRocket } from '../cartography.ts';
import { COURSE_NAME, traceCourseBadge, traceRingMark } from '../course-marks.ts';
import type { CourseMarkKind } from '../course-marks.ts';
import { h } from '../ui.ts';
import { PAD_HEIGHT } from './constants.ts';
import { tracePinMark, traceYou } from './marks.ts';
import { ink, paper, pink, red, violet } from './palette.ts';
import type { WorldMapOptions } from './types.ts';

/** A key's swatch in CSS pixels: room for a pin, a badge or a ring at the sheet's own size, a little smaller. */
const KEY_W = 24;
const KEY_H = 22;

type Paint = (ctx: CanvasRenderingContext2D) => void;

/** One key: its mark drawn by the very function that draws it on the sheet, and what it is. */
function key(paint: Paint, label: string): HTMLElement {
  const ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const canvas = h('canvas', { width: String(KEY_W * ratio), height: String(KEY_H * ratio), 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineJoin = 'round';
    paint(ctx);
  }
  return h('div', {}, canvas, h('span', { text: label }));
}

const COURSE_KINDS: readonly CourseMarkKind[] = ['air', 'land', 'sea'];

/** The legend under the title: every kind of mark the sheet puts down, as it draws it. */
export function createLegend(options: WorldMapOptions): HTMLElement {
  const { monuments, surface } = options;
  const middle = KEY_W / 2;
  const keys: HTMLElement[] = [];
  if (monuments.length > 0 || surface === undefined) keys.push(key((ctx) => tracePinMark(ctx, middle, 19, paper, 1), 'Landmark'));
  else {
    // A world with no landmarks keys its towns instead: its sheet's pale squares.
    keys.push(key((ctx) => {
      ctx.fillStyle = paper;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.8;
      ctx.fillRect(middle - 5, 6, 10, 10);
      ctx.strokeRect(middle - 5, 6, 10, 10);
    }, 'Settlement'));
  }
  keys.push(key((ctx) => tracePinMark(ctx, middle, 19, violet, 1), 'Your marker'));
  keys.push(key((ctx) => traceYou(ctx, middle, 11, 0, 0.72), 'You'));
  if (options.peers !== undefined) {
    keys.push(key((ctx) => {
      ctx.beginPath();
      ctx.arc(middle, 11, 6, 0, TAU);
      ctx.fillStyle = pink;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }, 'Player'));
  }
  if (options.pads !== undefined) {
    keys.push(key((ctx) => {
      ctx.lineWidth = 1.6;
      traceRocket(ctx, middle, 19, PAD_HEIGHT * 0.95, paper, red, ink);
    }, 'Rocket pad'));
  }
  if (options.courseSites !== undefined) {
    for (const kind of COURSE_KINDS) keys.push(key((ctx) => traceCourseBadge(ctx, middle, 11, 8, kind), COURSE_NAME[kind]));
  }
  if (options.courseRing !== undefined) {
    keys.push(key((ctx) => traceRingMark(ctx, middle, 11, 6.5, false), 'Next ring'));
    keys.push(key((ctx) => traceRingMark(ctx, middle, 11, 6.5, true), 'Finish'));
  }
  return h('div', { class: 'atlas-map-legend', role: 'list', 'aria-label': 'Legend' }, ...keys.map((each) => {
    each.setAttribute('role', 'listitem');
    return each;
  }));
}
