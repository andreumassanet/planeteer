import { PLANET_RADIUS } from '../globe.ts';
import { cellCentre, cellIndex } from '../scenery/grid.ts';
import type { TownGrid } from '../scenery/grid.ts';
import { GROUND_LIFT, cellKey } from '../scenery/ground.ts';
import { yawed } from '../scenery/solids.ts';
import type { Solid } from '../scenery/solids.ts';
import { EDGE_SETBACK, FIT_SCALE } from './rules.ts';
import type { FlatVariant, Rect } from './types.ts';

/** Where a building may stand in a block of cells, which way it faces, and how it fits. */

/**
 * The ground a building may take over a block of cells: the cells, less the
 * street band on every side that has one (and a gate's widened mouth, from
 * `widened` by `cellKey * 4 + side`), less `EDGE_SETBACK` on the square's
 * edge. A back side gives nothing up, so two houses back to back share a wall.
 */
export function rectOf(
  grid: TownGrid, band: number, c0: number, c1: number, r0: number, r1: number,
  widened?: ReadonlyMap<number, number>,
): Rect {
  const half = grid.pitch * 0.5;
  const last = grid.cells - 1;
  /** How much further a gate's mouth takes the street into the block on `side`, along one edge of it. */
  const mouth = (side: number, cols: [number, number], rows: [number, number]): number => {
    if (widened === undefined || widened.size === 0) return 0;
    let most = 0;
    for (let c = cols[0]; c <= cols[1]; c++) {
      for (let r = rows[0]; r <= rows[1]; r++) most = Math.max(most, widened.get(cellKey(c, r) * 4 + side) ?? 0);
    }
    return most;
  };
  return {
    x0: cellCentre(grid, c0) - half + (grid.low[c0] === 1 ? band + mouth(2, [c0, c0], [r0, r1]) : 0) + (c0 === 0 ? EDGE_SETBACK : 0),
    x1: cellCentre(grid, c1) + half - (grid.high[c1] === 1 ? band + mouth(0, [c1, c1], [r0, r1]) : 0) - (c1 === last ? EDGE_SETBACK : 0),
    z0: cellCentre(grid, r0) - half + (grid.low[r0] === 1 ? band + mouth(3, [c0, c1], [r0, r0]) : 0) + (r0 === 0 ? EDGE_SETBACK : 0),
    z1: cellCentre(grid, r1) + half - (grid.high[r1] === 1 ? band + mouth(1, [c0, c1], [r1, r1]) : 0) - (r1 === last ? EDGE_SETBACK : 0),
  };
}

/**
 * The sides of a block a building could face, as `FACING_YAW` indices: every
 * side with a street on it, or for a block with none, every side on the edge.
 */
export function facingSides(grid: TownGrid, c0: number, c1: number, r0: number, r1: number): number[] {
  const last = grid.cells - 1;
  const sides: number[] = [];
  if (grid.high[c1] === 1 || (c1 < last && grid.avenue[c1 + 1] === 1)) sides.push(0);
  if (grid.high[r1] === 1 || (r1 < last && grid.avenue[r1 + 1] === 1)) sides.push(1);
  if (grid.low[c0] === 1 || (c0 > 0 && grid.avenue[c0 - 1] === 1)) sides.push(2);
  if (grid.low[r0] === 1 || (r0 > 0 && grid.avenue[r0 - 1] === 1)) sides.push(3);
  if (sides.length > 0) return sides;
  if (c1 === last) sides.push(0);
  if (r1 === last) sides.push(1);
  if (c0 === 0) sides.push(2);
  if (r0 === 0) sides.push(3);
  return sides.length > 0 ? sides : [1];
}

/** The yaw that turns a part's front (+Z) towards each side: +x, +z, -x, -z. Quarter turns only: a building faces its street. */
export const FACING_YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI] as const;

/**
 * Where a variant stands in a rectangle facing one side, or null if it does
 * not fit even at `FIT_SCALE`. The test is the variant's own turned plan box,
 * so a building inside its rectangle cannot overlap another's. Its front goes
 * flush with the street side (the building line), and `slide` places it along
 * that side in whatever room is left.
 */
export function fitIn(flat: FlatVariant, rect: Rect, side: number, scale: number, slide: number): { x: number; z: number; scale: number } | null {
  const yaw = FACING_YAW[side]!;
  const c = Math.round(Math.cos(yaw));
  const s = Math.round(Math.sin(yaw));
  const box = flat.box;
  let ax0 = Infinity;
  let ax1 = -Infinity;
  let az0 = Infinity;
  let az1 = -Infinity;
  for (const [px, pz] of [[box.minX, box.minZ], [box.maxX, box.minZ], [box.maxX, box.maxZ], [box.minX, box.maxZ]] as const) {
    // Three's rotation about Y, which is what the raise composes.
    const x = px * c + pz * s;
    const z = -px * s + pz * c;
    ax0 = Math.min(ax0, x);
    ax1 = Math.max(ax1, x);
    az0 = Math.min(az0, z);
    az1 = Math.max(az1, z);
  }
  const width = ax1 - ax0;
  const depth = az1 - az0;
  const roomX = rect.x1 - rect.x0;
  const roomZ = rect.z1 - rect.z0;
  if (roomX <= 0 || roomZ <= 0 || width <= 0 || depth <= 0) return null;
  const most = Math.min(roomX / width, roomZ / depth);
  if (most < FIT_SCALE) return null;
  const k = Math.min(scale, most);
  const slackX = roomX - width * k;
  const slackZ = roomZ - depth * k;
  if (side === 0) return { x: rect.x1 - ax1 * k, z: rect.z0 - az0 * k + slackZ * slide, scale: k };
  if (side === 2) return { x: rect.x0 - ax0 * k, z: rect.z0 - az0 * k + slackZ * slide, scale: k };
  if (side === 1) return { x: rect.x0 - ax0 * k + slackX * slide, z: rect.z1 - az1 * k, scale: k };
  return { x: rect.x0 - ax0 * k + slackX * slide, z: rect.z0 - az0 * k, scale: k };
}

/**
 * A standing building's wall for `solids.ts`: its plan box turned by its yaw
 * and scaled, centred where the box's own centre lands, as tall as the variant
 * from the terrace it stands on.
 */
export function solidOf(flat: FlatVariant, x: number, z: number, yaw: number, scale: number, level: number): Solid {
  const box = flat.box;
  const cx = (box.minX + box.maxX) * 0.5 * scale;
  const cz = (box.minZ + box.maxZ) * 0.5 * scale;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return yawed(
    x + cx * c + cz * s,
    z - cx * s + cz * c,
    yaw,
    (box.maxX - box.minX) * 0.5 * scale,
    (box.maxZ - box.minZ) * 0.5 * scale,
    PLANET_RADIUS + level + GROUND_LIFT + flat.height * scale,
  );
}

/** Adds the cells whose centres a solid's footprint covers, and the one it stands in. */
export function pavedUnder(solid: Solid, grid: TownGrid, into: Set<number>): void {
  const reach = Math.hypot(solid.hx, solid.hz);
  const c0 = cellIndex(grid, solid.x - reach);
  const c1 = cellIndex(grid, solid.x + reach);
  const r0 = cellIndex(grid, solid.z - reach);
  const r1 = cellIndex(grid, solid.z + reach);
  into.add(cellKey(cellIndex(grid, solid.x), cellIndex(grid, solid.z)));
  for (let col = c0; col <= c1; col++) {
    for (let row = r0; row <= r1; row++) {
      const dx = cellCentre(grid, col) - solid.x;
      const dz = cellCentre(grid, row) - solid.z;
      const a = dx * solid.cos + dz * solid.sin;
      const b = -dx * solid.sin + dz * solid.cos;
      if (Math.abs(a) <= solid.hx && Math.abs(b) <= solid.hz) into.add(cellKey(col, row));
    }
  }
}
