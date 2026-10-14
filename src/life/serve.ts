/** Builds the pool keys the last frame asked for, under a time budget. */
import { detailBuild, mayBuild } from '../view.ts';
import type { LifeStats } from './api.ts';
import type { Builders } from './builders.ts';
import type { HerdBuilder } from './herd-build.ts';
import type { HerdSite } from './herd-types.ts';
import type { Pool } from './pool.ts';
import type { Regions } from './regions.ts';
import { BUILD_BUDGET_MS, INSIDE, INSIDE_RIGHT } from './tuning.ts';

interface ServeDeps {
  pool: Pool;
  builders: Builders;
  herdBuilder: HerdBuilder;
  herdSites: ReadonlyMap<string, HerdSite>;
  regions: Regions;
  stats: LifeStats;
}

export function createServe({ pool, builders, herdBuilder, herdSites, regions, stats }: ServeDeps): () => void {
  /**
   * Builds one key: `v|id|region|variant[|in|ir]`, `w|region|body` or
   * `h|row.col`. A herd site the scan has not described (its record can be
   * dropped a scan before its key) is skipped, not refused: refusals are
   * permanent.
   */
  function buildKey(key: string): void {
    const parts = key.split('|');
    if (parts[0] === 'v') {
      const style = regions.trafficOfRegion(parts[2]!);
      const built = style === undefined ? null : builders.buildVehicle(key, parts[1]!, style, parts[2]!, Number(parts[3]), parts[4] === INSIDE || parts[4] === INSIDE_RIGHT, parts[4] === INSIDE_RIGHT);
      if (built === null) pool.refused.add(key);
      else if (built !== 'pending') pool.entries.set(key, built);
    } else if (parts[0] === 'w') {
      const built = builders.buildWalker(key, parts[1]!, Number(parts[2]));
      if (built === null) pool.refused.add(key);
      else built.forEach((entry, phase) => pool.entries.set(`${key}|${phase}`, entry));
    } else if (parts[0] === 'h') {
      const site = herdSites.get(key);
      if (site !== undefined) {
        const built = herdBuilder.buildHerd(key, site);
        // A rig still on its way is asked for again by the next scan.
        if (built === null) pool.refused.add(key);
        else if (built !== 'pending') pool.entries.set(key, built);
      }
    }
  }

  /** Inside this streamer's slice and the frame's (`mayBuild`): movers are served after every other streamer. */
  return function serve(): void {
    if (pool.wanted.size === 0) {
      stats.lastBuildMs = 0;
      return;
    }
    const started = performance.now();
    const budget = detailBuild(BUILD_BUDGET_MS);
    // The set itself, not a copy: only `update` adds to it.
    for (const key of pool.wanted) {
      if (!mayBuild(started, budget, true)) break;
      pool.wanted.delete(key);
      buildKey(key);
    }
    stats.lastBuildMs = performance.now() - started;
  };
}
