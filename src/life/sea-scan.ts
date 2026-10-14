/** Offers the scan its boats: each circles a course on open water near the coast. */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { rngFrom } from '../scenery/random.ts';
import { VARIANTS } from '../traffic/contract.ts';
import { cellPoint, forEachCell, tangentsAt } from './cells.ts';
import type { Frame } from './mover.ts';
import type { PlaceIndex } from './place-index.ts';
import type { Regions } from './regions.ts';
import type { Consider } from './scan.ts';
import { CRAFT_SPEED, SEA_SINK, TAU, WATER_CELL, WATER_SLOTS } from './tuning.ts';

export interface SeaScan {
  scan(viewer: THREE.Vector3, waterRange: number, consider: Consider): void;
  trim(cap: number): void;
}

export function createSeaScan(world: World, placeIndex: PlaceIndex, regions: Regions): SeaScan {
  const upAxis = new THREE.Vector3();
  const northward = new THREE.Vector3();
  const eastward = new THREE.Vector3();
  const probe = new THREE.Vector3();
  /** Whether a candidate course is all water, cached by candidate key. */
  const wetness = new Map<string, boolean>();
  /** Candidate cells whose centre is land, so no radius is tried there again. */
  const dryCentres = new Set<string>();

  function isWet(centre: THREE.Vector3, radius: number, key: string): boolean {
    const known = wetness.get(key);
    if (known !== undefined) return known;
    const stem = key.slice(0, key.lastIndexOf('.'));
    if (dryCentres.has(stem)) return false;
    if (world.elevationAt(centre) > 0) {
      dryCentres.add(stem);
      wetness.set(key, false);
      return false;
    }
    upAxis.copy(centre);
    tangentsAt(upAxis, northward, eastward);
    let wet = world.elevationAt(centre) <= 0;
    for (let i = 0; wet && i < 6; i++) {
      const angle = (i / 6) * TAU;
      probe
        .copy(centre)
        .addScaledVector(eastward, (Math.cos(angle) * radius) / PLANET_RADIUS)
        .addScaledVector(northward, (Math.sin(angle) * radius) / PLANET_RADIUS)
        .normalize();
      wet = world.elevationAt(probe) <= 0;
    }
    wetness.set(key, wet);
    return wet;
  }

  /** A boat going round a circle on the sea: a loop has no instant where the heading reverses. */
  function circleFrame(
    centre: THREE.Vector3, radius: number, rate: number, phase: number, clock: number,
    height: number, out: Frame,
  ): void {
    upAxis.copy(centre);
    tangentsAt(upAxis, northward, eastward);
    const angle = phase + clock * rate;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    out.dir
      .copy(upAxis)
      .addScaledVector(eastward, (c * radius) / PLANET_RADIUS)
      .addScaledVector(northward, (s * radius) / PLANET_RADIUS)
      .normalize();
    out.forward
      .copy(eastward).multiplyScalar(-s)
      .addScaledVector(northward, c)
      .projectOnPlane(out.dir)
      .normalize();
    out.height = height;
    out.roll = 0;
    out.pitch = 0;
    out.live = true;
  }

  function scan(viewer: THREE.Vector3, waterRange: number, consider: Consider): void {
    if (waterRange <= 0) return;
    forEachCell(viewer, WATER_CELL, waterRange, (row, col) => {
      for (let slot = 0; slot < WATER_SLOTS; slot++) {
        const rng = rngFrom('sail', row, col, slot);
        if (!rng.chance(0.55)) continue;
        const centre = cellPoint(row, col, WATER_CELL, rng.range(0.1, 0.9), rng.range(0.1, 0.9));
        const key = `s${row}.${col}.${slot}`;
        // Near a coast a circle stops fitting, so the course tightens before it is refused.
        const wide = rng.range(150, 340);
        const radius = [wide, wide * 0.55, wide * 0.3].find(
          (candidate, index) => isWet(centre, candidate, `${key}.${index}`),
        );
        if (radius === undefined) continue;
        const index = placeIndex.nearestPlace(centre, `${row}.${col}`);
        const style = regions.trafficAt(index);
        if (style.water.length === 0) continue;
        const pooled = `v|${rng.weighted(style.water)}|${regions.regionAt(index).id}|${rng.int(VARIANTS)}`;
        const rate = ((rng.chance(0.5) ? 1 : -1) * CRAFT_SPEED) / radius;
        const phase = rng.unit() * TAU;
        const swellPhase = rng.unit() * TAU;
        consider({
          family: 'water',
          key,
          pool: pooled,
          speed: CRAFT_SPEED,
          route: (clock, out) => {
            circleFrame(centre, radius, rate, phase, clock, PLANET_RADIUS - SEA_SINK, out);
            // A small swell and a lean into the turn.
            out.height += Math.sin(clock * 0.9 + swellPhase) * 0.35;
            out.roll = Math.sin(clock * 0.62 + swellPhase) * 0.05 + (rate > 0 ? 0.05 : -0.05);
          },
        }, viewer, waterRange);
      }
    });
  }

  return {
    scan,
    trim(cap) {
      if (wetness.size > cap) { wetness.clear(); dryCentres.clear(); }
    },
  };
}
