/**
 * Noise for the other worlds, and it is deliberately not `terrain.ts`'s.
 *
 * `scenery/random.ts` already had to make this argument and it makes it better
 * than a second copy of it would: the mixer there is "the same construction as
 * `terrain.ts`'s `mix`, deliberately duplicated rather than shared — it is
 * private there, and the two must not draw from one stream anyway." Same twice
 * over here. `fbm` in `terrain.ts` is Earth's relief and only Earth's; a Martian
 * hill that rhymes with a Terran one at the same coordinate is a correlation
 * nobody asked for and nobody could find.
 *
 * What it costs to duplicate is forty lines. What it buys is that
 * `src/system/` does not import `terrain.ts` at all, which keeps a lazily
 * loaded planet from dragging the Earth's relief, its coast field and its
 * 297 ms of shore indexing into the chunk behind it.
 */

/** Distinct from `terrain.ts`'s seed and from `random.ts`'s. */
const SEED = 0x50142;

function scramble(n: number): number {
  let h = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) | 0;
}

/** A hash of three integer lattice coordinates to [-1, 1). */
function lattice(x: number, y: number, z: number): number {
  let h = SEED;
  h = scramble(h ^ Math.imul(x | 0, 0x9e3779b1));
  h = scramble(h ^ Math.imul(y | 0, 0x85ebca6b));
  h = scramble(h ^ Math.imul(z | 0, 0xc2b2ae35));
  return (h >>> 0) / 2147483648 - 1;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/** Trilinear value noise on the unit lattice. */
function value(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = fade(x - xi);
  const ty = fade(y - yi);
  const tz = fade(z - zi);
  let out = 0;
  for (let dz = 0; dz < 2; dz++) {
    const wz = dz === 0 ? 1 - tz : tz;
    for (let dy = 0; dy < 2; dy++) {
      const wy = dy === 0 ? 1 - ty : ty;
      for (let dx = 0; dx < 2; dx++) {
        const wx = dx === 0 ? 1 - tx : tx;
        out += wx * wy * wz * lattice(xi + dx, yi + dy, zi + dz);
      }
    }
  }
  return out;
}

/** Fractal sum. Returns roughly [-1, 1]. */
export function fbm(x: number, y: number, z: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let f = 1;
  for (let n = 0; n < octaves; n++) {
    sum += amplitude * value(x * f, y * f, z * f);
    total += amplitude;
    amplitude *= 0.5;
    f *= 2.03;
  }
  return sum / total;
}

/**
 * Ridged noise: `1 - |fbm|`, folded so the zero crossings become creases.
 *
 * The measurement that put this in `terrain.ts` transfers whole and is the
 * reason it is here rather than a second `fbm` call: *smooth relief reads as
 * flat; only a crease reads as terrain*, because the light is four hard bands
 * and a band only steps where the normal turns. Over Earth it measured 0.082 of
 * median gradient against `fbm`'s 0.040 for 12% fewer triangles. Nothing about
 * that argument is about Earth.
 */
export function ridged(x: number, y: number, z: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let f = 1;
  for (let n = 0; n < octaves; n++) {
    sum += amplitude * (1 - Math.abs(value(x * f, y * f, z * f)) * 2);
    total += amplitude;
    amplitude *= 0.5;
    f *= 2.03;
  }
  return sum / total;
}

const DEG = Math.PI / 180;

/**
 * A point on the unit sphere, in **this project's** frame and not in a fresh
 * one.
 *
 * `z = -cos(lat) * sin(lon)`, which is `globe.ts`'s `onSphere` and `geo.ts`'s
 * `toLatLon` inverted, and the sign is not a detail: the planet was mirrored
 * for months and every check passed, because a mirrored globe is self-
 * consistent and only a third party can see it. Sixteen places convert and this
 * is the seventeenth, so it is written the same way rather than derived again.
 */
export function onSphere(lat: number, lon: number): [number, number, number] {
  const c = Math.cos(lat * DEG);
  return [c * Math.cos(lon * DEG), Math.sin(lat * DEG), -c * Math.sin(lon * DEG)];
}

/** The dot product of two lat/lon directions — a cosine of the angle between. */
export function alignment(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = onSphere(lat1, lon1);
  const b = onSphere(lat2, lon2);
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
