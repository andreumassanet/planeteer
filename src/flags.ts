/**
 * Flags, drawn in code.
 *
 * No external assets is a rule of this repo, and flags are the place where that
 * rule bites hardest: the obvious implementation is 232 SVGs. So instead there
 * is a small vocabulary — bands, a canton, a cross, a disc, a triangle from the
 * hoist, a crescent, a star — and most of the world's flags are a handful of
 * those stacked in order. `flag-data.ts` holds the specs; this file paints them.
 *
 * A spec is a list of layers painted back to front. Coordinates are fractions
 * of the box, and the split matters:
 *
 * - `x` and any width are fractions of the flag's **width**.
 * - `y` and any height are fractions of the flag's **height**.
 * - radii, cross bars, band widths and star sizes are fractions of the
 *   **height**, so a disc stays a disc whatever the box's aspect ratio and a
 *   cross has square arms. This is the one rule worth remembering: get it
 *   backwards and every circle comes out an ellipse in a 3:2 box.
 *
 * Specs are authored for 3:2. They survive anything from 3:2 to 2:1; below 3:2
 * the hoist devices start to crowd.
 */
import { PALETTE } from './theme.ts';
import { FLAGS, FLAG_ALIAS, SIMPLIFIED } from './flag-data.ts';

const TAU = Math.PI * 2;

const css = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** A point in flag space: `[fraction of width, fraction of height]`. */
export type FlagPoint = readonly number[];

export type Layer =
  /** Flood the whole box. Almost every spec starts with one. */
  | { t: 'fill'; c: string }
  /** Stripes. `d` defaults to horizontal; `w` are relative weights. */
  | { t: 'bands'; d?: 'h' | 'v'; c: readonly string[]; w?: readonly number[] }
  | { t: 'rect'; x: number; y: number; w: number; h: number; c: string }
  /** A cross. `len` (height fractions) keeps the arms off the edges. */
  | { t: 'cross'; c: string; w: number; x?: number; y?: number; len?: number }
  | { t: 'saltire'; c: string; w: number }
  /** One diagonal band. `up` runs it from the lower hoist to the upper fly. */
  | { t: 'diag'; c: string; w: number; up?: boolean }
  | { t: 'disc'; x: number; y: number; r: number; c: string }
  | { t: 'ring'; x: number; y: number; r: number; w: number; c: string }
  | { t: 'star'; x: number; y: number; r: number; c: string; n?: number; rot?: number }
  /** `n` stars evenly spaced on a circle, or on the arc from `from` to `to`. */
  | { t: 'stars'; x: number; y: number; rr: number; n: number; r: number; c: string; from?: number; to?: number }
  /** Outer disc minus a disc offset by `dx`. Keep `dx + cut <= r`; see below. */
  | { t: 'crescent'; x: number; y: number; r: number; cut: number; dx: number; c: string }
  | { t: 'poly'; p: readonly FlagPoint[]; c: string }
  | { t: 'sun'; x: number; y: number; r: number; n: number; len: number; c: string; spread?: number }
  /** Another flag, scaled into a sub-box. This is how the union canton works. */
  | { t: 'flag'; k: string; x: number; y: number; w: number; h: number }
  /** The escape hatch, for the ones the vocabulary cannot honestly reach. */
  | { t: 'draw'; f: (p: Painter) => void };

export type FlagSpec = readonly Layer[];

/** What a `draw` layer gets. Everything is in flag-space fractions. */
export interface Painter {
  ctx: CanvasRenderingContext2D;
  /** The box in pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fraction of the width to a pixel x. */
  fx(u: number): number;
  /** Fraction of the height to a pixel y. */
  fy(v: number): number;
  /** Fraction of the height to a length in pixels. Radii and widths use this. */
  s(k: number): number;
  fill(c: string): void;
  rect(x: number, y: number, w: number, h: number, c: string): void;
  poly(points: readonly FlagPoint[], c: string): void;
  /** Builds the path and stops, for callers that want to stroke it. */
  polyPath(points: readonly FlagPoint[]): void;
  disc(x: number, y: number, r: number, c: string): void;
  ring(x: number, y: number, r: number, w: number, c: string): void;
  star(x: number, y: number, r: number, c: string, n?: number, rot?: number): void;
  starPath(x: number, y: number, r: number, n: number, rot: number): void;
  stars(x: number, y: number, rr: number, n: number, r: number, c: string, from?: number, to?: number): void;
  crescent(x: number, y: number, r: number, cut: number, dx: number, c: string): void;
  sun(x: number, y: number, r: number, n: number, len: number, c: string, spread?: number): void;
  /** A thick line between two points. Width is a fraction of the height. */
  band(x1: number, y1: number, x2: number, y2: number, w: number, c: string): void;
  layers(spec: FlagSpec): void;
  /** Paints another flag into a sub-box, clipped. */
  flag(key: string, x: number, y: number, w: number, h: number): void;
}

/**
 * The inner radius of a star, as a fraction of the outer one. Five points get
 * the true pentagram value; more points get a blunter star, which is what the
 * many-rayed ones (Turkmenistan's, the Marshall Islands') actually look like.
 */
function starRatio(n: number): number {
  if (n === 5) return 0.381966;
  if (n <= 7) return 0.5;
  return 0.62;
}

function makePainter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): Painter {
  const fx = (u: number): number => x + u * w;
  const fy = (v: number): number => y + v * h;
  const s = (k: number): number => k * h;

  const polyPath = (points: readonly FlagPoint[]): void => {
    ctx.beginPath();
    points.forEach((point, i) => {
      const px = fx(point[0]!);
      const py = fy(point[1]!);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  };

  const starPath = (cx: number, cy: number, r: number, n: number, rot: number): void => {
    const outer = s(r);
    const inner = outer * starRatio(n);
    const px = fx(cx);
    const py = fy(cy);
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i * Math.PI) / n;
      const rad = i % 2 === 0 ? outer : inner;
      const vx = px + Math.sin(a) * rad;
      const vy = py - Math.cos(a) * rad;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
  };

  const p: Painter = {
    ctx,
    x,
    y,
    w,
    h,
    fx,
    fy,
    s,
    fill(c) {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    },
    rect(rx, ry, rw, rh, c) {
      ctx.fillStyle = c;
      ctx.fillRect(fx(rx), fy(ry), rw * w, rh * h);
    },
    poly(points, c) {
      polyPath(points);
      ctx.fillStyle = c;
      ctx.fill();
    },
    polyPath,
    disc(cx, cy, r, c) {
      ctx.beginPath();
      ctx.arc(fx(cx), fy(cy), s(r), 0, TAU);
      ctx.fillStyle = c;
      ctx.fill();
    },
    ring(cx, cy, r, width, c) {
      ctx.beginPath();
      ctx.arc(fx(cx), fy(cy), s(r), 0, TAU);
      ctx.lineWidth = s(width);
      ctx.strokeStyle = c;
      ctx.stroke();
    },
    star(cx, cy, r, c, n = 5, rot = 0) {
      starPath(cx, cy, r, n, rot);
      ctx.fillStyle = c;
      ctx.fill();
    },
    starPath,
    stars(cx, cy, rr, n, r, c, from = 0, to = TAU) {
      // A full circle has no gap between the first and last star, an arc does.
      const full = Math.abs(to - from - TAU) < 1e-6;
      const step = full ? (to - from) / n : (to - from) / (n - 1);
      for (let i = 0; i < n; i++) {
        const a = from + i * step;
        // The ring is measured in height units in both axes, so it stays round.
        p.star(cx + (Math.sin(a) * s(rr)) / w, cy - (Math.cos(a) * s(rr)) / h, r, c);
      }
    },
    crescent(cx, cy, r, cut, dx, c) {
      // Two subpaths wound in opposite directions: the non-zero rule fills the
      // difference. It only works while the cutting disc stays inside the outer
      // one (`dx + cut <= r`); poke it out of the far side and the part outside
      // picks up a winding of -1 and fills in solid.
      ctx.beginPath();
      ctx.arc(fx(cx), fy(cy), s(r), 0, TAU, false);
      ctx.arc(fx(cx) + s(dx), fy(cy), s(cut), 0, TAU, true);
      ctx.fillStyle = c;
      ctx.fill();
    },
    sun(cx, cy, r, n, len, c, spread = 0.42) {
      const px = fx(cx);
      const py = fy(cy);
      const inner = s(r);
      const outer = s(r + len);
      ctx.fillStyle = c;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const half = ((Math.PI / n) * spread) / 2;
        ctx.moveTo(px + Math.sin(a - half) * inner, py - Math.cos(a - half) * inner);
        ctx.lineTo(px + Math.sin(a) * outer, py - Math.cos(a) * outer);
        ctx.lineTo(px + Math.sin(a + half) * inner, py - Math.cos(a + half) * inner);
        ctx.closePath();
      }
      ctx.fill();
      if (r > 0) p.disc(cx, cy, r, c);
    },
    band(x1, y1, x2, y2, width, c) {
      ctx.beginPath();
      ctx.moveTo(fx(x1), fy(y1));
      ctx.lineTo(fx(x2), fy(y2));
      ctx.lineWidth = s(width);
      ctx.lineCap = 'square';
      ctx.strokeStyle = c;
      ctx.stroke();
    },
    layers(spec) {
      for (const layer of spec) paint(p, layer);
    },
    flag(key, sx, sy, sw, sh) {
      drawFlagAt(ctx, key, fx(sx), fy(sy), sw * w, sh * h);
    },
  };
  return p;
}

function paint(p: Painter, l: Layer): void {
  const { ctx } = p;
  switch (l.t) {
    case 'fill':
      p.fill(l.c);
      return;
    case 'bands': {
      const weights = l.w ?? l.c.map(() => 1);
      const total = weights.reduce((a, b) => a + b, 0);
      let at = 0;
      l.c.forEach((colour, i) => {
        const size = (weights[i] ?? 1) / total;
        // Overlap by a hair: neighbouring fills antialias their shared edge and
        // leave a pale seam otherwise, which on a flag reads as a stripe.
        if (l.d === 'v') p.rect(at, 0, size + 0.002, 1, colour);
        else p.rect(0, at, 1, size + 0.002, colour);
        at += size;
      });
      return;
    }
    case 'rect':
      p.rect(l.x, l.y, l.w, l.h, l.c);
      return;
    case 'cross': {
      const t = p.s(l.w);
      const cx = p.fx(l.x ?? 0.5);
      const cy = p.fy(l.y ?? 0.5);
      ctx.fillStyle = l.c;
      if (l.len === undefined) {
        ctx.fillRect(p.x, cy - t / 2, p.w, t);
        ctx.fillRect(cx - t / 2, p.y, t, p.h);
      } else {
        const len = p.s(l.len);
        ctx.fillRect(cx - len / 2, cy - t / 2, len, t);
        ctx.fillRect(cx - t / 2, cy - len / 2, t, len);
      }
      return;
    }
    case 'saltire':
      p.band(0, 0, 1, 1, l.w, l.c);
      p.band(1, 0, 0, 1, l.w, l.c);
      return;
    case 'diag':
      if (l.up) p.band(0, 1, 1, 0, l.w, l.c);
      else p.band(0, 0, 1, 1, l.w, l.c);
      return;
    case 'disc':
      p.disc(l.x, l.y, l.r, l.c);
      return;
    case 'ring':
      p.ring(l.x, l.y, l.r, l.w, l.c);
      return;
    case 'star':
      p.star(l.x, l.y, l.r, l.c, l.n ?? 5, l.rot ?? 0);
      return;
    case 'stars':
      p.stars(l.x, l.y, l.rr, l.n, l.r, l.c, l.from, l.to);
      return;
    case 'crescent':
      p.crescent(l.x, l.y, l.r, l.cut, l.dx, l.c);
      return;
    case 'poly':
      p.poly(l.p, l.c);
      return;
    case 'sun':
      p.sun(l.x, l.y, l.r, l.n, l.len, l.c, l.spread);
      return;
    case 'flag':
      p.flag(l.k, l.x, l.y, l.w, l.h);
      return;
    case 'draw':
      l.f(p);
  }
}

/**
 * The key is a country's `iso` straight out of `countries.json`, and nothing
 * else: Natural Earth leaves `ISO_A3` as `-99` for a dozen features, so the
 * bake falls back to `ADM0_A3`, which is present on every feature and unique.
 * `pnpm check` asserts that uniqueness, so a flag can be looked up by code with
 * no disambiguation layer in between. The non-ISO codes it produces are still
 * codes worth keying on: `CYN` Northern Cyprus, `SOL` Somaliland, `IOA` the
 * Indian Ocean Territories, `KAS` the Siachen Glacier. The last of those flies
 * nobody's flag and draws the plate on purpose; see `NO_FLAG`.
 */

/** Resolves aliases: territories that officially fly another country's flag. */
function resolve(key: string): string {
  return FLAG_ALIAS[key] ?? key;
}

export function hasFlag(key: string): boolean {
  return resolve(key) in FLAGS;
}

/**
 * True where the field and the main devices are right but a coat of arms has
 * been reduced to a mark. Useful for reporting honest coverage; the contact
 * sheet tags them.
 */
export function isSimplified(key: string): boolean {
  return SIMPLIFIED.has(resolve(key));
}

export interface FlagOptions {
  /** Field colour for the fallback plate. Defaults to bone from the palette. */
  tint?: string;
  /** What the fallback plate says. Defaults to the key. */
  label?: string;
}

/**
 * The fallback, for the places that have no flag to draw: a flat plate in a
 * palette colour with the code stamped on it. Deliberately not a flag — the
 * point is that it should be obvious it is standing in for one, rather than
 * looking like a flag that came out wrong.
 */
function drawPlate(p: Painter, label: string, tint: string): void {
  const { ctx } = p;
  p.fill(tint);
  ctx.save();
  ctx.fillStyle = css(PALETTE.ink);
  ctx.globalAlpha = 0.45;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${p.s(0.3).toFixed(1)}px ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(label, p.fx(0.5), p.fy(0.54));
  ctx.restore();
}

/** Paints a flag into an arbitrary box. The box is clipped, always. */
export function drawFlagAt(
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: FlagOptions = {},
): void {
  const spec = FLAGS[resolve(key)];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const p = makePainter(ctx, x, y, w, h);
  if (spec) p.layers(spec);
  else drawPlate(p, options.label ?? key, options.tint ?? css(PALETTE.bone));
  ctx.restore();
}

/**
 * The one every caller wants: paint the flag at the origin of the context, in a
 * `w` by `h` box. Draws no border — the caller owns the ink line, because the
 * HUD chip, the contact sheet and (later) a flagpole texture all want a
 * different one.
 */
export function drawFlag(
  ctx: CanvasRenderingContext2D,
  iso: string,
  w: number,
  h: number,
  options: FlagOptions = {},
): void {
  drawFlagAt(ctx, iso, 0, 0, w, h, options);
}

/** A ready-made canvas, sized for the screen it will be shown on. */
export function createFlagCanvas(
  key: string,
  w: number,
  h: number,
  options: FlagOptions = {},
): HTMLCanvasElement {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) drawFlag(ctx, key, canvas.width, canvas.height, options);
  return canvas;
}
