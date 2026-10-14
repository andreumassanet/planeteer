/**
 * Who stands where when a town is peopled: strollers, pairs and door-standers
 * in a grid town; walkers dealt out over the avenues and pockets in a disc
 * town; the visiting crew round a spaceport's ship. Who walks, in which body
 * and coat, is a function of the town and the walker's number.
 */

import { rngFrom, seedOf } from '../../scenery/random.ts';
import { WALK_SPEED } from '../../avatar.ts';
import { AVATAR_HEIGHT } from '../../stature.ts';
import { worldKit } from '../kit.ts';
import type { Site } from '../settlements.ts';
import type { Walk } from '../town-grid.ts';
import { TAU, lanePoint, planOf, segmentClear } from './plan.ts';
import { release, standUp } from './rigs.ts';
import { CROWD_CAP, WIDEST, coatOf, crowdOf, statureOf } from './rules.ts';
import type { CrowdState } from './state.ts';
import type { KeepClear, Walker } from './types.ts';

/** Crew standing at a pad. */
const VISITORS = 3;

/**
 * A grid town is peopled as Earth's towns are (`folk.ts`): most stroll
 * a stretch of pavement end to end and back, one stroller a stretch so
 * nobody walks in a queue; some stand in pairs turned to each other,
 * talking; the rest stand on the pavement by a door. Nobody starts inside a
 * keep-clear disc or a wall, nor within a body of anybody else.
 */
export function peopleGrid(s: CrowdState, site: Site, keep: readonly KeepClear[], choices: readonly { item: string; weight: number }[], base: number): void {
  const { spec, civ, walkers } = s;
  const kit = worldKit()!;
  const town = site.town!;
  const rng = rngFrom('worlds', spec.id, 'grid-people', site.id);
  const free = (x: number, z: number, room: number): boolean =>
    !keep.some((disc) => Math.hypot(disc.x - x, disc.z - z) < disc.r) &&
    !site.footprints.some((f) => Math.hypot(f.x - x, f.z - z) < f.radius + room) &&
    !walkers.some((other) => other.site === site && Math.hypot(other.x - x, other.z - z) < Math.max(room * 2 + 1.2, WIDEST));
  // The stretches clear of every wall along their length, the longest first.
  const stretches = town.walks
    .filter((one) => Math.hypot(one.bx - one.ax, one.bz - one.az) > 5 && segmentClear(site, one.ax, one.az, one.bx, one.bz, 0.5))
    .map((one) => ({ one, order: rng.unit() }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.one);
  const count = Math.min(crowdOf(civ!, site.population) + 4, CROWD_CAP + 6, Math.max(2, Math.round(stretches.length * 0.9)));
  let next = 0;
  let made = 0;
  const make = (n: number, at: { x: number; z: number }, yaw: number, stretch: Walk | null): Walker | null => {
    const key = `${site.id}:${n}`;
    const pick = rngFrom('worlds', spec.id, 'walker', key);
    const creature = kit.creatures.get(pick.weighted(choices))!;
    const height = base * pick.range(0.92, 1.06);
    const blob = creature.entry.kind === 'blob';
    const speed = WALK_SPEED * pick.range(0.42, 0.6) * (blob ? 0.75 : 1) * Math.min(1.4, Math.max(0.7, height / 4.5));
    const w = standUp(s, site, key, creature, coatOf(civ!, key), height, false, at, yaw, speed);
    w.stretch = stretch;
    walkers.push(w);
    return w;
  };
  for (let n = 0; n < count && next < stretches.length; n++) {
    const s = stretches[next++]!;
    const roll = rng.unit();
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const length = Math.hypot(dx, dz);
    const t = rng.range(0.15, 0.85);
    const at = { x: s.ax + dx * t, z: s.az + dz * t };
    if (!free(at.x, at.z, 0.7)) continue;
    const along = Math.atan2(dx, dz);
    if (roll < 0.58) {
      make(made++, at, along + (rng.chance(0.5) ? 0 : Math.PI), s);
    } else if (roll < 0.82 && length > 6) {
      // A pair, a step and a half apart along the pavement, face to face.
      const gap = 0.85 + base * 0.12;
      const a = { x: at.x - (dx / length) * gap, z: at.z - (dz / length) * gap };
      const b = { x: at.x + (dx / length) * gap, z: at.z + (dz / length) * gap };
      if (!free(a.x, a.z, 0.6) || !free(b.x, b.z, 0.6)) continue;
      const one = make(made++, a, along, null);
      const two = make(made++, b, along + Math.PI, null);
      for (const w of [one, two]) if (w !== null) w.wait = Infinity;
    } else {
      // Standing by a door: on the pavement, turned to the street.
      const w = make(made++, at, along + Math.PI / 2 * (rng.chance(0.5) ? 1 : -1), null);
      if (w !== null) w.wait = Infinity;
    }
  }
}

export function people(s: CrowdState, site: Site): boolean {
  const { spec, civ, cast, stats, walkers, plans, keepClear } = s;
  if (civ === null || cast === undefined || site.landmark) return true;
  const kit = worldKit();
  if (kit === null) return false;
  const choices = cast.creatures.filter((one) => kit.creatures.has(one.item));
  if (choices.length === 0) return false;
  const began = performance.now();
  const keep = keepClear(site);
  const base = statureOf(civ.species.morph.height);
  if (site.town !== null) peopleGrid(s, site, keep, choices, base);
  const plan = site.town !== null ? null : planOf(spec, site, keep);
  if (plan !== null) plans.set(site.id, plan);
  if (plan !== null && plan.lanes.length > 0) {
    const count = Math.min(crowdOf(civ, site.population), plan.lanes.length * 3 + plan.pockets.length);
    const placed: { x: number; z: number }[] = [];
    for (let n = 0; n < count; n++) {
      const key = `${site.id}:${n}`;
      const rng = rngFrom('worlds', spec.id, 'walker', key);
      const creature = kit.creatures.get(rng.weighted(choices))!;
      // Dealt round the avenues in turn, so no two start on one while
      // another is empty; a third or so start in a pocket.
      let lane = n % plan.lanes.length;
      let pocket = -1;
      let at = { x: 0, z: 0 };
      let found = false;
      for (let attempt = 0; attempt < 24 && !found; attempt++) {
        const free = plan.pockets.map((_, k) => k).filter((k) => !placed.some((q) => Math.hypot(q.x - plan.pockets[k]!.x, q.z - plan.pockets[k]!.z) < 3));
        if (free.length > 0 && rng.chance(0.35)) {
          pocket = free[rng.int(free.length)]!;
          lane = plan.pockets[pocket]!.lane;
          at = { x: plan.pockets[pocket]!.x, z: plan.pockets[pocket]!.z };
        } else {
          pocket = -1;
          const L = plan.lanes[lane]!;
          at = lanePoint(L, rng.range(L.from, L.to), rng.range(-plan.half + 1.2, plan.half - 1.2));
        }
        found = !placed.some((q) => Math.hypot(q.x - at.x, q.z - at.z) < 3.5) && !keep.some((disc) => Math.hypot(disc.x - at.x, disc.z - at.z) < disc.r);
        if (!found) lane = rng.int(plan.lanes.length);
      }
      if (!found) continue;
      placed.push(at);
      const height = base * rng.range(0.9, 1.08);
      const blob = creature.entry.kind === 'blob';
      const speed = WALK_SPEED * rng.range(0.4, 0.62) * (blob ? 0.75 : 1) * Math.min(1.4, Math.max(0.7, height / 4.5));
      const w = standUp(s, site, key, creature, coatOf(civ, key), height, false, at, rng.range(0, TAU), speed);
      w.lane = lane;
      w.pocket = pocket;
      walkers.push(w);
    }
  }
  // The crew at a spaceport, round the ship, facing it or the town.
  const port = site.port;
  const crew = (cast.visitors ?? []).filter((id) => kit.creatures.has(id));
  if (port !== null && crew.length > 0) {
    for (let n = 0; n < VISITORS; n++) {
      const key = `${site.id}:crew:${n}`;
      const rng = rngFrom('worlds', spec.id, 'crew', key);
      // Round the pad's rim, and further round it where the ship or a
      // beacon stands in the way.
      let at: { x: number; z: number } | null = null;
      let a = 0;
      for (let step = 0; step < 24 && at === null; step++) {
        a = port.yaw + Math.PI * 0.5 + (n - 1) * 0.55 + step * 0.52 + rng.jitter() * 0.1;
        // On the rim, or just off it on a pad the ship fills.
        const d = step < 12 ? Math.max(2.5, port.r - 2.4) : port.r + 1.2;
        const spot = { x: port.x + Math.sin(a) * d, z: port.z + Math.cos(a) * d };
        if (!site.footprints.some((f) => Math.hypot(f.x - spot.x, f.z - spot.z) < f.radius + 0.8)) at = spot;
      }
      if (at === null) continue;
      const creature = kit.creatures.get(crew[(Math.abs(seedOf(key)) + n) % crew.length]!)!;
      // Turned to each other and to the town by turns.
      const yaw = n === 1 ? Math.atan2(-at.x, -at.z) : a + Math.PI + rng.jitter() * 0.6;
      const w = standUp(s, site, key, creature, null, AVATAR_HEIGHT * rng.range(0.96, 1.04), true, at, yaw, 0);
      w.wait = Infinity;
      walkers.push(w);
    }
  }
  stats.buildMs = performance.now() - began;
  return true;
}

export function unpeople(s: CrowdState, site: Site): void {
  const { walkers, plans, peopled } = s;
  for (let k = walkers.length - 1; k >= 0; k--) {
    const w = walkers[k]!;
    if (w.site !== site) continue;
    release(s, w);
    walkers.splice(k, 1);
  }
  peopled.delete(site.id);
  plans.delete(site.id);
}
