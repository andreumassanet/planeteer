import * as THREE from 'three';
import { cellKey } from '../ground.ts';
import { cellCentre, cellIndex } from '../grid.ts';
import type { TownGrid } from '../grid.ts';
import { flightAt, shoreSide } from '../floor.ts';
import type { FloorField } from '../floor.ts';
import type { Solid } from '../solids.ts';
import type { Aabb } from './aabb.ts';
import { STYLES, BASE } from './styles.ts';
import type { DressStyle } from './styles.ts';
import { Sink } from './sink.ts';
import type { DressInput, DressSeat } from './types.ts';

/**
 * The state one town's dressing shares across its three phases (façades,
 * building line, paint): the output sink, the running allowance and the
 * questions about the paved cells.
 */
export interface Dresser {
  readonly input: DressInput;
  readonly style: DressStyle;
  readonly sink: Sink;
  readonly grid: TownGrid;
  readonly levels: ReadonlyMap<number, number>;
  readonly field: FloorField;
  readonly solids: Solid[];
  readonly seats: DressSeat[];
  readonly counts: Record<string, number>;
  readonly budget: number;
  /** The triangles the town may spend so far; each phase raises it. */
  cap: number;
  dropped: number;
  decals: number;
  readonly matrix: THREE.Matrix4;
  /** Scratch point for `input.seat`. */
  readonly at: number[];
  /** The index of the middle cell on both axes, or -1 where there is no middle crossing. */
  readonly middle: number;
  /** Every paved cell, nearest the middle first. */
  readonly order: readonly { key: number; col: number; row: number; d: number }[];
  count(kind: string): void;
  /** Writes one piece and keeps it only if the town can afford it. */
  afford(write: () => void): boolean;
  /** The terrace under `(x, z)`, if it is paved, dry by `margin`, clear of a landmark and of any flight by `margin`. */
  levelAt(x: number, z: number, margin: number): number | null;
  /** One level under every corner of a box, or null: nothing straddles a riser. */
  levelUnder(box: Aabb, margin: number): number | null;
  inMouth(box: Aabb): boolean;
}

export function createDresser(input: DressInput): Dresser {
  const { grid, levels, field } = input;
  const sink = new Sink();
  const budget = Math.max(0, input.budget);
  const counts: Record<string, number> = {};

  const dresser: Dresser = {
    input,
    style: STYLES[input.region] ?? BASE,
    sink,
    grid,
    levels,
    field,
    solids: [],
    seats: [],
    counts,
    budget,
    cap: budget,
    dropped: 0,
    decals: 0,
    matrix: new THREE.Matrix4(),
    at: [],
    middle: grid.cells % 2 === 1 && grid.cells >= 3 ? grid.shift : -1,
    order: [...levels.keys()]
      .map((key) => {
        const col = Math.floor(key / 1024) - 512;
        const row = (key % 1024) - 512;
        return { key, col, row, d: Math.hypot(cellCentre(grid, col), cellCentre(grid, row)) };
      })
      .sort((a, b) => a.d - b.d || a.key - b.key),
    count(kind) {
      counts[kind] = (counts[kind] ?? 0) + 1;
    },
    afford(write) {
      const mark = sink.mark();
      const anchored = sink.anchors.length;
      write();
      if (sink.triangles <= dresser.cap) return true;
      sink.rollback(mark);
      sink.anchors.length = anchored;
      dresser.dropped++;
      return false;
    },
    levelAt(x, z, margin) {
      const key = cellKey(cellIndex(grid, x), cellIndex(grid, z));
      const level = levels.get(key);
      if (level === undefined) return null;
      // Where the coast cuts the cell the paving stops at it: nothing is laid past it.
      const shore = field.shores?.get(key);
      if (shore !== undefined && shoreSide(shore, x, z) < margin) return null;
      if (input.blocked(x, z)) return null;
      if (flightAt(field, x, z, margin) !== null) return null;
      return level;
    },
    levelUnder(box, margin) {
      const level = dresser.levelAt(box.x0, box.z0, margin);
      if (level === null) return null;
      for (const [x, z] of [[box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1], [(box.x0 + box.x1) / 2, (box.z0 + box.z1) / 2]] as const) {
        if (dresser.levelAt(x, z, margin) !== level) return null;
      }
      return level;
    },
    inMouth(box) {
      return input.mouths.some(([x0, x1, z0, z1]) => box.x0 < x1 + 0.5 && box.x1 > x0 - 0.5 && box.z0 < z1 + 0.5 && box.z1 > z0 - 0.5);
    },
  };
  return dresser;
}
