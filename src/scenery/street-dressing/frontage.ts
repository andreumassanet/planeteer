import { cellKey, pavementOf } from '../ground.ts';
import { cellCentre, cellIndex } from '../grid.ts';
import { rngFrom } from '../random.ts';
import type { Rng } from '../random.ts';
import { disc, yawed } from '../solids.ts';
import { aabbOf, overlapping } from './aabb.ts';
import type { Aabb } from './aabb.ts';
import { CLEAR, FRONTAGE_DEPTH, FRONTAGE_SHARE, ITEM_GAP, LINE_BACK, M } from './config.ts';
import type { Dresser } from './dresser.ts';
import { FOOTPRINTS } from './footprints.ts';
import type { Piece } from './footprints.ts';
import { drawPiece } from './furniture.ts';

/** The yaw that turns a piece's front (+Z) to each side: east, north, west, south. */
const FACING_YAW = [Math.PI / 2, 0, -Math.PI / 2, Math.PI] as const;
const SIDE_OUT: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * A cell's plot rectangle, `FRONTAGE_DEPTH` in from one side a street runs
 * along: the strip furniture is laid along.
 */
interface Strip {
  col: number;
  row: number;
  side: number;
  /** The plot line and the along-range, in the town's plane. */
  edge: number;
  from: number;
  to: number;
  depth: number;
  central: number;
}

/**
 * The building-line phase: furniture along the plot lines facing a street,
 * nearest the middle first, a step a strip, then bollards at the middle
 * crossing. Returns how many pieces stood.
 */
export function* layBuildingLineSteps(d: Dresser): Generator<void, number, void> {
  const stand = createStander(d);
  const { input, sink, style } = d;
  const strips = stripsOf(d);

  // The town's singles first, on the strips nearest its middle: a post box, and
  // where the region has them a kiosk and a street clock.
  const singles: Piece[] = ['postbox'];
  if (input.urbanity > 0.15) singles.push('postbox');
  if (style.kiosk && input.urbanity > 0.25) singles.push('kiosk', 'clock');
  const fill = Math.min(0.85, 0.3 + input.urbanity * 0.55);
  let items = 0;
  const most = Math.round(10 + input.urbanity * 70);
  for (const strip of strips) {
    if (items >= most || sink.triangles + 12 > d.cap) break;
    yield;
    const rng = rngFrom(input.seed, 'frontage', strip.col, strip.row, strip.side);
    const [ox, oz] = SIDE_OUT[strip.side]!;
    const alongZ = strip.side % 2 === 0;
    // Village strips thin out towards the edge; a city's hardly do.
    const share = fill * (0.35 + 0.65 * strip.central) + input.urbanity * 0.15;
    let cursor = strip.from + 0.3;
    // A single is tried along a strip near the middle that is deep enough for it, and only there.
    let single = singles.length > 0 && strip.central > 0.3 && FOOTPRINTS[singles[0]!].depth <= strip.depth;
    while (cursor < strip.to - 0.3 && items < most) {
      const piece: Piece = single ? singles[0]! : rng.weighted(style.furniture);
      const foot = FOOTPRINTS[piece];
      if (foot.depth > strip.depth) {
        cursor += 0.6;
        continue;
      }
      const drawn = single || rng.chance(share);
      if (!drawn) {
        cursor += rng.range(1, 3);
        continue;
      }
      const inward = LINE_BACK + foot.depth / 2;
      const along = cursor + foot.width / 2;
      if (along + foot.width / 2 > strip.to - 0.2) break;
      const x = alongZ ? strip.edge - ox * inward : along;
      const z = alongZ ? along : strip.edge - oz * inward;
      if (stand.stand(piece, x, z, strip.side, rng)) {
        items++;
        // One single a strip: the next waits for the next strip, so two post boxes never stand together.
        if (single) {
          singles.shift();
          single = false;
        }
        cursor += foot.width + ITEM_GAP + rng.range(0, 1.5);
      } else {
        // Past whatever was in the way (a building's whole front at once) or half a unit on.
        const by = stand.refused.by;
        const past = by === null ? -Infinity : (alongZ ? by.z1 : by.x1) - (along - foot.width / 2) + ITEM_GAP;
        cursor += Math.max(0.5, past);
      }
    }
  }
  layBollards(d, stand.stand);
  return items;
}

interface Stander {
  /** Stands one piece with its front on a street side; false if it did not fit. */
  stand(piece: Piece, x: number, z: number, side: number, rng: Rng): boolean;
  /** What stood in the way of the last piece refused, so the next try can start past it. */
  refused: { by: Aabb | null };
}

/** The obstacle index and the placement test every piece on the building line goes through. */
function createStander(d: Dresser): Stander {
  const { input, grid, sink, solids, seats, matrix, at, style } = d;
  // Everything in the way, and what this places, bucketed by the cells each
  // box reaches: a city stands a thousand walls, and a strip asks about its own.
  const buckets = new Map<number, Aabb[]>();
  const file = (box: Aabb): void => {
    for (let col = cellIndex(grid, box.x0); col <= cellIndex(grid, box.x1); col++) {
      for (let row = cellIndex(grid, box.z0); row <= cellIndex(grid, box.z1); row++) {
        const key = cellKey(col, row);
        const list = buckets.get(key);
        if (list === undefined) buckets.set(key, [box]);
        else list.push(box);
      }
    }
  };
  for (const solid of input.solids) file(aabbOf(solid, CLEAR));
  for (let i = 0; i + 2 < input.discs.length; i += 3) {
    const r = input.discs[i + 2]! + CLEAR;
    file({ x0: input.discs[i]! - r, x1: input.discs[i]! + r, z0: input.discs[i + 1]! - r, z1: input.discs[i + 1]! + r });
  }
  const refused: { by: Aabb | null } = { by: null };
  const clearOf = (box: Aabb): boolean => {
    for (let col = cellIndex(grid, box.x0); col <= cellIndex(grid, box.x1); col++) {
      for (let row = cellIndex(grid, box.z0); row <= cellIndex(grid, box.z1); row++) {
        for (const other of buckets.get(cellKey(col, row)) ?? []) {
          if (!overlapping(box, other)) continue;
          refused.by = other;
          return false;
        }
      }
    }
    return true;
  };

  const stand = (piece: Piece, x: number, z: number, side: number, rng: Rng): boolean => {
    refused.by = null;
    const foot = FOOTPRINTS[piece];
    if (sink.triangles + foot.cost > d.cap) return false;
    const across = side % 2 === 0;
    const hx = (across ? foot.depth : foot.width) / 2;
    const hz = (across ? foot.width : foot.depth) / 2;
    const box: Aabb = { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
    if (!clearOf({ x0: box.x0 - ITEM_GAP / 2, x1: box.x1 + ITEM_GAP / 2, z0: box.z0 - ITEM_GAP / 2, z1: box.z1 + ITEM_GAP / 2 })) return false;
    if (d.inMouth(box)) return false;
    const level = d.levelUnder(box, 0.4);
    if (level === null) return false;
    input.seat(x, z, level, at);
    const yaw = FACING_YAW[side]!;
    matrix.makeRotationY(yaw).setPosition(at[0]!, at[1]!, at[2]!);
    sink.place(matrix);
    const fits = d.afford(() => drawPiece(sink, rng, piece, style, input.iso, input.models));
    if (!fits) return false;
    file(box);
    seats.push({ kind: piece, x: at[0]!, y: at[1]!, z: at[2]!, lift: 0 });
    d.count(piece);
    const wall = foot.solid;
    if (wall !== null) {
      const top = input.floorRadius(level) + wall.height;
      solids.push(wall.round ? disc(x, z, wall.hx, top) : yawed(x, z, yaw, wall.hx, wall.hz, top));
    }
    return true;
  };
  return { stand, refused };
}

/** The strips along the building line, nearest the middle first. */
function stripsOf(d: Dresser): Strip[] {
  const { input, grid, levels } = d;
  const cells = grid.cells;
  const half = grid.half;
  const strips: Strip[] = [];
  for (const { col, row, d: dist } of d.order) {
    if (col === d.middle && row === d.middle) continue;
    if (grid.avenue[col] === 1 || grid.avenue[row] === 1) continue;
    const rect = input.plotRect(col, row);
    if (rect.x1 - rect.x0 < 1 || rect.z1 - rect.z0 < 1) continue;
    const central = Math.max(0, 1 - dist / Math.max(1, half));
    const street = (index: number, low: boolean, alongZ: boolean): boolean => {
      const flag = low ? grid.low[index] : grid.high[index];
      const next = low ? index - 1 : index + 1;
      if (flag === 1) return levels.has(alongZ ? cellKey(next, row) : cellKey(col, next));
      return next >= 0 && next < cells && grid.avenue[next] === 1;
    };
    const sides: [number, boolean][] = [
      [0, street(col, false, true)],
      [1, street(row, false, false)],
      [2, street(col, true, true)],
      [3, street(row, true, false)],
    ];
    for (const [side, open] of sides) {
      if (!open) continue;
      const alongZ = side % 2 === 0;
      const edge = side === 0 ? rect.x1 : side === 1 ? rect.z1 : side === 2 ? rect.x0 : rect.z0;
      const depth = Math.min(FRONTAGE_DEPTH, (alongZ ? rect.x1 - rect.x0 : rect.z1 - rect.z0) * FRONTAGE_SHARE);
      strips.push({ col, row, side, edge, from: alongZ ? rect.z0 : rect.x0, to: alongZ ? rect.z1 : rect.x1, depth, central });
    }
  }
  return strips;
}

/**
 * Bollards along the kerbs of the four arms of a city's middle crossing, on
 * the pavement's outer edge where a car would mount it, the first few metres
 * out from the zebras.
 */
function layBollards(d: Dresser, stand: Stander['stand']): void {
  const { input, grid, levels, middle } = d;
  if (!(middle >= 0 && input.urbanity > 0.3 && levels.has(cellKey(middle, middle)))) return;
  const pitch = grid.pitch;
  const walk = pavementOf(pitch * 0.5);
  const kerb = pitch * 0.5 - walk + 0.12 + FOOTPRINTS.bollard.depth / 2;
  const c = cellCentre(grid, middle);
  for (let side = 0; side < 4; side++) {
    const [ox, oz] = SIDE_OUT[side]!;
    const rng = rngFrom(input.seed, 'bollards', side);
    for (const across of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        // Out along the arm from the crossing's edge, and across it to the kerb.
        const out = pitch * 0.5 + 0.8 + k * 0.6 * M;
        const x = c + ox * out + (ox === 0 ? across * kerb : 0);
        const z = c + oz * out + (oz === 0 ? across * kerb : 0);
        stand('bollard', x, z, side, rng);
      }
    }
  }
}
