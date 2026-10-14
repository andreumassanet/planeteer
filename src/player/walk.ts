/**
 * On foot, and afloat on the surface: the stick points at the world, not at the avatar.
 */
import { RUN_SPEED, WALK_SPEED } from '../avatar.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { WATERLINE, isWater } from '../vehicles.ts';
import {
  ACCELERATION_TIME,
  AIR_CONTROL,
  BODY_RADIUS,
  CLIMB_SLOPE,
  JUMP_SPEED,
  LEAN_GAIN,
  LEAN_SMOOTHING,
  MAX_LEAN,
  STEP_DOWN,
  STEP_UP,
  SWIM_ACCELERATION_TIME,
  SWIM_CLIMB_OUT,
  SWIM_OUT,
  SWIM_SPEED,
  SWIM_SPRINT,
  TURN_SMOOTHING,
  UNDER_FROM,
} from './constants.ts';
import { approach, clamp } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';
import type { WallChecks } from './walls.ts';
import type { Swim } from './swim.ts';

export function createWalk(core: PlayerCore, frame: Frame, wallSet: WallChecks, swim: Swim) {
  const {
    cues,
    direction,
    forward,
    heading,
    motion,
    moved,
    options,
    position,
    side,
    standingRadius,
    target,
    up,
    wish,
  } = core;
  const s = core.fields;
  const { angleAbout, settle, travel, undo } = frame;
  const { throughWalls, walls } = wallSet;
  const { diveOn, enterWater } = swim;

  /** One frame on foot or swimming at the surface. */
  function walk(dt: number, input: PlayerInput): void {
    const swimming = s.state === 'swim';
    // Movement is relative to the camera, which is the whole difference
    // between this and tank controls: the stick points at the world, not at
    // the avatar.
    heading.copy(input.heading).projectOnPlane(up);
    if (heading.lengthSq() < 1e-8) heading.copy(forward);
    heading.normalize();
    // Screen right. `up x heading` is the other one, and it points left.
    side.crossVectors(heading, up).normalize();

    wish.set(0, 0, 0).addScaledVector(heading, input.move.y).addScaledVector(side, input.move.x);
    const amount = Math.min(1, wish.length());
    if (amount > 1e-4) wish.divideScalar(wish.length());
    else wish.set(0, 0, 0);

    const top = swimming ? (input.run ? SWIM_SPRINT : SWIM_SPEED) : input.run ? RUN_SPEED : WALK_SPEED;
    target.copy(wish).multiplyScalar(top * amount);
    motion.projectOnPlane(up);
    const time = swimming ? SWIM_ACCELERATION_TIME : ACCELERATION_TIME;
    motion.lerp(target, approach((s.airborne ? AIR_CONTROL : 1) / time, dt));
    s.velocity = motion.length();
    // Otherwise the exponential leaves a millimetre per second of drift for ever.
    if (s.velocity < 0.05 && amount === 0) {
      motion.set(0, 0, 0);
      s.velocity = 0;
    }

    // No jumping out of the water: there is nothing to push off.
    if (input.jump && !s.airborne && !swimming) {
      s.vertical = JUMP_SPEED;
      s.airborne = true;
    }

    // What the frame actually moves: the motion, or in a town what the walls
    // leave of it. `velocity` is read again afterwards, so a man pressed flat
    // against a wall reports standing still and his walk cycle stops with him.
    moved.copy(motion).multiplyScalar(dt);
    let walled = false;
    if (walls !== null) {
      walled = throughWalls(dt, walls, BODY_RADIUS);
      s.velocity = motion.length();
    }
    const distance = travel();
    if (s.velocity > 1e-4) direction.copy(motion).divideScalar(s.velocity);

    // The body turns towards where it is going rather than being turned by
    // the keys, so a change of direction is a curve and not a snap. Against a
    // wall there is no going, and it turns to face where the stick is pushing.
    let turn = 0;
    const facing = s.velocity > 1e-3 ? direction : walled ? wish : null;
    if (facing !== null && amount > 1e-4) {
      turn = angleAbout(forward, facing, up) * approach(TURN_SMOOTHING, dt);
      forward.applyAxisAngle(up, turn).normalize();
    }
    cues.turn = dt > 0 ? turn / dt : 0;
    cues.look = angleAbout(forward, heading, up);
    const leanTarget = dt > 0
      ? clamp((-turn / dt) * s.velocity * LEAN_GAIN, -MAX_LEAN, MAX_LEAN)
      : 0;
    s.lean += (leanTarget - s.lean) * approach(LEAN_SMOOTHING, dt);

    let ground = standingRadius(position);

    if (swimming) {
      // Out of the water where the bank is one a person can climb, and against
      // it where it is not: a quay is a wall from the sea as it is from the
      // street. Well over `isWater`'s line, so the two cannot flicker. Under
      // the surface every bank is a wall: a diver comes up before he climbs.
      if (ground > PLANET_RADIUS + SWIM_OUT) {
        if (s.dive > UNDER_FROM || ground - (PLANET_RADIUS + WATERLINE) > SWIM_CLIMB_OUT) {
          undo();
          s.velocity = 0;
        } else {
          s.state = 'foot';
          s.dive = 0;
          s.diveRate = 0;
          s.height = ground;
          position.setLength(s.height);
          options.onEvent?.('ashore', 0);
          return;
        }
      }
      diveOn(dt);
      s.height = PLANET_RADIUS + WATERLINE - s.dive;
      position.setLength(s.height);
      return;
    }

    // A rise no stair and no hillside makes is a wall: see `STEP_UP`.
    if (distance > 1e-9 && ground - s.height > STEP_UP + distance * CLIMB_SLOPE) {
      undo();
      s.velocity = 0;
      ground = standingRadius(position);
    }
    settle(dt, ground, STEP_DOWN, distance);

    // Walk into the sea, or fall into a lake, and you swim. That is the whole
    // entry: no key and no jetty, and no way left to walk on water.
    if (!s.airborne && isWater(ground)) enterWater();
  }

  return { walk };
}

export type Walk = ReturnType<typeof createWalk>;
