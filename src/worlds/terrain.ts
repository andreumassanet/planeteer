/**
 * The ground of another world: the one definition of how high it is and what
 * colour, which the tiles draw, the foot stands on, the settlements are seated
 * by and the check samples.
 *
 * It is Earth's arrangement one level out (`reliefAt` is the one definition of
 * the relief and everything reads it), built from the spec rather than written
 * per world:
 *
 * ```
 *   height = body relief * planetScale     (src/system's GroundModel: the map)
 *          + detail octaves                 (walking-scale bumps)
 *          + craters                        (craters.ts: a field, not a list)
 *          + features                       (the planet file's own functions)
 *   then levelled toward each settlement's and landmark's pad
 * ```
 *
 * Heights are units above the body's walkable radius, which for a giant is the
 * 1-bar level the cloud deck rolls on. The parts are in `terrain/`.
 */

import type { WorldSpec } from './contract.ts';
import { surfaceRadiusOf } from '../system/contract.ts';
import { createCraters } from './craters.ts';
import type { CraterHit } from './craters.ts';
import { latOf, lonOf } from '../sphere.ts';
import { FINEST_DECK, FINEST_TILE, levelsFor } from './cube.ts';
import { createBareSpots, createGroundAt } from './terrain/drawn.ts';
import { createField, sampleMax } from './terrain/field.ts';
import { createPads } from './terrain/pads.ts';
import { createPainter } from './terrain/paint.ts';
import type { Terrain, TerrainSample } from './terrain/types.ts';

export { grade, linearOf } from './terrain/color.ts';
export { newSample } from './terrain/types.ts';
export type { Pad, Terrain, TerrainSample } from './terrain/types.ts';

export function createTerrain(spec: WorldSpec): Terrain {
  const body = spec.body;
  const radius = surfaceRadiusOf(body.radiusKm);
  const relief = spec.relief;
  const model = body.ground;
  const planetScale = model === null ? 0 : relief.planetScale;
  const craters = createCraters(spec.ground === 'cloud-deck' ? null : relief.craters, radius);
  const levels = levelsFor(radius, spec.ground === 'cloud-deck' ? FINEST_DECK : FINEST_TILE);
  const hit: CraterHit = { bowl: 0, ejecta: 0 };

  const raw = createField(spec, radius, craters, hit);
  const { pads, level, padAt } = createPads(spec, radius, raw);
  const paint = createPainter(spec, radius);
  const { keepBare, bareAt } = createBareSpots(radius, padAt);

  function heightAt(x: number, y: number, z: number): number {
    const lat = latOf(y);
    const lon = lonOf(x, z);
    return level(raw(x, y, z, lat, lon), x, y, z, lat, lon);
  }

  function sample(x: number, y: number, z: number, out: TerrainSample): TerrainSample {
    const lat = latOf(y);
    const lon = lonOf(x, z);
    out.height = level(raw(x, y, z, lat, lon), x, y, z, lat, lon);
    out.lat = lat;
    out.lon = lon;
    out.bowl = hit.bowl;
    out.ejecta = hit.ejecta;
    paint(x, y, z, lat, lon, hit, out);
    return out;
  }

  // Bounds: what the body's relief can reach, the detail's amplitudes, the
  // craters' depth. Features are the planet file's and get a generous margin.
  let detail = 0;
  for (const d of relief.detail) detail += d.amplitude * 1.2;
  const reliefTop = model === null ? 0 : sampleMax(model.relief) * planetScale;
  const featureMargin = relief.features.length > 0 ? radius * 0.05 : 0;

  return {
    spec,
    radius,
    levels,
    pads,
    low: -detail + craters.low - featureMargin,
    high: reliefTop + detail + craters.high + featureMargin,
    heightAt,
    sample,
    groundAt: createGroundAt(levels, heightAt),
    padAt,
    keepBare,
    bareAt,
  };
}
