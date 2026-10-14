/**
 * The paper both maps draw (`map-tiles.ts`), painted from the same
 * definitions the world is built from, and the minimap in the corner.
 */
import * as THREE from 'three';
import { courseOf, coursePoint, emptyCourse } from '../roads.ts';
import type { LaunchPad } from '../launch-pads.ts';
import type { MapTiles } from '../map-tiles.ts';
import type { Minimap } from '../minimap.ts';
import type { App } from './context.ts';

/** Points along each road the minimap traces it by: enough for a bend at a street's scale. */
const MINIMAP_ROAD_SAMPLES = 24;
/**
 * Ms either map may spend per ask working out the rocket pads it shows; the
 * rest is left for the next ask. One pad's first search can run over.
 */
const MAP_PADS_MS = 1;

/** The pads one ask found, before they are handed on. */
const mapPads: LaunchPad[] = [];

/** The rocket pads within `radius` of `direction`, a budgeted slice at a time; true once all are known. */
export type PadsForMaps = (direction: THREE.Vector3, radius: number, out: { push(...pads: LaunchPad[]): unknown }) => boolean;

export interface MapPaper {
  padsForMaps: PadsForMaps;
  mapTiles: MapTiles;
  minimap: Minimap;
}

export async function createMapPaper(app: App): Promise<MapPaper> {
  const { deferred, world, places, baked, railNetwork, placements, fleetSites, padIndex, vegetation, settlements } = app;
  const padsForMaps: PadsForMaps = (direction, radius, out) => {
    const until = performance.now() + MAP_PADS_MS;
    mapPads.length = 0;
    const done = padIndex.padsWithin(direction, radius, mapPads, () => performance.now() < until);
    out.push(...mapPads);
    return done;
  };
  const { createMapTiles } = await deferred.mapTiles;
  const { createEarthFeatures } = await deferred.mapFeatures;
  const mapTiles = createMapTiles({
    world,
    features: createEarthFeatures({
      world,
      places: places.all,
      roads: baked.roads,
      rails: railNetwork,
      landmarks: placements,
      planesNear: (direction, radius, out) => fleetSites.planesNear(direction, radius, out as never),
      stripsReady: (direction, radius, more) => fleetSites.warm(direction, radius, more),
      pads: padsForMaps,
      countryside: () => vegetation.countryside,
      plans: (index) => settlements.townPlan(index),
    }),
    baked: `${import.meta.env.BASE_URL}maps/earth/`,
  });
  const { createMinimap } = await deferred.minimap;
  const minimap = createMinimap(world, {
    tiles: mapTiles,
    monuments: placements,
    places: places.all,
    // Each road traced once along its own course, the first time the disc is drawn.
    roads: () => {
      const course = emptyCourse();
      const at = new THREE.Vector3();
      return baked.roads.map((road) => {
        courseOf(road, places.all, course);
        const samples = MINIMAP_ROAD_SAMPLES;
        const line = new Float32Array(samples * 3);
        for (let k = 0; k < samples; k++) {
          coursePoint(course, k / (samples - 1), at);
          line[k * 3] = at.x;
          line[k * 3 + 1] = at.y;
          line[k * 3 + 2] = at.z;
        }
        return line;
      });
    },
    // The disc asks again until every pad on it is known.
    pads: padsForMaps,
  });
  document.getElementById('minimap')!.appendChild(minimap.canvas);
  return { padsForMaps, mapTiles, minimap };
}
