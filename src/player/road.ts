/**
 * Vehicles on wheels or hooves: a car on the road, a horse, a taxiing plane.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../avatar.ts';
import type { CraftModel } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import {
  CRASH_SPEED,
  DRIFT_BOOST_KICK,
  DRIFT_BOOST_PUNCH,
  FOUNDER_DRAG,
  HANDBRAKE_TIME,
  WATERLINE,
  founderDepth,
  founderNose,
  founders,
  isWater,
} from '../vehicles.ts';
import type { RoadHandling } from '../vehicles.ts';
import {
  AIR_TILT,
  AIR_TILT_EASE,
  CRASH_QUIET,
  CREST_CLIMB,
  CREST_DROP,
  CREST_FROM,
  CREST_RISE,
  HORSE_JUMP_SPEED,
  LEAN_EASE,
  MAX_NOSE,
  MOVE_STEP,
  TILT_SMOOTHING,
} from './constants.ts';
import { loosen, payOut, swing, yawOf } from './drift.ts';
import { BREAK_SPEED, punchOf } from '../breakables/kinds.ts';
import { approach, clamp, levers, mix } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';
import type { WallChecks } from './walls.ts';
import type { Splash } from './splash.ts';

export function createRoad(core: PlayerCore, frame: Frame, wallSet: WallChecks, ring: Splash) {
  const { collide, controls, forward, motion, moved, options, position, probe, pushed, standingRadius, stick, up } = core;
  const s = core.fields;
  const d = s.drift;
  /** The bow's left, which the slide is measured along; and the velocity `swing` hands back. */
  const left = new THREE.Vector3();
  const swung: [number, number] = [0, 0];
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
   *
   * It goes the way its velocity points, which is the bow and the slide across
   * it (`drift.ts`); fast over a crest, it leaves the ground with the climb it
   * had (`CREST_DROP`).
   */
  function rollOn(dt: number, model: CraftModel, width: number, handling: RoadHandling): void {
    const half = model.size[0] / 2;
    // In the water its way dies whatever the keys say, and it goes nowhere it is steered.
    const swamps = founders(model.kind, model.medium);
    if (s.founder >= 0) {
      s.founderWay *= Math.exp(-dt / FOUNDER_DRAG);
      s.speed = s.founderWay;
      d.slide = 0;
    }
    const hitAt = Math.hypot(s.speed, d.slide) * (s.speed < 0 ? -1 : 1);
    left.crossVectors(up, forward).normalize();
    motion.copy(forward).multiplyScalar(s.speed).addScaledVector(left, d.slide);
    moved.copy(motion).multiplyScalar(dt);
    // Fast enough, the small things in the way go over rather than stopping
    // it (`breakables.ts`), before the walls are asked, and cost it nothing:
    // the knock is the camera's and the sound's. A bumper's length ahead,
    // since the body's own sweep is the half width behind the nose.
    if (options.strike !== undefined && Math.abs(hitAt) >= BREAK_SPEED && dt > 0 && s.founder < 0) {
      probe.copy(position).add(moved).addScaledVector(forward, hitAt >= 0 ? half : -half);
      const jolt = options.strike(position, probe, width, motion, punchOf(model.size[0], model.size[1]));
      if (jolt > 0) options.onEvent?.('broke', jolt);
    }
    let scraped = false;
    if (walls !== null) {
      scraped = throughWalls(dt, walls, width);
      // Whatever the walls took off the motion is taken off the speed: a
      // car driven into a wall at an angle scrapes along it, and one driven
      // into it square stops.
      s.speed = motion.dot(forward);
      d.slide = motion.dot(left);
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
    if (!blocked && distance > 1e-9) blocked = ground - s.height > handling.step + Math.max(distance, Math.abs(s.speed) * MOVE_STEP) * handling.slope;
    if (blocked) {
      undo();
      s.speed = struck ? -hitAt * handling.bounce : 0;
      d.slide = 0;
      ground = standingRadius(position);
    }
    const lost = Math.abs(hitAt) - Math.hypot(s.speed, d.slide);
    if ((struck || scraped) && lost > CRASH_SPEED && s.sinceCrash >= CRASH_QUIET) {
      s.sinceCrash = 0;
      // A knock ends a drift, and what it had earned with it.
      d.loose = d.charge = 0;
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
    // Over a crest at speed the ground falls away faster than the nose was
    // climbing: it flies, with that climb, rather than being pressed down onto
    // the far side.
    if (!s.airborne && !blocked && dt > 0 && model.kind !== 'horse' && s.speed > handling.speed * CREST_FROM) {
      const rise = Math.min(CREST_RISE, -Math.sin(s.tilt) * s.speed);
      if (rise >= CREST_CLIMB && (ground - s.height) / dt < rise - CREST_DROP) {
        s.airborne = true;
        s.vertical = rise;
      }
    }
    settle(dt, ground, AVATAR_HEIGHT, distance);
    s.velocity = Math.hypot(s.speed, d.slide);

    // In the air the nose follows the arc; a horse's jump is its own clip.
    if (s.airborne && model.kind !== 'horse') {
      const wanted = -clamp(Math.atan2(s.vertical, Math.max(Math.abs(s.speed), 5)), -MAX_NOSE * AIR_TILT, MAX_NOSE * AIR_TILT);
      s.tilt += (wanted - s.tilt) * approach(AIR_TILT_EASE, dt);
    }
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
   * Loose, the drift's own law takes over (`yawOf`). Returns the radians the
   * bow turned, positive to the left.
   */
  function steerWheels(dt: number, handling: RoadHandling): number {
    // The wheel goes over in `steerTime` and comes back, or across, twice as fast.
    const returning = Math.abs(stick.x) < Math.abs(s.steering) || stick.x * s.steering < 0;
    s.steering += (stick.x - s.steering) * approach((returning ? 2 : 1) / handling.steerTime, dt);
    if (stick.x === 0 && Math.abs(s.steering) < 1e-3) s.steering = 0;
    const grip = Math.max(handling.pivot, clamp(Math.abs(s.speed) / handling.gripSpeed, 0, 1));
    const lock = mix(1, handling.fastLock, clamp(Math.abs(s.speed) / handling.boost, 0, 1));
    const turn = s.airborne ? 0 : yawOf(d, handling, s.steering, grip, lock, s.speed < 0) * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    s.turnRate = dt > 0 ? turn / dt : 0;
    return turn;
  }

  /**
   * One frame of driving a road vehicle: the wheel, the throttle and brake, a
   * horse's jump, and `Space` held on wheels, the handbrake that holds a
   * drift (`drift.ts`). Let go on a drift that earned it, it pays a boost at
   * once: half the way to the raised top speed in one step, the rest at a
   * kick of the throttle, for the boost's seconds.
   */
  function drive(dt: number, input: PlayerInput, model: CraftModel, handling: RoadHandling): void {
    levers(input.move, stick);
    // Off anything made — a road, a town's paving — only a vehicle built for
    // it keeps its pace (`rough`), and one not built for it holds the road
    // less; without the made ground to ask, it does.
    const made = options.madeHeightAt === undefined || handling.rough >= 1 || options.madeHeightAt(position) > 0;
    const handbrake = controls.lift > 0 && model.kind !== 'horse' && s.founder < 0;
    if (!s.airborne && loosen(d, dt, handling, s.speed, s.steering, handbrake)) {
      const tier = payOut(d, handling);
      if (tier > 0) {
        // The kick: half the way to the boosted top speed at once, the rest at the boost's throttle.
        const pace = Math.hypot(s.speed, d.slide);
        const top = handling.boost * (1 + d.gain);
        if (pace > 0.5 && pace < top) {
          const k = (pace + (top - pace) * DRIFT_BOOST_PUNCH) / pace;
          s.speed *= k;
          d.slide *= k;
        }
        options.onEvent?.('boosted', tier);
      }
    }
    const turned = steerWheels(dt, handling);
    if (!s.airborne) {
      swing(d, dt, handling, s.speed, turned, made ? 1 : 0.7 + 0.3 * handling.rough, swung);
      s.speed = swung[0];
      d.slide = swung[1];
    }
    if (d.boost > 0) d.boost = Math.max(0, d.boost - dt);
    const boosting = d.boost > 0;
    let top = (input.run ? handling.boost : handling.speed) * (made ? 1 : handling.rough);
    if (boosting) top = Math.max(top, handling.boost * (1 + d.gain));
    let wanted = 0;
    let time = handling.coastTime;
    if (stick.y > 0) {
      wanted = boosting ? top : top * stick.y;
      time = s.speed < -0.5 ? handling.brakeTime : handling.accelerationTime * (boosting ? DRIFT_BOOST_KICK : 1);
    } else if (stick.y < 0) {
      // `S` is the brake while the car is going forward, and reverse once it
      // has stopped, which is every arcade car's rule.
      wanted = s.speed > 0.5 ? 0 : handling.reverse * stick.y;
      time = s.speed > 0.5 ? handling.brakeTime : handling.accelerationTime;
    } else if (handbrake && s.speed > 0.5) {
      // The handbrake alone: the wheels locked, and the car slowing on them.
      time = HANDBRAKE_TIME;
    }
    const before = s.speed;
    if (!s.airborne) {
      // The throttle and the brakes work on the whole speed, so a slide is
      // carried at the pace asked for and never adds to it.
      const pace = s.speed > 0.5 ? Math.hypot(s.speed, d.slide) : s.speed;
      const next = pace + (wanted - pace) * approach(1 / time, dt);
      if (s.speed > 0.5) {
        s.speed *= next / pace;
        d.slide *= next / pace;
      } else s.speed = next;
    }
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
