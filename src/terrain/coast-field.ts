// Distance to the nearest water on a half-degree grid: how far inland a point
// is, which fades the mountains out at the coast and keeps small islands flat.
// It is a land/sea mask, not the country index: each cell centre is tested with
// the exact even-odd rule `countryAt` uses, a scan line at a time.

import type { LandRing } from '../geo.ts';
import { COAST_CELL, COAST_COLS, COAST_ROWS, DEG } from './constants.ts';
import { clamp } from './noise.ts';

/** Distance to the nearest water of any kind, the sea and the lakes alike. */
let coastDistance: Float32Array | null = null;
/**
 * The same field with the lakes left in the land. It is a different question,
 * not a cheaper one: continentality is distance from the ocean, and a lake is
 * not an ocean however wet. Sharing one field moves the climate of whole
 * continents (Iowa and the Sahel read as coastal).
 */
let oceanField: Float32Array | null = null;

function buildCoastField(rings: LandRing[], lakesCount: boolean): Float32Array {
  const land = new Uint8Array(COAST_COLS * COAST_ROWS);

  // Land first, then the lakes cleared out of it: a lake overlaps the country it
  // sits in, so one even-odd pass over both would cancel them. `lakesCount` is
  // false for the ocean field, where a lake is land.
  const dry = rings.filter((ring) => !ring.water);
  const ordered = lakesCount ? dry.concat(rings.filter((ring) => ring.water)) : dry;

  for (const ring of ordered) {
    const fill = ring.water ? 0 : 1;
    const points = ring.points;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const p of points) {
      if (p[1]! < minLat) minLat = p[1]!;
      if (p[1]! > maxLat) maxLat = p[1]!;
    }
    const row0 = Math.max(0, Math.floor((90 - maxLat) / COAST_CELL));
    const row1 = Math.min(COAST_ROWS - 1, Math.ceil((90 - minLat) / COAST_CELL));
    if (row1 < row0) continue;

    // Crossings of this ring with each scan line it spans, per ring because the
    // bake keeps only outer rings (Lesotho sits inside South Africa's polygon).
    const crossings: number[][] = [];
    for (let r = row0; r <= row1; r++) crossings.push([]);
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i]!;
      const b = points[j]!;
      const ya = a[1]!;
      const yb = b[1]!;
      const lo = Math.min(ya, yb);
      const hi = Math.max(ya, yb);
      let r = Math.max(row0, Math.floor((90 - hi) / COAST_CELL));
      const rEnd = Math.min(row1, Math.ceil((90 - lo) / COAST_CELL));
      for (; r <= rEnd; r++) {
        const y = 90 - (r + 0.5) * COAST_CELL;
        if (ya > y === yb > y) continue;
        crossings[r - row0]!.push(((b[0]! - a[0]!) * (y - ya)) / (yb - ya) + a[0]!);
      }
    }
    for (let r = row0; r <= row1; r++) {
      const xs = crossings[r - row0]!;
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k]! + 180) / COAST_CELL - 0.5));
        const c1 = Math.min(COAST_COLS - 1, Math.floor((xs[k + 1]! + 180) / COAST_CELL - 0.5));
        for (let c = c0; c <= c1; c++) land[r * COAST_COLS + c] = fill;
      }
    }

    // A lake smaller than a cell has to clear one anyway, or it has no shore: the
    // scan line fills a cell only if its centre is inside the ring. So every cell
    // the outline passes through is cleared too, which over-reaches by up to a
    // cell: too much shore is a beach, too little is a cliff.
    if (ring.water) {
      for (const p of points) {
        const c = Math.floor((p[0]! + 180) / COAST_CELL);
        const r = Math.floor((90 - p[1]!) / COAST_CELL);
        if (r < 0 || r >= COAST_ROWS) continue;
        land[r * COAST_COLS + (((c % COAST_COLS) + COAST_COLS) % COAST_COLS)] = 0;
      }
    }
  }

  // Chamfer distance transform: land cells take the distance to the nearest sea
  // cell. The step costs are the real angular size of a cell, so a degree of
  // longitude counts for less near the poles, where it is worth less.
  const distance = new Float32Array(COAST_COLS * COAST_ROWS);
  for (let i = 0; i < distance.length; i++) distance[i] = land[i] ? Infinity : 0;

  const stepX = new Float64Array(COAST_ROWS);
  for (let r = 0; r < COAST_ROWS; r++) {
    stepX[r] = COAST_CELL * Math.cos((90 - (r + 0.5) * COAST_CELL) * DEG);
  }
  const relax = (r: number, c: number, from: number, cost: number): void => {
    const value = distance[from]! + cost;
    const at = r * COAST_COLS + c;
    if (value < distance[at]!) distance[at] = value;
  };
  // Two rounds rather than one: longitude wraps, so a single sweep cannot carry
  // a distance all the way round the planet.
  for (let round = 0; round < 2; round++) {
    for (let r = 0; r < COAST_ROWS; r++) {
      const dx = stepX[r]!;
      const diagonal = Math.hypot(dx, COAST_CELL);
      for (let c = 0; c < COAST_COLS; c++) {
        const west = (c + COAST_COLS - 1) % COAST_COLS;
        const east = (c + 1) % COAST_COLS;
        relax(r, c, r * COAST_COLS + west, dx);
        if (r > 0) {
          relax(r, c, (r - 1) * COAST_COLS + c, COAST_CELL);
          relax(r, c, (r - 1) * COAST_COLS + west, diagonal);
          relax(r, c, (r - 1) * COAST_COLS + east, diagonal);
        }
      }
    }
    for (let r = COAST_ROWS - 1; r >= 0; r--) {
      const dx = stepX[r]!;
      const diagonal = Math.hypot(dx, COAST_CELL);
      for (let c = COAST_COLS - 1; c >= 0; c--) {
        const west = (c + COAST_COLS - 1) % COAST_COLS;
        const east = (c + 1) % COAST_COLS;
        relax(r, c, r * COAST_COLS + east, dx);
        if (r < COAST_ROWS - 1) {
          relax(r, c, (r + 1) * COAST_COLS + c, COAST_CELL);
          relax(r, c, (r + 1) * COAST_COLS + east, diagonal);
          relax(r, c, (r + 1) * COAST_COLS + west, diagonal);
        }
      }
    }
  }
  return distance;
}

/** Builds both coast fields for these rings. */
export function buildCoastFields(rings: LandRing[]): void {
  coastDistance = buildCoastField(rings, true);
  // With no inland water the two are the same array, not two copies.
  oceanField = rings.some((ring) => ring.water) ? buildCoastField(rings, false) : coastDistance;
}

/** Whether `buildCoastFields` has run. */
export function coastFieldsReady(): boolean {
  return coastDistance !== null;
}

/**
 * Bilinear sample of the coast field, in degrees to the nearest water of any
 * kind. Requires `prepareTerrain`, like everything else here.
 */
export function shoreDistance(lat: number, lon: number): number {
  return sampleCoast(coastDistance, lat, lon);
}

/** The same sample against the ocean alone, which is what continentality is (`biome.ts`). */
export function oceanDistance(lat: number, lon: number): number {
  return sampleCoast(oceanField, lat, lon);
}

function sampleCoast(field: Float32Array | null, lat: number, lon: number): number {
  if (field === null) {
    throw new Error('terrain: prepareTerrain(rings) has to run before reliefAt');
  }
  const cf = (lon + 180) / COAST_CELL - 0.5;
  const rf = clamp((90 - lat) / COAST_CELL - 0.5, 0, COAST_ROWS - 1);
  const c0 = Math.floor(cf);
  const r0 = Math.floor(rf);
  const tx = cf - c0;
  const ty = rf - r0;
  const ca = ((c0 % COAST_COLS) + COAST_COLS) % COAST_COLS;
  const cb = (ca + 1) % COAST_COLS;
  const ra = clamp(r0, 0, COAST_ROWS - 1);
  const rb = clamp(r0 + 1, 0, COAST_ROWS - 1);
  const top = field[ra * COAST_COLS + ca]! + (field[ra * COAST_COLS + cb]! - field[ra * COAST_COLS + ca]!) * tx;
  const bottom = field[rb * COAST_COLS + ca]! + (field[rb * COAST_COLS + cb]! - field[rb * COAST_COLS + ca]!) * tx;
  return top + (bottom - top) * ty;
}
