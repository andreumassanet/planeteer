import type { XYZ } from '../sphere.ts';
import { latLonOf } from '../sphere.ts';
import { DEG, SHEET_HEIGHT, TILE, latOfV, uOf, vOf } from './projection.ts';
import type { Affine, TileView } from './types.ts';

/** A tile's view: the projection a features painter draws through. */
export function tileView(z: number, i: number, j: number, radius: number): TileView & { hurry: boolean } {
  const n = 2 ** z;
  const scale = TILE * n;
  const u0 = i / n;
  const v0 = j / n;
  const west = u0 * 360 - 180;
  const east = west + 360 / n;
  const north = latOfV(v0);
  const south = latOfV(Math.min(SHEET_HEIGHT, v0 + 1 / n));
  const midLat = (north + south) / 2;
  const unitsPerPixel = ((360 / scale) * radius * DEG) * Math.max(0.02, Math.cos(midLat * DEG));
  const midU = u0 + 0.5 / n;
  const scratch = { lat: 0, lon: 0 };
  const px = (lat: number, lon: number, out: { x: number; y: number }): void => {
    let u = uOf(lon);
    u -= Math.round(u - midU);
    out.x = (u - u0) * scale;
    out.y = (vOf(lat) - v0) * scale;
  };
  const view = {
    z, i, j, u0, v0, scale, south, north, west, east, unitsPerPixel, radius,
    hurry: false,
    incomplete: false,
    px,
    at(point: XYZ, out: { x: number; y: number }) {
      latLonOf(point, scratch);
      px(scratch.lat, scratch.lon, out);
    },
    frame(up: XYZ, across: XYZ, northward: XYZ, out: Affine): Affine {
      // Three points of the frame through the projection, ten units apart:
      // on a 16,000-unit sphere the tangent plane is the ground to a
      // hundredth of a unit there, and the affine is the projection's own
      // derivative at the frame's centre.
      const step = 10 / radius;
      const o = { x: 0, y: 0 };
      const a = { x: 0, y: 0 };
      const b = { x: 0, y: 0 };
      view.at(up, o);
      view.at({ x: up.x + across.x * step, y: up.y + across.y * step, z: up.z + across.z * step }, a);
      view.at({ x: up.x + northward.x * step, y: up.y + northward.y * step, z: up.z + northward.z * step }, b);
      out.ox = o.x;
      out.oy = o.y;
      out.xx = (a.x - o.x) / 10;
      out.xy = (a.y - o.y) / 10;
      out.zx = (b.x - o.x) / 10;
      out.zy = (b.y - o.y) / 10;
      return out;
    },
    inside(x: number, y: number, margin: number) {
      return x >= -margin && y >= -margin && x <= TILE + margin && y <= TILE + margin;
    },
  };
  return view;
}
