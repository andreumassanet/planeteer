import { BENCH_DEPTH } from '../../bench.ts';
import { THROUGH_HALF_WIDTH, cellCentre, cellIndex, hasThroughStreets, mainStreetHalf, onThroughRoad, throughClear } from '../../scenery/grid.ts';
import { cellKey } from '../../scenery/ground.ts';
import { rngFrom } from '../../scenery/index.ts';
import { CLEAR_BENCH, CLEAR_CAR, CLEAR_FOLK, PAIR_GAP, PAIR_SHARE, STROLL_MIN, STROLL_STEP } from '../rules.ts';
import type { GroundJob } from './job.ts';

/**
 * Who stands in the streets and what is parked at the kerbs, on the street
 * bands and avenues, the only ground in a town no building stands on.
 *
 * Nothing parks or stands down the two main streets' carriageway, the through
 * road (`throughClear`); a person whose spot falls in it moves onto its
 * pavement where there is one, else is left out. Every seeded draw is still
 * taken, so the rest of the town stands where it would.
 */

/** The through road as street life keeps off it. */
interface Through {
  /** Whether the town has main streets, and their half-width and clear sweep. */
  driven: boolean;
  mainHalf: number;
  through: number;
}

/** A street a cell carries: along z or x, the line down the middle of the cell's share of it, and its half-reach. */
type CellStreet = [alongZ: boolean, line: number, reach: number];

export function* streetLifeSteps(job: GroundJob, urbanity: number): Generator<void, void, void> {
  const { grid, band, pitch, levels, slot, style } = job;
  const mainHalf = mainStreetHalf(grid, style.street);
  const driven = hasThroughStreets(grid);
  const lanes: Through = { driven, mainHalf, through: driven ? throughClear(mainHalf) : -Infinity };
  const parkChance = Math.min(0.55, 0.12 + urbanity * 0.5);
  const folkChance = Math.min(0.6, 0.2 + urbanity * 0.55);
  for (const key of levels.keys()) {
    yield;
    const col = Math.floor(key / 1024) - 512;
    const row = (key % 1024) - 512;
    const x0 = cellCentre(grid, col) - pitch * 0.5;
    const z0 = cellCentre(grid, row) - pitch * 0.5;
    const rng = rngFrom(slot.seed, 'street-life', col, row);
    // A band only where the cell across it is town too, as the street is drawn.
    const streets: CellStreet[] = [];
    if (grid.low[col] === 1 && levels.has(cellKey(col - 1, row))) streets.push([true, x0 + band * 0.5, band]);
    if (grid.high[col] === 1 && levels.has(cellKey(col + 1, row))) streets.push([true, x0 + pitch - band * 0.5, band]);
    if (grid.low[row] === 1 && levels.has(cellKey(col, row - 1))) streets.push([false, z0 + band * 0.5, band]);
    if (grid.high[row] === 1 && levels.has(cellKey(col, row + 1))) streets.push([false, z0 + pitch - band * 0.5, band]);
    // Along an avenue a car parks with its centre 1.9 in from the kerb.
    if (grid.avenue[col] === 1 && grid.avenue[row] !== 1) {
      streets.push([true, x0 + 1.9, 1.9], [true, x0 + pitch - 1.9, 1.9]);
    }
    if (grid.avenue[row] === 1 && grid.avenue[col] !== 1) {
      streets.push([false, z0 + 1.9, 1.9], [false, z0 + pitch - 1.9, 1.9]);
    }
    for (const street of streets) {
      const parked = rng.chance(parkChance) ? parkOn(job, lanes, rng, street, x0, z0) : NaN;
      if (rng.chance(folkChance)) standOn(job, lanes, rng, street, x0, z0, parked);
    }
  }
}

/** Whether `(x, z)` is within `clear` of a bench, which nothing parks in and nobody stands in. */
function nearBench(job: GroundJob, x: number, z: number, clear: number): boolean {
  const benches = job.out.benches;
  for (let b = 0; b + 3 < benches.length; b += 4) {
    if (Math.hypot(benches[b]! - x, benches[b + 2]! - z) < clear) return true;
  }
  return false;
}

/** Whether a person at `(x, z)` would stand on the through road, the middle crossing included. */
function inThrough(lanes: Through, x: number, z: number): boolean {
  return lanes.driven && onThroughRoad(x, z, lanes.mainHalf, CLEAR_FOLK);
}

/**
 * Parks a car on a street of the cell, or not; returns where along the cell
 * it stands, or NaN. A car is as wide as a band, so it keeps clear of the
 * through road by its half-width across and about half its length along.
 */
function parkOn(job: GroundJob, lanes: Through, rng: ReturnType<typeof rngFrom>, [alongZ, line]: CellStreet, x0: number, z0: number): number {
  const along = rng.range(0.15, 0.85) * job.pitch;
  const yaw = alongZ ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
  const px = alongZ ? line : x0 + along;
  const pz = alongZ ? z0 + along : line;
  const across = lanes.through + THROUGH_HALF_WIDTH;
  const reach = lanes.through + CLEAR_CAR * 0.75;
  const inRoad = alongZ
    ? Math.abs(px) < across || Math.abs(pz) < reach
    : Math.abs(pz) < across || Math.abs(px) < reach;
  if (!inRoad && !nearBench(job, px, pz, CLEAR_CAR) && job.spotAt(px, pz, job.out.kerbs, yaw, CLEAR_CAR)) return along;
  return NaN;
}

/**
 * One or two people on a street of the cell, keeping off the car parked on it
 * (`parked`, where along the cell, or NaN), the through road and the benches.
 * Some of the first are a pair talking, a pace apart across the street's line
 * and facing each other; anyone else may stroll the stretch of street round
 * their spot that stays on their terrace.
 */
function standOn(
  job: GroundJob, lanes: Through, rng: ReturnType<typeof rngFrom>,
  [alongZ, line, reach]: CellStreet, x0: number, z0: number, parked: number,
): void {
  const { grid, pitch, levels, out } = job;
  const start = alongZ ? z0 : x0;
  const pointOf = (along: number, off: number): [number, number] =>
    alongZ ? [line + off, start + along] : [start + along, line + off];
  const clearOfCar = (along: number): boolean => !(Math.abs(along - parked) < CLEAR_CAR + CLEAR_FOLK);
  const spot: number[] = [];
  for (let k = 0; k < 2; k++) {
    if (k > 0 && !rng.chance(0.42)) break;
    const along = rng.range(0.1, 0.9) * pitch;
    let off = rng.jitter() * reach * 0.5;
    const pair = k === 0 && rng.chance(PAIR_SHARE);
    if (!clearOfCar(along)) continue;
    // Out of a main street's carriageway, onto the pavement on this cell's side.
    const across = line + off;
    if (Math.abs(across) < lanes.through + CLEAR_FOLK) {
      const kerb = (line < 0 ? -1 : 1) * (lanes.through + CLEAR_FOLK + 0.05);
      if (Math.abs(kerb) > lanes.mainHalf - CLEAR_FOLK * 0.5) continue;
      off = kerb - line;
    }
    const [x, z] = pointOf(along, off);
    if (inThrough(lanes, x, z) || nearBench(job, x, z, CLEAR_FOLK + BENCH_DEPTH)) continue;
    const level = levels.get(cellKey(cellIndex(grid, x), cellIndex(grid, z)));
    if (level === undefined) continue;
    spot.length = 0;
    if (!job.spotAt(x, z, spot, undefined, CLEAR_FOLK)) continue;
    if (pair) {
      // Across the line, towards its middle, so both stay on the band.
      const [px, pz] = pointOf(along, off + (off > 0 ? -1 : 1) * PAIR_GAP);
      if (job.standable(px, pz, level) && !inThrough(lanes, px, pz)) {
        job.pavingAt(px, pz, level, spot);
        const [ax, ay, az, bx, by, bz] = spot as [number, number, number, number, number, number];
        // Neither strolls. The yaw is in the settlement's frame, where a person faces +Z.
        out.folk.push(ax, ay, az, ax, ay, az, ax, ay, az, Math.atan2(bx - ax, bz - az), 1);
        out.folk.push(bx, by, bz, bx, by, bz, bx, by, bz, Math.atan2(ax - bx, az - bz), -1);
        break;
      }
    }
    // The stroll: out from the spot a pace at a time while it stays on this
    // level, off the steps and landmarks, clear of the car and the benches.
    let lo = along;
    let hi = along;
    const strollable = (at: number): boolean => {
      const [sx, sz] = pointOf(at, off);
      return job.standable(sx, sz, level) && !inThrough(lanes, sx, sz) && !nearBench(job, sx, sz, CLEAR_BENCH);
    };
    while (lo - STROLL_STEP > 0.08 * pitch && clearOfCar(lo - STROLL_STEP) && strollable(lo - STROLL_STEP)) lo -= STROLL_STEP;
    while (hi + STROLL_STEP < 0.92 * pitch && clearOfCar(hi + STROLL_STEP) && strollable(hi + STROLL_STEP)) hi += STROLL_STEP;
    if (hi - lo < STROLL_MIN) lo = hi = along;
    out.folk.push(...spot);
    job.pavingAt(...pointOf(lo, off), level, out.folk);
    job.pavingAt(...pointOf(hi, off), level, out.folk);
    out.folk.push(NaN, 0);
  }
}
