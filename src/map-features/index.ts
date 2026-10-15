import { isShown } from '../places.ts';
import { courseOf, coursePath, type Road } from '../roads.ts';
import { asphaltOf, groundStyleFor } from '../scenery/ground.ts';
import { bytesOf } from '../raster.ts';
import { PALETTE } from '../theme.ts';
import * as THREE from 'three';
import { DEG } from './constants.ts';
import type { FeatureCtx, RoadEntry } from './context.ts';

export const bucketKey = (lat: number, lon: number): number => (Math.floor(lat) + 90) * 400 + (Math.floor(lon) + 180);

export function townsIn(f: FeatureCtx, south: number, north: number, west: number, east: number): number[] {
  if (f.townBuckets === null) return [];
  // The biggest square (`BUILT_CEILING`) reaches 0.4 degrees of latitude from its centre.
  const out: number[] = [];
  for (let lat = Math.floor(south - 0.6); lat <= Math.floor(north + 0.6); lat++) {
    const spread = 0.6 / Math.max(0.05, Math.cos(Math.min(89, Math.abs(lat) + 1) * DEG));
    for (let lon = Math.floor(west - spread); lon <= Math.floor(east + spread); lon++) {
      const wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
      const list = f.townBuckets.get(bucketKey(lat, wrapped));
      if (list !== undefined) out.push(...list);
    }
  }
  return out;
}

export function roadEntry(f: FeatureCtx, road: Road): RoadEntry {
  const { places, regionOf, roadColour, roadAsphalt } = f;
  const a = places[road.a];
  const b = places[road.b];
  if (a === undefined || b === undefined) return { south: 1, north: 0, west: 1, east: 0, path: null, tarmac: [0, 0, 0] };
  let lonB = b.lon;
  if (lonB - a.lon > 180) lonB -= 360;
  else if (a.lon - lonB > 180) lonB += 360;
  // A road's bow takes it a fraction of its length off the chord; a
  // quarter of the length round both ends is more than any bake wrote.
  const pad = 0.25 * Math.hypot(lonB - a.lon, b.lat - a.lat) + 0.05;
  // The ribbon's own surface (`roads.ts`): the region's carriageway at the
  // road's first town, warmed off the towns, a trunk worn darker.
  roadColour.setHex(groundStyleFor(regionOf(a).id).road);
  if (road.cls === 2) roadColour.lerp(new THREE.Color(PALETTE.ink), 0.12);
  asphaltOf(roadColour, roadAsphalt);
  return {
    south: Math.min(a.lat, b.lat) - pad,
    north: Math.max(a.lat, b.lat) + pad,
    west: Math.min(a.lon, lonB) - pad,
    east: Math.max(a.lon, lonB) + pad,
    path: null,
    tarmac: bytesOf(roadAsphalt.getHex()),
  };
}

/**
 * The indexes, built the first time a tile asks, in slices (the towns by
 * degree, the roads' boxes and tarmacs), so a tile's first step is not a
 * pass over every place and every road.
 */
export function* prepareSteps(f: FeatureCtx): Generator<undefined, void, void> {
  const { places, roads } = f;
  const buckets = new Map<number, number[]>();
  for (let index = 0; index < places.length; index++) {
    if ((index & 2047) === 2047) yield;
    const place = places[index]!;
    if (!isShown(place)) continue;
    const k = bucketKey(place.lat, place.lon);
    const list = buckets.get(k);
    if (list === undefined) buckets.set(k, [index]);
    else list.push(index);
  }
  const entries: RoadEntry[] = [];
  for (let index = 0; index < roads.length; index++) {
    if ((index & 511) === 511) yield;
    entries.push(roadEntry(f, roads[index]!));
  }
  f.townBuckets = buckets;
  f.roadEntries = entries;
}

export function* ready(f: FeatureCtx): Generator<undefined, void, void> {
  while (!f.prepared) {
    f.preparing ??= prepareSteps(f);
    if (f.preparing.next().done === true) {
      f.prepared = true;
      f.preparing = null;
    } else yield;
  }
}

export function pathOf(f: FeatureCtx, index: number): Float64Array {
  const { places, roads, roadCourse } = f;
  const entry = roadList(f)[index]!;
  if (entry.path === null) {
    courseOf(roads[index]!, places, roadCourse);
    entry.path = coursePath(roadCourse).xyz;
  }
  return entry.path;
}

export const roadList = (f: FeatureCtx): RoadEntry[] => f.roadEntries ?? [];
