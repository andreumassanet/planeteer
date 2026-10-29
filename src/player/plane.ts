/**
 * The plane: taxiing, the take-off run, flight, landing, knocks against walls, and wrecks on them and on the ground.
 */
import type * as THREE from 'three';
import type { CraftModel } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import {
  FOUNDER_FLOAT,
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
  WATERLINE,
  isWater,
  planeCruiseAt,
} from '../vehicles.ts';
import {
  AIR_LOW,
  ASSIST_BANK,
  MAX_NOSE,
  PLANE_AIR_CLEARANCE,
  PLANE_APPROACH,
  PLANE_LOOK_AHEAD,
  PLANE_NOSE_SPRING,
  PLANE_ROLL_SPRING,
  PLANE_ROLL_TIME,
  PLANE_VERTICAL_SPRING,
  PLANE_WALL,
  PLUNGE_SINK,
  PLUNGE_SPEED,
  WRECK_PROBE,
  WRECK_SLOPE,
} from './constants.ts';
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

/** How far over the ground here the ground ahead must rise before the plane climbs for it, units; and the most height over it the climb keeps. */
const LOOK_MARGIN = 2;
const LOOK_KEEP = 20;

export function createPlane(
  core: PlayerCore,
  frame: Frame,
  wallSet: WallChecks,
  runway: Runway,
  flight: Flight,
  ring: Splash,
) {
  const { forward, landAt, motion, options, position, probe, pushed, standingRadius, stick, up } = core;
  const s = core.fields;
  const { advance, pointAhead } = frame;
  const { airHit, airWalls } = wallSet;
  const { taxi } = runway;
  const { assistClimb, assistTurn, bounce, liftOf, pullOf, refuse, smash, wreck } = flight;
  const { craftSplash, spray } = ring;
  const rolled: [number, number] = [0, 0];

  /** What the plane flies over: the land, or the water's surface over the sea, never the sea floor under it. */
  function surfaceAt(at: THREE.Vector3): number {
    const ground = landAt(at);
    return isWater(ground) ? PLANET_RADIUS + WATERLINE : ground;
  }

  /**
   * The climb the ground ahead asks for, units a second, or -Infinity: where
   * it rises more than `LOOK_MARGIN` over the ground here, the vertical speed
   * that keeps the height the plane has over the ground here (within
   * `LOOK_KEEP`) over it too, in the seconds of `PLANE_LOOK_AHEAD` it is away.
   */
  function riseAhead(before: number, here: number): number {
    const keep = Math.min(LOOK_KEEP, Math.max(LOOK_MARGIN + PLANE_AIR_CLEARANCE, before - here));
    let rise = -Infinity;
    for (const ahead of PLANE_LOOK_AHEAD) {
      pointAhead(forward, (s.speed * ahead) / before, probe);
      const there = surfaceAt(probe);
      if (there - here < LOOK_MARGIN) continue;
      rise = Math.max(rise, (there + keep - before) / ahead);
    }
    return rise;
  }

  /**
   * Flying into the ground: the land `WRECK_PROBE` ahead (or a frame's flight,
   * if longer) rising steeper than `WRECK_SLOPE` from the ground here, over
   * where the climb takes the plane by then. The speed into it, or 0.
   */
  function intoGround(radius: number, beneath: number, dt: number): number {
    if (s.speed <= 1) return 0;
    const reach = Math.max(WRECK_PROBE, s.speed * dt);
    pointAhead(forward, reach / radius, probe);
    const there = landAt(probe);
    if (isWater(there)) return 0;
    const slope = (there - beneath) / reach;
    const arrives = radius + (s.climbing * reach) / s.speed;
    if (slope <= WRECK_SLOPE || arrives >= there + PLANE_AIR_CLEARANCE) return 0;
    return s.speed * Math.min(1, slope / Math.hypot(1, slope));
  }

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
    const here = surfaceAt(position);
    const aboveGround = Math.max(0, before - here);
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
    // A ridge ahead is climbed for before it arrives, never past what the nose shows.
    const rise = riseAhead(before, here);
    if (rise > asked) asked = Math.min(rise, s.speed * Math.tan(MAX_NOSE), Math.max(asked, headroom));
    spring(s.climbing, s.climbAccel, asked, PLANE_VERTICAL_SPRING, dt, rolled);
    s.climbing = rolled[0];
    s.climbAccel = rolled[1];

    let radius = Math.min(PLANET_RADIUS + PLANE_CEILING, before + s.climbing * dt);
    if (airWalls !== null) {
      // A wall in the way is a knock; only a roof still over the plane is one.
      // Asked along the way in steps no longer than the plane is wide, so no
      // wall is crossed between two frames.
      const wide = Math.max(model.size[0], model.size[1]) * PLANE_WALL;
      const way = s.speed * dt;
      const steps = Math.min(6, Math.max(1, Math.ceil(way / wide)));
      pointAhead(forward, (way + model.size[0] / 2) / before, probe);
      probe.setLength(radius);
      motion.copy(forward).multiplyScalar(s.speed);
      smash(position, probe, wide, motion, model);
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
        if (bounce(pushed, Math.max(0, -s.climbing))) return;
      } else advance(forward, way / before);
    } else advance(forward, (s.speed * dt) / before);

    const beneath = surfaceAt(position);
    const floor = beneath + PLANE_AIR_CLEARANCE;
    // A face of ground too steep to climb, met low, is a crash.
    const struckGround = s.goAround > 0 ? 0 : intoGround(radius, beneath, dt);
    if (struckGround > 0) {
      wreck(struckGround);
      return;
    }
    // The ground has the last word: a rise the look ahead did not clear in
    // time lifts the plane, and the climb it was asked for is kept, so the
    // far side is level flight rather than a fall off the edge.
    if (radius < floor) {
      radius = floor;
      if (!descending) {
        s.climbing = Math.max(0, s.climbing);
        s.climbAccel = Math.max(0, s.climbAccel);
      }
    }
    // The nose is drawn from the climb rate, eased so a lift never jerks it.
    spring(s.climbRate, s.climbRateRate, dt > 0 ? (radius - before) / dt : 0, PLANE_NOSE_SPRING, dt, rolled);
    s.climbRate = rolled[0];
    s.climbRateRate = rolled[1];
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
      const outcome = touchdown(model, descending, Math.max(0, -s.climbing));
      if (outcome === 'steep' && descending) refuse('steep-refused');
    }
  }

  /**
   * Down on the ground under the plane, if it will take one: not steeper than
   * `PLANE_LANDING_GRADE` along the fuselage. On the sea, if `ditch` says so,
   * it comes down on the water at `PLANE_DITCH_SPEED` at most and skids on,
   * and `rollOn` founders it (`founders`): the splash, the sinking, the swim.
   * Sinking at `sink` faster than `PLUNGE_SINK`, or faster than
   * `PLUNGE_SPEED` along, it plunges instead.
   */
  function touchdown(model: CraftModel, ditch = true, sink = 0): Touchdown {
    const radius = position.length();
    if (isWater(landAt(position))) {
      if (!ditch) return 'water';
      if (sink > PLUNGE_SINK || s.speed > PLUNGE_SPEED) {
        plunge(sink);
        return 'plunged';
      }
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

  /**
   * Into the water harder than a ditching: on the surface with what is left
   * of its way, going down at once (`FOUNDER_FLOAT` skipped), told as
   * `plunged` with how hard it went in.
   */
  function plunge(sink: number): void {
    const hit = Math.hypot(s.speed, sink);
    settleOn(PLANET_RADIUS + WATERLINE);
    s.speed = Math.min(s.speed, PLANE_DITCH_SPEED) * 0.5;
    s.founderWay = s.speed;
    s.founder = FOUNDER_FLOAT;
    spray(s.height, craftSplash());
    options.onEvent?.('plunged', hit);
  }

  /** On its wheels, or its belly, at `height`: level, still in the vertical, and rolling out. */
  function settleOn(height: number): void {
    s.grounded = true;
    s.airborne = false;
    s.vertical = 0;
    s.roll = s.rollRate = 0;
    s.climbRate = s.climbRateRate = 0;
    s.climbing = s.climbAccel = 0;
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
