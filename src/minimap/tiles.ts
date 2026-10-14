import { Vector3 } from 'three';
import {
  type MapTile, type TileSource, MAX_LEVEL, SHEET_HEIGHT, TILE, latOfV, levelFor, lonOfU, rowsAt, uOf, vOf,
} from '../map-tiles.ts';
import { TAU } from '../cartography.ts';
import { latLonOf, unitAt } from '../sphere.ts';
import { MAX_DISC_TILES, MAX_PIECES, PIECE_DEGREES } from './constants.ts';
import type { MinimapState } from './state.ts';

const tileSource: TileSource = { image: null as unknown as CanvasImageSource, sx: 0, sy: 0, size: TILE, up: 0 };
const tileHere = { lat: 0, lon: 0 };
const corner = new Vector3();
const pieceX = new Float64Array(81);
const pieceY = new Float64Array(81);
const pieceIn = new Uint8Array(81);

/**
 * The paper's tiles under the disc, each reprojected onto it piece by
 * piece, the nearest painted ancestor standing in for any not painted
 * yet; and what is missing asked for, nearest the middle first. False
 * where nothing could be drawn.
 */
export function drawTiles(m: MinimapState): boolean {
  const { settings, baseCtx, centre, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale, view } = m;
  const sheetPaper = settings.tiles!;
  latLonOf({ x: ux, y: uy, z: uz }, tileHere);
  const cosLat = Math.max(0.05, Math.cos((tileHere.lat * Math.PI) / 180));
  // Pixels a sheet unit east-west at the disc's middle: a sheet unit is
  // the whole turn of longitude.
  let z = Math.min(MAX_LEVEL, levelFor(scale * TAU * cosLat * m.ratio));
  const reach = Math.min(89, ((view * 180) / Math.PI) * 1.08);
  const latTop = Math.min(89.99, tileHere.lat + reach);
  const latBottom = Math.max(-89.99, tileHere.lat - reach);
  const widest = Math.max(Math.abs(latTop), Math.abs(latBottom));
  const lonReach = widest >= 89 ? 180 : Math.min(180, reach / Math.max(0.02, Math.cos((widest * Math.PI) / 180)));
  let i0 = 0;
  let i1 = 0;
  let j0 = 0;
  let j1 = 0;
  for (;; z--) {
    const n = 2 ** z;
    j0 = Math.max(0, Math.floor(vOf(latTop) * n));
    j1 = Math.min(rowsAt(z) - 1, Math.floor(vOf(latBottom) * n));
    if (lonReach >= 180) {
      i0 = 0;
      i1 = n - 1;
    } else {
      i0 = Math.floor(uOf(tileHere.lon - lonReach) * n);
      i1 = Math.floor(uOf(tileHere.lon + lonReach) * n);
    }
    if ((i1 - i0 + 1) * (j1 - j0 + 1) <= MAX_DISC_TILES || z === 0) break;
  }
  m.tileLevel = z;
  const n = 2 ** z;
  const latSpan = (latOfV(j0 / n) - latOfV((j0 + 1) / n));
  let k = Math.max(1, Math.min(8, Math.ceil(latSpan / PIECE_DEGREES)));
  while (k > 1 && (i1 - i0 + 1) * (j1 - j0 + 1) * k * k > MAX_PIECES) k--;
  const want: { tile: MapTile; d: number }[] = [];
  let drew = 0;
  baseCtx.imageSmoothingEnabled = true;
  baseCtx.imageSmoothingQuality = 'high';
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const wrapI = ((i % n) + n) % n;
      // The tile's lattice of corners on the disc, and which are in front.
      let front = false;
      for (let b = 0; b <= k; b++) {
        const lat = latOfV(Math.min(SHEET_HEIGHT, (j + b / k) / n));
        for (let a = 0; a <= k; a++) {
          unitAt(lat, lonOfU((i + a / k) / n), corner);
          const at = b * (k + 1) + a;
          const height = corner.x * ux + corner.y * uy + corner.z * uz;
          pieceIn[at] = height > 0.02 ? 1 : 0;
          pieceX[at] = centre + (corner.x * rx + corner.y * ry + corner.z * rz) * scale;
          pieceY[at] = centre - (corner.x * fx + corner.y * fy + corner.z * fz) * scale;
          if (pieceIn[at] === 1 && Math.abs(pieceX[at]! - centre) < centre * 1.2 && Math.abs(pieceY[at]! - centre) < centre * 1.2) front = true;
        }
      }
      if (!front) continue;
      const tile = sheetPaper.tile(z, wrapI, j);
      if (tile.state !== 'ready') want.push({ tile, d: Math.hypot(pieceX[(k >> 1) * (k + 2)]! - centre, pieceY[(k >> 1) * (k + 2)]! - centre) });
      if (!sheetPaper.source(z, wrapI, j, tileSource)) continue;
      const part = tileSource.size / k;
      for (let b = 0; b < k; b++) {
        for (let a = 0; a < k; a++) {
          const p0 = b * (k + 1) + a;
          const p1 = p0 + 1;
          const p2 = p0 + k + 1;
          if (pieceIn[p0] === 0 || pieceIn[p1] === 0 || pieceIn[p2] === 0 || pieceIn[p2 + 1] === 0) continue;
          const ax = pieceX[p1]! - pieceX[p0]!;
          const ay = pieceY[p1]! - pieceY[p0]!;
          const cx = pieceX[p2]! - pieceX[p0]!;
          const cy = pieceY[p2]! - pieceY[p0]!;
          // A hair over each way, so no seam shows the sheetPaper underneath.
          const grow = 0.7 / Math.max(1, Math.min(Math.hypot(ax, ay), Math.hypot(cx, cy)));
          baseCtx.setTransform(ax * m.ratio, ay * m.ratio, cx * m.ratio, cy * m.ratio, pieceX[p0]! * m.ratio, pieceY[p0]! * m.ratio);
          baseCtx.drawImage(tileSource.image, tileSource.sx + a * part, tileSource.sy + b * part, part, part, -grow / 2, -grow / 2, 1 + grow, 1 + grow);
        }
      }
      drew++;
    }
  }
  baseCtx.setTransform(m.ratio, 0, 0, m.ratio, 0, 0);
  want.sort((p, q) => p.d - q.d);
  sheetPaper.want('minimap', want.map((entry) => entry.tile), true);
  m.tileVersion = sheetPaper.version;
  m.drawnTiles = drew;
  return drew > 0;
}
