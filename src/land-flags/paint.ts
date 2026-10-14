/** Turning the country-colour table into runs of repeating bytes, and writing them into the attribute. */
import type { CountryColorTable } from '../country-colors.ts';
import type { LandFlagData } from './types.ts';

/**
 * The run a colour is written in, in bytes: 512 triangles of three vertices.
 * A flat fill over a span is a `TypedArray.set` from one repeating pattern,
 * which is far cheaper than a byte loop; the run is a multiple of three bytes
 * so the pattern lands on the same channel each time, and of three vertices so
 * a partial run still starts on a triangle.
 */
export const RUN = 3 * 512 * 3;

/**
 * Triangles painted between two clock readings: reading the clock per triangle
 * would be most of the paint.
 */
export const SLICE = 65536;

/**
 * sRGB to linear, as a table. The land's colour attribute holds linear bytes,
 * while `country-colors.ts` works in the sRGB bytes a flag spec is written in,
 * so each country's colour is converted once. The blend with the ground happens
 * in a gamma space, in the shader (`globe.ts`).
 */
const toLinear = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  const lin = t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;
  toLinear[i] = Math.round(lin * 255);
}

/** A span of triangles to fill with one colour. */
export interface Job {
  from: number;
  to: number;
  /** The run this job is copied from: `RUN` bytes of one repeating colour. */
  pattern: Uint8Array;
}

const linear = (rgb: readonly [number, number, number], factor: number): [number, number, number] => [
  Math.round(toLinear[rgb[0]]! * factor),
  Math.round(toLinear[rgb[1]]! * factor),
  Math.round(toLinear[rgb[2]]! * factor),
];

/**
 * The paint, flattened into a list of jobs: a span is two runs (the ring's
 * surface and the wall under it), and a ring whose country has no colour is
 * left out, so its triangles keep the copy of the ground they started as.
 * `total` is the triangle count to be painted.
 */
export function planJobs(table: CountryColorTable, data: LandFlagData | undefined): { jobs: Job[]; total: number } {
  const shade = data?.wallShade ?? 0.72;
  // One run per distinct colour, shared by every span that uses it.
  const patterns = new Map<number, Uint8Array>();
  const patternFor = (rgb: readonly [number, number, number]): Uint8Array => {
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    let run = patterns.get(key);
    if (run === undefined) {
      run = new Uint8Array(RUN);
      for (let i = 0; i < RUN; i += 3) {
        run[i] = rgb[0];
        run[i + 1] = rgb[1];
        run[i + 2] = rgb[2];
      }
      patterns.set(key, run);
    }
    return run;
  };

  const jobs: Job[] = [];
  let total = 0;
  const surfaceOf = new Map<number, Uint8Array>();
  const wallOf = new Map<number, Uint8Array>();
  for (const span of data?.spans ?? []) {
    const country = span.ring.country;
    // A lake's rim belongs to nobody, and some admin-0 features have no flag
    // for a colour to be read off; all of them keep their biome.
    if (span.ring.water || country <= 0) continue;
    let surface = surfaceOf.get(country);
    if (surface === undefined) {
      const rgb = table.color(country);
      if (rgb === null) continue;
      surface = patternFor(linear(rgb, 1));
      surfaceOf.set(country, surface);
      wallOf.set(country, patternFor(linear(rgb, shade)));
    }
    jobs.push({ from: span.surface[0], to: span.surface[1], pattern: surface });
    jobs.push({ from: span.wall[0], to: span.wall[1], pattern: wallOf.get(country)! });
    total += span.surface[1] - span.surface[0] + (span.wall[1] - span.wall[0]);
  }
  return { jobs, total };
}

/** Writes `pattern` over triangles `from` to `to` (nine bytes each) of `fill`. */
export function paintRun(fill: Uint8Array, from: number, to: number, pattern: Uint8Array): void {
  let at = from * 9;
  const end = to * 9;
  while (at < end) {
    const n = Math.min(RUN, end - at);
    fill.set(n === RUN ? pattern : pattern.subarray(0, n), at);
    at += n;
  }
}
