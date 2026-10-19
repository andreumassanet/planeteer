/**
 * Standing up off a bench, and coming to a standing start.
 */
import { STAND_STEP } from './constants.ts';
import type { PlayerCore } from './core.ts';

export function createStance(core: PlayerCore) {
  const { avatar, axis, controls, forward, motion, position, standingRadius, up } = core;
  const s = core.fields;

  /** Up off a bench: the clip let go, and a pace forward, off the seat's front and clear of its frame, which is a wall to a body walking into it. */
  function stand(): void {
    if (!s.sitting) return;
    s.sitting = false;
    avatar.emote(null);
    const arc = STAND_STEP / Math.max(1, position.length());
    axis.crossVectors(up, forward).normalize();
    position.applyAxisAngle(axis, arc);
    forward.applyAxisAngle(axis, arc).normalize();
    up.copy(position).normalize();
    s.height = standingRadius(position);
    position.setLength(s.height);
  }

  /** Back to a standing start: no speed, no turn, no flight. */
  function still(): void {
    motion.set(0, 0, 0);
    s.speed = 0;
    s.velocity = 0;
    s.vertical = 0;
    s.airborne = false;
    s.lean = 0;
    s.tilt = 0;
    s.bowLift = 0;
    s.surge = 0;
    s.wheelie = 0;
    s.spool = 0;
    s.nose = 0;
    s.swing = 0;
    s.aloft = 0;
    s.turnRate = 0;
    s.roll = 0;
    s.aerobatic = false;
    s.recovering = false;
    s.attitude.identity();
    s.elevator = 0;
    s.aileron = 0;
    s.climbRate = 0;
    s.climbing = 0;
    s.goAround = 0;
    s.rolling = false;
    s.steering = 0;
    s.dive = 0;
    s.diveRate = 0;
    s.founder = -1;
    s.founderWay = 0;
    controls.lift = 0;
  }

  return { stand, still };
}

export type Stance = ReturnType<typeof createStance>;
