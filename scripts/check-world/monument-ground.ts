/**
 * The ground under each monument's plan: level where it stands, and the
 * coastline where a pad cannot reach.
 *
 * `placement.ts` stands a model on one height asked at its centre, so any
 * relief under the plan buries or floats it; `terrain.ts` cuts a flat pad
 * there. The ring walk is written again rather than imported from
 * `build-monuments.ts` (a script with side effects, and a check sharing the
 * bake's code would only assert a function equals itself).
 */
import { at, check } from './harness.ts';
import type { WorldContext } from './context.ts';
import { Vector3 } from 'three';
import type { World } from '../../src/geo.ts';
import { latOf, lonOf, unitAt } from '../../src/sphere.ts';
import { SHORE_CLEAR, SHORE_LIP, reliefAt } from '../../src/terrain.ts';
import { offsetDirection, townFrame } from '../../src/scenery/grid.ts';
import { planShape } from '../../src/landmark-ground.ts';
import type { PlanShape } from '../../src/landmark-ground.ts';

/** A height change smaller than this, in units, is not a step. */
const SHELF_TOLERANCE = 0.5;
/** Spacing of the points on a plan's ring, in units. */
const SEAT_STEP = 4;

/**
 * The plan grown by `d` (shrunk for a negative `d`), as points at most
 * `SEAT_STEP` apart in the landmark's frame: the part of the box's outline
 * inside the disc and of the disc's inside the box (`PlanShape`).
 */
function ringOf(shape: PlanShape, d: number): [number, number][] {
  const inside = (x: number, z: number): boolean => {
    if (Math.hypot(x, z) > shape.radius + d + 1e-6) return false;
    if (d >= 0) return Math.hypot(Math.max(Math.abs(x - shape.cx) - shape.hx, 0), Math.max(Math.abs(z - shape.cz) - shape.hz, 0)) <= d + 1e-6;
    return Math.abs(x - shape.cx) <= shape.hx + d + 1e-6 && Math.abs(z - shape.cz) <= shape.hz + d + 1e-6;
  };
  const points: [number, number][] = [];
  const around = Math.max(0, shape.radius + d);
  const n = Math.max(24, Math.ceil((2 * Math.PI * around) / SEAT_STEP));
  for (let k = 0; k < n; k++) {
    const x = Math.cos((k / n) * Math.PI * 2) * around;
    const z = Math.sin((k / n) * Math.PI * 2) * around;
    if (inside(x, z)) points.push([x, z]);
  }
  if (Number.isFinite(shape.hx)) {
    const hx = Math.max(0, shape.hx + Math.min(d, 0));
    const hz = Math.max(0, shape.hz + Math.min(d, 0));
    const bend = Math.max(0, d);
    const corners: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (const [x0, z0, x1, z1] of [
      [hx + bend, -hz, hx + bend, hz], [hx, hz + bend, -hx, hz + bend],
      [-hx - bend, hz, -hx - bend, -hz], [-hx, -hz - bend, hx, -hz - bend],
    ] as const) {
      const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / SEAT_STEP));
      for (let i = 0; i < count; i++) {
        const x = shape.cx + x0 + ((x1 - x0) * i) / count;
        const z = shape.cz + z0 + ((z1 - z0) * i) / count;
        if (inside(x, z)) points.push([x, z]);
      }
    }
    if (bend > 0) {
      const arc = Math.max(2, Math.ceil((bend * Math.PI) / 2 / SEAT_STEP));
      corners.forEach(([sx, sz], c) => {
        for (let i = 1; i < arc; i++) {
          const angle = (c * Math.PI) / 2 + ((Math.PI / 2) * i) / arc;
          const x = shape.cx + sx * hx + Math.cos(angle) * bend;
          const z = shape.cz + sz * hz + Math.sin(angle) * bend;
          if (inside(x, z)) points.push([x, z]);
        }
      });
    }
  }
  return points;
}

interface PlanProbe {
  /** The shelf (elevation less relief) at a coordinate, 0 at sea. */
  shelfAt(lat: number, lon: number): number;
  shelfAtPoint(p: Vector3): number;
  /** Each point of a landmark's ring at `d`, as a direction on the unit sphere. */
  eachOnRing(m: { lat: number; lon: number }, shape: PlanShape, d: number, visit: (p: Vector3) => void): void;
}

function planProbe(world: World): PlanProbe {
  // `elevationAt` is shelf plus relief; the relief comes off again,
  // normalised exactly as `geo.ts` does or the last bits differ.
  const shelfAt = (lat: number, lon: number): number => {
    if (world.countryAt(lat, lon) === 0) return 0;
    const p = at(lat, lon);
    const length = Math.hypot(p.x, p.y, p.z) || 1;
    return world.elevationAt(p) - reliefAt(p.x / length, p.y / length, p.z / length);
  };
  const shelfAtPoint = (p: Vector3): number => {
    if (world.countryAtPoint(p) === 0) return 0;
    const length = p.length() || 1;
    return world.elevationAt(p) - reliefAt(p.x / length, p.y / length, p.z / length);
  };
  const frameUp = new Vector3();
  const frameAcross = new Vector3();
  const frameNorth = new Vector3();
  const ringPoint = new Vector3();
  const eachOnRing = (m: { lat: number; lon: number }, shape: PlanShape, d: number, visit: (p: Vector3) => void): void => {
    unitAt(m.lat, m.lon, frameUp);
    townFrame(frameUp, frameAcross, frameNorth);
    for (const [x, z] of ringOf(shape, d)) {
      offsetDirection(frameUp, frameAcross, frameNorth, x, z, ringPoint);
      // The rings are cut along the antimeridian and the seam belongs to
      // neither side; the South Pole's rings all cross it.
      if (Math.abs(lonOf(ringPoint.x, ringPoint.z)) === 180) unitAt(latOf(ringPoint.y), 179.9999999, ringPoint);
      visit(ringPoint);
    }
  };
  return { shelfAt, shelfAtPoint, eachOnRing };
}

/**
 * The ground under every monument is level with its anchor, over the plan's
 * edge and a ring halfway in. Samples on a different shelf are coastline,
 * which `checkCoastClearance` covers.
 */
export function checkLevelGround(ctx: WorldContext): void {
  const { world, placed: monuments } = ctx;
  const { shelfAt, shelfAtPoint, eachOnRing } = planProbe(world);
  let worstTilt = 0;
  let tiltedAt = '';
  for (const m of monuments) {
    const shape = planShape(m);
    const level = world.elevationAt(at(m.lat, m.lon));
    const shelf = shelfAt(m.lat, m.lon);
    for (const d of [-Math.min(shape.hx, shape.hz, shape.radius) / 2, 0]) {
      eachOnRing(m, shape, d, (p) => {
        if (Math.abs(shelfAtPoint(p) - shelf) > SHELF_TOLERANCE) return;
        const tilt = Math.abs(world.elevationAt(p) - level);
        if (tilt > worstTilt) {
          worstTilt = tilt;
          tiltedAt = m.id;
        }
      });
    }
  }
  check(
    worstTilt < 1,
    'the ground under every monument is level',
    `worst ${worstTilt.toFixed(2)} units, at ${tiltedAt}`,
  );
}

/**
 * Each monument's recorded `clearance` (the last ring out from the plan's
 * spine wholly on the centre's shelf) still matches the outlines, and only
 * the source's `shore` landmarks have water under their plan. Those that do
 * are listed with how high their ground stands over the sea, which
 * `SHORE_CEILING` holds down to the lip.
 */
export function checkCoastClearance(ctx: WorldContext): void {
  const { world, placed: monuments } = ctx;
  const { shelfAt, shelfAtPoint, eachOnRing } = planProbe(world);
  const clearanceAt = (m: { lat: number; lon: number }, shape: PlanShape, limit: number): number => {
    const shelf = shelfAt(m.lat, m.lon);
    for (let d = -Math.floor(Math.min(shape.radius, shape.hx, shape.hz) / SEAT_STEP) * SEAT_STEP; d <= limit; d += SEAT_STEP) {
      let dry = true;
      eachOnRing(m, shape, d, (p) => {
        if (dry && Math.abs(shelfAtPoint(p) - shelf) > SHELF_TOLERANCE) dry = false;
      });
      if (!dry) return d - SEAT_STEP;
    }
    return limit;
  };
  /** Share of a plan with water under it, and its ground height. */
  const overWater = (m: { lat: number; lon: number }, shape: PlanShape): { wet: number; over: number } => {
    let wet = 0;
    let total = 0;
    for (let d = -Math.min(shape.radius, shape.hx, shape.hz); d <= 0; d += SEAT_STEP) {
      eachOnRing(m, shape, d, (p) => {
        total++;
        if (world.countryAtPoint(p) === 0) wet++;
      });
    }
    return { wet: (wet / Math.max(1, total)) * 100, over: world.elevationAt(at(m.lat, m.lon)) };
  };
  const stale: string[] = [];
  const overhanging: string[] = [];
  let worstDrop = 0;
  const ashore: string[] = [];
  for (const m of monuments) {
    const shape = planShape(m);
    const got = clearanceAt(m, shape, SHORE_CLEAR);
    if (Math.abs(got - (m.clearance ?? -Infinity)) > 1e-6) {
      stale.push(`${m.id} ${got} vs ${m.clearance ?? 'absent'}`);
    }
    if (got >= 0) continue;
    if (m.shore !== true) ashore.push(`${m.id} ${-got}u`);
    const { wet, over } = overWater(m, shape);
    worstDrop = Math.max(worstDrop, over);
    overhanging.push(`${m.id} ${-got}u ${wet.toFixed(0)}% ${over.toFixed(1)}`);
  }
  check(
    stale.length === 0,
    'every monument stands on the ground the bake seated it on',
    stale.length > 0 ? `${stale.slice(0, 4).join('; ')} — run \`pnpm monuments\`` : '',
  );
  check(
    ashore.length === 0,
    'no landmark but a shore one has water under its plan',
    ashore.length > 0 ? `${ashore.slice(0, 5).join('; ')} — list it as shore or run \`pnpm monuments\`` : '',
  );
  console.log(
    `  --   ${overhanging.length} of ${monuments.length} stand over water, all of them shore — id, water this far into the plan, ` +
    `share of it wet, units above the sea:\n       ${overhanging.join(' · ')}`,
  );
  check(
    worstDrop <= SHORE_LIP + 0.5,
    'nothing standing over water stands more than the shore lip above it',
    `worst ${worstDrop.toFixed(1)} against lip ${SHORE_LIP}`,
  );
}
