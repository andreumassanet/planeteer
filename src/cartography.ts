/**
 * The parts of drawing this planet flat that more than one map needs.
 *
 * There are two of them now — the 180-pixel disc in the corner (`minimap.ts`)
 * and the full-screen chart behind `M` (`map.ts`) — and they disagree about the
 * only thing they *should* disagree about, which is the radial function. One is
 * orthographic and shows the near hemisphere as a globe; the other is
 * equidistant and shows the whole planet with radius reading as distance. Every
 * other decision is the same in both and is made here once: how a coordinate
 * becomes a vector, how the outlines are thinned, which colour a country is,
 * what a pin looks like, and — the one that has already cost a bug — which way
 * round the screen's axes go.
 *
 * **The basis is the reason this file exists.** `minimap.ts` built its own with
 * `right = up x forward`, which is the vector `player.ts` calls *left* three
 * hundred lines away, and drew every map this project has ever shown mirrored
 * east for west. Nothing could tell, for exactly the reason the mirrored planet
 * could not: the pins, the coastline and the bearing wedge are all built from
 * the same wrong basis and all agree with each other. There is one `setFrame`
 * now and both maps call it.
 */
import type { World } from './geo.ts';
import { CONTINENT_COLORS, DEFAULT_LAND } from './theme.ts';
import { hex } from './ui.ts';
import { toUnit, unitAt } from './sphere.ts';

export const R2D = 180 / Math.PI;
export const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/** Mean Earth radius. The outlines are real, so a real distance is meaningful. */
export const EARTH_KM = 6371;

/**
 * lat/lon in degrees to a unit vector, in the one convention this project has:
 * `sphere.ts`'s `toUnit`, re-exported because both maps and the chip's arrow
 * reach for it here.
 *
 * The `-` on z is not a taste: `z = +cos(lat) * sin(lon)` puts east where west
 * belongs and mirrors the entire planet, which this repo shipped for months
 * without a single check noticing. Every conversion goes through `sphere.ts`.
 */
export { toUnit };

/**
 * Where the map is standing and which way its paper is turned.
 *
 * `u` is the point the projection is centred on, `f` is what ends up pointing at
 * the top of the canvas, and `r` is screen right. Flat numbers rather than
 * `Vector3`s because these are read inside the per-point loop of a ring trace,
 * about fifty thousand times a redraw.
 */
export interface Frame {
  ux: number; uy: number; uz: number;
  fx: number; fy: number; fz: number;
  rx: number; ry: number; rz: number;
}

export function createFrame(): Frame {
  return { ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1, rx: 1, ry: 0, rz: 0 };
}

/**
 * Points the frame at `centre`, with `screenUp` at the top of the canvas.
 *
 * `screenUp` need only be *roughly* tangent — the minimap hands it the player's
 * heading and the map hands it the world's north, and both arrive with a little
 * radial component that would tilt the paper instead of turning it. It is
 * reprojected here.
 *
 * **`right` is `screenUp x centre`, and the other order is west.** With the
 * planet's own handedness (`east x north . up = +1`) the identity that fixes it
 * is `north x up = east`; `up x north` is its negative. `player.ts` says the
 * same thing in its own words at the avatar's basis — *"`up x heading` is the
 * other one, and it points left"*.
 *
 * Returns false and leaves the frame alone where there is no answer: at the
 * planet's centre, or with a `screenUp` parallel to it (which is what `north`
 * becomes at a pole).
 */
export function setFrame(
  frame: Frame,
  centre: { x: number; y: number; z: number },
  screenUp: { x: number; y: number; z: number },
): boolean {
  const length = Math.hypot(centre.x, centre.y, centre.z);
  if (length < 1e-9) return false;
  const ux = centre.x / length;
  const uy = centre.y / length;
  const uz = centre.z / length;

  const along = screenUp.x * ux + screenUp.y * uy + screenUp.z * uz;
  let fx = screenUp.x - along * ux;
  let fy = screenUp.y - along * uy;
  let fz = screenUp.z - along * uz;
  const tangent = Math.hypot(fx, fy, fz);
  if (tangent < 1e-9) return false;
  fx /= tangent;
  fy /= tangent;
  fz /= tangent;

  frame.ux = ux;
  frame.uy = uy;
  frame.uz = uz;
  frame.fx = fx;
  frame.fy = fy;
  frame.fz = fz;
  // forward x up. Reverse it and the map is mirrored, which is worse than
  // having no map at all — and undetectable from inside the map.
  frame.rx = fy * uz - fz * uy;
  frame.ry = fz * ux - fx * uz;
  frame.rz = fx * uy - fy * ux;
  return true;
}

const bearingFrame = createFrame();
const bearingPoint = new Float32Array(3);

/**
 * Which way a coordinate lies, clockwise from where `forward` points, in
 * (-PI, PI]. Zero is dead ahead and positive is to your right, so it reads
 * directly as "turn this far". `null` where there is no answer — at the
 * planet's centre, or facing straight up.
 *
 * It is here rather than in the file that wanted it because the sign of that
 * answer is `setFrame`'s `right = forward x up`, and this project has shipped
 * the other order three times. The chip's little arrow and the disc's rim wedge
 * now come out of the same eight lines; two copies of them is two chances to
 * point west.
 *
 * Allocation-free by reusing one frame, which is safe because there is exactly
 * one caller and it asks once a frame.
 */
export function bearingTo(
  from: { x: number; y: number; z: number },
  forward: { x: number; y: number; z: number },
  lat: number,
  lon: number,
): number | null {
  if (!setFrame(bearingFrame, from, forward)) return null;
  toUnit(lat, lon, bearingPoint, 0);
  const x = bearingPoint[0]!;
  const y = bearingPoint[1]!;
  const z = bearingPoint[2]!;
  return Math.atan2(
    x * bearingFrame.rx + y * bearingFrame.ry + z * bearingFrame.rz,
    x * bearingFrame.fx + y * bearingFrame.fy + z * bearingFrame.fz,
  );
}

/** Shoelace area of a ring in square degrees, the same measure `geo.ts` uses. */
function ringArea(points: number[][]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    sum += (b[0]! - a[0]!) * (b[1]! + a[1]!);
  }
  return Math.abs(sum / 2);
}

export interface Shape {
  /**
   * The ring as unit vectors, flat `xyz`. Built once and never touched again:
   * there are ~1,600 rings and ~100,000 points, so anything allocated per frame
   * here lands straight in the frame budget.
   */
  points: Float32Array;
  /**
   * The same ring as the bake wrote it, `[lon, lat]` and unthinned, by
   * reference rather than by copy.
   *
   * It is here so that a caller can ask `geo.ts`'s own `insideRing` a question
   * about this ring — `map.ts` needs to know whether the player's antipode is
   * inside a country — without a second point-in-polygon test existing.
   */
  ring: number[][];
  fill: string;
  /** 1-based index into `world.countries`, so a caller can name what it drew. */
  country: number;
  /** Shoelace area in square degrees, exactly as `geo.ts` measures it. */
  area: number;
  /** Centre of a cap that contains the whole ring, and its angular radius. */
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  /**
   * If `centre . up` falls below this, every point of the ring is behind the
   * horizon and the ring can be skipped outright. It is `cos(90deg + radius)`,
   * and it cannot trigger for a cap wider than a hemisphere — hence the -2.
   *
   * Only the orthographic map has a horizon; the equidistant one draws the whole
   * planet and ignores this.
   */
  hiddenBelow: number;
}

const ringPoint = { x: 0, y: 0, z: 0 };

/**
 * Converts the outlines to unit vectors and thins them to a map's own
 * resolution.
 *
 * Converting to 3D up front is what makes the antimeridian a non-issue: a ring
 * stored with raw longitudes in [-180, 180] has a 360-degree jump in it, but
 * the two points either side of that jump are neighbours on the sphere, so once
 * they are vectors there is no seam left to special-case. Antarctica's ring
 * genuinely does span the full 360 degrees of longitude — measured, not assumed
 * — and it costs nothing here.
 *
 * The thinning is worth more than it looks. The minimap's disc spans a full
 * hemisphere in a couple of hundred pixels, so roughly one degree per pixel:
 * four fifths of the source points are finer than it can draw.
 */
export function buildShapes(world: World, minStep: number, minRadius: number): Shape[] {
  const shapes: Shape[] = [];
  const step2 = minStep * minStep;

  world.countries.forEach((country, index) => {
    // A nation of another world carries its own colour; Earth's countries are
    // painted by continent.
    const fill = hex(country.color ?? CONTINENT_COLORS[country.continent] ?? DEFAULT_LAND);

    for (const ring of country.rings) {
      const xyz: number[] = [];
      let lastX = 0;
      let lastY = 0;
      let lastZ = 0;
      for (const point of ring) {
        const { x, y, z } = unitAt(point[1]!, point[0]!, ringPoint);
        if (xyz.length > 0) {
          const dx = x - lastX;
          const dy = y - lastY;
          const dz = z - lastZ;
          if (dx * dx + dy * dy + dz * dz < step2) continue;
        }
        xyz.push(x, y, z);
        lastX = x;
        lastY = y;
        lastZ = z;
      }
      // Under three points there is no area left to fill: an island smaller
      // than a pixel. There are hundreds of those and none of them can be seen.
      if (xyz.length < 9) continue;

      const points = new Float32Array(xyz);
      const count = points.length / 3;

      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let i = 0; i < points.length; i += 3) {
        sx += points[i]!;
        sy += points[i + 1]!;
        sz += points[i + 2]!;
      }
      const length = Math.hypot(sx, sy, sz);
      let cx = 1;
      let cy = 0;
      let cz = 0;
      let radius = Math.PI;
      if (length > 1e-6) {
        cx = sx / length;
        cy = sy / length;
        cz = sz / length;
        let worst = 1;
        for (let i = 0; i < count; i++) {
          const k = i * 3;
          const dot = points[k]! * cx + points[k + 1]! * cy + points[k + 2]! * cz;
          if (dot < worst) worst = dot;
        }
        radius = Math.acos(Math.max(-1, Math.min(1, worst)));
      }
      if (radius < minRadius) continue;

      shapes.push({
        points,
        ring,
        fill,
        country: index + 1,
        area: ringArea(ring),
        cx,
        cy,
        cz,
        radius,
        hiddenBelow: radius < HALF_PI ? -Math.sin(radius) : -2,
      });
    }
  });

  // Biggest first, so an enclave lands on top of the country that swallows it.
  // Natural Earth's Morocco covers Western Sahara outright and the bake keeps
  // only outer rings, so Lesotho sits under South Africa. `countryAt` resolves
  // that by picking the smallest containing ring; painting in the reverse of
  // that order is what makes a map agree with the ground under your feet.
  shapes.sort((a, b) => b.area - a.area);
  return shapes;
}

/**
 * A teardrop with its point at (x, y) and its head above it, screen-up.
 *
 * The head carries the colour and the point says exactly where, which a dot
 * cannot do at the size these are drawn. The caller sets the stroke; the fill is
 * per pin.
 */
export function tracePin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rise: number,
  head: number,
  fill: string,
  scale = 1,
): void {
  // Half-angle of the cone of tangents from the point to the head, which is
  // where the teardrop's straight sides meet the circle. Scale-free: both radii
  // grow together, so the tangent angle does not move.
  const spread = Math.acos(Math.min(1, head / rise));
  ctx.beginPath();
  ctx.moveTo(x, y);
  // Counterclockwise takes the arc over the top of the head; the other way
  // round it would cut back underneath and the pin would come out a lens.
  ctx.arc(x, y - rise * scale, head * scale, HALF_PI - spread, HALF_PI + spread, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
}

/**
 * Sorts `order[0..count)` by `depth` descending, in place, allocating nothing.
 *
 * Insertion sort because the order barely changes between frames, which is the
 * case it is linear in.
 */
export function sortByDepth(order: Int32Array, depth: Float32Array, count: number): void {
  for (let n = 1; n < count; n++) {
    const value = order[n]!;
    const key = depth[value]!;
    let m = n - 1;
    while (m >= 0 && depth[order[m]!]! < key) {
      order[m + 1] = order[m]!;
      m--;
    }
    order[m + 1] = value;
  }
}

/**
 * Drops any mark that lands within `spacing` pixels of one already kept.
 *
 * The reason a map needs it: Paris holds three landmarks inside 0.04 degrees,
 * and one degree is a pixel and a half on the minimap. Without thinning, Europe
 * is a single scab of overlapping pins and you cannot tell there are cities
 * under it. `order` arrives closest-first, so the pin that survives a cluster is
 * the one you would walk to.
 *
 * `seed` is kept unconditionally and first: everything else may lose a cluster
 * to a closer neighbour, but the pin you asked to be shown may not, whatever it
 * is standing next to. Pass -1 for none.
 *
 * `limit` stops once that many have been kept, which is a cost as well as a
 * taste: this is O(count x kept), and a disc thinned at 13 pixels has room for
 * about 140 marks, so a caller handing it several hundred towns pays twenty
 * thousand distance tests for a picture nobody can read. Since `order` arrives
 * in the caller's own order of importance, stopping early drops the least
 * important marks and nothing else.
 *
 * Returns how many indices were written into `kept`.
 */
export function thinMarks(
  order: Int32Array,
  count: number,
  xs: Float32Array,
  ys: Float32Array,
  spacing: number,
  kept: Int32Array,
  keptX: Float32Array,
  keptY: Float32Array,
  seed = -1,
  limit = Infinity,
): number {
  const spacing2 = spacing * spacing;
  let n = 0;
  if (seed >= 0) {
    for (let i = 0; i < count; i++) {
      if (order[i] !== seed) continue;
      keptX[0] = xs[seed]!;
      keptY[0] = ys[seed]!;
      kept[0] = seed;
      n = 1;
      break;
    }
  }
  for (let i = 0; i < count && n < limit; i++) {
    const mark = order[i]!;
    if (n > 0 && mark === kept[0]) continue;
    const x = xs[mark]!;
    const y = ys[mark]!;
    let crowded = false;
    for (let j = 0; j < n; j++) {
      const dx = x - keptX[j]!;
      const dy = y - keptY[j]!;
      if (dx * dx + dy * dy < spacing2) {
        crowded = true;
        break;
      }
    }
    if (crowded) continue;
    keptX[n] = x;
    keptY[n] = y;
    kept[n] = mark;
    n++;
  }
  return n;
}

/**
 * Boxes already spoken for by a label, and whether one more fits.
 *
 * The dumbest possible label placer — a linear scan of axis-aligned rectangles —
 * and it is the right one at this volume: 85 landmarks and 239 countries is
 * under 350 candidates, each tested against at most a few dozen survivors. The
 * landmark list grows a curated batch at a time, so this has room.
 * Ordered by importance by the caller, so what gets dropped is the least
 * important thing in a crowd rather than the last one considered.
 */
export class LabelSpace {
  private readonly x0: number[] = [];
  private readonly y0: number[] = [];
  private readonly x1: number[] = [];
  private readonly y1: number[] = [];

  fits(x: number, y: number, width: number, height: number): boolean {
    const ax1 = x + width;
    const ay1 = y + height;
    for (let i = 0; i < this.x0.length; i++) {
      if (ax1 <= this.x0[i]! || x >= this.x1[i]! || ay1 <= this.y0[i]! || y >= this.y1[i]!) continue;
      return false;
    }
    return true;
  }

  claim(x: number, y: number, width: number, height: number): void {
    this.x0.push(x);
    this.y0.push(y);
    this.x1.push(x + width);
    this.y1.push(y + height);
  }
}

/**
 * Text with a paper-coloured halo under it, which is how a printed atlas keeps a
 * name legible over a coastline.
 *
 * The halo is a stroke of the glyphs themselves rather than a filled box: a box
 * would cover the coast it sits on, and the whole point of a label on a map is
 * that you can still see what it is labelling.
 */
export function inkedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  halo: string,
  fill: string,
  weight = 3,
): void {
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = weight;
  ctx.strokeStyle = halo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
