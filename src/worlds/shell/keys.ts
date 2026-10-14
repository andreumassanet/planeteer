/** The keys that are not controls, from `controls.ts`'s one table, as on Earth. */

import type { Hud } from '../../hud.ts';
import { actionOf, inputBlocked, labelOf } from '../../controls.ts';
import { DETAIL_MAX, DETAIL_MIN, detail, setDetail } from '../../view.ts';
import type { Emote } from '../../../server/src/limits.ts';
import type { Overlay } from './overlay.ts';

export function bindKeys(deps: { hud: Hud; overlay: Overlay; gesture: (name: Emote) => boolean; photo: () => void; signal: AbortSignal }): void {
  const { hud, overlay, gesture, photo, signal } = deps;
  addEventListener(
    'keydown',
    (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (inputBlocked(event)) return;
      const action = actionOf(event.code);
      // The render distance repeats while held, as on Earth; the toggles do not.
      if (action === 'nearer') hud.toast(`Render distance ${setDetail(Math.max(DETAIL_MIN, detail() / 1.25)).toFixed(2)}×`, 'eye');
      else if (action === 'farther') hud.toast(`Render distance ${setDetail(Math.min(DETAIL_MAX, detail() * 1.25)).toFixed(2)}×`, 'eye');
      else if (event.repeat) return;
      else if (action === 'flags') hud.toast(overlay.set(!overlay.on) ? 'Nations and borders on' : 'Nations and borders off', 'flag');
      else if (action === 'hud') hud.toast(hud.toggleHidden() ? `Everything hidden · ${labelOf('hud')} brings it back` : 'Everything back', 'eye');
      else if (action === 'photo') photo();
      else if ((action === 'wave' || action === 'dance') && !gesture(action)) hud.toast('Only standing on the ground', 'walk');
    },
    { signal },
  );
}
