/**
 * The world as the map's bake and check read it, off disk: Earth's outlines,
 * places, roads, railway and landmarks (`loadEarth`), and, for the near
 * levels, the towns' plans and the countryside's (`loadEarthTowns`), which
 * need the scenery's registry and the baked kit — the same shim
 * `check-seated.ts` uses for Vite's `import.meta.glob`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLakes, loadWorld } from '../src/geo.ts';
import type { World } from '../src/geo.ts';
import { UNITS_PER_DEGREE } from '../src/globe.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import { indexPlaces, terrainSiteOf } from '../src/places.ts';
import type { Place } from '../src/places.ts';
import type { Road } from '../src/roads.ts';
import { decodePlaces, decodeRails, decodeRoads, inflate } from '../src/pack.ts';
import { createRailNetwork } from '../src/rails.ts';
import type { RailNetwork } from '../src/rails.ts';
import type { MapLandmark } from '../src/map-features.ts';

const here = dirname(fileURLToPath(import.meta.url));

export interface EarthData {
  world: World;
  places: readonly Place[];
  roads: Road[];
  rails: RailNetwork | null;
  landmarks: (MapLandmark & { id: string; name: string })[];
}

let earth: Promise<EarthData> | null = null;

export function loadEarth(): Promise<EarthData> {
  earth ??= (async (): Promise<EarthData> => {
    const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
    const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
    globalThis.fetch = (async (url: string) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
    })) as unknown as typeof fetch;
    const monumentsPath = resolve(here, '../public/data/monuments.json');
    const landmarks = (existsSync(monumentsPath) ? (JSON.parse(readFileSync(monumentsPath, 'utf8')) as { monuments: EarthData['landmarks'] }).monuments : []);
    setFlattenSites(landmarks as never);
    const placesRaw = decodePlaces(await inflate(readFileSync(resolve(here, '../public/data/places.bin'))));
    setDetailSites(placesRaw.map(terrainSiteOf));
    const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
    const places = indexPlaces(placesRaw, 0).all;
    const roadsRaw = decodeRoads(await inflate(readFileSync(resolve(here, '../public/data/roads.bin'))));
    const roads = roadsRaw.places === places.length ? roadsRaw.roads : [];
    const railsRaw = decodeRails(await inflate(readFileSync(resolve(here, '../public/data/rails.bin'))));
    const rails = railsRaw.places === places.length && railsRaw.roads === roads.length ? createRailNetwork(railsRaw.lines, places, world) : null;
    return { world, places, roads, rails, landmarks };
  })();
  return earth!;
}

/** The registries' `import.meta.glob`, rewritten into the static imports Vite would have made. */
function shimRegistries(): void {
  const registries = ['/src/scenery/index.ts', '/src/traffic/index.ts', '/src/fauna/index.ts'];
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (url.endsWith('/src/monuments/index.ts')) {
        const files = readdirSync(resolve(here, '../src/monuments')).filter((file) => file.endsWith('.ts') && file !== 'contract.ts' && file !== 'index.ts').sort();
        const imports = files.map((file, i) => `import * as monument${i} from './${file}';`).join('\n');
        const table = `{ ${files.map((file, i) => `'./${file}': monument${i}`).join(', ')} }`;
        const text = String(result.source);
        const glob = /import\.meta\.glob\s*(?:<.*?>)?\s*\(\s*\[[^\]]*\],\s*\{ eager: true \},?\s*\)/;
        if (!glob.test(text)) throw new Error('map-node: the monument registry no longer reads its files the way this shim rewrites');
        return { ...result, source: `${imports}\n${text.replace(glob, table)}` };
      }
      const registry = registries.find((end) => url.endsWith(end));
      if (registry === undefined) return result;
      const parts = resolve(here, `..${registry.replace('/index.ts', '')}/parts`);
      const files = readdirSync(parts).filter((file) => file.endsWith('.ts')).sort();
      const imports = files.map((file, i) => `import * as part${i} from './parts/${file}';`).join('\n');
      const table = `{ ${files.map((file, i) => `'./parts/${file}': part${i}`).join(', ')} }`;
      const text = String(result.source);
      const glob = /import\.meta\.glob\s*(?:<.*?>)?\s*\('\.\/parts\/\*\.ts', \{ eager: true \}\)/;
      if (!glob.test(text)) throw new Error(`map-node: ${registry} no longer reads its parts the way this shim rewrites`);
      return { ...result, source: `${imports}\n${text.replace(glob, table)}` };
    },
  });
}

/** Earth's features painter with the towns' plans, the countryside and the strips, all headless. */
export async function loadEarthFeatures() {
  const data = await loadEarth();
  shimRegistries();
  const { registerModelsFromDisk } = await import('./kit-node.ts');
  await registerModelsFromDisk();
  const { createSettlements } = await import('../src/settlements.ts');
  const { createCountryside } = await import('../src/countryside.ts');
  const { createSiteIndex } = await import('../src/fleet.ts');
  const { createPadIndex } = await import('../src/launch-pads.ts');
  const { createEarthFeatures } = await import('../src/map-features.ts');
  const { railFields } = await import('../src/rails.ts');
  const { world, places, roads, rails, landmarks } = data;
  const settlements = createSettlements(world, places, { monuments: landmarks as never, roads });
  const sites = createSiteIndex({ world, places, roads, monuments: landmarks as never });
  const countryside = createCountryside(world, { places, monuments: landmarks as never, roads, fields: sites });
  const pads = createPadIndex({ world, sites, rails: rails === null ? null : railFields(rails) });
  const features = createEarthFeatures({
    world,
    places,
    roads,
    rails,
    landmarks,
    planesNear: (direction, radius, out) => sites.planesNear(direction, radius, out as never),
    stripsReady: (direction, radius, more) => sites.warm(direction, radius, more),
    pads: (direction, radius, out) => pads.padsWithin(direction, radius, out as never, () => true),
    countryside: () => countryside,
    // Headless there is no frame to spread a plan over: worked out on the ask.
    plans: (index) => settlements.townPlanNow(index),
  });
  return { ...data, settlements, countryside, sites, pads, features };
}
