

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
export const smoothstep = (x: number, a: number, b: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
