/** Planning one cell: what the ground allows, which big thing it draws, and where it finds room. */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { UNITS_PER_DEGREE, WORLD_SCALE } from '../globe.ts';
import { MAX_RELIEF, reliefAt, shoreDistance } from '../terrain.ts';
import { biomeAt, biomeSample } from '../biome.ts';
import type { BiomeId } from '../biome.ts';
import { regionFor } from '../scenery/regions.ts';
import type { RegionId } from '../scenery/regions.ts';
import type { RegionStyle } from '../scenery/contract.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Rng, Weighted } from '../scenery/random.ts';
import { latOf, lonOf } from '../sphere.ts';
import { DEG, dirAt, orient } from './frame.ts';
import type { Site } from './ground.ts';
import { NEAR_ROAD, NEAR_TOWN, roadGap, townGap } from './nearby.ts';
import type { Gatherer } from './nearby.ts';
import { buildFeature } from './features.ts';
import type { Context } from './placing.ts';
import { smallThings } from './small.ts';
import { FARMING, STEPPE_NOMADS, shrineFor, turbineWeight, windmillWeight } from './tables.ts';
import type { CountryPlan, CountrysideOptions, CountrysideStats, FeatureKind } from './types.ts';

/**
 * The chance a cell holds any big thing at all, drawn before the world is
 * asked anything; the weights then share it out, and `NOTHING` is the weight
 * of the empty cell against them. Tuned by `pnpm country`'s density.
 */
const ANY = 0.62;
const NOTHING = 1.4;
/** How many other kinds a cell tries when the one it drew cannot stand anywhere in it. */
const FALLBACKS = 2;

export interface CellPlanner {
  planCell(key: string, row: number): CountryPlan;
}

/** What the world says about a cell before any feature is considered. */
interface Terrain {
  iso: string;
  style: RegionStyle;
  region: RegionId;
  halfEast: number;
  halfNorth: number;
  anchorX: number;
  anchorZ: number;
  anchor: THREE.Vector3;
  country: number;
  coast: number;
  cellDeg: number;
}

export function createCellPlanner(world: World, options: CountrysideOptions, site: Site, gatherer: Gatherer, stats: CountrysideStats): CellPlanner {
  const { frame } = site;
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const sample = biomeSample();

  /**
   * The cheap refusals first: open sea, ice and the poles have nothing.
   * Returns null for a cell that holds nothing, else what the ground says.
   */
  function survey(out: CountryPlan, u: number, v: number, centreLat: number, centreLon: number): Terrain | null {
    const halfNorth = (frame.bounds.dLat * UNITS_PER_DEGREE) / 2;
    const halfEast = (frame.bounds.dLon * Math.cos(centreLat * DEG) * UNITS_PER_DEGREE) / 2;
    const anchorX = (u - 0.5) * 2 * halfEast;
    const anchorZ = (v - 0.5) * 2 * halfNorth;
    const anchor = dirAt(frame, anchorX, anchorZ, new THREE.Vector3());
    const country = world.countryAtPoint(anchor);
    const coast = shoreDistance(latOf(anchor.y), lonOf(anchor.x, anchor.z));
    const cellDeg = Math.hypot(halfEast, halfNorth) / UNITS_PER_DEGREE;
    if (country <= 0 && coast > cellDeg + 0.05) return null;
    frame.inland = country > 0 && shoreDistance(centreLat, centreLon) > cellDeg + 0.5;
    let iso = country > 0 ? world.countries[country - 1]!.iso : '';
    if (iso === '') {
      // An anchor at sea on a coastal cell: the country of the land in it.
      for (const [a, b] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]] as const) {
        const found = world.countryAtPoint(dirAt(frame, a * 2 * halfEast * 0.6, b * 2 * halfNorth * 0.6, frame.scratch));
        if (found > 0) {
          iso = world.countries[found - 1]!.iso;
          break;
        }
      }
      if (iso === '') return null;
    }
    const style = regionFor(iso, continentOf.get(iso) ?? '', centreLat);
    out.style = style;
    const region = style.id as RegionId;
    if (region === 'polar') return null;
    return { iso, style, region, halfEast, halfNorth, anchorX, anchorZ, anchor, country, coast, cellDeg };
  }

  /** The weights of every big thing this cell could hold. */
  function choicesFor(t: Terrain, biome: BiomeId, relief: number, layout: Rng): Weighted<FeatureKind>[] {
    const { iso, region } = t;
    const landHere = t.country > 0;
    const nearTown = townGap(site.nearby, t.anchorX, t.anchorZ);
    const nearRoad = roadGap(site.nearby, t.anchorX, t.anchorZ).gap;
    const choices: Weighted<FeatureKind>[] = [{ item: 'farm', weight: 0 }];
    const farming = FARMING[biome] * (landHere ? 1 : 0);
    if (farming > 0) choices[0]!.weight = farming * (nearTown < NEAR_TOWN ? 3.5 : nearRoad < NEAR_ROAD ? 2.2 : 0.5);
    const flat = biome === 'temperate' || biome === 'grassland' || biome === 'steppe';
    if (flat && landHere) {
      const mill = windmillWeight(iso, region);
      if (mill > 0) choices.push({ item: 'windmill', weight: mill });
      const turbines = turbineWeight(iso, region);
      if (turbines > 0 && nearTown > 120) choices.push({ item: 'turbines', weight: turbines });
    }
    // The coast field is sampled on a fixed half-degree grid, so a cell is
    // coastal by its nominal size in degrees, not by its own.
    if (t.coast < t.cellDeg * WORLD_SCALE) {
      choices.push({ item: 'lighthouse', weight: nearTown < 2500 ? 1.4 : 0.5 });
      if (nearTown > 150 && biome !== 'ice' && biome !== 'desert') choices.push({ item: 'fishing', weight: 1.1 });
    }
    if (landHere) {
      const shrine = shrineFor(iso, region, relief, layout.fork('shrine'));
      // A shrine is where people pass: few in the open desert.
      if (shrine !== null) choices.push({ item: 'shrine', weight: shrine.weight * (biome === 'desert' ? 0.25 : 1) });
      if (region === 'atlantic-europe' || region === 'nordic') choices.push({ item: 'stones', weight: 0.22 });
      choices.push({ item: 'ruin', weight: region === 'mediterranean' || region === 'maghreb' || region === 'middle-east' ? 0.3 : 0.1 });
      if (biome === 'boreal' || biome === 'temperate' || biome === 'grassland' || biome === 'steppe' || biome === 'tundra' || biome === 'desert') {
        choices.push({ item: 'camp', weight: STEPPE_NOMADS.has(iso) ? 1.4 : biome === 'desert' ? 0.4 : 0.35 });
      }
      if (biome === 'desert') choices.push({ item: 'oasis', weight: 1 });
      if (biome === 'rock' || biome === 'tundra' || relief > MAX_RELIEF * 0.32) choices.push({ item: 'cairn', weight: 1.2 });
      else if (relief > MAX_RELIEF * 0.16 && biome !== 'tropical') choices.push({ item: 'cairn', weight: 0.5 });
    }
    return choices;
  }

  /** Draws a kind from the weights; null when the empty cell wins. */
  function drawKind(choices: Weighted<FeatureKind>[], pick: number): FeatureKind | null {
    let total = NOTHING;
    for (const choice of choices) total += choice.weight;
    let target = pick * total;
    for (const choice of choices) {
      target -= choice.weight;
      if (target < 0 && choice.weight > 0) return choice.item;
    }
    return null;
  }

  /**
   * What was drawn, then the next likeliest two if it found nowhere to stand: a
   * hillside that will not take a farm will take a shrine. Each kind tries the
   * first spot, then the cell's quarters.
   */
  function placeFeature(out: CountryPlan, kind: FeatureKind, choices: Weighted<FeatureKind>[], tries: [number, number][], layout: Rng, base: Omit<Context, 'x' | 'z'>): void {
    const order = [kind, ...choices.filter((choice) => choice.item !== kind && choice.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, FALLBACKS).map((choice) => choice.item)];
    for (const candidate of order) {
      for (let attempt = 0; attempt < tries.length && out.kind === null; attempt++) {
        const [tu, tv] = tries[attempt]!;
        const context: Context = { ...base, x: (tu - 0.5) * 2 * base.halfEast, z: (tv - 0.5) * 2 * base.halfNorth };
        if (buildFeature(site, options, candidate, out, layout.fork(`${candidate}:${attempt}`), context)) out.kind = candidate;
        else {
          out.pieces.length = 0;
          out.fields.length = 0;
          out.lines.length = 0;
          site.claimed.length = 0;
        }
      }
      if (out.kind !== null) break;
      stats.refused[candidate] = (stats.refused[candidate] ?? 0) + 1;
    }
  }

  function planCell(key: string, row: number): CountryPlan {
    const { bounds } = frame;
    // Every draw in a fixed order, before anything can refuse the cell.
    const rng = rngFrom('country', row, Math.round((bounds.west + 180) / bounds.dLon));
    const any = rng.unit();
    const pick = rng.unit();
    const u = rng.range(0.32, 0.68);
    const v = rng.range(0.32, 0.68);
    // Where else to try, if the first spot is taken: the cell's four quarters.
    const tries: [number, number][] = [[u, v]];
    for (const [a, b] of [[0.28, 0.28], [0.72, 0.28], [0.72, 0.72], [0.28, 0.72]] as const) {
      tries.push([a + rng.range(-0.08, 0.08), b + rng.range(-0.08, 0.08)]);
    }
    const minor = rng.fork('minor');
    const layout = rng.fork('layout');

    const centreLat = bounds.south + bounds.dLat / 2;
    const centreLon = bounds.west + bounds.dLon / 2;
    orient(frame, centreLat, centreLon);
    const out: CountryPlan = { key, kind: null, style: regionFor('', '', centreLat), pieces: [], fields: [], lines: [], meadows: [] };

    const t = survey(out, u, v, centreLat, centreLon);
    if (t === null) return out;
    gatherer.gather(Math.hypot(t.halfEast, t.halfNorth));
    site.claimed.length = 0;

    const { anchor } = t;
    const relief = reliefAt(anchor.x, anchor.y, anchor.z);
    const anchorLat = latOf(anchor.y);
    biomeAt(anchor.x, anchor.y, anchor.z, anchorLat, lonOf(anchor.x, anchor.z), relief, sample);
    const biome = sample.id;
    const base = { iso: t.iso, region: t.region, biome, relief, style: t.style, lat: anchorLat, halfEast: t.halfEast, halfNorth: t.halfNorth };

    if (any < ANY) {
      const choices = choicesFor(t, biome, relief, layout);
      const kind = drawKind(choices, pick);
      if (kind === null) stats.refused.nothing = (stats.refused.nothing ?? 0) + 1;
      else placeFeature(out, kind, choices, tries, layout, base);
    } else stats.refused.quiet = (stats.refused.quiet ?? 0) + 1;

    // And the small things, anywhere else in the cell.
    if (t.country > 0) smallThings(site, out, minor, { ...base, x: t.anchorX, z: t.anchorZ });
    return out;
  }

  return { planCell };
}
