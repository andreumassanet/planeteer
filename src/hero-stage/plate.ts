/** The name plate over the hero's head: show, edit and keep the traveller's name. */
import type { HeroCtx } from './ctx.ts';
import { CHECK, glyph, PEN } from './glyph.ts';

export function refreshName(ctx: HeroCtx): void {
  const { nameText, options, plate } = ctx;
  const name = options.name.get();
  nameText.textContent = name === '' ? 'Traveller' : name;
  nameText.classList.toggle('empty', name === '');
  plate.title = name === '' ? 'No name yet: the others see a traveller with a number' : '';
}

export function editName(ctx: HeroCtx): void {
  const { nameInput, nameText, options, pen } = ctx;
  if (ctx.editing) return;
  ctx.editing = true;
  nameInput.value = options.name.get();
  nameText.hidden = true;
  nameInput.hidden = false;
  pen.innerHTML = glyph(CHECK);
  pen.title = 'Keep this name (Enter)';
  pen.setAttribute('aria-label', 'Keep this name');
  nameInput.focus({ preventScroll: true });
  nameInput.select();
}

export function stopEditing(ctx: HeroCtx, keep: boolean): void {
  const { nameInput, nameListeners, nameText, options, pen } = ctx;
  if (!ctx.editing) return;
  ctx.editing = false;
  if (keep) {
    const kept = options.name.set(nameInput.value);
    for (const listener of nameListeners) listener(kept);
  }
  nameInput.hidden = true;
  nameText.hidden = false;
  pen.innerHTML = glyph(PEN);
  pen.title = 'Change your name';
  pen.setAttribute('aria-label', 'Change your name');
  refreshName(ctx);
}

export function bindPlate(ctx: HeroCtx): void {
  const { nameInput, nameText, pen } = ctx;
  // The pen keeps the focus off the field as it is pressed, so a click on it
  // while editing is a Keep and not a blur and then an Edit.
  pen.addEventListener('pointerdown', (event) => event.preventDefault());
  pen.addEventListener('click', () => {
    if (ctx.editing) {
      stopEditing(ctx, true);
      pen.focus({ preventScroll: true });
    } else editName(ctx);
  });
  nameText.addEventListener('dblclick', () => editName(ctx));
  nameInput.addEventListener('keydown', (event) => {
    // Not the card's keys as well: Escape here is a cancel, not a close.
    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      event.stopPropagation();
      stopEditing(ctx, true);
      pen.focus({ preventScroll: true });
    } else if (event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stopEditing(ctx, false);
      pen.focus({ preventScroll: true });
    }
  });
  nameInput.addEventListener('blur', () => stopEditing(ctx, true));
}
