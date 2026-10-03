/**
 * The traffic on another world's roads, as Earth's roads have theirs
 * (`life.ts`): a few of the world's own rovers driving the carriageway round
 * the traveller, on the right of it, at their own steady speeds, giving way
 * to the traveller and to each other, their headlights burning after dark.
 *
 * Near and capped, as everything that moves is: at most `MOST` at once,
 * started out of sight `SPAWN_FROM` to `SPAWN_TO` units away on a road the
 * traveller is near, and let go past `DROP_PAST`. A rover that reaches a
 * town's gate drives into the town and is gone, as a car turning off is; one
 * the traveller is watching turns round instead.
 *
 * Each is a craft (`createCraft`), the world's own rover at its own size,
 * driven along `Roads.place` — so the traveller can stop one, get in and
 * take it (`take`), as every vehicle in the world can be taken.
 */

import * as THREE from 'three';
import type { VehicleSpec, WorldSpec } from './contract.ts';
import type { Roads } from './roads.ts';
import { createCraft, disposeCraft } from './craft.ts';
import type { Craft } from './craft.ts';
import type { SceneryContext } from '../scenery/contract.ts';
import { rngFrom } from '../scenery/random.ts';

/** The most rovers driving at once. */
const MOST = 7;
/** Where a new one starts, units from the traveller: out of sight, not out of reach. */
const SPAWN_FROM = 260;
const SPAWN_TO = 700;
/** Past this a rover is let go. */
const DROP_PAST = 1000;
/** How near the traveller a rover may not vanish at a gate: it turns round instead. */
const SEEN_WITHIN = 160;
/** Units a second, slowest and fastest. */
const SPEED: [number, number] = [11, 19];
/** How far ahead a rover looks for something to give way to, units, and how near it stops. */
const LOOK_AHEAD = 22;
const STOP_SHORT = 8;
/** How hard it brakes and how gently it pulls away, units a second squared. */
const BRAKE = 18;
const PULL = 4;

export interface TrafficRover {
  /** The craft it is: what the traveller gets into. */
  craft: Craft;
  object: THREE.Object3D;
  position: THREE.Vector3;
  /** Unit tangent: the way it drives. */
  heading: THREE.Vector3;
  radius: number;
}

export interface Traffic {
  group: THREE.Group;
  /** Advances the rovers; `blockers` are what they give way to (the traveller, the craft standing about). */
  update(dt: number, traveller: THREE.Vector3, blockers: readonly THREE.Vector3[]): void;
  /** The rovers driving, for the headlights. */
  readonly rovers: readonly TrafficRover[];
  /** Takes a rover off the road for the traveller: it is theirs now, a craft like any other, standing where it stopped. */
  take(craft: Craft): void;
  dispose(): void;
}

interface Driving extends TrafficRover {
  road: number;
  s: number;
  /** +1 driving from gate A to B, -1 from B to A. */
  way: 1 | -1;
  speed: number;
  cruise: number;
}

export function createTraffic(spec: WorldSpec, roads: Roads, ctx: SceneryContext, gradientMap: THREE.Texture): Traffic {
  const group = new THREE.Group();
  group.name = 'world-traffic';
  const rovers: Driving[] = [];
  // The world's own rovers, or Earth's engine rover where it names none.
  const kinds = spec.vehicles.filter((one): one is VehicleSpec | 'rover' => one === 'rover' || (typeof one !== 'string' && one.kind === 'rover'));
  const vehicles: readonly (VehicleSpec | 'rover')[] = kinds.length > 0 ? kinds : ['rover'];
  const rng = rngFrom('worlds', spec.id, 'traffic');
  const at = new THREE.Vector3();
  const along = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const ahead = new THREE.Vector3();

  function pose(rover: Driving): void {
    const lateral = roads.halfOf(rover.road) * 0.5 * rover.way;
    roads.place(rover.road, rover.s, lateral, at, along);
    rover.position.copy(at);
    rover.heading.copy(along).multiplyScalar(rover.way);
    up.copy(at).normalize();
    // The model faces +Z with +Y up and +X to its left: x = up x forward.
    basis.makeBasis(ahead.crossVectors(up, rover.heading).normalize(), up, rover.heading);
    rover.object.position.copy(at);
    rover.object.quaternion.setFromRotationMatrix(basis);
  }

  function spawn(traveller: THREE.Vector3): void {
    const near = roads.near(traveller, SPAWN_TO);
    if (near.length === 0) return;
    const pick = near[Math.floor(rng.unit() * near.length)]!;
    const length = roads.lengthOf(pick.road);
    // Out along the road from the traveller's nearest point, one way or the other.
    const off = SPAWN_FROM + rng.unit() * (SPAWN_TO - SPAWN_FROM) * 0.6;
    const s = pick.s + (rng.chance(0.5) ? off : -off);
    if (s < 30 || s > length - 30) return;
    const way: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    // Not on top of another.
    for (const other of rovers) if (other.road === pick.road && Math.abs(other.s - s) < 40) return;
    const vehicle = vehicles[Math.floor(rng.unit() * vehicles.length)]!;
    roads.place(pick.road, s, roads.halfOf(pick.road) * 0.5 * way, at, along);
    if (at.distanceTo(traveller) < SPAWN_FROM * 0.8) return;
    const craft = createCraft(vehicle, ctx, gradientMap, at, along.multiplyScalar(way));
    const object = craft.object;
    object.traverse((one) => {
      one.castShadow = true;
    });
    const cruise = SPEED[0] + rng.unit() * (SPEED[1] - SPEED[0]);
    const rover: Driving = {
      craft,
      object,
      position: craft.position,
      heading: craft.heading,
      radius: craft.radius,
      road: pick.road,
      s,
      way,
      speed: cruise,
      cruise,
    };
    pose(rover);
    group.add(object);
    rovers.push(rover);
  }

  function drop(index: number): void {
    const rover = rovers[index]!;
    group.remove(rover.object);
    rovers.splice(index, 1);
    disposeCraft(rover.craft);
  }

  /** Whether something stands in this rover's lane within `LOOK_AHEAD`: how far, or Infinity. */
  function blockedBy(rover: Driving, things: readonly THREE.Vector3[]): number {
    let nearest = Infinity;
    for (const thing of things) {
      ahead.subVectors(thing, rover.position);
      const forward = ahead.dot(rover.heading);
      if (forward <= 0 || forward > LOOK_AHEAD + rover.radius) continue;
      const across = Math.abs(ahead.dot(right.crossVectors(rover.heading, up.copy(rover.position).normalize())));
      if (across < rover.radius + 1.6) nearest = Math.min(nearest, forward - rover.radius);
    }
    return nearest;
  }

  const others: THREE.Vector3[] = [];
  return {
    group,
    rovers,
    update(dt, traveller, blockers) {
      for (let i = rovers.length - 1; i >= 0; i--) if (rovers[i]!.position.distanceTo(traveller) > DROP_PAST) drop(i);
      if (rovers.length < MOST && rng.unit() < dt * 1.5) spawn(traveller);
      for (let i = rovers.length - 1; i >= 0; i--) {
        const rover = rovers[i]!;
        others.length = 0;
        for (const one of blockers) others.push(one);
        for (const other of rovers) if (other !== rover && other.road === rover.road && other.way === rover.way) others.push(other.position);
        const gap = blockedBy(rover, others);
        const want = gap < STOP_SHORT ? 0 : gap < LOOK_AHEAD ? rover.cruise * ((gap - STOP_SHORT) / (LOOK_AHEAD - STOP_SHORT)) : rover.cruise;
        rover.speed += Math.max(-BRAKE * dt, Math.min(PULL * dt, want - rover.speed));
        rover.s += rover.speed * rover.way * dt;
        const length = roads.lengthOf(rover.road);
        if (rover.s <= 6 || rover.s >= length - 6) {
          // At a gate: into the town and gone, unless the traveller is watching.
          if (rover.position.distanceTo(traveller) > SEEN_WITHIN) {
            drop(i);
            continue;
          }
          rover.way = rover.way === 1 ? -1 : 1;
          rover.s = Math.min(length - 7, Math.max(7, rover.s));
        }
        pose(rover);
      }
    },
    take(craft) {
      const index = rovers.findIndex((one) => one.craft === craft);
      if (index < 0) return;
      const rover = rovers[index]!;
      rovers.splice(index, 1);
      group.remove(rover.object);
      craft.speed = 0;
    },
    dispose() {
      for (let i = rovers.length - 1; i >= 0; i--) drop(i);
      group.removeFromParent();
    },
  };
}
