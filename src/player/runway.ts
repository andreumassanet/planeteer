/**
 * A plane on the ground: the take-off run.
 */
import type { CraftModel } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import {
  CAR_ACCELERATION_TIME,
  CAR_BRAKE_TIME,
  CAR_COAST_TIME,
  CAR_REVERSE,
  PLANE_CLIMB_OUT,
  PLANE_ROTATE,
  PLANE_RUN_TIME,
  PLANE_TAXI,
} from '../vehicles.ts';
import { TAXI } from './constants.ts';
import { approach, levers } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Road } from './road.ts';
import type { Flight } from './flight.ts';
import type { Splash } from './splash.ts';

export function createRunway(core: PlayerCore, road: Road, flight: Flight, ring: Splash) {
  const { options, position, stick } = core;
  const s = core.fields;
  const { rollOn, steerWheels } = road;
  const { liftOf } = flight;
  const { craftSplash, spray } = ring;

  /**
   * A plane on the ground: `W` opens the throttle and holding it is the take-off
   * run (as holding the climb key is), which lifts off by itself at `PLANE_ROTATE`
   * into `PLANE_CLIMB_OUT`; let go it rolls to a stop, and `S` brakes, then backs.
   * Down from a landing the run is not open again until both keys have been let go
   * (`rolling`), or a throttle still held from the approach would take it straight
   * off again.
   */
  function taxi(dt: number, input: PlayerInput, model: CraftModel): void {
    levers(input.move, stick);
    steerWheels(dt, TAXI);
    const asked = stick.y > 0 || liftOf(input) > 0;
    if (!asked) s.rolling = false;
    const run = asked && !s.rolling;
    let wanted = 0;
    let time = CAR_COAST_TIME;
    if (run) {
      wanted = PLANE_ROTATE * 1.25;
      time = PLANE_RUN_TIME;
    } else if (stick.y < 0) {
      wanted = s.speed > 0.5 ? 0 : CAR_REVERSE * 0.5 * stick.y;
      time = CAR_BRAKE_TIME;
    } else if (s.rolling && stick.y > 0) {
      // Still rolling out with the throttle held from the approach: it taxis.
      wanted = PLANE_TAXI * stick.y;
      time = CAR_ACCELERATION_TIME;
    }
    s.speed += (wanted - s.speed) * approach(1 / time, dt);
    if (!run && stick.y === 0 && Math.abs(s.speed) < 0.05) s.speed = 0;
    // A fuselage's width against the buildings, not the span: a wingtip over
    // a garden wall is how a light aircraft is parked.
    rollOn(dt, model, Math.min(model.size[0], model.size[1]) * 0.25, TAXI);
    if (s.airborne) {
      // Rolled off an edge: it is flying now, whatever speed it had, and it is
      // not standing anywhere it could be left.
      s.grounded = false;
      s.altitude = position.length() - PLANET_RADIUS;
      s.climbing = s.climbAccel = 0;
      s.vertical = 0;
      s.roll = s.rollRate = 0;
      options.onEvent?.('took-off', 0);
      return;
    }
    if (run && s.speed >= PLANE_ROTATE && s.founder < 0) {
      s.grounded = false;
      s.airborne = true;
      s.altitude = position.length() - PLANET_RADIUS;
      // The wheels leave the ground level and the climb builds from nothing
      // into a gentle climb-out, whatever the keys say; then they have it.
      s.climbing = s.climbAccel = 0;
      s.goAround = PLANE_CLIMB_OUT;
      s.roll = s.rollRate = 0;
      spray(s.height, craftSplash());
      options.onEvent?.('took-off', 0);
    }
  }

  return { taxi };
}

export type Runway = ReturnType<typeof createRunway>;
