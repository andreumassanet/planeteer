/**
 * What stands on Earth, painted onto the map's tiles (`map-tiles.ts`): the
 * roads, the railway, the towns as they are built, the fields and the woods,
 * the landmarks' ground, the airstrips and the rockets' pads.
 *
 * Every mark is read off the definition the world itself is built from: a road
 * is its `coursePath` at the carriageway's width in its region's tarmac; a
 * railway is `RailNetwork.path`; a town is its `TownPlan` (the floor's cells,
 * the streets on their bands, every building's plan box in its own roof's
 * colour); a field is the countryside's `CropField`; a landmark is its plan; a
 * strip is `stripCorners`; a pad is `PadIndex.padsWithin`. Positions go
 * through each thing's own frame onto the tile (`TileView.frame`), so nothing
 * here decides which way east is. A wood is dots on a lattice thinned by the
 * biome's `cover`, and a countryside piece a footprint in a colour by its
 * part, since its model is only built near.
 *
 * Levels (a level-`z` tile is 392/2^z units a pixel at the equator):
 *
 * ```
 *   z5   12 u/px   roads as lines, towns as squares
 *   z6    6 u/px   + the railway, strips, landmarks, towns as their cells
 *   z7    3 u/px   + streets, blocks of buildings, fields, woods, pads
 *   z8  1.5 u/px   + every building inked, trees, farms and mills
 *   z9  0.8 u/px   + a field's rows, fences
 * ```
 *
 * The painters live in `map-features/`; this file composes them.
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import type { Place } from './places.ts';
import type { Road } from './roads.ts';
import type { RailNetwork } from './rails.ts';
import type { TownPlan } from './settlements.ts';
import type { Countryside } from './countryside.ts';
import type { Plan } from './landmark-ground.ts';
import type { StripSite } from './craft/airstrip.ts';
import type { MapFeatures } from './map-tiles.ts';
import {
  FIELDS_FROM, LANDMARKS_FROM, PADS_FROM, RAILS_FROM, ROADS_FROM, STRIPS_FROM, TOWNS_FROM, WOODS_FROM,
} from './map-features/constants.ts';
import { createCtx } from './map-features/context.ts';
import { paintCountry } from './map-features/country.ts';
import { ready } from './map-features/index.ts';
import { paintLandmarks, paintPads, paintStrips } from './map-features/marks.ts';
import { hash2 } from './map-features/noise.ts';
import { paintRails, paintRoads } from './map-features/transport.ts';
import { paintTowns } from './map-features/towns.ts';
import { paintWoods } from './map-features/woods.ts';

export { hash2 };

/** As much of a placement as the map draws: where it stands and its plan. */
export interface MapLandmark {
  lat: number;
  lon: number;
  footprint?: number;
  plan?: Plan;
}

export interface EarthFeatureSources {
  world: World;
  /** Every place, the array `roads.bin` indexes into. */
  places: readonly Place[];
  roads: readonly Road[];
  rails?: RailNetwork | null;
  landmarks?: readonly MapLandmark[];
  /** The plane sites, whose strips are drawn: `FieldIndex.planesNear`. */
  planesNear?: (direction: THREE.Vector3, radius: number, out: StripSite[]) => StripSite[];
  /**
   * Works the strips round a point out while `more` allows, true once they
   * are (`SiteIndex.warm`; asked `FIELD_SPREAD` wider, as `planesNear`
   * looks): a city's strip search is the dear one, up to 26 ms, and
   * `planesNear` would do it all at once.
   */
  stripsReady?: (direction: THREE.Vector3, radius: number, more: () => boolean) => boolean;
  /** The pads within `radius` of `direction`; false while some are still being worked out (`PadIndex.padsWithin`). */
  pads?: (direction: THREE.Vector3, radius: number, out: { at: THREE.Vector3 }[]) => boolean;
  /** The countryside's planner, once the vegetation has one. */
  countryside?: () => Countryside | null;
  /** A town's plan (`Settlements.townPlan`): undefined while it is worked out. */
  plans?: (index: number) => TownPlan | null | undefined;
}

export function createEarthFeatures(sources: EarthFeatureSources): MapFeatures {
  const f = createCtx(sources);
  const { places, roads } = sources;
  return {
    stamp: `e${places.length}:${roads.length}:${sources.rails?.lines.length ?? 0}:${sources.landmarks?.length ?? 0}`,
    fromLevel: ROADS_FROM,
    *paint(view, raster) {
      yield* ready(f);
      if (view.z >= WOODS_FROM) yield* paintWoods(f, view, raster);
      if (view.z >= FIELDS_FROM) yield* paintCountry(f, view, raster);
      if (view.z >= STRIPS_FROM) yield* paintStrips(f, view, raster);
      if (view.z >= ROADS_FROM) yield* paintRoads(f, view, raster);
      if (view.z >= RAILS_FROM) yield* paintRails(f, view, raster);
      if (view.z >= TOWNS_FROM) yield* paintTowns(f, view, raster);
      if (view.z >= LANDMARKS_FROM) paintLandmarks(f, view, raster);
      if (view.z >= PADS_FROM) yield* paintPads(f, view, raster);
    },
  };
}
