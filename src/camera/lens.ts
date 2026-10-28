/**
 * The lens: its field of view follows what the player is doing.
 */
import { RUN_SPEED, WALK_SPEED } from '../avatar.ts';
import { FOV_COCKPIT, FOV_CRAFT, FOV_EYE, FOV_FOOT, FOV_RUN, FOV_RUSH } from './constants.ts';
import { ramp, seated } from './math.ts';
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';

export function createLens(core: CameraCore) {
  const { camera } = core;
  const s = core.fields;

  /** Eases the lens towards the one for what you are doing (see `FOV_FOOT`), then opens it by the rush. */
  function lens(player: CameraSubject, rate: number): void {
    const wanted = s.firstPerson ? (seated(player) ? FOV_COCKPIT : FOV_EYE)
      : seated(player) ? FOV_CRAFT
      : FOV_FOOT + FOV_RUN * ramp(player.velocity, WALK_SPEED, RUN_SPEED);
    s.fovBase += (wanted - s.fovBase) * rate;
    const rush = core.rig.rush;
    const fov = s.fovBase + FOV_RUSH * (Number.isFinite(rush) ? Math.min(1, Math.max(0, rush)) : 0);
    if (Math.abs(fov - camera.fov) < 0.01) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  return { lens };
}

export type Lens = ReturnType<typeof createLens>;
