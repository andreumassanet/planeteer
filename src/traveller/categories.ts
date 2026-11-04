/** The rail's categories, each with the framing the camera takes for it, and what a slot is called. */
import type { Slot } from '../appearance.ts';
import type { PortraitFrame, StageShot } from '../hero-stage.ts';

export type CategoryId = 'you' | 'skin' | 'hair' | 'hat' | 'top' | 'bottom' | 'feet' | 'pack' | 'trail' | 'title' | 'canopy' | 'pet';

export interface Category {
  id: CategoryId;
  label: string;
  /** The rail's picture: strokes on a 24-unit grid, as `ui.ts` draws its icons. */
  glyph: string;
  shot: StageShot;
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'you',
    label: 'You',
    glyph: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.3c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.2 10h3.3M14.2 13.5h3.3"/>',
    shot: 'full',
  },
  {
    id: 'skin',
    label: 'Skin',
    glyph: '<path d="M12 3.5c3.1 3.7 5.6 6.9 5.6 10.1a5.6 5.6 0 0 1-11.2 0c0-3.2 2.5-6.4 5.6-10.1z"/><path d="M9.6 14.2a2.6 2.6 0 0 0 2 2.4"/>',
    shot: 'head',
  },
  {
    id: 'hair',
    label: 'Hair',
    glyph: '<circle cx="12" cy="13.5" r="6.3"/><path d="M5.7 12.6C6.6 8.4 9 6 12 6s5.4 2.4 6.3 6.6c-2.6-.3-5-1.6-6.3-3.6-1.3 2-3.7 3.3-6.3 3.6z"/>',
    shot: 'head',
  },
  {
    id: 'hat',
    label: 'Hat',
    glyph: '<path d="M3.5 17h17"/><path d="M6.8 17c0-5.4 2.3-9 5.2-9s5.2 3.6 5.2 9"/><path d="M7.3 13.6h9.4"/>',
    shot: 'hat',
  },
  {
    id: 'top',
    label: 'Top',
    glyph: '<path d="M8.7 3.8 4.2 6.2 2.6 11l3 1.2 1.6-1.5v9.8h9.6v-9.8l1.6 1.5 3-1.2-1.6-4.8-4.5-2.4c-.5 1.5-1.8 2.4-3.3 2.4s-2.8-.9-3.3-2.4z"/>',
    shot: 'top',
  },
  {
    id: 'bottom',
    label: 'Bottom',
    glyph: '<path d="M6.6 3.6h10.8l1.5 16.8h-4.6L12 9.6l-2.3 10.8H5.1z"/><path d="M6.6 7h10.8"/>',
    shot: 'legs',
  },
  {
    id: 'feet',
    label: 'Shoes',
    glyph: '<path d="M3.5 7.5v9h17v-1.4c0-1.8-1.4-3-3.3-3.4L12.3 10.6 9.6 7.5z"/><path d="M3.5 13.8h17M12.3 10.6l-1.6 1.6M14.6 11.2l-1.4 1.5"/>',
    shot: 'feet',
  },
  {
    id: 'pack',
    label: 'Back',
    glyph: '<rect x="5.5" y="6.5" width="13" height="14" rx="3.6"/><path d="M9 6.5V5.2a3 3 0 0 1 6 0v1.3"/><path d="M8.6 13.4h6.8v3.6H8.6z"/>',
    shot: 'carry',
  },
  {
    id: 'trail',
    label: 'Trail',
    glyph: '<path d="M10 4.5l1.6 4.4 4.4 1.6-4.4 1.6L10 16.5l-1.6-4.4L4 10.5l4.4-1.6z"/><circle cx="17.6" cy="16.4" r="1.5"/><circle cx="14.6" cy="20" r="0.9"/>',
    shot: 'full',
  },
  {
    id: 'title',
    label: 'Title',
    glyph: '<path d="M3.5 8h17v6.5h-17z"/><path d="M3.5 14.5 6 17.5l1.4-3M20.5 14.5 18 17.5l-1.4-3"/><path d="M7.5 11.2h9"/>',
    shot: 'head',
  },
  {
    id: 'canopy',
    label: 'Canopy',
    glyph: '<path d="M3.5 11.5a8.5 6.8 0 0 1 17 0z"/><path d="M3.5 11.5 12 19.5l8.5-8M9 11.5 12 19.5l3-8"/>',
    shot: 'full',
  },
  {
    id: 'pet',
    label: 'Pet',
    glyph: '<circle cx="12" cy="15.6" r="3.6"/><circle cx="6.6" cy="10.8" r="1.7"/><circle cx="9.9" cy="7" r="1.7"/><circle cx="14.1" cy="7" r="1.7"/><circle cx="17.4" cy="10.8" r="1.7"/>',
    shot: 'full',
  },
];

export const SLOT_FRAME: Readonly<Record<Slot, PortraitFrame>> = { head: 'head', top: 'top', bottom: 'bottom', feet: 'feet' };
export const SLOT_COLOUR: Readonly<Record<Slot, 'hair' | 'topColour' | 'bottomColour' | 'feetColour'>> = {
  head: 'hair',
  top: 'topColour',
  bottom: 'bottomColour',
  feet: 'feetColour',
};
export const SLOT_WORD: Readonly<Record<Slot, string>> = { head: 'Style', top: 'Top', bottom: 'Bottom', feet: 'Shoes' };
