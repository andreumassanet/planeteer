import { DATA_URL, decodeRoads, inflate } from '../pack.ts';
import type { RoadData } from './types.ts';

/** Fetches and decodes `roads.bin`, under the deploy's base so a build served from a sub-path finds it. */
export async function loadRoads(url = `${DATA_URL}roads.bin`): Promise<RoadData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodeRoads(await inflate(await response.arrayBuffer()));
}
