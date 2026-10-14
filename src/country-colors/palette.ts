/** The colours of a flag by area, and the one colour a country wears. */
import { FLAGS } from '../flag-data.ts';
import { BOX_H, BOX_W, SAMPLES_X, SAMPLES_Y, collect, resolve } from './flag-shapes.ts';
import type { Mark } from './flag-shapes.ts';
import { chroma, fromOklab, toOklab } from './oklab.ts';
import type { RGB } from './oklab.ts';

const parse = (colour: string): RGB => {
  const n = Number.parseInt(colour.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// --- what a flag is made of -------------------------------------------------

/**
 * The chroma a flag colour needs before the land can wear it. White, black
 * and the greys (chroma 0 to 0.019 in the flag data) read as snow or ink on
 * land; the least colourful real colour is 0.057, so 0.04 sits in a gap.
 */
const MIN_CHROMA = 0.04;

/**
 * Two colours within this much of the flag's area count as the same size (the
 * sample grid cannot split equal bands exactly). A tie goes to the colour the
 * spec paints first, so the order flags are written in decides it: France is
 * blue, Ireland green, Germany red.
 */
const TIE = 0.03;

/**
 * The band a country's colour is kept in, in OKLab lightness. The toon ramp
 * darkens the unlit side of the globe and the HUD already uses the cream at the
 * top, so colours outside 0.38 to 0.86 are clamped on lightness alone (hue and
 * chroma ride through). The width is also the corridor the nudge search slides in.
 */
export const MIN_LIGHT = 0.38;
export const MAX_LIGHT = 0.86;

const legible = (colour: RGB): RGB => {
  const lab = toOklab(colour);
  if (lab.L >= MIN_LIGHT && lab.L <= MAX_LIGHT) return colour;
  return fromOklab({ ...lab, L: lab.L < MIN_LIGHT ? MIN_LIGHT : MAX_LIGHT });
};

/** One colour of one flag, with how much of the cloth it covers. */
export interface FlagColour {
  /** As the spec writes it, before any clamp: sRGB bytes and the same as hex. */
  rgb: RGB;
  hex: string;
  /** Its share of the flag's area, 0 to 1. */
  share: number;
  /** False for the whites, the blacks and the greys. See `MIN_CHROMA`. */
  usable: boolean;
}

const palettes = new Map<string, FlagColour[]>();

/**
 * Every colour a flag is made of, largest area first.
 *
 * Each layer of the spec becomes a shape with a box round it; the last shape
 * over a sample point wins and the counts are areas. Order is largest first
 * with `TIE`'s window: at each step, of everything within the window of the
 * largest that is left, the colour the spec paints earliest wins.
 */
export function flagPalette(key: string): FlagColour[] {
  const resolved = resolve(key);
  const held = palettes.get(resolved);
  if (held !== undefined) return held;

  const spec = FLAGS[resolved];
  if (spec === undefined) {
    palettes.set(resolved, []);
    return [];
  }

  const marks: Mark[] = [];
  collect(spec, { x: 0, y: 0, w: BOX_W, h: BOX_H }, marks);

  // The order a colour is first painted in, which is the tie-break below.
  const rank = new Map<string, number>();
  for (const item of marks) if (!rank.has(item.c)) rank.set(item.c, rank.size);

  const area = new Map<string, number>();
  const row: Mark[] = [];
  for (let iy = 0; iy < SAMPLES_Y; iy++) {
    const y = ((iy + 0.5) / SAMPLES_Y) * BOX_H;
    row.length = 0;
    for (const item of marks) if (y >= item.y0 && y < item.y1) row.push(item);
    for (let ix = 0; ix < SAMPLES_X; ix++) {
      const x = ((ix + 0.5) / SAMPLES_X) * BOX_W;
      for (let i = row.length - 1; i >= 0; i--) {
        const item = row[i]!;
        if (x < item.x0 || x >= item.x1 || !item.hit(x, y)) continue;
        area.set(item.c, (area.get(item.c) ?? 0) + 1);
        break;
      }
    }
  }

  const total = SAMPLES_X * SAMPLES_Y;
  const rest = [...area].map(([colour, count]) => ({
    colour,
    share: count / total,
    order: rank.get(colour) ?? 0,
  }));

  const out: FlagColour[] = [];
  while (rest.length > 0) {
    let largest = 0;
    for (const entry of rest) largest = Math.max(largest, entry.share);
    let best = 0;
    for (let i = 1; i < rest.length; i++) {
      const one = rest[i]!;
      const two = rest[best]!;
      if (one.share < largest - TIE) continue;
      if (two.share < largest - TIE || one.order < two.order) best = i;
    }
    const won = rest.splice(best, 1)[0]!;
    const rgb = parse(won.colour);
    out.push({
      rgb,
      hex: won.colour,
      share: won.share,
      usable: chroma(toOklab(rgb)) >= MIN_CHROMA,
    });
  }

  palettes.set(resolved, out);
  return out;
}

/**
 * The colour a flag reads as: the largest area of it the land can wear.
 * The largest chromatic area wins (Japan is its red disc, not its white field),
 * pulled into the legible lightness band.
 */
export function flagColor(key: string): RGB | null {
  const list = choices(key);
  return list.length === 0 ? null : list[0]!;
}

/**
 * The colours a country may wear, best first, already made legible. The first
 * is `flagColor`'s answer; the rest are the flag's other usable colours of at
 * least `MIN_SHARE` of the cloth, which the nudge search falls back to.
 */
export function choices(key: string): RGB[] {
  const held = ladders.get(key);
  if (held !== undefined) return held;
  const palette = flagPalette(key);
  const out: RGB[] = [];
  const first = palette.find((entry) => entry.usable) ?? palette[0];
  if (first !== undefined) {
    out.push(legible(first.rgb));
    for (const entry of palette) {
      if (entry === first || !entry.usable || entry.share < MIN_SHARE) continue;
      out.push(legible(entry.rgb));
    }
  }
  ladders.set(key, out);
  return out;
}

const ladders = new Map<string, RGB[]>();

// --- who touches whom -------------------------------------------------------

/**
 * The smallest share of a flag a colour may have and still be offered as a
 * country's second choice. Below an eighth of the cloth a colour is a charge,
 * not a field.
 */
const MIN_SHARE = 0.125;
