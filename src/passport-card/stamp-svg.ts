/** The stamp that drops and a country's small stamp on its continent's page, drawn as SVG. */
import { flagColor, flagPalette } from '../country-colors.ts';
import { icon } from '../ui.ts';
import { stampDateText } from '../passport.ts';
import type { Stamp, StampMode } from '../passport.ts';
import { MODE_ICON } from './constants.ts';

let stampSerial = 0;

/** A document-unique id prefix for one stamp's SVG defs. */
export function nextStampId(): string {
  return `ps${++stampSerial}`;
}

/** A small, stable hash of a string, 0 to 1. */
export function hashOf(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return ((value >>> 0) % 100003) / 100003;
}

export const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A text's size to fit `width` at about 0.64 of an em a letter, bold capitals; `stretch` when even the floor does not. */
export function fit(text: string, width: number, base: number, floor: number): { size: number; stretch: boolean } {
  const size = Math.min(base, width / Math.max(1, text.length * 0.64));
  return size < floor ? { size: floor, stretch: true } : { size, stretch: false };
}

export function line(textValue: string, x: number, y: number, width: number, base: number, floor: number, weight = 800): string {
  const { size, stretch } = fit(textValue, width, base, floor);
  const squeeze = stretch ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x}" y="${y}" font-size="${size.toFixed(1)}" font-weight="${weight}" text-anchor="middle"${squeeze}>${escape(textValue)}</text>`;
}

/** The stamp's ink: the country's colour, pulled a quarter of the way to the pen so it reads on paper. */
export function inkOf(iso: string): string {
  const rgb = flagColor(iso);
  const ink = [0x1e, 0x06, 0x03];
  const base = rgb ?? [0xc3, 0x0e, 0x3a];
  const mixed = base.map((value, i) => Math.round(value * 0.75 + ink[i]! * 0.25));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

/** The flag's colours as a band of bars, largest first, at most four. */
export function flagBand(iso: string, x: number, y: number, width: number, height: number): string {
  const colours = flagPalette(iso).slice(0, 4);
  if (colours.length === 0) return '';
  const total = colours.reduce((sum, colour) => sum + Math.max(0.15, colour.share), 0);
  let at = x;
  const bars = colours.map((colour) => {
    const w = (Math.max(0.15, colour.share) / total) * width;
    const bar = `<rect x="${at.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${height}" fill="${colour.hex}"/>`;
    at += w;
    return bar;
  });
  return `<g opacity="0.85">${bars.join('')}<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-width="0.8"/></g>`;
}

/** How you came, as the UI's own icon, drawn in the stamp's ink. */
export function emblem(mode: StampMode, x: number, y: number, size: number): string {
  const inner = typeof document === 'undefined' ? '' : icon(MODE_ICON[mode]).innerHTML;
  const scale = size / 24;
  return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${scale.toFixed(3)})" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
}

/**
 * One stamp as SVG markup, 160 by 120, in the ink of its country. The shape
 * and the tilt come from a hash of the country's code.
 */
export function stampSvg(stamp: Stamp): { svg: string; tilt: number } {
  const uid = nextStampId();
  const h1 = hashOf(stamp.iso);
  const h2 = hashOf(`${stamp.iso}/tilt`);
  const shape = Math.floor(h1 * 3);
  const tilt = Math.round((h2 - 0.5) * 22);
  const name = stamp.name.toUpperCase();
  const date = stampDateText(stamp.date);
  const town = stamp.town === '' ? '' : stamp.town.toUpperCase();
  const seed = Math.floor(h1 * 1000);
  const parts: string[] = [];
  if (shape === 0) {
    // Round: the name over the top of the ring, the town under it.
    parts.push(
      '<circle cx="80" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="3.6"/>',
      '<circle cx="80" cy="60" r="48" fill="none" stroke="currentColor" stroke-width="1.3"/>',
      `<path id="${uid}t" d="M 43 60 A 37 37 0 0 1 117 60" fill="none"/>`,
      `<path id="${uid}b" d="M 40 60 A 40 40 0 0 0 120 60" fill="none"/>`,
    );
    const top = fit(name, 104, 11, 6.5);
    parts.push(
      `<text font-size="${top.size.toFixed(1)}" font-weight="800" letter-spacing="0.6"><textPath href="#${uid}t" startOffset="50%" text-anchor="middle"${top.stretch ? ' textLength="104" lengthAdjust="spacingAndGlyphs"' : ''}>${escape(name)}</textPath></text>`,
    );
    if (town !== '') {
      const bottom = fit(town, 92, 8.5, 5.5);
      parts.push(
        `<text font-size="${bottom.size.toFixed(1)}" font-weight="700"><textPath href="#${uid}b" startOffset="50%" text-anchor="middle" dominant-baseline="hanging"${bottom.stretch ? ' textLength="92" lengthAdjust="spacingAndGlyphs"' : ''}>${escape(town)}</textPath></text>`,
      );
    }
    parts.push(emblem(stamp.mode, 80, 45, 15), line(date, 80, 70, 64, 11.5, 8), flagBand(stamp.iso, 62, 76, 36, 4));
  } else if (shape === 1) {
    // A box: the name across the top, the date large, the town along the foot.
    parts.push(
      '<rect x="8" y="12" width="144" height="96" rx="9" fill="none" stroke="currentColor" stroke-width="3.6"/>',
      '<rect x="14" y="18" width="132" height="84" rx="5" fill="none" stroke="currentColor" stroke-width="1.3"/>',
      '<path d="M 20 44 H 140 M 20 84 H 140" stroke="currentColor" stroke-width="1"/>',
      line(name, 80, 37, 118, 14, 7),
      emblem(stamp.mode, 32, 64, 18),
      line(date, 88, 69, 92, 14, 8),
      flagBand(stamp.iso, 50, 76, 60, 3.5),
    );
    if (town !== '') parts.push(line(town, 80, 97, 116, 9.5, 6, 700));
  } else {
    // An oval: the date between two marks, the name over it, the town under.
    parts.push(
      '<ellipse cx="80" cy="60" rx="70" ry="50" fill="none" stroke="currentColor" stroke-width="3.6"/>',
      '<ellipse cx="80" cy="60" rx="63" ry="43" fill="none" stroke="currentColor" stroke-width="1.3"/>',
      line(name, 80, 44, 100, 13, 7),
      '<path d="M 36 52 H 124 M 36 76 H 124" stroke="currentColor" stroke-width="1"/>',
      line(date, 80, 69, 70, 12.5, 8),
      emblem(stamp.mode, 42, 64, 12),
      emblem(stamp.mode, 118, 64, 12),
      flagBand(stamp.iso, 64, 80, 32, 3.5),
    );
    if (town !== '') parts.push(line(town, 80, 94, 80, 8.5, 5.5, 700));
  }
  // The rubber: a noise that bites holes in the ink and roughens its edge.
  const filter =
    `<filter id="${uid}r" x="-5%" y="-5%" width="110%" height="110%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed}" result="n"/>` +
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" result="d"/>' +
    '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.55" result="m"/>' +
    '<feComposite in="d" in2="m" operator="in"/></filter>';
  const svg =
    `<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(`${stamp.name}, ${date}`)}" ` +
    `style="color:${inkOf(stamp.iso)};font-family:var(--ui-font)" fill="currentColor">` +
    `<defs>${filter}</defs><g filter="url(#${uid}r)" opacity="0.92">${parts.join('')}</g></svg>`;
  return { svg, tilt };
}

/** `2026-09-25` as the small stamp says it: `25 SEP`. */
export const dayText = (date: string): string => stampDateText(date).slice(0, 6);

/**
 * A country's place on its continent's page, 64 by 48: the stamp, small, in
 * its country's ink with its code, the day and the flag's band; or, not yet
 * stamped, the same shape as an empty grey outline round the code.
 */
export function miniStamp(iso: string, stamp: Stamp | null): string {
  const shape = Math.floor(hashOf(iso) * 3);
  const got = stamp !== null;
  const colour = got ? inkOf(iso) : 'rgba(30, 6, 3, 0.32)';
  const dash = got ? '' : ' stroke-dasharray="3.2 2.4"';
  const ring =
    shape === 0
      ? `<circle cx="32" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="2.6"${dash}/>` +
        (got ? '<circle cx="32" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="0.9"/>' : '')
      : shape === 1
        ? `<rect x="4" y="4" width="56" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="2.6"${dash}/>` +
          (got ? '<rect x="7.5" y="7.5" width="49" height="33" rx="3.5" fill="none" stroke="currentColor" stroke-width="0.9"/>' : '')
        : `<ellipse cx="32" cy="24" rx="28" ry="21" fill="none" stroke="currentColor" stroke-width="2.6"${dash}/>` +
          (got ? '<ellipse cx="32" cy="24" rx="24.5" ry="17.5" fill="none" stroke="currentColor" stroke-width="0.9"/>' : '');
  const code = escape(iso.slice(0, 4));
  const text = got
    ? `<text x="32" y="25" font-size="12.5" font-weight="800" letter-spacing="0.6" text-anchor="middle">${code}</text>` +
      `<text x="32" y="33.5" font-size="6.6" font-weight="800" letter-spacing="0.3" text-anchor="middle">${escape(dayText(stamp.date))}</text>` +
      flagBand(iso, 23, 36.5, 18, 2.5)
    : `<text x="32" y="28.5" font-size="12.5" font-weight="800" letter-spacing="0.6" text-anchor="middle">${code}</text>`;
  return (
    `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ` +
    `style="color:${colour};font-family:var(--ui-font)" fill="currentColor"><g opacity="${got ? 0.92 : 1}">${ring}${text}</g></svg>`
  );
}
