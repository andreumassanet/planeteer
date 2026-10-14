/**
 * A walked world's nations as the maps stroke them: which ring edges are
 * frontiers, and each nation's rings joined back along the straight cuts
 * `geography.ts` keeps every ring inside one tile with.
 *
 * Here rather than in `worlds/` because the start menu draws them too — its
 * highlight ribbon runs round a nation's outline, and round the raw rings it
 * ran down a meridian and along the equator wherever a nation crossed one —
 * and the menu loads `src/system/` without the walking engine.
 */

import type { World } from '../geo.ts';
import type { Geography } from './geography.ts';
import { joinNation } from './outlines/join.ts';

/** An edge's endpoints as a key either way round, rounded past any float noise in the shared arrays. */
const pointKey = (lon: number, lat: number): string => `${lon.toFixed(6)},${lat.toFixed(6)}`;
const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The class of every ring edge of `world`: 0 a frontier, 2 a cut between two pieces of one nation. */
export function frontierEdges(world: World, geography: Geography): Uint8Array[] {
  const shared = new Set<string>();
  for (const frontier of geography.frontiers) {
    const points = frontier.points;
    for (let k = 0; k + 1 < points.length; k++) {
      shared.add(edgeKey(pointKey(points[k]![0]!, points[k]![1]!), pointKey(points[k + 1]![0]!, points[k + 1]![1]!)));
    }
  }
  return (world.rings ?? []).map((ring) => {
    const n = ring.points.length;
    const flags = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      const a = ring.points[k]!;
      const b = ring.points[(k + 1) % n]!;
      flags[k] = shared.has(edgeKey(pointKey(a[0]!, a[1]!), pointKey(b[0]!, b[1]!))) ? 0 : 2;
    }
    return flags;
  });
}

/**
 * The world for a map that strokes every ring it fills: each nation's rings
 * joined back along their cuts, so its outline is its frontiers and nothing
 * else. The minimap inks the outline of the nation you stand in; drawn from
 * `geography.world`'s rings, a nation across the equator came out with a
 * straight ink line through it.
 *
 * The cuts are lattice lines — a meridian or a parallel — and the two pieces
 * either side do not always break them at the same points, so each cut edge is
 * first split at every vertex of the nation that lies on it; then each edge
 * that the other piece runs the other way is dropped, and what is left is
 * chained into loops. A loop wound against the rings (a hole round an enclave)
 * is left out: the enclave's own ring, smaller, is painted over its
 * neighbour's as `minimap.ts` paints every enclave. A nation whose edges do not
 * close into loops keeps its rings as they were. `countryAt` and `rings` are
 * the world's own: only the drawing changes.
 */
export function outlinesOf(geography: Geography): World {
  const known = joined.get(geography);
  if (known !== undefined) return known;
  const outlines = joinOutlines(geography);
  joined.set(geography, outlines);
  return outlines;
}

/** One world's joined outlines, built once: the minimap, the menu and the check share them. */
const joined = new WeakMap<Geography, World>();

function joinOutlines(geography: Geography): World {
  const world = geography.world;
  const flags = frontierEdges(world, geography);
  const countries = geography.countries.map((country, index) => joinNation(world, country, index + 1, flags));
  return { ...world, countries };
}
