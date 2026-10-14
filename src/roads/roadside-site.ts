import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { OTHER_EDGE } from '../roadside/constants.ts';
import type { RoadsideSite } from '../roadside/types.ts';
import { prepareSeaFloor, seaDepthAt } from '../sea-floor.ts';
import { keepsLeft } from '../traffic/regions.ts';
import { ROAD_CLASSES } from './classes.ts';
import { coursePoint, courseTangent } from './course.ts';
import type { RoadCourse } from './course.ts';
import { BRIDGE_LAND, needsCentre } from './crown.ts';
import type { RoadRamp } from './crown.ts';
import { insideOthers, otherTop, othersRoofline } from './overlap.ts';
import type { OtherRoad } from './overlap.ts';
import { parameterAt } from './path.ts';
import type { CoursePath } from './path.ts';
import { PAVEMENT_RUN, PAVEMENT_TAPER, ribbonHalf, surfaceLift } from './section.ts';
import type { Road } from './types.ts';

/**
 * The smallest town whose approach has street lamps, by built radius: big
 * enough to end a `road` rather than a `lane` (`classOf`).
 */
const LAMP_TOWN = 17.1;

/**
 * How far from each end a road drawn behind another it overlaps keeps its
 * roadside back, in world units: past its own pavement, where two roads out
 * of one gate have parted.
 */
const LAYERED_CLEAR = PAVEMENT_RUN + 24;

const siteAt = new THREE.Vector3();
const siteCentre = new THREE.Vector3();
/** How far from another road's centre line a roadside thing may not stand: its top, less `OTHER_EDGE`. */
const clearOf = (other: OtherRoad, s: number): number => otherTop(other, s) - OTHER_EDGE;
/**
 * And from its own centre line, anywhere along it: a margin more, since a
 * lamp's foot stands 0.35 in from its own top's edge and a post's 0.2.
 */
const ownClearOf = (other: OtherRoad, s: number): number => otherTop(other, s) - OTHER_EDGE - 0.3;

/**
 * One road as `roadside.ts` sees it: where its drawn surface is (the course,
 * `ribbonHalf` and `surfaceLift`, the ribbon's own), which ends are built
 * towns big enough for lamps, where the country starts at each, and the side
 * its traffic keeps to. `pnpm check` lays the network's roadside through it.
 */
export function roadsideSite(
  road: Road, course: RoadCourse, path: CoursePath, ramp: RoadRamp, places: readonly Place[], world: World,
  others: readonly OtherRoad[] = [],
  taken: ((point: THREE.Vector3, footprint: number) => boolean) | null = null,
): RoadsideSite {
  const half = (ROAD_CLASSES[road.cls] ?? ROAD_CLASSES[0]!).width * 0.5;
  const a = places[road.a]!;
  const b = places[road.b]!;
  // A road drawn behind another usually shares a gate with it and lays its
  // first stretch on the same line, so it leaves that stretch to the front road.
  const shared = road.layer > 0 ? LAYERED_CLEAR : 0;
  // The road itself as another, so a course that curls back past its own gate
  // does not stand a post on its other stretch.
  const own: readonly OtherRoad[] = [{ path, half, ramp, front: false }];
  const countryOf = (walk: number, kerb: number): number =>
    kerb === 0 ? shared : Math.max(course.approach, walk > 0 ? PAVEMENT_RUN + PAVEMENT_TAPER : 0, shared);
  const site: RoadsideSite = {
    length: path.length,
    half,
    top: (s) => ribbonHalf(ramp, half, s, path.length - s),
    surface(s, lateral, point, ahead, side) {
      const t = parameterAt(path, s);
      coursePoint(course, t, siteAt);
      courseTangent(course, t, ahead);
      side.crossVectors(siteAt, ahead).normalize();
      point.copy(siteAt).addScaledVector(side, lateral / PLANET_RADIUS).normalize();
      const sB = path.length - s;
      const ground = world.elevationAt(point);
      const centre = needsCentre(ramp, s, sB) ? world.elevationAt(siteCentre.copy(siteAt)) : ground;
      // Past the section's foot `surfaceLift` is -Infinity: the land itself.
      const lift = surfaceLift(ramp, half, s, sB, lateral, ground, centre);
      point.multiplyScalar(PLANET_RADIUS + ground + (lift === -Infinity ? 0 : lift));
    },
    groundRadius: (point) => PLANET_RADIUS + Math.max(0, world.elevationAt(siteCentre.copy(point).normalize())),
    floorRadius: (point) => {
      const elevation = world.elevationAt(siteCentre.copy(point).normalize());
      if (elevation > 0) return PLANET_RADIUS + elevation;
      // Only a pier asks, over a bridge's water.
      prepareSeaFloor(world);
      return PLANET_RADIUS - seaDepthAt(siteCentre);
    },
    clear: (point, footprint) =>
      insideOthers(others, point, clearOf) + footprint <= 0 &&
      insideOthers(own, point, ownClearOf) + footprint <= 0 &&
      (taken === null || !taken(point, footprint)),
    roofline: (point) => othersRoofline(others, point, world),
    bridge: ramp.bridgeTo > ramp.bridgeFrom ? [ramp.bridgeFrom, ramp.bridgeTo, BRIDGE_LAND] : null,
    nameA: a.name,
    nameB: b.name,
    townA: ramp.kerbA > 0,
    townB: ramp.kerbB > 0,
    lampsA: ramp.kerbA > 0 && shared === 0 && radiusOf(a) >= LAMP_TOWN,
    lampsB: ramp.kerbB > 0 && shared === 0 && radiusOf(b) >= LAMP_TOWN,
    keep: keepsLeft(a.iso ?? '') ? 1 : -1,
    countryA: countryOf(ramp.walkA, ramp.kerbA),
    countryB: countryOf(ramp.walkB, ramp.kerbB),
    seed: `${a.name}@${a.lat},${a.lon}|${b.name}@${b.lat},${b.lon}`,
  };
  return site;
}
