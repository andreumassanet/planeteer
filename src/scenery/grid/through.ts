import { streetBand } from './square.ts';
import type { Gate, TownGrid } from './square.ts';

/** The carriageway a town keeps clear down its two main streets for traffic driving through. */

/** Half the width of the widest vehicle that drives through a town, in world units: a placed city bus. */
export const THROUGH_HALF_WIDTH = 2.25;

/** The radius a vehicle turns on at a town's middle crossing, in world units: what a main street's paving has room for. */
export const THROUGH_TURN = 4;

/** What a town keeps between a through lane's outer side and its kerb, for a person on the pavement. */
const KERB_ROOM = 2;

/** Whether a town has main streets to drive through: a one-cell square has no street at all. */
export function hasThroughStreets(grid: TownGrid): boolean {
  return grid.cells >= 2;
}

/** Whether a gate is where a main street meets the edge: a street through the middle of the square. */
export function isMainGate(gate: Gate): boolean {
  return Math.abs(gate.outX !== 0 ? gate.z : gate.x) < 1e-6;
}

/**
 * Half the width of a main street, centre line to building line: the middle
 * cell of an odd square (an avenue), one band of an even one.
 */
export function mainStreetHalf(grid: TownGrid, street: number): number {
  return grid.cells % 2 === 1 ? grid.pitch * 0.5 : streetBand(grid, street);
}

/**
 * How far off a main street's centre line through traffic drives, one lane
 * each way, or 0 (one lane down the middle) where the street is too narrow for
 * two and a pavement. Never more than 0.6 of the turn, so the inside lane on
 * the middle crossing stays a curve.
 */
export function throughLane(half: number): number {
  return Math.max(0, Math.min(half - THROUGH_HALF_WIDTH - KERB_ROOM, 0.4 * half, THROUGH_TURN * 0.6));
}

/**
 * How far either side of a main street's centre line through traffic sweeps:
 * what the town keeps clear of parked cars and people, and what
 * `scripts/check-life.ts` holds a drive through a town to.
 */
export function throughClear(half: number): number {
  return throughLane(half) + THROUGH_HALF_WIDTH;
}

/**
 * Whether `(x, z)` in a town's frame is on the through road, `margin` wider
 * all round: either main street's carriageway and the whole of their crossing.
 * `half` is `mainStreetHalf`.
 */
export function onThroughRoad(x: number, z: number, half: number, margin: number): boolean {
  const clear = throughClear(half) + margin;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return ax < clear || az < clear || (ax < half + margin && az < half + margin);
}
