/**
 * Out of an aircraft: free fall, the canopy, and landing.
 */
import {
  CANOPY_OPENING,
  CHUTE_FORCED,
  CHUTE_GLIDE,
  CHUTE_GLIDE_RATE,
  CHUTE_PACE,
  CHUTE_SINK,
  CHUTE_SINK_RATE,
  CHUTE_SWING,
  CHUTE_TURN,
  FREEFALL_DIVE,
  FREEFALL_MIN,
  FREEFALL_RATE,
  FREEFALL_TRACK,
  buildParachute,
  openCanopy,
  swingUnder,
} from '../craft/parachute.ts';
import { isWater } from '../vehicles.ts';
import { AIR_LOW, BODY_RADIUS, SWIM_DEPTH } from './constants.ts';
import { approach, levers } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';
import type { WallChecks } from './walls.ts';
import type { Swim } from './swim.ts';

export function createChute(core: PlayerCore, frame: Frame, wallSet: WallChecks, swim: Swim) {
  const {
    avatar,
    chuteSwing,
    cues,
    forward,
    heading,
    motion,
    moved,
    object,
    options,
    position,
    side,
    standingRadius,
    stick,
    target,
    up,
    wish,
  } = core;
  const s = core.fields;
  const { travel } = frame;
  const { airWalls, throughWalls } = wallSet;
  const { enterWater } = swim;

  /**
   * Falling from an aircraft, and under a canopy. The jump key opens the canopy
   * and stows it again over `CHUTE_FORCED`; under it the keys steer rather than
   * walk. Down on the ground the body stands, and on the water it swims.
   */
  function glide(dt: number, input: PlayerInput): void {
    const over = position.length() - standingRadius(position);
    if (input.jump && over > CHUTE_FORCED) s.canopy = s.canopy > 0 ? 0 : 1e-3;
    if (s.canopy === 0 && over <= CHUTE_FORCED) s.canopy = 1e-3;
    const open = s.canopy > 0;
    if (open) s.canopy += dt;
    // How much of the pose is the canopy's: filling as it opens out, gone at once when stowed.
    s.spread += ((open ? 1 : 0) - s.spread) * approach(open ? 1 / CANOPY_OPENING : 8, dt);
    levers(input.move, stick);
    let fall: number;
    if (open) {
      s.steering += (stick.x - s.steering) * approach(3, dt);
      forward.applyAxisAngle(up, -s.steering * CHUTE_TURN * dt).normalize();
      const pace = 1 + CHUTE_PACE * stick.y;
      target.copy(forward).multiplyScalar((CHUTE_GLIDE + over * CHUTE_GLIDE_RATE) * pace);
      motion.lerp(target, approach(1.5, dt));
      // Half as much steeper as faster: a canopy flown hard sinks a little more.
      fall = (CHUTE_SINK + over * CHUTE_SINK_RATE) * (1 + CHUTE_PACE * 0.5 * stick.y);
    } else {
      // Tracked across the ground like a walk, towards the camera's way, and
      // facing where the camera looks.
      heading.copy(input.heading).projectOnPlane(up);
      if (heading.lengthSq() < 1e-8) heading.copy(forward);
      heading.normalize();
      side.crossVectors(heading, up).normalize();
      wish.set(0, 0, 0).addScaledVector(heading, input.move.y).addScaledVector(side, input.move.x);
      if (wish.lengthSq() > 1) wish.normalize();
      motion.lerp(target.copy(wish).multiplyScalar(FREEFALL_TRACK), approach(1.2, dt));
      forward.lerp(heading, approach(4, dt)).projectOnPlane(up).normalize();
      s.steering += (input.move.x - s.steering) * approach(3, dt);
      fall = Math.max(FREEFALL_MIN, over * FREEFALL_RATE) * (input.move.y > 0 ? FREEFALL_DIVE : 1);
    }
    s.vertical += (-fall - s.vertical) * approach(open ? 2 : 4, dt);
    motion.projectOnPlane(up);
    moved.copy(motion).multiplyScalar(dt);
    if (airWalls !== null) {
      s.airHeight = position.length();
      s.airLow = over < AIR_LOW;
      s.airEnvelope = 0;
      throughWalls(dt, airWalls, BODY_RADIUS);
    }
    travel();
    s.speed = motion.length();
    s.velocity = s.speed;
    cues.turn = 0;
    cues.look = 0;
    cues.back = false;
    s.lean = open ? s.steering * CHUTE_SWING : 0;
    s.height = position.length() + s.vertical * dt;
    const ground = standingRadius(position);
    if (s.height > ground) {
      position.setLength(s.height);
      return;
    }
    // Down.
    s.chute = false;
    s.canopy = 0;
    s.spread = 0;
    s.airborne = false;
    s.speed = 0;
    motion.set(0, 0, 0);
    if (isWater(ground)) {
      enterWater();
      s.sink = SWIM_DEPTH;
    } else {
      s.height = ground;
      position.setLength(s.height);
      options.onTouchdown?.(-s.vertical);
      avatar.land(0.4);
    }
    s.vertical = 0;
  }

  /** The pendulum under the canopy: `swingUnder` in `craft/parachute.ts`. */
  function swingChute(dt: number): void {
    swingUnder(chuteSwing, dt, s.speed, s.lean, s.spread);
  }

  /** The canopy over the body while it is open: opening out, and swinging with a turn. */
  function drawCanopy(): void {
    if (!s.chute || s.canopy === 0) {
      if (s.parachute !== null) s.parachute.visible = false;
      return;
    }
    if (s.parachute === null) {
      s.parachute = buildParachute();
      object.add(s.parachute);
    }
    s.parachute.visible = true;
    // The wing holds the bank and leans a little into the pilot's own swing;
    // its toggle lines follow the hands down.
    openCanopy(s.parachute, s.canopy, s.lean + (chuteSwing.roll - s.lean) * 0.3, s.steering, chuteSwing.pitch * 0.3);
  }

  return { glide, swingChute, drawCanopy };
}

export type Chute = ReturnType<typeof createChute>;
