import * as THREE from 'three';
import type { World } from '../geo.ts';
import type { RoadCaches } from './caches.ts';
import { SPANS } from './lod.ts';
import type { RoadGeometry } from './path.ts';
import type { Place } from '../places.ts';
import { layRibbon } from './ribbon.ts';
import type { RibbonEnd } from './ribbon.ts';
import type { Ribbon } from './ribbon-writer.ts';
import { townOf } from './town.ts';
import type { Road } from './types.ts';

/**
 * Bytes of laid ribbon kept for the next tile that wants the same road in the
 * same band, least recently used first out. A ribbon in a band is a pure
 * function of the road, the band and the prominence version, so a tile is
 * assembled by copying cached ribbons rather than laying its roads again.
 */
const RIBBON_CACHE_BYTES = 24 * 1048576;

export interface RibbonCache {
  ribbonOf(index: number, band: number): Ribbon;
  /** Lays the ribbons `members` still need at this band while `more` allows; true once all are cached. */
  warm(members: readonly number[], drawn: Uint8Array, band: number, more: () => boolean): boolean;
  clear(): void;
}

export interface RibbonSource {
  world: World;
  places: readonly Place[];
  roads: readonly Road[];
  geometry: RoadGeometry;
  caches: RoadCaches;
  readMiddle(index: number, target: THREE.Vector3): THREE.Vector3;
  regionId(place: number): string;
}

export function createRibbonCache(source: RibbonSource): RibbonCache {
  const { world, roads, geometry, caches } = source;
  const ribbons = new Map<number, Ribbon>();
  let ribbonBytes = 0;
  const middle = new THREE.Vector3();

  /** A road's end as its ribbon reads it: the town's plane, and where along it the gate's street runs. */
  function endOf(place: number, gateIndex: number, point: THREE.Vector3, built: boolean): RibbonEnd {
    const town = townOf(source.places[place]!);
    const gate = town.gates[gateIndex]!;
    return {
      across: town.across,
      north: town.north,
      point,
      along: gate.outX !== 0 ? gate.x : gate.z,
      out: gate.outX !== 0 ? gate.outX : gate.outZ,
      built,
    };
  }

  function ribbonOf(index: number, band: number): Ribbon {
    const key = index * SPANS.length + band;
    const known = ribbons.get(key);
    if (known !== undefined) {
      // Most recently used last, which is the order the cache empties in.
      ribbons.delete(key);
      ribbons.set(key, known);
      return known;
    }
    const road = roads[index]!;
    const others = band === 0 ? caches.othersFor(index) : [];
    const course = geometry.course(index);
    const path = geometry.path(index);
    const ramp = caches.rampFor(index);
    const lights = caches.gateLightsFor(index);
    const heads = band === 0 ? caches.roadsideOf(index).heads : [];
    const made = layRibbon({
      world, road, course, path, ramp, band, others, lights, heads,
      middle: source.readMiddle(index, middle),
      regionA: source.regionId(road.a),
      regionB: source.regionId(road.b),
      ends: [endOf(road.a, road.gateA, course.gateA, ramp.kerbA > 0), endOf(road.b, road.gateB, course.gateB, ramp.kerbB > 0)],
    });
    ribbons.set(key, made);
    ribbonBytes += made.bytes;
    for (const [oldest, ribbon] of ribbons) {
      if (ribbonBytes <= RIBBON_CACHE_BYTES) break;
      ribbons.delete(oldest);
      ribbonBytes -= ribbon.bytes;
    }
    return made;
  }

  return {
    ribbonOf,
    warm(members, drawn, band, more) {
      let made = false;
      for (const index of members) {
        if (drawn[index] === 0 || ribbons.has(index * SPANS.length + band)) continue;
        if (made && !more()) return false;
        ribbonOf(index, band);
        made = true;
      }
      return true;
    },
    clear() {
      ribbons.clear();
      ribbonBytes = 0;
    },
  };
}
