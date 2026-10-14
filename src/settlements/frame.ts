import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { planGap } from '../landmark-ground.ts';
import type { PlanShape } from '../landmark-ground.ts';
import { radiusFor } from '../places.ts';
import { cellCentre, cellIndex, cornerOffset, inParcel, townFrame, townGrid } from '../scenery/grid.ts';
import type { Parcel, TownGrid, TownGround } from '../scenery/grid.ts';
import { cellKey } from '../scenery/ground.ts';
import type { Keepout } from './types.ts';

/**
 * The town being built: its tangent frame, its lattice and the ground under
 * each corner, its terraces, and the landmarks' keepouts and parcels. One town
 * at a time owns it, from `squareSteps` to the end of its raise or plan.
 */

/**
 * One lattice corner: where it is in the plane and in the town's frame, the
 * ground's height there and the local up, and whether it stands in the sea.
 * Carrying its own up lets a terrace (a level surface, which on a sphere is not
 * a constant `y` in the flat frame) be asked for at any height exactly.
 */
export interface Corner {
  /** Local plane coordinates: the lattice corner, exactly. */
  x: number;
  z: number;
  /** The same point in the settlement's frame, at the ground with no lift on it. */
  lx: number;
  ly: number;
  lz: number;
  /** The ground's height above sea level, floored at 0. */
  elevation: number;
  /** The local up at this corner, in the settlement's frame. */
  ux: number;
  uy: number;
  uz: number;
  sea: boolean;
}

/** A landmark near the planet, as the frame turns it into a keepout. */
export interface MonumentSite {
  direction: THREE.Vector3;
  shape: PlanShape;
  radius: number;
}

export interface TownFrame {
  /** The town's up, and the tangent axes `townFrame` derives from it. */
  readonly up: THREE.Vector3;
  readonly north: THREE.Vector3;
  readonly across: THREE.Vector3;
  /** `makeBasis(across, up, north)`, its transpose, and the ground point under the centre. */
  readonly basis: THREE.Matrix4;
  readonly inverse: THREE.Matrix4;
  readonly origin: THREE.Vector3;
  /** The square being built, and the elevation every terrace is quantised about. */
  grid: TownGrid;
  base: number;
  /** One lattice corner per key, and one terrace per cell. `squareSteps` clears both. */
  readonly corners: Map<number, Corner>;
  readonly terraces: Map<number, number | null>;
  /** The landmarks within reach, in the town's frame. */
  readonly keepouts: Keepout[];
  /** The parcels those landmarks take of the square, and whose each one is, by the same index. */
  readonly parcels: Parcel[];
  readonly parcelOwners: Keepout[];
  /** The town as `grid.ts` asks about its ground. */
  readonly ground: TownGround;
  /** Where a local offset from the settlement's centre lands on the sphere. */
  directionAt(x: number, z: number, target: THREE.Vector3): THREE.Vector3;
  cornerAt(i: number, j: number): Corner;
  /** A corner raised to an elevation of its own rather than the ground's, in the town's frame. */
  pointAt(corner: Corner, elevation: number, into: number[]): number[];
  /** A point of the plane at an elevation, in the town's frame, along its own direction. */
  pointIn(x: number, z: number, elevation: number, into: number[]): number[];
  /** The elevation a cell's terrace is cut to, or null where the town does not pave it. */
  terraceAt(col: number, row: number): number | null;
  parcelCell(col: number, row: number): boolean;
  parcelAt(x: number, z: number): boolean;
  /** Whether the cells under a rectangle of the town's frame touch a parcel. */
  parcelUnder(x0: number, x1: number, z0: number, z1: number): boolean;
  /** Whether a point is in a parcel or inside a landmark's keepout. */
  blocked(x: number, z: number): boolean;
  /** Rebuilds the tangent frame, the ground origin and the keepouts about `up`. */
  frameAt(): void;
}

export function createTownFrame(world: World, monumentSites: readonly MonumentSite[]): TownFrame {
  const up = new THREE.Vector3();
  const north = new THREE.Vector3();
  const across = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  const corners = new Map<number, Corner>();
  const terraces = new Map<number, number | null>();
  const keepouts: Keepout[] = [];
  const parcels: Parcel[] = [];
  const parcelOwners: Keepout[] = [];
  const groundDir = new THREE.Vector3();
  const groundLocal = new THREE.Vector3();
  const localUp = new THREE.Vector3();
  const centreDir = new THREE.Vector3();
  const pointDir = new THREE.Vector3();
  const pointLocal = new THREE.Vector3();

  function directionAt(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    return target
      .copy(up)
      .addScaledVector(across, x / PLANET_RADIUS)
      .addScaledVector(north, z / PLANET_RADIUS)
      .normalize();
  }

  /** Cached, since the four cells round a corner each ask and each answer costs an `elevationAt`. */
  function cornerAt(i: number, j: number): Corner {
    const key = cellKey(i, j);
    const known = corners.get(key);
    if (known !== undefined) return known;
    const x = cornerOffset(frame.grid, i);
    const z = cornerOffset(frame.grid, j);
    directionAt(x, z, groundDir);
    // Elevation 0 is the sea: the coast is a shelf and there is no mesh below it.
    const elevation = world.elevationAt(groundDir);
    groundLocal
      .copy(groundDir)
      .multiplyScalar(PLANET_RADIUS + Math.max(0, elevation))
      .sub(origin)
      .applyMatrix4(inverse);
    // `inverse` carries no translation, so it takes a direction as readily as a point.
    localUp.copy(groundDir).applyMatrix4(inverse);
    const made: Corner = {
      x, z,
      lx: groundLocal.x, ly: groundLocal.y, lz: groundLocal.z,
      elevation: Math.max(0, elevation),
      ux: localUp.x, uy: localUp.y, uz: localUp.z,
      sea: elevation <= 0,
    };
    corners.set(key, made);
    return made;
  }

  function pointAt(corner: Corner, elevation: number, into: number[]): number[] {
    const rise = elevation - corner.elevation;
    into[0] = corner.lx + corner.ux * rise;
    into[1] = corner.ly + corner.uy * rise;
    into[2] = corner.lz + corner.uz * rise;
    return into;
  }

  function pointIn(x: number, z: number, elevation: number, into: number[]): number[] {
    directionAt(x, z, pointDir);
    pointLocal
      .copy(pointDir)
      .multiplyScalar(PLANET_RADIUS + elevation)
      .sub(origin)
      .applyMatrix4(inverse);
    into[0] = pointLocal.x;
    into[1] = pointLocal.y;
    into[2] = pointLocal.z;
    return into;
  }

  const ground: TownGround = {
    corner: (i, j) => cornerAt(i, j).elevation,
    sea: (col, row) =>
      world.elevationAt(directionAt(cellCentre(frame.grid, col), cellCentre(frame.grid, row), centreDir)) <= 0,
    get base() {
      return frame.base;
    },
  };

  const parcelCell = (col: number, row: number): boolean => parcels.some((parcel) => inParcel(parcel, col, row));
  const parcelAt = (x: number, z: number): boolean => parcelCell(cellIndex(frame.grid, x), cellIndex(frame.grid, z));

  function frameAt(): void {
    // One frame, shared with the roads that arrive at the gates. The basis is
    // proper (`across = up x north`); a reflected one turns merged triangles
    // inside out.
    townFrame(up, across, north);
    basis.makeBasis(across, up, north);
    origin.copy(up).multiplyScalar(PLANET_RADIUS + world.elevationAt(up));
    inverse.copy(basis).transpose();

    keepouts.length = 0;
    for (const monument of monumentSites) {
      // Within a few hundredths of a radian the tangent components are the local coordinates.
      if (monument.direction.dot(up) < 0.999) continue;
      keepouts.push({
        x: monument.direction.dot(across) * PLANET_RADIUS,
        z: monument.direction.dot(north) * PLANET_RADIUS,
        shape: monument.shape,
        radius: monument.radius,
      });
    }
  }

  const frame: TownFrame = {
    up,
    north,
    across,
    basis,
    inverse,
    origin,
    grid: townGrid(radiusFor(0)),
    base: 0,
    corners,
    terraces,
    keepouts,
    parcels,
    parcelOwners,
    ground,
    directionAt,
    cornerAt,
    pointAt,
    pointIn,
    terraceAt: (col, row) => terraces.get(cellKey(col, row)) ?? null,
    parcelCell,
    parcelAt,
    parcelUnder(x0, x1, z0, z1) {
      const c0 = cellIndex(frame.grid, x0 + 1e-3);
      const c1 = cellIndex(frame.grid, x1 - 1e-3);
      const r0 = cellIndex(frame.grid, z0 + 1e-3);
      const r1 = cellIndex(frame.grid, z1 - 1e-3);
      return parcels.some((parcel) => parcel.c0 <= c1 && parcel.c1 >= c0 && parcel.r0 <= r1 && parcel.r1 >= r0);
    },
    blocked(x, z) {
      if (parcelAt(x, z)) return true;
      for (const keepout of keepouts) {
        if (planGap(keepout.shape, x - keepout.x, z - keepout.z) < keepout.radius) return true;
      }
      return false;
    },
    frameAt,
  };
  return frame;
}
