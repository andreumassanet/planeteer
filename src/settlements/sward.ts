import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { flightAt, floorLiftAt } from '../scenery/floor.ts';
import { cellCentre, cellIndex, inGrid } from '../scenery/grid.ts';
import { cellKey } from '../scenery/ground.ts';
import { solidAt } from '../scenery/solids.ts';
import type { Registry } from './registry.ts';
import type { SlotFloor } from './types.ts';

/**
 * Where the grass may grow in and round the standing towns (`grass.ts`).
 *
 * A lawn gives its floor's height; the rest of the paving gives nothing, nor
 * does a terrace the drawn land has come up through; the edge slope gives
 * whichever of the slope and the land is on top. Every surface keeps `margin`
 * off a side of its cell where the ground across is not the same surface,
 * since the grass is laid between baked field points and would lay a blade
 * across a drop or over a kerb. Ground no standing floor covers is the land's.
 */

/** How far apart two surfaces at a cell's side may be and still be one surface for the grass: a crease is, a riser is not. */
const SWARD_STEP = 0.3;

/**
 * A lawn's top at `(x, z)` of terrace cell `(col, row)`: a yard `Ground.lawn`
 * marks, clear by `margin` of the streets through its cell, a ramp, a gate's
 * mouth and every wall; or null.
 */
function lawnTop(floor: SlotFloor, col: number, row: number, x: number, z: number, margin: number): number | null {
  const { grid, band, field, lawn } = floor;
  if (lawn === null || !inGrid(grid, col, row) || lawn[col * grid.cells + row] !== 1) return null;
  const u = x - (cellCentre(grid, col) - grid.pitch * 0.5);
  const v = z - (cellCentre(grid, row) - grid.pitch * 0.5);
  // The streets through the cell, as the floor cuts them: a band only where the cell across is town too.
  const street = (index: number, t: number, across: (step: number) => boolean): boolean =>
    grid.avenue[index] === 1 ||
    (grid.low[index] === 1 && t < band + margin && across(-1)) ||
    (grid.high[index] === 1 && t > grid.pitch - band - margin && across(1));
  if (street(col, u, (step) => field.terraces.has(cellKey(col + step, row))) ||
    street(row, v, (step) => field.terraces.has(cellKey(col, row + step)))) return null;
  if (flightAt(field, x, z, margin) !== null) return null;
  for (const [x0, x1, z0, z1] of floor.mouths) {
    if (x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin) return null;
  }
  if (floor.solids !== null && solidAt(floor.solids, x, z, margin) !== null) return null;
  return PLANET_RADIUS + floorLiftAt(field, x, z, 0);
}

/**
 * The ground the grass grows on in cell `(col, row)`, at the point of that
 * cell nearest `(x, z)`: a lawn's top, the edge slope or the land over it, the
 * land where the town does not reach; or null.
 */
function cellSward(floor: SlotFloor, col: number, row: number, x: number, z: number, landRadius: number): number | null {
  const { grid, field } = floor;
  const low = (index: number): number => cellCentre(grid, index) - grid.pitch * 0.5 + 1e-3;
  const high = (index: number): number => cellCentre(grid, index) + grid.pitch * 0.5 - 1e-3;
  const cx = Math.min(high(col), Math.max(low(col), x));
  const cz = Math.min(high(row), Math.max(low(row), z));
  const key = cellKey(col, row);
  if (field.terraces.has(key)) return lawnTop(floor, col, row, cx, cz, 0);
  if (field.aprons?.has(key) === true) return Math.max(landRadius, PLANET_RADIUS + floorLiftAt(field, cx, cz, 0));
  return landRadius;
}

export function createSward(registry: Registry): (direction: THREE.Vector3, landRadius: number, margin: number) => number | null {
  const swardDir = new THREE.Vector3();
  return (direction, landRadius, margin) => {
    swardDir.copy(direction);
    for (const slot of registry.floors) {
      const floor = slot.floor;
      if (floor === null) continue;
      if (swardDir.dot(floor.up) < floor.cosBound) continue;
      const { grid, field } = floor;
      const x = swardDir.dot(floor.across) * PLANET_RADIUS;
      const z = swardDir.dot(floor.north) * PLANET_RADIUS;
      const col = cellIndex(grid, x);
      const row = cellIndex(grid, z);
      const key = cellKey(col, row);
      const terrace = field.terraces.has(key);
      const apron = !terrace && field.aprons?.has(key) === true;
      const here = terrace ? lawnTop(floor, col, row, x, z, margin) : cellSward(floor, col, row, x, z, landRadius);
      if (here === null) return null;
      if (terrace && here < landRadius - margin) return null;
      const u = x - (cellCentre(grid, col) - grid.pitch * 0.5);
      const v = z - (cellCentre(grid, row) - grid.pitch * 0.5);
      const west = u < margin;
      const east = u > grid.pitch - margin;
      const south = v < margin;
      const northward = v > grid.pitch - margin;
      if (west || east || south || northward) {
        // The same surface across a side: the two cells' grounds agree at the side's nearest point.
        const edgeX = west ? x - u : east ? x - u + grid.pitch : x;
        const edgeZ = south ? z - v : northward ? z - v + grid.pitch : z;
        const across = (c: number, r: number, px: number, pz: number): boolean => {
          const mine = cellSward(floor, col, row, px, pz, landRadius);
          const theirs = cellSward(floor, c, r, px, pz, landRadius);
          return mine !== null && theirs !== null && Math.abs(mine - theirs) < SWARD_STEP;
        };
        if (west && !across(col - 1, row, edgeX, z)) return null;
        if (east && !across(col + 1, row, edgeX, z)) return null;
        if (south && !across(col, row - 1, x, edgeZ)) return null;
        if (northward && !across(col, row + 1, x, edgeZ)) return null;
        if ((west || east) && (south || northward) && !across(col + (west ? -1 : 1), row + (south ? -1 : 1), edgeX, edgeZ)) return null;
      }
      // Past the square and its edge slope the land is the land's, and another town may still answer for it.
      if (!terrace && !apron) continue;
      return here;
    }
    return landRadius;
  };
}
