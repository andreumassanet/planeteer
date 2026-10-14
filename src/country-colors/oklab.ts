/** OKLab conversion and colour distance. */

/** sRGB, three bytes, the space `flag-data.ts` writes its colours in. */
export type RGB = readonly [number, number, number];

export const TAU = Math.PI * 2;
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A colour in OKLab (Björn Ottosson's perceptual space), where the distance
 * between two colours tracks how different they look; one unit of `L` is the
 * whole black-to-white range. Converted from sRGB bytes, linearised on the way in.
 */
export interface Oklab {
  L: number;
  a: number;
  b: number;
}

/** sRGB byte to linear, as a table: `toOklab` only ever takes bytes. */
const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  LINEAR[i] = t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
}

const gamma = (linear: number): number => {
  const v = clamp01(linear);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
};

export function toOklab([r, g, b]: RGB): Oklab {
  const R = LINEAR[r]!;
  const G = LINEAR[g]!;
  const B = LINEAR[b]!;
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/**
 * OKLab back to sRGB, clamped to the gamut and rounded to bytes. Distances that
 * decide whether a nudge was enough are measured on these bytes.
 */
export function fromOklab({ L, a, b }: Oklab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const R = gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const G = gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const B = gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return [Math.round(R * 255), Math.round(G * 255), Math.round(B * 255)];
}

/** How far apart two colours look, in OKLab units. 1.0 is black to white. */
export function distance(one: Oklab, two: Oklab): number {
  return Math.hypot(one.L - two.L, one.a - two.a, one.b - two.b);
}

/** Chroma: how much colour there is at all. Grey, white and black are 0. */
export const chroma = ({ a, b }: Oklab): number => Math.hypot(a, b);
