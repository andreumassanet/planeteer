import { BED_HALF } from '../rails.ts';
import { CARRIAGEWAY_HALF } from '../scenery/grid.ts';
import type { TileView } from '../map-tiles.ts';
import type { Raster } from '../raster.ts';
import { INK, INKED_FROM, PLANS_FROM, RAIL_BED, RAIL_TIE, ROAD_BATCH, ROAD_SYMBOL, inkWidth } from './constants.ts';
import { type FeatureCtx, overlaps, project } from './context.ts';
import { pathOf, roadList } from './index.ts';

export function* paintRoads(f: FeatureCtx, view: TileView, raster: Raster): Generator<undefined, void, void> {
  const { xs, ys } = f;
  const list = roadList(f);
  const symbol = view.z < PLANS_FROM;
  const half = Math.max(symbol ? 0.7 : 0.6, CARRIAGEWAY_HALF / view.unitsPerPixel);
  const casing = symbol ? 0.75 : inkWidth(view.z) + 0.15;
  const drawn: { xs: number[]; ys: number[]; colour: [number, number, number] }[] = [];
  let k = 0;
  for (let index = 0; index < list.length; index++) {
    const entry = list[index]!;
    if (!overlaps(view, entry.south, entry.north, entry.west, entry.east)) continue;
    // A road's path is worked out the first time it is drawn, a few at a step.
    if (entry.path === null && (++k & 3) === 0) yield;
    const path = pathOf(f, index);
    if (!project(f, view, path, path.length / 3, half + 4)) continue;
    drawn.push({ xs: [...xs], ys: [...ys], colour: entry.tarmac });
  }
  if (drawn.length === 0) return;
  // Casing under every road first, so a junction is one piece of road — in
  // batches of `ROAD_BATCH`, a step each, so a far tile's hundreds of roads
  // are not one long fill.
  for (let at = 0; at < drawn.length; at += ROAD_BATCH) {
    for (const line of drawn.slice(at, at + ROAD_BATCH)) raster.polyline(line.xs, line.ys, line.xs.length, half + casing);
    raster.fill(...INK, symbol ? 0.7 : 0.85);
    yield;
  }
  // Then each in its own tarmac, or the sheet's cream while it is a symbol.
  for (let at = 0; at < drawn.length; at += ROAD_BATCH) {
    const byColour = new Map<string, typeof drawn>();
    for (const line of drawn.slice(at, at + ROAD_BATCH)) {
      const key = symbol ? '' : line.colour.join(',');
      const group = byColour.get(key);
      if (group === undefined) byColour.set(key, [line]);
      else group.push(line);
    }
    for (const group of byColour.values()) {
      for (const line of group) raster.polyline(line.xs, line.ys, line.xs.length, half);
      if (symbol) raster.fill(...ROAD_SYMBOL);
      else raster.fill(...group[0]!.colour);
    }
    yield;
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
  for (const line of lines) {
    let carry = 0;
    for (let k = 1; k < line.xs.length; k++) {
      const x0 = line.xs[k - 1]!;
      const y0 = line.ys[k - 1]!;
      const length = Math.hypot(line.xs[k]! - x0, line.ys[k]! - y0);
      if (length <= 0) continue;
      const dx = (line.xs[k]! - x0) / length;
      const dy = (line.ys[k]! - y0) / length;
      for (let t = carry; t < length; t += dash * 2) {
        const t1 = Math.min(length, t + dash);
        raster.segment(x0 + dx * t, y0 + dy * t, x0 + dx * t1, y0 + dy * t1, Math.max(0.35, half * 0.35));
      }
      carry = Math.max(0, carry - length);
    }
  }
  raster.fill(...RAIL_TIE);
}
