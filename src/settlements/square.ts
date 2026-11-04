import type { World } from '../geo.ts';
import { guildParcelSteps, guildSquares, inGuild } from '../guild/sites.ts';
import type { GuildChoice } from '../guild/sites.ts';
import { guildLayout } from '../guild/square.ts';
import type { Place } from '../places.ts';
import { heldGates } from '../roads.ts';
import { cellCentre, gatesOf, gridAround, landmarkParcel, openAround, outskirtsOf, streetBand, townGrid, townTerraces } from '../scenery/grid.ts';
import type { Parcel, TownGrid } from '../scenery/grid.ts';
import { MAX_CUT, cellKey } from '../scenery/ground.ts';
import { rngFrom } from '../scenery/random.ts';
import type { TownFrame } from './frame.ts';
import { civicCorner } from './plan.ts';
import { keepoutReaches } from './rules.ts';
import type { Slot } from './types.ts';

/**
 * The square a town stands on, before anything stands on it: the town frame
 * about its centre, the keepouts and parcels, the guild's square where the
 * town has one (`guilds`, `guildParcel`), and every cell's terrace, with
 * the outskirts and the unused gate cells too deep to cut taken out. A raise
 * and a map plan both begin here, so they agree on which cells a town paves.
 * Null where the frame cannot be built.
 *
 * A town does not move aside for a landmark: its square and gates are fixed by
 * the place, so the cells under a landmark are paved and left unbuilt.
 */
export function* squareSteps(
  frame: TownFrame,
  world: World,
  slot: Slot,
  roadGates: ReadonlyMap<Place, number[]>,
  broken: string[],
  guilds: (place: Place) => boolean,
): Generator<void, TownGrid | null, void> {
  const { up, basis, keepouts, parcels, parcelOwners, terraces } = frame;
  up.copy(slot.direction);
  frame.frameAt();
  if (basis.determinant() <= 0) {
    slot.failed = true;
    broken.push(`${slot.place.name}: settlement basis has determinant ${basis.determinant()}`);
    return null;
  }

  const square = townGrid(slot.radius);
  parcels.length = 0;
  parcelOwners.length = 0;
  for (const keepout of keepouts) {
    const parcel = landmarkParcel(square, keepout.x, keepout.z, keepout.shape);
    if (parcel === null) continue;
    parcels.push(parcel);
    parcelOwners.push(keepout);
  }
  // A landmark's streets stay whole round it.
  let grid = gridAround(slot.radius, parcels);
  frame.grid = grid;
  frame.guild = null;
  frame.base = Math.max(0, world.elevationAt(up));
  frame.corners.clear();
  frame.shores.clear();
  terraces.clear();
  // Every cell's terrace: `townTerraces` is the one definition, which the roads ask through `gateLevel`.
  for (const [key, level] of townTerraces(grid, frame.ground, heldGates(slot.place))) terraces.set(key, level);
  yield;
  // The guild's square, by the crossing on one terrace; its streets stay whole round it too.
  const roadCells = (roadGates.get(slot.place) ?? []).flatMap((index) => (gatesOf(grid)[index]?.cells ?? []).map(([col, row]) => cellKey(col, row)));
  const chosen = guildSquares.enabled && guilds(slot.place) ? yield* chooseGuildSteps(frame, square, slot, roadCells) : null;
  const guild = chosen?.parcel ?? null;
  if (chosen !== null) {
    yield;
    for (const [key, level] of chosen.levels) terraces.set(key, level);
    grid = openAround(grid, chosen.parcel);
    shutWithin(grid, chosen.parcel);
    frame.grid = grid;
  }
  // The outskirts are taken out after the levels, so a street keeps the level
  // its whole group was cut to. The streets roads come in by and the cells
  // under a landmark are kept whole.
  const kept = new Set<number>();
  const gates = gatesOf(grid);
  const roads = roadGates.get(slot.place) ?? [];
  for (const index of roads) {
    const gate = gates[index];
    if (gate === undefined) continue;
    for (const [col, row] of gate.cells) {
      for (let c = 0; c < grid.cells; c++) kept.add(gate.outX !== 0 ? cellKey(c, row) : cellKey(col, c));
    }
  }
  const half = grid.pitch * 0.5;
  yield;
  const outskirts = outskirtsOf(grid, slot.seed, (col, row) => kept.has(cellKey(col, row)) || frame.parcelCell(col, row) || inGuild(guild, col, row) || keepouts.some((keepout) => {
    const cx = cellCentre(grid, col);
    const cz = cellCentre(grid, row);
    return keepoutReaches(keepout, cx - half, cx + half, cz - half, cz + half);
  }));
  for (const key of outskirts) terraces.set(key, null);
  // A gate no road uses may not be cut deeper than any other cell
  // (`GATE_CUT` is for roads); past `MAX_CUT` it is left unpaved.
  const used = new Set<number>();
  for (const index of roads) {
    for (const [col, row] of gates[index]?.cells ?? []) used.add(cellKey(col, row));
  }
  for (const gate of gates) {
    for (const [col, row] of gate.cells) {
      const key = cellKey(col, row);
      if (used.has(key) || terraces.get(key) == null) continue;
      let high = -Infinity;
      let low = Infinity;
      for (const [i, j] of [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]] as const) {
        const elevation = frame.ground.corner(i, j);
        high = Math.max(high, elevation);
        low = Math.min(low, elevation);
      }
      if (high - low > MAX_CUT) terraces.set(key, null);
    }
  }
  if (guild !== null) {
    frame.guild = guildLayout(grid, streetBand(grid, slot.ground.street), guild, (col, row) => frame.terraceAt(col, row) !== null && !frame.parcelCell(col, row));
  }
  return grid;
}

/**
 * Closes the bands of street inside a guild's parcel in the town's own copy
 * of the square (`openAround` made it), so nothing laid on a street, a ramp
 * or a flight, is laid inside the square; its edges stay open.
 */
function shutWithin(grid: TownGrid, parcel: Parcel): void {
  const n = grid.cells;
  for (let col = parcel.c0; col <= parcel.c1; col++) {
    for (let row = parcel.r0; row <= parcel.r1; row++) {
      if (col < parcel.c1) grid.shut[col * n + row]! |= 1 << 0;
      if (col > parcel.c0) grid.shut[col * n + row]! |= 1 << 2;
      if (row < parcel.r1) grid.shut[col * n + row]! |= 1 << 1;
      if (row > parcel.r0) grid.shut[col * n + row]! |= 1 << 3;
    }
  }
}

/** The guild's parcel in this town and the terraces it is cut into, or null: clear of every landmark's cells, the civic block left to the civic building. */
function* chooseGuildSteps(frame: TownFrame, square: TownGrid, slot: Slot, roadCells: readonly number[]): Generator<void, GuildChoice | null, void> {
  // The choice is the place's own, the same every time it is asked: worked out once, its terraces' cut kept.
  const known = choices.get(slot.place);
  if (known !== undefined) return known;
  const made = yield* chooseGuildOnce(frame, square, slot, roadCells);
  choices.set(slot.place, made);
  return made;
}

/** Each guild town's square, kept from its first raise or plan: a try cuts the whole town's terraces, a step tens of ms long. */
const choices = new Map<Place, GuildChoice | null>();

function* chooseGuildOnce(frame: TownFrame, square: TownGrid, slot: Slot, roadCells: readonly number[]): Generator<void, GuildChoice | null, void> {
  const half = square.pitch * 0.5;
  const taken = (col: number, row: number): boolean => {
    if (frame.parcelCell(col, row)) return true;
    const cx = cellCentre(square, col);
    const cz = cellCentre(square, row);
    return frame.keepouts.some((keepout) => keepoutReaches(keepout, cx - half, cx + half, cz - half, cz + half));
  };
  return yield* guildParcelSteps(square, frame.terraces, frame.ground, heldGates(slot.place), roadCells, taken, civicCorner(rngFrom(slot.seed, 'civic')), slot.seed);
}
