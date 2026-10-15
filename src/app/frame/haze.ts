/**
 * The fog and the camera's near plane. The haze follows the camera's height
 * over the ground under the player (plus a share of that ground's own
 * elevation), and every streamer is handed the same altitude, so what is
 * built and what the haze hides stay one question.
 */
import { HAZE_RADIUS, PLANET_RADIUS } from '../../globe.ts';
import { COCKPIT_NEAR } from '../../craft/body.ts';
import { fogFar } from '../../view.ts';
import type { App } from '../context.ts';
import type { Tick } from './tick.ts';

/** Share of the ground's own elevation added to the altitude, so a summit sees further than a valley without a plateau opening the haze. */
const HAZE_ELEVATION = 0.25;
/**
 * The lowest altitude handed to the haze and the streamers, units. Their
 * reaches were tuned at this height; the walking camera stands at eye level,
 * which would close the haze to a third.
 */
export const STREAM_FLOOR = 20;

/** Sets the fog and the near plane; returns the altitude for the streamers. */
export function updateHaze(app: App, tick: Tick): number {
  const { fog, rig, player } = app;
  const elevation = Math.max(0, tick.ground - PLANET_RADIUS);
  const altitude = Math.max(STREAM_FLOOR, tick.eyeOverGround + HAZE_ELEVATION * elevation);
  const horizon = Math.sqrt(2 * HAZE_RADIUS * altitude);
  // Streamers cap their reach on the same `fogFar`.
  fog.far = fogFar(altitude, HAZE_RADIUS);
  // The near edge follows the far one in when weather closes it.
  fog.near = Math.min(horizon * 0.2, fog.far * 0.3);

  // The near plane rides the camera's distance to the player, keeping depth
  // precision for coastlines from orbit. Inside a cab in first person it is
  // `COCKPIT_NEAR`, or the cabin's lining over the head would be clipped.
  const inCab = rig.firstPerson && player.ride !== null;
  const near = inCab ? COCKPIT_NEAR : Math.min(500, Math.max(0.25, rig.camera.position.distanceTo(player.position) * 0.15));
  if (Math.abs(near - rig.camera.near) > near * 0.1) {
    rig.camera.near = near;
    rig.camera.updateProjectionMatrix();
  }
  return altitude;
}
