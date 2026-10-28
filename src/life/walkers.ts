/** Walkers drawn from the cast, and the bodies a player bumps into. */
import * as THREE from 'three';
import { AVATAR_HEIGHT, WALK_STRIDE } from '../avatar.ts';
import type { Folk } from '../folk.ts';
import { createUmbrellas } from '../umbrella.ts';
import { frameOpenFor } from '../view.ts';
import type { ViewCone } from '../view.ts';
import type { LifeStats } from './api.ts';
import type { Herding } from './herd-types.ts';
import { wrap } from './mover.ts';
import type { Frame, Mover } from './mover.ts';
import { BOLT_SECONDS, DRESS_PER_FRAME } from './tuning.ts';
import { KNOCK_DIZZY, KNOCK_TOTAL, knockPose, knockSolidAt, newKnockPose } from '../breakables/knock.ts';

/** How far through its own stride a walker is, from the clock alone. */
export const walkPhase = (mover: Mover, clock: number): number => wrap((mover.speed * clock) / WALK_STRIDE);

export interface Walkers {
  /**
   * Draws a walker as its own skinned cast body, placed on its route and held
   * at the phase of the walk its distance says, so its feet keep time with
   * the ground rather than the frame rate. The pool key is `w|<region>|<body>`.
   */
  draw(mover: Mover, frame: Frame, clock: number, viewer: THREE.Vector3): void;
  /** The walkers drawn this frame. */
  shown: Mover[];
  /** `clock` is the frame's, in seconds: the umbrellas open and furl by it. */
  beginFrame(clock: number): void;
  /** After every walker is drawn: their umbrellas go up in one call. */
  endFrame(): void;
}

/** The most umbrellas the verges put up at once. */
const WALKER_UMBRELLAS = 64;

export function createWalkers(folk: Folk | undefined, group: THREE.Group, cone: ViewCone, stats: LifeStats): Walkers {
  const shown: Mover[] = [];
  let dressedThisFrame = 0;
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const umbrellas = createUmbrellas(WALKER_UMBRELLAS);
  group.add(umbrellas.mesh);
  let lastClock = Number.NaN;
  let step = 0;
  const pose = newKnockPose();
  const tip = new THREE.Quaternion();
  const axis = new THREE.Vector3();

  /** A knocked walker's body: where it fell, over, up, and back onto its route. True while the pose holds the walk's time still. */
  function knockedBody(mover: Mover, frame: Frame, holder: THREE.Group): boolean {
    const knock = mover.knock;
    if (!knock) return false;
    knock.t += step;
    knockPose(knock.t, AVATAR_HEIGHT, knock.fling, pose);
    if (pose.done) {
      mover.knock = null;
      return false;
    }
    holder.position.copy(knock.at).addScaledVector(knock.dir, pose.along).addScaledVector(frame.dir, pose.lift);
    if (pose.up) {
      // Dizzy, and catching its route up over the sway.
      const back = Math.min(1, (knock.t - (KNOCK_TOTAL - KNOCK_DIZZY)) / KNOCK_DIZZY);
      holder.position.lerp(mover.at, back * back);
      holder.quaternion.premultiply(tip.setFromAxisAngle(frame.dir, pose.sway));
      return false;
    }
    // Over about the feet, the top towards the fling: a turn about `up x dir`.
    axis.crossVectors(frame.dir, knock.dir).normalize();
    holder.quaternion.premultiply(tip.setFromAxisAngle(axis, pose.tilt));
    return true;
  }

  function draw(mover: Mover, frame: Frame, clock: number, viewer: THREE.Vector3): void {
    const visible = frame.live && cone.keeps(mover.at, 20);
    if (!visible) {
      if (mover.person) mover.person.holder.visible = false;
      return;
    }
    if (!mover.person) {
      // A dressing is a whole skinned clone: a few a frame, while the frame has
      // room, each walker hidden until it is dressed.
      if (dressedThisFrame >= DRESS_PER_FRAME || !frameOpenFor(dressedThisFrame, true)) return;
      dressedThisFrame++;
      const person = folk!.dress(mover.key, mover.pool.split('|')[1] ?? 'atlantic-europe');
      if (person === null) return;
      const holder = new THREE.Group();
      holder.name = `foot:${mover.key}`;
      holder.add(person.root);
      group.add(holder);
      person.actions.get('Walk')!.play();
      mover.person = { holder, person };
    }
    const { holder, person } = mover.person;
    holder.visible = true;
    shown.push(mover);
    forward.copy(frame.forward).projectOnPlane(frame.dir).normalize();
    right.crossVectors(frame.dir, forward).normalize();
    basis.makeBasis(right, frame.dir, forward);
    holder.position.copy(mover.at);
    holder.quaternion.setFromRotationMatrix(basis);
    const walk = person.actions.get('Walk')!;
    if (!knockedBody(mover, frame, holder)) walk.time = walkPhase(mover, clock) * walk.getClip().duration;
    umbrellas.unpose(person);
    person.mixer.update(0);
    umbrellas.pose(person, mover.key, step);
    umbrellas.emit(person);
    stats.nearestMoving = Math.min(stats.nearestMoving, mover.at.distanceTo(viewer));
    stats.foot++;
    stats.meshes++;
  }

  return {
    draw,
    shown,
    beginFrame(clock) {
      shown.length = 0;
      dressedThisFrame = 0;
      // The sky's clock runs at `setRate`; an umbrella opens in real seconds or near them.
      step = Number.isFinite(lastClock) ? Math.max(0, Math.min(0.1, clock - lastClock)) : 0;
      lastClock = clock;
      umbrellas.begin();
    },
    endFrame() {
      umbrellas.end();
    },
  };
}

const gap = new THREE.Vector3();

/**
 * Pushes a body of `radius` at `point` out of every walker (`personRadius`
 * wide) and near animal drawn this frame, along the ground; true if it
 * touched one. An animal is two discs along its body, its own width across,
 * and bolts when touched.
 */
export function collideMovers(
  point: THREE.Vector3, radius: number, personRadius: number, push: THREE.Vector3,
  walkers: readonly Mover[], herds: readonly Herding[],
): boolean {
  let hit = false;
  const reach = radius + personRadius;
  const r = point.length();
  for (const mover of walkers) {
    if (mover.knock && !knockSolidAt(mover.knock.t)) continue;
    gap.copy(point).sub(mover.at);
    const up = gap.dot(point) / r;
    if (up > AVATAR_HEIGHT || up < -AVATAR_HEIGHT) continue;
    gap.addScaledVector(point, -up / r);
    const d = gap.length();
    if (d >= reach || d < 1e-6) continue;
    push.addScaledVector(gap, (reach - d) / d);
    hit = true;
  }
  for (const herd of herds) {
    for (const head of herd.heads) {
      if (!knockSolidAt(head.knocked)) continue;
      gap.copy(point).sub(head.world);
      const up = gap.dot(point) / r;
      if (up > head.height || up < -AVATAR_HEIGHT) continue;
      gap.addScaledVector(point, -up / r);
      const along = gap.dot(head.facing);
      const spine = Math.max(0, head.halfLength - head.halfWidth);
      gap.addScaledVector(head.facing, -Math.max(-spine, Math.min(spine, along)));
      const touch = radius + head.halfWidth;
      const d = gap.length();
      if (d >= touch || d < 1e-6) continue;
      push.addScaledVector(gap, (touch - d) / d);
      head.bolt = BOLT_SECONDS;
      hit = true;
    }
  }
  return hit;
}
