/** Whose keys they are: the cards that hold the keyboard, the focus inside them, and the one predicate that says when the keys are not the world's. */

const modals = new Set<() => boolean>();

/**
 * A card that holds the keyboard while it is open: the settings, the welcome
 * card, a notice. Returns the unregister. Not the world map, deliberately: `M`
 * has to close it, and a map you can fly under is worth more than a map that
 * freezes the plane.
 */
export function registerModal(isOpen: () => boolean): () => void {
  modals.add(isOpen);
  return () => modals.delete(isOpen);
}

/**
 * Whether a card that holds the keyboard is up, whatever has the focus: for a
 * screen with keys of its own behind it (the menu's `Esc` and `Enter`) whose own
 * buttons are not the card's and must keep answering.
 */
export function modalOpen(): boolean {
  for (const open of modals) if (open()) return true;
  return false;
}

const tabCards = new Set<() => boolean>();

/**
 * A card that takes `Tab` while it is up and leaves every other key to the world:
 * the pause card, whose buttons a keyboard could not reach while `Tab` meant
 * something behind it. Its own `keydown` walks its controls with `holdFocus`;
 * `player-list.ts` asks `tabTaken` and leaves the key alone. Returns the unregister.
 */
export function registerTabCard(isUp: () => boolean): () => void {
  tabCards.add(isUp);
  return () => tabCards.delete(isUp);
}

/** Whether a card that takes `Tab` is up. */
export function tabTaken(): boolean {
  for (const up of tabCards) if (up()) return true;
  return false;
}

/** What `Tab` can land on inside a card. */
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';

/**
 * Walks `Tab` and `Shift+Tab` round a modal card's own controls, from its last to
 * its first and back, and from anywhere outside it onto it. Call it from the
 * card's own `keydown` while the card is open; it returns whether it moved the
 * focus. It takes every `Tab`, not only the two at the ends, so that two cards up
 * at once cannot pull the focus between them: the notice, which is over everything
 * and whose listener is added first, answers the key, and the card under it finds
 * it answered (`defaultPrevented`) and leaves it.
 */
export function holdFocus(event: KeyboardEvent, card: Element): boolean {
  if (event.code !== 'Tab' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;
  event.preventDefault();
  const controls = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0,
  );
  // Nothing on the card takes the focus, so nowhere else may either.
  if (controls.length === 0) return false;
  const at = controls.indexOf(document.activeElement as HTMLElement);
  const step = event.shiftKey ? -1 : 1;
  const next = at < 0 ? (step > 0 ? 0 : controls.length - 1) : (at + step + controls.length) % controls.length;
  controls[next]!.focus();
  return true;
}

/** Anything a key typed into is meant for. */
const EDITABLE = 'input, select, textarea';
/** And anything a key pressed on is meant for, when it is on a dialog. */
const CONTROL = 'button, a[href], [role="button"], [role="switch"], [role="slider"], [role="tab"]';
const DIALOG = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/**
 * Whether the keys are not the world's right now.
 *
 * True while a modal card is open, while an input method is composing, when the
 * key was typed into a field, and when it was pressed on a button or a switch
 * that lives on a dialog. Without an event, checks the focused element before a
 * frame consumes held input. Key releases still clear held keys even when
 * blocked; only their browser behaviour is left alone.
 */
export function inputBlocked(event?: Event): boolean {
  for (const open of modals) if (open()) return true;
  if ((event as KeyboardEvent | undefined)?.isComposing === true) return true;
  const target = event?.target ?? (typeof document === 'undefined' ? null : document.activeElement);
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  if (target.closest(EDITABLE) !== null || (target instanceof HTMLElement && target.isContentEditable)) return true;
  return target.closest(CONTROL) !== null && target.closest(DIALOG) !== null;
}
