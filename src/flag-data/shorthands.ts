/** Colours, layer shorthands and shared painters the flag specs are written with. */
import type { FlagSpec, Layer, Painter } from '../flags.ts';

export const TAU = Math.PI * 2;

export const WHITE = '#ffffff';
export const BLACK = '#000000';
/** The card cream, the one palette colour used as a field: see `nepal`. */
export const CREAM = '#fff2e8';
export const INK = '#1e0603';

/** Pan-Arab and pan-African, which between them account for some forty flags. */
export const RED = '#ce1126';
export const GREEN = '#007a3d';

export const UK_BLUE = '#012169';
export const UK_RED = '#c8102e';

// --- shorthands ------------------------------------------------------------

export const fill = (c: string): Layer => ({ t: 'fill', c });
export const h = (...c: string[]): Layer => ({ t: 'bands', d: 'h', c });
export const v = (...c: string[]): Layer => ({ t: 'bands', d: 'v', c });
export const hw = (c: string[], w: number[]): Layer => ({ t: 'bands', d: 'h', c, w });
export const vw = (c: string[], w: number[]): Layer => ({ t: 'bands', d: 'v', c, w });
export const rect = (x: number, y: number, w: number, ht: number, c: string): Layer => ({ t: 'rect', x, y, w, h: ht, c });
export const cross = (c: string, w: number, x?: number, y?: number, len?: number): Layer => ({ t: 'cross', c, w, x, y, len });
export const disc = (x: number, y: number, r: number, c: string): Layer => ({ t: 'disc', x, y, r, c });
export const ring = (x: number, y: number, r: number, w: number, c: string): Layer => ({ t: 'ring', x, y, r, w, c });
export const star = (x: number, y: number, r: number, c: string, n?: number, rot?: number): Layer => ({ t: 'star', x, y, r, c, n, rot });
export const stars = (x: number, y: number, rr: number, n: number, r: number, c: string, from?: number, to?: number): Layer =>
  ({ t: 'stars', x, y, rr, n, r, c, from, to });
export const crescent = (x: number, y: number, r: number, cut: number, dx: number, c: string): Layer =>
  ({ t: 'crescent', x, y, r, cut, dx, c });
export const sun = (x: number, y: number, r: number, n: number, len: number, c: string, spread?: number): Layer =>
  ({ t: 'sun', x, y, r, n, len, c, spread });
export const poly = (points: number[][], c: string): Layer => ({ t: 'poly', p: points, c });
export const draw = (f: (p: Painter) => void): Layer => ({ t: 'draw', f });

/** A triangle from the hoist, apex at mid-height. Twenty-odd flags have one. */
export const hoist = (w: number, c: string): Layer => poly([[0, 0], [w, 0.5], [0, 1]], c);

/** Nordic crosses all sit at the same offset from the hoist. */
export const NORDIC_X = 0.36;
export const nordic = (c: string, w: number): Layer => cross(c, w, NORDIC_X);

// --- shared painters -------------------------------------------------------

/**
 * A stand-in for a coat of arms: a heater shield, a rim, and nothing else. Used
 * wherever a flag's centrepiece is heraldry. Anything more would be invention.
 */
export function shieldPath(p: Painter, cx: number, cy: number, r: number): void {
  const { ctx } = p;
  const x = p.fx(cx);
  const y = p.fy(cy);
  const s = p.s(r);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.8, y - s);
  ctx.lineTo(x + s * 0.8, y - s);
  ctx.lineTo(x + s * 0.8, y + s * 0.25);
  ctx.quadraticCurveTo(x + s * 0.8, y + s, x, y + s * 1.15);
  ctx.quadraticCurveTo(x - s * 0.8, y + s, x - s * 0.8, y + s * 0.25);
  ctx.closePath();
}

export function shield(p: Painter, cx: number, cy: number, r: number, face: string, edge: string): void {
  const { ctx } = p;
  shieldPath(p, cx, cy, r);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = p.s(r * 0.16);
  ctx.strokeStyle = edge;
  ctx.stroke();
}

/**
 * The double-headed eagle, for Albania, Montenegro and Serbia. A silhouette
 * built from two wings, two necks and a tail: at 70 pixels wide that is what
 * the real one resolves to anyway.
 */
export function doubleEagle(p: Painter, cx: number, cy: number, r: number, c: string): void {
  const { ctx } = p;
  const x = p.fx(cx);
  const y = p.fy(cy);
  const s = p.s(r);
  ctx.fillStyle = c;
  // Body and tail, down the middle.
  ctx.beginPath();
  ctx.moveTo(x - s * 0.22, y - s * 0.22);
  ctx.lineTo(x + s * 0.22, y - s * 0.22);
  ctx.lineTo(x + s * 0.18, y + s * 0.40);
  ctx.lineTo(x + s * 0.40, y + s * 0.98);
  ctx.lineTo(x + s * 0.14, y + s * 0.86);
  ctx.lineTo(x, y + s * 1.0);
  ctx.lineTo(x - s * 0.14, y + s * 0.86);
  ctx.lineTo(x - s * 0.40, y + s * 0.98);
  ctx.lineTo(x - s * 0.18, y + s * 0.40);
  ctx.closePath();
  ctx.fill();
  for (const side of [-1, 1]) {
    // Wing: up and out from the shoulder, scalloped back down to the body.
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.18, y - s * 0.18);
    ctx.lineTo(x + side * s * 0.46, y - s * 0.50);
    ctx.lineTo(x + side * s * 0.92, y - s * 0.34);
    ctx.lineTo(x + side * s * 0.76, y - s * 0.10);
    ctx.lineTo(x + side * s * 0.94, y + s * 0.06);
    ctx.lineTo(x + side * s * 0.70, y + s * 0.22);
    ctx.lineTo(x + side * s * 0.82, y + s * 0.38);
    ctx.lineTo(x + side * s * 0.52, y + s * 0.48);
    ctx.lineTo(x + side * s * 0.20, y + s * 0.32);
    ctx.closePath();
    ctx.fill();
    // Neck, head and beak, turned outward. The heads carry the whole reading:
    // small ones make the bird look like a butterfly.
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.04, y - s * 0.22);
    ctx.quadraticCurveTo(x + side * s * 0.14, y - s * 0.66, x + side * s * 0.40, y - s * 0.74);
    ctx.lineTo(x + side * s * 0.50, y - s * 0.54);
    ctx.quadraticCurveTo(x + side * s * 0.28, y - s * 0.48, x + side * s * 0.26, y - s * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + side * s * 0.44, y - s * 0.76, s * 0.22, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.58, y - s * 0.88);
    ctx.lineTo(x + side * s * 1.02, y - s * 0.76);
    ctx.lineTo(x + side * s * 0.58, y - s * 0.62);
    ctx.closePath();
    ctx.fill();
  }
}

/** The Union Flag, drawn from its construction rather than from memory. */
export function unionJack(p: Painter): void {
  const { ctx } = p;
  p.fill(UK_BLUE);
  p.band(0, 0, 1, 1, 0.30, WHITE);
  p.band(1, 0, 0, 1, 0.30, WHITE);

  // The counterchange. Each red arm is offset perpendicular to its own
  // direction, always the same way round the flag, which is what gives the
  // design its 180-degree rotational symmetry and no mirror symmetry at all.
  // The test everyone knows: in the top hoist quadrant the broad white must be
  // *above* the red. Get the sign wrong and the flag flies upside down.
  const cx = p.fx(0.5);
  const cy = p.fy(0.5);
  for (const corner of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.fx(corner[0]! * 0.5), p.fy(corner[1]! * 0.5), p.w / 2, p.h / 2);
    ctx.clip();
    const dx = p.fx(corner[0]!) - cx;
    const dy = p.fy(corner[1]!) - cy;
    const len = Math.hypot(dx, dy);
    // perp = (dy, -dx): for the hoist-top arm that points left and down, which
    // puts the red below the centreline and the broad white above it.
    const ox = ((dy / len) * p.s(0.085));
    const oy = ((-dx / len) * p.s(0.085));
    ctx.beginPath();
    ctx.moveTo(cx + ox, cy + oy);
    ctx.lineTo(cx + dx * 1.2 + ox, cy + dy * 1.2 + oy);
    ctx.lineWidth = p.s(0.10);
    ctx.strokeStyle = UK_RED;
    ctx.stroke();
    ctx.restore();
  }

  p.layers([cross(WHITE, 0.34), cross(UK_RED, 0.20)]);
}

/** A British ensign: coloured field, union in the canton, badge in the fly. */
export const ensign = (field: string, ...badge: Layer[]): FlagSpec => [
  fill(field),
  { t: 'flag', k: 'GBR', x: 0, y: 0, w: 0.5, h: 0.5 },
  ...badge,
];

/**
 * The badge on a British ensign is always a coat of arms, and there are nine of
 * them in this dataset. A white roundel with a coloured charge is what they all
 * reduce to; the colour is the one thing about each that is legible.
 */
export const badge = (c: string): Layer[] => [
  disc(0.74, 0.48, 0.27, WHITE),
  draw((p) => shield(p, 0.74, 0.46, 0.18, c, INK)),
];

/**
 * The Sun of May, for Argentina and Uruguay: thirty-two rays alternating
 * straight and wavy. The wave is carried by the ray's length and width rather
 * than by an actual curve — at any size this gets drawn, a wavy ray and a
 * slightly longer straight one are the same handful of pixels. The human face
 * in the middle is the part that does not survive.
 */
export function sunOfMay(p: Painter, cx: number, cy: number, r: number, c: string): void {
  const { ctx } = p;
  const x = p.fx(cx);
  const y = p.fy(cy);
  ctx.fillStyle = c;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    const len = p.s(r * (i % 2 === 0 ? 2.35 : 1.95));
    const half = (Math.PI / 32) * (i % 2 === 0 ? 0.9 : 0.6);
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a - half) * p.s(r), y - Math.cos(a - half) * p.s(r));
    ctx.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len);
    ctx.lineTo(x + Math.sin(a + half) * p.s(r), y - Math.cos(a + half) * p.s(r));
    ctx.closePath();
    ctx.fill();
  }
  p.disc(cx, cy, r, c);
}

/**
 * A field whose hoist edge is a row of points, as on Bahrain's and Qatar's. The
 * count is the whole difference between those two flags.
 */
export function serrated(p: Painter, edge: number, count: number, depth: number, c: string): void {
  const path: number[][] = [[1, 0]];
  for (let i = 0; i <= count * 2; i++) {
    path.push([i % 2 === 0 ? edge : edge - depth, i / (count * 2)]);
  }
  path.push([1, 1]);
  p.poly(path, c);
}

/** Waves, for the two flags in this set that draw the sea. */
export function waves(p: Painter, top: number, rows: number, span: number, c: string, width: number): void {
  const { ctx } = p;
  ctx.strokeStyle = c;
  ctx.lineWidth = p.s(width);
  ctx.lineCap = 'round';
  for (let r = 0; r < rows; r++) {
    const y = top + (span * (r + 0.5)) / rows;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const x = i / 48;
      const yy = y + Math.sin(i * 0.52) * 0.035;
      if (i === 0) ctx.moveTo(p.fx(x), p.fy(yy));
      else ctx.lineTo(p.fx(x), p.fy(yy));
    }
    ctx.stroke();
  }
}
