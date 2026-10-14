/**
 * The balloon: slow on purpose. The burner and the vent take hold over `BALLOON_LIFT_TIME`, the heading comes round over `BALLOON_TURN_TIME`, and the last of a descent settles rather than drops.
 */
import type { CraftModel } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import {
  BALLOON_CEILING,
  BALLOON_CLIMB,
  BALLOON_LIFT_TIME,
  BALLOON_SETTLE,
  BALLOON_SPEED,
  BALLOON_TOUCHDOWN,
  BALLOON_TURN,
  WATERLINE,
  isWater,
} from '../vehicles.ts';
import {
  AIR_LOW,
  BALLOON_BASKET,
  BALLOON_ENVELOPE,
  BALLOON_PIVOT,
  BALLOON_TURN_TIME,
  BALLOON_WATER_FLOOR,
} from './constants.ts';
import { approach, levers } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';
import type { WallChecks } from './walls.ts';
import type { Flight } from './flight.ts';
import type { Splash } from './splash.ts';

export function createBalloon(core: PlayerCore, frame: Frame, wallSet: WallChecks, flight: Flight, ring: Splash) {
  const { airPushed, collideAloft, forward, motion, moved, options, position, query, standingRadius, stick, up } = core;
  const s = core.fields;
  const { advance, travel } = frame;
  const { airWalls, throughWalls } = wallSet;
  const { liftOf } = flight;
  const { craftSplash, spray } = ring;

  /**
   * It rises and sinks on the two keys, drifts along the heading you steer at a
   * speed the throttle trims, and sets down wherever it touches land. Over water it
   * holds its basket clear of the surface and cannot come down. A roof holds it up.
   */
  function drift(dt: number, input: PlayerInput, model: CraftModel): void {
    levers(input.move, stick);
    const lift = liftOf(input);
    if (s.grounded) {
      s.speed = 0;
      s.velocity = 0;
      s.turnRate = 0;
      s.steering = 0;
      if (lift <= 0) {
        s.height = standingRadius(position);
        position.setLength(s.height);
        return;
      }
      s.grounded = false;
      s.airborne = true;
      s.vertical = 0;
      options.onEvent?.('took-off', 0);
    }
    s.steering += (stick.x - s.steering) * approach(1 / BALLOON_TURN_TIME, dt);
    if (stick.x === 0 && Math.abs(s.steering) < 1e-3) s.steering = 0;
    const turn = -s.steering * BALLOON_TURN * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    s.turnRate = dt > 0 ? turn / dt : 0;
    s.speed += (Math.max(0, BALLOON_SPEED * (1 + stick.y * 0.6)) - s.speed) * approach(0.5, dt);

    let ground = standingRadius(position);
    let water = isWater(ground);
    let floor = water ? PLANET_RADIUS + WATERLINE + BALLOON_WATER_FLOOR : ground;
    const over = Math.max(0, s.height - floor);
    let asked = 0;
    if (lift > 0) asked = Math.min(BALLOON_CLIMB, Math.max(0, PLANET_RADIUS + BALLOON_CEILING - s.height) * BALLOON_SETTLE);
    else if (lift < 0) asked = -Math.min(BALLOON_CLIMB, Math.max(BALLOON_TOUCHDOWN, over * BALLOON_SETTLE));
    s.vertical += (asked - s.vertical) * approach(1 / BALLOON_LIFT_TIME, dt);
    const basket = model.size[1] * BALLOON_BASKET;
    if (airWalls !== null) {
      // Along the walls, as a car scrapes along them: a basket or an
      // envelope drifted into a building stops at it and slides along it.
      s.airHeight = s.height;
      s.airLow = s.height - ground < AIR_LOW;
      s.airEnvelope = model.size[1] * BALLOON_ENVELOPE;
      s.airEnvelopeHeight = s.height + model.size[2] * BALLOON_PIVOT;
      motion.copy(forward).multiplyScalar(s.speed);
      moved.copy(motion).multiplyScalar(dt);
      if (throughWalls(dt, airWalls, basket)) s.speed = Math.max(0, motion.dot(forward));
      travel();
    } else advance(forward, (s.speed * dt) / position.length());

    ground = standingRadius(position);
    water = isWater(ground);
    floor = water ? PLANET_RADIUS + WATERLINE + BALLOON_WATER_FLOOR : ground;
    let next = Math.min(PLANET_RADIUS + BALLOON_CEILING, s.height + s.vertical * dt);
    // A roof holds it up: sinking onto a building, the basket stops on the roof
    // it would have come down through. Only the walls whose roofs are over the
    // new height push, so one that is over it now and was not a moment ago is a
    // roof met on the way down.
    if (next < s.height && collideAloft !== undefined) {
      query.copy(position).setLength(next);
      if (collideAloft(query, basket, airPushed)) {
        query.setLength(s.height);
        if (!collideAloft(query, basket, airPushed)) {
          next = s.height;
          s.vertical = 0;
        }
      }
    }
    s.height = next;
    if (s.height <= floor) {
      s.height = floor;
      if (!water && s.vertical <= 0 && lift <= 0) {
        s.grounded = true;
        s.airborne = false;
        s.speed = 0;
        s.vertical = 0;
        s.steering = 0;
        spray(s.height, craftSplash());
        options.onEvent?.('landed', 0);
      } else s.vertical = Math.max(0, s.vertical);
    }
    position.setLength(s.height);
    s.altitude = s.height - PLANET_RADIUS;
    s.velocity = s.speed;
  }

  return { drift };
}

export type Balloon = ReturnType<typeof createBalloon>;
