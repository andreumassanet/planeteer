/** Seals for the nations of other worlds: the big stamp, the small seal and the banner and ring they carry. */
import { createFlagCanvas } from '../flags.ts';
import { h } from '../ui.ts';
import { stampDateText } from '../passport.ts';
import type { Stamp } from '../passport.ts';
import { inked } from './constants.ts';
import { dayText, emblem, escape, hashOf, line, nextStampId, stampSvg } from './stamp-svg.ts';

/** A nation of another world, as its seal needs it. */
export interface Nation {
  iso: string;
  name: string;
  color: number;
  /** Its world's name, and the species' writing when the chapter brings it. */
  world: string;
  script?: (text: string) => SVGElement;
}

/** A colour pulled a quarter of the way to the pen, as `inkOf` pulls a flag's. */
export function nationInk(colour: number): string {
  return inked(colour, 0.25);
}

/** The banner a nation flies, as a picture for an SVG: `flags.ts` paints it with the world's own painter. */
const banners = new Map<string, string>();
function bannerUrl(iso: string): string {
  const held = banners.get(iso);
  if (held !== undefined) return held;
  let url = '';
  if (typeof document !== 'undefined') {
    try {
      url = createFlagCanvas(iso, 60, 40).toDataURL();
    } catch {
      // A canvas the browser will not read back: the seal goes without its banner.
    }
  }
  banners.set(iso, url);
  return url;
}

export function banner(iso: string, x: number, y: number, width: number, height: number, stroke: number): string {
  const url = bannerUrl(iso);
  if (url === '') return '';
  return (
    `<image href="${url}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"/>` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-width="${stroke}"/>`
  );
}

/**
 * A name in the species' writing, laid round a ring: the glyphs the chapter's
 * `script` draws for it, read off its SVG — each glyph is a path placed by a
 * `translate` along the line — and set end to end round the circle, tops
 * outward, the name again after a dot until the ring is full. Empty when the
 * writing cannot be read that way, and the seal keeps its plain ring.
 */
const rings = new Map<string, string>();
function glyphRing(nation: Nation, cx: number, cy: number, radius: number, glyphHeight: number): string {
  const key = `${nation.iso}/${radius}/${glyphHeight}`;
  const held = rings.get(key);
  if (held !== undefined) return held;
  let out = '';
  try {
    const written = nation.script?.(nation.name) ?? null;
    if (written !== null) out = laidRound(written, cx, cy, radius, glyphHeight);
  } catch {
    out = '';
  }
  rings.set(key, out);
  return out;
}

function laidRound(written: SVGElement, cx: number, cy: number, radius: number, glyphHeight: number): string {
  const box = (written.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const boxHeight = box.length === 4 && Number.isFinite(box[3]) && box[3]! > 0 ? box[3]! : 0;
  if (boxHeight === 0) return '';
  const glyphs: { d: string; x: number }[] = [];
  let firstRow = Infinity;
  const placed: { d: string; x: number; y: number }[] = [];
  for (const path of Array.from(written.querySelectorAll('path[transform]'))) {
    const match = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(path.getAttribute('transform') ?? '');
    const d = path.getAttribute('d');
    if (match === null || d === null) continue;
    const y = Number(match[2]);
    placed.push({ d, x: Number(match[1]), y });
    firstRow = Math.min(firstRow, y);
  }
  for (const glyph of placed) if (glyph.y === firstRow) glyphs.push({ d: glyph.d, x: glyph.x });
  if (glyphs.length === 0) return '';
  const k = glyphHeight / boxHeight;
  const last = glyphs[glyphs.length - 1]!;
  const advance = glyphs.length > 1 ? (last.x - glyphs[0]!.x) / (glyphs.length - 1) : boxHeight * 0.7;
  const width = advance * k;
  const lineLength = (last.x - glyphs[0]!.x + advance) * k;
  const circumference = 2 * Math.PI * radius;
  const gap = width * 1.4;
  const stroke = Math.max(1.4, 0.55 / k);
  const parts: string[] = [];
  // The name as many whole times as the ring holds, a dot between, spread to close the circle.
  const copies = Math.max(1, Math.floor(circumference / (lineLength + gap)));
  const spare = (circumference - copies * (lineLength + gap)) / copies;
  let s = 0;
  for (let copy = 0; copy < copies; copy++) {
    for (const glyph of glyphs) {
      const along = s + (glyph.x - glyphs[0]!.x) * k + width / 2;
      const degrees = (along / circumference) * 360;
      parts.push(
        `<path transform="rotate(${degrees.toFixed(2)} ${cx} ${cy}) translate(${(cx - width / 2).toFixed(2)} ${(cy - radius - glyphHeight / 2).toFixed(2)}) scale(${k.toFixed(4)})" d="${glyph.d}"/>`,
      );
    }
    s += lineLength + gap + spare;
    const dot = ((s - (gap + spare) / 2) / circumference) * 2 * Math.PI;
    parts.push(`<circle cx="${(cx + radius * Math.sin(dot)).toFixed(2)}" cy="${(cy - radius * Math.cos(dot)).toFixed(2)}" r="${(glyphHeight * 0.12).toFixed(2)}" fill="currentColor" stroke="none"/>`);
  }
  return `<g fill="none" stroke="currentColor" stroke-width="${stroke.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g>`;
}

/**
 * A nation's stamp, 160 by 120: a round seal in the nation's own colour, the
 * banner it flies in the middle, its name under it and the day, the town (or
 * the world) along the foot, a mark for how you came over it, and its name
 * round the rim in the species' writing — a ring of beads where there is none.
 */
export function sealSvg(stamp: Stamp, nation: Nation): { svg: string; tilt: number } {
  const uid = nextStampId();
  const h1 = hashOf(stamp.iso);
  const tilt = Math.round((hashOf(`${stamp.iso}/tilt`) - 0.5) * 22);
  const name = (nation.name || stamp.name).toUpperCase();
  const date = stampDateText(stamp.date);
  const foot = (stamp.town === '' ? nation.world : stamp.town).toUpperCase();
  const ring = glyphRing(nation, 80, 60, 50.6, 6.4);
  const parts = [
    '<circle cx="80" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="3.6"/>',
    ring === ''
      ? '<circle cx="80" cy="60" r="50.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 4.2"/>'
      : ring,
    '<circle cx="80" cy="60" r="46" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    emblem(stamp.mode, 80, 26, 12),
    banner(stamp.iso, 61, 34, 38, 25, 1),
    line(name, 80, 75, 72, 11, 6.5),
    line(date, 80, 87, 60, 9.5, 7),
    line(foot, 80, 97.5, 46, 6.5, 4.5, 700),
  ];
  const filter =
    `<filter id="${uid}r" x="-5%" y="-5%" width="110%" height="110%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${Math.floor(h1 * 1000)}" result="n"/>` +
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" result="d"/>' +
    '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.55" result="m"/>' +
    '<feComposite in="d" in2="m" operator="in"/></filter>';
  const svg =
    `<svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(`${nation.name}, ${nation.world}, ${date}`)}" ` +
    `style="color:${nationInk(nation.color)};font-family:var(--ui-font)" fill="currentColor">` +
    `<defs>${filter}</defs><g filter="url(#${uid}r)" opacity="0.92">${parts.join('')}</g></svg>`;
  return { svg, tilt };
}

/** A name's initials, for an empty seal: *Tharsis Union* is `TU`. */
function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter((word) => /\p{L}/u.test(word));
  const letters = words.length > 1 ? words.slice(0, 3).map((word) => word[0]) : [name.slice(0, 3)];
  return letters.join('').toUpperCase();
}

/**
 * A nation's place on its world's visa, 64 by 48: the seal small, its banner
 * and the day, the writing round the rim; or, not yet stamped, an empty grey
 * ring round its initials, as Earth's places are an empty outline round the code.
 */
export function miniSeal(nation: Nation, stamp: Stamp | null): string {
  const got = stamp !== null;
  const colour = got ? nationInk(nation.color) : 'rgba(30, 6, 3, 0.32)';
  let body: string;
  if (got) {
    const ring = glyphRing(nation, 32, 24, 19.4, 3.1);
    body =
      '<circle cx="32" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="2.6"/>' +
      (ring === ''
        ? '<circle cx="32" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="0.9"/>'
        : `${ring}<circle cx="32" cy="24" r="17.1" fill="none" stroke="currentColor" stroke-width="0.7"/>`) +
      banner(nation.iso, 24, 11.5, 16, 10.6, 0.6) +
      `<text x="32" y="31.5" font-size="6.3" font-weight="800" letter-spacing="0.3" text-anchor="middle">${escape(dayText(stamp.date))}</text>`;
  } else {
    body =
      '<circle cx="32" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-dasharray="3.2 2.4"/>' +
      `<text x="32" y="28.5" font-size="12" font-weight="800" letter-spacing="0.6" text-anchor="middle">${escape(initials(nation.name))}</text>`;
  }
  return (
    `<svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ` +
    `style="color:${colour};font-family:var(--ui-font)" fill="currentColor"><g opacity="${got ? 0.92 : 1}">${body}</g></svg>`
  );
}

/** The stamp that drops, square on its spot at its country's own tilt; a nation's seal at its own. */
export function stampElement(stamp: Stamp, nation: Nation | null): HTMLElement {
  const { svg, tilt } = nation === null ? stampSvg(stamp) : sealSvg(stamp, nation);
  const element = h('div', { class: 'p-stamp', html: svg });
  element.style.setProperty('--tilt', `${tilt}deg`);
  return element;
}
