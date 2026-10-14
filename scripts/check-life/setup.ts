import { registerModelsFromDisk } from '../kit-node.ts';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { unitAt } from '../../src/sphere.ts';
import { readFileSync, existsSync } from 'node:fs';
import { setFlattenSites, setDetailSites } from '../../src/terrain.ts';
import { decodePlaces, inflate, decodeRoads } from '../../src/pack.ts';
import { terrainSiteOf, indexPlaces } from '../../src/places.ts';
import { loadWorld, loadLakes } from '../../src/geo.ts';
import { UNITS_PER_DEGREE } from '../../src/globe.ts';
import { type Road } from '../../src/roads.ts';

// The vehicles are baked CC0 models now (scripts/build-kit.ts): register them as main.ts does.
await registerModelsFromDisk();

export const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export let failures = 0;
export const countFailure = (): void => {
  failures++;
};
export const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

export const dirAt = (lat: number, lon: number): Vector3 => unitAt(lat, lon, new Vector3());

// --- the world ------------------------------------------------------------

const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
// The lakes are a second file and the stub has to answer with the one asked
// for: handing `decodeLakes` the outlines throws on the magic rather than
// misreading them.
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

const monumentsPath = resolve(here, '../public/data/monuments.json');
const monuments: { lat: number; lon: number; footprint?: number; clearance?: number }[] = existsSync(monumentsPath)
  ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: typeof monuments }).monuments
  : [];
setFlattenSites(monuments as never);

const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
setDetailSites(placesRaw.map(terrainSiteOf));

export const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
export const places = indexPlaces(placesRaw, 0).all;

const roadsRaw = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
export const roads: Road[] = roadsRaw.places === places.length ? roadsRaw.roads : [];
if (roads.length === 0 && roadsRaw.roads.length > 0) {
  // The runtime refuses outright — a road baked against a different list of
  // places joins two arbitrary towns. Here it is a skipped section rather than
  // a crash, so the rest of the file still says something.
  console.log(`  roads.json was baked against ${roadsRaw.places} places and there are ${places.length}. Run \`pnpm roads\`.`);
  failures++;
}
console.log(`world: ${places.length} places, ${roads.length} roads\n`);
