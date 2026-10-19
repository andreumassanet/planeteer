import * as THREE from 'three';
import { LINE_HALF } from '../scenery/ground.ts';
import { EDGE_LINE_IN, EDGE_LINE_SHARE, visibleRuns, pieceAt } from './markings.ts';
import { MARK_PAINT, MARK_ROAD } from './material.ts';
import { insideOthers } from './overlap.ts';
import type { OtherRoad } from './overlap.ts';
import { PALETTE } from '../theme.ts';

/**
 * Writes one road's ribbon vertices: positions in world units at double
 * precision, colours, the paint mark (`roadMark`) and each vertex's light.
 */

/** One road's ribbon in one band, as kept in the ribbon cache. */
export interface Ribbon {
  position: Float64Array;
  color: Float32Array;
  /** What each vertex is and where across it lies: see `MARK_ROAD`. */
  mark: Int8Array;
  /**
   * Where each vertex is in its end town's own plane (`townFrame`), the plane
   * a town's floor draws its patterns in, and how much of the town's paint it
   * takes: 1 at a built town's kerb, 0 past `CARRIAGE_RUN`.
   */
  surface: Float32Array;
  /** The first of the two light bytes; the hour byte is always 255. */
  glow: Uint8Array;
  bytes: number;
}

/**
 * Where the centre line's dash lies along a piece, as shares of it: one dash
 * over the far third or so, past the crown quad's diagonal so it lies in one
 * triangle. A piece shorter than `DASH_PIECE` (a ramp's end stub) gets none.
 */
const DASH_FROM = 0.6;
const DASH_TO = 0.95;
const DASH_PIECE = 6;

/**
 * How far the paint stands off the crown it is painted on. A distance rather
 * than a depth offset, because at the planet's radius a float steps by about
 * 0.002 and a depth offset alone let the line flicker; nothing stands on it.
 */
const DASH_LIFT = 0.04;

/** The paint: the palette's white a fifth of the way to bone. */
const LINE = new THREE.Color(PALETTE.white).lerp(new THREE.Color(PALETTE.bone), 0.2);

/** The plane a ribbon's patterns are drawn in: an end town's `across` and `north`, and how its paint is shared out. */
export interface SurfacePlane {
  across: THREE.Vector3;
  north: THREE.Vector3;
  /** The share of the town's paint at a point: 1 at its kerb. */
  share(point: THREE.Vector3): number;
}

export interface RibbonWriter {
  /** Sets the mark the next quads carry: what they are, and `across` for each quad's first and second pair. */
  markAs(what: number, a?: number, b?: number): void;
  /** Two triangles, `p0`-`p1` in `c0`/`c1` and `p2`-`p3` in `c2`/`c3`. */
  patch(
    p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3,
    c0: THREE.Color, c1: THREE.Color, c2: THREE.Color, c3: THREE.Color,
  ): void;
  quad(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, c0: THREE.Color, c1: THREE.Color): void;
  /** The plane the next quads' patterns are drawn in: one for a whole piece, so no triangle straddles two. */
  planeAs(plane: SurfacePlane): void;
  finish(): Ribbon;
}

/** A writer whose vertices take their light byte from `glowAt`. */
export function createRibbonWriter(glowAt: (point: THREE.Vector3) => number): RibbonWriter {
  const positions: number[] = [];
  const colors: number[] = [];
  const marks: number[] = [];
  const glow: number[] = [];
  const surface: number[] = [];
  let plane: SurfacePlane | null = null;
  let kind: number = MARK_PAINT;
  let acrossA = 0;
  let acrossB = 0;
  const push = (p: THREE.Vector3, c: THREE.Color, across: number): void => {
    positions.push(p.x, p.y, p.z);
    colors.push(c.r, c.g, c.b);
    marks.push(kind, Math.round(across * 127));
    glow.push(glowAt(p));
    if (plane === null) surface.push(0, 0, 0);
    else surface.push(p.dot(plane.across), p.dot(plane.north), plane.share(p));
  };
  const patch: RibbonWriter['patch'] = (p0, p1, p2, p3, c0, c1, c2, c3) => {
    push(p0, c0, acrossA); push(p1, c1, acrossA); push(p2, c2, acrossB);
    push(p0, c0, acrossA); push(p2, c2, acrossB); push(p3, c3, acrossB);
  };
  return {
    markAs(what, a = 0, b = a) {
      kind = what;
      acrossA = a;
      acrossB = b;
    },
    patch,
    quad: (p0, p1, p2, p3, c0, c1) => patch(p0, p1, p2, p3, c0, c0, c1, c1),
    planeAs(next) {
      plane = next;
    },
    finish: () => ({
      position: Float64Array.from(positions),
      color: Float32Array.from(colors),
      mark: Int8Array.from(marks),
      glow: Uint8Array.from(glow),
      surface: Float32Array.from(surface),
      bytes: positions.length * 8 + colors.length * 4 + marks.length + glow.length + surface.length * 4,
    }),
  };
}

const dashCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const dashUp = new THREE.Vector3();
const dashEdge = new THREE.Vector3();

/**
 * The centre line's dash on one piece of a marked road: a strip `LINE_HALF`
 * either side of the middle, in the plane of the crown triangle `(n1, f1, f2)`
 * it lies in and `DASH_LIFT` off it, so it costs two triangles and no split of
 * the crown. In that triangle the surface is `n1 + along (f1 - n1) + across (f2 - f1)`.
 */
export function dash(
  writer: RibbonWriter, n1: THREE.Vector3, f1: THREE.Vector3, f2: THREE.Vector3, length: number, half: number, a0 = 0, a1 = 1,
): void {
  if (length < DASH_PIECE) return;
  const from = Math.max(DASH_FROM, a0);
  const to = Math.min(DASH_TO, a1);
  if ((to - from) * length < LINE_HALF) return;
  const w = Math.min(0.1, LINE_HALF / (2 * half));
  // The crown triangle's own up, turned away from the planet's centre.
  dashUp.subVectors(f1, n1).cross(dashEdge.subVectors(f2, n1)).normalize();
  if (dashUp.dot(n1) < 0) dashUp.negate();
  const at = (along: number, across: number, into: THREE.Vector3) =>
    into.copy(n1).addScaledVector(f1, along).addScaledVector(n1, -along).addScaledVector(f2, across).addScaledVector(f1, -across)
      .addScaledVector(dashUp, DASH_LIFT);
  const p0 = at(from, 0.5 - w, dashCorners[0]!);
  const p1 = at(to, 0.5 - w, dashCorners[1]!);
  const p2 = at(to, 0.5 + w, dashCorners[2]!);
  const p3 = at(from, 0.5 + w, dashCorners[3]!);
  writer.quad(p0, p1, p2, p3, LINE, LINE);
}

const runUp = new THREE.Vector3();

/**
 * The centre line over shares `a0` to `a1` of a piece of carriageway, as a
 * town paints its street's: `LINE_HALF` either side of the middle, `DASH_LIFT`
 * off the crown. The quad `(n1, f1, f2, n2)` is two triangles split along
 * `n1`-`f2`, which the middle crosses halfway: the far half of the run lies in
 * `(n1, f1, f2)` and the near half in `(n1, f2, n2)`, each in its own plane.
 */
export function dashRun(
  writer: RibbonWriter, n1: THREE.Vector3, f1: THREE.Vector3, f2: THREE.Vector3, n2: THREE.Vector3, half: number,
  a0: number, a1: number, colour: THREE.Color,
): void {
  const w = Math.min(0.1, LINE_HALF / (2 * half));
  // The far triangle: n1 + along (f1 - n1) + across (f2 - f1), where across <= along.
  const far = (along: number, across: number, into: THREE.Vector3) =>
    into.copy(n1).addScaledVector(f1, along).addScaledVector(n1, -along).addScaledVector(f2, across).addScaledVector(f1, -across)
      .addScaledVector(runUp, DASH_LIFT);
  // The near triangle: n1 + across (n2 - n1) + along (f2 - n2), where across >= along.
  const near = (along: number, across: number, into: THREE.Vector3) =>
    into.copy(n1).addScaledVector(n2, across).addScaledVector(n1, -across).addScaledVector(f2, along).addScaledVector(n2, -along)
      .addScaledVector(runUp, DASH_LIFT);
  const lay = (from: number, to: number, at: typeof far, p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3): void => {
    if (to - from < 1e-5) return;
    runUp.subVectors(q, p).cross(dashEdge.subVectors(r, p)).normalize();
    if (runUp.dot(n1) < 0) runUp.negate();
    writer.quad(
      at(from, 0.5 - w, dashCorners[0]!), at(to, 0.5 - w, dashCorners[1]!),
      at(to, 0.5 + w, dashCorners[2]!), at(from, 0.5 + w, dashCorners[3]!),
      colour, colour,
    );
  };
  lay(Math.max(a0, 0.5), a1, far, n1, f1, f2);
  lay(a0, Math.min(a1, 0.5), near, n1, f2, n2);
}

const edgeUp = new THREE.Vector3();

/**
 * A solid line down one edge of the carriageway, `EDGE_LINE_IN` in from it,
 * lifted `DASH_LIFT` off the triangle of the carriageway's quad it lies in:
 * the left one in `(n1, f1, f2)`, the right one in `(n1, f2, n2)`.
 */
export function edgeLine(
  writer: RibbonWriter, n1: THREE.Vector3, f1: THREE.Vector3, f2: THREE.Vector3, n2: THREE.Vector3, half: number,
  right: boolean, a0: number, a1: number,
): void {
  const w0 = EDGE_LINE_IN / (2 * half);
  const w1 = (EDGE_LINE_IN + 2 * LINE_HALF * EDGE_LINE_SHARE) / (2 * half);
  if (!right) {
    edgeUp.subVectors(f1, n1).cross(dashEdge.subVectors(f2, n1)).normalize();
    if (edgeUp.dot(n1) < 0) edgeUp.negate();
    const left = (along: number, across: number, into: THREE.Vector3) =>
      into.copy(n1).addScaledVector(f1, along).addScaledVector(n1, -along).addScaledVector(f2, across).addScaledVector(f1, -across)
        .addScaledVector(edgeUp, DASH_LIFT);
    writer.quad(left(a0, w0, dashCorners[0]!), left(a1, w0, dashCorners[1]!), left(a1, w1, dashCorners[2]!), left(a0, w1, dashCorners[3]!), LINE, LINE);
    return;
  }
  edgeUp.subVectors(f2, n1).cross(dashEdge.subVectors(n2, n1)).normalize();
  if (edgeUp.dot(n1) < 0) edgeUp.negate();
  const rightAt = (along: number, across: number, into: THREE.Vector3) =>
    into.copy(n1).addScaledVector(n2, across).addScaledVector(n1, -across).addScaledVector(f2, along).addScaledVector(n2, -along)
      .addScaledVector(edgeUp, DASH_LIFT);
  writer.quad(rightAt(a0, 1 - w1, dashCorners[0]!), rightAt(a1, 1 - w1, dashCorners[1]!), rightAt(a1, 1 - w0, dashCorners[2]!), rightAt(a0, 1 - w0, dashCorners[3]!), LINE, LINE);
}

const stripCorner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/** The piece of a strip from `nA`-`nB` to `fA`-`fB` between shares `a0` and `a1` of the way along. */
function strip(
  writer: RibbonWriter, nA: THREE.Vector3, fA: THREE.Vector3, fB: THREE.Vector3, nB: THREE.Vector3, a0: number, a1: number, colour: THREE.Color,
): void {
  if (a0 <= 0 && a1 >= 1) {
    writer.quad(nA, fA, fB, nB, colour, colour);
    return;
  }
  writer.quad(
    stripCorner[0]!.copy(nA).lerp(fA, a0), stripCorner[1]!.copy(nA).lerp(fA, a1),
    stripCorner[2]!.copy(nB).lerp(fB, a1), stripCorner[3]!.copy(nB).lerp(fB, a0),
    colour, colour,
  );
}

const carriageOf = (other: OtherRoad): number => other.half;
const shoulderRuns: number[] = [];

/**
 * A shoulder (or pavement) strip: in its own colour and mark (`own`) where it
 * is its own, and in the carriageway's (`crown`) where it lies on one of the
 * `active` roads' carriageways, so a fork opens as tarmac rather than a strip
 * of gravel across the other road. `outerFirst` says which side is the top's
 * edge, for the mark's `across`: 1 there, 0 at the carriageway.
 */
export function shoulderStrip(
  writer: RibbonWriter, active: readonly OtherRoad[],
  nA: THREE.Vector3, fA: THREE.Vector3, fB: THREE.Vector3, nB: THREE.Vector3,
  colour: THREE.Color, own: number, crown: THREE.Color, outerFirst: boolean,
): void {
  const ownMark = (): void => writer.markAs(own, outerFirst ? 1 : 0, outerFirst ? 0 : 1);
  if (active.length === 0) {
    ownMark();
    writer.quad(nA, fA, fB, nB, colour, colour);
    return;
  }
  const kept = visibleRuns((along) => insideOthers(active, pieceAt(nA, nB, fA, fB, 0.5, along), carriageOf) > 0, shoulderRuns);
  let at = 0;
  for (let k = 0; k < kept.length; k += 2) {
    writer.markAs(MARK_ROAD, 0);
    if (kept[k]! > at + 1e-6) strip(writer, nA, fA, fB, nB, at, kept[k]!, crown);
    ownMark();
    strip(writer, nA, fA, fB, nB, kept[k]!, kept[k + 1]!, colour);
    at = kept[k + 1]!;
  }
  writer.markAs(MARK_ROAD, 0);
  if (at < 1 - 1e-6) strip(writer, nA, fA, fB, nB, at, 1, crown);
}
