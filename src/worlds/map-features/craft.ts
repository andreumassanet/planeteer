/** Roads, rockets' pads and saucers on the map paper. */

import { PALETTE } from '../../theme.ts';
import { tone } from '../../monuments/contract.ts';
import { PAD_RADIUS } from '../../rocket.ts';
import { UFO_RADIUS } from '../ufo.ts';
import type { TileView } from '../../map-tiles.ts';
import type { Raster } from '../../raster.ts';
import { bytesOf } from '../../raster.ts';
import type { WorldFeatureSources } from '../map-features.ts';
import type { Pen } from './pen.ts';
import { PLANS_BELOW } from './towns.ts';

/** Under this many world units a pixel a pad or saucer is drawn at its own size; and a heavier ink under the second. */
const INKED_BELOW = 2.2;

const INK = bytesOf(PALETTE.ink);
const CARRIAGE = bytesOf(tone(PALETTE.steel, 1.25));
const ROAD_SYMBOL = bytesOf(PALETTE.cream);
const PAD_FILL = bytesOf(PALETTE.bone);
const PAD_MARK = bytesOf(PALETTE.red);
const SAUCER = bytesOf(tone(PALETTE.steel, 1.5));
const SAUCER_DOME = bytesOf(tone(PALETTE.skyBlue, 1.1));

/** The roads' ribbons at their own half-width, or a cream line where a pixel is wide. */
export function paintRoads(sources: WorldFeatureSources, pen: Pen, view: TileView, raster: Raster): void {
  const { p, xs, ys } = pen;
  const symbol = view.unitsPerPixel >= PLANS_BELOW;
  const lines: { xs: number[]; ys: number[]; half: number }[] = [];
  for (const road of sources.roads()) {
    xs.length = 0;
    ys.length = 0;
    let near = false;
    for (const [lat, lon] of road.points) {
      view.px(lat, lon, p);
      xs.push(p.x);
      ys.push(p.y);
      if (view.inside(p.x, p.y, 40)) near = true;
    }
    if (!near) continue;
    lines.push({ xs: [...xs], ys: [...ys], half: Math.max(symbol ? 0.7 : 0.6, road.half / view.unitsPerPixel) });
  }
  if (lines.length === 0) return;
  for (const line of lines) raster.polyline(line.xs, line.ys, line.xs.length, line.half + (symbol ? 0.75 : 0.6));
  raster.fill(...INK, 0.8);
  for (const line of lines) raster.polyline(line.xs, line.ys, line.xs.length, line.half);
  raster.fill(...(symbol ? ROAD_SYMBOL : CARRIAGE));
}

/** The rockets' pads and the parked saucers. */
export function paintCraft(sources: WorldFeatureSources, pen: Pen, view: TileView, raster: Raster): void {
  const { p } = pen;
  const ink = Math.max(0.6, view.unitsPerPixel < INKED_BELOW ? 0.8 : 0.6);
  const rad = Math.max(1.5, PAD_RADIUS / view.unitsPerPixel);
  for (const pad of sources.pads()) {
    view.at(pad.at, p);
    if (!view.inside(p.x, p.y, rad + 2)) continue;
    raster.circle(p.x, p.y, rad + ink);
    raster.fill(...INK);
    raster.circle(p.x, p.y, rad);
    raster.fill(...PAD_FILL);
    raster.circle(p.x, p.y, rad * 0.38);
    raster.fill(...PAD_MARK);
  }
  const saucer = Math.max(1.5, UFO_RADIUS / view.unitsPerPixel);
  for (const one of sources.saucers()) {
    view.at(one.at, p);
    if (!view.inside(p.x, p.y, saucer + 2)) continue;
    raster.circle(p.x, p.y, saucer + ink);
    raster.fill(...INK);
    raster.circle(p.x, p.y, saucer);
    raster.fill(...SAUCER);
    raster.circle(p.x, p.y, saucer * 0.42);
    raster.fill(...SAUCER_DOME);
  }
}
