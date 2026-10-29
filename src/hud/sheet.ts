/** The sheet on a touch screen: what the bar's buttons and a few keys offer in one place. */
import { registerModal } from '../controls.ts';
import { isTouch, tap } from '../touch.ts';
import { h, icon, type IconName } from '../ui.ts';
import type { HudCtx } from './ctx.ts';

export function bindSheet(ctx: HudCtx): void {
  const { moreButton, options, sheet, sheetClose, sheetGrid, signal, unregister } = ctx;
  unregister.push(registerModal(() => ctx.sheetOpen));
  /** What the sheet offers: the bar's buttons, and what only a key did. */
  const sheetItems: { glyph: IconName; label: string; run(): void }[] = [
    { glyph: 'map', label: 'World map', run: () => options.onMap?.() },
    ...(options.onPassport === undefined ? [] : [{ glyph: 'passport', label: 'Passport', run: () => options.onPassport?.() }]),
    { glyph: 'talk', label: 'Chat', run: () => tap('chat') },
    { glyph: 'camera', label: 'Photo', run: () => tap('photo') },
    { glyph: 'eye', label: 'First person', run: () => tap('view') },
    { glyph: 'flag', label: 'Borders', run: () => tap('flags') },
    { glyph: 'hand', label: 'Wave', run: () => tap('wave') },
    { glyph: 'sparkle', label: 'Dance', run: () => tap('dance') },
    ...(options.leave === undefined ? [] : [{ glyph: 'exit', label: options.leave.label, run: () => options.leave?.run() }]),
    { glyph: 'gear', label: 'Settings', run: () => options.onSettings?.() },
  ];
  sheetGrid.replaceChildren(
    ...sheetItems.map((item) => {
      const tile = h('button', { class: 'ui-btn atlas-sheet-tile', type: 'button' }, icon(item.glyph), h('span', { text: item.label }));
      tile.addEventListener('click', () => {
        closeSheet();
        item.run();
      }, { signal });
      return tile;
    }),
  );
  function openSheet(): void {
    ctx.sheetOpen = true;
    sheet.classList.add('on');
  }
  function closeSheet(): void {
    if (!ctx.sheetOpen) return;
    ctx.sheetOpen = false;
    sheet.classList.remove('on');
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
  moreButton.addEventListener('click', openSheet, { signal });
  sheetClose.addEventListener('click', closeSheet, { signal });
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) closeSheet();
  }, { signal });
  addEventListener('keydown', (event) => {
    if (ctx.sheetOpen && event.code === 'Escape') closeSheet();
  }, { signal });
  // The minimap is the map's button on a touch screen, wherever it was put.
  document.addEventListener('click', (event) => {
    if (isTouch() && event.target instanceof Element && event.target.closest('#minimap') !== null) options.onMap?.();
  }, { signal });
}
