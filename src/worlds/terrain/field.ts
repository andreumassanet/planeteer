/** The raw field: the body's relief, walking-scale detail, craters and the planet file's own features. */

import { fbm } from '../../system/noise.ts';
import type { WorldSpec } from '../contract.ts';
import type { CraterHit } from '../craters.ts';
import type { CraterField } from '../craters.ts';

/** The field before any pad: what a pad is levelled to. */
export function createField(spec: WorldSpec, radius: number, craters: CraterField, hit: CraterHit): (x: number, y: number, z: number, lat: number, lon: number) => number {
  const relief = spec.relief;
  const model = spec.body.ground;
  const planetScale = model === null ? 0 : relief.planetScale;
  return (x, y, z, lat, lon) => {
    let h = 0;
    if (planetScale !== 0) h += model!.relief(lat, lon) * planetScale;
    for (const d of relief.detail) {
      const k = radius / d.wavelength;
      const octaves = d.octaves ?? 3;
      const share = d.ridged ?? 0;
      // One noise a band, folded for the ridged share rather than asked for
      // twice: `1 - 2|n|` creases where `n` crosses zero, which is what
      // `ridged` does octave by octave, at half the cost, and the tiles spend
      // most of their build in this loop.
      const n = fbm(x * k, y * k, z * k, octaves);
      h += ((1 - share) * n + share * (0.65 - 2 * Math.abs(n))) * d.amplitude;
    }
    h += craters.at(x, y, z, hit);
    for (const feature of relief.features) h += feature({ x, y, z }, lat, lon);
    return h;
  };
}

/** The highest a relief function reaches over a coarse sweep, padded by a tenth. */
export function sampleMax(relief: (lat: number, lon: number) => number): number {
  let top = 0;
  for (let lat = -88; lat <= 88; lat += 4) {
    for (let lon = -180; lon < 180; lon += 4) top = Math.max(top, relief(lat, lon));
  }
  return top * 1.1 + 1;
}
