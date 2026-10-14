/**
 * The plots of a grid town: one building a cell, or one on a block of two or
 * four, facing its street and fitted by its plan box (never by a guess at its
 * radius), a yard behind it. The block nearest the middle keeps the town's
 * centrepiece; in a big town the outermost south-west block is a landing pad.
 * A budget is spent from the middle out: a kit module is a thousand to three
 * thousand triangles, so once it is spent the rest are the civilisation's own
 * forms, built in code at a few hundred, and past that the lots stand empty: the
 * centre is the kit's, the outskirts are the people's own.
 */

import { cellCentre } from '../../scenery/grid.ts';
import type { TownGrid } from '../../scenery/grid.ts';
import { rngFrom } from '../../scenery/random.ts';
import type { Rng } from '../../scenery/random.ts';
import type { ArchitectureStyle, ColonyStyle, WorldSpec } from '../contract.ts';
import { PIECES, isKitBuilding } from '../kit.ts';
import { planOf, spanOf } from './streets.ts';
import type { GridPlot, PlotKind } from './types.ts';

/** How far a building stands back from the kerb of the street it faces, units: a doorstep. */
const SETBACK = 1.1;
/** What a building keeps clear of the sides of its plot, units. */
const SIDE_ROOM = 0.9;
/** The smallest share of its own size a module may be fitted at before another is tried. */
const SMALLEST_FIT = 0.62;
/** What a code-built form and a yard cost, triangles, about, for the budget. */
const CODE_FORM_TRIANGLES = 600;
const YARD_TRIANGLES = 700;
const LOT_TRIANGLES = 150;
/** What the kit's modules may take of a town, triangles, before the people's own forms take over. */
const KIT_BUDGET = 32000;
/** Past this share of the half-side a lot may stand empty, at most this often at the very edge. */
const OUTSKIRT_FROM = 0.55;
const OUTSKIRT_EMPTY = 0.55;
/** A landing pad's radius at most, units. */
const PAD_MAX = 10;

type Choices = readonly { item: string; weight: number }[];
type Rect = [number, number, number, number];

/**
 * The triangles a grid town of this built radius may spend on its buildings:
 * the kit's modules are dear, and a world streams two or three towns at once.
 */
export function townBudget(radius: number): number {
  return Math.round(Math.min(115000, 12000 + radius * 760));
}

/** What the plots are laid from. */
export interface PlotContext {
  spec: WorldSpec;
  id: string;
  style: ArchitectureStyle;
  colony: ColonyStyle | undefined;
  grid: TownGrid;
  rng: Rng;
  /** Runs of cells with no street between them, along one axis. */
  runs: number[][];
  radius: number;
  population: number;
  formCost: ReadonlyMap<string, number>;
}

interface Fitter {
  frontOf(cols: number[], rows: number[]): { dx: number; dz: number };
  isLarge(form: string): boolean;
  fit(rect: Rect, front: { dx: number; dz: number }, kind: PlotKind, choices: Choices, seed: string, large: boolean): GridPlot | null;
}

function createFitter(c: PlotContext): Fitter {
  const { spec, style, colony, grid, rng } = c;

  // Which way a cell's front faces: to the street on one of its sides, the
  // main street before any other, else to the square's edge. Returns the unit
  // direction in the town's frame.
  const frontOf: Fitter['frontOf'] = (cols, rows) => {
    const options: { dx: number; dz: number; weight: number }[] = [];
    const c0 = cols[0]!;
    const c1 = cols[cols.length - 1]!;
    const r0 = rows[0]!;
    const r1 = rows[rows.length - 1]!;
    const score = (offset: number): number => (Math.abs(offset) < grid.pitch ? 3 : 1);
    if (grid.low[c0] === 1 || (c0 > 0 && grid.avenue[c0 - 1] === 1)) options.push({ dx: -1, dz: 0, weight: score(cellCentre(grid, c0) - grid.pitch) });
    if (grid.high[c1] === 1 || (c1 + 1 < grid.cells && grid.avenue[c1 + 1] === 1)) options.push({ dx: 1, dz: 0, weight: score(cellCentre(grid, c1) + grid.pitch) });
    if (grid.low[r0] === 1 || (r0 > 0 && grid.avenue[r0 - 1] === 1)) options.push({ dx: 0, dz: -1, weight: score(cellCentre(grid, r0) - grid.pitch) });
    if (grid.high[r1] === 1 || (r1 + 1 < grid.cells && grid.avenue[r1 + 1] === 1)) options.push({ dx: 0, dz: 1, weight: score(cellCentre(grid, r1) + grid.pitch) });
    if (options.length === 0) {
      // The edge of the square: face out.
      const x = cellCentre(grid, (c0 + c1) / 2);
      const z = cellCentre(grid, (r0 + r1) / 2);
      return Math.abs(x) > Math.abs(z) ? { dx: Math.sign(x) || 1, dz: 0 } : { dx: 0, dz: Math.sign(z) || 1 };
    }
    let best = options[0]!;
    for (const one of options) if (one.weight > best.weight || (one.weight === best.weight && rng.chance(0.5))) best = one;
    return best;
  };

  const isLarge = (form: string): boolean => {
    const [w, d] = planOf(form, 1);
    return Math.max(w, d) > grid.pitch * 1.15;
  };

  /**
   * A building in the rectangle `rect` facing `front`: the first of a few
   * draws that fits at no less than `SMALLEST_FIT`, set back from the kerb,
   * its yard behind it. Null when nothing fits.
   */
  const fit: Fitter['fit'] = (rect, front, kind, choices, seed, large) => {
    const [x0, z0, x1, z1] = rect;
    // The rectangle in the front's own terms: `across` the street and `deep` from it.
    const alongX = front.dx === 0;
    const across = (alongX ? x1 - x0 : z1 - z0) - 2 * SIDE_ROOM;
    const deep = (alongX ? z1 - z0 : x1 - x0) - SETBACK - SIDE_ROOM;
    if (across < 3 || deep < 3) return null;
    const pick = rngFrom('worlds', spec.id, 'plot', seed);
    // Where none of the choices fits the plot (a colony of hangars, every one
    // wider than a cell) the people's own forms are tried after them, the
    // colony's first.
    const own = (colony?.modules ?? []).filter((one) => !isKitBuilding(one.item));
    const pool = choices.filter((one) => (large ? isLarge(one.item) : !isLarge(one.item)));
    const fallback = large ? [] : (own.length > 0 ? own : style.forms).filter((one) => !isLarge(one.item));
    for (let tries = 0; tries < 9; tries++) {
      // Six draws of the choices, then the people's own forms.
      const from = tries < 6 && pool.length > 0 ? pool : fallback;
      if (from.length === 0) return null;
      const form = pick.weighted(from);
      const [w, d] = planOf(form, 1);
      const s = Math.min(1.08, across / w, deep / d);
      if (s < SMALLEST_FIT) continue;
      const scale = s * pick.range(0.94, 1);
      const [, pd] = planOf(form, scale);
      // Against the kerb of the street it faces, centred across.
      const kerb = alongX ? (front.dz > 0 ? z1 : z0) : front.dx > 0 ? x1 : x0;
      const inward = alongX ? -front.dz : -front.dx;
      const middle = kerb + inward * (SETBACK + pd / 2);
      const x = alongX ? (x0 + x1) / 2 : middle;
      const z = alongX ? middle : (z0 + z1) / 2;
      // Behind it, what is left of the plot is its yard.
      const back = kerb + inward * (SETBACK + pd + 0.6);
      const end = alongX ? (front.dz > 0 ? z0 : z1) : front.dx > 0 ? x0 : x1;
      const room = Math.abs(end - back);
      const yard: Rect | null =
        room > 2.6
          ? alongX
            ? [x0 + SIDE_ROOM, Math.min(back, end), x1 - SIDE_ROOM, Math.max(back, end)]
            : [Math.min(back, end), z0 + SIDE_ROOM, Math.max(back, end), z1 - SIDE_ROOM]
          : null;
      const info = PIECES[form];
      const roof =
        info?.roofed === true && colony !== undefined && pick.chance(colony.roofs)
          ? pick.pick(['roof-antenna', 'roof-radar', 'roof-opening', 'roof-antenna'])
          : undefined;
      return {
        kind,
        form,
        x,
        z,
        yaw: Math.atan2(front.dx, front.dz),
        scale,
        rect,
        yard,
        ...(roof === undefined ? {} : { roof }),
        seed,
      };
    }
    return null;
  };

  return { frontOf, isLarge, fit };
}

/** The plots being laid, and what they have cost so far. */
interface Laying {
  c: PlotContext;
  fitter: Fitter;
  plots: GridPlot[];
  spent: number;
  budget: number;
  /** The kit's own modules, or the style's forms where the colony has none, and which the first share of the budget draws from. */
  modules: { item: string; weight: number }[];
  forms: Choices;
}

function costOf(l: Laying, plot: GridPlot): number {
  const info = PIECES[plot.form];
  let t = info?.triangles ?? l.c.formCost.get(plot.form) ?? CODE_FORM_TRIANGLES;
  if (plot.form === 'house-single' || plot.form === 'house-open' || plot.form === 'house-open-back') t += PIECES['house-single-support']?.triangles ?? 0;
  if (plot.roof !== undefined) t += PIECES[plot.roof]?.triangles ?? 0;
  if (plot.yard !== null) t += YARD_TRIANGLES;
  return t;
}

function push(l: Laying, plot: GridPlot): void {
  // Past the kit's core a house keeps no yard of things: its lot is ground.
  const kept = isKitBuilding(plot.form) || plot.kind !== 'module' ? plot : { ...plot, yard: null };
  l.plots.push(kept);
  l.spent += costOf(l, kept);
}

/** The kit's modules for the first share of the budget, the people's own forms for the rest of it. */
const poolNow = (l: Laying): Choices => (l.spent < KIT_BUDGET && l.modules.length > 0 ? l.forms : l.c.style.forms);

/** One cell: an empty lot (more often the further out, and always once the budget is spent), a module, or a garden where nothing fits. */
function layCell(l: Laying, c: number, r: number): void {
  const { spec, id, grid } = l.c;
  const [cx0, cx1] = spanOf(grid, c);
  const [cz0, cz1] = spanOf(grid, r);
  const rect: Rect = [cx0, cz0, cx1, cz1];
  // The outskirts thin out, as a Terran town's do: past the inner ring a lot
  // stands empty more often the further out it is, and every lot does once the
  // budget is spent (the planet's own ground with a crate or two on it), so the
  // town's edge is ragged and not a wall.
  const out = Math.max(Math.abs(cellCentre(grid, c)), Math.abs(cellCentre(grid, r))) / Math.max(grid.half, 1);
  const empty =
    l.spent >= l.budget ||
    (grid.cells >= 7 && out > OUTSKIRT_FROM && rngFrom('worlds', spec.id, 'lot', id, c, r).chance(((out - OUTSKIRT_FROM) / (1 - OUTSKIRT_FROM)) * OUTSKIRT_EMPTY));
  if (empty) {
    l.plots.push({ kind: 'lot', form: 'lot', x: (cx0 + cx1) / 2, z: (cz0 + cz1) / 2, yaw: 0, scale: 1, rect, yard: rect, seed: `${id}:${c}:${r}:lot` });
    l.spent += LOT_TRIANGLES;
    return;
  }
  const one = l.fitter.fit(rect, l.fitter.frontOf([c], [r]), 'module', poolNow(l), `${id}:${c}:${r}`, false);
  if (one !== null) push(l, one);
  // A cell nothing fits keeps a garden: plants, crates, a panel or two.
  else l.plots.push({ kind: 'garden', form: 'garden', x: (cx0 + cx1) / 2, z: (cz0 + cz1) / 2, yaw: 0, scale: 1, rect, yard: rect, seed: `${id}:${c}:${r}:garden` });
}

/** One block of cells: the hub on the block nearest the middle, the pad on the outermost south-west one, a big module on the whole block now and then, else a plot a cell. */
function layBlock(l: Laying, cols: number[], rows: number[], special: { hubCols: number[] | undefined; hubRows: number[] | undefined; padCols: number[] | undefined; padRows: number[] | undefined; hubCentre: string | null }): void {
  const { id, grid, rng } = l.c;
  const { fitter } = l;
  const x0 = spanOf(grid, cols[0]!)[0];
  const x1 = spanOf(grid, cols[cols.length - 1]!)[1];
  const z0 = spanOf(grid, rows[0]!)[0];
  const z1 = spanOf(grid, rows[rows.length - 1]!)[1];
  const block: Rect = [x0, z0, x1, z1];
  const seed = `${id}:${cols[0]}:${rows[0]}`;
  if (cols === special.hubCols && rows === special.hubRows && special.hubCentre !== null) {
    const front = { dx: 0, dz: -1 };
    // Facing the crossing: whichever of its two street sides is nearer the middle.
    const toward = Math.abs(x0) < Math.abs(z0) ? { dx: -1, dz: 0 } : front;
    const hub = fitter.fit(block, toward, 'hub', [{ item: special.hubCentre, weight: 1 }], `${seed}:hub`, fitter.isLarge(special.hubCentre));
    if (hub !== null) {
      push(l, hub);
      return;
    }
  }
  if (cols === special.padCols && rows === special.padRows) {
    const r = Math.min(PAD_MAX, (Math.min(x1 - x0, z1 - z0) - 2) / 2);
    if (r > 6) {
      l.plots.push({ kind: 'pad', form: 'pad', x: (x0 + x1) / 2, z: (z0 + z1) / 2, yaw: rng.range(0, Math.PI * 2), scale: r, rect: block, yard: null, seed: `${seed}:pad` });
      return;
    }
  }
  const wide = cols.length * rows.length > 1;
  if (wide && l.spent < KIT_BUDGET && rng.chance(0.28)) {
    const big = fitter.fit(block, fitter.frontOf(cols, rows), 'module', l.forms, `${seed}:block`, true);
    if (big !== null) {
      push(l, big);
      return;
    }
  }
  for (const c of cols) for (const r of rows) layCell(l, c, r);
}

/** Lays every plot of the town: the blocks nearest the middle first, so the budget is spent from the middle out. */
export function layPlots(c: PlotContext): GridPlot[] {
  const { grid, runs, style, colony, population, radius } = c;
  const modules = colony?.modules.filter((m) => isKitBuilding(m.item)) ?? [];
  const forms = modules.length > 0 ? modules : style.forms;
  const fitter = createFitter(c);

  // The hub: the block nearest the middle, north-east of the crossing, keeps
  // the town's centrepiece on the whole block, facing the main street.
  const centreRun = (side: number): number[] | undefined =>
    runs
      .filter((run) => run.every((cell) => (cellCentre(grid, cell) > 0) === side > 0))
      .sort((a, b) => Math.abs(cellCentre(grid, a[0]!)) - Math.abs(cellCentre(grid, b[0]!)))[0];
  const hubCols = grid.cells >= 3 ? centreRun(1) : undefined;
  const hubRows = grid.cells >= 3 ? centreRun(1) : undefined;
  const hubCentre = colony?.centre ?? null;

  // The landing pad: in a town big enough, the outermost block of the
  // south-west, a whole block of paving with a ship on it.
  const wantsPad = colony !== undefined && population >= colony.spaceport && grid.cells >= 5;
  const outer = (side: number): number[] | undefined =>
    runs
      .filter((run) => run.every((cell) => (cellCentre(grid, cell) > 0) === side > 0))
      .sort((a, b) => Math.abs(cellCentre(grid, b[0]!)) - Math.abs(cellCentre(grid, a[0]!)))[0];
  const padCols = wantsPad ? outer(-1) : undefined;
  const padRows = wantsPad ? outer(-1) : undefined;

  const l: Laying = { c, fitter, plots: [], spent: 0, budget: townBudget(radius), modules, forms };
  const blocks = runs
    .flatMap((cols) => runs.map((rows) => ({ cols, rows })))
    .map((one) => ({ ...one, d: Math.hypot(cellCentre(grid, (one.cols[0]! + one.cols[one.cols.length - 1]!) / 2), cellCentre(grid, (one.rows[0]! + one.rows[one.rows.length - 1]!) / 2)) }))
    .sort((a, b) => a.d - b.d);
  for (const { cols, rows } of blocks) layBlock(l, cols, rows, { hubCols, hubRows, padCols, padRows, hubCentre });
  return l.plots;
}
