/**
 * The lens: its field of view follows what the player is doing.
 */
import { RUN_SPEED, WALK_SPEED } from '../avatar.ts';
import { FOV_COCKPIT, FOV_CRAFT, FOV_EYE, FOV_FOOT, FOV_RUN, FOV_RUSH } from './constants.ts';
import { ramp, seated } from './math.ts';
import { spring } from '../player/math.ts';
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';

/** The rush's spring, a second: a ring's punch opens the lens over a tenth of a second or so rather than in one frame. */
const RUSH_SPRING = 14;

export function createLens(core: CameraCore) {
  const { camera } = core;
  const s = core.fields;
  const sprung: [number, number] = [0, 0];

  /**
   * Eases the lens towards the one for what you are doing (see `FOV_FOOT`),
   * twice in a row so it never starts with a kink, then opens it by the rush
   * as a critically damped spring follows it. `rate` 1 is a snap; `dt` is the
   * frame's, for the spring.
   */
  function lens(player: CameraSubject, rate: number, dt = 0): void {
    const wanted = s.firstPerson ? (seated(player) ? FOV_COCKPIT : FOV_EYE)
      : seated(player) ? FOV_CRAFT
      : FOV_FOOT + FOV_RUN * ramp(player.velocity, WALK_SPEED, RUN_SPEED);
    const rush = core.rig.rush;
    const asked = Number.isFinite(rush) ? Math.min(1, Math.max(0, rush)) : 0;
    if (rate >= 1) {
      s.fovMid = s.fovBase = wanted;
      s.rushNow = asked;
      s.rushRate = 0;
    } else {
      const twice = 1 - (1 - rate) * (1 - rate);
      s.fovMid += (wanted - s.fovMid) * twice;
      s.fovBase += (s.fovMid - s.fovBase) * twice;
      spring(s.rushNow, s.rushRate, asked, RUSH_SPRING, dt, sprung);
      s.rushNow = Math.min(1.2, Math.max(-0.2, sprung[0]));
      s.rushRate = sprung[1];
    }
    const fov = s.fovBase + FOV_RUSH * s.rushNow;
    if (Math.abs(fov - camera.fov) < 0.01) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  return { lens };
}

export type Lens = ReturnType<typeof createLens>;
