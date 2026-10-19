/**
 * On foot, and afloat on the surface: the stick points at the world, not at the avatar.
 */
import * as THREE from 'three';
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
  MOVE_STEP,
  STEP_DOWN,
  STEP_UP,
  SWIM_ACCELERATION_TIME,
  SWIM_CLIMB_OUT,
  SWIM_DEPTH,
  SWIM_OUT,
  SWIM_SPEED,
  SWIM_SPRINT,
  TURN_SMOOTHING,
  UNDER_FROM,
  WADE_JUMP,
  WADE_RISE,
  WADE_SLOW,
} from './constants.ts';

/** How far a body that keeps to the gaze turns off it into a sidestep. */
const GAZE_TURN = Math.PI / 3;
/** `along` (the way's cosine off the gaze) under which a walk becomes a backing, and over which it ends. */
const BACK_ENTER = -0.2;
const BACK_LEAVE = 0.05;
/**
 * In third person a push back backs the body up facing the camera's way for
 * this long, seconds, and then it turns round and walks the way it is pushed;
 * a push lighter than `BACK_SLOW_PUSH` (a stick barely tilted) backs for as
 * long as it lasts. Running turns round at once.
 */
const BACK_TURN_AFTER = 0.8;
const BACK_SLOW_PUSH = 0.5;
/** A body backing up in third person goes at this share of its pace. */
const BACK_PACE = 0.6;
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
  const floorAt = options.seaFloorAt;
  /** Where a body that keeps to the gaze faces while it goes. */
  const gazeFacing = new THREE.Vector3();
  /** Backing rather than walking, held between two thresholds so a sidestep cannot flicker. */
  let backing = false;
  /** How long the push has been backwards, seconds; 0 while it is not. */
  let backHeld = 0;
  const surface = PLANET_RADIUS + WATERLINE;

  /** How deep the water stands over the sea floor at a point, 0 on the land or with no floor to ask. */
  function waterDepth(at: THREE.Vector3, ground: number): number {
    if (floorAt === undefined || !isWater(ground)) return 0;
    return Math.max(0, surface - floorAt(at));
  }

  /**
   * What a foot stands on: the land or what is built on it, and in the water
   * the sea floor, down to where a swimmer's soles hang, past which it floats.
   */
  function footing(at: THREE.Vector3): number {
    const ground = standingRadius(at);
    if (floorAt === undefined || !isWater(ground)) return ground;
    return Math.max(floorAt(at), surface - SWIM_DEPTH);
  }

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
    // In third person a short or light push back is a step back facing the
    // view; held, the body turns round and walks towards the camera.
    const pushedBack = amount > 1e-4 && wish.dot(heading) < BACK_ENTER;
    backHeld = pushedBack ? backHeld + dt : 0;
    const stepsBack = !s.eyeInHead && !swimming && !input.run && pushedBack && (backHeld < BACK_TURN_AFTER || amount < BACK_SLOW_PUSH);

    // Wading, the water holds the legs back the deeper it is.
    const wading = swimming ? 0 : waterDepth(position, standingRadius(position));
    const slowed = 1 - (1 - WADE_SLOW) * clamp(wading / SWIM_DEPTH, 0, 1);
    const top = swimming ? (input.run ? SWIM_SPRINT : SWIM_SPEED) : (input.run ? RUN_SPEED : WALK_SPEED) * slowed * (stepsBack ? BACK_PACE : 1);
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

    // No jumping out of the water: there is nothing to push off, nor much
    // to push against wading in it.
    if (input.jump && !s.airborne && !swimming && wading < WADE_JUMP) {
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
    // With the eye in the head, a body standing still turns with the gaze, so
    // looking down finds it facing the way you look.
    let turn = 0;
    const gaze = s.eyeInHead && s.velocity <= 1e-3 && !walled;
    let facing = s.velocity > 1e-3 ? direction : walled ? wish : gaze ? heading : null;
    // With the eye in the head the body keeps to the gaze while it goes: it
    // leans into a sidestep, no further than `GAZE_TURN`, and backs away
    // rather than turning its back on the view. In third person it does so
    // only while it steps back.
    if ((s.eyeInHead || stepsBack) && !swimming && facing !== null && facing !== heading) {
      const along = facing.dot(heading);
      backing = backing ? along < BACK_LEAVE : along < BACK_ENTER;
      gazeFacing.copy(facing);
      if (backing) gazeFacing.negate();
      const off = clamp(angleAbout(heading, gazeFacing, up), -GAZE_TURN, GAZE_TURN);
      facing = gazeFacing.copy(heading).applyAxisAngle(up, off);
    } else backing = false;
    cues.back = backing && s.velocity > 1e-3;
    if (facing !== null && (amount > 1e-4 || gaze)) {
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
      // Onto the feet where the sea floor comes up within reach of them, the
      // body kept where it hung: it settles onto the floor over a moment.
      if (floorAt !== undefined && s.dive <= UNDER_FROM && isWater(ground) && waterDepth(position, ground) < SWIM_DEPTH - WADE_RISE) {
        const bed = floorAt(position);
        s.state = 'foot';
        s.sink = Math.max(0, bed - (s.height - s.sink));
        s.dive = 0;
        s.diveRate = 0;
        s.height = bed;
        position.setLength(s.height);
        options.onEvent?.('ashore', 0);
        return;
      }
      diveOn(dt);
      s.height = PLANET_RADIUS + WATERLINE - s.dive;
      position.setLength(s.height);
      return;
    }

    if (floorAt !== undefined) ground = footing(position);
    // A rise no stair and no hillside makes is a wall: see `STEP_UP`.
    if (distance > 1e-9 && ground - s.height > STEP_UP + Math.max(distance, s.velocity * MOVE_STEP) * CLIMB_SLOPE) {
      undo();
      s.velocity = 0;
      ground = floorAt === undefined ? standingRadius(position) : footing(position);
    }
    settle(dt, ground, STEP_DOWN, distance);

    // Walk into the sea, or fall into a lake, and you swim. That is the whole
    // entry: no key and no jetty, and no way left to walk on water. With a sea
    // floor to stand on, the body wades in first and swims where the water is
    // as deep as a swimmer hangs, from where its soles are.
    if (s.airborne) return;
    if (floorAt === undefined) {
      if (isWater(ground)) enterWater();
    } else if (waterDepth(position, standingRadius(position)) >= SWIM_DEPTH) enterWater(s.height);
  }

  return { walk };
}

export type Walk = ReturnType<typeof createWalk>;
