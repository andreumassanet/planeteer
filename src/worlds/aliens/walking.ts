/** How walkers move: choosing a destination, giving way, easing apart, stepping and picking a clip. */

import * as THREE from 'three';
import { rngFrom } from '../../scenery/random.ts';
import { AVATAR_HEIGHT } from '../../stature.ts';
import type { ClipRole } from '../../space-kit.ts';
import { lanePoint, turnTo } from './plan.ts';
import { play } from './rigs.ts';
import type { CrowdState } from './state.ts';
import type { Walker } from './types.ts';

/** Past this from the eye a walker still walks but holds its last frame; past the second it is not drawn. */
export const ANIMATE_REACH = 160;
export const SHOW_REACH = 420;
/** How near the traveller a walker stops rather than walk into them. */
const GIVE_WAY = 2.8;
/**
 * How fast each kind covers ground at the clip's own pace, pack units a
 * second: measured off the walk clip's foot, which travels 1.09 units back
 * over a half of a one-second cycle (the humanoids, crew and walkers alike);
 * a blob's hop is about 1.6 a second; a flyer's hover carries it nowhere.
 */
const NATURAL_PACE = { crew: 2.18, walker: 2.18, blob: 1.6, flyer: 0 } as const;

const local = new THREE.Vector3();
const inverse = new THREE.Quaternion();

/** What a walker does next, once it has stood its time. */
export function decide(s: CrowdState, w: Walker): void {
  const { plans } = s;
  if (w.stretch !== null) {
    // To the far end of its stretch, or now and then a point along it,
    // and a pause there: Earth's stroll (`folk.ts`).
    const rng = rngFrom('worlds', 'stroll', w.key, w.decisions++);
    const s = w.stretch;
    const nearA = Math.hypot(w.x - s.ax, w.z - s.az) < Math.hypot(w.x - s.bx, w.z - s.bz);
    const t = rng.chance(0.7) ? (nearA ? 1 : 0) : rng.range(0.2, 0.8);
    w.path = [{ x: s.ax + (s.bx - s.ax) * t, z: s.az + (s.bz - s.az) * t }];
    w.rest = rng.range(2, 9);
    return;
  }
  const plan = plans.get(w.site.id);
  if (plan === undefined || plan.lanes.length === 0 || w.visitor) return;
  const rng = rngFrom('worlds', 'walk', w.key, w.decisions++);
  const lane = plan.lanes[w.lane]!;
  const offset = (): number => rng.range(-plan.half + 1.2, plan.half - 1.2);
  if (w.pocket >= 0) {
    // Back out of a pocket the way it came.
    const p = plan.pockets[w.pocket]!;
    w.path = [lanePoint(plan.lanes[p.lane]!, p.along, offset())];
    w.lane = p.lane;
    w.pocket = -1;
    w.rest = rng.range(0.3, 1.5);
    return;
  }
  const roll = rng.unit();
  const here = plan.pockets.map((p, k) => (p.lane === w.lane ? k : -1)).filter((k) => k >= 0);
  const others = plan.lanes.map((L, k) => (k !== w.lane && L.ring ? k : -1)).filter((k) => k >= 0);
  if (roll < 0.3 && here.length > 0) {
    const k = here[rng.int(here.length)]!;
    const p = plan.pockets[k]!;
    w.path = [lanePoint(lane, p.along, offset()), { x: p.x, z: p.z }];
    w.pocket = k;
    w.rest = rng.range(4, 11);
  } else if (roll < 0.55 && plan.ring !== null && lane.ring && others.length > 0) {
    // Round the square to another avenue, the short way.
    const next = others[rng.int(others.length)]!;
    const target = plan.lanes[next]!;
    const path = [lanePoint(lane, lane.from, 0)];
    const sweep = turnTo(lane.angle, target.angle);
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / 0.3));
    for (let k = 0; k <= steps; k++) {
      const a = lane.angle + (sweep * k) / steps;
      path.push({ x: Math.sin(a) * plan.ring, z: Math.cos(a) * plan.ring });
    }
    path.push(lanePoint(target, target.from, 0), lanePoint(target, rng.range(target.from, target.to), offset()));
    w.path = path;
    w.lane = next;
    w.rest = rng.range(1, 5);
  } else {
    w.path = [lanePoint(lane, rng.range(lane.from, lane.to), offset())];
    w.rest = rng.range(1.5, 6);
  }
}

/** How much room a body keeps round it, units: a share of its height, never under a person's shoulders. */
export const roomOf = (w: Walker): number => Math.max(AVATAR_HEIGHT * 0.22, w.room * 0.85);

/**
 * Whether another walker of the same town stands in the way along
 * (`dx`, `dz`): nearer than both their rooms and a step, and in front.
 * The one further along gives way to nobody, so two never wait for each
 * other for ever: of a pair facing, the lower index goes first.
 */
export function someoneAhead(s: CrowdState, w: Walker, dx: number, dz: number): boolean {
  const { walkers } = s;
  const length = Math.hypot(dx, dz) || 1;
  for (const other of walkers) {
    if (other === w || other.site !== w.site) continue;
    const ox = other.x - w.x;
    const oz = other.z - w.z;
    const gap = Math.hypot(ox, oz);
    if (gap > roomOf(w) + roomOf(other) + 0.9) continue;
    const ahead = (ox * dx + oz * dz) / length;
    if (ahead <= 0.05) continue;
    // Face to face: one of the two steps aside rather than both stopping.
    const facing = other.path.length > 0 && (other.path[0]!.x - other.x) * -ox + (other.path[0]!.z - other.z) * -oz > 0;
    if (facing && walkers.indexOf(w) < walkers.indexOf(other)) continue;
    return true;
  }
  return false;
}

/** Two bodies that ended up inside each other are eased apart, a little a frame. */
export function separate(s: CrowdState, dt: number): void {
  const { walkers } = s;
  for (let i = 0; i < walkers.length; i++) {
    const a = walkers[i]!;
    for (let j = i + 1; j < walkers.length; j++) {
      const b = walkers[j]!;
      if (a.site !== b.site) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const gap = Math.hypot(dx, dz);
      const room = roomOf(a) + roomOf(b);
      if (gap >= room) continue;
      const push = Math.min(room - gap, dt * 2) / 2;
      const ux = gap > 1e-4 ? dx / gap : 1;
      const uz = gap > 1e-4 ? dz / gap : 0;
      a.x -= ux * push;
      a.z -= uz * push;
      b.x += ux * push;
      b.z += uz * push;
    }
  }
}

/** Moves a walker along its path, or keeps it still, in the town's frame. */
export function step(s: CrowdState, w: Walker, dt: number, player: THREE.Vector3 | null): number {
  let wanted = w.yaw;
  let travelled = 0;
  if (w.facing !== null) {
    // Spoken to: stand, and turn to face the visitor.
    local.copy(w.facing).sub(w.site.origin).applyQuaternion(inverse.copy(w.site.quaternion).invert());
    wanted = Math.atan2(local.x - w.x, local.z - w.z);
    w.wait = Math.max(w.wait, 1.5);
  } else if (w.path.length > 0) {
    const target = w.path[0]!;
    const dx = target.x - w.x;
    const dz = target.z - w.z;
    const distance = Math.hypot(dx, dz);
    wanted = Math.atan2(dx, dz);
    // Give way: the traveller ahead and near, or another of the town's
    // people, and it waits — nobody walks into anybody.
    const blocked =
      (player !== null &&
        Math.hypot(player.x - w.x, player.z - w.z) < GIVE_WAY + w.height * 0.15 &&
        (player.x - w.x) * dx + (player.z - w.z) * dz > 0) ||
      someoneAhead(s, w, dx, dz);
    if (!blocked && w.holdUntil <= w.clock) {
      // It walks once it is roughly facing the way: a body turns before it steps off.
      const facing = Math.cos(turnTo(w.yaw, wanted));
      const move = Math.min(distance, w.speed * dt * Math.max(0, facing));
      if (distance > 1e-6) {
        w.x += (dx / distance) * move;
        w.z += (dz / distance) * move;
      }
      travelled = move;
      if (distance - move < 0.05) {
        w.path.shift();
        if (w.path.length === 0) w.wait = w.rest;
      }
    }
  } else {
    w.wait -= dt;
    if (w.wait <= 0) decide(s, w);
  }
  const delta = turnTo(w.yaw, wanted);
  w.yaw += Math.sign(delta) * Math.min(Math.abs(delta), dt * (w.facing !== null ? 3 : 4.5));
  return travelled;
}

/** The clip for this frame: walk to the pace covered, stand, gesture, talk. */
export function animate(w: Walker, dt: number, travelled: number, animated: boolean): void {
  w.clock += dt;
  const kind = w.creature.entry.kind ?? 'walker';
  const talking = w.facing !== null;
  if (talking && !w.talking) {
    // Spoken to: a wave first, then a nod or a shake as the line goes.
    w.talking = true;
    play(w, 'greet', 0.2, true);
    w.nextGesture = w.clock + 2.4;
  } else if (!talking && w.talking) {
    w.talking = false;
  }
  if (w.holdUntil <= w.clock) {
    if (talking) {
      if (w.clock >= w.nextGesture) {
        const rng = rngFrom('worlds', 'nod', w.key, w.decisions++);
        play(w, rng.chance(0.65) ? 'yes' : 'no', 0.2, true);
        w.nextGesture = w.clock + rng.range(2.5, 4.5);
      } else play(w, 'idle');
    } else if (travelled > 1e-4) {
      // A flyer swims through the air on its fast clip, slowed to a drift.
      play(w, kind === 'flyer' ? 'fly' : 'walk', 0.2);
      if (kind === 'flyer' && w.action !== null) w.action.setEffectiveTimeScale(0.75);
      const pace = NATURAL_PACE[kind] * w.scale;
      if (w.action !== null && pace > 0) w.action.setEffectiveTimeScale(Math.min(1.8, Math.max(0.5, travelled / dt / pace)));
    } else {
      play(w, 'idle', 0.3);
      if (w.clock >= w.nextGesture) {
        const rng = rngFrom('worlds', 'gesture', w.key, w.decisions++);
        const pick: ClipRole = kind === 'blob' ? rng.pick(['dance', 'dance', 'jump', 'yes']) : kind === 'flyer' ? rng.pick(['yes', 'no', 'fly']) : rng.pick(['greet', 'yes', 'jump', 'no']);
        if (rng.chance(w.visitor ? 0.5 : 0.7)) play(w, pick, 0.25, true);
        w.nextGesture = w.clock + rng.range(5, 14);
      }
    }
  }
  if (animated) w.rigged.mixer.update(dt);
}
