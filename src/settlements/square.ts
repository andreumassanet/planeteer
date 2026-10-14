import type { World } from '../geo.ts';
import type { Place } from '../places.ts';
import { heldGates } from '../roads.ts';
import { cellCentre, gatesOf, landmarkParcel, outskirtsOf, townGrid, townTerraces } from '../scenery/grid.ts';
import type { TownGrid } from '../scenery/grid.ts';
import { MAX_CUT, cellKey } from '../scenery/ground.ts';
import type { TownFrame } from './frame.ts';
import { keepoutReaches } from './rules.ts';
import type { Slot } from './types.ts';

/**
 * The square a town stands on, before anything stands on it: the town frame
 * about its centre, the keepouts and parcels, and every cell's terrace, with
 * the outskirts and the unused gate cells too deep to cut taken out. A raise
 * and a map plan both begin here, so they agree on which cells a town paves.
 * Null where the frame cannot be built.
 *
 * A town does not move aside for a landmark: its square and gates are fixed by
 * the place, so the cells under a landmark are paved and left unbuilt.
 */
export function* squareSteps(
  frame: TownFrame,
  world: World,
  slot: Slot,
  roadGates: ReadonlyMap<Place, number[]>,
  broken: string[],
): Generator<void, TownGrid | null, void> {
  const { up, basis, keepouts, parcels, parcelOwners, terraces } = frame;
  up.copy(slot.direction);
  frame.frameAt();
  if (basis.determinant() <= 0) {
    slot.failed = true;
    broken.push(`${slot.place.name}: settlement basis has determinant ${basis.determinant()}`);
    return null;
  }

  const grid = townGrid(slot.radius);
  frame.grid = grid;
  parcels.length = 0;
  parcelOwners.length = 0;
  for (const keepout of keepouts) {
    const parcel = landmarkParcel(grid, keepout.x, keepout.z, keepout.shape);
    if (parcel === null) continue;
    parcels.push(parcel);
    parcelOwners.push(keepout);
  }
  frame.base = Math.max(0, world.elevationAt(up));
  frame.corners.clear();
  terraces.clear();
  // Every cell's terrace: `townTerraces` is the one definition, which the roads ask through `gateLevel`.
  for (const [key, level] of townTerraces(grid, frame.ground, heldGates(slot.place))) terraces.set(key, level);
  yield;
  // The outskirts are taken out after the levels, so a street keeps the level
  // its whole group was cut to. The streets roads come in by and the cells
  // under a landmark are kept whole.
  const kept = new Set<number>();
  const gates = gatesOf(grid);
  const roads = roadGates.get(slot.place) ?? [];
  for (const index of roads) {
    const gate = gates[index];
    if (gate === undefined) continue;
    for (const [col, row] of gate.cells) {
      for (let c = 0; c < grid.cells; c++) kept.add(gate.outX !== 0 ? cellKey(c, row) : cellKey(col, c));
    }
  }
  const half = grid.pitch * 0.5;
  yield;
  const outskirts = outskirtsOf(grid, slot.seed, (col, row) => kept.has(cellKey(col, row)) || frame.parcelCell(col, row) || keepouts.some((keepout) => {
    const cx = cellCentre(grid, col);
    const cz = cellCentre(grid, row);
    return keepoutReaches(keepout, cx - half, cx + half, cz - half, cz + half);
  }));
  for (const key of outskirts) terraces.set(key, null);
  // A gate no road uses may not be cut deeper than any other cell
  // (`GATE_CUT` is for roads); past `MAX_CUT` it is left unpaved.
  const used = new Set<number>();
  for (const index of roads) {
    for (const [col, row] of gates[index]?.cells ?? []) used.add(cellKey(col, row));
  }
  for (const gate of gates) {
    for (const [col, row] of gate.cells) {
      const key = cellKey(col, row);
      if (used.has(key) || terraces.get(key) == null) continue;
      let high = -Infinity;
      let low = Infinity;
      for (const [i, j] of [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]] as const) {
        const elevation = frame.ground.corner(i, j);
        high = Math.max(high, elevation);
        low = Math.min(low, elevation);
      }
      if (high - low > MAX_CUT) terraces.set(key, null);
    }
  }

  return grid;
}
