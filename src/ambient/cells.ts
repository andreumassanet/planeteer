/** The cell grid round the player: working cells out, keeping them, and the anchors creatures circle. */
import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import { BIOMES, biomeAt, biomeSample } from '../biome.ts';
import type { BiomeSample } from '../biome.ts';
import { shoreAt, shoreDistance, shoreSample } from '../terrain.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { isWater } from '../vehicles.ts';
import { hash3 } from '../weather.ts';
import {
  ANCHORS, BEACH_BIOMES, BEACH_FALL, BEACH_RISE, BEACH_SAND, BEACH_STRIDE, BEACH_TRIES, BUTTERFLY, CACHE_CAP,
  CASTLE_ODDS, CELL, CRAB_BIOMES, CRAB_ODDS, DEG, FIREFLY, GULL_CELL, GULL_COAST, GULL_RANGE, K_ANCHOR, K_BEACH,
  K_CELL, K_GULL, MOTE, POLAR, RANGE, WATERSIDE, WATER_LINE,
} from './constants.ts';
import { cellKey, columnLon, columnOf, columnsIn, frameAt, rowLat, rowOf } from './grid.ts';
import type { AmbientContext, Cell, GullCell } from './types.ts';

export interface Cells {
  /** The small cells in range that hold anything, and the gull cells that hold a gull. */
  readonly active: Cell[];
  readonly activeGulls: GullCell[];
  /** Which cells are in range: kept ones reused, new ones worked out while the budget lasts. Returns the budget left. */
  scan(player: THREE.Vector3, small: boolean, budget: number): number;
  /** Drops the cells out of range once the cache passes `CACHE_CAP`. */
  forget(): void;
  /** An anchor's ground point, lifted `height` along the cell's up and moved `e`, `n` across it. */
  anchorPoint(cell: Cell, index: number, e: number, n: number, height: number, out: THREE.Vector3): THREE.Vector3;
}

export function createCells(ctx: AmbientContext): Cells {
  const { options, stats, state } = ctx;
  const { scanUp } = ctx.scratch;
  const cells = new Map<number, Cell>();
  const gullCells = new Map<number, GullCell>();
  const active: Cell[] = [];
  const activeGulls: GullCell[] = [];
  const sample: BiomeSample = biomeSample();
  const probe = new THREE.Vector3();
  const point = new THREE.Vector3();
  const scanCell = new THREE.Vector3();
  const shoreHere = shoreSample();
  const beachSpots: number[] = [];

  /**
   * What lies on a beach cell: spots on dry, low, sandy ground at the water's
   * edge, each a shell, now and then a sandcastle, and on a warm beach a crab.
   * Null where nothing does.
   */
  function beachOf(row: number, column: number, up: THREE.Vector3, east: THREE.Vector3, north: THREE.Vector3, biome: string): Float32Array | null {
    beachSpots.length = 0;
    const warm = (CRAB_BIOMES as readonly string[]).includes(biome);
    for (let i = 0; i < BEACH_TRIES; i++) {
      const roll = (k: number): number => hash3(row, column, K_BEACH + i * 4 + k);
      const e = (roll(0) - 0.5) * CELL;
      const n = (roll(1) - 0.5) * CELL;
      probe.copy(up).addScaledVector(east, e / PLANET_RADIUS).addScaledVector(north, n / PLANET_RADIUS).normalize();
      point.copy(probe).multiplyScalar(PLANET_RADIUS);
      const ground = options.groundAt(point);
      if (isWater(ground) || ground - PLANET_RADIUS > BEACH_RISE || options.madeHeightAt(point) > 0) continue;
      shoreAt(probe.x, probe.y, probe.z, shoreHere);
      if (shoreHere.fall < BEACH_FALL || shoreHere.sand < BEACH_SAND) continue;
      const pick = roll(2);
      const kind = pick < CASTLE_ODDS ? 1 : warm && pick < CASTLE_ODDS + CRAB_ODDS ? 2 : 0;
      beachSpots.push(kind, probe.x, probe.y, probe.z, ground, roll(3));
    }
    return beachSpots.length >= BEACH_STRIDE ? Float32Array.from(beachSpots) : null;
  }

  function admit(row: number, column: number, columns: number): Cell {
    const lat = rowLat(row, CELL);
    const lon = columnLon(column, columns);
    const up = unitAt(lat, lon, new THREE.Vector3());
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    frameAt(up, east, north);
    probe.copy(up).multiplyScalar(PLANET_RADIUS);
    const ground = options.groundAt(probe);
    const made = options.madeHeightAt(probe);
    biomeAt(up.x, up.y, up.z, lat, lon, Math.max(0, ground - PLANET_RADIUS), sample);
    const water = isWater(ground) && made <= 0;
    const shore = shoreDistance(lat, lon) * UNITS_PER_DEGREE;
    const town = made > 0;
    const biome = sample.id;
    const meadow = !water && !town && (options.meadowAt?.(up) ?? false);
    const roll = (i: number): number => hash3(row, column, K_CELL + i);

    let fireflies = 0;
    let butterflies = 0;
    let motes = 0;
    if (!water && !town) {
      const wet = shore < WATERSIDE ? 1.6 : 1;
      const firefly = (FIREFLY[biome] ?? 0) * wet * (0.4 + 0.6 * BIOMES[biome].sward);
      if (roll(0) < firefly) fireflies = 2 + Math.floor(roll(1) * 4);
      if (meadow) butterflies = 2 + Math.floor(roll(2) * 2);
      else if (roll(3) < (BUTTERFLY[biome] ?? 0)) butterflies = 1;
      if (roll(4) < (MOTE[biome] ?? 0) * (meadow ? 1.6 : 1)) motes = 2 + Math.floor(roll(5) * 3);
    }
    const fish = water && biome !== 'ice' && roll(7) < 0.8;

    const cell: Cell = {
      key: cellKey(row, column), row, column, up, east, north, biome, water, shore, town, meadow,
      fireflies, butterflies, motes, fish,
      anchors: new Float32Array(ANCHORS * 4), anchorCount: 0, beach: null, born: state.clock, fishIn: -1, fishOut: -1, fade: 0,
    };
    // A beach: near the coast, on land, in a biome with sand to lie on.
    if (!water && !town && shore < GULL_COAST * 2 && (BEACH_BIOMES as readonly string[]).includes(biome)) {
      cell.beach = beachOf(row, column, up, east, north, biome);
    }
    // The anchors, only where something will use them: a cell of the desert
    // or of open sea far from anything asks no heights at all.
    if (fireflies + butterflies + motes > 0 || fish) {
      for (let i = 0; i < ANCHORS; i++) {
        const e = (hash3(row, column, K_ANCHOR + i * 2) - 0.5) * CELL;
        const n = (hash3(row, column, K_ANCHOR + i * 2 + 1) - 0.5) * CELL;
        probe.copy(up).addScaledVector(east, e / PLANET_RADIUS).addScaledVector(north, n / PLANET_RADIUS).normalize();
        point.copy(probe).multiplyScalar(PLANET_RADIUS);
        const floor = options.madeHeightAt(point);
        const radius = floor > 0 ? floor : options.groundAt(point);
        // A fish wants water under it and everything else land: an anchor
        // on the wrong side of the shore is dropped rather than moved.
        if (isWater(radius) !== fish) continue;
        const o = cell.anchorCount * 4;
        cell.anchors[o] = probe.x;
        cell.anchors[o + 1] = probe.y;
        cell.anchors[o + 2] = probe.z;
        cell.anchors[o + 3] = fish ? WATER_LINE : radius;
        cell.anchorCount++;
      }
    }
    stats.admitted++;
    return cell;
  }

  function admitGulls(row: number, column: number, columns: number): GullCell {
    const lat = rowLat(row, GULL_CELL);
    const lon = columnLon(column, columns);
    const up = unitAt(lat, lon, new THREE.Vector3());
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    frameAt(up, east, north);
    probe.copy(up).multiplyScalar(PLANET_RADIUS);
    const ground = Math.max(PLANET_RADIUS, options.groundAt(probe));
    const shore = shoreDistance(lat, lon) * UNITS_PER_DEGREE;
    const coastal = shore < GULL_COAST || isWater(ground);
    // Out at sea past sight of land there are gulls too, but fewer; over a harbour, more.
    const harbour = coastal && (options.harbourNear?.(up) ?? false);
    const odds = !coastal ? 0 : harbour ? 0.9 : shore < GULL_COAST ? 0.45 : 0.12;
    const count = hash3(row, column, K_GULL) < odds ? (harbour ? 2 : 1) + Math.floor(hash3(row, column, K_GULL + 1) * 3) : 0;
    const altitude = ground + 14 + hash3(row, column, K_GULL + 2) * 16;
    return { key: cellKey(row, column), up, east, north, count, altitude, row, column, born: state.clock, fade: 0 };
  }

  /**
   * Every cell of a grid whose middle is within `range` of the player, as a
   * row, a column and the row's column count. Allocates nothing but the
   * closure its caller hands it, twice a second.
   */
  function forEachNear(size: number, range: number, visit: (row: number, column: number, columns: number) => void): void {
    const lat = latOf(scanUp.y);
    if (Math.abs(lat) > POLAR) return;
    const lon = lonOf(scanUp.x, scanUp.z);
    const reachDeg = (range + size) / UNITS_PER_DEGREE;
    const cosRange = Math.cos((range + size * 0.75) / PLANET_RADIUS);
    for (let row = rowOf(lat - reachDeg, size), last = rowOf(lat + reachDeg, size); row <= last; row++) {
      const columns = columnsIn(row, size);
      const across = reachDeg / Math.max(0.05, Math.cos(rowLat(row, size) * DEG));
      const span = Math.ceil((across / 360) * columns) + 1;
      const whole = span * 2 + 1 >= columns;
      const middle = columnOf(lon, columns);
      const from = whole ? 0 : middle - span;
      const to = whole ? columns - 1 : middle + span;
      const middleLat = rowLat(row, size);
      for (let k = from; k <= to; k++) {
        const column = ((k % columns) + columns) % columns;
        unitAt(middleLat, columnLon(column, columns), scanCell);
        if (scanCell.dot(scanUp) < cosRange) continue;
        visit(row, column, columns);
      }
    }
  }

  /** Which cells are in range: kept ones reused, new ones worked out while the budget lasts. */
  function scan(player: THREE.Vector3, small: boolean, budget: number): number {
    scanUp.copy(player).normalize();
    if (small) {
      active.length = 0;
      forEachNear(CELL, RANGE, (row, column, columns) => {
        const key = cellKey(row, column);
        let cell = cells.get(key);
        if (cell === undefined) {
          if (budget <= 0) {
            state.pending = true;
            return;
          }
          budget--;
          cell = admit(row, column, columns);
          cells.set(key, cell);
        }
        if (cell.anchorCount > 0 || cell.beach !== null) active.push(cell);
      });
    }
    activeGulls.length = 0;
    forEachNear(GULL_CELL, GULL_RANGE, (row, column, columns) => {
      const key = cellKey(row, column);
      let cell = gullCells.get(key);
      if (cell === undefined) {
        if (budget <= 0) {
          state.pending = true;
          return;
        }
        budget--;
        cell = admitGulls(row, column, columns);
        gullCells.set(key, cell);
      }
      if (cell.count > 0) activeGulls.push(cell);
    });
    return budget;
  }

  function forget(): void {
    if (cells.size > CACHE_CAP) {
      const keep = new Set(active.map((cell) => cell.key));
      for (const key of cells.keys()) if (!keep.has(key)) cells.delete(key);
    }
    if (gullCells.size > CACHE_CAP) {
      const keep = new Set(activeGulls.map((cell) => cell.key));
      for (const key of gullCells.keys()) if (!keep.has(key)) gullCells.delete(key);
    }
  }

  /** An anchor's ground point, lifted `height` along the cell's up and moved `e`, `n` across it. */
  function anchorPoint(cell: Cell, index: number, e: number, n: number, height: number, out: THREE.Vector3): THREE.Vector3 {
    const o = (index % cell.anchorCount) * 4;
    const r = cell.anchors[o + 3]!;
    return out
      .set(cell.anchors[o]! * r, cell.anchors[o + 1]! * r, cell.anchors[o + 2]! * r)
      .addScaledVector(cell.east, e)
      .addScaledVector(cell.north, n)
      .addScaledVector(cell.up, height);
  }

  return { active, activeGulls, scan, forget, anchorPoint };
}
