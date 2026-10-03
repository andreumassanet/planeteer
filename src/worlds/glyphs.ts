/**
 * Invented scripts: a set of glyphs per species, and a line of English written
 * in them.
 *
 * **Pure and deterministic**, like everything else a world is: a glyph is a
 * path in a 10 x 14 box, generated stroke by stroke from the species'
 * `ScriptStyle` and a seed, and the same style always gives the same script.
 * Nothing here touches the DOM — `svgOf` returns markup as a string — so
 * `scripts/check-worlds.ts` can hold every script to its rules in Node: no two
 * glyphs of a script alike, and no two species sharing a glyph.
 *
 * ## What makes a script read as a script
 *
 * Random strokes in a box read as scribble. Four things make them read as
 * writing, and each is a parameter rather than a hope:
 *
 * - **A small inventory, reused.** 12 to 36 glyphs, so a line repeats its
 *   letters the way a real one does — the eye finds the repeats and decides
 *   there is a system.
 * - **One hand.** Every glyph of a script is drawn from the same few stroke
 *   kinds at the same weights and the same slant, so they are visibly
 *   siblings: a script of loops and dots and a script of bars and zigzags are
 *   two scripts, not one with noise.
 * - **A line.** Devanagari hangs from a bar, Latin stands on one. A script with
 *   `line: 'top'` draws a bar across every word, joined, which is the strongest
 *   single signal of writing there is.
 * - **Words.** Glyphs are grouped, the groups spaced, and the same English
 *   word is always the same group, so a phrase said twice is written twice
 *   the same.
 *
 * The *sound* of a glyph is a syllable from the style's consonants and vowels;
 * a line's transliteration is what the babble voice says (`voice.ts`'s
 * `planSpeech` reads it like any other line), so what you hear has as many
 * syllables as what you see has glyphs.
 */

import type { ScriptStyle } from './contract.ts';
import { rngFrom, seedOf } from '../scenery/random.ts';
import type { Rng } from '../scenery/random.ts';

/** The glyph box, in path units: 10 wide, 14 tall, the base line at 12 and the top at 2. */
export const GLYPH_WIDTH = 10;
export const GLYPH_HEIGHT = 14;
const TOP = 2;
const BASE = 12;

export interface Glyph {
  /** SVG path data in the glyph's own box. Stroked, never filled. */
  d: string;
  /** The syllable it is said as. */
  sound: string;
}

export interface Script {
  style: ScriptStyle;
  glyphs: readonly Glyph[];
  /** The mark that ends a sentence, drawn after the last word. */
  stop: Glyph;
}

const n = (value: number): string => (Math.round(value * 100) / 100).toString();

type StrokeKind = 'loop' | 'hook' | 'bar' | 'dot' | 'zigzag';

function stroke(rng: Rng, kind: StrokeKind, slant: number): string {
  // Slant leans everything forward about the base line.
  const sx = (x: number, y: number): number => x + (BASE - y) * Math.tan(slant);
  switch (kind) {
    case 'loop': {
      const rx = rng.range(1.1, 2.8);
      const ry = rng.range(1.1, 3.4);
      const cx = rng.range(1 + rx, 9 - rx);
      const cy = rng.range(TOP + ry, BASE - ry);
      // An open loop is a hook that came back; a closed one is a ring.
      if (rng.chance(0.4)) {
        const gap = rng.range(0.6, 1.4);
        return `M${n(sx(cx + rx * Math.cos(gap), cy - ry * Math.sin(gap)))} ${n(cy - ry * Math.sin(gap))}` +
          `A${n(rx)} ${n(ry)} 0 1 0 ${n(sx(cx + rx * Math.cos(gap), cy + ry * Math.sin(gap)))} ${n(cy + ry * Math.sin(gap))}`;
      }
      return `M${n(sx(cx - rx, cy))} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(sx(cx + rx, cy))} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(sx(cx - rx, cy))} ${n(cy)}`;
    }
    case 'hook': {
      const x1 = rng.range(1.5, 8.5);
      const y1 = rng.range(TOP, BASE - 4);
      const x2 = rng.range(1.5, 8.5);
      const y2 = rng.range(y1 + 3, BASE);
      const cx = rng.range(0, 10);
      const cy = rng.range(y1, y2);
      const tail = rng.sign() * rng.range(1, 2.2);
      return `M${n(sx(x1, y1))} ${n(y1)}Q${n(sx(cx, cy))} ${n(cy)} ${n(sx(x2, y2))} ${n(y2)}l${n(tail)} ${n(-rng.range(0.8, 2))}`;
    }
    case 'bar': {
      if (rng.chance(0.5)) {
        const y = rng.range(TOP + 1, BASE - 1);
        const x1 = rng.range(1, 4);
        const x2 = rng.range(6, 9);
        return `M${n(sx(x1, y))} ${n(y)}L${n(sx(x2, y))} ${n(y)}`;
      }
      const x = rng.range(2, 8);
      const y1 = rng.range(TOP, TOP + 4);
      const y2 = rng.range(BASE - 3, BASE);
      return `M${n(sx(x, y1))} ${n(y1)}L${n(sx(x, y2))} ${n(y2)}`;
    }
    case 'dot': {
      const x = rng.range(2, 8);
      const y = rng.chance(0.5) ? rng.range(TOP - 1, TOP + 2) : rng.range(BASE - 2, BASE + 1);
      return `M${n(sx(x, y))} ${n(y)}l0.01 0`;
    }
    case 'zigzag': {
      const points = rng.between(3, 4);
      const y1 = rng.range(TOP + 1, BASE - 5);
      const y2 = rng.range(y1 + 2.5, BASE);
      let d = '';
      for (let k = 0; k < points; k++) {
        const x = 1.5 + (7 * k) / (points - 1);
        const y = k % 2 === 0 ? y1 : y2;
        d += `${k === 0 ? 'M' : 'L'}${n(sx(x, y))} ${n(y)}`;
      }
      return d;
    }
  }
}

/** The script a style writes: every glyph different, and the same every time. */
export function scriptOf(style: ScriptStyle): Script {
  const rng = rngFrom('worlds', 'script', style.seed);
  const kinds: { item: StrokeKind; weight: number }[] = (
    [
      { item: 'loop', weight: style.loops },
      { item: 'hook', weight: style.hooks },
      { item: 'bar', weight: style.bars },
      { item: 'dot', weight: style.dots },
      { item: 'zigzag', weight: style.zigzags },
    ] as { item: StrokeKind; weight: number }[]
  ).filter((entry) => entry.weight > 0);
  if (kinds.length === 0) kinds.push({ item: 'bar', weight: 1 });
  const count = Math.max(12, Math.min(36, Math.round(style.glyphs)));
  const seen = new Set<string>();
  const sounds = new Set<string>();
  const glyphs: Glyph[] = [];
  for (let attempt = 0; glyphs.length < count && attempt < count * 20; attempt++) {
    const strokes = rng.between(style.strokes[0], Math.max(style.strokes[0], style.strokes[1]));
    let d = '';
    let solid = false;
    for (let s = 0; s < strokes; s++) {
      let kind = rng.weighted(kinds);
      // One dot a glyph at most, and never a glyph of nothing but a dot:
      // that is punctuation, not a letter.
      if (kind === 'dot' && (!solid && s === strokes - 1)) kind = 'bar';
      if (kind !== 'dot') solid = true;
      d += stroke(rng, kind, style.slant);
    }
    if (seen.has(d)) continue;
    seen.add(d);
    // A syllable not yet given, where the inventory allows.
    let sound = '';
    for (let tries = 0; tries < 8; tries++) {
      sound = `${rng.pick([...style.consonants])}${rng.pick([...style.vowels])}`;
      if (!sounds.has(sound)) break;
    }
    sounds.add(sound);
    glyphs.push({ d, sound });
  }
  const stopRng = rng.fork('stop');
  const x = stopRng.range(3.5, 6.5);
  const stop: Glyph = {
    d: stopRng.chance(0.5) ? `M${n(x)} 6l0.01 0M${n(x)} 11l0.01 0` : `M${n(x - 1.4)} 4L${n(x - 1.4)} 12M${n(x + 1.4)} 4L${n(x + 1.4)} 12`,
    sound: '',
  };
  return { style, glyphs, stop };
}

/** A line written: its words as glyph indices, whether it ends a sentence, and how it is said. */
export interface Written {
  words: number[][];
  /** Sentence ends after the word at each index. */
  stops: Set<number>;
  /** The transliteration, for the voice: syllables, spaces and the line's own punctuation. */
  said: string;
  /** Glyphs in all, stops included. */
  length: number;
}

/**
 * English into the script. The same English word is always the same alien
 * word (a hash of the word and the script's seed), its length following the
 * English one's loosely, so a long line is a long line in both.
 */
export function writeLine(script: Script, english: string): Written {
  const words: number[][] = [];
  const stops = new Set<number>();
  let said = '';
  let length = 0;
  const tokens = english.match(/[\p{L}\p{N}']+|[.!?]/gu) ?? [];
  for (const token of tokens) {
    if (/^[.!?]$/.test(token)) {
      if (words.length > 0) {
        stops.add(words.length - 1);
        said = said.trimEnd() + token + ' ';
        length++;
      }
      continue;
    }
    const lower = token.toLowerCase();
    // Small words fold away: the alien grammar is terser than ours.
    if (lower.length <= 2 && seedOf(script.style.seed, 'drop', lower) % 3 === 0) continue;
    const rng = rngFrom('worlds', 'word', script.style.seed, lower);
    const size = Math.max(1, Math.min(5, 1 + Math.floor(lower.length / 3) + rng.int(2) - (lower.length > 9 ? 1 : 0)));
    const word: number[] = [];
    for (let k = 0; k < size; k++) word.push(rng.int(script.glyphs.length));
    words.push(word);
    said += word.map((g) => script.glyphs[g]!.sound).join('') + ' ';
    length += size;
  }
  return { words, stops, said: said.trim(), length };
}

export interface SvgOptions {
  /** How many glyphs to show, in order; the rest are left out. Default all. */
  shown?: number;
  /** Glyphs a row before wrapping. */
  perRow?: number;
  /** Pixels a glyph is tall. */
  size?: number;
  color?: string;
}

/** A line as inline SVG markup: stroked paths, words spaced, rows wrapped. */
export function svgOf(script: Script, written: Written, options: SvgOptions = {}): string {
  const shown = options.shown ?? written.length;
  const perRow = options.perRow ?? 14;
  const size = options.size ?? 22;
  const color = options.color ?? 'currentColor';
  const advance = GLYPH_WIDTH + 1.2;
  const space = 6;
  const rowHeight = GLYPH_HEIGHT + 5;
  let x = 0;
  let row = 0;
  let count = 0;
  let width = 0;
  let paths = '';
  const lines: string[] = [];
  for (let w = 0; w < written.words.length && count < shown; w++) {
    const word = written.words[w]!;
    if (x > 0 && x / advance + word.length > perRow) {
      x = 0;
      row++;
    }
    const y0 = row * rowHeight;
    const start = x;
    for (const g of word) {
      if (count >= shown) break;
      paths += `<path transform="translate(${n(x)} ${n(y0)})" d="${script.glyphs[g]!.d}"/>`;
      x += advance;
      count++;
    }
    if (script.style.line !== 'none' && x > start) {
      const y = y0 + (script.style.line === 'top' ? TOP : BASE);
      lines.push(`M${n(start - 0.6)} ${n(y)}L${n(x - 0.6)} ${n(y)}`);
    }
    if (written.stops.has(w) && count < shown) {
      paths += `<path transform="translate(${n(x)} ${n(y0)})" d="${script.stop.d}"/>`;
      x += advance * 0.8;
      count++;
    }
    width = Math.max(width, x);
    x += space;
  }
  const height = (row + 1) * rowHeight;
  const scale = size / GLYPH_HEIGHT;
  const linePath = lines.length > 0 ? `<path d="${lines.join('')}"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n(Math.max(width, 1) + 4)} ${n(height + 2)}" ` +
    `width="${n((Math.max(width, 1) + 4) * scale)}" height="${n((height + 2) * scale)}" ` +
    `fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
    `${paths}${linePath}</svg>`
  );
}
