/**
 * A card over everything, for the few things the player has to be told before
 * or instead of the world: no WebGL 2, a touch screen, a lost graphics context,
 * a failure. **Built from `index.html`'s own markup and tokens rather than from
 * `ui.ts`**, because the first two are asked before anything is downloaded and
 * the last can be a download that failed — `ui.ts` is in the HUD's chunk, and a
 * card that needs a chunk to say the chunks did not arrive says nothing.
 *
 * Its own module, imported statically by `main.ts` so it stays in the first
 * chunk, and so that `pnpm ui` can open it on the page's real markup without
 * booting the world.
 */
import { holdFocus, registerModal } from './controls.ts';

export interface NoticeAction {
  label: string;
  primary?: boolean;
  run(): void;
}

let open = false;
registerModal(() => open);
// And the focus with the keys: `Tab` walked out of the card onto the controls
// behind it while it was still up. Added as this module loads, before any
// other card's listener, which is what lets the card over everything answer
// `Tab` first when another card is up under it (`holdFocus`).
addEventListener('keydown', (event) => {
  const card = document.getElementById('notice');
  if (open && card !== null) holdFocus(event, card);
});

/** Whether a notice is up. */
export const noticeOpen = (): boolean => open;

export function notice(title: string, text: string, actions: readonly NoticeAction[]): void {
  const root = document.getElementById('notice');
  const heading = document.getElementById('notice-title');
  const body = document.getElementById('notice-text');
  const row = document.getElementById('notice-actions');
  if (root === null || heading === null || body === null || row === null) {
    // Nowhere to put it, which is only possible if `index.html` lost it.
    alert(`${title}\n\n${text}`);
    return;
  }
  heading.textContent = title;
  body.textContent = text;
  row.replaceChildren(
    ...actions.map((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action.primary === true ? 'n-btn primary' : 'n-btn';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        // Back to the world, like the welcome card: nothing opened this one,
        // so there is no control to hand the focus back to.
        button.blur();
        root.hidden = true;
        open = false;
        action.run();
      });
      return button;
    }),
  );
  root.hidden = false;
  open = true;
  if (document.pointerLockElement !== null) document.exitPointerLock();
  (row.querySelector('.primary') as HTMLButtonElement | null)?.focus({ preventScroll: true });
}
