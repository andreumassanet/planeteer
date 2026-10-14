import * as THREE from 'three';
import type { Country, LandRing, World } from '../../geo.ts';
import { unitAt } from '../../sphere.ts';
import { flatArea, leftArea, sideOf } from './area.ts';

const unit = new THREE.Vector3();
const keyOf = (p: number[]): string => {
  unitAt(p[1]!, p[0]!, unit);
  return `${unit.x.toFixed(7)},${unit.y.toFixed(7)},${unit.z.toFixed(7)}`;
};
const wrap = (lon: number): number => (lon >= 180 ? lon - 360 : lon);
const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

interface KeyedEdge {
  a: number[];
  from: string;
  to: string;
}

/** Every edge of a nation's rings, its cuts split at the nation's own vertices along them. */
function splitEdges(rings: { ring: LandRing; r: number }[], flags: readonly Uint8Array[]): [number[], number[]][] {
  const vertices = rings.flatMap(({ ring }) => ring.points);
  const edges: [number[], number[]][] = [];
  for (const { ring, r } of rings) {
    const n = ring.points.length;
    for (let k = 0; k < n; k++) {
      const a = ring.points[k]!;
      const b = ring.points[(k + 1) % n]!;
      if (flags[r]![k] !== 2) {
        edges.push([a, b]);
        continue;
      }
      const meridian = same(wrap(a[0]!), wrap(b[0]!));
      const parallel = same(a[1]!, b[1]!);
      const along = (p: number[]): number => (meridian ? p[1]! : p[0]!);
      const lo = Math.min(along(a), along(b));
      const hi = Math.max(along(a), along(b));
      const inner = !meridian && !parallel
        ? []
        : vertices.filter((p) => {
            const on = meridian ? same(wrap(p[0]!), wrap(a[0]!)) : same(p[1]!, a[1]!);
            return on && along(p) > lo + 1e-9 && along(p) < hi - 1e-9;
          });
      inner.sort((p, q) => (along(p) - along(q)) * (along(b) >= along(a) ? 1 : -1));
      let from = a;
      for (const p of inner) {
        edges.push([from, p]);
        from = p;
      }
      edges.push([from, b]);
    }
  }
  return edges;
}

/** Drops the degenerate edges and every edge run both ways. */
function dropPairs(edges: [number[], number[]][]): KeyedEdge[] {
  const runs = new Map<string, number>();
  const keyed = edges
    .map(([a, b]) => ({ a, from: keyOf(a), to: keyOf(b) }))
    .filter((edge) => edge.from !== edge.to);
  for (const edge of keyed) runs.set(`${edge.from}>${edge.to}`, (runs.get(`${edge.from}>${edge.to}`) ?? 0) + 1);
  const owed = new Map<string, number>();
  return keyed.filter((edge) => {
    const own = `${edge.from}>${edge.to}`;
    const back = `${edge.to}>${edge.from}`;
    // The other half of a pair already dropped.
    if ((owed.get(own) ?? 0) > 0) {
      owed.set(own, owed.get(own)! - 1);
      return false;
    }
    if ((runs.get(back) ?? 0) === 0) return true;
    runs.set(back, runs.get(back)! - 1);
    runs.set(own, runs.get(own)! - 1);
    owed.set(back, (owed.get(back) ?? 0) + 1);
    return false;
  });
}

/** Chains the edges into loops; null when they do not all close. */
function chainLoops(kept: KeyedEdge[]): number[][][] | null {
  const leaving = new Map<string, KeyedEdge[]>();
  for (const edge of kept) (leaving.get(edge.from) ?? leaving.set(edge.from, []).get(edge.from)!).push(edge);
  const loops: number[][][] = [];
  let used = 0;
  for (const first of kept) {
    if (!(leaving.get(first.from)?.includes(first) ?? false)) continue;
    const loop: number[][] = [];
    let edge: KeyedEdge | undefined = first;
    while (edge !== undefined) {
      const list = leaving.get(edge.from)!;
      list.splice(list.indexOf(edge), 1);
      used++;
      loop.push(edge.a);
      if (edge.to === first.from) break;
      edge = leaving.get(edge.to)?.[0];
    }
    if (edge === undefined) return null;
    loops.push(loop);
  }
  if (used !== kept.length || loops.length === 0) return null;
  return loops;
}

/**
 * A nation with its rings joined along their cuts, or the nation as it was
 * when its edges do not close into loops. A hole round an enclave has the
 * nation on the outside of something smaller than the nation itself; an outer
 * edge has the rest of the world beyond it. The nation's own size is its cut
 * pieces', each smaller than a hemisphere (a loop's sense alone fails on a
 * nation wider than one).
 */
export function joinNation(world: World, country: Country, id: number, flags: readonly Uint8Array[]): Country {
  const rings = world.rings.map((ring, r) => ({ ring, r })).filter(({ ring }) => ring.country === id);
  if (rings.length < 2) return country;
  const kept = dropPairs(splitEdges(rings, flags));
  const loops = chainLoops(kept);
  if (loops === null) return country;
  let size = 0;
  for (const { ring } of rings) size += flatArea(ring.points);
  const beyond = loops.map((loop) => {
    const left = leftArea(loop);
    return sideOf(world, loop, id) > 0 ? 4 * Math.PI - left : left;
  });
  let outer = loops.filter((loop, k) => loop.length >= 3 && beyond[k]! >= size);
  if (outer.length === 0) outer = [loops[beyond.indexOf(Math.max(...beyond))]!];
  return { ...country, rings: outer };
}
