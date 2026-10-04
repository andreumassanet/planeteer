/**
 * A small polygon rasteriser over an RGBA buffer: what the map's tiles are
 * painted with (`map-tiles.ts`), in the browser and in the Node bake alike.
 *
 * **Why not a canvas.** The tiles are a pure function of the world's data and
 * a key, and that is worth three things a canvas cannot give: the same bytes
 * in every browser (Chrome and Firefox anti-alias a path differently, so a
 * tile cached by one and a tile painted by the other would show a seam), the
 * same bytes in Node, where `scripts/build-maps.ts` pre-paints the far levels
 * and `scripts/check-maps.ts` holds a tile to its own repaint byte for byte,
 * and no DOM at all, so the painter could move into a worker without a line
 * changing. What it costs is this file: a scanline fill with a nonzero
 * winding rule and four sub-scanlines a row, exact coverage across each one,
 * which is the anti-aliasing a 256-pixel map tile needs and no more.
 *
 * Measured on 2026-10-04 (Node 24, this machine, loaded): a tile of 1,900
 * building boxes filled and inked, 3,800 paths, in 9 to 12 ms; a 256-pixel
 * square filled, 0.05 ms.
 *
 * Coordinates are pixels, `y` down, the centre of the top-left pixel at
 * (0.5, 0.5). A path is any number of closed polygons; `fill` paints their
 * union under the nonzero rule and empties the path. **Every polygon is turned
 * to the same winding as it is closed** when `union` is set — the default —
 * so a stroke built of overlapping quads and discs is one shape and is not
 * painted twice where its pieces overlap, and a ring and its reverse do not
 * cancel. A path that needs a hole (none of the map's do) clears it.
 */

/** Sub-scanlines a pixel row is sampled at: the vertical anti-aliasing. */
const SUB = 4;

export class Raster {
  readonly width: number;
  readonly height: number;
  /** sRGB bytes, RGBA, row-major, `y` down. */
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  /** Every closed polygon turned positive, so overlapping pieces are one shape. */
  union = true;

  // The path's edges: x0, y0, x1, y1 with y0 < y1, and the winding each adds.
  private ex0 = new Float64Array(256);
  private ey0 = new Float64Array(256);
  private ex1 = new Float64Array(256);
  private ey1 = new Float64Array(256);
  private ed = new Int8Array(256);
  private edges = 0;
  // The open polygon's points, until it is closed.
  private px: number[] = [];
  private py: number[] = [];
  // Scratch for the scan.
  private order = new Int32Array(256);
  private active = new Int32Array(256);
  private xs = new Float64Array(256);
  private ws = new Int8Array(256);
  private readonly acc: Float32Array;

  constructor(width: number, height: number, data?: Uint8ClampedArray<ArrayBuffer>) {
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint8ClampedArray(width * height * 4);
    this.acc = new Float32Array(width + 2);
  }

  /** The whole buffer one colour, opaque. */
  clear(r: number, g: number, b: number): void {
    const d = this.data;
    for (let k = 0; k < d.length; k += 4) {
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  }

  moveTo(x: number, y: number): void {
    this.close();
    this.px.push(x);
    this.py.push(y);
  }

  lineTo(x: number, y: number): void {
    this.px.push(x);
    this.py.push(y);
  }

  /** Closes the open polygon into the path. */
  close(): void {
    const px = this.px;
    const py = this.py;
    const n = px.length;
    if (n >= 3) {
      let flip = 1;
      if (this.union) {
        let area = 0;
        for (let k = 0, j = n - 1; k < n; j = k++) area += (px[j]! - px[k]!) * (py[j]! + py[k]!);
        flip = area < 0 ? -1 : 1;
      }
      for (let k = 0, j = n - 1; k < n; j = k++) this.edge(px[j]!, py[j]!, px[k]!, py[k]!, flip);
    }
    px.length = 0;
    py.length = 0;
  }

  /** An axis-aligned rectangle. */
  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.close();
  }

  /**
   * A parallelogram about a centre, from its two half-axes: a box turned and
   * sheared by whatever affine took it onto the tile.
   */
  box(cx: number, cy: number, ax: number, ay: number, bx: number, by: number): void {
    this.moveTo(cx - ax - bx, cy - ay - by);
    this.lineTo(cx + ax - bx, cy + ay - by);
    this.lineTo(cx + ax + bx, cy + ay + by);
    this.lineTo(cx - ax + bx, cy - ay + by);
    this.close();
  }

  /** A disc, as a polygon of as many sides as its size wants. */
  circle(cx: number, cy: number, r: number): void {
    if (!(r > 0)) return;
    const n = Math.max(6, Math.min(32, Math.ceil(r * 2.2)));
    this.moveTo(cx + r, cy);
    for (let k = 1; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    this.close();
  }

  /**
   * A line `half` either side of the segment, its ends squared off `cap`
   * past each point: a polyline's piece, a box's ink.
   */
  segment(x0: number, y0: number, x1: number, y1: number, half: number, cap = 0): void {
    let dx = x1 - x0;
    let dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return;
    dx /= length;
    dy /= length;
    const nx = -dy * half;
    const ny = dx * half;
    const sx = x0 - dx * cap;
    const sy = y0 - dy * cap;
    const fx = x1 + dx * cap;
    const fy = y1 + dy * cap;
    this.moveTo(sx + nx, sy + ny);
    this.lineTo(fx + nx, fy + ny);
    this.lineTo(fx - nx, fy - ny);
    this.lineTo(sx - nx, sy - ny);
    this.close();
  }

  /**
   * A polyline `half` either side, with round joins and ends — from a pixel
   * and a half: under it a join's notch is under the anti-aliasing, and the
   * discs were most of a far tile's roads (a level-5 tile of Europe, 150 ms
   * of its 400). Under it the pieces are squared off by their own half,
   * which closes the notch at a bend well enough.
   */
  polyline(xs: ArrayLike<number>, ys: ArrayLike<number>, count: number, half: number): void {
    const round = half >= 1.5;
    for (let k = 1; k < count; k++) this.segment(xs[k - 1]!, ys[k - 1]!, xs[k]!, ys[k]!, half, round ? 0 : half * 0.5);
    if (!round) return;
    for (let k = 0; k < count; k++) this.circle(xs[k]!, ys[k]!, half);
  }

  /** The outline of a closed polygon, `half` either side of each side, its corners squared. */
  outline(xs: ArrayLike<number>, ys: ArrayLike<number>, count: number, half: number): void {
    for (let k = 0, j = count - 1; k < count; j = k++) this.segment(xs[j]!, ys[j]!, xs[k]!, ys[k]!, half, half);
  }

  /** Empties the path without painting it. */
  reset(): void {
    this.px.length = 0;
    this.py.length = 0;
    this.edges = 0;
  }

  /**
   * Paints the path's union in one sRGB colour at `alpha`, and empties it.
   * Byte blending in sRGB, which is what a canvas does.
   */
  fill(r: number, g: number, b: number, alpha = 1): void {
    const d = this.data;
    const w = this.width;
    this.scan((y, x0, x1, acc) => {
      let o = (y * w + x0) * 4;
      for (let x = x0; x <= x1; x++, o += 4) {
        const c = acc[x]!;
        if (c <= 0) continue;
        const a = (c >= 1 ? 1 : c) * alpha;
        d[o] = d[o]! + (r - d[o]!) * a;
        d[o + 1] = d[o + 1]! + (g - d[o + 1]!) * a;
        d[o + 2] = d[o + 2]! + (b - d[o + 2]!) * a;
      }
    });
  }

  /**
   * The path's coverage, 0 to 1 a pixel, added into (or with `erase`, taken
   * out of) a field the size of the buffer, and the path emptied: the land's
   * mask, the lakes cut out of it.
   */
  cover(field: Float32Array, erase = false): void {
    const w = this.width;
    this.scan((y, x0, x1, acc) => {
      const row = y * w;
      for (let x = x0; x <= x1; x++) {
        const c = acc[x]!;
        if (c <= 0) continue;
        const v = field[row + x]! + (erase ? -c : c);
        field[row + x] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
    });
  }

  private edge(x0: number, y0: number, x1: number, y1: number, flip: number): void {
    if (y0 === y1) return;
    if (this.edges === this.ex0.length) this.grow();
    const k = this.edges++;
    if (y0 < y1) {
      this.ex0[k] = x0;
      this.ey0[k] = y0;
      this.ex1[k] = x1;
      this.ey1[k] = y1;
      this.ed[k] = flip;
    } else {
      this.ex0[k] = x1;
      this.ey0[k] = y1;
      this.ex1[k] = x0;
      this.ey1[k] = y0;
      this.ed[k] = -flip;
    }
  }

  private grow(): void {
    const n = this.ex0.length * 2;
    const copy = <T extends Float64Array | Int8Array>(a: T, make: (n: number) => T): T => {
      const b = make(n);
      b.set(a);
      return b;
    };
    this.ex0 = copy(this.ex0, (m) => new Float64Array(m));
    this.ey0 = copy(this.ey0, (m) => new Float64Array(m));
    this.ex1 = copy(this.ex1, (m) => new Float64Array(m));
    this.ey1 = copy(this.ey1, (m) => new Float64Array(m));
    this.ed = copy(this.ed, (m) => new Int8Array(m));
    this.order = new Int32Array(n);
    this.active = new Int32Array(n);
    this.xs = new Float64Array(n);
    this.ws = new Int8Array(n);
  }

  /**
   * The scan: an active edge table walked a sub-scanline at a time, each
   * span's exact horizontal coverage added into the row, and the row handed
   * to `paint` once its four sub-scanlines are in.
   */
  private scan(paint: (y: number, x0: number, x1: number, acc: Float32Array) => void): void {
    this.close();
    const count = this.edges;
    this.edges = 0;
    if (count === 0) return;
    const { ex0, ey0, ex1, ey1, ed, order, active, xs, ws, acc } = this;
    const w = this.width;
    let top = Infinity;
    let bottom = -Infinity;
    for (let k = 0; k < count; k++) {
      order[k] = k;
      if (ey0[k]! < top) top = ey0[k]!;
      if (ey1[k]! > bottom) bottom = ey1[k]!;
    }
    const rowFirst = Math.max(0, Math.floor(top));
    const rowLast = Math.min(this.height - 1, Math.ceil(bottom) - 1);
    if (rowFirst > rowLast) return;
    // By the top of each edge, so the table only ever grows from the front.
    const sorted = Array.from(order.subarray(0, count)).sort((a, b) => ey0[a]! - ey0[b]!);
    for (let k = 0; k < count; k++) order[k] = sorted[k]!;
    let next = 0;
    let live = 0;
    const share = 1 / SUB;
    for (let y = rowFirst; y <= rowLast; y++) {
      let lo = w;
      let hi = -1;
      for (let s = 0; s < SUB; s++) {
        const sy = y + (s + 0.5) * share;
        while (next < count && ey0[order[next]!]! <= sy) active[live++] = order[next++]!;
        // Drop the edges that ended above this line, and find the rest's x.
        let n = 0;
        for (let k = 0; k < live; k++) {
          const e = active[k]!;
          if (ey1[e]! <= sy) continue;
          active[n++] = e;
        }
        live = n;
        let m = 0;
        for (let k = 0; k < live; k++) {
          const e = active[k]!;
          if (ey0[e]! > sy) continue;
          const t = (sy - ey0[e]!) / (ey1[e]! - ey0[e]!);
          const x = ex0[e]! + (ex1[e]! - ex0[e]!) * t;
          // Insertion by x: a handful of crossings a line.
          let j = m++;
          while (j > 0 && xs[j - 1]! > x) {
            xs[j] = xs[j - 1]!;
            ws[j] = ws[j - 1]!;
            j--;
          }
          xs[j] = x;
          ws[j] = ed[e]!;
        }
        let winding = 0;
        let from = 0;
        for (let k = 0; k < m; k++) {
          const was = winding;
          winding += ws[k]!;
          if (was === 0 && winding !== 0) from = xs[k]!;
          else if (was !== 0 && winding === 0) {
            let xa = from < 0 ? 0 : from;
            let xb = xs[k]! > w ? w : xs[k]!;
            if (xb <= xa) continue;
            const ia = Math.floor(xa);
            const ib = Math.min(w - 1, Math.floor(xb));
            if (ia < lo) lo = ia;
            if (ib > hi) hi = ib;
            if (ia === ib) acc[ia] = acc[ia]! + (xb - xa) * share;
            else {
              acc[ia] = acc[ia]! + (ia + 1 - xa) * share;
              for (let i = ia + 1; i < ib; i++) acc[i] = acc[i]! + share;
              if (ib < w) acc[ib] = acc[ib]! + (xb - ib) * share;
            }
            xa = xb;
          }
        }
      }
      if (hi >= lo) {
        paint(y, lo, hi, acc);
        acc.fill(0, lo, hi + 1);
      }
      if (next >= count && live === 0) break;
    }
  }
}

/** A linear channel to an sRGB byte. */
export function toByte(linear: number): number {
  const c = linear <= 0 ? 0 : linear >= 1 ? 1 : linear;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/** A `0xRRGGBB` palette entry as its three sRGB bytes. */
export function bytesOf(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}
