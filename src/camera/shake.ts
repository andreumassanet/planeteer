/**
 * A knock felt through the lens: an offset laid on after the chase and taken off before the next one, so it never feeds the chase.
 */
import { SHAKE_REACH, SHAKE_TIME } from './constants.ts';
import type { CameraCore } from './core.ts';

export function createShake(core: CameraCore) {
  const { camera, shakeAxis, shaken } = core;
  const s = core.fields;

  /** A knock of `strength` 0 to 1; nothing at all while `core.rig.shakes` is off. */
  function shake(strength: number): void {
    if (!core.rig.shakes || !(strength > 0)) return;
    s.shakePower = Math.max(s.shakePower * (s.shakeLeft / SHAKE_TIME), Math.min(1, strength));
    s.shakeLeft = SHAKE_TIME;
  }

  /** Takes last frame's shake off the lens, so the chase starts from where it left it. */
  function unshake(): void {
    camera.position.sub(shaken);
    shaken.set(0, 0, 0);
  }

  /** Lays this frame's shake on: two incommensurate sines across the lens's own right and up, dying as the square of the time left. */
  function shakeStep(dt: number): void {
    if (s.shakeLeft <= 0) return;
    s.shakeLeft = Math.max(0, s.shakeLeft - dt);
    s.shakeClock += dt;
    if (!core.rig.shakes) {
      s.shakeLeft = 0;
      return;
    }
    const fall = s.shakeLeft / SHAKE_TIME;
    const reach = SHAKE_REACH * s.shakePower * fall * fall;
    shakeAxis.set(1, 0, 0).applyQuaternion(camera.quaternion);
    shaken.copy(shakeAxis).multiplyScalar(Math.sin(s.shakeClock * 47) * reach);
    shakeAxis.set(0, 1, 0).applyQuaternion(camera.quaternion);
    shaken.addScaledVector(shakeAxis, Math.sin(s.shakeClock * 61 + 1.3) * reach * 0.7);
    camera.position.add(shaken);
  }

  return { shake, unshake, shakeStep };
}

export type Shake = ReturnType<typeof createShake>;
