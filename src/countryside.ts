/**
 * What the country between the towns holds besides trees: farmsteads with
 * their fields, mills and turbines, a lighthouse on a headland, the wayside
 * shrine of whichever faith the region keeps, a camp, a jetty, a cairn, and,
 * smaller, rocks, a meadow in flower, a bench, a fingerpost by the road.
 *
 * A plan is a pure function of the world and one cell of the tile grid
 * (`tile-grid.ts`, the vegetation's finest tiles), so every client, every
 * level of the quadtree and every headless check builds the same farm in the
 * same place: `rngFrom('country', row, column)` draws everything in an order
 * fixed before the world is asked anything. Nothing in a plan crosses its own
 * cell, so a tile of any level holds exactly the plans of the finest cells
 * under it.
 *
 * It yields to everything built and the wood yields to it: towns keep their
 * whole country (`countryReach`), a landmark its plan, a road its drawn width,
 * a plane or balloon its field. A plan is not geometry: pieces are a part, a
 * place, a turn and a size, and fields are rectangles with a crop.
 * `countryside-tile.ts` merges them into the vegetation tiles.
 *
 * The parts live in `countryside/`.
 */
import type { World } from './geo.ts';
import { cellAt, cellBounds } from './tile-grid.ts';
import { createCellFrame } from './countryside/frame.ts';
import { createGatherer } from './countryside/nearby.ts';
import { createCellPlanner } from './countryside/plan-cell.ts';
import { createQueries } from './countryside/queries.ts';
import type { Site } from './countryside/ground.ts';
import type { CountryPlan, Countryside, CountrysideOptions, CountrysideStats } from './countryside/types.ts';
import type { Slope } from './terrain.ts';

export { FEATURE_KINDS } from './countryside/types.ts';
export type {
  CountryLine,
  CountryPiece,
  CountryPlan,
  Countryside,
  CountrysideOptions,
  CountrysideStats,
  CropField,
  CropId,
  FeatureKind,
  Meadow,
} from './countryside/types.ts';

/** The cells kept planned; least recently asked goes first. */
const PLAN_CAP = 12_000;

export function createCountryside(world: World, options: CountrysideOptions = {}): Countryside {
  const stats: CountrysideStats = { planned: 0, cached: 0, slowestMs: 0, meanMs: 0, byKind: {}, refused: { quiet: 0, nothing: 0 } };
  let totalMs = 0;

  const frame = createCellFrame();
  const gatherer = createGatherer(frame, options);
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const site: Site = { world, frame, nearby: gatherer.nearby, claimed: [], slope };
  const planner = createCellPlanner(world, options, site, gatherer, stats);
  const { bounds } = frame;

  /**
   * The cells planned, least recently asked first: a hit moves its cell to the
   * back and a full cache lets go of the front one. Emptying it whole would
   * drop the cells the standing tiles had just planned and plan every one of
   * them again at once.
   */
  const plans = new Map<string, CountryPlan>();

  // The cell asked last is answered without the key or the cache: the grass
  // asks a question a texel, and a line of texels is in a handful of cells.
  let lastRow = NaN;
  let lastColumn = NaN;
  let lastPlan: CountryPlan | null = null;

  function planOf(row: number, column: number): CountryPlan {
    cellBounds(0, row, column, bounds);
    const key = `${row}/${Math.round((bounds.west + 180) / bounds.dLon)}`;
    const known = plans.get(key);
    if (known !== undefined) {
      plans.delete(key);
      plans.set(key, known);
      return known;
    }
    const began = performance.now();
    const made = planner.planCell(key, row);
    const ms = performance.now() - began;
    stats.planned++;
    totalMs += ms;
    stats.slowestMs = Math.max(stats.slowestMs, Number(ms.toFixed(2)));
    stats.meanMs = Number((totalMs / stats.planned).toFixed(3));
    if (made.kind !== null) stats.byKind[made.kind] = (stats.byKind[made.kind] ?? 0) + 1;
    if (plans.size >= PLAN_CAP) plans.delete(plans.keys().next().value!);
    plans.set(key, made);
    stats.cached = plans.size;
    return made;
  }

  function plan(row: number, column: number): CountryPlan {
    if (row === lastRow && column === lastColumn && lastPlan !== null) return lastPlan;
    lastRow = row;
    lastColumn = column;
    lastPlan = planOf(row, column);
    return lastPlan;
  }

  function planAt(lat: number, lon: number): CountryPlan {
    const { row, column } = cellAt(lat, lon, 0);
    return plan(row, column);
  }

  return {
    stats,
    plan,
    has(row, column) {
      cellBounds(0, row, column, bounds);
      return plans.has(`${row}/${Math.round((bounds.west + 180) / bounds.dLon)}`);
    },
    planAt,
    ...createQueries(plan, planAt, bounds),
    reset() {
      plans.clear();
      lastPlan = null;
      gatherer.indexTowns();
      stats.cached = 0;
    },
  };
}
