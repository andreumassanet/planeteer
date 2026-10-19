// The shape of the land as one pure function of a point on the unit sphere.
//
// `globe.ts` displaces every land vertex by `reliefAt` and `geo.ts`'s
// `elevationAt` adds the same number to the same ring shelf, so the mesh and the
// player's feet cannot drift apart. Everything is arithmetic: no heightmap,
// nothing fetched, and a fixed seed, so it is the same planet on every load.
// The parts live in `terrain/`; this module composes them.

import type { LandRing } from './geo.ts';
import { DEG } from './terrain/constants.ts';
import { buildCoastFields, coastFieldsReady } from './terrain/coast-field.ts';
import { beginPads } from './terrain/pads.ts';
import { onFirstQuery } from './terrain/queries.ts';
import { scale } from './terrain/scale.ts';
import { buildShoreIndex } from './terrain/shore.ts';
import { buildValleys } from './terrain/town-sites.ts';

export { APRON_FOOT, MAX_RELIEF, RELIEF_DETAIL, SHORE_APRON, SHORE_LIP } from './terrain/constants.ts';
export { SHORE_WATERLINE, apronDepth, apronReachAt } from './terrain/apron.ts';
export { fbm } from './terrain/noise.ts';
export { oceanDistance, shoreDistance } from './terrain/coast-field.ts';
export type { ShoreSample } from './terrain/shore.ts';
export { shoreAt, shoreSample } from './terrain/shore.ts';
export type { FlattenSite } from './terrain/pads.ts';
export { PAD_MARGIN, SHORE_CLEAR, flattenWeightAt, padPoints, setFlattenSites } from './terrain/pads.ts';
export type { DetailSite } from './terrain/town-sites.ts';
export { detailWeightAt, setDetailSites } from './terrain/town-sites.ts';
export { reliefAt } from './terrain/relief.ts';
export type { Slope } from './terrain/grade.ts';
export { MAX_SLOPE, gradeAt } from './terrain/grade.ts';

// The first relief query freezes the sites and builds what depends on them.
onFirstQuery(() => {
  buildValleys();
  beginPads();
});

let preparedFor: LandRing[] | null = null;

/**
 * Builds the coast fields and the shore index. Idempotent and cheap to call
 * again: `geo.ts` calls it as the world loads and `globe.ts` before building
 * the mesh, so whichever runs first, both read the same fields.
 */
export function prepareTerrain(
  rings: LandRing[],
  unitsPerDegree: number,
  isLand: (lat: number, lon: number) => boolean,
): void {
  if (preparedFor === rings && coastFieldsReady()) return;
  buildCoastFields(rings);
  scale.unitsPerRadian = unitsPerDegree / DEG;
  buildShoreIndex(rings, isLand);
  preparedFor = rings;
}
