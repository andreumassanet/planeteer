import * as THREE from 'three';
import type { World } from '../geo.ts';
import type { Place } from '../places.ts';
import { layRoadside } from '../roadside.ts';
import type { Roadside } from '../roadside/types.ts';
import type { RoadRamp } from './crown.ts';
import { rampOf } from './gates.ts';
import { gateLightsOf } from './glow.ts';
import type { GateLight } from './glow.ts';
import { otherRoadsOf } from './overlap.ts';
import type { OtherRoad } from './overlap.ts';
import { GEOMETRY_CAP } from './path.ts';
import type { RoadGeometry } from './path.ts';
import { roadsideSite } from './roadside-site.ts';
import { roadIndexFor } from './spatial-index.ts';
import type { Road } from './types.ts';

/** Bytes of laid roadside kept for reuse, least recently used first out. */
const ROADSIDE_CACHE_BYTES = 12 * 1048576;

export type LaidRoadside = Roadside & { bytes: number };

/**
 * Per-road facts the ribbon, the roadside and the foot read, each cached: a
 * pure function of the road and the prominence version, so `clear` empties
 * them all when the prominence knob turns.
 */
export interface RoadCaches {
  rampFor(index: number): RoadRamp;
  othersFor(index: number): readonly OtherRoad[];
  gateLightsFor(index: number): readonly GateLight[];
  roadsideOf(index: number): LaidRoadside;
  setTaken(taken: ((point: THREE.Vector3, footprint: number) => boolean) | null): void;
  clear(): void;
}

export interface RoadCacheSource {
  world: World;
  places: readonly Place[];
  roads: readonly Road[];
  geometry: RoadGeometry;
  readMiddle(index: number, target: THREE.Vector3): THREE.Vector3;
}

export function createRoadCaches(source: RoadCacheSource): RoadCaches {
  const { world, places, roads, geometry, readMiddle } = source;

  const ramps = new Map<number, RoadRamp>();
  const rampFor = (index: number): RoadRamp => {
    let found = ramps.get(index);
    if (found === undefined) {
      found = rampOf(roads[index]!, geometry.course(index), places, world);
      if (ramps.size >= GEOMETRY_CAP) ramps.clear();
      ramps.set(index, found);
    }
    return found;
  };

  const NO_OTHERS: readonly OtherRoad[] = [];
  const othersCache = new Map<number, readonly OtherRoad[]>();
  const othersMiddle = new THREE.Vector3();
  const othersFor = (index: number): readonly OtherRoad[] => {
    let found = othersCache.get(index);
    if (found === undefined) {
      const list = otherRoadsOf(
        roads, index, roadIndexFor(roads, places), (i) => geometry.path(i), rampFor, readMiddle(index, othersMiddle),
      );
      found = list.length > 0 ? list : NO_OTHERS;
      if (othersCache.size >= GEOMETRY_CAP) othersCache.clear();
      othersCache.set(index, found);
    }
    return found;
  };

  const gateLights = new Map<number, readonly GateLight[]>();
  const gateLightsFor = (index: number): readonly GateLight[] => {
    let found = gateLights.get(index);
    if (found === undefined) {
      found = gateLightsOf(roads[index]!, rampFor(index), places, world);
      if (gateLights.size >= GEOMETRY_CAP) gateLights.clear();
      gateLights.set(index, found);
    }
    return found;
  };

  const roadsides = new Map<number, LaidRoadside>();
  let roadsideBytes = 0;
  let takenGround: ((point: THREE.Vector3, footprint: number) => boolean) | null = null;
  function roadsideOf(index: number): LaidRoadside {
    const known = roadsides.get(index);
    if (known !== undefined) {
      roadsides.delete(index);
      roadsides.set(index, known);
      return known;
    }
    const site = roadsideSite(
      roads[index]!, geometry.course(index), geometry.path(index), rampFor(index), places, world, othersFor(index), takenGround,
    );
    const laid = layRoadside(site);
    const made = {
      ...laid,
      bytes: (laid.position.length + laid.normal.length + laid.color.length + laid.heads.length) * 8 + laid.lit.length,
    };
    roadsides.set(index, made);
    roadsideBytes += made.bytes;
    for (const [oldest, side] of roadsides) {
      if (roadsideBytes <= ROADSIDE_CACHE_BYTES) break;
      roadsides.delete(oldest);
      roadsideBytes -= side.bytes;
    }
    return made;
  }

  return {
    rampFor,
    othersFor,
    gateLightsFor,
    roadsideOf,
    setTaken(taken) {
      // Called once, as the railway arrives: what was laid beside the roads is laid again, keeping off it.
      takenGround = taken;
      roadsides.clear();
      roadsideBytes = 0;
    },
    clear() {
      ramps.clear();
      gateLights.clear();
      othersCache.clear();
      roadsides.clear();
      roadsideBytes = 0;
    },
  };
}
