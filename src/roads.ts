import * as THREE from 'three';
import type { World } from './geo.ts';
import type { Place } from './places.ts';
import { regionFor } from './scenery/regions.ts';
import { proxyOf } from './warm.ts';
import { createRoadCaches } from './roads/caches.ts';
import { holdGates } from './roads/gate-levels.ts';
import { createPropsMaterial, createRoadMaterial } from './roads/material.ts';
import { roadGeometryFor } from './roads/path.ts';
import { createRibbonCache } from './roads/ribbon-cache.ts';
import { createRoadStreamer } from './roads/streamer.ts';
import { summarizeRoads } from './roads/summary.ts';
import { createRibbonHeight } from './roads/surface-height.ts';
import { bucketTiles } from './roads/tiles.ts';
import type { RoadData, Roads } from './roads/types.ts';

/**
 * The road network: which towns are joined, the shape and height of each
 * road, and the ribbon drawn for it.
 *
 * The graph is baked (`scripts/build-roads.ts` -> `roads.bin`): which pairs
 * are joined is a pure function of `places.bin` and the outlines and costs
 * hundreds of thousands of ground queries. The geometry is built here, only
 * what the camera can see. A road runs gate to gate between two towns'
 * squares (`scenery/grid.ts`), so nothing is clipped.
 *
 * Two definitions live in both the bake and the game: `courseOf` /
 * `coursePath` (where a road runs) and `rampOf` + `crownLift` (how high it
 * rides). The bake, `pnpm check`, the ribbon, the traffic and the keepouts all
 * read them from `src/roads/`; never restate either.
 */

export type { Road, RoadData, RoadStats, Roads } from './roads/types.ts';
export { ROAD_CLASSES, classOf, roadClearance } from './roads/classes.ts';
export type { RoadClass } from './roads/classes.ts';
export { placeDirection, townOf, townOffset } from './roads/town.ts';
export type { Town } from './roads/town.ts';
export { holdGates, heldGates } from './roads/gate-levels.ts';
export { assignTownGates, candidateGates, gateOpen, gateUnderLandmark, landmarkTakes, rampOf } from './roads/gates.ts';
export { APPROACH, courseOf, coursePoint, courseTangent, emptyCourse, joinCourse } from './roads/course.ts';
export type { RoadCourse } from './roads/course.ts';
export { coursePath, distanceAt, parameterAt, roadGeometryFor, tightestTurn } from './roads/path.ts';
export type { CoursePath, RoadGeometry } from './roads/path.ts';
export {
  BRIDGE_GRADE, BRIDGE_LAND, BRIDGE_SPAN, DECK_HEIGHT, GIRDER, RAMP_GRADE, RIBBON_LIFT,
  bridgeDeck, crownLift, emptyRamp, needsCentre, onBridge, rampReach,
} from './roads/crown.ts';
export type { RoadRamp } from './roads/crown.ts';
export {
  PAVEMENT_RUN, SHOULDER_STRIP, bankRun, crownFall, onPavement, ribbonHalf, ribbonReach, ribbonSection, ribbonStations,
  surfaceLift,
} from './roads/section.ts';
export { MAX_ROAD_LENGTH, bendFor, builtGraph, pairKey, proximityGraph } from './roads/graph.ts';
export type { GraphEdge, ProximityGraph } from './roads/graph.ts';
export { WATER_PROBE_STEP, crossesScree, landmarkAt, screeAt, waterProbeSteps } from './roads/ground-tests.ts';
export {
  LAYER_DEPTH, chordGap, insideOthers, layersOf, nearestOnPath, otherRoadsOf, otherTop, othersRoofline, outranks,
  pathsOverlap,
} from './roads/overlap.ts';
export type { OtherRoad } from './roads/overlap.ts';
export {
  EDGE_KEEP, carriageEdges, dashGives, edgeGives, edgeLineAcross, markingRuns, pieceAt, visibleRuns,
} from './roads/markings.ts';
export { createRoadIndex, roadIndexFor } from './roads/spatial-index.ts';
export { roadCorridors } from './roads/corridors.ts';
export type { RoadIndex } from './roads/spatial-index.ts';
export { classReaches, reachFor } from './roads/lod.ts';
export { roadsideSite } from './roads/roadside-site.ts';
export { loadRoads } from './roads/load.ts';

/** The road network drawn and streamed, and the surface a foot stands on. */
export function createRoads(world: World, places: readonly Place[], data: RoadData): Roads {
  const group = new THREE.Group();
  group.name = 'roads';

  // The graph stores endpoints as indices into `places.bin`, so a road baked
  // against another list joins two arbitrary towns. `pnpm check` asserts the
  // same; this is the runtime half.
  if (data.places !== places.length) {
    throw new Error(
      `roads.bin was baked against ${data.places} places and there are ${places.length}. Run \`pnpm roads\`.`,
    );
  }
  holdGates(data.roads, places, world);

  const { material, reach } = createRoadMaterial();
  const propsMaterial = createPropsMaterial();
  const roads = data.roads;
  const geometry = roadGeometryFor(roads, places);
  const summary = summarizeRoads(roads, places);
  const caches = createRoadCaches({ world, places, roads, geometry, readMiddle: summary.readMiddle });
  const tiles = bucketTiles(roads, summary, world);

  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const regions = new Array<string | undefined>(places.length);
  const regionId = (index: number): string => {
    let found = regions[index];
    if (found === undefined) {
      const place = places[index]!;
      found = regionFor(place.iso, continentOf.get(place.iso) ?? '', place.lat).id;
      regions[index] = found;
    }
    return found;
  };
  const ribbons = createRibbonCache({ world, roads, geometry, caches, readMiddle: summary.readMiddle, regionId });
  const streamer = createRoadStreamer({ roads, summary, tiles, caches, ribbons, material, propsMaterial, reach, group });
  const height = createRibbonHeight({ world, places, roads, geometry, rampFor: caches.rampFor });

  return {
    group,
    stats: streamer.stats,
    all: roads,
    ribbonHeightAt: height.ribbonHeightAt,
    setGround: height.setGround,
    setTaken: caches.setTaken,
    proxies: () => [proxyOf(material), proxyOf(propsMaterial)],
    lampsNear: streamer.lampsNear,
    update: streamer.update,
    degrees() {
      const count = new Int32Array(places.length);
      for (const road of roads) {
        count[road.a]!++;
        count[road.b]!++;
      }
      const histogram: number[] = [];
      let total = 0;
      let max = 0;
      let isolated = 0;
      for (const value of count) {
        total += value;
        if (value > max) max = value;
        if (value === 0) isolated++;
        histogram[value] = (histogram[value] ?? 0) + 1;
      }
      for (let i = 0; i < histogram.length; i++) histogram[i] = histogram[i] ?? 0;
      return { mean: Number((total / places.length).toFixed(2)), max, isolated, histogram };
    },
  };
}
