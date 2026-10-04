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
import {
  CANOPY_OPENING,
  CHUTE_FORCED,
  CHUTE_GLIDE,
  CHUTE_GLIDE_RATE,
  CHUTE_GRIP,
  CHUTE_PACE,
  CHUTE_PULL,
  CHUTE_SINK,
  CHUTE_SINK_RATE,
  CHUTE_SWING,
  CHUTE_TURN,
  FREEFALL_DIVE,
  FREEFALL_MIN,
  FREEFALL_RATE,
  FREEFALL_TRACK,
  buildParachute,
  newChuteSwing,
  openCanopy,
  swingUnder,
  trailOf,
} from '../craft/parachute.ts';

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
/**
 * Out of a craft this high over the ground or higher is out of an aircraft in
 * flight: the body falls and opens a canopy, as on Earth (`player.ts`'s
 * `bailOut`), carrying `BAIL_CARRY` of the craft's speed. Under it, it is
 * stepping down beside it.
 */
const BAIL_HEIGHT = AVATAR_HEIGHT;
/** Under this height over the ground a craft meets walls; over it, nothing is tall enough to. */
const CRAFT_WALLS_UNDER = 40;
/** How high over a point `place` asks for the ground from: over any bridge and under any roof. */
const PLACE_FROM = 400;
const BAIL_CARRY = 0.45;

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
}

const UP = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const FORWARD = new THREE.Vector3();
const WANT = new THREE.Vector3();
const WAS_FACING = new THREE.Vector3();
const CROSS = new THREE.Vector3();

/** The angle from `from` to `to` about `about`, positive to the left: Earth's `player.ts` measures the same. */
function angleAbout(from: THREE.Vector3, to: THREE.Vector3, about: THREE.Vector3): number {
  CROSS.crossVectors(from, to);
  return Math.atan2(CROSS.dot(about), from.dot(to));
}

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
  /** What `avatar.stride` is told on top of the speed; see `MotionCues`. */
  const cues = { turn: 0, look: 0 };
  const velocity = new THREE.Vector3();
  let vertical = 0;
  let airborne = false;
  let craft: Craft | null = null;
  /** Where the avatar hangs while on foot: the scene, given back on leaving a craft. */
  let home: THREE.Object3D | null = null;
  /** Where the gait was last frame, for the heel strikes. */
  let lastStep = 0;
  /**
   * Out of an aircraft: falling (`chute` true, `canopy` 0) and under the
   * canopy (`canopy` the seconds since it began to open), as on Earth; how
   * much of the pose is the canopy's (`spread`), the turn's lever and lean,
   * and the body's swing under it.
   */
  let chute = false;
  let canopy = 0;
  let spread = 0;
  let steering = 0;
  let lean = 0;
  const swing = newChuteSwing();
  const trail: [number, number] = [0, 0];
  let parachute: THREE.Group | null = null;
  const motion = new THREE.Vector3();
  const swung = new THREE.Quaternion();
  const swingEuler = new THREE.Euler();
  const hangFrom = new THREE.Vector3();

  /** The canopy over the body while it is open, in the body's own upright frame. */
  function drawCanopy(): void {
    if (!chute || canopy === 0) {
      if (parachute !== null) parachute.visible = false;
      return;
    }
    if (parachute === null) {
      // Hung in the body's upright frame: a holder there, the canopy in it.
      parachute = new THREE.Group();
      parachute.name = 'parachute';
      parachute.add(buildParachute());
      home?.add(parachute);
    }
    parachute.visible = true;
    parachute.position.copy(position);
    orient(parachute, UP.copy(position).normalize(), facing);
    openCanopy(parachute.children[0]!, canopy, lean + (swing.roll - lean) * 0.3, steering, swing.pitch * 0.3);
  }

  /**
   * Falling from an aircraft, and under a canopy: Earth's `glide`, its laws
   * shared from `craft/parachute.ts`. The jump key opens the canopy and stows
   * it again over `CHUTE_FORCED`; under it the keys steer rather than walk.
   */
  function glide(dt: number, input: InputState, steer: THREE.Vector3): void {
    const up = UP.copy(position).normalize();
    facing.addScaledVector(up, -facing.dot(up)).normalize();
    const over = position.length() - (world.radius + world.groundAt(position));
    if (input.jump && over > CHUTE_FORCED) canopy = canopy > 0 ? 0 : 1e-3;
    if (canopy === 0 && over <= CHUTE_FORCED) canopy = 1e-3;
    const open = canopy > 0;
    if (open) canopy += dt;
    spread += ((open ? 1 : 0) - spread) * (1 - Math.exp(-dt * (open ? 1 / CANOPY_OPENING : 8)));
    const stickX = Math.max(-1, Math.min(1, input.move.x));
    const stickY = Math.max(-1, Math.min(1, input.move.y));
    let fall: number;
    if (open) {
      steering += (stickX - steering) * (1 - Math.exp(-3 * dt));
      facing.applyAxisAngle(up, -steering * CHUTE_TURN * dt).normalize();
      const pace = 1 + CHUTE_PACE * stickY;
      WANT.copy(facing).multiplyScalar((CHUTE_GLIDE + over * CHUTE_GLIDE_RATE) * pace);
      motion.lerp(WANT, 1 - Math.exp(-1.5 * dt));
      fall = (CHUTE_SINK + over * CHUTE_SINK_RATE) * (1 + CHUTE_PACE * 0.5 * stickY);
    } else {
      // Tracked across the ground like a walk, towards the camera's way, and
      // facing where the camera looks.
      const heading = FORWARD.copy(steer).addScaledVector(up, -steer.dot(up));
      if (heading.lengthSq() < 1e-8) heading.copy(facing);
      heading.normalize();
      const side = RIGHT.crossVectors(heading, up).normalize();
      WANT.set(0, 0, 0).addScaledVector(heading, stickY).addScaledVector(side, stickX);
      if (WANT.lengthSq() > 1) WANT.normalize();
      motion.lerp(WANT.multiplyScalar(FREEFALL_TRACK), 1 - Math.exp(-1.2 * dt));
      facing.lerp(heading, 1 - Math.exp(-4 * dt)).normalize();
      steering += (stickX - steering) * (1 - Math.exp(-3 * dt));
      fall = Math.max(FREEFALL_MIN, over * FREEFALL_RATE) * (stickY > 0 ? FREEFALL_DIVE : 1);
    }
    vertical += (-fall - vertical) * (1 - Math.exp(-(open ? 2 : 4) * dt));
    motion.addScaledVector(up, -motion.dot(up));
    velocity.copy(motion);
    const height = position.length() + vertical * dt;
    position.addScaledVector(motion, dt);
    if (over < AVATAR_HEIGHT * 4) world.collide(position, BODY_RADIUS);
    lean = open ? steering * CHUTE_SWING : 0;
    const ground = world.radius + world.groundAt(position);
    if (height > ground) position.setLength(height);
    else {
      // Down.
      chute = false;
      canopy = 0;
      spread = 0;
      airborne = false;
      motion.set(0, 0, 0);
      velocity.set(0, 0, 0);
      position.setLength(ground);
      world.onTouchdown?.(-vertical);
      vertical = 0;
      avatar.land(0.4);
    }
    // The fall's pose, and the body swung about the hands under the canopy.
    swingUnder(swing, dt, motion.length(), lean, spread);
    trailOf(swing, lean, spread, trail);
    if (chute) avatar.skydive(dt, spread, steering, CHUTE_GRIP, CHUTE_PULL, trail);
    avatar.group.position.copy(position);
    orient(avatar.group, UP.copy(position).normalize(), facing);
    if (chute) {
      const pivot = CHUTE_GRIP[1] * spread;
      swingEuler.set(swing.pitch * spread, 0, lean + (swing.roll - lean) * spread);
      swung.setFromEuler(swingEuler);
      hangFrom.set(0, pivot, 0).applyQuaternion(swung);
      hangFrom.set(-hangFrom.x, pivot - hangFrom.y, -hangFrom.z).applyQuaternion(avatar.group.quaternion);
      avatar.group.quaternion.multiply(swung);
      avatar.group.position.add(hangFrom);
    }
    drawCanopy();
  }

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
    get parachute() {
      return chute;
    },
    get canopy() {
      return chute && canopy > 0;
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
            // descend key alone, as Earth's plane does (the lander, the
            // saucer); anything else sinks on either.
            descend: c.boosts ? input.dive : input.dive || input.run,
            boost: input.run,
          },
          world.groundAt,
          gravity,
          world.radius,
        );
        // Walls, as on Earth: a vehicle on the ground or low over it is
        // pushed out of buildings, outposts, towers and other craft, and
        // loses its way into them; well clear of the ground nothing stands.
        const clear = c.position.length() - (world.radius + world.groundAt(c.position));
        if (clear < CRAFT_WALLS_UNDER && world.collide(c.position, c.radius * 0.8)) {
          c.speed *= -0.2;
          c.object.position.copy(c.position);
        }
        position.copy(c.position);
        facing.copy(c.heading);
        // Standing in a basket, as a balloon's crew do on Earth; else seated
        // as the craft's seat says, the legs to its pedals and the hands on
        // what it is steered by, turned with it (`Craft.pose`, `Craft.turn`).
        if (c.standing) avatar.stride(dt, 0, false);
        else avatar.sit(dt, c.pose ?? undefined, c.turn);
        avatar.group.position.copy(c.seat);
        avatar.group.quaternion.identity();
        return;
      }
      if (chute) {
        glide(dt, input, steer);
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
      WAS_FACING.copy(facing);
      if (want.lengthSq() > 0.01) facing.lerp(want.clone().normalize(), Math.min(1, dt * 10)).normalize();
      // What the body is told on top of its speed, as on Earth: how fast it
      // turns, and where the camera looks from its facing, which the head and
      // chest turn towards while it stands.
      cues.turn = dt > 0 ? angleAbout(WAS_FACING, facing, up) / dt : 0;
      cues.look = angleAbout(facing, forward, up);

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
      avatar.stride(dt, horizontal, airborne, cues);
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
      // Whatever fall was under way is over: no canopy left hanging in the sky.
      chute = false;
      canopy = 0;
      spread = 0;
      if (parachute !== null) parachute.visible = false;
      velocity.set(0, 0, 0);
      vertical = 0;
      airborne = false;
      avatar.emote(null);
      home = avatar.group.parent;
      next.object.add(avatar.group);
      avatar.group.userData.pilot = true;
      // Seen through the glass of a closed craft (`cockpit.ts`), and over the
      // side of an open one; hidden only in a hull no seated body fits.
      avatar.group.visible = !next.closed;
      avatar.group.position.copy(next.seat);
      avatar.group.quaternion.identity();
    },
    leave() {
      if (craft === null) return;
      const c = craft;
      craft = null;
      c.object.remove(avatar.group);
      avatar.group.userData.pilot = false;
      home?.add(avatar.group);
      avatar.group.visible = true;
      const up = UP.copy(c.position).normalize();
      const side = RIGHT.crossVectors(c.heading, up).normalize();
      const from = c.position.length();
      position.copy(c.position).addScaledVector(side, -(c.radius + 1.6));
      facing.copy(c.heading);
      vertical = 0;
      avatar.reset();
      const ground = world.radius + world.groundAt(position);
      if (c.airborne && from - ground > BAIL_HEIGHT) {
        // Out of an aircraft in flight: over the side and falling, going the
        // way it was; the craft, let go of, comes down by itself and parks.
        position.setLength(Math.max(from, ground + 1));
        motion.copy(c.heading).multiplyScalar(Math.max(0, c.speed) * BAIL_CARRY);
        velocity.copy(motion);
        airborne = true;
        chute = true;
        canopy = 0;
        spread = 0;
        steering = 0;
        return;
      }
      position.setLength(ground);
      airborne = false;
    },
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
      vertical = 0;
      airborne = false;
      chute = false;
      canopy = 0;
      spread = 0;
      if (parachute !== null) parachute.visible = false;
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
