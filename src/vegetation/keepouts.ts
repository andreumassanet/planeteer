/**
 * Everything built that a plant keeps off: towns, landmarks, carriageways and
 * the fields planes and balloons stand in, gathered per tile (or per grass
 * gather) rather than per plot.
 */
import type * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { isShown, radiusOf } from '../places.ts';
import { townGrid } from '../scenery/grid.ts';
import { roadClearance, roadGeometryFor, roadIndexFor } from '../roads.ts';
import type { RoadIndex } from '../roads.ts';
import { toUnit } from '../sphere.ts';
import { planGap, planShape } from '../landmark-ground.ts';
import type { PlanShape } from '../landmark-ground.ts';
import { FIELD_CLEARANCE, MONUMENT_CLEARANCE, WIDEST_FOOTPRINT } from '../tile-grid.ts';
import type { FieldKeepout } from '../fleet.ts';
import type { FieldDisc, Keepout, RoadKeepout } from './tiles.ts';
import type { VegetationOptions } from './types.ts';

/**
 * Where a gather writes: the frame the local coordinates are taken in and the
 * three lists. A tile has its own; the grass keeps another, because it gathers
 * round the camera between two tiles.
 */
export interface KeepoutSet {
  across: THREE.Vector3;
  north: THREE.Vector3;
  keepouts: Keepout[];
  roads: RoadKeepout[];
  fields: FieldDisc[];
}

export function createKeepoutSet(across: THREE.Vector3, north: THREE.Vector3): KeepoutSet {
  return { across, north, keepouts: [], roads: [], fields: [] };
}

/** Whether `(x, z)` in the tile's frame is inside a keepout. */
export function insideKeepout(keepout: Keepout, x: number, z: number, clearance = MONUMENT_CLEARANCE): boolean {
  if (keepout.shape !== null) return planGap(keepout.shape, x - keepout.x, z - keepout.z) < clearance;
  const dx = x - keepout.x;
  const dz = z - keepout.z;
  return dx * dx + dz * dz < keepout.radius * keepout.radius;
}

/** The longest chord `coursePath` cuts, in world units: how far a piece of road may reach into a tile past its own chord. */
const ROAD_STEP = 48;

export interface Keepouts {
  /** Re-reads the places: call again when the prominence knob moves. */
  rebuild(): void;
  /** Everything built that could reach within `reach` of `direction` (a unit vector), into `into`, in its frame. */
  gather(direction: THREE.Vector3, reach: number, into: KeepoutSet): void;
  /** Unit vector of each built place, three floats each. */
  unit: Float64Array;
  /** Half a town's square, or 0 for a monument's disc. Trees keep off the whole disc; grass grows up to the square less the edge slope. */
  half: Float64Array;
  /** A town's cell pitch: the edge slope is one course of cells wide. */
  pitch: Float64Array;
}

export function createKeepouts(options: VegetationOptions): Keepouts {
  // One flat array of built ground, scanned per tile and not per plot.
  const unit = new Float64Array(((options.places?.length ?? 0) + (options.monuments?.length ?? 0)) * 3);
  const radius = new Float64Array(unit.length / 3);
  const half = new Float64Array(radius.length);
  const pitch = new Float64Array(radius.length);
  /** A monument's plan, null for a town: trees keep `MONUMENT_CLEARANCE` off the plan rather than its disc. */
  const shape: (PlanShape | null)[] = [];
  /** How many entries are in use: only the shown places keep the trees out. */
  let count = 0;

  const rebuild = (): void => {
    let i = 0;
    const add = (lat: number, lon: number, r: number, h = 0, p = 0, s: PlanShape | null = null): void => {
      toUnit(lat, lon, unit, i * 3);
      radius[i] = r;
      half[i] = h;
      pitch[i] = p;
      shape[i] = s;
      i++;
    };
    for (const place of options.places ?? []) {
      if (!isShown(place)) continue;
      const grid = townGrid(radiusOf(place));
      add(place.lat, place.lon, radiusOf(place), grid.half, grid.pitch);
    }
    for (const site of options.monuments ?? []) {
      add(site.lat, site.lon, (site.footprint ?? WIDEST_FOOTPRINT) + MONUMENT_CLEARANCE, 0, 0, planShape(site));
    }
    count = i;
  };
  rebuild();

  const roadIndex: RoadIndex | null =
    options.roads !== undefined && options.places !== undefined && options.roads.length > 0
      ? roadIndexFor(options.roads, options.places)
      : null;
  const roadGeometry = roadIndex !== null ? roadGeometryFor(options.roads!, options.places!) : null;
  const roadHits: number[] = [];
  const fieldHits: FieldKeepout[] = [];

  function gatherBuilt(direction: THREE.Vector3, reach: number, into: KeepoutSet): void {
    const { across, north, keepouts } = into;
    keepouts.length = 0;
    const cos = Math.cos((reach + 120) / PLANET_RADIUS);
    const { x, y, z } = direction;
    for (let i = 0; i < count; i++) {
      const dot = x * unit[i * 3]! + y * unit[i * 3 + 1]! + z * unit[i * 3 + 2]!;
      if (dot < cos) continue;
      keepouts.push({
        x: (unit[i * 3]! * across.x + unit[i * 3 + 1]! * across.y + unit[i * 3 + 2]! * across.z) * PLANET_RADIUS,
        z: (unit[i * 3]! * north.x + unit[i * 3 + 1]! * north.y + unit[i * 3 + 2]! * north.z) * PLANET_RADIUS,
        radius: radius[i]!,
        index: i,
        shape: shape[i] ?? null,
      });
    }
  }

  function gatherFields(direction: THREE.Vector3, reach: number, into: KeepoutSet): void {
    const { across, north, fields } = into;
    fields.length = 0;
    if (options.fields === undefined) return;
    fieldHits.length = 0;
    // The margin is the plant's spread, which nothing here is wider than.
    for (const field of options.fields.fieldsNear(direction, reach + FIELD_CLEARANCE + 40, fieldHits)) {
      fields.push({
        x: field.at.dot(across) * PLANET_RADIUS,
        z: field.at.dot(north) * PLANET_RADIUS,
        radius: field.radius + FIELD_CLEARANCE,
      });
    }
  }

  /**
   * Every road crossing the tile, as local segments along the road's own
   * `coursePath` (the one definition of where a road goes).
   */
  function gatherRoads(direction: THREE.Vector3, reach: number, into: KeepoutSet): void {
    const { across, north, roads } = into;
    roads.length = 0;
    if (roadIndex === null || roadGeometry === null) return;
    const margin = reach + 40;
    roadIndex.near(direction, margin, roadHits);
    const all = options.roads!;
    const limit = (margin + ROAD_STEP) * (margin + ROAD_STEP);
    for (const hit of roadHits) {
      const road = all[hit]!;
      const path = roadGeometry.path(hit);
      const clearance = roadClearance(road.cls);
      let x0 = 0;
      let z0 = 0;
      for (let step = 0; step < path.count; step++) {
        const px = path.xyz[step * 3]!;
        const py = path.xyz[step * 3 + 1]!;
        const pz = path.xyz[step * 3 + 2]!;
        const x = (px * across.x + py * across.y + pz * across.z) * PLANET_RADIUS;
        const z = (px * north.x + py * north.y + pz * north.z) * PLANET_RADIUS;
        if (step > 0) {
          // Only the pieces that could reach into the tile: a road is up to a
          // thousand units long and a level-0 tile is 174 across.
          const mx = (x0 + x) * 0.5;
          const mz = (z0 + z) * 0.5;
          if (mx * mx + mz * mz <= limit) roads.push({ x0, z0, x1: x, z1: z, clearance });
        }
        x0 = x;
        z0 = z;
      }
    }
  }

  function gather(direction: THREE.Vector3, reach: number, into: KeepoutSet): void {
    gatherBuilt(direction, reach, into);
    gatherFields(direction, reach, into);
    gatherRoads(direction, reach, into);
  }

  return { rebuild, gather, unit, half, pitch };
}
