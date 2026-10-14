/**
 * Pure geometry for the monument bake: distances and steps on the sphere, the
 * probe rings round a landmark's plan, and a town's quarters.
 */
import { UNITS_PER_DEGREE } from '../../src/globe.ts';
import type { PlanShape } from '../../src/landmark-ground.ts';
import type { TownGrid } from '../../src/scenery/grid.ts';

export const DEG = Math.PI / 180;

/** Spacing of the probe rings, both round the plan and out from the landmark. */
export const SEAT_STEP = 4;

/** Great-circle distance in kilometres, for reporting only. */
const EARTH_KM = 6371;
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const d = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * d) / 2) ** 2 +
    Math.cos(aLat * d) * Math.cos(bLat * d) * Math.sin(((bLon - aLon) * d) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Steps `distance` units along `bearing` (0 is north) from a coordinate. */
export function step(lat: number, lon: number, distance: number, bearing: number): [number, number] {
  const degrees = distance / UNITS_PER_DEGREE;
  const y = Math.max(-89.99, Math.min(89.99, lat + degrees * Math.cos(bearing)));
  const x = ((lon + (degrees * Math.sin(bearing)) / Math.max(0.02, Math.cos(lat * DEG)) + 540) % 360) - 180;
  return [y, x];
}

/**
 * The outline of the plan grown by `d` (shrunk for negative `d`), sampled at
 * most `SEAT_STEP` apart, in the landmark's frame. The plan is the
 * intersection of its box and disc (`PlanShape`), so the outline is the part
 * of each one's outline inside the other.
 */
export function ringOf(shape: PlanShape, d: number): [number, number][] {
  const inside = (x: number, z: number): boolean => {
    if (Math.hypot(x, z) > shape.radius + d + 1e-6) return false;
    if (d >= 0) {
      return Math.hypot(Math.max(Math.abs(x - shape.cx) - shape.hx, 0), Math.max(Math.abs(z - shape.cz) - shape.hz, 0)) <= d + 1e-6;
    }
    return Math.abs(x - shape.cx) <= shape.hx + d + 1e-6 && Math.abs(z - shape.cz) <= shape.hz + d + 1e-6;
  };
  const points: [number, number][] = [];
  const keep = (x: number, z: number): void => {
    if (inside(x, z)) points.push([x, z]);
  };
  // The disc's outline.
  const around = Math.max(0, shape.radius + d);
  const n = Math.max(24, Math.ceil((2 * Math.PI * around) / SEAT_STEP));
  for (let k = 0; k < n; k++) keep(Math.cos((k / n) * Math.PI * 2) * around, Math.sin((k / n) * Math.PI * 2) * around);
  // The box's: four sides pushed out by `bend` and a quarter arc round each corner.
  if (Number.isFinite(shape.hx)) {
    const hx = Math.max(0, shape.hx + Math.min(d, 0));
    const hz = Math.max(0, shape.hz + Math.min(d, 0));
    const bend = Math.max(0, d);
    const edge = (x0: number, z0: number, x1: number, z1: number): void => {
      const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / SEAT_STEP));
      for (let i = 0; i < count; i++) keep(x0 + ((x1 - x0) * i) / count, z0 + ((z1 - z0) * i) / count);
    };
    edge(shape.cx + hx + bend, shape.cz - hz, shape.cx + hx + bend, shape.cz + hz);
    edge(shape.cx + hx, shape.cz + hz + bend, shape.cx - hx, shape.cz + hz + bend);
    edge(shape.cx - hx - bend, shape.cz + hz, shape.cx - hx - bend, shape.cz - hz);
    edge(shape.cx - hx, shape.cz - hz - bend, shape.cx + hx, shape.cz - hz - bend);
    if (bend > 0) {
      const arc = Math.max(2, Math.ceil((bend * Math.PI) / 2 / SEAT_STEP));
      for (const [sx, sz, from] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]] as const) {
        for (let i = 1; i < arc; i++) {
          const angle = from + ((Math.PI / 2) * i) / arc;
          keep(shape.cx + sx * hx + Math.cos(angle) * bend, shape.cz + sz * hz + Math.sin(angle) * bend);
        }
      }
    }
  }
  return points;
}

/** The offset the rings start from: the plan's own spine, a whole number of steps in. */
export function innermost(shape: PlanShape): number {
  return -Math.floor(Math.min(shape.radius, shape.hx, shape.hz) / SEAT_STEP) * SEAT_STEP;
}

/** The runs of cells a parcel may take along one axis of a square: one quarter, either side of the main street. */
export function quarters(grid: TownGrid): [number, number][] {
  const n = grid.cells;
  if (n < 2) return [];
  if (n % 2 === 1) {
    const m = (n - 1) / 2;
    return m > 0 ? [[0, m - 1], [m + 1, n - 1]] : [];
  }
  return [[0, n / 2 - 1], [n / 2, n - 1]];
}
