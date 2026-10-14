/** The drawn land as the grass and the wood stand on it, gathered round the viewer while the camera is low. */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { groundRadius } from '../globe.ts';
import { landProbeOf } from '../land-probe.ts';
import type { LandProbe } from '../land-probe.ts';

/**
 * How high over the ground the camera may be and the land still be gathered
 * round the viewer: the grass's widest ring (237 units) and the probe's own
 * `MOVE` (400) with room to spare. Gathering is a pass over the land mesh, a
 * slice a frame, and at cruise it is work for nothing.
 */
const LAND_PREPARE_HEIGHT = 900;

export interface LandAccess {
  /** Built here rather than in `main.ts` so the index is in the deferred chunk. Undefined without a land mesh. */
  land: LandProbe | undefined;
  /** Whether the drawn land answered round the viewer this frame; near fields lie on the relief, and are built again, until it does. */
  ready(): boolean;
  /** Gathers the land round the viewer while the camera is low enough for the grass to be drawn. */
  prepare(viewer: THREE.Vector3, camera: THREE.Camera | undefined): void;
}

export function createLandAccess(world: World, mesh: THREE.Mesh | undefined): LandAccess {
  const land = mesh === undefined ? undefined : landProbeOf(mesh);
  let landReady = false;
  const eyeDirection = new THREE.Vector3();
  const eyeAt = new THREE.Vector3();

  function prepare(viewer: THREE.Vector3, camera: THREE.Camera | undefined): void {
    if (land === undefined || camera === undefined) {
      landReady = false;
      return;
    }
    const eye = camera.getWorldPosition(eyeAt);
    // Over the ground under the camera, not over the sea: a valley in the Alps is 600 units above it.
    eyeDirection.copy(eye).normalize();
    const height = Math.max(0, eye.length() - groundRadius(world, eyeDirection));
    landReady = height < LAND_PREPARE_HEIGHT && land.prepare(viewer);
  }

  return { land, ready: () => landReady, prepare };
}
