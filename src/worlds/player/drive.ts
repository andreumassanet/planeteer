/** In a craft: the controls it is given, the walls it meets, the seat the body takes, getting in and getting out. */

import { AVATAR_HEIGHT } from '../../avatar.ts';
import type { InputState } from '../../input.ts';
import type { Craft } from '../craft.ts';
import { RIGHT, UP } from './frame.ts';
import type { PlayerState } from './state.ts';

/**
 * Out of a craft this high over the ground or higher is out of an aircraft in
 * flight: the body falls and opens a canopy, as on Earth (`player.ts`'s
 * `bailOut`), carrying `BAIL_CARRY` of the craft's speed. Under it, it is
 * stepping down beside it.
 */
const BAIL_HEIGHT = AVATAR_HEIGHT;
const BAIL_CARRY = 0.45;
/** Under this height over the ground a craft meets walls; over it, nothing is tall enough to. */
const CRAFT_WALLS_UNDER = 40;

/** One step of driving: the craft under the keys, pushed out of walls, with the body seated in it. */
export function drive(s: PlayerState, dt: number, input: InputState): void {
  const c = s.craft!;
  c.update(
    dt,
    {
      throttle: input.move.y,
      steer: input.move.x,
      climb: input.climb,
      // A ship's run key is its afterburner and it comes down on the
      // descend key alone, as Earth's plane does (the lander, the
      // saucer); anything else sinks on either.
      descend: c.boosts ? input.dive : input.dive || input.run,
      boost: input.run,
    },
    s.world.groundAt,
    s.gravity,
    s.world.radius,
  );
  // Walls, as on Earth: a vehicle on the ground or low over it is
  // pushed out of buildings, outposts, towers and other craft, and
  // loses its way into them; well clear of the ground nothing stands.
  const clear = c.position.length() - (s.world.radius + s.world.groundAt(c.position));
  if (clear < CRAFT_WALLS_UNDER && s.world.collide(c.position, c.radius * 0.8)) {
    c.speed *= -0.2;
    c.object.position.copy(c.position);
  }
  s.position.copy(c.position);
  s.facing.copy(c.heading);
  // Standing in a basket, as a balloon's crew do on Earth; else seated
  // as the craft's seat says, the legs to its pedals and the hands on
  // what it is steered by, turned with it (`Craft.pose`, `Craft.turn`).
  if (c.standing) s.avatar.stride(dt, 0, false);
  else s.avatar.sit(dt, c.pose ?? undefined, c.turn);
  s.avatar.group.position.copy(c.seat);
  s.avatar.group.quaternion.identity();
}

/** Gets the body into `next`: whatever fall was under way is over, and the body is seated or standing in it. */
export function board(s: PlayerState, next: Craft): void {
  s.craft = next;
  // Whatever fall was under way is over: no canopy left hanging in the sky.
  s.chute = false;
  s.canopy = 0;
  s.spread = 0;
  if (s.parachute !== null) s.parachute.visible = false;
  s.velocity.set(0, 0, 0);
  s.vertical = 0;
  s.airborne = false;
  s.avatar.emote(null);
  s.home = s.avatar.group.parent;
  next.object.add(s.avatar.group);
  s.avatar.group.userData.pilot = true;
  // Seen through the glass of a closed craft (`cockpit.ts`), and over the
  // side of an open one; hidden only in a hull no seated body fits.
  s.avatar.group.visible = !next.closed;
  s.avatar.group.position.copy(next.seat);
  s.avatar.group.quaternion.identity();
}

/** Out of the craft, onto the ground beside it, or over its side and falling if it is in flight. */
export function leave(s: PlayerState): void {
  if (s.craft === null) return;
  const c = s.craft;
  s.craft = null;
  c.object.remove(s.avatar.group);
  s.avatar.group.userData.pilot = false;
  s.home?.add(s.avatar.group);
  s.avatar.group.visible = true;
  const up = UP.copy(c.position).normalize();
  const side = RIGHT.crossVectors(c.heading, up).normalize();
  const from = c.position.length();
  s.position.copy(c.position).addScaledVector(side, -(c.radius + 1.6));
  s.facing.copy(c.heading);
  s.vertical = 0;
  s.avatar.reset();
  const ground = s.world.radius + s.world.groundAt(s.position);
  if (c.airborne && from - ground > BAIL_HEIGHT) {
    // Out of an aircraft in flight: over the side and falling, going the
    // way it was; the craft, let go of, comes down by itself and parks.
    s.position.setLength(Math.max(from, ground + 1));
    s.motion.copy(c.heading).multiplyScalar(Math.max(0, c.speed) * BAIL_CARRY);
    s.velocity.copy(s.motion);
    s.airborne = true;
    s.chute = true;
    s.canopy = 0;
    s.spread = 0;
    s.steering = 0;
    return;
  }
  s.position.setLength(ground);
  s.airborne = false;
}
