/**
 * Where the Explorers' Guild stands: which towns have one, and which block of
 * a town's cells its square takes. Pure functions of the places and of the
 * town's own square and terraces, so the town that paves it, the map that
 * draws it and the checks that hold it all agree.
 *
 * A guild's square is a parcel, as a landmark's is (`landmarkParcel`): whole
 * cells, paved as one, no street through it, the streets round it kept whole
 * (`gridAround`). It is laid by the town's middle crossing, never on the
 * square's edge, so it takes no gate and the road bake never hears of it; and
 * on one terrace, so it is one level from side to side, raised to it where it
 * must be without moving any gate's level.
 */
import { isShown, prominenceVersion, radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { townGrid, townTerraces } from '../scenery/grid.ts';
import type { Parcel, TownGrid, TownGround } from '../scenery/grid.ts';
import { TERRACE_STEP, cellKey } from '../scenery/ground.ts';
import { rngFrom } from '../scenery/random.ts';

/** Whether towns build their guild's square at all: the switch for an A/B and for pricing one. */
export const guildSquares = { enabled: true };

/** The population over which a town has a guild, capital or not. */
export const GUILD_POPULATION = 500_000;

/** The fewest cells a side a town's square must have to hold one: a three-by-three block off its crossing. */
export const GUILD_MIN_CELLS = 8;

/** Cells a side at which the square takes four by four; under it three by three. */
const GUILD_WIDE = 10;

/** How many cells a guild keeps between itself and a landmark's parcel. */
const LANDMARK_GAP = 1;

/** The block a guild's square takes, and how it is laid. */
export interface GuildParcel extends Parcel {
  /** The corner of the middle crossing it is at: +1 or -1 along x and along z. */
  sx: 1 | -1;
  sz: 1 | -1;
  /** The one terrace every cell of it is cut to. */
  level: number;
  /** The side of the parcel the hall backs onto (`Gate.side`: 0 +x, 1 +z, 2 -x, 3 -z); it faces the other way. */
  hallSide: number;
}

/** Whether a town's square is big enough for a guild, by its built radius. */
function roomFor(place: Place): boolean {
  return townGrid(radiusOf(place)).cells >= GUILD_MIN_CELLS;
}

const chosen = new WeakMap<readonly Place[], { version: number; set: Set<Place>; indices: number[] }>();

/**
 * The towns with a guild, by index into `places`: every built capital and
 * every built town of `GUILD_POPULATION` or more whose square holds one, and
 * in a country left without, its biggest built town that does. Cached per
 * list and per prominence (`isShown` moves with the knob).
 */
export function guildPlaces(places: readonly Place[]): readonly number[] {
  return guildsOf(places).indices;
}

/** Whether `place`, one of `places`, has a guild: `guildPlaces`'s answer. */
export function hasGuild(place: Place, places: readonly Place[]): boolean {
  return guildsOf(places).set.has(place);
}

function guildsOf(places: readonly Place[]): { set: Set<Place>; indices: number[] } {
  const version = prominenceVersion();
  const known = chosen.get(places);
  if (known !== undefined && known.version === version) return known;
  const set = new Set<Place>();
  const biggest = new Map<string, Place>();
  for (const place of places) {
    if (!isShown(place) || !roomFor(place)) continue;
    if (place.capital === true || place.pop >= GUILD_POPULATION) set.add(place);
    const best = biggest.get(place.iso);
    if (best === undefined || place.pop > best.pop) biggest.set(place.iso, place);
  }
  const served = new Set<string>();
  for (const place of set) served.add(place.iso);
  for (const [iso, place] of biggest) if (!served.has(iso)) set.add(place);
  const indices: number[] = [];
  places.forEach((place, index) => {
    if (set.has(place)) indices.push(index);
  });
  const made = { version, set, indices };
  chosen.set(places, made);
  return made;
}

/**
 * The cells off the middle crossing along one axis: `size` of them on the
 * `sign` side, starting `offset` cells out from it (0 is against the main
 * street), as `[first, last]`. An even offset keeps to the blocks.
 */
function runFrom(cells: number, size: number, sign: 1 | -1, offset: number): [number, number] {
  // Odd: the main street is the middle cell; even: the boundary at the middle.
  const after = (cells % 2 === 1 ? (cells + 1) / 2 : cells / 2) + offset;
  const before = (cells % 2 === 1 ? (cells - 1) / 2 - 1 : cells / 2 - 1) - offset;
  return sign > 0 ? [after, after + size - 1] : [before - size + 1, before];
}

/**
 * The blocks tried, as cells along x and z and how far out from the
 * crossing along each, in the order they are tried: a big square takes four
 * by four, a smaller one three by three; against the crossing first, then a
 * block out, then a narrower block where a hillside refuses the rest.
 */
function shapesFor(cells: number): readonly (readonly [number, number, number, number])[] {
  const square = cells >= GUILD_WIDE ? [4, 3] : [3];
  const out: [number, number, number, number][] = [];
  for (const offsets of [[[0, 0]], [[0, 2], [2, 0], [2, 2]], [[0, 4], [4, 0], [2, 4], [4, 2]]] as const) {
    for (const size of square) for (const [ox, oz] of offsets) out.push([size, size, ox, oz]);
  }
  const narrow = cells >= GUILD_WIDE ? [[4, 2], [2, 4], [3, 2], [2, 3], [2, 2]] : [[3, 2], [2, 3], [2, 2]];
  for (const [ox, oz] of [[0, 0], [0, 2], [2, 0], [2, 2]] as const) for (const [w, d] of narrow) out.push([w!, d!, ox, oz]);
  return out;
}

/** How many blocks that pass the quick tests may be cut to one terrace and tried, at most. */
const TRIES = 24;

/** A guild's parcel, and the town's terraces with it paved as one. */
export interface GuildChoice {
  parcel: GuildParcel;
  levels: Map<number, number | null>;
}

/**
 * Where a town's guild goes, or null where no block near its crossing will do.
 *
 * `levels` is the town's terraces (`townTerraces`, the one definition; it
 * reads the plan's streets and never the closures a parcel changes, so there
 * is no circle), `ground` its corners and `held` its held gates, as the
 * terraces were cut with; `taken` the cells a landmark has (its parcel, or its
 * keepout reaching in), and `civic` the corner of the crossing whose
 * two-by-two block the civic building takes, which is left to it.
 *
 * A block may be the guild's when none of its cells is on the square's edge
 * (where the gates are) or within `LANDMARK_GAP` of a landmark's, every corner
 * is dry, and its cells are paved within one `TERRACE_STEP` of each other. It
 * is then raised to its highest (`townTerraces`' `floors`, only ever up), and
 * taken if it comes out on one terrace and no cell of `gateCells` (the gates
 * the town's roads come in by) moved, so the roads meet the town as they
 * always did. At each shape the corners are tried the
 * civic one's diagonal first, then the other two in an order the seed draws,
 * then the civic one's own.
 */
export function* guildParcelSteps(
  grid: TownGrid,
  levels: ReadonlyMap<number, number | null>,
  ground: TownGround,
  held: ReadonlyMap<number, number> | undefined,
  gateCells: readonly number[],
  taken: (col: number, row: number) => boolean,
  civic: readonly [1 | -1, 1 | -1],
  seed: string,
): Generator<void, GuildChoice | null, void> {
  const n = grid.cells;
  if (n < GUILD_MIN_CELLS) return null;
  const rng = rngFrom(seed, 'guild');
  const flip = (sign: 1 | -1): 1 | -1 => (sign > 0 ? -1 : 1);
  const others: [1 | -1, 1 | -1][] = [[civic[0], flip(civic[1])], [flip(civic[0]), civic[1]]];
  if (rng.chance(0.5)) others.reverse();
  const corners: [1 | -1, 1 | -1][] = [[flip(civic[0]), flip(civic[1])], ...others, [civic[0], civic[1]]];
  const across = rng.chance(0.5);
  const [cc0, cc1] = runFrom(n, 2, civic[0], 0);
  const [cr0, cr1] = runFrom(n, 2, civic[1], 0);
  let tries = 0;
  for (const [w, d, ox, oz] of shapesFor(n)) {
    for (const [sx, sz] of corners) {
      const [c0, c1] = runFrom(n, w, sx, ox);
      const [r0, r1] = runFrom(n, d, sz, oz);
      // Never over the civic building's block.
      if (c0 <= cc1 && c1 >= cc0 && r0 <= cr1 && r1 >= cr0) continue;
      const top = blockTop(grid, levels, ground, taken, c0, c1, r0, r1);
      if (top === null || tries >= TRIES) continue;
      // Each try cuts the whole town's terraces again: a step each.
      if (tries++ > 0) yield;
      const cut = cutAsOne(grid, levels, ground, held, gateCells, c0, c1, r0, r1, top);
      if (cut === null) continue;
      // The hall backs onto a long side, away from the crossing; on a square block either.
      const alongZ = w === d ? across : w > d;
      const hallSide = alongZ ? (sz > 0 ? 1 : 3) : (sx > 0 ? 0 : 2);
      return { parcel: { c0, c1, r0, r1, sx, sz, level: cut.level, hallSide }, levels: cut.levels };
    }
  }
  return null;
}

/**
 * The town's terraces with a block raised to `top`, and the one level it
 * comes out on; null where it does not come out on one, or a gate moved.
 */
function cutAsOne(
  grid: TownGrid,
  levels: ReadonlyMap<number, number | null>,
  ground: TownGround,
  held: ReadonlyMap<number, number> | undefined,
  gateCells: readonly number[],
  c0: number, c1: number, r0: number, r1: number, top: number,
): { level: number; levels: Map<number, number | null> } | null {
  const floors = new Map<number, number>();
  let lower = false;
  for (let col = c0; col <= c1; col++) {
    for (let row = r0; row <= r1; row++) {
      floors.set(cellKey(col, row), top);
      if ((levels.get(cellKey(col, row)) ?? top) < top - 1e-6) lower = true;
    }
  }
  const cut = lower ? townTerraces(grid, ground, held, floors) : new Map(levels);
  let level: number | null = null;
  for (const key of floors.keys()) {
    const here = cut.get(key) ?? null;
    if (here === null) return null;
    if (level === null) level = here;
    else if (Math.abs(here - level) > 1e-6) return null;
  }
  for (const key of gateCells) {
    const was = levels.get(key) ?? null;
    const now = cut.get(key) ?? null;
    if (was === null ? now !== null : now === null || Math.abs(now - was) > 1e-6) return null;
  }
  if (level === null) return null;
  // A band through the block meets the town's own street where it leaves; on
  // another level, the ramp or flight that climbs it would reach in.
  const differs = (col: number, row: number): boolean => {
    const there = cut.get(cellKey(col, row)) ?? null;
    return there !== null && Math.abs(there - level!) > 1e-6;
  };
  for (let row = r0; row <= r1; row++) {
    const inner = (grid.high[row] === 1 && row < r1) || (grid.low[row] === 1 && row > r0);
    if (inner && (differs(c0 - 1, row) || differs(c1 + 1, row))) return null;
  }
  for (let col = c0; col <= c1; col++) {
    const inner = (grid.high[col] === 1 && col < c1) || (grid.low[col] === 1 && col > c0);
    if (inner && (differs(col, r0 - 1) || differs(col, r1 + 1))) return null;
  }
  return { level, levels: cut };
}

/** The highest level of a block that may be the guild's, or null where it may not. */
function blockTop(
  grid: TownGrid,
  levels: ReadonlyMap<number, number | null>,
  ground: TownGround,
  taken: (col: number, row: number) => boolean,
  c0: number, c1: number, r0: number, r1: number,
): number | null {
  const n = grid.cells;
  if (c0 < 1 || r0 < 1 || c1 > n - 2 || r1 > n - 2) return null;
  let high = -Infinity;
  let low = Infinity;
  for (let col = c0; col <= c1; col++) {
    for (let row = r0; row <= r1; row++) {
      const here = levels.get(cellKey(col, row)) ?? null;
      if (here === null || ground.sea(col, row)) return null;
      high = Math.max(high, here);
      low = Math.min(low, here);
    }
  }
  if (high - low > TERRACE_STEP + 1e-6) return null;
  for (let i = c0; i <= c1 + 1; i++) {
    for (let j = r0; j <= r1 + 1; j++) if (!(ground.corner(i, j) > 0)) return null;
  }
  for (let col = c0 - LANDMARK_GAP; col <= c1 + LANDMARK_GAP; col++) {
    for (let row = r0 - LANDMARK_GAP; row <= r1 + LANDMARK_GAP; row++) if (taken(col, row)) return null;
  }
  return high;
}

/** Whether a cell is in a guild's parcel. */
export function inGuild(parcel: Parcel | null, col: number, row: number): boolean {
  return parcel !== null && col >= parcel.c0 && col <= parcel.c1 && row >= parcel.r0 && row <= parcel.r1;
}
