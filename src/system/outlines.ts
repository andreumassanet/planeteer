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

import * as THREE from 'three';
import type { World } from '../geo.ts';
import type { Geography } from './geography.ts';
import { latLonOf, unitAt } from '../sphere.ts';

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
  const unit = new THREE.Vector3();
  const keyOf = (p: number[]): string => {
    unitAt(p[1]!, p[0]!, unit);
    return `${unit.x.toFixed(7)},${unit.y.toFixed(7)},${unit.z.toFixed(7)}`;
  };
  const wrap = (lon: number): number => (lon >= 180 ? lon - 360 : lon);
  const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
  /**
   * The solid angle on a loop's left, seen from outside the sphere, in
   * steradians: 2 pi less its turning, by Gauss–Bonnet.
   */
  const leftArea = (points: number[][]): number => {
    const n = points.length;
    const p = points.map((q) => unitAt(q[1]!, q[0]!, new THREE.Vector3()));
    const tin = new THREE.Vector3();
    const tout = new THREE.Vector3();
    const turnAxis = new THREE.Vector3();
    let turning = 0;
    for (let k = 0; k < n; k++) {
      const here = p[k]!;
      tin.subVectors(here, p[(k + n - 1) % n]!).projectOnPlane(here);
      tout.subVectors(p[(k + 1) % n]!, here).projectOnPlane(here);
      if (tin.lengthSq() < 1e-20 || tout.lengthSq() < 1e-20) continue;
      turning += Math.atan2(turnAxis.crossVectors(tin, tout).dot(here), tin.dot(tout));
    }
    const area = 2 * Math.PI - turning;
    return ((area % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI);
  };
  /**
   * A cut ring's solid angle, steradians. Its edges run along the lattice —
   * a parallel is not a great circle, and one ninety degrees long is no edge
   * at all to the turning — so the area is summed in longitude against the
   * sine of latitude, which is exact along a parallel and along a meridian.
   */
  const flatArea = (points: number[][]): number => {
    let sum = 0;
    for (let k = 0; k < points.length; k++) {
      const a = points[k]!;
      const b = points[(k + 1) % points.length]!;
      sum += ((b[0]! - a[0]!) * Math.PI) / 180 * (Math.sin((a[1]! * Math.PI) / 180) + Math.sin((b[1]! * Math.PI) / 180)) / 2;
    }
    return Math.abs(sum);
  };
  /**
   * Which side of a loop its nation lies on — +1 its left, -1 its right — by
   * asking the world at a point a hair to one side of several of its edges,
   * voted. A loop's sense cannot say by itself: one round more than a
   * hemisphere turns the way its complement does.
   */
  const sideOf = (points: number[][], id: number): number => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const across = new THREE.Vector3();
    const at = { lat: 0, lon: 0 };
    let vote = 0;
    const step = Math.max(1, Math.floor(points.length / 9));
    for (let k = 0; k < points.length; k += step) {
      unitAt(points[k]![1]!, points[k]![0]!, a);
      unitAt(points[(k + 1) % points.length]![1]!, points[(k + 1) % points.length]![0]!, b);
      if (a.distanceToSquared(b) < 1e-14) continue;
      mid.addVectors(a, b).normalize();
      // `mid x forward` is the left, seen from outside.
      across.crossVectors(mid, b.clone().sub(a)).normalize().multiplyScalar(Math.min(2e-3, a.distanceTo(b) * 0.25));
      latLonOf(mid.add(across).normalize(), at);
      vote += world.countryAt(at.lat, at.lon) === id ? 1 : -1;
    }
    return vote >= 0 ? 1 : -1;
  };
  const countries = geography.countries.map((country, index) => {
    const id = index + 1;
    const rings = world.rings.map((ring, r) => ({ ring, r })).filter(({ ring }) => ring.country === id);
    if (rings.length < 2) return country;
    const vertices = rings.flatMap(({ ring }) => ring.points);
    // Every edge, its cuts split at the nation's own vertices along them.
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
    // Drop the degenerate and every edge run both ways.
    const runs = new Map<string, number>();
    const keyed = edges
      .map(([a, b]) => ({ a, from: keyOf(a), to: keyOf(b) }))
      .filter((edge) => edge.from !== edge.to);
    for (const edge of keyed) runs.set(`${edge.from}>${edge.to}`, (runs.get(`${edge.from}>${edge.to}`) ?? 0) + 1);
    const owed = new Map<string, number>();
    const kept = keyed.filter((edge) => {
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
    // Chain what is left into loops.
    const leaving = new Map<string, (typeof kept)[number][]>();
    for (const edge of kept) (leaving.get(edge.from) ?? leaving.set(edge.from, []).get(edge.from)!).push(edge);
    const loops: number[][][] = [];
    let used = 0;
    for (const first of kept) {
      if (!(leaving.get(first.from)?.includes(first) ?? false)) continue;
      const loop: number[][] = [];
      let edge: (typeof kept)[number] | undefined = first;
      while (edge !== undefined) {
        const list = leaving.get(edge.from)!;
        list.splice(list.indexOf(edge), 1);
        used++;
        loop.push(edge.a);
        if (edge.to === first.from) break;
        edge = leaving.get(edge.to)?.[0];
      }
      if (edge === undefined) return country;
      loops.push(loop);
    }
    if (used !== kept.length || loops.length === 0) return country;
    // A hole round an enclave has the nation on the outside of something
    // smaller than the nation itself; an outer edge has the rest of the
    // world beyond it. The nation's own size is its cut pieces', each smaller
    // than a hemisphere. (A loop's sense was the test until the Moon's Far
    // Side, wider than a hemisphere, came out as a hole round itself and the
    // menu framed two specks of it from inside the ground.)
    let size = 0;
    for (const { ring } of rings) size += flatArea(ring.points);
    const beyond = loops.map((loop) => {
      const left = leftArea(loop);
      return sideOf(loop, id) > 0 ? 4 * Math.PI - left : left;
    });
    let outer = loops.filter((loop, k) => loop.length >= 3 && beyond[k]! >= size);
    if (outer.length === 0) outer = [loops[beyond.indexOf(Math.max(...beyond))]!];
    return { ...country, rings: outer };
  });
  return { ...world, countries };
}
