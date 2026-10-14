import { PALETTE } from '../theme.ts';

/** Mixes towards the paper, which is how an atlas says "not this country". */
export function fade(color: number, amount: number): string {
  const mix = (shift: number): number => {
    const a = (color >> shift) & 0xff;
    const b = (PALETTE.white >> shift) & 0xff;
    return Math.round(a + (b - a) * amount);
  };
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

/** 1, 2 or 5 times a power of ten — the only numbers a scale bar is allowed. */
export function niceKm(value: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(1e-3, value)));
  const n = value / power;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * power;
}
