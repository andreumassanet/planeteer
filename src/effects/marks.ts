/** The player's own marks: what his craft leaves as he moves it. */
import { PALETTE } from '../theme.ts';
import { CAR_BOOST, FOUNDER_FLOAT, PLANE_ROTATE } from '../vehicles.ts';
import type { EffectsSubject } from './types.ts';
import { H, topSpeed, HULLS, SUBMERGED, ENGINES, QUIET, isJump } from './constants.ts';
import { E_DUST, E_RING, E_SWIM, E_TAXI } from './layout.ts';
import { rand, clamp } from './helpers.ts';
import type { Pools } from './pools.ts';
import { createSpawners } from './spawn.ts';
import { createEmitters } from './emitters.ts';
import { createTyres } from './tyres.ts';

export function createPlayerMarks(fx: Pools) {
  const { ribbonBroken, MINE, stats, last, lastForward, mine, right, at, motion, delta, fwdAt, axis } = fx;
  const { spawnDisc, local, owed, spaced, shareOf } = createSpawners(fx);
  const { wake, contrail, exhaust, wheels, flame, rooster, downwash } = createEmitters(fx);
  const { tyres, boostFlame } = createTyres(fx);
  /* --- the player's own marks ------------------------------------------ */

  /** Forget the player's motion: the next frame starts his emitters afresh and joins no ribbon to the last. */
  function resetMine(s: EffectsSubject): void {
    last.copy(s.position);
    lastForward.copy(s.forward);
    fx.hasLast = true;
    fx.speedAlong = 0;
    fx.climb = 0;
    fx.accel = 0;
    fx.turnRate = 0;
    fx.lastBoost = 0;
    mine.fill(0);
    for (let i = 0; i < 3; i++) ribbonBroken[MINE[i]!] = 1;
  }

  function playerMarks(dt: number, s: EffectsSubject): void {
    const model = s.ride?.model ?? null;
    const kind = model?.kind ?? null;
    const up = s.up;
    const fwd = s.forward;
    right.crossVectors(up, fwd).normalize();
    delta.subVectors(s.position, last);
    const run = delta.length();
    // Boarding, stepping out, a teleport: a jump, not a move.
    if (!fx.hasLast || dt <= 0 || model !== fx.lastModel || s.state !== fx.lastState || isJump(run, dt, kind)) {
      if (fx.hasLast && dt > 0) stats.jumps++;
      fx.lastModel = model;
      fx.lastState = s.state;
      resetMine(s);
      return;
    }
    const top = topSpeed(kind);
    const along = clamp(delta.dot(fwd) / dt, -top, top);
    const rising = delta.dot(up) / dt;
    fx.accel += ((along - fx.speedAlong) / dt - fx.accel) * Math.min(1, dt * 6);
    fx.speedAlong = along;
    fx.climb += (rising - fx.climb) * Math.min(1, dt * 4);
    axis.crossVectors(lastForward, fwd);
    const turned = Math.atan2(axis.dot(up), lastForward.dot(fwd));
    fx.turnRate += (turned / dt - fx.turnRate) * Math.min(1, dt * 8);
    last.copy(s.position);
    lastForward.copy(fwd);
    // The velocity the particles inherit a share of, in units a second.
    motion.copy(delta).multiplyScalar(1 / dt);

    // Under the surface, nothing marks it: the bubbles are `sea-life.ts`'s.
    if ((s.depth ?? 0) > SUBMERGED) return;
    if (s.state === 'swim' && kind === null) {
      // Rings round a swimmer, closer together moving, and a little trail of discs.
      const moving = Math.abs(along) > 1;
      for (let j = 0, n = owed(mine, E_RING, moving ? 2.2 : 0.9, dt); j < n; j++) {
        local(s.position, fwd, up, right, 0, 0, 0, at, (j + 0.5) / n);
        spawnDisc(at, fwdAt.set(0, 0, 0), 1.6, H * 0.3, H * (moving ? 0.8 : 1.0), 0.8, 0);
      }
      if (moving) {
        for (let j = 0, n = spaced(mine, E_SWIM, run, H * 0.3); j < n; j++) {
          local(s.position, fwd, up, right, rand(-0.1, 0.1) * H, 0, -H * 0.25, at, shareOf(j));
          spawnDisc(at, fwdAt.set(0, 0, 0), 1.3, H * 0.12, H * 0.3, 0, 0);
        }
      }
      return;
    }
    if (model === null) return;
    const [length, width, height] = model.size;
    const speed = Math.abs(along);

    if (kind !== null && HULLS.has(kind)) {
      wake(mine, MINE, s.position, fwd, up, right, along, run, length, width, dt);
      if (kind === 'jetski') rooster(mine, s.position, fwd, up, right, speed, length, dt);
    } else if ((s.foundering ?? -1) >= 0 && s.foundering! < FOUNDER_FLOAT) {
      // Into the water on wheels or come down on it: a wake while it floats and its way dies.
      wake(mine, MINE, s.position, fwd, up, right, along, run, length, width, dt);
    } else if (kind === 'helicopter') {
      if (s.airborne) downwash(mine, s.position, up, s.clearance ?? Infinity, s.overWater === true, Math.max(length, width) * 0.5, dt);
    } else if (kind === 'plane') {
      if (s.airborne) contrail(mine, s.position, fwd, up, right, speed, run, length, height, fx.accel);
      else if (speed > 12) {
        // The take-off run and the roll-out: dust off the main wheels, or on
        // grass the wash of the propeller lifting a little of it.
        const hex = fx.paved ? null : fx.dust ?? PALETTE.bone;
        if (hex !== null) {
          const rate = 30 * clamp(speed / PLANE_ROTATE, 0, 1);
          wheels(mine, E_TAXI, s.position, fwd, up, right, motion, length * 0.4, width * 0.3, rate, hex, H * (fx.dust === null ? 0.18 : 0.3), dt);
        }
      }
    } else if (kind !== null && QUIET.has(kind)) {
      // Dust off the tyres or the hooves, on bare ground, at a canter or a sprint.
      if (!s.airborne && !fx.paved && fx.dust !== null && speed > 8) {
        wheels(mine, E_DUST, s.position, fwd, up, right, motion, length, width * 0.5, 22 * clamp(speed / 30, 0, 1), fx.dust, H * 0.3, dt);
      }
      // A bicycle's back wheel skids on one track; a horse never slides.
      if (!s.airborne && kind === 'bicycle') tyres(s, s.position, fwd, up, right, motion, speed, run, 0, length * 0.35, width, dt);
    } else if (kind !== null && ENGINES.has(kind)) {
      exhaust(mine, s.position, fwd, up, right, along, fx.accel, motion, length, width, height, dt);
      boostFlame(s, s.position, fwd, up, right, motion, length, width, height, dt);
      if (!s.airborne) {
        if (!fx.paved && fx.dust !== null && speed > 10) {
          wheels(mine, E_DUST, s.position, fwd, up, right, motion, length, width, 30 * clamp(speed / CAR_BOOST, 0, 1), fx.dust, H * 0.4, dt);
        }
        // Sliding: smoke and marks off the rear tyres, one track on two wheels.
        tyres(s, s.position, fwd, up, right, motion, speed, run, kind === 'motorbike' ? 0 : width * 0.76, length * 0.33, width, dt);
      }
    } else if (kind === 'balloon') {
      const burner = model.burner;
      if (burner !== undefined && fx.climb > 0.3) flame(mine, s.position, up, burner, dt);
    }
  }

  return { playerMarks, resetMine };
}
