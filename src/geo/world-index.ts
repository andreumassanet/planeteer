// The lookup structures behind `countryAt`: a grid of rings, the lakes' bites
// out of the rings they reach into, and the smallest-containing-ring walk.

import type { LandRing } from '../geo.ts';
import type { RingBands } from './rings.ts';
import { bandIndex, insideBands, insideRing } from './rings.ts';

/** Degrees per cell of the lookup grid. */
const CELL = 2.5;
const COLS = Math.round(360 / CELL);
const ROWS = Math.round(180 / CELL);

/** A ring's bounding box: `[minLon, minLat, maxLon, maxLat]`. */
export type Bounds = [number, number, number, number];

export function boundsOf(points: number[][]): Bounds {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of points) {
    minLon = Math.min(minLon, p[0]!);
    maxLon = Math.max(maxLon, p[0]!);
    minLat = Math.min(minLat, p[1]!);
    maxLat = Math.max(maxLat, p[1]!);
  }
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Each cell holds the rings whose bounding box touches it, smallest first, so
 * the first ring that contains a point is the answer. (Smallest wins between
 * rings because Natural Earth's Morocco covers Western Sahara outright and the
 * bake keeps only outer rings, so every enclave sits under its neighbour.)
 */
export function buildGrid(rings: readonly LandRing[], bounds: readonly Bounds[]): number[][] {
  const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  bounds.forEach(([minLon, minLat, maxLon, maxLat], i) => {
    const c0 = Math.max(0, Math.floor((minLon + 180) / CELL));
    const c1 = Math.min(COLS - 1, Math.floor((maxLon + 180) / CELL));
    const r0 = Math.max(0, Math.floor((90 - maxLat) / CELL));
    const r1 = Math.min(ROWS - 1, Math.floor((90 - minLat) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) grid[r * COLS + c]!.push(i);
    }
  });
  for (const cell of grid) cell.sort((a, b) => rings[a]!.area - rings[b]!.area);
  return grid;
}

/** The point-in-polygon test for ring `i`, over only the edges that can cross the ray. */
export type InsideRing = (i: number, lon: number, y: number) => boolean;

/**
 * `insideRing` over each ring's latitude bands. A big country is thousands of
 * edges and the ray crosses a handful; the band test runs the same comparison on
 * the same two ends in the same order over a superset of the edges that can
 * toggle the point, so the answer is the same bit, not an approximation.
 */
export function createInside(rings: readonly LandRing[], bounds: readonly Bounds[]): InsideRing {
  const bands: (RingBands | null)[] = rings.map((ring, i) => bandIndex(ring.points, bounds[i]![1], bounds[i]![3]));
  return (i, lon, y) => {
    const band = bands[i]!;
    return band === null ? insideRing(rings[i]!.points, lon, y) : insideBands(band, lon, y);
  };
}

/**
 * Smallest wins between two land rings, but not between land and a lake: an area
 * says nothing about which is drawn on top (Burundi's ring is smaller than Lake
 * Tanganyika's, yet its border is drawn across the water). The mesh cuts a lake
 * out of every ring its outline reaches into, so this asks the same question:
 * `bitten[i]` lists the lakes that have taken water from ring `i`, found once per
 * pair at load. A ring the lake's outline does not reach into is an island in it
 * and still wins; only a lake larger than the ring can need saying.
 */
export function findBitten(rings: readonly LandRing[], bounds: readonly Bounds[], inside: InsideRing): number[][] {
  const bitten: number[][] = rings.map(() => []);
  rings.forEach((lake, w) => {
    if (!lake.water) return;
    const [lakeMinLon, lakeMinLat, lakeMaxLon, lakeMaxLat] = bounds[w]!;
    rings.forEach((ring, i) => {
      if (ring.water || ring.area >= lake.area) return;
      const [minLon, minLat, maxLon, maxLat] = bounds[i]!;
      if (minLon > lakeMaxLon || maxLon < lakeMinLon || minLat > lakeMaxLat || maxLat < lakeMinLat) return;
      const reaches = lake.points.some(([lon, lat]) => {
        const y = Math.min(89.999, Math.max(-89.999, lat!));
        return lon! >= minLon && lon! <= maxLon && y >= minLat && y <= maxLat &&
          inside(i, lon!, y);
      });
      if (reaches) bitten[i]!.push(w);
    });
  });
  return bitten;
}

/**
 * The smallest ring containing a point, or null — except against a lake that
 * reaches into the ring, which wins over it whatever the areas say.
 */
export function createResolver(
  rings: readonly LandRing[],
  bounds: readonly Bounds[],
  grid: readonly number[][],
  bitten: readonly number[][],
  inside: InsideRing,
): (lat: number, lon: number) => LandRing | null {
  return (lat, lon) => {
    // A NaN passes every clamp below and indexes no cell: say so, rather than
    // fail on the grid or answer for a place that is nowhere.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new RangeError(`countryAt: no position (${lat}, ${lon})`);
    // Exactly +/-90 is degenerate for ray casting: the polar edge of the
    // Antarctic ring lies on that latitude, so no segment ever straddles it.
    const y = Math.min(89.999, Math.max(-89.999, lat));
    const col = Math.min(COLS - 1, Math.max(0, Math.floor((lon + 180) / CELL)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - y) / CELL)));

    for (const i of grid[row * COLS + col]!) {
      const [minLon, minLat, maxLon, maxLat] = bounds[i]!;
      if (lon < minLon || lon > maxLon || y < minLat || y > maxLat) continue;
      if (!inside(i, lon, y)) continue;
      // A lake this ring lost water to, and the point is in the water it lost.
      for (const w of bitten[i]!) {
        const [wMinLon, wMinLat, wMaxLon, wMaxLat] = bounds[w]!;
        if (lon < wMinLon || lon > wMaxLon || y < wMinLat || y > wMaxLat) continue;
        if (inside(w, lon, y)) return rings[w]!;
      }
      return rings[i]!;
    }
    return null;
  };
}
