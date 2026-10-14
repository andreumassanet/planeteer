/**
 * A card over everything, for what the player must be told before or instead
 * of the world: no WebGL 2, a lost graphics context, a failure. It uses
 * `index.html`'s own markup and styles rather than `ui.ts`, because it may
 * have to report that the chunks holding `ui.ts` failed to download. Kept in
 * the first chunk, and testable on the page's markup without the world.
 */
import { holdFocus, registerModal } from './controls.ts';

export interface NoticeAction {
  label: string;
  primary?: boolean;
  /** `Esc` presses it. Only for a dismissal, never a reload. */
  escape?: boolean;
  run(): void;
}

/** The action `Esc` presses on the card up now, if it has one. */
let onEscape: (() => void) | null = null;

let open = false;
registerModal(() => open);
// Keeps `Tab` inside the card. Registered as the module loads, before any
// other card's listener, so this card answers first when another is open under it.
addEventListener('keydown', (event) => {
  const card = document.getElementById('notice');
  if (open && card !== null) holdFocus(event, card);
  if (open && event.code === 'Escape' && onEscape !== null) {
    // Stopped here, or the screen behind would take the same `Esc` once the card closes.
    event.preventDefault();
    event.stopImmediatePropagation();
    onEscape();
  }
});

/** Whether a notice is up. */
export const noticeOpen = (): boolean => open;

/** Shows the card with `actions` as its buttons; each closes it before running. */
export function notice(title: string, text: string, actions: readonly NoticeAction[]): void {
  const root = document.getElementById('notice');
  const heading = document.getElementById('notice-title');
  const body = document.getElementById('notice-text');
  const row = document.getElementById('notice-actions');
  if (root === null || heading === null || body === null || row === null) {
    // Only if `index.html` lost the markup.
    alert(`${title}\n\n${text}`);
    return;
  }
  heading.textContent = title;
  body.textContent = text;
  onEscape = null;
  row.replaceChildren(
    ...actions.map((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action.primary === true ? 'n-btn primary' : 'n-btn';
      button.textContent = action.label;
      const press = (): void => {
        // Nothing opened this card, so there is no control to return focus to.
        button.blur();
        root.hidden = true;
        open = false;
        onEscape = null;
        action.run();
      };
      button.addEventListener('click', press);
      if (action.escape === true) onEscape = press;
      return button;
    }),
  );
  root.hidden = false;
  open = true;
  // Browsers without Pointer Lock report `undefined` here, hence `!=`.
  if (document.pointerLockElement != null && typeof document.exitPointerLock === 'function') {
    document.exitPointerLock();
  }
  (row.querySelector('.primary') as HTMLButtonElement | null)?.focus({ preventScroll: true });
}
