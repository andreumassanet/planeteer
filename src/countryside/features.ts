/** The big thing a cell holds: one builder per kind, each drawing from its own forked stream in a fixed order. */
import { lonOf } from '../sphere.ts';
import type { Rng } from '../scenery/random.ts';
import { WATERLINE } from '../vehicles.ts';
import { dirAt, inCell } from './frame.ts';
import { free, turn } from './ground.ts';
import type { Site } from './ground.ts';
import { roadGap } from './nearby.ts';
import { addField, coastPoint, put, tryPut, windOf } from './placing.ts';
import type { Context } from './placing.ts';
import { farm } from './farm.ts';
import { BUILDING_GRADE, HIGH_ASIA, PROP_GRADE, STEPPE_NOMADS, cropsFor, shrineFor } from './tables.ts';
import type { CountrysideOptions, CountryPlan, FeatureKind } from './types.ts';

type Builder = (s: Site, plan: CountryPlan, rng: Rng, c: Context) => boolean;

const windmill: Builder = (s, plan, rng, c) => {
  const count = c.iso === 'NLD' ? rng.between(1, 3) : 1;
  const yaw = windOf(c.lat, lonOf(s.frame.up.x, s.frame.up.z)) + rng.range(-0.3, 0.3);
  const along = rng.range(0, Math.PI);
  let stood = 0;
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * 34;
    const p = turn(c.x, c.z, along, offset, 0);
    if (tryPut(s, plan, 'windmill', p.x, p.z, yaw, rng, BUILDING_GRADE, rng.range(0.9, 1.05))) stood++;
  }
  if (stood > 0 && rng.chance(0.5)) {
    const crop = rng.weighted(cropsFor(c.region, c.biome, c.lat, c.iso));
    const p = turn(c.x, c.z, along, 0, 30);
    addField(s, plan, crop, p.x, p.z, along, rng.range(12, 18), rng.range(10, 16));
  }
  return stood > 0;
};

const turbines: Builder = (s, plan, rng, c) => {
  const count = rng.between(2, 4);
  const yaw = windOf(c.lat, lonOf(s.frame.up.x, s.frame.up.z));
  // In a line across the wind, which is how a wind farm stands.
  let stood = 0;
  for (let i = 0; i < count; i++) {
    const p = turn(c.x, c.z, yaw + Math.PI / 2, 0, (i - (count - 1) / 2) * 44);
    if (tryPut(s, plan, 'turbine', p.x, p.z, yaw, rng, BUILDING_GRADE)) stood++;
  }
  return stood > 0;
};

const lighthouse: Builder = (s, plan, rng, c) => {
  const point = coastPoint(s, c, true);
  if (point === null) return false;
  const back = 5;
  const x = point.x - Math.sin(point.toWater) * back;
  const z = point.z - Math.cos(point.toWater) * back;
  // The keeper's house is behind the tower, so the tower faces the water.
  if (!tryPut(s, plan, 'lighthouse', x, z, point.toWater, rng, BUILDING_GRADE)) return false;
  if (rng.chance(0.4)) {
    const p = turn(x, z, point.toWater, rng.sign() * 9, -4);
    tryPut(s, plan, 'bench', p.x, p.z, point.toWater, rng, PROP_GRADE);
  }
  return true;
};

const fishing: Builder = (s, plan, rng, c) => {
  const { frame, world } = s;
  const point = coastPoint(s, c, false);
  if (point === null) return false;
  const facing = point.toWater;
  // The hut a little back from the water, the jetty out from the strand.
  const hut = turn(point.x, point.z, facing, rng.range(-6, 6), -9);
  if (!tryPut(s, plan, 'fishing-hut', hut.x, hut.z, facing, rng, BUILDING_GRADE)) return false;
  // The jetty runs from the last land out: find where the land stops.
  let land = 0;
  for (let step = 1; step <= 12; step++) {
    const p = turn(point.x, point.z, facing, 0, step * 2);
    if (world.elevationAt(dirAt(frame, p.x, p.z, frame.scratch)) <= 0) break;
    land = step * 2;
  }
  const start = turn(point.x, point.z, facing, 0, land - 1);
  const end = turn(point.x, point.z, facing, 0, land + 14);
  const startX = start.x;
  const startZ = start.z;
  if (world.elevationAt(dirAt(frame, end.x, end.z, frame.scratch)) > 0) return true;
  if (!inCell(frame, end.x, end.z, 2) || !free(s, startX, startZ, 1.5, PROP_GRADE, true)) return true;
  const ground = world.elevationAt(dirAt(frame, startX, startZ, frame.scratch));
  if (ground <= 0) return true;
  put(s, plan, 'jetty', startX, startZ, facing, 1.6, rng, 1, false, ground);
  s.claimed.push({ x: end.x, z: end.z, radius: 3, yaw: 0, halfX: 0, halfZ: 0 });
  const boat = turn(point.x, point.z, facing, rng.sign() * 2.8, land + 9);
  if (world.elevationAt(dirAt(frame, boat.x, boat.z, frame.scratch)) <= 0) {
    put(s, plan, 'rowboat', boat.x, boat.z, facing + rng.range(-0.3, 0.3), 1.8, rng, 1, false, WATERLINE);
  }
  return true;
};

const shrine: Builder = (s, plan, rng, c) => {
  const kept = shrineFor(c.iso, c.region, c.relief, rng.fork('shrine'));
  if (kept === null) return false;
  // Beside a road where one passes near, facing it; else where it fell.
  const spots: { x: number; z: number; yaw: number }[] = [];
  const road = roadGap(s.nearby, c.x, c.z);
  const off = Math.hypot(c.x - road.x, c.z - road.z);
  if (road.gap < 150 && off > 1e-3) {
    // Across the carriageway's edge from the anchor's side, facing it.
    const nx = (c.x - road.x) / off;
    const nz = (c.z - road.z) / off;
    const edge = off - road.gap;
    spots.push({ x: road.x + nx * (edge + 7), z: road.z + nz * (edge + 7), yaw: Math.atan2(-nx, -nz) });
  }
  spots.push({ x: c.x, z: c.z, yaw: rng.range(0, Math.PI * 2) });
  const first = kept.parts[0]!;
  const spot = spots.find((candidate) => tryPut(s, plan, first, candidate.x, candidate.z, candidate.yaw, rng, BUILDING_GRADE));
  if (spot === undefined) return false;
  for (const part of kept.parts.slice(1)) {
    const p = turn(spot.x, spot.z, spot.yaw, rng.sign() * 7, -3);
    tryPut(s, plan, part, p.x, p.z, spot.yaw + Math.PI / 2, rng, PROP_GRADE);
  }
  return true;
};

const stones: Builder = (s, plan, rng, c) => {
  const count = rng.between(7, 11);
  const radius = rng.range(6.5, 9.5);
  if (!free(s, c.x, c.z, radius + 1.5, BUILDING_GRADE)) return false;
  s.claimed.push({ x: c.x, z: c.z, radius: radius + 1.5, yaw: 0, halfX: 0, halfZ: 0 });
  for (let i = 0; i < count; i++) {
    if (rng.chance(0.12)) continue; // a gap where one fell
    const angle = (i / count) * Math.PI * 2 + rng.range(-0.08, 0.08);
    const x = c.x + Math.sin(angle) * radius;
    const z = c.z + Math.cos(angle) * radius;
    put(s, plan, 'standing-stone', x, z, angle + Math.PI / 2 + rng.range(-0.3, 0.3), 1, rng, rng.range(0.85, 1.2));
  }
  return true;
};

const ruin: Builder = (s, plan, rng, c) => {
  const classical = c.region === 'mediterranean' || c.region === 'maghreb' || c.region === 'middle-east';
  const yaw = rng.range(0, Math.PI * 2);
  if (!free(s, c.x, c.z, 16, BUILDING_GRADE)) return false;
  let stood = 0;
  if (classical) {
    const count = rng.between(4, 6);
    for (let i = 0; i < count; i++) {
      if (i > 0 && rng.chance(0.25)) continue;
      const p = turn(c.x, c.z, yaw, (i - (count - 1) / 2) * 4.6, 0);
      if (tryPut(s, plan, 'ruin-column', p.x, p.z, yaw, rng, BUILDING_GRADE)) stood++;
    }
    const back = turn(c.x, c.z, yaw, rng.range(-4, 4), -8);
    if (tryPut(s, plan, 'ruin-wall', back.x, back.z, yaw, rng, BUILDING_GRADE)) stood++;
  } else {
    for (let i = 0; i < 3; i++) {
      const p = turn(c.x, c.z, yaw + (i * Math.PI) / 2, 0, -5);
      if (tryPut(s, plan, 'ruin-wall', p.x, p.z, yaw + (i * Math.PI) / 2, rng, BUILDING_GRADE)) stood++;
    }
  }
  return stood > 0;
};

const camp: Builder = (s, plan, rng, c) => {
  const nomads = STEPPE_NOMADS.has(c.iso) && c.biome !== 'desert';
  const desert = c.biome === 'desert';
  const shelter = nomads ? 'ger' : desert ? 'nomad-tent' : 'tent';
  const count = nomads ? rng.between(1, 3) : desert ? rng.between(1, 2) : rng.between(1, 3);
  if (!tryPut(s, plan, 'campfire', c.x, c.z, 0, rng, PROP_GRADE)) return false;
  let stood = 0;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const reach = rng.range(6, 9) * (nomads ? 1.4 : 1);
    const x = c.x + Math.sin(angle) * reach;
    const z = c.z + Math.cos(angle) * reach;
    // Facing the fire.
    if (tryPut(s, plan, shelter, x, z, angle + Math.PI, rng, PROP_GRADE)) stood++;
  }
  return stood > 0;
};

const oasis: Builder = (s, plan, rng, c) => {
  const radius = rng.range(9, 14);
  if (!addField(s, plan, 'pond', c.x, c.z, 0, radius, radius * rng.range(0.7, 1), true)) return false;
  const palms = rng.between(6, 10);
  for (let i = 0; i < palms; i++) {
    const angle = (i / palms) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const reach = radius + rng.range(3, 8);
    tryPut(s, plan, 'palm', c.x + Math.sin(angle) * reach, c.z + Math.cos(angle) * reach, rng.range(0, Math.PI * 2), rng, PROP_GRADE, rng.range(0.85, 1.15));
  }
  const tents = rng.between(0, 2);
  for (let i = 0; i < tents; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const reach = radius + rng.range(16, 22);
    tryPut(s, plan, 'nomad-tent', c.x + Math.sin(angle) * reach, c.z + Math.cos(angle) * reach, angle + Math.PI, rng, PROP_GRADE);
  }
  return true;
};

const cairn: Builder = (s, plan, rng, c) => {
  if (!tryPut(s, plan, 'cairn', c.x, c.z, rng.range(0, Math.PI * 2), rng, PROP_GRADE, rng.range(0.9, 1.4))) return false;
  if (HIGH_ASIA.has(c.iso) && rng.chance(0.6)) {
    tryPut(s, plan, 'prayer-flags', c.x + rng.range(-3, 3), c.z + 7, rng.range(0, Math.PI), rng, PROP_GRADE);
  }
  return true;
};

const BUILDERS: Record<Exclude<FeatureKind, 'farm'>, Builder> = {
  windmill,
  turbines,
  lighthouse,
  fishing,
  shrine,
  stones,
  ruin,
  camp,
  oasis,
  cairn,
};

/** Builds a feature of `kind` into the plan at `c`; false if it found nowhere to stand. */
export function buildFeature(s: Site, options: CountrysideOptions, kind: FeatureKind, plan: CountryPlan, rng: Rng, c: Context): boolean {
  if (kind === 'farm') return farm(s, options, plan, rng, c);
  return BUILDERS[kind](s, plan, rng, c);
}
