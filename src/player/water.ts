/**
 * Hulls: boats, jet skis, sailboats and the submarine, driven on the water's surface or under it.
 *
 * A hull carries its way through a turn: the bow comes round and the speed
 * it had goes on across it (`HullState.slip`) until the water takes it, so
 * a fast boat slides out of a hard turn rather than turning on rails. The
 * rudder bites with way on and barely at a standstill; a jet ski powerslides
 * on the turn and the stern key together, and leaps on `Space`; a sail is
 * driven by the real wind at its angle to it.
 */
import * as THREE from 'three';
import type { CraftModel } from '../craft/contract.ts';
import { PLANET_RADIUS } from '../globe.ts';
import {
  SUB_DIVE,
  SUB_FLOOR_CLEAR,
  SUB_MAX_DEPTH,
  SUB_RISE,
  SUB_VERTICAL_TIME,
  WATERLINE,
} from '../vehicles.ts';
import type { WaterHandling } from '../vehicles.ts';
import { DEFLECTIONS, HULL_MARGIN, waterOf } from './constants.ts';
import { sailShare, windStrength } from './hull.ts';
import { approach, clamp, levers, mix } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';

/** The least speed a powerslide starts at, units a second, and the share of `grip` left in one. */
const SLIDE_FROM = 10;
const SLIDE_GRIP = 0.45;
/** The speed a powerslide holds towards, as a share of the cruise: the stern key bleeds it rather than backing. */
const SLIDE_HOLD = 0.75;
/** The share of the rudder a hull has with its keel out of the water. */
const AIR_RUDDER = 0.5;
/** The least speed `Space` leaps at, units a second, and how long a press waits for the hull to be down to take it. */
const LEAP_FROM = 6;
const LEAP_HELD = 0.3;
/** A boost kicks only from a share of the cruise up, and the throttle bites harder while it is held. */
const PUNCH_FROM = 0.3;
const BOOST_BITE = 0.6;
/** How much way a hull loses a second with nothing under it but air. */
const AIR_DRAG = 0.05;

const smooth = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export function createWater(core: PlayerCore, frame: Frame) {
  const { controls, forward, options, position, stick, up } = core;
  const s = core.fields;
  const h = s.hull;
  const { advance, clearAhead } = frame;
  const right = new THREE.Vector3();
  const way = new THREE.Vector3();
  const heading = new THREE.Vector3();

  /** How much of its turn a hull has at `going` units a second: little at a standstill, all of it with way on, a little less flat out. */
  function authority(handling: WaterHandling, going: number): number {
    const flow = mix(handling.still, 1, smooth(going / (0.35 * handling.speed)));
    const flat = 1 - 0.25 * smooth((going - handling.speed) / Math.max(1, handling.boost - handling.speed));
    return flow * flat * (h.aloft ? AIR_RUDDER : 1);
  }

  /** The speed the throttle asks for: a sail's by its angle to the wind and the wind's strength. */
  function wantedSpeed(handling: WaterHandling, run: boolean): number {
    let top = run ? handling.boost : handling.speed;
    if (handling.bySail) top *= sailShare(h.windFrom) * windStrength(h.windSpeed);
    let wanted = stick.y >= 0 ? top * stick.y : handling.speed * stick.y * handling.astern;
    // A powerslide's stern key scrubs speed, it does not go astern.
    if (h.slide > 0) wanted = mix(wanted, handling.speed * SLIDE_HOLD, h.slide);
    return wanted;
  }

  /** One frame of a hull: the rudder and throttle, the slide, sliding along a shore rather than sticking to it, and a submarine's depth. */
  function sail(dt: number, input: PlayerInput, model: CraftModel): void {
    const handling = waterOf(model.kind);
    // Rudder and throttle are two levers, not a direction: see `levers`.
    levers(input.move, stick);
    const going = Math.abs(s.speed);
    const way0 = Math.hypot(s.speed, h.slip);
    const sliding = handling.slide > 0 && stick.x !== 0 && stick.y < 0 && s.speed > SLIDE_FROM && !h.aloft;
    h.slide += ((sliding ? 1 : 0) - h.slide) * approach(sliding ? 6 : 3, dt);
    if (h.slide < 1e-3) h.slide = 0;

    s.steering += (stick.x - s.steering) * approach(1 / handling.rudderTime, dt);
    if (stick.x === 0 && Math.abs(s.steering) < 1e-3) s.steering = 0;
    const carving = 1 + (Math.max(1, handling.slide) - 1) * h.slide;
    const turn = -s.steering * handling.turn * authority(handling, going) * carving * dt;
    if (turn !== 0) {
      forward.applyAxisAngle(up, turn).normalize();
      // The way it had stays where it was going: in the turned frame it is
      // partly across the bow. A left turn leaves it sliding to the right.
      const c = Math.cos(turn);
      const n = Math.sin(turn);
      const ahead = s.speed;
      s.speed = ahead * c - h.slip * n;
      h.slip = h.slip * c + ahead * n;
    }
    s.turnRate = dt > 0 ? turn / dt : 0;

    // The water takes the slide, and gives a share of its way back along
    // the bow: what a hull carves through a turn rather than scrubs off.
    const before = h.slip;
    if (!h.aloft) h.slip *= Math.exp(-handling.grip * mix(1, SLIDE_GRIP, h.slide) * dt);
    if (s.speed >= 0) s.speed = Math.sqrt(s.speed * s.speed + (before * before - h.slip * h.slip) * handling.carve * (1 - 0.2 * h.slide));
    if (Math.abs(h.slip) < 0.02) h.slip = 0;

    // The boost's punch: a press at speed lifts the nose and the throttle bites.
    const boosted = input.run && !h.boosting && handling.punch > 0 && s.speed > handling.speed * PUNCH_FROM;
    if (boosted) h.punch += handling.punch;
    h.boosting = input.run;
    if (input.jump && handling.jump > 0 && going > LEAP_FROM) h.leap = LEAP_HELD;

    const wanted = wantedSpeed(handling, input.run);
    const braking = stick.y < 0 && s.speed > 0.5 && h.slide === 0;
    const time = stick.y === 0 ? handling.coastTime : braking ? handling.brakeTime : handling.accelerationTime * (input.run && handling.punch > 0 ? BOOST_BITE : 1);
    // Aloft the jet bites nothing and the way carries on.
    if (h.aloft) s.speed *= Math.exp(-AIR_DRAG * dt);
    else s.speed += (wanted - s.speed) * approach(1 / time, dt);
    // A carved turn redirects the way it had; it gains none past what the throttle asks.
    const most = Math.max(Math.abs(wanted), way0);
    if (s.speed > 0 && Math.hypot(s.speed, h.slip) > most) s.speed = Math.sqrt(Math.max(0, most * most - h.slip * h.slip));
    if (Math.abs(s.speed) < 0.05 && stick.y === 0) s.speed = 0;

    move(dt, model);

    // The waterline rides at a fixed height, so the water is a floor with no
    // smoothing to settle: there is nothing under it that varies. A
    // submarine's rides under it by its dive. The sea's waves and a leap are
    // the pose's, over it (`hull-pose.ts`).
    if (model.kind === 'submarine') submerge(dt, model);
    else s.dive = 0;
    s.height = PLANET_RADIUS + WATERLINE - s.dive;
    position.setLength(s.height);
    s.velocity = Math.hypot(s.speed, h.slip);
  }

  /**
   * The frame's way, along the bow and across it: land ahead stops it, or
   * turns it along the shore. Astern there is nothing to slide along, so it is
   * stop or go.
   */
  function move(dt: number, model: CraftModel): void {
    // Screen right is forward x up.
    right.crossVectors(forward, up).normalize();
    way.copy(forward).multiplyScalar(s.speed).addScaledVector(right, h.slip);
    const pace = way.length();
    if (pace < 1e-6 || dt <= 0) return;
    way.multiplyScalar(1 / pace);
    // Half the hull and a margin: how far ahead land stops the boat. The margin
    // absorbs a coast lying between the three bearings `HULL_PROBES` samples,
    // which is a fact about the sampling and not about the hull.
    const reach = model.size[0] / 2 + HULL_MARGIN;
    const radius = position.length();
    const travelled = pace * dt;
    if (s.speed < 0) {
      if (clearAhead(way, (travelled + reach) / radius)) advance(way, travelled / radius);
      else s.speed = h.slip = 0;
      return;
    }
    for (const deflection of DEFLECTIONS) {
      heading.copy(way);
      if (deflection !== 0) heading.applyAxisAngle(up, deflection).normalize();
      if (!clearAhead(heading, (travelled + reach) / radius)) continue;
      if (deflection !== 0) {
        // Following the shore rather than crabbing along it: the bow swings
        // slowly towards the way the hull is actually going, and the shore
        // takes the slide.
        forward.applyAxisAngle(up, deflection * approach(1.5, dt)).normalize();
        h.slip *= 0.5;
      }
      advance(heading, (travelled * Math.cos(deflection)) / radius);
      return;
    }
    s.speed = h.slip = 0;
  }

  /**
   * A submarine's depth for the frame: down on the descend key and up on the climb
   * key, holding with neither; never deeper than `SUB_MAX_DEPTH`, and never with its
   * keel nearer the floor than `SUB_FLOOR_CLEAR`: a floor rising under it lifts it.
   */
  function submerge(dt: number, model: CraftModel): void {
    const lift = controls.lift;
    const wanted = lift < 0 ? SUB_DIVE : lift > 0 ? -SUB_RISE : 0;
    s.diveRate += (wanted - s.diveRate) * approach(1 / SUB_VERTICAL_TIME, dt);
    const floor = options.seaFloorAt === undefined
      ? 0
      : PLANET_RADIUS + WATERLINE - model.draft - SUB_FLOOR_CLEAR - options.seaFloorAt(position);
    // The rate stops at the depth the hull is held to, which is the floor or
    // `SUB_MAX_DEPTH`, the shallower: against the floor alone a submarine
    // parked at its limit over deep water kept a descending rate, and the
    // trim read off it held the nose down for as long as the key was.
    const deepest = clamp(floor, 0, SUB_MAX_DEPTH);
    s.dive = clamp(s.dive + s.diveRate * dt, 0, deepest);
    if ((s.dive === 0 && s.diveRate < 0) || (s.dive >= deepest && s.diveRate > 0)) s.diveRate = 0;
  }

  return { sail };
}

export type Water = ReturnType<typeof createWater>;
