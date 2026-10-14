/**
 * A town of another world laid out as Earth's towns are: the same square
 * (`scenery/grid.ts`'s `townGrid`, inscribed in the town's disc and north-up in
 * its own frame), the same streets (a main street through the middle each way
 * and blocks two cells deep either side) and the same rule that every cell
 * touches a street or the edge. One building a cell, or one on a block of two or
 * four, facing its street, fitted by its plan box; a yard behind it; pavements
 * either side of every carriageway, where the people stroll, and lamps and
 * planters on them.
 *
 * Pure, as everything a town is: a function of the world, the town's id and its
 * built radius, so every visitor sees the same street and `scripts/` can ask the
 * same question. `settlements.ts` builds what this lays out and `aliens.ts`
 * walks it. The parts are in `town-grid/`.
 *
 * The frame is the town's (`frameAt`): `y` up, `z` north, `x = y x z`. A
 * building's front is its model's +Z, turned by `yaw` (`Object3D.rotation.y`),
 * so a front facing `(dx, dz)` is `yaw = atan2(dx, dz)`.
 */

import { TOWN_PITCH, townGrid } from '../scenery/grid.ts';
import { rngFrom } from '../scenery/random.ts';
import type { WorldSpec } from './contract.ts';
import { DEFAULT_ARCHITECTURE } from './contract.ts';
import { arrivalOf, furnishStreets, parkedCraft } from './town-grid/pavements.ts';
import { layPlots } from './town-grid/plots.ts';
import { runsOf, streetsOf } from './town-grid/streets.ts';
import type { GridTown } from './town-grid/types.ts';

export { townBudget } from './town-grid/plots.ts';
export { planOf } from './town-grid/streets.ts';
export type { FurnitureKind, GridPlot, GridTown, Placed, PlotKind, Street, Walk } from './town-grid/types.ts';

const cache = new Map<string, GridTown>();

/**
 * The town at `radius`: a function of the world and the town alone. `radius`
 * is the built one, the disc the terrain levels; the square is inscribed in it.
 */
export function gridTownOf(spec: WorldSpec, id: string, radius: number, population: number, formCost: ReadonlyMap<string, number> = new Map()): GridTown {
  const key = `${spec.id}:${id}:${radius}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  const rng = rngFrom('worlds', spec.id, 'grid', id);
  const grid = townGrid(Math.max(radius, TOWN_PITCH / Math.SQRT2 + 0.01));
  const streets = streetsOf(grid);
  const runs = runsOf(grid);
  const plots = layPlots({ spec, id, style, colony: style.colony, grid, rng, runs, radius, population, formCost });
  const { walks, lamps, planters, furniture } = furnishStreets(spec, id, grid, streets);
  const { parked, mainCarriage } = parkedCraft(grid, streets);
  const town: GridTown = { grid, streets, plots, walks, lamps, planters, furniture, parked, arrival: arrivalOf(grid), mainCarriage };
  cache.set(key, town);
  return town;
}
