/**
 * The plane: taxiing, the take-off run, flight, landing, and knocks against walls.
 */
import type { CraftModel } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import {
  PLANE_ACCELERATION_TIME,
  PLANE_CEILING,
  PLANE_CLIMB_MIN,
  PLANE_CLIMB_RATE,
  PLANE_CLIMB_SLOPE,
  PLANE_CRUISE_LOW,
  PLANE_DITCH_SPEED,
  PLANE_FLARE,
  PLANE_LANDING_GRADE,
  PLANE_LANDING_TIME,
  PLANE_ROTATE,
  PLANE_SPEED_RATE,
  PLANE_THROTTLE_DOWN,
  PLANE_THROTTLE_UP,
  PLANE_TOUCHDOWN,
  PLANE_TURN,
  PLANE_VERTICAL_TIME,
  WATERLINE,
  isWater,
  planeCruiseAt,
} from '../vehicles.ts';
import { AIR_LOW, ASSIST_BANK, PLANE_AIR_CLEARANCE, PLANE_APPROACH, PLANE_ROLL_SPRING, PLANE_ROLL_TIME, PLANE_WALL } from './constants.ts';
import { approach, clamp, levers, spring } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';
import type { WallChecks } from './walls.ts';
import type { Runway } from './runway.ts';
import type { Flight } from './flight.ts';
import type { Splash } from './splash.ts';
import { createAerobatics } from './aerobatics.ts';
import type { Touchdown } from './aerobatics.ts';

export function createPlane(
  core: PlayerCore,
  frame: Frame,
  wallSet: WallChecks,
  runway: Runway,
  flight: Flight,
  ring: Splash,
) {
  const { forward, landAt, options, position, probe, pushed, standingRadius, stick, up } = core;
  const s = core.fields;
  const { advance, pointAhead } = frame;
  const { airHit, airWalls } = wallSet;
  const { taxi } = runway;
  const { assistClimb, assistTurn, bounce, liftOf, pullOf, refuse } = flight;
  const { craftSplash, spray } = ring;
  const rolled: [number, number] = [0, 0];

  /**
   * One frame of a plane in travel: the stick rolls it and the roll turns it,
   * the keys ask for a vertical speed, a course's ring pulls on whichever of
   * the two the keys leave alone, and the ground has the last word. Only the
   * mode key takes it into aerobatics; the stick keys aloft are travel's own
   * (`J` and `L` roll like `A` and `D`, `K` climbs and `I` descends), so a
   * hand that strays onto them never changes the flight.
   */
  function fly(dt: number, input: PlayerInput, model: CraftModel): void {
    if (input.flightMode === true) chooseMode(!s.aeroWanted);
    if (s.grounded) {
      s.sinceRefusal += dt;
      s.elevator = s.aileron = 0;
      taxi(dt, input, model);
      return;
    }
    // Aerobatics once the climb-out is done; travel levels the plane off first.
    if (s.aeroWanted && !s.aerobatic && s.goAround <= 0) aerobatics.engage();
    if (s.aerobatic) s.recovering = !s.aeroWanted;
    if (s.aerobatic) {
      aerobatics.fly(dt, input, model);
      return;
    }
    s.sinceRefusal += dt;
    // Stick and throttle are two levers, not a direction: see `levers`.
    levers(input.move, stick);
    const stickRoll = input.attitude?.roll ?? 0;
    if (stick.x === 0 && stickRoll !== 0) stick.x = clamp(stickRoll, -1, 1);
    // The climb-out and a go-around have the plane; the ring waits.
    const pull = s.goAround > 0 ? null : pullOf(input);
    // The stick rolls the plane and the roll turns it: see `PLANE_ROLL_SPRING`.
    // `A` is a negative `x` and a left turn, which about `up` is positive. With
    // the stick centred the ring banks it, never past `ASSIST_BANK`.
    let bank = -stick.x;
    if (stick.x === 0 && pull !== null) bank = assistTurn(s.speed, pull, PLANE_TURN * ASSIST_BANK) / PLANE_TURN;
    spring(s.roll, s.rollRate, bank, PLANE_ROLL_SPRING, dt, rolled);
    s.roll = rolled[0];
    s.rollRate = rolled[1];
    // Otherwise the ease leaves the wings a hair off level for ever.
    if (bank === 0 && Math.abs(s.roll) < 1e-4 && Math.abs(s.rollRate) < 1e-3) s.roll = s.rollRate = 0;
    const turn = s.roll * PLANE_TURN * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    s.turnRate = dt > 0 ? turn / dt : 0;

    const lift = s.goAround > 0 ? 1 : liftOf(input);
    const descending = lift < 0;
    // The control surfaces as the simple mode flies: the elevator with the
    // climb asked for, the ailerons with the roll, a touch of rudder.
    s.elevator += (lift - s.elevator) * approach(1 / PLANE_ROLL_TIME, dt);
    s.aileron = -s.roll;
    s.steering += (stick.x * 0.4 - s.steering) * approach(1 / PLANE_ROLL_TIME, dt);
    const before = position.length();
    const aboveGround = Math.max(0, before - landAt(position));
    // Speed rides altitude: see `PLANE_CRUISE_LOW` in `vehicles.ts`. Low is
    // scenic, high is how an ocean gets crossed; and coming down low the
    // throttle closes to an approach speed, so a landing is aimable.
    const cruise = planeCruiseAt(s.altitude);
    const approaching = descending && aboveGround < PLANE_APPROACH;
    const throttle = 1 + stick.y * (stick.y >= 0 ? PLANE_THROTTLE_UP : PLANE_THROTTLE_DOWN);
    const wanted = approaching ? PLANE_CRUISE_LOW * 0.55 : cruise * throttle;
    const change = (wanted - s.speed) * approach(1 / (approaching ? PLANE_LANDING_TIME : PLANE_ACCELERATION_TIME), dt);
    s.speed += Math.max(-PLANE_SPEED_RATE * dt, Math.min(PLANE_SPEED_RATE * dt, change));

    // The keys ask for a vertical speed and the plane eases into it: see
    // `PLANE_CLIMB_MIN`. Let go and it levels off where it is, or, with a
    // ring to fly through, eases onto the ring's height.
    const authority = Math.max(PLANE_CLIMB_MIN, s.speed * PLANE_CLIMB_SLOPE, aboveGround * PLANE_CLIMB_RATE);
    // Easing into the ceiling rather than hitting it.
    const headroom = Math.max(0, PLANET_RADIUS + PLANE_CEILING - before) * PLANE_CLIMB_RATE;
    let asked = 0;
    if (s.goAround > 0) {
      s.goAround -= dt;
      asked = PLANE_CLIMB_MIN;
    } else if (lift > 0) {
      asked = Math.min(authority, headroom);
    } else if (descending) {
      asked = -Math.min(authority, Math.max(PLANE_TOUCHDOWN, aboveGround * PLANE_FLARE));
    } else if (pull !== null) {
      asked = assistClimb(s.speed, pull, -authority, Math.min(authority, headroom));
    }
    s.climbing += (asked - s.climbing) * approach(1 / PLANE_VERTICAL_TIME, dt);

    let radius = Math.min(PLANET_RADIUS + PLANE_CEILING, before + s.climbing * dt);
    if (airWalls !== null) {
      // A wall in the way is a knock; only a roof still over the plane is one.
      // Asked along the way in steps no longer than the plane is wide, so no
      // wall is crossed between two frames.
      const wide = Math.max(model.size[0], model.size[1]) * PLANE_WALL;
      const way = s.speed * dt;
      const steps = Math.min(6, Math.max(1, Math.ceil(way / wide)));
      s.airHeight = radius;
      s.airLow = aboveGround < AIR_LOW;
      s.airEnvelope = 0;
      let struck = 0;
      for (let step = 1; step <= steps && struck === 0; step++) {
        pointAhead(forward, (way * step) / steps / before, probe);
        if (airHit(probe, wide, pushed)) struck = step;
      }
      if (struck > 0) {
        advance(forward, (way * (struck - 1)) / steps / before);
        bounce(pushed);
      } else advance(forward, way / before);
    } else advance(forward, (s.speed * dt) / before);

    const beneath = landAt(position);
    const floor = beneath + PLANE_AIR_CLEARANCE;
    // The ground has the last word. That is what makes flying into the planet
    // impossible: a ridge rising under the plane lifts it, and the climb it
    // was asked for is kept, so the far side is level flight rather than a
    // fall off the edge.
    if (radius < floor) {
      radius = floor;
      if (!descending) s.climbing = Math.max(0, s.climbing);
    }
    s.climbRate = dt > 0 ? (radius - before) / dt : 0;
    position.setLength(radius);
    s.altitude = radius - PLANET_RADIUS;
    s.velocity = s.speed;

    // Down on the floor coming down: a touchdown, if the ground will take
    // one — with the descend key held, or still sinking after it was let go
    // for the flare. Ground rising under a plane flying level lifts it and is
    // not a landing; and only the descend key held says out loud that the
    // ground will not take one, and goes round.
    if (s.goAround <= 0 && (descending || s.climbing < -0.2) && radius <= floor + 0.5) {
      // Let down onto the sea with the descend key held, it ditches; only
      // sinking onto it after the key was let go flies on over it.
      const outcome = touchdown(model, descending);
      if (outcome === 'steep' && descending) refuse('steep-refused');
    }
  }

  /**
   * Down on the ground under the plane, if it will take one: not steeper than
   * `PLANE_LANDING_GRADE` along the fuselage. On the sea, if `ditch` says so,
   * it comes down on the water at `PLANE_DITCH_SPEED` at most and skids on,
   * and `rollOn` founders it (`founders`): the splash, the sinking, the swim.
   */
  function touchdown(model: CraftModel, ditch = true): Touchdown {
    const radius = position.length();
    if (isWater(landAt(position))) {
      if (!ditch) return 'water';
      settleOn(PLANET_RADIUS + WATERLINE);
      s.speed = Math.min(s.speed, PLANE_DITCH_SPEED);
      return 'ditched';
    }
    const half = model.size[0] / 2;
    pointAhead(forward, half / radius, probe);
    const front = landAt(probe);
    pointAhead(forward, -half / radius, probe);
    const back = landAt(probe);
    if (Math.abs(front - back) / (2 * half) > PLANE_LANDING_GRADE || isWater(front) || isWater(back)) return 'steep';
    settleOn(standingRadius(position));
    // The landing rolls out rather than stopping dead: `taxi` lets it run
    // down, and `S` brakes it.
    s.speed = Math.min(s.speed, PLANE_ROTATE * 0.8);
    spray(s.height, craftSplash());
    options.onEvent?.('landed', 0);
    return 'landed';
  }

  /** On its wheels, or its belly, at `height`: level, still in the vertical, and rolling out. */
  function settleOn(height: number): void {
    s.grounded = true;
    s.airborne = false;
    s.vertical = 0;
    s.roll = s.rollRate = 0;
    s.climbRate = 0;
    s.climbing = 0;
    s.height = height;
    position.setLength(s.height);
    s.rolling = true;
  }

  /** Travel or aerobatics, told when it changes. */
  function chooseMode(aerobatic: boolean): void {
    if (s.aeroWanted === aerobatic) return;
    s.aeroWanted = aerobatic;
    options.onEvent?.(aerobatic ? 'aerobatics' : 'travel', 0);
  }

  const aerobatics = createAerobatics(core, frame, wallSet, flight, touchdown);

  return { fly };
}

export type Plane = ReturnType<typeof createPlane>;
