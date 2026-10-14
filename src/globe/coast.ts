import * as THREE from 'three';
import type { LandRing, World } from '../geo.ts';
import { insideRing } from '../geo.ts';
import { latOf, lonOf } from '../sphere.ts';
import { PLANET_RADIUS, onSphere } from './planet.ts';

/** Ground height (distance to centre) under an arbitrary point. */
export function groundRadius(world: World, point: THREE.Vector3): number {
  return PLANET_RADIUS + world.elevationAt(point);
}

/**
 * How far off an edge to step to ask what is on the other side of it, world
 * units. Where the land or channel beside the edge is thinner than the probe the
 * answer is wrong, which is a fraction of a percent of walls.
 */
const COAST_PROBE = 8;

const coastCache = new WeakMap<World, Uint8Array[]>();

/**
 * Which edges of the outlines have sea on their outward side.
 *
 * The rings are country outlines, so a boundary is not necessarily a coastline.
 * The shore index in `terrain.ts`, the frontiers in `borders.ts` and the surf in
 * `ocean.ts` all need to tell them apart, so the answer is computed once and
 * memoised on the world. Land is on the right of `a -> b`, so outward is
 * `cross(up, b - a)`; the sign is tied to the planet's handedness.
 *
 * One byte per point per ring: 1 where the edge leaving that point faces the
 * sea. Degenerate edges (Antarctica's ring holds consecutive points at exactly
 * lat -90) are 0, because they are not an edge.
 */
export function coastEdges(world: World): Uint8Array[] {
  const cached = coastCache.get(world);
  if (cached !== undefined) return cached;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const along = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const probe = new THREE.Vector3();

  // The lakes and their boxes, for `inLake`: 26 rings, so a box test first is
  // all the index this needs.
  const lakes = (world.rings as LandRing[])
    .filter((ring) => ring.water)
    .map((ring) => {
      let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
      for (const [lon, lat] of ring.points) {
        minLon = Math.min(minLon, lon!); maxLon = Math.max(maxLon, lon!);
        minLat = Math.min(minLat, lat!); maxLat = Math.max(maxLat, lat!);
      }
      return { points: ring.points, minLon, minLat, maxLon, maxLat };
    });
  /** Whether the midpoint of this edge, in the plane the outlines are drawn in, is lake water. */
  const inLake = (p: number[], q: number[]): boolean => {
    const lon = (p[0]! + q[0]!) * 0.5;
    const lat = (p[1]! + q[1]!) * 0.5;
    for (const lake of lakes) {
      if (lon < lake.minLon || lon > lake.maxLon || lat < lake.minLat || lat > lake.maxLat) continue;
      if (insideRing(lake.points, lon, lat)) return true;
    }
    return false;
  };

  const flags = (world.rings as LandRing[]).map((ring) => {
    const points = ring.points;
    const seaward = new Uint8Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      onSphere(points[i]![0]!, points[i]![1]!, a);
      onSphere(points[j]![0]!, points[j]![1]!, b);
      if (a.angleTo(b) * PLANET_RADIUS < 0.001) continue;
      mid.copy(a).add(b).normalize();
      along.subVectors(b, a).normalize();
      outward.crossVectors(mid, along).normalize();
      probe.copy(mid).addScaledVector(outward, COAST_PROBE / PLANET_RADIUS).normalize();
      const lat = latOf(probe.y);
      const lon = lonOf(probe.x, probe.z);
      if (world.countryAt(lat, lon) !== 0) continue;
      // An edge lying in a lake is a frontier under the water, not a coast: a
      // border through a shared lake would otherwise get a strip of surf.
      // Tested on the edge's own midpoint against the lake rings rather than by
      // a second probe inward, which would also unmake thin islands and spits.
      if (!ring.water && inLake(points[i]!, points[j]!)) continue;
      seaward[i] = 1;
    }
    return seaward;
  });

  coastCache.set(world, flags);
  return flags;
}
