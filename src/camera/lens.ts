/**
 * The lens: its field of view follows what the player is doing.
 */
import { RUN_SPEED, WALK_SPEED } from '../avatar.ts';
import { FOV_COCKPIT, FOV_CRAFT, FOV_EYE, FOV_FOOT, FOV_RUN } from './constants.ts';
import { ramp, seated } from './math.ts';
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';

export function createLens(core: CameraCore) {
  const { camera } = core;
  const s = core.fields;

  /** Eases the lens towards the one for what you are doing; see `FOV_FOOT`. */
  function lens(player: CameraSubject, rate: number): void {
    const wanted = s.firstPerson ? (seated(player) ? FOV_COCKPIT : FOV_EYE)
      : seated(player) ? FOV_CRAFT
      : FOV_FOOT + FOV_RUN * ramp(player.velocity, WALK_SPEED, RUN_SPEED);
    if (Math.abs(wanted - camera.fov) < 0.01) return;
    camera.fov += (wanted - camera.fov) * rate;
    camera.updateProjectionMatrix();
  }

  return { lens };
}

export type Lens = ReturnType<typeof createLens>;
