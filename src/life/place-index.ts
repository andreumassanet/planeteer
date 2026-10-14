/** Nearest-place lookups for the scan, cached per cell key. */
import * as THREE from 'three';
import { isShown, prominenceVersion } from '../places.ts';
import type { Place } from '../places.ts';
import { placeDirection } from '../roads.ts';

export interface PlaceIndex {
  /** The place nearest a direction (a boat's region and mix), cached by `key`. */
  nearestPlace(dir: THREE.Vector3, key: string): number;
  /**
   * The nearest place that is built (`isShown`), for herds, which keep off
   * houses rather than names; cached by `key`. -1 when nothing is shown.
   */
  nearestShown(dir: THREE.Vector3, key: string): number;
  /** Forgets `nearestShown`'s answers: the prominence knob has moved. */
  clearShown(): void;
  /** Empties the caches past their bound. */
  trim(cap: number): void;
}

export function createPlaceIndex(places: readonly Place[]): PlaceIndex {
  /** Unit vector per place, once. */
  const direction = new Float64Array(places.length * 3);
  const here = new THREE.Vector3();
  places.forEach((place, i) => {
    placeDirection(place, here);
    direction[i * 3] = here.x;
    direction[i * 3 + 1] = here.y;
    direction[i * 3 + 2] = here.z;
  });

  const nearestCache = new Map<string, number>();
  function nearestPlace(dir: THREE.Vector3, key: string): number {
    const known = nearestCache.get(key);
    if (known !== undefined) return known;
    let best = 0;
    let bestDot = -2;
    for (let i = 0; i < places.length; i++) {
      const dot = dir.x * direction[i * 3]! + dir.y * direction[i * 3 + 1]! + dir.z * direction[i * 3 + 2]!;
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    }
    nearestCache.set(key, best);
    return best;
  }

  const shownCache = new Map<string, number>();
  const shownMask = new Uint8Array(places.length);
  let shownFor = -1;
  function nearestShown(dir: THREE.Vector3, key: string): number {
    const known = shownCache.get(key);
    if (known !== undefined) return known;
    if (shownFor !== prominenceVersion()) {
      for (let i = 0; i < places.length; i++) shownMask[i] = isShown(places[i]!) ? 1 : 0;
      shownFor = prominenceVersion();
    }
    let best = -1;
    let bestDot = -2;
    for (let i = 0; i < places.length; i++) {
      if (shownMask[i] === 0) continue;
      const dot = dir.x * direction[i * 3]! + dir.y * direction[i * 3 + 1]! + dir.z * direction[i * 3 + 2]!;
      if (dot > bestDot) {
        bestDot = dot;
        best = i;
      }
    }
    shownCache.set(key, best);
    return best;
  }

  return {
    nearestPlace,
    nearestShown,
    clearShown() {
      shownCache.clear();
    },
    trim(cap) {
      if (nearestCache.size > cap) nearestCache.clear();
      if (shownCache.size > cap) shownCache.clear();
    },
  };
}
