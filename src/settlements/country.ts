import { PLANET_RADIUS } from '../globe.ts';
import { BIGGEST_SETTLEMENT, isShown } from '../places.ts';
import type { Place } from '../places.ts';
import { COUNTRY_RING, cellCentre, cellIndex, countryReach, gatesOf, inGrid } from '../scenery/grid.ts';
import type { TownGrid } from '../scenery/grid.ts';
import { VARIANTS, rngFrom } from '../scenery/index.ts';
import type { Placed, RegionStyle } from '../scenery/index.ts';
import type { TownFrame } from './frame.ts';
import { LOOSE_SHARE, ORCHARD_SHARE, ROAD_KEEP, SLOPE_CLEAR, fitting, keepoutReaches } from './rules.ts';
import type { Slot } from './types.ts';

/**
 * The country a town fades into: orchards, trees and bushes on the cells it
 * gave up to the outskirts and on the lattice's next cells out, as far as its
 * disc (`countryReach`), so a town does not end in a line against the clearing
 * the wood keeps round it.
 *
 * It keeps off the inner half of the edge slope, a strip `ROAD_KEEP` either
 * side of each road out of its gate, a landmark's ground and another built
 * town's disc; the raise refuses the sea and slopes past `MAX_SLOPE`. Every
 * entry is added to `inTheCountry`, so the raise seats it on the land rather
 * than on a terrace.
 */
export function* countrysideSteps(
  frame: TownFrame,
  slots: readonly Slot[],
  roadGates: ReadonlyMap<Place, number[]>,
  inTheCountry: WeakSet<Placed>,
  slot: Slot,
  grid: TownGrid,
  style: RegionStyle,
): Generator<void, Placed[], void> {
  const out: Placed[] = [];
  const cells = grid.cells;
  const town = (col: number, row: number): boolean => inGrid(grid, col, row) && frame.terraceAt(col, row) !== null;
  const nearTown = (col: number, row: number): boolean => {
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (town(col + dc, row + dr)) return true;
    return false;
  };
  // Each road runs straight out of its gate for its first stretch (`courseOf`'s stub).
  const gates = gatesOf(grid);
  const used = (roadGates.get(slot.place) ?? []).map((index) => gates[index]).filter((gate) => gate !== undefined);
  const clearOfRoads = (x: number, z: number): boolean => used.every((gate) => {
    const out = (x - gate.x) * gate.outX + (z - gate.z) * gate.outZ;
    const lateral = Math.abs((x - gate.x) * gate.outZ - (z - gate.z) * gate.outX);
    return out < -1 || lateral > ROAD_KEEP;
  });
  const half = grid.pitch * 0.5;
  const disc = countryReach(slot.radius);
  const crowded = crowding(frame, slots, slot, disc, half);
  /** How far a point is from the nearest cell of the town, in world units. */
  const fromTown = (x: number, z: number): number => {
    const col = cellIndex(grid, x);
    const row = cellIndex(grid, z);
    let best = Infinity;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (!town(col + dc, row + dr)) continue;
        const dx = Math.max(Math.abs(x - cellCentre(grid, col + dc)) - half, 0);
        const dz = Math.max(Math.abs(z - cellCentre(grid, row + dr)) - half, 0);
        best = Math.min(best, Math.hypot(dx, dz));
      }
    }
    return best;
  };
  const clear = (x: number, z: number): boolean => fromTown(x, z) >= grid.pitch * SLOPE_CLEAR;
  for (let col = -COUNTRY_RING; col < cells + COUNTRY_RING; col++) {
    yield;
    for (let row = -COUNTRY_RING; row < cells + COUNTRY_RING; row++) {
      if (town(col, row)) continue;
      // A cell of the edge slope takes nothing on its inner half, where the slope stands over the ground.
      const onSlope = nearTown(col, row);
      const cx = cellCentre(grid, col);
      const cz = cellCentre(grid, row);
      if (Math.hypot(Math.abs(cx) + half, Math.abs(cz) + half) > disc) continue;
      if (crowded(cx, cz)) continue;
      if (frame.keepouts.some((keepout) => keepoutReaches(keepout, cx - half, cx + half, cz - half, cz + half))) continue;
      const keep = (x: number, z: number): boolean => !((onSlope && !clear(x, z)) || !clearOfRoads(x, z));
      plantCell(out, style, grid, slot.seed, col, row, cx, cz, half, keep);
    }
  }
  for (const entry of out) inTheCountry.add(entry);
  return out;
}

/**
 * Whether a point past the town's own disc falls in another built town's
 * disc. Only a town too small to have room inside its disc reaches past it.
 */
function crowding(frame: TownFrame, slots: readonly Slot[], slot: Slot, disc: number, half: number): (x: number, z: number) => boolean {
  const neighbours: { x: number; z: number; radius: number }[] = [];
  if (disc > slot.radius) {
    const cosReach = Math.cos((disc + BIGGEST_SETTLEMENT) / PLANET_RADIUS);
    // The cone first and `isShown` after it: this is a pass over every slot on the planet.
    for (const other of slots) {
      if (other === slot || other.direction.dot(slot.direction) < cosReach) continue;
      if (!isShown(other.place)) continue;
      neighbours.push({ x: other.direction.dot(frame.across) * PLANET_RADIUS, z: other.direction.dot(frame.north) * PLANET_RADIUS, radius: other.radius });
    }
  }
  return (x, z) =>
    Math.hypot(x, z) > slot.radius && neighbours.some((other) => Math.hypot(x - other.x, z - other.z) < other.radius + half);
}

/** One country cell: an orchard of one species in rows, a loose tree or two and a bush, or meadow. */
function plantCell(
  out: Placed[], style: RegionStyle, grid: TownGrid, seed: string, col: number, row: number,
  cx: number, cz: number, half: number, keep: (x: number, z: number) => boolean,
): void {
  const rng = rngFrom(seed, 'country', col, row);
  const draw = rng.unit();
  if (draw < ORCHARD_SHARE) {
    const trees = fitting(style.trees, half);
    if (trees === null) return;
    const id = rng.weighted(trees);
    const rows = 2;
    const step = grid.pitch / rows;
    const variant = rng.int(VARIANTS);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < rows; j++) {
        const x = cx - half + step * (i + 0.5) + rng.jitter() * 0.4;
        const z = cz - half + step * (j + 0.5) + rng.jitter() * 0.4;
        if (!keep(x, z)) continue;
        out.push({
          partId: id, variant, scale: rng.spread(0.9, 0.06),
          plot: { x, z, yaw: rng.unit() * Math.PI * 2, size: step, distance: Math.hypot(x, z), seed: rng.unit() * 0x7fffffff, col, row },
        });
      }
    }
  } else if (draw < ORCHARD_SHARE + LOOSE_SHARE) {
    const count = 2 + rng.int(3);
    for (let k = 0; k < count; k++) {
      const mix = k < 2 ? fitting(style.trees, half) : fitting(style.scatter, half) ?? fitting(style.trees, half);
      if (mix === null) continue;
      const x = cx + rng.jitter() * half * 0.8;
      const z = cz + rng.jitter() * half * 0.8;
      if (!keep(x, z)) continue;
      out.push({
        partId: rng.weighted(mix), variant: rng.int(VARIANTS), scale: rng.spread(1, 0.14),
        plot: { x, z, yaw: rng.unit() * Math.PI * 2, size: half, distance: Math.hypot(x, z), seed: rng.unit() * 0x7fffffff, col, row },
      });
    }
  }
}
