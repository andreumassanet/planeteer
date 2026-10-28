/**
 * A hull on the sea, as the pose draws it: heaving, pitching and rolling on
 * the waves under its bow, its stern and its two sides, each a spring with the
 * hull's own weight in it, so a launch wallows and a jet ski chatters; up onto
 * the plane and banked into a turn; thrown clear of a crest, or off `Space`,
 * and slapped back down with spray; heeled to leeward by its sail; and a
 * submarine pitched into its dive and bursting back up through the surface.
 *
 * None of it moves the player: the hull's position stays on its waterline
 * (`water.ts`), and all of this is under it in `craft`.
 */
import * as THREE from 'three';
import type { MotionInput } from '../craft/motion.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { SUB_DIVE, SUB_UNDER, WATERLINE } from '../vehicles.ts';
import type { WaterHandling } from '../vehicles.ts';
import { BANK_SMOOTHING, BOW_LIFT, BOW_RISE, BOW_SETTLE, BOW_SMOOTHING, GRAVITY, HEEL_OUT, SUB_PITCH, waterOf } from './constants.ts';
import type { Held, PlayerCore } from './core.ts';
import {
  DRAW_FROM,
  HEAVE,
  LUFF_FROM,
  PITCH,
  ROLL,
  STILL_AIR,
  WIND_EVERY,
  seaAt,
  seaOf,
  stepWaves,
  windAgainst,
  windStrength,
} from './hull.ts';
import { approach, clamp } from './math.ts';

/** The share of the sea's rise and fall the hull's middle follows: a hull spans the troughs. */
const HEAVE_SHARE = 0.6;
/** The springs' stiffness for a hull of one unit's length, per second squared; a longer hull is slower. */
const HEAVE_K = 240;
const PITCH_K = 200;
const ROLL_K = 160;
/** How much stiffer a planing hull's springs are at its cruise, as a multiple, for a bow that lifts `BOW_LIFT`. */
const PLANING_STIFF = 2.5;
/** Their damping, as a share of critical: under it, so a wave leaves a little swing behind it. */
const DAMPING = 0.45;
/** The longest step the springs take, seconds. */
const SPRING_STEP = 1 / 60;
/** A crest throws a hull clear only above this speed off it, units a second; at most this; and not again within this many seconds of landing. */
const HOP_MIN = 2.5;
const HOP_MAX = 16;
const HOP_REST = 0.35;
/** Aloft, the share of the flight path the nose follows, and its most either way, radians. */
const AIR_NOSE = 0.6;
const AIR_NOSE_MAX = 0.35;
/** Coming down at a unit a second: how fast the hull is pushed into the water, and the nose slapped down, radians a second. */
const LAND_GIVE = 0.35;
const LAND_SLAP = 0.05;
/** The way a landing takes off at fifteen units a second of impact, as a share. */
const LAND_SCRUB = 0.06;
/** A powerslide's spray, seconds apart. */
const SPRAY_EVERY = 0.09;
/** A submarine breaking the surface: the heave a unit a second of rise gives it, units a second; and its slow drift under water, units. */
const BREACH_POP = 0.6;
const HOVER = 0.12;
/** How fast the sea follows the wind, per second. */
const SEA_EASE = 0.3;

const smooth = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export function createHullPose(core: PlayerCore) {
  const { craft, forward, options, position, up } = core;
  const s = core.fields;
  const h = s.hull;
  const right = new THREE.Vector3();
  const splashPoint = new THREE.Vector3();
  const target = new Float64Array(3);
  const stiffness = new Float64Array(3);

  /** The wind against the bow, asked a few times a second, and the sea it raises. */
  function breeze(dt: number): void {
    h.windClock -= dt;
    if (h.windClock <= 0) {
      h.windClock = WIND_EVERY;
      const wind = options.windAt?.() ?? STILL_AIR;
      if (Number.isFinite(wind.from) && Number.isFinite(wind.speed)) {
        h.windBearing = wind.from;
        h.windSpeed = Math.max(0, wind.speed);
      }
    }
    h.windFrom = windAgainst(h.windBearing, up, forward);
    h.sea += (seaOf(h.windSpeed) - h.sea) * approach(SEA_EASE, dt);
  }

  /** Water thrown up `along` the bow and `across` to the right of the hull's middle, on the surface. */
  function splash(along: number, across: number, reach: number): void {
    if (options.onSplash === undefined) return;
    right.crossVectors(forward, up).normalize();
    splashPoint.copy(position).addScaledVector(forward, along).addScaledVector(right, across).setLength(PLANET_RADIUS + WATERLINE);
    options.onSplash(splashPoint, reach);
  }

  /**
   * The heel, eased after the rudder. A left turn is a positive `turnRate`,
   * and a positive roll leans the hull right. Slow, a hull is a displacement
   * hull and heels a little out of the turn; on the plane (`pace` 1) it banks
   * into it the whole `limit`, and further in a powerslide.
   */
  function bank(dt: number, handling: WaterHandling, pace: number): void {
    const limit = handling.heel * (1 + 0.6 * h.slide);
    const wanted = clamp(s.turnRate / handling.turn, -1.5, 1.5) * limit * (HEEL_OUT - (1 + HEEL_OUT) * pace);
    s.lean += (wanted - s.lean) * approach(BANK_SMOOTHING, dt);
  }

  /** A sail's heel to leeward: most on a beam reach in a breeze, none in irons, where the sail luffs, nor dead before the wind. */
  function heelOf(handling: WaterHandling, going: number): number {
    if (!handling.bySail) return 0;
    const off = Math.abs(h.windFrom);
    const drawing = smooth((off - LUFF_FROM) / (DRAW_FROM - LUFF_FROM));
    const pace = clamp(going / handling.speed, 0, 1.3);
    return -Math.sign(h.windFrom) * handling.list * Math.sin(off) * windStrength(h.windSpeed) * drawing * (0.35 + 0.65 * pace);
  }

  function launch(speed: number, float: number, length: number): void {
    h.aloft = true;
    h.hop = Math.max(h.springs[HEAVE]!, float);
    h.hopRate = speed;
    splash(-length * 0.35, 0, 1);
  }

  /**
   * Off a crest or on `Space`, and down again: a crest throws a fast hull
   * clear when the sea under it stops rising, by how fast it was rising; in
   * the air it falls as a body does; and it comes down into the sea it lands
   * on, harder the faster, with spray.
   */
  function leapOrLand(dt: number, handling: WaterHandling, going: number, rate: number, float: number, length: number, width: number, driving: boolean): void {
    h.sinceLanding += dt;
    if (!h.aloft) {
      if (rate > 0) h.rising = Math.max(h.rising, rate);
      else if (h.surfaceRate > 0 && h.rising > 0) {
        const fast = clamp((going - 0.4 * handling.speed) / (0.6 * handling.speed), 0, 1.3);
        const speed = h.rising * handling.kick * fast;
        if (speed > HOP_MIN && h.sinceLanding > HOP_REST) launch(Math.min(speed, HOP_MAX), float, length);
        h.rising = 0;
      }
      if (h.leap > 0) {
        launch(handling.jump + Math.max(0, rate), float, length);
        h.leap = 0;
      }
      return;
    }
    h.leap = Math.max(0, h.leap - dt);
    // Exact under constant gravity, so the arc is the same at any frame rate.
    h.hop += (h.hopRate - 0.5 * GRAVITY * dt) * dt;
    h.hopRate -= GRAVITY * dt;
    if (h.hop > float || h.hopRate > 0) return;
    const impact = Math.max(0, rate * HEAVE_SHARE - h.hopRate);
    h.aloft = false;
    h.sinceLanding = 0;
    h.springs[HEAVE] = float;
    h.springs[HEAVE + 1] = -impact * LAND_GIVE;
    h.springs[PITCH + 1] = h.springs[PITCH + 1]! + impact * LAND_SLAP;
    splash(-length * 0.15, 0, clamp(width * 0.5 + impact * 0.18, 1, 5));
    if (driving) s.speed *= 1 - LAND_SCRUB * clamp(impact / 15, 0, 1);
  }

  /** A submarine going under, and breaking back out: water over its bow, and a burst up through the surface. */
  function surfacing(dt: number, length: number, width: number): void {
    const half = SUB_UNDER * 0.5;
    const rising = dt > 0 ? (h.lastDive - s.dive) / dt : 0;
    if (h.lastDive > half && s.dive <= half && rising > 2) {
      splash(0, 0, clamp(width * 0.6 + rising * 0.25, 2, 5));
      h.springs[HEAVE + 1] = h.springs[HEAVE + 1]! + rising * BREACH_POP;
    } else if (h.lastDive < half && s.dive >= half) splash(length * 0.3, 0, width * 0.5);
    h.lastDive = s.dive;
  }

  /** The springs, stepped no longer than `SPRING_STEP` at a time so a long frame stays stable. */
  function settle(dt: number): void {
    const steps = Math.max(1, Math.ceil(dt / SPRING_STEP - 1e-6));
    const step = dt / steps;
    for (let n = 0; n < steps; n++) {
      for (let i = 0; i < 3; i++) {
        const k = stiffness[i]!;
        const at = i * 2;
        const rate = h.springs[at + 1]! + (k * (target[i]! - h.springs[at]!) - 2 * DAMPING * Math.sqrt(k) * h.springs[at + 1]!) * step;
        h.springs[at + 1] = rate;
        h.springs[at] = h.springs[at]! + rate * step;
      }
    }
  }

  /** Poses a hull for the frame: `speed_` is what a passenger is carried at. */
  function ride(held: Held, dt: number, speed_: number): void {
    const model = held.model;
    const kind = model.kind;
    const handling = waterOf(kind);
    const [length, width] = model.size;
    const driving = held.seat === 0;
    const ahead = driving ? s.speed : speed_;
    const going = Math.abs(ahead);
    // How far onto the plane the hull is: 0 standing, 1 at its cruise.
    const pace = clamp(going / handling.speed, 0, 1);
    breeze(dt);
    stepWaves(h, dt, ahead, driving ? h.slip : 0);

    const sub = kind === 'submarine';
    const under = sub ? clamp(s.dive / SUB_UNDER, 0, 1) : 0;
    const feel = 1 - under;
    const surface = seaAt(h, 0, 0) * feel;
    const rate = dt > 0 ? (surface - h.surface) / dt : 0;
    h.surface = surface;
    const float = surface * HEAVE_SHARE + BOW_RISE * pace * feel;
    leapOrLand(dt, handling, going, rate, float, length, width, driving);
    h.surfaceRate = rate;
    if (sub) surfacing(dt, length, width);

    bank(dt, handling, pace);
    // The bow comes up as the hull climbs onto the plane and settles a
    // little once it is over the hump, eased like the hull's own weight.
    const wantedBow = handling.bow * pace - BOW_SETTLE * (handling.bow / BOW_LIFT) * clamp((going - handling.speed) / (handling.boost - handling.speed), 0, 1);
    s.bowLift += (wantedBow - s.bowLift) * approach(BOW_SMOOTHING, dt);

    // The waves under the bow and the stern pitch it, under its two sides roll it.
    const fore = seaAt(h, length * 0.4, 0);
    const aft = seaAt(h, -length * 0.4, 0);
    const port = seaAt(h, 0, -width * 0.5);
    const starboard = seaAt(h, 0, width * 0.5);
    target[0] = float + (sub ? Math.sin(s.swell * 0.5) * HOVER * under : 0);
    target[1] = (-Math.atan2(fore - aft, length * 0.8) - s.bowLift) * feel;
    target[2] = Math.atan2(port - starboard, width) * feel + s.lean + heelOf(handling, going);
    if (sub) {
      // The attitude is the path: the bow goes down into a dive and up out of one.
      target[1] += clamp(Math.atan2(s.diveRate, Math.max(going, 3)), -SUB_PITCH, SUB_PITCH);
      target[2] *= 1 - 0.7 * under;
    }
    if (h.aloft) target[1] = -clamp(Math.atan2(h.hopRate, Math.max(going, 5)) * AIR_NOSE, -AIR_NOSE_MAX, AIR_NOSE_MAX) - s.bowLift;
    // A planing hull rides stiff on its cushion of water, and chatters over the chop.
    const soft = (sub ? 1 - 0.5 * under : 1) * (1 + PLANING_STIFF * pace * (handling.bow / BOW_LIFT));
    stiffness[0] = clamp(HEAVE_K / length, 12, 60) * soft;
    stiffness[1] = clamp(PITCH_K / length, 10, 50) * soft;
    stiffness[2] = clamp(ROLL_K / length, 8, 40) * soft;
    // The boost's punch lifts the nose.
    h.springs[PITCH + 1] = h.springs[PITCH + 1]! - h.punch;
    h.punch = 0;
    settle(dt);

    // A powerslide throws a sheet of water off its outside.
    if (driving && h.slide > 0.35 && going > 8 && !h.aloft) {
      h.spray -= dt;
      if (h.spray <= 0) {
        h.spray = SPRAY_EVERY;
        const outside = Math.sign(h.slip) || -Math.sign(s.steering);
        splash(-length * 0.15, outside * width * 0.7, 1 + 1.2 * h.slide + Math.abs(h.slip) * 0.04);
      }
    } else h.spray = 0;

    craft.position.y = h.aloft ? h.hop : h.springs[HEAVE]!;
    craft.rotation.set(h.springs[PITCH]!, 0, h.springs[ROLL]!);
  }

  /** What a hull's rig and planes are handed: the wind on its sail, and a submarine's planes into its dive. */
  function dress(held: Held, input: MotionInput): void {
    input.windFrom = h.windFrom;
    input.windSpeed = h.windSpeed;
    if (held.model.kind === 'submarine') input.elevator = -clamp(s.diveRate / SUB_DIVE, -1, 1);
  }

  return { ride, dress };
}

export type HullPose = ReturnType<typeof createHullPose>;
