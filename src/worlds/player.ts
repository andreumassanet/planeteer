/**
 * The traveller on another world: walking, running, jumping at the world's
 * own gravity, and sitting in a craft.
 *
 * Earth's `player.ts` is a vehicle fleet, a sea, a road network and a town
 * floor's terraces, and none of them exist here; what does transfer is the
 * body, so the numbers that are facts about the body are Earth's own —
 * `WALK_SPEED`, `RUN_SPEED`, and a jump that leaves the ground at the speed an
 * Earth jump does. **Only gravity changes**, and it changes everything a jump
 * is: the same push off the ground goes `v^2 / 2g` high and stays up `2v / g`,
 * so on the Moon a hop is six times as high and lasts six times as long as on
 * Earth, on Mars two and a half, and on Jupiter's cloud deck the traveller
 * barely leaves it.
 *
 * Earth's own gravity in this world's units is not 9.81: a person is 3.77
 * units for 1.75 m and the jump is tuned for the game, so `EARTH_GRAVITY` is
 * what `player.ts` derives (`2 * JUMP_HEIGHT / JUMP_RISE^2`), restated with its
 * derivation, and a body's is that times `gravity / 9.807`.
 */

import * as THREE from 'three';
import type { Avatar } from '../avatar.ts';
import { AVATAR_HEIGHT, RUN_SPEED, WALK_SPEED } from '../avatar.ts';
import type { InputState } from '../input.ts';
import type { Emote } from '../../server/src/limits.ts';
import type { Craft } from './craft.ts';

/**
 * Earth's jump, as `player.ts` has it: `JUMP_HEIGHT` is
 * `min(LAND_HEIGHT * 0.45, AVATAR_HEIGHT * 0.6)` (2.26 units) reached in
 * `JUMP_RISE` 0.34 s, so the gravity is `2h / t^2` and the take-off `2h / t`.
 */
const JUMP_HEIGHT = Math.min(20 * 0.45, AVATAR_HEIGHT * 0.6);
const JUMP_RISE = 0.34;
export const EARTH_GRAVITY = (2 * JUMP_HEIGHT) / (JUMP_RISE * JUMP_RISE);
export const JUMP_SPEED = (2 * JUMP_HEIGHT) / JUMP_RISE;
/** Earth's surface gravity, m/s^2: what `Body.gravity` is measured against. */
const EARTH_G = 9.807;
/** A step this high or lower is walked down without leaving the ground. */
const STEP_DOWN = 1.2;
/** The body's radius against walls. */
export const BODY_RADIUS = 0.9;

export interface WorldPlayer {
  position: THREE.Vector3;
  /** Unit tangent the body faces. */
  facing: THREE.Vector3;
  /** Tangent velocity, units a second, and radial speed. */
  velocity: THREE.Vector3;
  vertical: number;
  airborne: boolean;
  /** The craft being driven, or null on foot. */
  craft: Craft | null;
  /** The world's gravity in units a second squared. */
  readonly gravity: number;
  /** The avatar, positioned and posed every `update`. */
  readonly avatar: Avatar;
  /** One step: on foot under `input` steered by `steer` (a tangent, the camera's), or driving. */
  update(dt: number, input: InputState, steer: THREE.Vector3): void;
  board(craft: Craft): void;
  /** Out of the craft, onto the ground beside it. */
  leave(): void;
  /** Puts the body at a direction, on the ground. */
  place(dir: THREE.Vector3, facing?: THREE.Vector3): void;
  /**
   * A wave or a dance, as Earth's `Player.emote`: standing on the ground on
   * foot, or not at all; `null` stops one. Any step ends it.
   */
  emote(name: Emote | null): boolean;
  readonly emoting: Emote | null;
}

export interface PlayerWorld {
  radius: number;
  gravity: number;
  /** Ground height over the radius under a point (any length). */
  groundAt(point: THREE.Vector3): number;
  /** Pushes a body out of walls; true if it moved. */
  collide(position: THREE.Vector3, radius: number): boolean;
  /**
   * A heel strike, at each half of the gait's cycle as on Earth (`player.ts`):
   * `weight` is the speed as a multiple of a walk. For the footsteps.
   */
  onStep?(weight: number): void;
  /** Down on the ground from a jump or a fall, at this speed, units a second. */
  onTouchdown?(speed: number): void;
}

const UP = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const FORWARD = new THREE.Vector3();
const WANT = new THREE.Vector3();
const basis = new THREE.Matrix4();

/** Points a group's +y along `up` and its +z along `forward` (tangent). Right-handed. */
export function orient(object: THREE.Object3D, up: THREE.Vector3, forward: THREE.Vector3): void {
  const z = FORWARD.copy(forward).addScaledVector(up, -forward.dot(up));
  if (z.lengthSq() < 1e-10) z.set(up.y, -up.x, 0).normalize();
  z.normalize();
  const x = RIGHT.crossVectors(up, z).normalize();
  basis.makeBasis(x, up, z);
  object.quaternion.setFromRotationMatrix(basis);
}

export function createWorldPlayer(world: PlayerWorld, avatar: Avatar): WorldPlayer {
  const gravity = EARTH_GRAVITY * (world.gravity / EARTH_G);
  const position = new THREE.Vector3(0, world.radius, 0);
  const facing = new THREE.Vector3(0, 0, 1);
  const velocity = new THREE.Vector3();
  let vertical = 0;
  let airborne = false;
  let craft: Craft | null = null;
  /** Where the avatar hangs while on foot: the scene, given back on leaving a craft. */
  let home: THREE.Object3D | null = null;
  /** Where the gait was last frame, for the heel strikes. */
  let lastStep = 0;

  const player: WorldPlayer = {
    position,
    facing,
    velocity,
    get vertical() {
      return vertical;
    },
    get airborne() {
      return airborne;
    },
    get craft() {
      return craft;
    },
    gravity,
    avatar,
    update(dt, input, steer) {
      if (craft !== null) {
        const c = craft;
        c.update(
          dt,
          {
            throttle: input.move.y,
            steer: input.move.x,
            climb: input.climb,
            // A ship's run key is its afterburner and it comes down on the
            // descend key alone, as Earth's plane does; anything else sinks on either.
            descend: c.kind === 'lander' ? input.dive : input.dive || input.run,
            boost: input.run,
          },
          world.groundAt,
          gravity,
          world.radius,
        );
        position.copy(c.position);
        facing.copy(c.heading);
        avatar.sit(dt);
        avatar.group.position.copy(c.seat);
        avatar.group.quaternion.identity();
        return;
      }

      const up = UP.copy(position).normalize();
      // Carry the facing and the velocity across the sphere: tangent again.
      facing.addScaledVector(up, -facing.dot(up)).normalize();
      velocity.addScaledVector(up, -velocity.dot(up));

      // The keys, against the camera's tangent heading.
      const forward = FORWARD.copy(steer).addScaledVector(up, -steer.dot(up)).normalize();
      const right = RIGHT.crossVectors(forward, up).normalize();
      const speed = input.run ? RUN_SPEED : WALK_SPEED;
      const want = WANT.set(0, 0, 0).addScaledVector(forward, input.move.y).addScaledVector(right, input.move.x);
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(speed);
      // Grip on the ground, a little steering in the air.
      const grip = airborne ? 1.2 : 12;
      velocity.lerp(want, Math.min(1, grip * dt));
      if (want.lengthSq() > 0.01) facing.lerp(want.clone().normalize(), Math.min(1, dt * 10)).normalize();

      position.addScaledVector(velocity, dt);
      world.collide(position, BODY_RADIUS);

      const ground = world.radius + world.groundAt(position);
      let radial = position.length();
      if (input.jump && !airborne) {
        vertical = JUMP_SPEED;
        airborne = true;
        radial = Math.max(radial, ground);
      }
      if (airborne) {
        vertical -= gravity * dt;
        radial += vertical * dt;
        if (radial <= ground) {
          const hardness = Math.max(0, (-vertical - JUMP_SPEED) / (JUMP_SPEED * 2));
          radial = ground;
          airborne = false;
          world.onTouchdown?.(-vertical);
          vertical = 0;
          avatar.land(hardness);
        }
      } else if (radial - ground > STEP_DOWN) {
        // Off a ledge: fall, at this world's rate.
        airborne = true;
        vertical = 0;
      } else {
        radial = ground;
      }
      position.setLength(radial);

      const horizontal = velocity.length();
      // A gesture is made standing: the first step puts it down.
      if (avatar.emoting !== null && want.lengthSq() > 0.01) avatar.emote(null);
      avatar.stride(dt, horizontal, airborne);
      // A heel strike at each half of the cycle; see `Avatar.phase`.
      const stepPhase = avatar.phase;
      if (!airborne && horizontal > WALK_SPEED * 0.3 && (stepPhase < lastStep || (lastStep < 0.5 && stepPhase >= 0.5))) {
        world.onStep?.(horizontal / WALK_SPEED);
      }
      lastStep = stepPhase;
      avatar.group.position.copy(position);
      orient(avatar.group, UP.copy(position).normalize(), facing);
    },
    board(next) {
      craft = next;
      velocity.set(0, 0, 0);
      vertical = 0;
      airborne = false;
      avatar.emote(null);
      home = avatar.group.parent;
      next.object.add(avatar.group);
      // Under a closed canopy the pilot is not seen: a body sat in a hull pokes through it.
      avatar.group.visible = !next.closed;
      avatar.group.position.copy(next.seat);
      avatar.group.quaternion.identity();
    },
    leave() {
      if (craft === null) return;
      const c = craft;
      craft = null;
      c.object.remove(avatar.group);
      home?.add(avatar.group);
      avatar.group.visible = true;
      const up = UP.copy(c.position).normalize();
      const side = RIGHT.crossVectors(c.heading, up).normalize();
      position.copy(c.position).addScaledVector(side, -(c.radius + 1.6));
      position.setLength(world.radius + world.groundAt(position));
      facing.copy(c.heading);
      airborne = false;
      vertical = 0;
      avatar.reset();
    },
    place(dir, look) {
      position.copy(dir).normalize();
      position.setLength(world.radius + world.groundAt(position));
      const up = UP.copy(position).normalize();
      if (look !== undefined) facing.copy(look);
      facing.addScaledVector(up, -facing.dot(up));
      if (facing.lengthSq() < 1e-8) facing.set(up.y, -up.x, 0);
      facing.normalize();
      velocity.set(0, 0, 0);
      vertical = 0;
      airborne = false;
    },
    emote(name) {
      if (name !== null && (craft !== null || airborne)) return false;
      return avatar.emote(name);
    },
    get emoting() {
      return avatar.emoting;
    },
  };
  return player;
}
