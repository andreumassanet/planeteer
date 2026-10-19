import * as THREE from 'three';
import { LINE_HALF } from '../scenery/ground.ts';
import { insideOthers } from './overlap.ts';
import { carriageHalf } from './section.ts';
import type { OtherRoad } from './overlap.ts';

/**
 * The painted lines on a carriageway, and where they give way to another
 * road's surface. The ribbon paints these runs and `pnpm check` walks them.
 */

/** How far in from the carriageway's edge its edge line is painted, in world units, and how wide as a share of the centre line's. */
export const EDGE_LINE_IN = 0.25;
export const EDGE_LINE_SHARE = 0.7;

/**
 * Where across a carriageway its edge line's middle is, as a share of the
 * width from the left edge; `right` is the other edge.
 */
export function edgeLineAcross(half: number, right: boolean): number {
  const inset = (EDGE_LINE_IN + LINE_HALF * EDGE_LINE_SHARE) / (2 * half);
  return right ? 1 - inset : inset;
}

/**
 * How far into another road's carriageway this road's edge line may run before
 * it gives way: inside a road drawn behind it, the line holds until it is past
 * that road's own edge line, so where two roads share an approach the front
 * road's edge lines are kept.
 */
export const EDGE_KEEP = EDGE_LINE_IN + 2 * LINE_HALF * EDGE_LINE_SHARE + 0.3;

/** Another road's carriageway half-width `s` along it: its street's near a built town. */
const carriageOf = (other: OtherRoad, s: number): number => carriageHalf(other.ramp, other.half, s, other.path.length - s);

/** Where this road's edge line gives way to another road: see `EDGE_KEEP`. */
export const edgeGives = (other: OtherRoad, s: number): number => carriageOf(other, s) - (other.front ? 0.05 : EDGE_KEEP);
/** Where its dash gives way: inside the carriageway of a road drawn in front, and nowhere else. */
export const dashGives = (other: OtherRoad, s: number): number => (other.front ? carriageOf(other, s) - 0.05 : -1);

const markProbe = new THREE.Vector3();
const markProbeFar = new THREE.Vector3();

/**
 * A point on a piece of carriageway, `across` of the way from its left edge to
 * its right and `along` from its near section to its far one. Shared, and
 * overwritten by the next call.
 */
export function pieceAt(
  nearL: THREE.Vector3, nearR: THREE.Vector3, farL: THREE.Vector3, farR: THREE.Vector3, across: number, along: number,
): THREE.Vector3 {
  markProbe.copy(nearL).lerp(nearR, across);
  markProbeFar.copy(farL).lerp(farR, across);
  return markProbe.lerp(markProbeFar, along);
}

const RUN_SAMPLES = 12;

/**
 * The stretches of a piece, as pairs of shares along it, where `hidden` is
 * false: tested at `RUN_SAMPLES` points and each change located by six
 * halvings. Written into `into`.
 */
export function visibleRuns(hidden: (along: number) => boolean, into: number[]): number[] {
  into.length = 0;
  let lastAt = 0;
  let last = hidden(0);
  let start = last ? -1 : 0;
  for (let k = 1; k <= RUN_SAMPLES; k++) {
    const at = k / RUN_SAMPLES;
    const now = hidden(at);
    if (now !== last) {
      let lo = lastAt;
      let hi = at;
      for (let b = 0; b < 6; b++) {
        const mid = (lo + hi) * 0.5;
        if (hidden(mid) === last) lo = mid;
        else hi = mid;
      }
      const edge = (lo + hi) * 0.5;
      if (last) start = edge;
      else into.push(start, edge);
    }
    lastAt = at;
    last = now;
  }
  if (!last) into.push(start, 1);
  return into;
}

/**
 * Where a line painted `across` of the way over a piece of carriageway is
 * drawn, given the other roads near it and how far into each it may run
 * (`edgeGives`, `dashGives`).
 */
export function markingRuns(
  others: readonly OtherRoad[],
  nearL: THREE.Vector3, nearR: THREE.Vector3, farL: THREE.Vector3, farR: THREE.Vector3,
  across: number, gives: (other: OtherRoad, s: number) => number, into: number[],
): number[] {
  if (others.length === 0) {
    into.length = 0;
    into.push(0, 1);
    return into;
  }
  return visibleRuns((along) => insideOthers(others, pieceAt(nearL, nearR, farL, farR, across, along), gives) > 0, into);
}

/**
 * The carriageway's two edges on a ribbon section's top (`ribbonSection`'s
 * third and fourth points), which is a straight line `top` either side.
 */
export function carriageEdges(
  section: readonly THREE.Vector3[], top: number, half: number, left: THREE.Vector3, right: THREE.Vector3,
): void {
  const u = (top - half) / (2 * top);
  left.copy(section[2]!).lerp(section[3]!, u);
  right.copy(section[2]!).lerp(section[3]!, 1 - u);
}
