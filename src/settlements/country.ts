import { PLANET_RADIUS } from '../globe.ts';
import { BIGGEST_SETTLEMENT, isShown } from '../places.ts';
import type { Place } from '../places.ts';
import { COUNTRY_RING, cellCentre, cellIndex, countryReach, gatesOf, inGrid } from '../scenery/grid.ts';
import type { TownGrid } from '../scenery/grid.ts';
import type { CoursePath } from '../roads.ts';
import { VARIANTS, rngFrom } from '../scenery/index.ts';
import type { Placed, RegionStyle } from '../scenery/index.ts';
import type { TownFrame } from './frame.ts';
import { FACING_YAW } from './plots.ts';
import { HOUSE_SHARE, HOUSE_SHARE_BY_ROAD, KIND_OF, LOOSE_SHARE, ORCHARD_SHARE, ROAD_KEEP, SLOPE_CLEAR, fitting, footprintOf, keepoutReaches } from './rules.ts';
import type { Slot } from './types.ts';

/**
 * The country a town fades into: orchards, trees and bushes on the cells it
 * gave up to the outskirts and on the lattice's next cells out, as far as its
 * disc (`countryReach`), so a town does not end in a line against the clearing
 * the wood keeps round it; and off the edge slope, a house in its yard here
 * and there, more of them along the roads out, so the town thins out rather
 * than stops.
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
  roadPaths: (place: Place) => readonly CoursePath[],
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
  // Every piece of its roads near the town, in the town's frame, for the houses to keep off.
  const reachOut = grid.half + (HOUSE_RING + 1) * grid.pitch;
  const pieces: number[] = [];
  for (const path of roadPaths(slot.place)) {
    let x0 = NaN;
    let z0 = NaN;
    for (let k = 0; k < path.count; k++) {
      const px = path.xyz[k * 3]!;
      const py = path.xyz[k * 3 + 1]!;
      const pz = path.xyz[k * 3 + 2]!;
      const x = (px * frame.across.x + py * frame.across.y + pz * frame.across.z) * PLANET_RADIUS;
      const z = (px * frame.north.x + py * frame.north.y + pz * frame.north.z) * PLANET_RADIUS;
      if (k > 0 && Math.min(Math.hypot(x, z), Math.hypot(x0, z0)) < reachOut * 1.5) pieces.push(x0, z0, x, z);
      x0 = x;
      z0 = z;
    }
  }
  const half = grid.pitch * 0.5;
  // A street with no road out ends on a house past the slope, square across its line.
  const deadEnds = gates.filter((gate) => !used.includes(gate));
  // The first cell past the slope where the street's paving stops, which is short of the square where the outskirts cut it.
  const endsStreet = (col: number, row: number, cx: number, cz: number): boolean => deadEnds.some((gate) => {
    const lateral = Math.abs((cx - gate.x) * gate.outZ - (cz - gate.z) * gate.outX);
    return lateral < half && town(col - 2 * gate.outX, row - 2 * gate.outZ) && !town(col - gate.outX, row - gate.outZ);
  });
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
  for (let col = -HOUSE_RING; col < cells + HOUSE_RING; col++) {
    yield;
    for (let row = -HOUSE_RING; row < cells + HOUSE_RING; row++) {
      if (town(col, row)) continue;
      // How many cells out of the square: past `COUNTRY_RING` only a house, thinning out.
      const ring = Math.max(-col, col - cells + 1, -row, row - cells + 1, 0);
      // A cell of the edge slope takes nothing on its inner half, where the slope stands over the ground.
      const onSlope = nearTown(col, row);
      const cx = cellCentre(grid, col);
      const cz = cellCentre(grid, row);
      if (Math.hypot(Math.abs(cx) + half, Math.abs(cz) + half) > disc) continue;
      if (crowded(cx, cz)) continue;
      if (frame.keepouts.some((keepout) => keepoutReaches(keepout, cx - half, cx + half, cz - half, cz + half))) continue;
      const keep = (x: number, z: number): boolean => !((onSlope && !clear(x, z)) || !clearOfRoads(x, z));
      const thinning = endsStreet(col, row, cx, cz) ? 1 / HOUSE_SHARE : ring > COUNTRY_RING ? 0.5 ** (ring - COUNTRY_RING) : 1;
      if (!onSlope && standHouse(out, style, pieces, slot.seed, col, row, cx, cz, half, grid.pitch, thinning)) continue;
      if (ring > COUNTRY_RING) continue;
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

/**
 * A house in its yard on a country cell, sometimes: oftener beside a road out,
 * facing it, else facing the town. Kept a road's crown and its own size off
 * every road. Returns whether one was planned.
 */
function standHouse(
  out: Placed[], style: RegionStyle, roads: readonly number[], seed: string, col: number, row: number,
  cx: number, cz: number, half: number, pitch: number, thinning: number,
): boolean {
  const rng = rngFrom(seed, 'country-house', col, row);
  // The nearest piece of road, and the point on it nearest the cell.
  let off = Infinity;
  let nx = 0;
  let nz = 0;
  for (let k = 0; k < roads.length; k += 4) {
    const ax = roads[k]!;
    const az = roads[k + 1]!;
    const dx = roads[k + 2]! - ax;
    const dz = roads[k + 3]! - az;
    const length2 = dx * dx + dz * dz;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / length2)) : 0;
    const d = Math.hypot(cx - ax - dx * t, cz - az - dz * t);
    if (d < off) {
      off = d;
      nx = ax + dx * t;
      nz = az + dz * t;
    }
  }
  const byRoad = off < 2 * pitch;
  if (!rng.chance((byRoad ? HOUSE_SHARE_BY_ROAD : HOUSE_SHARE) * thinning)) return false;
  const homes = style.buildings.filter((entry) => KIND_OF.get(entry.item) === 'dwelling');
  if (homes.length === 0) return false;
  const id = rng.weighted(homes);
  const scale = Math.min(1, (half * 1.15) / Math.max(1e-6, footprintOf(id)));
  if (scale < HOUSE_SMALLEST) return false;
  const reach = footprintOf(id) * scale;
  if (off < ROAD_KEEP + reach) return false;
  // Its front to the road beside it, or to the town's middle.
  const fx = byRoad ? nx - cx : -cx;
  const fz = byRoad ? nz - cz : -cz;
  const facing = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 2) : fz > 0 ? 1 : 3;
  out.push({
    partId: id, variant: rng.int(VARIANTS), scale,
    plot: { x: cx, z: cz, yaw: FACING_YAW[facing]!, size: half * 2, distance: Math.hypot(cx, cz), seed: rng.unit() * 0x7fffffff, col, row },
  });
  return true;
}

/** How many cells past the square a house may stand, the disc permitting; each ring past `COUNTRY_RING` half as often. */
const HOUSE_RING = 4;

/** The smallest a house is drawn in the country, as a scale on its own size: under it the cell keeps its trees. */
const HOUSE_SMALLEST = 0.7;

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
