/**
 * One flat colour per country, taken from that country's own flag, and no two
 * that touch alike.
 *
 * **This replaced a drawn flag and the reason is worth keeping.**
 * `land-flags.ts` used to rasterise each flag and sample it per land triangle,
 * so the map you climbed into carried the real design — bands, crosses, a disc
 * for Japan. It worked, and you could not tell the flags apart: from 2,500
 * units a country is a few hundred pixels of an irregular shape, the bands run
 * at constant latitude across whatever the outline happens to be, and two
 * red-and-white flags side by side are two red-and-white smudges. A political
 * map does not draw flags, it fills each country with a colour, and that is
 * what this file computes.
 *
 * The colour still *means* something, which is the whole of the design:
 *
 * - **It comes from the flag.** Spain is red, France blue, Brazil green, Japan
 *   red. Nobody has to be told the rule for it to feel right, and a colour
 *   chosen by hand for 234 countries would be 234 chances to disagree with the
 *   flag the HUD chip is drawing at the same moment.
 * - **It is derived, not typed.** `flag-data.ts` already holds every flag as
 *   vector layers, so the dominant colour is a property of the data and moves
 *   with it. See `flagPalette` and `flagColor`.
 * - **Two countries that touch are never the same colour.** That is the one
 *   thing a flag-derived palette cannot promise on its own, and it is not close
 *   to promising it: taken raw, **111 of the planet's 323 land frontiers have
 *   the same colour on both sides** by the threshold below, and five of those
 *   are the same three bytes — Algeria and Mauritania, Libya and Tunisia,
 *   Bolivia and Chile, Bolivia and Paraguay, Jordan and Palestine (2026-09-08).
 *   The pan-Arab, the pan-African and the pan-Slavic families are what that is.
 *   So there is a de-conflict pass over the adjacency, and it moves the
 *   *smaller* country, because the larger one is the one being read. See
 *   `countryColors`.
 *
 * What it comes to (2026-09-08, over the 232 countries `flag-data.ts` has a
 * spec for): **77 move off their flag's own colour and 155 do not, 8 of the 77
 * take a different colour of the same flag rather than a version of the first,
 * and all 323 land frontiers on the planet clear the threshold** — the closest
 * surviving pair being Colombia and Venezuela, two golds of a broken empire, at
 * exactly it.
 *
 * **Nothing here touches a canvas**, which is what makes the answer the same on
 * every machine and what would let a headless check verify the table: a canvas
 * antialiases, and two browsers do not have to agree on how. The spec is read
 * as geometry instead — see `flagPalette`.
 */
import type { World } from './geo.ts';
import { insideRing } from './geo.ts';
import { FLAGS, FLAG_ALIAS } from './flag-data.ts';
import type { FlagPoint, FlagSpec, Layer, Painter } from './flags.ts';

/** sRGB, three bytes, the space `flag-data.ts` writes its colours in. */
export type RGB = readonly [number, number, number];

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// --- OKLab ------------------------------------------------------------------

/**
 * OKLab, because "too close" has to be a perceptual question and sRGB bytes
 * cannot answer it.
 *
 * The de-conflict pass needs a distance, and the obvious one — the Euclidean
 * gap between two `#rrggbb` triples — is wrong in both directions at once: it
 * calls blue and green further apart than they look and it calls two dark
 * greens nearly identical when the eye separates them easily. OKLab is Björn
 * Ottosson's 2020 fit, it is twenty lines of matrix with no table and no
 * dependency, and one unit of `L` is the whole black-to-white range — so a
 * threshold in it is a number anyone can reason about. CIELAB would do as well
 * and is four times the arithmetic.
 *
 * The input is **sRGB bytes**, so it linearises on the way in. That is the
 * space the flag specs are written in and the space a browser would paint them
 * in; `land-flags.ts` converts to linear separately for the attribute, because
 * the attribute is what the card multiplies and this is what the eye compares.
 */
export interface Oklab {
  L: number;
  a: number;
  b: number;
}

/**
 * sRGB byte to linear, as a table.
 *
 * `toOklab` only ever takes bytes, so there are 256 answers and a `pow` is
 * three of them per colour. The de-conflict converts about 60,000 candidates
 * (each one out of OKLab and straight back in, to see what the gamut clamp did
 * to it), so this is three `pow` calls apiece against a table lookup.
 */
const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  LINEAR[i] = t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
}

const gamma = (linear: number): number => {
  const v = clamp01(linear);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
};

export function toOklab([r, g, b]: RGB): Oklab {
  const R = LINEAR[r]!;
  const G = LINEAR[g]!;
  const B = LINEAR[b]!;
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/**
 * And back, clamped to the gamut and rounded to bytes.
 *
 * The rounding is not a detail: a nudged colour is only ever shipped as three
 * bytes, so the distance that decides whether the nudge was enough has to be
 * measured on the bytes and not on the float that produced them. Every
 * candidate in `countryColors` goes through here before it is judged.
 */
export function fromOklab({ L, a, b }: Oklab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const R = gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const G = gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const B = gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return [Math.round(R * 255), Math.round(G * 255), Math.round(B * 255)];
}

/** How far apart two colours look, in OKLab units. 1.0 is black to white. */
export function distance(one: Oklab, two: Oklab): number {
  return Math.hypot(one.L - two.L, one.a - two.a, one.b - two.b);
}

/** Chroma: how much colour there is at all. Grey, white and black are 0. */
const chroma = ({ a, b }: Oklab): number => Math.hypot(a, b);

// --- reading a flag ---------------------------------------------------------

/**
 * The box the spec is read in.
 *
 * `flags.ts` says the specs are authored for 3:2 and that lengths split two
 * ways: `x` and widths are fractions of the **width**, `y`, heights, radii,
 * band widths and star sizes are fractions of the **height**. Reading in a box
 * of 1.5 by 1 keeps that split right with no aspect factor anywhere in this
 * file, because the box *is* the aspect.
 */
const BOX_W = 1.5;
const BOX_H = 1;

/**
 * How finely the flag is sampled: 120 by 80 points, 9,600 of them.
 *
 * The question is "which colour covers the most", and the smallest thing that
 * could win it is a band a ninth of the flag (Greece's stripes, Uruguay's).
 * That band is 1,066 samples here, so its area is known to a tenth of a
 * percent. What the grid cannot do is split a band exactly: three equal bands
 * over 80 rows come out 27, 26 and 27, which is why the choice below has a tie
 * window in it rather than an exact comparison.
 */
const SAMPLES_X = 120;
const SAMPLES_Y = 80;

/**
 * A shape the spec paints, with the box it lives in.
 *
 * The box is not an optimisation of last resort, it is what makes this
 * affordable at all: a flag is a field with charges on it, and the charges — 50
 * stars, 24 spokes, a scattered constellation — are most of the shapes and a
 * fiftieth of the area each. Rejecting on four comparisons before calling the
 * shape test takes reading all 228 flags from **370 ms to 133** (2026-09-08,
 * this machine, median of five).
 */
interface Mark {
  c: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The exact test, and the clip if the layer was painted under one. */
  hit(x: number, y: number): boolean;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Point in polygon, even-odd, on a polygon already in box units. */
function inPolygon(points: readonly number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a[1]! > y !== b[1]! > y && x < ((b[0]! - a[0]!) * (y - a[1]!)) / (b[1]! - a[1]!) + a[0]!) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonBox(points: readonly number[][]): Box {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of points) {
    if (p[0]! < west) west = p[0]!;
    if (p[0]! > east) east = p[0]!;
    if (p[1]! < south) south = p[1]!;
    if (p[1]! > north) north = p[1]!;
  }
  return { x: west, y: south, w: east - west, h: north - south };
}

/** The star `flags.ts` draws, as a polygon: outer and inner points alternating. */
function starPolygon(cx: number, cy: number, outer: number, n: number, rot: number): number[][] {
  const inner = outer * (n === 5 ? 0.381966 : n <= 7 ? 0.5 : 0.62);
  const points: number[][] = [];
  for (let i = 0; i < n * 2; i++) {
    const angle = rot + (i * Math.PI) / n;
    const r = i % 2 === 0 ? outer : inner;
    points.push([cx + Math.sin(angle) * r, cy - Math.cos(angle) * r]);
  }
  return points;
}

/** A stroked segment with a square cap: the rectangle `Painter.band` fills. */
function inBand(x1: number, y1: number, x2: number, y2: number, width: number, x: number, y: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const along = ((x - x1) * dx + (y - y1) * dy) / length;
  const across = ((x - x1) * -dy + (y - y1) * dx) / length;
  return along >= -width / 2 && along <= length + width / 2 && Math.abs(across) <= width / 2;
}

/**
 * The path a `draw` layer builds straight on the context.
 *
 * A `draw` layer is the spec vocabulary's escape hatch and about forty flags
 * use one, so a reader that ignored the raw context would have nothing to say
 * about Korea (whose taegeuk is four arcs), Nepal (a filled pennant) or the
 * United States (whose whole spec is one `draw`). What is modelled is
 * therefore **fills and clips**, with a transform stack under them, and what is
 * not is **strokes** — which is the "ignore thin outlines" rule with a sharp
 * edge on it, because on a flag a stroke is an outline, a fimbriation or a
 * spoke and never a field.
 *
 * Curves are flattened coarsely — an arc to sixteen segments, a quadratic to
 * four — because this is an area measurement and half a percent of a charge is
 * nothing.
 */
class PathRecorder {
  points: number[][] = [];
  /** `[a, b, c, d, e, f]`, the 2 by 3 the context keeps, and its stack. */
  private m: number[] = [1, 0, 0, 1, 0, 0];
  private stack: number[][] = [];
  private startX = 0;
  private startY = 0;

  save(): void {
    this.stack.push(this.m.slice());
  }
  restore(): void {
    this.m = this.stack.pop() ?? [1, 0, 0, 1, 0, 0];
  }
  translate(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.m as [number, number, number, number, number, number];
    this.m = [a, b, c, d, e + a * x + c * y, f + b * x + d * y];
  }
  rotate(angle: number): void {
    const [a, b, c, d, e, f] = this.m as [number, number, number, number, number, number];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.m = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f];
  }
  private at(x: number, y: number): number[] {
    const [a, b, c, d, e, f] = this.m as [number, number, number, number, number, number];
    return [a * x + c * y + e, b * x + d * y + f];
  }

  reset(): void {
    this.points = [];
  }
  move(x: number, y: number): void {
    const p = this.at(x, y);
    this.startX = p[0]!;
    this.startY = p[1]!;
    this.points.push(p);
  }
  line(x: number, y: number): void {
    this.points.push(this.at(x, y));
  }
  quadratic(cx: number, cy: number, x: number, y: number): void {
    const from = this.points[this.points.length - 1] ?? this.at(cx, cy);
    const control = this.at(cx, cy);
    const to = this.at(x, y);
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      const u = 1 - t;
      this.points.push([
        u * u * from[0]! + 2 * u * t * control[0]! + t * t * to[0]!,
        u * u * from[1]! + 2 * u * t * control[1]! + t * t * to[1]!,
      ]);
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, from: number, to: number): void {
    for (let i = 0; i <= 16; i++) {
      const angle = from + ((to - from) * i) / 16;
      this.points.push(this.at(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry));
    }
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.points.push(this.at(x, y), this.at(x + w, y), this.at(x + w, y + h), this.at(x, y + h));
  }
  close(): void {
    this.points.push([this.startX, this.startY]);
  }
  /** The path as it stands, or null if there is not enough of one to fill. */
  shape(): number[][] | null {
    return this.points.length >= 3 ? this.points.slice() : null;
  }
}

type Clip = { test(x: number, y: number): boolean; box: Box } | null;

/**
 * Walks a spec and hands back every shape it paints, in paint order.
 *
 * A `draw` layer is *run*, against a recorder that answers the whole `Painter`
 * interface by appending shapes instead of filling them. That is what keeps the
 * United States and the United Kingdom in the table at all: both are a single
 * `draw`, and a reader that only understood the declarative layers would have
 * nothing to say about either.
 */
function collect(spec: FlagSpec, box: Box, out: Mark[]): void {
  const fx = (u: number): number => box.x + u * box.w;
  const fy = (v: number): number => box.y + v * box.h;
  const s = (k: number): number => k * box.h;

  /** The clip a `draw` layer can push with `ctx.save` / `ctx.clip`. */
  let clip: Clip = null;
  const clipStack: Clip[] = [];
  const path = new PathRecorder();

  const push = (c: string, shape: Box, hit: (x: number, y: number) => boolean): void => {
    // Clipped to the flag's own box, which is what `drawFlagAt` does, and to
    // the clip if there is one — so a mark's box is already the answer for
    // everything outside it.
    const west = Math.max(box.x, shape.x, clip?.box.x ?? -Infinity);
    const south = Math.max(box.y, shape.y, clip?.box.y ?? -Infinity);
    const east = Math.min(box.x + box.w, shape.x + shape.w, clip === null ? Infinity : clip.box.x + clip.box.w);
    const north = Math.min(box.y + box.h, shape.y + shape.h, clip === null ? Infinity : clip.box.y + clip.box.h);
    if (east <= west || north <= south) return;
    const mask = clip;
    out.push({
      c,
      x0: west,
      y0: south,
      x1: east,
      y1: north,
      hit: mask === null ? hit : (x, y) => mask.test(x, y) && hit(x, y),
    });
  };

  const polyMark = (points: readonly FlagPoint[], c: string): void => {
    const flat = points.map((p) => [fx(p[0]!), fy(p[1]!)]);
    push(c, polygonBox(flat), (x, y) => inPolygon(flat, x, y));
  };

  const starMark = (cx: number, cy: number, r: number, c: string, n: number, rot: number): void => {
    const flat = starPolygon(fx(cx), fy(cy), s(r), n, rot);
    push(c, polygonBox(flat), (x, y) => inPolygon(flat, x, y));
  };

  const discMark = (px: number, py: number, radius: number, c: string): void => {
    push(c, { x: px - radius, y: py - radius, w: radius * 2, h: radius * 2 }, (x, y) =>
      Math.hypot(x - px, y - py) <= radius);
  };

  /** What `ctx.fill` and `ctx.fillRect` are painting with, as the spec set it. */
  const state = { fillStyle: '#000000' };

  const fillPath = (): void => {
    const shape = path.shape();
    if (shape === null) return;
    push(state.fillStyle, polygonBox(shape), (x, y) => inPolygon(shape, x, y));
  };

  const painter: Painter = {
    ctx: new Proxy(
      {
        ...state,
        beginPath: () => path.reset(),
        moveTo: (x: number, y: number) => path.move(x, y),
        lineTo: (x: number, y: number) => path.line(x, y),
        quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => path.quadratic(cx, cy, x, y),
        arc: (x: number, y: number, r: number, from: number, to: number) => path.ellipse(x, y, r, r, from, to),
        ellipse: (x: number, y: number, rx: number, ry: number, _rot: number, from: number, to: number) =>
          path.ellipse(x, y, rx, ry, from, to),
        rect: (x: number, y: number, w: number, h: number) => path.rect(x, y, w, h),
        closePath: () => path.close(),
        fill: () => fillPath(),
        fillRect: (x: number, y: number, w: number, h: number) => {
          path.reset();
          path.rect(x, y, w, h);
          fillPath();
        },
        save: () => {
          clipStack.push(clip);
          path.save();
        },
        restore: () => {
          clip = clipStack.length > 0 ? clipStack.pop()! : null;
          path.restore();
        },
        translate: (x: number, y: number) => path.translate(x, y),
        rotate: (angle: number) => path.rotate(angle),
        clip: () => {
          const shape = path.shape();
          if (shape === null) return;
          const inner = { test: (x: number, y: number) => inPolygon(shape, x, y), box: polygonBox(shape) };
          const outer = clip;
          clip =
            outer === null
              ? inner
              : {
                  test: (x, y) => outer.test(x, y) && inner.test(x, y),
                  box: inner.box,
                };
        },
      },
      // A spec may reach for any part of a 2D context. Everything not modelled
      // above is a no-op read and a swallowed write, which is the difference
      // between a flag with an unread charge and a flag with no colour at all.
      {
        get: (target, key) => (key in target ? target[key as keyof typeof target] : () => undefined),
        set: (target, key, value) => {
          if (key === 'fillStyle' && typeof value === 'string') state.fillStyle = value;
          Reflect.set(target, key, value);
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fx,
    fy,
    s,
    fill(c) {
      push(c, box, () => true);
    },
    rect(rx, ry, rw, rh, c) {
      const x0 = fx(rx);
      const y0 = fy(ry);
      push(c, { x: x0, y: y0, w: rw * box.w, h: rh * box.h }, (x, y) =>
        x >= x0 && x < x0 + rw * box.w && y >= y0 && y < y0 + rh * box.h);
    },
    poly: polyMark,
    polyPath(points) {
      path.reset();
      points.forEach((p, i) => (i === 0 ? path.move(fx(p[0]!), fy(p[1]!)) : path.line(fx(p[0]!), fy(p[1]!))));
      path.close();
    },
    disc(cx, cy, r, c) {
      discMark(fx(cx), fy(cy), s(r), c);
    },
    ring(cx, cy, r, width, c) {
      const px = fx(cx);
      const py = fy(cy);
      const radius = s(r);
      const half = s(width) / 2;
      push(c, { x: px - radius - half, y: py - radius - half, w: (radius + half) * 2, h: (radius + half) * 2 }, (x, y) =>
        Math.abs(Math.hypot(x - px, y - py) - radius) <= half);
    },
    star(cx, cy, r, c, n = 5, rot = 0) {
      starMark(cx, cy, r, c, n, rot);
    },
    starPath(cx, cy, r, n, rot) {
      path.points = starPolygon(fx(cx), fy(cy), s(r), n, rot);
    },
    stars(cx, cy, rr, n, r, c, from = 0, to = TAU) {
      const full = Math.abs(to - from - TAU) < 1e-6;
      const step = full ? (to - from) / n : (to - from) / (n - 1);
      for (let i = 0; i < n; i++) {
        const angle = from + i * step;
        starMark(cx + (Math.sin(angle) * s(rr)) / box.w, cy - (Math.cos(angle) * s(rr)) / box.h, r, c, 5, 0);
      }
    },
    crescent(cx, cy, r, cut, dx, c) {
      const px = fx(cx);
      const py = fy(cy);
      const outer = s(r);
      const inner = s(cut);
      const offset = s(dx);
      push(c, { x: px - outer, y: py - outer, w: outer * 2, h: outer * 2 }, (x, y) =>
        Math.hypot(x - px, y - py) <= outer && Math.hypot(x - px - offset, y - py) > inner);
    },
    sun(cx, cy, r, n, len, c, spread = 0.42) {
      const px = fx(cx);
      const py = fy(cy);
      const inner = s(r);
      const outer = s(r + len);
      const rays: number[][][] = [];
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * TAU;
        const half = ((Math.PI / n) * spread) / 2;
        rays.push([
          [px + Math.sin(angle - half) * inner, py - Math.cos(angle - half) * inner],
          [px + Math.sin(angle) * outer, py - Math.cos(angle) * outer],
          [px + Math.sin(angle + half) * inner, py - Math.cos(angle + half) * inner],
        ]);
      }
      push(c, { x: px - outer, y: py - outer, w: outer * 2, h: outer * 2 }, (x, y) => {
        if (inner > 0 && Math.hypot(x - px, y - py) <= inner) return true;
        for (const ray of rays) if (inPolygon(ray, x, y)) return true;
        return false;
      });
    },
    band(x1, y1, x2, y2, width, c) {
      const ax = fx(x1);
      const ay = fy(y1);
      const bx = fx(x2);
      const by = fy(y2);
      const t = s(width);
      push(
        c,
        {
          x: Math.min(ax, bx) - t,
          y: Math.min(ay, by) - t,
          w: Math.abs(bx - ax) + t * 2,
          h: Math.abs(by - ay) + t * 2,
        },
        (x, y) => inBand(ax, ay, bx, by, t, x, y),
      );
    },
    layers(inner) {
      for (const layer of inner) mark(layer);
    },
    flag(key, sx, sy, sw, sh) {
      const inner = FLAGS[resolve(key)];
      if (inner !== undefined) {
        collect(inner, { x: fx(sx), y: fy(sy), w: sw * box.w, h: sh * box.h }, out);
      }
    },
  };

  const mark = (layer: Layer): void => {
    switch (layer.t) {
      case 'fill':
        painter.fill(layer.c);
        return;
      case 'bands': {
        const weights = layer.w ?? layer.c.map(() => 1);
        const total = weights.reduce((a, b) => a + b, 0);
        let at = 0;
        layer.c.forEach((colour, i) => {
          const size = (weights[i] ?? 1) / total;
          if (layer.d === 'v') painter.rect(at, 0, size, 1, colour);
          else painter.rect(0, at, 1, size, colour);
          at += size;
        });
        return;
      }
      case 'rect':
        painter.rect(layer.x, layer.y, layer.w, layer.h, layer.c);
        return;
      case 'cross': {
        const cx = fx(layer.x ?? 0.5);
        const cy = fy(layer.y ?? 0.5);
        const half = s(layer.w) / 2;
        const arm = layer.len === undefined ? Infinity : s(layer.len) / 2;
        const reach = layer.len === undefined ? box : { x: cx - arm, y: cy - arm, w: arm * 2, h: arm * 2 };
        push(layer.c, reach, (x, y) =>
          (Math.abs(y - cy) <= half && Math.abs(x - cx) <= arm) ||
          (Math.abs(x - cx) <= half && Math.abs(y - cy) <= arm));
        return;
      }
      case 'saltire':
        painter.band(0, 0, 1, 1, layer.w, layer.c);
        painter.band(1, 0, 0, 1, layer.w, layer.c);
        return;
      case 'diag':
        if (layer.up) painter.band(0, 1, 1, 0, layer.w, layer.c);
        else painter.band(0, 0, 1, 1, layer.w, layer.c);
        return;
      case 'disc':
        painter.disc(layer.x, layer.y, layer.r, layer.c);
        return;
      case 'ring':
        painter.ring(layer.x, layer.y, layer.r, layer.w, layer.c);
        return;
      case 'star':
        painter.star(layer.x, layer.y, layer.r, layer.c, layer.n ?? 5, layer.rot ?? 0);
        return;
      case 'stars':
        painter.stars(layer.x, layer.y, layer.rr, layer.n, layer.r, layer.c, layer.from, layer.to);
        return;
      case 'crescent':
        painter.crescent(layer.x, layer.y, layer.r, layer.cut, layer.dx, layer.c);
        return;
      case 'poly':
        painter.poly(layer.p, layer.c);
        return;
      case 'sun':
        painter.sun(layer.x, layer.y, layer.r, layer.n, layer.len, layer.c, layer.spread);
        return;
      case 'flag':
        painter.flag(layer.k, layer.x, layer.y, layer.w, layer.h);
        return;
      case 'draw':
        layer.f(painter);
    }
  };

  for (const layer of spec) mark(layer);
}


/** Resolves the territories that fly someone else's flag, as `flags.ts` does. */
const resolve = (key: string): string => FLAG_ALIAS[key] ?? key;

const parse = (colour: string): RGB => {
  const n = Number.parseInt(colour.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// --- what a flag is made of -------------------------------------------------

/**
 * How much colour a flag colour needs before the land can wear it.
 *
 * White, black and every grey between them sit at chroma 0, and both ends are
 * unusable as ground for the same reason from opposite directions: white land
 * reads as snow, and in a world whose ink is black — the rule
 * `scenery/contract.ts` writes down about glazing — black land reads as ink and
 * not as a country. So the rule is *the largest area of the flag that is
 * actually a colour*, and one threshold catches both ends of it and the greys
 * in between.
 *
 * 0.04 in OKLab chroma sits in a gap the data leaves open. Measured over every
 * colour of all 228 specs (2026-09-08): **316 distinct colours**, of which ten
 * are achromatic — the whites, the creams, the blacks and the greys — and they
 * run from 0.000 to 0.019 (`#fff2e8`, the Cypriot cream). The least colourful
 * thing above the line is a very dark navy at 0.057 and the next a sand at
 * 0.059. **Nothing in the flag palette lies between 0.019 and 0.057**, so the
 * threshold is a gap and not a cut.
 */
const MIN_CHROMA = 0.04;

/**
 * Two colours within this much of the flag's area are the same size.
 *
 * The sample grid cannot split a band exactly — three equal thirds over 80 rows
 * come out 27, 26 and 27 — and Germany is exactly that case: measured, its
 * black and its gold come out 33.8% each and its red 32.5%, black is not a
 * colour the land can wear, and without a tie window the winner between red and
 * gold would be that 1.3% of rounding. 3% is two rows plus a margin.
 *
 * A tie goes to the colour the spec paints **first**, which is the field before
 * its charges and the hoist before the fly. It is not a coin toss: France's
 * bands are 33.3% each and France is blue, Ireland's are too and its green
 * comes before its orange, and Germany is red rather than gold. All three are
 * what the eye says. (Spain needs none of it — its arms are painted in its own
 * red, so red comes out 53.8% against gold's 43.3% and wins outright.)
 *
 * It costs something and the cost is worth writing down: **86 of the 228 flags
 * have two or more colours inside the window** (2026-09-08), so on those the
 * *order the spec paints in* decides the country's colour and not the area.
 * That order is data in `flag-data.ts`, so it is stable, but it is the one
 * place where this table depends on how a flag was written rather than on what
 * it looks like.
 */
const TIE = 0.03;

/**
 * The band a country's colour is kept in, in OKLab lightness.
 *
 * A flag colour is chosen against white cloth and a country colour is read off
 * a lit sphere, and the two are not the same job. Measured over the 228 flags
 * (2026-09-08) the colours this file picks run from `L` 0.285 (Anguilla's navy)
 * to 0.902 (Belgium's gold), and both ends stop being a *fill* on this planet:
 * the toon ramp multiplies the diffuse by 0.45 on the unlit side of the globe,
 * so the bottom of that range arrives under the ink the outline is drawn in,
 * and the top of it is the cream the HUD cards and the coastal foam already
 * use.
 *
 * 0.38 to 0.86 is where the flag palette already puts most of itself — **177 of
 * the 228 need no clamp at all** — and it is a clamp on lightness alone, so hue
 * and chroma ride through untouched and a dark navy comes out a lighter navy
 * rather than a grey. The floor is also the corridor the de-conflict slides a
 * nudge along, and it earns its width there: at 0.42 (169 of 228 unclamped) two
 * frontiers cannot be separated at all, and at 0.36 nothing more is bought.
 */
const MIN_LIGHT = 0.38;
const MAX_LIGHT = 0.86;

const legible = (colour: RGB): RGB => {
  const lab = toOklab(colour);
  if (lab.L >= MIN_LIGHT && lab.L <= MAX_LIGHT) return colour;
  return fromOklab({ ...lab, L: lab.L < MIN_LIGHT ? MIN_LIGHT : MAX_LIGHT });
};

/** One colour of one flag, with how much of the cloth it covers. */
export interface FlagColour {
  /** As the spec writes it, before any clamp: sRGB bytes and the same as hex. */
  rgb: RGB;
  hex: string;
  /** Its share of the flag's area, 0 to 1. */
  share: number;
  /** False for the whites, the blacks and the greys. See `MIN_CHROMA`. */
  usable: boolean;
}

const palettes = new Map<string, FlagColour[]>();

/**
 * Every colour a flag is made of, largest area first.
 *
 * The spec is read as **geometry** and never as pixels: every layer becomes a
 * shape with a box round it, the last one over a sample point wins, and the
 * counts are areas. That is an area weighting over the flag's own bands and
 * charges with no special cases in it — a band a third of the flag beats a star
 * a fiftieth of it because it is fifteen times the area, an outline loses
 * because it is a stroke and strokes are not counted, and a coat of arms loses
 * because it is a coat of arms. Nothing here touches a canvas, which is what
 * makes the answer the same on every machine: a canvas antialiases, and two
 * browsers do not have to agree on how.
 *
 * The order is *largest first with `TIE`'s window in it*, applied as a
 * selection sort so that it stays a total order: at each step, of everything
 * within the window of the largest that is left, the one the spec paints
 * earliest wins. `flagColor` takes the first usable entry of this list and the
 * de-conflict falls back down it, so this order is the whole ranking.
 */
export function flagPalette(key: string): FlagColour[] {
  const resolved = resolve(key);
  const held = palettes.get(resolved);
  if (held !== undefined) return held;

  const spec = FLAGS[resolved];
  if (spec === undefined) {
    palettes.set(resolved, []);
    return [];
  }

  const marks: Mark[] = [];
  collect(spec, { x: 0, y: 0, w: BOX_W, h: BOX_H }, marks);

  // The order a colour is first painted in, which is the tie-break below.
  const rank = new Map<string, number>();
  for (const item of marks) if (!rank.has(item.c)) rank.set(item.c, rank.size);

  const area = new Map<string, number>();
  const row: Mark[] = [];
  for (let iy = 0; iy < SAMPLES_Y; iy++) {
    const y = ((iy + 0.5) / SAMPLES_Y) * BOX_H;
    row.length = 0;
    for (const item of marks) if (y >= item.y0 && y < item.y1) row.push(item);
    for (let ix = 0; ix < SAMPLES_X; ix++) {
      const x = ((ix + 0.5) / SAMPLES_X) * BOX_W;
      for (let i = row.length - 1; i >= 0; i--) {
        const item = row[i]!;
        if (x < item.x0 || x >= item.x1 || !item.hit(x, y)) continue;
        area.set(item.c, (area.get(item.c) ?? 0) + 1);
        break;
      }
    }
  }

  const total = SAMPLES_X * SAMPLES_Y;
  const rest = [...area].map(([colour, count]) => ({
    colour,
    share: count / total,
    order: rank.get(colour) ?? 0,
  }));

  const out: FlagColour[] = [];
  while (rest.length > 0) {
    let largest = 0;
    for (const entry of rest) largest = Math.max(largest, entry.share);
    let best = 0;
    for (let i = 1; i < rest.length; i++) {
      const one = rest[i]!;
      const two = rest[best]!;
      if (one.share < largest - TIE) continue;
      if (two.share < largest - TIE || one.order < two.order) best = i;
    }
    const won = rest.splice(best, 1)[0]!;
    const rgb = parse(won.colour);
    out.push({
      rgb,
      hex: won.colour,
      share: won.share,
      usable: chroma(toOklab(rgb)) >= MIN_CHROMA,
    });
  }

  palettes.set(resolved, out);
  return out;
}

/**
 * The colour a flag reads as: the largest area of it the land can wear.
 *
 * Two rules on top of `flagPalette`'s order and both are about the land rather
 * than about the flag. **The largest area that is not achromatic wins**, so
 * Japan is the red of its disc and not the white of its field and Cyprus is its
 * copper island — a white-dominant flag would put snow on the map. And the
 * winner is then pulled into a legible lightness band, so Chad's navy comes out
 * a navy you can see. See `MIN_CHROMA` and `MIN_LIGHT`.
 */
export function flagColor(key: string): RGB | null {
  const list = choices(key);
  return list.length === 0 ? null : list[0]!;
}

/**
 * The colours a country may honestly wear, best first, already made legible.
 *
 * The first is `flagColor`'s answer and the rest are what the de-conflict may
 * fall back to: the other colours of the same flag, in the same area order, and
 * only the ones that are both a colour the land can wear and at least
 * `MIN_SHARE` of the cloth. Below that share it is a charge and not a field —
 * nobody names Portugal after the gold of its armillary sphere.
 */
function choices(key: string): RGB[] {
  const held = ladders.get(key);
  if (held !== undefined) return held;
  const palette = flagPalette(key);
  const out: RGB[] = [];
  const first = palette.find((entry) => entry.usable) ?? palette[0];
  if (first !== undefined) {
    out.push(legible(first.rgb));
    for (const entry of palette) {
      if (entry === first || !entry.usable || entry.share < MIN_SHARE) continue;
      out.push(legible(entry.rgb));
    }
  }
  ladders.set(key, out);
  return out;
}

const ladders = new Map<string, RGB[]>();

// --- who touches whom -------------------------------------------------------

/**
 * How near two outlines have to come to count as touching, in degrees.
 *
 * **Natural Earth shares its border vertices, and not quite always.** A land
 * frontier is one run of points carried by both countries' polygons — which is
 * why `borders.ts` finds 46.9% of its frontier edges held twice — so an exact
 * match on the coordinates finds nearly every neighbour on the planet for the
 * price of a hash. What it misses is that `pack.ts` quantises each ring to its
 * own number of decimals, so two rings that shared a vertex in the source can
 * come off the wire a rounding apart: at exact equality **Andorra has no
 * neighbours at all**, France and Spain both being a few thousandths of a
 * degree away from it.
 *
 * So *touching* means, in this implementation, **that the two countries put a
 * ring vertex in the same 0.01-degree cell or in one of that cell's eight
 * neighbours** — a reach of one to two cells, 1.1 to 2.2 km, or 3 to 6 world
 * units against a person of 3.77. It is a test on vertices and not on edges,
 * which is exactly right here because the shared run makes both countries carry
 * the same vertices; the enclave pass below is what covers the case where they
 * do not.
 *
 * Measured (2026-09-08) against thirty-nine pairs that must and must not come
 * out adjacent — Lesotho and South Africa, Andorra and both its neighbours, San
 * Marino and Italy, Nepal and China, Haiti and the Dominican Republic, against
 * France and Britain across the Channel, Italy and Tunisia, Japan and Korea,
 * Sweden and Denmark: **326 pairs, all thirty-nine right**. At exact equality
 * it is 314 and Andorra is wrong; at 0.05 degrees it is 333 and the extra seven
 * are strait crossings nobody would draw a frontier on.
 *
 * The fortieth pair was **Spain and Morocco, and they are not adjacent here** —
 * not because the test misses them but because Ceuta and Melilla are not in
 * `countries.bin` at all, being under the bake's `MIN_RING_AREA` for the same
 * reason the four microstates are. There is no Spanish land in Africa to touch
 * Morocco with, which is a data gap and not a colour one.
 */
const TOUCH = 0.01;

/**
 * Longitude cells in the snap grid, plus a margin, so the 3 by 3 read cannot
 * wrap a cell on one edge of the map into the row above it.
 */
const TOUCH_COLS = Math.ceil(360 / TOUCH) + 4;
const TOUCH_ORIGIN = 20000;

/**
 * How much of a scan happens between two chances to stop, in ring vertices.
 *
 * The whole table is a quarter of a second of work the first time anybody
 * climbs (see `buildCountryColors`), which is four dropped frames if it is done
 * in one — so every loop long enough to matter yields, and `land-flags.ts`
 * checks the clock between steps. A step is therefore the granularity of the
 * overrun: the budget is checked *after* a step, so the worst frame is the
 * budget plus one step.
 *
 * Measured on the mesh `pnpm check` builds, at `FLAG_BUILD_MS` of 4 (2026-09-08,
 * headless, about 50 calls): 8,000 vertices gives a **median call of 4.2 ms, a
 * p90 of 6.2 and a worst of 9.6**, and the worst is an early call, where nothing
 * is JIT-warm yet. At 20,000 the worst is 10.6 and at 50,000 it is 39, which is
 * the whole point — a step that is too big puts the stall back one frame at a
 * time. It costs nothing to make it small: the total is the same either way.
 */
const STEP_POINTS = 8000;

/** Runs one of the generators below to the end, for a caller with no budget. */
function drain<T>(steps: Generator<number, T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * What each of the three stages costs, as a share of the table.
 *
 * Only used to turn three separate cursors into one number a caller can put on
 * a progress bar, and it is measured rather than assumed: 106 ms reading the
 * flag specs, 70 walking the rings for the adjacency and 60 on the greedy
 * (2026-09-08, cold, in a fresh process). A share that drifted would make the
 * number uneven, never wrong — it is monotonic whatever these are.
 */
const STAGE_READ = 106 / 236;
const STAGE_TOUCH = 70 / 236;

/**
 * Which countries touch which, as a 1-based country index to its neighbours.
 *
 * Two passes, and they answer different questions. The **snap** finds every
 * frontier that is a shared run of vertices, which is all of them but the
 * enclaves. The **containment** finds the enclaves, because a country wholly
 * inside another shares no vertex with it at all: the bake keeps only outer
 * rings, so Natural Earth's South Africa simply covers Lesotho, Italy covers
 * San Marino, and Morocco covers Western Sahara. Both are the same relation —
 * you cannot walk from one to the other without crossing a line — and the
 * second finds **108 ring-in-ring hits over the 1,556 land rings** (2026-09-08),
 * which is 101 pairs of which the snap had already found 99. The two it adds
 * are the two true enclaves on the planet: Lesotho inside South Africa and San
 * Marino inside Italy.
 */
export function neighbours(world: World): Map<number, number[]> {
  return drain(walkNeighbours(world));
}

/**
 * The same scan, in steps a caller can spread over frames.
 *
 * It yields after roughly `STEP_POINTS` ring vertices, which is a tenth of a
 * millisecond of work — small enough that a caller checking the clock after
 * every `next()` can hold a four-millisecond budget, and large enough that the
 * generator's own overhead is nothing. `neighbours` is this run to completion.
 */
function* walkNeighbours(world: World): Generator<number, Map<number, number[]>> {
  const rings = world.rings.filter((ring) => !ring.water && ring.country > 0);
  let since = 0;
  // What the three passes below will get through, in the units each of them
  // counts: every vertex twice for the two grid passes, every vertex again for
  // the boxes, and one unit per ring per ring for the enclave test.
  let vertices = 0;
  for (const ring of rings) vertices += ring.points.length;
  const expected = Math.max(1, vertices * 3 + rings.length * rings.length);
  let walked = 0;

  const pairs = new Set<number>();
  const pack = (a: number, b: number): number => (a < b ? a * 512 + b : b * 512 + a);

  // Which country claimed a cell, and the rare cell that more than one did.
  const owner = new Map<number, number>();
  const shared = new Map<number, number[]>();
  for (const ring of rings) {
    for (const point of ring.points) {
      const key =
        (Math.round(point[1]! / TOUCH) + TOUCH_ORIGIN) * TOUCH_COLS + Math.round(point[0]! / TOUCH) + TOUCH_ORIGIN;
      const held = owner.get(key);
      if (held === undefined) owner.set(key, ring.country);
      else if (held !== ring.country) {
        const list = shared.get(key);
        if (list === undefined) shared.set(key, [ring.country]);
        else if (!list.includes(ring.country)) list.push(ring.country);
      }
    }
    since += ring.points.length;
    walked += ring.points.length;
    if (since >= STEP_POINTS) {
      since = 0;
      yield walked / expected;
    }
  }

  for (const ring of rings) {
    const country = ring.country;
    for (const point of ring.points) {
      const cx = Math.round(point[0]! / TOUCH) + TOUCH_ORIGIN;
      const cy = Math.round(point[1]! / TOUCH) + TOUCH_ORIGIN;
      for (let dy = -1; dy <= 1; dy++) {
        const base = (cy + dy) * TOUCH_COLS + cx;
        for (let dx = -1; dx <= 1; dx++) {
          const held = owner.get(base + dx);
          if (held === undefined) continue;
          if (held !== country) pairs.add(pack(country, held));
          const list = shared.get(base + dx);
          if (list !== undefined) for (const other of list) if (other !== country) pairs.add(pack(country, other));
        }
      }
    }
    since += ring.points.length;
    walked += ring.points.length;
    if (since >= STEP_POINTS) {
      since = 0;
      yield walked / expected;
    }
  }

  // The enclaves. Each ring's own first point against every other country's
  // rings, rejected on the bounding box first — 1,556 by 1,556 boxes is a few
  // million comparisons of four numbers and the polygon test runs rarely.
  const boxes = new Float64Array(rings.length * 4);
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i]!;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const p of ring.points) {
      if (p[0]! < west) west = p[0]!;
      if (p[0]! > east) east = p[0]!;
      if (p[1]! < south) south = p[1]!;
      if (p[1]! > north) north = p[1]!;
    }
    boxes[i * 4] = west;
    boxes[i * 4 + 1] = south;
    boxes[i * 4 + 2] = east;
    boxes[i * 4 + 3] = north;
    since += ring.points.length;
    walked += ring.points.length;
    if (since >= STEP_POINTS) {
      since = 0;
      yield walked / expected;
    }
  }
  for (let i = 0; i < rings.length; i++) {
    const point = rings[i]!.points[0]!;
    const x = point[0]!;
    const y = point[1]!;
    for (let j = 0; j < rings.length; j++) {
      if (rings[j]!.country === rings[i]!.country) continue;
      const b = j * 4;
      if (x < boxes[b]! || x > boxes[b + 2]! || y < boxes[b + 1]! || y > boxes[b + 3]!) continue;
      if (insideRing(rings[j]!.points, x, y)) pairs.add(pack(rings[i]!.country, rings[j]!.country));
    }
    since += rings.length;
    walked += rings.length;
    if (since >= STEP_POINTS) {
      since = 0;
      yield walked / expected;
    }
  }

  const out = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    const held = out.get(a);
    if (held === undefined) out.set(a, [b]);
    else held.push(b);
  };
  for (const key of pairs) {
    const a = Math.floor(key / 512);
    const b = key - a * 512;
    link(a, b);
    link(b, a);
  }
  return out;
}

// --- the de-conflict --------------------------------------------------------

/**
 * How far apart two touching countries have to look, in OKLab.
 *
 * The number is set by what the eye has to do with it: tell two flat fills
 * apart across a dashed frontier six pixels wide, at an altitude where a
 * country is a few hundred pixels across. A just-noticeable difference in OKLab
 * is about 0.02, and two fills need much more than a JND to read as *two* fills
 * rather than as one with a shading on it — the yardstick `DEFAULT_OPACITY` in
 * `land-flags.ts` uses is the cel ramp's own faintest step, which arrives on
 * screen as 16.6% of relative luminance and is about **0.09 of OKLab
 * lightness** on a mid tone. A separation below that is a shadow, not a border.
 *
 * 0.16 is a little under twice it, and it is what the flag palette can afford
 * inside the identity budget below: holding it costs 77 of the 232 coloured
 * countries a move and leaves **no frontier of the 323 short of it**
 * (2026-09-08). It is not tuned to the edge of that either — it is a little
 * inside it: 0.17 leaves one frontier short, 0.18 leaves four and 0.20 leaves
 * nine, because a country whose every neighbour is already placed can be boxed
 * in and the extra travel walks it into somebody else. The closest pair that
 * survives is Colombia and Venezuela at 0.160, which is the threshold itself.
 */
const APART = 0.16;

/**
 * How far a country's colour may travel from the flag's own, and in what.
 *
 * This is the other half of the trade and it is the half that matters most:
 * the colour has to still *mean* the flag. **The hue is what carries that**, so
 * it is capped hard and the rest is given room — a red is still a red a fifth
 * of the lightness away or at four fifths of its chroma, and it is an *orange*
 * at 25 degrees of hue and a magenta at 90. So a nudge is mostly a tint or a
 * shade, which is what a political map has always done with a colour it needs
 * twice.
 *
 * `HUE_LIMIT` is 14 degrees and it is measured on the colour that **ships**,
 * not on the one that was asked for. That distinction is the whole of it: a
 * light high-chroma red is outside sRGB, `fromOklab` clamps each channel on its
 * own, and the clamp does not preserve hue — asking for Slovakia's red at `L`
 * 0.79 hands back `#ff8d49`, which is 30 degrees away and is an orange. Every
 * candidate is therefore converted back out of its three bytes and re-measured
 * before it is offered, and one that drifted is dropped. At 24 degrees the
 * table separates just as well (0 frontiers short, 5 switches instead of 8) and
 * Switzerland comes out `#ff6f00`, which is not a red; at 0 the hue cannot move
 * at all and **46 frontiers** are left short. 14 is the largest rotation that
 * left every moved country still nameable when the table was read back by hand
 * (2026-09-08).
 *
 * `NUDGE_MAX` is the total leash, and it binds on lightness: 0.30 is a little
 * under a third of the black-to-white range, so the furthest a country can be
 * from its flag is a distinctly lighter or darker version of the same colour.
 * At 0.22 seven frontiers are left short; at 0.40 the extra room is spent on
 * chroma rather than on lightness, which is what the tax below is there to
 * stop.
 */
const HUE_LIMIT = 14;
const NUDGE_MAX = 0.3;

/**
 * The ladder a nudge is searched over: hue in 3.5-degree steps to `HUE_LIMIT`,
 * lightness in 0.05 steps to 0.30, chroma at five eighths to a fifth more than
 * the flag's own.
 *
 * The steps are what the search can reach and not a sequence — every candidate
 * inside `NUDGE_MAX` is generated, priced and sorted, because "hue first, then
 * value" is a statement about *cost* and the cost function below says it
 * properly. What the step sizes have to be is fine enough that the ladder has a
 * rung near the cheapest legal answer: 0.05 of lightness is half the 0.09 the
 * light itself steps by. The ladder is 9 hues by 13 lightnesses by 6 chromas
 * per colour of the flag, less the duplicates a gamut clamp produces and the
 * candidates the leash rejects.
 */
const HUE_STEP = 3.5;
const LIGHT_STEP = 0.05;
const LIGHT_REACH = 0.3;
const CHROMA_SCALES = [1.2, 1.1, 1, 0.9, 0.78, 0.625];

/**
 * What losing chroma costs, over and above the distance it moves.
 *
 * OKLab prices a step of lightness and a step of chroma the same, and for *this*
 * question they are not the same at all: a red that has lost a fifth of its
 * lightness is a dark red and a red that has lost a fifth of its chroma is a
 * **brown**. Desaturating is the cheapest escape OKLab knows and it is the one
 * that costs the flag its name, so it is taxed — at 1.5, giving up a quarter of
 * a chroma of 0.2 costs 0.05 of distance plus 0.075 of tax, which puts it
 * behind a shade twice as deep.
 *
 * It is worth four fewer moves to leave it out and it is not worth it: measured
 * as the chroma that ships over the flag's own (2026-09-08), **13 countries
 * fall below 70% of it without the tax and 4 with**, and the 13 are the muddy
 * ones — Hong Kong at `#9b3a23`, Timor-Leste at `#aa4635`, Suriname a grey-
 * green, Afghanistan a washed sage. The 4 that remain are not desaturations at
 * all: they are countries that took a lower-chroma colour of their own flag.
 */
const CHROMA_TAX = 1.5;

/**
 * The smallest share of a flag a colour may have and still be offered as that
 * country's second choice.
 *
 * The pan-Arab, pan-African and pan-Slavic families put the same red or the
 * same green either side of a dozen frontiers, and the Balkans and Central
 * America are each a clique of six or seven countries whose flags all read the
 * same colour. A hue leash of 14 degrees and a lightness corridor of 0.48
 * cannot hold seven fills apart at `APART`, so something has to give, and the
 * honest thing to give is **which** colour of the flag is used rather than how
 * far it is dragged from it: Croatia's flag is red, white and blue, so a blue
 * Croatia is still Croatia's flag, where a Croatia rotated 40 degrees off red
 * is nothing at all.
 *
 * It is a **last resort and not a price** — see `place` in `countryColors`,
 * which exhausts the dominant colour's whole ladder before it looks at the
 * second — and it costs 8 of the 232 countries their first colour (2026-09-08):
 * Afghanistan, Burkina Faso, the Central African Republic, Croatia, Malaysia,
 * Mauritania, Slovakia and Tajikistan, every one of them in a red or a green
 * cluster with no room left in it. Take the second colour away and **12
 * frontiers cannot be separated**, the worst of them Croatia and Hungary at
 * 0.103, which is inside the shading the light already does.
 *
 * An eighth of the cloth is the floor because below it a colour is a charge and
 * not a field, and nobody would name a country after the gold of an armillary
 * sphere. Of the 228 flags, 89 have only one colour the land can wear, 95 have
 * two, 39 have three and 5 have four.
 */
const MIN_SHARE = 0.125;

export interface CountryColorTable {
  /** The colour for a 1-based country index, or null where there is no flag. */
  color(country: number): RGB | null;
  /** How many countries were moved off their flag colour, and the worst move. */
  moved: number;
  worstNudge: number;
  /** How many took a different colour of their own flag rather than a nudge. */
  switched: number;
  /** The closest pair of touching countries that survives, in OKLab. */
  worst: { a: string; b: string; distance: number };
  /** Frontiers still inside `APART` after the walk, worst first. */
  short: { a: string; b: string; distance: number }[];
  /** Countries coloured and frontiers judged. */
  countries: number;
  pairs: number;
  /**
   * Wall clock from the first step to the last. For `countryColors` that is
   * what the table cost; for a caller turning `buildCountryColors` a step at a
   * time it is how long it took to get round to finishing, which is a different
   * number and a much larger one — `land-flags.ts` keeps its own.
   */
  buildMs: number;
}

/** One offer in the ladder: the bytes that would ship and what they cost. */
interface Candidate {
  rgb: RGB;
  lab: Oklab;
  /** How far it is from the colour it is a version of, on the bytes that ship. */
  drift: number;
  /** `drift` plus the chroma tax. */
  cost: number;
}

/**
 * Every version of one colour of one flag that a country could honestly wear,
 * cheapest first.
 *
 * The whole hue-by-lightness-by-chroma ladder is laid over the `rank`-th colour
 * of the flag — 0 is the dominant one, and see `MIN_SHARE` for what the rest
 * are. A candidate is built in OKLab, **rounded to the three bytes it will ship
 * as**, and then measured again from those bytes: the gamut clamp is part of
 * the answer, so a candidate that clamped its way out of the hue leash is
 * dropped here and one that clamped its way to a different distance is priced
 * at the distance it really has.
 *
 * It is **per rank and lazy** because it is the expensive half of the walk and
 * almost nobody needs the second colour: 77 countries of 232 ask for a ladder
 * at all and 8 of those ask for a second one, so building every rank eagerly
 * was three quarters of the work thrown away.
 */
function candidates(key: string, rank: number): Candidate[] {
  const id = `${key}/${rank}`;
  const held = offers.get(id);
  if (held !== undefined) return held;
  const colour = choices(key)[rank];
  const out: Candidate[] = [];
  if (colour !== undefined) {
    const seen = new Set<number>();
    const home = toOklab(colour);
    const c = chroma(home);
    const hue = Math.atan2(home.b, home.a);
    for (let hs = 0; hs <= Math.round(HUE_LIMIT / HUE_STEP); hs++) {
      for (const dh of hs === 0 ? [0] : [hs * HUE_STEP, -hs * HUE_STEP]) {
        const angle = hue + (dh * Math.PI) / 180;
        const ca = Math.cos(angle) * c;
        const cb = Math.sin(angle) * c;
        for (let ls = 0; ls <= Math.round(LIGHT_REACH / LIGHT_STEP); ls++) {
          for (const dL of ls === 0 ? [0] : [ls * LIGHT_STEP, -ls * LIGHT_STEP]) {
            const light = Math.min(MAX_LIGHT, Math.max(MIN_LIGHT, home.L + dL));
            for (const scale of CHROMA_SCALES) {
              const rgb = fromOklab({ L: light, a: ca * scale, b: cb * scale });
              const key32 = (rgb[0]! << 16) | (rgb[1]! << 8) | rgb[2]!;
              if (seen.has(key32)) continue;
              seen.add(key32);
              const lab = toOklab(rgb);
              // The leash, on the bytes rather than on the request.
              const turned = Math.abs(
                ((((Math.atan2(lab.b, lab.a) - hue) * 180) / Math.PI + 540) % 360) - 180,
              );
              if (turned > HUE_LIMIT + 1e-9) continue;
              const drift = distance(lab, home);
              const cost = drift + CHROMA_TAX * Math.max(0, c - chroma(lab));
              if (cost > NUDGE_MAX) continue;
              out.push({ rgb, lab, drift, cost });
            }
          }
        }
      }
    }
    out.sort(
      (one, two) =>
        one.cost - two.cost ||
        one.rgb[0]! - two.rgb[0]! ||
        one.rgb[1]! - two.rgb[1]! ||
        one.rgb[2]! - two.rgb[2]!,
    );
  }
  offers.set(id, out);
  return out;
}

const offers = new Map<string, Candidate[]>();

/**
 * The table: every country's colour, de-conflicted against its neighbours.
 *
 * The walk is **largest country first**, which is the whole of the ordering
 * argument. Keeping the flag's own colour is a privilege and it should go to
 * the countries the eye spends its time on: Russia, Canada, Brazil and China
 * are read from the plane's ceiling and Andorra is not. It is also what makes
 * the result deterministic — the order is a function of the baked outlines and
 * nothing else, so the same country gets the same colour on every machine and
 * in every session, and the ISO code breaks a tie that the areas cannot.
 *
 * **One pass and no repair**, which is worth saying because the obvious second
 * pass was written, measured and taken out: re-placing every country still
 * inside `APART` against *all* of its neighbours rather than only the ones that
 * were down when its turn came changed nothing at all, for the plain reason
 * that there is nothing left to repair — the greedy clears all 323 frontiers on
 * its own (2026-09-08). It went the way the same measurement sent a scoring
 * term that traded cost against clearance: neither earned a line.
 *
 * A country that cannot be separated inside the leash keeps the roomiest colour
 * it found and turns up in `short` rather than being forced somewhere it would
 * stop meaning its flag. `short` is empty today and it is the one number in
 * this file worth watching after a re-bake of `countries.bin`: a frontier that
 * appears in it is two countries the map cannot tell apart.
 */
export function countryColors(world: World): CountryColorTable {
  return drain(buildCountryColors(world));
}

/**
 * The same table, in steps a caller can spend against a frame budget.
 *
 * It is a quarter of a second of work — measured cold, in a fresh process,
 * 255 ms (median of five, 2026-09-08): about 106 ms reading the 228 flag specs
 * as geometry, 70 ms walking the vertices of 1,556 rings for the adjacency, and
 * 60 ms on the greedy itself. That is four dropped frames in the middle of a
 * climb if it is done in one, and it is why this is a generator: `land-flags.ts`
 * turns it with a clock in its hand and the whole cost disappears into the fade.
 * `countryColors` is this run to the end, for `pnpm check` and for anything else
 * that is not inside a frame.
 *
 * **Each step yields how far along it is, 0 to 1**, and that is not decoration:
 * a caller that resumes this generator sees the number climb, and a caller that
 * accidentally *restarts* it sees the number reset. It is the one reading that
 * tells those two apart from outside, and `land-flags.ts` puts it on
 * `atlas.flags().layer.progress` for exactly that reason.
 */
export function* buildCountryColors(world: World): Generator<number, CountryColorTable> {
  const started = Date.now();

  // `yield*` would pass the delegate's own 0-to-1 straight through, and what a
  // caller wants is one number for the whole table — so the adjacency is turned
  // by hand and its progress scaled into this stage's share.
  const walk = walkNeighbours(world);
  let step = walk.next();
  while (!step.done) {
    yield step.value * STAGE_TOUCH;
    step = walk.next();
  }
  const adjacency = step.value;

  /**
   * Land area, near enough: each ring's shoelace area in square degrees,
   * narrowed by the cosine of its own middle latitude. A square degree at 70
   * north is a third of one at the equator, and Greenland is not the third
   * largest country in the world.
   */
  const area = new Float64Array(world.countries.length + 1);
  for (const ring of world.rings) {
    if (ring.water || ring.country <= 0) continue;
    let south = Infinity;
    let north = -Infinity;
    for (const p of ring.points) {
      if (p[1]! < south) south = p[1]!;
      if (p[1]! > north) north = p[1]!;
    }
    area[ring.country]! += ring.area * Math.cos((((south + north) / 2) * Math.PI) / 180);
  }

  const iso = (country: number): string => world.countries[country - 1]!.iso;
  const bigFirst = (a: number, b: number): number => area[b]! - area[a]! || (iso(a) < iso(b) ? -1 : 1);

  // Reading a flag spec as geometry is half a millisecond and there are 232 of
  // them, so this is the longest of the three stages and the one that yields
  // most often.
  const order: number[] = [];
  for (let i = 1; i <= world.countries.length; i++) {
    if (flagColor(iso(i)) !== null) order.push(i);
    yield STAGE_TOUCH + (i / world.countries.length) * STAGE_READ;
  }
  order.sort(bigFirst);

  const chosen = new Map<number, RGB>();
  const chosenLab = new Map<number, Oklab>();
  const home = new Map<number, Oklab>();
  for (const country of order) home.set(country, toOklab(flagColor(iso(country))!));

  /** Which colour of its flag each country ended on, and how far off it. */
  const usedRank = new Map<number, number>();
  const usedDrift = new Map<number, number>();

  const place = (country: number): void => {
    // Only the neighbours that already have a colour, which is the ones ahead
    // of this country in the order. That is what makes it greedy, and what
    // makes `bigFirst` the whole of the fairness argument: a country is only
    // ever pushed off its flag by one that is being read more than it is.
    const against: Oklab[] = [];
    for (const other of adjacency.get(country) ?? []) {
      if (other === country) continue;
      const lab = chosenLab.get(other);
      if (lab !== undefined) against.push(lab);
    }
    const clearance = (lab: Oklab): number => {
      let least = Infinity;
      for (const other of against) least = Math.min(least, distance(lab, other));
      return least;
    };

    const flagLab = home.get(country)!;
    let pick = flagColor(iso(country))!;
    let pickLab = flagLab;
    let rank = 0;
    let drift = 0;

    if (against.length > 0 && clearance(flagLab) < APART) {
      // A colour at a time, down the flag's own palette, and inside a colour
      // cheapest first: every tint, shade and small turn of the dominant colour
      // is tried before the second colour is looked at, so the first offer that
      // clears is the smallest change to the earliest colour of the flag that
      // can be told from every neighbour already down. See `MIN_SHARE`.
      let best: Candidate | null = null;
      let bestRank = 0;
      let fallback: Candidate | null = null;
      let fallbackRank = 0;
      let fallbackRoom = clearance(flagLab);
      const depth = choices(iso(country)).length;
      for (let r = 0; r < depth && best === null; r++) {
        for (const candidate of candidates(iso(country), r)) {
          const room = clearance(candidate.lab);
          if (room >= APART) {
            best = candidate;
            bestRank = r;
            break;
          }
          if (room > fallbackRoom) {
            fallbackRoom = room;
            fallback = candidate;
            fallbackRank = r;
          }
        }
      }
      const won = best ?? fallback;
      if (won !== null) {
        pick = won.rgb;
        pickLab = won.lab;
        rank = best !== null ? bestRank : fallbackRank;
        drift = won.drift;
      }
    }

    chosen.set(country, pick);
    chosenLab.set(country, pickLab);
    usedRank.set(country, rank);
    usedDrift.set(country, drift);
  };

  const placed = STAGE_TOUCH + STAGE_READ;
  for (let i = 0; i < order.length; i++) {
    place(order[i]!);
    yield placed + ((i + 1) / order.length) * (1 - placed);
  }

  let moved = 0;
  let switched = 0;
  let worstNudge = 0;
  for (const country of order) {
    if (distance(chosenLab.get(country)!, home.get(country)!) <= 1e-9) continue;
    moved++;
    if ((usedRank.get(country) ?? 0) > 0) switched++;
    // Measured against the colour of the flag it is a version of, not against
    // the dominant one: a country that took its flag's blue is not 0.4 away
    // from its own colour, it is on a different colour of the same flag.
    worstNudge = Math.max(worstNudge, usedDrift.get(country) ?? 0);
  }

  const short: { a: string; b: string; distance: number }[] = [];
  let worst = { a: '', b: '', distance: Infinity };
  let pairs = 0;
  for (const [country, list] of adjacency) {
    const one = chosenLab.get(country);
    if (one === undefined) continue;
    for (const other of list) {
      if (other <= country) continue;
      const two = chosenLab.get(other);
      if (two === undefined) continue;
      pairs++;
      const gap = distance(one, two);
      if (gap < APART) short.push({ a: iso(country), b: iso(other), distance: gap });
      if (gap < worst.distance) worst = { a: iso(country), b: iso(other), distance: gap };
    }
  }
  short.sort((one, two) => one.distance - two.distance);

  return {
    color: (country) => chosen.get(country) ?? null,
    moved,
    worstNudge,
    switched,
    worst,
    short,
    countries: chosen.size,
    pairs,
    buildMs: Date.now() - started,
  };
}
