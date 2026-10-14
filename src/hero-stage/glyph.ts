/** The name plate's pen and check icons. */

export const PEN = '<path d="M4.5 19.5l1-4.4L15.6 5a2.1 2.1 0 0 1 3 3L8.5 18.5z"/><path d="M13.6 7l3 3"/>';
export const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
export const glyph = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
