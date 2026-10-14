/**
 * A flag spec read as geometry: every shape it paints, with a box round it.
 * No canvas is involved, so the answer is the same on every machine.
 */
import { FLAGS, FLAG_ALIAS } from '../flag-data.ts';
import type { FlagPoint, FlagSpec, Layer, Painter } from '../flags.ts';
import { TAU } from './oklab.ts';

/** Resolves the territories that fly someone else's flag, as `flags.ts` does. */
export const resolve = (key: string): string => FLAG_ALIAS[key] ?? key;

/**
 * The box the spec is read in. Specs are authored for 3:2: `x` and widths are
 * fractions of the width, `y`, heights, radii and star sizes fractions of the
 * height, so a box of 1.5 by 1 needs no aspect factor.
 */
export const BOX_W = 1.5;
export const BOX_H = 1;

/**
 * How finely the flag is sampled: 120 by 80 points. The smallest band that
 * can win (a ninth of the flag) is still over a thousand samples; an exact
 * split of equal bands is not possible, hence the tie window in `palette.ts`.
 */
export const SAMPLES_X = 120;
export const SAMPLES_Y = 80;

/**
 * A shape the spec paints, with the box it lives in. Rejecting on the box
 * before calling the exact test makes reading every flag several times
 * faster, since charges (stars, spokes) are most of the shapes and a tiny part
 * of the area.
 */
export interface Mark {
  c: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The exact test, and the clip if the layer was painted under one. */
  hit(x: number, y: number): boolean;
}

export interface Box {
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
 * The path a `draw` layer builds straight on the context. Fills and clips are
 * modelled, with a transform stack under them; strokes are not, since on a
 * flag a stroke is an outline or a fimbriation, never a field. Curves are
 * flattened coarsely (an arc to sixteen segments, a quadratic to four): this
 * is an area measurement.
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
 * Walks a spec and hands back every shape it paints, in paint order. A `draw`
 * layer is run against a recorder that implements `Painter` by collecting
 * shapes instead of filling them.
 */
export function collect(spec: FlagSpec, box: Box, out: Mark[]): void {
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

