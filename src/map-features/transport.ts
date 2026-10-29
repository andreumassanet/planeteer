import { BED_HALF } from '../rails.ts';
import { CARRIAGEWAY_HALF } from '../scenery/grid.ts';
import type { TileView } from '../map-tiles.ts';
import type { Raster } from '../raster.ts';
import {
  CENTRE_DASH, CENTRE_HALF, CENTRE_LINE, INK, INKED_FROM, LINED_FROM, PLANS_FROM, RAILS_FROM, RAIL_BED, ROAD_SHADE, ROAD_SHADE_X, ROAD_SHADE_Y, RAIL_TIE, ROAD_BATCH, ROAD_SYMBOL, SYMBOL_HALF, inkWidth,
} from './constants.ts';
import { type FeatureCtx, overlaps, project } from './context.ts';
import { pathOf, roadList } from './index.ts';

export function* paintRoads(f: FeatureCtx, view: TileView, raster: Raster): Generator<undefined, void, void> {
  const { xs, ys, roads } = f;
  const list = roadList(f);
  // A road is a symbol until its centre line is drawn: its class is its
  // colour, as the sheet draws them under the paper's levels
  // (`map/draw-sheet.ts`), and its width is its class's or its own, the wider.
  const symbol = view.z < LINED_FROM;
  const real = Math.max(0.6, CARRIAGEWAY_HALF / view.unitsPerPixel);
  const halfOf = (cls: number): number => (symbol ? Math.max(SYMBOL_HALF[cls] ?? SYMBOL_HALF[0]!, real) : real);
  const casingOf = (cls: number): number => (view.z < PLANS_FROM ? (cls === 2 ? 0.9 : 0.75) : inkWidth(view.z) + 0.15);
  const drawn: { xs: number[]; ys: number[]; colour: [number, number, number]; cls: number }[] = [];
  let k = 0;
  for (let index = 0; index < list.length; index++) {
    const entry = list[index]!;
    if (!overlaps(view, entry.south, entry.north, entry.west, entry.east)) continue;
    // A road's path is worked out the first time it is drawn, a few at a step.
    if (entry.path === null && (++k & 3) === 0) yield;
    const path = pathOf(f, index);
    const cls = roads[index]!.cls;
    if (!project(f, view, path, path.length / 3, halfOf(cls) + 4)) continue;
    drawn.push({ xs: [...xs], ys: [...ys], colour: entry.tarmac, cls });
  }
  if (drawn.length === 0) return;
  // The lesser classes under the greater, so a trunk runs on through a junction.
  drawn.sort((a, b) => a.cls - b.cls);
  // The shade the roads throw to the south-east, under everything.
  if (view.z >= RAILS_FROM) {
    for (let at = 0; at < drawn.length; at += ROAD_BATCH) {
      for (const line of drawn.slice(at, at + ROAD_BATCH)) {
        raster.polyline(line.xs.map((x) => x + ROAD_SHADE_X), line.ys.map((y) => y + ROAD_SHADE_Y), line.xs.length, halfOf(line.cls) + casingOf(line.cls));
      }
      raster.fill(...INK, ROAD_SHADE);
      yield;
    }
  }
  // Casing under every road first, so a junction is one piece of road — in
  // batches of `ROAD_BATCH`, a step each, so a far tile's hundreds of roads
  // are not one long fill.
  for (let at = 0; at < drawn.length; at += ROAD_BATCH) {
    for (const line of drawn.slice(at, at + ROAD_BATCH)) raster.polyline(line.xs, line.ys, line.xs.length, halfOf(line.cls) + casingOf(line.cls));
    raster.fill(...INK, view.z < PLANS_FROM ? 0.6 : 0.85);
    yield;
  }
  // Then each in its own tarmac, or its class's colour while it is a symbol.
  for (let at = 0; at < drawn.length; at += ROAD_BATCH) {
    const byColour = new Map<string, typeof drawn>();
    for (const line of drawn.slice(at, at + ROAD_BATCH)) {
      const key = symbol ? `c${line.cls}` : line.colour.join(',');
      const group = byColour.get(key);
      if (group === undefined) byColour.set(key, [line]);
      else group.push(line);
    }
    for (const group of byColour.values()) {
      const cls = group[0]!.cls;
      for (const line of group) raster.polyline(line.xs, line.ys, line.xs.length, halfOf(line.cls));
      if (symbol) raster.fill(...(ROAD_SYMBOL[cls] ?? ROAD_SYMBOL[0]!));
      else raster.fill(...group[0]!.colour);
    }
    yield;
  }
  if (view.z < LINED_FROM) return;
  // Close enough, the line down the middle, dashed.
  const dash = CENTRE_DASH / view.unitsPerPixel;
  const width = Math.max(0.3, CENTRE_HALF / view.unitsPerPixel);
  for (const line of drawn) dashes(raster, line.xs, line.ys, dash, dash * 1.4, width);
  raster.fill(...CENTRE_LINE, 0.8);
}

/** Dashes `on` pixels long every `on + off` down a polyline, `half` either side. */
function dashes(raster: Raster, xs: readonly number[], ys: readonly number[], on: number, off: number, half: number): void {
  let carry = 0;
  for (let k = 1; k < xs.length; k++) {
    const x0 = xs[k - 1]!;
    const y0 = ys[k - 1]!;
    const length = Math.hypot(xs[k]! - x0, ys[k]! - y0);
    if (length <= 0) continue;
    const dx = (xs[k]! - x0) / length;
    const dy = (ys[k]! - y0) / length;
    let t = carry;
    for (; t < length; t += on + off) {
      const t1 = Math.min(length, t + on);
      raster.segment(x0 + dx * t, y0 + dy * t, x0 + dx * t1, y0 + dy * t1, half);
    }
    carry = t - length;
  }
}

export function* paintRails(f: FeatureCtx, view: TileView, raster: Raster): Generator<undefined, void, void> {
  const { sources, xs, ys } = f;
  const network = sources.rails;
  if (network === null || network === undefined) return;
  const half = Math.max(0.6, BED_HALF / view.unitsPerPixel);
  const lines: { xs: number[]; ys: number[] }[] = [];
  for (let line = 0; line < network.lines.length; line++) {
    const path = network.path(line);
    if (!project(f, view, path.xyz, path.count, half + 4)) continue;
    lines.push({ xs: [...xs], ys: [...ys] });
    yield;
  }
  if (lines.length === 0) return;
  for (const line of lines) raster.polyline(line.xs, line.ys, line.xs.length, half + 0.6);
  raster.fill(...INK, 0.8);
  for (const line of lines) raster.polyline(line.xs, line.ys, line.xs.length, half);
  raster.fill(...RAIL_BED);
  if (view.z < INKED_FROM) return;
  // The sleepers' dashes down the middle, the railway's own symbol.
  const dash = 3 / view.unitsPerPixel;
  for (const line of lines) dashes(raster, line.xs, line.ys, dash, dash, Math.max(0.35, half * 0.35));
  raster.fill(...RAIL_TIE);
}
