import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import type { Model, Paint } from './model.ts';

export const PALETTE_LIST = Object.values(PALETTE).map((hex) => new THREE.Color(hex));

/**
 * A colour darker or lighter by `factor` the way `tone` in the monument
 * contract makes one: each sRGB channel scaled, so a tone here and a tone of the
 * same palette colour on a built part are the same colour.
 */
export function toned(color: THREE.Color | number, factor: number): THREE.Color {
  const srgb = new THREE.Color(color).convertLinearToSRGB();
  const channel = (value: number) => Math.min(1, Math.max(0, value * factor));
  return new THREE.Color().setRGB(channel(srgb.r), channel(srgb.g), channel(srgb.b), THREE.SRGBColorSpace);
}

/** CIELAB of a linear colour, for distances that follow the eye. */
export function labOf(color: THREE.Color): [number, number, number] {
  // Linear sRGB -> XYZ (D65) -> Lab.
  const x = (0.4124 * color.r + 0.3576 * color.g + 0.1805 * color.b) / 0.95047;
  const y = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const z = (0.0193 * color.r + 0.1192 * color.g + 0.9505 * color.b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export const PALETTE_LAB = PALETTE_LIST.map(labOf);

/**
 * The palette colour nearest `color`, toned to keep its lightness. A pack's
 * baked shading (Kenney's atlas is a gradient per swatch) survives as a tone of
 * one palette entry, clamped to the tone range the kit allows.
 *
 * Nearest in CIELAB, with lightness weighed at a third: the tone gives the
 * lightness back afterwards, so what has to match is the hue. Compared in
 * linear RGB a mid green's lightness is so low that leaves came out the colour
 * of the ink.
 */
export function onPalette(color: THREE.Color, exclude: readonly number[] = []): THREE.Color {
  const [l, a, b] = labOf(color);
  let best = 0;
  let bestDistance = Infinity;
  PALETTE_LIST.forEach((candidate, i) => {
    if (exclude.includes(candidate.getHex())) return;
    const [cl, ca, cb] = PALETTE_LAB[i]!;
    const chroma = Math.hypot(a, b);
    // A near-grey keeps to the greys: its hue is noise, and its lightness is all it has.
    const lightWeight = chroma < 8 ? 1 : 0.35;
    const d = Math.hypot((l - cl) * lightWeight, a - ca, b - cb);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  const base = PALETTE_LIST[best]!;
  const factor = THREE.MathUtils.clamp(PALETTE_LAB[best]![0] > 2 ? (l + 16) / (PALETTE_LAB[best]![0] + 16) : 1, 0.6, 1.4);
  return toned(base, factor);
}

/** Whether a slot is glass: by name, or a pale sky-blue swatch in a palette atlas. */
export function isGlass(slot: string, color: THREE.Color): boolean {
  if (/window|glass|windshield/i.test(slot)) return true;
  const hsl = { h: 0, s: 0, l: 0 };
  color.clone().convertLinearToSRGB().getHSL(hsl);
  return hsl.h > 0.52 && hsl.h < 0.64 && hsl.l > 0.72 && hsl.s > 0.4;
}

/** How many vertices each slot covers. */
export function slotShares(model: Pick<Model, 'slot' | 'slots'>): number[] {
  const shares = new Array<number>(model.slots.length).fill(0);
  for (const s of model.slot) shares[s]!++;
  return shares;
}

/**
 * A vehicle's paint: the largest saturated colour family is the body and takes
 * `body` (keeping each swatch's lightness against the family's mean), glass
 * goes to toned slate, and everything else goes to its nearest palette colour.
 */
export function bodyPaint(
  model: Pick<Model, 'slot' | 'slots' | 'defaults'>,
  body: number,
  glass: (slot: string, c: THREE.Color) => boolean,
  /** Names the body outright, for a pack drawn in greys where no colour family leads. */
  bodySlots?: RegExp,
): Paint {
  const shares = slotShares(model);
  const hsl = model.defaults.map((c) => {
    const out = { h: 0, s: 0, l: 0 };
    c.clone().convertLinearToSRGB().getHSL(out);
    return out;
  });
  let lead = -1;
  model.slots.forEach((slot, i) => {
    if (glass(slot, model.defaults[i]!) || hsl[i]!.s < 0.3 || hsl[i]!.l < 0.12 || hsl[i]!.l > 0.9) return;
    if (lead < 0 || shares[i]! > shares[lead]!) lead = i;
  });
  const family = new Set<number>();
  if (bodySlots !== undefined) {
    model.slots.forEach((slot, i) => {
      if (bodySlots.test(slot)) family.add(i);
    });
    lead = -1;
  }
  if (lead >= 0) {
    model.slots.forEach((_, i) => {
      const dh = Math.min(Math.abs(hsl[i]!.h - hsl[lead]!.h), 1 - Math.abs(hsl[i]!.h - hsl[lead]!.h));
      if (dh < 0.06 && hsl[i]!.s > 0.2) family.add(i);
    });
  }
  let meanL = 0;
  let count = 0;
  for (const i of family) {
    meanL += hsl[i]!.l * shares[i]!;
    count += shares[i]!;
  }
  meanL = count > 0 ? meanL / count : 0.5;
  const bodyColor = new THREE.Color(body);
  // `GLASS_TONE` in the scenery contract: glazing is slate toned down, never black.
  const glassColor = toned(PALETTE.slate, 0.72);
  return (slot, original) => {
    const i = model.slots.indexOf(slot);
    if (glass(slot, original)) return glassColor;
    if (family.has(i)) return toned(bodyColor, THREE.MathUtils.clamp(hsl[i]!.l / meanL, 0.6, 1.4));
    return onPalette(original);
  };
}
