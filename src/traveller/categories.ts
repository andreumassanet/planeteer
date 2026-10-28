/** The rail's categories, each with the framing the camera takes for it, and what a slot is called. */
import type { Slot } from '../appearance.ts';
import type { PortraitFrame, StageShot } from '../hero-stage.ts';

export type CategoryId = 'you' | 'skin' | 'hair' | 'top' | 'bottom' | 'feet' | 'pack';

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
    label: 'Rucksack',
    glyph: '<rect x="5.5" y="6.5" width="13" height="14" rx="3.6"/><path d="M9 6.5V5.2a3 3 0 0 1 6 0v1.3"/><path d="M8.6 13.4h6.8v3.6H8.6z"/>',
    shot: 'back',
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
