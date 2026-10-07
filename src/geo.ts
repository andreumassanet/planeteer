import type { Vector3 } from 'three';
import { DATA_URL, decodeCountries, decodeLakes, inflate } from './pack.ts';
import { prepareTerrain, reliefAt } from './terrain.ts';
import { latLonOf } from './sphere.ts';

export interface Country {
  iso: string;
  name: string;
  continent: string;
  lon: number;
  lat: number;
  rings: number[][][];
  /**
   * The flat colour this country is painted in on the maps, where it is not
   * Earth's: another world's nations carry their own (`Nation.color`, a
   * `PALETTE` entry) because there is no flag to read one off. Earth's
   * countries leave it out and the maps keep their own rule.
   */
  color?: number;
}

/** Degrees per cell of the lookup grid. */
const CELL = 2.5;
const COLS = Math.round(360 / CELL);
const ROWS = Math.round(180 / CELL);

/**
 * One outer ring of one country, indexed for lookup and shared with the mesh
 * builder. The land you see and the land `countryAt` reports are built from
 * this same array, which is what makes placing a monument on a coast exact
 * rather than approximate.
 */
export interface LandRing {
  /** 1-based index into `countries`, or 0 for a lake, which belongs to nobody. */
  country: number;
  /**
   * `[lon, lat]` pairs, implicitly closed.
   *
   * Wound by the bake so that **the land is always on the right of `a -> b`**,
   * which for a country ring is clockwise and for a lake is the other way
   * round. That one sign is what `globe.ts` builds its walls from, what
   * `terrain.ts` indexes its shores by and what `ocean.ts` lays its surf along,
   * so a lake needs no second rule anywhere — see `build-lakes.mjs`.
   */
  points: number[][];
  /** Shoelace area in square degrees. Used to break overlaps; see `countryAt`. */
  area: number;
  /** How far this ring's land stands above sea level, in world units. */
  height: number;
  /**
   * True for a lake: a ring the world reads as water rather than as land.
   *
   * **It is not a fourth kind of thing, it is the sea in a smaller shape.**
   * `countryAt` answers 0 inside one and `elevationAt` answers 0, which is
   * exactly what they answer over the Atlantic — so `groundRadius` comes back at
   * `PLANET_RADIUS`, `vehicles.ts`'s `isWater` says yes, and walking into Lake
   * Geneva puts you in the boat with **not one line changed** in `player.ts` or
   * `vehicles.ts`. The price of that is written down where it is paid: every
   * lake on this planet is at sea level, so Titicaca is not 3,812 m up.
   */
  water: boolean;
}

/**
 * The shelf every ring stands on, in world units. The player was about 6.5 units
 * tall when this was set, so the land sat three of him above the sea; it is
 * about five of a 3.77-unit person since 2026-09-24 — which is the point of
 * building it as real geometry instead of pushing icosphere vertices outward:
 * `OutlineEffect` draws that silhouette as a hard black line.
 *
 * It used to be capped by the length of an icosphere triangle edge, or the
 * coast came out as saw teeth. That constraint is gone with the polygons.
 *
 * It is no longer the height of a *cliff*: `terrain.ts`'s shore ramp gives all
 * but `SHORE_LIP` of it back over the last hundred units before the water, so
 * this is how high the shelf stands inland and not how far the coast drops.
 * `terrain.ts` carries the same number as `LAND_SHELF` — it cannot import this
 * file, since this one imports it — and `pnpm check` asserts the two agree by
 * measuring the lowest ground on the finished mesh.
 */
export const LAND_HEIGHT = 20;

/**
 * Every ring stands on the same shelf, and it used to be a table.
 *
 * `heightForArea` gave a small island a proportionally lower one — `radius *
 * 0.5`, capped at `LAND_HEIGHT` — because a 30-unit island with the full
 * continental cliff is a tower rather than an island. That was the right
 * observation and the wrong measurement: it asked how big the ring is, when what
 * makes an island low is how close all of it is to the water. `terrain.ts`'s
 * shore ramp asks exactly that and asks it per point, so a small island is low
 * because every part of it is on a shore, a barrier spit is low along its whole
 * two thousand units, and Ireland is only low round its edge. One law where
 * there were two, and the one that is left is the one you can see.
 *
 * What the constant still has to be is the same number `terrain.ts` builds its
 * ramp against; `pnpm check` asserts it.
 */

export interface World {
  countries: Country[];
  /** Every outer ring, shared with the mesh builder. */
  rings: LandRing[];
  /** Country index (1-based) at some coordinates. 0 means ocean. */
  countryAt(lat: number, lon: number): number;
  /** Country index under a world-space point, relative to the planet centre. */
  countryAtPoint(point: Vector3): number;
  /**
   * Height of the land above sea level under a point. 0 over water. This is
   * where the player's feet go, and `globe.ts` builds the mesh from the same
   * two terms, so the two cannot disagree.
   */
  elevationAt(point: Vector3): number;
}

/** Latitude and longitude of a point of any length: `sphere.ts`'s `latLonOf`. */
export function toLatLon(point: { x: number; y: number; z: number }): { lat: number; lon: number } {
  return latLonOf(point);
}

/** Shoelace area of a ring, in square degrees. Sign discarded. */
function ringArea(points: number[][]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    sum += (b[0]! - a[0]!) * (b[1]! + a[1]!);
  }
  return Math.abs(sum / 2);
}

/**
 * Even-odd ray casting. The classic, and here it is exact.
 *
 * Exported because `map.ts` asks the same question of one ring at a time — is
 * my antipode inside this country — and a second copy of a point-in-polygon
 * test is exactly the kind of thing this project keeps writing down as a trap.
 * `x` is longitude and `y` latitude, and the caller clamps latitude the way
 * `resolve` does.
 */
export function insideRing(points: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    const yi = a[1]!;
    const yj = b[1]!;
    if (yi > y !== yj > y && x < ((b[0]! - a[0]!) * (y - yi)) / (yj - yi) + a[0]!) {
      inside = !inside;
    }
  }
  return inside;
}

/** A ring's edges bucketed by latitude, for `loadWorld`'s point-in-polygon test. */
export interface RingBands {
  /** The ring's points, longitude and latitude, as flat arrays. */
  xs: Float64Array;
  ys: Float64Array;
  /** Where band `k`'s edges start in `edges`; one longer than the bands. */
  start: Uint32Array;
  /** Per band, the edges whose latitude span reaches it, by their first point's index. */
  edges: Uint32Array;
  low: number;
  step: number;
}

/** Rings shorter than this are walked whole: the index would cost more than it saves. */
const BANDED_POINTS = 48;
/** About how many edges a band holds, on average, of a ring's whole length. */
const EDGES_PER_BAND = 6;

/**
 * Buckets a ring's edges by the latitude bands their span reaches. Edge `a`
 * runs from point `a` to the point before it, the pairing `insideRing`
 * walks. An edge that can toggle the ray at `y` has `min <= y < max`, and
 * `floor((y - low) / step)` is monotone in `y`, so its band is between the
 * bands of its two ends — which is where it is filed.
 */
export function bandIndex(points: number[][], minLat: number, maxLat: number): RingBands | null {
  const n = points.length;
  if (n < BANDED_POINTS) return null;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i]![0]!;
    ys[i] = points[i]![1]!;
  }
  const count = Math.max(1, Math.ceil(n / EDGES_PER_BAND));
  const low = minLat;
  const step = Math.max(1e-9, (maxLat - minLat) / count);
  const bandOf = (y: number): number => Math.min(count - 1, Math.max(0, Math.floor((y - low) / step)));
  const start = new Uint32Array(count + 1);
  for (let a = 0; a < n; a++) {
    const b = a === 0 ? n - 1 : a - 1;
    const k0 = bandOf(Math.min(ys[a]!, ys[b]!));
    const k1 = bandOf(Math.max(ys[a]!, ys[b]!));
    for (let k = k0; k <= k1; k++) start[k + 1]!++;
  }
  for (let k = 0; k < count; k++) start[k + 1]! += start[k]!;
  const edges = new Uint32Array(start[count]!);
  const cursor = start.slice(0, count);
  for (let a = 0; a < n; a++) {
    const b = a === 0 ? n - 1 : a - 1;
    const k0 = bandOf(Math.min(ys[a]!, ys[b]!));
    const k1 = bandOf(Math.max(ys[a]!, ys[b]!));
    for (let k = k0; k <= k1; k++) edges[cursor[k]!++] = a;
  }
  return { xs, ys, start, edges, low, step };
}

/** `insideRing` over a ring's `bandIndex`: the same answer, from the point's band alone. */
export function insideBands(band: RingBands, lon: number, y: number): boolean {
  const { xs, ys, start, edges, low, step } = band;
  const last = start.length - 2;
  const k = Math.min(last, Math.max(0, Math.floor((y - low) / step)));
  const n = xs.length;
  let result = false;
  for (let e = start[k]!; e < start[k + 1]!; e++) {
    const a = edges[e]!;
    const b = a === 0 ? n - 1 : a - 1;
    const yi = ys[a]!;
    const yj = ys[b]!;
    if (yi > y !== yj > y && lon < ((xs[b]! - xs[a]!) * (y - yi)) / (yj - yi) + xs[a]!) result = !result;
  }
  return result;
}

/**
 * The outlines, off the wire.
 *
 * **It is 168 KB and it used to be 456**, and nothing about the data changed:
 * `countries.json` spent fourteen characters on `[66.52,37.35]` to carry a step
 * along a coastline, and `src/pack.ts` spends two. On its own because a caller
 * may want the country list without the planet, and a second `fetch` of a
 * format that is no longer self-describing is a second place to get it wrong.
 */
export async function loadCountries(url = `${DATA_URL}countries.bin`): Promise<Country[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodeCountries(await inflate(await response.arrayBuffer()));
}

/**
 * The inland water, off the wire: 26 rings, 7.8 KB gzipped (2026-09-21; it was
 * 410 rings and 36 KB before `build-lakes.mjs` kept only what the mesh can pay
 * for).
 *
 * Separate from `loadWorld` and handed *in* to it, rather than fetched inside
 * it, for the reason `main.ts` writes down about the other four files:
 * "install in order" and "fetch in order" are different sentences. Nothing
 * about the lakes depends on the outlines, so awaiting one after the other
 * would spend a whole round trip on a bad link for no reason — and making the
 * parameter required rather than optional is what stops a caller quietly
 * getting a planet with no lakes on it.
 */
export async function loadLakes(url = `${DATA_URL}lakes.bin`): Promise<number[][][]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodeLakes(await inflate(await response.arrayBuffer()));
}

/**
 * Loads the outlines and builds a spatial index.
 *
 * This used to rasterise into a canvas and read pixels back. Shorter, and
 * wrong: `fill()` antialiases, and since the country index was encoded in the
 * colour, every coastal pixel came back blended with its neighbour and resolved
 * to some arbitrary country. New York reported "China". Coastlines are exactly
 * where the cities and monuments are, so the error always landed where it hurt
 * most.
 */
export async function loadWorld(
  unitsPerDegree: number,
  lakes: readonly number[][][],
  url = `${DATA_URL}countries.bin`,
): Promise<World> {
  return worldFromCountries(await loadCountries(url), lakes, unitsPerDegree);
}

/**
 * What a world other than Earth hands in instead of Earth's ground.
 *
 * `worldFromCountries` is Earth's by default: it prepares `terrain.ts`'s coast
 * fields from the rings and answers `elevationAt` with the shelf plus
 * `reliefAt`. Both are Earth's module state and Earth's relief, so another
 * body's outlines must not touch them — preparing the terrain from Martian
 * rings would rebuild Earth's shore index round Tharsis.
 */
export interface WorldGround {
  /** Height of the ground over the datum under a point, as `World.elevationAt` answers it. */
  elevationAt(point: Vector3): number;
}

/**
 * The index half of `loadWorld`: rings, the lookup grid, the banded
 * point-in-polygon, the lakes' bites — everything but the fetch.
 *
 * Factored out so a body whose outlines are computed rather than baked
 * (`src/system/geography.ts`) answers `countryAt` with **the same code**, and
 * not with a second copy of the smallest-ring rule. With no `ground` it is
 * exactly what `loadWorld` always did, terrain preparation included.
 */
export function worldFromCountries(
  countries: Country[],
  lakes: readonly number[][][],
  unitsPerDegree: number,
  ground: WorldGround | null = null,
): World {
  const rings: LandRing[] = [];
  const bounds: number[][] = [];
  const add = (points: number[][], country: number, water: boolean): void => {
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
    rings.push({ country, points, area: ringArea(points), height: LAND_HEIGHT, water });
    bounds.push([minLon, minLat, maxLon, maxLat]);
  };
  countries.forEach((country, index) => {
    for (const points of country.rings) add(points, index + 1, false);
  });
  // The lakes go into the same list, and that is the whole of the change. They
  // are indexed by the same grid, resolved by the same smallest-ring rule and
  // handed to `terrain.ts` in the same array, so the shore index, the coast
  // field and the wall's own sign all reach them without being told they exist.
  for (const points of lakes) add(points, 0, true);

  // Neither the antimeridian nor the pole needs a special case any more, and
  // both used to have one.
  //
  // At 1:110m, Antarctica arrived as a single ring that encircled the pole and
  // never closed, so lon/lat ray casting did not apply and we kept a table of
  // how far north the coast reached at each longitude. That table filled in the
  // Ross and Weddell seas as land. At 1:10m the ring is closed and reaches
  // lat -90, so plain ray casting is both simpler and more correct: the bays
  // come out as water.
  //
  // And there is exactly one step in the whole file that moves more than 180
  // degrees of longitude: `[180, -90]` to `[-180, -90]`, the seam where that
  // same Antarctic ring closes along the bottom of the world. It needs no
  // shifting because it is a real edge of a closed ring rather than a polygon
  // torn across the antimeridian — the source cuts those already — so the
  // longitude-shifting path is gone too. Both were verified against the baked
  // data, not assumed.

  // Each cell holds the rings whose bounding box touches it. Without this every
  // query would walk all 2,876 rings.
  const grid: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  bounds.forEach(([minLon, minLat, maxLon, maxLat], i) => {
    const c0 = Math.max(0, Math.floor((minLon! + 180) / CELL));
    const c1 = Math.min(COLS - 1, Math.floor((maxLon! + 180) / CELL));
    const r0 = Math.max(0, Math.floor((90 - maxLat!) / CELL));
    const r1 = Math.min(ROWS - 1, Math.floor((90 - minLat!) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) grid[r * COLS + c]!.push(i);
    }
  });
  // **Smallest first, so the first ring that contains a point is the answer.**
  // The rule has always been that the smallest containing ring wins — Lesotho
  // over South Africa, Western Sahara over Morocco — and `resolve` used to walk
  // the whole cell keeping the best. Sorting the cell once at load turns that
  // into an early exit and lets `isLand` share the same walk instead of keeping
  // its own, which it could only do while the answer was "any ring at all": a
  // lake is a *smaller* ring that means the opposite, so a first-match test
  // would have reported the country under it and dug the shore ramp round the
  // wrong side of every shoreline in the world.
  for (const cell of grid) cell.sort((a, b) => rings[a]!.area - rings[b]!.area);

  const bands = rings.map((ring, i) => bandIndex(ring.points, bounds[i]![1]!, bounds[i]![3]!));
  /**
   * `insideRing` for ring `i`, over only the edges that can cross the ray.
   *
   * **A big country is thousands of edges and the ray crosses a handful.**
   * Every `countryAt` and `elevationAt` walked the whole ring — Russia's,
   * Canada's, Antarctica's — for a parity decided by the few edges whose
   * latitude span holds the point's: 3.4 and 4.2 us a call (2026-09-25,
   * Node), and the load's one question per coast edge (`coastEdges`) took
   * 1,154 ms of them. Now 0.2, 1.1 and 81 ms (`pnpm perf`). The
   * edges are bucketed by latitude at load, and the test runs the same
   * comparison on the same two ends in the same order over the edges of the
   * point's band, which are a superset of the ones that can toggle it: the
   * answer is the same bit for every point, not an approximation of it.
   */
  const inside = (i: number, lon: number, y: number): boolean => {
    const band = bands[i]!;
    return band === null ? insideRing(rings[i]!.points, lon, y) : insideBands(band, lon, y);
  };

  /**
   * **Smallest wins between two land rings, and not between land and a lake.**
   * The rule compares areas, and an area says nothing about which of a lake and
   * a country is drawn on top: Burundi's ring is 2.20 square degrees and Lake
   * Tanganyika 2.67, and Natural Earth draws Burundi's border *across the
   * water*, so smallest-wins handed Burundi 63 of 1,066 points sampled inside
   * the lake. `globe.ts` cuts that same stretch out of Burundi as a bay, so the
   * player walked on air over drawn water, got no boat, and a road's water test
   * passed where there was none.
   *
   * What the mesh does is the definition, so this asks the mesh's question:
   * `subtractLake` leaves a ring whole — `'clear'` — exactly when **no point of
   * the lake lies inside it**, and cuts the lake out of it otherwise. So a land
   * ring that a lake's own outline reaches into has lost that water to the
   * lake, and one it does not reach into is an island in it (Likoma and
   * Chizumulu, Malawi's inside Mozambique's half of Lake Malawi) and still
   * wins. Only a lake *larger* than the ring can need saying: a smaller one is
   * walked first and already wins. Worked out once per pair at load — a few
   * dozen pairs on the whole planet — rather than per query.
   */
  const bitten: number[][] = rings.map(() => []);
  rings.forEach((lake, w) => {
    if (!lake.water) return;
    const [lakeMinLon, lakeMinLat, lakeMaxLon, lakeMaxLat] = bounds[w]! as [number, number, number, number];
    rings.forEach((ring, i) => {
      if (ring.water || ring.area >= lake.area) return;
      const [minLon, minLat, maxLon, maxLat] = bounds[i]! as [number, number, number, number];
      if (minLon > lakeMaxLon || maxLon < lakeMinLon || minLat > lakeMaxLat || maxLat < lakeMinLat) return;
      const reaches = lake.points.some(([lon, lat]) => {
        const y = Math.min(89.999, Math.max(-89.999, lat!));
        return lon! >= minLon && lon! <= maxLon && y >= minLat && y <= maxLat &&
          inside(i, lon!, y);
      });
      if (reaches) bitten[i]!.push(w);
    });
  });

  /**
   * The smallest ring containing a point, or null.
   *
   * Smallest wins because rings overlap for two reasons and both need it.
   * Natural Earth's Morocco covers Western Sahara outright, so first-match-wins
   * made an entire country unreachable. And the bake keeps only outer rings, so
   * every enclave country (Lesotho inside South Africa) sits under its
   * neighbour's polygon. Picking the smallest match resolves both without
   * reinstating holes — except against a lake that reaches into the ring, which
   * wins over it whatever the areas say; see `bitten`.
   */
  const resolve = (lat: number, lon: number): LandRing | null => {
    // A NaN passes every clamp below and indexes no cell: say so, rather than
    // fail on the grid or answer for a place that is nowhere.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new RangeError(`countryAt: no position (${lat}, ${lon})`);
    // Exactly +/-90 is degenerate for ray casting: the polar edge of the
    // Antarctic ring lies on that latitude, so no segment ever straddles it.
    const y = Math.min(89.999, Math.max(-89.999, lat));
    const col = Math.min(COLS - 1, Math.max(0, Math.floor((lon + 180) / CELL)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - y) / CELL)));

    for (const i of grid[row * COLS + col]!) {
      const [minLon, minLat, maxLon, maxLat] = bounds[i]! as [number, number, number, number];
      if (lon < minLon || lon > maxLon || y < minLat || y > maxLat) continue;
      if (!inside(i, lon, y)) continue;
      // A lake this ring lost water to, and the point is in the water it lost.
      for (const w of bitten[i]!) {
        const [wMinLon, wMinLat, wMaxLon, wMaxLat] = bounds[w]! as [number, number, number, number];
        if (lon < wMinLon || lon > wMaxLon || y < wMinLat || y > wMaxLat) continue;
        if (inside(w, lon, y)) return rings[w]!;
      }
      return rings[i]!;
    }
    return null;
  };

  /**
   * Is there land here at all? The question `terrain.ts` needs and the one thing
   * only this file can answer, so it is handed in rather than reimplemented:
   * the shore index has to tell a coastline from an international border, and
   * that is which side of a ring boundary the sea is on.
   *
   * It is `resolve` and not its own walk now. It used to be able to stop at the
   * first containing ring because every ring meant land; a lake means water, so
   * "is any ring here" and "is the *nearest* ring land" stopped being the same
   * question and only the second one is this one.
   */
  const isLand = (lat: number, lon: number): boolean => {
    const ring = resolve(lat, lon);
    return ring !== null && !ring.water;
  };

  // The relief is a function of position and the mesh has to evaluate it too,
  // so the fields it needs are built once here, as the world loads. Only
  // Earth's: another body brings its own ground and leaves these alone.
  if (ground === null) prepareTerrain(rings, unitsPerDegree, isLand);

  // A water ring resolves to nothing, which is the same answer the open sea
  // gives, and that single line is the whole of the boat mechanic on a lake.
  const countryOf = (ring: LandRing | null): number =>
    ring === null || ring.water ? 0 : ring.country;

  return {
    countries,
    rings,
    countryAt: (lat, lon) => countryOf(resolve(lat, lon)),
    countryAtPoint(point) {
      const { lat, lon } = toLatLon(point);
      return countryOf(resolve(lat, lon));
    },
    elevationAt(point) {
      if (ground !== null) return ground.elevationAt(point);
      const { lat, lon } = toLatLon(point);
      const ring = resolve(lat, lon);
      if (ring === null || ring.water) return 0;
      // Shelf plus relief, and `globe.ts` raises every vertex by exactly this
      // sum. One definition of the ground, called from both places: displacing
      // the mesh by a second one is how a player ends up buried in a hill or
      // standing on air over a valley.
      const length = Math.hypot(point.x, point.y, point.z) || 1;
      return ring.height + reliefAt(point.x / length, point.y / length, point.z / length);
    },
  };
}
