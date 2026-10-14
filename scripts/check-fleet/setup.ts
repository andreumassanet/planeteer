import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { type LandmarkSite } from '../../src/landmark-ground.ts';
import { setFlattenSites, setDetailSites } from '../../src/terrain.ts';
import { decodePlaces, inflate, decodeRoads } from '../../src/pack.ts';
import { terrainSiteOf, indexPlaces } from '../../src/places.ts';
import { loadWorld, loadLakes } from '../../src/geo.ts';
import { UNITS_PER_DEGREE } from '../../src/globe.ts';
import { type Road } from '../../src/roads.ts';

export const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export let failures = 0;
export const check = (ok: boolean, label: string, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

// --- the world, as check-life.ts loads it ------------------------------------

const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

const monumentsPath = resolve(here, '../public/data/monuments.json');
export const monuments: LandmarkSite[] = existsSync(monumentsPath)
  ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: typeof monuments }).monuments
  : [];
setFlattenSites(monuments as never);

const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
setDetailSites(placesRaw.map(terrainSiteOf));
export const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
export const places = indexPlaces(placesRaw, 0).all;
const roadsRaw = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
export const roads: Road[] = roadsRaw.places === places.length ? roadsRaw.roads : [];
if (roads.length === 0) {
  console.log(`  roads.bin was baked against ${roadsRaw.places} places and there are ${places.length}. Run \`pnpm roads\`.`);
  process.exit(1);
}
console.log(`world: ${places.length} places, ${roads.length} roads, ${monuments.length} landmarks\n`);
