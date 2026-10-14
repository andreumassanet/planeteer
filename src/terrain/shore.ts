// The shore ramp: how far the shelf has fallen towards the water at a point.
//
// The coarse half-degree field is wider than the whole ramp, so the shoreline
// is also indexed from the outlines directly: every boundary segment with the
// sea on its far side, bucketed by lat/lon, and a query is the exact distance to
// the nearest. The coarse field rejects everything more than a ramp from the
// water before the index is touched, which is nearly the whole planet.
//
// A ring boundary is not a coastline: the rings are country outlines, so
// France's runs along the Rhine as well as the Atlantic. The sea is asked
// about explicitly: land is on the right of `a -> b`, so `cross(up, b - a)` steps
// off the outward side, and a segment is a shore only when that lands in water.

import type { LandRing } from '../geo.ts';
import { latOf, lonOf, toUnit } from '../sphere.ts';
import {
  COAST_CELL,
  DEG,
  MASSIF_FLOOR,
  NOISE_RANGE_HEIGHT,
  SHORE_BAY_FREQUENCY,
  SHORE_BLUFF,
  SHORE_PROBE,
  SHORE_RAMP,
  SWELL_FREQUENCY,
  SWELL_HEIGHT,
} from './constants.ts';
import { shoreDistance } from './coast-field.ts';
import { clamp, fbm, smoothstep } from './noise.ts';
import { ensureQueries } from './queries.ts';
import { rangeHeight } from './ranges.ts';
import { scale } from './scale.ts';

let shoreAx: Float64Array | null = null;
let shoreBx: Float64Array | null = null;
let shoreHead: Int32Array | null = null;
let shoreNext: Int32Array | null = null;
let shoreItem: Int32Array | null = null;
let shoreCols = 0;
let shoreRows = 0;
let shoreCell = 0;
/** Beyond this many degrees from the coarse shore, nothing can be on a ramp. */
let shoreGate = 0;

export function buildShoreIndex(rings: LandRing[], isLand: (lat: number, lon: number) => boolean): void {
  const unitsPerDegree = scale.unitsPerRadian * DEG;
  // One cell per ramp, so a query reads a 3x3 neighbourhood at the equator. The
  // column count is even so rows divide it exactly and cells are square in
  // degrees, which lets one number index both axes.
  shoreCols = Math.max(4, 2 * Math.round(180 / (SHORE_RAMP / unitsPerDegree)));
  shoreRows = shoreCols / 2;
  shoreCell = 360 / shoreCols;
  // The ramp plus a coarse cell for the error of the bilinear half-degree
  // sample. Past that nothing can be on a ramp.
  shoreGate = SHORE_RAMP / unitsPerDegree + COAST_CELL;

  const ax: number[] = [];
  const bx: number[] = [];
  for (const ring of rings) {
    const points = ring.points;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      const alat = a[1]!;
      const blat = b[1]!;
      const mlat = (alat + blat) * 0.5;
      const cos = Math.max(0.02, Math.cos(mlat * DEG));
      let tx = (b[0]! - a[0]!) * cos;
      let ty = blat - alat;
      const length = Math.hypot(tx, ty);
      if (length === 0) continue;
      tx /= length;
      ty /= length;
      // `cross(up, b - a)` in an east/north frame is `(-north, +east)`, the same
      // sign the land mesh builds its cliffs with. Backwards, this indexes the
      // borders and misses the coasts.
      const step = SHORE_PROBE / unitsPerDegree;
      const olat = mlat + tx * step;
      const olon = (a[0]! + b[0]!) * 0.5 + (-ty * step) / cos;
      if (isLand(olat, olon)) continue;
      toUnit(alat, a[0]!, ax, ax.length);
      toUnit(blat, b[0]!, bx, bx.length);
    }
  }

  shoreAx = Float64Array.from(ax);
  shoreBx = Float64Array.from(bx);

  const head = new Int32Array(shoreCols * shoreRows).fill(-1);
  const item: number[] = [];
  const next: number[] = [];
  const count = ax.length / 3;
  // A segment lands in every cell of its own bounding box. Segments are 20 units
  // long at the median against a 130-unit cell, so that is nearly always one.
  for (let sIndex = 0; sIndex < count; sIndex++) {
    const alat = latOf(shoreAx[sIndex * 3 + 1]!);
    const blat = latOf(shoreBx[sIndex * 3 + 1]!);
    const alon = lonOf(shoreAx[sIndex * 3]!, shoreAx[sIndex * 3 + 2]!);
    const blon = lonOf(shoreBx[sIndex * 3]!, shoreBx[sIndex * 3 + 2]!);
    const r0 = clamp(Math.floor((90 - Math.max(alat, blat)) / shoreCell), 0, shoreRows - 1);
    const r1 = clamp(Math.floor((90 - Math.min(alat, blat)) / shoreCell), 0, shoreRows - 1);
    const c0 = Math.floor((Math.min(alon, blon) + 180) / shoreCell);
    const c1 = Math.floor((Math.max(alon, blon) + 180) / shoreCell);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = r * shoreCols + (((c % shoreCols) + shoreCols) % shoreCols);
        item.push(sIndex);
        next.push(head[cell]!);
        head[cell] = item.length - 1;
      }
    }
  }
  shoreHead = head;
  shoreItem = Int32Array.from(item);
  shoreNext = Int32Array.from(next);
}

/**
 * Distance to the nearest shoreline, world units, or `Infinity` past the ramp.
 * Closest point on the chord rather than the arc: over a segment tens of units
 * long the two differ in the eighth decimal.
 */
function nearestShore(x: number, y: number, z: number, lat: number, lon: number): number {
  const head = shoreHead;
  const a = shoreAx;
  const b = shoreBx;
  const item = shoreItem;
  const next = shoreNext;
  if (head === null || a === null || b === null || item === null || next === null) return Infinity;

  const reach = SHORE_RAMP / (scale.unitsPerRadian * DEG);  const row = clamp(Math.floor((90 - lat) / shoreCell), 0, shoreRows - 1);
  const rowSpan = Math.ceil(reach / shoreCell);
  // A degree of longitude is worth `cos(lat)` of one of latitude, so the same
  // reach is more columns the further north it is asked.
  const colReach = reach / Math.max(1e-3, Math.cos(lat * DEG));
  const colSpan = colReach >= 180 ? shoreCols : Math.ceil(colReach / shoreCell);
  const wide = colSpan * 2 + 1 >= shoreCols;

  const col = Math.floor((lon + 180) / shoreCell);
  /** Squared chord to the nearest segment in one cell, folded into `best`. */
  let best = Infinity;
  const scan = (r: number, c: number): void => {
    let entry = head[r * shoreCols + (((c % shoreCols) + shoreCols) % shoreCols)]!;
    while (entry >= 0) {
      const s = item[entry]! * 3;
      const px = a[s]!, py = a[s + 1]!, pz = a[s + 2]!;
      const ex = b[s]! - px, ey = b[s + 1]! - py, ez = b[s + 2]! - pz;
      const span = ex * ex + ey * ey + ez * ez;
      const t = span > 0 ? clamp(((x - px) * ex + (y - py) * ey + (z - pz) * ez) / span, 0, 1) : 0;
      const dx = x - (px + ex * t);
      const dy = y - (py + ey * t);
      const dz = z - (pz + ez * t);
      const chord = dx * dx + dy * dy + dz * dz;
      if (chord < best) best = chord;
      entry = next[entry]!;
    }
  };

  // The point's own cell first, then whether the rest of the neighbourhood can
  // hold anything nearer: nothing outside this cell is closer than the point's
  // distance to the cell's wall. On a coast that usually turns a nine-cell sweep
  // into one, and this runs once per mesh vertex.
  scan(row, col);
  if (best < Infinity) {
    const north = 90 - row * shoreCell;
    const west = -180 + col * shoreCell;
    const margin = Math.min(
      north - lat,
      lat - (north - shoreCell),
      (lon - west) * Math.cos(lat * DEG),
      (west + shoreCell - lon) * Math.cos(lat * DEG),
    ) * DEG;
    if (margin > 0 && best <= 4 * Math.sin(margin * 0.5) * Math.sin(margin * 0.5)) {
      return 2 * Math.asin(Math.min(1, Math.sqrt(best) / 2)) * scale.unitsPerRadian;
    }
  }

  const r0 = Math.max(0, row - rowSpan);
  const r1 = Math.min(shoreRows - 1, row + rowSpan);
  for (let r = r0; r <= r1; r++) {
    const c0 = wide ? 0 : col - colSpan;
    const c1 = wide ? shoreCols - 1 : col + colSpan;
    for (let c = c0; c <= c1; c++) {
      if (r === row && c === col) continue;
      scan(r, c);
    }
  }
  if (best === Infinity) return Infinity;
  return 2 * Math.asin(Math.min(1, Math.sqrt(best) / 2)) * scale.unitsPerRadian;
}

/**
 * How wide the shore is here, world units. Mountains reaching the sea narrow it
 * (Norway, Chile, British Columbia) and a slow noise of bays widens it in
 * stretches. It is a smooth field of the point, not of the nearest segment, so
 * the width does not jump along a coast.
 */
let shoreRocky = 0;

function shoreWidthAt(x: number, y: number, z: number): number {
  // The hinterland: the swell and ridges with the shore fade left off, which is
  // what makes every coast read as flat when asked directly.
  const swelling = fbm(x * SWELL_FREQUENCY, y * SWELL_FREQUENCY, z * SWELL_FREQUENCY, 4);
  const amplitude = Math.max(
    NOISE_RANGE_HEIGHT * smoothstep(0.55, 0.80, swelling),
    rangeHeight(x, y, z),
  );
  // `MASSIF_FLOOR` of the amplitude stands in for the ridged noise: the massif
  // is there whatever the ridges do, and the ridges are five more octaves for a
  // threshold.
  shoreRocky = smoothstep(25, 70, SWELL_HEIGHT * swelling + amplitude * MASSIF_FLOOR);

  const bays = smoothstep(
    0.30,
    0.70,
    fbm(x * SHORE_BAY_FREQUENCY, y * SHORE_BAY_FREQUENCY, z * SHORE_BAY_FREQUENCY, 2),
  );
  return SHORE_BLUFF + (SHORE_RAMP - SHORE_BLUFF) * (1 - shoreRocky) * bays;
}

/** The shore at a point: how far the shelf has fallen, and how sandy it is. */
export interface ShoreSample {
  /** How far the shelf has fallen towards the water: 0 inland, 1 at the edge. */
  fall: number;
  /** How much of this shore is loose ground rather than rock, 0 to 1 (the hinterland turned round). */
  sand: number;
}

export function shoreSample(): ShoreSample {
  return { fall: 0, sand: 0 };
}

/** Fills `target` with the shore at a point on the unit sphere. */
export function shoreAt(x: number, y: number, z: number, target: ShoreSample): ShoreSample {
  ensureQueries();
  const lat = latOf(y);
  const lon = lonOf(x, z);
  shoreRocky = 0;
  target.fall = shoreFall(x, y, z, lat, lon, shoreDistance(lat, lon) - COAST_CELL * 0.5);
  target.sand = target.fall > 0 ? 1 - shoreRocky : 0;
  return target;
}

export function shoreFall(
  x: number,
  y: number,
  z: number,
  lat: number,
  lon: number,
  coarse: number,
): number {
  if (shoreHead === null || coarse > shoreGate) return 0;
  const distance = nearestShore(x, y, z, lat, lon);
  if (!(distance < SHORE_RAMP)) return 0;
  const width = shoreWidthAt(x, y, z);
  if (distance >= width) return 0;
  // Linear: a smoothstep curves across the band and the mesh refines against
  // curvature, so it would pay triangles over the whole width. A straight ramp is
  // two creases with a plane between them, and the pen inks the break of slope
  // at the top of a beach like a berm.
  return 1 - distance / width;
}
