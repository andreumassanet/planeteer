import { EDGE_RUN, GROUND_LIFT, KERB_DROP, cellKey } from '../ground.ts';
import type { FloorField, FloorPlan, FloorStats } from '../floor.ts';

/**
 * The slope round a town's paving: one course of cells from the paving's top
 * down under the ground, and the vertical faces the floor still draws.
 */

/**
 * The shallowest the edge slope's foot is laid under the ground, in world
 * units. The land mesh runs under the relief about as often as over it, so a
 * foot laid at the relief would leave a lip of slope over the field; 1.0 keeps
 * that lip rare while the median town's slope stays at its aimed gradient.
 */
export const EDGE_FOOT = 1.0;

/**
 * How far under the ground the edge slope's outer corners are laid, for a
 * town of cell `pitch`: solved so that a straight line from the paving's top
 * at the kerb to `sink` under the ground one course out crosses level ground
 * `EDGE_RUN` from the kerb. `EDGE_FOOT` binds below a pitch of 12, where the
 * slope comes out steeper than aimed.
 */
export function edgeSink(pitch: number): number {
  return Math.max(EDGE_FOOT, GROUND_LIFT * (pitch / EDGE_RUN - 1));
}

/**
 * One cell of the edge slope. Every corner touching the paving stands at
 * `top`, the surface of its lowest paved neighbour (by edge, else by corner),
 * so a slope never stands over paving it meets; every other corner stands at
 * the foot `buildFloor` recorded for it.
 */
export interface EdgeApron {
  top: number;
  /** 0 splits the cell along its (i, j)–(i+1, j+1) diagonal, 1 along the other. */
  diagonal: 0 | 1;
}

/** Whether lattice corner `(i, j)` touches a paved cell. */
export function touchesPaving(terraces: ReadonlyMap<number, number>, i: number, j: number): boolean {
  return terraces.has(cellKey(i - 1, j - 1)) || terraces.has(cellKey(i, j - 1)) ||
    terraces.has(cellKey(i - 1, j)) || terraces.has(cellKey(i, j));
}

/** Corner `(i, j)` of an apron cell, as an elevation: its owner's top, or its own foot. */
export function apronCorner(field: FloorField, apron: EdgeApron, i: number, j: number): number {
  if (touchesPaving(field.terraces, i, j)) return apron.top;
  return field.feet?.get(cellKey(i, j)) ?? apron.top;
}

export const EDGES: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAGONALS: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

export const colOf = (key: number): number => Math.floor(key / 1024) - 512;
export const rowOf = (key: number): number => (key % 1024) - 512;

/** The cells one course out from the paving, in the order the paving iterates. */
function courseOf(terraces: ReadonlyMap<number, number>): number[] {
  const course: number[] = [];
  const seen = new Set<number>();
  for (const key of terraces.keys()) {
    const col = colOf(key);
    const row = rowOf(key);
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const near = cellKey(col + dc, row + dr);
        if (terraces.has(near) || seen.has(near)) continue;
        seen.add(near);
        course.push(near);
      }
    }
  }
  return course;
}

/** The lowest paved surface next to a cell by edge, else by corner, and whether it was by edge. */
function ownerTop(terraces: ReadonlyMap<number, number>, col: number, row: number): { top: number; byEdge: boolean } {
  let top = Infinity;
  for (const [dc, dr] of EDGES) {
    const level = terraces.get(cellKey(col + dc, row + dr));
    if (level !== undefined && level + GROUND_LIFT < top) top = level + GROUND_LIFT;
  }
  if (top < Infinity) return { top, byEdge: true };
  for (const [dc, dr] of DIAGONALS) {
    const level = terraces.get(cellKey(col + dc, row + dr));
    if (level !== undefined && level + GROUND_LIFT < top) top = level + GROUND_LIFT;
  }
  return { top, byEdge: false };
}

/**
 * The diagonal a slope cell is split along. One corner on the paving (off a
 * convex corner) or three (inside an L): split through the odd corner, so the
 * two triangles meet in a hip or a valley rather than a twisted fold.
 */
function diagonalOf(inner: readonly boolean[]): 0 | 1 {
  const count = inner.filter(Boolean).length;
  if (count === 1 || count === 3) {
    const odd = inner.findIndex((flag) => flag === (count === 1));
    return odd === 0 || odd === 2 ? 0 : 1;
  }
  if (count === 2 && inner[1] && inner[3]) return 1;
  return 0;
}

/**
 * The edge slope round the paving: its cells and the feet of their outer
 * corners. A cell with a corner in the sea keeps a quay's vertical face
 * instead, and so does one `plan.open` refuses.
 */
export function edgeSlope(plan: FloorPlan, stats: FloorStats): { aprons: Map<number, EdgeApron>; feet: Map<number, number> } {
  const { terraces } = plan;
  const pitch = plan.grid.pitch;
  const sink = edgeSink(pitch);
  const aprons = new Map<number, EdgeApron>();
  const feet = new Map<number, number>();
  const ground: (number | null)[] = [0, 0, 0, 0];
  const inner: boolean[] = [false, false, false, false];
  for (const key of courseOf(terraces)) {
    const col = colOf(key);
    const row = rowOf(key);
    if (plan.open !== undefined && !plan.open(col, row)) continue;
    // The corners in the order `pushQuad` takes them: (i, j), (i+1, j), (i+1, j+1), (i, j+1).
    const corners = [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]] as const;
    let sea = false;
    for (let k = 0; k < 4; k++) {
      const [i, j] = corners[k]!;
      ground[k] = plan.cornerGround(i, j);
      inner[k] = touchesPaving(terraces, i, j);
      if (ground[k] === null) sea = true;
    }
    if (sea) continue;
    const { top, byEdge } = ownerTop(terraces, col, row);
    if (top === Infinity) continue;
    aprons.set(key, { top, diagonal: diagonalOf(inner) });
    for (let k = 0; k < 4; k++) {
      if (inner[k]) continue;
      const [i, j] = corners[k]!;
      const foot = ground[k]! - sink;
      feet.set(cellKey(i, j), foot);
      if (byEdge) stats.embankment = Math.max(stats.embankment, (top - foot) / pitch);
    }
  }
  return { aprons, feet };
}

/**
 * Counts the paved edges that end in a slope or a quay, and the tallest
 * vertical face the floor draws: risers, quays, the face down to a slope laid
 * from a lower terrace, and the wedge between two slopes of different owners.
 */
export function wallStats(plan: FloorPlan, aprons: ReadonlyMap<number, EdgeApron>, stats: FloorStats): void {
  const { terraces } = plan;
  for (const [key, level] of terraces) {
    const col = colOf(key);
    const row = rowOf(key);
    const top = level + GROUND_LIFT;
    for (const [dc, dr] of EDGES) {
      const near = cellKey(col + dc, row + dr);
      const beside = terraces.get(near);
      if (beside !== undefined) {
        if (beside < level) stats.wall = Math.max(stats.wall, level - beside);
        continue;
      }
      const apron = aprons.get(near);
      if (apron !== undefined) {
        stats.slopes++;
        stats.wall = Math.max(stats.wall, top - apron.top);
        continue;
      }
      // The quay: down to `KERB_DROP` under the ground at each end of the edge.
      stats.quays++;
      const [i0, j0, i1, j1] = dc !== 0
        ? [dc > 0 ? col + 1 : col, row, dc > 0 ? col + 1 : col, row + 1]
        : [col, dr > 0 ? row + 1 : row, col + 1, dr > 0 ? row + 1 : row];
      const low = Math.min(plan.cornerGround(i0, j0) ?? 0, plan.cornerGround(i1, j1) ?? 0);
      stats.wall = Math.max(stats.wall, top - Math.max(0, low) + KERB_DROP);
    }
  }
  for (const [key, apron] of aprons) {
    for (const [dc, dr] of EDGES) {
      const other = aprons.get(cellKey(colOf(key) + dc, rowOf(key) + dr));
      if (other !== undefined) stats.wall = Math.max(stats.wall, Math.abs(apron.top - other.top));
    }
  }
}
