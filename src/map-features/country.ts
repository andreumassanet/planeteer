import type * as THREE from 'three';
import type { CropField, CountryPiece } from '../countryside.ts';
import { cropPlate } from '../countryside-tile.ts';
import type { TileView } from '../map-tiles.ts';
import { type Raster, bytesOf } from '../raster.ts';
import { PALETTE } from '../theme.ts';
import { cellAt, cellBounds, stepOf } from '../tile-grid.ts';
import { FARMHOUSE, INK, INKED_FROM, PIECES_FROM, PIECE_COLOURS, ROWS_FROM, inkWidth } from './constants.ts';
import { type FeatureCtx, frameAt, localBox, localCorners } from './context.ts';

/** The countryside the planner plans: fields in their crops' plates, then fences, then the pieces as footprints. */
export function* paintCountry(f: FeatureCtx, view: TileView, raster: Raster): Generator<undefined, void, void> {
  const { sources, p, q, affine, xs, ys, frameAcross, frameNorth, cellScratch } = f;
  const planner = sources.countryside?.() ?? null;
  if (planner === null) return;
  const step = stepOf(0);
  const fields: CropField[] = [];
  const pieces: CountryPiece[] = [];
  const lines: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
  const seen = new Set<string>();
  for (let lat = view.south - step; lat <= view.north + step; lat += step) {
    const first = cellAt(Math.max(-89.9, Math.min(89.9, lat)), view.west, 0);
    cellBounds(0, first.row, first.column, cellScratch);
    for (let lon = cellScratch.west; lon <= view.east + cellScratch.dLon; lon += cellScratch.dLon) {
      const cell = cellAt(Math.max(-89.9, Math.min(89.9, lat)), lon, 0);
      const key = `${cell.row}:${cell.column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const plan = planner.plan(cell.row, cell.column);
      fields.push(...plan.fields);
      pieces.push(...plan.pieces);
      if (view.z >= ROWS_FROM) lines.push(...plan.lines);
      yield;
    }
  }
  // The fields, each its crop's plate and, close enough, its rows.
  for (const field of fields) {
    const plate = cropPlate(field.crop);
    frameAt(f, field.at);
    view.frame(field.at, frameAcross, frameNorth, affine);
    const c = Math.cos(field.yaw);
    const s = -Math.sin(field.yaw);
    if (field.round) {
      view.at(field.at, p);
      raster.circle(p.x, p.y, field.halfX / view.unitsPerPixel);
    } else localBox(raster, affine, 0, 0, c, s, field.halfX, field.halfZ);
    raster.fill(...bytesOf(plate[0]));
    if (view.z >= ROWS_FROM && !field.round) {
      // Its rows along its local Z, every other one in the second tone.
      const spacing = Math.max(2.4, 2 * view.unitsPerPixel);
      for (let x = -field.halfX + spacing / 2; x < field.halfX; x += spacing * 2) {
        localBox(raster, affine, x * c, x * s, c, s, spacing / 2, field.halfZ);
      }
      raster.fill(...bytesOf(plate[1]), 0.7);
    }
    if (view.z >= INKED_FROM && !field.round) {
      localCorners(f, affine, 0, 0, c, s, field.halfX, field.halfZ);
      raster.outline(xs, ys, 4, inkWidth(view.z) * 0.5);
      raster.fill(...INK, 0.35);
    }
  }
  yield;
  for (const line of lines) {
    view.at(line.from, p);
    view.at(line.to, q);
    raster.segment(p.x, p.y, q.x, q.y, 0.35);
  }
  if (lines.length > 0) raster.fill(...INK, 0.45);
  if (view.z < PIECES_FROM) return;
  // The pieces: a footprint each, in its part's colour, inked.
  for (const piece of pieces) {
    const colour = piece.scenic ? FARMHOUSE : PIECE_COLOURS[piece.part] === undefined ? PALETTE.bone : PIECE_COLOURS[piece.part]!;
    if (colour === null) continue;
    view.at(piece.at, p);
    if (!view.inside(p.x, p.y, 20)) continue;
    const half = Math.max(0.8 / view.unitsPerPixel, piece.footprint * 0.62);
    frameAt(f, piece.at);
    view.frame(piece.at, frameAcross, frameNorth, affine);
    const c = Math.cos(piece.yaw);
    const s = -Math.sin(piece.yaw);
    const round = piece.part === 'silo' || piece.part === 'ger' || piece.part === 'windmill' || piece.part === 'lighthouse' || piece.part === 'turbine' || piece.part === 'campfire' || piece.part === 'hay-bale';
    const ink = inkWidth(view.z);
    if (round) {
      const r = Math.max(1, (piece.footprint * 0.6) / view.unitsPerPixel);
      raster.circle(p.x, p.y, r + ink);
      raster.fill(...INK);
      raster.circle(p.x, p.y, r);
    } else {
      localCorners(f, affine, 0, 0, c, s, half, half * (piece.part === 'jetty' ? 2.2 : 0.75));
      raster.outline(xs, ys, 4, ink);
      raster.fill(...INK);
      localBox(raster, affine, 0, 0, c, s, half, half * (piece.part === 'jetty' ? 2.2 : 0.75));
    }
    raster.fill(...bytesOf(colour));
  }
}
