/** One page of the creator for each category. */
import { CLOTH, SKINS } from '../appearance.ts';
import { h } from '../ui.ts';
import type { Category } from './categories.ts';
import type { TravellerCtx } from './ctx.ts';
import { section, slotPage, swatches, tiles } from './parts.ts';
import { change } from './state.ts';

export function page(ctx: TravellerCtx, category: Category): HTMLElement {
  ctx.building = category.id;
  const body: (Node | null)[] = [];
  switch (category.id) {
    case 'you':
      body.push(
        section(
          'Body',
          null,
          tiles(ctx, 
            'body',
            () =>
              (['man', 'woman'] as const).map((kind) => ({
                key: kind,
                label: kind === 'man' ? 'Man' : 'Woman',
                // A body is its own wardrobe, so switching keeps the colours
                // and takes that body's first of everything.
                look: () => (ctx.look.body === kind ? ctx.look : { ...ctx.look, body: kind, head: 0, top: 0, bottom: 0, feet: 0 }),
                chosen: () => ctx.look.body === kind,
                pick: () => {
                  if (ctx.look.body !== kind) change(ctx, { ...ctx.look, body: kind, head: 0, top: 0, bottom: 0, feet: 0 });
                },
              })),
            true,
          ),
        ),
      );
      break;
    case 'skin':
      body.push(swatches(ctx, 'Tone', SKINS, () => ctx.look.skin, (skin) => change(ctx, { ...ctx.look, skin }), (_, index) => `tone ${index + 1} of ${SKINS.length}`, true));
      break;
    case 'hair':
      body.push(...slotPage(ctx, 'head'));
      break;
    case 'top':
    case 'bottom':
    case 'feet':
      body.push(...slotPage(ctx, category.id));
      break;
    case 'pack':
      body.push(
        section(
          'On your back',
          null,
          tiles(ctx, 
            'pack',
            () =>
              [false, true].map((on) => ({
                key: String(on),
                label: on ? 'Rucksack' : 'Nothing',
                look: () => ({ ...ctx.look, pack: on }),
                chosen: () => ctx.look.pack === on,
                pick: () => change(ctx, { ...ctx.look, pack: on }),
              })),
            true,
          ),
        ),
        // A colour picked is a rucksack worn: nobody chooses the colour of nothing.
        swatches(ctx, 'Colour', CLOTH, () => ctx.look.packColour, (packColour) => change(ctx, { ...ctx.look, packColour, pack: true })),
      );
      break;
  }
  return h(
    'div',
    { class: 'cr-page', role: 'tabpanel', id: `cr-page-${category.id}`, 'aria-label': category.label },
    h('div', { class: 'cr-title', text: category.label }),
    h('p', { class: 'cr-note', text: category.note }),
    ...body,
  );
}
