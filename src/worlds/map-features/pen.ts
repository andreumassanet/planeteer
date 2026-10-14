/** The scratch and the frame maths the map painters share: a site's frame onto a tile, boxes and corners in it. */

import * as THREE from 'three';
import type { Settlements, Site } from '../settlements.ts';
import type { Affine, TileView } from '../../map-tiles.ts';
import type { Raster } from '../../raster.ts';

export interface Pen {
  readonly settlements: Settlements;
  /** Scratch points on the tile. */
  readonly p: { x: number; y: number };
  readonly q: { x: number; y: number };
  readonly r: { x: number; y: number };
  /** A world point scratch, and the corner lists `corners` fills. */
  readonly point: THREE.Vector3;
  readonly xs: number[];
  readonly ys: number[];
  /** A site's frame onto the tile, from three of its own points ten units apart. */
  frameOf(view: TileView, site: Site): Affine;
  /** A box in the site's frame: centre, Three's yaw, half extents. */
  box(raster: Raster, a: Affine, x: number, z: number, yaw: number, hx: number, hz: number): void;
  /** The four corners of such a box, in `xs` and `ys`. */
  corners(a: Affine, x: number, z: number, yaw: number, hx: number, hz: number): void;
}

export function createPen(settlements: Settlements): Pen {
  const p = { x: 0, y: 0 };
  const q = { x: 0, y: 0 };
  const r = { x: 0, y: 0 };
  const affine: Affine = { ox: 0, oy: 0, xx: 0, xy: 0, zx: 0, zy: 0 };
  const point = new THREE.Vector3();
  const xs: number[] = [];
  const ys: number[] = [];
  return {
    settlements,
    p,
    q,
    r,
    point,
    xs,
    ys,
    frameOf(view, site) {
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
    },
    box(raster, a, x, z, yaw, hx, hz) {
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
    },
    corners(a, x, z, yaw, hx, hz) {
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
    },
  };
}
