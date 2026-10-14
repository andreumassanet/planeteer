/**
 * Hulls: boats, jet skis, sailboats and the submarine, driven on the water's surface or under it.
 */
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
import { DEFLECTIONS, HULL_MARGIN, waterOf } from './constants.ts';
import { approach, clamp, levers } from './math.ts';
import type { PlayerInput } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';

export function createWater(core: PlayerCore, frame: Frame) {
  const { controls, direction, forward, options, position, stick, up } = core;
  const s = core.fields;
  const { advance, clearAhead } = frame;

  /** One frame of a hull: the rudder and throttle, sliding along a shore rather than sticking to it, and a submarine's depth. */
  function sail(dt: number, input: PlayerInput, model: CraftModel): void {
    const handling = waterOf(model.kind);
    // Rudder and throttle are two levers, not a direction: see `levers`.
    levers(input.move, stick);
    s.steering += (stick.x - s.steering) * approach(1 / handling.rudderTime, dt);
    if (stick.x === 0 && Math.abs(s.steering) < 1e-3) s.steering = 0;
    const turn = -s.steering * handling.turn * dt;
    if (turn !== 0) forward.applyAxisAngle(up, turn).normalize();
    s.turnRate = dt > 0 ? turn / dt : 0;

    const top = input.run ? handling.boost : handling.speed;
    // Astern is deliberately weak: it is for getting off a rock, not for
    // sailing backwards across an ocean.
    const wanted = stick.y >= 0 ? top * stick.y : handling.speed * stick.y * handling.astern;
    s.speed += (wanted - s.speed) * approach(1 / handling.accelerationTime, dt);
    if (Math.abs(s.speed) < 0.05) s.speed = 0;

    // Half the hull and a margin: how far ahead land stops the boat. The margin
    // absorbs a coast lying between the three bearings `HULL_PROBES` samples,
    // which is a fact about the sampling and not about the hull.
    const reach = model.size[0] / 2 + HULL_MARGIN;
    const radius = position.length();
    const travelled = s.speed * dt;
    if (travelled !== 0) {
      direction.copy(forward);
      let arc = 0;
      if (travelled < 0) {
        // Astern there is nothing to slide along, so it is stop or go.
        if (clearAhead(direction.copy(forward).negate(), -(travelled - reach) / radius)) {
          arc = travelled / radius;
          direction.copy(forward);
        } else s.speed = 0;
      } else {
        let deflected = 0;
        let clear = false;
        for (const deflection of DEFLECTIONS) {
          direction.copy(forward);
          if (deflection !== 0) direction.applyAxisAngle(up, deflection).normalize();
          if (!clearAhead(direction, (travelled + reach) / radius)) continue;
          arc = (travelled * Math.cos(deflection)) / radius;
          deflected = deflection;
          clear = true;
          break;
        }
        if (!clear) s.speed = 0;
        // Following the shore rather than crabbing along it: the bow swings
        // slowly towards the way the hull is actually going.
        else if (deflected !== 0) forward.applyAxisAngle(up, deflected * approach(1.5, dt)).normalize();
      }
      advance(direction, arc);
    }

    // The waterline rides at a fixed height, so the water is a floor with no
    // smoothing to settle: there is nothing under it that varies. A
    // submarine's rides under it by its dive.
    if (model.kind === 'submarine') submerge(dt, model);
    else s.dive = 0;
    s.height = PLANET_RADIUS + WATERLINE - s.dive;
    position.setLength(s.height);
    s.velocity = Math.abs(s.speed);
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
