/** Towns on the map paper: a grid town as its streets, plots and roofs; a town of forms as its paving, square, avenues and discs; a landmark as its setting. */

import type { WorldSpec } from '../contract.ts';
import { DEFAULT_ARCHITECTURE } from '../contract.ts';
import { layoutOf, pieceRadius } from '../settlements.ts';
import type { Settlements, Site } from '../settlements.ts';
import { planOf } from '../town-grid.ts';
import { liveryOf } from '../kit.ts';
import { rngFrom } from '../../scenery/random.ts';
import { PALETTE } from '../../theme.ts';
import { tone } from '../../monuments/contract.ts';
import type { Affine, TileView } from '../../map-tiles.ts';
import type { Raster } from '../../raster.ts';
import { bytesOf } from '../../raster.ts';
import type { Pen } from './pen.ts';

/** Under this many world units a pixel a town is drawn as its plan; over it, as a mark. */
export const PLANS_BELOW = 4.5;
/** Under this a building's outline is inked heavier. */
const INKED_BELOW = 2.2;

const INK = bytesOf(PALETTE.ink);
const CARRIAGE = bytesOf(tone(PALETTE.steel, 1.25));
const PAVEMENT = bytesOf(tone(PALETTE.bone, 1.04));
const GARDEN = bytesOf(tone(PALETTE.green, 0.8));

/** Returns `paintTowns(view, raster)`. */
export function createTownPainter(spec: WorldSpec, settlements: Settlements, pen: Pen): (view: TileView, raster: Raster) => void {
  const { p, q, point, xs, ys, box, corners, frameOf } = pen;
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  const deck = spec.ground === 'cloud-deck';
  const roofs = new Map<string, number>();
  const roofOf = (seed: string): number => {
    let roof = roofs.get(seed);
    if (roof === undefined) {
      roof = liveryOf(style, rngFrom('worlds', spec.id, 'building', seed)).roof;
      roofs.set(seed, roof);
    }
    return roof;
  };

  function paintGridTown(view: TileView, raster: Raster, site: Site, a: Affine): void {
    const town = site.town!;
    const half = town.grid.half;
    if (deck) {
      box(raster, a, 0, 0, 0, half + 0.6, half + 0.6);
      raster.fill(...bytesOf(tone(style.ground, 1.08)));
    }
    // The streets: the pavement the street's whole width, the carriageway inside it.
    for (const street of town.streets) {
      const along = street.axis === 'x';
      box(raster, a, along ? 0 : street.at, along ? street.at : 0, 0, along ? half : street.half, along ? street.half : half);
    }
    raster.fill(...PAVEMENT);
    for (const street of town.streets) {
      const along = street.axis === 'x';
      const width = street.half - street.walk;
      box(raster, a, along ? 0 : street.at, along ? street.at : 0, 0, along ? half : width, along ? width : half);
    }
    raster.fill(...CARRIAGE);
    const ink = view.unitsPerPixel < INKED_BELOW ? 0.7 : 0.45;
    // The gardens and the pads, then the buildings.
    for (const plot of town.plots) {
      if (plot.kind === 'garden' && plot.yard !== null) {
        const [x0, z0, x1, z1] = plot.yard;
        box(raster, a, (x0 + x1) / 2, (z0 + z1) / 2, 0, (x1 - x0) / 2, (z1 - z0) / 2);
      }
    }
    raster.fill(...GARDEN);
    for (const plot of town.plots) {
      if (plot.kind !== 'pad') continue;
      const rad = Math.max(1, plot.scale / view.unitsPerPixel);
      view.at(settlements.toWorld(site, plot.x, 0, plot.z, point), p);
      raster.circle(p.x, p.y, rad + ink);
      raster.fill(...INK);
      raster.circle(p.x, p.y, rad);
      raster.fill(...bytesOf(tone(style.ground, 0.78)));
    }
    const buildings = town.plots.filter((plot) => plot.kind === 'module' || plot.kind === 'hub');
    for (const plot of buildings) {
      const [across, deep] = planOf(plot.form, plot.scale);
      corners(a, plot.x, plot.z, plot.yaw, across / 2, deep / 2);
      raster.outline(xs, ys, 4, ink);
    }
    raster.fill(...INK);
    const byRoof = new Map<number, typeof buildings>();
    for (const plot of buildings) {
      const roof = roofOf(plot.seed);
      const list = byRoof.get(roof);
      if (list === undefined) byRoof.set(roof, [plot]);
      else list.push(plot);
    }
    for (const [roof, list] of byRoof) {
      for (const plot of list) {
        const [across, deep] = planOf(plot.form, plot.scale);
        box(raster, a, plot.x, plot.z, plot.yaw, across / 2, deep / 2);
      }
      raster.fill(...bytesOf(roof));
    }
  }

  const layouts = new Map<string, ReturnType<typeof layoutOf>>();
  function paintFormTown(view: TileView, raster: Raster, site: Site, a: Affine): void {
    view.at(settlements.toWorld(site, 0, 0, 0, point), p);
    const toPx = Math.hypot(a.xx, a.xy);
    raster.circle(p.x, p.y, site.paving * toPx);
    raster.fill(...bytesOf(style.ground));
    if (site.landmark) {
      raster.circle(p.x, p.y, site.radius * 0.6 * toPx);
      raster.fill(...bytesOf(tone(style.ground, 0.8)));
      return;
    }
    raster.circle(p.x, p.y, site.plaza * toPx);
    raster.fill(...bytesOf(tone(style.ground, 1.12)));
    const length = site.paving - site.plaza;
    for (const angle of site.avenues) {
      box(raster, a, Math.sin(angle) * (site.plaza + length / 2), Math.cos(angle) * (site.plaza + length / 2), angle, site.avenueHalf, length / 2);
    }
    raster.fill(...bytesOf(tone(style.ground, 0.88)));
    let layout = layouts.get(site.id);
    if (layout === undefined) {
      layout = layoutOf(spec, site.id, site.radius, false);
      layouts.set(site.id, layout);
    }
    const ink = view.unitsPerPixel < INKED_BELOW ? 0.7 : 0.45;
    const discs: { x: number; y: number; r: number; roof: number }[] = [];
    for (const plot of layout.plots) {
      view.at(settlements.toWorld(site, plot.x, 0, plot.z, point), q);
      const rad = Math.max(0.8, pieceRadius(plot.form, plot.scale) * toPx * 0.9);
      discs.push({ x: q.x, y: q.y, r: rad, roof: plot.form === 'pad' ? tone(style.ground, 0.78) : roofOf(plot.seed) });
      raster.circle(q.x, q.y, rad + ink);
    }
    raster.fill(...INK);
    for (const disc of discs) {
      raster.circle(disc.x, disc.y, disc.r);
      raster.fill(...bytesOf(disc.roof));
    }
  }

  function paintTowns(view: TileView, raster: Raster): void {
    for (const site of settlements.sites) {
      view.at(site.dir, p);
      const reach = (site.radius + 4) / view.unitsPerPixel;
      if (!view.inside(p.x, p.y, reach)) continue;
      if (view.unitsPerPixel >= PLANS_BELOW) {
        // A square or a disc of its paving: a town at this size is a mark.
        const side = (site.town !== null ? site.town.grid.half : site.paving * 0.8) / view.unitsPerPixel;
        raster.rect(p.x - side, p.y - side, side * 2, side * 2);
        raster.fill(...bytesOf(tone(style.ground, 0.9)));
        raster.outline([p.x - side, p.x + side, p.x + side, p.x - side], [p.y - side, p.y - side, p.y + side, p.y + side], 4, 0.6);
        raster.fill(...INK, 0.8);
        continue;
      }
      const a = frameOf(view, site);
      if (site.town !== null) paintGridTown(view, raster, site, a);
      else paintFormTown(view, raster, site, a);
    }
  }

  return paintTowns;
}
