/**
 * The baked data every suite reads, loaded the way the game loads it.
 *
 * The flatten and detail sites shape the relief, so they are registered before
 * the world (and any mesh) is built.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWorld } from '../../src/geo.ts';
import type { World } from '../../src/geo.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../../src/globe.ts';
import { setDetailSites, setFlattenSites } from '../../src/terrain.ts';
import { terrainSiteOf } from '../../src/places.ts';
import type { Place } from '../../src/places.ts';
import { decodeLakes, decodePlaces, inflate } from '../../src/pack.ts';
import { setLandmarks } from '../../src/landmark-ground.ts';
import type { Plan } from '../../src/landmark-ground.ts';
import { here } from './harness.ts';

/** A landmark as `monuments.json` places it. */
export interface PlacedMonument {
  id: string;
  name?: string;
  iso: string;
  lat: number;
  lon: number;
  footprint?: number;
  height?: number;
  year?: number;
  snappedKm?: number;
  clearance?: number;
  plan?: Plan;
  shore?: true;
  setting?: 'plaza' | 'parcel';
  toward?: number;
}

export interface WorldContext {
  readonly world: World;
  readonly placed: PlacedMonument[];
  readonly placesRaw: Place[];
}

export const monumentsPath = resolve(here, '../public/data/monuments.json');
export const placesPath = resolve(here, '../public/data/places.bin');

export async function loadContext(): Promise<WorldContext> {
  const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
  const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
  // `loadWorld` fetches; in Node the stub serves the baked files off disk.
  globalThis.fetch = (async (url: string) => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
  })) as unknown as typeof fetch;

  const placed: PlacedMonument[] = existsSync(monumentsPath)
    ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: PlacedMonument[] }).monuments
    : [];
  // The monuments' pads are part of the relief, and the road bake kept its
  // gates and carriageways off their ground.
  setFlattenSites(placed);
  setLandmarks(placed, PLANET_RADIUS);

  const placesRaw: Place[] = existsSync(placesPath)
    ? decodePlaces(await inflate(readFileSync(placesPath)))
    : [];
  setDetailSites(placesRaw.map(terrainSiteOf));

  const loadStart = Date.now();
  const lakeRings = decodeLakes(await inflate(lakes));
  const world = await loadWorld(UNITS_PER_DEGREE, lakeRings);
  const loadMs = Date.now() - loadStart;
  console.log(
    `world: ${world.countries.length} countries, ${world.rings.length} rings, ` +
    `${world.rings.reduce((n, r) => n + r.points.length, 0).toLocaleString()} points, ${loadMs} ms\n`,
  );
  return { world, placed, placesRaw };
}
