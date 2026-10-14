/**
 * What the streets carry: the stretches of pavement people stroll, lamps along
 * the kerb, benches and bins between them, planters at a stretch's end, and the
 * craft parked on the main streets.
 */

import type { TownGrid } from '../../scenery/grid.ts';
import { rngFrom } from '../../scenery/random.ts';
import type { WorldSpec } from '../contract.ts';
import { BAND } from './streets.ts';
import type { FurnitureKind, Placed, Street, Walk } from './types.ts';

/** Lamps along a street, one every this many units a side, staggered. */
const LAMP_EVERY = 18;

export interface StreetFurnishings {
  walks: Walk[];
  lamps: Placed[];
  planters: Placed[];
  furniture: (Placed & { kind: FurnitureKind })[];
}

/**
 * The pavements, as stretches between crossings, both sides of every street:
 * where people stroll. A stretch is cut where a cross street's carriageway
 * crosses it, so nobody walks down the middle of a crossing.
 */
export function furnishStreets(spec: WorldSpec, id: string, grid: TownGrid, streets: readonly Street[]): StreetFurnishings {
  const walks: Walk[] = [];
  const lamps: Placed[] = [];
  const planters: Placed[] = [];
  const furniture: (Placed & { kind: FurnitureKind })[] = [];
  const edge = grid.half;
  for (const street of streets) {
    const crossings = streets
      .filter((other) => other.axis !== street.axis)
      .map((other) => [other.at - other.half, other.at + other.half] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const pieces: [number, number][] = [];
    let from = -edge;
    for (const [lo, hi] of crossings) {
      if (lo > from) pieces.push([from, lo]);
      from = Math.max(from, hi);
    }
    if (from < edge) pieces.push([from, edge]);
    for (const side of [-1, 1]) {
      // The line a stroller keeps: the pavement's middle. The lamps stand on
      // the carriageway's edge and the planters at a stretch's ends, so it
      // is clear of both.
      const off = street.at + side * (street.half - street.walk * 0.5);
      const planted = street.half > BAND;
      for (const [a, b] of pieces) {
        if (b - a < 4) continue;
        const inset = planted && b - a > 10 ? 2.6 : 0.8;
        walks.push(
          street.axis === 'x'
            ? { ax: a + inset, az: off, bx: b - inset, bz: off }
            : { ax: off, az: a + inset, bx: off, bz: b - inset },
        );
      }
      // Lamps on the kerb side of a pavement wide enough to pass one,
      // staggered side to side.
      const kerb = street.at + side * (street.half - street.walk - 0.2);
      const start = side > 0 ? LAMP_EVERY / 2 : 0;
      for (const [a, b] of pieces) {
        // Never at the square's edge, where a main street's gate stands.
        // Lamps light the main streets and the wide ones, as on Earth, not
        // every lane.
        const lit = street.main || street.half > BAND;
        for (let t = a + 4.5 + start; lit && street.walk >= 1.8 && t < b - 4.5; t += LAMP_EVERY) {
          if (Math.abs(t) > edge - 4) continue;
          const yaw = street.axis === 'x' ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
          lamps.push(street.axis === 'x' ? { x: t, z: kerb, yaw } : { x: kerb, z: t, yaw });
          // Halfway to the next lamp, a bench, a bin, a vending machine or a
          // signpost, set in from the kerb and facing the buildings — a bench
          // only where the pavement leaves the strollers room past it.
          const m = t + LAMP_EVERY / 2;
          if (m >= b - 4.5 || Math.abs(m) > edge - 4) continue;
          const roll = rngFrom('worlds', spec.id, 'furniture', id, street.axis, street.at, side, Math.round(m)).unit();
          const kind: FurnitureKind | null =
            roll < 0.38 ? (street.walk >= 3 ? 'bench' : 'bin') : roll < 0.62 ? 'bin' : roll < 0.78 ? 'vending' : roll < 0.9 ? 'sign' : null;
          if (kind === null) continue;
          const inset = street.at + side * (street.half - street.walk + (kind === 'bench' ? 0.75 : 0.55));
          const face = yaw + Math.PI;
          furniture.push(street.axis === 'x' ? { x: m, z: inset, yaw: face, kind } : { x: inset, z: m, yaw: face, kind });
        }
        // A planter at each end of a stretch, on the building side of the pavement.
        if (b - a > 10 && street.half > BAND) {
          const back = street.at + side * (street.half - 0.7);
          for (const t of [a + 1.2, b - 1.2]) if (Math.abs(t) < edge - 4) planters.push(street.axis === 'x' ? { x: t, z: back, yaw: 0 } : { x: back, z: t, yaw: 0 });
        }
      }
    }
  }
  return { walks, lamps, planters, furniture };
}

/**
 * Craft parked on the main streets, against the kerb, a few cells out from the
 * middle and never at a crossing. Only in a town of five cells or more: in a
 * smaller one the main street is where the takeable craft wait (`parkingOf`).
 */
export function parkedCraft(grid: TownGrid, streets: readonly Street[]): { parked: Placed[]; mainCarriage: number } {
  const edge = grid.half;
  const parked: Placed[] = [];
  const mains = streets.filter((one) => one.main);
  const mainCarriage = mains.length > 0 ? mains[0]!.half - mains[0]!.walk : BAND;
  for (const street of grid.cells >= 5 ? mains : []) {
    if (street.half - street.walk < 2.6) continue;
    for (const side of [-1, 1]) {
      const t = side * grid.pitch * 1.5 * (street.axis === 'x' ? 1 : -1);
      // Not south of the middle on the north–south street: that is where the
      // traveller comes in, and the lens behind them.
      if (Math.abs(t) > edge - 4 || (street.axis === 'z' && t < 0)) continue;
      const lane = street.at + side * (street.half - street.walk - 1.3);
      const yaw = street.axis === 'x' ? Math.PI / 2 : 0;
      parked.push(street.axis === 'x' ? { x: t, z: lane, yaw } : { x: lane, z: t, yaw });
    }
  }
  return { parked, mainCarriage };
}

/**
 * Where a traveller comes down: on the main north-south street, a cell south of
 * the middle, in the carriageway's middle where nothing stands. A square of one
 * or two cells has no street: the arrival is just outside it.
 */
export function arrivalOf(grid: TownGrid): { x: number; z: number } {
  const edge = grid.half;
  return { x: 0, z: grid.cells >= 3 ? -Math.min(edge - 3, grid.pitch) : -(edge + 2.5) };
}
