import type { ClipName, Person } from '../cast.ts';
import { RUN_SPEED, RUN_STRIDE, WALK_SPEED, WALK_STRIDE } from './gait.ts';
import { approach, clamp, mix, smoothstep } from './maths.ts';
import { GESTURE_MOVES, bone, clipsOf } from './motion-clips.ts';
import { BLEND_RATE, FALL_AFTER, FALL_RATE, IDLE_EVERY, IDLE_WAIT, LAND_SOFT, LOOK_FADE, LOOK_LIMIT, LOOK_RATE, MAX_PITCH, PITCH_GAIN, SHIFT_HOLD, SHIFT_RATE, SWEEP_REACH, SWEEP_TIME, SWIM_BLEND_RATE, SWIM_STROKE, TURN_CADENCE, TURN_STEP_RATE, TURN_STEP_SHARE, UNDER_CADENCE, swimCadence } from './motion-config.ts';
import { aim, apply, blend, dropGesture, emote, unlay } from './motion-layers.ts';
import { createState, type MotionState } from './motion-state.ts';
import type { Motion, MotionCues } from './motion-types.ts';

export function foot(s: MotionState, dt: number, speed: number, airborne: boolean, cues?: MotionCues): void {
  s.person.root.position.set(0, 0, 0);
  const running = clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
  // Half a walk is already walking: below that the legs would shuffle.
  const moving = clamp(speed / (WALK_SPEED * 0.5), 0, 1);
  const turning = Math.abs(cues?.turn ?? 0);
  const stepping = airborne ? 0 : (1 - moving) * clamp(turning / TURN_STEP_RATE, 0, 1) * TURN_STEP_SHARE;
  if (s.gesture !== null && (airborne || speed > WALK_SPEED * GESTURE_MOVES)) s.gesture = null;
  const length = mix(WALK_STRIDE, RUN_STRIDE, running);
  const way = cues?.back === true ? -1 : 1;
  s.phase = (((s.phase + (way * speed * dt) / length + stepping * TURN_CADENCE * dt) % 1) + 1) % 1;
  const up = airborne ? 1 : 0;
  // A jump starts its loop from the take-off, not wherever the clock left it.
  if (airborne && s.weights.air < 0.02) s.clips.air.time = 0;
  s.airTime = airborne ? s.airTime + dt : 0;
  s.stillTime = !airborne && speed < 0.1 && stepping < 0.05 ? s.stillTime + dt : 0;
  s.landDamp = 1 - 0.6 * moving;

  // Standing a while: a weight shift, then a look round, in turn.
  let shiftWanted = 0;
  let sweep = 0;
  if (s.stillTime > IDLE_WAIT) {
    const t = s.stillTime - IDLE_WAIT;
    const turn = Math.floor(t / IDLE_EVERY);
    const u = t - turn * IDLE_EVERY;
    if (turn % 2 === 0) shiftWanted = u < SHIFT_HOLD ? 1 : 0;
    else if (u < SWEEP_TIME) sweep = Math.sin((u / SWEEP_TIME) * Math.PI * 2) * SWEEP_REACH;
  }
  s.shift += (shiftWanted - s.shift) * approach(SHIFT_RATE, dt);

  const standing = (1 - moving) * (1 - up);
  blend(s, dt, BLEND_RATE, aim(s, 
    standing * (1 - stepping),
    (moving * (1 - running) + (1 - moving) * stepping) * (1 - up),
    moving * running * (1 - up),
    up,
    0,
    0,
  ));

  // The head and chest towards the camera's look, standing.
  const asked = cues?.look ?? 0;
  const lookWanted =
    clamp(asked, -LOOK_LIMIT, LOOK_LIMIT) * (1 - smoothstep(Math.abs(asked), LOOK_FADE[0], LOOK_FADE[1])) * standing + sweep;
  s.look += (clamp(lookWanted, -LOOK_LIMIT, LOOK_LIMIT) - s.look) * approach(LOOK_RATE, dt);

  const falling = airborne && s.airTime > FALL_AFTER ? 1 : 0;
  s.fall += (falling - s.fall) * approach(falling > s.fall ? 4 : 12, dt);
  s.flail = (s.flail + dt * FALL_RATE) % 1;

  if (dt > 0) s.accel += ((speed - s.lastSpeed) / dt - s.accel) * approach(6, dt);
  s.lastSpeed = speed;
  const pitchWanted = clamp(s.accel * PITCH_GAIN, -MAX_PITCH, MAX_PITCH) * (1 - up);
  s.pitch += (pitchWanted - s.pitch) * approach(8, dt);
  s.person.root.rotation.set(s.pitch, 0, 0);
  apply(s, dt);
}

/** Everything the foot's extras carry, let go at once: afloat and seated they mean nothing. */
export function settle(s: MotionState): void {
  s.gesture = null;
  s.airTime = 0;
  s.stillTime = 0;
  s.fall = 0;
  s.look = 0;
  s.pitch = 0;
  s.accel = 0;
  s.shift = 0;
  s.person.root.position.set(0, 0, 0);
  s.person.root.rotation.set(0, 0, 0);
}

export function swim(s: MotionState, dt: number, speed: number, under = 0): void {
  settle(s);
  s.lastSpeed = speed;
  s.landAt = Infinity;
  s.stroke = (s.stroke + swimCadence(speed) * (1 - (1 - UNDER_CADENCE) * under) * dt) % 1;
  // Most of a crawl by a third of an easy pace, treading water under it;
  // under the surface a little of the treading stays in, which is the legs
  // kicking under a long pull.
  const paddling = smoothstep(speed, 0.2, SWIM_STROKE * 0.25) * (1 - 0.2 * under);
  blend(s, dt, SWIM_BLEND_RATE, aim(s, 0, 0, 0, 0, paddling, 1 - paddling));
  apply(s, dt);
}

export function still(s: MotionState, dt: number, rate = 1): void {
  settle(s);
  s.lastSpeed = 0;
  blend(s, dt * rate, BLEND_RATE, aim(s, 1, 0, 0, 0, 0, 0));
  apply(s, dt);
}

export function land(s: MotionState, hardness: number): void {
  const hard = clamp(hardness, 0, 1);
  s.landAt = 0;
  s.landPeak = mix(LAND_SOFT, 1, hard);
  s.landRate = mix(1.6, 1, hard);
  s.clips.land.time = 0;
}

export function rebind(s: MotionState, next: Person): void {
  unlay(s);
  const old = s.clips;
  s.person = next;
  s.clips = clipsOf(next);
  // The clocked clips take up where they were; the rest are written every frame.
  s.clips.idle.time = old.idle.time;
  s.clips.shift.time = old.shift.time;
  s.clips.air.time = old.air.time;
  s.clips.tread.time = old.tread.time;
  s.head = bone(next, 'Head');
  s.chest = bone(next, 'Chest');
  s.arms = [bone(next, 'UpperArm.L'), bone(next, 'UpperArm.R')] as const;
  // A gesture goes on in the new clothes where it was.
  if (s.gestureAction !== null) {
    const clip = s.gestureAction.getClip().name as ClipName;
    s.gestureAction.setEffectiveWeight(0);
    s.gestureAction.stop();
    s.gestureAction = null;
    const action = next.actions.get(clip);
    if (action !== undefined) {
      action.reset().play();
      action.timeScale = 0;
      s.gestureAction = action;
    } else s.gesture = null;
  }
  s.person.root.rotation.set(s.pitch, 0, 0);
  apply(s, 0);
}

export function reset(s: MotionState): void {
  s.phase = 0;
  s.stroke = 0;
  s.landAt = Infinity;
  s.lastSpeed = 0;
  aim(s, 1, 0, 0, 0, 0, 0);
  Object.assign(s.weights, s.target);
  s.person.mixer.setTime(0);
  settle(s);
  dropGesture(s);
  foot(s, 0, 0, false);
}

/**
 * The motion of one person, played by speed. The clips are weighted by hand
 * and written each frame; `person.root` is the motion's to place.
 */
export function createMotion(first: Person): Motion {
  const s = createState(first);
  reset(s);
  return {
    get person() {
      return s.person;
    },
    get phase() {
      return s.phase;
    },
    get stroke() {
      return s.stroke;
    },
    foot: (dt, speed, airborne, cues) => foot(s, dt, speed, airborne, cues),
    swim: (dt, speed, under) => swim(s, dt, speed, under),
    still: (dt, rate) => still(s, dt, rate),
    land: (hardness) => land(s, hardness),
    rebind: (next) => rebind(s, next),
    // A person going back to the pool takes no gesture with it.
    unlay: () => {
      unlay(s);
      dropGesture(s);
    },
    reset: () => reset(s),
    emote: (name) => emote(s, name),
    get emoting() {
      return s.gesture;
    },
  };
}
