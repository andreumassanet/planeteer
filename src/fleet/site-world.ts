/** What every site search shares: the built towns and the geometry round them. */
import { createSiteGeometry } from './site-geometry.ts';
import type { SiteGeometry } from './site-geometry.ts';
import { createSiteTowns } from './site-towns.ts';
import type { SiteTowns } from './site-towns.ts';
import type { FleetSource } from './site-types.ts';

export { distanceToPath } from './site-towns.ts';

export type SiteWorld = SiteTowns & SiteGeometry;

export function createSiteWorld(source: FleetSource): SiteWorld {
  const towns = createSiteTowns(source);
  return { ...towns, ...createSiteGeometry(towns) };
}
