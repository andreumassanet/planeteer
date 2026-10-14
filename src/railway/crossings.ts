import * as THREE from 'three';
import type { Place } from '../places.ts';
import type { Road } from '../roads/types.ts';
import { ROAD_CLASSES } from '../roads/classes.ts';
import { coursePoint, courseTangent } from '../roads/course.ts';
import { parameterAt, roadGeometryFor } from '../roads/path.ts';
import { roadIndexFor } from '../roads/spatial-index.ts';
import { nearestOnPath } from '../rails/network.ts';
import type { RailNetwork } from '../rails/network.ts';
import { CROSSING_MARGIN } from './constants.ts';

/** Where a line crosses a road. */
export interface Crossing {
  s: number;
  /** How far along the line either side of `s` the road's carriageway reaches. */
  half: number;
  /** The road's direction there, a unit tangent. */
  across: THREE.Vector3;
  point: THREE.Vector3;
}

/** Walk step along a line when looking for crossings, in world units. */
const CROSSING_STEP = 2;

/**
 * Finds each line's level crossings on first ask and caches them: the line is
 * walked every `CROSSING_STEP`, each road within reach is followed until it is
 * left, and the crossing is put where the line came nearest its centre line.
 * This is the same walk `rail-trial.ts` tests a line with.
 */
export function createCrossingFinder(
  network: RailNetwork,
  roads: readonly Road[],
  places: readonly Place[],
): (line: number) => Crossing[] {
  const roadIndex = roads.length > 0 ? roadIndexFor(roads, places) : null;
  const roadGeometry = roads.length > 0 ? roadGeometryFor(roads, places) : null;
  const crossingsOf = new Map<number, Crossing[]>();
  const roadHits: number[] = [];
  const cp = new THREE.Vector3();
  const ct = new THREE.Vector3();

  return function crossings(line: number): Crossing[] {
    const known = crossingsOf.get(line);
    if (known !== undefined) return known;
    const found: Crossing[] = [];
    if (roadIndex !== null && roadGeometry !== null) {
      const path = network.path(line);
      const course = network.course(line);
      const runs = new Map<number, { best: number; s: number; roadS: number }>();
      const live = new Set<number>();
      const settle = (r: number, run: { best: number; s: number; roadS: number }): void => {
        if (run.best > CROSSING_STEP * 1.5) return;
        const roadPath = roadGeometry.path(r);
        courseTangent(roadGeometry.course(r), parameterAt(roadPath, run.roadS), ct);
        const railTangent = courseTangent(course, parameterAt(path, run.s), new THREE.Vector3());
        const sin = Math.max(0.3, Math.sqrt(Math.max(0, 1 - railTangent.dot(ct) ** 2)));
        const carriageway = ROAD_CLASSES[roads[r]!.cls]!.width / 2;
        found.push({ s: run.s, half: carriageway / sin + CROSSING_MARGIN, across: ct.clone(), point: coursePoint(course, parameterAt(path, run.s), new THREE.Vector3()) });
      };
      for (let s = 0; s <= path.length; s += CROSSING_STEP) {
        coursePoint(course, parameterAt(path, s), cp);
        live.clear();
        for (const r of roadIndex.near(cp, 12, roadHits)) {
          const hit = nearestOnPath(roadGeometry.path(r), cp);
          if (hit.off > 12) continue;
          live.add(r);
          const run = runs.get(r);
          if (run === undefined) runs.set(r, { best: hit.off, s, roadS: hit.s });
          else if (hit.off < run.best) {
            run.best = hit.off;
            run.s = s;
            run.roadS = hit.s;
          }
        }
        for (const [r, run] of runs) {
          if (live.has(r)) continue;
          settle(r, run);
          runs.delete(r);
        }
      }
      for (const [r, run] of runs) settle(r, run);
    }
    found.sort((a, b) => a.s - b.s);
    crossingsOf.set(line, found);
    return found;
  };
}
