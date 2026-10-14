import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import { ROAD_CLASSES } from './classes.ts';
import { GIRDER, needsCentre, onBridge } from './crown.ts';
import type { RoadRamp } from './crown.ts';
import type { CoursePath, RoadGeometry } from './path.ts';
import { ribbonReach, surfaceLift } from './section.ts';
import { roadIndexFor } from './spatial-index.ts';
import type { RoadIndex } from './spatial-index.ts';
import type { Road } from './types.ts';

/**
 * Where the carriageway is for a foot rather than a camera: the ribbon's own
 * surface at a point, on the terms it is laid (same course, path, crown and
 * cross-section), so a foot cannot stand on a road that is not drawn.
 *
 * - It stops at the kerb: past the ribbon's flat end cap the point is in the
 *   town, and `madeHeightAt` answers there at the same height.
 * - Neither the band taper nor the class reach applies: those are levels of
 *   detail, and the ground underfoot does not change with the camera.
 * - The bank's buried part counts down to its foot, measured against the
 *   drawn land (`setGround`), so the surface starts exactly where the drawn
 *   bank comes out of the drawn land.
 */
export interface RibbonHeight {
  ribbonHeightAt(point: THREE.Vector3): number;
  setGround(ground: ((point: THREE.Vector3) => number) | null): void;
}

export interface RibbonHeightSource {
  world: World;
  places: readonly Place[];
  roads: readonly Road[];
  geometry: RoadGeometry;
  rampFor(index: number): RoadRamp;
}

/** The widest the surface can be from a centre line: a whole pavement, the widest bank and its skirt. */
const WIDEST_HALF = ribbonReach(Math.max(...ROAD_CLASSES.map((style) => style.width)) * 0.5);

export function createRibbonHeight(source: RibbonHeightSource): RibbonHeight {
  const { world, places, roads, geometry, rampFor } = source;
  /** The land the bank stands against; the relief when unset. */
  let landAt: ((point: THREE.Vector3) => number) | null = null;
  let index: RoadIndex | null = null;
  const hits: number[] = [];
  const direction = new THREE.Vector3();
  const here = new THREE.Vector3();
  const last = new THREE.Vector3();
  const leg = new THREE.Vector3();
  const nearestFoot = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const footResult = { away: 0, along: 0, raw: 0 };
  /** The relief under the current query, NaN until a road needs it. */
  let ground = NaN;

  /**
   * The foot of `probe` (on the sphere at `PLANET_RADIUS`) on chord `k` of a
   * path, into `foot`: how far across the ground, how far along the path, and
   * the unclamped share of the chord.
   */
  function chordFoot(path: CoursePath, k: number): typeof footResult {
    last.set(path.xyz[k * 3 - 3]!, path.xyz[k * 3 - 2]!, path.xyz[k * 3 - 1]!).multiplyScalar(PLANET_RADIUS);
    here.set(path.xyz[k * 3]!, path.xyz[k * 3 + 1]!, path.xyz[k * 3 + 2]!).multiplyScalar(PLANET_RADIUS);
    leg.subVectors(here, last);
    const lengthSq = leg.lengthSq();
    const raw = lengthSq > 1e-9 ? foot.copy(probe).sub(last).dot(leg) / lengthSq : 0;
    const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    // The chord runs through the sphere, so both ends of the distance are
    // projected back onto the surface before it is measured.
    foot.copy(last).addScaledVector(leg, clamped).normalize().multiplyScalar(PLANET_RADIUS);
    footResult.away = foot.distanceTo(probe);
    footResult.along = path.s[k - 1]! + (path.s[k]! - path.s[k - 1]!) * clamped;
    footResult.raw = raw;
    return footResult;
  }

  /**
   * The highest lift any stretch of one road gives the point, or -Infinity.
   * Inside a tight bend a road comes back past itself, so besides the nearest
   * stretch every other stretch the point stands square across counts, and
   * the highest answer is the surface, as it is the surface drawn. The cap
   * test (the unclamped projection on the first and last chords, which are the
   * straight approaches) stops the surface exactly at the kerb line.
   */
  function roadLift(hit: number, point: THREE.Vector3): number {
    const road = roads[hit]!;
    const style = ROAD_CLASSES[road.cls] ?? ROAD_CLASSES[0]!;
    const path = geometry.path(hit);
    const reach = ribbonReach(style.width * 0.5);
    const end = path.count - 1;
    let nearest = Infinity;
    let nearestAlong = 0;
    let pastCap = false;
    for (let k = 1; k <= end; k++) {
      const found = chordFoot(path, k);
      if (found.away < nearest) {
        nearest = found.away;
        nearestAlong = found.along;
        nearestFoot.copy(foot);
        pastCap = (k === 1 && found.raw < 0) || (k === end && found.raw > 1);
      }
    }
    if (pastCap || nearest >= reach) return -Infinity;
    const ramp = rampFor(hit);
    // Asked once a query, and only once some road is near enough to need it.
    if (Number.isNaN(ground)) ground = world.elevationAt(direction);
    let best = -Infinity;
    const answer = (along: number, away: number, at: THREE.Vector3): void => {
      const centre = needsCentre(ramp, along, path.length - along) ? world.elevationAt(at) : ground;
      const lift = surfaceLift(ramp, style.width * 0.5, along, path.length - along, away, ground, centre);
      // A bridge's deck is a floor from above and a roof from below: a swimmer
      // or boat under it passes. A query at the sea's own radius, or as a bare
      // direction, is from above.
      if (onBridge(ramp, along)) {
        const radius = point.length();
        if (radius > PLANET_RADIUS + 0.25 && radius < PLANET_RADIUS + ground + lift - 2 * GIRDER) return;
      }
      if (lift > best) best = lift;
    };
    answer(nearestAlong, nearest, nearestFoot);
    for (let k = 2; k < end; k++) {
      const found = chordFoot(path, k);
      if (found.raw < 0 || found.raw > 1 || found.away >= reach) continue;
      // Further along than the point is from either stretch: not the nearest
      // stretch's own section seen from a neighbouring chord.
      if (Math.abs(found.along - nearestAlong) <= Math.max(found.away, nearest) + 1) continue;
      answer(found.along, found.away, foot);
    }
    return best;
  }

  return {
    ribbonHeightAt(point) {
      if (roads.length === 0 || places.length === 0) return 0;
      index ??= roadIndexFor(roads, places);
      direction.copy(point).normalize();
      probe.copy(direction).multiplyScalar(PLANET_RADIUS);
      let best = -Infinity;
      ground = NaN;
      for (const hit of index.near(direction, WIDEST_HALF, hits)) {
        best = Math.max(best, roadLift(hit, point));
      }
      if (best === -Infinity) return 0;
      // A gate on a quay can hang the crown's edge a fraction over the water;
      // the ribbon is drawn there at the relief plus its lift, so a foot stands there.
      const height = PLANET_RADIUS + ground + best;
      return height > (landAt === null ? PLANET_RADIUS + ground : landAt(probe)) ? height : 0;
    },
    setGround(land) {
      landAt = land;
    },
  };
}
