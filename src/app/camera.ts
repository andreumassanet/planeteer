/** The third-person camera rig and the keyboard and mouse. */
import { createCameraRig } from '../camera.ts';
import type { CameraRig } from '../camera.ts';
import { createInput } from '../input.ts';
import type { Input } from '../input.ts';
import type { App } from './context.ts';
import { SHAKE_KEY, readSetting } from './storage.ts';

export function createRigAndInput(app: App): { rig: CameraRig; input: Input } {
  const { settlements, monuments, vegetation, launchPads, query } = app;
  const rig = createCameraRig({
    blocks: (point) => settlements.blocksSight(point) || monuments.blocksSight(point) || vegetation.blocksSight(point) || launchPads.blocksSight(point),
    seesThrough: true,
  });
  // A crash shakes the camera unless turned off, or the system asks for reduced motion and nothing was chosen.
  const shakeSaved = readSetting(SHAKE_KEY);
  rig.shakes = shakeSaved === null ? !matchMedia('(prefers-reduced-motion: reduce)').matches : shakeSaved === '1';
  // `?height=N` starts the camera that far up.
  const heightQuery = query.get('height');
  if (heightQuery !== null && Number.isFinite(Number(heightQuery))) rig.view.height = Number(heightQuery);
  const input = createInput(app.renderer.domElement, {
    // An embed that may not lock the mouse.
    onLockRefused: () => app.announce('This page cannot lock the mouse — drag to look around', 'mouse'),
  });
  return { rig, input };
}
