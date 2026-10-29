/**
 * The traveller on another world: walking, running, jumping at the world's own
 * gravity, and sitting in a craft.
 *
 * Earth's `player.ts` is a vehicle fleet, a sea, a road network and a town
 * floor's terraces, and none of them exist here; what does transfer is the
 * body, so the numbers that are facts about the body are Earth's own
 * (`WALK_SPEED`, `RUN_SPEED`, and a jump that leaves the ground at the speed an
 * Earth jump does). Only gravity changes, and it changes everything a jump is:
 * the same push off the ground goes `v^2 / 2g` high and stays up `2v / g`, so
 * on the Moon a hop is six times as high and lasts six times as long as on
 * Earth, and on Jupiter's cloud deck the traveller barely leaves it.
 *
 * Earth's gravity in this world's units is not 9.81: a person is 3.77 units for
 * 1.75 m and the jump is tuned for the game, so `EARTH_GRAVITY` is what
 * `2 * JUMP_HEIGHT / JUMP_RISE^2` gives, and a body's is that times
 * `gravity / 9.807`. The parts are in `player/`.
 */

import * as THREE from 'three';
import type { Avatar } from '../avatar.ts';
import { AVATAR_HEIGHT } from '../avatar.ts';
import type { InputState } from '../input.ts';
import type { Emote } from '../../server/src/limits.ts';
import type { Craft } from './craft.ts';
import { board, drive, leave } from './player/drive.ts';
import { glide } from './player/glide.ts';
import { createPlayerState } from './player/state.ts';
import { UP } from './player/frame.ts';
import { walk } from './player/walk.ts';

export { orient } from './player/frame.ts';

/**
 * Earth's jump, as `player.ts` has it: `JUMP_HEIGHT` is
 * `min(LAND_HEIGHT * 0.45, AVATAR_HEIGHT * 0.6)` reached in `JUMP_RISE` seconds,
 * so the gravity is `2h / t^2` and the take-off `2h / t`.
 */
const JUMP_HEIGHT = Math.min(20 * 0.45, AVATAR_HEIGHT * 0.6);
const JUMP_RISE = 0.34;
export const EARTH_GRAVITY = (2 * JUMP_HEIGHT) / (JUMP_RISE * JUMP_RISE);
export const JUMP_SPEED = (2 * JUMP_HEIGHT) / JUMP_RISE;
/** Earth's surface gravity, m/s^2: what `Body.gravity` is measured against. */
const EARTH_G = 9.807;
/** The body's radius against walls. */
export const BODY_RADIUS = 0.9;
/** How high over a point `place` asks for the ground from: over any bridge and under any roof. */
const PLACE_FROM = 400;

export interface WorldPlayer {
  position: THREE.Vector3;
  /** Unit tangent the body faces. */
  facing: THREE.Vector3;
  /** Tangent velocity, units a second, and radial speed. */
  velocity: THREE.Vector3;
  vertical: number;
  airborne: boolean;
  /** Out of an aircraft in flight and not yet down: falling, then under a canopy (`CHUTE_FORCED`). */
  readonly parachute: boolean;
  /** And the canopy open over it. */
  readonly canopy: boolean;
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
  /**
   * A craft in the air wrecked on a wall at `strength` units a second, at
   * `point`, `size` its larger side: the explosion is the caller's, as Earth's
   * (`exploded`), and so is taking `craft` out of the world; the body has been
   * thrown out of it.
   */
  onWreck?(point: THREE.Vector3, strength: number, size: number, craft: Craft): void;
}

export function createWorldPlayer(world: PlayerWorld, avatar: Avatar): WorldPlayer {
  const gravity = EARTH_GRAVITY * (world.gravity / EARTH_G);
  const s = createPlayerState(world, avatar, gravity);
  const { position, facing, velocity } = s;

  return {
    position,
    facing,
    velocity,
    get vertical() {
      return s.vertical;
    },
    get airborne() {
      return s.airborne;
    },
    get parachute() {
      return s.chute;
    },
    get canopy() {
      return s.chute && s.canopy > 0;
    },
    get craft() {
      return s.craft;
    },
    gravity,
    avatar,
    update(dt, input, steer) {
      if (s.craft !== null) drive(s, dt, input);
      else if (s.chute) glide(s, dt, input, steer);
      else walk(s, dt, input, steer);
    },
    board: (next) => board(s, next),
    leave: () => leave(s),
    place(dir, look) {
      // Asked from high over the point, so a bridge over it (a skyway on a
      // deck) is stood on rather than taken for a roof.
      position.copy(dir).normalize().multiplyScalar(world.radius + PLACE_FROM);
      position.setLength(world.radius + world.groundAt(position));
      const up = UP.copy(position).normalize();
      if (look !== undefined) facing.copy(look);
      facing.addScaledVector(up, -facing.dot(up));
      if (facing.lengthSq() < 1e-8) facing.set(up.y, -up.x, 0);
      facing.normalize();
      velocity.set(0, 0, 0);
      s.vertical = 0;
      s.airborne = false;
      s.chute = false;
      s.canopy = 0;
      s.spread = 0;
      if (s.parachute !== null) s.parachute.visible = false;
    },
    emote(name) {
      if (name !== null && (s.craft !== null || s.airborne)) return false;
      return avatar.emote(name);
    },
    get emoting() {
      return avatar.emoting;
    },
  };
}
