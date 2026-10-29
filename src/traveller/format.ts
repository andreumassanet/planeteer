/** The creator's icons and small helpers. */
import { colourName } from '../appearance.ts';
import { PALETTE } from '../theme.ts';

/** How many steps *Undo* remembers. */
export const UNDO_DEPTH = 60;

export const UNDO = '<path d="M9.2 5.5 4.5 10.2l4.7 4.7"/><path d="M4.5 10.2h10a4.9 4.9 0 0 1 0 9.8H11"/>';
export const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
export const RESET = '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4.2h4.2"/>';
/** A whole figure, and a head: the creator's two framings. */
export const BODY = '<circle cx="12" cy="4.6" r="2.2"/><path d="M12 7.5v7.2M8 10.2h8M12 14.7l-3 5.8M12 14.7l3 5.8"/>';
export const FACE = '<circle cx="12" cy="12" r="8"/><path d="M9.2 10.5v.6M14.8 10.5v.6M9 15c1.7 1.4 4.3 1.4 6 0"/>';
export const glyph = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** A colour's name as a person says it: the pen's ink is black hair, not "ink". */
export const spoken = (color: number): string => (color === PALETTE.ink ? 'black' : colourName(color));
