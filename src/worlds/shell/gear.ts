/** The gear (`O`): Earth's settings card over the rows the host shares, with the world's own render distance and layer. */

import type { WorldHost, WorldSettings } from '../../world-host.ts';
import type { Hud } from '../../hud.ts';
import type { Input } from '../../input.ts';
import { createSettings } from '../../settings.ts';
import type { Settings, TimeOfDay } from '../../settings.ts';
import { DETAIL_MAX, DETAIL_MIN, autoDetail, detail, setAutoDetail, setDetail } from '../../view.ts';
import type { Cue } from '../../audio.ts';
import type { Overlay } from './overlay.ts';

/**
 * The shared rows for the `?world=` link, which has no Earth to borrow them
 * from: held for the visit, and the same shapes Earth hands a world.
 */
function standaloneSettings(): WorldSettings {
  let sensitivity = 1;
  let hints = true;
  let performance = false;
  let resolution = 'auto';
  return {
    sensitivity: { get: () => sensitivity, set: (value) => (sensitivity = value), min: 0.3, max: 3 },
    hints: { get: () => hints, set: (on) => (hints = on) },
    performance: { get: () => performance, set: (on) => (performance = on) },
    resolution: { get: () => resolution, set: (value) => (resolution = value), options: [['auto', 'Auto']] },
  };
}

export interface Gear {
  settings: Settings;
  /** Whether the frame counter is shown. */
  performanceOn(): boolean;
}

export function createGear(deps: {
  host: WorldHost;
  hud: Hud;
  input: Input;
  overlay: Overlay;
  time: TimeOfDay;
  lockTarget: HTMLElement;
  cue: (name: Cue) => void;
  /** Closes the map: one card at a time. */
  closeMap: () => void;
}): Gear {
  const { host, hud, input, overlay, time, lockTarget, cue, closeMap } = deps;
  const shared = host.settings ?? standaloneSettings();
  input.sensitivity = shared.sensitivity.get();
  hud.setHints(shared.hints.get());
  let performanceOn = shared.performance.get();
  hud.setPerformance(performanceOn);

  const settings = createSettings({
    ...shared,
    sensitivity: {
      ...shared.sensitivity,
      set: (value) => {
        input.sensitivity = shared.sensitivity.set(value);
        return input.sensitivity;
      },
    },
    hints: {
      get: () => hud.hints,
      set: (on) => hud.setHints(shared.hints.set(on)),
    },
    performance: {
      get: () => performanceOn,
      set: (on) => {
        performanceOn = shared.performance.set(on);
        hud.setPerformance(performanceOn);
        return performanceOn;
      },
    },
    // The render distance is Earth's own knob (`view.ts`): one number for
    // every world, the same slider, the same keys and the same automatic turn
    // by the frame rate; the world's loop reads it every frame.
    detail: { get: detail, set: setDetail, min: DETAIL_MIN, max: DETAIL_MAX },
    autoDetail: { get: autoDetail, set: (on) => setAutoDetail(on) },
    flags: { get: () => overlay.on, set: overlay.set },
    time,
    lockTarget,
    onOpen: () => {
      closeMap();
      cue('ui-open');
    },
    onClose: () => cue('ui-close'),
  });
  return { settings, performanceOn: () => performanceOn };
}
