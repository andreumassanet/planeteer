/** Hashes of lattice numbers and the grove noise built on them. */

/** Value noise over `hash2`'s lattice, smoothed: a grove's shape. */
export function groveNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix + 0.5, iy + 211.3);
  const b = hash2(ix + 1.5, iy + 211.3);
  const c = hash2(ix + 0.5, iy + 212.3);
  const d = hash2(ix + 1.5, iy + 212.3);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** A hash of two lattice numbers to [0, 1): Dave Hoskins' without a sine, as the land's marks use. */
export function hash2(x: number, y: number): number {
  let px = (x * 0.1031) % 1;
  let py = (y * 0.103) % 1;
  let pz = (x * 0.0973) % 1;
  if (px < 0) px += 1;
  if (py < 0) py += 1;
  if (pz < 0) pz += 1;
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d;
  py += d;
  pz += d;
  const v = ((px + py) * pz) % 1;
  return v < 0 ? v + 1 : v;
}