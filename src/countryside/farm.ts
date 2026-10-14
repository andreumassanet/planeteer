/** A farmstead: the house, a barn and silo, a fenced yard, a tractor and bales, and fields round it. */
import * as THREE from 'three';
import { lonOf } from '../sphere.ts';
import type { Rng } from '../scenery/random.ts';
import { COUNTRY_PARTS, COUNTRY_VARIANTS } from '../countryside-kit.ts';
import { dirAt } from './frame.ts';
import { free, turn } from './ground.ts';
import type { Site } from './ground.ts';
import { NEAR_ROAD, roadGap } from './nearby.ts';
import { addField, fence, put, tryPut, windOf } from './placing.ts';
import type { Context } from './placing.ts';
import { BARNLESS, BUILDING_GRADE, PROP_GRADE, SILOS, WALLED_ISO, WINDPUMPS, WINDPUMP_ISO, cropsFor } from './tables.ts';
import type { CountrysideOptions, CountryPlan } from './types.ts';

/** The yard's fence, with a gate in the front. */
function yardFence(s: Site, plan: CountryPlan, c: Context, yaw: number, hx: number, hz: number, kind: 'fence' | 'wall'): void {
  const corner = (sx: number, sz: number): [number, number] => {
    const p = turn(c.x, c.z, yaw, sx * hx, sz * hz);
    return [p.x, p.z];
  };
  const [ax, az] = corner(-1, -1);
  const [bx, bz] = corner(1, -1);
  const [cx, cz] = corner(1, 1);
  const [dx, dz] = corner(-1, 1);
  const gate = turn(c.x, c.z, yaw, -3.5, hz);
  const gate2 = turn(c.x, c.z, yaw, 3.5, hz);
  fence(s, plan, kind, ax, az, bx, bz);
  fence(s, plan, kind, bx, bz, cx, cz);
  fence(s, plan, kind, cx, cz, gate2.x, gate2.z);
  fence(s, plan, kind, gate.x, gate.z, dx, dz);
  fence(s, plan, kind, dx, dz, ax, az);
}

/** Bales left in a field of straw. */
function hayBales(s: Site, plan: CountryPlan, rng: Rng, px: number, pz: number, fieldYaw: number, halfX: number, halfZ: number): void {
  const bales = rng.between(2, 5);
  for (let i = 0; i < bales; i++) {
    const b = turn(px, pz, fieldYaw, rng.range(-0.7, 0.7) * halfX, rng.range(-0.7, 0.7) * halfZ);
    plan.pieces.push({
      part: 'hay-bale',
      scenic: false,
      variant: rng.int(COUNTRY_VARIANTS),
      at: dirAt(s.frame, b.x, b.z, new THREE.Vector3()),
      yaw: rng.range(0, Math.PI * 2),
      scale: 1,
      footprint: COUNTRY_PARTS['hay-bale']!.footprint,
    });
  }
}

/** The fields round the yard: two to five, in the eight slots around it. */
function surroundingFields(s: Site, plan: CountryPlan, rng: Rng, c: Context, yaw: number, hx: number, hz: number, walled: boolean): void {
  const crops = cropsFor(c.region, c.biome, c.lat, c.iso);
  const gap = 5;
  const slots: [number, number][] = [
    [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1],
  ];
  let fields = 0;
  const want = rng.between(2, 5);
  for (const [sx, sz] of slots) {
    if (fields >= want) break;
    const fx = rng.range(12, 22);
    const fz = rng.range(11, 20);
    const across = rng.chance(0.3);
    const halfX = across ? fz : fx;
    const halfZ = across ? fx : fz;
    const ox = sx * (hx + gap + fx);
    const oz = sz * (hz + gap + fz);
    const p = turn(c.x, c.z, yaw, ox, oz);
    const crop = rng.weighted(crops);
    const fieldYaw = yaw + (across ? Math.PI / 2 : 0);
    if (!addField(s, plan, crop, p.x, p.z, fieldYaw, halfX, halfZ)) continue;
    fields++;
    if ((crop === 'wheat' || crop === 'barley' || crop === 'millet') && rng.chance(0.55)) {
      hayBales(s, plan, rng, p.x, p.z, fieldYaw, halfX, halfZ);
    }
    // A dry-stone wall down the far side of a field where walls are the way.
    if (walled && rng.chance(0.5)) {
      const a = turn(p.x, p.z, fieldYaw, -halfX - 1.5, -halfZ);
      const b = turn(p.x, p.z, fieldYaw, -halfX - 1.5, halfZ);
      fence(s, plan, 'wall', a.x, a.z, b.x, b.z);
    }
  }
}

/**
 * A farmstead: the house (the region's own dwelling), a barn and a silo where
 * the region builds them, a fenced yard, a tractor and hay bales, and two to
 * five fields round it, all square to the road when one passes.
 */
export function farm(s: Site, options: CountrysideOptions, plan: CountryPlan, rng: Rng, c: Context): boolean {
  const road = roadGap(s.nearby, c.x, c.z);
  const yaw = road.gap < NEAR_ROAD * 1.5 ? Math.atan2(road.dx, road.dz) + (rng.chance(0.5) ? Math.PI : 0) : rng.range(0, Math.PI * 2);
  const walled = WALLED_ISO.has(c.iso) || c.region === 'mediterranean';
  const barnless = BARNLESS.has(c.region);
  const houses = options.dwellings?.(c.style) ?? [{ item: 'gabled-house', weight: 1, footprint: 7.4 }];
  const house = rng.weighted(houses.map((entry) => ({ item: entry, weight: entry.weight })));
  const hx = barnless ? 12 : 20;
  const hz = barnless ? 11 : 15;

  // The yard first: if the house cannot stand, there is no farm.
  const houseAt = turn(c.x, c.z, yaw, barnless ? 0 : -9, 3);
  if (!free(s, houseAt.x, houseAt.z, house.footprint, BUILDING_GRADE)) return false;
  if (!free(s, c.x, c.z, Math.hypot(hx, hz) * 0.6, BUILDING_GRADE)) return false;
  put(s, plan, house.item, houseAt.x, houseAt.z, yaw, house.footprint, rng, 1, true);
  if (!barnless) {
    const barnAt = turn(c.x, c.z, yaw, 9.5, -2);
    tryPut(s, plan, 'barn', barnAt.x, barnAt.z, yaw - Math.PI / 2, rng, BUILDING_GRADE);
    if (SILOS.has(c.region) && rng.chance(0.7)) {
      const siloAt = turn(c.x, c.z, yaw, 14.5, 10.5);
      tryPut(s, plan, 'silo', siloAt.x, siloAt.z, 0, rng, BUILDING_GRADE);
    }
  }
  if (rng.chance(0.3)) {
    const t = turn(c.x, c.z, yaw, rng.range(-4, 4), -10);
    tryPut(s, plan, 'tractor', t.x, t.z, yaw + rng.range(-1, 1), rng, PROP_GRADE);
  }
  if ((WINDPUMPS.has(c.region) || WINDPUMP_ISO.has(c.iso)) && (c.biome === 'grassland' || c.biome === 'steppe' || c.biome === 'savanna') && rng.chance(0.55)) {
    const w = turn(c.x, c.z, yaw, -hx - 4, -hz + 2);
    tryPut(s, plan, 'windpump', w.x, w.z, windOf(c.lat, lonOf(s.frame.up.x, s.frame.up.z)), rng, BUILDING_GRADE);
  }
  if (!barnless || rng.chance(0.5)) yardFence(s, plan, c, yaw, hx, hz, walled ? 'wall' : 'fence');
  s.claimed.push({ x: c.x, z: c.z, radius: Math.hypot(hx, hz), yaw, halfX: hx, halfZ: hz });

  surroundingFields(s, plan, rng, c, yaw, hx, hz, walled);
  return true;
}
