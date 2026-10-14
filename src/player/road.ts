/**
 * Vehicles on wheels or hooves: a car on the road, a horse, a taxiing plane.
 */
import { AVATAR_HEIGHT } from '../avatar.ts';
import type { CraftModel } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import {
  CRASH_SPEED,
  FOUNDER_DRAG,
  WATERLINE,
  founderDepth,
  founderNose,
  founders,
  isWater,
} from '../vehicles.ts';
import type { RoadHandling } from '../vehicles.ts';
import { CRASH_QUIET, HORSE_JUMP_SPEED, LEAN_EASE, MAX_NOSE, TILT_SMOOTHING } from './constants.ts';
import { approach, clamp, levers, mix } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';
import type { WallChecks } from './walls.ts';
import type { Splash } from './splash.ts';

export function createRoad(core: PlayerCore, frame: Frame, wallSet: WallChecks, ring: Splash) {
  const { collide, forward, motion, moved, options, position, probe, pushed, standingRadius, stick, up } = core;
  const s = core.fields;
  const { pointAhead, settle, travel, undo } = frame;
  const { throughWalls, walls } = wallSet;
  const { craftSplash, spray } = ring;

  /**
   * A vehicle on wheels, moved one frame at `speed` along its bow. Stopped by the
   * water's edge, by a wall (its own width against the buildings and whatever is
   * parked, and its bumper against them too) and by a rise it cannot climb, which is
   * a kerb's worth plus the angle of repose over the distance covered.
   *
   * A wall is a knock, not a full stop: a car driven into one comes back off it at
   * the handling's `bounce` of the speed it hit at, and one scraped along it loses
   * what the wall took; either, past `CRASH_SPEED`, is a `crashed` event. The
   * water's edge and a riser are not walls anybody hits: the car simply stops.
   */
  function rollOn(dt: number, model: CraftModel, width: number, handling: RoadHandling): void {
    const half = model.size[0] / 2;
    // In the water its way dies whatever the keys say, and it goes nowhere it is steered.
    const swamps = founders(model.kind, model.medium);
    if (s.founder >= 0) {
      s.founderWay *= Math.exp(-dt / FOUNDER_DRAG);
      s.speed = s.founderWay;
    }
    const hitAt = s.speed;
    motion.copy(forward).multiplyScalar(s.speed);
    moved.copy(motion).multiplyScalar(dt);
    let scraped = false;
    if (walls !== null) {
      scraped = throughWalls(dt, walls, width);
      // Whatever the walls took off the motion is taken off the speed: a
      // car driven into a wall at an angle scrapes along it, and one driven
      // into it square stops.
      s.speed = motion.dot(forward);
    }
    const distance = travel();
    // The bumper, on the side the car is going.
    pointAhead(forward, (hitAt >= 0 ? half : -half) / position.length(), probe);
    let blocked = !swamps && isWater(standingRadius(probe));
    let struck = false;
    if (!blocked && collide !== undefined && collide(probe, width * 0.8, pushed)) blocked = struck = true;
    let ground = standingRadius(position);
    if (!blocked) blocked = !swamps && isWater(ground);
    // In the air as on the ground, as `walk` keeps it: a riser over the wheels
    // (or a horse's hooves) mid-jump is still a wall.
    if (!blocked && distance > 1e-9) blocked = ground - s.height > handling.step + distance * handling.slope;
    if (blocked) {
      undo();
      s.speed = struck ? -hitAt * handling.bounce : 0;
      ground = standingRadius(position);
    }
    const lost = Math.abs(hitAt) - Math.abs(s.speed);
    if ((struck || scraped) && lost > CRASH_SPEED && s.sinceCrash >= CRASH_QUIET) {
      s.sinceCrash = 0;
      options.onEvent?.('crashed', lost);
    }
    // Into the water, off a quay or down a beach: it floats a moment and goes
    // down nose first (`founderDepth`), and `sunk` says when it has gone.
    if (swamps && !s.airborne && isWater(ground)) {
      if (s.founder < 0) {
        s.founder = 0;
        s.founderWay = s.speed;
        spray(PLANET_RADIUS + WATERLINE, craftSplash());
        options.onEvent?.('foundered', Math.abs(s.speed));
      } else s.founder += dt;
      s.height = PLANET_RADIUS + WATERLINE - founderDepth(s.founder);
      position.setLength(s.height);
      s.tilt = founderNose(s.founder);
      s.velocity = Math.abs(s.speed);
      return;
    }
    // Washed back onto the shore before it went under: on its wheels again.
    s.founder = -1;
    settle(dt, ground, AVATAR_HEIGHT, distance);
    s.velocity = Math.abs(s.speed);

    // The nose follows the ground under the two axles.
    if (!s.airborne) {
      pointAhead(forward, half / position.length(), probe);
      const front = standingRadius(probe);
      pointAhead(forward, -half / position.length(), probe);
      const back = standingRadius(probe);
      const wanted = -clamp(Math.atan2(front - back, 2 * half), -MAX_NOSE, MAX_NOSE);
      s.tilt += (wanted - s.tilt) * approach(TILT_SMOOTHING, dt);
    }
  }

  /**
   * Steering on wheels: the wheel goes over in the handling's `steerTime`, full
   * lock from its `gripSpeed` easing to its `fastLock` of it flat out, and reversed
   * going backwards. A car has no turn standing still; a horse keeps its `pivot` of it.
   */
  function steerWheels(dt: number, handling: RoadHandling): void {
    s.steering += (stick.x - s.steering) * approach(1 / handling.steerTime, dt);
    if (stick.x === 0 && Math.abs(s.steering) < 1e-3) s.steering = 0;
    const grip = Math.max(handling.pivot, clamp(Math.abs(s.speed) / handling.gripSpeed, 0, 1));
    const lock = mix(1, handling.fastLock, clamp(Math.abs(s.speed) / handling.boost, 0, 1));
    const turn = s.airborne ? 0 : -s.steering * handling.turn * grip * lock * (s.speed < 0 ? -1 : 1) * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    s.turnRate = dt > 0 ? turn / dt : 0;
  }

  /** One frame of driving a road vehicle: the wheel, the throttle and brake, and a horse's jump. */
  function drive(dt: number, input: PlayerInput, model: CraftModel, handling: RoadHandling): void {
    levers(input.move, stick);
    steerWheels(dt, handling);
    // Off anything made — a road, a town's paving — only a vehicle built for
    // it keeps its pace (`rough`); without the made ground to ask, it does.
    const made = options.madeHeightAt === undefined || handling.rough >= 1 || options.madeHeightAt(position) > 0;
    const top = (input.run ? handling.boost : handling.speed) * (made ? 1 : handling.rough);
    let wanted = 0;
    let time = handling.coastTime;
    if (stick.y > 0) {
      wanted = top * stick.y;
      time = s.speed < -0.5 ? handling.brakeTime : handling.accelerationTime;
    } else if (stick.y < 0) {
      // `S` is the brake while the car is going forward, and reverse once it
      // has stopped, which is every arcade car's rule.
      wanted = s.speed > 0.5 ? 0 : handling.reverse * stick.y;
      time = s.speed > 0.5 ? handling.brakeTime : handling.accelerationTime;
    }
    const before = s.speed;
    if (!s.airborne) s.speed += (wanted - s.speed) * approach(1 / time, dt);
    if (stick.y === 0 && Math.abs(s.speed) < 0.05) s.speed = 0;
    // A horse jumps: `Space` on the ground sends it up, the way it was going.
    if (model.kind === 'horse' && input.jump && !s.airborne) {
      s.vertical = HORSE_JUMP_SPEED;
      s.airborne = true;
    }
    rollOn(dt, model, model.size[1] / 2, handling);
    // How hard it is pulling away, for a motorbike's front wheel.
    const pulling = dt > 0 ? (s.speed - before) / dt : 0;
    s.surge += (pulling - s.surge) * approach(LEAN_EASE, dt);
  }

  return { rollOn, steerWheels, drive };
}

export type Road = ReturnType<typeof createRoad>;
