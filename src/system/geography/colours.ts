import { Color, SRGBColorSpace } from 'three';
import type { Body } from '../contract.ts';
import type { Frontier } from './types.ts';

/**
 * How far round the hue circle a body's political colours range, degrees,
 * centred on its ground's own hue: a red planet's map is reds, oranges,
 * ochres and a rose or two, never a green or a blue.
 */
const POLITICAL_SPAN = 90;
/** Hues across that span, and the lightness steps each is offered at (sRGB HSL). */
const POLITICAL_HUES = 9;
const POLITICAL_LIGHTNESS = [0.56, 0.67, 0.78] as const;
/** The saturations every candidate is offered at, and a grey world's, whose span is the whole circle. */
const POLITICAL_SATURATION = [0.3, 0.5] as const;
const GREY_SATURATION = [0.22, 0.36] as const;
/** Under this saturation a ground has no hue worth keeping to: the Moon. */
const GREY_GROUND = 0.2;
/** How much keeping near the nation's own colour weighs against standing apart, in OKLab units. */
const KEEP_OWN = 0.3;
/**
 * Two nations that share a frontier are never closer than this in OKLab:
 * Earth's own `country-colors.ts` threshold, and `scripts/check-system.ts`
 * holds every world to it.
 */
export const POLITICAL_CONTRAST = 0.06;

/** sRGB bytes to OKLab, the space `country-colors.ts` measures Earth's in. */
export function oklabOf(hexColor: number): [number, number, number] {
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = lin((hexColor >> 16) & 0xff);
  const g = lin((hexColor >> 8) & 0xff);
  const b = lin(hexColor & 0xff);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const oklabDistance = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/**
 * One flat colour a nation for every map of its world (the menu's globe, the
 * sheet behind `M`, the minimap and the ground seen from the air), and no two
 * that touch alike.
 *
 * A nation's own `color` is its banner's field, not a map colour: a body's
 * nations repeat one another and many are the dark earths a ground is made of.
 * The candidates here are a fan of hues round the ground's own (`POLITICAL_SPAN`
 * of them, the whole circle for a grey world) at three lightnesses and two
 * saturations. Nations are taken biggest cap first, and each takes the
 * candidate furthest from its neighbours (and, at half the weight, from every
 * nation already coloured), less `KEEP_OWN` times its distance from the
 * nation's own banner colour. Deterministic: the order is the body's file and
 * the candidates a fixed table.
 */
export function politicalColors(body: Body, frontiers: readonly Frontier[]): number[] {
  const nations = body.nations;
  const touching = nations.map(() => new Set<number>());
  for (const frontier of frontiers) {
    touching[frontier.left - 1]?.add(frontier.right - 1);
    touching[frontier.right - 1]?.add(frontier.left - 1);
  }
  const hsl = { h: 0, s: 0, l: 0 };
  const color = new Color();
  color.setHex(body.look.surface, SRGBColorSpace).getHSL(hsl, SRGBColorSpace);
  const grey = hsl.s < GREY_GROUND;
  const span = grey ? 360 * (1 - 1 / POLITICAL_HUES) : POLITICAL_SPAN;
  const saturation = grey ? GREY_SATURATION : POLITICAL_SATURATION;
  const candidates: { hex: number; lab: [number, number, number] }[] = [];
  for (let k = 0; k < POLITICAL_HUES; k++) {
    const hue = (((hsl.h * 360 + span * (k / (POLITICAL_HUES - 1) - 0.5)) % 360) + 360) % 360;
    for (const lightness of POLITICAL_LIGHTNESS) {
      for (const chroma of saturation) {
        const hex = color.setHSL(hue / 360, chroma, lightness, SRGBColorSpace).getHex(SRGBColorSpace);
        candidates.push({ hex, lab: oklabOf(hex) });
      }
    }
  }
  const order = nations.map((_, i) => i).sort((a, b) => nations[b]!.radius - nations[a]!.radius || a - b);
  const chosen: ([number, number, number] | null)[] = nations.map(() => null);
  const out: number[] = nations.map((nation) => nation.color);
  for (const i of order) {
    const own = oklabOf(nations[i]!.color);
    let best = -Infinity;
    let pick = candidates[0]!;
    for (const candidate of candidates) {
      let near = Infinity;
      let anyone = Infinity;
      for (let j = 0; j < nations.length; j++) {
        const other = chosen[j];
        if (other === null || other === undefined) continue;
        const d = oklabDistance(candidate.lab, other);
        anyone = Math.min(anyone, d);
        if (touching[i]!.has(j)) near = Math.min(near, d);
      }
      const apart = Math.min(near, 2 * anyone, 1);
      const score = apart - KEEP_OWN * oklabDistance(candidate.lab, own);
      if (score > best) {
        best = score;
        pick = candidate;
      }
    }
    chosen[i] = pick.lab;
    out[i] = pick.hex;
  }
  return out;
}
