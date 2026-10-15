/**
 * A field search's own neighbourhood.
 *
 * A search asks whether hundreds of points near one town are near a town, a
 * road or a landmark, and each of those questions is a grid walk over the
 * planet's index. `localise` asks the indices once for everything within reach
 * of any point the search can test, and the `...Local` tests ask only those:
 * the same predicate over a superset of what the grid walk would return, so the
 * same answer.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { BUILT_CEILING, radiusOf } from '../places.ts';
import { roadClearance } from '../roads.ts';
import { siteGap } from '../landmark-ground.ts';
import { distanceToPath } from './site-world.ts';
import type { SiteWorld } from './site-world.ts';
import { FIELD_CLEAR } from './site-rules.ts';

/** What is near a patch of ground: the towns (and their centres and built radii, flat), the roads, the landmarks. */
interface Neighbourhood {
  towns: number[];
  xyzr: Float64Array;
  roads: number[];
  monuments: SiteWorld['monuments'];
}

export interface FieldNeighbourhood {
  /** Gathers what any point within `span` units of town `p`'s centre could be within `clear` of. */
  localise(p: number, span: number, clear: number): void;
  /** Narrows that to what any point within `span` units of `point` could be within `clear` of. */
  narrow(point: THREE.Vector3, span: number, clear: number): void;
  /** Makes the town-wide neighbourhood the one the tests below ask. */
  useLocal(): void;
  /** Within `clear` units of any built town's disc, of those held. */
  nearTownLocal(direction: THREE.Vector3, clear: number): boolean;
  /** `nearRoad`, over the roads held. */
  nearRoadLocal(direction: THREE.Vector3, clear: number): boolean;
  /** `nearMonument`, over the landmarks held. */
  nearMonumentLocal(direction: THREE.Vector3, clear: number): boolean;
}

export function createNeighbourhood(w: SiteWorld): FieldNeighbourhood {
  const { places, roads, roadIndex, monuments, centres, pathOf, townsNear } = w;
  const townList: number[] = [];
  const monumentProbe = new THREE.Vector3();
  const emptyNeighbourhood = (): Neighbourhood => ({ towns: [], xyzr: new Float64Array(64), roads: [], monuments: [] });
  /** Round the town a search is for (`localise`), and round the stand whose strips it is trying (`narrow`). */
  const local = emptyNeighbourhood();
  const standing = emptyNeighbourhood();
  /** Which of the two the tests below ask. */
  let active = local;

  function keepTown(into: Neighbourhood, q: number, x: number, y: number, z: number, radius: number): void {
    const i = into.towns.length;
    into.towns.push(q);
    if (into.xyzr.length < (i + 1) * 4) {
      const grown = new Float64Array(into.xyzr.length * 2);
      grown.set(into.xyzr);
      into.xyzr = grown;
    }
    into.xyzr[i * 4] = x;
    into.xyzr[i * 4 + 1] = y;
    into.xyzr[i * 4 + 2] = z;
    into.xyzr[i * 4 + 3] = radius;
  }

  /** Every town, road and landmark any point within `span` units of town `p`'s centre could be within `clear` of. */
  function localise(p: number, span: number, clear: number): void {
    const centre = centres[p]!;
    local.towns.length = 0;
    // A town's disc is at most `BUILT_CEILING` round its centre (`nearTown`).
    for (const q of townsNear(centre, span + BUILT_CEILING + clear + 1, townList)) {
      const c = centres[q]!;
      keepTown(local, q, c.x, c.y, c.z, radiusOf(places[q]!));
    }
    // `nearRoad` asks `near` for `clear + 12`; the road's own bound is
    // re-tested at each point (`reaches`), so this only has to hold them all.
    roadIndex.near(centre, span + clear + 12 + 1, local.roads);
    local.monuments.length = 0;
    for (const m of monuments) {
      const dot = centre.x * m.up.x + centre.y * m.up.y + centre.z * m.up.z;
      if (Math.acos(Math.min(1, Math.max(-1, dot))) * PLANET_RADIUS <= span + m.reach + FIELD_CLEAR + clear + 1) local.monuments.push(m);
    }
    active = local;
  }

  /**
   * Of `local`, what any point within `span` units of `point` could be
   * within `clear` of, into `standing`: by the triangle inequality on each
   * one's own bound, with a unit to spare, so a superset of what matters.
   */
  function narrow(point: THREE.Vector3, span: number, clear: number): void {
    standing.towns.length = 0;
    const t = local.xyzr;
    for (let i = 0; i < local.towns.length; i++) {
      const x = t[i * 4]!, y = t[i * 4 + 1]!, z = t[i * 4 + 2]!, radius = t[i * 4 + 3]!;
      if (point.x * x + point.y * y + point.z * z < Math.cos(Math.min(Math.PI, (span + radius + clear + 1) / PLANET_RADIUS))) continue;
      keepTown(standing, local.towns[i]!, x, y, z, radius);
    }
    standing.roads.length = 0;
    for (const r of local.roads) if (roadIndex.reaches(r, point, span + clear + 12 + 1)) standing.roads.push(r);
    standing.monuments.length = 0;
    for (const m of local.monuments) {
      const dot = point.x * m.up.x + point.y * m.up.y + point.z * m.up.z;
      if (Math.acos(Math.min(1, Math.max(-1, dot))) * PLANET_RADIUS <= span + m.reach + FIELD_CLEAR + clear + 1) standing.monuments.push(m);
    }
    active = standing;
  }

  /** Within `clear` units of any built town's disc, of those `active` holds. */
  function nearTownLocal(direction: THREE.Vector3, clear: number): boolean {
    const { towns, xyzr: t } = active;
    for (let i = 0; i < towns.length; i++) {
      const limit = t[i * 4 + 3]! + clear;
      // Far past the disc by the dot product alone, with a margin, and the
      // exact test the grid walk's caller made for the rest.
      if (direction.x * t[i * 4]! + direction.y * t[i * 4 + 1]! + direction.z * t[i * 4 + 2]! < Math.cos(limit / PLANET_RADIUS + 1e-6)) continue;
      if (centres[towns[i]!]!.angleTo(direction) * PLANET_RADIUS < limit) return true;
    }
    return false;
  }

  /** `nearRoad`, over the roads `active` holds. */
  function nearRoadLocal(direction: THREE.Vector3, clear: number): boolean {
    for (const r of active.roads) {
      if (!roadIndex.reaches(r, direction, clear + 12)) continue;
      if (distanceToPath(pathOf(r), direction) < roadClearance(roads[r]!.cls) + clear) return true;
    }
    return false;
  }

  /** `nearMonument`, over the landmarks `active` holds. */
  function nearMonumentLocal(direction: THREE.Vector3, clear: number): boolean {
    const keep = FIELD_CLEAR + clear;
    const p = monumentProbe.copy(direction).normalize();
    for (const m of active.monuments) {
      const dot = p.x * m.up.x + p.y * m.up.y + p.z * m.up.z;
      if (dot < Math.cos((m.reach + keep) / PLANET_RADIUS)) continue;
      if (siteGap(m, p, PLANET_RADIUS) < keep) return true;
    }
    return false;
  }

  return {
    localise,
    narrow,
    useLocal() {
      active = local;
    },
    nearTownLocal,
    nearRoadLocal,
    nearMonumentLocal,
  };
}
