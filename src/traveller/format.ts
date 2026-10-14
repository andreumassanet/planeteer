/** The creator's icons and small helpers. */
import { colourName } from '../appearance.ts';
import { PALETTE } from '../theme.ts';

/** How many steps *Undo* remembers. */
export const UNDO_DEPTH = 60;

export const UNDO = '<path d="M9.2 5.5 4.5 10.2l4.7 4.7"/><path d="M4.5 10.2h10a4.9 4.9 0 0 1 0 9.8H11"/>';
export const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
export const glyph = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** A colour's name as a person says it: the pen's ink is black hair, not "ink". */
export const spoken = (color: number): string => (color === PALETTE.ink ? 'black' : colourName(color));
