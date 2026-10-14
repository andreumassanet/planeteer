/**
 * The world's data files, fetched in parallel and installed in the order the
 * terrain requires: the monuments' flattened sites, then the towns' detail
 * sites, then the outlines. Installing a site after the relief has been asked
 * for throws, so this has to finish before anything else touches the terrain.
 */
import { loadLakes, loadWorld } from '../geo.ts';
import type { World } from '../geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import { loadPlacements } from '../placement.ts';
import type { Placement } from '../placement.ts';
import { loadPlaces, terrainSiteOf } from '../places.ts';
import type { Places } from '../places.ts';
import { loadRoads } from '../roads.ts';
import type { RoadData } from '../roads.ts';
import { loadRails } from '../rails.ts';
import { setDetailSites, setFlattenSites } from '../terrain.ts';
import { loadStars } from '../celestial.ts';

type RailData = Awaited<ReturnType<typeof loadRails>>;
type StarCatalogue = Awaited<ReturnType<typeof loadStars>>;

export interface WorldData {
  world: World;
  places: Places;
  placements: Placement[];
  baked: RoadData;
  /** Optional: a world without `rails.bin` has no trains. */
  railsLoad: Promise<RailData | null>;
  /** Optional: a world without `stars.bin` has starless nights. */
  starsLoad: Promise<StarCatalogue | null>;
}

export async function loadData(): Promise<WorldData> {
  const railsLoad = loadRails().catch((error: unknown) => {
    console.warn('the railway did not load', error);
    return null;
  });
  const starsLoad = loadStars().catch((error: unknown) => {
    console.warn('the stars did not load', error);
    return null;
  });
  const [placements, places, baked, lakes] = await Promise.all([
    loadPlacements(),
    loadPlaces(PLANET_RADIUS),
    loadRoads(),
    loadLakes(),
  ]);
  setFlattenSites(placements);
  // Towns ask the terrain for finer triangulation under their floors.
  setDetailSites(places.all.map(terrainSiteOf));
  const world = await loadWorld(UNITS_PER_DEGREE, lakes);
  return { world, places, placements, baked, railsLoad, starsLoad };
}
