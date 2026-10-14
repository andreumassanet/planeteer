/** Offers the scan its road vehicles and the walkers on the verges. */
import type * as THREE from 'three';
import { WALK_SPEED } from '../avatar.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { ROAD_CLASSES } from '../roads.ts';
import { rngFrom } from '../scenery/random.ts';
import { VARIANTS } from '../traffic/contract.ts';
import { driveAt } from './drive.ts';
import type { Drives } from './drive.ts';
import type { Regions } from './regions.ts';
import type { Routes } from './routes.ts';
import type { Consider } from './scan.ts';
import { MIN_SECONDS, OCCUPANCY, ROAD_SCAN_CAP, ROAD_SLOTS, ROAD_SPEED, WALK_BODIES } from './tuning.ts';

/**
 * Two passes: a cheap squared distance over every road, then the seeded draws
 * on only the nearest `ROAD_SCAN_CAP`. The draws hash their arguments, and a
 * dense region has hundreds of roads in reach whose movers the cap would only
 * sort away.
 */
export function createRoadScan(
  routes: Routes, drives: Drives, regions: Regions,
): (viewer: THREE.Vector3, roadRange: number, footRange: number, consider: Consider) => void {
  const { roads, roadMid, roadSpan } = routes;
  const nearRoads: { index: number; near: number }[] = [];

  return function scanRoads(viewer: THREE.Vector3, roadRange: number, footRange: number, consider: Consider): void {
    if (roads.length === 0 || (roadRange <= 0 && footRange <= 0)) return;
    const anchor = PLANET_RADIUS + 20;
    const widest = Math.max(roadRange, footRange);
    nearRoads.length = 0;
    for (let i = 0; i < roads.length; i++) {
      const dx = roadMid[i * 3]! * anchor - viewer.x;
      const dy = roadMid[i * 3 + 1]! * anchor - viewer.y;
      const dz = roadMid[i * 3 + 2]! * anchor - viewer.z;
      const limit = widest + roadSpan[i]!;
      const squared = dx * dx + dy * dy + dz * dz;
      if (squared > limit * limit) continue;
      nearRoads.push({ index: i, near: Math.sqrt(squared) - roadSpan[i]! });
    }
    nearRoads.sort((a, b) => a.near - b.near);
    if (nearRoads.length > ROAD_SCAN_CAP) nearRoads.length = ROAD_SCAN_CAP;
    for (const entry of nearRoads) {
      const i = entry.index;
      const near = entry.near;
      const road = roads[i]!;
      const cls = road.cls;
      const style = regions.trafficAt(road.a);
      const region = regions.regionAt(road.a).id;
      const width = ROAD_CLASSES[cls]!.width;

      if (near < roadRange) {
        for (let slot = 0; slot < ROAD_SLOTS; slot++) {
          const rng = rngFrom('drive', i, slot);
          if (!rng.chance(OCCUPANCY[cls]! * Math.min(1.6, style.density * 2.4))) continue;
          const id = rng.weighted(style.road);
          const pooled = `v|${id}|${region}|${rng.int(VARIANTS)}`;
          const key = `r${i}.${slot}`;
          const lateral = width * 0.26;
          const drive = drives.driveFor(i, key, lateral);
          const phase = rng.unit();
          const speed = Math.min(ROAD_SPEED[cls]! * rng.spread(1, 0.16), drive.run / MIN_SECONDS);
          consider({
            family: 'road',
            key,
            pool: pooled,
            vehicle: id,
            speed,
            route: (clock, out, ground) => {
              drives.driveFrame(drive, driveAt(drive, phase, speed, clock), lateral, out, ground);
            },
            lane: lateral,
            keep: routes.sideOf(i),
          }, viewer, roadRange);
        }
      }

      // Nobody walks a trunk road.
      if (near < footRange && cls < 2) {
        for (let slot = 0; slot < 2; slot++) {
          const rng = rngFrom('walk', i, slot);
          if (!rng.chance(0.5)) continue;
          const pooled = `w|${region}|${rng.int(WALK_BODIES)}`;
          const key = `f${i}.${slot}`;
          const chain = routes.chainFor(i, key);
          const phase = rng.unit();
          const speed = Math.min(WALK_SPEED * rng.spread(0.85, 0.18), chain.total / MIN_SECONDS);
          // On the verge, on the side the traffic keeps (`chainFrame` applies it).
          const lateral = width * 0.5 + rng.range(1.4, 3.2);
          consider({
            family: 'foot',
            key,
            pool: pooled,
            speed,
            route: (clock, out, ground) => {
              const where = routes.alongAt(chain, phase, speed, clock);
              routes.chainFrame(chain, where.at, lateral, out, ground, where.back);
            },
          }, viewer, footRange);
        }
      }
    }
  };
}
