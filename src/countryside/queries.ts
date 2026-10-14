/** Questions asked of the plans by the grass, the herds, the ambient life and the checks. */
import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { cellAt, cellBounds, rowsOf, stepOf } from '../tile-grid.ts';
import type { CellBounds } from '../tile-grid.ts';
import { COUNTRY_PARTS } from '../countryside-kit.ts';
import { BENCH_SIT_AHEAD } from '../bench.ts';
import { PIECE_BURY } from '../countryside-tile.ts';
import type { Bench } from '../bench.ts';
import { CELL_MARGIN, DEG } from './frame.ts';
import type { CountryPiece, CountryPlan, Countryside, CropField } from './types.ts';

/**
 * The ground a piece wears out of the grass (`trodden`), by part: bare within
 * `bare` of its footprint, then trodden short over `worn` units more, growing
 * back to the field's height at its edge. What is not listed wears
 * `WORN_DEFAULT`, and a tree none: grass grows under a palm. The whole reach
 * is held inside `CELL_MARGIN` past the footprint, so a cell answers for its
 * own ground.
 */
const WORN: Readonly<Record<string, { bare: number; worn: number }>> = {
  campfire: { bare: 1.7, worn: 2 },
  tent: { bare: 0.9, worn: 1.5 },
  ger: { bare: 0.95, worn: 1.5 },
  'nomad-tent': { bare: 0.9, worn: 1.5 },
  'hay-bale': { bare: 1, worn: 0.8 },
  bench: { bare: 0.7, worn: 1.2 },
  turbine: { bare: 0.6, worn: 1 },
  rocks: { bare: 0.6, worn: 0 },
  'standing-stone': { bare: 0.8, worn: 1 },
  cairn: { bare: 0.8, worn: 1 },
  'prayer-flags': { bare: 0, worn: 0 },
  palm: { bare: 0, worn: 0 },
  olive: { bare: 0, worn: 0 },
};
const WORN_DEFAULT = { bare: 0.85, worn: 1.5 };
/** How tall the grass stands at the bare edge of a piece's worn ground, of the field's. */
const TRODDEN = 0.35;

type Queries = Pick<Countryside, 'fieldAt' | 'meadowAt' | 'trodden' | 'occupied' | 'benchesNear' | 'find'>;

export function createQueries(
  plan: (row: number, column: number) => CountryPlan,
  planAt: (lat: number, lon: number) => CountryPlan,
  bounds: CellBounds,
): Queries {
  const scratch = new THREE.Vector3();
  const cellOf = (direction: THREE.Vector3): CountryPlan => planAt(latOf(direction.y), lonOf(direction.x, direction.z));
  /** A point in a field's own frame: across the rows and along them. */
  const fieldLocal = { x: 0, z: 0 };
  const fieldNorth = new THREE.Vector3();
  const fieldEast = new THREE.Vector3();
  function inField(field: CropField, direction: THREE.Vector3, margin: number): boolean {
    fieldNorth.set(0, 1, 0).projectOnPlane(field.at).normalize();
    fieldEast.crossVectors(field.at, fieldNorth).normalize();
    scratch.copy(direction).sub(field.at);
    const ex = scratch.dot(fieldEast) * PLANET_RADIUS;
    const nz = scratch.dot(fieldNorth) * PLANET_RADIUS;
    const c = Math.cos(field.yaw);
    const s = Math.sin(field.yaw);
    fieldLocal.x = ex * c - nz * s;
    fieldLocal.z = ex * s + nz * c;
    if (field.round) return (fieldLocal.x / (field.halfX + margin)) ** 2 + (fieldLocal.z / (field.halfZ + margin)) ** 2 <= 1;
    return Math.abs(fieldLocal.x) <= field.halfX + margin && Math.abs(fieldLocal.z) <= field.halfZ + margin;
  }

  const seen: number[] = [];
  const occupiedPoint = new THREE.Vector3();
  /** A bench piece as somewhere to sit, made once a piece: the plans are cached, and so is this. */
  const benchOf = new WeakMap<CountryPiece, Bench>();
  const benchNorth = new THREE.Vector3();
  const benchAcross = new THREE.Vector3();
  function sittable(piece: CountryPiece, key: string): Bench {
    let bench = benchOf.get(piece);
    if (bench !== undefined) return bench;
    // The frame `countryside-tile.ts` stands a piece in: north, across (up x
    // north), up, spun by its yaw, which turns its +Z to this.
    benchNorth.set(0, 1, 0).projectOnPlane(piece.at);
    if (benchNorth.lengthSq() < 1e-8) benchNorth.set(1, 0, 0).projectOnPlane(piece.at);
    benchNorth.normalize();
    benchAcross.crossVectors(piece.at, benchNorth).normalize();
    const facing = benchAcross.multiplyScalar(Math.sin(piece.yaw)).addScaledVector(benchNorth, Math.cos(piece.yaw)).clone();
    const position = piece.at.clone().multiplyScalar(PLANET_RADIUS).addScaledVector(facing, BENCH_SIT_AHEAD * piece.scale);
    bench = { position, facing, sink: PIECE_BURY, key };
    benchOf.set(piece, bench);
    return bench;
  }

  /** Calls `visit` once for each distinct cell the 3 x 3 neighbourhood of a disc touches. */
  function eachCellNear(direction: THREE.Vector3, radius: number, visit: (found: CountryPlan) => boolean | void): void {
    const lat = latOf(direction.y);
    const lon = lonOf(direction.x, direction.z);
    // A plan stays inside its cell, so only the cells the disc touches can hold anything in it.
    const dLat = radius / UNITS_PER_DEGREE;
    const dLon = dLat / Math.max(Math.cos(lat * DEG), 0.05);
    seen.length = 0;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const { row, column } = cellAt(lat + a * dLat, lon + b * dLon, 0);
        const key = row * 100_000 + column;
        if (seen.includes(key)) continue;
        seen.push(key);
        if (visit(plan(row, column)) === true) return;
      }
    }
  }

  return {
    fieldAt(direction) {
      const found = cellOf(direction);
      for (const field of found.fields) if (inField(field, direction, 0)) return field;
      return null;
    },

    meadowAt(direction) {
      const found = cellOf(direction);
      for (const meadow of found.meadows) {
        if (meadow.at.distanceTo(direction) * PLANET_RADIUS < meadow.radius) return meadow;
      }
      return null;
    },

    trodden(direction, spread = 0) {
      const found = cellOf(direction);
      let height = 1;
      for (const piece of found.pieces) {
        const wear = WORN[piece.part] ?? WORN_DEFAULT;
        if (wear.bare <= 0 && wear.worn <= 0) continue;
        const own = piece.scenic ? piece.footprint : (COUNTRY_PARTS[piece.part]?.footprint ?? piece.footprint) * piece.scale;
        const reach = Math.min(own * wear.bare + wear.worn, piece.footprint + CELL_MARGIN);
        const bare = Math.min(own * wear.bare + spread, reach);
        const distance = piece.at.distanceTo(direction) * PLANET_RADIUS;
        if (distance >= reach) continue;
        if (distance <= bare) return 0;
        const t = (distance - bare) / Math.max(reach - bare, 1e-6);
        height = Math.min(height, TRODDEN + (1 - TRODDEN) * t * t * (3 - 2 * t));
      }
      return height;
    },

    occupied(direction, radius) {
      let taken = false;
      eachCellNear(direction, radius, (found) => {
        for (const piece of found.pieces) {
          if (piece.at.distanceTo(direction) * PLANET_RADIUS < piece.footprint + radius) return (taken = true);
        }
        for (const field of found.fields) if (inField(field, direction, radius)) return (taken = true);
        for (const line of found.lines) {
          occupiedPoint.copy(line.from).lerp(line.to, 0.5).normalize();
          const half = line.from.distanceTo(line.to) * PLANET_RADIUS * 0.5;
          if (occupiedPoint.distanceTo(direction) * PLANET_RADIUS < half + radius + 1) return (taken = true);
        }
        return false;
      });
      return taken;
    },

    benchesNear(direction, radius, out) {
      eachCellNear(direction, radius, (found) => {
        found.pieces.forEach((piece, index) => {
          if (piece.scenic || piece.part !== 'bench') return;
          if (piece.at.distanceTo(direction) * PLANET_RADIUS > radius + BENCH_SIT_AHEAD) return;
          out.push(sittable(piece, `bench:${found.key}:${index}`));
        });
      });
    },

    find(kind, lat, lon, reach = 3) {
      const origin = unitAt(lat, lon, new THREE.Vector3());
      const { row } = cellAt(lat, lon, 0);
      const step = stepOf(0);
      const rings = Math.ceil(reach / step);
      const seenKeys = new Set<string>();
      let best: { lat: number; lon: number; distance: number; region: string } | null = null;
      for (let ring = 0; ring <= rings && best === null; ring++) {
        for (let dr = -ring; dr <= ring; dr++) {
          const r = row + dr;
          if (r < 0 || r >= rowsOf(0)) continue;
          // A row's own columns: the cell count changes from one root band to the next.
          const rowLat = -90 + (r + 0.5) * step;
          const centre = cellAt(rowLat, lon, 0).column;
          cellBounds(0, r, centre, bounds);
          const spread = Math.ceil((ring * step) / Math.max(Math.cos(rowLat * DEG), 0.05) / bounds.dLon);
          for (let dc = -spread; dc <= spread; dc++) {
            cellBounds(0, r, centre + dc, bounds);
            const key = `${r}/${Math.round((bounds.west + 180) / bounds.dLon)}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            const found = plan(r, centre + dc);
            if (found.kind !== kind) continue;
            const at = found.pieces[0]?.at ?? found.fields[0]?.at;
            if (at === undefined) continue;
            const distance = at.distanceTo(origin) * PLANET_RADIUS;
            if (best === null || distance < best.distance) {
              best = { lat: Number(latOf(at.y).toFixed(4)), lon: Number(lonOf(at.x, at.z).toFixed(4)), distance: Math.round(distance), region: found.style.id };
            }
          }
        }
      }
      return best;
    },
  };
}
