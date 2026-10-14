// stars.bin: the Bright Star Catalogue as the sky draws it.

import { Reader, Writer, expect, magic, readPlanes, writePlanes } from './bytes.ts';

/**
 * 'ATLN', the night (`celestial.ts`). A retired magic is never reused, so a
 * stale file always fails on its first four bytes.
 */
const MAGIC_STARS = 0x4e4c5441; // 'ATLN'

/**
 * The catalogue brightest first: `night-sky.ts` draws a prefix of the buffer
 * (every star brighter than the limit the twilight has reached), so dusk brings
 * the stars out brightest first with no sort and no test per star. Positions are
 * J2000, as the catalogue gives them; `celestial.ts` turns them into tonight's.
 */
export interface StarCatalogue {
  count: number;
  /** J2000 right ascension, degrees, 0 to 360. */
  ra: Float64Array;
  /** J2000 declination, degrees. */
  dec: Float64Array;
  /** Visual magnitude V, in hundredths as the catalogue gives it. Non-decreasing. */
  mag: Float64Array;
  /** B-V colour index, in hundredths. Derived from the spectral class where the catalogue has none. */
  color: Float64Array;
}

/**
 * Right ascension in 65,536ths of a turn and declination in 65,536ths of a half
 * turn (both powers of two, so the decode is exact and the re-encode
 * byte-identical). Magnitude and colour stay at the catalogue's own hundredths:
 * `V` as deltas along the sorted list (nearly all 0, 1 or 2) and `B-V` as two
 * planes over a bias.
 */
const TURN = 65536;
const COLOR_BIAS = 1000;

/** Both halves of the magnitude and colour rounding, so the bake stores what it tested. */
const hundredths = (value: number): number => Math.round(value * 100);

/**
 * `ra`, `dec`, `mag` and `color` columns, the rows ordered by `mag` ascending
 * (the encoder refuses anything else). Byte planes, as the places are: the
 * positions are the only incompressible part of the file.
 */
export function encodeStars(stars: StarCatalogue): Uint8Array {
  const out = new Writer();
  const n = stars.count;
  magic(out, MAGIC_STARS);
  out.varint(n);
  const ra = new Int32Array(n);
  const dec = new Int32Array(n);
  const mags = new Uint8Array(n);
  const colors = new Int32Array(n);
  let previous = n > 0 ? hundredths(stars.mag[0]!) : 0;
  out.zigzag(previous);
  for (let i = 0; i < n; i++) {
    const turn = Math.round((stars.ra[i]! / 360) * TURN);
    ra[i] = ((turn % TURN) + TURN) % TURN;
    const across = Math.round(((stars.dec[i]! + 90) / 180) * TURN);
    if (across < 0 || across > TURN) throw new Error(`declination ${stars.dec[i]} is not on the sphere`);
    dec[i] = Math.min(across, TURN - 1);
    const mag = hundredths(stars.mag[i]!);
    const step = mag - previous;
    if (step < 0) throw new Error('stars.bin wants its stars brightest first');
    if (step > 255) throw new Error(`a gap of ${step / 100} magnitudes will not fit a byte`);
    mags[i] = step;
    previous = mag;
    colors[i] = hundredths(stars.color[i]!) + COLOR_BIAS;
    if (colors[i]! < 0 || colors[i]! > 0xffff) throw new Error(`B-V ${stars.color[i]} will not fit two bytes`);
  }
  writePlanes(out, ra, 2);
  writePlanes(out, dec, 2);
  out.raw(mags);
  writePlanes(out, colors, 2);
  return out.done();
}

export function decodeStars(bytes: Uint8Array): StarCatalogue {
  const reader = new Reader(bytes, 'stars.bin');
  expect(reader, MAGIC_STARS, 'stars.bin');
  const n = reader.varint();
  let mag = reader.zigzag();
  const ra = readPlanes(reader, n, 2);
  const dec = readPlanes(reader, n, 2);
  const steps = reader.raw(n);
  const colors = readPlanes(reader, n, 2, COLOR_BIAS);
  reader.finish();
  const stars: StarCatalogue = {
    count: n,
    ra: new Float64Array(n),
    dec: new Float64Array(n),
    mag: new Float64Array(n),
    color: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    stars.ra[i] = (ra[i]! / TURN) * 360;
    stars.dec[i] = (dec[i]! / TURN) * 180 - 90;
    mag += steps[i]!;
    stars.mag[i] = mag / 100;
    stars.color[i] = colors[i]! / 100;
  }
  return stars;
}
