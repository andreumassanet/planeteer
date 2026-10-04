/**
 * What stands on a walked world, painted onto its maps' tiles: Earth's
 * pipeline (`map-tiles.ts`), the same painter and the same levels, with the
 * world's own things — the standing rule that a world is the same game as
 * Earth, never a separate engine.
 *
 * Read off the definitions the world is built from, as on Earth:
 *
 * - **a town on the grid** is its `GridTown` (`town-grid.ts`): the streets
 *   on their lines, a pavement each side and the carriageway between in the
 *   colours `settlements.ts` lays them in (`tone(steel, 1.25)`, `tone(bone,
 *   1.04)`), every building's plan box (`planOf` of its form and scale) at
 *   its yaw, in its livery's roof (`liveryOf` on the very seed the town
 *   paints it with), inked; a landing pad a disc, a garden green;
 * - **a town of forms** (a civilisation without a colony) its paving disc,
 *   its square and its avenues a shade darker, and each plot a disc of its
 *   piece's radius in its livery (`layoutOf`, `pieceRadius`);
 * - **a landmark** its paved setting;
 * - **the roads** their ribbons' centre lines at their own half-width;
 * - **the rockets' pads** (`padOf`, as `index.ts` stands them) and the
 *   **saucers** parked off the towns' corners (`ufoParkingOf`).
 *
 * Every position goes through the town's own frame (`Settlements.toWorld`)
 * onto the tile, so nothing here decides which way east is.
 */
import * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import { DEFAULT_ARCHITECTURE } from './contract.ts';
import type { Settlements, Site } from './settlements.ts';
import { layoutOf, pieceRadius } from './settlements.ts';
import { planOf } from './town-grid.ts';
import { liveryOf } from './kit.ts';
import { rngFrom } from '../scenery/random.ts';
import { PALETTE } from '../theme.ts';
import { tone } from '../monuments/contract.ts';
import { PAD_RADIUS } from '../rocket.ts';
import { UFO_RADIUS } from './ufo.ts';
import type { Affine, MapFeatures, TileView } from '../map-tiles.ts';
import type { Raster } from '../raster.ts';
import { bytesOf } from '../raster.ts';

export interface WorldFeatureSources {
  spec: WorldSpec;
  settlements: Settlements;
  /** The roads, each its centre line as `[lat, lon]` and its carriageway's half-width. */
  roads: () => readonly { half: number; points: readonly (readonly [number, number])[] }[];
  /** Every rocket's pad and every parked saucer, as points on the sphere. */
  pads: () => readonly { at: THREE.Vector3 }[];
  saucers: () => readonly { at: THREE.Vector3 }[];
}

/**
 * The scale each family comes in at, world units a tile pixel: a world's
 * levels are its radius's, so a level is not the same scale on Mars and on
 * Jupiter, and the families are keyed on what a pixel covers instead.
 */
const ROADS_BELOW = 16;
const TOWNS_BELOW = 16;
const PLANS_BELOW = 4.5;
const PADS_BELOW = 4.5;
const INKED_BELOW = 2.2;

const INK = bytesOf(PALETTE.ink);
const CARRIAGE = bytesOf(tone(PALETTE.steel, 1.25));
const PAVEMENT = bytesOf(tone(PALETTE.bone, 1.04));
const ROAD_SYMBOL = bytesOf(PALETTE.cream);
const GARDEN = bytesOf(tone(PALETTE.green, 0.8));
const PAD_FILL = bytesOf(PALETTE.bone);
const PAD_MARK = bytesOf(PALETTE.red);
const SAUCER = bytesOf(tone(PALETTE.steel, 1.5));
const SAUCER_DOME = bytesOf(tone(PALETTE.skyBlue, 1.1));

export function createWorldFeatures(sources: WorldFeatureSources): MapFeatures {
  const { spec, settlements } = sources;
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  const deck = spec.ground === 'cloud-deck';
  const p = { x: 0, y: 0 };
  const q = { x: 0, y: 0 };
  const r = { x: 0, y: 0 };
  const affine: Affine = { ox: 0, oy: 0, xx: 0, xy: 0, zx: 0, zy: 0 };
  const point = new THREE.Vector3();
  const xs: number[] = [];
  const ys: number[] = [];
  const roofs = new Map<string, number>();

  /** A site's frame onto the tile, from three of its own points ten units apart. */
  function frameOf(view: TileView, site: Site): Affine {
    view.at(settlements.toWorld(site, 0, 0, 0, point), p);
    view.at(settlements.toWorld(site, 10, 0, 0, point), q);
    view.at(settlements.toWorld(site, 0, 0, 10, point), r);
    affine.ox = p.x;
    affine.oy = p.y;
    affine.xx = (q.x - p.x) / 10;
    affine.xy = (q.y - p.y) / 10;
    affine.zx = (r.x - p.x) / 10;
    affine.zy = (r.y - p.y) / 10;
    return affine;
  }

  /** A box in the site's frame: centre, Three's yaw, half extents. */
  function box(raster: Raster, a: Affine, x: number, z: number, yaw: number, hx: number, hz: number): void {
    const c = Math.cos(yaw);
    const s = -Math.sin(yaw);
    raster.box(
      a.ox + a.xx * x + a.zx * z,
      a.oy + a.xy * x + a.zy * z,
      (a.xx * c + a.zx * s) * hx,
      (a.xy * c + a.zy * s) * hx,
      (-a.xx * s + a.zx * c) * hz,
      (-a.xy * s + a.zy * c) * hz,
    );
  }

  function corners(a: Affine, x: number, z: number, yaw: number, hx: number, hz: number): void {
    const c = Math.cos(yaw);
    const s = -Math.sin(yaw);
    xs.length = 0;
    ys.length = 0;
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const lx = x + c * hx * i - s * hz * j;
      const lz = z + s * hx * i + c * hz * j;
      xs.push(a.ox + a.xx * lx + a.zx * lz);
      ys.push(a.oy + a.xy * lx + a.zy * lz);
    }
  }

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

  function paintRoads(view: TileView, raster: Raster): void {
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

  function paintCraft(view: TileView, raster: Raster): void {
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

  return {
    stamp: `w${spec.id}:${settlements.sites.length}`,
    // Every level of a world: its towns are few and its tiles big, and the
    // families gate themselves on the pixel's size (`ROADS_BELOW`...).
    fromLevel: 0,
    *paint(view, raster) {
      if (view.unitsPerPixel < ROADS_BELOW) paintRoads(view, raster);
      yield;
      if (view.unitsPerPixel < TOWNS_BELOW) paintTowns(view, raster);
      yield;
      if (view.unitsPerPixel < PADS_BELOW) paintCraft(view, raster);
    },
  };
}
