/**
 * Where a traveller comes down on a walked world, and where the craft stand
 * that are waiting there: pure functions of a town's layout, so the world and
 * `scripts/check-worlds.ts` ask the same question and get the same answer.
 *
 * **One rule, and it is Earth's: never somewhere weird.** Earth lands a
 * traveller in the town picked on the menu's globe, on its ground, clear of
 * every wall. Here a town is chosen in the planet's region stage
 * (`WorldArrival.settlement`) and the traveller stands on its own arrival
 * (`settlements.ts`'s `arrivalOf`: its first avenue, a little out from the
 * square) looking in at the square. Anything else — *Continue* from a place
 * remembered, `/goto`, the map's *join* — that falls inside a town is taken to
 * that town's arrival too; ground outside every town is stood on as found.
 *
 * `?world=<id>` with no `&site=` lands at the **capital**: the town the
 * world's own file names as its spawn, else its most populous.
 *
 * And where what waits at the other towns stands: the rocket's pad off a
 * corner of the square (`padOf`), and at some of them a saucer off another
 * (`ufoParkingOf`) — each asked of the town and of a probe of what is round
 * it, so the world and the check ask the same question.
 */

import type { WorldSpec } from './contract.ts';
import { DEFAULT_ARCHITECTURE } from './contract.ts';
import type { Site } from './settlements.ts';
import { arrivalOf } from './settlements.ts';
import { liveryOf } from './kit.ts';
import type { Livery } from './kit.ts';
import { UFO_RADIUS } from './ufo.ts';
import { rngFrom } from '../scenery/random.ts';
import { ROCKET_CLEAR } from '../rocket.ts';

/** Craft and arrival keep at least this far apart, units: a craft is beside you, never on you. */
export const PARKING_CLEAR = 10;

/** The capital: the town the spec names, else the most populous that is not a landmark. */
export function capitalOf(spec: WorldSpec, sites: readonly Site[]): Site | null {
  if (typeof spec.spawn === 'string') {
    const named = sites.find((site) => site.id === spec.spawn);
    if (named !== undefined) return named;
  }
  let best: Site | null = null;
  for (const site of sites) if (!site.landmark && (best === null || site.population > best.population)) best = site;
  return best;
}

/** The town a direction stands in — inside its paving — or null. */
export function siteAt(sites: readonly Site[], radius: number, dir: { x: number; y: number; z: number }): Site | null {
  const length = Math.hypot(dir.x, dir.y, dir.z) || 1;
  let found: Site | null = null;
  let best = Infinity;
  for (const site of sites) {
    const cos = (site.dir.x * dir.x + site.dir.y * dir.y + site.dir.z * dir.z) / length;
    const away = Math.acos(Math.min(1, Math.max(-1, cos))) * radius;
    if (away < Math.max(site.paving, site.radius) && away < best) [found, best] = [site, away];
  }
  return found;
}

/**
 * Where the `k`th craft stands at a town, in the town's frame, and a point a
 * few units ahead of it for its heading. A craft on the ground waits on an
 * avenue other than the arrival's, out toward the edge and never in the
 * square; what flies stands past
 * the town's edge, where it has room to. A town with one avenue parks its
 * ground craft further out on that avenue, `PARKING_CLEAR` past the traveller.
 */
export function parkingOf(site: Site, k: number, flies: boolean): { x: number; z: number; ahead: { x: number; z: number } } {
  if (site.town !== null && !flies) {
    // **A grid town parks its craft on its main streets**, in the middle of
    // the carriageway a few cells out — east, west, north, never the south,
    // where the traveller comes in — a cell past the craft parked at the kerb.
    const town = site.town;
    const ways = [Math.PI / 2, (3 * Math.PI) / 2, 0];
    const way = ways[k % ways.length]!;
    // A square of one or two cells has no street: its craft wait just outside it.
    const inside = town.grid.cells >= 3 ? Math.min(town.grid.half - 5, town.grid.pitch * 2.5) : town.grid.half + 6;
    const out = inside + Math.floor(k / ways.length) * 8;
    return {
      x: Math.sin(way) * out,
      z: Math.cos(way) * out,
      ahead: { x: Math.sin(way) * (out + 5), z: Math.cos(way) * (out + 5) },
    };
  }
  const count = site.avenues.length;
  const index = count > 1 ? (k + 1) % count : 0;
  const avenue = site.avenues[index]!;
  const arrival = arrivalOf(site);
  const arrivalOut = Math.hypot(arrival.x, arrival.z);
  // On the ground: out toward the edge, and in a hamlet, whose centrepiece
  // fills most of its square, at least a few paces outside the square.
  let out = flies ? site.paving + 16 + k * 6 : Math.max(Math.min(site.paving - 6, site.plaza + 12), site.plaza + 4);
  if (!flies && index === 0) out = arrivalOut + PARKING_CLEAR + 4 + k * 6;
  const x = Math.sin(avenue) * out;
  const z = Math.cos(avenue) * out;
  // Clear of the arrival whatever the avenues' angles: pushed out along its
  // avenue until it is.
  const gap = Math.hypot(x - arrival.x, z - arrival.z);
  const extra = gap < PARKING_CLEAR ? PARKING_CLEAR - gap + 2 : 0;
  const reach = out + extra;
  return {
    x: Math.sin(avenue) * reach,
    z: Math.cos(avenue) * reach,
    ahead: { x: Math.sin(avenue) * (reach + 5), z: Math.cos(avenue) * (reach + 5) },
  };
}

/** What a pad keeps from a road's centre line past its own clearance: the carriageway, its bank and a verge. */
export const PAD_ROAD_CLEAR = 22;

/**
 * The corners of a grid town's square as the signs of x and z, in the order
 * a pad tries them: north-east first, then round — the arrival comes in from
 * the south. No road leaves a square by a corner: a road goes out at the
 * middle of a side, down a main street.
 */
export const SQUARE_CORNERS = [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const;

/** A spot past a town's edge, in the town's frame, with a point ahead of it for its heading; `corner` is which, or -1. */
export interface CornerSpot {
  x: number;
  z: number;
  ahead: { x: number; z: number };
  corner: number;
}

/**
 * Where a town's rocket stands: off the first corner of its square with no
 * road within reach of the pad and the camera that watches it go
 * (`roadNear`, asked in the town's frame); the arrival's parking rule
 * (`parkingOf`, one slot past the `vehicles` waiting there) where none is
 * clear, or for a town that is not a grid.
 */
export function padOf(site: Site, vehicles: number, roadNear: (x: number, z: number, within: number) => boolean): CornerSpot {
  if (site.town !== null) {
    const out = site.town.grid.half + ROCKET_CLEAR + 4;
    for (const [corner, [sx, sz]] of SQUARE_CORNERS.entries()) {
      const x = sx * out;
      const z = sz * out;
      if (roadNear(x, z, ROCKET_CLEAR + PAD_ROAD_CLEAR)) continue;
      return { x, z, ahead: { x: x + sx * 5, z: z + sz * 5 }, corner };
    }
  }
  return { ...parkingOf(site, vehicles, true), corner: -1 };
}

/** The share of grid towns that keep a saucer parked off a corner of their square. */
export const UFO_SHARE = 0.12;
/** How far past the square's side a parked saucer's centre is, along each axis: its footprint and a few paces. */
export const UFO_OUT = UFO_RADIUS + 6;
/** What a parked saucer keeps from a road's centre line past its footprint: a carriageway's half and its verge. */
export const UFO_ROAD_CLEAR = 12;
/** The steepest the ground may fall across a parked saucer's legs, as a grade: 12 degrees. */
export const UFO_GRADE = Math.tan((12 * Math.PI) / 180);

/** What `ufoParkingOf` asks of the ground round a town, every question in the town's frame. */
export interface UfoProbe {
  /** A road's centre line within `within` units of the point. */
  road(x: number, z: number, within: number): boolean;
  /** The point is on another town's or landmark's ground. */
  other(x: number, z: number): boolean;
  /** The ground's height over the radius there. */
  ground(x: number, z: number): number;
}

/**
 * Where a town's saucer is parked, or null where it keeps none: a pure
 * function of the world and the town, so every client parks the same saucers
 * in the same places with nothing on the wire. A share of the grid towns
 * (`UFO_SHARE`, by the town's own seed) keep one, off a corner of the square
 * that is not the rocket's (`padCorner`), tried from a corner of the seed's
 * choosing: clear of every road (`UFO_ROAD_CLEAR`) and every other town's
 * ground, on ground no steeper than `UFO_GRADE` under its legs, facing in at
 * the town. A town whose corners are all taken keeps none. `always` parks
 * one whatever the share says, on the same corner the share would have
 * chosen: the saucer waiting for a traveller come down in the town.
 *
 * Its own town's walls are not asked: they are all inside the square, and the
 * saucer stands `UFO_OUT` past both of its sides, its footprint and six paces
 * clear — which the check holds against every town built (a town's walls are
 * known only once it is, so asking them here would park a saucer by what
 * happened to be standing). Nor are the outposts: the world keeps the spot bare
 * (`Terrain.keepBare`) before any is planned, and an outpost never stands on
 * bare ground.
 */
export function ufoParkingOf(spec: WorldSpec, site: Site, padCorner: number, probe: UfoProbe, always = false): (CornerSpot & { livery: Livery }) | null {
  if (site.landmark || site.town === null) return null;
  const rng = rngFrom('worlds', spec.id, 'ufo', site.id);
  // Drawn whatever `always` says, so the corner and the livery after it are the share's.
  const kept = rng.chance(UFO_SHARE);
  if (!kept && !always) return null;
  const out = site.town.grid.half + UFO_OUT;
  const first = rng.int(SQUARE_CORNERS.length);
  const livery = liveryOf(spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE, rng);
  // The legs' reach, where the ground is read for its fall.
  const span = UFO_RADIUS * 0.65;
  for (let k = 0; k < SQUARE_CORNERS.length; k++) {
    const corner = (first + k) % SQUARE_CORNERS.length;
    if (corner === padCorner) continue;
    const [sx, sz] = SQUARE_CORNERS[corner]!;
    const x = sx * out;
    const z = sz * out;
    if (probe.road(x, z, UFO_RADIUS + UFO_ROAD_CLEAR) || probe.other(x, z)) continue;
    const middle = probe.ground(x, z);
    let level = true;
    for (let j = 0; j < 8 && level; j++) {
      const a = (j / 8) * Math.PI * 2;
      if (Math.abs(probe.ground(x + Math.cos(a) * span, z + Math.sin(a) * span) - middle) / span > UFO_GRADE) level = false;
    }
    if (!level) continue;
    return { x, z, ahead: { x: x - sx * 5, z: z - sz * 5 }, corner, livery };
  }
  return null;
}
