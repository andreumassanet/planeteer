import { BIOMES, biomeAt } from '../biome.ts';
import { SHEET_HEIGHT, latOfV } from '../map-tiles.ts';
import type { TileView } from '../map-tiles.ts';
import type { Raster } from '../raster.ts';
import { reliefAt } from '../terrain.ts';
import { unitAt } from '../sphere.ts';
import { CANOPY, CANOPY_DARK, CANOPY_LIGHT, CANOPY_SHADE, CROWN_BATCH, DEG, GROVE, INKED_CROWN, INKED_FROM, WOOD_PITCH, inkWidth } from './constants.ts';
import { type FeatureCtx, latAt } from './context.ts';
import { groveNoise, hash2 } from './noise.ts';

/**
 * Woods as a symbol: a crown every `WOOD_PITCH` units of a lattice fixed to
 * the sheet, kept where the biome's `cover` says a wood is, in its canopy's
 * colour, shaded to the south-east and lit to the north-west; inked close
 * enough.
 */
export function* paintWoods(f: FeatureCtx, view: TileView, raster: Raster): Generator<undefined, void, void> {
  const { world, unit, sample } = f;
  // A lattice fixed to the sheet at this level, so two tiles agree at their
  // seam: its pitch in pixels is the level's, not the tile's latitude's
  // (a tile's own `unitsPerPixel` drew two lattices either side of every
  // row of tiles), taken at 45 degrees, where most of the land is.
  const atLevel = (360 / view.scale) * view.radius * DEG * Math.SQRT1_2;
  const step = Math.max(2, WOOD_PITCH / atLevel);
  // The cover on a coarse lattice first — most of a tile is one biome —
  // fixed to the sheet, so a crown near a seam is asked the same cover by
  // both tiles and kept by both or neither.
  const L = 32;
  const gx0 = Math.floor((view.u0 * view.scale - 2 * step) / L);
  const gy0 = Math.floor((view.v0 * view.scale - 2 * step) / L);
  const G = Math.ceil((256 + 4 * step) / L) + 2;
  const cover = new Float32Array(G * G);
  for (let gy = 0; gy < G; gy++) {
    const lat = latOfV(Math.min(SHEET_HEIGHT, Math.max(0, ((gy0 + gy) * L) / view.scale)));
    for (let gx = 0; gx < G; gx++) {
      const lon = ((gx0 + gx) * L) / view.scale * 360 - 180;
      unitAt(lat, lon, unit);
      const relief = reliefAt(unit.x, unit.y, unit.z);
      biomeAt(unit.x, unit.y, unit.z, lat, lon, relief, sample);
      cover[gy * G + gx] = BIOMES[sample.id].cover;
    }
  }
  yield;
  const columns = Math.ceil(256 / step) + 2;
  const originX = Math.floor((view.u0 * view.scale) / step);
  const originY = Math.floor((view.v0 * view.scale) / step);
  // Crowns wide enough to run into their neighbours, so a wood reads as a
  // canopy with an edge and not as a scatter of specks; inked once a crown
  // is wide enough for its rim not to be all there is of it.
  const r = view.z >= INKED_FROM ? Math.max(0.9, (WOOD_PITCH * 0.7) / atLevel) : step * 0.8;
  const inked = view.z >= INKED_FROM && r >= INKED_CROWN;
  const dots: number[] = [];
  for (let row = -1; row < columns; row++) {
    for (let col = -1; col < columns; col++) {
      const gx = originX + col;
      const gy = originY + row;
      const h1 = hash2(gx, gy);
      const x = (gx + 0.2 + 0.6 * h1) * step - view.u0 * view.scale;
      const y = (gy + 0.2 + 0.6 * hash2(gy + 7.1, gx - 3.3)) * step - view.v0 * view.scale;
      if (!view.inside(x, y, r)) continue;
      const fx = (x + view.u0 * view.scale) / L - gx0;
      const fy = (y + view.v0 * view.scale) / L - gy0;
      const ix = Math.min(G - 2, Math.max(0, Math.floor(fx)));
      const iy = Math.min(G - 2, Math.max(0, Math.floor(fy)));
      const tx = fx - ix;
      const ty = fy - iy;
      const c =
        (cover[iy * G + ix]! * (1 - tx) + cover[iy * G + ix + 1]! * tx) * (1 - ty) +
        (cover[(iy + 1) * G + ix]! * (1 - tx) + cover[(iy + 1) * G + ix + 1]! * tx) * ty;
      // A wood is groves and clearings, not an even scatter: the chance is
      // the cover, against smooth noise over a lattice `GROVE` crowns wide,
      // so the crowns kept run together into woods with edges.
      if (groveNoise(gx / GROVE, gy / GROVE) * 0.8 + h1 * 0.2 > c * 0.92) continue;
      // Not in the sea: asked of the outlines only where a crown is kept.
      unitAt(latAt(view, y), view.west + (x / 256) * (view.east - view.west), unit);
      if (world.countryAtPoint(unit) <= 0) continue;
      dots.push(x, y);
    }
    if ((row & 3) === 3) yield;
  }
  // In four passes over every crown, a batch at a time: the shade each
  // crown throws to the south-east, its rim, its canopy and the light on
  // its north-west shoulder. A wood is one mass with a shaded edge and a
  // textured top, not a scatter of discs.
  const shadeX = Math.max(0.6, r * 0.32);
  const shadeY = Math.max(0.7, r * 0.4);
  const lit = r >= INKED_CROWN;
  const passes: [number, number, number, [number, number, number], number][] = [[shadeX, shadeY, r, CANOPY_SHADE, inked ? 0.65 : 0.5]];
  if (inked) passes.push([0, 0, r + inkWidth(view.z), CANOPY_DARK, 0.75]);
  passes.push([0, 0, r, CANOPY, 1]);
  if (lit) passes.push([-r * 0.24, -r * 0.3, r * 0.55, CANOPY_LIGHT, 0.6]);
  for (const [dx, dy, radius, colour, alpha] of passes) {
    for (let at = 0; at < dots.length; at += CROWN_BATCH * 2) {
      const end = Math.min(dots.length, at + CROWN_BATCH * 2);
      for (let k = at; k < end; k += 2) raster.circle(dots[k]! + dx, dots[k + 1]! + dy, radius);
      raster.fill(...colour, alpha);
      yield;
    }
  }
}
