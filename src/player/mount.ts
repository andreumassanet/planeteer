/**
 * Getting into a seat, and being carried in one.
 */
import type { WirePose } from '../craft/contract.ts';
import { motionOf } from '../craft/motion.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { WATERLINE } from '../vehicles.ts';
import { isAir } from './constants.ts';
import type { Held } from './core.ts';
import type { Ride } from './types.ts';
import type { PlayerCore } from './core.ts';
import type { Stance } from './stance.ts';
import type { BodyRig } from './body.ts';
import type { Publish } from './publish.ts';
import type { Presentation } from './presentation.ts';

export function createMount(
  core: PlayerCore,
  stance: Stance,
  body: BodyRig,
  published: Publish,
  presentation: Presentation,
) {
  const { craft, forward, position, standingRadius, up } = core;
  const s = core.fields;
  const { stand, still } = stance;
  const { applyBody, dropRide } = body;
  const { publish } = published;
  const { pose } = presentation;

  /** Into a seat, with the vehicle standing at `at`, and going at `going` along its bow when at the controls of one still rolling. */
  function board(next: Ride, at: WirePose, going = 0): void {
    if (s.sitting) stand();
    // How fast the body was going, read before it lets go of what carried
    // it: a passenger taking the controls aloft goes on at it.
    const carriedSpeed = s.velocity;
    dropRide();
    const held: Held = { ...next, motion: motionOf(next.group, next.model) };
    s.ride = held;
    s.chute = false;
    s.canopy = 0;
    s.tumbling = false;
    s.state = 'seated';
    still();
    position.set(at[0]!, at[1]!, at[2]!);
    up.copy(position).normalize();
    forward.set(at[3]!, at[4]!, at[5]!).projectOnPlane(up);
    if (forward.lengthSq() < 1e-8) forward.set(0, 1, 0).projectOnPlane(up);
    forward.normalize();
    const kind = next.model.kind;
    if (next.model.medium === 'water') position.setLength(PLANET_RADIUS + WATERLINE);
    s.height = position.length();
    s.altitude = s.height - PLANET_RADIUS;
    // A plane or a balloon is taken standing on the ground, which is the
    // only place one can be left.
    s.grounded = isAir(kind) && s.height - standingRadius(position) < 1.5;
    s.airborne = isAir(kind) && !s.grounded;
    if (!s.airborne && next.seat === 0) {
      s.speed = going;
      s.velocity = Math.abs(going);
    } else if (s.airborne && next.seat === 0) {
      // Aloft the controls are taken in flight (`takeControls` in
      // `fleet.ts`): at a standstill a plane hung in the air and built its
      // speed back from nothing.
      s.speed = Math.max(Math.abs(going), carriedSpeed);
      s.velocity = s.speed;
    }
    next.group.position.set(0, 0, 0);
    next.group.quaternion.identity();
    next.group.scale.setScalar(1);
    craft.add(next.group);
    applyBody();
    publish();
    pose(0, 0);
  }

  /** A passenger is carried: stands the vehicle, and the player in it, at a pose somebody else drives. */
  function carry(at: WirePose): void {
    position.set(at[0]!, at[1]!, at[2]!);
    up.copy(position).normalize();
    forward.set(at[3]!, at[4]!, at[5]!).projectOnPlane(up);
    if (forward.lengthSq() < 1e-8) forward.set(0, 1, 0).projectOnPlane(up);
    forward.normalize();
    s.height = position.length();
    if (s.ride !== null && isAir(s.ride.model.kind)) s.grounded = s.height - standingRadius(position) < 1.5;
    // A passenger in a submarine is as deep as it is: what keeps them in
    // it under the surface, the lens under the water and the depth sent.
    if (s.ride !== null && s.ride.model.kind === 'submarine') s.dive = Math.max(0, PLANET_RADIUS + WATERLINE - s.height);
  }

  return { board, carry };
}

export type Mount = ReturnType<typeof createMount>;
