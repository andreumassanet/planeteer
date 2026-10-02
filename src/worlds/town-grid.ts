/**
 * A town of another world laid out **as Earth's towns are**: the same square
 * (`scenery/grid.ts`'s `townGrid`, inscribed in the town's disc and north-up
 * in its own frame), the same streets — a main street through the middle each
 * way and blocks two cells deep either side — and the same rule that every
 * cell touches a street or the edge. One building a cell, or one on a block of
 * two or four, **facing its street**, fitted by its plan box and never by a
 * guess at its radius; a yard behind it; pavements either side of every
 * carriageway, where the people stroll, and lamps and planters on them.
 *
 * It replaced a disc of modules round a square with radial avenues, which had
 * none of that: the modules were scattered in rings, nothing faced anything,
 * the floor was one colour, and every walker shared the same five avenues.
 *
 * Pure, as everything a town is: a function of the world, the town's id and
 * its built radius, so every visitor sees the same street and `scripts/` can
 * ask the same question. `settlements.ts` builds what this lays out and
 * `aliens.ts` walks it.
 *
 * The frame is the town's (`frameAt`): `y` up, `z` north, `x = y × z`. A
 * building's front is its model's +Z, turned by `yaw` (`Object3D.rotation.y`),
 * so a front facing `(dx, dz)` is `yaw = atan2(dx, dz)`.
 */

import { TOWN_PITCH, cellCentre, cornerOffset, townGrid } from '../scenery/grid.ts';
import type { TownGrid } from '../scenery/grid.ts';
import { rngFrom } from '../scenery/random.ts';
import type { ColonyStyle, WorldSpec } from './contract.ts';
import { DEFAULT_ARCHITECTURE } from './contract.ts';
import { PIECES, isKitBuilding } from './kit.ts';

/** A street's half-width on a cell boundary, units: Earth's band for a 7.2 carriageway, at most 0.3 of a cell. */
const BAND = 3.6;
/** A pavement's width, as a share of a street's half and at most this, units: room for a body walking with one passing. */
const WALK_SHARE = 0.36;
const WALK_MAX = 2.4;
/** How far a building stands back from the kerb of the street it faces, units: a doorstep. */
const SETBACK = 1.1;
/** What a building keeps clear of the sides of its plot, units. */
const SIDE_ROOM = 0.9;
/** The smallest share of its own size a module may be fitted at before another is tried. */
const SMALLEST_FIT = 0.62;
/** Lamps along a street, one every this many units a side, staggered. */
const LAMP_EVERY = 18;
/** What a code-built form and a yard cost, triangles, about, for the budget. */
const CODE_FORM_TRIANGLES = 600;
const YARD_TRIANGLES = 700;
const LOT_TRIANGLES = 150;
/** What the kit's modules may take of a town, triangles, before the people's own forms take over. */
const KIT_BUDGET = 32000;
/** Past this share of the half-side a lot may stand empty, at most this often at the very edge. */
const OUTSKIRT_FROM = 0.55;
const OUTSKIRT_EMPTY = 0.55;

/**
 * The triangles a grid town of this built radius may spend on its buildings:
 * the kit's modules are dear, and a world streams two or three towns at once.
 */
export function townBudget(radius: number): number {
  return Math.round(Math.min(115000, 12000 + radius * 760));
}

/** A landing pad's radius at most, units, and the population a town needs before it keeps one. */
const PAD_MAX = 10;

/** One street: a line along `axis` at `at` across the other, `half` wide either side, with its pavements. */
export interface Street {
  /** `'x'`: the street runs along x (it is a line of constant z); `'z'`: along z. */
  axis: 'x' | 'z';
  at: number;
  half: number;
  walk: number;
  /** The main street through the middle: where the gates are, the parking, the bunting. */
  main: boolean;
}

/** What stands on a plot. */
export type PlotKind = 'module' | 'hub' | 'pad' | 'garden' | 'lot';

export interface GridPlot {
  kind: PlotKind;
  /** A kit building's id, or a form's name (built in code). */
  form: string;
  /** Where the building's middle stands, its yaw, and its scale over its own (`PIECES[form].scale`). */
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** The plot's free rectangle, the street's bands taken off: `[x0, z0, x1, z1]`. */
  rect: [number, number, number, number];
  /** Where its yard is, behind it, as a rectangle; null where there is no room for one. */
  yard: [number, number, number, number] | null;
  roof?: string;
  seed: string;
}

/** A stretch of pavement a person may stroll end to end. */
export interface Walk {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** A thing on the street, placed and turned: a lamp, a planter, a parked craft. */
export interface Placed {
  x: number;
  z: number;
  yaw: number;
}

export interface GridTown {
  grid: TownGrid;
  streets: Street[];
  plots: GridPlot[];
  walks: Walk[];
  lamps: Placed[];
  planters: Placed[];
  parked: Placed[];
  /** Where a traveller comes down: on the main street south of the middle, looking north into the town. */
  arrival: { x: number; z: number };
  /** The carriageway's half of the main street, for a craft parked on it. */
  mainCarriage: number;
}

const cache = new Map<string, GridTown>();

/** The street bands a cell gives up on each side along one axis: `[low, high]`, units. */
function bandsOf(grid: TownGrid, c: number): [number, number] {
  return [grid.low[c] === 1 ? Math.min(BAND, grid.pitch * 0.3) : 0, grid.high[c] === 1 ? Math.min(BAND, grid.pitch * 0.3) : 0];
}

const walkOf = (half: number): number => Math.min(WALK_MAX, half * WALK_SHARE);

/** The streets of a square: the avenues (whole cells) and the bands on boundaries, both ways. */
function streetsOf(grid: TownGrid): Street[] {
  const out: Street[] = [];
  const band = Math.min(BAND, grid.pitch * 0.3);
  for (const axis of ['x', 'z'] as const) {
    for (let c = 0; c < grid.cells; c++) {
      if (grid.avenue[c] === 1) {
        const half = grid.pitch / 2;
        out.push({ axis, at: cellCentre(grid, c), half, walk: walkOf(half), main: Math.abs(cellCentre(grid, c)) < 1e-6 });
      }
      if (grid.high[c] === 1 && c + 1 < grid.cells) {
        const at = cornerOffset(grid, c + 1);
        out.push({ axis, at, half: band, walk: walkOf(band), main: Math.abs(at) < 1e-6 });
      }
    }
  }
  return out;
}

/** A cell's span along one axis, its street bands taken off: `[from, to]`. */
function spanOf(grid: TownGrid, c: number): [number, number] {
  const centre = cellCentre(grid, c);
  const [low, high] = bandsOf(grid, c);
  return [centre - grid.pitch / 2 + low, centre + grid.pitch / 2 - high];
}

/**
 * The blocks along one axis: runs of cells with no street between them, at
 * most two long (the rule makes them two, or one at an edge or by an avenue).
 */
function runsOf(grid: TownGrid): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  for (let c = 0; c < grid.cells; c++) {
    if (grid.avenue[c] === 1) {
      if (run.length > 0) runs.push(run);
      run = [];
      continue;
    }
    run.push(c);
    if (grid.high[c] === 1 || c === grid.cells - 1) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** The plan box of a kit building at a scale, units: `[across, deep]` before its yaw. */
export function planOf(form: string, scale: number): [number, number] {
  const info = PIECES[form];
  if (info === undefined) return [8 * scale, 8 * scale];
  return [info.size[0] * info.scale * scale, info.size[2] * info.scale * scale];
}

/**
 * The town at `radius`: a function of the world and the town alone. `radius`
 * is the built one, the disc the terrain levels; the square is inscribed in it.
 */
export function gridTownOf(spec: WorldSpec, id: string, radius: number, population: number, formCost: ReadonlyMap<string, number> = new Map()): GridTown {
  const key = `${spec.id}:${id}:${radius}`;
  const known = cache.get(key);
  if (known !== undefined) return known;
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  const colony: ColonyStyle | undefined = style.colony;
  const rng = rngFrom('worlds', spec.id, 'grid', id);
  const grid = townGrid(Math.max(radius, TOWN_PITCH / Math.SQRT2 + 0.01));
  const streets = streetsOf(grid);
  const runs = runsOf(grid);
  const modules = colony?.modules.filter((m) => isKitBuilding(m.item)) ?? [];
  const forms = modules.length > 0 ? modules : style.forms;

  // **Which way a cell's front faces**: to the street on one of its sides,
  // the main street before any other, else to the square's edge. Returns the
  // unit direction in the town's frame.
  const frontOf = (cols: number[], rows: number[]): { dx: number; dz: number } => {
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

  const plots: GridPlot[] = [];
  const isLarge = (form: string): boolean => {
    const [w, d] = planOf(form, 1);
    return Math.max(w, d) > grid.pitch * 1.15;
  };

  /**
   * A building in the rectangle `rect` facing `front`: the first of a few
   * draws that fits at no less than `SMALLEST_FIT`, set back from the kerb,
   * its yard behind it. Null when nothing fits.
   */
  const fit = (
    rect: [number, number, number, number],
    front: { dx: number; dz: number },
    kind: PlotKind,
    choices: readonly { item: string; weight: number }[],
    seed: string,
    large: boolean,
  ): GridPlot | null => {
    const [x0, z0, x1, z1] = rect;
    // The rectangle in the front's own terms: `across` the street and `deep` from it.
    const alongX = front.dx === 0;
    const across = (alongX ? x1 - x0 : z1 - z0) - 2 * SIDE_ROOM;
    const deep = (alongX ? z1 - z0 : x1 - x0) - SETBACK - SIDE_ROOM;
    if (across < 3 || deep < 3) return null;
    const pick = rngFrom('worlds', spec.id, 'plot', seed);
    for (let tries = 0; tries < 6; tries++) {
      const pool = choices.filter((one) => (large ? isLarge(one.item) : !isLarge(one.item)));
      if (pool.length === 0) return null;
      const form = pick.weighted(pool);
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
      const yard: [number, number, number, number] | null =
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

  // **The hub**: the block nearest the middle, north-east of the crossing,
  // keeps the town's centrepiece on the whole block, facing the main street.
  const centreRun = (side: number): number[] | undefined =>
    runs
      .filter((run) => run.every((c) => (cellCentre(grid, c) > 0) === side > 0))
      .sort((a, b) => Math.abs(cellCentre(grid, a[0]!)) - Math.abs(cellCentre(grid, b[0]!)))[0];
  const hubCols = grid.cells >= 3 ? centreRun(1) : undefined;
  const hubRows = grid.cells >= 3 ? centreRun(1) : undefined;
  const hubCentre = colony?.centre ?? null;

  // **The landing pad**: in a town big enough, the outermost block of the
  // south-west, a whole block of paving with a ship on it.
  const wantsPad = colony !== undefined && population >= colony.spaceport && grid.cells >= 5;
  const outer = (side: number): number[] | undefined =>
    runs
      .filter((run) => run.every((c) => (cellCentre(grid, c) > 0) === side > 0))
      .sort((a, b) => Math.abs(cellCentre(grid, b[0]!)) - Math.abs(cellCentre(grid, a[0]!)))[0];
  const padCols = wantsPad ? outer(-1) : undefined;
  const padRows = wantsPad ? outer(-1) : undefined;

  // **A budget, spent from the middle out.** A kit module is a thousand to
  // three thousand triangles; a big town of them is more than a frame can
  // draw with its neighbours. The blocks are taken nearest the middle first,
  // and once the budget is spent the rest are the civilisation's own forms,
  // built in code at a few hundred: the centre is the kit's, the outskirts
  // are the people's own.
  const budget = townBudget(radius);
  let spent = 0;
  const costOf = (plot: GridPlot): number => {
    const info = PIECES[plot.form];
    let t = info?.triangles ?? formCost.get(plot.form) ?? CODE_FORM_TRIANGLES;
    if (plot.form === 'house-single' || plot.form === 'house-open' || plot.form === 'house-open-back') t += PIECES['house-single-support']?.triangles ?? 0;
    if (plot.roof !== undefined) t += PIECES[plot.roof]?.triangles ?? 0;
    if (plot.yard !== null) t += YARD_TRIANGLES;
    return t;
  };
  const push = (plot: GridPlot): void => {
    // Past the kit's core a house keeps no yard of things: its lot is ground.
    const kept = isKitBuilding(plot.form) || plot.kind !== 'module' ? plot : { ...plot, yard: null };
    plots.push(kept);
    spent += costOf(kept);
  };
  // The kit's modules for the first share of the budget, the people's own
  // forms for the rest of it; past it, the lots stand empty.
  const poolNow = (): readonly { item: string; weight: number }[] => (spent < KIT_BUDGET && modules.length > 0 ? forms : style.forms);
  const blocks = runs
    .flatMap((cols) => runs.map((rows) => ({ cols, rows })))
    .map((one) => ({ ...one, d: Math.hypot(cellCentre(grid, (one.cols[0]! + one.cols[one.cols.length - 1]!) / 2), cellCentre(grid, (one.rows[0]! + one.rows[one.rows.length - 1]!) / 2)) }))
    .sort((a, b) => a.d - b.d);
  for (const { cols, rows } of blocks) {
    {
      const x0 = spanOf(grid, cols[0]!)[0];
      const x1 = spanOf(grid, cols[cols.length - 1]!)[1];
      const z0 = spanOf(grid, rows[0]!)[0];
      const z1 = spanOf(grid, rows[rows.length - 1]!)[1];
      const block: [number, number, number, number] = [x0, z0, x1, z1];
      const seed = `${id}:${cols[0]}:${rows[0]}`;
      if (cols === hubCols && rows === hubRows && hubCentre !== null) {
        const front = { dx: 0, dz: -1 };
        // Facing the crossing: whichever of its two street sides is nearer the middle.
        const toward = Math.abs(x0) < Math.abs(z0) ? { dx: -1, dz: 0 } : front;
        const hub = fit(block, toward, 'hub', [{ item: hubCentre, weight: 1 }], `${seed}:hub`, isLarge(hubCentre));
        if (hub !== null) {
          push(hub);
          continue;
        }
      }
      if (cols === padCols && rows === padRows) {
        const r = Math.min(PAD_MAX, (Math.min(x1 - x0, z1 - z0) - 2) / 2);
        if (r > 6) {
          plots.push({ kind: 'pad', form: 'pad', x: (x0 + x1) / 2, z: (z0 + z1) / 2, yaw: rng.range(0, Math.PI * 2), scale: r, rect: block, yard: null, seed: `${seed}:pad` });
          continue;
        }
      }
      // A big module on the whole block now and then; else one a cell.
      const wide = cols.length * rows.length > 1;
      if (wide && spent < KIT_BUDGET && rng.chance(0.28)) {
        const big = fit(block, frontOf(cols, rows), 'module', forms, `${seed}:block`, true);
        if (big !== null) {
          push(big);
          continue;
        }
      }
      for (const c of cols) {
        for (const r of rows) {
          const [cx0, cx1] = spanOf(grid, c);
          const [cz0, cz1] = spanOf(grid, r);
          const rect: [number, number, number, number] = [cx0, cz0, cx1, cz1];
          // **The outskirts thin out**, as a Terran town's do (`outskirtsOf`):
          // past the inner ring a lot stands empty more often the further
          // out it is, and every lot does once the budget is spent — the
          // planet's own ground with a crate or two on it — so the town's
          // edge is ragged and not a wall.
          const out = Math.max(Math.abs(cellCentre(grid, c)), Math.abs(cellCentre(grid, r))) / Math.max(grid.half, 1);
          const empty = spent >= budget || (grid.cells >= 7 && out > OUTSKIRT_FROM && rngFrom('worlds', spec.id, 'lot', id, c, r).chance((out - OUTSKIRT_FROM) / (1 - OUTSKIRT_FROM) * OUTSKIRT_EMPTY));
          if (empty) {
            plots.push({ kind: 'lot', form: 'lot', x: (cx0 + cx1) / 2, z: (cz0 + cz1) / 2, yaw: 0, scale: 1, rect, yard: rect, seed: `${id}:${c}:${r}:lot` });
            spent += LOT_TRIANGLES;
            continue;
          }
          const one = fit(rect, frontOf([c], [r]), 'module', poolNow(), `${id}:${c}:${r}`, false);
          if (one !== null) push(one);
          // A cell nothing fits keeps a garden: plants, crates, a panel or two.
          else plots.push({ kind: 'garden', form: 'garden', x: (cx0 + cx1) / 2, z: (cz0 + cz1) / 2, yaw: 0, scale: 1, rect, yard: rect, seed: `${id}:${c}:${r}:garden` });
        }
      }
    }
  }

  // **The pavements, as stretches between crossings**, both sides of every
  // street: where people stroll. A stretch is cut where a cross street's
  // carriageway crosses it, so nobody walks down the middle of a crossing.
  const walks: Walk[] = [];
  const lamps: Placed[] = [];
  const planters: Placed[] = [];
  const edge = grid.half;
  for (const street of streets) {
    const crossings = streets
      .filter((other) => other.axis !== street.axis)
      .map((other) => [other.at - other.half, other.at + other.half] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const pieces: [number, number][] = [];
    let from = -edge;
    for (const [lo, hi] of crossings) {
      if (lo > from) pieces.push([from, lo]);
      from = Math.max(from, hi);
    }
    if (from < edge) pieces.push([from, edge]);
    for (const side of [-1, 1]) {
      // The line a stroller keeps: the pavement's middle. The lamps stand on
      // the carriageway's edge and the planters at a stretch's ends, so it
      // is clear of both.
      const off = street.at + side * (street.half - street.walk * 0.5);
      const planted = street.half > BAND;
      for (const [a, b] of pieces) {
        if (b - a < 4) continue;
        const inset = planted && b - a > 10 ? 2.6 : 0.8;
        walks.push(
          street.axis === 'x'
            ? { ax: a + inset, az: off, bx: b - inset, bz: off }
            : { ax: off, az: a + inset, bx: off, bz: b - inset },
        );
      }
      // Lamps on the kerb side of a pavement wide enough to pass one,
      // staggered side to side.
      const kerb = street.at + side * (street.half - street.walk - 0.2);
      const start = side > 0 ? LAMP_EVERY / 2 : 0;
      for (const [a, b] of pieces) {
        // Never at the square's edge, where a main street's gate stands.
        // Lamps light the main streets and the wide ones, as on Earth; a
        // lamp every eighteen units down every lane of a city of three
        // hundred lots was a forest of posts and sixty thousand triangles.
        const lit = street.main || street.half > BAND;
        for (let t = a + 4.5 + start; lit && street.walk >= 1.8 && t < b - 4.5; t += LAMP_EVERY) {
          if (Math.abs(t) > edge - 4) continue;
          const yaw = street.axis === 'x' ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
          lamps.push(street.axis === 'x' ? { x: t, z: kerb, yaw } : { x: kerb, z: t, yaw });
        }
        // A planter at each end of a stretch, on the building side of the pavement.
        if (b - a > 10 && street.half > BAND) {
          const back = street.at + side * (street.half - 0.7);
          for (const t of [a + 1.2, b - 1.2]) if (Math.abs(t) < edge - 4) planters.push(street.axis === 'x' ? { x: t, z: back, yaw: 0 } : { x: back, z: t, yaw: 0 });
        }
      }
    }
  }

  // **Craft parked on the main streets**, against the kerb, a few cells out
  // from the middle and never at a crossing.
  const parked: Placed[] = [];
  const mains = streets.filter((one) => one.main);
  const mainCarriage = mains.length > 0 ? mains[0]!.half - mains[0]!.walk : BAND;
  // Only in a town of five cells or more: in a smaller one the main street
  // is where the takeable craft wait (`parkingOf`), and there is room for one.
  for (const street of grid.cells >= 5 ? mains : []) {
    if (street.half - street.walk < 2.6) continue;
    for (const side of [-1, 1]) {
      const t = side * grid.pitch * 1.5 * (street.axis === 'x' ? 1 : -1);
      // Not south of the middle on the north–south street: that is where the
      // traveller comes in, and the lens behind them.
      if (Math.abs(t) > edge - 4 || (street.axis === 'z' && t < 0)) continue;
      const lane = street.at + side * (street.half - street.walk - 1.3);
      const yaw = street.axis === 'x' ? Math.PI / 2 : 0;
      parked.push(street.axis === 'x' ? { x: t, z: lane, yaw } : { x: lane, z: t, yaw });
    }
  }

  // The arrival: down the main north–south street, a cell south of the
  // middle, in the carriageway's middle where nothing stands.
  // A square of one or two cells has no street: the arrival is just outside it.
  const arrival = { x: 0, z: grid.cells >= 3 ? -Math.min(edge - 3, grid.pitch) : -(edge + 2.5) };

  const town: GridTown = { grid, streets, plots, walks, lamps, planters, parked, arrival, mainCarriage };
  cache.set(key, town);
  return town;
}
