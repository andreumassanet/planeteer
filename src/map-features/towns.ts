import { radiusOf } from '../places.ts';
import type { TownPlan } from '../settlements.ts';
import { cellCentre, gatesOf, isAvenue, outskirtsOf, townGrid } from '../scenery/grid.ts';
import { cellKey, groundStyleFor } from '../scenery/ground.ts';
import { tone } from '../monuments/contract.ts';
import type { TileView } from '../map-tiles.ts';
import { type Raster, bytesOf } from '../raster.ts';
import { unitAt } from '../sphere.ts';
import { PALETTE } from '../theme.ts';
import { INK, INKED_FROM, PLANS_FROM, RAILS_FROM, YARD_TREE, inkWidth } from './constants.ts';
import { type FeatureCtx, frameAt, localBox, localCorners } from './context.ts';
import { townsIn } from './index.ts';

/**
 * A town's cells as `settlements.ts` keeps them before its plan is known:
 * the square, less the outskirts given up from the edge in, keeping every
 * street a road comes in by. What a far tile draws a town as.
 */
export function cellsOf(f: FeatureCtx, index: number): Uint8Array {
  const { places, roads, townCells } = f;
  const known = townCells.get(index);
  if (known !== undefined) return known;
  if (f.roadGates === null) {
    f.roadGates = new Map();
    for (const road of roads) {
      for (const [end, gate] of [[road.a, road.gateA], [road.b, road.gateB]] as const) {
        const list = f.roadGates.get(end);
        if (list === undefined) f.roadGates.set(end, [gate]);
        else list.push(gate);
      }
    }
  }
  const place = places[index]!;
  const grid = townGrid(radiusOf(place));
  const kept = new Set<number>();
  const gates = gatesOf(grid);
  for (const g of f.roadGates.get(index) ?? []) {
    const gate = gates[g];
    if (gate === undefined) continue;
    for (const [col, row] of gate.cells) {
      for (let c = 0; c < grid.cells; c++) kept.add(gate.outX !== 0 ? cellKey(c, row) : cellKey(col, c));
    }
  }
  const outskirts = outskirtsOf(grid, `${place.name}@${place.lat},${place.lon}`, (col, row) => kept.has(cellKey(col, row)));
  const cells = new Uint8Array(grid.cells * grid.cells);
  for (let row = 0; row < grid.cells; row++) {
    for (let col = 0; col < grid.cells; col++) {
      if (!outskirts.has(cellKey(col, row))) cells[row * grid.cells + col] = isAvenue(grid, col, row) ? 2 : 1;
    }
  }
  if (townCells.size > 4000) townCells.clear();
  townCells.set(index, cells);
  return cells;
}

/** A town before its plan: its cells in its region's paving, inked round the edge. */
export function paintTownCells(f: FeatureCtx, view: TileView, raster: Raster, index: number): void {
  const { places, regionOf, affine, frameAcross, frameNorth, townUp } = f;
  const place = places[index]!;
  const grid = townGrid(radiusOf(place));
  const cells = cellsOf(f, index);
  unitAt(place.lat, place.lon, townUp);
  frameAt(f, townUp);
  view.frame(townUp, frameAcross, frameNorth, affine);
  const n = grid.cells;
  const half = grid.pitch / 2;
  const style = groundStyleFor(regionOf(place).id);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (cells[row * n + col] === 0) continue;
      localBox(raster, affine, cellCentre(grid, col), cellCentre(grid, row), 1, 0, half + 0.3, half + 0.3);
    }
  }
  raster.fill(...bytesOf(tone(style.walk, 0.86)));
  inkCells(f, raster, grid, (col, row) => cells[row * n + col] !== 0, inkWidth(view.z));
}

/** The ink round the cells that stand: every side whose neighbour does not. */
export function inkCells(f: FeatureCtx, raster: Raster, grid: ReturnType<typeof townGrid>, standing: (col: number, row: number) => boolean, width: number): void {
  const { p, q, affine } = f;
  const n = grid.cells;
  const half = grid.pitch / 2;
  const at = (x: number, z: number, out: { x: number; y: number }): void => {
    out.x = affine.ox + affine.xx * x + affine.zx * z;
    out.y = affine.oy + affine.xy * x + affine.zy * z;
  };
  const stands = (col: number, row: number): boolean => col >= 0 && row >= 0 && col < n && row < n && standing(col, row);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!stands(col, row)) continue;
      const x0 = cellCentre(grid, col) - half;
      const z0 = cellCentre(grid, row) - half;
      const x1 = x0 + grid.pitch;
      const z1 = z0 + grid.pitch;
      const side = (ax: number, az: number, bx: number, bz: number): void => {
        at(ax, az, p);
        at(bx, bz, q);
        raster.segment(p.x, p.y, q.x, q.y, width, width);
      };
      if (!stands(col, row - 1)) side(x0, z0, x1, z0);
      if (!stands(col, row + 1)) side(x0, z1, x1, z1);
      if (!stands(col - 1, row)) side(x0, z0, x0, z1);
      if (!stands(col + 1, row)) side(x1, z0, x1, z1);
    }
  }
  raster.fill(...INK);
}

/** A town as it stands: its floor, its streets, its buildings and its trees. */
export function* paintPlan(f: FeatureCtx, view: TileView, raster: Raster, plan: TownPlan): Generator<undefined, void, void> {
  const { affine, xs, ys } = f;
  const { grid, cells } = plan;
  const n = grid.cells;
  const half = grid.pitch / 2;
  view.frame(plan.up, plan.across, plan.north, affine);
  const colours = [0, plan.colours.yard, plan.colours.walk, plan.colours.land, plan.colours.plaza];
  // The floor, a colour at a time.
  for (let code = 1; code <= 4; code++) {
    let any = false;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (cells[row * n + col] !== code) continue;
        localBox(raster, affine, cellCentre(grid, col), cellCentre(grid, row), 1, 0, half + 0.25, half + 0.25);
        any = true;
      }
    }
    if (any) raster.fill(...bytesOf(colours[code]!));
  }
  // The streets: the avenues' whole cells and the bands between two cells,
  // each piece within a cell that is paved — the pavement first, the
  // carriageway inside it.
  const paved = (col: number, row: number): boolean => col >= 0 && row >= 0 && col < n && row < n && cells[row * n + col] !== 0;
  const pieces: [number, number, number, number][] = [];
  for (let c = 0; c < n; c++) {
    const avenue = grid.avenue[c] === 1;
    const banded = c + 1 < n && (grid.high[c] === 1 || grid.low[c + 1] === 1);
    for (let k = 0; k < n; k++) {
      // Along z at column c (a north-south street), and along x at row c.
      if (avenue) {
        if (paved(c, k)) pieces.push([cellCentre(grid, c), cellCentre(grid, k), half, half]);
        if (paved(k, c)) pieces.push([cellCentre(grid, k), cellCentre(grid, c), half, half]);
      }
      if (banded) {
        const edge = cellCentre(grid, c) + half;
        if (paved(c, k) || paved(c + 1, k)) pieces.push([edge, cellCentre(grid, k), plan.band, half]);
        if (paved(k, c) || paved(k, c + 1)) pieces.push([cellCentre(grid, k), edge, half, plan.band]);
      }
    }
  }
  for (const [x, z, hx, hz] of pieces) localBox(raster, affine, x, z, 1, 0, hx + 0.2, hz + 0.2);
  raster.fill(...bytesOf(plan.colours.walk));
  for (const [x, z, hx, hz] of pieces) {
    // The carriageway: the street less a pavement each side, across its width only.
    const across = hx < hz;
    localBox(raster, affine, x, z, 1, 0, across ? Math.max(0.5, hx - plan.walk) : hx + 0.2, across ? hz + 0.2 : Math.max(0.5, hz - plan.walk));
  }
  raster.fill(...bytesOf(plan.colours.road));
  inkCells(f, raster, grid, paved, inkWidth(view.z) * 0.8);
  yield;
  // The trees in the yards.
  if (view.z >= INKED_FROM && plan.trees.length > 0) {
    for (let k = 0; k < plan.trees.length; k += 3) {
      const x = plan.trees[k]!;
      const z = plan.trees[k + 1]!;
      raster.circle(affine.ox + affine.xx * x + affine.zx * z, affine.oy + affine.xy * x + affine.zy * z, Math.max(0.8, (plan.trees[k + 2]! * 0.55) / view.unitsPerPixel));
    }
    raster.fill(...YARD_TREE);
  }
  yield;
  // The buildings: each plan box in its roof's colour, inked.
  const b = plan.buildings;
  const count = b.length / 6;
  const ink = view.z >= INKED_FROM ? inkWidth(view.z) : 0.45;
  for (let k = 0; k < count; k++) {
    localCorners(f, affine, b[k * 6]!, b[k * 6 + 1]!, b[k * 6 + 2]!, b[k * 6 + 3]!, b[k * 6 + 4]!, b[k * 6 + 5]!);
    raster.outline(xs, ys, 4, ink);
  }
  raster.fill(...INK, view.z >= INKED_FROM ? 1 : 0.6);
  yield;
  const byRoof = new Map<number, number[]>();
  for (let k = 0; k < count; k++) {
    const roof = plan.roofs[k]!;
    const list = byRoof.get(roof);
    if (list === undefined) byRoof.set(roof, [k]);
    else list.push(k);
  }
  for (const [roof, list] of byRoof) {
    for (const k of list) localBox(raster, affine, b[k * 6]!, b[k * 6 + 1]!, b[k * 6 + 2]!, b[k * 6 + 3]!, b[k * 6 + 4]!, b[k * 6 + 5]!);
    raster.fill(...bytesOf(roof));
  }
}

export function* paintTowns(f: FeatureCtx, view: TileView, raster: Raster): Generator<'wait' | undefined, void, void> {
  const { sources, places, p } = f;
  const indices = townsIn(f, view.south, view.north, view.west, view.east).filter((index) => {
    const place = places[index]!;
    view.px(place.lat, place.lon, p);
    return view.inside(p.x, p.y, radiusOf(place) / view.unitsPerPixel + 2);
  });
  if (indices.length === 0) return;
  if (view.z < RAILS_FROM) {
    // A square each, in its region's paving.
    for (const index of indices) {
      const place = places[index]!;
      view.px(place.lat, place.lon, p);
      const side = (radiusOf(place) * Math.SQRT1_2) / view.unitsPerPixel;
      raster.rect(p.x - side, p.y - side, side * 2, side * 2);
    }
    raster.fill(...bytesOf(tone(PALETTE.blush, 0.9)));
    return;
  }
  if (view.z < PLANS_FROM || sources.plans === undefined) {
    for (const index of indices) {
      paintTownCells(f, view, raster, index);
      yield;
    }
    return;
  }
  // The plans, waiting for those still being worked out — until the tile
  // is told to hurry, when a town still waiting is drawn as its cells.
  for (;;) {
    let waiting = 0;
    for (const index of indices) if (sources.plans(index) === undefined) waiting++;
    if (waiting === 0 || view.hurry) break;
    yield 'wait';
  }
  for (const index of indices) {
    const plan = sources.plans(index);
    if (plan === undefined) {
      view.incomplete = true;
      paintTownCells(f, view, raster, index);
    } else if (plan !== null) yield* paintPlan(f, view, raster, plan);
    yield;
  }
}
