/**
 * The helicopter.
 */
import type { CraftModel } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import {
  HELI_ACCELERATION_TIME,
  HELI_CEILING,
  HELI_CLIMB,
  HELI_LANDING_GRADE,
  HELI_REVERSE,
  HELI_SINK,
  HELI_SPEED,
  HELI_SPOOL,
  HELI_TOUCHDOWN,
  HELI_TURN,
  HELI_VERTICAL_TIME,
  WATERLINE,
  isWater,
} from '../vehicles.ts';
import { AIR_LOW, HELI_WATER_FLOOR, RUDDER_TIME } from './constants.ts';
import { approach, levers } from './math.ts';
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
    standingRadius,
    stick,
    up,
  } = core;
  const s = core.fields;
  const { advance, pointAhead, travel } = frame;
  const { airWalls, throughWalls } = wallSet;
  const { liftOf, refuse } = flight;
  const { craftSplash, spray } = ring;

  /**
   * Goes straight up on the climb key once its rotor has wound up (`HELI_SPOOL`),
   * hovers where it is let go, flies forward and back on `W` and `S`, turns on its
   * tail rotor with `A` and `D`, and comes down on the descend key, setting down on
   * any land flatter than `HELI_LANDING_GRADE` and holding its skids clear of
   * water. Buildings are walls at its skids' height and at its rotor's.
   */
  function hover(dt: number, input: PlayerInput, model: CraftModel): void {
    s.sinceRefusal += dt;
    levers(input.move, stick);
    const lift = liftOf(input);
    if (s.grounded) {
      s.speed = 0;
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
    // The pedals: the tail rotor yaws it, eased like a rudder.
    s.steering += (stick.x - s.steering) * approach(1 / RUDDER_TIME, dt);
    if (stick.x === 0 && Math.abs(s.steering) < 1e-3) s.steering = 0;
    const turn = -s.steering * HELI_TURN * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    s.turnRate = dt > 0 ? turn / dt : 0;
    // The cyclic: forward and back, and let go it slows to a hover.
    const wanted = stick.y >= 0 ? HELI_SPEED * stick.y : HELI_REVERSE * stick.y;
    s.speed += (wanted - s.speed) * approach(1 / HELI_ACCELERATION_TIME, dt);
    if (stick.y === 0 && Math.abs(s.speed) < 0.05) s.speed = 0;

    // The collective: a climb and a sink it eases into, the sink slowing near the ground.
    let ground = standingRadius(position);
    let water = isWater(ground);
    let floor = water ? PLANET_RADIUS + WATERLINE + HELI_WATER_FLOOR : ground;
    const over = Math.max(0, s.height - floor);
    let asked = 0;
    if (lift > 0) asked = Math.min(HELI_CLIMB, Math.max(0, PLANET_RADIUS + HELI_CEILING - s.height) * 0.5);
    else if (lift < 0) asked = -Math.min(HELI_SINK, Math.max(HELI_TOUCHDOWN, over * 0.8));
    s.climbing += (asked - s.climbing) * approach(1 / HELI_VERTICAL_TIME, dt);

    if (airWalls !== null) {
      // The skids and the rotor's disc, as a balloon's basket and envelope.
      s.airHeight = s.height;
      s.airLow = s.height - ground < AIR_LOW;
      s.airEnvelope = model.size[1] * 0.4;
      s.airEnvelopeHeight = s.height + model.size[2] * 0.85;
      motion.copy(forward).multiplyScalar(s.speed);
      moved.copy(motion).multiplyScalar(dt);
      if (throughWalls(dt, airWalls, Math.min(model.size[0], model.size[1]) * 0.2)) s.speed = motion.dot(forward);
      travel();
    } else advance(forward, (s.speed * dt) / position.length());

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
        if (water || isWater(front) || isWater(back)) refuse('water-refused');
        else if (Math.abs(front - back) / (2 * half) > HELI_LANDING_GRADE) refuse('steep-refused');
        else {
          s.grounded = true;
          s.airborne = false;
          s.speed = 0;
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
    s.velocity = Math.abs(s.speed);
    s.clearance = s.height - floor + (water ? HELI_WATER_FLOOR : 0);
    s.overWater = water;
  }

  return { hover };
}

export type Helicopter = ReturnType<typeof createHelicopter>;
