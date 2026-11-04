/**
 * The Explorers' Guild in a grid town of another world: which towns keep one
 * (`GUILD_TOWNS` of each world's biggest, where the square holds one), the
 * block of cells its square takes, and the square's layout. The block is
 * Earth's own choice (`guildParcelSteps`) on level ground with no gates to
 * keep, and the layout Earth's own (`guildLayout`), so a square on Mars has
 * the same hall, fountain, boards, stalls and six people's spots as one in
 * Madrid; only what it is built from is the world's (`settlements/guild-build.ts`).
 *
 * Pure: a function of the world and the town, as the rest of a grid town is.
 */

import { GUILD_MIN_CELLS, guildParcelSteps } from '../../guild/sites.ts';
import type { GuildParcel } from '../../guild/sites.ts';
import { guildLayout } from '../../guild/square.ts';
import type { GuildLayout } from '../../guild/square.ts';
import { cellCentre, townGrid } from '../../scenery/grid.ts';
import type { TownGrid } from '../../scenery/grid.ts';
import { cellKey } from '../../scenery/ground.ts';
import { townRadii } from '../../system/contract.ts';
import type { WorldSpec } from '../contract.ts';
import type { Street } from './types.ts';

/** How many of a world's towns keep a guild: its biggest whose squares hold one. */
export const GUILD_TOWNS = 3;

const chosen = new Map<string, readonly string[]>();

/** The ids of the towns with a guild, biggest first. None where the civilisation builds no grid towns. */
export function worldGuildTowns(spec: WorldSpec): readonly string[] {
  const known = chosen.get(spec.id);
  if (known !== undefined) return known;
  const ids: string[] = [];
  if (spec.civilisation?.architecture.colony !== undefined) {
    const radii = townRadii(spec.body, spec.landmarks);
    const towns = [...spec.body.settlements].sort((a, b) => b.population - a.population || (a.id < b.id ? -1 : 1));
    for (const town of towns) {
      if (ids.length >= GUILD_TOWNS) break;
      const radius = radii.get(town.id);
      if (radius !== undefined && townGrid(radius).cells >= GUILD_MIN_CELLS) ids.push(town.id);
    }
  }
  chosen.set(spec.id, ids);
  return ids;
}

/** A grid town's guild: the parcel, the layout on it, and the paving it takes in the town's plane, `[x0, z0, x1, z1]`. */
export interface WorldGuild {
  parcel: GuildParcel;
  layout: GuildLayout;
  paving: [number, number, number, number];
}

/** The grid as the worlds draw it: every stretch of every street open. */
const openGrid = (grid: TownGrid): TownGrid => ({ ...grid, shut: new Uint8Array(grid.shut.length) });

/**
 * The town's guild, or null where it keeps none or no block will do. `taken`
 * says which cells are spoken for already (the landing pad's block); the hub's
 * block, north-east of the crossing, is left to it as Earth leaves its civic
 * building's. `band` is a street's half-width on a cell boundary.
 */
export function worldGuildOf(spec: WorldSpec, id: string, grid: TownGrid, band: number, taken: (col: number, row: number) => boolean): WorldGuild | null {
  if (!worldGuildTowns(spec).includes(id)) return null;
  const open = openGrid(grid);
  const levels = new Map<number, number | null>();
  for (let col = 0; col < grid.cells; col++) for (let row = 0; row < grid.cells; row++) levels.set(cellKey(col, row), 0);
  const ground = { corner: () => 1, sea: () => false, base: 0 };
  const steps = guildParcelSteps(open, levels, ground, undefined, [], taken, [1, 1], `worlds:${spec.id}:${id}`);
  let step = steps.next();
  while (step.done !== true) step = steps.next();
  const parcel = step.value?.parcel ?? null;
  if (parcel === null) return null;
  const inside = (col: number, row: number): boolean => col >= 0 && row >= 0 && col < grid.cells && row < grid.cells;
  const layout = guildLayout(open, band, parcel, inside);
  // The paving runs out to the kerb of every street round it.
  const edge = 0.6;
  const half = grid.pitch / 2;
  const paving: [number, number, number, number] = [
    Math.max(layout.x0 - edge, cellCentre(grid, parcel.c0) - half),
    Math.max(layout.z0 - edge, cellCentre(grid, parcel.r0) - half),
    Math.min(layout.x1 + edge, cellCentre(grid, parcel.c1) + half),
    Math.min(layout.z1 + edge, cellCentre(grid, parcel.r1) + half),
  ];
  return { parcel, layout, paving };
}

/** Whether a cell is the guild's. */
export function inWorldGuild(guild: WorldGuild | null, col: number, row: number): boolean {
  if (guild === null) return false;
  const { c0, c1, r0, r1 } = guild.parcel;
  return col >= c0 && col <= c1 && row >= r0 && row <= r1;
}

/**
 * The stretch of a street the guild's paving takes, along its own axis, or
 * null: only a street running through the square's middle, never one along
 * its side, which the square looks onto.
 */
export function guildCut(guild: WorldGuild | null, street: Street): [number, number] | null {
  if (guild === null) return null;
  const [x0, z0, x1, z1] = guild.paving;
  const eps = 1e-3;
  if (street.axis === 'x') return street.at > z0 + eps && street.at < z1 - eps ? [x0, x1] : null;
  return street.at > x0 + eps && street.at < x1 - eps ? [z0, z1] : null;
}

/** `[from, to]` less a cut, as the pieces left. */
export function withoutCut(from: number, to: number, cut: [number, number] | null): [number, number][] {
  if (cut === null || cut[1] <= from || cut[0] >= to) return [[from, to]];
  const out: [number, number][] = [];
  if (cut[0] > from) out.push([from, cut[0]]);
  if (cut[1] < to) out.push([cut[1], to]);
  return out;
}
