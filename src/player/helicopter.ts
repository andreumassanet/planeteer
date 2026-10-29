/**
 * The helicopter.
 */
import type { CraftModel } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import {
  FOUNDER_FLOAT,
  HELI_ACCELERATION_TIME,
  HELI_CEILING,
  HELI_CLIMB,
  HELI_LANDING_GRADE,
  HELI_REVERSE,
  HELI_SINK,
  HELI_SPEED,
  HELI_SPOOL,
  HELI_STRAFE,
  HELI_TOUCHDOWN,
  HELI_TURN,
  HELI_VERTICAL_TIME,
  WATERLINE,
  isWater,
} from '../vehicles.ts';
import { AIR_LOW, HELI_ASSIST_TURN, HELI_WATER_FLOOR, RUDDER_TIME, WRECK_INTO } from './constants.ts';
import { approach, clamp, levers } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';
import type { WallChecks } from './walls.ts';
import type { Flight } from './flight.ts';
import type { Splash } from './splash.ts';

export function createHelicopter(core: PlayerCore, frame: Frame, wallSet: WallChecks, flight: Flight, ring: Splash) {
  const {
    airPushed,
    collideAloft,
    forward,
    motion,
    moved,
    options,
    position,
    probe,
    query,
    side,
    standingRadius,
    stick,
    up,
  } = core;
  const s = core.fields;
  const { pointAhead, travel } = frame;
  const { airWalls, throughWalls } = wallSet;
  const { assistClimb, assistTurn, liftOf, pullOf, refuse, sink, smash, wreck } = flight;
  const { craftSplash, spray } = ring;

  /**
   * Goes straight up on the climb key once its rotor has wound up (`HELI_SPOOL`),
   * hovers where it is let go, flies forward and back on `W` and `S`, sideways
   * on `J` and `L`, turns on its tail rotor with `A` and `D`, and comes down on
   * the descend key, setting down on any land flatter than `HELI_LANDING_GRADE`
   * and holding its skids clear of water: brought down onto it, it goes in and
   * founders. A course's ring turns it and lifts it while the pedals and the
   * collective are left alone. Buildings are walls at its skids' height and at
   * its rotor's, and flown into faster than `WRECK_INTO` it is wrecked.
   */
  function hover(dt: number, input: PlayerInput, model: CraftModel): void {
    s.sinceRefusal += dt;
    if (s.founder >= 0) {
      sink(dt);
      return;
    }
    levers(input.move, stick);
    const lift = liftOf(input);
    const strafe = clamp(input.attitude?.roll ?? 0, -1, 1);
    if (s.grounded) {
      s.speed = 0;
      s.sway = 0;
      s.velocity = 0;
      s.turnRate = 0;
      s.steering = 0;
      s.spool = lift > 0 ? s.spool + dt : Math.max(0, s.spool - dt);
      s.height = standingRadius(position);
      position.setLength(s.height);
      s.altitude = s.height - PLANET_RADIUS;
      if (s.spool < HELI_SPOOL) return;
      s.grounded = false;
      s.airborne = true;
      s.climbing = 0;
      spray(s.height, craftSplash());
      options.onEvent?.('took-off', 0);
    }
    s.spool = HELI_SPOOL;
    const pull = s.goAround > 0 ? null : pullOf(input);
    // The pedals: the tail rotor yaws it, eased like a rudder. With them
    // centred the ring turns it, hovering too, so it faces the next one.
    let pedal = stick.x;
    if (stick.x === 0 && pull !== null) pedal = -assistTurn(Math.abs(s.speed), pull, HELI_TURN * HELI_ASSIST_TURN) / HELI_TURN;
    s.steering += (pedal - s.steering) * approach(1 / RUDDER_TIME, dt);
    if (pedal === 0 && Math.abs(s.steering) < 1e-3) s.steering = 0;
    const turn = -s.steering * HELI_TURN * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    s.turnRate = dt > 0 ? turn / dt : 0;
    // The cyclic: forward and back, and sideways; let go it slows to a hover.
    const wanted = stick.y >= 0 ? HELI_SPEED * stick.y : HELI_REVERSE * stick.y;
    s.speed += (wanted - s.speed) * approach(1 / HELI_ACCELERATION_TIME, dt);
    if (stick.y === 0 && Math.abs(s.speed) < 0.05) s.speed = 0;
    s.sway += (HELI_STRAFE * strafe - s.sway) * approach(1 / HELI_ACCELERATION_TIME, dt);
    if (strafe === 0 && Math.abs(s.sway) < 0.05) s.sway = 0;

    // The collective: a climb and a sink it eases into, the sink slowing near the ground.
    let ground = standingRadius(position);
    let water = isWater(ground);
    let floor = water ? PLANET_RADIUS + WATERLINE + HELI_WATER_FLOOR : ground;
    const over = Math.max(0, s.height - floor);
    const headroom = Math.max(0, PLANET_RADIUS + HELI_CEILING - s.height) * 0.5;
    let asked = 0;
    if (lift > 0) asked = Math.min(HELI_CLIMB, headroom);
    else if (lift < 0) asked = -Math.min(HELI_SINK, Math.max(HELI_TOUCHDOWN, over * 0.8));
    else if (pull !== null) asked = assistClimb(Math.abs(s.speed), pull, -HELI_SINK, Math.min(HELI_CLIMB, headroom));
    s.climbing += (asked - s.climbing) * approach(1 / HELI_VERTICAL_TIME, dt);

    // `side` is the left; the sway is positive to the right.
    side.crossVectors(up, forward).normalize();
    motion.copy(forward).multiplyScalar(s.speed).addScaledVector(side, -s.sway);
    moved.copy(motion).multiplyScalar(dt);
    if (airWalls !== null) {
      // The skids and the rotor's disc, as a balloon's basket and envelope.
      s.airHeight = s.height;
      s.airLow = s.height - ground < AIR_LOW;
      s.airEnvelope = model.size[1] * 0.4;
      s.airEnvelopeHeight = s.height + model.size[2] * 0.85;
      const was = motion.length();
      probe.copy(position).add(moved);
      smash(position, probe, Math.max(model.size[0], model.size[1]) * 0.3, motion, model);
      if (throughWalls(dt, airWalls, Math.min(model.size[0], model.size[1]) * 0.2)) {
        const lost = was - motion.length();
        if (lost >= WRECK_INTO) {
          wreck(lost);
          return;
        }
        s.speed = motion.dot(forward);
        s.sway = -motion.dot(side);
      }
    }
    travel();

    ground = standingRadius(position);
    water = isWater(ground);
    floor = water ? PLANET_RADIUS + WATERLINE + HELI_WATER_FLOOR : ground;
    const before = s.height;
    let next = Math.min(PLANET_RADIUS + HELI_CEILING, s.height + s.climbing * dt);
    // A roof under it holds it up, as it does a balloon's basket.
    if (next < s.height && collideAloft !== undefined) {
      query.copy(position).setLength(next);
      if (collideAloft(query, model.size[0] * 0.2, airPushed)) {
        query.setLength(s.height);
        if (!collideAloft(query, model.size[0] * 0.2, airPushed)) {
          next = s.height;
          s.climbing = 0;
        }
      }
    }
    s.height = next;
    if (s.height <= floor) {
      s.height = floor;
      s.climbing = Math.max(0, s.climbing);
      if (lift < 0) {
        const half = model.size[0] * 0.3;
        pointAhead(forward, half / s.height, probe);
        const front = standingRadius(probe);
        pointAhead(forward, -half / s.height, probe);
        const back = standingRadius(probe);
        if (water) {
          ditch(Math.max(0, -s.climbing));
          return;
        }
        if (isWater(front) || isWater(back)) refuse('water-refused');
        else if (Math.abs(front - back) / (2 * half) > HELI_LANDING_GRADE) refuse('steep-refused');
        else {
          s.grounded = true;
          s.airborne = false;
          s.speed = 0;
          s.sway = 0;
          s.climbing = 0;
          s.spool = 0;
          s.goAround = 0;
          s.height = ground;
          spray(s.height, craftSplash());
          options.onEvent?.('landed', 0);
        }
      }
    }
    // A refused landing lifts off again a little, as a plane goes round.
    if (s.goAround > 0) {
      s.goAround -= dt;
      s.climbing = Math.max(s.climbing, HELI_TOUCHDOWN);
    }
    s.climbRate = dt > 0 ? (s.height - before) / dt : 0;
    position.setLength(s.height);
    s.altitude = s.height - PLANET_RADIUS;
    s.velocity = Math.hypot(s.speed, s.sway);
    s.clearance = s.height - floor + (water ? HELI_WATER_FLOOR : 0);
    s.overWater = water;
  }

  /** Brought down onto the water: in, with a splash, and going down at once. */
  function ditch(sinking: number): void {
    const hit = Math.hypot(s.speed, s.sway, sinking);
    s.grounded = true;
    s.airborne = false;
    s.climbing = 0;
    s.spool = 0;
    s.goAround = 0;
    s.sway = 0;
    s.founderWay = s.speed * 0.5;
    s.founder = FOUNDER_FLOAT;
    s.height = PLANET_RADIUS + WATERLINE;
    position.setLength(s.height);
    spray(s.height, craftSplash());
    options.onEvent?.('plunged', hit);
  }

  return { hover };
}

export type Helicopter = ReturnType<typeof createHelicopter>;
