import { planGap } from '../landmark-ground.ts';
import type { Place } from '../places.ts';
import {
  OUTSKIRT_MIN_CELLS,
  OUTSKIRT_RING,
  cellCentre,
  cellIndex,
  gateMouth,
  gatesOf,
  inGrid,
  inParcel,
  isAvenue,
  outskirtScore,
  streetBand,
  streetSide,
} from '../scenery/grid.ts';
import type { TownGrid } from '../scenery/grid.ts';
import { cellKey } from '../scenery/ground.ts';
import { VARIANTS, rngFrom } from '../scenery/index.ts';
import type { Placed, RegionStyle, Weighted } from '../scenery/index.ts';
import type { TownFrame } from './frame.ts';
import { FACING_YAW, blockSide, facingSides, fitIn, rectOf } from './plots.ts';
import {
  KIND_OF,
  OUTER_FILL,
  OUTER_GREENERY,
  PARCEL_TREE_ROOM,
  PARCEL_TREE_STEP,
  fitting,
  footprintOf,
  mixAt,
  urbanityOf,
} from './rules.ts';
import type { FlatVariant, Rect, Slot } from './types.ts';

/**
 * Where everything in one settlement stands, on its square: one building a
 * cell (or a pair, or a two-by-two block), facing a street, inside its own
 * rectangle less the street band.
 *
 * The civic building comes first, beside the middle crossing; then every other
 * cell, nearest the middle first, drawing from the region's mix; a cell with no
 * building gets the greenery a yard would have; a landmark's parcel gets a row
 * of the town's trees round it; then the country round the town.
 */

type Rng = ReturnType<typeof rngFrom>;
/** A block of cells, inclusive: first and last column, first and last row. */
type Block = [number, number, number, number];

/** What the planning of one town shares. */
interface PlanJob {
  frame: TownFrame;
  slot: Slot;
  grid: TownGrid;
  style: RegionStyle;
  band: number;
  cells: number;
  placed: Placed[];
  taken: Set<number>;
  /** How much further than its band each street a road comes in by reaches into its gate cells' plots. */
  widened: Map<number, number>;
  variantOf(partId: string, style: RegionStyle, index: number): FlatVariant | null;
}

export interface Planner {
  planTownSteps(slot: Slot, grid: TownGrid): Generator<void, { placed: Placed[] }, void>;
}

export function createPlanner(
  frame: TownFrame,
  roadGates: ReadonlyMap<Place, number[]>,
  styleFor: (slot: Slot) => RegionStyle,
  variantOf: (partId: string, style: RegionStyle, index: number) => FlatVariant | null,
  countrysideSteps: (slot: Slot, grid: TownGrid, style: RegionStyle) => Generator<void, Placed[], void>,
): Planner {
  function* planTownSteps(slot: Slot, grid: TownGrid): Generator<void, { placed: Placed[] }, void> {
    const style = styleFor(slot);
    const urbanity = urbanityOf(slot.place.pop);
    const band = streetBand(grid, slot.ground.street);
    const job: PlanJob = {
      frame, slot, grid, style, band, cells: grid.cells, placed: [], taken: new Set(),
      widened: widenedBy(roadGates.get(slot.place) ?? [], grid, band), variantOf,
    };
    placeCivic(job);
    yield* placeCells(job, urbanity);
    plantParcels(job);
    job.placed.push(...(yield* countrysideSteps(slot, grid, style)));
    return { placed: job.placed };
  }
  return { planTownSteps };
}

/**
 * The gate cells' widening, by `cellKey * 4 + side` of the band's side: the
 * road's pavement at the mouth (`gateMouth`) past the band, which the plot
 * gives up over the whole cell.
 */
function widenedBy(roads: readonly number[], grid: TownGrid, band: number): Map<number, number> {
  const widened = new Map<number, number>();
  for (const index of roads) {
    const gate = gatesOf(grid)[index];
    if (gate === undefined || gate.cells.length < 2) continue;
    const extra = gateMouth(grid, gate, band).edge - band;
    if (extra <= 0) continue;
    for (const [col, row] of gate.cells) {
      const side = gate.outX !== 0
        ? (cellCentre(grid, row) < gate.z ? 1 : 3)
        : (cellCentre(grid, col) < gate.x ? 0 : 2);
      widened.set(cellKey(col, row) * 4 + side, extra);
    }
  }
  return widened;
}

const blocked = (job: PlanJob, rect: Rect): boolean => job.frame.parcelUnder(rect.x0, rect.x1, rect.z0, rect.z1);

/**
 * The part drawn, then every other part in the mix, largest first. Not only
 * smaller ones: a footprint radius says nothing about which box fits which
 * rectangle.
 */
function candidates(mix: readonly Weighted<string>[], rng: Rng): string[] {
  if (mix.length === 0) return [];
  const first = rng.weighted(mix);
  const rest = [...new Set(mix.map((entry) => entry.item))]
    .filter((id) => id !== first)
    .sort((a, b) => footprintOf(b) - footprintOf(a) || (a < b ? -1 : 1));
  return [first, ...rest];
}

/** The first of `ids` that fits `rect` facing one of `sides`, placed; false if none did. */
function place(job: PlanJob, ids: readonly string[], rect: Rect, sides: readonly number[], rng: Rng, col: number, row: number): boolean {
  for (const id of ids) {
    const variant = rng.int(VARIANTS);
    const flat = job.variantOf(id, job.style, variant);
    if (flat === null) continue;
    const side = sides[rng.int(sides.length)]!;
    const fitted = fitIn(flat, rect, side, rng.spread(1, 0.09), rng.unit());
    if (fitted === null) continue;
    job.placed.push({
      partId: id,
      variant,
      scale: fitted.scale,
      plot: {
        x: fitted.x,
        z: fitted.z,
        yaw: FACING_YAW[side]!,
        size: Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0),
        distance: Math.hypot(fitted.x, fitted.z),
        seed: rng.unit() * 0x7fffffff,
        col,
        row,
      },
    });
    return true;
  }
  return false;
}

/** Whether a block of cells is one terrace: a building spanning two cells stands on one floor. */
function level(job: PlanJob, c0: number, c1: number, r0: number, r1: number): boolean {
  let seen: number | null | undefined;
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      const here = job.frame.terraceAt(c, r);
      if (here === null) return false;
      if (seen === undefined) seen = here;
      else if (here !== seen) return false;
    }
  }
  return true;
}

/**
 * The plots a cell can offer, best first: itself, then itself and its
 * neighbour across a boundary with no street (the other half of its two-deep
 * block) when free and level, then the whole two-by-two block. Half the kit
 * does not fit one cell less its street band.
 */
function plotsFor(job: PlanJob, col: number, row: number): Block[] {
  const { grid, cells, taken } = job;
  const options: Block[] = [[col, col, row, row]];
  const free = (c: number, r: number): boolean =>
    c >= 0 && r >= 0 && c < cells && r < cells && !isAvenue(grid, c, r) && !taken.has(cellKey(c, r));
  if (col + 1 < cells && !streetSide(grid, col, row, 0) && free(col + 1, row)) options.push([col, col + 1, row, row]);
  if (col > 0 && !streetSide(grid, col, row, 2) && free(col - 1, row)) options.push([col - 1, col, row, row]);
  if (row + 1 < cells && !streetSide(grid, col, row, 1) && free(col, row + 1)) options.push([col, col, row, row + 1]);
  if (row > 0 && !streetSide(grid, col, row, 3) && free(col, row - 1)) options.push([col, col, row - 1, row]);
  // The whole block last, only when both partners and the diagonal are free.
  const across = options.find(([c0, c1, r0, r1]) => r0 === r1 && c0 !== c1);
  const along = options.find(([c0, c1, r0, r1]) => c0 === c1 && r0 !== r1);
  if (across !== undefined && along !== undefined) {
    const dc = across[0] === col ? across[1] : across[0];
    const dr = along[2] === row ? along[3] : along[2];
    if (free(dc, dr)) options.push([Math.min(col, dc), Math.max(col, dc), Math.min(row, dr), Math.max(row, dr)]);
  }
  // A pair across a closed stretch first: one building where the street was.
  const spansClosed = ([c0, c1, r0, r1]: Block): number =>
    (c0 !== c1 && grid.high[c0] === 1) || (r0 !== r1 && grid.high[r0] === 1) ? 0 : 1;
  options.sort((m, n) => spansClosed(m) - spansClosed(n));
  return options.filter(([c0, c1, r0, r1]) => level(job, c0, c1, r0, r1));
}

/**
 * The first candidate that fits any of a cell's plots, and the plot it took.
 * The single cells and pairs first and the block only after, or the first
 * tower drawn would take a whole block.
 */
function placeAny(job: PlanJob, ids: readonly string[], options: readonly Block[], rng: Rng): Block | null {
  const small = options.filter(([c0, c1, r0, r1]) => c0 === c1 || r0 === r1);
  const large = options.filter(([c0, c1, r0, r1]) => c0 !== c1 && r0 !== r1);
  return placeFrom(job, ids, small, rng) ?? placeFrom(job, ids, large, rng);
}

/**
 * Where along its frontage a building slides when the block has a closed
 * stretch of street on a side across it: hard against it, so the street ends
 * on a wall rather than a gap. Null where it has none.
 */
function closedSlide(grid: TownGrid, [c0, c1, r0, r1]: Block, side: number): number | null {
  const closed = (s: number): boolean => {
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const edge = s === 0 ? c === c1 : s === 1 ? r === r1 : s === 2 ? c === c0 : r === r0;
        if (edge && (grid.shut[c * grid.cells + r]! & (1 << s)) !== 0) return true;
      }
    }
    return false;
  };
  const across = side % 2 === 0 ? [1, 3] : [0, 2];
  if (closed(across[0]!)) return 1;
  if (closed(across[1]!)) return 0;
  return null;
}

function placeFrom(job: PlanJob, ids: readonly string[], options: readonly Block[], rng: Rng): Block | null {
  const { grid, band, widened } = job;
  if (options.length === 0) return null;
  for (const id of ids) {
    const variant = rng.int(VARIANTS);
    const flat = job.variantOf(id, job.style, variant);
    if (flat === null) continue;
    const scale = rng.spread(1, 0.09);
    const drawn = rng.unit();
    const pick = rng.unit();
    for (const option of options) {
      const [c0, c1, r0, r1] = option;
      const rect = rectOf(grid, band, c0, c1, r0, r1, widened);
      if (blocked(job, rect)) continue;
      const sides = facingSides(grid, c0, c1, r0, r1);
      const side = sides[Math.floor(pick * sides.length)]!;
      const fitted = fitIn(flat, rect, side, scale, closedSlide(grid, option, side) ?? drawn);
      if (fitted === null) continue;
      job.placed.push({
        partId: id,
        variant,
        scale: fitted.scale,
        plot: {
          x: fitted.x,
          z: fitted.z,
          yaw: FACING_YAW[side]!,
          size: Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0),
          distance: Math.hypot(fitted.x, fitted.z),
          seed: rng.unit() * 0x7fffffff,
          // The cell the origin stands in: its terrace is the block's, which `level` checked.
          col: cellIndex(grid, fitted.x),
          row: cellIndex(grid, fitted.z),
        },
      });
      return option;
    }
  }
  return null;
}

/**
 * The civic building, beside the middle of the town: on the two-by-two block
 * at a corner of the crossroads where the square has one, facing the main
 * streets, else on the single cell there.
 */
function placeCivic(job: PlanJob): void {
  const { grid, band, cells, style, slot, widened, taken } = job;
  // The first cell out from the centre on each side, where the crossroads' corners are.
  const odd = cells % 2 === 1;
  const up1 = odd ? (cells - 1) / 2 + 1 : cells / 2;
  const down1 = odd ? (cells - 1) / 2 - 1 : cells / 2 - 1;
  const civicRng = rngFrom(slot.seed, 'civic');
  const sx = civicRng.chance(0.5) ? 1 : -1;
  const sz = civicRng.chance(0.5) ? 1 : -1;
  if (style.civic.length === 0) return;
  if (cells >= 4) {
    const c0 = sx > 0 ? up1 : down1 - 1;
    const r0 = sz > 0 ? up1 : down1 - 1;
    const rect = rectOf(grid, band, c0, c0 + 1, r0, r0 + 1, widened);
    if (!blocked(job, rect) && level(job, c0, c0 + 1, r0, r0 + 1)) {
      // Facing the main street, on the side of the block nearest the centre.
      const sides = [sx > 0 ? 2 : 0, sz > 0 ? 3 : 1];
      if (place(job, candidates(style.civic, civicRng), rect, sides, civicRng, c0, r0)) {
        for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) taken.add(cellKey(c0 + dc, r0 + dr));
        return;
      }
    }
  }
  const c = cells === 1 ? 0 : sx > 0 ? up1 : down1;
  const r = cells === 1 ? 0 : sz > 0 ? up1 : down1;
  const rect = rectOf(grid, band, c, c, r, r, widened);
  if (!blocked(job, rect) && level(job, c, c, r, r) && place(job, candidates(style.civic, civicRng), rect, facingSides(grid, c, c, r, r), civicRng, c, r)) {
    taken.add(cellKey(c, r));
  }
}

/**
 * Every other cell, nearest the middle first: a building with the fill chance,
 * drawn from `mixAt`; past `OUTSKIRT_RING` built a little less often and only
 * with houses, so the edge is houses in yards rather than a wall of flats. A
 * cell beside a closed stretch of street always tries for a building.
 */
function* placeCells(job: PlanJob, urbanity: number): Generator<void, void, void> {
  const { grid, band, cells, style, slot, widened, taken } = job;
  const fill = cells === 1 ? 1 : 0.83 + 0.12 * urbanity;
  const order: [number, number][] = [];
  for (let col = 0; col < cells; col++) for (let row = 0; row < cells; row++) order.push([col, row]);
  order.sort((a, b) =>
    Math.hypot(cellCentre(grid, a[0]), cellCentre(grid, a[1])) - Math.hypot(cellCentre(grid, b[0]), cellCentre(grid, b[1]))
    || a[0] - b[0] || a[1] - b[1]);
  for (const [col, row] of order) {
    yield;
    if (isAvenue(grid, col, row) || taken.has(cellKey(col, row))) continue;
    // A cell the ground refuses is not paved, so nothing stands on it.
    if (job.frame.terraceAt(col, row) === null) continue;
    const rect = rectOf(grid, band, col, col, row, row, widened);
    if (rect.x1 - rect.x0 < 1 || rect.z1 - rect.z0 < 1 || blocked(job, rect)) continue;
    const rng = rngFrom(slot.seed, 'cell', col, row);
    const ringed = cells >= OUTSKIRT_MIN_CELLS;
    const score = ringed ? outskirtScore(grid, slot.seed, col, row)
      : Math.max(Math.abs(cellCentre(grid, col)), Math.abs(cellCentre(grid, row))) / Math.max(1, grid.half);
    const edge = Math.min(1, score);
    const outer = ringed && score > OUTSKIRT_RING;
    // A cell a closed street was given back to always builds: it is what the street ends against.
    const closing = grid.shut[col * cells + row] !== 0;
    if (rng.chance(outer ? fill * OUTER_FILL : fill) || closing) {
      let mix = mixAt(style, urbanity, edge, Infinity);
      if (outer) {
        const homes = mix.filter((entry) => KIND_OF.get(entry.item) !== 'block');
        if (homes.length > 0) mix = homes;
      }
      const ids = candidates(mix, rng);
      const took = placeAny(job, ids, plotsFor(job, col, row), rng);
      if (took !== null) {
        const [c0, c1, r0, r1] = took;
        for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) taken.add(cellKey(c, r));
        continue;
      }
    }
    plantYard(job, rng, col, row, rect, edge, outer);
  }
}

/**
 * A cell with no building: in a village, half the time an orchard of four
 * trees of one kind; otherwise a tree or a bush in the middle of the plot,
 * more readily at the town's edge.
 */
function plantYard(job: PlanJob, rng: Rng, col: number, row: number, rect: Rect, edge: number, outer: boolean): void {
  const { cells, style, placed } = job;
  const room = Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0) * 0.5;
  const trees = fitting(style.trees, room);
  if (cells < OUTSKIRT_MIN_CELLS && trees !== null && rng.chance(0.55)) {
    const id = rng.weighted(trees);
    const variant = rng.int(VARIANTS);
    const stepX = (rect.x1 - rect.x0) / 2;
    const stepZ = (rect.z1 - rect.z0) / 2;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const x = rect.x0 + stepX * (i + 0.5) + rng.jitter() * 0.3;
        const z = rect.z0 + stepZ * (j + 0.5) + rng.jitter() * 0.3;
        placed.push({
          partId: id, variant, scale: rng.spread(0.85, 0.06),
          plot: { x, z, yaw: rng.unit() * Math.PI * 2, size: room, distance: Math.hypot(x, z), seed: rng.unit() * 0x7fffffff, col, row },
        });
      }
    }
    return;
  }
  const scatter = fitting(style.scatter, room);
  const green = outer || cells < OUTSKIRT_MIN_CELLS;
  const mix = trees !== null && rng.chance(green ? Math.min(1, style.greenery * OUTER_GREENERY) : style.greenery * (1 - edge * 0.45)) ? trees
    : scatter !== null && rng.chance(0.45) ? scatter : null;
  if (mix === null) return;
  const x = (rect.x0 + rect.x1) * 0.5 + rng.jitter() * (rect.x1 - rect.x0) * 0.15;
  const z = (rect.z0 + rect.z1) * 0.5 + rng.jitter() * (rect.z1 - rect.z0) * 0.15;
  placed.push({
    partId: rng.weighted(mix),
    variant: rng.int(VARIANTS),
    scale: rng.spread(1, 0.14),
    plot: { x, z, yaw: rng.unit() * Math.PI * 2, size: room, distance: Math.hypot(x, z), seed: rng.unit() * 0x7fffffff, col, row },
  });
}

/**
 * A landmark's parcel: a row of the region's street trees round it, on the
 * ground between the plan and the parcel's edge (less the street band its edge
 * carries), one every `PARCEL_TREE_STEP` where that ground is wide enough.
 */
function plantParcels(job: PlanJob): void {
  const { frame, grid, band, style, slot, placed } = job;
  frame.parcels.forEach((parcel, index) => {
    const owner = frame.parcelOwners[index]!;
    const shape = owner.shape;
    const rng = rngFrom(slot.seed, 'parcel', parcel.c0, parcel.r0);
    // Off the band a side carries where the town goes on past it, and a kerb's width at the square's edge.
    const inset = (band: number, col: number, row: number): number =>
      (inGrid(grid, col, row) && frame.terraceAt(col, row) !== null ? band : 0) + 0.6;
    const x0 = cellCentre(grid, parcel.c0) - grid.pitch * 0.5 + inset(blockSide(grid, parcel.c0, parcel.c1, parcel.r0, parcel.r1, 2) ? band : 0, parcel.c0 - 1, parcel.r0);
    const x1 = cellCentre(grid, parcel.c1) + grid.pitch * 0.5 - inset(blockSide(grid, parcel.c0, parcel.c1, parcel.r0, parcel.r1, 0) ? band : 0, parcel.c1 + 1, parcel.r0);
    const z0 = cellCentre(grid, parcel.r0) - grid.pitch * 0.5 + inset(blockSide(grid, parcel.c0, parcel.c1, parcel.r0, parcel.r1, 3) ? band : 0, parcel.c0, parcel.r0 - 1);
    const z1 = cellCentre(grid, parcel.r1) + grid.pitch * 0.5 - inset(blockSide(grid, parcel.c0, parcel.c1, parcel.r0, parcel.r1, 1) ? band : 0, parcel.c0, parcel.r1 + 1);
    const px0 = owner.x + shape.cx - shape.hx;
    const px1 = owner.x + shape.cx + shape.hx;
    const pz0 = owner.z + shape.cz - shape.hz;
    const pz1 = owner.z + shape.cz + shape.hz;
    const sides: [number, number, number, number, number][] = [
      // x, z of the line's start and end, and the room either side of it
      [x0, (z1 + pz1) * 0.5, x1, (z1 + pz1) * 0.5, (z1 - pz1) * 0.5],
      [x0, (z0 + pz0) * 0.5, x1, (z0 + pz0) * 0.5, (pz0 - z0) * 0.5],
      [(x0 + px0) * 0.5, z0, (x0 + px0) * 0.5, z1, (px0 - x0) * 0.5],
      [(x1 + px1) * 0.5, z0, (x1 + px1) * 0.5, z1, (x1 - px1) * 0.5],
    ];
    const seen: [number, number][] = [];
    for (const [ax, az, bx, bz, room] of sides) {
      if (room < PARCEL_TREE_ROOM) continue;
      // A crown spreads over the walk and the street up high, as a street tree's does.
      const trees = fitting(style.trees, Math.max(room * 2, 3.2));
      if (trees === null) continue;
      const id = rng.weighted(trees);
      const variant = rng.int(VARIANTS);
      const length = Math.hypot(bx - ax, bz - az);
      const count = Math.max(1, Math.round(length / PARCEL_TREE_STEP));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        if (planGap(shape, x - owner.x, z - owner.z) < room * 0.75) continue;
        if (seen.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < PARCEL_TREE_STEP * 0.6)) continue;
        const col = cellIndex(grid, x);
        const row = cellIndex(grid, z);
        if (!inParcel(parcel, col, row) || frame.terraceAt(col, row) === null) continue;
        seen.push([x, z]);
        placed.push({
          partId: id, variant, scale: rng.spread(0.9, 0.05),
          plot: { x, z, yaw: rng.unit() * Math.PI * 2, size: room, distance: Math.hypot(x, z), seed: rng.unit() * 0x7fffffff, col, row },
        });
      }
    }
  });
}
