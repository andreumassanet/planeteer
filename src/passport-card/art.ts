/** Small pieces of page art: the folded corner, a world's disc, a continent's rose, the holder's portrait. */
import { PALETTE } from '../theme.ts';
import { hex } from '../ui.ts';
import { CLOTH, HAIR, SKINS } from '../appearance.ts';
import type { Appearance } from '../appearance.ts';
import { PAPER_BACK } from './constants.ts';

/**
 * A page's corner, folded back: the page under it in the triangle past the
 * fold, the flap of this one over it with its underside showing, and an
 * arrow on the flap once the pointer is on it. Drawn for the right-hand
 * corner; the left one is the same, mirrored by its class.
 */
export function cornerSvg(id: string): string {
  const ink = hex(PALETTE.ink);
  return (
    `<svg viewBox="0 0 84 84" aria-hidden="true"><defs><linearGradient id="${id}" x1="1" y1="1" x2="0" y2="0">` +
    `<stop offset="0" stop-color="#fffaf4"/><stop offset="1" stop-color="${PAPER_BACK}"/></linearGradient></defs>` +
    `<path d="M84 0V84H0Z" fill="${PAPER_BACK}"/>` +
    `<path d="M84 9V84H9" fill="none" stroke="${ink}" stroke-opacity="0.25" stroke-width="2"/>` +
    `<path d="M84 0V84H0" fill="none" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path class="p-flap" d="M84 0L0 84V0Z" fill="url(#${id})" stroke="${ink}" stroke-width="3.5" stroke-linejoin="round"/>` +
    `<path class="p-arrow" d="M22 17l10 11-10 11" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}

/**
 * A world as its tab and its frontispiece draw it: a disc in the body's
 * colour, lit from the upper left with the night on its right, Earth with
 * land on it and Saturn in its ring.
 */
export function worldDisc(body: string, colour: number): string {
  const ink = hex(PALETTE.ink);
  const fill = hex(colour);
  const land =
    body === 'earth'
      ? `<path d="M9 13c3-4 9-5 11-2s-2 5 1 8-3 7-6 5-4-4-6-6 0-3 0-5zM24 24c3-1 7 1 7 4s-4 6-6 5-3-7-1-9z" fill="${hex(PALETTE.green)}"/>`
      : '';
  const ring =
    body === 'saturn'
      ? (back: boolean) =>
          `<ellipse cx="20" cy="20" rx="25" ry="6.5" transform="rotate(-18 20 20)" fill="none" stroke="${ink}" stroke-width="2.4"` +
          (back ? ' stroke-opacity="0.45"' : '') +
          '/>'
      : () => '';
  return (
    `<svg viewBox="0 0 40 40" aria-hidden="true" overflow="visible">` +
    ring(true) +
    `<circle cx="20" cy="20" r="17" fill="${fill}"/>` +
    land +
    `<path d="M20 3a17 17 0 0 1 0 34a10 17 0 0 0 0-34z" fill="${ink}" fill-opacity="0.2"/>` +
    '<ellipse cx="13.5" cy="12.5" rx="4.5" ry="3.2" fill="#fff" fill-opacity="0.3"/>' +
    `<circle cx="20" cy="20" r="17" fill="none" stroke="${ink}" stroke-width="2.6"/>` +
    // The near half of the ring, in front of the planet.
    (body === 'saturn' ? `<path d="M43.78 12.27A25 6.5 -18 0 1 -3.78 27.73" fill="none" stroke="${ink}" stroke-width="2.4"/>` : '') +
    '</svg>'
  );
}

/** One continent's seal on its visa page: a rose of the winds in its ink. */
export function seal(colour: string): string {
  return (
    `<svg viewBox="0 0 48 48" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round" aria-hidden="true">` +
    '<circle cx="24" cy="24" r="21"/><circle cx="24" cy="24" r="16" stroke-width="1" stroke-dasharray="1.5 2.5"/>' +
    `<path d="M24 7 28 20 41 24 28 28 24 41 20 28 7 24 20 20z" fill="${colour}" fill-opacity="0.25"/></svg>`
  );
}

/**
 * The traveller's photograph: the shoulders in their top's colour, the head
 * and neck in their skin, the hair over it, against a studio blue. A sketch
 * of the colours they chose rather than a render, which a passport photo
 * never flattered anyone with either.
 */
export function portrait(appearance: Appearance | null): string {
  const colour = (table: readonly number[], index: number, fallback: number): string => hex(table[index] ?? fallback);
  const skin = appearance === null ? hex(PALETTE.blush) : colour(SKINS, appearance.skin, PALETTE.blush);
  const hair = appearance === null ? hex(PALETTE.bark) : colour(HAIR, appearance.hair, PALETTE.bark);
  const top = appearance === null ? hex(PALETTE.crimson) : colour(CLOTH, appearance.topColour, PALETTE.crimson);
  const long = appearance?.body === 'woman';
  const ink = hex(PALETTE.ink);
  return (
    `<svg viewBox="0 0 124 156" aria-hidden="true"><rect width="124" height="156" fill="${hex(PALETTE.skyBlue)}" opacity="0.55"/>` +
    '<path d="M0 118h124" stroke="#fff" stroke-opacity="0.35" stroke-width="30"/>' +
    (long ? `<path d="M34 70c-4 26-2 44 6 56h44c8-12 10-30 6-56z" fill="${hair}" stroke="${ink}" stroke-width="2.5"/>` : '') +
    `<path d="M10 160c2-26 18-38 52-38s50 12 52 38z" fill="${top}" stroke="${ink}" stroke-width="2.5"/>` +
    `<path d="M52 104h20v20c-3 6-17 6-20 0z" fill="${skin}" stroke="${ink}" stroke-width="2.5"/>` +
    `<ellipse cx="62" cy="74" rx="24" ry="29" fill="${skin}" stroke="${ink}" stroke-width="2.5"/>` +
    `<path d="M37 72c-2-22 10-34 25-34s28 11 25 34c-5-9-12-14-25-15-12 1-20 6-25 15z" fill="${hair}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<circle cx="53" cy="77" r="2.4" fill="${ink}"/><circle cx="71" cy="77" r="2.4" fill="${ink}"/>` +
    `<path d="M55 91c4 3 10 3 14 0" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/></svg>`
  );
}

/** A name as the machine-readable zone writes it: capitals, and `<` for anything else. */
export function mrzName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '<')
    .replace(/^<+|<+$/g, '');
}

export const pad = (text: string, width: number): string => (text.length >= width ? text.slice(0, width) : text + '<'.repeat(width - text.length));
