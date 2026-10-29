/**
 * Out of an aircraft in flight: the fall, and the canopy to come.
 */
import { AVATAR_HEIGHT } from '../avatar.ts';
import { BAIL_CARRY, BODY_RADIUS, EJECT_BACK, EJECT_RISE } from './constants.ts';
import type { PlayerCore } from './core.ts';
import type { Frame } from './frame.ts';
import type { Stance } from './stance.ts';
import type { BodyRig } from './body.ts';
import type { Publish } from './publish.ts';
import type { Presentation } from './presentation.ts';

export function createBailOut(
  core: PlayerCore,
  frame: Frame,
  stance: Stance,
  body: BodyRig,
  published: Publish,
  presentation: Presentation,
) {
  const { bow, direction, forward, motion, position, probe, standingRadius, up } = core;
  const s = core.fields;
  const { pointAhead } = frame;
  const { still } = stance;
  const { dropRide, seatOf } = body;
  const { publish } = published;
  const { pose } = presentation;

  /** Out of an aircraft in flight: the body leaves by the side the seat is on, going the way the aircraft was, and falls; `glide` has it from there. */
  function bailOut(): void {
    const held = s.ride!;
    const where = seatOf(held);
    const way = held.seat === 0 ? s.speed : s.velocity;
    bow.copy(forward);
    // The door: the seat's side, clear of the fuselage or the basket.
    direction.copy(forward).applyAxisAngle(up, where.x >= 0 ? Math.PI / 2 : -Math.PI / 2).normalize();
    const reach = held.model.size[1] / 2 + BODY_RADIUS + 0.8;
    const from = position.length();
    pointAhead(direction, (held.model.kind === 'plane' ? AVATAR_HEIGHT : reach) / from, probe);
    dropRide();
    still();
    position.copy(probe).setLength(Math.max(from, standingRadius(probe) + 1));
    up.copy(position).normalize();
    forward.copy(bow).projectOnPlane(up).normalize();
    s.height = position.length();
    s.speed = Math.max(0, way) * BAIL_CARRY;
    s.velocity = s.speed;
    motion.copy(forward).multiplyScalar(s.speed);
    s.vertical = 0;
    s.airborne = true;
    s.state = 'foot';
    s.chute = true;
    s.canopy = 0;
    s.spread = 0;
    publish();
    pose(0, 0);
  }

  /**
   * Out of a wreck: the body thrown up and back from the impact, falling, the
   * canopy opening over the ground as a bail's does (`CHUTE_FORCED`).
   */
  function eject(): void {
    bailOut();
    motion.copy(forward).multiplyScalar(-EJECT_BACK);
    s.speed = EJECT_BACK;
    s.velocity = s.speed;
    s.vertical = EJECT_RISE;
    publish();
  }

  return { bailOut, eject };
}

export type BailOut = ReturnType<typeof createBailOut>;
