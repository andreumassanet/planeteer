import { PALETTE } from '../../theme.ts';
import { tone } from '../../monuments/contract.ts';
import { LINE_HALF, cellKey, pavementOf } from '../ground.ts';
import { cellCentre, cellIndex } from '../grid.ts';
import { rngFrom } from '../random.ts';
import type { Rng } from '../random.ts';
import { overlapping } from './aabb.ts';
import type { Aabb } from './aabb.ts';
import { DECAL_LIFT, M } from './config.ts';
import type { Dresser } from './dresser.ts';
import { DRAIN_SHARE, GULLY_COST, MANHOLE_COST, MANHOLE_SHARE, flat, gully, manhole, shade } from './paint.ts';
import type { Put } from './paint.ts';

const tactile = tone(PALETTE.gold, 0.95);

/**
 * The streets of one cell, as `buildGround` paves them: a band on a low or
 * high edge where the cell across it is town too, or the whole cell where it
 * is an avenue.
 */
interface Street {
  alongZ: boolean;
  /** The street's centre line on the axis across it. */
  line: number;
  half: number;
  /** Which side of the line this cell's share is: +1, -1, or 0 for an avenue's two. */
  side: number;
}

interface Painter {
  /** A mark of one colour over the whole of `box`. */
  decal(box: Aabb, color: number): boolean;
  /**
   * Lays a painted mark over `box`, or refuses it: off the paving, over a
   * riser or a flight, in a gate's mouth, on another mark, or past the
   * allowance (`cost`, its triangles at most). `write` draws it in the town's
   * plane through `put`, which lays a point of that plane on the paving
   * `DECAL_LIFT` over it. Marks are a mosaic laid flush, never two layers.
   */
  mark(box: Aabb, cost: number, write: (put: Put) => void): boolean;
  /** The road's own colour, darkened: what its ironwork is painted in. */
  iron(factor: number): number;
}

function createPainter(d: Dresser): Painter {
  const { input, grid, sink, matrix, at, seats } = d;
  /** The marks laid so far, by the cells each reaches: a thousand a city, and only a cell's own are ever near. */
  const painted = new Map<number, Aabb[]>();
  const mark = (box: Aabb, cost: number, write: (put: Put) => void): boolean => {
    // Once the allowance is spent, nothing more is asked of the ground.
    if (sink.triangles + cost > d.cap) {
      d.dropped++;
      return false;
    }
    const level = d.levelUnder(box, 0.2);
    if (level === null || d.inMouth(box)) return false;
    // Two marks at one lift are one plane: a mark that would lie on another is not laid.
    for (let col = cellIndex(grid, box.x0); col <= cellIndex(grid, box.x1); col++) {
      for (let row = cellIndex(grid, box.z0); row <= cellIndex(grid, box.z1); row++) {
        if (painted.get(cellKey(col, row))?.some((other) => overlapping(box, other))) return false;
      }
    }
    const cx = (box.x0 + box.x1) / 2;
    const cz = (box.z0 + box.z1) / 2;
    // The paving under the mark as a plane: its middle and a unit either way.
    // The town's frame is the tangent plane at its middle and the paving is
    // the sphere, so the mark takes the lean of the paving it is on.
    input.seat(cx, cz, level, at);
    const c0 = at[0]!, c1 = at[1]!, c2 = at[2]!;
    input.seat(cx + 1, cz, level, at);
    const u0 = at[0]! - c0, u1 = at[1]! - c1, u2 = at[2]! - c2;
    input.seat(cx, cz + 1, level, at);
    const v0 = at[0]! - c0, v1 = at[1]! - c1, v2 = at[2]! - c2;
    const put: Put = (x, z) => {
      const dx = x - cx;
      const dz = z - cz;
      return [c0 + dx * u0 + dz * v0, c1 + dx * u1 + dz * v1 + DECAL_LIFT, c2 + dx * u2 + dz * v2];
    };
    matrix.identity();
    sink.place(matrix);
    return d.afford(() => {
      write(put);
      seats.push({ kind: 'decal', x: c0, y: c1, z: c2, lift: DECAL_LIFT });
      // Filed under every cell it reaches, so a mark over a cell's edge is met from both.
      for (let col = cellIndex(grid, box.x0); col <= cellIndex(grid, box.x1); col++) {
        for (let row = cellIndex(grid, box.z0); row <= cellIndex(grid, box.z1); row++) {
          const list = painted.get(cellKey(col, row));
          if (list === undefined) painted.set(cellKey(col, row), [box]);
          else list.push(box);
        }
      }
      d.decals++;
    });
  };
  return {
    mark,
    decal: (box, color) =>
      mark(box, 2, (put) => {
        sink.paint(color);
        flat(sink, put, box.x0, box.x1, box.z0, box.z1);
      }),
    iron: (factor) => shade(input.road, factor),
  };
}

function streetsOf(d: Dresser, col: number, row: number): Street[] {
  const { grid, levels } = d;
  const pitch = grid.pitch;
  const band = d.input.band;
  const list: Street[] = [];
  const x0 = cellCentre(grid, col) - pitch / 2;
  const z0 = cellCentre(grid, row) - pitch / 2;
  if (grid.avenue[col] === 1) list.push({ alongZ: true, line: x0 + pitch / 2, half: pitch / 2, side: 0 });
  else {
    if (grid.low[col] === 1 && levels.has(cellKey(col - 1, row))) list.push({ alongZ: true, line: x0, half: band, side: 1 });
    if (grid.high[col] === 1 && levels.has(cellKey(col + 1, row))) list.push({ alongZ: true, line: x0 + pitch, half: band, side: -1 });
  }
  if (grid.avenue[row] === 1) list.push({ alongZ: false, line: z0 + pitch / 2, half: pitch / 2, side: 0 });
  else {
    if (grid.low[row] === 1 && levels.has(cellKey(col, row - 1))) list.push({ alongZ: false, line: z0, half: band, side: 1 });
    if (grid.high[row] === 1 && levels.has(cellKey(col, row + 1))) list.push({ alongZ: false, line: z0 + pitch, half: band, side: -1 });
  }
  return list;
}

/**
 * The paint phase, last: tactile pads at the middle crossing, then per cell
 * the guide strips, gullies and manholes, within what is left of the
 * allowance, a step a cell.
 */
export function* paintStreetsSteps(d: Dresser): Generator<void, void, void> {
  const painter = createPainter(d);
  paintCrossing(d, painter);
  for (const { col, row } of d.order) {
    if (col === d.middle && row === d.middle) continue;
    yield;
    paintCell(d, painter, col, row);
  }
}

/** The warning pads on the pavement corners of the middle crossing, where the zebras are. */
function paintCrossing(d: Dresser, painter: Painter): void {
  const { grid, levels, middle } = d;
  if (!(middle >= 0 && levels.has(cellKey(middle, middle)))) return;
  const pitch = grid.pitch;
  const c = cellCentre(grid, middle);
  const walk = pavementOf(pitch * 0.5);
  const inset = pitch * 0.5 - walk;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = c + sx * (inset + walk / 2);
      const z = c + sz * (inset + walk / 2);
      const r = walk / 2 - 0.15;
      if (r > 0.25 && painter.decal({ x0: x - r, x1: x + r, z0: z - r, z1: z + r }, tactile)) d.count('tactile-pad');
    }
  }
}

function paintCell(d: Dresser, painter: Painter, col: number, row: number): void {
  const { input, grid, style } = d;
  const pitch = grid.pitch;
  const rng = rngFrom(input.seed, 'street-paint', col, row);
  const streets = streetsOf(d, col, row);
  // Where the cell's streets cross, a street along one axis is carriageway
  // for the other's width: its own paint keeps to the stretch between.
  const x0 = cellCentre(grid, col) - pitch / 2;
  const z0 = cellCentre(grid, row) - pitch / 2;
  for (const street of streets) {
    const walk = pavementOf(street.half);
    const cross = streets.filter((other) => other.alongZ !== street.alongZ);
    const start = street.alongZ ? z0 : x0;
    let from = start;
    let to = start + pitch;
    for (const other of cross) {
      if (other.side === 0) continue;
      // A band on the low edge of the cell: its carriageway is [line, line + half - walk].
      if (other.side > 0) from = Math.max(from, other.line + other.half - walk);
      else to = Math.min(to, other.line - other.half + walk);
    }
    if (cross.some((other) => other.side === 0)) continue;
    const shares = street.side === 0 ? [1, -1] : [street.side];
    for (const share of shares) {
      if (style.tactile) guideStrip(d, painter, street, share, walk, from, to);
      drain(d, painter, rng, street, share, walk, from, to);
    }
    manholeOn(d, painter, rng, street, walk, from, to);
  }
}

/** The guide strip down the middle of the pavement, in runs of a body-metre. */
function guideStrip(d: Dresser, painter: Painter, street: Street, share: number, walk: number, from: number, to: number): void {
  const lateral = street.line + share * (street.half - walk / 2);
  const w = 0.2 * M;
  if (!(walk > w + 0.4)) return;
  let a = from + 0.15;
  const end = to - 0.15;
  // In runs of a body-metre, so a flight or a mouth only takes its own stretch.
  while (a < end - 0.3) {
    const b = Math.min(end, a + 1.2 * M);
    const box: Aabb = street.alongZ
      ? { x0: lateral - w / 2, x1: lateral + w / 2, z0: a, z1: b }
      : { x0: a, x1: b, z0: lateral - w / 2, z1: lateral + w / 2 };
    if (painter.decal(box, tactile)) d.count('tactile-strip');
    a = b + 0.02;
  }
}

/** A gully at the kerb, in the carriageway's edge: one a street every few cells. */
function drain(d: Dresser, painter: Painter, rng: Rng, street: Street, share: number, walk: number, from: number, to: number): void {
  const pitch = d.grid.pitch;
  if (!(street.half - walk > 1.2 && rng.chance(DRAIN_SHARE))) return;
  const lateral = street.line + share * (street.half - walk - 0.3);
  const along = rng.range(from + 0.2 * pitch, to - 0.2 * pitch);
  const a = 0.22 * M;
  const b = 0.45 * M;
  const box: Aabb = street.alongZ
    ? { x0: lateral - a / 2, x1: lateral + a / 2, z0: along - b / 2, z1: along + b / 2 }
    : { x0: along - b / 2, x1: along + b / 2, z0: lateral - a / 2, z1: lateral + a / 2 };
  if (painter.mark(box, GULLY_COST, (put) => gully(d.sink, put, box, street.alongZ, painter.iron))) d.count('drain');
}

/** A manhole in the carriageway, off the centre line, and not in every cell. */
function manholeOn(d: Dresser, painter: Painter, rng: Rng, street: Street, walk: number, from: number, to: number): void {
  const pitch = d.grid.pitch;
  if (!rng.chance(MANHOLE_SHARE)) return;
  const r = 0.3 * M;
  const room = street.half - walk - r - 0.3;
  const inner = LINE_HALF + r + 0.25;
  if (room <= inner) return;
  const share = street.side === 0 ? (rng.chance(0.5) ? 1 : -1) : street.side;
  const lateral = street.line + share * rng.range(inner, room);
  const along = rng.range(from + 0.25 * pitch, to - 0.25 * pitch);
  const x = street.alongZ ? lateral : along;
  const z = street.alongZ ? along : lateral;
  const radial = rng.chance(0.5);
  if (painter.mark({ x0: x - r, x1: x + r, z0: z - r, z1: z + r }, MANHOLE_COST, (put) => manhole(d.sink, put, x, z, r, radial, painter.iron))) d.count('manhole');
}
