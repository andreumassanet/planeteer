/**
 * A near herd, alive: its animals graze, wander their field and move off from
 * you. This is the one part of the movers that is not a function of the clock,
 * since it depends on where you have walked; every decision is seeded by the
 * herd, the animal and how many decisions it has taken, and past
 * `HERD_HOME_REACH` the animals walk back to where the merged herd shows them.
 */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { rngFrom } from '../scenery/random.ts';
import { MAX_SLOPE, flattenWeightAt, gradeAt } from '../terrain.ts';
import type { Slope } from '../terrain.ts';
import type { LifeShared } from './api.ts';
import type { HerdBuilder } from './herd-build.ts';
import type { GrazeMode, Grazer, HerdGround, Herding } from './herd-types.ts';
import type { Mover } from './mover.ts';
import { knockPose, newKnockPose } from '../breakables/knock.ts';
import {
  BOLT_SECONDS,
  FLEE_PACE,
  FLEE_REACH,
  FLEE_TURNS,
  GRAZE_PROBES,
  HERD_HOLD_REACH,
  HERD_HOME_REACH,
  TAU,
  TROT,
} from './tuning.ts';

const herdUp = new THREE.Vector3(0, 1, 0);
const herdForward = new THREE.Vector3(0, 0, 1);
const knockedPose = newKnockPose();
const roll = new THREE.Quaternion();

/** Whether an animal is on its way somewhere. */
export const moving = (head: Grazer): boolean =>
  head.mode === 'walk' || head.mode === 'trot' || head.mode === 'flee' || head.mode === 'home';

/** Every animal of a herd at its own spot, facing its own way, in its own clip: what the far herd shows. */
export function settledHerd(herd: Herding): boolean {
  for (const head of herd.heads) if (head.mode !== 'settled') return false;
  return true;
}

/** The signed turn from `from` to `to`, in (-pi, pi]. */
const angleBetween = (from: number, to: number): number => {
  let turn = (to - from) % TAU;
  if (turn > Math.PI) turn -= TAU;
  if (turn <= -Math.PI) turn += TAU;
  return turn;
};

/** Where a spot of a herd's plane is, as a unit vector. */
function grazeDirection(site: HerdGround, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out
    .copy(site.centre)
    .addScaledVector(site.right, x / PLANET_RADIUS)
    .addScaledVector(site.forward, z / PLANET_RADIUS)
    .normalize();
}

/** Whether a spot keeps a body's length from every other animal of the herd, and from where each is going. */
function spaced(herd: Herding, head: Grazer, x: number, z: number): boolean {
  for (const other of herd.heads) {
    if (other === head) continue;
    const gap = (head.halfLength + other.halfLength) * 0.8;
    if (Math.hypot(other.x - x, other.z - z) < gap) return false;
    if (moving(other) && Math.hypot(other.toX - x, other.toZ - z) < gap) return false;
  }
  return true;
}

/** Crossfades an animal into a clip, played at `rate`. */
function playClip(head: Grazer, action: THREE.AnimationAction | undefined, rate: number): void {
  if (action === undefined) return;
  action.timeScale = rate;
  if (head.current === action) return;
  action.reset().setEffectiveWeight(1).play();
  if (head.current !== undefined) head.current.crossFadeTo(action, 0.35, false);
  head.current = action;
}

/** Sets an animal walking to a spot whose seat is `seat`. */
function setOff(head: Grazer, x: number, z: number, seat: number, mode: GrazeMode, speed: number): void {
  head.fromY = head.y;
  head.toX = x;
  head.toZ = z;
  head.toY = seat;
  head.leg = Math.max(1e-6, Math.hypot(x - head.x, z - head.z));
  head.mode = mode;
  head.speed = speed;
  head.stuck = 0;
  head.face = NaN;
  playClip(head, head.walk ?? head.idle, head.walk !== undefined ? speed / head.pace : 1);
}

/** Stands an animal still, grazing or with its head up, for `seconds`. */
function standStill(head: Grazer, grazing: boolean, seconds: number): void {
  head.mode = grazing ? 'graze' : 'idle';
  head.timer = seconds;
  head.speed = 0;
  playClip(head, grazing ? head.graze : head.idle, 1);
}

/** Its own spot, its own way, its own clip: the far herd's frame of it. */
function settle(head: Grazer): void {
  head.x = head.homeX;
  head.z = head.homeZ;
  head.y = head.homeY;
  head.yaw = head.homeYaw;
  head.mode = 'settled';
  head.speed = 0;
  head.face = NaN;
  playClip(head, head.rest, head.rest?.timeScale ?? 1);
}

/** A near herd out of sight while you walk away: every animal put back at once, unseen. */
export function settleUnseen(herd: Herding): void {
  for (const head of herd.heads) {
    if (head.mode === 'settled') continue;
    settle(head);
    head.place.position.set(head.x, head.y, head.z);
    head.place.quaternion.setFromAxisAngle(herdUp, head.yaw);
  }
}

function arrive(herd: Herding, head: Grazer, dt: number): void {
  head.x = head.toX;
  head.z = head.toZ;
  head.y = head.toY;
  if (head.mode === 'home') {
    // Its own way round, and then it is the far herd's frame of it.
    const error = angleBetween(head.yaw, head.homeYaw);
    if (Math.abs(error) < 0.04) settle(head);
    else {
      head.face = head.homeYaw;
      head.yaw += Math.sign(error) * Math.min(Math.abs(error), 4 * dt);
      playClip(head, head.idle, 1);
    }
    return;
  }
  const rng = rngFrom(herd.holder.name, 'arrive', head.draws++);
  if (head.mode === 'flee') standStill(head, false, rng.range(1.5, 3));
  else standStill(head, rng.chance(0.75), rng.range(4, 10));
}

/** Whether a vehicle a player has left stands within `radius` of a point (`InTheWay.parked`). */
type Parked = (point: THREE.Vector3, radius: number) => boolean;

const herdStepAt = new THREE.Vector3();

/**
 * Whether a step would put an animal inside a neighbour it is not already
 * touching, or into a parked vehicle it is not already standing in.
 */
function blockedBy(herd: Herding, head: Grazer, x: number, z: number, parked: Parked | undefined): boolean {
  for (const other of herd.heads) {
    if (other === head) continue;
    const gap = (head.halfWidth + other.halfWidth) * 1.2;
    const after = Math.hypot(other.x - x, other.z - z);
    if (after < gap && after < Math.hypot(other.x - head.x, other.z - head.z)) return true;
  }
  if (parked !== undefined) {
    if (parked(grazeDirection(herd.site, x, z, herdStepAt), head.halfWidth)) {
      return !parked(grazeDirection(herd.site, head.x, head.z, herdStepAt), head.halfWidth);
    }
  }
  return false;
}

/**
 * One animal, one frame: it turns towards where it is going and walks
 * there, faster the straighter it faces, and waits where a neighbour stands
 * in its way.
 */
/**
 * One frame knocked over: shoved along the way it was hit, onto its side, up
 * again and shaky; then it bolts. Its roll about its own length, and a lift
 * while it lies so its side rests on the ground.
 */
function knockedStep(head: Grazer, dt: number): { lift: number; roll: number; sway: number } | null {
  head.knocked += dt;
  knockPose(head.knocked, head.height, head.knockFling, knockedPose);
  if (knockedPose.done) {
    head.knocked = -1;
    head.bolt = BOLT_SECONDS;
    head.timer = 0;
    return null;
  }
  head.x = head.knockX + head.knockDx * knockedPose.along;
  head.z = head.knockZ + head.knockDz * knockedPose.along;
  // Onto the side away from the hit.
  const side = Math.sign(head.knockDx * Math.cos(head.yaw) - head.knockDz * Math.sin(head.yaw)) || 1;
  const over = Math.sin(Math.min(Math.PI / 2, knockedPose.tilt));
  return { lift: knockedPose.lift + over * head.halfWidth * 0.5, roll: -side * knockedPose.tilt, sway: knockedPose.sway };
}

function stepHead(herd: Herding, head: Grazer, dt: number, parked: Parked | undefined): void {
  const knocked = head.knocked >= 0 ? knockedStep(head, dt) : null;
  if (knocked !== null) {
    head.place.position.set(head.x, head.y + knocked.lift, head.z);
    head.place.quaternion.setFromAxisAngle(herdUp, head.yaw + knocked.sway).multiply(roll.setFromAxisAngle(herdForward, knocked.roll));
    placeInWorld(herd, head);
    return;
  }
  if (moving(head)) {
    const tx = head.toX - head.x;
    const tz = head.toZ - head.z;
    const left = Math.hypot(tx, tz);
    if (left < 0.3) {
      arrive(herd, head, dt);
    } else {
      const error = angleBetween(head.yaw, Math.atan2(tx, tz));
      const rate = head.mode === 'flee' || head.mode === 'trot' ? 3.6 : 1.8;
      head.yaw += Math.max(-rate * dt, Math.min(rate * dt, error));
      const along = Math.max(0, Math.cos(error));
      const step = Math.min(left, head.speed * along * along * dt);
      const nx = head.x + Math.sin(head.yaw) * step;
      const nz = head.z + Math.cos(head.yaw) * step;
      // Going home it walks through: the far herd is waiting for it.
      if (head.mode !== 'home' && blockedBy(herd, head, nx, nz, parked)) {
        head.stuck += dt;
        if (head.stuck > 1.5) standStill(head, true, 2);
      } else {
        head.stuck = 0;
        const out = Math.hypot(nx, nz);
        const scale = out > herd.room ? herd.room / out : 1;
        head.x = nx * scale;
        head.z = nz * scale;
        const done = 1 - Math.min(1, Math.hypot(head.toX - head.x, head.toZ - head.z) / head.leg);
        head.y = head.fromY + (head.toY - head.fromY) * done;
      }
      if (head.walk === undefined) head.bob += (step / Math.max(1e-6, head.halfLength)) * 2;
    }
  } else if (!Number.isNaN(head.face)) {
    const error = angleBetween(head.yaw, head.face);
    head.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, error));
  }
  // A rig with no walk of its own bobs at its stride while it moves.
  const bob = head.walk === undefined && moving(head) ? Math.abs(Math.sin(head.bob * Math.PI)) * head.height * 0.04 : 0;
  head.place.position.set(head.x, head.y + bob, head.z);
  head.place.quaternion.setFromAxisAngle(herdUp, head.yaw);
  placeInWorld(herd, head);
}

/** Where the animal is in the world this frame, and which way it faces, for `collide`. */
function placeInWorld(herd: Herding, head: Grazer): void {
  const herdAt = herd.holder.position;
  head.world
    .copy(herdAt)
    .addScaledVector(herd.axisX, head.x)
    .addScaledVector(herd.axisY, head.y)
    .addScaledVector(herd.axisZ, head.z);
  head.facing
    .copy(herd.axisX).multiplyScalar(Math.sin(head.yaw))
    .addScaledVector(herd.axisZ, Math.cos(head.yaw));
}

export interface HerdBehaviour {
  /** One frame of a near herd: what each animal decides and where it goes. */
  herdStep(mover: Mover, herd: Herding, dt: number, viewer: THREE.Vector3, viewerPace: number): void;
  /** Resets the frame's share of ground probes. */
  beginFrame(): void;
}

export function createHerdBehaviour(world: World, herdBuilder: HerdBuilder, shared: LifeShared): HerdBehaviour {
  const grazeDir = new THREE.Vector3();
  const grazeSeat = new THREE.Vector3();
  const grazeSlope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const herdGap = new THREE.Vector3();
  let grazeProbes = 0;

  /**
   * Whether an animal may stand at `(x, z)` of its herd's plane and walk there
   * from where it is: inside the room, outside the town, on land, off a pad,
   * and no steeper than `MAX_SLOPE` there and every stance of the way.
   * Returns the seat there, as `buildHerd` measures one, or NaN.
   */
  function grazable(herd: Herding, head: Grazer, x: number, z: number): number {
    const site = herd.site;
    if (Math.hypot(x, z) > herd.room) return NaN;
    grazeDirection(site, x, z, grazeDir);
    if (herd.town !== null && herd.town.angleTo(grazeDir) * PLANET_RADIUS < herd.townRadius + head.halfLength) return NaN;
    if (world.elevationAt(grazeDir) <= 0) return NaN;
    if (flattenWeightAt(grazeDir.x, grazeDir.y, grazeDir.z) > 0) return NaN;
    const inTheWay = shared.inTheWay;
    if (inTheWay?.parked !== undefined && inTheWay.parked(grazeDir, head.halfLength)) return NaN;
    const way = Math.hypot(x - head.x, z - head.z);
    const steps = Math.min(8, Math.ceil(way / head.stance));
    for (let step = 1; step < steps; step++) {
      const share = step / steps;
      grazeDirection(site, head.x + (x - head.x) * share, head.z + (z - head.z) * share, grazeSeat);
      if (gradeAt(grazeSeat, site.right, site.forward, head.stance, grazeSlope).grade > MAX_SLOPE) return NaN;
    }
    gradeAt(grazeDir, site.right, site.forward, head.stance, grazeSlope);
    if (grazeSlope.grade > MAX_SLOPE) return NaN;
    return herdBuilder.seatOf(site, grazeDir, head.stance, grazeSlope);
  }

  /**
   * Away from you: straight away if it can, else a little either side, as far
   * as your reach and a length or two, pulled in to the herd's room at its edge.
   */
  function flee(
    mover: Mover, herd: Herding, head: Grazer, index: number,
    dx: number, dz: number, near: number, reach: number, fast: boolean,
  ): void {
    const base = near > 1e-3 ? Math.atan2(dx, dz) : rngFrom(mover.key, 'flee', index, head.draws).unit() * TAU;
    const distance = Math.max(head.halfLength * 3, reach - near + head.halfLength * 2);
    const speed = fast ? head.pace * TROT : head.pace * 1.6;
    for (const turn of FLEE_TURNS) {
      if (grazeProbes >= GRAZE_PROBES) break;
      const angle = base + turn;
      let x = head.x + Math.sin(angle) * distance;
      let z = head.z + Math.cos(angle) * distance;
      const out = Math.hypot(x, z);
      if (out > herd.room * 0.97) {
        x *= (herd.room * 0.97) / out;
        z *= (herd.room * 0.97) / out;
      }
      // Pulled in by the room, a spot can end up no further from you.
      if (Math.hypot(x - (head.x - dx), z - (head.z - dz)) <= near + head.halfLength * 0.5) continue;
      grazeProbes++;
      const seat = grazable(herd, head, x, z);
      if (Number.isNaN(seat)) continue;
      setOff(head, x, z, seat, 'flee', speed);
      head.timer = 0.8;
      return;
    }
    // Nowhere to go this frame: it stands with its back to you and looks again soon.
    if (moving(head)) standStill(head, false, 0.3);
    head.face = base;
    head.timer = 0.3;
  }

  /** What an animal does next when nothing is bothering it: mostly nothing. */
  function wander(mover: Mover, herd: Herding, head: Grazer, index: number): void {
    if (grazeProbes >= GRAZE_PROBES) {
      head.timer = 0.05;
      return;
    }
    const rng = rngFrom(mover.key, 'graze', index, head.draws++);
    const roll = rng.unit();
    if (roll < 0.5) return standStill(head, true, rng.range(5, 12));
    if (roll < 0.65) return standStill(head, false, rng.range(2, 5));
    // A few lengths away, and back towards its own spot when it has strayed.
    const trot = rng.chance(0.12);
    const distance = rng.range(1, 3) * head.halfLength * 2;
    const strayed = Math.hypot(head.x - head.homeX, head.z - head.homeZ) > herd.room * 0.5;
    const angle = strayed
      ? Math.atan2(head.homeX - head.x, head.homeZ - head.z) + rng.jitter() * 0.8
      : rng.unit() * TAU;
    const x = head.x + Math.sin(angle) * distance;
    const z = head.z + Math.cos(angle) * distance;
    grazeProbes++;
    if (!spaced(herd, head, x, z)) return standStill(head, true, rng.range(2, 4));
    const seat = grazable(herd, head, x, z);
    if (Number.isNaN(seat)) return standStill(head, true, rng.range(2, 4));
    setOff(head, x, z, seat, trot ? 'trot' : 'walk', trot ? head.pace * TROT : head.pace);
  }

  /** A homing animal's speed: there before you are `HERD_HOLD_REACH` off at your pace, between a walk and six times it. */
  function homeward(head: Grazer, away: number, viewerPace: number): void {
    if (head.mode !== 'home') setOff(head, head.homeX, head.homeZ, head.homeY, 'home', head.pace);
    const left = Math.hypot(head.homeX - head.x, head.homeZ - head.z);
    // Less the time it takes to turn its own way round once there.
    const time = Math.max(0.3, ((HERD_HOLD_REACH - away) / Math.max(1, viewerPace)) * 0.7 - 0.8);
    head.speed = Math.max(head.pace, Math.min(head.pace * 6, left / time));
    if (head.walk !== undefined && head.current === head.walk) head.walk.timeScale = head.speed / head.pace;
  }

  function herdStep(mover: Mover, herd: Herding, dt: number, viewer: THREE.Vector3, viewerPace: number): void {
    const away = mover.at.distanceTo(viewer);
    herd.homing = away > HERD_HOME_REACH;
    herdGap.copy(viewer).sub(herd.holder.position);
    const px = herdGap.dot(herd.axisX);
    const pz = herdGap.dot(herd.axisZ);
    // How alarming you are: standing, walking, running, driving.
    let threat: number = FLEE_PACE.length;
    for (let i = 0; i < FLEE_PACE.length; i++) {
      if (viewerPace < FLEE_PACE[i]!) {
        threat = i;
        break;
      }
    }
    const heads = herd.heads;
    for (let i = 0; i < heads.length; i++) {
      const head = heads[i]!;
      head.timer -= dt;
      head.bolt = Math.max(0, head.bolt - dt);
      if (herd.homing) {
        if (head.mode !== 'settled') homeward(head, away, viewerPace);
      } else {
        const dx = head.x - px;
        const dz = head.z - pz;
        const near = Math.hypot(dx, dz);
        const reach = FLEE_REACH[threat]! + head.halfLength * 2;
        const alarmed = near < reach || head.bolt > 0;
        if (alarmed && (head.mode !== 'flee' || head.timer <= 0)) {
          flee(mover, herd, head, i, dx, dz, near, reach, threat >= 2 || head.bolt > 0);
        } else if (!alarmed && head.timer <= 0 && !moving(head)) {
          wander(mover, herd, head, i);
        } else if (head.mode === 'home') {
          // You came back before it got there.
          standStill(head, false, 0.5);
        }
      }
      stepHead(herd, head, dt, shared.inTheWay?.parked);
      head.rigged.mixer.update(dt);
    }
  }

  return {
    herdStep,
    beginFrame() {
      grazeProbes = 0;
    },
  };
}
