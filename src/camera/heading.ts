/**
 * Carrying the heading across the surface.
 */
import type { CameraSubject } from './types.ts';
import type { CameraCore } from './core.ts';

export function createHeading(core: CameraCore) {
  const { heading, lastUp, steer, transport } = core;

  /**
   * Carries the heading across the surface. Rotating it by the rotation that took
   * the old surface normal to the new one is parallel transport along the path
   * walked: the camera keeps pointing at the same feature while you walk over a pole.
   */
  function align(player: CameraSubject): void {
    if (lastUp.lengthSq() === 0) lastUp.copy(player.up);
    transport.setFromUnitVectors(lastUp, player.up);
    heading.applyQuaternion(transport);
    steer.applyQuaternion(transport);
    lastUp.copy(player.up);

    heading.projectOnPlane(player.up);
    if (heading.lengthSq() < 1e-8) heading.copy(player.forward);
    heading.normalize();
    steer.projectOnPlane(player.up);
    if (steer.lengthSq() < 1e-8) steer.copy(heading);
    steer.normalize();
  }

  return { align };
}

export type Heading = ReturnType<typeof createHeading>;
