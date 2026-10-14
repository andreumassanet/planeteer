// Value noise on a 3D lattice, sampled in space rather than lon/lat so the poles
// and the antimeridian are nothing special. The seed is fixed: the same planet
// on every load.

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The seed. */
const SEED = 0x5eed1a5;

/** Hash of one lattice cell, in [0,1). `Math.imul` keeps the low bits a double product would lose. */
function mix(n: number): number {
  let h = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Value noise at a point of the lattice. The three multiplies that locate a
 * cell happen once and the other corners are additions: building the planet
 * calls this about ten million times.
 */
function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);

  // The eight corners as offsets from one folded index.
  const base = (xi * 1619 + yi * 31337 + zi * 6971 + SEED) | 0;
  const c000 = mix(base);
  const c100 = mix(base + 1619);
  const c010 = mix(base + 31337);
  const c110 = mix(base + 32956);
  const c001 = mix(base + 6971);
  const c101 = mix(base + 8590);
  const c011 = mix(base + 38308);
  const c111 = mix(base + 39927);

  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

// A fixed rotation between octaves, and an offset with it: stacked on the same
// axes the lattice shows as a grid of creases.
const R00 = 0.802, R01 = 0.313, R02 = -0.508;
const R10 = -0.517, R11 = 0.772, R12 = -0.369;
const R20 = 0.297, R21 = 0.553, R22 = 0.778;

/** Fractal Brownian motion, in [0,1]. Rolling ground: hills, not ridges. */
export function fbm(x: number, y: number, z: number, octaves: number): number {
  let px = x;
  let py = y;
  let pz = z;
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * valueNoise(px, py, pz);
    total += amplitude;
    amplitude *= 0.5;
    const nx = (R00 * px + R01 * py + R02 * pz) * 2 + 17.3;
    const ny = (R10 * px + R11 * py + R12 * pz) * 2 - 9.1;
    const nz = (R20 * px + R21 * py + R22 * pz) * 2 + 41.7;
    px = nx;
    py = ny;
    pz = nz;
  }
  return sum / total;
}

/**
 * Ridged multifractal, in [0,1]. Folding the noise about its midpoint turns the
 * smooth maxima of `fbm` into creases; the weight carries detail only near a
 * crest, so valleys stay smooth and need no triangles.
 */
export function ridged(x: number, y: number, z: number, octaves: number): number {
  let px = x;
  let py = y;
  let pz = z;
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let weight = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(2 * valueNoise(px, py, pz) - 1);
    n *= n;
    n *= weight;
    // How fast the detail dies away from a crest. Above about two the fine
    // octaves survive across whole slopes and cost triangles for roughness only
    // visible up close.
    weight = clamp(n * 1.6, 0, 1);
    sum += amplitude * n;
    total += amplitude;
    amplitude *= 0.52;
    const nx = (R00 * px + R01 * py + R02 * pz) * 2 + 5.9;
    const ny = (R10 * px + R11 * py + R12 * pz) * 2 + 23.4;
    const nz = (R20 * px + R21 * py + R22 * pz) * 2 - 13.6;
    px = nx;
    py = ny;
    pz = nz;
  }
  return sum / total;
}
